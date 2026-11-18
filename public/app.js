const games = [
  ['Cookie Clicker','🍪','Idle'],['Doom','👾','Action'],['Granny','🏚️','Horror'],['Baldi’s Basics','📐','Horror'],
  ['Minecraft','⛏️','Sandbox'],['Roblox','🎮','Platform'],['Among Us','🚀','Party'],['Friday Night Funkin’','🎤','Rhythm'],
  ['Geometry Dash','🔺','Platform'],['Slope','🟢','Arcade'],['Subway Surfers','🚆','Runner'],['Temple Run','🏃','Runner'],
  ['2048','🔢','Puzzle'],['Wordle','🔤','Word'],['Tetris','🧱','Puzzle'],['Pac-Man','🟡','Arcade'],
  ['Snake','🐍','Arcade'],['Minesweeper','💣','Puzzle'],['Chess','♟️','Strategy'],['Checkers','🔴','Strategy'],
  ['Solitaire','🃏','Cards'],['Mahjong','🀄','Puzzle'],['Crossy Road','🐸','Arcade'],['Flappy Bird','🐤','Arcade'],
  ['Five Nights at Freddy’s','🐻','Horror'],['Poppy Playtime','🧸','Horror'],['The Impossible Quiz','❓','Trivia'],['Plants vs. Zombies','🌻','Strategy'],
  ['Bloons Tower Defense','🎈','Strategy'],['Agar.io','🔵','Multiplayer'],['Slither.io','🐍','Multiplayer'],['Krunker','🎯','Action'],
  ['Moto X3M','🏍️','Racing'],['Fireboy and Watergirl','🔥','Platform'],['Duck Life','🦆','Adventure'],['Little Alchemy','⚗️','Puzzle'],
  ['Run 3','🏃','Runner'],['Stickman Hook','🪝','Arcade'],['Paper.io','🗺️','Multiplayer'],['Drive Mad','🚙','Racing'],
  ['Getting Over It','🔨','Challenge'],['World’s Hardest Game','😵','Challenge'],['Cut the Rope','🍬','Puzzle'],['Doodle Jump','🦘','Arcade'],
  ['Jetpack Joyride','🚀','Runner'],['Bad Ice-Cream','🍦','Arcade'],['Bloxd.io','🧊','Sandbox'],['Townscaper','🏘️','Creative']
];

const gameGrid = document.querySelector('#game-grid');
const gameSearch = document.querySelector('#game-search');
const gameCount = document.querySelector('#game-count');

function renderGames(query = '') {
  const filtered = games.filter(([name, , category]) => `${name} ${category}`.toLowerCase().includes(query.toLowerCase()));
  gameGrid.replaceChildren();
  for (const [name, emoji, category] of filtered) {
    const link = document.createElement('a');
    link.className = 'game-card';
    link.href = `https://www.google.com/search?q=${encodeURIComponent(`${name} play online`)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const icon = document.createElement('span');
    icon.className = 'game-emoji';
    icon.textContent = emoji;
    const title = document.createElement('strong');
    title.textContent = name;
    const tag = document.createElement('small');
    tag.textContent = `${category} · Find to play`;
    const arrow = document.createElement('span');
    arrow.className = 'game-arrow';
    arrow.textContent = '↗';
    link.append(icon, arrow, title, tag);
    gameGrid.append(link);
  }
  gameCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;
}
renderGames();
gameSearch.addEventListener('input', () => renderGames(gameSearch.value.trim()));

const audio = document.querySelector('#audio-player');
const playlist = document.querySelector('#playlist');
const musicFiles = document.querySelector('#music-files');
const musicStatus = document.querySelector('#music-status');
const objectUrls = [];
musicFiles.addEventListener('change', () => {
  playlist.replaceChildren();
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls.length = 0;
  const files = [...musicFiles.files].filter(file => file.type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav)$/i.test(file.name));
  if (!files.length) {
    musicStatus.textContent = 'Choose audio files supported by your browser.';
    return;
  }
  musicStatus.textContent = `${files.length} track${files.length === 1 ? '' : 's'} ready to play. Files stay on your device.`;
  files.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    const row = document.createElement('li');
    const play = document.createElement('button');
    play.type = 'button';
    play.textContent = '▶ Play';
    play.addEventListener('click', () => {
      audio.src = url;
      audio.play().catch(() => { musicStatus.textContent = 'Could not play this file. Try another audio format.'; });
    });
    row.append(play, document.createTextNode(file.name));
    playlist.append(row);
    if (index === 0) {
      audio.src = url;
      audio.load();
    }
  });
});

function addMessage(container, name, text) {
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();
  const row = document.createElement('p');
  row.textContent = `${name}: ${text}`;
  container.append(row);
  container.scrollTop = container.scrollHeight;
}

const chatMessages = document.querySelector('#chat-messages');
if (typeof io === 'function') {
  const socket = io();
  socket.on('chat:message', message => addMessage(chatMessages, message.name, message.text));
  socket.on('connect_error', () => {
    const empty = chatMessages.querySelector('.empty-state');
    if (empty) empty.textContent = 'Chat connection unavailable. Please refresh and try again.';
  });
  document.querySelector('#chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const nameInput = document.querySelector('#chat-name');
    const textInput = document.querySelector('#chat-text');
    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    if (name && text) {
      socket.emit('chat:message', { name, text });
      textInput.value = '';
      textInput.focus();
    }
  });
}

document.querySelector('#fred-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#fred-prompt');
  const prompt = input.value.trim();
  const messages = document.querySelector('#fred-messages');
  const status = document.querySelector('#fred-status');
  if (!prompt) return;
  addMessage(messages, 'You', prompt);
  input.value = '';
  status.textContent = 'Fred is thinking…';
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fred could not respond.');
    addMessage(messages, 'Fred', data.reply);
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message || 'Could not reach Fred. Please try again.';
  }
});

document.querySelector('#web-search-form').addEventListener('submit', event => {
  event.preventDefault();
  const query = document.querySelector('#web-search-input').value.trim();
  if (query) window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
});

const navLinks = [...document.querySelectorAll('.nav-link')];
const sections = navLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach(link => link.classList.toggle('active', link.hash === `#${visible.target.id}`));
  }, { rootMargin: '-15% 0px -65% 0px', threshold: [0, .2, .5] });
  sections.forEach(section => observer.observe(section));
}
