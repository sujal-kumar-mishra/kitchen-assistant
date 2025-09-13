# Kitchen Smart Assistant - Frontend

A voice-enabled kitchen assistant with YouTube integration, timers, and unit conversion.

## Features

- 🎙️ ElevenLabs AI Voice Conversation
- 🎥 YouTube Video Search & Playback
- ⏰ Kitchen Timers with Real-time Updates
- 📏 Unit Conversion (cooking measurements, temperature)
- 💬 Text Chat Interface
- 🔄 Real-time WebSocket Updates

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open your browser to: `http://localhost:8081`

## Deployment on Render

### Option 1: Using Render Dashboard

1. **Connect your GitHub repository** to Render
2. **Create a new Web Service**
3. **Configure the service:**
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node.js
   - **Plan:** Free
4. **Add Environment Variables:**
   - `NODE_ENV` = `production`
   - `BACKEND_URL` = `https://your-backend-url.onrender.com`
5. **Deploy!**

### Option 2: Using render.yaml

1. Make sure you have `render.yaml` in your repository root
2. Connect your GitHub repository to Render
3. Render will automatically detect and deploy using the configuration

### Option 3: Using Docker

The project includes a `Dockerfile` for containerized deployment:

```bash
docker build -t kitchen-assistant-frontend .
docker run -p 8081:8081 kitchen-assistant-frontend
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8081` |
| `NODE_ENV` | Environment | `development` |
| `BACKEND_URL` | Backend API URL | `http://localhost:3000` |

## Project Structure

```
frontend/
├── index.html          # Main application interface
├── script.js           # Application logic & API integration
├── serve.js            # Node.js static file server
├── package.json        # Dependencies & scripts
├── render.yaml         # Render deployment config
├── Dockerfile          # Docker containerization
├── .env                # Environment variables (local)
└── README.md           # This file
```

## API Integration

The frontend automatically detects the environment and connects to:
- **Development:** `http://localhost:3000`
- **Production:** `https://kitchen-assistant-backend.onrender.com`

## Technologies Used

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Real-time:** Socket.IO Client
- **Voice AI:** ElevenLabs Conversational AI
- **Video:** YouTube Embed API
- **Server:** Node.js HTTP Server
- **Deployment:** Render Platform

## Health & Monitoring

- Container health check uses `GET /health` (implemented in `serve.js`).
- Dockerfile now:
   - Sets `NODE_ENV=production`
   - Uses `npm ci --only=production`
   - Runs as non‑root `nodeuser`
   - Adds `curl` + `tini` for proper health checks & signal handling.

### Sample Docker Run
```bash
docker build -t kitchen-assistant-frontend .
docker run --rm -p 8081:8081 kitchen-assistant-frontend
curl http://localhost:8081/health
```

Expected JSON:
```json
{ "status": "healthy", "port": 8081 }
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Voice agent shows "misconfigured" | Old cached script / duplicate session | Hard refresh (Ctrl+Shift+R) then click Start again |
| Timers not updating | SSE blocked (ad blocker) | Use `window.debugKitchen.switchToPolling()` in console |
| YouTube embed blank | Privacy / extension blocking iframe | Click a video and choose "YouTube" button (opens new tab) |
| Health check failing in container | Missing curl (old image) | Rebuild image; ensure updated Dockerfile applied |
| Cannot reach backend | Wrong BACKEND_URL or CORS | Verify backend `/health` and env var |

### Debug Console Helpers
Open DevTools Console and use:
```js
window.debugKitchen.checkStatus();      // Summary
window.debugKitchen.testBackend();      // Ping backend
window.debugKitchen.testElevenLabs();   // Fetch signed URL
window.debugKitchen.switchToPolling();  // Force polling fallback
```

## Support

For issues and feature requests, please check the main repository documentation.
