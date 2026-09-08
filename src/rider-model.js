import * as THREE from "../lib/three.module.js";
import { modelBuilder } from "./character-models.js";

// 前は +Z。細いスポークと空いたフレームで、参考の古い単気筒バイクの輪郭を作る。
export function buildHeadlessRider(owner) {
  const b=modelBuilder(owner,"headless-rider"),{root,put,ball,box,tube,limb,group}=b;
  const metal=0x8d897e,steel=0x555851,dark=0x292925,rubber=0x252427,coat=owner.C.body;
  const wheels=[];
  const axle=(pos,radius,length,color,parent=root)=>put(new THREE.CylinderGeometry(radius,radius,length,16),color,"fixed",parent,pos,[1,1,1],[0,0,Math.PI/2]);
  const ring=(radius,width,color,parent,pos=[0,0,0])=>put(new THREE.TorusGeometry(radius,width,7,48),color,"fixed",parent,pos,[1,1,1],[0,Math.PI/2,0]);
  for(const z of [1.02,-.98]) {
    const w=group(z>0?"front-wheel":"rear-wheel",[0,.49,z]);wheels.push(w);
    ring(.405,.085,rubber,w);ring(.346,.021,metal,w,[.043,0,0]);ring(.346,.021,metal,w,[-.043,0,0]);
    axle([0,0,0],.105,.16,steel,w);axle([.093,0,0],.068,.026,metal,w);
    for(let j=0;j<32;j++) {
      const a=j/32*Math.PI*2;
      for(const sx of [-1,1])tube([[sx*.071,Math.cos(a+.27)*.07,Math.sin(a+.27)*.07],
        [sx*.046,Math.cos(a)*.345,Math.sin(a)*.345]],.0065,metal,"fixed",w);
    }
    // タイヤの横溝を接地面まで回し、側面からもゴムの厚みが読めるようにする。
    for(let j=0;j<44;j++) {
      const a=j/44*Math.PI*2;
      box([0,Math.cos(a)*.481,Math.sin(a)*.481],[.122,.022,.029],0x39383b,"fixed",w,[a,0,(j%2?1:-1)*.12]);
    }
  }
  // 前後の泥よけはタイヤ上の半円に沿わせる。
  for(const z of [1.02,-.98])for(const sx of [-1,1]) {
    const points=[];for(let j=0;j<=14;j++){const a=-.98+j/14*2.12;points.push([sx*.065,.49+Math.cos(a)*.535,z+Math.sin(a)*.535]);}
    tube(points,.041,0x675e4e,"deco");
  }
  for(const sx of [-1,1]) {
    const x=sx*.135;
    tube([[x,.49,1.02],[x,1.25,.72]],.036,metal,"fixed");
    tube([[x,.79,.91],[x,1.25,.72]],.044,0x837252,"deco");
    tube([[x,1.25,.72],[x,1.27,.44],[x,.51,-.28],[x,.49,-.98]],.031,steel,"fixed");
    tube([[x,1.25,.62],[x,.44,.42],[x,.34,-.29],[x,.86,-.58],[x,1.14,.11]],.033,steel,"fixed");
    tube([[x,.49,-.98],[x,.91,-.59]],.037,metal,"fixed");
    // 後ろのサスペンション。細い金属のらせんを重ねる。
    const spring=[];for(let j=0;j<=80;j++){const u=j/80,a=u*Math.PI*16;spring.push([x+Math.cos(a)*.038,.58+u*.3,-.87+u*.2+Math.sin(a)*.038]);}
    tube(spring,.009,metal,"fixed");
  }
  // タンク、独立した革サドル、小さい後部荷台。
  ball([0,1.12,.28],[.225,.2,.42],0x4e493e,"deco");
  box([0,1.03,.25],[.36,.11,.58],0x4e493e,"deco");
  put(new THREE.CylinderGeometry(.055,.055,.019,16),metal,"fixed",root,[0,1.318,.26]);
  ball([0,1.13,-.38],[.265,.07,.29],0x382d27,"fixed");
  for(const sx of [-1,1])tube([[sx*.19,1.05,-.59],[sx*.19,1.01,-1.12]],.017,metal,"fixed");
  for(let j=0;j<4;j++)tube([[-.19,1.015,-.7-j*.12],[.19,1.015,-.7-j*.12]],.014,metal,"fixed");
  // クランクケース、冷却フィン、キャブレターと曲がった排気管。
  ball([0,.55,.06],[.19,.22,.27],metal,"fixed");
  axle([-.197,.56,.06],.14,.024,0x6a6b64);axle([.197,.56,.06],.125,.024,0x6a6b64);
  for(let j=0;j<8;j++)box([0,.71+j*.031,.16],[.34,.016,.28],j%2?metal:steel,"fixed");
  box([0,.983,.16],[.28,.058,.23],metal,"fixed");
  ball([0,.81,-.13],[.11,.075,.11],steel,"fixed");
  tube([[.12,.92,.31],[.22,.86,.44],[.255,.48,.37],[.255,.26,-.05],[.255,.25,-.76]],.038,0x8b806a,"fixed");
  tube([[.255,.25,-.36],[.255,.25,-1.13]],.064,metal,"fixed");
  axle([-.14,.49,-.98],.145,.025,0x756955);
  tube([[-.165,.61,-.98],[-.165,.68,-.15],[-.165,.46,-.12],[-.165,.36,-.98],[-.165,.61,-.98]],.018,0x4a4235,"fixed");
  for(const sx of [-1,1])tube([[0,.44,-.24],[sx*.36,.44,-.24]],.031,dark,"fixed");
  // 大きな丸型ヘッドライト。首がないため「目の色」はこの灯りに使う。
  put(new THREE.CylinderGeometry(.15,.15,.16,24),steel,"fixed",root,[0,1.26,.86],[1,1,1],[Math.PI/2,0,0]);
  put(new THREE.TorusGeometry(.144,.019,6,32),metal,"fixed",root,[0,1.26,.952]);
  ball([0,1.26,.95],[.126,.126,.026],0xffe7a8,"eye");
  for(let j=-2;j<=2;j++)tube([[j*.039,1.16,.976],[j*.039,1.36,.976]],.004,0xc4b994,"fixed");
  tube([[-.39,1.51,.61],[-.22,1.51,.65],[-.14,1.38,.71],[.14,1.38,.71],[.22,1.51,.65],[.39,1.51,.61]],.021,metal,"fixed");
  for(const sx of [-1,1])tube([[sx*.27,1.51,.63],[sx*.42,1.51,.61]],.032,dark,"fixed");
  tube([[-.32,1.5,.65],[-.34,1.68,.77],[-.14,1.68,.81],[.08,1.1,.63],[.07,.93,.06]],.012,0x466f88,"deco");
  tube([[.32,1.5,.65],[.25,1.42,.85],[-.1,1.38,.85],[-.17,.91,.27]],.012,0xa84738,"deco");
  // 灰色の上下と茶色のブーツ。腰から前へ傾いた肩、握り込んだ手をハンドルへ。
  ball([0,1.37,-.3],[.26,.29,.25],coat,"body");
  put(new THREE.CylinderGeometry(.27,.23,.66,12),coat,"body",root,[0,1.705,-.12],[1,1,.85],[.58,0,0]);
  for(const sx of [-1,1]) {
    limb([sx*.17,1.25,-.35],[sx*.3,.99,.13],.14,.128,coat,"body");
    limb([sx*.3,.99,.13],[sx*.31,.51,-.19],.126,.086,coat,"body");
    ball([sx*.32,.45,-.12],[.095,.09,.2],0x4b382c,"fixed");
    limb([sx*.25,1.96,.025],[sx*.34,1.7,.34],.12,.1,coat,"body");
    limb([sx*.34,1.7,.34],[sx*.345,1.52,.62],.1,.07,coat,"body");
    ball([sx*.345,1.51,.62],[.085,.061,.065],0xb4a68d,"body");
    for(let j=0;j<4;j++)tube([[sx*(.30+j*.024),1.55,.66],[sx*(.30+j*.024),1.50,.68],[sx*(.30+j*.024),1.477,.64]],.012,0x736755,"fixed");
    tube([[sx*.29,1.76,.32],[sx*.36,1.74,.34]],.026,0xaf6341,"deco");
    box([sx*.18,1.84,.223],[.13,.12,.018],0x756b5d,"body");
    tube([[sx*.13,1.8,.24],[sx*.23,1.8,.215]],.01,0x4d483f,"fixed");
    for(let j=0;j<3;j++)tube([[sx*.28,.82-j*.065,.06-j*.04],[sx*.37,.81-j*.065,.06-j*.04]],.008,0x746a5b,"body");
  }
  for(let j=0;j<4;j++)ball([0,1.88-j*.1,.26-j*.045],[.016,.016,.012],0x5c584d,"fixed");
  // 襟の中は暗い空洞。顔や首を置かず、開いた襟そのものを見せる。
  put(new THREE.CylinderGeometry(.11,.11,.035,20),dark,"fixed",root,[0,2.063,.11]);
  put(new THREE.TorusGeometry(.12,.028,6,24),coat,"body",root,[0,2.078,.11],[1,1,1],[Math.PI/2,0,0]);
  for(const sx of [-1,1])box([sx*.095,2.03,.205],[.065,.14,.025],0xb1a18b,"body",root,[.5,0,sx*.3]);
  b.finish();

  // 肩から後輪の後ろへ続く一枚布。両面を描き、裾ほど大きく波打たせる。
  const rows=24,cols=16,positions=[],indices=[];
  for(let v=0;v<=rows;v++)for(let u=0;u<=cols;u++)positions.push(0,0,0);
  for(let v=0;v<rows;v++)for(let u=0;u<cols;u++){const a=v*(cols+1)+u;indices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);
  const mat=new THREE.MeshLambertMaterial({color:0x7e7366,emissive:0x7e7366,emissiveIntensity:.12,side:THREE.DoubleSide,transparent:true});
  const cape=new THREE.Mesh(geo,mat);cape.name='rider-flowing-cape';cape.userData.part='deco';root.add(cape);owner.extras.push(cape);
  let lastTime=null,spin=0;
  owner.riderRig={root,wheels,cape,update(t,moving,scare){
    const run=Math.min(1,moving/6),dt=lastTime===null?0:Math.max(0,Math.min(.1,t-lastTime));lastTime=t;
    spin+=dt*moving/.49;for(const w of wheels)w.rotation.x=spin;
    root.rotation.z=Math.sin(t*2.1)*run*.025;root.position.y=Math.sin(t*13)*run*.012;
    const a=geo.attributes.position;
    for(let v=0;v<=rows;v++)for(let u=0;u<=cols;u++){
      const f=v/rows,q=u/cols*2-1,edge=Math.abs(q),fold=Math.sin(q*12+f*5-t*(3+run*5));
      const width=.27+Math.sin(f*Math.PI*.78)*.48;
      const x=q*width+Math.sin(t*2.7-f*5)*.1*f;
      const y=2.0-f*1.25+f*f*(.09+run*.2)+fold*.055*f+Math.sin(t*(4+run*4)-f*9+q*3)*f*f*(.09+run*.1)+scare*.16*f;
      const z=-.08-f*(1.78+run*.2)+Math.sin(q*8)*.05*f*f+edge*.12*f;
      a.setXYZ(v*(cols+1)+u,x,y,z);
    }
    a.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();
  }};
  owner.riderRig.update(0,0,0);
  // 壁越しの輪郭にも首を出さず、車輪と胴体の位置を使う。
  owner.xray.clear();
  for(const z of [1.02,-.98]){const m=new THREE.Mesh(new THREE.TorusGeometry(.405,.085,6,24),owner.xrayMat);m.rotation.y=Math.PI/2;m.position.set(0,.49,z);owner.xray.add(m);}
  const silhouette=new THREE.Mesh(new THREE.BoxGeometry(.48,.7,.4),owner.xrayMat);silhouette.position.set(0,1.73,-.08);owner.xray.add(silhouette);
}
