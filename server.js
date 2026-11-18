const express = require('express');
const http = require('http');
const https = require('https');
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
    res.set('Cache-Control', 'no-store').type('html').send(html.replace('</head>', `${additions}</head>`));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

function requestDuckDuckGo(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      },
      timeout: 10000
    }, response => {
      // Follow only redirects to DuckDuckGo; never turn this into a general URL proxy.
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const redirect = new URL(response.headers.location, url);
        if (redirect.protocol !== 'https:' || !/(^|\.)duckduckgo\.com$/i.test(redirect.hostname)) {
          reject(new Error('DuckDuckGo redirected to an unexpected host'));
          return;
        }
        requestDuckDuckGo(redirect.href).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`DuckDuckGo returned HTTP ${response.statusCode}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 2_000_000) request.destroy(new Error('DuckDuckGo response was too large'));
      });
      response.on('end', () => resolve(body));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('DuckDuckGo request timed out')));
    request.on('error', reject);
  });
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

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
  else if (/\b(search|duckduckgo|web|internet)\b/.test(text)) reply = 'Use Web Search to see DuckDuckGo results here.';
  else if (/\b(help|what can you do)\b/.test(text)) reply = 'I’m a simple, free helper—not a full AI. I can point you to Games, Music, Global Chat, and Web Search.';
  else if (/\b(thank|thanks)\b/.test(text)) reply = 'You’re welcome! Have fun exploring your hub.';
  else reply = 'I’m the free version of Fred, so I can answer a few common questions. Try asking about games, music, search, or how to use the site.';
  res.json({ reply });
});

// Fetch DuckDuckGo results server-side so the search page itself remains on this site.
app.get('/api/search', searchLimiter, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  if (!query) return res.status(400).json({ error: 'Enter something to search for.' });

  try {
    const html = await requestDuckDuckGo(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    const results = [];
    // Match anchor attributes irrespective of their order in DuckDuckGo's markup.
    const anchors = /<a\b([^>]*class=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchors.exec(html)) && results.length < 10) {
      const href = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      try {
        const link = new URL(decodeHtml(href), 'https://duckduckgo.com');
        const destination = link.searchParams.get('uddg') || link.href;
        if (!/^https?:\/\//i.test(destination)) continue;
        const tail = html.slice(anchors.lastIndex, anchors.lastIndex + 2000);
        const snippet = tail.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '';
        results.push({ title: decodeHtml(match[2]), url: destination, snippet: decodeHtml(snippet) });
      } catch (_) {
        // Ignore malformed result URLs.
      }
    }

    if (!results.length && /anomaly|captcha|challenge/i.test(html)) {
      return res.status(502).json({ error: 'DuckDuckGo is temporarily limiting automated searches. Please try again later.' });
    }
    res.json({ results });
  } catch (error) {
    console.error('Search request failed:', error.message);
    res.status(502).json({ error: 'The site could not reach DuckDuckGo. Please try again later.' });
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
