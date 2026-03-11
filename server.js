import express from 'express';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MEMORY_API_URL = (process.env.MEMORY_API_URL || 'http://dokploy-memory-database-api-lxfp0i:3000').replace(/\/$/, '');
const MEMORY_API_TOKEN = process.env.MEMORY_API_TOKEN || '';

const targetUrl = new URL(MEMORY_API_URL);
const agent = targetUrl.protocol === 'https:' ? https : http;

const app = express();

// Proxy all /api/* requests to the backend
app.use('/api', (req, res) => {
  const path = '/api' + req.url;
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      authorization: `Bearer ${MEMORY_API_TOKEN}`,
    },
  };

  const proxy = agent.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend unavailable', detail: err.message });
    }
  });

  req.pipe(proxy);
});

app.use(express.static(join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server listening on :${PORT}, proxying API to ${MEMORY_API_URL}`));
