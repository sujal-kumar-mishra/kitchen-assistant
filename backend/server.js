/**
 * Production-ready Kitchen Assistant backend
 * - Express server with security, rate limiting, logging
 * - YouTube search, converter, timers (optional Redis persistence)
 * - ElevenLabs webhook verification and TTS proxy
 * - Socket.IO for realtime timer events
 *
 * Node >= 18 recommended
 */

import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { Server } from 'socket.io';
import fetch from 'node-fetch';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { youtubeSearch } from './tools/youtube.js';
import { createTimerManager } from './tools/timer.js';
import { convertUnits } from './tools/converter.js';

const asyncPipeline = promisify(pipeline);

const PORT = Number(process.env.PORT || 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET || '';
const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SEC || 300);
const REDIS_URL = process.env.REDIS_URL || '';

const app = express();
const server = http.createServer(app);

// Socket.IO with minimal CORS
const io = new Server(server, { cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] } });

// Middlewares
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // adjust for your needs
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Timer manager (supports optional Redis persistence)
const timerManager = createTimerManager({ io, redisUrl: REDIS_URL });

// --- HEALTH / Readiness
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/ready', (_req, res) => res.json({ ok: true }));

// --- YouTube search
app.get('/youtube/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q parameter' });
    const items = await youtubeSearch(q);
    res.json(items);
  } catch (err) {
    console.error('youtube/search error', err?.message || err);
    res.status(500).json({ error: 'YouTube search failed', details: err?.message || String(err) });
  }
});

// --- Converter
app.get('/convert', (req, res) => {
  try {
    const value = Number(req.query.value);
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!Number.isFinite(value) || !from || !to) {
      return res.status(400).json({ error: 'Invalid params: need value, from, to' });
    }
    const result = convertUnits(value, from, to);
    if (result == null) return res.status(400).json({ error: 'Unsupported conversion' });
    res.json({ result });
  } catch (err) {
    console.error('convert error', err);
    res.status(500).json({ error: 'Conversion failed', details: err?.message || String(err) });
  }
});

// --- Timers
app.get('/timer', (_req, res) => res.json({ timers: timerManager.listTimers() }));

app.post('/timer/start', (req, res) => {
  try {
    const { seconds } = req.body;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return res.status(400).json({ error: 'seconds must be a positive number' });
    }
    const id = timerManager.startTimer(Math.floor(seconds));
    res.json({ id });
  } catch (err) {
    console.error('timer/start error', err);
    res.status(500).json({ error: 'Could not start timer', details: err?.message || String(err) });
  }
});

app.post('/timer/stop', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    timerManager.stopTimer(id);
    res.json({ success: true });
  } catch (err) {
    console.error('timer/stop error', err);
    res.status(500).json({ error: 'Could not stop timer', details: err?.message || String(err) });
  }
});

// --- ElevenLabs webhook (raw body) ---
// Use express.raw middleware for this route only to avoid conflicts with express.json
app.post('/elevenlabs/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  try {
    if (!ELEVENLABS_WEBHOOK_SECRET) {
      console.warn('Webhook secret not configured');
      return res.status(403).json({ error: 'Webhook secret not configured' });
    }
    const signatureHeader = req.headers['elevenlabs-signature'] || req.headers['ElevenLabs-Signature'];
    if (!signatureHeader) {
      return res.status(401).json({ error: 'Missing signature header' });
    }

    // header format example: "1|t=1691234567,v0=abcdef..."
    const headerStr = String(signatureHeader);
    const tsMatch = headerStr.match(/t=(\d+)/);
    const v0Match = headerStr.match(/v0=([0-9a-fA-F]+)/);
    if (!tsMatch || !v0Match) {
      console.warn('Invalid signature header format', headerStr);
      return res.status(401).json({ error: 'Invalid signature format' });
    }
    const timestamp = Number(tsMatch[1]);
    const v0 = v0Match[1];
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SEC) {
      console.warn('Webhook timestamp outside tolerance', { now, timestamp });
      return res.status(401).json({ error: 'Timestamp outside tolerance' });
    }

    const rawBody = req.body.toString('utf-8');

    // Try two HMAC styles: timestamp + '.' + body and body-only for compatibility
    const hmacA = crypto.createHmac('sha256', ELEVENLABS_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
    const hmacB = crypto.createHmac('sha256', ELEVENLABS_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');

    const valid = crypto.timingSafeEqual(Buffer.from(hmacA, 'hex'), Buffer.from(v0, 'hex')) ||
                  crypto.timingSafeEqual(Buffer.from(hmacB, 'hex'), Buffer.from(v0, 'hex'));

    if (!valid) {
      console.warn('Webhook signature mismatch', { hmacA, hmacB, v0 });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      console.warn('Webhook JSON parse failed', err);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // Simple dispatch pattern: support tool calls like youtube_search
    // Example payload shapes vary; we support payload.tool_id or payload.tool
    if ((payload.tool_id === 'youtube_search' || payload.tool === 'youtube_search') && payload.inputs?.q) {
      const q = String(payload.inputs.q);
      youtubeSearch(q).then(results => res.json({ success: true, results })).catch(err => {
        console.error('Webhook tool youtube_search error', err);
        res.status(500).json({ error: 'Tool failed', details: err?.message || String(err) });
      });
      return;
    }

    // Default: acknowledge and optionally log (do not block)
    console.log('ElevenLabs webhook (unhandled):', JSON.stringify(payload).slice(0, 400));
    res.json({ ok: true });
  } catch (err) {
    console.error('elevenlabs/webhook error', err);
    res.status(500).json({ error: 'Webhook processing failed', details: err?.message || String(err) });
  }
});

// --- ElevenLabs TTS proxy (server-side) ---
app.post('/elevenlabs/tts-proxy', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs API key not configured' });

    const { voice_id, text, model_id, output_format } = req.body;
    if (!voice_id || !text) return res.status(400).json({ error: 'voice_id and text required' });

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice_id)}/stream`;
    const body = { text };
    if (model_id) body.model_id = model_id;
    if (output_format) body.output_format = output_format;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('ElevenLabs TTS error', resp.status, txt);
      return res.status(502).json({ error: 'ElevenLabs TTS failed', details: txt });
    }

    res.setHeader('Content-Type', resp.headers.get('content-type') || 'audio/mpeg');
    await asyncPipeline(resp.body, res);
  } catch (err) {
    console.error('tts-proxy error', err);
    res.status(500).json({ error: 'TTS proxy failed', details: err?.message || String(err) });
  }
});

// Socket.IO connection for timers & realtime events
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  socket.emit('timer:bootstrap', { timers: timerManager.listTimers() });

  // Accept optional client events in the future
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  try {
    server.close(() => console.log('HTTP server closed'));
    io.close();
    await timerManager.shutdown();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown', err);
    process.exit(1);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
server.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT} (env=${process.env.NODE_ENV || 'dev'})`);
});
