// 添付された曲を、プレイ中だけ流す。効果音の再生とは切り離す。
export class Music {
  constructor(game) {
    this.game = game;
    this.enabled = true;
    this.volume = .35;
    this.offset = 0;
    try {
      const saved = JSON.parse(localStorage.getItem("haikou-obake:music") || "null");
      if (saved) {
        this.enabled = saved.enabled !== false;
        if (Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
      }
    } catch (_) { /* 保存できない環境では初期設定 */ }
    const controls = document.createElement("section");
    controls.id = "musicControls";
    controls.style.cssText = "margin:14px 0;padding:12px;border:1px solid var(--edge2,#775eaa);border-radius:12px;font-size:14px;text-align:left";
    controls.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><b>♫ ゲーム中の曲</b><button id="musicToggle" type="button" style="font:inherit;background:var(--panel2);color:var(--mint);border:1px solid var(--mint);border-radius:8px;min-height:44px;padding:8px 18px"></button></div><div style="margin:6px 0;font-size:12px;color:var(--muted)">Tiptoeing Ghosts</div><label for="musicVolume">曲の音量 <output id="musicLevel"></output></label><input id="musicVolume" type="range" min="0" max="100" step="5" style="width:100%;min-height:36px;accent-color:var(--mint)"><div id="musicStatus" role="status" style="font-size:12px"></div>`;
    const resume = document.getElementById("pResume");
    resume.parentElement.insertBefore(controls, resume);
    this.toggle = controls.querySelector("#musicToggle");
    this.slider = controls.querySelector("#musicVolume");
    this.level = controls.querySelector("#musicLevel");
    this.status = controls.querySelector("#musicStatus");
    this.toggle.onclick = () => { this.enabled = !this.enabled; this.save(); this.sync(); };
    this.slider.value = Math.round(this.volume * 100);
    this.slider.oninput = () => { this.volume = Number(this.slider.value) / 100; if (this.gain) this.gain.gain.value = this.volume; this.save(); };
    this.render();
    document.addEventListener("visibilitychange", () => this.sync());
    addEventListener("pagehide", () => this.stop());
    addEventListener("pageshow", () => this.sync());
  }
  render() {
    this.toggle.textContent = this.enabled ? "オン" : "オフ";
    this.toggle.setAttribute("aria-pressed", String(this.enabled));
    this.toggle.setAttribute("aria-label", "ゲーム中の曲 " + (this.enabled ? "オン" : "オフ"));
    this.level.textContent = Math.round(this.volume * 100) + "%";
  }
  save() {
    this.render();
    try { localStorage.setItem("haikou-obake:music", JSON.stringify({ enabled: this.enabled, volume: this.volume })); } catch (_) { /* 保存不可 */ }
  }
  active() { return this.enabled && this.game.started && !this.game.paused && !document.hidden; }
  sync() {
    const ctx = this.game.audio.ctx;
    if (!this.active() || !ctx) { this.stop(); return; }
    if (!this.buffer) {
      if (this.loading) return;
      this.status.textContent = "曲を読み込んでいます…";
      this.loading = fetch("/audio/tiptoeing-ghosts.mp3").then(r => {
        if (!r.ok) throw Error("音源の取得に失敗");
        return r.arrayBuffer();
      }).then(data => ctx.decodeAudioData(data)).then(buffer => {
        this.buffer = buffer; this.status.textContent = ""; this.sync();
      }).catch(() => { this.status.textContent = "曲を読み込めませんでした。ネットにつないで、もう一度オンにしてね。"; }).finally(() => { this.loading = null; });
      return;
    }
    if (this.source) return;
    if (!this.gain) { this.gain = ctx.createGain(); this.gain.connect(this.game.audio.master); }
    this.gain.gain.value = this.volume;
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.gain);
    this.startedAt = ctx.currentTime;
    this.source.start(0, this.offset);
  }
  stop() {
    if (!this.source) return;
    this.offset = (this.offset + this.game.audio.ctx.currentTime - this.startedAt) % this.buffer.duration;
    this.source.stop(); this.source.disconnect(); this.source = null;
  }
}
