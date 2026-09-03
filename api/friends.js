// ============================================================
//  ともだち
//   ・なまえが「ぴったり合ったとき」だけ相手を見つけられる。
//     一部分だけの検索にすると、サーバーに全員のなまえ一覧を
//     置くことになり、知らない人が子どもの名前を眺められて
//     しまうので、わざとその作りにしていない。
//   ・申請は、相手が「うける」を押すまで、ともだちにならない。
//   ・「さそう」は、あいことばを相手のところに置いておくだけ。
// ============================================================
const crypto = require("crypto");
const L = require("./_lib");
const TradeDb = require("./_trade-db");

const MAX_FRIENDS = 30;
const MAX_REQ = 20;
const MAX_TRADES = 20;
const INVITE_MS = 5 * 60 * 1000;      // さそいは5分で消える
const MATERIAL_IDS = ["hokori", "chalk", "uwabaki", "pan", "onnen", "denchi", "nurunuru", "wax", "kami"];

const arr = (v) => (Array.isArray(v) ? v : []);

function invOf(u) {
  const p = u && u.payload && u.payload.profile;
  if (!p) return null;
  if (!p.inv || typeof p.inv !== "object") p.inv = {};
  return p.inv;
}
function material(v) { return MATERIAL_IDS.indexOf(String(v || "")) >= 0 ? String(v) : ""; }
function amount(v) {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 1 && n <= 99 ? n : 0;
}
function tradeCard(t) {
  return { id: t.id, from: t.from, fromName: t.fromName, to: t.to, toName: t.toName,
    give: t.give, want: t.want, t: t.t };
}

// ともだちの一覧に出す、さしさわりのない範囲の記録
function cardOf(u) {
  const p = (u && u.payload && u.payload.profile) || null;
  const s = (p && p.stats) || {};
  return {
    id: u.id,
    display: u.display,
    has: Boolean(p),
    rank: p ? p.rank : null,
    kicked: p ? p.kicked || 0 : 0,
    wave: p ? Math.max(s.bestWave || 0, p.wave || 0) : 0,
    playSeconds: p ? Math.round(p.playSeconds || 0) : 0,
    updated: u.updated || 0,
    stats: p ? {
      scares: s.scares || 0, behind: s.behind || 0, combos: s.combos || 0,
      biggest: Math.round(s.biggest || 0), trapsFired: s.trapsFired || 0,
      trapsBuilt: s.trapsBuilt || 0, ghostsSummoned: s.ghostsSummoned || 0,
      materials: s.materials || 0, laughed: s.laughed || 0,
      cat: s.cat || 0, confession: s.confession || 0, retrieved: s.retrieved || 0,
    } : null,
  };
}

function liveInvite(u) {
  const iv = u && u.invite;
  if (!iv || !iv.code || Date.now() - (iv.t || 0) > INVITE_MS) return null;
  return { from: iv.from, display: iv.display, code: iv.code, t: iv.t };
}

