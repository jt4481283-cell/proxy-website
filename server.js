const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});

app.get('/api/music', (req, res) => {
  res.json([
    { id: 'song1', title: 'Song 1', src: '/music/song1.mp3' },
    { id: 'song2', title: 'Song 2', src: '/music/song2.mp3' }
  ]);
});

app.post('/api/ai', aiLimiter, async (req, res) => {
  const prompt = typeof req.body.prompt === 'string'
    ? req.body.prompt.trim()
    : '';

  if (!prompt || prompt.length > 4000) {
    return res.status(400).json({ error: 'Enter a message up to 4,000 characters.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Fred needs an API key set up on the server.'
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Fred, a friendly and helpful AI assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({ error: 'Fred could not respond right now.' });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content || 'Fred has no response right now.'
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: 'Could not reach Fred right now.' });
  }
});

// This chat broadcasts messages from people connected to your site.
// Fred is not connected to the chat.
io.on('connection', socket => {
  socket.on('chat:message', payload => {
    const name = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 24) : '';
    const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 500) : '';

    if (name && text) {
      io.emit('chat:message', { name, text });
    }
  });
});

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`Website running on port ${port}`);
});
