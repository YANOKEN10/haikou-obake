import * as THREE from "../lib/three.module.js";
import { modelBuilder } from "./character-models.js";

// 四本脚の白狐と、根元から扇状に分かれた九本の尾。
export function buildKyubi(owner) {
  const b=modelBuilder(owner,'kyubi-white-fox'),{root,put,ball,tube,limb,shape,group,strand}=b;
  const white=0xf5f3ec,cream=0xe4e3d9,light=0xfffff9;
  ball([0,1.07,-.2],[.265,.37,.62],white);
  ball([0,1.15,.22],[.275,.4,.295],white);
  ball([0,1.08,-.59],[.265,.34,.28],white);
  ball([0,1.4,.24],[.215,.36,.24],white);
  // 前胸の長い毛。小さな房を下へ重ねて、首と胴の境目を柔らかくする。
  for(let j=0;j<28;j++){
    const a=j/28*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
    strand([[x*.18,1.49,.22+z*.16],[x*.24,1.27,.24+z*.2],[x*.2,.97,.26+z*.18]],.044,j%4?white:cream);
  }
  const legs=[];
  for(const rear of [false,true])for(const sx of [-1,1]){
    const g=group(`fox-${rear?'hind':'front'}-leg-${sx}`,[sx*(rear?.2:.16),rear?1.1:1.18,rear?-.55:.27]);legs.push({g,rear,sx});
    if(rear){
      ball([0,-.16,.025],[.13,.235,.175],white,'body',g);
      limb([0,-.12,.03],[0,-.48,.16],.105,.063,white,'body',g);
      limb([0,-.48,.16],[0,-.81,-.075],.065,.041,white,'body',g);
      limb([0,-.8,-.075],[0,-1.02,-.055],.043,.034,white,'body',g);
      ball([0,-1.055,.015],[.071,.047,.13],white,'body',g);
    }else{
      limb([0,-.08,0],[0,-.57,-.055],.092,.047,white,'body',g);
      limb([0,-.56,-.055],[0,-1.08,.015],.047,.032,white,'body',g);
      ball([0,-1.105,.075],[.067,.05,.122],white,'body',g);
    }
    const y=rear?-1.08:-1.127,z=rear?.09:.15;
    for(const x of [-.022,.022])tube([[x,y,z-.025],[x,y+.006,z+.018]],.0035,0xc0c0b7,'fixed',g);
  }
  const head=group('fox-head',[0,1.64,.38]);
  ball([0,.02,-.015],[.22,.255,.207],white,'body',head);
  ball([0,-.095,.1],[.165,.137,.155],white,'body',head);
  // 先端へ細くなる鼻づら。左右の頬と口元を別にして狐の面長な顔にする。
  limb([0,-.065,.14],[0,-.164,.36],.11,.057,white,'body',head);
  for(const sx of [-1,1]){
    ball([sx*.047,-.173,.317],[.071,.045,.079],light,'body',head);
    // 頬から外へ短く流れる毛。
    for(let j=0;j<9;j++)strand([[sx*.15,.045-j*.022,.07],[sx*(.22+j*.003),-.005-j*.023,.065],[sx*(.26+j*.004),-.09-j*.014,.045]],.026,j%3?white:cream,head);
    shape([[sx*.08,.19],[sx*.105,.36],[sx*.255,.46],[sx*.268,.23],[sx*.18,.15]],.075,white,'body',head,-.075,.018);
    shape([[sx*.137,.245],[sx*.228,.37],[sx*.232,.268],[sx*.186,.22]],.014,0x999c95,'fixed',head,.013,.006);
    shape([[sx*.17,.25],[sx*.221,.33],[sx*.221,.265]],.012,0xc8c9be,'fixed',head,.029,.002);
    // 左右を別の色替え部品にする。鼻と口の黒は固定する。
    const eye=group(`fox-eye-${sx}`);head.add(eye);
    shape([[sx*.105,.031],[sx*.143,.059],[sx*.186,.047],[sx*.174,.017],[sx*.135,.003]],.012,0x333a31,'eye',eye,.174,.003);
    ball([sx*.142,.035,.19],[.007,.008,.005],0xfafcf5,'fixed',head);
    tube([[sx*.107,.071,.17],[sx*.144,.086,.159],[sx*.19,.065,.137]],.009,cream,'body',head);
    tube([[sx*.045,-.196,.366],[sx*.092,-.194,.323],[sx*.115,-.179,.273]],.004,0x85867c,'fixed',head);
  }
  ball([0,-.147,.395],[.046,.033,.026],0x262c29,'fixed',head);
  tube([[0,-.173,.403],[0,-.203,.386]],.004,0x555a51,'fixed',head);
  // 高さと広がりをずらし、正面から九本の先端がそれぞれ読めるようにする。
  const ends=[[-1.82,.54,-.93],[-1.85,1.16,-.99],[-1.55,1.94,-1.04],[-.91,2.6,-1.05],
    [0,2.91,-1.09],[.91,2.6,-1.05],[1.55,1.94,-1.04],[1.85,1.16,-.99],[1.82,.54,-.93]];
  const tails=[];
  for(let i=0;i<9;i++){
    const e=ends[i],sx=Math.sign(e[0]),tail=group(`fox-tail-${i+1}`,[0,1.035,-.69]);tails.push(tail);
    const end=[e[0],e[1]-1.035,e[2]+.69];
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(sx*.025,0,0),
      new THREE.Vector3(e[0]*.37,(e[1]-1.035)*.37,-.24),
      new THREE.Vector3(e[0]*.76,(e[1]-1.035)*.81+.12,-.33),new THREE.Vector3(...end)]);
    const seg=30,radial=12,frames=curve.computeFrenetFrames(seg,false),pos=[],idx=[];
    const radius=t=>.055*(1-t)+(.245+(i%3)*.013)*Math.pow(Math.sin(Math.PI*t),.95)+.002;
    for(let j=0;j<=seg;j++){
      const t=j/seg,p=curve.getPointAt(t),r=radius(t);
      for(let k=0;k<radial;k++){
        const a=k/radial*Math.PI*2,ruff=1+.012*Math.sin(j*2.4+k*2.1+i);
        const v=p.clone().addScaledVector(frames.normals[j],Math.cos(a)*r*ruff).addScaledVector(frames.binormals[j],Math.sin(a)*r*.85*ruff);
        pos.push(...v.toArray());if(j<seg){const n=j*radial+k,m=j*radial+(k+1)%radial;idx.push(n,m,n+radial,m,m+radial,n+radial);}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();put(geo,white,'deco',tail);
    // 毛束は表面から毛先方向へ寝かせ、長い針状に突き出さないよう短くする。
    for(let j=0;j<36;j++){
      const t=.22+((j*7)%36)/36*.65,a=j*2.39996,k=Math.round(t*seg);
      const p=curve.getPointAt(t),dir=curve.getTangentAt(t),out=frames.normals[k].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[k],Math.sin(a)*.85),r=radius(t);
      const start=p.clone().addScaledVector(out,r*.78),mid=p.clone().addScaledVector(out,r*1.05).addScaledVector(dir,.09),tip=p.clone().addScaledVector(out,r*.94).addScaledVector(dir,.18);
      strand([start.toArray(),mid.toArray(),tip.toArray()],.019,j%5?light:cream,tail);
    }
  }
  b.finish();
  // 壁越しの表示も狐の輪郭。尾の揺れを同じ角度で反映する。
  owner.xray.clear();const outlineTails=[];
  for(const tail of tails){const copy=new THREE.Group();copy.position.copy(tail.position);for(const m of tail.children){if(m.isMesh)copy.add(new THREE.Mesh(m.geometry,owner.xrayMat));}owner.xray.add(copy);outlineTails.push(copy);}
  for(const [p,s] of [[[0,1.07,-.2],[.265,.37,.62]],[[0,1.65,.38],[.22,.255,.21]]]){const m=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),owner.xrayMat);m.position.set(...p);m.scale.set(...s);owner.xray.add(m);}
  let gait=0,lastT=null,pace=0,windTime=0;
  owner.kyubiRig={root,head,legs,tails,update(t,moving,scare){
    const dt=lastT===null?1/60:Math.max(0,Math.min(.1,t-lastT));lastT=t;
    const run=Math.min(1,Math.max(0,moving)/6);
    pace+=(run-pace)*(1-Math.exp(-dt*10));gait+=dt*(5+run*7);windTime+=dt*(1+pace*1.5);

    root.position.y=Math.abs(Math.sin(gait*2))*pace*.045;
    head.rotation.x=Math.sin(t*1.7)*.018-scare*.065;
    head.rotation.y=Math.sin(t*.75)*.025;
    for(let i=0;i<9;i++){
      const side=(i-4)/4;
      tails[i].rotation.z=Math.sin(windTime*1.35+i*.6)*(.035+pace*.22)-side*scare*.055;
      tails[i].rotation.x=Math.sin(windTime*1.6+i*.43)*(.035+pace*.17)-pace*.38;
      tails[i].rotation.y=Math.sin(windTime*1.8+i*.7)*pace*.18;
      outlineTails[i].rotation.copy(tails[i].rotation);
    }
    // 四拍の足運び。片脚ずつ前へ運び、接地中は体の後ろへ送る。
    for(const {g,rear,sx} of legs){
      const offset=rear?(sx>0?0:Math.PI):(sx>0?Math.PI*.5:Math.PI*1.5);
      const step=Math.sin(gait+offset);
      g.rotation.x=step*pace*.46;
      g.position.y=(rear?1.1:1.18)+Math.max(0,Math.cos(gait+offset))*pace*.085;
    }
  }};
}
