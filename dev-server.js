// Local dev proxy server — run alongside `npm run dev` for local development
// Usage: node dev-server.js
// This is NOT needed in production (Vercel handles /api/* via serverless functions)

import 'dotenv/config';
import http from 'http';

const PORT = 3001;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!GOOGLE_AI_API_KEY) {
  console.error('❌ GOOGLE_AI_API_KEY not set. Required for Google Web Search.');
  process.exit(1);
}

console.log('🔑 Google Web Search configured (API key)');

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

// --- Route: /api/search (Google Web Search via Gemini google_search grounding) ---
async function handleSearch(req, res) {
  try {
    const { query, num, dateRestrict } = await readBody(req);

    if (!query || typeof query !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter required' }));
      return;
    }

    // Build search prompt with optional time constraint
    let searchPrompt = query;
    if (dateRestrict) {
      const timeMap = {
        'd1': 'from the past day',
        'd7': 'from the past week',
        'w2': 'from the past 2 weeks',
        'm1': 'from the past month',
        'm3': 'from the past 3 months',
        'y1': 'from the past year',
      };
      const timeRange = timeMap[dateRestrict] || '';
      if (timeRange) searchPrompt += ` ${timeRange}`;
    }

    // Call Gemini API with google_search grounding tool
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: searchPrompt }],
            },
          ],
          tools: [{ google_search: {} }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Google Web Search API error',
        detail: data.error?.message || JSON.stringify(data),
      }));
      return;
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [], totalResults: 0, modelSummary: '' }));
      return;
    }

    const metadata = candidate.groundingMetadata;
    const modelText = candidate.content?.parts?.map((p) => p.text || '').join('\n') || '';

    const chunks = metadata?.groundingChunks || [];
    const supports = metadata?.groundingSupports || [];

    // Try to extract real URLs from searchEntryPoint rendered HTML
    const renderedHtml = metadata?.searchEntryPoint?.renderedContent || '';
    const realUrls = [];
    const hrefRegex = /href="(https?:\/\/[^"]+)"/g;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(renderedHtml)) !== null) {
      try {
        const url = new URL(hrefMatch[1]);
        if (!url.hostname.includes('vertexaisearch') && !url.hostname.includes('google.com')) {
          realUrls.push(hrefMatch[1]);
        }
      } catch {}
    }

    // Build search results from grounding metadata
    const results = chunks.map((chunk, idx) => {
      let uri = chunk.web?.uri || '';
      const title = chunk.web?.title || '';
      const isProxy = uri.includes('vertexaisearch.cloud.google.com');

      // If the URI is a vertexaisearch proxy, try to match a real URL by title keywords
      if (isProxy && realUrls.length > 0) {
        const titleLower = title.toLowerCase();
        const match = realUrls.find(u => {
          try { return titleLower.includes(new URL(u).hostname.replace('www.', '').split('.')[0]); } catch { return false; }
        });
        if (match) uri = match;
      }

      // Gather supporting text segments that reference this chunk
      const snippetParts = supports
        .filter((s) => s.groundingChunkIndices?.includes(idx))
        .map((s) => s.segment?.text || '')
        .filter((t) => t.length > 0);

      const snippet = snippetParts.join(' ').substring(0, 400) || '';

      let displayLink = '';
      try { displayLink = new URL(uri).hostname; } catch {}
      // For remaining proxy URLs, derive displayLink from the title instead
      if (displayLink.includes('vertexaisearch')) {
        displayLink = title.replace(/\s*[-–|:].*$/, '').trim().toLowerCase().replace(/\s+/g, '') + '.com';
      }

      return { title, link: uri, snippet, displayLink, formattedUrl: uri };
    });

    // Limit to requested number
    const limited = results.slice(0, num || 10);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      results: limited,
      totalResults: chunks.length,
      modelSummary: modelText,
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
  console.log(`   /api/search     → Google Web Search (Gemini + google_search)`);
  console.log(`   /api/fetch-url  → URL content fetcher`);
});
