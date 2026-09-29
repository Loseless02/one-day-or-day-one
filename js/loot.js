'use strict';

// Variable rewards. Every win rolls a relic; rarity is random, with a pity timer
// so a dry streak always ends in something big.
const Loot = (() => {
  const RARITY = {
    common:    { label: 'Common',    color: '#a9bccf', glow: 'rgba(169,188,207,.45)', xp: 0,   sides: 4 },
    rare:      { label: 'Rare',      color: '#4fc3ff', glow: 'rgba(79,195,255,.55)',  xp: 10,  sides: 6 },
    epic:      { label: 'Epic',      color: '#b77dff', glow: 'rgba(183,125,255,.6)',  xp: 30,  sides: 8 },
    legendary: { label: 'Legendary', color: '#ffcf4a', glow: 'rgba(255,207,74,.75)',  xp: 100, sides: 10 },
  };
  const ORDER = ['common', 'rare', 'epic', 'legendary'];
  const PITY_LIMIT = 12;

  const RELICS = {
    common: [
      ['pebble', 'Pebble of Starting'], ['thread', 'Loose Thread'], ['mug', 'Warm Mug'],
      ['pencil', 'Chipped Pencil'], ['crane', 'Paper Crane'], ['crumb', 'Morning Crumb'],
      ['lantern', 'Small Lantern'], ['key', 'Brass Key'], ['map', 'Folded Map'],
      ['candle', 'Candle Stub'], ['stone', 'River Stone'], ['note', 'Sticky Note'],
      ['bell', 'Tiny Bell'], ['button', 'Lost Button'],
    ],
    rare: [
      ['comet', 'Quiet Comet'], ['compass', 'Tidewater Compass'], ['ember', 'Ember Seed'],
      ['feather', 'Glass Feather'], ['lens', 'Night Owl Lens'], ['heart', 'Copper Heartbeat'],
      ['mask', 'Fox Mask'], ['hourglass', 'Silver Hourglass'], ['marble', 'Momentum Marble'],
      ['fork', 'Tuning Fork'],
    ],
    epic: [
      ['resolve', 'Obsidian Resolve', 'Forged from every excuse you did not make.'],
      ['aurora', 'Aurora Shard', 'It hums when you are about to procrastinate.'],
      ['phoenix', 'Clockwork Phoenix', 'Burns out at night. Rebuilds itself by morning.'],
      ['anvil', 'Moonlit Anvil', 'Where vague plans are hammered into tasks.'],
      ['crown', 'Crown of Focus', 'Heavy. Worth it.'],
      ['quill', 'Thunder Quill', 'Writes lists that actually get finished.'],
      ['void', 'Void Lantern', 'Lights exactly one next step. That is enough.'],
    ],
    legendary: [
      ['dayone', 'Heart of Day One', 'Someone once said "one day." Then they said "day one." This is what was left.'],
      ['sunrise', 'The First Sunrise', 'Every streak you ever start carries a little of this light.'],
      ['chain', 'The Unbroken Chain', 'Links forged one day at a time. Never by accident.'],
      ['checkbox', "Philosopher's Checkbox", 'Turns "later" into "done." Handle with care.'],
      ['cometcrown', 'Comet Crown', 'Worn by those who finish the thing they kept avoiding.'],
    ],
  };

  const byId = {};
  for (const r of ORDER) {
    RELICS[r] = RELICS[r].map(([id, name, lore]) => {
      const relic = { id: `${r}:${id}`, name, lore: lore || '', rarity: r };
      byId[relic.id] = relic;
      return relic;
    });
  }

  // Extra odds per boss tier: none, Minion, Boss, Elite, Dread.
  const BOSS_LEG = [0, 0.01, 0.04, 0.08, 0.13];
  const BOSS_EPIC = [0, 0.04, 0.12, 0.18, 0.25];
  const BOSS_RARE = [0, 0.05, 0.1, 0.12, 0.15];

  function roll({ bossTier = 0, combo = 1, pity = 0 } = {}) {
    const c = Math.min(combo, 8);
    if (pity >= PITY_LIMIT - 1) return Math.random() < 0.2 + bossTier * 0.05 ? 'legendary' : 'epic';
    const leg = 0.015 + BOSS_LEG[bossTier] + c * 0.003;
    const epic = 0.07 + BOSS_EPIC[bossTier] + c * 0.01;
    const rare = 0.22 + BOSS_RARE[bossTier];
    const r = Math.random();
    if (r < leg) return 'legendary';
    if (r < leg + epic) return 'epic';
    if (r < leg + epic + rare) return 'rare';
    return 'common';
  }

  // Prefer relics you have not found yet, so the collection keeps growing.
  function pick(rarity, owned = {}) {
    const list = RELICS[rarity];
    const missing = list.filter((r) => !owned[r.id]);
    const pool = missing.length && Math.random() < 0.6 ? missing : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    // avalanche so near-identical strings (consecutive dates) land far apart
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  // Faceted gem, deterministic per relic.
  function gemSVG(relic, { size = 64, locked = false } = {}) {
    const R = RARITY[relic.rarity];
    const h = hash(relic.id);
    const sides = R.sides;
    const rot = (h % 360) * Math.PI / 180;
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const rr = relic.rarity === 'legendary' ? (i % 2 ? 19 : 30) : 28 - ((h >> (i * 3)) & 3);
      pts.push([32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr]);
    }
    const inner = pts.map(([x, y]) => [32 + (x - 32) * 0.45, 32 + (y - 32) * 0.45]);
    const id = `g${h.toString(36)}${locked ? 'l' : ''}`;
    const col = locked ? '#20263b' : R.color;
    const facets = pts.map(([x, y], i) => {
      const [x2, y2] = pts[(i + 1) % sides];
      const [ix, iy] = inner[i];
      const [ix2, iy2] = inner[(i + 1) % sides];
      const op = locked ? 0.05 : 0.08 + ((h >> i) & 7) / 30;
      return `<polygon points="${x},${y} ${x2},${y2} ${ix2},${iy2} ${ix},${iy}" fill="#fff" fill-opacity="${op.toFixed(2)}"/>`;
    }).join('');
    return `<svg class="gem ${locked ? 'locked' : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="40%" cy="35%" r="70%">
        <stop offset="0" stop-color="#fff" stop-opacity="${locked ? 0.05 : 0.9}"/>
        <stop offset="0.35" stop-color="${col}"/>
        <stop offset="1" stop-color="${locked ? '#11141f' : '#000'}" stop-opacity="${locked ? 1 : 0.55}"/>
      </radialGradient></defs>
      <polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${col}"/>
      <polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="url(#${id})"/>
      ${facets}
      <polygon points="${inner.map((p) => p.join(',')).join(' ')}" fill="#fff" fill-opacity="${locked ? 0.03 : 0.18}"/>
      ${locked ? '<text x="32" y="38" text-anchor="middle" font-size="18" font-weight="700" fill="#3a4263">?</text>' : ''}
    </svg>`;
  }

  return { RARITY, ORDER, RELICS, PITY_LIMIT, byId, roll, pick, gemSVG, hash, total: Object.keys(byId).length };
})();
