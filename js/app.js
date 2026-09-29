'use strict';

(() => {
  const COMBO_WINDOW = 20 * 60 * 1000;
  const IGNITE_MS = 2 * 60 * 1000;
  const RING_C = 2 * Math.PI * 19;

  const $ = (s, r = document) => r.querySelector(s);
  const S = () => Store.state;
  const a1 = () => Prefs.accent()[0];
  const a2 = () => Prefs.accent()[1];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => Store.dayKey();
  const todayLog = () => S().log.filter((l) => l.day === today());

  // A boss is only as strong as the time you spent avoiding it (days since the task was created).
  // One boss can be slain per day.
  const BOSS_TIERS = [
    { tier: 1, minDays: 0, name: 'Minion', mult: 2, hold: 900 },
    { tier: 2, minDays: 3, name: 'Boss', mult: 3, hold: 1200 },
    { tier: 3, minDays: 8, name: 'Elite', mult: 4, hold: 1500 },
    { tier: 4, minDays: 21, name: 'Dread', mult: 5, hold: 1800 },
  ];
  const taskAge = (t) => Math.max(0, Store.daysBetween(Store.dayKey(new Date(t.createdAt)), today()));
  const bossTierOf = (t) => {
    const age = taskAge(t);
    let tier = BOSS_TIERS[0];
    for (const b of BOSS_TIERS) if (age >= b.minDays) tier = b;
    return tier;
  };
  const bossSlainToday = () => S().bossSlainDay === today();
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const ICON = {
    crown: '<svg viewBox="0 0 24 24"><path d="M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  };

  const VIEWS = ['today', 'vault', 'sky'];
  let currentView = 'today';
  let hudFrozen = false; // held while XP motes are in flight, so the bar fills when they land

  // ---------------------------------------------------------------- day rollover
  function rollover() {
    const st = S();
    const t = today();
    if (st.lastDay === t) return false;
    st.tasks = st.tasks.filter((x) => !x.doneAt || Store.dayKey(new Date(x.doneAt)) === t);
    for (const x of st.tasks) {
      if (x.lane === 'today' && !x.doneAt) x.carried = (x.carried || 0) + 1;
      if (x.igniteUntil) x.igniteUntil = 0;
    }
    st.combo = { count: 0, last: 0 };
    st.lastDay = t;
    Store.save();
    return true;
  }

  // ---------------------------------------------------------------- render
  function renderAll() {
    renderHUD();
    if (currentView === 'today') renderToday();
    if (currentView === 'vault') renderVault();
    if (currentView === 'sky') renderSky();
  }

  function renderLevel() {
    const lv = Store.levelInfo(S().xp);
    const numEl = $('#levelNum');
    if (numEl.textContent !== String(lv.level)) Anim.pulse($('#level'), 'gain');
    numEl.textContent = lv.level;
    $('#levelTitle').textContent = lv.title;
    $('#xpFill').style.width = `${(lv.into / lv.need) * 100}%`;
    Anim.countTo($('#xpInto'), lv.into);
    $('#xpNeed').textContent = lv.need;
    const ring = $('#levelRing');
    ring.style.strokeDasharray = RING_C;
    ring.style.strokeDashoffset = RING_C * (1 - lv.into / lv.need);
  }

  function renderHUD() {
    const st = S();
    if (!hudFrozen) renderLevel();

    const sk = Store.streakInfo();
    Anim.countTo($('#streakNum'), sk.current);
    $('#lockBtn').hidden = !Lock.enabled;
    const streakEl = $('#streak');
    streakEl.classList.toggle('cold', sk.current === 0);
    streakEl.classList.toggle('pending', sk.current > 0 && !sk.doneToday);
    streakEl.classList.toggle('hot', sk.current >= 7);

    $('#songCount').textContent = todayLog().length;
    const found = Object.keys(st.relics).length;
    $('#vaultCount').textContent = `${found}/${Loot.total}`;
    $('#skyCount').textContent = st.log.length || '';
    $('#soundBtn').classList.toggle('off', !Prefs.get('sound'));
    renderCombo();
  }

  function renderCombo() {
    const c = S().combo;
    const left = COMBO_WINDOW - (Date.now() - c.last);
    const on = c.count >= 2 && left > 0;
    const el = $('#combo');
    el.classList.toggle('on', on);
    $('#comboNum').textContent = `x${c.count}`;
    $('#comboFill').style.width = on ? `${(left / COMBO_WINDOW) * 100}%` : '0%';
    el.title = on ? `Next win within ${fmtClock(left)} keeps the chain. Higher combo = more XP, higher notes, better loot.` : 'Finish tasks close together to build a combo.';
  }

  function renderToday() {
    const st = S();
    const d = new Date();
    $('#heroDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const sk = Store.streakInfo();
    const wins = todayLog();
    const xpToday = wins.reduce((a, l) => a + l.xp, 0);
    let line, sub;
    if (!st.log.length) {
      line = 'Day One.';
      sub = 'Not "one day." Today. Commit to one thing and finish it.';
    } else if (sk.current === 0) {
      line = 'Day One. Again.';
      sub = `Streak reset, and that is fine. Day One #${st.dayOnes + 1} starts with a single win.`;
    } else if (!sk.doneToday) {
      line = `Day ${sk.current + 1} is waiting.`;
      sub = `${sk.current}-day streak on the line. One win keeps it alive. Don't let today turn into "one day."`;
    } else {
      line = `Day ${sk.current}. Kept.`;
      sub = `${wins.length} win${wins.length === 1 ? '' : 's'} today · +${xpToday} XP. Everything else is a bonus.`;
    }
    Anim.words($('#heroLine'), line);
    $('#heroSub').textContent = sub;

    const open = st.tasks.filter((t) => t.lane === 'today' && !t.doneAt)
      .sort((a, b) => (b.boss - a.boss) || ((a.pulledAt || a.createdAt) - (b.pulledAt || b.createdAt)));
    const someday = st.tasks.filter((t) => t.lane === 'someday' && !t.doneAt)
      .sort((a, b) => (b.parkedAt || b.createdAt) - (a.parkedAt || a.createdAt));

    Anim.flip('.card[data-id]', () => {
      $('#dayoneList').innerHTML = open.map(dayOneCard).join('');
      $('#onedayList').innerHTML = someday.map(oneDayCard).join('');
    });
    $('#dayoneEmpty').hidden = open.length > 0 || wins.length > 0;
    $('#onedayEmpty').hidden = someday.length > 0;
    $('#dayoneCount').textContent = open.length ? `${open.length} open` : '';
    $('#onedayCount').textContent = someday.length ? `${someday.length} parked` : '';
    $('#dayoneList').classList.toggle('crowded', open.length > 6);

    $('#doneCount').textContent = wins.length;
    $('#doneWrap').hidden = !wins.length;
    $('#doneList').innerHTML = wins.slice().reverse().map((l) => {
      const R = Loot.RARITY[l.rarity];
      const relic = Loot.byId[l.relicId];
      return `<li><span class="done-title">${esc(l.title)}</span>
        <span class="done-loot" style="color:${R.color}" title="${esc(relic ? relic.name : '')}">${R.label}</span>
        <span class="done-xp">+${l.xp}</span>
        <button class="act undo" data-act="undo" data-log="${l.id}" title="Not actually done? Undo">${ICON.up}</button></li>`;
    }).join('');

    renderRitual(open, someday, wins);
  }

  function renderRitual(open, someday, wins) {
    const el = $('#ritual');
    if (open.length) { el.hidden = true; return; }
    if (wins.length) {
      el.hidden = false;
      el.className = 'ritual cleared';
      el.innerHTML = someday.length
        ? `<b>Day One is clear.</b> Rest, or pull one more from One Day while the combo is warm.`
        : `<b>Day One is clear.</b> Nothing left, nothing parked. Go outside.`;
      return;
    }
    if (!someday.length) { el.hidden = true; return; }
    const dusty = someday.slice().sort((a, b) => (a.parkedAt || a.createdAt) - (b.parkedAt || b.createdAt)).slice(0, 3);
    el.hidden = false;
    el.className = 'ritual';
    el.innerHTML = `<div><b>New day. Pick what makes it Day One.</b> These have waited longest:</div>
      <div class="ritual-chips">${dusty.map((t) => `<button class="chip-pull" data-act="pull" data-id="${t.id}">${esc(t.title)} <span>→ Day One</span></button>`).join('')}</div>`;
  }

  function dayOneCard(t) {
    const now = Date.now();
    const igniting = t.igniteUntil && t.igniteUntil > now;
    const nudge = (t.carried || 0) >= 3;
    const bt = bossTierOf(t);
    const spent = bossSlainToday();
    const crownTitle = t.boss
      ? 'Remove the crown'
      : spent
        ? "Today's boss is already slain. Next crown tomorrow."
        : `Crown as today's boss → ${bt.name}: ${bt.mult}× XP, better loot. (Waited ${taskAge(t)} day${taskAge(t) === 1 ? '' : 's'}; older tasks make stronger bosses.)`;
    return `<li class="card ${t.boss ? `boss tier-${bt.tier}` : ''} ${igniting ? 'igniting' : ''}" data-id="${t.id}">
      <button class="orb" data-hold="${t.id}" aria-label="Hold to complete: ${esc(t.title)}" title="Press and hold to complete"><span class="orb-core"></span></button>
      <div class="card-body">
        ${t.boss ? `<div class="boss-tag">${bt.name.toUpperCase()} <span class="hp"><i></i></span> <em>${bt.mult}× XP</em></div>` : ''}
        <div class="card-title" data-act="edit" title="Click to edit">${esc(t.title)}</div>
        <div class="card-meta">
          ${t.carried ? `<span class="chip carried" title="Carried over from previous days">carried ×${t.carried}</span>` : ''}
          ${igniting ? `<span class="chip ignite" data-ignite="${t.id}">${fmtClock(t.igniteUntil - now)} · just start</span>` : ''}
          ${t.ignited && !igniting ? '<span class="chip ignited" title="+5 XP when you finish it">ignited</span>' : ''}
          ${nudge ? '<span class="nudge">Too big? Split it, or send it back.</span>' : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="act crown ${t.boss ? 'on' : ''} ${spent && !t.boss ? 'spent' : ''}" data-act="boss" title="${esc(crownTitle)}">${ICON.crown}</button>
        <button class="act bolt" data-act="ignite" title="2-minute ignition: only commit to starting">${ICON.bolt}</button>
        <button class="act" data-act="park" title="Send back to One Day">${ICON.down}</button>
        <button class="act" data-act="delete" title="Delete">${ICON.x}</button>
      </div>
    </li>`;
  }

  function dustOf(t) {
    const d = Store.daysBetween(Store.dayKey(new Date(t.parkedAt || t.createdAt)), today());
    const lvl = d >= 21 ? 3 : d >= 8 ? 2 : d >= 3 ? 1 : 0;
    return { d, lvl, label: ['fresh', 'gathering dust', 'dusty', 'cobwebs'][lvl] };
  }

  function oneDayCard(t) {
    const dust = dustOf(t);
    return `<li class="card someday dust-${dust.lvl}" data-id="${t.id}">
      <div class="card-body">
        <div class="card-title" data-act="edit" title="Click to edit">${esc(t.title)}</div>
        <div class="card-meta"><span class="dust-label">${dust.label}${dust.d ? ` · ${dust.d}d` : ''}</span></div>
      </div>
      <div class="card-actions">
        <button class="pull" data-act="pull">Make it Day One</button>
        <button class="act" data-act="delete" title="Delete">${ICON.x}</button>
      </div>
    </li>`;
  }

  function renderVault() {
    const st = S();
    const sk = Store.streakInfo();
    const legs = st.log.filter((l) => l.rarity === 'legendary').length;
    const stats = [
      ['Wins', st.log.length],
      ['Best streak', sk.best],
      ['Legendaries', legs],
      ['Perfect days', Object.keys(st.perfectDays).length],
      ['Day Ones started', st.dayOnes],
    ];
    $('#vaultStats').innerHTML = stats.map(([k, v], i) => `<div class="stat" style="--i:${i}"><b data-count="${v}">0</b><span>${k}</span></div>`).join('');
    document.querySelectorAll('#vaultStats [data-count]').forEach((b) => { b._v = 0; Anim.countTo(b, +b.dataset.count); });
    const left = Loot.PITY_LIMIT - st.pity;
    $('#pity').innerHTML = `<div class="pity-text">Epic or better guaranteed within <b>${left}</b> win${left === 1 ? '' : 's'}</div>
      <div class="pity-bar"><i style="width:${(st.pity / Loot.PITY_LIMIT) * 100}%"></i></div>`;
    renderHeat();

    $('#vaultGrid').innerHTML = Loot.ORDER.slice().reverse().map((r) => {
      const R = Loot.RARITY[r];
      const list = Loot.RELICS[r];
      const have = list.filter((x) => st.relics[x.id]).length;
      return `<section class="vault-sec rarity-${r}">
        <h3 style="color:${R.color}">${R.label} <small>${have}/${list.length}</small></h3>
        <div class="relic-grid">${list.map((x) => {
          const n = st.relics[x.id] || 0;
          return `<div class="relic ${n ? '' : 'missing'}" style="--i:${list.indexOf(x)}" title="${n ? esc(x.lore || x.name) : 'Not found yet'}">
            ${Loot.gemSVG(x, { size: 56, locked: !n })}
            <div class="relic-name">${n ? esc(x.name) : '???'}</div>
            ${n > 1 ? `<div class="relic-n">×${n}</div>` : ''}
          </div>`;
        }).join('')}</div>
      </section>`;
    }).join('');
  }

  // GitHub-style grid of the last 18 weeks. Columns are weeks, rows Monday..Sunday.
  function renderHeat() {
    const st = S();
    const WEEKS = 18;
    const counts = {};
    for (const l of st.log) counts[l.day] = (counts[l.day] || 0) + 1;
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - (WEEKS - 1) * 7);
    const t = today();
    let cells = '';
    let active = 0;
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        const k = Store.dayKey(date);
        if (k > t) { cells += '<i class="future"></i>'; continue; }
        const n = counts[k] || 0;
        if (n) active++;
        const lvl = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
        const label = `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n} win${n === 1 ? '' : 's'}`;
        cells += `<i class="h${lvl}${st.perfectDays[k] ? ' perfect' : ''}${k === t ? ' now' : ''}" style="--w:${w}" title="${label}"></i>`;
      }
    }
    $('#heat').innerHTML = `<div class="heat-head"><b>Last ${WEEKS} weeks</b><span>${active} active day${active === 1 ? '' : 's'} · gold ring = perfect day</span></div>
      <div class="heat-grid" style="--weeks:${WEEKS}">${cells}</div>`;
  }

  function renderSky() {
    const log = S().log;
    $('#skyEmpty').hidden = log.length > 0;
    Sky.start(log);
  }

  // ---------------------------------------------------------------- task actions
  function addTask(title, lane) {
    title = title.trim();
    if (!title) return;
    const now = Date.now();
    const t = {
      id: Store.uid(), title, lane, createdAt: now, parkedAt: lane === 'someday' ? now : null,
      pulledAt: lane === 'today' ? now : null, doneAt: null, boss: false, carried: 0, igniteUntil: 0, ignited: false,
    };
    S().tasks.push(t);
    Store.save();
    Sound.pluck(lane === 'today' ? 4 : 1, 0, 0.12);
    Haptics.play('add');
    renderAll();
  }

  function findTask(id) { return S().tasks.find((t) => t.id === id); }

  function pull(id, fromEl) {
    const t = findTask(id);
    if (!t) return;
    const card = fromEl.closest('.card, .chip-pull');
    const { x, y } = center(card || fromEl);
    const dust = dustOf(t);
    FX.dust(x, y);
    if (dust.lvl >= 2) FX.dust(x + 30, y);
    Sound.whoosh();
    flipBrand();
    if (dust.d >= 8) toast(`${dust.d} days in One Day. Today it becomes Day One.`, 'dust');
    if (card && card.classList.contains('chip-pull')) card.classList.add('pulling');
    // The card itself flies across lanes (FLIP in renderToday).
    t.lane = 'today';
    t.pulledAt = Date.now();
    t.carried = 0;
    Store.save();
    renderAll();
    const moved = document.querySelector(`.card[data-id="${t.id}"]`);
    if (moved) setTimeout(() => Anim.pulse(moved, 'landed'), 650);
  }

  function park(id) {
    const t = findTask(id);
    if (!t) return;
    Sound.swish(false);
    t.lane = 'someday';
    t.parkedAt = Date.now();
    t.boss = false;
    t.igniteUntil = 0;
    Store.save();
    renderAll();
  }

  function toggleBoss(id, el) {
    const t = findTask(id);
    if (!t) return;
    const wasBoss = t.boss;
    if (!wasBoss && bossSlainToday()) {
      Sound.denied();
      el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(0)' }], { duration: 320 });
      toast("You already slew today's boss. The crown recharges tomorrow.", 'boss');
      return;
    }
    for (const x of S().tasks) x.boss = false;
    t.boss = !wasBoss;
    Store.save();
    if (t.boss) {
      const bt = bossTierOf(t);
      const { x, y } = center(el);
      FX.burst(x, y, { count: 16 + bt.tier * 10, colors: ['#ff5d5d', a2()], speed: 4 + bt.tier });
      Sound.boom();
      Haptics.play('crown');
      FX.shake(bt.tier * 0.6);
      const hint = bt.tier < 4 ? ` Tasks you've avoided longer make stronger bosses (next: ${BOSS_TIERS[bt.tier].name} at ${BOSS_TIERS[bt.tier].minDays}+ days).` : '';
      toast(`${bt.name} crowned: ${bt.mult}× XP and better loot. One boss per day.${hint}`, 'boss');
    }
    renderAll();
  }

  function ignite(id, el) {
    const t = findTask(id);
    if (!t) return;
    if (t.igniteUntil > Date.now()) return;
    t.igniteUntil = Date.now() + IGNITE_MS;
    Store.save();
    const { x, y } = center(el);
    FX.burst(x, y, { count: 18, colors: [a2(), '#fff'], speed: 4, size: 4 });
    Sound.tick();
    FX.floatText(x, y - 10, 'Just 2 minutes. Go.', { color: a2(), size: 15 });
    renderAll();
  }

  let lastDeleted = null;
  function del(id, el) {
    const st = S();
    const idx = st.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    lastDeleted = { task: st.tasks[idx], idx };
    const card = el.closest('.card');
    Sound.thud();
    if (!Anim.reduce) {
      card.animate(
        [{ transform: card.style.transform || 'none', opacity: 1 }, { transform: 'translateX(-115%) rotate(-8deg)', opacity: 0 }],
        { duration: 260, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' },
      );
    }
    setTimeout(() => {
      card.remove();
      st.tasks.splice(idx, 1);
      Store.save();
      renderAll();
      toast('Task deleted.', '', { label: 'Undo', fn: () => {
        if (!lastDeleted) return;
        st.tasks.splice(lastDeleted.idx, 0, lastDeleted.task);
        lastDeleted = null;
        Store.save();
        renderAll();
      } });
    }, 200);
  }

  function editTitle(id, el) {
    const t = findTask(id);
    if (!t || el.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = t.title;
    input.maxLength = 140;
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v) { t.title = v; Store.save(); }
      renderAll();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  // Undo a win: removes the log entry and its rewards. Honesty keeps the rewards meaningful.
  function undoWin(logId) {
    const st = S();
    const i = st.log.findIndex((l) => l.id === logId);
    if (i < 0) return;
    const l = st.log[i];
    st.log.splice(i, 1);
    st.xp = Math.max(0, st.xp - l.xp);
    if (st.relics[l.relicId]) { st.relics[l.relicId]--; if (!st.relics[l.relicId]) delete st.relics[l.relicId]; }
    delete st.perfectDays[l.day];
    if (l.boss && st.bossSlainDay === l.day) st.bossSlainDay = null;
    if (l.dayOne) st.dayOnes = Math.max(0, st.dayOnes - 1);
    // Undoing the latest win also rewinds the combo chain and pity counter.
    if (i === st.log.length) {
      if (l.comboBefore) st.combo = { ...l.comboBefore };
      if (typeof l.pityBefore === 'number') st.pity = l.pityBefore;
    }
    // Finishing it again today gives back the same drop, so undo can't be used to re-roll loot.
    const reroll = { day: l.day, rarity: l.rarity, relicId: l.relicId, crit: l.crit };
    const t = findTask(l.taskId);
    if (t) { t.doneAt = null; t.reroll = reroll; }
    else st.tasks.push({ id: l.taskId, title: l.title, lane: 'today', createdAt: l.at, pulledAt: Date.now(), doneAt: null, boss: l.boss, carried: 0, igniteUntil: 0, ignited: false, reroll });
    Store.save();
    Sound.thud();
    renderAll();
  }

  // ---------------------------------------------------------------- the win
  function complete(id, orb) {
    const st = S();
    const t = findTask(id);
    if (!t || t.doneAt) return;
    const now = Date.now();
    const { x, y } = center(orb);
    const card = orb.closest('.card');

    const before = Store.streakInfo();
    const isNewDayOne = !before.doneToday && before.current === 0;
    const levelBefore = Store.levelInfo(st.xp).level;
    const openBefore = st.tasks.filter((k) => k.lane === 'today' && !k.doneAt).length;

    const comboBefore = { ...st.combo };
    const pityBefore = st.pity;
    const locked = t.reroll && t.reroll.day === today() && Loot.byId[t.reroll.relicId] ? t.reroll : null;
    delete t.reroll;

    // combo
    st.combo.count = now - st.combo.last < COMBO_WINDOW ? st.combo.count + 1 : 1;
    st.combo.last = now;
    const combo = st.combo.count;

    // boss
    const bt = t.boss ? bossTierOf(t) : null;
    if (bt) st.bossSlainDay = today();

    // loot
    const rarity = locked ? locked.rarity : Loot.roll({ bossTier: bt ? bt.tier : 0, combo, pity: st.pity });
    st.pity = rarity === 'epic' || rarity === 'legendary' ? 0 : st.pity + 1;
    const relic = locked ? Loot.byId[locked.relicId] : Loot.pick(rarity, st.relics);
    const firstFind = !st.relics[relic.id];
    st.relics[relic.id] = (st.relics[relic.id] || 0) + 1;
    const R = Loot.RARITY[rarity];

    // xp
    const crit = locked ? locked.crit : Math.random() < 0.12;
    const comboMult = 1 + Math.min(combo - 1, 8) * 0.25;
    let xp = 10 * (bt ? bt.mult : 1) * comboMult;
    if (crit) xp *= 2;
    xp += R.xp + (t.ignited ? 5 : 0) + (firstFind ? 15 : 0) + Math.min(before.current, 10);
    xp = Math.round(xp);
    st.xp += xp;

    const note = Math.min(15, combo - 1 + (t.boss ? 2 : 0));
    t.doneAt = now;
    t.igniteUntil = 0;
    st.log.push({
      id: Store.uid(), taskId: t.id, title: t.title, at: now, day: today(), xp, rarity,
      relicId: relic.id, note, combo, boss: !!bt, bossTier: bt ? bt.tier : 0, crit,
      dayOne: isNewDayOne, comboBefore, pityBefore,
    });
    if (isNewDayOne) st.dayOnes++;
    const perfect = openBefore === 1 && !st.perfectDays[today()];
    if (perfect) st.perfectDays[today()] = true;
    Store.save();

    // --- feel ---
    Sound.pluck(note);
    // Epic and legendary vibrate with their reveal card instead.
    if (bt) Haptics.play('boss');
    else if (rarity === 'rare') Haptics.play('rare');
    else if (rarity === 'common') Haptics.play('complete');
    if (crit) Sound.crit();
    if (rarity === 'rare') Sound.reveal('rare');
    const colors = [R.color, '#ffffff', t.boss ? '#ff5d5d' : a2(), a1()];
    FX.burst(x, y, { count: 36 + combo * 10 + (t.boss ? 60 : 0), colors, speed: 7 + Math.min(combo, 6) + (t.boss ? 4 : 0) });
    FX.floatText(x + 30, y - 10, `+${xp} XP`, { color: R.color, size: 22 + Math.min(combo, 6) * 2, cls: 'xp' });
    if (crit) FX.floatText(x + 30, y - 40, 'CRITICAL ×2', { color: '#ff7a59', size: 18, delay: 120, cls: 'crit' });
    if (combo >= 2) FX.floatText(x + 30, y + 16, `COMBO ×${combo}`, { color: '#6dffb0', size: 16, delay: 200 });
    if (firstFind && rarity !== 'epic' && rarity !== 'legendary') FX.floatText(x + 30, y - 66, 'NEW RELIC', { color: '#fff', size: 13, delay: 260 });
    FX.shake(t.boss ? 3.5 : combo >= 3 ? 1.5 : 0.8);
    $('#combo').classList.remove('pop'); void $('#combo').offsetWidth; $('#combo').classList.add('pop');

    // XP motes fly into the level ring; the bar fills when they land.
    hudFrozen = true;
    Anim.flyTo({ x, y }, $('#level'), {
      count: Math.min(6 + combo * 2 + (t.boss ? 8 : 0), 22), color: R.color === Loot.RARITY.common.color ? a2() : R.color,
      onArrive() { hudFrozen = false; renderLevel(); Anim.pulse($('#level'), 'gain'); Sound.pluck(Math.min(15, note + 4), 0, 0.08); },
    });

    if (bt) {
      Sound.bossDown();
      FX.flash(bt.tier >= 4 ? '#b77dff' : '#ff5d5d', 0.2 + bt.tier * 0.06);
      if (bt.tier >= 3) FX.confetti(['#ff5d5d', '#ffcf4a', '#ffffff', bt.tier >= 4 ? '#b77dff' : '#ff9a5d']);
      FX.floatText(innerWidth / 2, innerHeight * 0.38, `${bt.name.toUpperCase()} DEFEATED`, { color: a2(), size: 44 + bt.tier * 5, cls: 'mega', delay: 80 });
    }

    if (card) card.classList.add('completing');
    setTimeout(renderAll, 480);

    // streak moment
    if (!before.doneToday && before.current >= 1) {
      setTimeout(() => {
        const s = Store.streakInfo().current;
        const el = $('#streak');
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        toast(`${s}-day streak. Kept.`, 'streak');
      }, 700);
    }

    // queued reveals, most personal last
    const delay = 520;
    if (rarity === 'epic' || rarity === 'legendary') setTimeout(() => enqueue(revealOverlay(relic, xp, firstFind)), delay);
    else setTimeout(() => lootToast(relic, firstFind), delay);
    if (isNewDayOne) setTimeout(() => enqueue(dayOneOverlay(st.dayOnes)), delay);
    if (perfect) setTimeout(() => enqueue(perfectOverlay()), delay + 60);
    const levelAfter = Store.levelInfo(st.xp);
    if (levelAfter.level > levelBefore) setTimeout(() => enqueue(levelOverlay(levelAfter)), delay + 120);
  }

  // ---------------------------------------------------------------- hold-to-complete
  let hold = null;
  function startHold(orb, e) {
    if (hold) return;
    const id = orb.dataset.hold;
    const t = findTask(id);
    if (!t) return;
    e.preventDefault();
    Sound.unlock();
    try { orb.setPointerCapture(e.pointerId); } catch (_) { /* not all pointers support capture */ }
    const card = orb.closest('.card');
    const base = Prefs.holdMs();
    const dur = t.boss ? Math.round(bossTierOf(t).hold * (base / 650)) : base;
    const riser = Sound.riser(dur);
    const t0 = performance.now();
    card.classList.add('holding');
    // Haptic ticks while charging, closer together as it fills.
    Haptics.play('hold');
    const ticks = [0.35, 0.6, 0.8, 0.92].map((f) => setTimeout(() => Haptics.play('hold'), dur * f));
    const h = {
      orb, card, riser, t0, dur, done: false, raf: 0, timer: 0,
      cancel(showHint) {
        cancelAnimationFrame(h.raf);
        clearTimeout(h.timer);
        ticks.forEach(clearTimeout);
        riser.stop();
        card.classList.remove('holding');
        card.style.setProperty('--p', 0);
        hold = null;
        if (showHint && !h.done) {
          const { x, y } = center(orb);
          FX.floatText(x + 20, y - 10, 'Hold it…', { color: '#8a93b8', size: 14 });
        }
      },
    };
    // rAF drives the visuals; a timer owns completion so it fires even if frames stall.
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      card.style.setProperty('--p', p.toFixed(3));
      if (p < 1) h.raf = requestAnimationFrame(step);
    };
    h.raf = requestAnimationFrame(step);
    h.timer = setTimeout(() => {
      cancelAnimationFrame(h.raf);
      h.done = true;
      riser.stop();
      hold = null;
      card.style.setProperty('--p', 1);
      card.classList.remove('holding');
      complete(id, orb);
    }, dur);
    hold = h;
  }
  function endHold() {
    if (hold && !hold.done) hold.cancel(performance.now() - hold.t0 < hold.dur * 0.5);
  }

  // ---------------------------------------------------------------- overlays
  const overlay = $('#overlay');
  const queue = [];
  let showing = null;
  let readyAt = 0;
  let autoTimer = 0;
  const AUTO_MS = { auto: 3000, quick: 1500 };

  // Celebration setting: 'tap' waits for a click, 'auto'/'quick' close themselves,
  // 'toast' skips the full-screen card and keeps only the effects plus a toast.
  // Items marked `manual` (the welcome card) always wait for a click.
  function enqueue(item) {
    if (Prefs.get('celebrate') === 'toast' && !item.manual) {
      if (item.onShow) item.onShow();
      toast(item.summary || '', `celebrate ${item.cls || ''}`);
      return;
    }
    queue.push(item);
    if (!showing) nextOverlay();
  }
  function nextOverlay() {
    clearTimeout(autoTimer);
    const item = queue.shift();
    if (!item) {
      if (showing) {
        overlay.classList.add('leaving');
        showing = null;
        setTimeout(() => { if (document.activeElement === document.body) focusQuickAdd(); }, 250);
        setTimeout(() => { if (!showing) { overlay.hidden = true; overlay.innerHTML = ''; overlay.classList.remove('leaving'); } }, 220);
      }
      return;
    }
    showing = item;
    const mode = Prefs.get('celebrate');
    const ms = item.manual ? 0 : AUTO_MS[mode] || 0;
    overlay.className = `overlay ${item.cls || ''}`;
    overlay.innerHTML = `${item.html}${ms
      ? `<div class="overlay-timer" style="--ms:${ms}ms"><i></i></div><div class="overlay-hint">closes by itself · click to skip</div>`
      : '<div class="overlay-hint">click anywhere to continue</div>'}`;
    overlay.hidden = false;
    readyAt = performance.now() + (ms ? 250 : 650);
    if (item.onShow) item.onShow();
    if (ms) autoTimer = setTimeout(nextOverlay, ms);
  }
  overlay.addEventListener('click', (e) => {
    if (performance.now() < readyAt) return;
    if (showing && showing.onClick && showing.onClick(e) === false) return;
    nextOverlay();
  });
  addEventListener('keydown', (e) => {
    if (!showing) return;
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      if (performance.now() >= readyAt) nextOverlay();
    }
  });

  function revealOverlay(relic, xp, firstFind) {
    const R = Loot.RARITY[relic.rarity];
    return {
      cls: `reveal rarity-${relic.rarity}`,
      summary: `${R.label} drop: ${relic.name}${xp ? ` · +${xp} XP` : ' · preview'}${firstFind ? ' · new' : ''}`,
      html: `<div class="rays" style="--c:${R.glow}"></div>
        <div class="reveal-card" style="--c:${R.color}">
          <div class="reveal-rarity">${R.label} drop</div>
          <div class="reveal-gem">${Loot.gemSVG(relic, { size: 150 })}</div>
          <div class="reveal-name">${esc(relic.name)}</div>
          ${relic.lore ? `<div class="reveal-lore">${esc(relic.lore)}</div>` : ''}
          <div class="reveal-xp">${xp ? `+${xp} XP${firstFind ? ' · <b>NEW</b>' : ''}` : 'Preview · nothing granted'}</div>
        </div>`,
      onShow() {
        Sound.reveal(relic.rarity);
        Haptics.play(relic.rarity);
        FX.flash(R.color, relic.rarity === 'legendary' ? 0.55 : 0.3);
        FX.burst(innerWidth / 2, innerHeight / 2, { count: relic.rarity === 'legendary' ? 160 : 80, colors: [R.color, '#fff'], speed: 12, gravity: 0.1, life: 90 });
        if (relic.rarity === 'legendary') { FX.confetti(); FX.shake(3); }
      },
    };
  }

  function levelOverlay(lv) {
    return {
      cls: 'levelup',
      summary: `Level ${lv.level}: ${lv.title}`,
      html: `<div class="lv-card">
        <div class="lv-kicker">Level up</div>
        <div class="lv-num">${lv.level}</div>
        <div class="lv-title">${esc(lv.title)}</div>
        <div class="lv-sub">Next level in ${lv.need - lv.into} XP.</div>
      </div>`,
      onShow() { Sound.levelUp(); Haptics.play('level'); FX.confetti([a1(), a2(), '#ffffff', '#b77dff', '#4fc3ff']); FX.flash(a2(), 0.25); },
    };
  }

  function dayOneOverlay(n) {
    return {
      cls: 'dayone',
      summary: `Day One #${n} begins.`,
      html: `<div class="d1-card">
        <div class="d1-sun"></div>
        <div class="d1-kicker">${n === 1 ? 'It begins' : 'Back again'}</div>
        <div class="d1-title">Day One <span>#${n}</span></div>
        <div class="d1-sub">${n === 1
          ? 'You said it would happen one day. It happened today.'
          : 'Streaks break. People who restart them are the ones who get there. Not one day. Day one.'}</div>
      </div>`,
      onShow() { Sound.perfectDay(); FX.flash('#ff7a59', 0.3); },
    };
  }

  function perfectOverlay() {
    return {
      cls: 'perfect',
      summary: 'Perfect day. Day One: cleared.',
      html: `<div class="pf-card">
        <div class="pf-kicker">Perfect day</div>
        <div class="pf-title">Day One: cleared.</div>
        <div class="pf-sub">Everything you committed to today is done. Tonight this constellation burns gold in your sky.</div>
      </div>`,
      onShow() { Sound.perfectDay(); Haptics.play('perfect'); FX.confetti(['#ffcf4a', '#ffe9a8', '#ff7a59', '#ffffff']); FX.shake(2); },
    };
  }

  function welcomeOverlay() {
    return {
      cls: 'welcome',
      manual: true,
      html: `<div class="wl-card">
        <div class="wl-title"><span>One day</span> or <b>Day One</b>?</div>
        <ul>
          <li><b>One Day</b> is where someday tasks wait. They gather dust. You will see it.</li>
          <li><b>Day One</b> is today. Pull a task in and it stops being "one day."</li>
          <li><b>Press and hold</b> the orb to finish a task. Let go too early and nothing happens.</li>
          <li>Every win drops a <b>relic</b>. Most are common. Some are legendary. You never know which.</li>
          <li>Wins close together build a <b>combo</b>: more XP, rarer loot, and each note climbs higher.</li>
          <li>Crown one <b>boss</b> a day. The longer you avoided a task, the stronger it is: Minion 2×, Boss 3×, Elite 4×, Dread 5× XP.</li>
          <li>Every finished task becomes a star in your <b>Sky</b>. Every day becomes a song.</li>
          <li>On a keyboard, <b>just start typing</b>: it lands in One Day, Enter adds it. On a phone, <b>swipe</b> cards between lanes.</li>
        </ul>
        <div class="wl-go">Some sample tasks are loaded. Try holding one.</div>
      </div>`,
      onShow() { Sound.unlock(); },
    };
  }

  // ---------------------------------------------------------------- toasts
  function toast(text, kind = '', action = null) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<span>${esc(text)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.fn(); el.remove(); };
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), action ? 5000 : 3200);
    setTimeout(() => el.remove(), action ? 5500 : 3700);
  }

  function lootToast(relic, firstFind) {
    const R = Loot.RARITY[relic.rarity];
    const el = document.createElement('div');
    el.className = `toast loot rarity-${relic.rarity}`;
    el.style.setProperty('--c', R.color);
    el.innerHTML = `${Loot.gemSVG(relic, { size: 34 })}<div><div class="loot-r">${R.label}${firstFind ? ' · new' : ''}</div><div class="loot-n">${esc(relic.name)}</div></div>`;
    $('#toasts').appendChild(el);
    // The relic then flies from the toast into the Vault tab.
    setTimeout(() => {
      const gem = el.querySelector('.gem');
      if (gem && el.isConnected) {
        const vaultTab = $('[data-view="vault"]');
        Anim.flyEl(Loot.gemSVG(relic, { size: 34 }), center(gem), vaultTab, { dur: 850 });
        gem.classList.add('sent');
        setTimeout(() => { Anim.pulse(vaultTab, 'got'); Sound.pluck(12, 0, 0.06); }, 800);
      }
    }, 1500);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  // ---------------------------------------------------------------- brand, song, ticker
  function flipBrand() {
    const b = $('#brand');
    b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip');
  }

  function playDay(day) {
    const entries = S().log.filter((l) => l.day === day).sort((a, b) => a.at - b.at);
    if (!entries.length) return;
    Sound.unlock();
    const label = day === today() ? 'today' : new Date(entries[0].at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    toast(`Playing ${label}: ${entries.length} win${entries.length === 1 ? '' : 's'}, ${entries.length} note${entries.length === 1 ? '' : 's'}.`, 'song');
    Sound.playSong(entries, (e) => {
      Sky.light(e.id);
      const btn = $('#songBtn');
      btn.classList.remove('beat'); void btn.offsetWidth; btn.classList.add('beat');
    });
  }

  function tick() {
    if (rollover()) renderAll();
    renderCombo();
    const st = S();
    const now = Date.now();
    let changed = false;
    for (const t of st.tasks) {
      if (!t.igniteUntil) continue;
      const chip = document.querySelector(`[data-ignite="${t.id}"]`);
      if (t.igniteUntil > now) {
        if (chip) chip.textContent = `${fmtClock(t.igniteUntil - now)} · just start`;
      } else if (!t.doneAt) {
        t.igniteUntil = 0;
        t.ignited = true;
        const lvBefore = Store.levelInfo(st.xp).level;
        st.xp += 5;
        changed = true;
        Sound.chord([4, 7, 9], 0, 0.12, 1);
        toast(`Two minutes on "${t.title}". You started, which is the hard part. +5 XP. Keep going?`, 'ignite');
        const lv = Store.levelInfo(st.xp);
        if (lv.level > lvBefore) enqueue(levelOverlay(lv));
      }
    }
    if (changed) { Store.save(); renderAll(); }
  }

  // ---------------------------------------------------------------- views
  function moveInk() {
    const btn = $(`.tabs button[data-view="${currentView}"]`);
    const ink = $('#tabInk');
    ink.style.width = `${btn.offsetWidth - 24}px`;
    ink.style.transform = `translateX(${btn.offsetLeft + 12}px)`;
  }

  // Tabs slide in the direction you move (View Transitions API where supported, CSS fallback otherwise).
  function setView(v) {
    if (v === currentView) return;
    const dir = VIEWS.indexOf(v) > VIEWS.indexOf(currentView) ? 'fwd' : 'back';
    const swap = () => {
      currentView = v;
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
      for (const id of VIEWS) $(`#view-${id}`).hidden = id !== v;
      if (v !== 'sky') Sky.stop();
      moveInk();
      renderAll();
    };
    const html = document.documentElement;
    html.dataset.dir = dir;
    Sound.swish(dir === 'fwd');
    if (document.startViewTransition && !Anim.reduce) {
      // Rapid tab switches skip the running transition; that rejection is expected, not an error.
      const vt = document.startViewTransition(swap);
      const ignore = () => {};
      vt.ready.catch(ignore);
      vt.finished.catch(ignore);
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(ignore);
    } else {
      swap();
      const el = $(`#view-${v}`);
      el.classList.remove('enter-fwd', 'enter-back');
      void el.offsetWidth;
      el.classList.add(`enter-${dir}`);
    }
  }

  // ---------------------------------------------------------------- events
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  document.querySelectorAll('form.add').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    Sound.unlock();
    addTask(f.title.value, f.dataset.lane);
    f.title.value = '';
    f.title.focus();
  }));

  const main = $('main');
  main.addEventListener('pointerdown', (e) => {
    const orb = e.target.closest('.orb');
    if (orb && e.button === 0) startHold(orb, e);
  });
  addEventListener('pointerup', endHold);
  addEventListener('pointercancel', endHold);
  main.addEventListener('contextmenu', (e) => { if (e.target.closest('.orb')) e.preventDefault(); });

  main.addEventListener('keydown', (e) => {
    const orb = e.target.closest && e.target.closest('.orb');
    if (orb && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (!e.repeat) complete(orb.dataset.hold, orb);
    }
  });

  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    Sound.unlock();
    const card = el.closest('[data-id]');
    const id = el.dataset.id || (card && card.dataset.id);
    switch (el.dataset.act) {
      case 'pull': pull(id, el); break;
      case 'park': park(id, el); break;
      case 'boss': toggleBoss(id, el); break;
      case 'ignite': ignite(id, el); break;
      case 'delete': del(id, el); break;
      case 'edit': editTitle(id, el); break;
      case 'undo': undoWin(el.dataset.log); break;
    }
  });

  $('#songBtn').addEventListener('click', () => {
    if (!todayLog().length) { toast('No notes yet. Every win today adds one.', 'song'); return; }
    playDay(today());
  });

  $('#soundBtn').addEventListener('click', () => {
    Prefs.set('sound', !Prefs.get('sound'));
    if (Prefs.get('sound')) Sound.pluck(4);
  });
  Prefs.onChange((k) => {
    if (k === 'sound') renderHUD();
    if (k === 'radius' || k === 'density' || k === 'font') moveInk();
  });
  $('#lockBtn').addEventListener('click', () => Lock.lockNow());

  // ---------------------------------------------------------------- settings sheet
  const sheet = $('#settings');
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function renderSettings() {
    Prefs.render($('#prefs'));
    DesktopPrefs.render($('#desktopPrefs'));
    const lockEl = $('#setLock');
    if (Lock.enabled) {
      lockEl.innerHTML = `
        <div class="set-row"><div><b>Passcode is on</b><span>Asked when the app opens and after it has been in the background.</span></div><span class="badge-on">On</span></div>
        <div class="set-row"><div><b>Auto-lock</b><span>Time in the background before it asks again</span></div>
          <select id="setAuto">${Lock.AUTO_OPTIONS.map(([ms, label]) => `<option value="${ms}" ${ms === Lock.auto ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="set-actions">
          <button class="set-btn rp" data-set="lock-now">Lock now</button>
          <button class="set-btn rp" data-set="lock-change">Change passcode</button>
          <button class="set-btn rp danger" data-set="lock-remove">Turn off</button>
        </div>`;
      $('#setAuto').addEventListener('change', (e) => { Lock.auto = +e.target.value; });
    } else {
      lockEl.innerHTML = `
        <div class="set-row"><div><b>Passcode is off</b><span>Add a 4-digit code so nobody opens your list on your phone.</span></div></div>
        <div class="set-actions"><button class="set-btn rp primary" data-set="lock-set">Set passcode</button></div>`;
    }
    const hint = $('#installHint');
    if (isStandalone()) {
      hint.innerHTML = '<b>Installed.</b> Running as an app. Data stays on this device; use Export to move it.';
    } else {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      hint.innerHTML = ios
        ? '<b>Install on iPhone:</b> open this page in Safari, tap <b>Share</b> then <b>Add to Home Screen</b>. It opens full-screen and works offline.'
        : '<b>Install:</b> in Chrome or Edge, use the install icon in the address bar (or menu → Install app). On iPhone: Safari → Share → Add to Home Screen.';
    }
  }

  function openSettings() {
    renderSettings();
    sheet.hidden = false;
    sheet.classList.remove('closing');
  }
  function closeSettings() {
    if (sheet.hidden) return;
    DesktopPrefs.stop();
    sheet.classList.add('closing');
    setTimeout(() => { sheet.hidden = true; sheet.classList.remove('closing'); }, 260);
  }
  $('#settingsBtn').addEventListener('click', openSettings);
  Prefs.bind($('#prefs'), {
    onPreview(key) {
      if (key !== 'celebrate') return;
      // Show a sample drop with the current celebration setting. Nothing is granted.
      closeSettings();
      const pool = Loot.RELICS.epic;
      setTimeout(() => enqueue(revealOverlay(pool[Math.floor(Math.random() * pool.length)], 0, false)), 300);
    },
  });
  sheet.addEventListener('click', async (e) => {
    if (e.target === sheet) { closeSettings(); return; }
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const act = b.dataset.set;
    if (act === 'close') closeSettings();
    if (act === 'export') exportData();
    if (act === 'import') $('#importFile').click();
    if (act === 'demo') { seedDemo(); closeSettings(); setTimeout(renderAll, 200); toast('Sample tasks added.'); }
    if (act === 'reset') {
      if (confirm('Erase every task, relic, star and streak on this device? This cannot be undone. Export a backup first if unsure.')) {
        Store.replace(Object.assign(Store.fresh(), { settings: S().settings })); // keep look & sound settings
        closeSettings();
        renderAll();
        toast('Clean slate. Day One.');
      }
    }
    if (act === 'lock-set') { if (await Lock.setup()) toast('Passcode set. The app locks when it opens and after time in the background.', 'lock'); renderSettings(); renderHUD(); }
    if (act === 'lock-change') { if (await Lock.change()) toast('Passcode changed.', 'lock'); renderSettings(); }
    if (act === 'lock-remove') { if (await Lock.remove()) toast('Passcode turned off.', 'lock'); renderSettings(); renderHUD(); }
    if (act === 'lock-now') { closeSettings(); setTimeout(() => Lock.lockNow(), 280); }
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.log)) throw new Error('Not a One Day or Day One backup.');
      if (!confirm('Replace current data with this backup?')) return;
      Store.replace(data);
      rollover();
      Prefs.apply();
      renderSettings();
      renderAll();
      toast('Backup restored.');
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(S(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `one-day-or-day-one-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- keyboard
  const laneInput = (lane) => $(`form[data-lane="${lane}"] input`);
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;

  // Put the caret in the quick-add input (Settings → Type anywhere). Skipped on touch screens,
  // where focusing would pop the on-screen keyboard uninvited.
  function focusQuickAdd({ force = false } = {}) {
    if ((isTouch && !force) || Lock.isOpen() || showing || !sheet.hidden) return null;
    if (currentView !== 'today') setView('today');
    const input = laneInput(Prefs.get('quickLane'));
    input.focus({ preventScroll: false });
    return input;
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) { closeSettings(); return; }
    if (showing || !sheet.hidden || Lock.isOpen()) return;
    const el = document.activeElement;
    const tag = el && el.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape' && typing) { el.blur(); return; }

    // Alt shortcuts work anywhere, even mid-typing. e.code, because Option changes e.key on macOS.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const act = {
        Digit1: () => setView('today'), Digit2: () => setView('vault'), Digit3: () => setView('sky'),
        KeyD: () => { setView('today'); laneInput('today').focus(); },
        KeyO: () => { setView('today'); laneInput('someday').focus(); },
        KeyL: () => Lock.lockNow(),
      }[e.code];
      if (act) { e.preventDefault(); act(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.isComposing) return;

    // Type anywhere: the first printable key starts a new task in the quick-add lane.
    if (e.key.length === 1 && e.key !== ' ' && !e.repeat) {
      const input = focusQuickAdd({ force: true });
      if (!input) return;
      e.preventDefault();
      input.value += e.key;
      input.setSelectionRange(input.value.length, input.value.length);
      Anim.pulse(input.closest('.add'), 'catch');
    }
  });

  // ---------------------------------------------------------------- sample data
  function seedDemo() {
    const now = Date.now();
    const day = 864e5;
    const mk = (title, lane, ageDays, extra = {}) => ({
      id: Store.uid(), title, lane, createdAt: now - ageDays * day,
      parkedAt: lane === 'someday' ? now - ageDays * day : null, pulledAt: lane === 'today' ? now : null,
      doneAt: null, boss: false, carried: 0, igniteUntil: 0, ignited: false, ...extra,
    });
    S().tasks.push(
      mk('Reply to the email I keep avoiding', 'today', 9, { boss: true, carried: 2 }),
      mk('10-minute walk', 'today', 0),
      mk('Drink a glass of water', 'today', 0),
      mk('Learn to play guitar', 'someday', 47),
      mk('Clean out the garage', 'someday', 16),
      mk('Start the side project', 'someday', 5),
      mk('Call grandma', 'someday', 1),
    );
    Store.save();
  }

  // ---------------------------------------------------------------- swipe + tilt
  Anim.swipe(main, '.card[data-id]', {
    canLeft: () => true,
    canRight: (card) => card.classList.contains('someday'),
    onLeft: (card) => (card.classList.contains('someday') ? del(card.dataset.id, card) : park(card.dataset.id)),
    onRight: (card) => pull(card.dataset.id, card),
  });
  Anim.tilt($('#vaultGrid'), '.relic:not(.missing)');

  // ---------------------------------------------------------------- boot
  let firstRun = false;
  try { firstRun = !localStorage.getItem(Store.KEY); } catch (_) { /* storage blocked: run without persistence */ }
  Store.load();
  Prefs.apply();
  rollover();
  if (firstRun) seedDemo();
  Anim.ambient();
  Lock.init();
  Sky.mount($('#skyWrap'), $('#sky'), $('#skyTip'), playDay);
  renderAll();
  moveInk();
  addEventListener('resize', moveInk);
  if (firstRun) enqueue(welcomeOverlay());
  else focusQuickAdd();
  Lock.onUnlock(() => setTimeout(() => focusQuickAdd(), 300));
  // Desktop app: the global shortcut brought the window forward, so be ready to type.
  if (window.desktop) window.desktop.onShown(() => setTimeout(() => focusQuickAdd({ force: true }), 60));
  // Coming back to the window (alt-tab, the desktop shortcut): ready to type again.
  addEventListener('focus', () => { if (document.activeElement === document.body) focusQuickAdd(); });
  // The quick-add lane's placeholder says you can just type (keyboards only).
  function setPlaceholders() {
    const quick = !isTouch && Prefs.get('quickLane');
    laneInput('someday').placeholder = quick === 'someday' ? 'Just start typing. It lands here.' : 'Park it here. It will gather dust.';
    laneInput('today').placeholder = quick === 'today' ? 'Just start typing. What makes today Day One?' : 'What makes today Day One?';
  }
  setPlaceholders();
  Prefs.onChange((k) => { if (k === 'quickLane') setPlaceholders(); });
  setInterval(tick, 1000);
  setInterval(Anim.setPhase, 60000);
  // Recorded instruments load in the background; the synth covers anything played before they arrive.
  setTimeout(() => Sound.loadSamples(), 600);

  // Offline support once served over http(s). Opening index.html from disk skips this.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered:', err));
  }
})();
