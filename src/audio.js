// ============================================================
//  効果音（すべて WebAudio で合成。音声ファイル不要）
// ============================================================
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.ambient();
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  // 低い風のようなノイズを常時鳴らす
  ambient() {
    const c = this.ctx;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0.085;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();

    // ゆっくり揺らす
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.045;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
  }

  tone(freq, dur, type = "sine", vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(dur, vol = 0.2, freq = 1200, q = 1, delay = 0, type = "bandpass") {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  // --- ゲーム内イベント ------------------------------------
  // レアな色ほど、音が はなやかになる
  pickup(tier) {
    const T = tier || 0;
    this.tone(880, 0.09, "triangle", 0.13);
    this.tone(1320, 0.13, "triangle", 0.1, null, 0.06);
    if (T >= 1) this.tone(1760, 0.14, "sine", 0.09, null, 0.11);
    if (T >= 3) [1976, 2349, 2637].forEach((f, i) => this.tone(f, 0.16, "sine", 0.08, null, 0.16 + i * 0.07));
    if (T >= 5) {
      [2637, 3136, 3520, 4186].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.09, null, 0.34 + i * 0.09));
      this.noise(0.5, 0.05, 6000, 5, 0.3, "highpass");
    }
  }
  deny()    { this.tone(180, 0.16, "square", 0.09, 110); }
  click()   { this.tone(660, 0.05, "square", 0.07); }
  place()   { this.tone(300, 0.12, "sine", 0.14, 620); this.noise(0.12, 0.08, 900); }

  scare() {
    this.tone(150, 0.5, "sawtooth", 0.16, 900);
    this.noise(0.35, 0.22, 2400, 0.7);
    this.tone(1400, 0.22, "square", 0.06, 300, 0.03);
  }

  scream(pitch = 1) {
    const f = 520 * pitch;
    this.tone(f, 0.42, "sawtooth", 0.12, f * 1.9);
    this.tone(f * 1.5, 0.3, "square", 0.05, f * 2.4, 0.05);
    this.noise(0.4, 0.07, 1800, 2);
  }

  laugh() { for (let i = 0; i < 4; i++) this.tone(360 + i * 20, 0.09, "triangle", 0.07, 300, i * 0.1); }

  trapSound(id) {
    switch (id) {
      case "locker":  for (let i = 0; i < 7; i++) this.noise(0.06, 0.16, 260 + Math.random() * 400, 3, i * 0.07, "bandpass"); break;
      case "chalk":   this.tone(2600, 0.55, "sawtooth", 0.05, 3400); this.noise(0.5, 0.05, 5200, 8); break;
      case "uwabaki": for (let i = 0; i < 8; i++) this.noise(0.05, 0.11, 700, 2, i * 0.11); break;
      case "piano":   [523, 587, 659, 494, 440].forEach((f, i) => { this.tone(f, 0.7, "triangle", 0.1, null, i * 0.14); this.tone(f * 1.01, 0.7, "sine", 0.05, null, i * 0.14); }); break;
      case "suido":   this.noise(1.1, 0.14, 3800, 0.6, 0, "highpass"); break;
      case "jintai":  this.tone(90, 0.9, "sawtooth", 0.13, 60); this.noise(0.25, 0.12, 400, 1, 0.55); break;
      case "tsuru":   this.tone(1500, 0.32, "sine", 0.09, 260); this.noise(0.22, 0.09, 2600, 3, 0.05, "highpass"); this.tone(120, 0.2, "triangle", 0.11, 60, 0.24); break;
      case "kagami":  this.tone(1800, 0.5, "sine", 0.05, 2300); this.noise(0.3, 0.05, 6000, 6, 0.1, "highpass"); break;
      case "housou":  [880, 660, 990, 740].forEach((f, i) => this.tone(f, 0.34, "sine", 0.09, null, i * 0.3)); this.noise(1.2, 0.03, 900, 2, 1.2); break;
      case "fumikiri":for (let i = 0; i < 6; i++) this.noise(0.16, 0.1, 1400, 1.4, i * 0.26, "highpass"); break;
      case "ofuda":   this.noise(0.34, 0.13, 2200, 2, 0, "highpass"); this.tone(70, 1.1, "sawtooth", 0.12, 44, 0.2); break;
      case "kyuushoku": for (let i = 0; i < 10; i++) this.noise(0.07, 0.09, 300 + Math.random() * 200, 2.5, i * 0.13); this.tone(200, 0.5, "square", 0.05, 150, 0.4); break;
      default:        this.scare();
    }
  }

  summon() {
    [220, 330, 440, 660].forEach((f, i) => this.tone(f, 0.5, "sine", 0.11, f * 1.5, i * 0.07));
    this.noise(0.6, 0.09, 700, 1.4);
  }

  escape() { [660, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.13, null, i * 0.09)); }
  rankUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, "square", 0.11, null, i * 0.1)); }
}
