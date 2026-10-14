// Procedural Web Audio: city hum + drizzle, footsteps on the walk phase, Doppler car pass-bys,
// the chaser drone and heartbeat, and one-shot cues. No sample files.

import type { Game } from '../game';
import type { SimEvent } from '../sim/world';

const SPEED_OF_SOUND = 343;
const CAR_VOICES = 4;

interface CarVoice {
  id: number;
  tyre: AudioBufferSourceNode;
  tyreFilter: BiquadFilterNode;
  engine: OscillatorNode;
  engineFilter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  lastDist: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private humGain!: GainNode;
  private chargeGain!: GainNode;
  private chargeFilter!: BiquadFilterNode;
  private voices: CarVoice[] = [];
  private lastPhase = 0;
  private beatT = 0;
  private muted = false;
  /** Heartbeat envelope 0..1 for the vignette. */
  beat = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem('sp-muted') === '1';
    } catch {
      /* storage blocked: default to sound on */
    }
  }

  get isMuted() {
    return this.muted;
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
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildAmbience();
    this.buildDrone();
    this.buildCharge();
    for (let i = 0; i < CAR_VOICES; i++) this.voices.push(this.buildCarVoice());
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('sp-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private noiseSource(loop = true, rate = 1) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.playbackRate.value = rate;
    s.loopStart = Math.random();
    return s;
  }

  private buildAmbience() {
    const ctx = this.ctx!;
    // city hum: brown-ish noise, low
    const hum = this.noiseSource(true, 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.32;
    hum.connect(lp).connect(this.humGain).connect(this.master);
    hum.start();
    // mains-ish tone under it
    const tone = ctx.createOscillator();
    tone.frequency.value = 55;
    const toneG = ctx.createGain();
    toneG.gain.value = 0.012;
    tone.connect(toneG).connect(this.master);
    tone.start();
    // drizzle: high, airy, slowly breathing
    const rain = this.noiseSource(true, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 0.4;
    const rg = ctx.createGain();
    rg.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.018;
    lfo.connect(lfoG).connect(rg.gain);
    lfo.start();
    rain.connect(bp).connect(rg).connect(this.master);
    rain.start();
  }

  private buildDrone() {
    const ctx = this.ctx!;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 140;
    this.droneFilter.Q.value = 4;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    for (const f of [41.2, 41.9, 61.7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(this.droneFilter);
      o.start();
    }
    this.droneFilter.connect(this.droneGain).connect(this.master);
  }

  private buildCharge() {
    const ctx = this.ctx!;
    const n = this.noiseSource(true, 0.6);
    this.chargeFilter = ctx.createBiquadFilter();
    this.chargeFilter.type = 'bandpass';
    this.chargeFilter.frequency.value = 300;
    this.chargeFilter.Q.value = 6;
    this.chargeGain = ctx.createGain();
    this.chargeGain.gain.value = 0;
    n.connect(this.chargeFilter).connect(this.chargeGain).connect(this.master);
    n.start();
  }

  private buildCarVoice(): CarVoice {
    const ctx = this.ctx!;
    const tyre = this.noiseSource(true, 1);
    const tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 700;
    tyreFilter.Q.value = 0.8;
    const engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 52;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 260;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const eg = ctx.createGain();
    eg.gain.value = 0.35;
    tyre.connect(tyreFilter).connect(gain);
    engine.connect(engineFilter).connect(eg).connect(gain);
    gain.connect(pan).connect(this.master);
    tyre.start();
    engine.start();
    return { id: -1, tyre, tyreFilter, engine, engineFilter, gain, pan, lastDist: 0 };
  }

  /* ---------------- one-shots ---------------- */

  private burst(opts: { freq: number; q?: number; type?: BiquadFilterType; dur: number; gain: number; sweepTo?: number; pan?: number; rate?: number; at?: number }) {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const s = this.noiseSource(false, opts.rate ?? 1);
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + Math.min(0.012, opts.dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + opts.dur + 0.05);
  }

  private thump(freq: number, dur: number, gain: number, at?: number, drop = 0.5) {
    const ctx = this.ctx!;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * drop, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', at?: number) {
    const ctx = this.ctx!;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  onEvents(events: SimEvent[], game: Game) {
    if (!this.ctx || this.muted) return;
    const w = game.world;
    for (const e of events) {
      switch (e.t) {
        case 'bump':
          this.burst({ freq: 380, type: 'lowpass', dur: [0.12, 0.08, 0.05][e.tier], gain: [0.5, 0.25, 0.08][e.tier], rate: 0.5 });
          if (e.tier === 0) this.thump(90, 0.09, 0.35);
          break;
        case 'post':
          this.thump(160, 0.2, 0.3, undefined, 0.9);
          this.burst({ freq: 1800, q: 8, dur: 0.35, gain: 0.05 });
          break;
        case 'dash':
          this.burst({ freq: 2400, sweepTo: 500, dur: 0.3, gain: 0.32, q: 0.8 });
          this.thump(70, 0.14, 0.4);
          break;
        case 'knock':
          if (e.by === 'player') {
            this.burst({ freq: 450, type: 'lowpass', dur: 0.14, gain: 0.35, rate: 0.6 });
            this.thump(110, 0.08, 0.25);
          }
          break;
        case 'nearMiss': {
          const pan = Math.max(-1, Math.min(1, -e.dx / 2));
          this.burst({ freq: 3200, sweepTo: 300, dur: 0.45, gain: 0.55, q: 0.6, pan });
          break;
        }
        case 'death':
          if (e.cause === 'car') {
            this.burst({ freq: 900, type: 'lowpass', dur: 0.5, gain: 0.9, rate: 0.4 });
            this.thump(60, 0.6, 0.9, undefined, 0.3);
            this.tone(2350, 3.0, 0.035, 'sine', this.ctx.currentTime + 0.1);
          } else {
            this.thump(38, 1.2, 0.9, undefined, 0.6);
            this.burst({ freq: 200, type: 'lowpass', dur: 1.2, gain: 0.4, rate: 0.3 });
          }
          this.humGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.2);
          break;
        case 'cleared': {
          const t = this.ctx.currentTime;
          this.tone(220, 2.8, 0.05, 'sine', t);
          this.tone(330, 2.8, 0.035, 'sine', t + 0.12);
          this.tone(440, 2.4, 0.02, 'triangle', t + 0.25);
          break;
        }
        case 'shoveReady':
          this.tone(1320, 0.12, 0.025, 'triangle');
          break;
      }
    }
    void w;
  }

  /** Called every frame. dread: 0..1 chaser proximity. */
  update(game: Game, dread: number, camX: number, camZ: number, realDt: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const w = game.world;
    const playing = game.stage === 'play';
    if (game.stage === 'brief' || game.stage === 'play') this.humGain.gain.setTargetAtTime(0.32, now, 0.5);

    // footsteps on each footfall (two per walk cycle)
    const p = w.player;
    const ph = p.phase;
    if (playing && Math.floor(ph / Math.PI) !== Math.floor(this.lastPhase / Math.PI) && p.speed > 0.6) {
      const s = Math.min(1, p.speed / 4.5);
      const pan = Math.max(-0.6, Math.min(0.6, (p.x - camX) / 4));
      this.burst({ freq: 1100 + Math.random() * 500, q: 1.4, dur: 0.07, gain: 0.12 * s + 0.03, pan, rate: 0.9 + Math.random() * 0.2 });
      this.thump(85 + Math.random() * 15, 0.06, 0.12 * s);
    }
    this.lastPhase = ph;

    // charge tension
    const charging = playing && p.mode === 'charge';
    this.chargeGain.gain.setTargetAtTime(charging ? 0.12 + 0.2 * p.charge : 0, now, 0.05);
    this.chargeFilter.frequency.setTargetAtTime(charging ? 300 + 1400 * p.charge : 300, now, 0.05);

    // chaser drone and heartbeat
    const live = playing || game.stage === 'dying';
    const d2 = live ? dread * dread : 0;
    this.droneGain.gain.setTargetAtTime(0.03 + d2 * 0.42, now, 0.25);
    this.droneFilter.frequency.setTargetAtTime(110 + dread * 260, now, 0.25);
    this.beat = Math.max(0, this.beat - realDt * 5);
    if (live && dread > 0.12) {
      const bpm = 52 + dread * 70;
      this.beatT += realDt;
      if (this.beatT > 60 / bpm) {
        this.beatT = 0;
        const g = 0.25 + dread * 0.55;
        this.thump(52, 0.13, g, now, 0.6);
        this.thump(48, 0.11, g * 0.7, now + 0.16, 0.6);
        this.beat = 1;
      }
    }

    // cars: the nearest few get a voice; pitch follows the Doppler shift toward the camera
    const cars = [...w.cars]
      .map((c) => ({ c, d: Math.hypot(c.x - camX, c.z - camZ, 1.6) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, CAR_VOICES);
    const ids = new Set(cars.map((x) => x.c.id));
    for (const v of this.voices) if (!ids.has(v.id)) v.id = -1;
    for (const { c, d } of cars) {
      let v = this.voices.find((x) => x.id === c.id);
      if (!v) {
        v = this.voices.find((x) => x.id === -1)!;
        v.id = c.id;
        v.lastDist = d;
      }
      const vr = realDt > 0 ? (d - v.lastDist) / Math.max(realDt * (game.timeScale || 1), 1e-3) : 0; // + receding
      v.lastDist = d;
      const dop = SPEED_OF_SOUND / (SPEED_OF_SOUND + Math.max(-60, Math.min(60, vr)));
      const g = (c.long ? 0.55 : 0.4) / (1 + (d * d) / 30);
      v.gain.gain.setTargetAtTime(this.muted ? 0 : g, now, 0.05);
      v.engine.frequency.setTargetAtTime((c.long ? 38 : 50 + (c.id % 5) * 4) * dop * (c.spd / 19), now, 0.05);
      v.tyreFilter.frequency.setTargetAtTime(650 * dop, now, 0.05);
      v.tyre.playbackRate.setTargetAtTime(dop, now, 0.05);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (c.x - camX) / 9)), now, 0.05);
    }
    for (const v of this.voices) if (v.id === -1) v.gain.gain.setTargetAtTime(0, now, 0.1);
  }
}
