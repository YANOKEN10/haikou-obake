// ============================================================
//  タッチ操作（スマホ・タブレット）
//   ・左下のスティックで移動（端まで倒すとダッシュ）
//   ・画面を指でなぞると視点が回る
//   ・右下のボタンで おどかす／すりぬけ／うく／おく
// ============================================================
export function isTouchDevice() {
  return matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
}

export class TouchControls {
  constructor(input, game) {
    this.input = input;
    this.game = game;
    this.stickId = null;
    this.lookId = null;
    this.lookX = 0; this.lookY = 0;

    document.body.classList.add("touch");
    this.stick = document.getElementById("stick");
    this.knob = document.getElementById("stickKnob");

    this.bindStickPosition();
    this.bindStick();
    this.bindLook();
    this.bindButton("bScare", () => game.doScare());
    this.bindButton("bPlace", () => game.placeTrap());
    this.bindButton("bTake", () => game.retrieve());
    this.bindHold("bPhase", "KeyQ");
    this.bindHold("bUp", "Space");
    this.bindButton("bCraft", () => {
      game.ui.toggleCraft();
      this.release();
    });
    const cc = document.getElementById("craftClose");
    if (cc) cc.addEventListener("click", () => game.ui.closeCraft());

    this.checkOrientation();
    addEventListener("resize", () => this.checkOrientation());
    addEventListener("orientationchange", () => setTimeout(() => this.checkOrientation(), 250));
    if (window.visualViewport) visualViewport.addEventListener("resize", () => this.checkOrientation());
    const mq = matchMedia("(orientation: portrait)");
    if (mq.addEventListener) mq.addEventListener("change", () => this.checkOrientation());

    // ピンチズームや引っぱって更新を止める
    // 画面をなぞる操作をさまたげるのは、ゲーム中だけにする。
    // ホーム画面やメニューでは、ふつうにスクロールできないと詰んでしまう。
    document.addEventListener("touchmove", (e) => {
      if (!game.started || game.paused || game.ui.craftOpen || e.target.closest?.("#hotbar")) return;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("dblclick", (e) => e.preventDefault());
  }

  checkOrientation() {
    this.applyStickPosition?.();
    const portrait = innerHeight > innerWidth;
    document.body.classList.toggle("portrait", portrait);
    if (portrait) this.release();
    // 材料表示を人間リストの下に置くための高さ
    const hl = document.getElementById("humanList");
    if (hl) document.documentElement.style.setProperty("--hl", (hl.offsetHeight + 8) + "px");
  }

  release() {
    this.input.axisX = 0; this.input.axisZ = 0; this.input.dash = false;
    this.stickId = null; this.lookId = null;
    this.knob.style.transform = "";
    this.stick.classList.remove("dash");
  }

  // 位置はこの端末に保存。画面の大きさが変わったら、操作できる範囲へ収める。
  bindStickPosition() {
    this.stickPosition = { x: 40, y: 24 };
    try {
      const saved = JSON.parse(localStorage.getItem("obake-stick-position") || "null");
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) this.stickPosition = saved;
    } catch (_) {}
    const settings = document.createElement("details");
    settings.id = "stickSettings";
    settings.innerHTML = `<summary>🎮 移動スティックの位置</summary>
      <p>左右・上下の位置を調整できます。この端末に自動保存されます。</p>
      <label>左右 <output id="stickXValue"></output><input id="stickX" type="range" min="8" step="1" aria-label="移動スティックの左右位置"></label>
      <label>上下 <output id="stickYValue"></output><input id="stickY" type="range" min="8" step="1" aria-label="移動スティックの上下位置"></label>
      <div class="stickPreview" aria-hidden="true"><i></i><span>画面内の位置</span></div>
      <button class="pbtn" id="stickReset" type="button">標準の位置にもどす</button><small id="stickPositionStatus" role="status"></small>`;
    document.querySelector("#pause .pbox").insertBefore(settings, document.getElementById("pHome"));
    const style = document.createElement("style");
    style.textContent = `#stickSettings{border:1px solid #9d80da;border-radius:10px;padding:9px 12px;margin:8px 0;color:#ede6ff;text-align:left}#stickSettings summary{cursor:pointer;font-size:14px}#stickSettings p,#stickSettings small{font-size:11px;line-height:1.5}#stickSettings label{display:block;font-size:13px;margin:8px 0}#stickSettings output{float:right;color:#8ff0d8}#stickSettings input{display:block;width:100%;height:30px;accent-color:#a587f4;touch-action:pan-x}#stickSettings .stickPreview{height:70px;position:relative;border:1px solid #685685;background:#100d20;border-radius:6px;overflow:hidden}#stickSettings .stickPreview i{position:absolute;width:20px;height:20px;border:2px solid #c3a5ff;background:#9f73dd66;border-radius:50%;transform:translate(-50%,50%)}#stickSettings .stickPreview span{position:absolute;right:8px;top:5px;font-size:10px;color:#aba1ba}#pause .pbox{max-height:calc(100dvh - 24px);overflow-y:auto}`;
    document.head.appendChild(style);
    const save = () => {
      this.release(); this.applyStickPosition();
      try { localStorage.setItem("obake-stick-position", JSON.stringify(this.stickPosition)); document.getElementById("stickPositionStatus").textContent="位置を保存しました"; }
      catch (_) { document.getElementById("stickPositionStatus").textContent="このブラウザでは保存できません。今回のプレイには反映しています。"; }
    };
    for (const axis of ["x", "y"]) document.getElementById("stick" + axis.toUpperCase()).addEventListener("input", e => { this.stickPosition[axis] = Number(e.target.value); save(); });
    document.getElementById("stickReset").addEventListener("click", () => { this.stickPosition={x:40,y:24}; save(); });
    settings.addEventListener("toggle", () => this.release());
    this.applyStickPosition();
  }

  applyStickPosition() {
    if (!this.stickPosition) return;
    const size = this.stick.offsetWidth || 126;
    const limits = { x: Math.max(8, Math.min(220, innerWidth * .48 - size)), y: Math.max(8, Math.min(160, innerHeight - 230)) };
    const values = {};
    for (const axis of ["x", "y"]) {
      values[axis] = Math.round(Math.max(8, Math.min(limits[axis], this.stickPosition[axis])));
      const slider = document.getElementById("stick" + axis.toUpperCase());
      if (slider) { slider.max = Math.floor(limits[axis]); slider.value = values[axis]; }
      const label=document.getElementById("stick" + axis.toUpperCase() + "Value");
      if(label)label.textContent=(axis === "x" ? "左から " : "下から ")+values[axis]+"px";
    }
    this.stick.style.left = `max(env(safe-area-inset-left, 0px), ${values.x}px)`;
    this.stick.style.bottom = `max(env(safe-area-inset-bottom, 0px), ${values.y}px)`;
    document.getElementById("hotbar").style.left = (values.x + size + 12) + "px";
    const dot=document.querySelector(".stickPreview i");
    if(dot){dot.style.left=(values.x+size/2)/innerWidth*100+"%";dot.style.bottom=(values.y+size/2)/innerHeight*100+"%";}
  }

  // --- 左下のスティック -------------------------------------
  bindStick() {
    const R = 46;
    const start = (e) => {
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      this.origin = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    };
    const move = (e) => {
      if (this.stickId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        let dx = t.clientX - this.origin.x;
        let dy = t.clientY - this.origin.y;
        const d = Math.hypot(dx, dy);
        const k = d > R ? R / d : 1;
        dx *= k; dy *= k;
        this.knob.style.transform = "translate(" + dx + "px," + dy + "px)";
        const mag = Math.min(1, d / R);
        // 画面の上方向 = 前進
        this.input.axisX = (dx / R) * (mag > 0.12 ? 1 : 0);
        this.input.axisZ = (dy / R) * (mag > 0.12 ? 1 : 0);
        this.input.dash = mag > 0.86;
        this.stick.classList.toggle("dash", this.input.dash);
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        this.release();
      }
    };
    this.stick.addEventListener("touchstart", start, { passive: false });
    addEventListener("touchmove", move, { passive: false });
    addEventListener("touchend", end);
    addEventListener("touchcancel", end);
  }

  // --- 画面をなぞって視点を回す ------------------------------
  bindLook() {
    const isControl = (el) => el && el.closest && el.closest("#stick,#hotbar,.tbtn,#sysbar,#cameraZoom,#viewControls,#pause,#room,#craft,#screen,#rotate");
    addEventListener("touchstart", (e) => {
      if (this.lookId !== null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) continue;
        if (isControl(document.elementFromPoint(t.clientX, t.clientY))) continue;
        this.lookId = t.identifier;
        this.lookX = t.clientX; this.lookY = t.clientY;
        break;
      }
    }, { passive: false });

    addEventListener("touchmove", (e) => {
      if (this.lookId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        this.input.mouseDX += (t.clientX - this.lookX) * 1.35;
        this.input.mouseDY += (t.clientY - this.lookY) * 1.35;
        this.lookX = t.clientX; this.lookY = t.clientY;
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.lookId) this.lookId = null;
    };
    addEventListener("touchend", end);
    addEventListener("touchcancel", end);
  }

  // --- 押すたびに1回だけ効くボタン ---------------------------
  bindButton(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add("on");
      if (navigator.vibrate) navigator.vibrate(12);
      fn();
    };
    const up = () => el.classList.remove("on");
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    el.addEventListener("click", (e) => { e.preventDefault(); });
  }

  // --- 押しているあいだ効くボタン（キーを押しっぱなしにする） --
  bindHold(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add("on");
      if (!this.input.keys.has(code)) this.input.pressed.add(code);
      this.input.keys.add(code);
    };
    const up = (e) => {
      if (e) e.preventDefault();
      el.classList.remove("on");
      this.input.keys.delete(code);
    };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up);
  }
}

// 全画面表示＋横向き固定（対応している端末のみ）
export async function goFullscreen() {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) { /* iPhone の Safari など、対応していない端末は無視 */ }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
  } catch (e) { /* 固定できない端末は無視 */ }
}
