// Vercel Serverless Function — proxies requests to NewsAPI.org
// The NEWS_API_KEY is stored as a Vercel environment variable (never exposed to the browser)

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

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'NEWS_API_KEY not configured on server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { query, from, to, sortBy, pageSize } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      {
        headers: { 'X-Api-Key': apiKey },
      }
    );

    const data = await response.json();

    if (data.status !== 'ok') {
      return new Response(
        JSON.stringify({ error: 'NewsAPI error', detail: data.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const articles = (data.articles || []).map((article) => ({
      title: article.title || '',
      source: article.source?.name || 'Unknown',
      date: article.publishedAt ? article.publishedAt.split('T')[0] : '',
      summary: article.description || '',
      url: article.url || '#',
      author: article.author || '',
    }));

    return new Response(
      JSON.stringify({ articles, totalResults: data.totalResults || 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'News fetch failed', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
