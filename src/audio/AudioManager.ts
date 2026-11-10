export class AudioManager {
  private context?: AudioContext;
  private hum?: OscillatorNode;
  private humGain?: GainNode;
  private ambience?: HTMLAudioElement;
  private readonly files = {
    shot: `${import.meta.env.BASE_URL}assets/audio/laser-shot.ogg`, impact: `${import.meta.env.BASE_URL}assets/audio/laser-impact.ogg`,
    zombieNear: `${import.meta.env.BASE_URL}assets/audio/zombie-near.wav`, zombieAttack: `${import.meta.env.BASE_URL}assets/audio/zombie-attack.wav`, zombieDie: `${import.meta.env.BASE_URL}assets/audio/zombie-die.wav`,
  };

  resume() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    if (!this.ambience) {
      this.ambience = new Audio(`${import.meta.env.BASE_URL}assets/audio/dark-ambient.ogg`); this.ambience.loop = true; this.ambience.volume = 0.22;
    }
    void this.ambience.play().catch(() => undefined);
  }

  private sample(source: string, volume = 0.5, rate = 1) {
    const audio = new Audio(source); audio.volume = volume; audio.playbackRate = rate; void audio.play().catch(() => undefined);
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
  zombieDie() { this.sample(this.files.zombieDie, 0.5, 0.88 + Math.random() * 0.14); }
  flashlight() { this.tone(190, 0.07, 'square', 0.025); }
  warning() { this.tone(64, 0.7, 'sawtooth', 0.04); }
  power() { this.tone(90, 0.7, 'sawtooth', 0.08); window.setTimeout(() => this.tone(220, 1, 'sine', 0.045), 400); }
  startHum() {
    this.resume(); if (this.hum) return; const ctx = this.context!; this.hum = ctx.createOscillator(); this.humGain = ctx.createGain();
    this.hum.frequency.value = 58; this.hum.type = 'sine'; this.humGain.gain.value = 0.012; this.hum.connect(this.humGain).connect(ctx.destination); this.hum.start();
  }
  destroy() { this.ambience?.pause(); this.ambience = undefined; this.hum?.stop(); this.hum = undefined; void this.context?.close(); }
}
