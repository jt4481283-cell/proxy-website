(() => {
  const grid = document.querySelector('#game-grid');
  if (!grid) return;

  const gameList = [
    { name: 'Cookie Clicker', icon: '🍪', type: 'cookie' },
    { name: 'Snake', icon: '🐍', type: 'snake' },
    { name: '2048', icon: '🔢', type: '2048' },
    { name: 'Tic-Tac-Toe', icon: '⭕', type: 'tic' },
    { name: 'Memory Match', icon: '🧠', type: 'memory' }
  ];
  let activeGame = null;

  const modal = document.createElement('section');
  modal.className = 'game-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'game-modal-title');
  modal.hidden = true;
  modal.innerHTML = '<div class="game-dialog"><div class="game-dialog-head"><div><p class="eyebrow">PLAYING NOW</p><h2 id="game-modal-title"></h2></div><button class="game-close" type="button" aria-label="Close game">×</button></div><div class="game-stage"></div></div>';
  document.body.append(modal);
  const stage = modal.querySelector('.game-stage');
  const closeButton = modal.querySelector('.game-close');

  function button(label, fn, className = '') {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.className = `game-action ${className}`;
    el.addEventListener('click', fn);
    return el;
  }
  function text(tag, value, className = '') {
    const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el;
  }
  function stopGame() {
    if (activeGame?.timer) clearInterval(activeGame.timer);
    if (activeGame?.keyHandler) window.removeEventListener('keydown', activeGame.keyHandler);
    activeGame = null;
  }
  function openGame(game) {
    stopGame();
    activeGame = { type: game.type };
    modal.querySelector('#game-modal-title').textContent = game.name;
    stage.replaceChildren();
    modal.hidden = false;
    document.body.classList.add('game-open');
    if (game.type === 'cookie') startCookie();
    if (game.type === 'tic') startTic();
    if (game.type === '2048') start2048();
    if (game.type === 'snake') startSnake();
    if (game.type === 'memory') startMemory();
    closeButton.focus();
  }
  function closeGame() {
    stopGame(); modal.hidden = true; document.body.classList.remove('game-open');
  }
  closeButton.addEventListener('click', closeGame);
  modal.addEventListener('click', event => { if (event.target === modal) closeGame(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeGame(); });

  function startCookie() {
    let cookies = 0, power = 1, cost = 10;
    const count = text('h3', 'Cookies: 0', 'game-score');
    const hint = text('p', 'Click the cookie. Buy upgrades to earn more per click.', 'game-hint');
    const cookie = button('🍪', () => { cookies += power; update(); }, 'cookie-big');
    const upgrade = button('Upgrade (+1) — 10 cookies', () => {
      if (cookies < cost) { hint.textContent = `You need ${cost - cookies} more cookies for an upgrade.`; return; }
      cookies -= cost; power++; cost = Math.ceil(cost * 1.7); update();
    });
    const row = document.createElement('div'); row.className = 'game-actions'; row.append(upgrade, button('Reset', () => { cookies = 0; power = 1; cost = 10; update(); }));
    function update() { count.textContent = `Cookies: ${cookies.toLocaleString()} · per click: ${power}`; upgrade.textContent = `Upgrade (+1) — ${cost} cookies`; hint.textContent = 'Nice! Keep clicking or save for an upgrade.'; }
    stage.append(count, cookie, hint, row);
  }

  function startTic() {
    let board = Array(9).fill(''), turn = 'X', over = false;
    const status = text('p', 'Your turn: X', 'game-hint');
    const boardEl = document.createElement('div'); boardEl.className = 'tic-board';
    const cells = board.map((_, i) => button('', () => play(i), 'tic-cell'));
    function play(i) {
      if (board[i] || over) return;
      board[i] = turn; cells[i].textContent = turn; cells[i].classList.add(turn === 'X' ? 'mark-x' : 'mark-o');
      const winner = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].find(line => line.every(index => board[index] === turn));
      if (winner) { status.textContent = `${turn} wins!`; over = true; }
      else if (board.every(Boolean)) { status.textContent = 'It’s a draw!'; over = true; }
      else { turn = turn === 'X' ? 'O' : 'X'; status.textContent = `Your turn: ${turn}`; }
    }
    cells.forEach(cell => boardEl.append(cell));
    stage.append(status, boardEl, button('New game', () => startTic()));
  }

  function start2048() {
    let board = Array(16).fill(0), score = 0, over = false;
    const scoreEl = text('p', 'Score: 0 · Use arrow keys or swipe', 'game-hint');
    const boardEl = document.createElement('div'); boardEl.className = 'grid-2048';
    const cells = Array.from({ length: 16 }, () => text('div', '', 'tile-2048'));
    function spawn() { const empty = board.map((v, i) => v ? -1 : i).filter(i => i >= 0); if (empty.length) board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < .9 ? 2 : 4; }
    function draw() { board.forEach((v, i) => { cells[i].textContent = v || ''; cells[i].dataset.value = v || ''; }); scoreEl.textContent = `Score: ${score} · Use arrow keys or swipe`; }
    function move(direction) {
      if (over) return;
      const before = board.join(',');
      for (let line = 0; line < 4; line++) {
        let ids = Array.from({ length: 4 }, (_, n) => direction === 'left' ? line*4+n : direction === 'right' ? line*4+3-n : direction === 'up' ? n*4+line : (3-n)*4+line);
        let vals = ids.map(i => board[i]).filter(Boolean);
        for (let n = 0; n < vals.length - 1; n++) if (vals[n] === vals[n+1]) { vals[n] *= 2; score += vals[n]; vals.splice(n+1, 1); }
        vals = [...vals, ...Array(4-vals.length).fill(0)]; ids.forEach((id, n) => board[id] = vals[n]);
      }
      if (board.join(',') !== before) spawn();
      draw();
      if (!board.includes(0) && !board.some((v, i) => (i%4<3 && v===board[i+1]) || (i<12 && v===board[i+4]))) { over = true; scoreEl.textContent += ' · Game over — start a new game'; }
    }
    activeGame.keyHandler = event => { const dirs = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' }; if (dirs[event.key]) { event.preventDefault(); move(dirs[event.key]); } };
    window.addEventListener('keydown', activeGame.keyHandler);
    let touchX, touchY;
    boardEl.addEventListener('touchstart', event => { touchX = event.changedTouches[0].clientX; touchY = event.changedTouches[0].clientY; }, { passive: true });
    boardEl.addEventListener('touchend', event => { const dx=event.changedTouches[0].clientX-touchX, dy=event.changedTouches[0].clientY-touchY; if (Math.max(Math.abs(dx),Math.abs(dy))>25) move(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up')); }, { passive: true });
    cells.forEach(cell => boardEl.append(cell));
    const reset = button('New game', () => start2048());
    stage.append(scoreEl, boardEl, reset); spawn(); spawn(); draw();
  }

  function startSnake() {
    const canvas = document.createElement('canvas'); canvas.width=360; canvas.height=360; canvas.className='snake-canvas'; canvas.setAttribute('aria-label','Snake game board');
    const ctx = canvas.getContext('2d');
    const score = text('p', 'Score: 0 · Use arrow keys or the buttons', 'game-hint');
    let snake=[{x:8,y:8},{x:7,y:8},{x:6,y:8}], dir={x:1,y:0}, next={x:1,y:0}, food={x:14,y:8}, points=0, dead=false;
    function placeFood(){do{food={x:Math.floor(Math.random()*18),y:Math.floor(Math.random()*18)}}while(snake.some(p=>p.x===food.x&&p.y===food.y));}
    function draw(){ctx.fillStyle='#111522';ctx.fillRect(0,0,360,360);ctx.fillStyle='#ff829f';ctx.fillRect(food.x*20+3,food.y*20+3,14,14);snake.forEach((p,i)=>{ctx.fillStyle=i?'#7dcaad':'#a994ff';ctx.fillRect(p.x*20+2,p.y*20+2,16,16)});if(dead){ctx.fillStyle='#ffffff';ctx.font='bold 22px system-ui';ctx.textAlign='center';ctx.fillText('Game over!',180,185);}}
    function tick(){if(dead)return;dir=next;const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(head.x<0||head.y<0||head.x>=18||head.y>=18||snake.some(p=>p.x===head.x&&p.y===head.y)){dead=true;draw();score.textContent=`Game over · Score: ${points}`;return;}snake.unshift(head);if(head.x===food.x&&head.y===food.y){points++;score.textContent=`Score: ${points} · Use arrow keys or buttons`;placeFood();}else snake.pop();draw();}
    activeGame.keyHandler=event=>{const map={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};const d=map[event.key];if(d){event.preventDefault();if(d.x!==-dir.x||d.y!==-dir.y)next=d;}};
    window.addEventListener('keydown',activeGame.keyHandler);
    const controls=document.createElement('div');controls.className='snake-controls';[['↑',{x:0,y:-1}],['←',{x:-1,y:0}],['↓',{x:0,y:1}],['→',{x:1,y:0}]].forEach(([label,d])=>controls.append(button(label,()=>{if(d.x!==-dir.x||d.y!==-dir.y)next=d;})));
    stage.append(score,canvas,controls,button('Restart',()=>startSnake()));draw();activeGame.timer=setInterval(tick,130);
  }

  function startMemory() {
    const faces=['🍒','⭐','🐸','🚀','🍕','🌈','🎲','🐼'];
    let cards=[...faces,...faces].sort(()=>Math.random()-.5), chosen=[], matched=new Set(), locked=false, moves=0;
    const status=text('p','Find all matching pairs · Moves: 0','game-hint');const boardEl=document.createElement('div');boardEl.className='memory-board';
    function draw(){boardEl.replaceChildren();cards.forEach((face,i)=>{const shown=matched.has(i)||chosen.includes(i);const card=button(shown?face:'?',()=>reveal(i),'memory-card');if(shown)card.classList.add('revealed');boardEl.append(card);});}
    function reveal(i){if(locked||matched.has(i)||chosen.includes(i))return;chosen.push(i);draw();if(chosen.length===2){moves++;status.textContent=`Moves: ${moves} · Find all matching pairs`;if(cards[chosen[0]]===cards[chosen[1]]){chosen.forEach(n=>matched.add(n));chosen=[];draw();if(matched.size===cards.length)status.textContent=`You won in ${moves} moves!`; }else{locked=true;setTimeout(()=>{chosen=[];locked=false;draw();},700);}}}
    stage.append(status,boardEl,button('New game',()=>startMemory()));draw();
  }

  function renderGames() {
    const query=(document.querySelector('#game-search')?.value||'').trim().toLowerCase();
    grid.replaceChildren();
    gameList.filter(g=>g.name.toLowerCase().includes(query)).forEach(game=>{
      const card=document.createElement('button');card.type='button';card.className='game-card built-in-game';card.setAttribute('aria-label',`Play ${game.name}`);
      const icon=text('span',game.icon,'game-emoji');const arrow=text('span','▶','game-arrow');const title=text('strong',game.name);const tag=text('small','Playable here · Built in');
      card.append(icon,arrow,title,tag);card.addEventListener('click',()=>openGame(game));grid.append(card);
    });
    const count=document.querySelector('#game-count');if(count)count.textContent=`${gameList.length} built-in games`;
    const description=document.querySelector('#games .section-heading .muted');if(description)description.textContent='Pick a game to play it right here—no downloads or redirects.';
  }
  document.querySelector('#game-search')?.addEventListener('input',renderGames);
  renderGames();

  // Search results are displayed in this page; only opening an individual result visits that site.
  const searchForm=document.querySelector('#web-search-form');
  if(searchForm){
    const results=document.createElement('div');results.className='search-results';results.setAttribute('aria-live','polite');searchForm.insertAdjacentElement('afterend',results);
    searchForm.addEventListener('submit',async event=>{
      event.preventDefault();const query=document.querySelector('#web-search-input').value.trim();if(!query)return;
      results.replaceChildren(text('p','Searching DuckDuckGo…','muted'));
      try{
        const response=await fetch(`/api/search?q=${encodeURIComponent(query)}`);const data=await response.json();if(!response.ok)throw new Error(data.error||'Search failed.');
        results.replaceChildren();
        if(!data.results.length){results.append(text('p','No results found. Try different words.','muted'));return;}
        data.results.forEach(result=>{
          const item=document.createElement('article');item.className='search-result';
          const title=document.createElement('a');title.textContent=result.title;title.href=result.url;title.target='_blank';title.rel='noopener noreferrer';
          const url=text('small',new URL(result.url).hostname,'result-domain');const snippet=text('p',result.snippet||'Open this result to view the page.');item.append(title,url,snippet);results.append(item);
        });
      }catch(error){results.replaceChildren(text('p',error.message||'Search is temporarily unavailable.','muted'));}
    });
  }
})();
