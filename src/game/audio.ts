/**
 * All sounds are synthesized at runtime with Web Audio (original, no audio files shipped).
 * Effective mute = settings volume 0 OR platform mute OR ad playing OR page hidden.
 */
export type Sfx =
  | 'whoosh'
  | 'plop'
  | 'nibble'
  | 'bite'
  | 'hook'
  | 'tension'
  | 'pop'
  | 'rare'
  | 'coin'
  | 'upgrade'
  | 'chime'
  | 'miss'
  | 'click'
  | 'giant';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reelGain: GainNode | null = null;
  private reelSrc: AudioBufferSourceNode | null = null;
  private ambient: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private lastPlayed = new Map<Sfx, number>();
  private vol = { master: 0.8, music: 0.5, sfx: 0.8 };
  readonly flags = { platformMuted: false, adMuted: false, hidden: false };

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture. Safe to call repeatedly (also restores after iOS interruptions). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.music = this.ctx.createGain();
        this.music.connect(this.master);
        this.sfx = this.ctx.createGain();
        this.sfx.connect(this.master);
        this.noiseBuf = this.makeNoise();
        this.startAmbient();
        this.applyVolumes();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  get effectiveMuted(): boolean {
    return this.vol.master <= 0 || this.flags.platformMuted || this.flags.adMuted || this.flags.hidden;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.effectiveMuted ? 0 : this.vol.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.35, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startAmbient(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0.035;
    src.connect(lp).connect(this.ambient).connect(this.music);
    src.start();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, gain: number, sweepTo?: number, q = 1): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(freq, t);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(s: Sfx, pitch = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // Avoid stacking the same sound in the same instant.
    const now = this.ctx.currentTime;
    if ((this.lastPlayed.get(s) ?? -1) > now - 0.05) return;
    this.lastPlayed.set(s, now);
    const v = pitch * (0.96 + Math.random() * 0.08);
    switch (s) {
      case 'whoosh': this.noise(0.35, 600, 0.5, 2400, 0.8); break;
      case 'plop': this.tone(520 * v, 0.16, 'sine', 0.35, 0, 180); break;
      case 'nibble': this.tone(700 * v, 0.06, 'sine', 0.12, 0, 500); break;
      case 'bite':
        this.tone(880 * v, 0.1, 'square', 0.18);
        this.tone(1320 * v, 0.14, 'square', 0.16, 0.09);
        this.noise(0.25, 900, 0.3, 300);
        break;
      case 'hook': this.tone(300 * v, 0.12, 'triangle', 0.3, 0, 600); break;
      case 'tension': this.tone(1500, 0.07, 'square', 0.07); break;
      case 'pop':
        this.noise(0.4, 1200, 0.45, 300);
        this.tone(400 * v, 0.2, 'sine', 0.3, 0, 900);
        break;
      case 'giant':
        this.noise(0.6, 500, 0.5, 120);
        this.tone(160, 0.5, 'sine', 0.4, 0, 90);
        break;
      case 'rare':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f * v, 0.5, 'triangle', 0.16, i * 0.07));
        break;
      case 'coin':
        this.tone(988 * v, 0.08, 'square', 0.12);
        this.tone(1318 * v, 0.22, 'square', 0.12, 0.07);
        break;
      case 'upgrade': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.08)); break;
      case 'chime': [784, 988, 1175, 988, 1318].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.13, i * 0.12)); break;
      case 'miss': this.tone(330, 0.3, 'triangle', 0.2, 0, 160); break;
      case 'click': this.tone(1200, 0.03, 'sine', 0.08); break;
    }
  }

  /** Reel loop: quiet clicky pulse whose rate tracks tension. */
  setReel(active: boolean, tension: number): void {
    if (!this.ctx) return;
    if (active && !this.reelSrc) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
      this.reelSrc = ctx.createBufferSource();
      this.reelSrc.buffer = buf;
      this.reelSrc.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2000;
      this.reelGain = ctx.createGain();
      this.reelGain.gain.value = 0.0;
      this.reelSrc.connect(hp).connect(this.reelGain).connect(this.sfx);
      this.reelSrc.start();
    }
    if (!active && this.reelSrc) {
      this.reelSrc.stop();
      this.reelSrc = null;
      this.reelGain = null;
      return;
    }
    if (this.reelSrc && this.reelGain) {
      this.reelSrc.playbackRate.value = 0.8 + tension * 0.9;
      this.reelGain.gain.value = 0.06 + tension * 0.05;
    }
  }

  /** Gentle generative pentatonic music, scheduled from the frame loop. */
  update(dt: number, night: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.42;
    const scale = night > 0.5 ? [220, 247, 294, 330, 392, 440] : [262, 294, 330, 392, 440, 523];
    const step = this.musicStep++;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pattern = [0, 2, 4, 2, 5, 4, 2, 1, 0, 3, 4, 5, 3, 2, 1, 2];
    if (step % 2 === 0 || Math.random() < 0.3) {
      const f = scale[pattern[step % pattern.length]] * (step % 32 < 16 ? 1 : 0.5) * 2;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 1);
    }
    if (step % 8 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = scale[step % 16 < 8 ? 0 : 3] / 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 3.3);
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
