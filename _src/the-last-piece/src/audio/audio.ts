// Procedural Web Audio. No sample files.
//   Room: crowd murmur (formant-filtered noise, slowly modulated), dish clinks, distant laughter,
//         the kitchen's sizzle.
//   Music: koto plucks from Karplus-Strong buffers on the miyako-bushi scale, sparse, with a
//         flourish on wins.
//   Foley: footsteps, chopstick taps and clacks, ceramic tok, squelch, whoosh, splat, crunch.
//   Him: a pained vowel from formant synthesis when the wasabi lands, a taiko hit under it.

import type { Game, Stage } from '../game';
import type { SimEvent } from '../sim/world';

// miyako-bushi on D: D Eb G A Bb, two octaves (Hz)
const SCALE = [146.83, 155.56, 196.0, 220.0, 233.08, 293.66, 311.13, 392.0, 440.0, 466.16, 587.33];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private room!: GainNode;
  private noise!: AudioBuffer;
  private plucks: AudioBuffer[] = [];
  private muted = false;
  private nextClink = 3;
  private nextLaugh = 9;
  private nextPhrase = 2;
  private t = 0;
  private heart = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem('tlp-muted') === '1';
    } catch {
      /* storage blocked: default to sound on */
    }
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('tlp-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = this.bus(0.9);
    this.music = this.bus(0.32);
    this.room = this.bus(0.5);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.plucks = SCALE.map((f) => this.karplus(f, 2.2));
    this.buildRoom();
  }

  private bus(g: number) {
    const n = this.ctx!.createGain();
    n.gain.value = g;
    n.connect(this.master);
    return n;
  }

  /** A plucked string: Karplus-Strong with a slightly bright, buzzy start (koto / shamisen). */
  private karplus(f: number, dur: number) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(N);
    // pluck position: comb the initial burst so it sounds plucked, not struck
    for (let i = 0; i < N; i++) line[i] = (Math.random() * 2 - 1) * (i < N * 0.5 ? 1 : 0.6);
    let idx = 0;
    let prev = 0;
    const damp = 0.996 - f / 90000;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % N];
      const v = (cur + next) * 0.5 * damp;
      // a touch of nonlinearity for the shamisen's sawari buzz early in the note
      const buzz = i < sr * 0.15 ? Math.tanh(v * 2.2) * 0.45 + v * 0.55 : v;
      line[idx] = buzz;
      out[i] = cur * 0.6 + prev * 0.4;
      prev = cur;
      idx = (idx + 1) % N;
    }
    // fade the tail
    for (let i = n - 2000; i < n; i++) if (i > 0) out[i] *= (n - i) / 2000;
    return buf;
  }

  private noiseSrc() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private buildRoom() {
    const ctx = this.ctx!;
    // crowd murmur: four formant bands of noise, each slowly breathing in and out
    for (const [f, q, g] of [
      [320, 3, 0.18],
      [750, 4, 0.12],
      [1250, 5, 0.08],
      [2600, 6, 0.04],
    ] as const) {
      const src = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = g * 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.3 + Math.random() * 0.9;
      const lfoG = ctx.createGain();
      lfoG.gain.value = g * 0.45;
      lfo.connect(lfoG).connect(gain.gain);
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 2.5 + Math.random() * 3; // syllables
      const lfo2G = ctx.createGain();
      lfo2G.gain.value = g * 0.25;
      lfo2.connect(lfo2G).connect(gain.gain);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 0.8;
      src.connect(bp).connect(gain).connect(pan).connect(this.room);
      src.start(0, Math.random() * 1.5);
      lfo.start();
      lfo2.start();
    }
    // room tone and the kitchen: low rumble, high hiss
    const low = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const lg = ctx.createGain();
    lg.gain.value = 0.22;
    low.connect(lp).connect(lg).connect(this.room);
    low.start(0, 0.7);
    const hiss = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const hg = ctx.createGain();
    hg.gain.value = 0.012;
    const hpan = ctx.createStereoPanner();
    hpan.pan.value = 0.55;
    hiss.connect(hp).connect(hg).connect(hpan).connect(this.room);
    hiss.start(0, 1.1);
  }

  /* ------------------------------------------------------------------ voices */

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(f: number, dur: number, opts: { type?: OscillatorType; to?: number; vol?: number; pan?: number; at?: number; bus?: GainNode; attack?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(f, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    const g = ctx.createGain();
    this.env(g, t, opts.attack ?? 0.004, opts.vol ?? 0.2, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    o.connect(g).connect(p).connect(opts.bus ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, opts: { type?: BiquadFilterType; f?: number; to?: number; q?: number; vol?: number; pan?: number; at?: number; attack?: number; bus?: GainNode } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.f ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, opts.attack ?? 0.003, opts.vol ?? 0.3, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    s.connect(f).connect(g).connect(p).connect(opts.bus ?? this.sfx);
    s.start(t, Math.random() * 1.5, dur + 0.1);
  }

  private pluck(i: number, at = 0, vol = 0.5, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.plucks.length) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.plucks[Math.max(0, Math.min(this.plucks.length - 1, i))];
    // a koto player bends into the note
    s.playbackRate.setValueAtTime(1.012, t);
    s.playbackRate.exponentialRampToValueAtTime(1, t + 0.09);
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(this.music);
    s.start(t);
  }

  /** Ceramic: a few inharmonic partials with a fast decay. */
  private ceramic(base: number, vol: number, pan = 0, at = 0, dur = 0.35) {
    for (const [r, v] of [
      [1, 1],
      [1.51, 0.6],
      [2.32, 0.35],
      [3.17, 0.2],
    ])
      this.tone(base * r, dur * (1.2 - r * 0.15), { vol: vol * v, pan, at, attack: 0.001 });
  }

  /** Chopstick on chopstick / wood: a short hollow knock. */
  private clack(vol: number, pan = 0, at = 0, f = 1500) {
    this.burst(0.04, { f, q: 6, vol, pan, at, attack: 0.001 });
    this.tone(f * 0.62, 0.06, { vol: vol * 0.5, pan, at, attack: 0.001, type: 'triangle' });
  }

  /** A man in pain: formant synthesis of an "aagh", falling in pitch. */
  private agh(vol: number, len = 0.55, at = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(165, t);
    src.frequency.linearRampToValueAtTime(190, t + 0.06);
    src.frequency.exponentialRampToValueAtTime(105, t + len);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vg = ctx.createGain();
    vg.gain.value = 4;
    vib.connect(vg).connect(src.frequency);
    const out = ctx.createGain();
    this.env(out, t, 0.03, vol, len);
    // vowel "a" formants, sliding toward "u" as he chokes on it
    for (const [f1, f2, q, g] of [
      [780, 520, 7, 1],
      [1180, 900, 9, 0.6],
      [2700, 2400, 12, 0.25],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f1, t);
      bp.frequency.exponentialRampToValueAtTime(f2, t + len);
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      src.connect(bp).connect(gg).connect(out);
    }
    // breath
    const br = ctx.createBufferSource();
    br.buffer = this.noise;
    const bh = ctx.createBiquadFilter();
    bh.type = 'bandpass';
    bh.frequency.value = 1600;
    bh.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.value = 0.18;
    br.connect(bh).connect(bg).connect(out);
    out.connect(this.sfx);
    src.start(t);
    vib.start(t);
    br.start(t, Math.random());
    src.stop(t + len + 0.1);
    vib.stop(t + len + 0.1);
    br.stop(t + len + 0.1);
  }

  private taiko(vol: number, at = 0) {
    this.tone(78, 0.7, { to: 44, vol, at, attack: 0.002 });
    this.tone(150, 0.12, { to: 70, vol: vol * 0.5, at, attack: 0.001 });
    this.burst(0.06, { type: 'lowpass', f: 900, vol: vol * 0.4, at });
  }

  /* ------------------------------------------------------------------ events */

  onEvents(events: SimEvent[], game: Game) {
    if (!this.ctx || this.muted) return;
    const w = game.world;
    const pan = Math.max(-0.8, Math.min(0.8, (w.px - w.eyeX) / 10));
    for (const e of events) {
      switch (e.t) {
        case 'step':
          this.burst(0.03, { type: 'lowpass', f: 700 + e.foot * 120, vol: 0.06, pan });
          this.tone(170 + e.foot * 20, 0.04, { to: 120, vol: 0.05, pan });
          break;
        case 'aim':
          // the tips tap together as he lines up
          this.clack(0.08, 0.3, 0, 2400);
          this.clack(0.06, 0.3, 0.07, 2600);
          if (e.sweep) this.burst(0.5, { f: 600, to: 1600, q: 2, vol: 0.05, pan: 0.2 });
          break;
        case 'feint':
          this.burst(0.12, { f: 900, to: 2200, q: 3, vol: 0.08 });
          break;
        case 'stab': {
          const sp = Math.max(-0.8, Math.min(0.8, (e.x - w.eyeX) / 10));
          this.ceramic(1850 + Math.random() * 120, e.hit ? 0.1 : 0.14, sp);
          this.clack(0.12, sp, 0, 1900);
          if (e.near < 1.6 && !e.hit) this.burst(0.12, { f: 2400, to: 900, q: 2, vol: 0.07, pan: sp }); // close one: a whoosh
          break;
        }
        case 'sweepDown':
          this.burst(0.62, { f: 1400, to: 2600, q: 4, vol: 0.12, pan: 0.1, attack: 0.02 });
          this.ceramic(1300, 0.05, 0.1, 0, 0.6);
          break;
        case 'hurt':
          this.burst(0.14, { type: 'lowpass', f: 500, vol: 0.32, pan });
          this.tone(320, 0.22, { to: 150, vol: 0.18, pan, type: 'triangle' });
          for (let i = 0; i < 6; i++) this.burst(0.012, { f: 3500 + Math.random() * 2000, q: 8, vol: 0.05, pan, at: 0.06 + i * 0.03 + Math.random() * 0.02 });
          break;
        case 'pickup':
          this.burst(0.09, { type: 'lowpass', f: 900, to: 300, vol: 0.18, pan });
          this.tone(620, 0.09, { to: 1240, vol: 0.08, pan });
          break;
        case 'throw':
          this.burst(0.26, { f: 600, to: 2600, q: 1.5, vol: 0.16, pan, attack: 0.02 });
          this.tone(720, 0.07, { to: 1080, vol: 0.06, pan });
          break;
        case 'hit':
          this.burst(0.18, { type: 'lowpass', f: 1400, to: 300, vol: 0.5, attack: 0.002 });
          this.taiko(0.55);
          this.agh(0.32, 0.5 + e.n * 0.08, 0.05);
          this.pluck(5 + Math.min(4, e.n), 0.15, 0.5, 0.2);
          break;
        case 'clip':
          this.clack(0.22, pan, 0, 1150);
          this.burst(0.08, { type: 'lowpass', f: 800, vol: 0.12, pan, at: 0.01 });
          break;
        case 'wide': {
          const side = e.side;
          this.burst(0.35, { f: 2600, to: 500, q: 2, vol: 0.14, pan: side * 0.9, attack: 0.05 });
          break;
        }
        case 'drop':
          this.clack(0.04, 0.2, 0, 2800);
          break;
        case 'land':
          this.burst(0.07, { type: 'lowpass', f: 600, to: 200, vol: 0.12 });
          break;
        case 'guard':
          if (e.on) this.clack(0.1, 0.25, 0, 2000);
          break;
        case 'soy':
          this.burst(0.12, { type: 'lowpass', f: 450, vol: 0.12, pan });
          break;
        case 'hide':
          this.burst(0.18, { f: 3000, q: 0.7, vol: 0.06, pan });
          break;
        case 'moundReady':
          this.tone(880, 0.12, { vol: 0.03, pan: 0.5 });
          break;
        case 'empty':
          this.clack(0.03, pan, 0, 3200);
          break;
        case 'won':
          this.agh(0.4, 1.3, 0.12);
          // the chopsticks go down
          for (let i = 0; i < 5; i++) this.clack(0.18 * Math.pow(0.7, i), 0.2, 0.3 + i * 0.09 * Math.pow(0.8, i), 1300 + i * 80);
          this.ceramic(1600, 0.08, 0.2, 0.32);
          [2, 4, 5, 7, 9, 10].forEach((n, i) => this.pluck(n, 0.5 + i * 0.11, 0.55, (i - 3) * 0.15));
          this.taiko(0.4, 0.5);
          break;
        case 'eaten':
          this.tone(300, 0.6, { to: 560, vol: 0.1, type: 'triangle', at: 0.35 });
          this.tone(180, 0.9, { to: 420, vol: 0.08, type: 'sawtooth', at: 1.1 });
          // the crunch
          for (let i = 0; i < 7; i++) this.burst(0.05, { type: 'bandpass', f: 1800 + Math.random() * 1800, q: 1.2, vol: 0.3, at: 2.05 + i * 0.045 });
          this.tone(70, 0.5, { to: 40, vol: 0.4, at: 2.05 });
          [4, 3, 1, 0].forEach((n, i) => this.pluck(n, 2.4 + i * 0.22, 0.45));
          break;
      }
    }
  }

  onStage(s: Stage) {
    if (!this.ctx || this.muted) return;
    if (s === 'brief' || s === 'cleared' || s === 'failed') {
      // a slip of paper slides onto the counter
      this.burst(0.18, { f: 3000, to: 1200, q: 0.8, vol: 0.05, attack: 0.03 });
      if (s !== 'brief') this.tone(110, 0.15, { to: 60, vol: 0.18, at: 0.38 }); // the stamp
    }
  }

  /** Per frame: ambience events, music, heartbeat when you're nearly gone. */
  update(game: Game, dt: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    this.t += dt;
    const w = game.world;
    // dish clinks somewhere in the room
    this.nextClink -= dt;
    if (this.nextClink <= 0) {
      this.nextClink = 1.5 + Math.random() * 5;
      this.ceramic(2200 + Math.random() * 1600, 0.02 + Math.random() * 0.025, (Math.random() - 0.5) * 1.6, 0, 0.25);
      if (Math.random() < 0.3) this.ceramic(2600 + Math.random() * 1200, 0.015, (Math.random() - 0.5) * 1.6, 0.08, 0.2);
    }
    // somebody laughs at another table
    this.nextLaugh -= dt;
    if (this.nextLaugh <= 0) {
      this.nextLaugh = 10 + Math.random() * 16;
      const p = (Math.random() - 0.5) * 1.6;
      const n = 3 + Math.floor(Math.random() * 4);
      const f = 500 + Math.random() * 500;
      for (let i = 0; i < n; i++) this.burst(0.09, { f: f * (1 - i * 0.04), q: 5, vol: 0.035 * (1 - i / (n + 1)), pan: p, at: i * 0.17, attack: 0.02, bus: this.room });
    }
    // music: a short phrase now and then; busier while he's going for you
    this.nextPhrase -= dt;
    if (this.nextPhrase <= 0 && game.stage !== 'eaten' && game.stage !== 'finale') {
      const busy = game.stage === 'play' && w.main.phase !== 'idle';
      this.nextPhrase = (busy ? 2.2 : 3.5) + Math.random() * 3;
      const n = 2 + Math.floor(Math.random() * (busy ? 4 : 3));
      let note = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        this.pluck(note, i * (busy ? 0.16 : 0.28) + (Math.random() < 0.3 ? 0.08 : 0), 0.32 + Math.random() * 0.15, (Math.random() - 0.5) * 0.6);
        note += Math.random() < 0.5 ? -1 : Math.random() < 0.5 ? 1 : -2;
        note = Math.max(0, Math.min(SCALE.length - 1, note));
      }
    }
    // a heartbeat when you're nearly gone
    if (game.stage === 'play' && w.hp <= 2) {
      this.heart -= dt;
      if (this.heart <= 0) {
        this.heart = w.hp <= 1 ? 0.62 : 0.85;
        this.tone(62, 0.12, { to: 48, vol: 0.22 });
        this.tone(58, 0.12, { to: 45, vol: 0.16, at: 0.16 });
      }
    }
  }
}
