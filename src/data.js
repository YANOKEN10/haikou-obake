// ============================================================
//  ゲームデータ定義
// ============================================================

// --- 材料 ---------------------------------------------------
export const MATERIALS = {
  hokori:  { name: "ホコリ",         icon: "🌫", color: 0x9a9a8c, desc: "10年分の積年のホコリ。ぜんそくの元。" },
  chalk:   { name: "チョークの欠片", icon: "🖍", color: 0xf2efe4, desc: "まだ黒板に恨みがあるらしい。" },
  uwabaki: { name: "片方の上履き",   icon: "👟", color: 0xe8e2d0, desc: "持ち主は卒業した。上履きは残った。" },
  pan:     { name: "化石コッペパン", icon: "🥖", color: 0xc9a45c, desc: "給食の食べ残し。硬度7。" },
  onnen:   { name: "怨念",           icon: "💢", color: 0x8b2ee0, desc: "人間を驚かすと落とす。おばけの主食。" },
  denchi:  { name: "液漏れ電池",     icon: "🔋", color: 0x4cc9ff, desc: "理科室の残骸。まだちょっと動く。" },
  nurunuru:{ name: "ぬめり",         icon: "🫧", color: 0x6fd48a, desc: "水道の下にたまってたやつ。触感は最悪。" },
};

// 人間が落とす（ドロップ）テーブル
export const HUMAN_DROPS = ["onnen", "onnen", "denchi", "pan", "hokori"];

// --- 仕掛け（トラップ） --------------------------------------
export const TRAPS = {
  locker: {
    name: "ガタガタロッカー", icon: "🚪",
    cost: { hokori: 3, onnen: 1 },
    fear: 22, radius: 6.5, cooldown: 9,
    desc: "近づくとロッカーが内側からガタガタ暴れる。定番にして王道。",
    line: "ガタガタガタッ！！",
  },
  chalk: {
    name: "ひとりでにキィィ黒板", icon: "🖍",
    cost: { chalk: 4, onnen: 1 },
    fear: 26, radius: 7, cooldown: 11,
    desc: "誰もいない黒板に『かえれ』と書かれる。字はへた。",
    line: "キィィィィ…（かえれ）",
  },
  uwabaki: {
    name: "上履きバタバタ", icon: "👟",
    cost: { uwabaki: 3, hokori: 2 },
    fear: 18, radius: 6, cooldown: 7,
    desc: "廊下を上履きだけが走っていく。ちょっと運動音痴。",
    line: "パタパタパタ…（すっ転ぶ音）",
  },
  piano: {
    name: "夜のピアノ独奏", icon: "🎹",
    cost: { onnen: 3, denchi: 1 },
    fear: 34, radius: 11, cooldown: 15,
    desc: "音楽室のピアノが鳴る。選曲はなぜか校歌。",
    line: "ジャーン♪（校歌・不協和音）",
  },
  suido: {
    name: "全開の水道", icon: "🚰",
    cost: { nurunuru: 3, hokori: 2 },
    fear: 16, radius: 6, cooldown: 6,
    desc: "蛇口が全部いっせいに出る。水道代は廃校持ち。",
    line: "ジャアアアア！",
  },
  jintai: {
    name: "人体模型おいでおいで", icon: "💀",
    cost: { onnen: 4, denchi: 2, chalk: 2 },
    fear: 42, radius: 8, cooldown: 18,
    desc: "理科室の人体模型が手招きする。内臓は落とす。",
    line: "オイデ…オイデ…（内臓ボトッ）",
  },
};

