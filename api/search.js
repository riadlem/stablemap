// Vercel Serverless Function — proxies requests to Google Custom Search JSON API
// GOOGLE_AI_API_KEY and GOOGLE_CSE_ID are stored as Vercel environment variables (never exposed to the browser)

export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cseId) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_AI_API_KEY or GOOGLE_CSE_ID not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { query, num, dateRestrict, siteSearch, start, sort } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = new URLSearchParams({
      key: apiKey,
      cx: cseId,
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
      return new Response(
        JSON.stringify({
          error: 'Google Search API error',
          detail: data.error?.message || JSON.stringify(data),
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = (data.items || []).map((item) => ({
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || '',
      displayLink: item.displayLink || '',
      formattedUrl: item.formattedUrl || '',
    }));

    return new Response(
      JSON.stringify({
        results,
        totalResults: parseInt(data.searchInformation?.totalResults || '0', 10),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Search failed', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
