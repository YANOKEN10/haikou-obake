// ============================================================
//  ともだちと一緒にあそぶ「部屋」
//   ・あいことば4文字で入れる。アカウントはいらない
//   ・部屋1つ ＝ Blob の JSON 1ファイル
//   ・お客さん側は「自分のおばけの位置」だけ書きこむ
//   ・部屋を作った人（ホスト）が人間たちを動かし、その結果をみんなが見る
//   ・読んで直して書く、の途中でぶつかることはあるが、
//     毎回ぜんぶ送りなおすので、次の1回で自然に直る
// ============================================================
const crypto = require("crypto");
const { put, get, del } = require("@vercel/blob");
const L = require("./_lib");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 見まちがえる字は使わない
const MAX_PLAYERS = 4;
const STALE_MS = 45000;        // これだけ音沙汰がなければ、抜けたとみなす
const ROOM_MAX = 24 * 1024;    // 部屋1つの上限

const roomKey = (code) => "hobake/room/" + code + ".json";
// 人間たちのようすは、おやだけが書くので、べつのファイルに分ける。
// 同じファイルにすると、お客さんの書きこみが おやの新しいようすを
// 上書きしてしまい、人間が止まって見えてしまう。
const worldKey = (code) => "hobake/room/" + code + ".w.json";

function newCode() {
  let s = "";
  const b = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return s;
}
const newPid = () => crypto.randomBytes(9).toString("base64url");

function cleanCode(c) {
  return String(c == null ? "" : c).normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}
function cleanName(n) {
  const s = String(n == null ? "" : n).normalize("NFKC").replace(/\s+/g, " ").trim();
  return s.slice(0, 12) || "ななしのおばけ";
}

async function readRoom(code) {
  let r;
  try {
    r = await get(roomKey(code), { access: "private", useCache: false });
  } catch (e) {
    if (e && /not.?found/i.test(e.message || "")) return null;
    throw e;
  }
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  try { return JSON.parse(text); } catch (e) { return null; }
}

async function readWorld(code) {
  let w;
  try {
    w = await get(worldKey(code), { access: "private", useCache: false });
  } catch (e) {
    if (e && /not.?found/i.test(e.message || "")) return null;
    return null;
  }
  if (!w || w.statusCode !== 200) return null;
  try { return JSON.parse(await new Response(w.stream).text()); } catch (e) { return null; }
}

async function writeWorld(code, world) {
  const s = JSON.stringify(world);
  if (Buffer.byteLength(s) > ROOM_MAX) return;
  await put(worldKey(code), s, {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json", cacheControlMaxAge: 0,
  });
}

