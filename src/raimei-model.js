import * as THREE from "../lib/three.module.js";
import { modelBuilder } from "./character-models.js";

// 青い雷さま、七つの三つ巴太鼓、灰色の雲。画像の黄色い背景はモデルには付けない。
export function buildRaimei(owner) {
  const b=modelBuilder(owner,'raimei'),{root,put,ball,box,tube,limb,shape,group}=b;
  const blue=0x078fce,darkBlue=0x09649d,gold=0xf5df58,cloudColor=0xbcbcc9;
  const drums=[];
  for(const deg of [-135,-90,-45,0,45,90,135]){
    const a=deg*Math.PI/180,d=group(`raimei-drum-${deg}`,[Math.abs(deg)===135?Math.sign(deg)*.97:Math.sin(a)*1.26,Math.abs(deg)===135?1.18:1.67+Math.cos(a)*1.26,-.31]);drums.push(d);
    put(new THREE.CylinderGeometry(.204,.204,.14,24),0xae8443,'deco',d,[0,0,0],[1,1,1],[Math.PI/2,0,0]);
    put(new THREE.CircleGeometry(.2,32),0xf7dc55,'deco',d,[0,0,.075]);
    put(new THREE.TorusGeometry(.195,.011,6,28),0xe6ca4a,'deco',d,[0,0,.082]);
    for(let j=0;j<3;j++){
      const a=j*Math.PI*2/3,rot=([x,y])=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];
      const p=rot([0,.09]);put(new THREE.CircleGeometry(.052,24),0x55463c,'fixed',d,[p[0],p[1],.104]);
      shape([[-.024,.129],[-.065,.145],[-.102,.113],[-.131,.066],[-.137,.005],[-.114,.042],[-.086,.064],[-.039,.056]].map(rot),.012,0x55463c,'fixed',d,.088,.002);
    }
  }
  // 虎柄の腰布は雲の上から少しのぞかせる。
  ball([0,1.3,0],[.43,.27,.25],gold,'deco');
  for(let j=0;j<7;j++)shape([[-.4+j*.115,1.42],[-.29+j*.115,1.39],[-.35+j*.115,1.33],[-.25+j*.115,1.28],[-.39+j*.115,1.31]],.018,0x473b32,'fixed',root,.235,.002);
  ball([0,1.78,.015],[.58,.48,.32],blue);
  ball([0,2.14,.045],[.65,.48,.32],blue);
  ball([0,1.63,.13],[.5,.29,.28],blue);
  // 大きな赤い口と四本の白い牙。
  ball([0,1.884,.362],[.408,.194,.064],0xb71f32,'fixed');

  ball([0,1.746,.395],[.24,.075,.021],0xec5054,'fixed');
  for(const sx of [-1,1]){
    shape([[sx*.17,1.991],[sx*.255,2.012],[sx*.23,1.87],[sx*.195,1.91]],.027,0xfffbea,'fixed',root,.39,.006);
    shape([[sx*.25,1.73],[sx*.315,1.758],[sx*.278,1.854],[sx*.253,1.82]],.027,0xfffbea,'fixed',root,.39,.006);
    ball([sx*.145,2.15,.351],[.057,.06,.025],0x173d59,'eye');
    tube([[sx*.06,2.09,.38],[sx*.105,2.043,.386],[sx*.21,2.055,.365]],.018,darkBlue,'fixed');
    // 金色の跳ね上がった眉。
    shape([[sx*.057,2.19],[sx*.11,2.315],[sx*.24,2.346],[sx*.345,2.32],[sx*.369,2.27],[sx*.24,2.29],[sx*.14,2.26]],.026,gold,'deco',root,.3,.01);
    tube([[sx*.092,2.227,.338],[sx*.18,2.308,.325],[sx*.312,2.3,.315]],.012,0xfff399,'deco');
    tube([[sx*.52,2.065,.266],[sx*.545,2.16,.234],[sx*.492,2.22,.259],[sx*.457,2.17,.282],[sx*.484,2.11,.278],[sx*.451,2.051,.29]],.017,darkBlue,'fixed');
    tube([[sx*.275,1.43,.34],[sx*.25,1.54,.382]],.013,darkBlue,'fixed');
  }
  tube([[-.16,1.665,.411],[0,1.683,.429],[.16,1.665,.411]],.014,darkBlue,'fixed');
  // 金髪は三つの渦と、左右へ張った房。
  ball([0,2.52,-.01],[.55,.27,.3],gold,'deco');
  for(const sx of [-1,1])shape([[sx*.1,2.67],[sx*.37,2.74],[sx*.46,2.65],[sx*.61,2.4],[sx*.41,2.41]],.2,gold,'deco',root,-.065,.04);
  for(const x of [-.23,0,.23]){
    ball([x,2.47,.298],[.135,.13,.042],0xffec79,'deco');
    const ps=[];for(let j=0;j<=38;j++){const a=j/38*Math.PI*4,r=.097*(1-j/43);ps.push([x+Math.cos(a)*r,2.47+Math.sin(a)*r,.35]);}tube(ps,.014,0xd8bd36,'deco');
  }
  put(new THREE.ConeGeometry(.12,.23,4),0xdacda9,'deco',root,[0,2.785,-.015]);
  for(const y of [2.72,2.785])box([0,y,.086],[.18,.027,.025],0xb5a98b,'fixed');
  // 両手で木のばちを持つ。威嚇のときは腕ごと動かす。
  const arms=[];
  for(const sx of [-1,1]){
    const g=group(`raimei-arm-${sx}`,[sx*.5,1.99,0]);arms.push(g);
    limb([0,0,0],[sx*.24,-.37,.05],.15,.135,blue,'body',g);
    limb([sx*.24,-.37,.05],[sx*.045,-.62,.29],.13,.11,blue,'body',g);
    limb([sx*.02,-.74,.22],[sx*.36,.02,.12],.073,.12,0xc6a669,'deco',g);
    tube([[sx*.13,-.51,.31],[sx*.31,-.02,.218]],.013,0x9b7c42,'fixed',g);
    ball([sx*.04,-.57,.337],[.125,.11,.08],blue,'body',g);
    for(let j=0;j<3;j++)tube([[sx*(-.019+j*.052),-.53,.409],[sx*(.011+j*.052),-.563,.419]],.011,darkBlue,'fixed',g);
  }
  // 雷雲の左右は上へ跳ねた角のような輪郭。前面の柔らかい渦線も再現する。
  const cloud=group('raimei-thundercloud',[0,.7,.16]);
  ball([0,0,0],[1.05,.49,.4],cloudColor,'deco',cloud);
  for(const [x,y,s] of [[-.68,.19,.34],[.65,.21,.34],[-.48,-.27,.3],[.42,-.31,.3],[0,-.35,.3]])ball([x,y,.015],[s,s*.77,.32],cloudColor,'deco',cloud);
  for(const sx of [-1,1])shape([[sx*.69,.21],[sx*1.14,.16],[sx*1.36,.39],[sx*1.52,.97],[sx*1.51,-.31],[sx*1.23,-.47],[sx*.87,-.27]],.17,cloudColor,'deco',cloud,-.035,.035);
  for(const sx of [-1,1]){
    tube([[sx*.3,.17,.382],[sx*.44,.23,.376],[sx*.63,.18,.353],[sx*.69,.06,.341]],.029,0x9e9faf,'fixed',cloud);
    tube([[sx*.93,-.13,.256],[sx*.88,-.29,.289],[sx*.67,-.35,.331],[sx*.51,-.33,.36],[sx*.37,-.41,.332]],.028,0x9e9faf,'fixed',cloud);
  }
  tube([[-.21,-.13,.421],[-.12,-.055,.443],[0,-.067,.448],[.1,-.071,.438],[.2,-.145,.415]],.028,0x9e9faf,'fixed',cloud);
  b.finish();
  owner.xray.clear();for(const [p,s] of [[[0,.7,.16],[1.12,.49,.4]],[[0,2.03,.045],[.6,.6,.32]]]){const m=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),owner.xrayMat);m.position.set(...p);m.scale.set(...s);owner.xray.add(m);}
  owner.raimeiRig={root,cloud,arms,drums,update(t,moving,scare){
    const run=Math.min(1,moving/6);root.position.y=Math.sin(t*2)*.065+run*.08;
    cloud.rotation.z=Math.sin(t*1.5)*.023;cloud.scale.setScalar(1+scare*.065);
    arms.forEach((a,i)=>{a.rotation.x=Math.sin(t*(scare?13:2.2)+i*Math.PI)*(.02+scare*.3)-scare*.55;a.rotation.z=(i?1:-1)*run*.06;});
    drums.forEach((d,i)=>d.rotation.z=Math.sin(t*1.4+i)*.045+scare*Math.sin(t*18+i)*.07);
  }};
}
