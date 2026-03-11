import express from 'express';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Service configurations
const services = {
  'memory-api': {
    url: (process.env.MEMORY_API_URL || 'http://dokploy-memory-database-api-lxfp0i:3000').replace(/\/$/, ''),
    token: process.env.MEMORY_API_TOKEN || '',
  },
  'discord-ingestor': {
    url: (process.env.DISCORD_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.DISCORD_INGESTOR_TOKEN || '',
  },
  'gmail-ingestor': {
    url: (process.env.GMAIL_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.GMAIL_INGESTOR_TOKEN || '',
  },
  'slack-ingestor': {
    url: (process.env.SLACK_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.SLACK_INGESTOR_TOKEN || '',
  },
  'anthropic-ingestor': {
    url: (process.env.ANTHROPIC_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.ANTHROPIC_INGESTOR_TOKEN || '',
  },
  'chatgpt-ingestor': {
    url: (process.env.CHATGPT_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.CHATGPT_INGESTOR_TOKEN || '',
  },
};

const app = express();

// Service config endpoint (tells frontend which services are configured)
app.get('/service-config', (_req, res) => {
  const config = {};
  for (const [name, svc] of Object.entries(services)) {
    config[name] = { configured: !!svc.url };
  }
  res.json(config);
});

// Generic proxy function
function proxyRequest(serviceUrl, serviceToken, req, res) {
  const targetUrl = new URL(serviceUrl);
  const agent = targetUrl.protocol === 'https:' ? https : http;
  const path = req.url;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      ...(serviceToken ? { authorization: `Bearer ${serviceToken}` } : {}),
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
}

// Proxy routes for each service
for (const [name, svc] of Object.entries(services)) {
  app.use(`/proxy/${name}`, (req, res) => {
    if (!svc.url) {
      return res.status(503).json({ error: `${name} not configured` });
    }
    proxyRequest(svc.url, svc.token, req, res);
  });
}

// Backward compat: /api/* → memory-api
app.use('/api', (req, res) => {
  const svc = services['memory-api'];
  const path = '/api' + req.url;
  const targetUrl = new URL(svc.url);
  const agent = targetUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      authorization: `Bearer ${svc.token}`,
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

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
