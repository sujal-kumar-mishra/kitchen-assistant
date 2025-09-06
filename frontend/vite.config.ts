import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend URL from Render (set at deploy time)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  define: {
    'process.env.BACKEND_URL': JSON.stringify(
      process.env.VITE_BACKEND_URL || 'http://localhost:5000'
    )
  }
});
