// Vercel Serverless Function — multi-provider AI proxy
// Routes requests to Anthropic, OpenAI, or Google Gemini based on `provider` field
// API keys are stored as Vercel environment variables (never exposed to the browser)

export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Provider handlers ---

async function callAnthropic(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 501);

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
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await response.json();
  return jsonResponse(data, response.status);
}

async function callOpenAI(body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'OPENAI_API_KEY not configured' }, 501);

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
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(openaiBody),
  });

  const data = await response.json();

  // Normalise to common format
  if (response.ok && data.choices?.[0]?.message?.content) {
    return jsonResponse({
      content: [{ type: 'text', text: data.choices[0].message.content }],
    });
  }

  return jsonResponse(data, response.status);
}

async function callGoogle(body) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'GOOGLE_AI_API_KEY not configured' }, 501);

  const model = body.model || 'gemini-2.0-flash';

  const geminiBody = {
    contents: body.contents || [
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

  const systemMsg = (body.messages || []).find((m) => m.role === 'system');
  if (systemMsg) {
    geminiBody.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    }
  );

  const data = await response.json();

  // Normalise to common format
  if (response.ok && data.candidates?.[0]?.content?.parts) {
    const text = data.candidates[0].content.parts.map((p) => p.text || '').join('\n');
    return jsonResponse({
      content: [{ type: 'text', text }],
    });
  }

  return jsonResponse(data, response.status);
}

// --- Main handler ---

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return jsonResponse({ error: 'Invalid request: messages array required' }, 400);
    }

    const provider = body.provider || 'anthropic';

    switch (provider) {
      case 'openai':
        return await callOpenAI(body);
      case 'google':
        return await callGoogle(body);
      case 'anthropic':
      default:
        return await callAnthropic(body);
    }
  } catch (error) {
    return jsonResponse({ error: 'Proxy error', detail: error.message }, 500);
  }
}