// --- 召喚できるおばけ ----------------------------------------
export const GHOSTS = {
  hitotsume: {
    name: "ひとつめ小僧", icon: "👁",
    cost: { onnen: 5, hokori: 5 },
    unlockAt: 0,
    fear: 20, radius: 5, speed: 2.2, life: 120,
    desc: "うろうろして人間に体当たりする。目はひとつ。やる気もひとつ。",
    lines: ["めっ！", "みーつけた", "うわ、こっち見た"],
  },
  randoseru: {
    name: "はしるランドセル", icon: "🎒",
    cost: { onnen: 8, uwabaki: 4, denchi: 2 },
    unlockAt: 3,
    fear: 30, radius: 4.5, speed: 4.2, life: 100,
    desc: "人間を見つけると全速力で追いかける。中身は給食のパン。",
    lines: ["カタカタカタ！！", "まちなさーい", "（ランドセルが吠えた）"],
  },
  hanako: {
    name: "トイレのハナコさん", icon: "🚻",
    cost: { onnen: 14, nurunuru: 6, chalk: 4 },
    unlockAt: 8,
    fear: 55, radius: 9, speed: 0, life: 240,
    desc: "その場に居座る。近づいた人間は問答無用で泣く。動かないのは体力の問題。",
    lines: ["はぁーい", "３番目の個室にどうぞ", "手、洗った？"],
  },
};

// --- 人間 -----------------------------------------------------
export const HUMAN_TYPES = [
  {
    id: "youtuber", name: "配信者ユウキ", color: 0x4cc9ff, courage: 130, speed: 2.6,
    idle: ["はいどーもー、心霊スポット来てまーす", "今日はガチのやつ来ましたよ", "コメント欄、静かすぎん？", "これ絶対なんかいるって"],
    scared: ["え、いま撮れた？撮れた？", "うわああああカメラカメラ！", "スタッフー！スタッフいない！"],
    flee: ["高評価と登録よろしくうううう！！", "無理無理無理無理帰る帰る"],
  },
  {
    id: "gal", name: "ギャルのミク", color: 0xff5a9e, courage: 80, speed: 3.0,
    idle: ["まじ埃やば、髪やられる", "え、ここ電波ある？", "つーかなんで来たんだっけ"],
    scared: ["は？！は？！なんかいた！", "やだやだやだ無理ィ！", "ネイル取れた！！"],
    flee: ["もう二度と来ないから！！", "ママーーー！！"],
  },
  {
    id: "otaku", name: "オカルト部・田所", color: 0x7ce85a, courage: 150, speed: 2.2,
    idle: ["ふむ…この澱んだ空気…本物ですね", "霊障の兆候は…まだ", "みなさん、記録は正確に"],
    scared: ["き、記録します！記録しますから！", "しゅ、出現条件が理論と違う…！", "ま、待ってこれ論文になる"],
    flee: ["撤退！これは学術的撤退です！", "資料が！資料だけでも！"],
  },
  {
    id: "couple", name: "ビビり彼氏ケンタ", color: 0xffc63d, courage: 55, speed: 3.2,
    idle: ["お、俺は全然平気だけどさ", "ほら、あれ、ただの風だって", "先に行っていいよ、俺、後ろ守るから"],
    scared: ["ひっ", "いや今の聞いた？聞いたよね？", "俺は見てない、何も見てない"],
    flee: ["ごめん！マジでごめん！", "車！車のとこで待ってる！"],
  },
  {
    id: "granny", name: "近所の岩井さん", color: 0xd8b4ff, courage: 165, speed: 1.8,
    idle: ["まだ取り壊さんのかねぇ、ここ", "うちの子もここ通っとってねぇ", "あら、この花壇まだ生きとる"],
    scared: ["あらまあ", "ほう、おばけさんかい", "元気があってよろしい"],
    flee: ["また来るからねぇ", "はいはい、帰りますよ"],
  },
];

// --- 驚かせ後の人間のリアクション（笑い要素） ------------------
export const HABITUATED_LINES = [
  "え、なんかこいつ…かわいくない？",
  "さっきから同じ驚かし方じゃん",
  "あー、はいはい。おばけね。",
  "こいつ多分そんな強くないよ",
];

export const RANKS = [
  { at: 0,  name: "見習い地縛霊",   note: "まだ誰も怖がってくれない" },
  { at: 3,  name: "そこそこ出る霊", note: "近所で噂になり始めた" },
  { at: 8,  name: "廃校の主",       note: "2階への結界が緩んだ" },
  { at: 15, name: "名物おばけ",     note: "3階と体育館への結界が緩んだ" },
  { at: 25, name: "伝説の学校の七不思議", note: "廃校のすべてがあなたのもの" },
];
