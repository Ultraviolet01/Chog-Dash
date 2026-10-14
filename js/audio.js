/*
 * Chog Dash sound: everything is synthesised with the Web Audio API (no sound files).
 *
 * - Space ambience: a soft detuned pad whose chord changes per zone, distant "twinkles" through a long
 *   reverb, and a low engine hum that rises with speed.
 * - Each pickup has its own tone (Stardust chimes climb in pitch along a streak, like rings in other games).
 * - Dash: a boost whoosh with a rising zap, a roaring engine while it lasts, and a crunch per smash.
 * - Events: launch, crash, near miss, Laser Eyes, warp gate, extra life, life used, UI clicks.
 * - Browsers only allow sound after the player interacts, so the context starts on the first input.
 * - Mute is remembered on the device (localStorage).
 */
(function (root) {
  const MUTE_KEY = "chogDashMuted";
  let ctx = null, master, sfxBus, musicBus, reverb, engine = null, pad = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}

  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const now = () => ctx.currentTime;

  // ---------- Setup ----------
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    build(new AC());
    return ctx;
  }
  // Master chain, buses and reverb on a context (a live one, or an offline one for recording)
  function build(c) {
    ctx = c; noiseBuf = null;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    // Long, dark "space" reverb from a generated impulse
    reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    reverb.connect(wet); wet.connect(master);
  }

  // Starts audio on the first user gesture (browser autoplay rules)
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    startPad();
  }
  ["pointerdown", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, now(), 0.05);
  }

  // ---------- Building blocks ----------
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  // Envelope: attack, then exponential-ish decay to silence
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  // One tone: oscillator -> gain -> sfx (and some reverb)
  function tone({ type = "sine", freq, to, t = 0, peak = 0.3, attack = 0.005, decay = 0.3, verb = 0.3, detune = 0, filter }) {
    const t0 = now() + t, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
    env(g, t0, peak, attack, decay);
    let out = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); out = f; }
    out.connect(g); g.connect(sfxBus);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(reverb); }
    o.start(t0); o.stop(t0 + attack + decay + 0.05);
  }
  // Filtered noise burst, optionally sweeping the filter
  function hiss({ t = 0, peak = 0.3, attack = 0.01, decay = 0.4, type = "bandpass", freq = 1200, to, q = 1, verb = 0.2 }) {
    const t0 = now() + t, s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
    env(g, t0, peak, attack, decay);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(reverb); }
    s.start(t0, Math.random()); s.stop(t0 + attack + decay + 0.05);
  }
  const bell = (midi, t, peak) => {   // glassy bell: sine + a quiet inharmonic partial
    tone({ freq: hz(midi), t, peak, decay: 0.55, verb: 0.45 });
    tone({ freq: hz(midi) * 2.76, t, peak: peak * 0.25, decay: 0.25, verb: 0.3 });
  };

  // ---------- Stardust streak: each chime a step higher, reset after a pause ----------
  const DUST_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // major pentatonic
  let dustStep = 0, lastDust = 0;

  // ---------- Sound effects ----------
  const SFX = {
    click() { tone({ type: "triangle", freq: 880, peak: 0.2, decay: 0.07, verb: 0 }); },
    launch() {
      hiss({ peak: 0.6, decay: 0.9, type: "lowpass", freq: 300, to: 3000, verb: 0.3 });
      tone({ type: "sawtooth", freq: 90, to: 360, peak: 0.12, attack: 0.05, decay: 0.8, filter: 1200, verb: 0.2 });
    },
    stardust() {
      const t = performance.now();
      if (t - lastDust > 900) dustStep = 0;
      lastDust = t;
      const m = 84 + DUST_SCALE[Math.min(dustStep, DUST_SCALE.length - 1)];
      dustStep++;
      bell(m, 0, 0.42);
    },
    horn() {   // fanfare: bright brass-like arpeggio with shimmer
      [67, 71, 74, 79].forEach((m, i) => {
        tone({ type: "sawtooth", freq: hz(m), t: i * 0.08, peak: 0.12, attack: 0.02, decay: 0.45, filter: 2400, verb: 0.4 });
        tone({ type: "square", freq: hz(m + 12), t: i * 0.08, peak: 0.03, decay: 0.3, filter: 3000, verb: 0.3 });
      });
      [91, 95, 98].forEach((m, i) => bell(m, 0.35 + i * 0.06, 0.08));
    },
    bubble() {   // the bubble pops before the power-up's own tone
      tone({ freq: 500, to: 1400, peak: 0.4, attack: 0.002, decay: 0.08, verb: 0.15 });
      hiss({ peak: 0.15, decay: 0.08, type: "highpass", freq: 3000, verb: 0 });
    },
    dash() {   // rocket boost: whoosh + rising zap + thump
      hiss({ peak: 0.5, attack: 0.02, decay: 0.7, type: "bandpass", freq: 400, to: 4000, q: 0.8, verb: 0.35 });
      tone({ type: "sawtooth", freq: 120, to: 1100, peak: 0.16, attack: 0.02, decay: 0.45, filter: 3000, verb: 0.3 });
      tone({ type: "sine", freq: 70, to: 40, peak: 0.45, decay: 0.35, verb: 0 });
    },
    magnet() {   // magnetic wobble: vibrato hum rising
      const t0 = now(), o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(220, t0); o.frequency.exponentialRampToValueAtTime(660, t0 + 0.6);
      lfo.frequency.value = 22; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      env(g, t0, 0.2, 0.03, 0.65); o.connect(g); g.connect(sfxBus);
      const v = ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(reverb);
      o.start(t0); lfo.start(t0); o.stop(t0 + 0.75); lfo.stop(t0 + 0.75);
    },
    slow() {   // time bends: long downward sweep, deep and echoing
      tone({ type: "sine", freq: 900, to: 110, peak: 0.25, attack: 0.02, decay: 1.1, verb: 0.7 });
      tone({ type: "triangle", freq: 600, to: 75, peak: 0.12, attack: 0.02, decay: 1.2, verb: 0.7, detune: 12 });
    },
    nova() {   // boom + sparkle
      tone({ type: "sine", freq: 110, to: 30, peak: 0.6, decay: 0.8, verb: 0.3 });
      hiss({ peak: 0.45, attack: 0.005, decay: 0.9, type: "lowpass", freq: 3000, to: 200, verb: 0.5 });
      [96, 100, 103, 108].forEach((m, i) => bell(m, 0.08 + i * 0.05, 0.07));
    },
    radar() {   // sonar ping with echoes
      [0, 0.32, 0.64].forEach((t, i) => tone({ freq: 1320, t, peak: 0.2 / (i + 1), attack: 0.003, decay: 0.5, verb: 0.6 }));
    },
    mystery() {   // a quick dice roll; the real power-up's tone follows
      [72, 76, 79, 83, 86, 88].forEach((m, i) => tone({ type: "square", freq: hz(m), t: i * 0.04, peak: 0.12, decay: 0.06, filter: 3500, verb: 0.15 }));
    },
    life() {   // extra life: uplifting three notes
      [72, 76, 79, 84].forEach((m, i) => bell(m, i * 0.09, 0.16));
    },
    quest() {   // quest complete: bright rising chime
      [76, 79, 83, 88].forEach((m, i) => bell(m, i * 0.07, 0.2));
      tone({ type: "triangle", freq: hz(64), t: 0.28, peak: 0.12, attack: 0.02, decay: 0.9, verb: 0.6 });
    },
    badge() {   // badge reveal: shimmer swell, then a chord
      hiss({ peak: 0.25, attack: 0.25, decay: 0.5, type: "bandpass", freq: 1500, to: 6000, q: 0.8, verb: 0.6 });
      [72, 76, 79, 84, 88].forEach((m, i) => tone({ type: "triangle", freq: hz(m), t: 0.3 + i * 0.03, peak: 0.09, attack: 0.02, decay: 1.4, verb: 0.7 }));
      [96, 100, 103].forEach((m, i) => bell(m, 0.35 + i * 0.08, 0.08));
    },
    lifeUsed() {   // shield flare
      tone({ type: "triangle", freq: 330, to: 990, peak: 0.25, attack: 0.01, decay: 0.5, verb: 0.5 });
      hiss({ peak: 0.2, decay: 0.4, type: "highpass", freq: 2000, verb: 0.4 });
    },
    crash() {
      tone({ type: "sine", freq: 90, to: 28, peak: 0.7, decay: 0.9, verb: 0.2 });
      hiss({ peak: 0.6, attack: 0.003, decay: 1.2, type: "lowpass", freq: 2500, to: 120, verb: 0.5 });
      tone({ type: "sawtooth", freq: 300, to: 60, peak: 0.12, decay: 0.6, filter: 1200, verb: 0.3 });
    },
    smash() {   // Dash or Nova breaking a rock
      hiss({ peak: 0.8, attack: 0.002, decay: 0.25, type: "lowpass", freq: 1800, to: 300, verb: 0.15 });
      tone({ type: "square", freq: 140, to: 60, peak: 0.2, decay: 0.15, filter: 800, verb: 0 });
    },
    nearMiss() { hiss({ peak: 0.9, attack: 0.02, decay: 0.3, type: "bandpass", freq: 900, to: 2600, q: 1.2, verb: 0.2 }); },
    laser() {
      tone({ type: "sawtooth", freq: 1800, to: 220, peak: 0.4, attack: 0.003, decay: 0.28, filter: 4000, verb: 0.3 });
      tone({ type: "square", freq: 2400, to: 400, peak: 0.1, decay: 0.2, filter: 5000, verb: 0.1 });
    },
    warp() {   // zone gate: rising swell into a shimmer
      hiss({ peak: 0.4, attack: 0.3, decay: 1.0, type: "bandpass", freq: 300, to: 5000, q: 0.7, verb: 0.6 });
      [60, 67, 72, 79].forEach((m, i) => tone({ type: "triangle", freq: hz(m), t: 0.25 + i * 0.07, peak: 0.08, attack: 0.05, decay: 1.2, verb: 0.7 }));
    },
  };

  function play(name) {
    if (!ctx || muted || ctx.state !== "running" || !SFX[name]) return;
    try { SFX[name](); } catch (e) {}
  }

  // ---------- Ambient pad: one chord per zone, slowly breathing ----------
  // Zone chords (MIDI): spacious, slightly mysterious voicings
  const CHORDS = [
    [45, 52, 57, 64, 71],   // Outer Space: A sus/add9
    [43, 50, 55, 62, 69],   // Asteroid Belt: G sus/add9
    [41, 48, 53, 60, 67],   // Galactic Drift: F lydian colour
    [38, 45, 50, 57, 65],   // Deep Cosmic Zone: D minor, darker
    [40, 47, 52, 59, 68],   // Milky Way: E major, bright finale
  ];
  let zoneIndex = 0, twinkleTimer = null;
  function startPad() {
    if (pad || !ctx) return;
    pad = { voices: [] };
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 900; filter.Q.value = 0.5;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 350; lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    const out = ctx.createGain(); out.gain.value = 0;
    filter.connect(out); out.connect(musicBus);
    const v = ctx.createGain(); v.gain.value = 0.6; out.connect(v); v.connect(reverb);
    out.gain.linearRampToValueAtTime(1, now() + 4);
    for (let i = 0; i < 5; i++) {
      [-7, 7].forEach(det => {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = i === 0 ? 0.06 : 0.035;
        o.connect(g); g.connect(filter); o.start();
        pad.voices.push({ o, i });
      });
    }
    pad.filter = filter;
    setZone(zoneIndex, true);
    // Distant twinkles: random notes of the current chord, high up, through the reverb
    twinkleTimer = setInterval(() => {
      if (muted || !ctx || ctx.state !== "running" || Math.random() < 0.35) return;
      const ch = CHORDS[zoneIndex], m = ch[Math.floor(Math.random() * ch.length)] + 24 + (Math.random() < 0.5 ? 12 : 0);
      tone({ freq: hz(m), peak: 0.03, attack: 0.01, decay: 1.4, verb: 0.9 });
    }, 1400);
  }
  function setZone(index, instant) {
    zoneIndex = ((index % CHORDS.length) + CHORDS.length) % CHORDS.length;
    if (!pad) return;
    const ch = CHORDS[zoneIndex], t = now();
    pad.voices.forEach(({ o, i }) => {
      if (instant) o.frequency.setValueAtTime(hz(ch[i]), t);
      else o.frequency.setTargetAtTime(hz(ch[i]), t, 0.8);   // glide to the new chord
    });
  }

  // ---------- Engine hum: rises with speed, roars during Dash ----------
  function setEngine(on, speedRatio, dashing) {
    if (!ctx || ctx.state !== "running") return;
    if (!engine) {
      const s = noise(); s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 200; f.Q.value = 2;
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 45;
      const of = ctx.createBiquadFilter(); of.type = "lowpass"; of.frequency.value = 160;
      const og = ctx.createGain(); og.gain.value = 0.25;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); o.connect(of); of.connect(og); og.connect(g); g.connect(sfxBus);
      s.start(); o.start();
      engine = { f, o, g };
    }
    const t = now(), r = Math.max(0, Math.min(1, speedRatio));
    engine.g.gain.setTargetAtTime(on ? (dashing ? 0.32 : 0.08 + 0.1 * r) : 0, t, 0.15);
    engine.f.frequency.setTargetAtTime(on ? (dashing ? 1800 : 180 + 500 * r) : 150, t, 0.2);
    engine.o.frequency.setTargetAtTime(on ? (dashing ? 95 : 42 + 30 * r) : 40, t, 0.2);
  }

  // Records one sound effect offline and returns its samples (used to export listening samples)
  async function _record(name, seconds) {
    const live = { ctx, master, sfxBus, musicBus, reverb, noiseBuf, muted };
    const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    build(off); muted = false; master.gain.value = 0.8;
    SFX[name]();
    const buf = await off.startRendering();
    ({ ctx, master, sfxBus, musicBus, reverb, noiseBuf, muted } = live);
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }
  // Records the ambient pad for one zone (plus a few twinkles)
  async function _recordAmbient(zone, seconds) {
    const live = { ctx, master, sfxBus, musicBus, reverb, noiseBuf, muted, pad, zoneIndex };
    const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    build(off); muted = false; master.gain.value = 0.8; pad = null; zoneIndex = zone;
    const tw = twinkleTimer; startPad(); clearInterval(twinkleTimer); twinkleTimer = tw;
    [0.6, 1.9, 3.1, 4.4].forEach(t => { const ch = CHORDS[zone], m = ch[Math.floor(Math.random() * ch.length)] + 24; tone({ freq: hz(m), t, peak: 0.03, attack: 0.01, decay: 1.4, verb: 0.9 }); });
    const buf = await off.startRendering();
    ({ ctx, master, sfxBus, musicBus, reverb, noiseBuf, muted, pad, zoneIndex } = live);
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  root.ChogAudio = { play, unlock, setMuted, isMuted: () => muted, setZone, setEngine, _ctx: () => ctx, _record, _recordAmbient, _names: () => Object.keys(SFX) };
})(window);
