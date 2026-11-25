/* Motore audio basato su Web Audio API: tutti i suoni sono sintetizzati (nessun file da scaricare). */
import { prefs } from '../store.js';

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // numero MIDI → Hz

class SoundEngine {
  ctx = null;
  master = null;
  enabled = false;
  #noise = null;
  #ambient = null;

  get supported() { return 'AudioContext' in window || 'webkitAudioContext' in window; }

  /** Crea il contesto (richiede un gesto utente per le policy autoplay). */
  #ensure() {
    if (this.ctx) return this.ctx;
    if (!this.supported) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(comp).connect(this.ctx.destination);
    // buffer di rumore bianco riutilizzabile
    const len = this.ctx.sampleRate * 2;
    this.#noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.#noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  async setEnabled(on) {
    this.enabled = on;
    prefs.set('sound', on);
    if (on) {
      const ctx = this.#ensure();
      if (ctx?.state === 'suspended') await ctx.resume();
      this.play('toggle');
    } else {
      this.ambient(false);
    }
  }

  /** Da chiamare su un gesto utente quando la preferenza era già attiva. */
  async resume() {
    if (!this.enabled) return;
    const ctx = this.#ensure();
    if (ctx?.state === 'suspended') await ctx.resume();
  }

  /* ---------- building blocks ---------- */
  #tone({ freq, to, type = 'sine', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, detune = 0 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(freq, now);
    if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now); o.stop(now + dur + 0.05);
  }

  #burst({ t = 0, dur = 0.08, type = 'bandpass', freq = 2000, q = 1, vol = 0.2, sweepTo, offset }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const src = ctx.createBufferSource(); src.buffer = this.#noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, now);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now, offset ?? Math.random() * 1.5, dur + 0.05);
  }

  /* ---------- suoni ---------- */
  play(name, opts = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const fn = this.sounds[name];
    if (fn) fn.call(this, opts);
  }

  sounds = {
    click() { this.#tone({ freq: 720, to: 420, dur: 0.07, vol: 0.18, type: 'triangle' }); },
    hover() { this.#tone({ freq: 1500 + Math.random() * 300, dur: 0.03, vol: 0.025, type: 'sine' }); },
    toggle() { this.#tone({ freq: NOTE(76), dur: 0.1, vol: 0.2 }); this.#tone({ freq: NOTE(83), t: 0.08, dur: 0.14, vol: 0.2 }); },
    pop() { this.#tone({ freq: 280, to: 900, dur: 0.1, vol: 0.28, type: 'sine' }); },
    tick() { this.#burst({ dur: 0.03, freq: 3500, q: 4, vol: 0.12 }); },
    check() { this.#tone({ freq: NOTE(79), dur: 0.09, vol: 0.2, type: 'triangle' }); this.#tone({ freq: NOTE(86), t: 0.06, dur: 0.13, vol: 0.16, type: 'triangle' }); },
    uncheck() { this.#tone({ freq: NOTE(74), dur: 0.09, vol: 0.14, type: 'triangle' }); },
    like() {
      [76, 83, 88].forEach((n, i) => this.#tone({ freq: NOTE(n), t: i * 0.07, dur: 0.35, vol: 0.2, type: 'sine' }));
      this.#tone({ freq: NOTE(100), t: 0.2, dur: 0.25, vol: 0.05 });
    },
    unlike() { this.#tone({ freq: 440, to: 220, dur: 0.18, vol: 0.18, type: 'triangle' }); },
    success() { [72, 76, 79, 84].forEach((n, i) => this.#tone({ freq: NOTE(n), t: i * 0.09, dur: 0.4, vol: 0.2, type: 'triangle' })); },
    error() { this.#tone({ freq: 160, to: 80, dur: 0.28, vol: 0.2, type: 'sawtooth' }); },
    star({ n = 1 } = {}) { this.#tone({ freq: NOTE(72 + n * 2), dur: 0.22, vol: 0.2, type: 'sine' }); this.#tone({ freq: NOTE(84 + n * 2), t: 0.04, dur: 0.18, vol: 0.06 }); },
    whoosh() { this.#burst({ dur: 0.38, freq: 300, sweepTo: 3200, q: 0.8, vol: 0.16 }); },
    chop() { this.#burst({ dur: 0.05, type: 'lowpass', freq: 900, vol: 0.4 }); this.#burst({ t: 0.09, dur: 0.05, type: 'lowpass', freq: 1100, vol: 0.32 }); },
    sizzle({ dur = 1.4 } = {}) {
      const n = Math.floor(dur * 34);
      for (let i = 0; i < n; i++) {
        this.#burst({ t: Math.random() * dur, dur: 0.02 + Math.random() * 0.05, type: 'highpass', freq: 4000 + Math.random() * 3000, vol: 0.03 + Math.random() * 0.07 });
      }
    },
    bell() {
      for (let k = 0; k < 3; k++) {
        const t = k * 0.7;
        this.#tone({ freq: 1318, t, dur: 1.4, vol: 0.22, attack: 0.002 });
        this.#tone({ freq: 2637, t, dur: 0.9, vol: 0.08, attack: 0.002 });
        this.#tone({ freq: 3951, t, dur: 0.5, vol: 0.04, attack: 0.002 });
      }
    },
  };

  /* ---------- ambiente: pad caldo + scoppiettii di padella ---------- */
  ambient(on) {
    if (on && !this.enabled) return;
    if (!this.ctx) return;
    if (on && !this.#ambient) {
      const ctx = this.ctx, now = ctx.currentTime;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5, now + 3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 320;
      lfo.connect(lfoG).connect(lp.frequency); lfo.start();
      const oscs = [53, 60, 64, 67, 71].map((n, i) => {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = NOTE(n); o.detune.value = (i - 2) * 6; og.gain.value = 0.05;
        o.connect(og).connect(lp); o.start(); return o;
      });
      lp.connect(g).connect(this.master);
      const crackle = setInterval(() => {
        if (this.ctx.state === 'running' && Math.random() < 0.8) this.#burst({ dur: 0.02 + Math.random() * 0.03, type: 'highpass', freq: 5000, vol: 0.02 + Math.random() * 0.03 });
      }, 260);
      this.#ambient = { g, oscs, lfo, crackle };
      prefs.set('ambient', true);
    } else if (!on && this.#ambient) {
      const { g, oscs, lfo, crackle } = this.#ambient;
      this.#ambient = null;
      clearInterval(crackle);
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); }, 1200);
      prefs.set('ambient', false);
    }
  }
  get ambientOn() { return !!this.#ambient; }
}

export const sound = new SoundEngine();