async function writeRoom(room) {
  const s = JSON.stringify(room);
  if (Buffer.byteLength(s) > ROOM_MAX) return false;
  await put(roomKey(room.code), s, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
  return true;
}

// 音沙汰のない人を消す。ホストが抜けたら、いちばん古い人が引きつぐ
function prune(room, now) {
  for (const pid of Object.keys(room.players)) {
    if (now - (room.players[pid].t || 0) > STALE_MS) delete room.players[pid];
  }
  const ids = Object.keys(room.players);
  if (!ids.length) return false;
  if (!room.players[room.host]) {
    ids.sort((a, b) => (room.players[a].joined || 0) - (room.players[b].joined || 0));
    room.host = ids[0];
    // 人間たちは、新しいおやが作りなおす
  }
  return true;
}

// 外に出す部屋のようす（自分のぶんは省く）
function view(room, me) {
  const others = [];
  for (const pid of Object.keys(room.players)) {
    if (pid === me) continue;
    const p = room.players[pid];
    others.push({ pid, name: p.name, g: p.g || null, placed: p.placed || [], t: p.t });
  }
  return {
    code: room.code, host: room.host, youAreHost: room.host === me, seed: room.seed || 1,
    others, world: null, born: room.born,
  };
}

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!L.configured()) { L.notReady(res); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

  const b = L.body(req);
  const act = String(b.action || "");
  const now = Date.now();

  try {
    // --- 部屋をつくる ---------------------------------------
    if (act === "create") {
      const name = cleanName(b.name);
      let code = null;
      for (let i = 0; i < 6; i++) {                  // すでにある合言葉は避ける
        const c = newCode();
        if (!(await readRoom(c))) { code = c; break; }
      }
      if (!code) { res.status(503).json({ error: "busy", message: "いま部屋がいっぱいです。少し待ってね。" }); return; }
      const pid = newPid();
      const room = {
        code, host: pid, born: now, seed: crypto.randomBytes(4).readUInt32BE(0),
        players: { [pid]: { name, joined: now, t: now, g: null, placed: [], acts: [] } },
      };
      await writeRoom(room);
      res.status(200).json({ code, pid, name, seed: room.seed, room: view(room, pid) });
      return;
    }

    // --- 合言葉で入る ---------------------------------------
    if (act === "join") {
      const code = cleanCode(b.code);
      if (code.length !== 4) { res.status(400).json({ error: "code", message: "あいことばは4文字です。" }); return; }
      const room = await readRoom(code);
      if (!room) { res.status(404).json({ error: "none", message: "その あいことばの部屋は 見つかりません。" }); return; }
      prune(room, now);
      if (Object.keys(room.players).length >= MAX_PLAYERS) {
        res.status(409).json({ error: "full", message: "その部屋は いっぱいです（" + MAX_PLAYERS + "人まで）。" });
        return;
      }
      const pid = newPid();
      room.players[pid] = { name: cleanName(b.name), joined: now, t: now, g: null, placed: [], acts: [] };
      await writeRoom(room);
      res.status(200).json({ code, pid, name: room.players[pid].name, seed: room.seed || 1, room: view(room, pid) });
      return;
    }

    // --- ようすを送って、みんなのようすを受けとる -----------
    if (act === "sync") {
      const code = cleanCode(b.code);
      const pid = String(b.pid || "");
      // おきゃくさんは「人間たちの ようす」も 要るので、
      //  部屋と いっしょに 同時に 読む（順ばんに 読むと おそい）
      const wantWorld = !b.world;
      const [room, worldNow] = await Promise.all([
        readRoom(code),
        wantWorld ? readWorld(code) : Promise.resolve(null),
      ]);
      if (!room || !room.players[pid]) {
        res.status(404).json({ error: "none", message: "部屋から はなれてしまいました。" });
        return;
      }
      const me = room.players[pid];
      const isHost = room.host === pid;
      me.t = now;
      if (b.g && typeof b.g === "object") me.g = b.g;
      if (Array.isArray(b.placed)) me.placed = b.placed.slice(0, 24);
      // 合図は、送った本人のところに置く。
      // 同じものを何回か送りつづけ、ホストは番号で重複をはじくので、
      // 1回とどかなくても、つぎの回でちゃんととどく
      if (!isHost && Array.isArray(b.acts)) me.acts = b.acts.slice(-8);

      const alive = prune(room, now);
      if (!alive) {
        try { await del(roomKey(code)); } catch (e) {}
        try { await del(worldKey(code)); } catch (e) {}
        res.status(200).json({ room: null });
        return;
      }

      const out = view(room, pid);
      out.acts = [];
      if (isHost) {
        for (const q of Object.keys(room.players)) {
          if (q === pid) continue;
          for (const a of room.players[q].acts || []) out.acts.push({ q, i: a.i, k: a.k, hid: a.hid, a: a.a, w: a.w });
        }
        out.world = null;                            // 自分が書いたものは返さなくてよい
      } else {
        out.world = worldNow;                        // さっき 同時に 読んだもの
      }
      // 書くほうも 同時に。順ばんに 書くと その ぶん おそくなる
      await Promise.all([
        writeRoom(room),
        (isHost && b.world && typeof b.world === "object")
          ? writeWorld(code, b.world) : Promise.resolve(),
      ]);
      res.status(200).json({ room: out });
      return;
    }

    // --- 部屋を出る -----------------------------------------
    if (act === "leave") {
      const code = cleanCode(b.code);
      const pid = String(b.pid || "");
      const room = await readRoom(code);
      if (room && room.players[pid]) {
        delete room.players[pid];
        if (!prune(room, now)) {
          try { await del(roomKey(code)); } catch (e) {}
          try { await del(worldKey(code)); } catch (e) {}
        }
        else await writeRoom(room);
      }
      res.status(200).json({ left: true });
      return;
    }

    res.status(400).json({ error: "action" });
  } catch (e) {
    res.status(500).json({ error: "server", message: "つうしんが うまくいきませんでした。" });
  }
};
