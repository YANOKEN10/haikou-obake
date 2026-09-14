import * as THREE from "../lib/three.module.js";

// 参考画像の輪郭を立体で作る。色と動く部位ごとにまとめて、細部を増やしても描画回数を抑える。
export function modelBuilder(owner, name) {
  const root = new THREE.Group(); root.name = name; owner.group.add(root);
  const batches = new Map();
  function put(geometry, color, part, parent = root, pos = [0,0,0], scale = [1,1,1], rotation = [0,0,0]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix); geometry.dispose();
    const key = `${parent.uuid}:${color}:${part}`;
    if (!batches.has(key)) batches.set(key, { parent, color, part, list: [] });
    batches.get(key).list.push(g);
  }
  const ball = (pos, scale, color, part = "body", parent = root) => put(new THREE.SphereGeometry(1,16,12),color,part,parent,pos,scale);
  const box = (pos, scale, color, part = "body", parent = root, rotation = [0,0,0]) => put(new THREE.BoxGeometry(...scale),color,part,parent,pos,[1,1,1],rotation);
  function tube(points, radius, color, part = "body", parent = root) {
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),
      Math.max(8,points.length*5),radius,6,false),color,part,parent);
  }
  function limb(a,b,r1,r2,color,part="body",parent=root) {
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),mid=va.clone().add(vb).multiplyScalar(.5);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vb.clone().sub(va).normalize());
    const e=new THREE.Euler().setFromQuaternion(q);
    put(new THREE.CylinderGeometry(r2,r1,va.distanceTo(vb),12),color,part,parent,mid.toArray(),[1,1,1],e.toArray().slice(0,3));
    ball(a,[r1,r1,r1],color,part,parent); ball(b,[r2,r2,r2],color,part,parent);
  }
  function shape(points, depth, color, part="deco",parent=root,z=0,bevel=.015) {
    const s = new THREE.Shape(); s.moveTo(...points[0]); for(const p of points.slice(1)) s.lineTo(...p); s.closePath();
    put(new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1}),color,part,parent,[0,0,z]);
  }
  function group(name,pos=[0,0,0]) {const g=new THREE.Group();g.name=name;g.position.set(...pos);root.add(g);return g;}
  function strand(points, width, color, parent = root) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const segments=16,radial=5,frames=curve.computeFrenetFrames(segments,false),pos=[],norm=[],idx=[];
    for(let i=0;i<=segments;i++) {
      const t=i/segments,c=curve.getPointAt(t),radius=width*Math.pow(1-t,0.65)+.002;
      for(let j=0;j<radial;j++) {
        const a=j/radial*Math.PI*2,n=frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));
        pos.push(c.x+n.x*radius,c.y+n.y*radius,c.z+n.z*radius);norm.push(n.x,n.y,n.z);
        if(i<segments){const a=i*radial+j,b=i*radial+(j+1)%radial;idx.push(a,b,a+radial,b,b+radial,a+radial);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("normal",new THREE.Float32BufferAttribute(norm,3));g.setIndex(idx);
    put(g,color,"deco",parent);
  }
  function finish() {
    for(const {parent,color,part,list} of batches.values()) {
      const g=new THREE.BufferGeometry();
      for(const attr of ["position","normal"]) {
        const n=list.reduce((s,b)=>s+b.attributes[attr].array.length,0),a=new Float32Array(n);let at=0;
        for(const b of list){a.set(b.attributes[attr].array,at);at+=b.attributes[attr].array.length;}
        g.setAttribute(attr,new THREE.BufferAttribute(a,3));
      }
      g.computeBoundingSphere();
      const mat=new THREE.MeshLambertMaterial({color,emissive:color,emissiveIntensity:.12,transparent:true});
      const mesh=new THREE.Mesh(g,mat);mesh.userData.part=part;mesh.name=`${name}-${part}`;parent.add(mesh);owner.extras.push(mesh);
      for(const b of list)b.dispose();
    }
    return root;
  }
  return {root,put,ball,box,tube,limb,shape,group,strand,finish};
}

