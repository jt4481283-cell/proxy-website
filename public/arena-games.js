(() => {
  const grid = document.querySelector('#game-grid');
  if (!grid) return;

  const styles = document.createElement('style');
  styles.textContent = `
    .arena-game-card{width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer}
    .arena-modal[hidden]{display:none}
    .arena-modal{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:1rem;background:rgba(5,8,16,.88);backdrop-filter:blur(8px)}
    .arena-dialog{width:min(920px,100%);max-height:94vh;overflow:auto;padding:1.2rem;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:#171b29;color:#f5f6ff;box-shadow:0 24px 80px #0009}
    .arena-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}.arena-head h2{margin:.2rem 0}.arena-head p,.arena-help{color:#b4bad0}
    .arena-close,.arena-button{border:1px solid #ffffff24;border-radius:10px;background:#282e40;color:inherit;padding:.65rem .9rem;font:inherit;cursor:pointer}
    .arena-stage{position:relative;margin:1rem auto 0;max-width:800px}.arena-canvas{display:block;width:100%;height:auto;max-height:62vh;object-fit:contain;background:#101522;border-radius:12px;cursor:crosshair;touch-action:none}
    .arena-hud{display:flex;justify-content:space-between;gap:.7rem;flex-wrap:wrap;padding:.7rem .2rem;color:#d4d8e6;font-weight:600}.arena-crosshair{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:none;color:white;text-shadow:0 1px 5px #000}.arena-crosshair:before,.arena-crosshair:after{content:'';position:absolute;background:currentColor}.arena-crosshair:before{width:2px;height:18px;left:8px}.arena-crosshair:after{height:2px;width:18px;top:8px}
    .arena-help{font-size:.9rem;line-height:1.5;text-align:center}.arena-actions{display:flex;justify-content:center;gap:.6rem;flex-wrap:wrap}
    @media(max-width:600px){.arena-dialog{padding:.8rem}.arena-canvas{max-height:50vh}.arena-hud{font-size:.9rem}}
  `;
  document.head.append(styles);

  const modes = [
    { name: 'Neon FPS Arena', icon: '🎯', mode: 'arena', description: 'First-person aim, move, and clear enemy waves.' },
    { name: 'FPS Target Range', icon: '🔫', mode: 'range', description: 'Practice your aim against moving targets.' },
    { name: 'Survival FPS', icon: '🛡️', mode: 'survival', description: 'Hold the arena against incoming waves.' }
  ];
  const modal = document.createElement('section');
  modal.className = 'arena-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'arena-title');
  modal.innerHTML = '<div class="arena-dialog"><header class="arena-head"><div><p class="eyebrow">ORIGINAL BROWSER GAME</p><h2 id="arena-title"></h2></div><button class="arena-close" type="button">Close</button></header><div class="arena-content"></div></div>';
  document.body.append(modal);
  const content = modal.querySelector('.arena-content');
  let dispose = () => {};
  const node = (tag, cls, text) => { const item = document.createElement(tag); if (cls) item.className = cls; if (text) item.textContent = text; return item; };

  function close() {
    dispose(); dispose = () => {};
    modal.hidden = true;
    content.replaceChildren();
  }
  modal.querySelector('.arena-close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });

  function open(game) {
    close();
    modal.hidden = false;
    modal.querySelector('#arena-title').textContent = game.name;
    startGame(game);
    modal.querySelector('.arena-close').focus();
  }

  function startGame(game) {
    const stage = node('div', 'arena-stage');
    const canvas = node('canvas', 'arena-canvas');
    canvas.width = 800; canvas.height = 450;
    canvas.setAttribute('aria-label', 'First-person neon arena. Use WASD to move, mouse to aim, and click to shoot.');
    const crosshair = node('span', 'arena-crosshair');
    const hud = node('div', 'arena-hud');
    const stats = node('span', '', 'Score: 0');
    const health = node('span', '', 'Health: 100');
    const wave = node('span', '', 'Targets: 0');
    hud.append(stats, health, wave);
    stage.append(canvas, crosshair);
    const help = node('p', 'arena-help', 'WASD: move · Mouse: aim · Click or Space: shoot · Esc: close. Click the arena to capture the mouse; Esc releases it.');
    const actions = node('div', 'arena-actions');
    const restart = node('button', 'arena-button', 'Restart'); restart.type = 'button';
    actions.append(restart);
    content.replaceChildren(hud, stage, help, actions);

    const ctx = canvas.getContext('2d');
    const map = [
      '1111111111','1000000001','1011001101','1000000001','1001100001',
      '1000000101','1011000001','1000000001','1000000001','1111111111'
    ];
    const player = { x: 2.5, y: 2.5, angle: 0, health: 100, score: 0 };
    const fov = Math.PI / 3;
    const held = new Set();
    let targets = [], depth = new Float32Array(canvas.width), raf = 0, last = performance.now();
    let fireReady = true, hitFlash = 0, gameOver = false, waveNumber = 1, elapsed = 0;
    let mouseLocked = false;

    const isWall = (x, y) => {
      const mx = Math.floor(x), my = Math.floor(y);
      return my < 0 || my >= map.length || mx < 0 || mx >= map[0].length || map[my][mx] === '1';
    };
    function spawnTargets(count) {
      targets = [];
      let tries = 0;
      while (targets.length < count && tries++ < 500) {
        const x = 1.5 + Math.random() * 7, y = 1.5 + Math.random() * 7;
        if (isWall(x, y) || Math.hypot(x - player.x, y - player.y) < 3) continue;
        if (targets.some(t => Math.hypot(t.x - x, t.y - y) < 1.2)) continue;
        targets.push({ x, y, alive: true, phase: Math.random() * 6, speed: .4 + Math.random() * .5 });
      }
      wave.textContent = game.mode === 'range' ? `Targets: ${targets.filter(t => t.alive).length}` : `Wave: ${waveNumber} · ${targets.filter(t => t.alive).length} left`;
    }
    function restartGame() {
      player.x = 2.5; player.y = 2.5; player.angle = 0; player.health = 100; player.score = 0;
      waveNumber = 1; elapsed = 0; gameOver = false; held.clear();
      spawnTargets(game.mode === 'range' ? 8 : 3);
      stats.textContent = 'Score: 0'; health.textContent = 'Health: 100';
      last = performance.now();
    }
    function shoot() {
      if (!fireReady || gameOver) return;
      fireReady = false;
      setTimeout(() => { fireReady = true; }, game.mode === 'range' ? 220 : 300);
      hitFlash = .09;
      let best = null, bestDistance = Infinity;
      for (const target of targets) {
        if (!target.alive) continue;
        const dx = target.x - player.x, dy = target.y - player.y;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const difference = Math.atan2(Math.sin(angle - player.angle), Math.cos(angle - player.angle));
        const screenX = Math.floor((.5 + difference / fov) * canvas.width);
        if (Math.abs(difference) < .105 && distance < bestDistance && screenX >= 0 && screenX < canvas.width && distance < depth[screenX] + .25) {
          best = target; bestDistance = distance;
        }
      }
      if (best) {
        best.alive = false; player.score += game.mode === 'range' ? 100 : Math.max(50, Math.round(160 - bestDistance * 10));
        stats.textContent = `Score: ${player.score}`;
        if (game.mode === 'range') {
          wave.textContent = `Targets: ${targets.filter(t => t.alive).length}`;
          if (targets.every(t => !t.alive)) { wave.textContent = 'Range cleared!'; gameOver = true; }
        } else if (targets.every(t => !t.alive)) {
          waveNumber++;
          spawnTargets(Math.min(3 + waveNumber, 10));
        }
      }
    }

    function drawWorld() {
      const sky = ctx.createLinearGradient(0, 0, 0, canvas.height / 2);
      sky.addColorStop(0, '#101629'); sky.addColorStop(1, '#283052');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
      const floor = ctx.createLinearGradient(0, canvas.height / 2, 0, canvas.height);
      floor.addColorStop(0, '#292b43'); floor.addColorStop(1, '#11131d');
      ctx.fillStyle = floor; ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
      for (let x = 0; x < canvas.width; x += 2) {
        const rayAngle = player.angle + (x / canvas.width - .5) * fov;
        const rayX = Math.cos(rayAngle), rayY = Math.sin(rayAngle);
        let mapX = Math.floor(player.x), mapY = Math.floor(player.y);
        const deltaX = Math.abs(1 / (rayX || .00001)), deltaY = Math.abs(1 / (rayY || .00001));
        const stepX = rayX < 0 ? -1 : 1, stepY = rayY < 0 ? -1 : 1;
        let sideX = (rayX < 0 ? player.x - mapX : mapX + 1 - player.x) * deltaX;
        let sideY = (rayY < 0 ? player.y - mapY : mapY + 1 - player.y) * deltaY;
        let side = 0, hit = false, steps = 0;
        while (!hit && steps++ < 30) {
          if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
          else { sideY += deltaY; mapY += stepY; side = 1; }
          if (mapY < 0 || mapY >= map.length || mapX < 0 || mapX >= map[0].length || map[mapY][mapX] === '1') hit = true;
        }
        let distance = Math.max(.1, side === 0 ? sideX - deltaX : sideY - deltaY);
        distance *= Math.cos(rayAngle - player.angle);
        depth[x] = distance;
        const wallHeight = Math.min(canvas.height * 2, canvas.height / distance);
        const top = (canvas.height - wallHeight) / 2;
        const shade = Math.max(25, 190 - distance * 27 - (side ? 28 : 0));
        ctx.fillStyle = `rgb(${Math.floor(shade * .55)},${Math.floor(shade * .62)},${Math.floor(shade)})`;
        ctx.fillRect(x, top, 2, wallHeight);
        if (wallHeight > 15) {
          ctx.fillStyle = `rgba(130,150,255,${Math.max(0, .12 - distance * .01)})`;
          ctx.fillRect(x, top, 2, wallHeight);
        }
      }
    }

    function drawTargets(now) {
      const visible = targets.filter(t => t.alive).map(t => {
        const dx = t.x - player.x, dy = t.y - player.y;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const relative = Math.atan2(Math.sin(angle - player.angle), Math.cos(angle - player.angle));
        return { t, distance, relative };
      }).filter(o => Math.abs(o.relative) < fov * .7).sort((a, b) => b.distance - a.distance);
      visible.forEach(({ t, distance, relative }) => {
        const screenX = (0.5 + relative / fov) * canvas.width;
        const rayIndex = Math.max(0, Math.min(canvas.width - 1, Math.floor(screenX)));
        if (distance > depth[rayIndex]) return;
        const size = Math.min(150, canvas.height / distance * .42);
        const sway = game.mode === 'range' ? Math.sin(now / 500 + t.phase) * .32 : 0;
        const centerX = screenX + sway * size;
        const centerY = canvas.height / 2 + size * .12;
        ctx.save();
        ctx.globalAlpha = Math.min(1, 1.3 / distance);
        ctx.fillStyle = game.mode === 'range' ? '#ffcc61' : (game.mode === 'survival' ? '#ff587c' : '#74e7ff');
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(centerX, centerY - size * .52, size * .19, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(centerX - size * .2, centerY - size * .32, size * .4, size * .65, size * .14); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(centerX - size * .065, centerY - size * .55, size * .025, 0, Math.PI * 2); ctx.arc(centerX + size * .065, centerY - size * .55, size * .025, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    }

    function draw(now) {
      drawWorld(); drawTargets(now);
      if (hitFlash > 0) {
        hitFlash -= .016; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 20, 0, Math.PI * 2); ctx.stroke();
      }
      if (!mouseLocked) {
        ctx.fillStyle = '#ffffffa8'; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Click the arena to capture mouse and aim', canvas.width / 2, canvas.height - 18);
      }
      if (gameOver) {
        ctx.fillStyle = '#060913b9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 34px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(game.mode === 'range' ? 'RANGE CLEARED!' : 'GAME OVER', canvas.width / 2, canvas.height / 2);
        ctx.font = '18px system-ui'; ctx.fillText(`Final score: ${player.score} · Press Restart`, canvas.width / 2, canvas.height / 2 + 38);
      }
    }

    function tick(now) {
      const dt = Math.min(.04, (now - last) / 1000); last = now;
      if (!gameOver) {
        elapsed += dt;
        const speed = 2.7 * dt;
        let forward = (held.has('w') || held.has('arrowup') ? 1 : 0) - (held.has('s') || held.has('arrowdown') ? 1 : 0);
        let strafe = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
        const length = Math.hypot(forward, strafe) || 1; forward /= length; strafe /= length;
        const moveX = (Math.cos(player.angle) * forward - Math.sin(player.angle) * strafe) * speed;
        const moveY = (Math.sin(player.angle) * forward + Math.cos(player.angle) * strafe) * speed;
        if (!isWall(player.x + moveX + Math.sign(moveX) * .18, player.y)) player.x += moveX;
        if (!isWall(player.x, player.y + moveY + Math.sign(moveY) * .18)) player.y += moveY;
        if (game.mode === 'survival') {
          targets.forEach(target => {
            if (!target.alive) return;
            const dx = player.x - target.x, dy = player.y - target.y, dist = Math.hypot(dx, dy);
            if (dist < .65) {
              player.health = Math.max(0, player.health - 20 * dt);
              health.textContent = `Health: ${Math.ceil(player.health)}`;
              if (player.health <= 0) gameOver = true;
            } else if (dist > .5) {
              const step = Math.min(.75 * dt, dist - .55), mx = dx / dist * step, my = dy / dist * step;
              if (!isWall(target.x + mx, target.y)) target.x += mx;
              if (!isWall(target.x, target.y + my)) target.y += my;
            }
          });
        } else if (game.mode === 'arena') {
          targets.forEach(target => {
            if (!target.alive) return;
            target.phase += dt * target.speed;
            const dx = player.x - target.x, dy = player.y - target.y, dist = Math.hypot(dx, dy);
            if (dist < .75) {
              player.health = Math.max(0, player.health - 12 * dt);
              health.textContent = `Health: ${Math.ceil(player.health)}`;
              if (player.health <= 0) gameOver = true;
            } else if (dist > .65) {
              const step = Math.min(.45 * dt, dist - .7), mx = dx / dist * step, my = dy / dist * step;
              if (!isWall(target.x + mx, target.y)) target.x += mx;
              if (!isWall(target.x, target.y + my)) target.y += my;
            }
          });
        }
      }
      draw(now); raf = requestAnimationFrame(tick);
    }

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
      held.add(key);
      if (key === ' ') shoot();
    }
    function onKeyUp(event) { held.delete(event.key.toLowerCase()); }
    function onMouseMove(event) {
      if (document.pointerLockElement === canvas) { mouseLocked = true; player.angle += event.movementX * .0025; }
    }
    function onCanvasClick() {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) canvas.requestPointerLock();
      else shoot();
    }
    function onPointerLock() { mouseLocked = document.pointerLockElement === canvas; }
    function onTouch(event) {
      if (event.pointerType !== 'touch') return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      player.angle += (x - .5) * .4;
      shoot();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLock);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('pointerdown', onTouch);
    restart.addEventListener('click', restartGame);
    restartGame();
    raf = requestAnimationFrame(tick);
    dispose = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLock);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('pointerdown', onTouch);
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    };
  }

  function render() {
    grid.querySelectorAll('.arena-game-card').forEach(card => card.remove());
    const query = (document.querySelector('#game-search')?.value || '').trim().toLowerCase();
    modes.filter(game => `${game.name} ${game.description}`.toLowerCase().includes(query)).forEach(game => {
      const card = node('button', 'game-card built-in-game arena-game-card');
      card.type = 'button'; card.setAttribute('aria-label', `Play ${game.name}`);
      card.append(node('span', 'game-emoji', game.icon), node('span', 'game-arrow', '▶'), node('strong', '', game.name), node('small', '', 'Play here · Original FPS'));
      card.addEventListener('click', () => open(game)); grid.append(card);
    });
  }
  document.querySelector('#game-search')?.addEventListener('input', () => requestAnimationFrame(render));
  render();
})();
