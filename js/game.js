// Harbor Merge — game logic, rendering and input.
'use strict';

(() => {
  const CELLS = BOARD_COLS * BOARD_ROWS;
  const LEGACY_SAVE_KEY = 'harbor-merge-v1';
  const PROFILES_KEY = 'harbor-merge-profiles';
  const saveKey = (id) => `harbor-merge-save:${id}`;
  const $ = (id) => document.getElementById(id);

  let S;            // persistent game state
  let sel = -1;     // selected board index
  let popAt = -1;   // board index to animate on next render
  let P;            // player profiles: { list: [{id,name,avatar,color}], current }

  // ---------------------------------------------------------------- helpers
  const now = () => Date.now();
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const fmtTime = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n);
  const itemInfo = (c, l) => CHAINS[c].items[l - 1];
  const chainMax = (c) => CHAINS[c].items.length;
  const entIcon = (e) => e.k === 'p' ? PRODUCERS[e.p].icon : itemInfo(e.c, e.l)[0];
  const entName = (e) => e.k === 'p' ? PRODUCERS[e.p].name : itemInfo(e.c, e.l)[1];
  const prodLevel = (e) => PRODUCER_LEVELS[e.l - 1];
  const toolStr = (tools) => Object.entries(tools).map(([t, n]) => `${TOOLS[t].icon}${n}`).join(' ');
  const activeChains = () => Object.keys(CHAINS).filter((c) => S.level >= CHAINS[c].unlock && !S.retired.includes(c));

  const newItem = (c, l) => ({ k: 'i', c, l });
  const newProducer = (p, l = 1) => ({ k: 'p', p, l });

  function nearestEmpty(origin) {
    const oc = origin % BOARD_COLS, or = Math.floor(origin / BOARD_COLS);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < CELLS; i++) {
      if (S.board[i]) continue;
      const d = Math.hypot(i % BOARD_COLS - oc, Math.floor(i / BOARD_COLS) - or) + Math.random() * 0.01;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  const CENTER = Math.floor(CELLS / 2);

  // Put an entity on the board near `origin`; overflow goes to storage.
  function give(ent, origin = CENTER) {
    const i = nearestEmpty(origin);
    if (i >= 0) { S.board[i] = ent; popAt = i; discover(ent); return 'board'; }
    S.storage.push(ent);
    discover(ent);
    return 'storage';
  }

  function discover(ent) {
    if (ent.k !== 'i') return;
    if ((S.discovered[ent.c] || 0) < ent.l) {
      const first = S.discovered[ent.c] !== undefined;
      S.discovered[ent.c] = ent.l;
      if (first && ent.l > 1) toast(`New item: ${itemInfo(ent.c, ent.l).join(' ')}!`);
    }
  }

  // ---------------------------------------------------------------- state
  function newGame() {
    S = {
      v: 1,
      board: Array(CELLS).fill(null),
      storage: [], storageSlots: START.storage, storageBought: 0,
      coins: START.coins, gems: START.gems, xp: 0, level: 1,
      tools: { hammer: 0, screw: 0, brick: 0 },
      orders: [], town: {}, areasDone: [], retired: [], discovered: { shell: 1, food: 2 },
      deal: { day: '', bought: false },
    };
    ensureState(S);
    S.board[CENTER - 1] = newProducer('pail');
    S.board[CENTER + 1] = newProducer('basket');
    [['shell', 1], ['shell', 1], ['food', 1], ['food', 2]].forEach(([c, l]) => give(newItem(c, l), CENTER + BOARD_COLS * 2));
    popAt = -1;
    for (let k = 0; k < 3; k++) S.orders.push(makeOrder());
    sel = -1;
  }

  // Fill in fields added after a save was first created.
  function ensureState(s) {
    s.stats = Object.assign({ orders: 0, merges: 0, made: 0, coinsEarned: 0, bestProducer: 1, started: now() }, s.stats);
    s.goalsClaimed = s.goalsClaimed || [];
    return s;
  }

  function earn(n) { S.coins += n; S.stats.coinsEarned += n; }

  function save() {
    if (!P || !S) return;
    S.stats.lastPlayed = now();
    try { localStorage.setItem(saveKey(P.current), JSON.stringify(S)); } catch (_) { /* storage unavailable */ }
  }
  function loadSave(id) {
    try {
      const s = JSON.parse(localStorage.getItem(saveKey(id)));
      if (s && s.v === 1 && Array.isArray(s.board) && s.board.length === CELLS) return ensureState(s);
    } catch (_) { /* ignore corrupt save */ }
    return null;
  }

  // ---------------------------------------------------------------- players
  const newId = () => 'p' + now().toString(36) + rand(1000);
  const currentPlayer = () => P.list.find((p) => p.id === P.current);

  function saveProfiles() {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(P)); } catch (_) { /* storage unavailable */ }
  }
  function loadProfiles() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILES_KEY));
      if (p && Array.isArray(p.list) && p.list.length) return addNewDefaults(p);
    } catch (_) { /* ignore */ }
    const list = DEFAULT_PLAYERS.map((d, i) => ({ id: newId() + i, ...d }));
    // Carry a pre-profiles save over to the first player.
    try {
      const old = localStorage.getItem(LEGACY_SAVE_KEY);
      if (old) { localStorage.setItem(saveKey(list[0].id), old); localStorage.removeItem(LEGACY_SAVE_KEY); }
    } catch (_) { /* ignore */ }
    return { list, current: list[0].id, seeded: DEFAULT_PLAYERS.map((d) => d.name) };
  }

  // Default players added in later versions (e.g. Livy) appear for existing installs,
  // but a default player someone deleted is not brought back.
  function addNewDefaults(p) {
    // Installs from before this field existed were seeded with Me + Shelly.
    if (!p.seeded) p.seeded = ['Me', 'Shelly'];
    DEFAULT_PLAYERS.forEach((d, i) => {
      if (p.seeded.includes(d.name)) return;
      if (!p.list.some((x) => x.name === d.name)) p.list.push({ id: newId() + i, ...d });
      p.seeded.push(d.name);
    });
    return p;
  }

  function applyTheme() {
    const p = currentPlayer();
    const root = document.documentElement.style;
    root.setProperty('--accent', p.color);
    root.setProperty('--accent-ink', '#ffffff');
    root.setProperty('--player', p.color);
    $('whoAv').textContent = p.avatar;
    $('whoName').textContent = p.name;
    document.title = `Harbor Merge · ${p.name}`;
  }

  function playAs(id) {
    if (S) save();
    P.current = id;
    saveProfiles();
    S = loadSave(id);
    sel = -1;
    const fresh = !S;
    if (fresh) { newGame(); save(); }
    applyTheme();
    $('who').classList.remove('show');
    switchView('board');
    const p = currentPlayer();
    if (fresh) {
      showModal(p.avatar, `Welcome, ${esc(p.name)}!`,
        'Storms wrecked the seaside town. Tap producers to make items, merge them, fill orders and rebuild!',
        [{ label: "Let's go" }]);
    } else toast(`Playing as ${p.avatar} ${p.name}`);
  }

  // Summary of any player's save, for the picker and the comparison table.
  function summary(id) {
    const s = id === P.current ? S : loadSave(id);
    if (!s) return null;
    return {
      level: s.level,
      town: Math.round((sumValues(s.town) / TOTAL_STAGES) * 100),
      found: sumValues(s.discovered),
      orders: s.stats.orders,
      merges: s.stats.merges,
      goals: s.goalsClaimed.length,
      lastPlayed: s.stats.lastPlayed,
    };
  }

  function showPicker() {
    if (S) save();
    $('whoList').innerHTML = P.list.map((p) => {
      const sm = summary(p.id);
      const line = sm ? `Lv ${sm.level} · Town ${sm.town}%` : 'New game';
      return `<div class="who-card${p.id === P.current ? ' last' : ''}" style="--pc:${p.color}" data-play="${p.id}">
        <div class="av">${p.avatar}</div><b>${esc(p.name)}</b><small>${line}</small>
        <button class="ghost edit" data-edit="${p.id}" title="Edit player">✏️</button></div>`;
    }).join('') + `<div class="who-card add" data-addplayer><div class="av">＋</div><b>Add player</b></div>`;
    $('who').classList.add('show');
  }

  function editPlayer(id) {
    const isNew = !id;
    const p = isNew
      ? { id: newId(), name: '', avatar: AVATARS[P.list.length % AVATARS.length], color: PLAYER_COLORS[P.list.length % PLAYER_COLORS.length] }
      : { ...P.list.find((x) => x.id === id) };
    const draw = () => {
      $('dialog').innerHTML = `<div class="big edit-av" style="--pc:${p.color}">${p.avatar}</div>
        <h2>${isNew ? 'New player' : 'Edit player'}</h2>
        <input id="pname" maxlength="16" placeholder="Name" value="${esc(p.name)}">
        <div class="choices">${AVATARS.map((a) => `<button class="ghost${a === p.avatar ? ' on' : ''}" data-av="${a}">${a}</button>`).join('')}</div>
        <div class="choices">${PLAYER_COLORS.map((c) => `<button class="swatch${c === p.color ? ' on' : ''}" style="background:${c}" data-color="${c}" title="${c}"></button>`).join('')}</div>
        <div class="row">
          ${!isNew && P.list.length > 1 ? '<button class="ghost danger" data-pact="delete">Delete</button>' : ''}
          <button class="ghost" data-pact="cancel">Cancel</button>
          <button data-pact="save">Save</button>
        </div>`;
    };
    draw();
    $('modal').classList.add('show');
    $('dialog').onclick = (ev) => {
      const t = ev.target.closest('button');
      if (!t) return;
      p.name = $('pname').value.trim();
      if (t.dataset.av) { p.avatar = t.dataset.av; draw(); return; }
      if (t.dataset.color) { p.color = t.dataset.color; draw(); return; }
      const act = t.dataset.pact;
      if (act === 'cancel') { $('modal').classList.remove('show'); return; }
      if (act === 'delete') {
        showModal('⚠️', `Delete ${esc(p.name)}?`, 'Their whole game will be erased.', [
          { label: 'Delete', fn: () => {
            P.list = P.list.filter((x) => x.id !== p.id);
            try { localStorage.removeItem(saveKey(p.id)); } catch (_) { /* ignore */ }
            if (P.current === p.id) { P.current = P.list[0].id; S = null; }
            saveProfiles();
            showPicker();
          } },
          { label: 'Cancel', cls: 'ghost', fn: () => editPlayer(p.id) },
        ]);
        return;
      }
      if (act === 'save') {
        if (!p.name) { $('pname').focus(); toast('Enter a name'); return; }
        if (isNew) P.list.push(p);
        else Object.assign(P.list.find((x) => x.id === p.id), p);
        saveProfiles();
        $('modal').classList.remove('show');
        if (S && p.id === P.current) applyTheme();
        showPicker();
      }
    };
  }

  // ---------------------------------------------------------------- goals
  const goalProgress = (g) => Math.min(g.target, g.get(S));
  const goalReady = (g) => !S.goalsClaimed.includes(g.id) && g.get(S) >= g.target;
  const rewardStr = (r) => [r.gems ? `${r.gems}💎` : '', r.tools ? toolStr(r.tools) : ''].filter(Boolean).join(' ');

  function claimGoal(id) {
    const g = GOALS.find((x) => x.id === id);
    if (!g || !goalReady(g)) return;
    S.goalsClaimed.push(id);
    if (g.reward.gems) S.gems += g.reward.gems;
    for (const [t, n] of Object.entries(g.reward.tools || {})) S.tools[t] += n;
    toast(`Goal complete! +${rewardStr(g.reward)}`);
    commit();
  }

  // ---------------------------------------------------------------- orders
  function makeOrder() {
    const chains = activeChains();
    const maxL = Math.min(6, 3 + Math.floor((S.level - 1) / 2));
    const minL = Math.max(2, maxL - 2);
    const count = Math.random() < Math.min(0.5, 0.1 * S.level) ? 2 : 1;
    const reqs = [];
    for (let i = 0; i < count; i++) {
      const c = pick(chains);
      reqs.push({ c, l: Math.min(chainMax(c), minL + rand(maxL - minL + 1)) });
    }
    let coins = reqs.reduce((sum, r) => sum + 4 * 2 ** (r.l - 1), 0);
    const xp = reqs.reduce((sum, r) => sum + r.l * 2, 0);
    let tool = null;
    if (Math.random() < 0.3) {
      const total = Object.values(TOOLS).reduce((a, t) => a + t.weight, 0);
      let roll = rand(total);
      tool = Object.keys(TOOLS).find((t) => (roll -= TOOLS[t].weight) < 0);
      coins = Math.ceil(coins / 2);
    }
    return { reqs, coins, xp, tool, toolN: tool ? (reqs.some((r) => r.l >= 4) ? 2 : 1) : 0 };
  }

  // Greedily match each requirement to a distinct board cell. Returns array (index or -1 per req).
  function matchOrder(order) {
    const used = new Set();
    return order.reqs.map((r) => {
      const i = S.board.findIndex((e, idx) => e && !used.has(idx) && e.k === 'i' && !e.b && e.c === r.c && e.l === r.l);
      if (i >= 0) used.add(i);
      return i;
    });
  }

  function deliver(oi) {
    const o = S.orders[oi];
    const cells = matchOrder(o);
    if (cells.some((i) => i < 0)) return;
    cells.forEach((i) => { S.board[i] = null; });
    earn(o.coins);
    S.stats.orders++;
    let msg = `${characterFor(oi).name}: Thanks! +${o.coins}🪙`;
    if (o.tool) { S.tools[o.tool] += o.toolN; msg += ` +${o.toolN}${TOOLS[o.tool].icon}`; }
    S.orders[oi] = makeOrder();
    toast(msg);
    addXp(o.xp);
    commit();
  }

  // ---------------------------------------------------------------- progression
  function addXp(n) {
    S.xp += n;
    while (S.xp >= xpForLevel(S.level)) {
      S.xp -= xpForLevel(S.level);
      S.level++;
      levelUp();
    }
  }

  function levelUp() {
    S.gems += 5;
    const notes = ['+5 💎'];
    for (const [c, ch] of Object.entries(CHAINS)) {
      if (ch.unlock === S.level) {
        const p = Object.keys(PRODUCERS).find((k) => PRODUCERS[k].makes === c);
        give(newProducer(p));
        notes.push(`New producer: ${PRODUCERS[p].icon} ${PRODUCERS[p].name}`);
      }
      if (ch.retireAt === S.level) notes.push(retireChain(c));
    }
    S.orders = S.orders.map((o) => o.reqs.every((r) => activeChains().includes(r.c)) ? o : makeOrder());
    showModal('🎉', `Level ${S.level}!`, notes.join('<br>'));
  }

  // Older chains are retired off the board into the permanent collection.
  function retireChain(c) {
    let refund = 0;
    const isOfChain = (e) => e && ((e.k === 'i' && e.c === c) || (e.k === 'p' && PRODUCERS[e.p].makes === c));
    const value = (e) => e.k === 'p' ? 20 * e.l : 2 * e.l;
    S.board = S.board.map((e) => { if (isOfChain(e)) { refund += value(e); return null; } return e; });
    S.storage = S.storage.filter((e) => { if (isOfChain(e)) { refund += value(e); return false; } return true; });
    S.retired.push(c);
    earn(refund);
    if (sel >= 0 && !S.board[sel]) sel = -1;
    return `${CHAINS[c].name} retired to your collection (+${refund}🪙)`;
  }

  // ---------------------------------------------------------------- board actions
  function tapProducer(i) {
    const e = S.board[i];
    const lv = prodLevel(e);
    const target = nearestEmpty(i);
    if (target < 0) { toast('Board is full — merge, sell or store items'); return; }
    const item = newItem(PRODUCERS[e.p].makes, Math.random() < lv.bonus ? 2 : 1);
    S.board[target] = item;
    S.stats.made++;
    discover(item);
    popAt = target;
    commit();
  }

  function canMerge(a, b) {
    if (!a || !b || a.b || b.b || a.k !== b.k || a.l !== b.l) return false;
    if (a.k === 'i') return a.c === b.c && a.l < chainMax(a.c);
    return a.p === b.p && a.l < PRODUCER_LEVELS.length;
  }

  function moveOrMerge(from, to) {
    if (from === to) return;
    const a = S.board[from], b = S.board[to];
    if (b && b.b) return;
    if (canMerge(a, b)) {
      S.board[from] = null;
      S.stats.merges++;
      if (a.k === 'i') {
        const merged = newItem(a.c, a.l + 1);
        S.board[to] = merged;
        discover(merged);
        if (Math.random() < BUBBLE_CHANCE) {
          const bi = nearestEmpty(to);
          if (bi >= 0) S.board[bi] = { ...newItem(a.c, a.l + 1), b: now() + BUBBLE_LIFETIME_SEC * 1000 };
        }
      } else {
        S.board[to] = newProducer(a.p, a.l + 1);
        S.stats.bestProducer = Math.max(S.stats.bestProducer, a.l + 1);
        toast(`${PRODUCERS[a.p].name} upgraded to level ${a.l + 1}!`);
      }
      popAt = to;
    } else {
      S.board[from] = b;
      S.board[to] = a;
    }
    sel = to;
    commit();
  }

  function sell(i) {
    const e = S.board[i];
    if (!e || e.k !== 'i' || e.b) return;
    S.board[i] = null;
    earn(e.l);
    sel = -1;
    toast(`Sold ${entName(e)} for ${e.l}🪙`);
    commit();
  }

  function store(i) {
    const e = S.board[i];
    if (!e || e.b) return;
    if (S.storage.length >= S.storageSlots) { toast('Storage is full'); return; }
    S.storage.push(e);
    S.board[i] = null;
    sel = -1;
    commit();
  }

  function unstore(si) {
    const target = nearestEmpty(CENTER);
    if (target < 0) { toast('Board is full'); return; }
    S.board[target] = S.storage.splice(si, 1)[0];
    popAt = target;
    sel = target;
    commit();
  }

  const slotCost = () => 5 * 2 ** S.storageBought;
  function buySlot() {
    const cost = slotCost();
    if (S.gems < cost) { toast(`Need ${cost}💎`); return; }
    S.gems -= cost;
    S.storageSlots++;
    S.storageBought++;
    toast('Storage slot added');
    commit();
  }

  function popBubble(i) {
    const e = S.board[i];
    if (!e || !e.b) return;
    if (S.gems < e.l) { toast(`Need ${e.l}💎`); return; }
    S.gems -= e.l;
    delete e.b;
    popAt = i;
    commit();
  }

  // ---------------------------------------------------------------- town
  const stageOf = (b) => S.town[b.id] || 0;
  const areaDone = (a) => a.buildings.every((b) => stageOf(b) >= b.stages.length);
  const areaUnlocked = (idx) => idx === 0 || S.areasDone.includes(AREAS[idx - 1].id);
  const affordable = (cost) => S.coins >= cost.coins && Object.entries(cost.tools).every(([t, n]) => S.tools[t] >= n);

  function upgrade(areaIdx, bIdx) {
    const area = AREAS[areaIdx], b = area.buildings[bIdx];
    const cost = b.stages[stageOf(b)];
    if (!cost || !affordable(cost)) return;
    S.coins -= cost.coins;
    for (const [t, n] of Object.entries(cost.tools)) S.tools[t] -= n;
    S.town[b.id] = stageOf(b) + 1;
    addXp(5);
    toast(`${b.icon} ${b.name} upgraded!`);
    if (areaDone(area) && !S.areasDone.includes(area.id)) {
      S.areasDone.push(area.id);
      S.gems += area.reward.gems;
      const p = area.reward.producer;
      give(newProducer(p));
      const next = AREAS[areaIdx + 1];
      showModal('🏝️', `${area.name} restored!`,
        `+${area.reward.gems}💎 and a ${PRODUCERS[p].icon} ${PRODUCERS[p].name}.` +
        (next ? `<br>The fog lifts over <b>${next.name}</b>.` : '<br>You rebuilt the whole town!'));
    }
    commit();
  }

  // ---------------------------------------------------------------- shop
  function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  function dailyDeal() {
    const day = today();
    if (S.deal.day !== day) S.deal = { day, bought: false };
    let h = 0;
    for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const chains = activeChains();
    return { c: chains[h % chains.length], l: 3 + (h % 2), cost: 3 + (h % 2) * 2 };
  }
  function buyDeal() {
    const d = dailyDeal();
    if (S.deal.bought || S.gems < d.cost) return;
    S.gems -= d.cost;
    S.deal.bought = true;
    const where = give(newItem(d.c, d.l));
    toast(`${itemInfo(d.c, d.l)[0]} added to your ${where}`);
    commit();
  }
  function buyProducer(p) {
    const cost = PRODUCERS[p].price;
    if (S.coins < cost) return;
    S.coins -= cost;
    const where = give(newProducer(p));
    toast(`${PRODUCERS[p].icon} added to your ${where}`);
    commit();
  }

  // ---------------------------------------------------------------- time
  function tick() {
    const t = now();
    let changed = false;
    S.board.forEach((e, i) => {
      if (!e) return;
      if (e.b && t >= e.b) { S.board[i] = null; if (sel === i) sel = -1; changed = true; }
    });
    if (drag && drag.started) return;
    if (changed) { save(); render(); return; }
    // Light refresh: only timers. Avoids rebuilding buttons under the player's finger.
    renderHud();
    const timers = S.board.some((e) => e && e.b);
    if (timers && document.querySelector('.view.active').id === 'view-board') { renderBoard(); renderInfo(); }
  }

  // ---------------------------------------------------------------- rendering
  function commit() {
    if (sel >= 0 && !S.board[sel]) sel = -1;
    save();
    render();
  }

  function render() {
    renderHud();
    const view = document.querySelector('.view.active').id;
    if (view === 'view-board') { renderOrders(); renderBoard(); renderInfo(); renderStorage(); }
    if (view === 'view-town') renderTown();
    if (view === 'view-progress') renderProgress();
    if (view === 'view-shop') renderShop();
    popAt = -1;
  }

  function renderHud() {
    $('level').textContent = S.level;
    $('xpfill').style.width = `${Math.min(100, (S.xp / xpForLevel(S.level)) * 100)}%`;
    $('coins').textContent = fmt(S.coins);
    $('gems').textContent = fmt(S.gems);
    $('goalDot').classList.toggle('show', GOALS.some(goalReady));
  }

  function renderOrders() {
    $('orders').innerHTML = S.orders.map((o, oi) => {
      const m = matchOrder(o);
      const ready = m.every((i) => i >= 0);
      const reqs = o.reqs.map((r, ri) => {
        const [icon, name] = itemInfo(r.c, r.l);
        return `<span class="req${m[ri] >= 0 ? ' have' : ''}" title="${name} (Lv ${r.l})"><i>${r.l}</i>${icon}</span>`;
      }).join('');
      const reward = `🪙${o.coins} ⭐${o.xp}` + (o.tool ? ` ${TOOLS[o.tool].icon}${o.toolN}` : '');
      const ch = characterFor(oi);
      return `<div class="order${o.tool ? ' tool' : ''}">
        <div class="who" title="${ch.name} the ${ch.kind}"><span class="face">${ch.svg}</span>${ch.name}</div>
        <div class="reqs">${reqs}</div>
        <div class="reward">${reward}</div>
        <button data-deliver="${oi}" ${ready ? '' : 'disabled'}>Deliver</button>
      </div>`;
    }).join('');
  }

  function entHtml(e, i) {
    let cls = 'ent', extra = '';
    if (e.k === 'p') {
      cls += ' producer';
    }
    if (e.b) { cls += ' bubble'; extra = `<span class="bt">${Math.ceil((e.b - now()) / 1000)}s</span>`; }
    if (i === popAt) cls += ' pop';
    return `<div class="${cls}" title="${entName(e)}">${entIcon(e)}<span class="lv">${e.l}</span>${extra}</div>`;
  }

  function renderBoard() {
    const selEnt = S.board[sel];
    $('board').innerHTML = S.board.map((e, i) => {
      let cls = 'cell';
      if (i === sel) cls += ' selected';
      else if (selEnt && canMerge(selEnt, e)) cls += ' match';
      return `<div class="${cls}" data-cell="${i}">${e ? entHtml(e, i) : ''}</div>`;
    }).join('');
  }

  function renderInfo() {
    const e = S.board[sel];
    const el = $('info');
    if (!e) {
      el.innerHTML = `<div class="icon info-i">i</div><div class="txt"><small>Tap a glowing producer to make items. Drag two matching items together to merge. Deliver orders to earn coins & tools.</small></div>`;
      return;
    }
    let sub = '', acts = '';
    if (e.k === 'p') {
      sub = `Makes ${CHAINS[PRODUCERS[e.p].makes].name} · ${Math.round(prodLevel(e).bonus * 100)}% chance of Lv 2`;
      if (e.l < PRODUCER_LEVELS.length) sub += ' · merge two to upgrade';
      acts += `<button class="ghost" data-act="store">📦</button>`;
    } else if (e.b) {
      sub = `Bubble · vanishes in ${Math.ceil((e.b - now()) / 1000)}s`;
      acts = `<button class="gem" data-act="pop">Pop · ${e.l}💎</button>`;
    } else {
      sub = e.l < chainMax(e.c) ? `Merge two → ${itemInfo(e.c, e.l + 1).join(' ')}` : 'Max level!';
      acts = `<button class="ghost" data-act="sell">Sell ${e.l}🪙</button><button class="ghost" data-act="store">📦</button>`;
    }
    el.innerHTML = `<div class="icon">${entIcon(e)}</div>
      <div class="txt"><b>${entName(e)} · Lv ${e.l}</b><small>${sub}</small></div>
      <div class="acts">${acts}</div>`;
  }

  function renderStorage() {
    let html = '';
    for (let i = 0; i < Math.max(S.storageSlots, S.storage.length); i++) {
      const e = S.storage[i];
      html += e
        ? `<div class="slot" data-slot="${i}" title="${entName(e)}">${entIcon(e)}<span class="lv">${e.l}</span></div>`
        : `<div class="slot" data-slot="${i}"></div>`;
    }
    html += `<div class="slot buy" data-buyslot title="Buy a storage slot">+${slotCost()}💎</div>`;
    $('storage').innerHTML = html;
  }

  function renderTown() {
    $('tools').innerHTML = Object.entries(TOOLS)
      .map(([t, d]) => `<div class="pill" title="${d.name}"><span>${d.icon}</span><b>${S.tools[t]}</b></div>`).join('');
    $('town').innerHTML = AREAS.map((a, ai) => {
      if (!areaUnlocked(ai)) {
        return `<div class="area fog"><div class="big">🌫️</div><b>${a.name}</b><br><small>Restore ${AREAS[ai - 1].name} to clear the fog</small></div>`;
      }
      const blds = a.buildings.map((b, bi) => {
        const st = stageOf(b), max = b.stages.length;
        const stars = '★'.repeat(st) + '☆'.repeat(max - st);
        let right = '<span class="done-tag">Complete</span>', cost = '';
        if (st < max) {
          const c = b.stages[st];
          const coinCls = S.coins >= c.coins ? '' : 'short';
          const tools = Object.entries(c.tools)
            .map(([t, n]) => `<span class="${S.tools[t] >= n ? '' : 'short'}">${TOOLS[t].icon}${n}</span>`).join(' ');
          cost = `<div class="cost"><span class="${coinCls}">🪙${c.coins}</span> ${tools}</div>`;
          right = `<button data-up="${ai}:${bi}" ${affordable(c) ? '' : 'disabled'}>${st === 0 ? 'Repair' : 'Upgrade'}</button>`;
        }
        return `<div class="bld"><div class="icon${st === 0 ? ' ruin' : ''}">${b.icon}</div>
          <div class="txt"><b>${b.name}</b> <span class="stars">${stars}</span>${cost}</div>${right}</div>`;
      }).join('');
      const done = areaDone(a);
      return `<div class="area"><h3>${a.name}${done ? '<span class="done-tag">✓ Restored</span>' : ''}</h3>
        <p class="sub">${a.blurb} Reward: ${a.reward.gems}💎 + ${PRODUCERS[a.reward.producer].icon}</p>${blds}</div>`;
    }).join('');
  }

  function renderShop() {
    const d = dailyDeal();
    const [dIcon, dName] = itemInfo(d.c, d.l);
    let html = `<div class="shop"><h3>Daily deal</h3>
      <div class="shop-item"><div class="icon">${dIcon}</div><div class="txt"><b>${dName} · Lv ${d.l}</b><small>One per day</small></div>
        <button class="gem" data-shop="deal" ${S.deal.bought || S.gems < d.cost ? 'disabled' : ''}>${S.deal.bought ? 'Sold out' : d.cost + '💎'}</button></div>
      <h3>Space</h3>
      <div class="shop-item"><div class="icon">📦</div><div class="txt"><b>Storage slot</b><small>You have ${S.storageSlots}; price doubles each time</small></div>
        <button class="gem" data-shop="slot" ${S.gems < slotCost() ? 'disabled' : ''}>${slotCost()}💎</button></div>
      <h3>Producers</h3>`;
    for (const [p, pd] of Object.entries(PRODUCERS)) {
      const c = CHAINS[pd.makes];
      if (S.retired.includes(pd.makes)) continue;
      const locked = S.level < c.unlock;
      html += `<div class="shop-item"><div class="icon">${pd.icon}</div><div class="txt"><b>${pd.name}</b>
        <small>${locked ? `Unlocks at level ${c.unlock}` : `Makes ${c.name} · merge two to upgrade`}</small></div>
        <button data-shop="prod:${p}" ${locked || S.coins < pd.price ? 'disabled' : ''}>${pd.price}🪙</button></div>`;
    }
    html += `<p style="text-align:center"><button class="ghost" data-shop="reset">Start ${esc(currentPlayer().name)}'s game over</button></p></div>`;
    $('shop').innerHTML = html;
  }

  const bar = (val, max) => `<div class="pbar"><div style="width:${max ? Math.min(100, (val / max) * 100) : 0}%"></div></div>`;
  const ago = (t) => {
    if (!t) return '—';
    const m = Math.floor((now() - t) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  };

  function renderProgress() {
    const p = currentPlayer();
    const stages = sumValues(S.town), found = sumValues(S.discovered);
    let html = `<div class="card me" style="--pc:${p.color}">
        <div class="av">${p.avatar}</div>
        <div class="txt"><b>${esc(p.name)}</b><small>Level ${S.level} · ${S.xp}/${xpForLevel(S.level)} XP · playing since ${new Date(S.stats.started).toLocaleDateString()}</small></div>
        <button class="ghost" data-switch>Switch</button>
      </div>
      <div class="card">
        <div class="meter"><span>🏘️ Town rebuilt</span><b>${stages}/${TOTAL_STAGES}</b></div>${bar(stages, TOTAL_STAGES)}
        <div class="meter"><span>🔍 Items discovered</span><b>${found}/${TOTAL_ITEMS}</b></div>${bar(found, TOTAL_ITEMS)}
        <div class="meter"><span>🏅 Goals complete</span><b>${S.goalsClaimed.length}/${GOALS.length}</b></div>${bar(S.goalsClaimed.length, GOALS.length)}
      </div>
      <h3>Goals</h3><div class="card">`;
    html += GOALS.map((g) => {
      const done = S.goalsClaimed.includes(g.id), ready = goalReady(g), cur = goalProgress(g);
      const right = done ? '<span class="done-tag">✓</span>'
        : ready ? `<button data-claim="${g.id}">Claim</button>`
        : `<small>${cur}/${g.target}</small>`;
      return `<div class="goal${done ? ' done' : ''}"><div class="icon">${g.icon}</div>
        <div class="txt"><b>${g.text}</b><small>Reward: ${rewardStr(g.reward)}</small>${done ? '' : bar(cur, g.target)}</div>${right}</div>`;
    }).join('');
    html += `</div><h3>Stats</h3><div class="stats-grid">
        <div class="card"><b>${fmt(S.stats.orders)}</b><small>Orders delivered</small></div>
        <div class="card"><b>${fmt(S.stats.merges)}</b><small>Merges</small></div>
        <div class="card"><b>${fmt(S.stats.made)}</b><small>Items made</small></div>
        <div class="card"><b>${fmt(S.stats.coinsEarned)}</b><small>Coins earned</small></div>
      </div>
      <h3>Players</h3><div class="card"><table class="cmp"><thead><tr><th></th><th>Lv</th><th>Town</th><th>Items</th><th>Orders</th><th>Played</th></tr></thead><tbody>`;
    html += P.list.map((pl) => {
      const sm = summary(pl.id);
      return `<tr class="${pl.id === P.current ? 'cur' : ''}" style="--pc:${pl.color}">
        <td><span class="dotav">${pl.avatar}</span> ${esc(pl.name)}</td>
        ${sm ? `<td>${sm.level}</td><td>${sm.town}%</td><td>${sm.found}</td><td>${sm.orders}</td><td>${ago(sm.lastPlayed)}</td>`
             : '<td colspan="5"><small>Not started</small></td>'}</tr>`;
    }).join('');
    html += `</tbody></table></div><h3>Collection</h3><div class="card">`;
    html += Object.entries(CHAINS).map(([c, ch]) => {
      const got = S.discovered[c] || 0;
      const icons = ch.items.map((it, i) => i < got ? `<span title="${it[1]}">${it[0]}</span>` : '<span>❔</span>').join('');
      return `<div class="chain-row"><b>${ch.name}</b>${S.retired.includes(c) ? ' <small>(retired)</small>' : ''}<div class="retired">${icons}</div></div>`;
    }).join('');
    html += `</div>`;
    $('progress').innerHTML = html;
  }

  // ---------------------------------------------------------------- UI chrome
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function showModal(icon, title, html, buttons = [{ label: 'OK' }]) {
    $('dialog').innerHTML = `<div class="big">${icon}</div><h2>${title}</h2><p>${html}</p>
      <div style="display:flex;gap:8px;justify-content:center">${buttons.map((b, i) =>
        `<button class="${b.cls || ''}" data-modal="${i}">${b.label}</button>`).join('')}</div>`;
    $('modal').classList.add('show');
    $('dialog').onclick = (ev) => {
      const btn = ev.target.closest('[data-modal]');
      if (!btn) return;
      $('modal').classList.remove('show');
      const fn = buttons[+btn.dataset.modal].fn;
      if (fn) fn();
    };
  }

  // ---------------------------------------------------------------- input
  let drag = null;

  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = el.closest('[data-cell]');
    if (cell) return { type: 'cell', i: +cell.dataset.cell, el: cell };
    const slot = el.closest('.storage, [data-slot]');
    if (slot) return { type: 'storage', el: slot.closest('[data-slot]') || slot };
    return null;
  }
  const clearHover = () => document.querySelectorAll('.hover').forEach((e) => e.classList.remove('hover'));

  function tapCell(i) {
    const e = S.board[i];
    if (!e) { sel = -1; render(); return; }
    sel = i;
    if (e.k === 'p' && !e.b) tapProducer(i);
    else render();
  }

  $('board').addEventListener('pointerdown', (ev) => {
    const cell = ev.target.closest('[data-cell]');
    if (!cell) return;
    ev.preventDefault();
    drag = { from: +cell.dataset.cell, x: ev.clientX, y: ev.clientY, id: ev.pointerId, started: false };
  });

  window.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (!drag.started) {
      const e = S.board[drag.from];
      if (!e || e.b || Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 8) return;
      drag.started = true;
      sel = drag.from;
      renderBoard();
      renderInfo();
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'drag-ghost';
      drag.ghost.textContent = entIcon(e);
      document.body.appendChild(drag.ghost);
      const src = $('board').children[drag.from].firstElementChild;
      if (src) src.classList.add('dragging');
    }
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = ev.clientY + 'px';
    clearHover();
    const t = dropTarget(ev.clientX, ev.clientY);
    if (t) t.el.classList.add('hover');
  });

  function endPointer(ev, cancelled) {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.started) { if (!cancelled) tapCell(d.from); return; }
    d.ghost.remove();
    clearHover();
    const t = cancelled ? null : dropTarget(ev.clientX, ev.clientY);
    if (t && t.type === 'cell') moveOrMerge(d.from, t.i);
    else if (t && t.type === 'storage') store(d.from);
    else render();
  }
  window.addEventListener('pointerup', (ev) => endPointer(ev, false));
  window.addEventListener('pointercancel', (ev) => endPointer(ev, true));

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-edit],[data-play],[data-addplayer],[data-switch],[data-claim],[data-deliver],[data-act],[data-slot],[data-buyslot],[data-up],[data-shop],.tabs button,#whoChip');
    if (!t) return;
    if (t.dataset.edit) editPlayer(t.dataset.edit);
    else if (t.dataset.play) playAs(t.dataset.play);
    else if (t.dataset.addplayer !== undefined) editPlayer(null);
    else if (t.dataset.switch !== undefined || t.id === 'whoChip') showPicker();
    else if (t.dataset.claim) claimGoal(t.dataset.claim);
    else if (t.dataset.deliver !== undefined) deliver(+t.dataset.deliver);
    else if (t.dataset.act) {
      ({ sell, store, pop: popBubble })[t.dataset.act](sel);
    } else if (t.dataset.slot !== undefined) { if (S.storage[+t.dataset.slot]) unstore(+t.dataset.slot); }
    else if (t.dataset.buyslot !== undefined) buySlot();
    else if (t.dataset.up) { const [a, b] = t.dataset.up.split(':').map(Number); upgrade(a, b); }
    else if (t.dataset.shop) {
      const s = t.dataset.shop;
      if (s === 'deal') buyDeal();
      else if (s === 'slot') buySlot();
      else if (s.startsWith('prod:')) buyProducer(s.slice(5));
      else if (s === 'reset') showModal('⚠️', 'Start over?', `${esc(currentPlayer().name)}'s town and board will be lost. Other players are not affected.`, [
        { label: 'Reset', cls: '', fn: () => { newGame(); save(); switchView('board'); } },
        { label: 'Cancel', cls: 'ghost' },
      ]);
    } else if (t.dataset.view) switchView(t.dataset.view);
  });

  function switchView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    render();
  }

  // ---------------------------------------------------------------- boot
  // Always start on "Who's playing?" so nobody plays on someone else's save.
  P = loadProfiles();
  saveProfiles();
  showPicker();
  setInterval(() => { if (S) tick(); }, 1000);
  window.__game = { get state() { return S; } }; // debugging handle
})();
