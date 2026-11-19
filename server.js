const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Render sits behind a trusted reverse proxy; this also lets rate-limit use client IPs.
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

app.get('/', async (req, res, next) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const additions = '<link rel="stylesheet" href="/enhancements.css?v=3"><script src="/enhancements.js?v=3" defer></script><script src="/site-guard.js?v=3" defer></script><script src="/arena-games.js?v=1" defer></script><script src="/arcade-games.js?v=1" defer></script>';
    res.set('Cache-Control', 'no-store').type('html').send(html.replace('</head>', `${additions}</head>`));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

app.post('/api/ai', aiLimiter, (req, res) => {
  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) {
    return res.status(400).json({ error: 'Enter a message up to 4,000 characters.' });
  }
  const text = prompt.toLowerCase();
  let reply;
  if (/\b(hi|hello|hey|what'?s up)\b/.test(text)) reply = 'Hey! I’m Fred, your free built-in helper. I can chat, share simple ideas, or help you find a section of the site.';
  else if (/\b(game|play|games)\b/.test(text)) reply = 'Head to the Games section to play the built-in games right here.';
  else if (/\b(music|song|audio)\b/.test(text)) reply = 'Open Music and choose audio files from your device. They play here and are not uploaded.';
  else if (/\b(search|duckduckgo|web|internet)\b/.test(text)) reply = 'Use Web Search to see search result previews right here on this site.';
  else if (/\b(help|what can you do)\b/.test(text)) reply = 'I’m a simple, free helper—not a full AI. I can point you to Games, Music, Global Chat, and Web Search.';
  else if (/\b(thank|thanks)\b/.test(text)) reply = 'You’re welcome! Have fun exploring your hub.';
  else reply = 'I’m the free version of Fred, so I can answer a few common questions. Try asking about games, music, search, or how to use the site.';
  res.json({ reply });
});

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

async function searchDuckDuckGo(query) {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyHubSearch/1.0)', Accept: 'text/html' },
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  const html = await response.text();
  const results = [];
  const pattern = /<a\b([^>]*class=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) && results.length < 8) {
    const rawHref = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!rawHref) continue;
    try {
      const parsed = new URL(decodeHtml(rawHref), 'https://duckduckgo.com');
      const url = parsed.searchParams.get('uddg') || parsed.href;
      if (!/^https?:\/\//i.test(url)) continue;
      const following = html.slice(pattern.lastIndex, pattern.lastIndex + 1800);
      const snippetHtml = following.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '';
      results.push({ title: decodeHtml(match[2]), url, snippet: decodeHtml(snippetHtml), source: 'DuckDuckGo' });
    } catch (_) {
      // Ignore malformed result URLs.
    }
  }
  if (!results.length) throw new Error('DuckDuckGo returned no parseable results');
  return results;
}

async function searchWikipedia(query) {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  endpoint.search = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srlimit: '8', format: 'json'
  }).toString();
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'MyHubSiteSearch/1.0 (on-site search fallback)', Accept: 'application/json' },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.query?.search || []).map(item => ({
    title: item.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
    snippet: decodeHtml(item.snippet || ''),
    source: 'Wikipedia fallback'
  }));
}

// Search remains on this website. If DuckDuckGo blocks/times out Render, use Wikipedia's free search API.
app.get('/api/search', searchLimiter, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  if (!query) return res.status(400).json({ error: 'Enter something to search for.' });

  try {
    try {
      const results = await searchDuckDuckGo(query);
      return res.json({ results, provider: 'DuckDuckGo' });
    } catch (primaryError) {
      console.warn('DuckDuckGo search unavailable; trying Wikipedia fallback:', primaryError.message);
    }

    const results = await searchWikipedia(query);
    return res.json({ results, provider: 'Wikipedia fallback' });
  } catch (error) {
    console.error('Search providers failed:', error.message);
    return res.status(502).json({ error: 'Search providers are temporarily unreachable. Please try again later.' });
  }
});

io.on('connection', socket => {
  socket.on('chat:message', payload => {
    const name = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 24) : '';
    const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 500) : '';
    if (name && text) io.emit('chat:message', { name, text });
  });
});

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Website running on port ${port}`));