export function buildTekeke(owner) {
  const b=modelBuilder(owner,"tekeke-model"),{ball,box,tube,limb,shape,group}=b;
  const skin=0xe5a33b,light=0xf1c450,shadow=0xb65e2c,hair=0x893d70,darkHair=0x552442;
  // 丸いお腹、胸、首。腰は切断せず、参考のように両脚を前で折り曲げる。
  ball([0,1.02,0],[.48,.65,.3],skin);
  ball([0,.96,.12],[.49,.42,.34],light);
  ball([0,1.33,.055],[.42,.24,.26],skin);
  tube([[-.23,1.33,.293],[0,1.3,.317],[.23,1.33,.293]],.007,shadow);
  tube([[0,.76,.486],[.045,.8,.48],[.075,.75,.47]],.018,shadow);
  ball([0,1.56,-.025],[.3,.3,.28],skin);
  for(const s of [-1,1]) {
    limb([s*.23,.52,0],[s*.6,.36,.03],.24,.23,skin);
    limb([s*.6,.36,.03],[s*.18,.28,.22],.23,.14,skin);
    limb([s*.18,.28,.22],[s*.15,.045,.32],.14,.105,light);
    ball([s*.14,.0,.37],[.105,.18,.14],skin);
    for(let j=0;j<3;j++)ball([s*.14+(j-1)*.055,-.09,.46],[.028,.065,.042],light);
    tube([[s*.37,.56,.2],[s*.53,.5,.23],[s*.65,.35,.22]],.012,shadow);
  }
  // 額が広く、頬と鼻が張り出した顔。大きな黒い笑い口を黄金色の唇で囲む。
  ball([0,1.92,.025],[.51,.59,.35],skin);
  ball([0,2.13,.09],[.4,.37,.3],skin);
  ball([0,1.69,.2],[.4,.22,.2],light);
  ball([0,1.77,.421],[.365,.16,.045],0x402014,"fixed");
  tube([[-.37,1.84,.4],[-.24,1.69,.452],[0,1.65,.466],[.24,1.7,.452],[.37,1.84,.4]],.041,light);
  tube([[-.36,1.86,.41],[-.21,1.84,.485],[0,1.84,.49],[.22,1.85,.47],[.37,1.89,.39]],.047,light);
  for(let j=0;j<11;j++){
    const x=(j-5)*.051,y=1.8+.028*Math.pow(x/.28,2);
    box([x,y,.47],[.041,.041,.022],j%3?0xcdb365:0xe5ce86,"fixed",b.root,[0,0,x*.24]);
    box([x*.93,1.715+.025*Math.pow(x/.28,2),.463],[.037,.026,.02],0xa78b49,"fixed");
  }
  ball([0,1.94,.343],[.29,.095,.19],light);
  for(const s of [-1,1]) {
    ball([s*.18,2.025,.34],[.14,.1,.086],light);
    ball([s*.17,2.005,.413],[.09,.056,.03],0xffefb1,"fixed");
    ball([s*.16,1.99,.445],[.043,.043,.019],0x36241f,"eye");
    ball([s*.15,2.012,.461],[.013,.016,.008],0xfff7df,"fixed");
    tube([[s*.075,2.04,.43],[s*.15,2.09,.424],[s*.25,2.055,.388]],.025,shadow);
    tube([[s*.09,2.11,.36],[s*.19,2.16,.372],[s*.29,2.1,.33]],.03,light);
    ball([s*.48,1.98,.025],[.095,.15,.085],skin);
    tube([[s*.36,2.04,.27],[s*.41,1.94,.32],[s*.34,1.88,.405]],.013,shadow);
    tube([[s*.34,1.78,.39],[s*.31,1.72,.4],[s*.22,1.68,.42]],.011,shadow);
  }
  for(let j=0;j<4;j++)tube([[-.27+j*.025,2.23+j*.045,.324],[0,2.19+j*.045,.382],[.27-j*.025,2.23+j*.045,.324]],.006,shadow);
  // 紫の長い髪。前額を残し、こめかみから肩へ波打つ毛束を下ろす。
  ball([0,2.21,-.105],[.52,.39,.31],darkHair,"deco");
  for(let j=0;j<17;j++) {
    const a=Math.PI*(.06+j*.055),x=Math.cos(a)*.48;
    tube([[x*.8,2.5,-.13],[x,2.42,.04],[x*1.12,2.14,.035],[x*1.08,1.77,-.13],[x*1.03,1.51,-.2]],
      .035+(j%3)*.009,j%3?hair:darkHair,"deco");
  }
  // 長い腕、五本の指が見える大きな手。肩を軸に動かす。
  const arms=[];
  for(const s of [-1,1]) {
    const arm=group(`tekeke-arm-${s}`,[s*.48,1.58,-.08]);arms.push(arm);
    limb([0,0,0],[s*.38,-.42,.02],.24,.19,skin,"body",arm);
    limb([s*.38,-.42,.02],[s*.68,-.12,.27],.19,.145,skin,"body",arm);
    ball([s*.77,.015,.31],[.18,.25,.105],light,"body",arm);
    for(let j=0;j<4;j++) {
      const x=s*(.7+j*.07),endX=s*(.72+j*.12),y=.2-(j===3?.06:0);
      limb([x,y,.32],[endX,y+.24-(j===0?.04:0),.32],.052,.038,light,"body",arm);
      tube([[x,y+.08,.372],[x+s*.035,y+.1,.37]],.007,shadow,"body",arm);
    }
    limb([s*.64,.015,.32],[s*.5,.16,.32],.067,.045,skin,"body",arm);
    tube([[s*.69,-.06,.414],[s*.74,.02,.42],[s*.8,.09,.414]],.008,shadow,"body",arm);
    for(let j=0;j<3;j++)tube([[s*(.34+j*.036),-.33+j*.035,.185],[s*(.44+j*.035),-.27+j*.036,.2]],.009,shadow,"body",arm);
  }
  // 背中の小さな骸骨と鎌。参考にある見分けの目印を残す。
  ball([-.27,2.56,-.31],[.135,.15,.11],0xe3c664,"deco");
  for(const s of [-1,1])ball([-.27+s*.044,2.58,-.206],[.03,.043,.014],0x4e3321,"fixed");
  box([-.27,2.465,-.23],[.13,.06,.05],0xd6b24e,"deco");
  limb([-.36,2.34,-.33],[-.7,2.34,-.31],.044,.035,0xe3c664,"deco");
  limb([-.7,2.34,-.31],[-.87,2.61,-.3],.034,.025,0xe3c664,"deco");
  limb([.2,1.38,-.32],[.76,2.7,-.31],.046,.055,0x9b6739,"deco");
  shape([[.73,2.62],[.98,2.58],[1.2,2.44],[1.35,2.25],[1.43,1.99],[1.26,2.2],[1.1,2.36],[.91,2.44],[.68,2.48]],.055,0xcad29b,"deco",b.root,-.31);
  tube([[-.47,1.6,.13],[-.55,1.84,.12],[-.47,2.15,-.09]],.025,0xd8c39f,"deco");
  owner.tekekeRig={root:b.finish(),arms};
}

