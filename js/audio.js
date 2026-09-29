'use strict';

// All sound is synthesized with Web Audio (no files, works offline): a small jazz band of
// piano, saxophone, Rhodes, choir, upright bass and ride cymbal, played into a room reverb.
const Sound = (() => {
  let ctx = null, master = null, bus = null, noiseBuf = null;
  let enabled = true;
  let voice = 'jazz';
  let volume = 0.7;
  let compStep = 0;
  let useSamples = true;
  const MASTER = 0.9;

  // Recorded instruments (see README for credits). Each note is pitch-shifted from the nearest
  // recording. If they can't load (e.g. index.html opened straight from disk), the synth plays instead.
  const SAMPLE_NOTES = {
    piano: ['C3', 'Fs3', 'C4', 'Fs4', 'C5', 'Fs5', 'C6'],
    sax: ['As3', 'D4', 'Fs4', 'As4', 'D5', 'Fs5', 'A5'],
  };
  const SAMPLE_GAIN = { piano: 2.4, sax: 2.3 }; // matches the recordings' loudness to the synth (measured)
  const PC = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
  const bank = {};
  let loading = null;

  function loadSamples(base = 'samples/') {
    if (loading) return loading;
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!C || !window.fetch) return Promise.resolve(false);
    const decoder = new C(1, 1, 44100);
    loading = Promise.all(Object.entries(SAMPLE_NOTES).map(async ([kind, names]) => {
      const set = await Promise.all(names.map(async (name) => {
        const [, pc, oct] = name.match(/^([A-G]s?)(\d)$/);
        const res = await fetch(`${base}${kind}/${name}.mp3`);
        if (!res.ok) throw new Error(`${res.status} ${name}`);
        const buf = await decoder.decodeAudioData(await res.arrayBuffer());
        return { semi: (+oct - 4) * 12 + PC[pc], buf };
      }));
      bank[kind] = set;
    })).then(() => true).catch((err) => {
      console.info('Recorded instruments unavailable, using the synth.', err.message);
      for (const k of Object.keys(bank)) delete bank[k];
      return false;
    });
    return loading;
  }

  // Play the nearest recording, pitch-shifted. Returns false when no recording is loaded.
  function sampled(kind, semi, t, vol, { dur = 1.5, release = 0.5, attack = 0.004, scoop = false, fall = false } = {}) {
    const set = useSamples && bank[kind];
    if (!set) return false;
    let best = set[0];
    for (const s of set) if (Math.abs(s.semi - semi) < Math.abs(best.semi - semi)) best = s;
    const rate = Math.pow(2, (semi - best.semi) / 12);
    const src = ctx.createBufferSource();
    src.buffer = best.buf;
    src.playbackRate.setValueAtTime(scoop ? rate * 0.95 : rate, t);
    if (scoop) src.playbackRate.exponentialRampToValueAtTime(rate, t + 0.07);
    const end = t + dur;
    if (fall) {
      src.playbackRate.setValueAtTime(rate, end - 0.04);
      src.playbackRate.exponentialRampToValueAtTime(rate * 0.72, end + release);
    }
    const g = gain(0, bus);
    const v = vol * SAMPLE_GAIN[kind];
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.setValueAtTime(v, end);
    g.gain.setTargetAtTime(0, end, release / 3);
    src.connect(g);
    src.start(t);
    src.stop(end + release + 0.1);
    return true;
  }

  // Melody scale: major pentatonic plus the major 7th (C D E G A B). Every one of these notes
  // belongs to all the comping chords below, so any sequence of wins plays back as a melody.
  const SCALE = [0, 2, 4, 7, 9, 11];
  const semiOf = (i) => {
    const n = Math.max(0, Math.min(13, Math.round(i)));
    return 12 * Math.floor(n / 6) + SCALE[n % 6];
  };
  const hz = (semi) => 261.63 * Math.pow(2, semi / 12); // semitones from C4

  // Rootless piano voicings (semitones from C4) with their bass roots.
  const CHORDS = [
    { v: [-8, -1, 2, 7], bass: -24 }, // Cmaj9     E B D G  / C
    { v: [-5, 0, 2, 4], bass: -27 }, //  Am11      G C D E  / A
    { v: [-3, 4, 7, 11], bass: -31 }, // Fmaj9#11  A E G B  / F
    { v: [-8, -1, 2, 9], bass: -20 }, // C6/9      E B D A  / E
  ];
  const DM9 = [-7, -3, 0, 4];   // F A C E
  const G13 = [-7, -1, 4, 9];   // F B E A
  const CMAJ9 = CHORDS[0].v;
  const C7SHARP9 = [-8, -2, 3, 7];

  const SOFT_CLIP = (() => {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
    return c;
  })();

  function ac() {
    if (!enabled) return null;
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
      const tone = ctx.createBiquadFilter(); // takes the edge off everything
      tone.type = 'lowpass'; tone.frequency.value = 8500; tone.Q.value = 0.5;
      master = ctx.createGain();
      master.gain.value = MASTER * volume;
      master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = impulse(2.4);
      const send = ctx.createGain();
      send.gain.value = 0.55;
      bus = ctx.createGain();
      bus.connect(master); bus.connect(send); send.connect(verb); verb.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    return ctx;
  }

  // Club-sized reverb: decaying, darkened stereo noise.
  function impulse(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        y += ((Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) - y) * 0.35;
        d[i] = y;
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------ building blocks
  function gain(v, dest) {
    const g = ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  function osc(type, f, t, stop, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (dest) o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }
  function filter(type, f, q, dest) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  function noiseSrc(t, stop, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random());
    s.stop(stop);
    return s;
  }

  // ------------------------------------------------------------------ instruments
  // Piano: slightly inharmonic partials that die away faster the higher they are, two detuned
  // strings on the fundamental, a darkening filter and a soft hammer thump.
  function piano(semi, t, vol = 0.2, dur = 1.6) {
    if (sampled('piano', semi, t, vol, { dur, release: 0.6 })) return;
    const f = hz(semi);
    const out = gain(1, bus);
    const lp = filter('lowpass', Math.min(f * 8, 6000), 0.6, out);
    lp.frequency.setValueAtTime(Math.min(f * 8, 6000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 3, 2600), t + 0.6);
    const PART = [1, 0.42, 0.22, 0.12, 0.07, 0.04];
    PART.forEach((amp, k) => {
      const n = k + 1;
      const fn = f * n * Math.sqrt(1 + 0.00035 * n * n);
      if (fn > 11000) return;
      const decay = dur / (1 + k * 0.9);
      const strings = k === 0 ? [1, 1.0012] : [1];
      strings.forEach((det, s) => {
        const g = gain(0, lp);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * amp * (s ? 0.35 : 1), t + 0.004);
        g.gain.setTargetAtTime(0, t + 0.004, decay / 4);
        osc('sine', fn * det, t, t + dur + 0.3, g);
      });
    });
    const hg = gain(0, out);
    hg.gain.setValueAtTime(vol * 0.12, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noiseSrc(t, t + 0.05, filter('bandpass', Math.min(f * 4, 3500), 1, hg));
  }

  // Rhodes electric piano: FM bell tone with a quick metallic tine.
  function rhodes(semi, t, vol = 0.2, dur = 1.8) {
    const f = hz(semi);
    const out = gain(0, bus);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 0.006);
    out.gain.setTargetAtTime(0, t + 0.006, dur / 4);
    const stop = t + dur + 0.3;
    const car = osc('sine', f, t, stop, out);
    const mg = gain(0);
    mg.gain.setValueAtTime(f * 1.8, t);
    mg.gain.setTargetAtTime(f * 0.12, t, 0.12);
    osc('sine', f, t, stop, mg);
    mg.connect(car.frequency);
    const tg = gain(0, out);
    tg.gain.setValueAtTime(0.06, t);
    tg.gain.setTargetAtTime(0, t, 0.025);
    osc('sine', f * 7.1, t, stop, tg);
  }

  // Saxophone: reedy saw + square through a vocal peak and a breathing filter, a jazz scoop
  // into the note, vibrato that blooms as it sustains, breath noise, optional fall-off.
  function sax(semi, t, vol = 0.14, dur = 0.55, { scoop = true, fall = false } = {}) {
    if (sampled('sax', semi, t, vol, { dur, release: 0.22, attack: 0.02, scoop, fall })) return;
    const f = hz(semi);
    const end = t + dur;
    const stop = end + 0.3;
    const out = gain(0, bus);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 0.045);
    out.gain.linearRampToValueAtTime(vol * 0.78, t + 0.18);
    out.gain.setValueAtTime(vol * 0.78, end);
    out.gain.linearRampToValueAtTime(0, end + 0.18);
    const lp = filter('lowpass', 600, 1.2, out);
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(2500, t + 0.07);
    lp.frequency.linearRampToValueAtTime(1600, t + 0.3);
    const peak = filter('peaking', 1100, 1.1, lp);
    peak.gain.value = 5;
    const shaper = ctx.createWaveShaper();
    shaper.curve = SOFT_CLIP;
    shaper.connect(peak);
    const pre = gain(0.5, shaper);
    const o1 = osc('sawtooth', f, t, stop, pre);
    const o2 = osc('square', f, t, stop, gain(0.3, pre));
    const lg = gain(0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.35);
    osc('sine', 5.3, t, stop, lg);
    for (const o of [o1, o2]) {
      o.frequency.setValueAtTime(scoop ? f * 0.94 : f, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      if (fall) {
        o.frequency.setValueAtTime(f, end - 0.04);
        o.frequency.exponentialRampToValueAtTime(f * 0.7, end + 0.18);
      }
      lg.connect(o.frequency);
    }
    const ng = gain(0, out);
    ng.gain.setValueAtTime(0.1, t);
    ng.gain.linearRampToValueAtTime(0.03, t + 0.12);
    noiseSrc(t, stop, filter('bandpass', Math.min(f * 3, 4000), 0.8, ng));
  }

  // Choir: three detuned voices through "ah" vowel formants, with slow vibrato.
  function choir(semi, t, vol = 0.12, dur = 1) {
    const f = hz(semi);
    const stop = t + dur + 0.6;
    const out = gain(0, bus);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 0.14);
    out.gain.setValueAtTime(vol, t + dur);
    out.gain.linearRampToValueAtTime(0, t + dur + 0.4);
    const src = gain(0.33);
    [[800, 6, 3.2], [1150, 8, 1.8], [2900, 10, 0.7]].forEach(([fr, q, g]) => src.connect(filter('bandpass', fr, q, gain(g, out))));
    const lg = gain(0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.016, t + 0.4);
    osc('sine', 5.6, t, stop, lg);
    [1, 1.005, 0.995].forEach((d) => lg.connect(osc('sawtooth', f * d, t, stop, src).frequency));
  }

  // Upright bass: round pluck with a little pitch settle.
  function bass(semi, t, vol = 0.3, dur = 0.6) {
    const f = hz(semi);
    const out = gain(0, bus);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 0.008);
    out.gain.setTargetAtTime(0, t + 0.008, dur / 3);
    const lp = filter('lowpass', 900, 0.8, out);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.2);
    const stop = t + dur + 0.4;
    const o1 = osc('sine', f * 1.012, t, stop, lp);
    const o2 = osc('triangle', f * 2.024, t, stop, gain(0.4, lp));
    o1.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.04);
  }

  // Ride cymbal: bright noise wash plus a soft bell ping.
  function ride(t, vol = 0.04, dur = 0.9) {
    const g = gain(0, bus);
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0, t, dur / 4);
    noiseSrc(t, t + dur + 0.2, filter('highpass', 6500, 0.7, g));
    const b = gain(0, bus);
    b.gain.setValueAtTime(vol * 0.3, t);
    b.gain.setTargetAtTime(0, t, 0.12);
    osc('sine', 3150, t, t + 0.6, b);
    osc('sine', 4720, t, t + 0.6, gain(0.6, b));
  }

  // Long cymbal swell / crash.
  function crash(t, vol = 0.06, dur = 1.8, swell = false) {
    const g = gain(0, bus);
    if (swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur); }
    else { g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t, dur / 3); }
    noiseSrc(t, t + dur + 0.3, filter('highpass', 4200, 0.5, g));
  }

  // ------------------------------------------------------------------ voices
  function lead(semi, t, vol, dur) {
    switch (voice) {
      case 'piano': piano(semi, t, vol, 1.7); break;
      case 'rhodes': rhodes(semi, t, vol * 1.1, 1.9); break;
      case 'choir': choir(semi, t, vol * 0.9, dur || 0.9); break;
      default: sax(semi, t, vol * 0.62, dur || 0.55); // 'jazz' and 'sax'
    }
  }
  function keys(semi, t, vol, dur) {
    if (voice === 'rhodes') rhodes(semi, t, vol, dur || 1.6);
    else piano(semi, t, vol, dur || 1.4);
  }
  function voicing(notes, t, vol, roll = 0.014) {
    notes.forEach((s, k) => keys(s, t + k * roll, vol / Math.sqrt(notes.length) * 1.4));
  }
  function comp(step, t, vol) {
    voicing(CHORDS[step % CHORDS.length].v, t, vol);
  }
  const withBass = () => voice === 'jazz' || voice === 'sax';

  // ------------------------------------------------------------------ public sounds
  // One melody note. Full wins (vol >= .2) also get a soft chord and, in jazz/sax, a bass note.
  // Small UI plings stay on soft high piano.
  function pluck(i, when = 0, vol = 0.26) {
    if (!ac()) return;
    const t = ctx.currentTime + when;
    const semi = semiOf(i);
    if (vol < 0.15) { piano(semi + 12, t, vol * 0.9, 1.2); return; }
    lead(semi, t, vol);
    if (vol >= 0.2) {
      const step = compStep++;
      if (voice !== 'sax') comp(step, t + 0.02, vol * 0.26);
      if (withBass()) bass(CHORDS[step % CHORDS.length].bass, t, vol);
    }
  }

  function sparkle(when = 0, n = 6) {
    if (!ac()) return;
    const t = ctx.currentTime + when;
    ride(t, 0.035);
    for (let k = 0; k < Math.min(n, 5); k++) piano(semiOf(8 + Math.floor(Math.random() * 6)) + 12, t + k * 0.06, 0.03, 1);
  }

  function chord(indices, when = 0, vol = 0.16) {
    if (!ac()) return;
    voicing(indices.map((i) => semiOf(i) - 12), ctx.currentTime + when, vol * 0.9, 0.02);
  }

  function boom(when = 0) {
    if (!ac()) return;
    const t = ctx.currentTime + when;
    bass(-24, t, 0.4, 0.9);
    const g = gain(0, bus);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const k = osc('sine', 110, t, t + 0.35, g);
    k.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  }

  // Tension while you hold: a soft brass swell that opens up, released into the payoff.
  function riser(ms) {
    if (!ac()) return { stop() {} };
    const t = ctx.currentTime;
    const d = ms / 1000;
    const g = gain(0, bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + d * 0.95);
    const lp = filter('lowpass', 300, 2, g);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + d);
    const oscs = [-5, -1, 2].map((s, k) => osc('sawtooth', hz(s) * (1 + (k - 1) * 0.003), t, t + d + 2, gain(0.33, lp)));
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.08);
        oscs.forEach((o) => o.stop(n + 0.1));
      },
    };
  }

  function sweep(t, vol, from, to, dur, q = 1) {
    const g = gain(0, bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const bp = filter('bandpass', from, q, g);
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    noiseSrc(t, t + dur + 0.05, bp);
  }
  function whoosh() { if (ac()) sweep(ctx.currentTime, 0.12, 300, 3200, 0.45, 0.9); }
  function swish(up = true) { if (ac()) sweep(ctx.currentTime, 0.05, up ? 800 : 3000, up ? 3000 : 700, 0.25, 1.4); }

  function thud() {
    if (!ac()) return;
    bass(-17, ctx.currentTime, 0.22, 0.3);
  }

  // Soft woodblock click.
  function tick() {
    if (!ac()) return;
    const t = ctx.currentTime;
    const g = gain(0, bus);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    const o = osc('sine', 1300, t, t + 0.08, g);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  }

  function crit() {
    if (!ac()) return;
    const t = ctx.currentTime + 0.08;
    piano(19, t, 0.08, 0.6);
    piano(21, t + 0.06, 0.09, 1);
    ride(t, 0.03);
  }

  function key(i = 0) {
    if (!ac()) return;
    piano(semiOf(5 + (i % 6)), ctx.currentTime, 0.11, 0.8);
  }

  function unlockChime() {
    if (!ac()) return;
    const t = ctx.currentTime;
    [-12, -8, -5, -1, 2, 7].forEach((s, k) => keys(s, t + k * 0.045, 0.07));
    ride(t + 0.25, 0.025);
  }

  // A soft sax fall-off (or a muted low piano pair in other voices).
  function denied() {
    if (!ac()) return;
    const t = ctx.currentTime;
    if (withBass()) sax(-1, t, 0.07, 0.16, { scoop: false, fall: true });
    else { piano(-20, t, 0.09, 0.4); piano(-19, t + 0.02, 0.08, 0.4); }
  }

  // Swung eighth-note lick for the lead voice.
  function lick(notes, t, step, vol, lastDur = 1.1) {
    notes.forEach((s, k) => {
      const at = t + k * step + (k % 2 ? step * 0.18 : 0);
      lead(s, at, vol, k === notes.length - 1 ? lastDur : step * 1.2);
    });
  }

  function reveal(rarity) {
    if (!ac()) return;
    const t = ctx.currentTime;
    if (rarity === 'rare') {
      keys(16, t, 0.08); keys(23, t + 0.03, 0.07);
      ride(t, 0.03);
    } else if (rarity === 'epic') {
      bass(-31, t, 0.3, 1.2);
      [-7, -3, 4, 7, 11, 14, 18].forEach((s, k) => keys(s, t + k * 0.06, 0.08));
      lead(16, t + 0.45, 0.2, 1.3);
      ride(t + 0.45, 0.04);
    } else if (rarity === 'legendary') {
      crash(t, 0.05, 0.7, true);
      bass(-24, t + 0.7, 0.4, 1.8);
      voicing(CMAJ9, t + 0.7, 0.16);
      lick([7, 9, 11, 12, 14, 16, 14, 21], t + 0.7, 0.13, 0.22, 1.6);
      crash(t + 0.7, 0.05, 2);
    }
  }

  // ii–V–I turnaround with a lick on top.
  function levelUp() {
    if (!ac()) return;
    const t = ctx.currentTime;
    const beat = 0.34;
    [[DM9, -22], [G13, -17], [CMAJ9, -24]].forEach(([v, b], k) => {
      voicing(v, t + k * beat, 0.14);
      bass(b, t + k * beat, 0.35, k === 2 ? 1.6 : beat * 1.5);
      ride(t + k * beat, 0.03);
    });
    lick([14, 12, 11, 9, 7, 11, 14, 16], t, beat / 2.6, 0.2, 1.5);
  }

  // Tense altered chord that resolves.
  function bossDown() {
    if (!ac()) return;
    const t = ctx.currentTime;
    boom(0);
    voicing(C7SHARP9, t, 0.2, 0.006);
    crash(t, 0.07, 1.2);
    const r = t + 0.5;
    voicing(CHORDS[2].v, r, 0.16);
    bass(-31, r, 0.4, 1.6);
    lead(16, r, 0.22, 1.4);
    crash(r, 0.04, 2);
  }

  function perfectDay() {
    if (!ac()) return;
    const t = ctx.currentTime;
    bass(-24, t, 0.4, 2);
    [-8, -1, 2, 7, 11, 14, 19].forEach((s, k) => keys(s, t + k * 0.07, 0.09));
    lick([12, 16, 19, 21, 23], t + 0.5, 0.16, 0.2, 1.8);
    crash(t + 0.5, 0.03, 1.4, true);
    ride(t + 1.3, 0.04);
  }

  // A short phrase to audition a sound style in Settings.
  function demo() {
    if (!ac()) return;
    const t = ctx.currentTime;
    voicing(CMAJ9, t, 0.12);
    if (withBass()) bass(-24, t, 0.3, 1.2);
    lick([7, 9, 11, 14], t, 0.16, 0.22, 0.9);
    ride(t, 0.025);
  }

  // Replay a day as a swung jazz tune: every win is a melody note, with piano comping,
  // a walking bass and ride cymbal underneath.
  function playSong(entries, onNote) {
    if (!ac() || !entries.length) return 0;
    const t0 = ctx.currentTime + 0.08;
    const gap = Math.max(0.22, Math.min(0.36, 3.2 / entries.length));
    entries.forEach((e, k) => {
      const at = t0 + k * gap + (k % 2 ? gap * 0.2 : 0);
      const ch = CHORDS[Math.floor(k / 2) % CHORDS.length];
      if (k % 2 === 0) {
        voicing(ch.v, at, 0.07);
        bass(ch.bass, at, 0.26, gap * 1.3);
      } else {
        bass(ch.bass + 7, at, 0.2, gap * 1.1);
      }
      ride(at, k % 2 ? 0.018 : 0.028, 0.6);
      lead(semiOf(e.note), at, e.boss ? 0.24 : 0.2, gap * 1.4);
      if (e.boss) voicing(ch.v.map((s) => s + 12), at, 0.08, 0.006);
      if (e.rarity === 'epic' || e.rarity === 'legendary') sparkle(at - ctx.currentTime, 3);
      if (onNote) setTimeout(() => onNote(e, k), (at - ctx.currentTime) * 1000);
    });
    const end = t0 + entries.length * gap + 0.1;
    voicing(CMAJ9, end, 0.12);
    bass(-24, end, 0.35, 2);
    lead(semiOf(entries[entries.length - 1].note), end, 0.2, 1.4);
    crash(end, 0.03, 2);
    return end - ctx.currentTime + 2;
  }

  return {
    pluck, sparkle, chord, boom, riser, whoosh, thud, tick, crit, reveal, levelUp, bossDown, perfectDay, playSong,
    key, unlockChime, denied, swish, demo, loadSamples,
    unlock() { ac(); },
    set samples(v) { useSamples = !!v; },
    get samplesLoaded() { return !!bank.piano && !!bank.sax; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; if (!enabled && ctx) ctx.suspend(); },
    set voice(v) { voice = v; },
    set volume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = MASTER * volume; },
  };
})();
