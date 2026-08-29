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
  wax:     { name: "床用ワックス",   icon: "🪣", color: 0xffd97a, desc: "用務員室で40年ねむっていた。ぬればピカピカ、ぬりすぎればツルツル。" },
  kami:    { name: "しめった半紙",   icon: "📜", color: 0xe8e4d4, desc: "書道の時間の残り。まだ字が読める。読まないほうがいい。" },
};

// --- アイテムの値うち（色で分かる7段階）----------------------
//  白がふつう、金がいちばんレア。
//  レアな色ほど、いちどに たくさん手に入る。
//  マップのはしや、ふつうは行かない場所ほど、いい色が落ちている。
export const RARITY = [
  { id: 0, name: "白",   color: 0xf2efe6, glow: 0xffffff, mult: 1,  aura: 0.0,  size: 1.00 },
  { id: 1, name: "水色", color: 0x8fe3ff, glow: 0x8fe3ff, mult: 2,  aura: 0.35, size: 1.10 },
  { id: 2, name: "青",   color: 0x4a7dff, glow: 0x4a7dff, mult: 3,  aura: 0.5,  size: 1.20 },
  { id: 3, name: "赤",   color: 0xff4a4a, glow: 0xff5a3a, mult: 5,  aura: 0.7,  size: 1.32 },
  { id: 4, name: "紫",   color: 0xb44aff, glow: 0xc46aff, mult: 8,  aura: 0.9,  size: 1.45 },
  { id: 5, name: "銀",   color: 0xdfe6ee, glow: 0xeaf2ff, mult: 14, aura: 1.15, size: 1.6 },
  { id: 6, name: "金",   color: 0xffd23a, glow: 0xffc21a, mult: 25, aura: 1.5,  size: 1.8 },
];

// その場所の「へんぴさ」から、色を決める。
//  far は 0（ふつうに歩く場所）〜1（すみっこ・屋上・秘密の教室）。
//  それぞれの色の出やすさを、下の2つの表のあいだで まぜあわせる。
//  しきい値ではなく「重み」で決めているので、
//  かならず 白 ＞ 水色 ＞ … ＞ 金 の順に めずらしくなる。
//                白    水色    青    赤    紫     銀     金
const W_NEAR = [ 720,  200,   62,   16,   2.0,  0.35,  0.06];   // ふつうの場所
const W_FAR  = [ 180,  230,   215,  190,  120,   48,    17 ];   // へんぴな場所

