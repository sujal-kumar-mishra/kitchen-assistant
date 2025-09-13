require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const http = require('http');
const { Server } = require('socket.io');
const { createTimerManager } = require('./tools/timer.js');

// Import modular routes
const timerRoutes = require('./routes/timerRoutes');
const converterRoutes = require('./routes/converterRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');
const chatRoutes = require('./routes/chatRoutes');
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from parent directory for testing
app.use(express.static('../'));

// Root endpoint for testing
app.get('/', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Status endpoint to list available APIs
app.get('/status', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      conversation: {
        'POST /api/converse': 'Send message to AI agent',
        'GET /api/history': 'Get conversation history',
        'GET /api/conversation-history': 'Get conversation history (exact match)',
        'GET /api/get-signed-url': 'Get ElevenLabs signed URL'
      },
      timers: {
        'GET /api/timer': 'List active timers',
        'POST /api/timer/start': 'Start new timer',
        'POST /api/timer/stop': 'Stop timer'
      },
      utilities: {
        'GET /api/convert': 'Convert units',
        'GET /api/youtube/search': 'Search YouTube'
      }
    }
  });
});

// --- Timers
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Initialize timer manager
const timerManager = createTimerManager({ io, redisUrl: process.env.REDIS_URL });

// Use modular routes
app.use('/api/convert', converterRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api', chatRoutes);
app.use('/api/timer', timerRoutes(timerManager));


io.on('connection', (socket) => {
  socket.emit('timer:bootstrap', { timers: timerManager.listTimers() });
});


server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
