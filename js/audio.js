/*
 * Chog Dash sound: everything is synthesised with the Web Audio API (no sound files).
 *
 * - Background music: the recorded track "Beyond the Outer Rim" (audio/beyond-the-outer-rim.mp3), looped with a
 *   crossfade. If it can't load (offline, or the page opened straight from disk), a synthesised space tune plays
 *   instead (plucked arpeggio, warm bass, soft pads; a soft beat during a run; a chord loop per zone).
 * - A low engine hum rises with speed during a run.
 * - Each pickup has its own tone (Stardust chimes climb in pitch along a streak, like rings in other games).
 * - Dash: a boost whoosh with a rising zap, a roaring engine while it lasts, and a crunch per smash.
 * - Events: launch, crash, near miss, Laser Eyes (zap, then a blast when it destroys something or a clang when a
 *   huge asteroid blocks it), warp gate, extra life, life used, UI clicks.
 * - Browsers only allow sound after the player interacts, so the context starts on the first input.
 * - Music and sound effects can each be switched off (M switches all sound); the choice is remembered on the
 *   device (localStorage). The engine hum counts as a sound effect.
 */
(function (root) {
  const MUTE_KEY = "chogDashMuted", MUSIC_KEY = "chogDashMusic", SFX_KEY = "chogDashSfx";
  const MUSIC_VOL = 0.5, SFX_VOL = 0.9;
  let ctx = null, master, sfxBus, musicBus, reverb, sfxVerb, musicVerb, engine = null, pad = null;
  let musicOn = true, sfxOn = true;
  try {
    const m = localStorage.getItem(MUSIC_KEY), f = localStorage.getItem(SFX_KEY);
    if (m === null && f === null && localStorage.getItem(MUTE_KEY) === "1") musicOn = sfxOn = false;   // older "mute all" choice
    if (m !== null) musicOn = m === "1";
    if (f !== null) sfxOn = f === "1";
  } catch (e) {}

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
    master = ctx.createGain(); master.gain.value = 0.8;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? SFX_VOL : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(master);
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
    // Music and effects each send to the reverb through their own switch, so turning one off silences its echo too
    sfxVerb = ctx.createGain(); sfxVerb.gain.value = sfxOn ? 1 : 0; sfxVerb.connect(reverb);
    musicVerb = ctx.createGain(); musicVerb.gain.value = musicOn ? 1 : 0; musicVerb.connect(reverb);
  }

  // Starts audio on the first user gesture (browser autoplay rules)
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    startMusic();
  }
  ["pointerdown", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  function save() {
    try {
      localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0");
      localStorage.setItem(SFX_KEY, sfxOn ? "1" : "0");
      localStorage.setItem(MUTE_KEY, !musicOn && !sfxOn ? "1" : "0");
    } catch (e) {}
    if (ctx) {
      musicBus.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, now(), 0.05);
      sfxBus.gain.setTargetAtTime(sfxOn ? SFX_VOL : 0, now(), 0.05);
      musicVerb.gain.setTargetAtTime(musicOn ? 1 : 0, now(), 0.05);
      sfxVerb.gain.setTargetAtTime(sfxOn ? 1 : 0, now(), 0.05);
    }
  }
  function setMusic(on) { musicOn = !!on; save(); if (musicOn) loadTrack(); pauseTrack(!musicOn); }
  function setSfx(on) { sfxOn = !!on; save(); }
  // Mute all, or bring both back
  function setMuted(m) { musicOn = sfxOn = !m; save(); if (musicOn) loadTrack(); pauseTrack(!musicOn); }


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
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(sfxVerb); }
    o.start(t0); o.stop(t0 + attack + decay + 0.05);
  }
  // Filtered noise burst, optionally sweeping the filter
  function hiss({ t = 0, peak = 0.3, attack = 0.01, decay = 0.4, type = "bandpass", freq = 1200, to, q = 1, verb = 0.2 }) {
    const t0 = now() + t, s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
    env(g, t0, peak, attack, decay);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(sfxVerb); }
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
      const v = ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(sfxVerb);
      o.start(t0); lfo.start(t0); o.stop(t0 + 0.75); lfo.stop(t0 + 0.75);
    },
    slow() {   // time bends: long downward sweep, deep and echoing
      tone({ type: "sine", freq: 900, to: 110, peak: 0.25, attack: 0.02, decay: 1.1, verb: 0.7 });
      tone({ type: "triangle", freq: 600, to: 75, peak: 0.12, attack: 0.02, decay: 1.2, verb: 0.7, detune: 12 });
    },
    nova() {   // screen clear: a bright blast that small speakers can play, a shockwave sweep, rocks crackling apart, a shimmer
      tone({ type: "sine", freq: 170, to: 42, peak: 0.6, attack: 0.002, decay: 0.7, verb: 0.25 });   // deep punch
      tone({ type: "sawtooth", freq: 520, to: 70, peak: 0.28, attack: 0.002, decay: 0.55, filter: 2400, verb: 0.35, detune: 10 });   // body (mid range)
      tone({ type: "square", freq: 1600, to: 200, peak: 0.12, attack: 0.002, decay: 0.3, filter: 4000, verb: 0.3 });   // zap on top
      hiss({ peak: 0.7, attack: 0.003, decay: 1.1, type: "lowpass", freq: 7000, to: 180, verb: 0.55 });   // shockwave rolling out
      hiss({ t: 0.01, peak: 0.3, attack: 0.004, decay: 0.45, type: "bandpass", freq: 6000, to: 900, q: 1.5, verb: 0.3 });   // sizzle
      [0.07, 0.13, 0.2, 0.26, 0.34, 0.41, 0.5].forEach((t, i) =>   // rocks breaking, spreading out
        hiss({ t, peak: 0.3 - i * 0.03, attack: 0.002, decay: 0.12, type: "bandpass", freq: 2200 - i * 180, to: 500, q: 2.5, verb: 0.25 }));
      [84, 88, 91, 96, 100, 103].forEach((m, i) => bell(m, 0.12 + i * 0.06, 0.09));   // shimmer rising as the screen clears
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
    if (!ctx || !sfxOn || ctx.state !== "running" || !SFX[name]) return;
    try { SFX[name](); } catch (e) {}
  }

  // ---------- Background music: a light, upbeat space tune ----------
  // A soft plucked arpeggio over a cheerful four-chord loop, a warm bass line and gentle pads, with an
  // occasional sparkle. During a run a soft beat joins in. Each zone has its own chord loop and gets a
  // little faster, so going deeper feels like progress. Notes are scheduled just ahead on the audio clock.
  const SONGS = [
    { bpm: 100, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]] },   // Outer Space: Cmaj7 Am7 Fmaj7 G
    { bpm: 104, chords: [[62, 65, 69, 72], [58, 62, 65, 69], [60, 64, 67, 70], [57, 60, 64, 69]] },   // Asteroid Belt: Dm7 Bbmaj7 C7 Am
    { bpm: 108, chords: [[65, 69, 72, 76], [62, 65, 69, 72], [58, 62, 65, 70], [60, 64, 67, 72]] },   // Galactic Drift: Fmaj7 Dm7 Bb C
    { bpm: 112, chords: [[57, 60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]] },   // Deep Cosmic Zone: Am7 F G Em
    { bpm: 116, chords: [[64, 68, 71, 75], [61, 64, 68, 71], [57, 61, 64, 68], [59, 63, 66, 71]] },   // Milky Way: Emaj7 C#m7 Amaj7 B
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];   // chord tones for the 8 eighth notes of a bar (second half an octave up)
  let zoneIndex = 0, twinkleTimer = null, drums = false;
  let step = 0, nextStepAt = 0;          // sixteenth-note position and when it plays

  // One music note at an absolute time on the audio clock
  function mnote({ at, type = "sine", freq, to, peak, attack = 0.005, decay = 0.3, verb = 0.3, filter }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
    env(g, at, peak, attack, decay);
    let src = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); src = f; }
    src.connect(g); g.connect(musicBus);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(musicVerb); }
    o.start(at); o.stop(at + attack + decay + 0.05);
  }
  function hat(at, peak) {
    const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "highpass"; f.frequency.value = 7000;
    env(g, at, peak, 0.001, 0.05);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(at, Math.random()); s.stop(at + 0.08);
  }
  // Plays one sixteenth-note step of the current zone's tune
  function playStep(at) {
    const song = SONGS[zoneIndex], s16 = step % 16, bar = Math.floor(step / 16), chord = song.chords[bar % 4];
    if (s16 === 0) {
      // Pad: the whole chord, soft and slow, for the bar
      chord.forEach((m, k) => mnote({ at, type: "sine", freq: hz(m), peak: 0.035 - k * 0.004, attack: 0.5, decay: 2.2, verb: 0.6 }));
      // Now and then a sparkle high above
      if (bar % 2 === 1) mnote({ at: at + 60 / song.bpm * (1 + Math.floor(Math.random() * 3)), type: "sine", freq: hz(chord[Math.floor(Math.random() * 4)] + 24), peak: 0.03, attack: 0.01, decay: 1.2, verb: 0.9 });
    }
    // Arpeggio: a plucked eighth note, the second half of the bar an octave up
    if (s16 % 2 === 0) {
      const k = s16 / 2, m = chord[ARP[k]] + (k >= 4 ? 12 : 0);
      mnote({ at, type: "triangle", freq: hz(m), peak: k === 0 ? 0.11 : 0.08, attack: 0.004, decay: 0.32, verb: 0.35, filter: 3200 });
    }
    // Bass: a warm bounce on the root
    if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) {
      mnote({ at, type: "sine", freq: hz(chord[0] - 24), peak: s16 % 8 === 0 ? 0.2 : 0.12, attack: 0.008, decay: s16 % 8 === 0 ? 0.45 : 0.22, verb: 0 });
      mnote({ at, type: "triangle", freq: hz(chord[0] - 12), peak: 0.03, attack: 0.008, decay: 0.2, verb: 0 });
    }
    // Soft beat while flying: kick on 1 and 3, a light tick on the off-beats
    if (drums) {
      if (s16 % 8 === 0) mnote({ at, type: "sine", freq: 130, to: 45, peak: 0.22, attack: 0.002, decay: 0.18, verb: 0 });
      if (s16 % 4 === 2) hat(at, 0.025);
      if (s16 === 12) hat(at, 0.015);
    }
  }
  // Schedules every step that starts before `until` (seconds on the audio clock)
  function scheduleUntil(until) {
    while (nextStepAt < until) {
      playStep(nextStepAt);
      nextStepAt += 60 / SONGS[zoneIndex].bpm / 4;
      step++;
    }
  }
  // ---------- Background music: the recorded track, looped with a crossfade ----------
  // Streamed through two <audio> elements (no big decoded buffer in memory); near the end of one, the other starts
  // from the top and the two crossfade.
  const TRACK_URL = "audio/beyond-the-outer-rim.mp3";
  const TRACK_LOOP = 169.5, TRACK_XF = 3, TRACK_VOL = 0.32;   // the track fades out from ~168 s; the next copy fades in over it
  let trackState = "idle", trackEls = null, trackGain = null, trackCur = 0, trackSwitching = false, trackTimer = null;
  // Starts loading the track (only once, and only while music is on)
  function loadTrack() {
    if (trackState !== "idle") return;
    // Opened straight from disk the browser won't let Web Audio read the file, so the synth tune plays instead
    if (location.protocol === "file:" || typeof Audio === "undefined") { trackState = "failed"; startMusic(); return; }
    trackState = "loading";
    trackEls = [0, 1].map(() => { const a = new Audio(); a.preload = "auto"; a.src = TRACK_URL; return { el: a, src: null, g: null }; });
    trackEls[0].el.addEventListener("error", () => { if (trackState !== "playing") { trackState = "failed"; startMusic(); } });
    trackEls[0].el.addEventListener("canplay", () => { if (trackState === "loading") { trackState = "ready"; startMusic(); } });
  }
  // Starts the music once sound is unlocked: the track when it can play, the synth tune if it can't load
  function startMusic() {
    if (!ctx || (window.OfflineAudioContext && ctx instanceof OfflineAudioContext)) return;
    if (trackState === "failed") { startPad(); return; }
    if (!trackEls) return;
    if (!trackGain) {
      trackGain = ctx.createGain(); trackGain.gain.value = TRACK_VOL; trackGain.connect(musicBus);
      trackEls.forEach(t => { t.src = ctx.createMediaElementSource(t.el); t.g = ctx.createGain(); t.g.gain.value = 0.0001; t.src.connect(t.g); t.g.connect(trackGain); });
      // Inside the first tap or key press: let both players start later (iOS asks for a gesture per player)
      const b = trackEls[1].el; const pr = b.play(); if (pr && pr.then) pr.then(() => { if (!trackSwitching) b.pause(); }, () => {});
    }
    if (trackState !== "ready" && trackState !== "loading") return;
    if (trackTimer) return;
    trackState = trackState === "ready" ? "playing" : trackState;
    const t = trackEls[trackCur];
    t.el.currentTime = 0;
    fade(t.g, 1, 2.5);
    const pr = t.el.play(); if (pr && pr.catch) pr.catch(() => {});
    trackTimer = setInterval(tickTrack, 250);
  }
  function fade(g, to, secs) { const t0 = now(); g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0); g.gain.linearRampToValueAtTime(Math.max(0.0001, to), t0 + secs); }
  // Near the end of the playing copy, the other starts from the top and they crossfade
  function tickTrack() {
    if (trackState === "loading" && trackEls[0].el.readyState >= 3) trackState = "playing";
    const cur = trackEls[trackCur];
    if (trackSwitching || !musicOn || (cur.el.paused && !cur.el.ended) || (!cur.el.ended && cur.el.currentTime < TRACK_LOOP - TRACK_XF)) return;
    trackSwitching = true;
    const next = trackEls[1 - trackCur];
    next.el.currentTime = 0;
    const pr = next.el.play(); if (pr && pr.catch) pr.catch(() => {});
    fade(next.g, 1, TRACK_XF); fade(cur.g, 0, TRACK_XF);
    setTimeout(() => { cur.el.pause(); trackCur = 1 - trackCur; trackSwitching = false; }, TRACK_XF * 1000 + 100);
  }
  // Music switched off: pause the track (no download or decoding in the background); on again: carry on
  function pauseTrack(paused) {
    if (!trackTimer || trackSwitching) return;
    const t = trackEls[trackCur].el;
    if (paused) t.pause(); else { const pr = t.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  if (musicOn) loadTrack();

  function startPad() {
    if (pad || !ctx) return;
    pad = { started: true };
    step = 0; nextStepAt = now() + 0.15;
    twinkleTimer = setInterval(() => {
      if (!ctx || ctx.state !== "running") return;
      if (nextStepAt < now()) nextStepAt = now() + 0.05;   // after the tab was in the background: carry on, don't catch up
      scheduleUntil(now() + 0.3);
    }, 100);
  }
  function setZone(index) {
    const z = ((index % SONGS.length) + SONGS.length) % SONGS.length;
    if (z !== zoneIndex) step = Math.ceil(step / 16) * 16;   // a new zone starts its tune from the top of a bar
    zoneIndex = z;
  }

  // ---------- Engine hum: rises with speed, roars during Dash ----------
  function setEngine(on, speedRatio, dashing) {
    drums = !!on;   // the beat plays while flying
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
    const live = { ctx, master, sfxBus, musicBus, reverb, sfxVerb, musicVerb, noiseBuf, musicOn, sfxOn };
    const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    musicOn = sfxOn = true; build(off);
    SFX[name]();
    const buf = await off.startRendering();
    ({ ctx, master, sfxBus, musicBus, reverb, sfxVerb, musicVerb, noiseBuf, musicOn, sfxOn } = live);
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }
  // Records the background music for one zone (with the in-run beat if withDrums)
  async function _recordAmbient(zone, seconds, withDrums) {
    const live = { ctx, master, sfxBus, musicBus, reverb, sfxVerb, musicVerb, noiseBuf, musicOn, sfxOn, pad, zoneIndex, drums, step, nextStepAt };
    const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    musicOn = sfxOn = true; build(off); zoneIndex = zone; drums = !!withDrums;
    step = 0; nextStepAt = 0.05;
    scheduleUntil(seconds - 0.5);
    const buf = await off.startRendering();
    ({ ctx, master, sfxBus, musicBus, reverb, sfxVerb, musicVerb, noiseBuf, musicOn, sfxOn, pad, zoneIndex, drums, step, nextStepAt } = live);
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  root.ChogAudio = { play, unlock, setMuted, isMuted: () => !musicOn && !sfxOn, setMusic, setSfx, musicOn: () => musicOn, sfxOn: () => sfxOn, setZone, setEngine, _ctx: () => ctx, _record, _recordAmbient, _names: () => Object.keys(SFX),
    // For tests: where the music is, and a jump within the track
    _track: () => ({ state: trackState, cur: trackCur, time: trackEls ? trackEls[trackCur].el.currentTime : 0, paused: trackEls ? trackEls[trackCur].el.paused : true, synth: !!pad }),
    _trackSeek: secs => { if (trackEls) trackEls[trackCur].el.currentTime = secs; } };
})(window);
