export const STAGES = [
  { id: "school", name: "夕暮れ木造校舎", icon: "🏫", unlock: 0,
    desc: "四階建ての 木造校舎。いつもの 廃校。" },
  { id: "branch", name: "霧ヶ丘分校", icon: "🌫️", unlock: 1000,
    desc: "深い霧に しずむ、コンクリートの 分校。" },
  { id: "park", name: "月影廃遊園地", icon: "🎡", unlock: 2000,
    desc: "だれもいない 遊園地。乗りものだけが きしんでいる。" },
];

export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

// 「1000人を超えたら」なので、ちょうど1000人ではまだ開かない。
export const stageUnlocked = (stage, kicked, adminPreview = false) => adminPreview || Number(kicked || 0) > stage.unlock || stage.unlock === 0;

export function requestedStage(kicked, adminPreview = false) {
  let id = "";
  let preview = false;
  try {
    const q = new URLSearchParams(location.search);
    id = q.get("stage") || "";
    // 開発サーバーだけの見た目確認用。本番では解放条件を飛ばせない。
    preview = (location.hostname === "localhost" || location.hostname === "127.0.0.1") && q.get("preview") === "1";
  } catch (e) { /* テスト環境 */ }
  const s = stageById(id);
  return preview || stageUnlocked(s, kicked, adminPreview) ? s.id : "school";
}

export function stageUrl(id) {
  const u = new URL(location.href);
  if (id === "school") u.searchParams.delete("stage");
  else u.searchParams.set("stage", id);
  return u.toString();
}
