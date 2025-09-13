require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const http = require('http');
const { Server } = require('socket.io');
const { createTimerManager } = require('./tools/timer.js');

// Enhanced logging utility
const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, error ? error.stack || error : '');
  },
  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  debug: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Import modular routes
const timerRoutes = require('./routes/timerRoutes');
const converterRoutes = require('./routes/converterRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');
const chatRoutes = require('./routes/chatRoutes');
const PORT = process.env.PORT || 3000;

logger.info('🚀 Starting Kitchen Assistant Backend Server', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString()
});

const app = express();

// Configure CORS for production and development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:8081',
      'http://localhost:3000',
      'https://kitchen-assistant-1.onrender.com',
      'https://kitchen-assistant-frontend.onrender.com',
      'https://kitchen-assistant-8quk.onrender.com'
    ];
    
    // Check if the origin is in the allowed list or matches the pattern
    if (allowedOrigins.includes(origin) || /^https:\/\/kitchen-assistant.*\.onrender\.com$/.test(origin)) {
      logger.info('✅ CORS allowed for origin', { origin });
      callback(null, true);
    } else {
      logger.warn('❌ CORS blocked origin', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Comprehensive request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  // Log incoming request
  logger.info(`📥 Incoming Request [${requestId}]`, {
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    headers: req.headers,
    body: req.body,
    query: req.query
  });

  // Store request info for response logging
  req.requestId = requestId;
  req.startTime = startTime;

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    logger.info(`📤 Response [${requestId}]`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      headers: res.getHeaders(),
      size: chunk ? chunk.length : 0
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
});

app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', cors(corsOptions));

// Serve static files from parent directory for testing
app.use(express.static('../'));

// Root endpoint for testing
app.get('/', (req, res) => {
  logger.info('🏠 Root endpoint accessed');
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Status endpoint to list available APIs
app.get('/status', (req, res) => {
  logger.info('📊 Status endpoint accessed');
  const statusData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
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
  };
  
  logger.debug('Status data prepared', statusData);
  res.json(statusData);
});

// --- Timers & WebSocket Setup
logger.info('🔌 Initializing WebSocket server');
const server = http.createServer(app);
const io = new Server(server, { 
  cors: {
    origin: [
      'http://localhost:8081',
      'http://localhost:3000',
      'https://kitchen-assistant-1.onrender.com',
      'https://kitchen-assistant-frontend.onrender.com',
      'https://kitchen-assistant-8quk.onrender.com',
      /^https:\/\/kitchen-assistant.*\.onrender\.com$/
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO connection logging
io.on('connection', (socket) => {
  logger.info('🔗 New WebSocket connection established', {
    socketId: socket.id,
    ip: socket.handshake.address,
    origin: socket.handshake.headers.origin,
    userAgent: socket.handshake.headers['user-agent']
  });

  socket.on('disconnect', (reason) => {
    logger.info('🔌 WebSocket connection closed', {
      socketId: socket.id,
      reason: reason
    });
  });

  socket.on('error', (error) => {
    logger.error('❌ WebSocket error', {
      socketId: socket.id,
      error: error.message
    });
  });

  // Bootstrap timer data
  socket.emit('timer:bootstrap', { timers: timerManager.listTimers() });
  logger.debug('⏰ Timer bootstrap sent to client', { socketId: socket.id });
});

// Initialize timer manager
logger.info('⏰ Initializing timer manager', { redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured' });
const timerManager = createTimerManager({ io, redisUrl: process.env.REDIS_URL });

// Middleware to broadcast API calls to frontend with enhanced logging
app.use('/api', (req, res, next) => {
  logger.info(`🎯 API called: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    origin: req.headers.origin,
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? '[HIDDEN]' : 'none',
      'user-agent': req.headers['user-agent']
    }
  });
  
  // Set additional CORS headers
  const origin = req.headers.origin;
  if (origin && (origin.includes('localhost') || origin.includes('kitchen-assistant') || origin.includes('onrender.com'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    logger.debug('🔐 CORS headers set for API request', { origin });
  }
  
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
      query: req.query || null,
      requestId: req.requestId,
      duration: Date.now() - req.startTime
    };
    
    // Try to parse response data if it's JSON
    let responseData;
    try {
      responseData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      responseData = data;
    }
    
    const broadcastData = {
      ...apiData,
      response: responseData
    };
    
    // Log the broadcast
    logger.info(`📡 Broadcasting API call to ${io.engine.clientsCount} clients`, {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      connectedClients: io.engine.clientsCount
    });
    
    // Broadcast to all connected clients
    io.emit('api:call', broadcastData);
    
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
