// Local dev proxy server — run alongside `npm run dev` for local development
// Usage: node dev-server.js
// This is NOT needed in production (Vercel handles /api/* via serverless functions)

import 'dotenv/config';
import http from 'http';

const PORT = 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// At least one AI provider key is required
if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY && !GOOGLE_AI_API_KEY) {
  console.error('❌ No AI provider API key set. Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY');
  process.exit(1);
}

const configured = [];
if (ANTHROPIC_API_KEY) configured.push('Anthropic');
if (OPENAI_API_KEY) configured.push('OpenAI');
if (GOOGLE_AI_API_KEY) configured.push('Google Gemini');
console.log(`🔑 AI providers configured: ${configured.join(', ')}`);

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

// --- Provider-specific upstream call helpers ---

async function callAnthropic(body) {
  if (!ANTHROPIC_API_KEY) {
    return { status: 501, data: { error: 'ANTHROPIC_API_KEY not configured' } };
  }

  const anthropicBody = {
    model: body.model || 'claude-sonnet-4-5-20250929',
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
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await response.json();

  // Normalise to common response shape: { content: [{type:'text', text:'...'}] }
  return { status: response.status, data };
}

async function callOpenAI(body) {
  if (!OPENAI_API_KEY) {
    return { status: 501, data: { error: 'OPENAI_API_KEY not configured' } };
  }

  const openaiBody = {
    model: body.model || 'gpt-4o',
    max_tokens: Math.min(body.max_tokens || 4096, 4096),
    messages: body.messages,
    temperature: body.temperature ?? 0.7,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(openaiBody),
  });

  const data = await response.json();

  // Normalise OpenAI response → common format
  if (response.ok && data.choices?.[0]?.message?.content) {
    return {
      status: response.status,
      data: {
        content: [{ type: 'text', text: data.choices[0].message.content }],
        _raw: data,
      },
    };
  }

  return { status: response.status, data };
}

async function callGoogle(body) {
  if (!GOOGLE_AI_API_KEY) {
    return { status: 501, data: { error: 'GOOGLE_AI_API_KEY not configured' } };
  }

  const model = body.model || 'gemini-2.0-flash';

  // Build Gemini request
  const geminiBody = {
    contents: body.contents || [
      // Convert OpenAI-style messages to Gemini format
      ...(body.messages || [])
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
    ],
    generationConfig: {
      temperature: body.temperature ?? 0.7,
      maxOutputTokens: Math.min(body.max_tokens || 4096, 8192),
    },
  };

  // Inject system instruction if present
  const systemMsg = (body.messages || []).find((m) => m.role === 'system');
  if (systemMsg) {
    geminiBody.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    }
  );

  const data = await response.json();

  // Normalise Gemini response → common format
  if (response.ok && data.candidates?.[0]?.content?.parts) {
    const text = data.candidates[0].content.parts.map((p) => p.text || '').join('\n');
    return {
      status: response.status,
      data: {
        content: [{ type: 'text', text }],
        _raw: data,
      },
    };
  }

  return { status: response.status, data };
}

// --- Route: /api/ai (multi-provider) ---
async function handleAI(req, res) {
  try {
    const body = await readBody(req);
    const provider = body.provider || 'anthropic';

    let result;
    switch (provider) {
      case 'openai':
        result = await callOpenAI(body);
        break;
      case 'google':
        result = await callGoogle(body);
        break;
      case 'anthropic':
      default:
        result = await callAnthropic(body);
        break;
    }

    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.data));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
  }
}

// Legacy route — forwards to Anthropic directly (backwards compat)
async function handleClaude(req, res) {
  try {
    const body = await readBody(req);
    body.provider = 'anthropic';
    // Re-use the multi-provider handler by writing a mini-request
    const result = await callAnthropic(body);
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.data));
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
  '/api/ai': handleAI,
  '/api/claude': handleClaude,     // legacy — still works
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
  console.log(`   /api/ai         → Multi-provider AI (Anthropic, OpenAI, Google)`);
  console.log(`   /api/claude     → Anthropic Claude API (legacy)`);
  console.log(`   /api/fetch-url  → URL content fetcher`);
  console.log(`   /api/news       → NewsAPI.org proxy`);
});
