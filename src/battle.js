// ============================================================
//  追い出しバトル（ともだちとの バトル）
//   ・部屋を作った人（おや）が「はじめる」を おすと、
//     3・2・1 の あとに 勝負が はじまる
//   ・おなじ廃校で、決めた時間のあいだに
//     どれだけ たくさん 追い出せたかを きそう
//   ・おわると けっかが 出て、追い出した人数ぶん 材料がもらえる
//
//  どうやって みんなで 合わせているか
//   ・時こく（時計）は 端末ごとに ずれるので、送るのは
//     「のこり何秒か」だけ。うけとった側は そこから
//     自分で へらしていく
//   ・おやが のこり秒と ようすを 送り、お客さんは それに合わせる
//   ・追い出した人数と順位は、おやが 数えて みんなに 送る
// ============================================================

// もらえる材料。追い出すほど たくさん・いい色になる
import { MATERIALS, RARITY } from "./data.js";

export const BATTLE_DROPS = ["onnen", "hokori", "denchi", "pan", "wax", "kami", "nurunuru"];

// 得点はホストだけが確定する。試合IDと更新番号で前の試合・遅れた通信を除外する。
export class Battle {
  constructor(game) { this.game=game;this.seen=new Set();this.rewarded=new Set();this.reset(); }
  reset() {
    this.phase="off";this.left=0;this.dur=180;this.score=0;this.peerScores={};this.lastCount=-1;
    this.startedAt=0;this.ended=null;this.id="";this.host="";this.rev=0;this.roster=[];this.scores={};this.owners=new Map();this.exits=new Set();
  }
  get on(){return this.phase==="count"||this.phase==="play";}
  get playing(){return this.phase==="play"&&this.left>0;}
  start(minutes){
    const g=this.game;
    if(!g.net.on||!g.net.isHost||g.net.peers.size<1||this.on)return false;
    if(![1,3,5].includes(Number(minutes)))return false;
    const stamp=Math.max(Date.now(),this.startedAt+1);this.reset();this.startedAt=stamp;this.id=stamp.toString(36)+"-"+Math.random().toString(36).slice(2,9);this.seen.add(this.id);
    this.host=g.net.pid;this.roster=[{pid:g.net.pid,name:g.net.name||"じぶん"},...Array.from(g.net.peers,([pid,p])=>({pid,name:p.name}))].slice(0,4);
    this.scores=Object.fromEntries(this.roster.map(p=>[p.pid,0]));this.dur=minutes*60;this.left=3;this.phase="count";
    this.prepare();return true;
  }
  prepare(){const g=this.game;g.ui.closeRoom();g.ui.closeCraft?.();g.setPaused(false);g.ui.hideResult();}
  // 恐怖が限界に達して逃走を始めた人を記録。逃げている人への追撃では横取りしない。
  claim(h,pid,eff,wasFlee,matchId=this.id){
    if(!this.game.net.isHost||!this.playing||matchId!==this.id||wasFlee||eff<=0||h.fear<h.maxFear||!(pid in this.scores))return;
    if(!this.owners.has(h.hid))this.owners.set(h.hid,pid);
  }
  countEscape(h){
    if(!this.game.net.isHost||!this.playing||!h.out||this.exits.has(h.hid))return;
    const pid=this.owners.get(h.hid);if(!pid)return;
    this.exits.add(h.hid);this.scores[pid]++;this.syncScore();
  }
  syncScore(){this.score=this.scores[this.game.net.pid]||0;this.peerScores={...this.scores};}
  rows(){
    const rows=this.roster.map(p=>({...p,score:this.scores[p.pid]||0,me:p.pid===this.game.net.pid})).sort((a,b)=>b.score-a.score);
    let rank=0,last=null;rows.forEach((r,i)=>{if(r.score!==last){rank=i+1;last=r.score;}r.place=rank;});return rows;
  }
  update(dt){
    const g=this.game;if(!this.on)return;
    if(!g.net.on||(g.net.isHost&&this.host!==g.net.pid)){this.finish(true);return;}
    const remaining=this.left-Math.max(0,dt);this.left=Math.max(0,remaining);
    if(g.net.isHost&&this.left===0){
      if(this.phase==="count"){this.phase="play";this.left=Math.max(0,this.dur+remaining);g.ui.showCount("スタート！",true);g.audio.rankUp();}
      else {this.finish(false);return;}
    }
    if(g.net.isHost&&this.phase==="play"&&this.left===0){this.finish(false);return;}
    if(this.phase==="count"){
      const n=Math.max(1,Math.ceil(this.left));if(n!==this.lastCount){this.lastCount=n;g.ui.showCount(String(n),false);g.audio.tone(520,.16,"square",.07,520);}
    }
  }
  applyRemote(bt){
    if(!bt){if(this.on)this.finish(true);return;}
    if(!bt.id||!Array.isArray(bt.members)||!bt.scores||!["off","count","play","over"].includes(bt.p))return;
    if(bt.id!==this.id){if(this.seen.has(bt.id)||(bt.host===this.host&&bt.at<this.startedAt))return;this.reset();this.id=bt.id;this.startedAt=bt.at;this.seen.add(bt.id);this.prepare();}
    if(bt.r<=this.rev)return;
    const was=this.phase;this.rev=bt.r;this.host=bt.host;this.roster=bt.members.map(p=>({...p}));this.scores={...bt.scores};this.syncScore();
    this.dur=bt.d;this.left=Math.max(0,bt.l);this.phase=bt.p;
    if(was!=="play"&&bt.p==="play"){this.game.ui.showCount("スタート！",true);this.game.audio.rankUp();}
    if(bt.p==="over")this.showResult();
    if(bt.p==="off"&&was!=="off"){this.game.ui.setBattle(null);this.game.ui.toast?.("追い出しバトルは中止になりました", "bad");}
  }
  netState(){return this.id?{id:this.id,at:this.startedAt,r:++this.rev,host:this.host,p:this.phase,l:+this.left.toFixed(2),d:this.dur,members:this.roster,scores:{...this.scores}}:null;}
  finish(cancelled){
    if(!this.on)return;this.left=0;this.phase=cancelled?"off":"over";this.game.ui.setBattle(null);
    if(cancelled){this.game.ui.toast?.("追い出しバトルは中止になりました", "bad");return;}this.showResult();
  }
  showResult(){
    if(this.rewarded.has(this.id))return;this.rewarded.add(this.id);
    const rows=this.rows(),mine=rows.find(r=>r.me);this.ended=rows;this.game.ui.setBattle(null);
    if(!mine){this.game.ui.toast?.("バトル終了。次の勝負から参加できます", "good");return;}
    const gift=this.giveGift(mine.score,mine.place===1&&rows.length>1),txt=giftText(gift);
    this.game.ui.showResult(rows,{num:gift.num,won:gift.won,items:txt.items,tiers:txt.tiers},mine);this.game.audio.rankUp();
  }

