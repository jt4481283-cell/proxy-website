const audio = document.querySelector('#audio-player');
const playlistElement = document.querySelector('#playlist');

async function loadPlaylist() {
  const response = await fetch('/api/music');
  const tracks = await response.json();

  for (const track of tracks) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `▶ ${track.title}`;

    button.addEventListener('click', () => {
      audio.src = track.src;
      audio.play();
    });

    item.append(button);
    playlistElement.append(item);
  }
}
loadPlaylist();

function addMessage(container, name, text) {
  const row = document.createElement('p');
  row.textContent = `${name}: ${text}`;
  container.append(row);
  container.scrollTop = container.scrollHeight;
}

const socket = io();
const chatMessages = document.querySelector('#chat-messages');

socket.on('chat:message', message => {
  addMessage(chatMessages, message.name, message.text);
});

document.querySelector('#chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = document.querySelector('#chat-name').value.trim();
  const text = document.querySelector('#chat-text').value.trim();

  if (name && text) {
    socket.emit('chat:message', { name, text });
  }
});

document.querySelector('#fred-form').addEventListener('submit', async event => {
  event.preventDefault();
  const promptInput = document.querySelector('#fred-prompt');
  const prompt = promptInput.value.trim();
  const messages = document.querySelector('#fred-messages');
  const status = document.querySelector('#fred-status');

  if (!prompt) return;

  addMessage(messages, 'You', prompt);
  promptInput.value = '';
  status.textContent = 'Fred is thinking…';

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const data = await response.json();

  if (response.ok) {
    addMessage(messages, 'Fred', data.reply);
  } else {
    status.textContent = data.error || 'Fred could not respond.';
  }
});
