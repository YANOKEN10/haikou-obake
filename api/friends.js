// ============================================================
//  ともだち
//   ・なまえが「ぴったり合ったとき」だけ相手を見つけられる。
//     一部分だけの検索にすると、サーバーに全員のなまえ一覧を
//     置くことになり、知らない人が子どもの名前を眺められて
//     しまうので、わざとその作りにしていない。
//   ・申請は、相手が「うける」を押すまで、ともだちにならない。
//   ・「さそう」は、あいことばを相手のところに置いておくだけ。
// ============================================================
const L = require("./_lib");

const MAX_FRIENDS = 30;
const MAX_REQ = 20;
const INVITE_MS = 5 * 60 * 1000;      // さそいは5分で消える

const arr = (v) => (Array.isArray(v) ? v : []);

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
  };
}

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const claim = L.readToken(L.bearer(req));
  if (!claim) { res.status(401).json({ error: "auth", message: "ログインしなおしてください。" }); return; }

  try {
    const me = await L.readUser(claim.id);
    if (!me) { res.status(404).json({ error: "gone", message: "データが見つかりませんでした。" }); return; }

    if (req.method === "GET") { res.status(200).json(await mine(me)); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

    const b = L.body(req);
    const act = String(b.action || "");
    const otherId = L.normId(b.id);

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
  }
};
