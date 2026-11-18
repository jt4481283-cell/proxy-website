const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10kb' }));

// Keep the enhancements on the existing dashboard without changing its layout.
app.get('/', async (req, res, next) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const additions = '<link rel="stylesheet" href="/enhancements.css"><script src="/enhancements.js" defer></script>';
    res.type('html').send(html.replace('</head>', `${additions}</head>`));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

app.get('/api/music', (req, res) => {
  res.json([
    { id: 'song1', title: 'Song 1', src: '/music/song1.mp3' },
    { id: 'song2', title: 'Song 2', src: '/music/song2.mp3' }
  ]);
});

// Free, rule-based Fred: no API key or paid AI service required.
app.post('/api/ai', aiLimiter, (req, res) => {
  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) {
    return res.status(400).json({ error: 'Enter a message up to 4,000 characters.' });
  }

  const text = prompt.toLowerCase();
  let reply;
  if (/\b(hi|hello|hey|what'?s up)\b/.test(text)) {
    reply = 'Hey! I’m Fred, your free built-in helper. I can chat, share simple ideas, or help you find a section of the site.';
  } else if (/\b(game|play|games)\b/.test(text)) {
    reply = 'Head to the Games section to play the built-in games. Pick one and it opens right here on the site.';
  } else if (/\b(music|song|audio)\b/.test(text)) {
    reply = 'Open Music and choose audio files from your device. They play in the site and are not uploaded.';
  } else if (/\b(search|duckduckgo|web|internet)\b/.test(text)) {
    reply = 'Use Web Search to see DuckDuckGo results here. Opening a result takes you to that website.';
  } else if (/\b(help|what can you do)\b/.test(text)) {
    reply = 'I’m a simple, free helper—not a full AI. I can point you to Games, Music, Global Chat, and Web Search.';
  } else if (/\b(thank|thanks)\b/.test(text)) {
    reply = 'You’re welcome! Have fun exploring your hub.';
  } else {
    reply = 'I’m the free version of Fred, so I can only answer a few common questions. Try asking about games, music, search, or how to use the site.';
  }
  res.json({ reply });
});

// Fetch and render DuckDuckGo's public HTML results as same-site JSON.
app.get('/api/search', searchLimiter, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  if (!query) return res.status(400).json({ error: 'Enter something to search for.' });

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyHubSearch/1.0)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`DuckDuckGo returned ${response.status}`);
    const html = await response.text();
    const decode = value => value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/\s+/g, ' ').trim();
    const results = [];
    const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultPattern.exec(html)) && results.length < 10) {
      let href = decode(match[1]);
      try {
        const parsed = new URL(href, 'https://duckduckgo.com');
        href = parsed.searchParams.get('uddg') || parsed.href;
        if (!/^https?:\/\//i.test(href)) continue;
        const snippetStart = resultPattern.lastIndex;
        const snippetHtml = html.slice(snippetStart, snippetStart + 1800).match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
        results.push({ title: decode(match[2]), url: href, snippet: snippetHtml ? decode(snippetHtml[1]) : '' });
      } catch (_) {
        // Ignore malformed search-result URLs.
      }
    }
    res.json({ results });
  } catch (error) {
    console.error('Search request failed:', error.message);
    res.status(502).json({ error: 'Search is temporarily unavailable. Please try again.' });
  }
});

// This chat broadcasts messages from people connected to your site.
// Fred is not connected to the chat.
io.on('connection', socket => {
  socket.on('chat:message', payload => {
    const name = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 24) : '';
    const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 500) : '';
    if (name && text) io.emit('chat:message', { name, text });
  });
});

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Website running on port ${port}`));
