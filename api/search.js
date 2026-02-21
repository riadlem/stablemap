// Vercel Serverless Function — Google Web Search via Gemini API with google_search grounding
// Uses GOOGLE_AI_API_KEY only — no CSE ID required, searches the entire web
// Returns real search results with URLs, titles, and snippets from grounding metadata

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

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return jsonResponse({ error: 'GOOGLE_AI_API_KEY not configured' }, 500);
  }

  try {
    const { query, num, dateRestrict } = await req.json();

    if (!query || typeof query !== 'string') {
      return jsonResponse({ error: 'Query parameter required' }, 400);
    }

    // Build a natural-language search prompt with optional time constraint
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
      return jsonResponse(
        {
          error: 'Google Web Search API error',
          detail: data.error?.message || JSON.stringify(data),
        },
        response.status
      );
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      return jsonResponse({ results: [], totalResults: 0, modelSummary: '' });
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
      let title = chunk.web?.title || '';
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

      // Gemini grounding often returns just a domain name or URL as the title.
      // Detect this and derive a real headline from the support text instead.
      const looksLikeUrl = !title
        || /^https?:\/\//i.test(title)
        || /^www\./i.test(title)
        || /^[a-z0-9-]+\.[a-z]{2,}$/i.test(title.trim())
        || /^[a-z0-9-]+\.[a-z]{2,}\s*[-–|:]/i.test(title.trim());

      if (looksLikeUrl && snippet) {
        // Use the first sentence of the support text as the title
        const sentenceEnd = snippet.search(/[.!?]\s|$/);
        const derived = snippet.substring(0, Math.min(sentenceEnd > 10 ? sentenceEnd : 120, 120)).trim();
        if (derived.length > 5) {
          title = derived;
        }
      }

      let displayLink = '';
      try {
        displayLink = new URL(uri).hostname;
      } catch {}
      // For remaining proxy URLs, derive displayLink from the title instead
      if (displayLink.includes('vertexaisearch')) {
        displayLink = title.replace(/\s*[-–|:].*$/, '').trim().toLowerCase().replace(/\s+/g, '') + '.com';
      }

      return { title, link: uri, snippet, displayLink, formattedUrl: uri };
    });

    // Limit to requested number of results
    const limited = results.slice(0, num || 10);

    return jsonResponse({
      results: limited,
      totalResults: chunks.length,
      modelSummary: modelText,
    });
  } catch (error) {
    return jsonResponse({ error: 'Search failed', detail: error.message }, 500);
  }
}
