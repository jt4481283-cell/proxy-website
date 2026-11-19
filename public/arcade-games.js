(() => {
  const grid = document.querySelector('#game-grid');
  if (!grid) return;

  const css = document.createElement('style');
  css.textContent = `
    .arcade-card{width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer}
    .arcade-modal[hidden]{display:none}.arcade-modal{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:1rem;background:#050711e8;backdrop-filter:blur(9px)}
    .arcade-dialog{width:min(920px,100%);max-height:94vh;overflow:auto;padding:1.15rem;border:1px solid #ffffff20;border-radius:20px;background:#171b29;color:#f5f6ff;box-shadow:0 24px 80px #000b}
    .arcade-head{display:flex;justify-content:space-between;align-items:center;gap:1rem}.arcade-head h2{margin:.1rem 0}.arcade-sub{margin:.2rem 0;color:#b9bfd2}
    .arcade-close,.arcade-btn{border:1px solid #ffffff2a;border-radius:10px;background:#292f42;color:inherit;padding:.65rem .9rem;font:inherit;cursor:pointer}
    .arcade-canvas{display:block;width:100%;height:auto;max-height:64vh;object-fit:contain;background:#101522;border-radius:14px;touch-action:none}
    .arcade-hud{display:flex;justify-content:space-between;gap:.7rem;flex-wrap:wrap;padding:.65rem .2rem;color:#dce1f0;font-weight:650}
    .arcade-help{text-align:center;color:#b9bfd2;font-size:.92rem;line-height:1.5}.arcade-controls{display:flex;justify-content:center;gap:.55rem;flex-wrap:wrap;margin:.6rem 0}
    .horror-dpad{display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,46px);gap:4px;justify-content:center;margin:.45rem auto}.horror-dpad button{border:1px solid #ffffff29;background:#292f42;color:white;border-radius:10px;font-size:1.2rem;touch-action:none}
    @media(min-width:700px){.horror-dpad{display:none}}@media(max-width:600px){.arcade-dialog{padding:.75rem}.arcade-canvas{max-height:50vh}.arcade-hud{font-size:.9rem}}
  `;
  document.head.append(css);

  const games = [
    { name: 'Skyline Sprint', icon: '🏃', type: 'runner', description: 'Dash through a neon city: dodge, jump, slide, and collect coins.' },
    { name: 'Midnight at Hollow House', icon: '🔦', type: 'horror', description: 'Explore a dark house, find the keys, and escape what is hunting you.' }
  ];
  const modal = document.createElement('section');
  modal.className = 'arcade-modal'; modal.hidden = true;
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'arcade-title');
  modal.innerHTML = '<div class="arcade-dialog"><header class="arcade-head"><div><p class="eyebrow">ORIGINAL PLAY-IN-BROWSER GAME</p><h2 id="arcade-title"></h2></div><button class="arcade-close" type="button">Close</button></header><div class="arcade-content"></div></div>';
  document.body.append(modal);
  const content = modal.querySelector('.arcade-content');
  let dispose = () => {};
  const make = (tag, cls, value) => { const el = document.createElement(tag); if (cls) el.className = cls; if (value) el.textContent = value; return el; };

  function close() { dispose(); dispose = () => {}; modal.hidden = true; content.replaceChildren(); }
  modal.querySelector('.arcade-close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });

  function open(game) {
    close(); modal.hidden = false; modal.querySelector('#arcade-title').textContent = game.name;
    if (game.type === 'runner') startRunner(); else startHorror();
    modal.querySelector('.arcade-close').focus();
  }

  function shell(helpText) {
    const hud = make('div', 'arcade-hud');
    const canvas = make('canvas', 'arcade-canvas');
    const help = make('p', 'arcade-help', helpText);
    const actions = make('div', 'arcade-controls');
    const restart = make('button', 'arcade-btn', 'Restart'); restart.type = 'button'; actions.append(restart);
    content.replaceChildren(hud, canvas, help, actions);
    return { hud, canvas, help, actions, restart };
  }

  function startRunner() {
    const ui = shell('← → or A/D to change lanes · ↑/W/Space to jump · ↓/S to slide · On phones, swipe or use buttons.');
    const ctx = ui.canvas.getContext('2d');
    ui.canvas.width = 900; ui.canvas.height = 500;
    const scoreEl = make('span', '', 'Distance: 0');
    const coinEl = make('span', '', 'Coins: 0');
    const lifeEl = make('span', '', 'Hearts: ♥ ♥ ♥');
    ui.hud.append(scoreEl, coinEl, lifeEl);
    const touch = [['◀', 'left'], ['▲', 'jump'], ['▼', 'slide'], ['▶', 'right']];
    const touchButtons = [];
    touch.forEach(([label, action]) => {
      const button = make('button', 'arcade-btn', label); button.type = 'button';
      button.addEventListener('pointerdown', event => { event.preventDefault(); runnerAction(action); });
      ui.actions.append(button); touchButtons.push(button);
    });

    let raf = 0, last = 0, elapsed = 0, spawnClock = 0, distance = 0, coins = 0, hearts = 3;
    let lane = 1, laneVisual = 1, jump = 0, slide = 0, over = false, obstacles = [], pickups = [], scenery = [];
    const held = new Set();
    function reset() {
      cancelAnimationFrame(raf); last = performance.now(); elapsed = 0; spawnClock = 0; distance = 0; coins = 0; hearts = 3;
      lane = 1; laneVisual = 1; jump = 0; slide = 0; over = false; obstacles = []; pickups = [];
      scenery = Array.from({ length: 18 }, (_, i) => ({ side: i % 2, z: (i / 9) % 1, height: 45 + Math.random() * 120, hue: 190 + Math.random() * 100 }));
      scoreEl.textContent = 'Distance: 0'; coinEl.textContent = 'Coins: 0'; lifeEl.textContent = 'Hearts: ♥ ♥ ♥';
      raf = requestAnimationFrame(frame);
    }
    function runnerAction(action) {
      if (over) return;
      if (action === 'left') lane = Math.max(0, lane - 1);
      if (action === 'right') lane = Math.min(2, lane + 1);
      if (action === 'jump' && jump <= 0 && slide <= 0) jump = .78;
      if (action === 'slide' && jump <= 0) slide = .62;
    }
    function keydown(event) {
      const key = event.key.toLowerCase();
      if (['arrowleft','arrowright','arrowup','arrowdown',' ','a','d','w','s'].includes(key)) event.preventDefault();
      if (held.has(key)) return; held.add(key);
      if (key === 'arrowleft' || key === 'a') runnerAction('left');
      if (key === 'arrowright' || key === 'd') runnerAction('right');
      if (key === 'arrowup' || key === 'w' || key === ' ') runnerAction('jump');
      if (key === 'arrowdown' || key === 's') runnerAction('slide');
    }
    function keyup(event) { held.delete(event.key.toLowerCase()); }
    function pointerdown(event) { ui.canvas.dataset.touchX = event.clientX; ui.canvas.dataset.touchY = event.clientY; }
    function pointerup(event) {
      const x = Number(ui.canvas.dataset.touchX), y = Number(ui.canvas.dataset.touchY);
      const dx = event.clientX - x, dy = event.clientY - y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) runnerAction(dx < 0 ? 'left' : 'right');
      else runnerAction(dy < 0 ? 'jump' : 'slide');
    }
    function spawn() {
      const laneIndex = Math.floor(Math.random() * 3);
      const kind = Math.random() < .62 ? 'barrier' : 'overhead';
      obstacles.push({ lane: laneIndex, z: 0, kind, hit: false });
      if (Math.random() < .72) {
        const coinLane = Math.floor(Math.random() * 3);
        for (let i = 0; i < 4; i++) pickups.push({ lane: coinLane, z: -.22 - i * .12, got: false });
      }
    }
    function draw(now) {
      const w = ui.canvas.width, h = ui.canvas.height, horizon = 150;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, '#101629'); sky.addColorStop(1, '#37335c');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = '#171a2a'; ctx.fillRect(0, horizon, w, h - horizon);
      for (let i = 0; i < 8; i++) {
        const x = (i * 137 + (elapsed * 12) % 137) % w;
        ctx.fillStyle = i % 2 ? '#202641' : '#25233e'; ctx.fillRect(x, 58 + i % 3 * 15, 42, 90);
        for (let j = 0; j < 5; j++) { ctx.fillStyle = '#8edcff55'; ctx.fillRect(x + 7 + (j % 2) * 17, 68 + Math.floor(j / 2) * 22, 6, 8); }
      }
      // Track perspective and lane separators.
      ctx.fillStyle = '#22283b'; ctx.beginPath(); ctx.moveTo(w * .39, horizon); ctx.lineTo(w * .61, horizon); ctx.lineTo(w * .96, h); ctx.lineTo(w * .04, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a4b2ff77'; ctx.lineWidth = 3;
      for (let laneLine = 1; laneLine < 3; laneLine++) { ctx.beginPath(); ctx.moveTo(w * (.39 + laneLine * .073), horizon); ctx.lineTo(w * laneLine / 3, h); ctx.stroke(); }
      scenery.forEach(item => {
        const z = (item.z + elapsed * .12) % 1, y = horizon + z * (h - horizon), sideX = item.side ? w * (.62 + z * .34) : w * (.38 - z * .34);
        ctx.fillStyle = `hsla(${item.hue},65%,55%,${.3 + z * .6})`; ctx.fillRect(sideX, y - item.height * z, 12 + z * 40, item.height * z);
      });
      const laneX = n => w * (.5 + (n - 1) * (.13 + .22 * .75));
      const sorted = obstacles.filter(o => o.z < 1.15).sort((a,b) => a.z - b.z);
      sorted.forEach(o => {
        const z = o.z, y = horizon + z * (h - horizon), size = 10 + z * 105, x = laneX(o.lane) - size / 2;
        if (o.kind === 'barrier') {
          ctx.fillStyle = '#ff5977'; ctx.shadowColor = '#ff5977'; ctx.shadowBlur = z * 18;
          ctx.beginPath(); ctx.roundRect(x, y - size * .72, size, size * .72, 7); ctx.fill(); ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffe4a8'; ctx.fillRect(x + size * .15, y - size * .5, size * .7, size * .09);
        } else {
          ctx.fillStyle = '#55d7df'; ctx.shadowColor = '#55d7df'; ctx.shadowBlur = z * 18;
          ctx.fillRect(x - size * .12, y - size * .68, size * 1.24, size * .2); ctx.fillRect(x, y - size * .48, size * .16, size * .48); ctx.fillRect(x + size * .84, y - size * .48, size * .16, size * .48); ctx.shadowBlur = 0;
        }
      });
      pickups.filter(p => !p.got && p.z < 1).forEach(p => {
        const y = horizon + p.z * (h - horizon) - 25 * p.z, x = laneX(p.lane), r = 3 + p.z * 13;
        ctx.fillStyle = '#ffd75f'; ctx.shadowColor = '#ffd75f'; ctx.shadowBlur = 15 * p.z;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      });
      const playerY = h - 75 - Math.max(0, jump) * 105;
      const playerX = laneX(laneVisual), playerScale = slide > 0 ? .65 : 1;
      ctx.save(); ctx.translate(playerX, playerY); ctx.scale(playerScale, slide > 0 ? .58 : 1);
      ctx.fillStyle = '#11131d88'; ctx.beginPath(); ctx.ellipse(0, 22, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#80e9ff'; ctx.shadowColor = '#55d7ff'; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.roundRect(-17, -45, 34, 55, 12); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#f6f7ff'; ctx.beginPath(); ctx.arc(0, -51, 15, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (over) {
        ctx.fillStyle = '#060913b9'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.font = 'bold 42px system-ui'; ctx.fillText('RUN OVER', w / 2, h / 2 - 15); ctx.font = '20px system-ui';
        ctx.fillText(`Distance ${Math.floor(distance)}m · ${coins} coins`, w / 2, h / 2 + 25); ctx.fillText('Tap Restart to run again', w / 2, h / 2 + 56);
      }
    }
    function frame(now) {
      const dt = Math.min(.04, (now - last) / 1000 || 0); last = now;
      if (!over) {
        elapsed += dt; distance += dt * (10 + Math.min(9, elapsed * .12));
        laneVisual += (lane - laneVisual) * Math.min(1, dt * 13);
        jump = Math.max(0, jump - dt); slide = Math.max(0, slide - dt);
        spawnClock += dt;
        if (spawnClock > Math.max(.62, 1.2 - elapsed * .006)) { spawnClock = 0; spawn(); }
        const speed = .48 + Math.min(.32, elapsed * .004);
        obstacles.forEach(o => {
          o.z += speed * dt;
          if (!o.hit && o.z > .88 && o.z < 1.04 && o.lane === lane) {
            const escaped = o.kind === 'barrier' ? jump > .17 : slide > .12;
            if (!escaped) { o.hit = true; hearts--; lifeEl.textContent = `Hearts: ${'♥ '.repeat(Math.max(0,hearts))}${'♡ '.repeat(3-Math.max(0,hearts))}`; if (hearts <= 0) over = true; }
          }
        });
        pickups.forEach(p => { p.z += speed * dt; if (!p.got && p.z > .84 && p.z < 1 && p.lane === lane) { p.got = true; coins++; coinEl.textContent = `Coins: ${coins}`; } });
        obstacles = obstacles.filter(o => o.z < 1.18); pickups = pickups.filter(p => !p.got && p.z < 1.12);
        scoreEl.textContent = `Distance: ${Math.floor(distance)}m`;
      }
      draw(now); raf = requestAnimationFrame(frame);
    }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    ui.canvas.addEventListener('pointerdown', pointerdown); ui.canvas.addEventListener('pointerup', pointerup);
    ui.restart.addEventListener('click', reset); reset();
    dispose = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); ui.canvas.removeEventListener('pointerdown', pointerdown); ui.canvas.removeEventListener('pointerup', pointerup); };
  }

  function startHorror() {
    const ui = shell('WASD or arrow keys to sneak · Find all 3 keys · Reach the green exit · Touch controls work on phones.');
    const ctx = ui.canvas.getContext('2d'); ui.canvas.width = 720; ui.canvas.height = 528;
    const keysEl = make('span', '', 'Keys: 0 / 3');
    const alertEl = make('span', '', 'The house is quiet…');
    ui.hud.append(keysEl, alertEl);
    const dpad = make('div', 'horror-dpad');
    [['',''],['▲','up'],['',''],['◀','left'],['▼','down'],['▶','right']].forEach(([label, dir]) => {
      const button = make('button', '', label); if (dir) { button.type = 'button'; button.addEventListener('pointerdown', event => { event.preventDefault(); held.add(dir); }); button.addEventListener('pointerup', () => held.delete(dir)); button.addEventListener('pointerleave', () => held.delete(dir)); }
      dpad.append(button);
    });
    content.insertBefore(dpad, ui.help);
    const map = [
      '############',
      '#....#.....#',
      '#....#.....#',
      '#..........#',
      '###.##.##..#',
      '#..........#',
      '#..##.##...#',
      '#..........#',
      '#.....#....#',
      '#.....#....#',
      '############'
    ];
    const tile = 44, start = { x: 1.5, y: 1.5 };
    const wall = (x, y) => {
      const col = Math.floor(x), row = Math.floor(y);
      return row < 0 || row >= map.length || col < 0 || col >= map[row].length || map[row][col] === '#';
    };
    let raf = 0, last = 0, player, monster, keys, exit, collected, over, win, alertTimer, chaseClock;
    const held = new Set();
    function reset() {
      cancelAnimationFrame(raf); player = { x: 1.5, y: 1.5 }; monster = { x: 9.5, y: 1.5 };
      keys = [{x:4.5,y:2.5},{x:8.5,y:6.5},{x:2.5,y:8.5}]; exit = {x:10.5,y:9.5};
      collected = 0; over = false; win = false; alertTimer = 0; chaseClock = 0; last = performance.now();
      keysEl.textContent = 'Keys: 0 / 3'; alertEl.textContent = 'The house is quiet…'; raf = requestAnimationFrame(frame);
    }
    function keydown(event) {
      const mapKeys = {w:'up',ArrowUp:'up',s:'down',ArrowDown:'down',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
      const dir = mapKeys[event.key]; if (dir) { event.preventDefault(); held.add(dir); }
    }
    function keyup(event) {
      const mapKeys = {w:'up',ArrowUp:'up',s:'down',ArrowDown:'down',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
      if (mapKeys[event.key]) held.delete(mapKeys[event.key]);
    }
    function moveEntity(entity, dx, dy) {
      if (!wall(entity.x + dx + Math.sign(dx) * .18, entity.y)) entity.x += dx;
      if (!wall(entity.x, entity.y + dy + Math.sign(dy) * .18)) entity.y += dy;
    }
    function draw() {
      ctx.fillStyle = '#11131a'; ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
      for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
        const px = x * tile, py = y * tile;
        if (map[y][x] === '#') { ctx.fillStyle = '#353340'; ctx.fillRect(px, py, tile, tile); ctx.fillStyle = '#484653'; ctx.fillRect(px + 2, py + 2, tile - 4, 5); }
        else { ctx.fillStyle = (x + y) % 2 ? '#262631' : '#292934'; ctx.fillRect(px, py, tile, tile); ctx.strokeStyle = '#ffffff08'; ctx.strokeRect(px, py, tile, tile); }
      }
      // Keys and exit.
      keys.forEach(k => { if (k.got) return; ctx.fillStyle = '#ffd36e'; ctx.shadowColor = '#ffc34c'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(k.x * tile, k.y * tile, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(k.x * tile + 3, k.y * tile - 2, 13, 4); ctx.shadowBlur = 0; });
      ctx.fillStyle = collected === 3 ? '#5ee4a4' : '#5a4951'; ctx.fillRect(exit.x * tile - 13, exit.y * tile - 18, 26, 36); ctx.fillStyle = '#f1d88b'; ctx.beginPath(); ctx.arc(exit.x * tile + 6, exit.y * tile, 2, 0, Math.PI * 2); ctx.fill();
      // Monster stays dim until nearby or it has noticed the player.
      const dist = Math.hypot(monster.x - player.x, monster.y - player.y);
      ctx.globalAlpha = dist < 5 || alertTimer > 0 ? 1 : .24;
      ctx.fillStyle = '#d84f62'; ctx.shadowColor = '#e74460'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(monster.x * tile, monster.y * tile, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.fillRect(monster.x * tile - 5, monster.y * tile - 3, 3, 3); ctx.fillRect(monster.x * tile + 3, monster.y * tile - 3, 3, 3); ctx.globalAlpha = 1;
      ctx.fillStyle = '#83ddff'; ctx.shadowColor = '#5ccfff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(player.x * tile, player.y * tile, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      // Flashlight visibility falloff around the player.
      const light = ctx.createRadialGradient(player.x * tile, player.y * tile, 22, player.x * tile, player.y * tile, 230);
      light.addColorStop(0, '#0000'); light.addColorStop(.58, '#05060a22'); light.addColorStop(1, '#05060ae8');
      ctx.fillStyle = light; ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
      if (over) {
        ctx.fillStyle = '#05060acb'; ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height); ctx.fillStyle = win ? '#73eeb2' : '#ff7188';
        ctx.textAlign = 'center'; ctx.font = 'bold 34px system-ui'; ctx.fillText(win ? 'YOU ESCAPED' : 'CAUGHT IN THE DARK', ui.canvas.width / 2, ui.canvas.height / 2 - 8);
        ctx.fillStyle = '#fff'; ctx.font = '18px system-ui'; ctx.fillText('Press Restart to play again', ui.canvas.width / 2, ui.canvas.height / 2 + 28);
      }
    }
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
      if (!over) {
        const speed = 2.35 * dt;
        const dx = ((held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)) * speed;
        const dy = ((held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0)) * speed;
        moveEntity(player, dx, dy);
        keys.forEach(k => { if (!k.got && Math.hypot(k.x - player.x, k.y - player.y) < .42) { k.got = true; collected++; keysEl.textContent = `Keys: ${collected} / 3`; alertEl.textContent = 'You found a key. Something heard that…'; alertTimer = 2; } });
        if (collected === 3 && Math.hypot(exit.x - player.x, exit.y - player.y) < .58) { over = true; win = true; }
        if (alertTimer > 0) alertTimer -= dt;
        chaseClock += dt;
        const distance = Math.hypot(player.x - monster.x, player.y - monster.y);
        if (distance < 6) {
          alertEl.textContent = distance < 2.2 ? 'It is right behind you!' : 'It heard you moving…';
          const chaseSpeed = (distance < 2.5 ? 1.65 : .92) * dt;
          const vx = (player.x - monster.x) / Math.max(distance, .01) * chaseSpeed;
          const vy = (player.y - monster.y) / Math.max(distance, .01) * chaseSpeed;
          moveEntity(monster, vx, vy);
        } else if (chaseClock > 2.8) {
          chaseClock = 0;
          const wander = [[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)];
          moveEntity(monster, wander[0] * .7, wander[1] * .7);
          alertEl.textContent = 'The house is quiet…';
        }
        if (Math.hypot(player.x - monster.x, player.y - monster.y) < .36) over = true;
      }
      draw(); raf = requestAnimationFrame(frame);
    }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    ui.restart.addEventListener('click', reset); reset();
    dispose = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); held.clear(); };
  }

  function render() {
    grid.replaceChildren();
    const query = (document.querySelector('#game-search')?.value || '').trim().toLowerCase();
    games.filter(game => `${game.name} ${game.description}`.toLowerCase().includes(query)).forEach(game => {
      const card = make('button', 'game-card built-in-game arcade-card'); card.type = 'button';
      card.setAttribute('aria-label', `Play ${game.name}`);
      card.append(make('span', 'game-emoji', game.icon), make('span', 'game-arrow', '▶'), make('strong', '', game.name), make('small', '', 'Original · Play right here'));
      card.addEventListener('click', () => open(game)); grid.append(card);
    });
    const count = document.querySelector('#game-count'); if (count) count.textContent = `${games.length} original games`;
    const description = document.querySelector('#games .section-heading .muted');
    if (description) description.textContent = 'Original, playable games made for this site—no game downloads or external redirects.';
  }
  document.querySelector('#game-search')?.addEventListener('input', render);
  render();
})();
