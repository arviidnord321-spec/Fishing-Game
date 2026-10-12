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
  private ctx: AudioContext | null = null; // (an OfflineAudioContext in renderPreview)
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reelGain: GainNode | null = null;
  private reelSrc: AudioBufferSourceNode | null = null;
  private ambient: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer = 0;
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

  // ---------------------------------------------------------------- music
  /*
   * Funk groove sequencer (everything synthesized, nothing shipped). 16th-note steps are
   * scheduled slightly ahead on the audio clock so timing stays tight even when frames hitch.
   * Day: full band at 104 BPM. Night: the same tune laid back (fewer hats, softer stabs).
   */
  private nextStep = 0;
  private musicBus: GainNode | null = null;

  private bus(): GainNode {
    if (this.musicBus) return this.musicBus;
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.9;
    this.musicBus.connect(comp).connect(this.music);
    return this.musicBus;
  }

  /** Bars of the progression (root note in Hz, chord intervals in semitones). */
  private static PROG: { root: number; chord: number[] }[] = [
    { root: 73.42, chord: [0, 3, 7, 10, 14] }, // Dm9
    { root: 73.42, chord: [0, 3, 7, 10, 14] },
    { root: 98.0, chord: [0, 4, 7, 10, 14] }, // G9
    { root: 98.0, chord: [0, 4, 7, 10, 14] },
    { root: 73.42, chord: [0, 3, 7, 10, 14] }, // Dm9
    { root: 73.42, chord: [0, 3, 7, 10, 14] },
    { root: 87.31, chord: [0, 4, 7, 11, 14] }, // Fmaj9
    { root: 82.41, chord: [0, 3, 7, 10, 17] }, // Em11
  ];
  private static BASS = [0, -1, -1, 12, -1, -1, 0, -1, 10, -1, 0, -1, 7, -1, 12, 10];
  private static BASS_ACC = [1, 0, 0, 0.7, 0, 0, 0.8, 0, 0.6, 0, 0.9, 0, 0.6, 0, 0.75, 0.6];
  private static LICKS = [
    [12, 15, 17, 19, 17, 15],
    [19, 22, 24, 22, 19, 17],
    [15, 17, 15, 12, 10, 12],
  ];

  update(_dt: number, night: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const bpm = night > 0.5 ? 92 : 104;
    const sixteenth = 60 / bpm / 4;
    const now = ctx.currentTime;
    if (this.musicTimer < now - 0.25) this.musicTimer = now + 0.05;
    while (this.musicTimer < now + 0.2) {
      // light swing on the off 16ths
      const swing = this.nextStep % 2 === 1 ? sixteenth * 0.12 : 0;
      this.playStep(this.nextStep, this.musicTimer + swing, sixteenth, night > 0.5);
      this.nextStep++;
      this.musicTimer += sixteenth;
    }
  }

  private playStep(n: number, t: number, sx: number, night: boolean): void {
    const out = this.bus();
    const s = n % 16;
    const bar = Math.floor(n / 16);
    const prog = AudioManager.PROG[bar % AudioManager.PROG.length];
    const hz = (semi: number, base = prog.root) => base * Math.pow(2, semi / 12);
    const fill = bar % 8 === 7;

    // ---- drums ----
    const kick = [0, 6, 10].includes(s) || (s === 3 && bar % 2 === 1) || (fill && s === 14);
    if (kick) this.kick(t, out, night ? 0.5 : 0.75);
    if (s === 4 || s === 12) this.snare(t, out, night ? 0.22 : 0.34);
    if ((s === 7 || s === 15 || (s === 9 && bar % 2 === 0)) && !night) this.snare(t, out, 0.06); // ghost notes
    if (fill && s >= 13) this.snare(t, out, 0.12 + (s - 13) * 0.05);
    if (!night || s % 4 === 2) this.hat(t, out, s % 4 === 2 ? 0.07 : s % 2 === 0 ? 0.045 : 0.025, s === 14 && !night ? 0.18 : 0.04);

    // ---- bass ----
    const b = AudioManager.BASS[s];
    if (b >= 0) this.bass(t, out, hz(b), AudioManager.BASS_ACC[s] * (night ? 0.55 : 0.8), b >= 12 ? sx * 1.2 : sx * 1.8);

    // ---- chords: pad at the bar start, wah stabs on the off-beats ----
    if (s === 0) this.pad(t, out, prog.chord.map((c) => hz(c + 12)), sx * 15, night ? 0.05 : 0.04);
    if (!night && (s === 2 || s === 7 || s === 10 || (s === 15 && bar % 2 === 0))) this.stab(t, out, prog.chord.slice(1).map((c) => hz(c + 24)), 0.05);
    if (night && s === 10) this.stab(t, out, prog.chord.slice(1).map((c) => hz(c + 24)), 0.03);

    // ---- a short melody lick every other bar ----
    if (bar % 2 === 1 && s >= 8 && s % 2 === 0) {
      const lick = AudioManager.LICKS[Math.floor(bar / 2) % AudioManager.LICKS.length];
      const note = lick[(s - 8) / 2];
      if (note !== undefined && !(night && s % 4 === 2)) this.lead(t, out, hz(note + 12, 146.83), sx * 1.8, night ? 0.045 : 0.06);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private kick(t: number, out: AudioNode, v: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this.env(g, t, v, 0.004, 0.28);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private snare(t: number, out: AudioNode, v: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    this.env(g, t, v, 0.003, 0.16);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.18);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    this.env(og, t, v * 0.6, 0.003, 0.09);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.1);
  }

  private hat(t: number, out: AudioNode, v: number, dur: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    this.env(g, t, v, 0.002, dur);
    src.connect(hp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Plucky synth bass: saw through a snappy low-pass envelope ("pop"). */
  private bass(t: number, out: AudioNode, f: number, v: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur * 0.8);
    const g = ctx.createGain();
    this.env(g, t, v * 0.32, 0.005, dur);
    o.connect(lp).connect(g).connect(out);
    sub.connect(g);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  /** Short "chicken-scratch" chord with an auto-wah sweep. */
  private stab(t: number, out: AudioNode, freqs: number[], v: number): void {
    const ctx = this.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.07);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, v, 0.004, 0.17);
    bp.connect(g).connect(out);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.19);
    }
  }

  /** Warm electric-piano style pad with a gentle tremolo. */
  private pad(t: number, out: AudioNode, freqs: number[], dur: number, v: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.04);
    g.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = ctx.createOscillator();
    const tg = ctx.createGain();
    trem.frequency.value = 5;
    tg.gain.value = v * 0.25;
    trem.connect(tg).connect(g.gain);
    g.connect(out);
    for (const f of freqs) {
      for (const [type, mul, lvl] of [['sine', 1, 1], ['triangle', 2, 0.25]] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = type;
        o.frequency.value = f * mul;
        og.gain.value = lvl / freqs.length;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
    trem.start(t);
    trem.stop(t + dur + 0.05);
  }

  private lead(t: number, out: AudioNode, f: number, dur: number, v: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    vib.frequency.value = 6;
    vg.gain.value = f * 0.008;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    this.env(g, t, v, 0.01, dur);
    o.connect(g).connect(out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
  }

  /** Dev/QA: render the music offline (no speakers needed) for level checks and previews. */
  static async renderPreview(seconds: number, night = false): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.round(44100 * seconds), 44100);
    const m = new AudioManager();
    const self = m as unknown as { ctx: BaseAudioContext; master: GainNode; music: GainNode; noiseBuf: AudioBuffer };
    self.ctx = ctx;
    self.master = ctx.createGain();
    self.master.connect(ctx.destination);
    self.music = ctx.createGain();
    self.music.gain.value = 0.5 * 0.35 * 2.5; // default music volume, normalised for listening
    self.music.connect(self.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    self.noiseBuf = buf;
    const sx = 60 / (night ? 92 : 104) / 4;
    for (let n = 0, t = 0.05; t < seconds - 0.5; n++, t += sx) m.playStep(n, t + (n % 2 ? sx * 0.12 : 0), sx, night);
    return ctx.startRendering();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
