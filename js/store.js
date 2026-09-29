'use strict';

// Persistence, dates, and derived stats. Everything lives in localStorage.
const Store = (() => {
  const KEY = 'onedaydayone.v1';

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const keyToUTC = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const daysBetween = (a, b) => Math.round((keyToUTC(b) - keyToUTC(a)) / 864e5);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

  function fresh() {
    return {
      version: 1,
      tasks: [],          // {id, title, lane:'today'|'someday', createdAt, parkedAt, pulledAt, doneAt, boss, carried, igniteUntil, ignited}
      log: [],            // {id, taskId, title, at, day, xp, rarity, relicId, note, combo, boss, bossTier, crit}
      bossSlainDay: null, // dayKey of the last boss kill: one boss per day
      xp: 0,
      relics: {},         // relicId -> count
      pity: 0,            // completions since last epic+
      dayOnes: 0,         // how many times a streak (re)started
      perfectDays: {},    // dayKey -> true when every Day One task got done
      combo: { count: 0, last: 0 },
      lastDay: dayKey(),
      settings: { sound: true },
    };
  }

  let state = fresh();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(fresh(), parsed);
        state.settings = Object.assign(fresh().settings, parsed.settings);
        state.combo = Object.assign(fresh().combo, parsed.combo);
      }
    } catch (e) {
      console.warn('Could not load saved data, starting fresh.', e);
      state = fresh();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save.', e);
    }
  }

  function replace(next) {
    state = Object.assign(fresh(), next);
    save();
  }

  // Streak = consecutive days (ending today, or yesterday if today has no win yet) with >=1 win.
  function streakInfo() {
    const days = new Set(state.log.map((l) => l.day));
    const today = dayKey();
    const d = new Date();
    const doneToday = days.has(today);
    if (!doneToday) d.setDate(d.getDate() - 1);
    let current = 0;
    while (days.has(dayKey(d))) {
      current++;
      d.setDate(d.getDate() - 1);
    }
    let best = 0, run = 0, prev = null;
    for (const k of [...days].sort()) {
      run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    return { current, best, doneToday };
  }

  // Level curve: each level needs a bit more than the last.
  const TITLES = [
    [1, 'Spark'], [3, 'Starter'], [5, 'Mover'], [8, 'Finisher'], [12, 'Relentless'],
    [16, 'Unstoppable'], [20, 'Dawnbringer'], [30, 'Legend of Day One'],
  ];
  function levelInfo(xp) {
    let level = 1, acc = 0, need = 100;
    while (xp >= acc + need) {
      acc += need;
      level++;
      need = Math.round(100 + 45 * (level - 1));
    }
    let title = TITLES[0][1];
    for (const [min, t] of TITLES) if (level >= min) title = t;
    return { level, into: xp - acc, need, title };
  }

  return {
    KEY, load, save, replace, fresh, dayKey, daysBetween, uid, streakInfo, levelInfo,
    get state() { return state; },
  };
})();
