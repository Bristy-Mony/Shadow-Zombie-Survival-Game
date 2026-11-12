export class AudioManager {
  private context?: AudioContext;
  private hum?: OscillatorNode;
  private humGain?: GainNode;
  private ambience?: HTMLAudioElement;
  private threatLoop?: HTMLAudioElement;
  private readonly pools = new Map<string, HTMLAudioElement[]>();
  private readonly sampleData = new Map<string, ArrayBuffer>();
  private readonly sampleBuffers = new Map<string, AudioBuffer>();
  private tensionNodes: AudioNode[] = [];
  private tensionMaster?: GainNode;
  private readonly files = {
    shot: `${import.meta.env.BASE_URL}assets/audio/laser-shot.ogg`, impact: `${import.meta.env.BASE_URL}assets/audio/laser-impact.ogg`,
    zombieNear: `${import.meta.env.BASE_URL}assets/audio/zombie-near.wav`, zombieAttack: `${import.meta.env.BASE_URL}assets/audio/zombie-attack.wav`, zombieDie: `${import.meta.env.BASE_URL}assets/audio/zombie-die.wav`,
  };

  constructor() { void this.prefetchSamples(); }

  private async prefetchSamples() {
    await Promise.all(Object.values(this.files).map(async (source) => {
      try { this.sampleData.set(source, await (await fetch(source)).arrayBuffer()); } catch { /* Media-element fallback remains available. */ }
    }));
    void this.decodeSamples();
  }

  private async decodeSamples() {
    if (!this.context) return;
    await Promise.all([...this.sampleData].map(async ([source, data]) => {
      if (this.sampleBuffers.has(source)) return;
      try { this.sampleBuffers.set(source, await this.context!.decodeAudioData(data.slice(0))); } catch { /* Keep fallback. */ }
    }));
  }

  resume() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    void this.decodeSamples();
    if (!this.ambience) {
      this.ambience = new Audio(`${import.meta.env.BASE_URL}assets/audio/horror-music-593677.mp3`); this.ambience.loop = true; this.ambience.preload = 'auto'; this.ambience.volume = 0.32;
      this.threatLoop = new Audio(this.files.zombieNear); this.threatLoop.loop = true; this.threatLoop.preload = 'auto'; this.threatLoop.volume = 0;
      this.preloadSamples();
    }
    if (this.ambience.paused) void this.ambience.play().catch(() => undefined);
    if (this.threatLoop?.paused) void this.threatLoop.play().catch(() => undefined);
    this.startTensionScore();
  }

  private preloadSamples() {
    const sizes = new Map([[this.files.shot, 5], [this.files.impact, 4], [this.files.zombieNear, 2], [this.files.zombieAttack, 2], [this.files.zombieDie, 2]]);
    for (const [source, size] of sizes) {
      const pool = Array.from({ length: size }, () => {
        const audio = new Audio(source); audio.preload = 'auto'; audio.load(); return audio;
      });
      this.pools.set(source, pool);
    }
  }

  private sample(source: string, volume = 0.5, rate = 1) {
    const buffer = this.sampleBuffers.get(source);
    if (buffer && this.context) {
      const node = this.context.createBufferSource(); const gain = this.context.createGain();
      node.buffer = buffer; node.playbackRate.value = rate; gain.gain.value = volume;
      node.connect(gain).connect(this.context.destination); node.start();
      return;
    }
    const pool = this.pools.get(source);
    const audio = pool?.find((candidate) => candidate.paused || candidate.ended) ?? pool?.[0] ?? new Audio(source);
    audio.pause(); audio.currentTime = 0; audio.volume = volume; audio.playbackRate = rate; void audio.play().catch(() => undefined);
  }

  private startTensionScore() {
    if (this.tensionNodes.length || !this.context) return;
    const ctx = this.context; const master = ctx.createGain(); master.gain.value = 0.025; master.connect(ctx.destination); this.tensionMaster = master;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 1.8; filter.connect(master);
    const droneA = ctx.createOscillator(); const droneB = ctx.createOscillator(); const droneGain = ctx.createGain();
    droneA.type = 'sine'; droneA.frequency.value = 43.65; droneB.type = 'triangle'; droneB.frequency.value = 46.25; droneB.detune.value = -7;
    droneGain.gain.value = 0.34; droneA.connect(droneGain); droneB.connect(droneGain); droneGain.connect(filter);
    const pulse = ctx.createOscillator(); const pulseGain = ctx.createGain(); pulse.type = 'sine'; pulse.frequency.value = 87.3; pulseGain.gain.value = 0.12; pulse.connect(pulseGain).connect(filter);
    const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain(); lfo.type = 'sine'; lfo.frequency.value = 0.19; lfoGain.gain.value = 0.1; lfo.connect(lfoGain).connect(pulseGain.gain);
    droneA.start(); droneB.start(); pulse.start(); lfo.start();
    this.tensionNodes = [master, filter, droneA, droneB, droneGain, pulse, pulseGain, lfo, lfoGain];
  }

  updateThreat(nearestZombieDistance: number, dt: number, driving = false) {
    if (!this.ambience || !this.threatLoop) return;
    const proximity = driving || !Number.isFinite(nearestZombieDistance) ? 0 : Math.max(0, Math.min(1, 1 - (nearestZombieDistance - 2) / 20)) ** 1.35;
    const smoothing = 1 - Math.exp(-dt * 2.7);
    this.threatLoop.volume += ((0.015 + proximity * 0.46) - this.threatLoop.volume) * smoothing;
    this.ambience.volume += (((driving ? 0.38 : 0.33 - proximity * 0.1)) - this.ambience.volume) * smoothing;
    if (this.tensionMaster && this.context) this.tensionMaster.gain.setTargetAtTime(driving ? 0.018 : 0.024 + proximity * 0.05, this.context.currentTime, 0.25);
  }

  tone(frequency: number, duration = 0.12, type: OscillatorType = 'sine', volume = 0.06) {
    this.resume(); const ctx = this.context!; const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + duration);
  }
  pickup() { this.tone(640, 0.1); window.setTimeout(() => this.tone(880, 0.13), 80); }
  fire() { this.sample(this.files.shot, 0.48, 0.94 + Math.random() * 0.12); }
  impact() { this.sample(this.files.impact, 0.25, 0.9 + Math.random() * 0.18); }
  zombieNear() { this.sample(this.files.zombieNear, 0.32, 0.82 + Math.random() * 0.28); }
  zombieAttack() { this.sample(this.files.zombieAttack, 0.42, 0.9 + Math.random() * 0.16); }
  zombieDie() { this.sample(this.files.zombieDie, 0.62, 0.9 + Math.random() * 0.08); }
  flashlight() { this.tone(190, 0.07, 'square', 0.025); }
  warning() { this.tone(64, 0.7, 'sawtooth', 0.04); }
  power() { this.tone(90, 0.7, 'sawtooth', 0.08); window.setTimeout(() => this.tone(220, 1, 'sine', 0.045), 400); }
  startHum() {
    this.resume(); if (this.hum) return; const ctx = this.context!; this.hum = ctx.createOscillator(); this.humGain = ctx.createGain();
    this.hum.frequency.value = 58; this.hum.type = 'sine'; this.humGain.gain.value = 0.012; this.hum.connect(this.humGain).connect(ctx.destination); this.hum.start();
  }
  destroy() {
    this.ambience?.pause(); this.ambience = undefined;
    this.threatLoop?.pause(); this.threatLoop = undefined;
    for (const pool of this.pools.values()) for (const audio of pool) { audio.pause(); audio.src = ''; }
    this.pools.clear(); this.hum?.stop(); this.hum = undefined; this.tensionNodes = []; this.tensionMaster = undefined; void this.context?.close();
    this.sampleBuffers.clear(); this.sampleData.clear();
  }
}
