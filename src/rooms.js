// ============================================================
//  各階の部屋わり
//   x は校舎の東西方向（-42 〜 42）。階段は上下でそろえる。
// ============================================================
export const ST_W = { x1: -42, x2: -35 };   // 西階段（全階共通）
export const ST_E = { x1: 35, x2: 42 };     // 東階段（全階共通）

const stairs = (side) => (side === "w"
  ? { id: "w_stair", name: "西階段", x1: ST_W.x1, x2: ST_W.x2, kind: "stair", side: "w" }
  : { id: "e_stair", name: "東階段", x1: ST_E.x1, x2: ST_E.x2, kind: "stair", side: "e" });

// トイレは全階に男女ならべて置く
const toilets = (f) => ([
  { id: "wc_m" + f, name: "男子トイレ", x1: -17, x2: -13, kind: "toilet", sex: "m" },
  { id: "wc_f" + f, name: "女子トイレ", x1: -13, x2: -9, kind: "toilet", sex: "f" },
]);

export const FLOOR_ROOMS = [
  // ---- 1階 ----
  [
    stairs("w"),
    { id: "c1a", name: "1年1組", x1: -35, x2: -26, kind: "class" },
    { id: "c1b", name: "1年2組", x1: -26, x2: -17, kind: "class" },
    ...toilets(1),
    { id: "hoken", name: "保健室", x1: -9, x2: 0, kind: "nurse" },
    { id: "science", name: "理科室", x1: 0, x2: 10, kind: "science" },
    { id: "library", name: "図書室", x1: 10, x2: 20, kind: "library" },
    { id: "youmu", name: "用務員室", x1: 20, x2: 27, kind: "plain" },
    { id: "kyushoku", name: "給食室", x1: 27, x2: 35, kind: "home" },
    stairs("e"),
  ],
  // ---- 2階 ----
  [
    stairs("w"),
    { id: "c2a", name: "2年1組", x1: -35, x2: -26, kind: "class" },
    { id: "c2b", name: "2年2組", x1: -26, x2: -17, kind: "class" },
    ...toilets(2),
    { id: "staff", name: "職員室", x1: -9, x2: 3, kind: "staff" },
    { id: "kaigi", name: "会議室", x1: 3, x2: 11, kind: "plain" },
    { id: "katei", name: "家庭科室", x1: 11, x2: 22, kind: "home" },
    { id: "c2c", name: "2年3組", x1: 22, x2: 31, kind: "class" },
    { id: "insatsu", name: "印刷室", x1: 31, x2: 35, kind: "plain" },
    stairs("e"),
  ],
  // ---- 3階 ----
  [
    stairs("w"),
    { id: "c3a", name: "3年1組", x1: -35, x2: -26, kind: "class" },
    { id: "c3b", name: "3年2組", x1: -26, x2: -17, kind: "class" },
    ...toilets(3),
    { id: "c3c", name: "3年3組", x1: -9, x2: 0, kind: "class" },
    { id: "zukou", name: "図工室", x1: 0, x2: 11, kind: "art" },
    { id: "shichokaku", name: "視聴覚室", x1: 11, x2: 22, kind: "av" },
    { id: "shiryo", name: "資料室", x1: 22, x2: 29, kind: "plain" },
    { id: "c3d", name: "3年4組", x1: 29, x2: 35, kind: "class" },
    stairs("e"),
  ],
  // ---- 4階 ----
  [
    stairs("w"),
    { id: "c4a", name: "6年1組", x1: -35, x2: -26, kind: "class" },
    { id: "c4b", name: "6年2組", x1: -26, x2: -17, kind: "class" },
    ...toilets(4),
    { id: "hoso", name: "放送室", x1: -9, x2: -2, kind: "plain" },
    { id: "rika_j", name: "理科準備室", x1: -2, x2: 6, kind: "plain" },
    { id: "music", name: "音楽室", x1: 6, x2: 20, kind: "music" },
    { id: "music_j", name: "音楽準備室", x1: 20, x2: 26, kind: "plain" },
    { id: "c4c", name: "6年3組", x1: 26, x2: 35, kind: "class" },
    stairs("e"),
  ],
];

export const FLOOR_LABEL = ["1階", "2階", "3階", "4階"];