export function buildYukionna(owner) {
  const b=modelBuilder(owner,"yukionna-model"),{ball,box,tube,shape,group}=b;
  const ink=0x793035,skin=0xfff1dc,hair=0xa8cce5,hairShade=0x9694cf,cyan=0x65dbe6,white=0xfffafb;
  // 丸い顔と長い水色の髪。顔の後ろの髪は幅広い一枚のシルエットにする。
  shape([[-.64,.11],[-.69,1.67],[-.61,2.32],[-.36,2.62],[0,2.66],[.36,2.62],[.61,2.32],[.69,1.67],[.64,.11]],.15,hairShade,"deco",b.root,-.24,.045);
  ball([0,1.98,.01],[.57,.49,.245],skin,"body");
  // 頭頂の髪と、先のそろった前髪。
  ball([0,2.33,-.04],[.62,.38,.265],hair,"deco");
  for(const [x,w,y] of [[-.35,.2,2.19],[-.12,.21,2.17],[.1,.21,2.21],[.33,.19,2.19]]) {
    shape([[x-w/2+.025,2.56],[x+w/2-.04,2.54],[x+w/2+.005,2.4],
      [x+w/2+.025,y+.015],[x+.01,y-.012],[x-w/2-.025,y-.008],[x-w/2-.03,2.34]],.045,hair,"deco",b.root,.23,.015);
    tube([[x-w/2,2.46,.3],[x-w/2-.025,y-.012,.3],[x+w/2+.025,y,.3]],.012,ink,"fixed");
  }
  for(const s of [-1,1]) {
    ball([s*.23,1.96,.245],[.075,.115,.033],ink,"eye");
    ball([s*.375,1.87,.205],[.078,.043,.023],0xf5a5ba,"fixed");
    ball([s*.115,2.115,.259],[.049,.029,.016],cyan,"deco");
    tube([[s*.52,2.31,.01],[s*.7,2.21,.035],[s*.84,2.24,.035]],.044,hair,"deco");
  }
  tube([[-.064,1.806,.244],[0,1.789,.253],[.064,1.806,.244]],.012,ink,"fixed");
  // 白い着物の打ち合わせ、淡い藤色の裾、足袋と草履。
  shape([[-.28,1.65],[-.43,1.35],[-.48,.2],[-.29,.08],[.27,.1],[.49,.22],[.4,1.35],[.26,1.65]],.29,white,"body",b.root,-.075,.05);
  shape([[-.43,.24],[-.29,.15],[.22,.16],[.46,.3],[.48,.2],[.27,.08],[-.29,.06],[-.49,.18]],.028,0xe1baec,"deco",b.root,.24,.01);
  shape([[-.26,1.69],[-.08,1.76],[.13,1.7],[.13,1.6],[.0,1.47]],.05,skin,"body",b.root,.2,.01);
  tube([[-.29,1.64,.284],[-.09,1.35,.29],[.26,.16,.29]],.013,ink,"fixed");
  tube([[.26,1.65,.295],[.05,1.4,.3],[-.31,.83,.3]],.016,ink,"fixed");
  tube([[-.15,1.71,.28],[-.07,1.51,.29],[0,1.43,.3]],.013,ink,"fixed");
  for(const s of [-1,1]) {
    ball([s*.16,.055,.04],[.12,.16,.13],skin,"body");
    ball([s*.16,-.025,.09],[.115,.055,.13],ink,"fixed");
    tube([[s*.16-.07,.005,.2],[s*.16,.035,.22],[s*.16+.07,.005,.2]],.019,white,"body");
  }
  // 垂れ下がる大きな袖。袖口の青い短冊模様まで立体化する。
  const sleeves=[];
  for(const s of [-1,1]) {
    const sleeve=group(`yuki-sleeve-${s}`,[s*.3,1.52,0]);sleeves.push(sleeve);
    const pts=[[0,0],[s*.63,-.2],[s*.57,-.68],[s*.33,-1.13],[s*.06,-.92]];
    shape(pts,.16,white,"body",sleeve,-.02,.03);
    tube([...pts,pts[0]].map(([x,y])=>[x,y,.175]),.014,ink,"fixed",sleeve);
    tube([[s*.52,-.38,.172],[s*.48,-.7,.172],[s*.33,-1.04,.172]],.023,0xe0b7ec,"deco",sleeve);
    for(let j=0;j<5;j++)box([s*(.555-j*.038),-.27-j*.155,.17],[.038,.097,.02],cyan,"deco",sleeve,[0,0,s*-.13]);
    ball([s*.59,-.215,.06],[.085,.045,.06],skin,"body",sleeve);
  }
  // 水色の帯、リボン、雪の結晶。
  box([0,1.035,.265],[.84,.28,.08],cyan,"deco");
  for(const y of [.90,1.035,1.17])tube([[-.41,y,.31],[0,y+.012,.334],[.41,y,.31]],.012,ink,"fixed");
  for(const y of [.866,1.204]) {
    const pts=[];for(let j=0;j<=18;j++)pts.push([-.4+j*.044,y+(j%2?.024:0),.3]);tube(pts,.011,ink,"fixed");
  }
  shape([[.18,1.02],[.02,1.13],[.03,.96]],.065,0x6aace5,"deco",b.root,.335,.02);
  shape([[.18,1.02],[.39,1.13],[.39,.96]],.065,0x6aace5,"deco",b.root,.335,.02);
  shape([[.14,1.02],[.09,.78],[.16,.75],[.21,1.02]],.045,cyan,"deco",b.root,.34,.01);
  shape([[.21,1.02],[.24,.78],[.32,.8],[.25,1.02]],.045,cyan,"deco",b.root,.34,.01);
  for(let j=0;j<6;j++) {
    const a=j*Math.PI/3,dx=Math.cos(a),dy=Math.sin(a);
    tube([[.2,1.04,.433],[.2+dx*.12,1.04+dy*.12,.433]],.017,0xa6ffff,"deco");
    for(const s of [-1,1])tube([[.2+dx*.085,1.04+dy*.085,.434],[.2+dx*.063-dy*s*.035,1.04+dy*.063+dx*s*.035,.434]],.011,0xa6ffff,"deco");
  }
  // 頬の横から裾まで伸びた二本の髪。青い髪留めと白い艶。
  const locks=[];
  for(const s of [-1,1]) {
    const lock=group(`yuki-lock-${s}`,[s*.48,2.24,.12]);locks.push(lock);
    shape([[-.08,.04],[.1,.07],[.15,-.38],[.22,-2.15],[.1,-2.18],[.05,-2.07],[-.01,-2.19],[-.16,-2.17],[-.11,-.43]].map(([x,y])=>[s*x,y]),.14,hair,"deco",lock,.03,.025);
    tube([[s*.1,.02,.185],[s*.15,-.38,.185],[s*.22,-2.15,.185]],.014,ink,"fixed",lock);
    shape([[s*.1,-.8],[s*.17,-1.94],[s*.095,-2.01],[s*.05,-.9]],.018,hairShade,"deco",lock,.18,.006);
    for(let j=0;j<3;j++)box([0,-.45-j*.087,.175],[.19,.073,.05],j===1?0x70b9ed:cyan,"deco",lock);
    for(const y of [-.9,-1.5])ball([s*.02,y,.209],[.044,.032,.009],0xcce8f0,"deco",lock);
  }
  // 左右の紫の人魂。白い背景や文字はモデルに含めない。
  const wisps=[];
  for(const s of [-1,1]) {
    const wisp=group(`yuki-wisp-${s}`,[s*.99,2.14+(s<0?.11:-.12),-.025]);wisps.push(wisp);
    ball([0,.12,0],[.13,.15,.08],0xba82d9,"deco",wisp);
    ball([s*.09,.14,0],[.1,.105,.07],0xba82d9,"deco",wisp);
    tube([[0,.12,0],[-s*.09,-.04,0],[s*.05,-.18,0],[-s*.04,-.31,0],[s*.08,-.37,0]],.048,0xa967cd,"deco",wisp);
  }
  owner.yukiRig={root:b.finish(),sleeves,locks,wisps};
}

