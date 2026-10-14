/*
 * Chog Dash sound: everything is synthesised with the Web Audio API (no sound files).
 *
 * - Space ambience: a deep slowly-beating drone, soft swelling chord tones (the chord changes per zone), a faint
 *   shimmer, cosmic "wind" drifting across the speakers, a low rumble, and rare distant signals and twinkles
 *   through a long reverb. A low engine hum rises with speed during a run.
 * - Each pickup has its own tone (Stardust chimes climb in pitch along a streak, like rings in other games).
 * - Dash: a boost whoosh with a rising zap, a roaring engine while it lasts, and a crunch per smash.
 * - Events: launch, crash, near miss, Laser Eyes (zap, then a blast when it destroys something or a clang when a
 *   huge asteroid blocks it), warp gate, extra life, life used, UI clicks.
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
    newBest() {   // past your best: a triumphant rising fanfare with a sparkling tail
      [60, 64, 67, 72].forEach((m, i) => {
        tone({ type: "sawtooth", freq: hz(m), t: i * 0.1, peak: 0.1, attack: 0.02, decay: 0.35, filter: 2600, verb: 0.4 });
        tone({ type: "triangle", freq: hz(m + 12), t: i * 0.1, peak: 0.08, decay: 0.3, verb: 0.3 });
      });
      [72, 76, 79, 84].forEach(m => tone({ type: "sawtooth", freq: hz(m), t: 0.42, peak: 0.07, attack: 0.03, decay: 1.2, filter: 3000, verb: 0.6 }));
      [96, 100, 103, 108, 103, 108].forEach((m, i) => bell(m, 0.5 + i * 0.07, 0.07));
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
    laser() {   // Laser Eyes: a sharp zap with a punch, then a short humming beam
      tone({ type: "square", freq: 2600, to: 320, peak: 0.32, attack: 0.002, decay: 0.16, filter: 5200, verb: 0.25 });
      tone({ type: "sawtooth", freq: 1300, to: 160, peak: 0.3, attack: 0.002, decay: 0.22, filter: 3200, verb: 0.3, detune: 8 });
      tone({ type: "sine", freq: 180, to: 55, peak: 0.6, attack: 0.002, decay: 0.18, verb: 0 });   // punch
      hiss({ peak: 0.3, attack: 0.001, decay: 0.08, type: "highpass", freq: 3000, verb: 0.1 });   // crack
      // The beam: a buzzing two-tone hum while it's on screen
      tone({ type: "sawtooth", freq: 520, peak: 0.1, attack: 0.02, decay: 0.32, filter: 1800, verb: 0.35 });
      tone({ type: "sawtooth", freq: 523, peak: 0.1, attack: 0.02, decay: 0.32, filter: 1800, verb: 0.35, detune: 15 });
    },
    laserHit() {   // the beam destroys something: a blast, a sizzle and falling debris
      tone({ type: "sine", freq: 140, to: 35, peak: 0.7, attack: 0.002, decay: 0.45, verb: 0.25 });
      hiss({ peak: 0.6, attack: 0.002, decay: 0.5, type: "lowpass", freq: 3500, to: 250, verb: 0.45 });
      hiss({ t: 0.02, peak: 0.25, attack: 0.005, decay: 0.3, type: "bandpass", freq: 5000, to: 1500, q: 2, verb: 0.2 });   // sizzle
      [0.08, 0.15, 0.24, 0.31].forEach((t, i) => tone({ type: "triangle", freq: 900 - i * 140, to: 500 - i * 80, t, peak: 0.08, attack: 0.002, decay: 0.09, verb: 0.3 }));
    },
    laserBlock() {   // a huge asteroid stops the beam: a dull metallic clang
      tone({ type: "triangle", freq: 330, peak: 0.5, attack: 0.002, decay: 0.55, verb: 0.4 });
      tone({ type: "sine", freq: 330 * 2.71, peak: 0.2, attack: 0.002, decay: 0.4, verb: 0.4 });
      tone({ type: "sine", freq: 110, to: 70, peak: 0.35, attack: 0.002, decay: 0.2, verb: 0 });
      hiss({ peak: 0.35, attack: 0.002, decay: 0.12, type: "bandpass", freq: 1200, q: 1.5, verb: 0.2 });
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

  // ---------- Space ambience: one chord per zone, slowly breathing ----------
  // Layers: a deep drone that beats slowly, soft swelling chord tones, a faint high shimmer, a cosmic "wind"
  // (filtered noise sweeping and drifting left and right), a low rumble, and now and then a distant signal
  // or a twinkle echoing through the long reverb. Everything moves slowly so it never sounds like a loop.
  const CHORDS = [
    [45, 52, 57, 64, 71],   // Outer Space: A sus/add9
    [43, 50, 55, 62, 69],   // Asteroid Belt: G sus/add9
    [41, 48, 53, 60, 67],   // Galactic Drift: F lydian colour
    [38, 45, 50, 57, 65],   // Deep Cosmic Zone: D minor, darker
    [40, 47, 52, 59, 68],   // Milky Way: E major, bright finale
  ];
  // Which chord note each voice plays: [chord index, octave shift in semitones]
  const VOICES = [
    { kind: "drone", n: 0, shift: -12, type: "sine", gain: 0.11 },
    { kind: "drone", n: 0, shift: -5, type: "sine", gain: 0.05, detuneHz: 0.23 },   // the fifth, beating slowly
    { kind: "pad", n: 1, shift: 0, type: "triangle", gain: 0.035 },
    { kind: "pad", n: 2, shift: 0, type: "triangle", gain: 0.03 },
    { kind: "pad", n: 3, shift: 0, type: "triangle", gain: 0.026 },
    { kind: "pad", n: 4, shift: 0, type: "triangle", gain: 0.022 },
    { kind: "shimmer", n: 3, shift: 24, type: "sine", gain: 0.012 },
    { kind: "shimmer", n: 4, shift: 24, type: "sine", gain: 0.01 },
  ];
  let zoneIndex = 0, twinkleTimer = null;
  // A slow oscillator moving an AudioParam around its value
  function lfo(rate, depth, param, type) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start(now() + Math.random() * 0.1);
    return o;
  }
  const voiceHz = v => hz(CHORDS[zoneIndex][v.n] + v.shift) + (v.detuneHz || 0);
  function startPad() {
    if (pad || !ctx) return;
    pad = { voices: [] };
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(musicBus);
    const send = ctx.createGain(); send.gain.value = 0.75; out.connect(send); send.connect(reverb);
    out.gain.linearRampToValueAtTime(1, now() + 6);   // fades in over 6 seconds
    const padFilter = ctx.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 700; padFilter.Q.value = 0.3;
    lfo(0.05, 250, padFilter.frequency);
    padFilter.connect(out);
    VOICES.forEach((v, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = v.type; o.frequency.value = voiceHz(v);
      // Each voice swells and fades on its own slow cycle
      g.gain.value = v.gain * 0.6;
      lfo(0.03 + k * 0.013, v.gain * 0.4, g.gain);
      o.connect(g); g.connect(v.kind === "pad" ? padFilter : out);
      o.start();
      pad.voices.push({ o, v });
    });
    // Cosmic wind: noise through a narrow band that sweeps slowly, drifting between the speakers
    const wind = noise(); wind.loop = true;
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 550; band.Q.value = 7;
    lfo(0.023, 380, band.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.11;
    lfo(0.041, 0.05, wg.gain);
    let windOut = wg;
    if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); lfo(0.031, 0.7, pan.pan); wg.connect(pan); windOut = pan; }
    wind.connect(band); band.connect(wg); windOut.connect(out);
    wind.start();
    // Deep rumble far below
    const rum = noise(); rum.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = "lowpass"; rf.frequency.value = 70; rf.Q.value = 0.7;
    const rg = ctx.createGain(); rg.gain.value = 0.16;
    lfo(0.017, 0.06, rg.gain);
    rum.connect(rf); rf.connect(rg); rg.connect(out);
    rum.start(now() + 0.5);
    setZone(zoneIndex, true);
    // Now and then: a twinkle, or a distant signal
    let nextSignal = now() + 8 + Math.random() * 6;
    twinkleTimer = setInterval(() => {
      if (muted || !ctx || ctx.state !== "running") return;
      if (Math.random() < 0.3) twinkle(0);
      if (now() > nextSignal) { signal(0); nextSignal = now() + 10 + Math.random() * 10; }
    }, 1600);
  }
  function twinkle(t) {
    const ch = CHORDS[zoneIndex], m = ch[Math.floor(Math.random() * ch.length)] + 24 + (Math.random() < 0.5 ? 12 : 0);
    tone({ freq: hz(m), t, peak: 0.022, attack: 0.01, decay: 1.6, verb: 1 });
  }
  // A faint, far-away radio-like call: a slow sliding tone with a wobble, almost all reverb
  function signal(t) {
    const t0 = now() + t, ch = CHORDS[zoneIndex];
    const from = hz(ch[2 + Math.floor(Math.random() * 3)] + 12), to = from * (Math.random() < 0.5 ? 0.75 : 1.33);
    const o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(from, t0); o.frequency.exponentialRampToValueAtTime(to, t0 + 2.6);
    vib.frequency.value = 5.5; vg.gain.value = from * 0.012; vib.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.025, t0 + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3);
    const dry = ctx.createGain(); dry.gain.value = 0.3;
    o.connect(g); g.connect(dry); dry.connect(musicBus);
    const wet = ctx.createGain(); wet.gain.value = 1; g.connect(wet); wet.connect(reverb);
    o.start(t0); vib.start(t0); o.stop(t0 + 3.1); vib.stop(t0 + 3.1);
  }
  function setZone(index, instant) {
    zoneIndex = ((index % CHORDS.length) + CHORDS.length) % CHORDS.length;
    if (!pad) return;
    const t = now();
    pad.voices.forEach(({ o, v }) => {
      if (instant) o.frequency.setValueAtTime(voiceHz(v), t);
      else o.frequency.setTargetAtTime(voiceHz(v), t, 1.2);   // glide to the new chord
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
  // Records the space ambience for one zone (with a few twinkles and one distant signal)
  async function _recordAmbient(zone, seconds) {
    const live = { ctx, master, sfxBus, musicBus, reverb, noiseBuf, muted, pad, zoneIndex };
    const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    build(off); muted = false; master.gain.value = 0.8; pad = null; zoneIndex = zone;
    const tw = twinkleTimer; startPad(); clearInterval(twinkleTimer); twinkleTimer = tw;
    for (let t = 1.2; t < seconds - 2; t += 2.7) twinkle(t);
    if (seconds > 8) signal(seconds * 0.45);
    const buf = await off.startRendering();
    ({ ctx, master, sfxBus, musicBus, reverb, noiseBuf, muted, pad, zoneIndex } = live);
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  root.ChogAudio = { play, unlock, setMuted, isMuted: () => muted, setZone, setEngine, _ctx: () => ctx, _record, _recordAmbient, _names: () => Object.keys(SFX) };
})(window);
