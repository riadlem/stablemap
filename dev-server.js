// Local dev proxy server — run alongside `npm run dev` for local development
// Usage: node dev-server.js
// This is NOT needed in production (Vercel handles /api/* via serverless functions)

import 'dotenv/config';
import http from 'http';

const PORT = 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

if (!NEWS_API_KEY) {
  console.warn('⚠️  NEWS_API_KEY not set — /api/news will return errors. Get a free key at https://newsapi.org');
}

// --- HTML to Text helper ---
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

// --- Body parser helper ---
async function readBody(req) {
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  return JSON.parse(rawBody);
}

// --- Route: /api/claude ---
async function handleClaude(req, res) {
  try {
    const body = await readBody(req);

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
}

// --- Route: /api/fetch-url ---
async function handleFetchUrl(req, res) {
  try {
    const { url } = await readBody(req);

    if (!url || typeof url !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'URL parameter required' }));
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL' }));
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only HTTP/HTTPS URLs are supported' }));
      return;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'StableMap-Bot/1.0 (Business Intelligence)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Failed to fetch URL: ${response.status}` }));
      return;
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    const text = htmlToText(html);

    const maxLength = 15000;
    const truncatedText = text.length > maxLength
      ? text.substring(0, maxLength) + '\n\n[Content truncated...]'
      : text;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      url,
      title,
      content: truncatedText,
      contentLength: text.length,
      truncated: text.length > maxLength,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Fetch failed', detail: err.message }));
  }
}

// --- Route: /api/news ---
async function handleNews(req, res) {
  if (!NEWS_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NEWS_API_KEY not configured on server' }));
    return;
  }

  try {
    const { query, from, to, sortBy, pageSize } = await readBody(req);

    if (!query || typeof query !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter required' }));
      return;
    }

    const params = new URLSearchParams({
      q: query,
      sortBy: sortBy || 'publishedAt',
      pageSize: String(Math.min(pageSize || 20, 100)),
      language: 'en',
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await fetch(
      `https://newsapi.org/v2/everything?${params.toString()}`,
      { headers: { 'X-Api-Key': NEWS_API_KEY } }
    );

    const data = await response.json();

    if (data.status !== 'ok') {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'NewsAPI error', detail: data.message }));
      return;
    }

    const articles = (data.articles || []).map((article) => ({
      title: article.title || '',
      source: article.source?.name || 'Unknown',
      date: article.publishedAt ? article.publishedAt.split('T')[0] : '',
      summary: article.description || '',
      url: article.url || '#',
      author: article.author || '',
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ articles, totalResults: data.totalResults || 0 }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'News fetch failed', detail: err.message }));
  }
}

// --- Router ---
const routes = {
  '/api/claude': handleClaude,
  '/api/fetch-url': handleFetchUrl,
  '/api/news': handleNews,
};

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

  if (req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const handler = routes[req.url];
  if (handler) {
    await handler(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`✅ API proxy running on http://localhost:${PORT}`);
  console.log(`   /api/claude     → Anthropic Claude API`);
  console.log(`   /api/fetch-url  → URL content fetcher`);
  console.log(`   /api/news       → NewsAPI.org proxy`);
});