export function pickRarity(far, luck, rng) {
  const f = Math.max(0, Math.min(1, far)) * (luck === undefined ? 1 : luck);
  const g = Math.max(0, Math.min(1, f));
  let total = 0;
  const w = [];
  for (let i = 0; i < 7; i++) {
    // へんぴさが上がるほど、レアがわの表に近づく（後半ほど強く効かせる）
    const k = Math.pow(g, 1 + i * 0.28);
    const v = W_NEAR[i] * (1 - k) + W_FAR[i] * k;
    w.push(v);
    total += v;
  }
  let r = (rng || Math.random)() * total;
  for (let i = 0; i < 7; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

// --- あやつれる おばけ（キャラ）------------------------------
//  レアな色の「かけら」で 交換所を開くと、新しい すがたが使える。
//  すがたが変わると、動きや とくいわざも変わる。
export const CHARS = {
  obake: {
    name: "しろいおばけ", icon: "👻", order: 0,
    cost: {},                                  // はじめから使える
    speed: 1.00, dash: 1.00, phase: 1.00, scare: 1.00, reach: 1.00, size: 1.00,
    body: 0xdfeaf5, glow: 0x5d7fa8,
    desc: "まんまるの目がふたつ。この廃校で いちばん さいしょに 生まれた おばけ。",
    tip: "とくいも にがても ない、あつかいやすい すがた。",
  },
  hitotsume: {
    name: "一つ目小僧", icon: "👁", order: 1,
    cost: { 1: 6 },                            // 水色6
    speed: 1.02, dash: 1.00, phase: 1.05, scare: 1.08, reach: 1.10, size: 0.98,
    body: 0xf7e3d8, glow: 0xd89a8a,
    desc: "大きな目が ひとつだけ。じっと見つめられると、人はなぜか 目をそらせない。",
    tip: "とどく はんいが すこし広く、こわがらせる ちからも すこし強い。",
  },
  karakasa: {
    name: "唐傘おばけ", icon: "🌂", order: 2,
    cost: { 2: 6, 1: 10 },                     // 青6・水色10
    speed: 1.05, dash: 1.15, phase: 1.45, scare: 0.95, reach: 1.0, size: 1.02,
    body: 0x9a2026, glow: 0x6a1218,
    desc: "ぴょんぴょん はねる 一本足の傘。すりぬけが とても長もちする。",
    tip: "壁のなかを ずっと 進んでいられる。かくれんぼが とくい。",
  },
  amanojaku: {
    name: "あまのじゃく", icon: "😈", order: 3,
    cost: { 3: 5, 2: 12 },                     // 赤5・青12
    speed: 1.10, dash: 1.05, phase: 0.9, scare: 1.15, reach: 1.05, size: 0.94,
    body: 0x54b0ec, glow: 0x2a6a9a,
    desc: "人の いやがることを する 小さな鬼。ふいうちが とくべつ よく効く。",
    tip: "うしろから おどかすと、ほかの子より ずっと こわがらせられる。",
  },
  kappa: {
    name: "河童", icon: "🥒", order: 4,
    cost: { 3: 12, 4: 3 },                     // 赤12・紫3
    speed: 1.22, dash: 1.30, phase: 1.0, scare: 1.05, reach: 1.0, size: 1.06,
    body: 0x92d24e, glow: 0x4a8a2a,
    desc: "皿の水が かわくと 元気がなくなる。足の速さは 廃校いちばん。",
    tip: "だっしゅが 長もちする。運動場を 走りまわるのに ぴったり。",
  },
  tengu: {
    name: "天狗", icon: "🍃", order: 5,
    cost: { 4: 10, 5: 3 },                     // 紫10・銀3
    speed: 1.12, dash: 1.15, phase: 1.1, scare: 1.25, reach: 1.45, size: 1.12,
    body: 0xe8543a, glow: 0xa02a1a,
    desc: "高いところが 好きな 山のぬし。はなれた ところからでも おどかせる。",
    tip: "とどく はんいが とても広い。上から まとめて おどかそう。",
  },
  kyubi: {
    name: "九尾", icon: "🦊", order: 6,
    cost: { 5: 10, 6: 3 },                     // 銀10・金3
    speed: 1.28, dash: 1.28, phase: 1.35, scare: 1.4, reach: 1.25, size: 1.1,
    body: 0xfaf6f2, glow: 0xe8908f,
    desc: "九つの尾を もつ 大妖怪。すべてが ずばぬけている。",
    tip: "廃校の ぬしにふさわしい すがた。ここまで来たら 無敵。",
  },
};

// 交換所で、かけらと ひきかえられるもの
//  cost は { レア度の番号: 数 }
export const EXCHANGE = {
  traps: {
    locker: { 1: 2 }, chalk: { 1: 3 }, uwabaki: { 1: 2 }, suido: { 1: 3 },
    fumikiri: { 1: 4 }, kyuushoku: { 2: 2 }, tsuru: { 2: 3 }, kagami: { 2: 3 },
    piano: { 2: 4 }, housou: { 3: 2 }, jintai: { 3: 3 }, ofuda: { 3: 4 },
  },
  ghosts: {
    hitotsume: { 1: 4 }, randoseru: { 2: 4 }, kubinashi: { 3: 3 },
    hanako: { 3: 5 }, kagerou: { 4: 4 }, ranchi: { 5: 3 }, ookami: { 6: 2 },
  },
};

// 人間が落とす（ドロップ）テーブル
export const HUMAN_DROPS = ["onnen", "onnen", "denchi", "pan", "hokori", "wax", "kami"];

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

  // 上を通ったものを、みんな すべらせる。おばけには効かない。
  tsuru: {
    name: "ツルツルトラップ", icon: "🧴",
    cost: { wax: 4, nurunuru: 3 },
    fear: 14, radius: 3.4, cooldown: 0.6,
    slip: true,
    desc: "ワックスをぬりすぎた床。上を通った人間は みんな すべってコケる。おばけは浮いているので平気。",
    line: "ツルーーッ！！",
  },
  kagami: {
    name: "うつらない鏡", icon: "🪞",
    cost: { chalk: 3, denchi: 2, onnen: 2 },
    fear: 30, radius: 7.5, cooldown: 12,
    desc: "のぞきこんでも 自分が映らない。かわりに 知らない人が映る。",
    line: "…だれ？（鏡のなかで手をふる）",
  },
  housou: {
    name: "校内放送ジャック", icon: "📢",
    cost: { denchi: 3, onnen: 3, kami: 2 },
    fear: 38, radius: 26, cooldown: 20,
    desc: "スピーカーから 昔の下校放送が流れる。声は だんだん ずれていく。",
    line: "ピンポンパンポーン…『げこうの じかん です』",
  },
  fumikiri: {
    name: "ふりまわる竹ぼうき", icon: "🧹",
    cost: { hokori: 5, uwabaki: 2 },
    fear: 20, radius: 5.5, cooldown: 8,
    desc: "そうじの時間に置きざりにされた竹ぼうき。まだ そうじをしている。",
    line: "ザッ…ザッ…（ひとりでに掃いている）",
  },
  ofuda: {
    name: "はがれたお札", icon: "📜",
    cost: { kami: 4, onnen: 4 },
    fear: 46, radius: 9, cooldown: 16,
    desc: "だれかが 昔 貼ったお札。はがすと、おさえていたものが 出てくる。",
    line: "ペリッ…（なにかが ほどけた音）",
  },
  kyuushoku: {
    name: "動く給食ワゴン", icon: "🍽",
    cost: { pan: 4, denchi: 2, hokori: 3 },
    fear: 28, radius: 8, cooldown: 13,
    desc: "だれも押していないのに 廊下を進んでくる。献立は40年前のまま。",
    line: "ガラガラガラ…（きょうは あげぱん）",
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
  kubinashi: {
    name: "くびなし体操服", icon: "🎽",
    cost: { onnen: 10, uwabaki: 5, hokori: 6 },
    unlockAt: 5,
    fear: 34, radius: 5.5, speed: 3.0, life: 130,
    desc: "体操服だけが 準備運動をしている。中身は ない。数だけは 数える。",
    lines: ["いち、に、さん、し…", "つぎ、うでを まわして", "（体操服が おじぎした）"],
  },
  kagerou: {
    name: "かげろう先生", icon: "🕴",
    cost: { onnen: 18, chalk: 6, kami: 4 },
    unlockAt: 12,
    fear: 60, radius: 10, speed: 1.6, life: 200,
    desc: "廊下のはしに立つ、細長い影。近づくほど 背がのびる。授業には おくれない。",
    lines: ["…しずかに", "きょうは なんの じかんですか", "せきに つきなさい"],
  },
  ranchi: {
    name: "からっぽ椅子の大合唱", icon: "🪑",
    cost: { onnen: 22, denchi: 6, pan: 5 },
    unlockAt: 18,
    fear: 70, radius: 13, speed: 0.9, life: 200,
    desc: "教室じゅうの椅子が いっせいに 鳴る。だれも すわっていないのに 音楽会がはじまる。",
    lines: ["ギィ…ギィ…", "（いっせいに 立ちあがる音）", "つぎは 2番、いきます"],
  },
  ookami: {
    name: "巨大てるてる坊主", icon: "🎐",
    cost: { onnen: 30, kami: 10, nurunuru: 8 },
    unlockAt: 26,
    fear: 88, radius: 15, speed: 1.2, life: 240,
    desc: "運動会の前の日に つるされたまま、40年 待っている。もう だれも 来ないのに。",
    lines: ["…あした、はれる？", "みんな、まだ？", "（ゆっくり ふりむいた）"],
  },
};

// --- 人間 -----------------------------------------------------
export const HUMAN_TYPES = [
  {
    id: "youtuber", name: "配信者ユウキ", color: 0x4cc9ff, courage: 130, speed: 2.6,
    sex: "m", hair: 0x2b2228, blazer: 0x2c3555, trim: 0x8fa8d8,
    idle: ["はいどーもー、心霊スポット来てまーす", "今日はガチのやつ来ましたよ", "コメント欄、静かすぎん？", "これ絶対なんかいるって"],
    scared: ["え、いま撮れた？撮れた？", "うわああああカメラカメラ！", "スタッフー！スタッフいない！"],
    flee: ["高評価と登録よろしくうううう！！", "無理無理無理無理帰る帰る"],
  },
  {
    id: "gal", name: "ギャルのミク", color: 0xff5a9e, courage: 80, speed: 3.0,
    sex: "f", hair: 0x6b4a2f, blazer: 0x34305c, trim: 0xff9ec4, skirt: 0x8e3f66,
    idle: ["まじ埃やば、髪やられる", "え、ここ電波ある？", "つーかなんで来たんだっけ"],
    scared: ["は？！は？！なんかいた！", "やだやだやだ無理ィ！", "ネイル取れた！！"],
    flee: ["もう二度と来ないから！！", "ママーーー！！"],
  },
  {
    id: "otaku", name: "オカルト部・田所", color: 0x7ce85a, courage: 150, speed: 2.2,
    sex: "m", hair: 0x1f1a1c, blazer: 0x2a3d33, trim: 0x9fd8a8,
    idle: ["ふむ…この澱んだ空気…本物ですね", "霊障の兆候は…まだ", "みなさん、記録は正確に"],
    scared: ["き、記録します！記録しますから！", "しゅ、出現条件が理論と違う…！", "ま、待ってこれ論文になる"],
    flee: ["撤退！これは学術的撤退です！", "資料が！資料だけでも！"],
  },
  {
    id: "couple", name: "ビビり彼氏ケンタ", color: 0xffc63d, courage: 55, speed: 3.2,
    sex: "m", hair: 0x3a2a1e, blazer: 0x4a3a24, trim: 0xffd98a,
    idle: ["お、俺は全然平気だけどさ", "ほら、あれ、ただの風だって", "先に行っていいよ、俺、後ろ守るから"],
    scared: ["ひっ", "いや今の聞いた？聞いたよね？", "俺は見てない、何も見てない"],
    flee: ["ごめん！マジでごめん！", "車！車のとこで待ってる！"],
  },
  {
    id: "granny", name: "近所の岩井さん", color: 0xd8b4ff, courage: 165, speed: 1.8,
    sex: "f", hair: 0x8a8a92, blazer: 0x4a3f63, trim: 0xd8b4ff, skirt: 0x574a70, elderly: true,
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


// ============================================================
//  すがたの きょうか（レベルアップ）
//   すがたを ぜんぶ そろえたあとも、あそべるように。
//   ためた材料と かけらを つかって、すがたごとに
//   「はやさ」「ダッシュ」「こわさ」「とどく」「すりぬけ」を
//   1レベルずつ 上げていく。
//   1レベルで +0.02。たとえば はやさ ×1.28 → ×1.30。
//   レベル30まで 上げると +0.60 になり、めちゃくちゃ強くなる。
//
//   ・きょうかは すがたごと。河童を上げても 天狗は 上がらない
//   ・上げるほど 材料も かけらも たくさん いる
//   ・つかう かけらの色は、レベルが上がるほど よい色になる
// ============================================================
export const UPG_STEP = 0.02;      // 1レベルで ふえる ぶん
export const UPG_MAX = 30;         // ここまで 上げられる

export const UPGRADES = {
  speed: { name: "はやさ",   icon: "💨", desc: "あるく・とぶ はやさ",       mats: ["nurunuru", "wax"] },
  dash:  { name: "ダッシュ", icon: "⚡", desc: "ダッシュの もちと もどり", mats: ["denchi", "pan"] },
  scare: { name: "こわさ",   icon: "😱", desc: "おどかす ちからの 強さ",   mats: ["onnen", "kami"] },
  reach: { name: "とどく",   icon: "📏", desc: "おどかしが とどく はんい", mats: ["chalk", "hokori"] },
  phase: { name: "すりぬけ", icon: "🌀", desc: "すりぬけの もちと もどり", mats: ["uwabaki", "kami"] },
};

// つぎの レベルに 上げるのに いるもの。
//  lv は「いまのレベル」。0 なら はじめての きょうか。
//  かけらの色は 4レベルごとに 上がっていく
//  （水色 → 青 → 赤 → 紫 → 銀 → 金）。
export function upgCost(key, lv) {
  const u = UPGRADES[key];
  if (!u) return null;
  const L = lv + 1;                                  // これから 上げる レベル
  const tier = Math.min(6, Math.floor((L - 1) / 5) + 1);
  return {
    mats: { [u.mats[0]]: 6 + L * 4, [u.mats[1]]: 4 + L * 3 },
    shards: { [tier]: 3 + L * 2 },
  };
}


// ============================================================
//  すがたの 色がえ
//   ・パーツ（からだ／ひかり／め／かざり）ごとに 色を かえられる
//   ・色は はじめ すこししか なくて、材料を つかうと ふえていく
//   ・どの色を つかうかは すがたごと。
//     河童を みどりのままに して、天狗だけ 金色に、も できる
//   ・色そのものは いちど 手に入れれば、どのすがたでも つかえる
// ============================================================
export const PARTS = {
  body: { name: "からだ",   icon: "🫧", desc: "あたま・手・すそ" },
  deco: { name: "かざり",   icon: "🎀", desc: "すがたごとの かざり（甲羅・傘・しっぽ など）" },
  glow: { name: "ひかり",   icon: "✨", desc: "まわりの ひかりと、かべごしの りんかく" },
  eye:  { name: "め",       icon: "👀", desc: "目と 口" },
};

// つかえる色。上から じゅんに 手に入れていく。
//  cost が null の色は はじめから つかえる。
export const PAINTS = [
  { id: "base",   name: "もとの色",     hex: null,     cost: null },
  { id: "snow",   name: "ゆきいろ",     hex: 0xf4f1e8, cost: null },
  { id: "sumi",   name: "すみいろ",     hex: 0x2a2732, cost: null },
  { id: "momo",   name: "ももいろ",     hex: 0xf5a8c0, cost: { hokori: 12, chalk: 8 } },
  { id: "sora",   name: "そらいろ",     hex: 0x7fc4f0, cost: { hokori: 16, kami: 10 } },
  { id: "wakaba", name: "わかばいろ",   hex: 0x86d06a, cost: { nurunuru: 14, chalk: 12 } },
  { id: "yamabuki", name: "やまぶきいろ", hex: 0xf5c23a, cost: { pan: 16, wax: 12 } },
  { id: "akane",  name: "あかねいろ",   hex: 0xe85a5a, cost: { onnen: 18, kami: 14 } },
  { id: "fuji",   name: "ふじいろ",     hex: 0xb49ae8, cost: { uwabaki: 18, nurunuru: 16 }, shards: { 1: 4 } },
  { id: "mikan",  name: "みかんいろ",   hex: 0xf59340, cost: { pan: 24, denchi: 18 }, shards: { 1: 6 } },
  { id: "wasabi", name: "わさびいろ",   hex: 0x4f8a4a, cost: { nurunuru: 26, wax: 20 }, shards: { 1: 8 } },
  { id: "mizu",   name: "みずいろ",     hex: 0x9fe8e0, cost: { kami: 28, hokori: 24 }, shards: { 2: 6 } },
  { id: "budou",  name: "ぶどういろ",   hex: 0x7a3a8a, cost: { onnen: 30, uwabaki: 22 }, shards: { 2: 9 } },
  { id: "chairo", name: "こげちゃ",     hex: 0x6a4a32, cost: { pan: 32, wax: 26 }, shards: { 2: 12 } },
  { id: "kurenai", name: "くれないいろ", hex: 0xc41f3a, cost: { onnen: 36, denchi: 28 }, shards: { 3: 8 } },
  { id: "ruri",   name: "るりいろ",     hex: 0x2a4fd8, cost: { denchi: 38, kami: 30 }, shards: { 3: 11 } },
  { id: "moegi",  name: "もえぎいろ",   hex: 0xa8e02a, cost: { nurunuru: 40, chalk: 32 }, shards: { 3: 14 } },
  { id: "sakura", name: "さくらいろ",   hex: 0xffd0e0, cost: { chalk: 44, hokori: 36 }, shards: { 4: 9 } },
  { id: "yami",   name: "やみいろ",     hex: 0x14121c, cost: { onnen: 48, uwabaki: 38 }, shards: { 4: 13 } },
  { id: "aotake", name: "あおたけいろ", hex: 0x1fbf9a, cost: { nurunuru: 50, wax: 40 }, shards: { 4: 17 } },
  { id: "kohaku", name: "こはくいろ",   hex: 0xffab2e, cost: { pan: 56, denchi: 44 }, shards: { 5: 10 } },
  { id: "gin",    name: "ぎんいろ",     hex: 0xd8dee8, cost: { wax: 60, chalk: 50 }, shards: { 5: 16 } },
  { id: "kin",    name: "きんいろ",     hex: 0xffd23a, cost: { onnen: 70, pan: 55 }, shards: { 6: 12 } },
  { id: "nijiao", name: "オーロラいろ", hex: 0x8affe8, cost: { kami: 75, nurunuru: 60 }, shards: { 6: 18 } },
  { id: "gokusai", name: "ごくさいしき", hex: 0xff4fd8, cost: { onnen: 90, uwabaki: 70 }, shards: { 6: 26 } },
  { id: "kurogane", name: "くろがねいろ", hex: 0x3a4048, cost: { hokori: 14, wax: 10 } },
  { id: "kinari",  name: "きなりいろ",   hex: 0xefe6d2, cost: { kami: 12, chalk: 10 } },
  { id: "usuzumi", name: "うすずみいろ", hex: 0x8a8a92, cost: { hokori: 18, uwabaki: 12 } },
  { id: "beni",    name: "べにいろ",     hex: 0xe8607a, cost: { onnen: 20, chalk: 16 } },
  { id: "hiwa",    name: "ひわいろ",     hex: 0xd0e05a, cost: { pan: 20, nurunuru: 16 } },
  { id: "asagi",   name: "あさぎいろ",   hex: 0x5ac8d8, cost: { kami: 22, denchi: 16 } },
  { id: "tsutsuji", name: "つつじいろ",  hex: 0xe060c8, cost: { onnen: 24, uwabaki: 18 }, shards: { 1: 5 } },
  { id: "matcha",  name: "まっちゃいろ", hex: 0x9ab04a, cost: { nurunuru: 24, wax: 18 }, shards: { 1: 5 } },
  { id: "sunairo", name: "すないろ",     hex: 0xd8c49a, cost: { hokori: 26, pan: 20 }, shards: { 1: 7 } },
  { id: "kachi",   name: "かちいろ",     hex: 0x2a3a5e, cost: { denchi: 26, kami: 20 }, shards: { 1: 9 } },
  { id: "ai",      name: "あいいろ",     hex: 0x203864, cost: { denchi: 28, uwabaki: 22 }, shards: { 1: 10 } },
  { id: "shu",     name: "しゅいろ",     hex: 0xe85a28, cost: { onnen: 28, pan: 22 }, shards: { 2: 7 } },
  { id: "wakakusa", name: "わかくさいろ", hex: 0x6ad06a, cost: { nurunuru: 30, chalk: 24 }, shards: { 2: 8 } },
  { id: "kikyo",   name: "ききょういろ", hex: 0x6a5ad0, cost: { uwabaki: 32, kami: 24 }, shards: { 2: 10 } },
  { id: "tetsu",   name: "てついろ",     hex: 0x4a5a5a, cost: { denchi: 34, wax: 26 }, shards: { 2: 12 } },
  { id: "momiji",  name: "もみじいろ",   hex: 0xd03a28, cost: { onnen: 34, hokori: 28 }, shards: { 3: 8 } },
  { id: "hisui",   name: "ひすいいろ",   hex: 0x3ad0a0, cost: { nurunuru: 36, kami: 28 }, shards: { 3: 10 } },
  { id: "yamabudo", name: "やまぶどう",  hex: 0x5a2038, cost: { onnen: 38, uwabaki: 30 }, shards: { 3: 12 } },
  { id: "ougon",   name: "おうごんいろ", hex: 0xe8a020, cost: { pan: 42, wax: 34 }, shards: { 4: 8 } },
  { id: "gunjo",   name: "ぐんじょういろ", hex: 0x2038c8, cost: { denchi: 46, chalk: 36 }, shards: { 4: 11 } },
  { id: "shiraume", name: "しらうめいろ", hex: 0xf8f0e8, cost: { chalk: 48, kami: 38 }, shards: { 4: 15 } },
  { id: "kuroshio", name: "くろしおいろ", hex: 0x102a4a, cost: { nurunuru: 52, denchi: 40 }, shards: { 5: 9 } },
  { id: "hono",    name: "ほのおいろ",   hex: 0xff6a1a, cost: { onnen: 58, pan: 46 }, shards: { 5: 13 } },
  { id: "raimei",  name: "らいめいいろ", hex: 0xc8f000, cost: { denchi: 62, wax: 48 }, shards: { 5: 18 } },
  { id: "akatsuki", name: "あかつきいろ", hex: 0xff8ac0, cost: { chalk: 66, hokori: 52 }, shards: { 6: 10 } },
  { id: "shinkai", name: "しんかいいろ", hex: 0x0a1a3a, cost: { kami: 72, uwabaki: 56 }, shards: { 6: 14 } },
  { id: "hakugin", name: "はくぎんいろ", hex: 0xf0f4ff, cost: { wax: 80, chalk: 62 }, shards: { 6: 20 } },
  { id: "yamiyo",  name: "やみよいろ",   hex: 0x05050a, cost: { onnen: 85, hokori: 68 }, shards: { 6: 22 } },
  { id: "kaen",    name: "かえんいろ",   hex: 0xff2a4a, cost: { onnen: 100, denchi: 80 }, shards: { 6: 30 } },
];

export function paintById(id) { return PAINTS.find((p) => p.id === id) || PAINTS[0]; }
