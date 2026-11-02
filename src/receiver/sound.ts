// The receiver's sound, synthesized as the prototype's round 13 does: quiet
// and soft, static and a faint heterodyne whistle while tuning, a click, the
// power-on thump and each channel's own note as it comes in. It is off by
// default, and browsers let it start only after a key or tap, so `enable`
// waits for the visitor's first one.

/** Each preset's note: tuning in sounds its channel. */
const NOTES = [220, 261.63, 293.66, 329.63, 392];

export class Sound {
  on = false;
  #ctx: AudioContext | null = null;
  #master!: GainNode;
  #noise!: GainNode;
  #whistle!: GainNode;
  #osc!: OscillatorNode;

  /** Turns the sound on or off. Turning it on before a key or tap only
   * records it; the first gesture starts it. */
  enable(on: boolean, gesture: boolean) {
    this.on = on;
    if (on && gesture) this.#ensure();
    if (this.#ctx) {
      if (on) void this.#ctx.resume();
      this.#master.gain.setTargetAtTime(
        on ? 0.55 : 0,
        this.#ctx.currentTime,
        0.25,
      );
    }
  }

  /** The visitor's key or tap: what lets the browser play sound. */
  gesture() {
    if (this.on && !this.#ctx) this.enable(true, true);
  }

  close() {
    void this.#ctx?.close();
    this.#ctx = null;
  }

  #ensure() {
    if (this.#ctx) return;
    const ctx = (this.#ctx = new AudioContext());
    this.#master = ctx.createGain();
    this.#master.gain.value = 0;
    // nothing crisp gets out
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 3200;
    this.#master.connect(warm).connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      b2 = 0.57 * b2 + white * 1.0526;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1100;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 140;
    this.#noise = ctx.createGain();
    this.#noise.gain.value = 0;
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(this.#noise)
      .connect(this.#master);
    source.start();
    this.#osc = ctx.createOscillator();
    this.#osc.frequency.value = 600;
    this.#whistle = ctx.createGain();
    this.#whistle.gain.value = 0;
    this.#osc.connect(this.#whistle).connect(this.#master);
    this.#osc.start();
  }

  /** Static and a whistle that fall away as a station, `distance` MHz off,
   * comes in. */
  tune(distance: number) {
    const ctx = this.#ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = Math.min(1, distance / 1.2);
    this.#noise.gain.setTargetAtTime(this.on ? 0.035 * n : 0, t, 0.04);
    this.#whistle.gain.setTargetAtTime(
      this.on && distance > 0.03 && distance < 1 ? 0.006 * (1 - distance) : 0,
      t,
      0.04,
    );
    this.#osc.frequency.setTargetAtTime(180 + distance * 2200, t, 0.03);
  }

  quiet() {
    this.tune(0);
  }

  #env(
    frequency: number,
    gain: number,
    attack: number,
    decay: number,
    cutoff = 0,
  ): OscillatorNode | null {
    const ctx = this.#ctx;
    if (!this.on || !ctx) return null;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = frequency;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    let out: AudioNode = osc.connect(env);
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      out = out.connect(filter);
    }
    out.connect(this.#master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
    return osc;
  }

  click(volume = 1) {
    const ctx = this.#ctx;
    if (!this.on || !ctx) return;
    const buffer = ctx.createBuffer(
      1,
      (ctx.sampleRate * 0.02) | 0,
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 8);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    gain.gain.value = 0.045 * volume;
    source.connect(filter).connect(gain).connect(this.#master);
    source.start();
  }

  power() {
    const thump = this.#env(90, 0.12, 0.004, 0.16);
    if (thump && this.#ctx)
      thump.frequency.exponentialRampToValueAtTime(
        45,
        this.#ctx.currentTime + 0.15,
      );
    this.#env(100, 0.008, 0.4, 1.4);
    this.#env(150, 0.004, 0.4, 1.2);
  }

  /** Preset `preset`'s note swells softly out of the static. */
  chime(preset: number) {
    const note = NOTES[(preset || 1) - 1]!;
    this.#env(note, 0.028, 0.14, 1.9, 700);
    this.#env(note / 2, 0.02, 0.2, 2.2, 500);
  }

  blip(preset: number) {
    this.#env(NOTES[(preset || 1) - 1]!, 0.008, 0.05, 0.3, 600);
  }
}