export function animateReferenceCharacter(owner, t, moving, scare) {
  if(owner.unkoRig) owner.unkoRig.update(t,moving,scare);
  if(owner.raimeiRig) owner.raimeiRig.update(t,moving,scare);
  if(owner.kyubiRig) owner.kyubiRig.update(t,moving,scare);
  if(owner.amanoRig) owner.amanoRig.update(t,moving,scare);
  if(owner.riderRig) owner.riderRig.update(t,moving,scare);
  const run=Math.min(1,moving/6);
  if(owner.tekekeRig) {
    const rig=owner.tekekeRig,{root,arms}=rig;
    // 両手を高く開いてため、体と一緒に前へ突き出す。友だち側も同じ動きにする。
    if(scare>(rig.lastScare||0)+.2)rig.scareStart=t;
    rig.lastScare=scare;
    const phase=Math.max(0,Math.min(1,(t-(rig.scareStart??-10))/.75));
    const wind=phase<.32?Math.sin(Math.PI*phase/.32):0;
    const thrust=Math.sin(Math.PI*Math.max(0,Math.min(1,(phase-.18)/.82)));
    root.rotation.x=-.1*run+scare*(-wind*.22+thrust*.4);
    root.position.y=Math.abs(Math.sin(t*9))*run*.04+scare*(wind*.2+thrust*.12);
    root.position.z=scare*thrust*.55;
    arms.forEach((a,i)=>{
      const side=i?1:-1;
      a.rotation.x=Math.sin(t*(run?9:2.2)+i*Math.PI)*(.025+run*.24)*(1-scare)+scare*(-wind*1.15+thrust*.45);
      a.rotation.y=-side*scare*thrust*.85;
      a.rotation.z=side*(Math.sin(t*2+i)*.018+scare*(.3+wind*.7));
      a.position.z=-.08+scare*thrust*.25;
    });
  }
  if(owner.yukiRig) {
    const {locks,sleeves,wisps}=owner.yukiRig;
    locks.forEach((g,i)=>{g.rotation.x=Math.sin(t*2+i*.6)*.025+run*.14;g.rotation.z=Math.sin(t*1.7+i)*.018;});
    sleeves.forEach((g,i)=>g.rotation.z=(i?1:-1)*(Math.sin(t*1.8)*.025+run*.06+scare*.12));
    wisps.forEach((g,i)=>g.position.y=2.14+(i?-.12:.11)+Math.sin(t*2.3+i*2)*.08);
  }
}
