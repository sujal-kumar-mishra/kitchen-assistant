# Kitchen Assistant Backend

This is the backend API server for the Kitchen Smart Assistant with ElevenLabs conversational AI integration.

## Features

- 🍳 Kitchen timer management with Socket.IO real-time updates
- 📏 Unit conversion for cooking measurements
- 🎥 YouTube video search for cooking recipes
- 💬 ElevenLabs conversational AI integration
- 🔄 Real-time communication via Socket.IO

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual API keys
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Start the production server:**
   ```bash
   npm start
   ```

## API Endpoints

### Timer Management
- `GET /api/timer` - List active timers
- `POST /api/timer/start` - Start a new timer
- `POST /api/timer/stop` - Stop a timer

### Unit Conversion
- `GET /api/convert?value=1&from=cup&to=ml` - Convert units

### YouTube Search
- `GET /api/youtube/search?q=pasta recipe` - Search for cooking videos

### Chat/Conversation
- `POST /api/converse` - Send message to AI assistant
- `GET /api/conversation-history` - Get chat history
- `GET /api/get-signed-url` - Get ElevenLabs signed URL

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | Yes |
| `ELEVEN_AGENT_ID` | ElevenLabs agent ID | Yes |
| `YOUTUBE_API_KEY` | YouTube Data API key | Optional |
| `REDIS_URL` | Redis connection URL | Optional |

## Socket.IO Events

The server emits these Socket.IO events for real-time timer updates:
- `timer:started` - Timer was started
- `timer:update` - Timer tick update
- `timer:done` - Timer finished
- `timer:stopped` - Timer was stopped
- `timer:bootstrap` - Initial timer state

## Project Structure

```
backend/
├── controllers/        # Route controllers
├── routes/            # Express routes
├── tools/             # Utility functions
├── server.js          # Main server file
└── package.json       # Dependencies and scripts
```

## Development

- Use `npm run dev` for development with nodemon auto-restart
- Server runs on `http://localhost:3001` by default
- CORS is enabled for frontend development

## Deployment

This backend is designed to work with platforms like:
- Render.com
- Heroku
- Railway
- Vercel
- Netlify Functions

Make sure to set environment variables in your deployment platform.
