// Local dev proxy server — run alongside `npm run dev` for local development
// Usage: node dev-server.js
// This is NOT needed in production (Vercel handles /api/claude via serverless function)

import 'dotenv/config';
import http from 'http';

const PORT = 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/claude') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    let rawBody = '';
    for await (const chunk of req) rawBody += chunk;
    const body = JSON.parse(rawBody);

    const anthropicBody = {
      model: body.model || 'claude-sonnet-4-20250514',
      max_tokens: Math.min(body.max_tokens || 4096, 8192),
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
    };
    if (body.system) anthropicBody.system = body.system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2024-10-22',
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`✅ Claude API proxy running on http://localhost:${PORT}/api/claude`);
});
