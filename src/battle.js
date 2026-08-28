// ============================================================
//  おどかし勝負（ともだちとの バトル）
//   ・部屋を作った人（おや）が「はじめる」を おすと、
//     3・2・1 の あとに 勝負が はじまる
//   ・おなじ廃校で、決めた時間のあいだに
//     どれだけ たくさん おどかせたかを きそう
//   ・おわると けっかが 出て、おどかした人数ぶん 材料がもらえる
//
//  どうやって みんなで 合わせているか
//   ・時こく（時計）は 端末ごとに ずれるので、送るのは
//     「のこり何秒か」だけ。うけとった側は そこから
//     自分で へらしていく
//   ・おやが のこり秒と ようすを 送り、お客さんは それに合わせる
//   ・自分が おどかした人数は、自分で 数えて みんなに 送る
// ============================================================

// もらえる材料。おどかすほど たくさん・いい色になる
import { MATERIALS, RARITY } from "./data.js";

export const BATTLE_DROPS = ["onnen", "hokori", "denchi", "pan", "wax", "kami", "nurunuru"];

export class Battle {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.phase = "off";      // off / count（3・2・1）/ play（勝負ちゅう）/ over（けっか）
    this.left = 0;           // のこり秒
    this.dur = 180;          // 何秒の勝負か
    this.score = 0;          // 自分が おどかした 人数
    this.peerScores = {};    // pid → 人数
    this.lastCount = -1;     // 3・2・1 の 出しわけ用
    this.ended = null;       // けっかの ならび
  }

  get on() { return this.phase === "count" || this.phase === "play"; }
  get playing() { return this.phase === "play"; }

  // --- おや：勝負を はじめる --------------------------------
  start(minutes) {
    const g = this.game;
    if (!g.net.on || !g.net.isHost) return false;
    this.reset();
    this.dur = Math.round((minutes || 3) * 60);
    this.phase = "count";
    this.left = 3.999;                       // 3・2・1
    g.ui.closeRoom();
    g.setPaused(false);
    g.ui.hideResult();
    return true;
  }

  // --- おどかしたぶんを 数える ------------------------------
  //  たたみかけ・ふいうちでも 1人は 1人。
  //  同じ人を 何度おどかしても、慣れられて 効かなくなるので
  //  むやみに 連打しても 増えない。
  countScare() {
    if (this.phase !== "play") return;
    this.score++;
    this.game.audio.tone(880, 0.09, "square", 0.05, 1200);
  }

  // --- 毎フレーム ------------------------------------------
  update(dt) {
    const g = this.game;
    if (this.phase === "off") return;

    // 部屋から出たら 勝負も おわり
    if (!g.net.on && this.phase !== "over") { this.finish(true); return; }

    if (g.net.isHost) {
      // おやが 時間を すすめる
      this.left -= dt;
      if (this.phase === "count" && this.left <= 0) {
        this.phase = "play";
        this.left = this.dur;
        g.ui.showCount("スタート！", true);
        g.audio.rankUp();
      } else if (this.phase === "play" && this.left <= 0) {
        this.finish(false);
        return;
      }
    } else {
      // お客さんは、とどいた のこり秒から 自分で へらす
      this.left -= dt;
      if (this.left < 0) this.left = 0;
    }

    // 3・2・1 の 数字を 出す
    if (this.phase === "count") {
      const n = Math.max(1, Math.ceil(this.left));
      if (n !== this.lastCount) {
        this.lastCount = n;
        g.ui.showCount(String(n), false);
        g.audio.tone(520, 0.16, "square", 0.07, 520);
      }
    }
  }

  // --- おやから とどいた ようすに 合わせる ------------------
  applyRemote(bt) {
    if (!bt) {
      // おやが 勝負を やめた
      if (this.phase === "count" || this.phase === "play") this.finish(true);
      return;
    }
    const was = this.phase;
    if (was === "play" && bt.p === "over") { this.finish(false); return; }
    this.phase = bt.p;
    this.dur = bt.d || this.dur;
    // のこり秒は、ずれが 大きいときだけ 合わせる（カクつかせない）
    if (Math.abs(this.left - bt.l) > 0.9 || was !== bt.p) this.left = bt.l;
    if (was !== "play" && bt.p === "play") {
      this.game.ui.showCount("スタート！", true);
      this.game.audio.rankUp();
      this.lastCount = -1;
    }
  }

  // おやが みんなに 送る ようす
  netState() {
    if (this.phase === "off") return null;
    return { p: this.phase, l: +this.left.toFixed(2), d: this.dur };
  }

  // --- おわり ----------------------------------------------
  finish(cancelled) {
    const g = this.game;
    const wasPlaying = this.phase === "play" || this.phase === "count";
    this.phase = "over";
    this.left = 0;
    g.ui.setBattle(null);
    if (cancelled) { this.phase = "off"; return; }
    if (!wasPlaying) return;

    // じゅんい を つける
    const me = { name: (g.net.name || "じぶん"), score: this.score, me: true };
    const rows = [me];
    for (const [pid, pr] of g.net.peers) {
      rows.push({ name: pr.name, score: this.peerScores[pid] || 0, me: false });
    }
    rows.sort((a, b) => b.score - a.score);
    let place = 0, lastScore = null;
    rows.forEach((r, i) => {
      if (r.score !== lastScore) { place = i + 1; lastScore = r.score; }
      r.place = place;
    });

    const mine = rows.find((r) => r.me);
    const gift = this.giveGift(mine.score, mine.place === 1 && rows.length > 1);
    const txt = giftText(gift);
    this.ended = rows;
    g.ui.showResult(rows, { num: gift.num, won: gift.won, items: txt.items, tiers: txt.tiers }, mine);
    g.audio.rankUp();
    setTimeout(() => { if (this.phase === "over") this.phase = "off"; }, 400);
  }

  // --- ごほうび --------------------------------------------
  //  おどかした人数が 多いほど、たくさん・いい色 もらえる。
  //  1位には おまけ。0人でも 参加賞は もらえる。
  giveGift(score, won) {
    const g = this.game;
    const num = Math.min(16, 2 + Math.floor(score / 2) + (won ? 3 : 0));
    // 色の あたり やすさ。0人なら 白ばかり、たくさんなら 銀や金も
    const luck = Math.min(1, score / 22) * (won ? 1.15 : 1);
    const got = {};      // kind → 数
    const tiers = {};    // tier → 数
    for (let i = 0; i < num; i++) {
      const kind = BATTLE_DROPS[Math.floor(Math.random() * BATTLE_DROPS.length)];
      const tier = pickTier(luck);
      const mult = RARITY[tier].mult;
      g.inv[kind] = (g.inv[kind] || 0) + mult;
      got[kind] = (got[kind] || 0) + mult;
      if (tier >= 1) {
        g.shards[tier] = (g.shards[tier] || 0) + 1;
        tiers[tier] = (tiers[tier] || 0) + 1;
      }
    }
    g.ui.setBag(g.inv);
    g.ui.setShards(g.shards);
    g.saveNow(false);
    return { num, got, tiers, won };
  }
}

// 勝負の ごほうびの 色を きめる。
//  luck が 0 に近いと 白ばかり、1 に近いと いい色も 出る。
function pickTier(luck) {
  const near = [640, 250, 80, 24, 5, 0.9, 0.15];
  const far = [120, 230, 250, 220, 120, 44, 16];
  const w = near.map((v, i) => v + (far[i] - v) * luck);
  let sum = 0;
  for (const v of w) sum += v;
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

// けっか画面の 文
export function giftText(gift) {
  const kinds = Object.keys(gift.got);
  const items = kinds.map((k) => MATERIALS[k].icon + MATERIALS[k].name + "×" + gift.got[k]).join("　");
  const tiers = Object.keys(gift.tiers).sort((a, b) => b - a)
    .map((t) => RARITY[t].name + "×" + gift.tiers[t]).join("　");
  return { items, tiers };
}
