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
  // Haptic tap. Android: Vibration API. iPhone has no vibrate API, but toggling a
  // native switch control gives a light tap on recent iOS versions.
  let hapticLabel = null;
  function haptic(pattern = 12) {
    try {
      if (navigator.vibrate) { navigator.vibrate(pattern); return; }
      if (!hapticLabel) {
        hapticLabel = document.createElement('label');
        hapticLabel.setAttribute('aria-hidden', 'true');
        hapticLabel.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        hapticLabel.appendChild(input);
        document.body.appendChild(hapticLabel);
      }
      const taps = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
      for (let i = 0; i < taps; i++) setTimeout(() => hapticLabel.click(), i * 110);
    } catch (_) { /* haptics unavailable */ }
  }

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
    for (let k = 0; k < 3; k++) S.orders.push(makeOrder(k, false));
    sel = -1;
  }

  // Fill in fields added after a save was first created.
  function ensureState(s) {
    s.stats = Object.assign({ orders: 0, merges: 0, made: 0, coinsEarned: 0, bestProducer: 1, started: now() }, s.stats);
    s.goalsClaimed = s.goalsClaimed || [];
    // Bubbles were removed from the game; clear any left in older saves.
    s.board = s.board.map((e) => (e && e.b ? null : e));
    if (s.bait === undefined) s.bait = BAIT_DAILY;
    s.fishLog = s.fishLog || {};
    rollWeek(s);
    return s;
  }

  function earn(n) { S.coins += n; S.stats.coinsEarned += n; }

  function save() {
    if (!P || !S) return;
    S.stats.lastPlayed = now();
    S.updatedAt = now();
    try { localStorage.setItem(saveKey(P.current), JSON.stringify(S)); } catch (_) { /* storage unavailable */ }
    schedulePush();
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

  async function playAs(id) {
    if (S) { save(); flushPush(); }
    // With family sync, fetch this player's latest game first so an old copy
    // on this phone never overwrites newer progress made on another phone.
    if (cloudOn() && family) {
      try {
        const doc = await fsGet(`/saves/${id}`);
        const local = rawSave(id);
        if (doc && (+field(doc, 'updated') || 0) > ((local && local.updatedAt) || 0)) localStorage.setItem(saveKey(id), field(doc, 'data'));
        setSync('ok');
      } catch (_) {
        setSync('error');
        if (!rawSave(id)) { toast('Can’t load this game from the online save right now. Check your connection.'); return; }
      }
    }
    P.current = id;
    saveProfiles();
    S = loadSave(id);
    sel = -1;
    const fresh = !S;
    if (fresh) newGame();
    rollDaily();
    save();
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
    const s = saveOf(id);
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
    if (S) { save(); flushPush(); }
    renderPicker();
    $('who').classList.add('show');
    pullAndRefresh();
  }

  function renderPicker() {
    const rows = raceRows();
    const leader = raceLeader(rows);
    $('whoList').innerHTML = P.list.map((p) => {
      const sm = summary(p.id);
      const pts = rows.find((r) => r.pl.id === p.id).pts;
      const line = sm ? `Lv ${sm.level} · Town ${sm.town}%` : 'New game';
      return `<div class="who-card${p.id === P.current ? ' last' : ''}" style="--pc:${p.color}" data-play="${p.id}">
        ${p.id === leader ? '<span class="crown" title="Leading this week’s family race">👑</span>' : ''}
        <div class="av">${p.avatar}</div><b>${esc(p.name)}</b><small>${line}</small>${sm ? `<small class="pts">⭐ ${pts} this week</small>` : ''}
        <button class="ghost edit" data-edit="${p.id}" title="Edit player">✏️</button></div>`;
    }).join('') + `<div class="who-card add" data-addplayer><div class="av">＋</div><b>Add player</b></div>`;
    $('syncBar').innerHTML = syncBar();
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
            profilesChanged();
            renderPicker();
          } },
          { label: 'Cancel', cls: 'ghost', fn: () => editPlayer(p.id) },
        ]);
        return;
      }
      if (act === 'save') {
        if (!p.name) { $('pname').focus(); toast('Enter a name'); return; }
        if (isNew) P.list.push(p);
        else Object.assign(P.list.find((x) => x.id === p.id), p);
        profilesChanged();
        $('modal').classList.remove('show');
        if (S && p.id === P.current) applyTheme();
        renderPicker();
      }
    };
  }

  // ---------------------------------------------------------------- family cloud sync
  // Every phone in a "family" shares the player list and each player's save through
  // Firestore (REST API, no SDK). Each save carries `updatedAt`; the newest copy wins.
  const FAMILY_KEY = 'harbor-merge-family';
  const cfg = () => window.CLOUD_CONFIG || {};
  const cloudOn = () => !!(cfg().apiKey && cfg().projectId);
  let family = null;
  try { family = localStorage.getItem(FAMILY_KEY); } catch (_) { /* ignore */ }
  const sync = { status: 'idle', at: 0 };
  let pushTimer = null;

  const fsUrl = (path) => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg().projectId)}/databases/(default)/documents/families/${encodeURIComponent(family)}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(cfg().apiKey)}`;
  async function fsGet(path) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(fsUrl(path), { signal: ctl.signal });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  }
  async function fsPut(path, fields, keepalive = false) {
    const body = JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) =>
      [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }])) });
    const r = await fetch(fsUrl(path), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body, keepalive });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  }
  const field = (doc, k) => (doc && doc.fields && doc.fields[k] ? (doc.fields[k].stringValue ?? doc.fields[k].integerValue) : null);
  const rawSave = (id) => { try { return JSON.parse(localStorage.getItem(saveKey(id))); } catch (_) { return null; } };
  const genCode = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () => Array.from({ length: 5 }, () => abc[rand(abc.length)]).join('');
    return `HM-${part()}-${part()}`;
  };

  function setSync(status) {
    sync.status = status;
    if (status === 'ok') sync.at = now();
    document.querySelectorAll('.sync-status').forEach((el) => { el.textContent = syncText(); });
  }
  const syncText = () => (sync.status === 'syncing' ? 'Syncing…'
    : sync.status === 'error' ? 'Offline — will retry'
    : sync.at ? `Synced ${ago(sync.at)}` : 'Not synced yet');

  function profilesChanged() {
    P.updated = now();
    saveProfiles();
    pushProfiles().catch(() => setSync('error'));
  }
  async function pushProfiles() {
    if (!cloudOn() || !family) return;
    await fsPut('', { profiles: JSON.stringify(P.list), updated: P.updated || now() });
  }

  function schedulePush() {
    if (!cloudOn() || !family) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => flushPush(), 2500);
  }
  // Upload the current player's save now. The body is built before any await,
  // so it always belongs to the player who was active when this was called.
  function flushPush(keepalive = false) {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!cloudOn() || !family || !S || !P.current) return Promise.resolve();
    return fsPut(`/saves/${P.current}`, { data: JSON.stringify(S), updated: S.updatedAt || now() }, keepalive)
      .then(() => setSync('ok'), () => setSync('error'));
  }

  // Download the player list and everyone's saves; keep whichever copy is newer.
  async function cloudPull() {
    if (!cloudOn() || !family) return false;
    setSync('syncing');
    try {
      const [fam, list] = await Promise.all([fsGet(''), fsGet('/saves?pageSize=100')]);
      let changed = false;
      if (fam) {
        const updated = +field(fam, 'updated') || 0;
        if (updated > (P.updated || 0)) {
          P.list = JSON.parse(field(fam, 'profiles'));
          P.updated = updated;
          if (!P.list.some((p) => p.id === P.current)) P.current = P.list[0].id;
          saveProfiles();
          if (S) applyTheme();
          changed = true;
        }
      }
      for (const doc of (list && list.documents) || []) {
        const id = doc.name.split('/').pop();
        const updated = +field(doc, 'updated') || 0;
        const local = rawSave(id);
        if (updated <= ((local && local.updatedAt) || 0)) continue;
        const data = field(doc, 'data');
        try { localStorage.setItem(saveKey(id), data); } catch (_) { /* ignore */ }
        if (S && id === P.current) { S = loadSave(id); rollDaily(); sel = -1; }
        changed = true;
      }
      setSync('ok');
      return changed;
    } catch (_) {
      setSync('error');
      return false;
    }
  }

  // Pull, then refresh whatever is on screen if anything changed.
  function pullAndRefresh() {
    return cloudPull().then((changed) => {
      if (!changed) return;
      if ($('who').classList.contains('show')) renderPicker();
      else if (S && !(drag && drag.started)) render();
    });
  }

  async function createFamily() {
    if (!cloudOn()) return;
    const code = genCode();
    family = code;
    setSync('syncing');
    try {
      P.updated = now();
      await pushProfiles();
      for (const pl of P.list) {
        const raw = localStorage.getItem(saveKey(pl.id));
        if (raw) await fsPut(`/saves/${pl.id}`, { data: raw, updated: (JSON.parse(raw).updatedAt) || now() });
      }
      try { localStorage.setItem(FAMILY_KEY, code); } catch (_) { /* ignore */ }
      saveProfiles();
      setSync('ok');
      renderPicker();
      showFamilyCode(true);
    } catch (_) {
      family = null;
      setSync('error');
      toast('Could not reach the online save. Check your connection.');
    }
  }

  // Join an existing family. Local players are matched to the family's players by name;
  // whichever copy of a player's game has more progress is kept.
  async function joinFamily(input) {
    const code = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return;
    const prev = family;
    family = code;
    setSync('syncing');
    try {
      const fam = await fsGet('');
      if (!fam) throw new Error('notfound');
      const list = await fsGet('/saves?pageSize=100');
      const profiles = JSON.parse(field(fam, 'profiles'));
      const saves = {};
      for (const doc of (list && list.documents) || []) saves[doc.name.split('/').pop()] = JSON.parse(field(doc, 'data'));
      const progress = (s) => (s ? s.level * 1000 + ((s.stats && s.stats.orders) || 0) * 10 + ((s.stats && s.stats.merges) || 0) : -1);
      const uploads = [];
      for (const lp of P.list) {
        const ls = rawSave(lp.id);
        let rp = profiles.find((r) => r.name.trim().toLowerCase() === lp.name.trim().toLowerCase());
        if (!rp) { if (!ls) continue; rp = { ...lp }; profiles.push(rp); }
        if (ls && progress(ls) > progress(saves[rp.id])) {
          ls.updatedAt = now();
          saves[rp.id] = ls;
          uploads.push(rp.id);
        }
      }
      const curName = currentPlayer() ? currentPlayer().name : '';
      P.list.forEach((lp) => { try { localStorage.removeItem(saveKey(lp.id)); } catch (_) { /* ignore */ } });
      Object.entries(saves).forEach(([id, s]) => { try { localStorage.setItem(saveKey(id), JSON.stringify(s)); } catch (_) { /* ignore */ } });
      P.list = profiles;
      P.updated = now();
      P.seeded = DEFAULT_PLAYERS.map((d) => d.name);
      P.current = (P.list.find((p) => p.name === curName) || P.list[0]).id;
      saveProfiles();
      try { localStorage.setItem(FAMILY_KEY, code); } catch (_) { /* ignore */ }
      await pushProfiles();
      for (const id of uploads) await fsPut(`/saves/${id}`, { data: JSON.stringify(saves[id]), updated: saves[id].updatedAt });
      S = null;
      setSync('ok');
      renderPicker();
      toast('You joined the family! Everyone’s progress is shared now.');
    } catch (e) {
      family = prev;
      setSync(prev ? 'ok' : 'idle');
      toast(e.message === 'notfound' ? 'No family found with that code' : 'Could not reach the online save. Check your connection.');
    }
  }

  function leaveFamily() {
    showModal('☁️', 'Stop syncing?', 'This phone keeps its current copy of every game, but stops sharing progress with the family.', [
      { label: 'Stop syncing', fn: () => { family = null; try { localStorage.removeItem(FAMILY_KEY); } catch (_) { /* ignore */ } renderPicker(); } },
      { label: 'Cancel', cls: 'ghost' },
    ]);
  }

  function showFamilyCode(isNew) {
    showModal('👨‍👩‍👧', isNew ? 'Family created!' : 'Family code',
      `On Shelly's and Livy's phones, open the game, tap <b>Join with code</b> and type:<br><span class="fam-code">${esc(family)}</span>`,
      [{ label: 'Copy code', fn: () => { try { navigator.clipboard.writeText(family); toast('Code copied'); } catch (_) { /* ignore */ } } }, { label: 'Done', cls: 'ghost' }]);
  }

  function promptJoin() {
    $('dialog').innerHTML = `<div class="big">👨‍👩‍👧</div><h2>Join your family</h2>
      <p>Type the family code shown on the phone that created the family.</p>
      <input id="famInput" placeholder="HM-XXXXX-XXXXX" autocapitalize="characters" autocomplete="off" spellcheck="false">
      <div class="row"><button class="ghost" data-j="cancel">Cancel</button><button data-j="join">Join</button></div>`;
    $('modal').classList.add('show');
    setTimeout(() => $('famInput').focus(), 50);
    $('dialog').onclick = (ev) => {
      const b = ev.target.closest('[data-j]');
      if (!b) return;
      const v = $('famInput').value;
      $('modal').classList.remove('show');
      if (b.dataset.j === 'join') joinFamily(v);
    };
  }

  function syncBar() {
    if (!cloudOn()) return '';
    if (!family) {
      return `<div class="sync-bar"><b>☁️ Play together on different phones</b>
        <small>Create a family on one phone, then join with the code on the others to share everyone's progress.</small>
        <div class="row"><button data-sync="create">Create family</button><button class="ghost" data-sync="join">Join with code</button></div></div>`;
    }
    return `<div class="sync-bar on"><div><b>☁️ Family sync on</b><small>Code: ${esc(family)}</small><small class="sync-status">${syncText()}</small></div>
      <div class="row"><button class="ghost" data-sync="code">Share code</button><button class="ghost" data-sync="leave">Stop</button></div></div>`;
  }

  // ---------------------------------------------------------------- goals
  const goalProgress = (g) => Math.min(g.target, g.get(S));
  const goalReady = (g) => !S.goalsClaimed.includes(g.id) && g.get(S) >= g.target;
  const rewardStr = (r) => [r.coins ? `${r.coins}🪙` : '', r.gems ? `${r.gems}💎` : '', r.tools ? toolStr(r.tools) : '', r.bait ? `${r.bait}🪱` : ''].filter(Boolean).join(' ');

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
  function makeOrder(slot, allowUrgent = true) {
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
    const o = { reqs, coins, xp, tool, toolN: tool ? (reqs.some((r) => r.l >= 4) ? 2 : 1) : 0 };
    // Occasionally a pet makes a timed request worth double, plus gems. Only one at a time.
    if (allowUrgent && Math.random() < URGENT_CHANCE && !S.orders.some((x, i) => i !== slot && x && x.urgent)) {
      o.urgent = now() + URGENT_MINUTES * 60000;
      o.coins *= 2;
      o.xp *= 2;
      o.gems = URGENT_GEMS;
    }
    return o;
  }

  // Greedily match each requirement to a distinct board cell. Returns array (index or -1 per req).
  function matchOrder(order) {
    const used = new Set();
    return order.reqs.map((r) => {
      const i = S.board.findIndex((e, idx) => e && !used.has(idx) && e.k === 'i' && e.c === r.c && e.l === r.l);
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
    if (o.gems) { S.gems += o.gems; msg += ` +${o.gems}💎`; }
    if (Math.random() < BAIT_ORDER_CHANCE) { S.bait++; msg += ' +1🪱'; }
    haptic([18, 40, 30]);
    track('order', { pet: characterFor(oi).id });
    if (o.urgent) track('urgent');
    S.orders[oi] = makeOrder(oi);
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
    S.orders = S.orders.map((o, i) => o.reqs.every((r) => activeChains().includes(r.c)) ? o : makeOrder(i, false));
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
    track('make');
    discover(item);
    popAt = target;
    commit();
  }

  function canMerge(a, b) {
    if (!a || !b || a.k !== b.k || a.l !== b.l) return false;
    if (a.k === 'i') return a.c === b.c && a.l < chainMax(a.c);
    return a.p === b.p && a.l < PRODUCER_LEVELS.length;
  }

  function moveOrMerge(from, to) {
    if (from === to) return;
    const a = S.board[from], b = S.board[to];
    if (canMerge(a, b)) {
      S.board[from] = null;
      S.stats.merges++;
      track('merge', { chain: a.c });
      if (a.k === 'i') {
        const merged = newItem(a.c, a.l + 1);
        S.board[to] = merged;
        discover(merged);
        haptic(a.l >= 4 ? [14, 40, 22] : 14);
      } else {
        S.board[to] = newProducer(a.p, a.l + 1);
        S.stats.bestProducer = Math.max(S.stats.bestProducer, a.l + 1);
        haptic([20, 50, 20, 50, 40]);
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
    if (!e || e.k !== 'i') return;
    S.board[i] = null;
    earn(e.l);
    sel = -1;
    toast(`Sold ${entName(e)} for ${e.l}🪙`);
    commit();
  }

  function store(i) {
    const e = S.board[i];
    if (!e) return;
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

  function buyBait() {
    if (S.gems < BAIT_SHOP.gems) { toast(`Need ${BAIT_SHOP.gems}💎`); return; }
    S.gems -= BAIT_SHOP.gems;
    S.bait += BAIT_SHOP.amount;
    toast(`+${BAIT_SHOP.amount}🪱 bait`);
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

  // ---------------------------------------------------------------- days & weeks
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  function mondayOf(d = new Date()) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m;
  }
  const weekKey = (offset = 0) => { const m = mondayOf(); m.setDate(m.getDate() + offset * 7); return dayKey(m); };
  const weekIndex = () => Math.floor(Math.round(mondayOf().getTime() / 864e5) / 7);
  const untilStr = (ms) => {
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
  };
  const msToMidnight = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d; };
  const msToMonday = () => { const m = mondayOf(); m.setDate(m.getDate() + 7); return m - new Date(); };

  // Start a fresh week of race stats, remembering last week's points.
  function rollWeek(s) {
    if (s.week && s.week.key === weekKey()) return;
    if (s.week) s.lastWeek = { key: s.week.key, points: s.week.points };
    s.week = { key: weekKey(), points: 0, orders: 0, merges: 0, fish: 0, teamClaimed: false };
  }

  // A player's save for read-only use (the current player's live state, or a stored save).
  const saveOf = (id) => (id === P.current && S ? S : loadSave(id));

  // ---------------------------------------------------------------- rewards
  function grant(r) {
    if (r.coins) earn(r.coins);
    if (r.gems) S.gems += r.gems;
    if (r.bait) S.bait += r.bait;
    for (const [t, n] of Object.entries(r.tools || {})) S.tools[t] += n;
  }

  // Record a game event for daily tasks and the weekly race.
  function track(ev, data = {}) {
    rollWeek(S);
    const w = S.week;
    w.points += RACE_POINTS[ev] || 0;
    if (ev === 'merge') w.merges++;
    if (ev === 'order') w.orders++;
    if (ev === 'fish') w.fish++;
    for (const t of (S.daily ? S.daily.tasks : [])) {
      if (t.progress >= t.n) continue;
      const hit = t.type === ev
        || (t.type === 'mergeChain' && ev === 'merge' && data.chain === t.chain)
        || (t.type === 'orderPet' && ev === 'order' && data.pet === t.pet);
      if (hit && ++t.progress === t.n) setTimeout(() => toast(`✅ Daily task done: ${taskText(t)}`), 1900);
    }
  }

  // ---------------------------------------------------------------- daily tasks
  function rollDaily() {
    const day = today();
    if (S.daily && S.daily.day === day) return false;
    if (S.bait < BAIT_DAILY) S.bait = BAIT_DAILY;
    const pool = DAILY_TASKS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const toolKeys = Object.keys(TOOLS);
    const rewards = [{ coins: 30 + 10 * S.level }, { tools: { [pick(toolKeys)]: 1 } }, { gems: 3 }];
    S.daily = {
      day, bonusClaimed: false,
      tasks: pool.map((t, i) => {
        const task = { type: t.type, n: pick(t.n), progress: 0, claimed: false, reward: rewards[i] };
        if (t.type === 'mergeChain') task.chain = pick(activeChains());
        if (t.type === 'orderPet') task.pet = pick(CHARACTERS).id;
        return task;
      }),
    };
    return true;
  }

  function taskText(t) {
    if (t.type === 'merge') return `Make ${t.n} merges`;
    if (t.type === 'mergeChain') return `Merge ${t.n} ${CHAINS[t.chain].name} items`;
    if (t.type === 'make') return `Tap producers ${t.n} times`;
    if (t.type === 'order') return `Deliver ${t.n} orders`;
    if (t.type === 'orderPet') return `Deliver ${t.n} order${t.n > 1 ? 's' : ''} for ${CHARACTERS.find((c) => c.id === t.pet).name}`;
    if (t.type === 'fish') return `Catch ${t.n} fish`;
    return t.type;
  }

  const dailyReady = (t) => !t.claimed && t.progress >= t.n;
  const bonusReady = () => S.daily && !S.daily.bonusClaimed && S.daily.tasks.every((t) => t.claimed);

  function claimDaily(i) {
    const t = S.daily.tasks[i];
    if (!t || !dailyReady(t)) return;
    t.claimed = true;
    grant(t.reward);
    track('daily');
    toast(`Daily task complete! +${rewardStr(t.reward)}`);
    commit();
  }
  function claimDailyBonus() {
    if (!bonusReady()) return;
    S.daily.bonusClaimed = true;
    grant(DAILY_BONUS);
    showModal('🎁', 'All daily tasks done!', `+${rewardStr(DAILY_BONUS)}<br>New tasks arrive tomorrow.`);
    commit();
  }

  // ---------------------------------------------------------------- family race & team goal
  function raceRows() {
    return P.list.map((pl) => {
      const s = saveOf(pl.id);
      return {
        pl,
        pts: s ? s.week.points : 0,
        last: s && s.lastWeek && s.lastWeek.key === weekKey(-1) ? s.lastWeek.points : 0,
      };
    }).sort((a, b) => b.pts - a.pts);
  }
  // Leader of this week (only when someone has points and nobody is tied for first).
  function raceLeader(rows = raceRows()) {
    return rows.length && rows[0].pts > 0 && (rows.length < 2 || rows[0].pts > rows[1].pts) ? rows[0].pl.id : null;
  }
  function lastChampion(rows) {
    const best = rows.reduce((a, r) => (r.last > (a ? a.last : 0) ? r : a), null);
    return best ? best.pl : null;
  }

  function teamGoal() {
    const g = TEAM_GOALS[weekIndex() % TEAM_GOALS.length];
    const target = g.per * P.list.length;
    const parts = P.list.map((pl) => { const s = saveOf(pl.id); return { pl, n: s ? s.week[g.stat] : 0 }; });
    const total = parts.reduce((a, p) => a + p.n, 0);
    return { g, target, parts, total, done: total >= target };
  }
  function claimTeam() {
    if (S.week.teamClaimed || !teamGoal().done) return;
    S.week.teamClaimed = true;
    grant(TEAM_REWARD);
    showModal('🤝', 'Team goal reached!', `Great teamwork! +${rewardStr(TEAM_REWARD)}`);
    commit();
  }

  // ---------------------------------------------------------------- fishing
  let fishing = null; // { phase, fish, tier, timer, raf, pos, dir, zoneL, last }
  const fishEl = (id) => $(id);

  function openFishing() {
    $('fishing').classList.add('show');
    fishing = { phase: 'idle' };
    fishShow('idle', BAIT_HINT());
  }
  const BAIT_HINT = () => (S.bait > 0 ? 'Tap Cast to throw your line.' : 'Out of bait! Get more from orders, daily tasks or the shop.');
  function closeFishing() {
    stopFishTimers();
    fishing = null;
    $('fishing').classList.remove('show');
    render();
  }
  function stopFishTimers() {
    if (!fishing) return;
    clearTimeout(fishing.timer);
    cancelAnimationFrame(fishing.raf);
  }
  function fishShow(phase, msg) {
    fishing.phase = phase;
    $('fishScene').dataset.phase = phase;
    $('fishMsg').textContent = msg;
    $('baitCount').textContent = S.bait;
    $('castBtn').disabled = phase !== 'idle' && phase !== 'result';
    $('castBtn').textContent = S.bait > 0 ? `Cast 🎣 (1 🪱)` : 'Get bait';
  }
  function rollFish() {
    const total = FISH.reduce((a, f) => a + f.weight, 0);
    let r = Math.random() * total;
    return FISH.find((f) => (r -= f.weight) < 0) || FISH[0];
  }
  function cast() {
    if (!fishing || (fishing.phase !== 'idle' && fishing.phase !== 'result')) return;
    if (S.bait < 1) { closeFishing(); switchView('shop'); toast('Buy bait here 🪱'); return; }
    S.bait--;
    save();
    fishing.fish = rollFish();
    fishing.tier = FISH_TIERS[fishing.fish.tier];
    $('catch').textContent = '';
    fishShow('wait', 'Waiting for a bite… don’t tap yet!');
    fishing.timer = setTimeout(bite, 1500 + Math.random() * 2800);
  }
  function bite() {
    fishShow('bite', 'A bite! TAP NOW!');
    haptic(60);
    fishing.timer = setTimeout(() => fishMiss('Too slow — it got away.'), fishing.tier.win);
  }
  function startReel() {
    clearTimeout(fishing.timer);
    const z = fishing.tier.zone;
    fishing.zoneL = 0.08 + Math.random() * (0.84 - z);
    fishing.pos = 0;
    fishing.dir = 1;
    fishing.last = performance.now();
    $('zone').style.left = `${fishing.zoneL * 100}%`;
    $('zone').style.width = `${z * 100}%`;
    fishShow('reel', 'Reel it in! Tap when the marker is in the green.');
    const step = (t) => {
      const dt = (t - fishing.last) / 1000;
      fishing.last = t;
      fishing.pos += fishing.dir * fishing.tier.speed * dt;
      if (fishing.pos >= 1) { fishing.pos = 1; fishing.dir = -1; }
      if (fishing.pos <= 0) { fishing.pos = 0; fishing.dir = 1; }
      $('marker').style.left = `${fishing.pos * 100}%`;
      fishing.raf = requestAnimationFrame(step);
    };
    fishing.raf = requestAnimationFrame(step);
    fishing.timer = setTimeout(() => fishMiss('The line snapped!'), 6000);
  }
  function fishTap() {
    if (!fishing) return;
    if (fishing.phase === 'wait') { clearTimeout(fishing.timer); fishMiss('Too early! You scared it off.'); }
    else if (fishing.phase === 'bite') startReel();
    else if (fishing.phase === 'reel') {
      stopFishTimers();
      const inZone = fishing.pos >= fishing.zoneL && fishing.pos <= fishing.zoneL + fishing.tier.zone;
      if (inZone) fishCaught(); else fishMiss('So close! It wriggled free.');
    }
  }
  function fishMiss(msg) {
    stopFishTimers();
    fishShow('result', `${msg} ${S.bait > 0 ? '' : 'Out of bait!'}`);
  }
  function fishCaught() {
    const f = fishing.fish;
    const reward = { coins: f.coins };
    if (f.gems) reward.gems = f.gems;
    if (f.tools) reward.tools = { [pick(Object.keys(TOOLS))]: f.tools };
    grant(reward);
    S.fishLog[f.id] = (S.fishLog[f.id] || 0) + 1;
    track('fish');
    save();
    $('catch').innerHTML = `<span class="big">${f.icon}</span><b>${f.name}!</b><small>+${rewardStr(reward)}</small>`;
    fishShow('result', f.id === 'boot' ? 'Well… it’s a catch!' : 'Nice catch!');
    haptic([40, 40, 80]);
  }

  // ---------------------------------------------------------------- pet requests
  function expireRequests() {
    let changed = false;
    S.orders.forEach((o, i) => {
      if (o.urgent && now() >= o.urgent) {
        S.orders[i] = makeOrder(i, false);
        toast(`${characterFor(i).name}'s request ran out of time`);
        changed = true;
      }
    });
    return changed;
  }

  // ---------------------------------------------------------------- time
  function tick() {
    const changed = rollDaily() | expireRequests();
    if (changed) save();
    if (drag && drag.started) return;
    if (changed) { render(); return; }
    renderHud();
    document.querySelectorAll('[data-urg]').forEach((el) => {
      const o = S.orders[+el.dataset.urg];
      if (o && o.urgent) el.textContent = fmtTime((o.urgent - now()) / 1000);
    });
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
    if (view === 'view-fun') renderFun();
    if (view === 'view-progress') renderProgress();
    const tg = teamGoal();
    $('funDot').classList.toggle('show', S.daily.tasks.some(dailyReady) || bonusReady() || (tg.done && !S.week.teamClaimed));
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
        return `<span class="req${m[ri] >= 0 ? ' have' : ''}" data-req="${r.c}:${r.l}" title="${name} (Lv ${r.l}) · made with the ${PRODUCERS[producerOf(r.c)].name}. Tap for the recipe."><i>${r.l}</i>${icon}</span>`;
      }).join('');
      const reward = `🪙${o.coins} ⭐${o.xp}` + (o.tool ? ` ${TOOLS[o.tool].icon}${o.toolN}` : '') + (o.gems ? ` 💎${o.gems}` : '');
      const ch = characterFor(oi);
      const urg = o.urgent ? `<div class="urg">⏰ <span data-urg="${oi}">${fmtTime((o.urgent - now()) / 1000)}</span></div>` : '';
      return `<div class="order${o.tool ? ' tool' : ''}${o.urgent ? ' urgent' : ''}">${urg}
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
    if (i === popAt) cls += ' pop';
    return `<div class="${cls}" title="${entName(e)}">${entIcon(e)}<span class="lv">${e.l}</span>${extra}</div>`;
  }

  // "How do I make this?" for an item an order asks for.
  const producerOf = (c) => Object.keys(PRODUCERS).find((k) => PRODUCERS[k].makes === c);
  let flashProducer = null, flashUntil = 0;
  function showRecipe(c, l) {
    const pid = producerOf(c), pd = PRODUCERS[pid];
    const [icon, name] = itemInfo(c, l);
    const base = CHAINS[c].items[0];
    const steps = CHAINS[c].items.slice(0, l)
      .map((it, i) => `<span class="step${i === l - 1 ? ' target' : ''}" title="${it[1]}">${it[0]}<i>${i + 1}</i></span>`).join('<em>›</em>');
    const onBoard = S.board.some((e) => e && e.k === 'p' && e.p === pid);
    const stored = S.storage.some((e) => e && e.k === 'p' && e.p === pid);
    const where = onBoard ? '' : stored
      ? `<span class="recipe-note">Your ${pd.name} is in storage 📦. Tap it there to bring it back.</span>`
      : `<span class="recipe-note">You don't have a ${pd.name} right now. Get one in the Shop 🛍️.</span>`;
    const buttons = onBoard
      ? [{ label: 'Show me', fn: () => {
          flashProducer = pid; flashUntil = now() + 3200;
          switchView('board');
          setTimeout(() => { if (S) render(); }, 3300);
        } }, { label: 'OK', cls: 'ghost' }]
      : [{ label: 'OK' }];
    showModal(icon, `${name} · Lv ${l}`,
      `Tap the <b>${pd.icon} ${pd.name}</b>, then merge your way up:
       <span class="recipe"><span class="step prod" title="${pd.name}">${pd.icon}</span><em>›</em>${steps}</span>
       <span class="recipe-note">One ${name} takes ${2 ** (l - 1)} × ${base[0]} ${base[1]}.</span>${where}`, buttons);
  }

  function renderBoard() {
    const selEnt = S.board[sel];
    $('board').innerHTML = S.board.map((e, i) => {
      let cls = 'cell';
      if (i === sel) cls += ' selected';
      else if (selEnt && canMerge(selEnt, e)) cls += ' match';
      if (e && e.k === 'p' && e.p === flashProducer && now() < flashUntil) cls += ' flash';
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
      <h3>Fishing</h3>
      <div class="shop-item"><div class="icon">🪱</div><div class="txt"><b>${BAIT_SHOP.amount} Bait</b><small>You have ${S.bait}. You also get ${BAIT_DAILY} free each day.</small></div>
        <button class="gem" data-shop="bait" ${S.gems < BAIT_SHOP.gems ? 'disabled' : ''}>${BAIT_SHOP.gems}💎</button></div>
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
      <h3>Players${family ? ` <small class="sync-status">${syncText()}</small>` : ''}</h3><div class="card"><table class="cmp"><thead><tr><th></th><th>Lv</th><th>Town</th><th>Items</th><th>Orders</th><th>Played</th></tr></thead><tbody>`;
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

  function renderFun() {
    const d = S.daily;
    let html = `<h3 class="fun-h">📅 Today's tasks <small>new tasks in ${untilStr(msToMidnight())}</small></h3><div class="card">`;
    html += d.tasks.map((t, i) => {
      const right = t.claimed ? '<span class="done-tag">✓</span>'
        : dailyReady(t) ? `<button data-daily="${i}">Claim</button>`
        : `<small>${t.progress}/${t.n}</small>`;
      return `<div class="goal${t.claimed ? ' done' : ''}"><div class="icon">${['🌅', '🌤️', '🌙'][i]}</div>
        <div class="txt"><b>${taskText(t)}</b><small>Reward: ${rewardStr(t.reward)}</small>${t.claimed ? '' : bar(Math.min(t.progress, t.n), t.n)}</div>${right}</div>`;
    }).join('');
    html += `<div class="goal bonus${d.bonusClaimed ? ' done' : ''}"><div class="icon">🎁</div>
      <div class="txt"><b>Finish all three</b><small>Bonus: ${rewardStr(DAILY_BONUS)}</small></div>
      ${d.bonusClaimed ? '<span class="done-tag">✓</span>' : `<button data-dailybonus ${bonusReady() ? '' : 'disabled'}>Open</button>`}</div></div>`;

    // Fishing
    const caught = FISH.filter((f) => S.fishLog[f.id]);
    html += `<h3 class="fun-h">🎣 Fishing at the pier</h3>
      <div class="card fish-card"><div class="fish-hero">🎣</div>
        <div class="txt"><b>Cast a line off the old pier</b><small>Wait for the bite, tap fast, then stop the marker in the green. You have <b>${S.bait} 🪱</b>.</small></div>
        <button data-gofish>Go fishing</button></div>
      <div class="card fish-log">${FISH.map((f) => `<span class="${S.fishLog[f.id] ? '' : 'unk'}" title="${S.fishLog[f.id] ? f.name : '???'}">${S.fishLog[f.id] ? f.icon : '❔'}<i>${S.fishLog[f.id] || ''}</i></span>`).join('')}
        <small>${caught.length}/${FISH.length} species found</small></div>`;

    // Family race
    const rows = raceRows();
    const leader = raceLeader(rows);
    const champ = lastChampion(rows);
    const medals = ['🥇', '🥈', '🥉'];
    html += `<h3 class="fun-h">🏁 Family race <small>ends in ${untilStr(msToMonday())}</small></h3><div class="card race">`;
    html += rows.map((r, i) => `<div class="race-row${r.pl.id === P.current ? ' cur' : ''}" style="--pc:${r.pl.color}">
        <span class="rank">${r.pts > 0 ? (medals[i] || i + 1) : '–'}</span><span class="dotav">${r.pl.avatar}</span>
        <b>${esc(r.pl.name)}${r.pl.id === leader ? ' 👑' : ''}</b><span class="rpts">⭐ ${r.pts}</span></div>`).join('');
    html += `<small class="race-help">Earn ⭐: merge 1 · order 10 · pet request +10 · fish 5 · daily task 15</small>
      ${champ ? `<small class="race-help">Last week's champion: ${champ.avatar} <b>${esc(champ.name)}</b></small>` : ''}</div>`;

    // Team goal
    const tg = teamGoal();
    html += `<h3 class="fun-h">🤝 Team goal <small>this week</small></h3><div class="card team">
      <div class="meter"><span>${tg.g.icon} ${tg.g.text.replace('{n}', tg.target)}</span><b>${Math.min(tg.total, tg.target)}/${tg.target}</b></div>
      <div class="pbar team-bar">${tg.parts.map((p) => `<div style="width:${(Math.min(p.n, tg.target) / tg.target) * 100}%;background:${p.pl.color}" title="${esc(p.pl.name)}: ${p.n}"></div>`).join('')}</div>
      <div class="team-parts">${tg.parts.map((p) => `<span><span class="dotav" style="--pc:${p.pl.color}">${p.pl.avatar}</span> ${p.n}</span>`).join('')}</div>
      <div class="team-foot"><small>Everyone who helps gets ${rewardStr(TEAM_REWARD)}</small>
      ${S.week.teamClaimed ? '<span class="done-tag">✓ Claimed</span>' : `<button data-team ${tg.done ? '' : 'disabled'}>Claim</button>`}</div></div>`;
    $('fun').innerHTML = html;
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
    if (e.k === 'p') tapProducer(i);
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
      if (!e || Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 8) return;
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
    const t = ev.target.closest('[data-req],[data-sync],[data-daily],[data-dailybonus],[data-team],[data-gofish],[data-fish],[data-edit],[data-play],[data-addplayer],[data-switch],[data-claim],[data-deliver],[data-act],[data-slot],[data-buyslot],[data-up],[data-shop],.tabs button,#whoChip');
    if (!t) return;
    if (t.dataset.req) { const [c, l] = t.dataset.req.split(':'); showRecipe(c, +l); }
    else if (t.dataset.sync) {
      const a = t.dataset.sync;
      if (a === 'create') createFamily();
      else if (a === 'join') promptJoin();
      else if (a === 'code') showFamilyCode(false);
      else if (a === 'leave') leaveFamily();
    } else if (t.dataset.daily !== undefined) claimDaily(+t.dataset.daily);
    else if (t.dataset.dailybonus !== undefined) claimDailyBonus();
    else if (t.dataset.team !== undefined) claimTeam();
    else if (t.dataset.gofish !== undefined) openFishing();
    else if (t.dataset.fish === 'cast') cast();
    else if (t.dataset.fish === 'close') closeFishing();
    else if (t.dataset.edit) editPlayer(t.dataset.edit);
    else if (t.dataset.play) playAs(t.dataset.play);
    else if (t.dataset.addplayer !== undefined) editPlayer(null);
    else if (t.dataset.switch !== undefined || t.id === 'whoChip') showPicker();
    else if (t.dataset.claim) claimGoal(t.dataset.claim);
    else if (t.dataset.deliver !== undefined) deliver(+t.dataset.deliver);
    else if (t.dataset.act) {
      ({ sell, store })[t.dataset.act](sel);
    } else if (t.dataset.slot !== undefined) { if (S.storage[+t.dataset.slot]) unstore(+t.dataset.slot); }
    else if (t.dataset.buyslot !== undefined) buySlot();
    else if (t.dataset.up) { const [a, b] = t.dataset.up.split(':').map(Number); upgrade(a, b); }
    else if (t.dataset.shop) {
      const s = t.dataset.shop;
      if (s === 'deal') buyDeal();
      else if (s === 'slot') buySlot();
      else if (s === 'bait') buyBait();
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
    if (name === 'fun' || name === 'progress') pullAndRefresh();
  }

  $('fishScene').addEventListener('pointerdown', (ev) => { ev.preventDefault(); fishTap(); });

  // ---------------------------------------------------------------- boot
  // Always start on "Who's playing?" so nobody plays on someone else's save.
  P = loadProfiles();
  saveProfiles();
  showPicker();
  setInterval(() => { if (S) tick(); }, 1000);
  setInterval(() => { if (!document.hidden) pullAndRefresh(); }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pushTimer) flushPush(true); } else pullAndRefresh();
  });
  window.addEventListener('pagehide', () => { if (pushTimer) flushPush(true); });
  window.__game = { get state() { return S; } }; // debugging handle
})();