// 自分の画面に出すもの一式
async function mine(user) {
  const friends = [];
  for (const fid of arr(user.friends).slice(0, MAX_FRIENDS)) {
    const f = await L.readUser(fid);
    if (f) friends.push(cardOf(f));
  }
  return {
    me: { id: user.id, display: user.display },
    friends,
    reqIn: arr(user.reqIn).map((r) => ({ id: r.id, display: r.display, t: r.t })),
    reqOut: arr(user.reqOut).map((r) => ({ id: r.id, display: r.display, t: r.t })),
    invite: liveInvite(user),
    tradesIn: arr(user.tradesIn).slice(0, MAX_TRADES).map(tradeCard),
    tradesOut: arr(user.tradesOut).slice(0, MAX_TRADES).map(tradeCard),
  };
}

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const claim = L.readToken(L.bearer(req));
  if (!claim) { res.status(401).json({ error: "auth", message: "ログインしなおしてください。" }); return; }

  let unlockTrade = null;
  try {
    let me = await L.readUser(claim.id);
    if (!me) { res.status(404).json({ error: "gone", message: "データが見つかりませんでした。" }); return; }

    if (req.method === "GET") { res.status(200).json(await mine(me)); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

    const b = L.body(req);
    const act = String(b.action || "");
    const otherId = L.normId(b.id);

    // 材料交換はNeonの排他ロックで直列化し、ロック後の在庫を確認する。
    if (act.indexOf("trade") === 0) {
      if (!TradeDb.configured()) {
        res.status(503).json({ error: "setup", message: "材料交換は ただいま準備中です。" }); return;
      }
      let partnerId = otherId;
      if (!partnerId && act !== "tradeCreate") {
        const tradeId = String(b.tradeId || "");
        const t = arr(me.tradesIn).concat(arr(me.tradesOut)).find((x) => x && x.id === tradeId);
        partnerId = t && (t.from === me.id ? t.to : t.from);
      }
      unlockTrade = await TradeDb.lock([me.id, partnerId]);
      const sendJson = res.json.bind(res);
      res.json = (data) => {
        const release = unlockTrade;
        unlockTrade = null;
        if (!release) return sendJson(data);
        release().then(() => sendJson(data), () => sendJson(data));
        return res;
      };
      const fresh = await L.readUser(claim.id);
      if (!fresh) { await unlockTrade(); res.status(404).json({ error: "gone" }); return; }
      me = fresh;
    }

    // --- 材料の交換 ------------------------------------------
    // 申し込んだ材料は先に預かる。交換IDを双方から消してから反映することで、
    // 同じボタンを二度押しても材料が二重に増えないようにする。
    if (act === "tradeCreate") {
      if (!otherId || arr(me.friends).indexOf(otherId) < 0) {
        res.status(403).json({ error: "notfriend", message: "ともだちとだけ 交換できます。" }); return;
      }
      if (arr(me.tradesOut).length >= MAX_TRADES) {
        res.status(409).json({ error: "full", message: "交換の申し込みが いっぱいです。" }); return;
      }
      const other = await L.readUser(otherId);
      if (!other || arr(other.friends).indexOf(me.id) < 0) {
        res.status(404).json({ error: "none", message: "そのともだちが 見つかりませんでした。" }); return;
      }
      if (arr(other.tradesIn).length >= MAX_TRADES) {
        res.status(409).json({ error: "full", message: "その人に届いた交換が いっぱいです。" }); return;
      }
      const giveKind = material(b.giveKind), wantKind = material(b.wantKind);
      const giveN = amount(b.giveN), wantN = amount(b.wantN);
      if (!giveKind || !wantKind || !giveN || !wantN) {
        res.status(400).json({ error: "trade", message: "材料と数を たしかめてください。" }); return;
      }
      const myInv = invOf(me), otherInv = invOf(other);
      if (!myInv || !otherInv) {
        res.status(409).json({ error: "nosave", message: "ふたりとも先に 記録をあずけてください。" }); return;
      }
      if ((myInv[giveKind] || 0) < giveN) {
        res.status(409).json({ error: "short", message: "わたす材料が 足りません。" }); return;
      }
      myInv[giveKind] = (myInv[giveKind] || 0) - giveN;
      const t = { id: crypto.randomUUID(), from: me.id, fromName: me.display,
        to: other.id, toName: other.display, give: { kind: giveKind, n: giveN },
        want: { kind: wantKind, n: wantN }, t: Date.now() };
      me.tradesOut = arr(me.tradesOut).concat([t]);
      other.tradesIn = arr(other.tradesIn).concat([t]);
      await L.writeUser(other);
      await L.writeUser(me);
      res.status(200).json(await mine(me)); return;
    }

    if (act === "tradeAccept" || act === "tradeReject" || act === "tradeCancel") {
      const tradeId = String(b.tradeId || "");
      const incoming = act !== "tradeCancel";
      const list = incoming ? arr(me.tradesIn) : arr(me.tradesOut);
      const t = list.find((x) => x && x.id === tradeId);
      if (!t) { res.status(409).json({ error: "done", message: "この交換は すでに終わっています。" }); return; }
      const other = await L.readUser(incoming ? t.from : t.to);
      if (!other) { res.status(404).json({ error: "none", message: "相手が 見つかりませんでした。" }); return; }
      const sender = incoming ? other : me;
      const receiver = incoming ? me : other;
      const senderInv = invOf(sender), receiverInv = invOf(receiver);
      if (!senderInv || !receiverInv) {
        res.status(409).json({ error: "nosave", message: "記録が 見つかりませんでした。" }); return;
      }
      if (act === "tradeAccept" && (receiverInv[t.want.kind] || 0) < t.want.n) {
        res.status(409).json({ error: "short", message: "交換に出す材料が 足りません。" }); return;
      }
      sender.tradesOut = arr(sender.tradesOut).filter((x) => x.id !== tradeId);
      receiver.tradesIn = arr(receiver.tradesIn).filter((x) => x.id !== tradeId);
      if (act === "tradeAccept") {
        receiverInv[t.want.kind] -= t.want.n;
        receiverInv[t.give.kind] = (receiverInv[t.give.kind] || 0) + t.give.n;
        senderInv[t.want.kind] = (senderInv[t.want.kind] || 0) + t.want.n;
      } else {
        senderInv[t.give.kind] = (senderInv[t.give.kind] || 0) + t.give.n;
      }
      await L.writeUser(other);
      await L.writeUser(me);
      res.status(200).json(await mine(me)); return;
    }

    // --- なまえで さがす -------------------------------------
    if (act === "search") {
      const q = L.normId(b.name);
      if (!q || q.length < 2) {
        res.status(400).json({ error: "name", message: "なまえを2文字いじょう入れてください。" });
        return;
      }
      if (q === me.id) {
        res.status(200).json({ found: false, self: true, message: "それは あなた自身です。" });
        return;
      }
      const u = await L.readUser(q);
      if (!u) {
        res.status(200).json({ found: false, message: "そのなまえの人は 見つかりませんでした。" });
        return;
      }
      const already = arr(me.friends).indexOf(u.id) >= 0;
      const sent = arr(me.reqOut).some((r) => r.id === u.id);
      const got = arr(me.reqIn).some((r) => r.id === u.id);
      res.status(200).json({ found: true, id: u.id, display: u.display, already, sent, got });
      return;
    }

    // --- ともだち申請をおくる --------------------------------
    if (act === "request") {
      if (!otherId || otherId === me.id) { res.status(400).json({ error: "id" }); return; }
      const other = await L.readUser(otherId);
      if (!other) { res.status(404).json({ error: "none", message: "その人は 見つかりませんでした。" }); return; }
      if (arr(me.friends).indexOf(otherId) >= 0) { res.status(200).json(await mine(me)); return; }
      if (arr(me.friends).length >= MAX_FRIENDS) {
        res.status(409).json({ error: "full", message: "ともだちは " + MAX_FRIENDS + " 人までです。" });
        return;
      }
      // 相手からすでに来ていたら、その場でともだちになる
      if (arr(me.reqIn).some((r) => r.id === otherId)) {
        me.reqIn = arr(me.reqIn).filter((r) => r.id !== otherId);
        other.reqOut = arr(other.reqOut).filter((r) => r.id !== me.id);
        me.friends = arr(me.friends).concat([otherId]);
        other.friends = arr(other.friends).concat([me.id]);
        await L.writeUser(other);
        await L.writeUser(me);
        res.status(200).json(await mine(me));
        return;
      }
      if (arr(other.reqIn).length >= MAX_REQ) {
        res.status(409).json({ error: "full", message: "その人あての申請が いっぱいです。" });
        return;
      }
      const now = Date.now();
      if (!arr(me.reqOut).some((r) => r.id === otherId)) {
        me.reqOut = arr(me.reqOut).concat([{ id: otherId, display: other.display, t: now }]);
      }
      if (!arr(other.reqIn).some((r) => r.id === me.id)) {
        other.reqIn = arr(other.reqIn).concat([{ id: me.id, display: me.display, t: now }]);
      }
      await L.writeUser(other);
      await L.writeUser(me);
      res.status(200).json(await mine(me));
      return;
    }

    // --- うける / ことわる / とりけす / やめる ----------------
    if (act === "accept" || act === "reject" || act === "cancel" || act === "remove") {
      if (!otherId) { res.status(400).json({ error: "id" }); return; }
      const other = await L.readUser(otherId);

      if (act === "accept") {
        if (!arr(me.reqIn).some((r) => r.id === otherId)) {
          res.status(200).json(await mine(me));
          return;
        }
        me.reqIn = arr(me.reqIn).filter((r) => r.id !== otherId);
        if (arr(me.friends).indexOf(otherId) < 0) me.friends = arr(me.friends).concat([otherId]);
        if (other) {
          other.reqOut = arr(other.reqOut).filter((r) => r.id !== me.id);
          if (arr(other.friends).indexOf(me.id) < 0) other.friends = arr(other.friends).concat([me.id]);
          await L.writeUser(other);
        }
      } else if (act === "reject") {
        me.reqIn = arr(me.reqIn).filter((r) => r.id !== otherId);
        if (other) {
          other.reqOut = arr(other.reqOut).filter((r) => r.id !== me.id);
          await L.writeUser(other);
        }
      } else if (act === "cancel") {
        me.reqOut = arr(me.reqOut).filter((r) => r.id !== otherId);
        if (other) {
          other.reqIn = arr(other.reqIn).filter((r) => r.id !== me.id);
          await L.writeUser(other);
        }
      } else {
        if (arr(me.tradesIn).some((t) => t.from === otherId) || arr(me.tradesOut).some((t) => t.to === otherId)) {
          res.status(409).json({ error: "trade", message: "材料交換を かたづけてから、ともだちをやめてください。" });
          return;
        }
        me.friends = arr(me.friends).filter((f) => f !== otherId);
        if (other) {
          other.friends = arr(other.friends).filter((f) => f !== me.id);
          await L.writeUser(other);
        }
      }
      await L.writeUser(me);
      res.status(200).json(await mine(me));
      return;
    }

    // --- ともだちの記録を くわしく見る ------------------------
    if (act === "profile") {
      if (arr(me.friends).indexOf(otherId) < 0) {
        res.status(403).json({ error: "notfriend", message: "ともだちの記録だけ 見られます。" });
        return;
      }
      const other = await L.readUser(otherId);
      if (!other) { res.status(404).json({ error: "none" }); return; }
      res.status(200).json({ card: cardOf(other) });
      return;
    }

    // --- いっしょに あそぼう と さそう ------------------------
    if (act === "invite") {
      const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (code.length !== 4) { res.status(400).json({ error: "code" }); return; }
      if (arr(me.friends).indexOf(otherId) < 0) {
        res.status(403).json({ error: "notfriend", message: "ともだちだけ さそえます。" });
        return;
      }
      const other = await L.readUser(otherId);
      if (!other) { res.status(404).json({ error: "none" }); return; }
      other.invite = { from: me.id, display: me.display, code, t: Date.now() };
      await L.writeUser(other);
      res.status(200).json({ invited: true, display: other.display });
      return;
    }

    // --- さそいを かたづける ---------------------------------
    if (act === "clearInvite") {
      me.invite = null;
      await L.writeUser(me);
      res.status(200).json(await mine(me));
      return;
    }

    res.status(400).json({ error: "action" });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーにつながりませんでした。" });
  } finally {
    if (unlockTrade) await unlockTrade().catch(() => {});
  }
};
