// ============================================================
//  セーブデータ（この端末の中だけに保存する）
//   ・メールアドレスもパスワードも使わない
//   ・なまえごとに記録を分けられる（きょうだいで共用できるように）
// ============================================================
const KEY = "haikou-obake:profiles";
const CUR = "haikou-obake:current";
export const MAX_NAME = 12;

function read(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch (e) { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn("保存できませんでした", e); return false; }
}

export function storageAvailable() {
  try {
    localStorage.setItem("haikou-obake:test", "1");
    localStorage.removeItem("haikou-obake:test");
    return true;
  } catch (e) { return false; }
}

export function allProfiles() { return read(KEY, {}); }

export function profileNames() {
  const p = allProfiles();
  return Object.keys(p).sort((a, b) => (p[b].lastPlayed || 0) - (p[a].lastPlayed || 0));
}

export function currentName() {
  const n = read(CUR, null);
  return n && allProfiles()[n] ? n : null;
}

export function setCurrent(name) { write(CUR, name); }

export function getProfile(name) { return allProfiles()[name] || null; }

export function createProfile(name) {
  name = String(name || "").trim().slice(0, MAX_NAME);
  if (!name) return { ok: false, why: "なまえを入れてください" };
  const all = allProfiles();
  if (all[name]) return { ok: false, why: "そのなまえはもう使われています" };
  if (Object.keys(all).length >= 8) return { ok: false, why: "なまえは8つまでです。いらないものを消してください" };
  all[name] = blank(name);
  write(KEY, all);
  setCurrent(name);
  return { ok: true, name };
}

export function deleteProfile(name) {
  const all = allProfiles();
  delete all[name];
  write(KEY, all);
  if (currentName() === name) write(CUR, null);
}

export function renameProfile(from, to) {
  to = String(to || "").trim().slice(0, MAX_NAME);
  if (!to) return { ok: false, why: "なまえを入れてください" };
  const all = allProfiles();
  if (!all[from]) return { ok: false, why: "見つかりません" };
  if (all[to] && to !== from) return { ok: false, why: "そのなまえはもう使われています" };
  const p = all[from];
  delete all[from];
  p.name = to;
  all[to] = p;
  write(KEY, all);
  if (currentName() === from) setCurrent(to);
  return { ok: true, name: to };
}

export function blank(name) {
  return {
    name,
    created: Date.now(),
    lastPlayed: 0,
    playSeconds: 0,
    hasSave: false,
    kicked: 0,
    stageId: "school",
    wave: 0,
    rank: "見習い地縛霊",
    inv: {},
    built: {},
    selTrap: 0,
    traps: [],
    pos: null,
    stats: {
      scares: 0, combos: 0, behind: 0, biggest: 0,
      trapsFired: 0, ghostsSummoned: 0, trapsBuilt: 0,
      materials: 0, laughed: 0, bestWave: 0,
      byTrap: {}, byGhost: {}, byHuman: {},
    },
  };
}

export function saveProfile(p) {
  if (!p || !p.name) return false;
  const all = allProfiles();
  p.lastPlayed = Date.now();
  all[p.name] = p;
  return write(KEY, all);
}

// 「1時間23分」のような表示にする
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return h + "時間" + m + "分";
  if (m) return m + "分" + (sec % 60) + "秒";
  return sec + "秒";
}

export function fmtDate(ms) {
  if (!ms) return "まだ遊んでいません";
  const d = new Date(ms), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return "今日 " + hm;
  return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + hm;
}
