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
        'POST /converse': 'Send message to AI agent',
        'GET /history': 'Get conversation history',
        'GET /conversation-history': 'Get conversation history (exact match)',
        'GET /get-signed-url': 'Get ElevenLabs signed URL'
      },
      timers: {
        'GET /timer': 'List active timers',
        'POST /timer/start': 'Start new timer',
        'POST /timer/stop': 'Stop timer'
      },
      utilities: {
        'GET /convert': 'Convert units',
        'GET /youtube/search': 'Search YouTube'
      }
    }
  });
});

// --- Timers
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Initialize timer manager
const timerManager = createTimerManager({ io, redisUrl: process.env.REDIS_URL });

// Middleware to broadcast API calls to frontend
app.use('/api', (req, res, next) => {
  console.log(`API called: ${req.method} ${req.originalUrl}`);
  
  // Store original send function
  const originalSend = res.send;
  
  // Override send to broadcast the response
  res.send = function(data) {
    // Call original send first
    const result = originalSend.call(this, data);
    
    // Broadcast the API call to all connected clients
    const apiData = {
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString(),
      status: res.statusCode,
      body: req.body || null,
      query: req.query || null
    };
    
    // Try to parse response data if it's JSON
    let responseData;
    try {
      responseData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      responseData = data;
    }
    
    // Broadcast to all connected clients
    io.emit('api:call', {
      ...apiData,
      response: responseData
    });
    
    return result;
  };
  
  next();
});

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
