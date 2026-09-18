import * as THREE from '../lib/three.module.js';
import { modelBuilder } from './character-models.js';

// 添付の輪郭・衣装・顔を、画像貼り付けではなく動かせる立体として再構成する。
export function buildClassicReference(owner,id){
 const b=modelBuilder(owner,`reference-${id}`),{root,ball,box,tube,limb,shape,group,put}=b;
 const ink=0x171316,skin=0xf4c8ad,hair=0x151416,arms=[],legs=[],locks=[];
 let head=null,tail=null,club=null,neck=null;
 const line=(p,r=.012,c=ink,parent=root)=>tube(p,r,c,'fixed',parent);
 const eye=(x,y,z,parent,scale=1)=>{ball([x,y,z],[.09*scale,.12*scale,.038],0xfffcf2,'fixed',parent);ball([x,y,z+.035],[.062*scale,.093*scale,.02],ink,'eye',parent);};
 const shoe=(parent,x,y,z,color=0xa51927)=>ball([x,y,z],[.105,.065,.21],color,'deco',parent);
 const hairLock=(name,pos,points,width=.1,color=hair,parent=root)=>{const g=group(name,pos);if(parent!==root)parent.add(g);b.strand(points,width,color,g);locks.push(g);return g;};
 if(id==='kuchisake'){
   // 細身の赤いダブルコート、二列の黒ボタン、赤いパンプス。
   put(new THREE.CylinderGeometry(.26,.34,1.14,28),0xc80710,'body',root,[0,1.04,0],[1,1,.67]);
   ball([0,1.53,0],[.29,.22,.19],0xc80710);
   for(const sx of [-1,1]){
     const leg=group(`coat-leg-${sx}`,[sx*.13,.51,0]);legs.push(leg);limb([0,0,0],[sx*.012,-.4,.025],.065,.048,skin,'fixed',leg);shoe(leg,0,-.41,.06);
     const arm=group(`coat-arm-${sx}`,[sx*.26,1.51,0]);arms.push(arm);limb([0,0,0],[sx*.12,-.64,.02],.087,.061,0xc80710,'body',arm);box([sx*.12,-.64,.02],[.15,.13,.16],0xe1171e,'body',arm);ball([sx*.12,-.76,.025],[.052,.115,.045],skin,'fixed',arm);line([[sx*.13,-.72,.07],[sx*.12,-.79,.077]],.009,ink,arm);
     shape([[sx*.045,1.69],[sx*.19,1.57],[sx*.12,1.37],[sx*.07,1.45],[sx*.025,1.2]],.025,0xe01920,'body',root,.18);
     line([[sx*.045,1.69,.213],[sx*.19,1.57,.214],[sx*.12,1.37,.214],[sx*.07,1.45,.214]],.009);
     for(const y of [1.14,.94])ball([sx*.095,y,.192],[.023,.024,.016],ink,'fixed');
   }
   line([[-.31,.81,.215],[0,.78,.232],[.31,.81,.215]],.015);line([[.026,1.25,.213],[.028,.85,.224]],.009);
   head=group('coat-head',[0,1.95,0]);ball([0,.03,-.075],[.385,.48,.24],hair,'deco',head);ball([0,.02,.025],[.31,.35,.218],skin,'fixed',head);
   // 顔は画像と同じく目を描かず、横に大きく裂けた笑い口を主役にする。
   const mouth=new THREE.Shape();mouth.moveTo(-.292,-.02);mouth.quadraticCurveTo(0,-.27,.292,-.02);mouth.quadraticCurveTo(0,-.41,-.292,-.02);
   put(new THREE.ExtrudeGeometry(mouth,{depth:.015,bevelEnabled:false,curveSegments:24}),0x3a2024,'eye',head,[0,0,.204]);
   line([[-.26,-.065,.231],[-.13,-.145,.253],[0,-.17,.261],[.15,-.14,.253],[.265,-.06,.229]],.018,0xf3d3c3,head);
   for(const sx of [-1,1])hairLock(`coat-hair-${sx}`,[sx*.3,.22,-.055],[[0,0,0],[sx*.07,-.29,.02],[sx*.06,-.68,-.01],[sx*.14,-1.0,.0]],.145,hair,head);
   shape([[-.3,.2],[-.2,.36],[-.02,.33],[.08,.19],[-.07,.24],[-.14,.3],[-.21,.19],[-.24,.02]],.06,hair,'deco',head,.19);
   shape([[-.14,.34],[.14,.36],[.31,.21],[.2,.15],[.02,.2]],.07,hair,'deco',head,.17);
 }
 if(id==='jinmenken'){
   const fur=0xb47b3d;ball([0,.6,-.22],[.47,.4,.68],fur);ball([0,.68,.31],[.43,.43,.37],fur);
   for(const sx of [-1,1])for(const z of [-.65,.2]){const leg=group(`dog-leg-${sx}-${z}`,[sx*.31,.55,z]);legs.push(leg);limb([0,0,0],[0,-.43,.03],.125,.1,fur,'body',leg);ball([0,-.46,.08],[.145,.12,.18],fur,'body',leg);for(let j=-1;j<=1;j++)line([[j*.055,-.45,.226],[j*.055,-.5,.232]],.006,0x845528,leg);}
   head=group('dog-human-face',[0,1.08,.42]);
   // 顔の外周と三角の立ち耳。
   ball([0,0,0],[.5,.51,.29],fur,'body',head);
   for(const sx of [-1,1]){shape([[sx*.19,.33],[sx*.36,.68],[sx*.49,.27]],.16,fur,'body',head,-.03,.04);ball([sx*.265,-.08,.255],[.11,.085,.018],0xeea386,'fixed',head);line([[sx*.1,.19,.313],[sx*.2,.2,.314],[sx*.285,.19,.296]],.036,ink,head);ball([sx*.15,.045,.335],[.032,.04,.02],ink,'eye',head);}
   ball([0,-.035,.17],[.385,.37,.19],0xffd6a4,'fixed',head);
   // 顔面の描画順は奥行きで決まるため、パーツを肌より前へ置く。
   for(const sx of [-1,1]){ball([sx*.265,-.08,.345],[.1,.075,.015],0xefab8c,'fixed',head);line([[sx*.1,.19,.353],[sx*.2,.2,.344],[sx*.285,.19,.321]],.035,ink,head);ball([sx*.15,.045,.362],[.03,.038,.018],ink,'eye',head);line([[sx*.17,-.14,.353],[sx*.195,-.2,.348]],.016,0xcc945e,head);}
   ball([0,-.075,.38],[.068,.055,.036],0x81512d,'fixed',head);line([[-.11,-.23,.341],[-.07,-.255,.36],[0,-.226,.375],[.07,-.255,.36],[.11,-.23,.341]],.017,0xb33651,head);
   put(new THREE.TorusGeometry(.36,.04,10,36),0x9e1829,'deco',root,[0,.72,.32],[1,1,.8],[Math.PI/2,0,0]);
   tail=group('dog-curled-tail',[0,.8,-.78]);tube([[0,0,0],[0,.25,-.25],[0,.51,-.19],[0,.52,.06],[0,.32,.15],[0,.3,-.03]],.115,fur,'body',tail);
 }
 if(id==='zashiki'||id==='rokuro'){
   const zashiki=id==='zashiki',cloth=zashiki?0xd55488:0xd7c329,band=zashiki?0x78316c:0x953936;
   if(zashiki){put(new THREE.CylinderGeometry(.29,.38,.84,28),cloth,'body',root,[0,.8,0],[1,1,.77]);for(const sx of [-1,1]){const leg=group(`kimono-leg-${sx}`,[sx*.15,.46,0]);legs.push(leg);limb([0,0,0],[0,-.35,.035],.072,.052,skin,'fixed',leg);shoe(leg,0,-.36,.06,0x492627);ball([0,-.32,.07],[.085,.05,.15],skin,'fixed',leg);line([[-.08,-.29,.16],[0,-.28,.075],[.08,-.29,.15]],.025,0x592c2d,leg);}}
   else{ball([0,.21,.12],[.57,.21,.42],cloth);put(new THREE.CylinderGeometry(.23,.38,.75,24),cloth,'body',root,[0,.59,0],[1,1,.78]);box([0,.59,-.27],[.65,.45,.19],band,'deco');}
   const cy=zashiki?1.12:.83;
   shape([[-.22,cy+.19],[-.13,cy+.27],[.08,cy],[.025,cy-.09]],.018,0xd3dbd6,'fixed',root,.25);
   shape([[.22,cy+.2],[.31,cy+.12],[-.09,cy-.29],[-.15,cy-.22]],.02,0xe7e4dc,'fixed',root,.27);
   put(new THREE.CylinderGeometry(zashiki?.335:.31,zashiki?.35:.34,.28,28),band,'deco',root,[0,zashiki?.78:.56,.008],[1,1,.85]);
   if(zashiki){for(const y of [.74,.8])tube([[-.32,y,.12],[-.24,y,.275],[0,y-.012,.307],[.24,y,.275],[.32,y,.12]],.025,0xf9de79,'deco');for(const x of [-.035,.015,.055])put(new THREE.TorusGeometry(.034,.015,6,16),0xf9de79,'deco',root,[x,.772,.337],[.6,1,1]);}
   for(const sx of [-1,1]){const arm=group(`kimono-sleeve-${sx}`,[sx*.26,cy+.1,0]);arms.push(arm);shape([[0,0],[sx*.27,-.07],[sx*.34,-.62],[sx*.04,-.66],[-sx*.09,-.17]],.24,cloth,'body',arm,-.08,.04);ball([sx*.26,-.1,.01],[.12,.056,.075],skin,'fixed',arm);if(!zashiki){arm.rotation.z=sx*.3;ball([sx*.04,-.37,.24],[.145,.048,.08],0xf1cbd0,'fixed',arm);}}
   if(zashiki){head=group('zashiki-smiling-head',[0,1.66,.02]);ball([0,.035,-.08],[.48,.49,.32],hair,'deco',head);ball([0,-.025,.06],[.38,.34,.25],skin,'fixed',head);for(const sx of [-1,1]){tube([[sx*.11,.04,.305],[sx*.2,.09,.293],[sx*.29,.04,.256]],.024,ink,'eye',head);ball([sx*.26,-.11,.252],[.09,.076,.018],0xee9998,'fixed',head);for(let j=0;j<3;j++)hairLock(`zashiki-lock-${sx}-${j}`,[sx*(.33+j*.055),.2,-.025-j*.07],[[0,0,0],[sx*.06,-.45,0],[sx*(.04+j*.04),-.94,-.01],[sx*.08,-1.12,0]],.105,hair,head);}
    for(const sx of [-1,1])shape([[sx*.32,.25],[sx*.46,.12],[sx*.5,-.55],[sx*.62,-.91],[sx*.36,-1.01],[sx*.3,-.91]],.09,hair,'deco',head,-.1,.03);
    for(let j=0;j<5;j++)shape([[-.34+j*.14,.31],[-.17+j*.14,.33],[-.18+j*.14,.13],[-.32+j*.14,.13]],.05,hair,'deco',head,.257);
    line([[-.1,-.215,.275],[0,-.235,.3],[.09,-.212,.28]],.009,ink,head);b.strand([[0,.44,0],[-.075,.56,0],[.005,.69,0]],.055,hair,head);
   }else{
    // 首のS字全体を一つの親にし、頭も一緒に揺らす。
    neck=group('rokuro-s-neck',[0,.98,0]);tube([[0,0,0],[-.09,.28,.02],[.14,.67,0],[.47,1.06,-.015],[.55,1.39,0],[.31,1.57,.005],[-.19,1.49,.02]],.105,0xe8bccb,'fixed',neck);
    head=group('rokuro-head',[-.36,1.44,.045]);neck.add(head);ball([0,.06,-.055],[.37,.43,.25],0x70442e,'deco',head);ball([0,-.025,.03],[.31,.32,.23],0xf4d3d0,'fixed',head);ball([.06,.43,-.055],[.19,.16,.17],0x70442e,'deco',head);
    for(const sx of [-1,1]){eye(sx*.14,.015,.247,head,1.12);line([[sx*.075,.19,.23],[sx*.2,.16,.225],[sx*.26,.21,.2]],.012,ink,head);hairLock(`rokuro-side-${sx}`,[sx*.275,.2,.13],[[0,0,0],[sx*.02,-.3,0],[sx*.015,-.63,.005]],.037,0x70442e,head);shape([[sx*.02,.38],[sx*.24,.34],[sx*.34,.14],[sx*.27,-.01],[sx*.19,.18],[sx*.07,.3]],.045,0x70442e,'deco',head,.22);}
    line([[-.09,-.205,.234],[0,-.24,.265],[.09,-.205,.234]],.012,ink,head);ball([0,-.286,.258],[.06,.095,.029],0xe32e61,'deco',head);line([[0,-.24,.29],[0,-.3,.29]],.007,ink,head);
   }
 }
 if(id==='oni'){
  const red=0xd83b26,dark=0x74221a,green=0x165847,gold=0xd8b837;
  ball([0,1.14,0],[.46,.61,.27],red);for(const sx of [-1,1]){ball([sx*.245,1.52,.08],[.27,.26,.23],red);ball([sx*.18,1.25,.22],[.18,.14,.1],red);ball([sx*.15,1.06,.23],[.15,.13,.09],red);ball([sx*.13,.88,.22],[.13,.12,.07],red);line([[sx*.06,1.37,.295],[sx*.2,1.33,.307],[sx*.32,1.39,.247]],.01,dark);const leg=group(`oni-leg-${sx}`,[sx*.28,.73,0]);legs.push(leg);limb([0,0,0],[sx*.13,-.32,.055],.19,.15,red,'body',leg);limb([sx*.13,-.32,.055],[sx*.08,-.63,.12],.15,.09,red,'body',leg);ball([sx*.07,-.67,.19],[.18,.1,.24],red,'body',leg);for(let j=-1;j<=1;j++)put(new THREE.ConeGeometry(.037,.15,8),0xf4e9c4,'fixed',leg,[sx*.07+j*.08,-.68,.395],[1,1,1],[Math.PI/2,0,0]);
   const arm=group(`oni-arm-${sx}`,[sx*.43,1.62,0]);arms.push(arm);limb([0,0,0],[sx*.19,-.34,.065],.21,.17,red,'body',arm);limb([sx*.19,-.34,.065],[sx*.12,-.67,.24],.16,.12,red,'body',arm);ball([sx*.12,-.72,.27],[.16,.12,.1],red,'body',arm);for(let j=0;j<4;j++)ball([sx*(.015+j*.065),-.75,.32],[.043,.07,.045],red,'body',arm);for(let j=0;j<3;j++)line([[sx*.08,-.13-j*.065,.17],[sx*.22,-.16-j*.065,.14]],.01,dark,arm);
  }
  // 虎柄の腰巻き。縞は肌とは別の固定色。
  put(new THREE.CylinderGeometry(.43,.49,.35,20),gold,'deco',root,[0,.72,.015],[1,1,.72]);for(let j=-4;j<=4;j++)shape([[j*.1-.035,.87],[j*.1+.04,.87],[j*.1+.015,.7],[j*.1+.06,.55],[j*.1-.025,.61]],.015,ink,'fixed',root,.345);
  head=group('oni-fanged-head',[0,1.98,.04]);ball([0,0,0],[.32,.34,.25],red,'body',head);
  for(const sx of [-1,1]){shape([[sx*.25,.08],[sx*.53,.18],[sx*.36,-.07]],.07,red,'body',head,.02);eye(sx*.12,.075,.228,head,.72);line([[sx*.045,.145,.24],[sx*.17,.17,.235],[sx*.24,.11,.2]],.038,dark,head);limb([sx*.17,.25,-.035],[sx*.23,.48,0],.08,.045,gold,'deco',head);put(new THREE.ConeGeometry(.048,.25,10),gold,'deco',head,[sx*.27,.58,.02],[1,1,1],[0,0,-sx*.3]);for(let j=0;j<3;j++)line([[sx*(.185+j*.017),.34+j*.08,.062],[sx*(.245+j*.015),.32+j*.08,.055]],.009,dark,head);}
  ball([0,-.125,.237],[.205,.105,.045],0x33171c,'fixed',head);for(const sx of [-1,1]){put(new THREE.ConeGeometry(.04,.14,8),0xf5e8b8,'fixed',head,[sx*.13,-.125,.292],[1,1,1],[0,0,Math.PI]);put(new THREE.ConeGeometry(.031,.1,8),0xf5e8b8,'fixed',head,[sx*.07,-.18,.29]);}ball([0,-.01,.265],[.075,.06,.075],red,'body',head);
  for(let j=0;j<23;j++){const a=j/23*Math.PI*2;b.strand([[Math.cos(a)*.23,Math.sin(a)*.25,-.09],[Math.cos(a)*.4,Math.sin(a)*.37,-.06],[Math.cos(a)*.49,Math.sin(a)*.42,-.07]],.045,0x152b27,head);}
  // 緑の肩衣を重ねた葉形の房で表す。
  for(const sx of [-1,1])for(let j=0;j<5;j++)shape([[sx*.05,1.79],[sx*(.28+j*.065),1.9-j*.04],[sx*(.52+j*.025),1.7-j*.07],[sx*.17,1.39+j*.025]],.07,j%2?green:0x237759,'deco',root,-.12+j*.035,.025);
  for(const sx of [-1,1]){shape([[sx*.11,1.8],[sx*.36,1.87],[sx*.56,1.7],[sx*.33,1.59],[sx*.17,1.68]],.06,green,'deco',root,.16,.025);line([[sx*.18,1.76,.24],[sx*.36,1.74,.245],[sx*.49,1.69,.24]],.014,0x0a332d);}
  for(let j=-3;j<=3;j++)b.strand([[j*.045,-.17,.2],[j*.07,-.29,.22],[j*.09,-.42,.14]],.035,green,head);
  club=group('oni-studded-club',[-.58,.93,.31]);arms[0].add(club);club.position.set(-.1,-.67,.27);club.rotation.z=.5;
  limb([0,.12,0],[0,-.3,0],.05,.055,0x355d72,'deco',club);put(new THREE.TorusGeometry(.095,.026,8,20),0x466d7b,'deco',club,[0,.21,0]);put(new THREE.CylinderGeometry(.105,.16,1.05,8),0x204762,'deco',club,[0,-.84,0]);
  for(let row=0;row<7;row++)for(let j=0;j<6;j++){const a=j*Math.PI/3,r=.116+row*.007;ball([Math.cos(a)*r,-.38-row*.14,Math.sin(a)*r],[.036,.043,.036],gold,'fixed',club);}
 }
 b.finish();
 // 人面犬の胴の前面に重複する仮球は作らない。壁越しも各キャラの輪郭を使う。
 owner.xray.clear();root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(owner.group.matrixWorld).invert();root.traverse(m=>{if(!m.isMesh)return;const x=new THREE.Mesh(m.geometry,owner.xrayMat);x.matrixAutoUpdate=false;x.matrix.multiplyMatrices(inverse,m.matrixWorld);owner.xray.add(x);});
 owner.classicRig={root,head,arms,legs,locks,neck,tail,club,update(t,moving,scare){const run=Math.min(1,Math.abs(moving)/6),beat=t*(id==='jinmenken'?10:7),s=scare;
  root.position.y=Math.abs(Math.sin(beat))*run*.035+s*Math.abs(Math.sin(t*13))*.09;root.rotation.z=s*Math.sin(t*13)*.035;
  legs.forEach((g,i)=>g.rotation.x=Math.sin(beat+(id==='jinmenken'?(i===0||i===3?0:Math.PI):i*Math.PI))*.48*run);
  arms.forEach((g,i)=>{g.rotation.x=Math.sin(beat+i*Math.PI)*run*.2-s*(id==='oni'?1.05:.65);g.rotation.z=(i?1:-1)*s*.23;});
  locks.forEach((g,i)=>{g.rotation.x=Math.sin(t*4+i*.4)*(.02+run*.13)+s*.12;g.rotation.z=Math.sin(t*3+i)*run*.05;});
  if(head){head.rotation.y=Math.sin(t*2)*.04+s*Math.sin(t*10)*.14;head.rotation.x=-s*.12;}
  if(tail)tail.rotation.z=Math.sin(t*7)*(.12+run*.35);
  if(neck){neck.rotation.z=Math.sin(t*2)*.045+run*Math.sin(t*4)*.06+s*Math.sin(t*9)*.16;neck.scale.y=1+s*.16;}
 }};
}
