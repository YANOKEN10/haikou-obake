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

    this.bindStick();
    this.bindLook();
    this.bindButton("bScare", () => game.doScare());
    this.bindButton("bPlace", () => game.placeTrap());
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
    document.addEventListener("touchmove", (e) => {
      if (!game.ui.craftOpen) e.preventDefault();
    }, { passive: false });
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("dblclick", (e) => e.preventDefault());
  }

  checkOrientation() {
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
    const isControl = (el) => el && el.closest && el.closest("#stick,.tbtn,#craft,#screen,#rotate");
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
