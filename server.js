import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MEMORY_API_URL = (process.env.MEMORY_API_URL || 'http://dokploy-memory-database-api-lxfp0i:3000').replace(/\/$/, '');
const MEMORY_API_TOKEN = process.env.MEMORY_API_TOKEN || '';

const app = express();

app.use('/api', createProxyMiddleware({
  target: MEMORY_API_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '/api' },
  on: {
    proxyReq(proxyReq) {
      if (MEMORY_API_TOKEN) {
        proxyReq.setHeader('Authorization', `Bearer ${MEMORY_API_TOKEN}`);
      }
    },
    error(err, req, res) {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend unavailable', detail: err.message }));
      }
    },
  },
}));

app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server listening on :${PORT}, proxying API to ${MEMORY_API_URL}`));
