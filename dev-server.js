// Local dev proxy server — run alongside `npm run dev` for local development
// Usage: node dev-server.js
// This is NOT needed in production (Vercel handles /api/* via serverless functions)

import 'dotenv/config';
import http from 'http';

const PORT = 3001;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

if (!GOOGLE_AI_API_KEY) {
  console.error('❌ GOOGLE_AI_API_KEY not set. Required for Google Web Search.');
  process.exit(1);
}

if (!GOOGLE_CSE_ID) {
  console.error('❌ GOOGLE_CSE_ID not set. Create a Programmable Search Engine at https://programmablesearchengine.google.com/ and add the ID.');
  process.exit(1);
}

console.log('🔑 Google Web Search configured (API key + CSE ID)');

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

// --- Route: /api/search (Google Custom Search) ---
async function handleSearch(req, res) {
  try {
    const { query, num, dateRestrict, siteSearch, start, sort } = await readBody(req);

    if (!query || typeof query !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter required' }));
      return;
    }

    const params = new URLSearchParams({
      key: GOOGLE_AI_API_KEY,
      cx: GOOGLE_CSE_ID,
      q: query,
      num: String(Math.min(num || 10, 10)),
    });

    if (dateRestrict) params.set('dateRestrict', dateRestrict);
    if (siteSearch) params.set('siteSearch', siteSearch);
    if (start) params.set('start', String(start));
    if (sort) params.set('sort', sort);

    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Google Search API error',
        detail: data.error?.message || JSON.stringify(data),
      }));
      return;
    }

    const results = (data.items || []).map((item) => ({
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || '',
      displayLink: item.displayLink || '',
      formattedUrl: item.formattedUrl || '',
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      results,
      totalResults: parseInt(data.searchInformation?.totalResults || '0', 10),
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Search failed', detail: err.message }));
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

// --- Router ---
const routes = {
  '/api/search': handleSearch,
  '/api/fetch-url': handleFetchUrl,
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
  console.log(`   /api/search     → Google Custom Search API`);
  console.log(`   /api/fetch-url  → URL content fetcher`);
});
