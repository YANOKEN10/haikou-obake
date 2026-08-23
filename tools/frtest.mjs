// ともだち機能をひととおり試す（本番のサーバーに対して実行）
//   node tools/frtest.mjs
const BASE = process.env.HOBAKE_BASE || "https://haikou-obake-daisakusen.vercel.app";
const rid = () => "テスト" + Math.random().toString(36).slice(2, 8);

async function call(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const ok = (label, cond, extra) =>
  console.log((cond ? "✓ " : "✗ ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));

// --- ふたり分のアカウントをつくる ---
const nameA = rid(), nameB = rid(), nameC = rid();
const A = await call("/api/auth", { method: "POST", body: { action: "signup", id: nameA, pw: "あいことば1" } });
const B = await call("/api/auth", { method: "POST", body: { action: "signup", id: nameB, pw: "あいことば2" } });
const C = await call("/api/auth", { method: "POST", body: { action: "signup", id: nameC, pw: "あいことば3" } });
ok("アカウントを3つ作れる", A.status === 200 && B.status === 200 && C.status === 200, [nameA, nameB, nameC]);
const tA = A.data.token, tB = B.data.token, tC = C.data.token;

// 記録をあずけておく（プロフィールを見るため）
await call("/api/save", { method: "POST", token: tB, body: { payload: { profile: {
  name: nameB, rank: "見習いおばけ", kicked: 7, wave: 3, playSeconds: 1234,
  stats: { scares: 20, behind: 5, combos: 2, biggest: 61, trapsFired: 9, trapsBuilt: 4,
           ghostsSummoned: 3, materials: 88, laughed: 1, bestWave: 5 } } } } });

// --- さがす ---
let r = await call("/api/friends", { method: "POST", token: tA, body: { action: "search", name: nameB } });
ok("なまえがぴったりなら見つかる", r.data.found === true && r.data.display === nameB);
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "search", name: nameB.slice(0, 5) } });
ok("一部分だけでは見つからない（名前一覧が漏れない）", r.data.found === false);
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "search", name: nameA } });
ok("自分は さがせない", r.data.self === true);
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "search", name: "いないひと999" } });
ok("いない人は 見つからない", r.data.found === false);

// --- 申請 → うける ---
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "request", id: nameB } });
ok("申請をおくれる", (r.data.reqOut || []).some((x) => x.id === nameB.toLowerCase()));
ok("おくっただけでは ともだちでない", (r.data.friends || []).length === 0);

r = await call("/api/friends", { token: tB });
ok("相手に申請がとどく", (r.data.reqIn || []).some((x) => x.display === nameA));
ok("相手もまだ ともだちでない", (r.data.friends || []).length === 0);

// 承認前は プロフィールを見られない
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "profile", id: nameB } });
ok("承認前は 記録を見られない", r.status === 403, r.data.message);

r = await call("/api/friends", { method: "POST", token: tB, body: { action: "accept", id: nameA } });
ok("うけると ともだちになる（相手側）", (r.data.friends || []).some((f) => f.display === nameA));
ok("申請が かたづく", (r.data.reqIn || []).length === 0);

r = await call("/api/friends", { token: tA });
ok("こちら側も ともだちになっている", (r.data.friends || []).some((f) => f.display === nameB));
const card = (r.data.friends || [])[0];
ok("一覧に記録のあらましが出る", card && card.kicked === 7 && card.playSeconds === 1234,
   card && { rank: card.rank, kicked: card.kicked, 遊んだ秒: card.playSeconds });

// --- ともだちのプロフィール ---
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "profile", id: nameB } });
ok("ともだちの記録を くわしく見られる",
   r.status === 200 && r.data.card.stats.scares === 20 && r.data.card.wave === 5, r.data.card && r.data.card.stats);

// 関係ない人は見られない
r = await call("/api/friends", { method: "POST", token: tC, body: { action: "profile", id: nameB } });
ok("ともだちでない人の記録は 見られない", r.status === 403);

// --- さそう ---
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "invite", id: nameB, code: "ab7x" } });
ok("ともだちを さそえる", r.data.invited === true);
r = await call("/api/friends", { token: tB });
ok("さそいがとどく（あいことばつき）", r.data.invite && r.data.invite.code === "AB7X" && r.data.invite.display === nameA,
   r.data.invite);
r = await call("/api/friends", { method: "POST", token: tC, body: { action: "invite", id: nameB, code: "ZZ99" } });
ok("ともだちでない人は さそえない", r.status === 403);
r = await call("/api/friends", { method: "POST", token: tB, body: { action: "clearInvite" } });
ok("さそいを かたづけられる", r.data.invite === null);

// --- ゆきちがい（おたがいに申請）---
await call("/api/friends", { method: "POST", token: tB, body: { action: "request", id: nameC } });
r = await call("/api/friends", { method: "POST", token: tC, body: { action: "request", id: nameB } });
ok("おたがいに申請したら、その場でともだちになる", (r.data.friends || []).some((f) => f.display === nameB));

// --- やめる ---
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "remove", id: nameB } });
ok("ともだちを やめられる", (r.data.friends || []).length === 0);
r = await call("/api/friends", { token: tB });
ok("相手側からも 消える", !(r.data.friends || []).some((f) => f.display === nameA));

// --- ことわる ---
await call("/api/friends", { method: "POST", token: tA, body: { action: "request", id: nameB } });
r = await call("/api/friends", { method: "POST", token: tB, body: { action: "reject", id: nameA } });
ok("申請を ことわれる", (r.data.reqIn || []).length === 0);
r = await call("/api/friends", { token: tA });
ok("ことわられたら おくった側からも消える", (r.data.reqOut || []).length === 0);

// --- とりけす ---
await call("/api/friends", { method: "POST", token: tA, body: { action: "request", id: nameB } });
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "cancel", id: nameB } });
ok("おくった申請を とりけせる", (r.data.reqOut || []).length === 0);
r = await call("/api/friends", { token: tB });
ok("相手のところからも 消える", (r.data.reqIn || []).length === 0);

// --- ログインしていないと使えない ---
r = await call("/api/friends");
ok("ログインなしでは使えない", r.status === 401);
r = await call("/api/friends", { method: "POST", token: "not.a.real.token", body: { action: "search", name: nameB } });
ok("でたらめな券では使えない", r.status === 401);
r = await call("/api/friends", { method: "POST", token: tA, body: { action: "request", id: nameA } });
ok("自分に申請はできない", r.status === 400);

// かたづけ
for (const [t, n, pw] of [[tA, nameA, "あいことば1"], [tB, nameB, "あいことば2"], [tC, nameC, "あいことば3"]]) {
  await call("/api/save", { method: "DELETE", token: t, body: { pw } });
}
console.log("（テスト用のアカウントは消しました）");
