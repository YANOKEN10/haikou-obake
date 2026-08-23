const API = "https://haikou-obake-daisakusen.vercel.app/api/room";
const call = async (b) => {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const ok = (label, cond, extra) => console.log((cond ? "✓ " : "✗ ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));

// 1. 部屋をつくる
const A = await call({ action: "create", name: "ヤノケン" });
ok("部屋をつくれる", A.status === 200 && A.data.code, { code: A.data && A.data.code, seed: A.data && A.data.seed });
const code = A.data.code, pidA = A.data.pid;

// 2. べつの人が入る
const B = await call({ action: "join", code: code.toLowerCase(), name: "ミウ" });
ok("小文字のあいことばでも入れる", B.status === 200, { pid: !!B.data.pid });
ok("種が同じ", A.data.seed === B.data.seed, { A: A.data.seed, B: B.data.seed });
ok("後から入った人はおやではない", B.data.room.youAreHost === false);
const pidB = B.data.pid;

// 3. まちがったあいことば
const X = await call({ action: "join", code: "ZZZZ", name: "だれか" });
ok("ない部屋には入れない", X.status === 404, X.data.message);

// 4. おやが人間たちを送る
const S1 = await call({ action: "sync", code, pid: pidA,
  g: { x: 1, y: 1.2, z: 2, yaw: 0 },
  world: { wave: 3, hs: [[1, 5, 0, 6, 1.5, 40, 2, 0], [2, 7, 0, 8, 0, 10, 0, 0]] } });
ok("おやが送れる", S1.status === 200 && S1.data.room.youAreHost === true);

// 5. お客さんが受けとる
const S2 = await call({ action: "sync", code, pid: pidB,
  g: { x: 9, y: 1.3, z: 4, yaw: 2 }, acts: [{ i: 1, k: "scare", hid: 1, a: 30, w: "direct" }] });
ok("お客さんに人間たちが届く", S2.data.room.world && S2.data.room.world.wave === 3, S2.data.room.world);
ok("お客さんにおやのおばけが見える", S2.data.room.others.length === 1 && S2.data.room.others[0].name === "ヤノケン",
   S2.data.room.others.map(o => o.name + "@" + (o.g ? o.g.x + "," + o.g.z : "-")));

// 6. おやが「おどかした」を受けとる
const S3 = await call({ action: "sync", code, pid: pidA, g: { x: 1, y: 1.2, z: 2, yaw: 0 },
  world: { wave: 3, hs: [[1, 5, 0, 6, 1.5, 70, 3, 0]] } });
ok("おやに合図がとどく", (S3.data.room.acts || []).length === 1, S3.data.room.acts);
ok("おやにお客さんのおばけが見える", S3.data.room.others.length === 1 && S3.data.room.others[0].g.x === 9);

// 7. 合図は番号つきで、しばらく送りつづけられる（受け手が番号で重複をはじく）
const S4 = await call({ action: "sync", code, pid: pidA, g: { x: 1, y: 1.2, z: 2, yaw: 0 }, world: { wave: 3, hs: [] } });
const a4 = (S4.data.room.acts || [])[0];
ok("合図に番号がついている", a4 && a4.i === 1 && a4.q, a4);
// 送り手が新しい番号にすると、そちらがとどく
await call({ action: "sync", code, pid: pidB, g: { x: 9, y: 1.3, z: 4, yaw: 2 },
  acts: [{ i: 1, k: "scare", hid: 1, a: 30, w: "direct" }, { i: 2, k: "scare", hid: 2, a: 44, w: "trap:kubi" }] });
const S5 = await call({ action: "sync", code, pid: pidA, g: { x: 1, y: 1.2, z: 2, yaw: 0 }, world: { wave: 3, hs: [] } });
const nos = (S5.data.room.acts || []).map(a => a.i);
ok("送りなおしぶんも番号つきでとどく", nos.join(",") === "1,2", nos);
// 人間ごとの合図が混ざらない
ok("合図の中身がこわれていない", (S5.data.room.acts || []).some(a => a.hid === 2 && a.a === 44));

// 8. 定員
const j = [];
for (let i = 0; i < 3; i++) j.push(await call({ action: "join", code, name: "その他" + i }));
ok("4人まで（5人目は入れない）", j[1].status === 200 && j[2].status === 409, j[2].data.message);

// 9. 出る → 部屋が消える
await call({ action: "leave", code, pid: pidB });
for (const r of j) if (r.data && r.data.pid) await call({ action: "leave", code, pid: r.data.pid });
await call({ action: "leave", code, pid: pidA });
const gone = await call({ action: "join", code, name: "あと" });
ok("全員出たら部屋は消える", gone.status === 404);