  // --- ごほうび --------------------------------------------
  //  追い出した人数が 多いほど、たくさん・いい色 もらえる。
  //  1位には おまけ。0人でも 参加賞は もらえる。
  giveGift(score, won) {
    const g = this.game;
    const num = Math.min(16, 2 + Math.floor(score / 2) + (won ? 3 : 0));
    // 色の あたり やすさ。0人なら 白ばかり、たくさんなら 銀や金も
    const luck = Math.min(1, score / 22) * (won ? 1.15 : 1);
    const got = {};      // kind → 数
    const tiers = {};    // tier → 数
    for (let i = 0; i < num; i++) {
      const kind = BATTLE_DROPS[Math.floor(Math.random() * BATTLE_DROPS.length)];
      const tier = pickTier(luck);
      const mult = RARITY[tier].mult;
      g.inv[kind] = (g.inv[kind] || 0) + mult;
      got[kind] = (got[kind] || 0) + mult;
      if (tier >= 1) {
        g.shards[tier] = (g.shards[tier] || 0) + 1;
        tiers[tier] = (tiers[tier] || 0) + 1;
      }
    }
    g.ui.setBag(g.inv);
    g.ui.setShards(g.shards);
    g.saveNow(false);
    return { num, got, tiers, won };
  }
}

// 勝負の ごほうびの 色を きめる。
//  luck が 0 に近いと 白ばかり、1 に近いと いい色も 出る。
function pickTier(luck) {
  const near = [640, 250, 80, 24, 5, 0.9, 0.15];
  const far = [120, 230, 250, 220, 120, 44, 16];
  const w = near.map((v, i) => v + (far[i] - v) * luck);
  let sum = 0;
  for (const v of w) sum += v;
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

// けっか画面の 文
export function giftText(gift) {
  const kinds = Object.keys(gift.got);
  const items = kinds.map((k) => MATERIALS[k].icon + MATERIALS[k].name + "×" + gift.got[k]).join("　");
  const tiers = Object.keys(gift.tiers).sort((a, b) => b - a)
    .map((t) => RARITY[t].name + "×" + gift.tiers[t]).join("　");
  return { items, tiers };
}
