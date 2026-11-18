/** Procedural Web Audio sound design — no external assets. */
import type { SoundName } from './GameEngine';

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  crowdGain: GainNode | null = null;
  crowdFilter: BiquadFilterNode | null = null;
  volume = 0.7;
  commentaryVolume = 0.6;
  speech = false;
  private noiseBuf: AudioBuffer | null = null;
  private excite = 0;

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { // pinkish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    // crowd ambience bed
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter(); this.crowdFilter.type = 'bandpass'; this.crowdFilter.frequency.value = 700; this.crowdFilter.Q.value = 0.6;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0.0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setAmbience(level: number) {
    if (!this.ctx || !this.crowdGain) return;
    this.crowdGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.5);
  }

  private noiseBurst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', attack = 0.005) {
    if (!this.ctx || !this.noiseBuf || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slide = 0) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  private swell(dur: number, peak: number, freq = 900) {
    if (!this.ctx || !this.noiseBuf || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.1);
  }

  play(s: SoundName, v = 1) {
    if (!this.ctx) return;
    switch (s) {
      case 'bat': this.tone(950 + v * 300, 0.09, 0.5 * (0.5 + v * 0.5), 'triangle', -500); this.noiseBurst(0.06, 2500, 1.5, 0.6); break;
      case 'batEdge': this.tone(1700, 0.05, 0.25, 'square', -900); this.noiseBurst(0.04, 3500, 3, 0.3); break;
      case 'bounce': this.noiseBurst(0.05, 400, 1.2, 0.25 * v, 'lowpass'); break;
      case 'stumps': this.tone(520, 0.18, 0.4, 'triangle', -200); this.noiseBurst(0.12, 1800, 2, 0.5); this.tone(780, 0.12, 0.2, 'triangle'); break;
      case 'catch': this.noiseBurst(0.07, 900, 1.5, 0.5, 'lowpass'); break;
      case 'throw': this.noiseBurst(0.2, 1500, 0.8, 0.08, 'highpass', 0.05); break;
      case 'whistle': this.tone(2400, 0.25, 0.12, 'sine', 200); break;
      case 'cheer': this.swell(2.6, 0.45, 800); break;
      case 'bigCheer': this.swell(4.0, 0.8, 900); this.swell(3.0, 0.35, 1500); break;
      case 'ooh': this.swell(1.4, 0.3, 500); break;
      case 'appeal': this.swell(1.2, 0.5, 650); break;
      case 'groan': this.swell(1.5, 0.3, 350); break;
    }
  }

  say(text: string) {
    if (!this.speech || this.commentaryVolume <= 0 || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[!]+/g, '!'));
      u.volume = this.commentaryVolume; u.rate = 1.08; u.pitch = 1;
      const v = speechSynthesis.getVoices().find((vv) => /en-(GB|AU|IN)/.test(vv.lang)) ?? null;
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
}

export const audio = new AudioEngine();
