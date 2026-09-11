import * as THREE from "../lib/three.module.js";
import { modelBuilder } from "./character-models.js";

// 二枚の参考に共通する、低い頭・張った肩・くびれた腰・長い前腕から組み直す。
export function buildAmanojaku(owner) {
  const b=modelBuilder(owner,'amanojaku-rebuilt'),{root,put,box,tube,shape,group}=b;
  const skin=0x485453,shade=0x263234,light=0x63716c,ink=0x172125,red=0xa92128;
  const muscle=(p,s,c=skin,parent=root)=>put(new THREE.IcosahedronGeometry(1,2),c,'body',parent,p,s);
  function bone(a,z,r1,r2,c=skin,parent=root,part='body') {
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...z),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vb.clone().sub(va).normalize());
    put(new THREE.CylinderGeometry(r2,r1,va.distanceTo(vb),12),c,part,parent,va.add(vb).multiplyScalar(.5).toArray(),[1,1,1],new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3));
  }
  // 太い髪も細い髪も、平たい断面の曲線にして根元から毛先まで流れをつなぐ。
  function lock(points,width,color,parent=root,part='deco',flat=.35) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),n=14,sides=5,frames=curve.computeFrenetFrames(n,false),pos=[],idx=[];
    for(let i=0;i<=n;i++){
      const t=i/n,p=curve.getPointAt(t),w=width*Math.pow(1-t,.62)+.001;
      for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,v=p.clone().addScaledVector(frames.normals[i],Math.cos(a)*w).addScaledVector(frames.binormals[i],Math.sin(a)*w*flat);pos.push(...v.toArray());
        if(i<n){const k=i*sides+j,l=i*sides+(j+1)%sides;idx.push(k,l,k+sides,l,l+sides,k+sides);}}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();put(geo,color,part,parent);
  }
  // 腹筋は肩よりずっと狭くする。胸の下に深い影が落ちる逆三角形の胴。
  muscle([0,1.47,-.13],[.55,.64,.31],shade);
  muscle([0,.97,-.03],[.34,.32,.26]);
  for(const sx of [-1,1]){
    muscle([sx*.43,1.91,.05],[.53,.39,.37]);
    muscle([sx*.65,2.02,-.19],[.42,.36,.36],skin);
    muscle([sx*.28,1.43,.12],[.2,.24,.12],light);
    for(let j=0;j<3;j++)muscle([sx*(.155-j*.015),1.38-j*.19,.205],[.158-j*.014,.11,.09],j%2?skin:light);
    tube([[sx*.04,1.75,.367],[sx*.35,1.64,.37],[sx*.65,1.71,.29]],.017,ink,'fixed');
    // 紫の二本の弧は、平らな四角ではなく胸筋のカーブに沿わせる。
    for(let j=0;j<2;j++){
      const v=[],ix=[];
      for(let k=0;k<=16;k++)for(let edge=0;edge<2;edge++){
        const f=k/16,x=.13+f*.67,y=1.98-j*.19-Math.sin(f*Math.PI)*.095-(edge?.085:0);
        const zz=.05+.37*Math.sqrt(Math.max(.03,1-((x-.43)/.53)**2-((y-1.91)/.39)**2));
        v.push(sx*x,y,zz+.018);
        if(k<16&&!edge){const n=k*2;ix.push(n,n+1,n+2,n+1,n+3,n+2);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(sx>0?ix:ix.slice().reverse());geo.computeVertexNormals();put(geo,0x9256b4,'deco');
    }
  }
  const legs=[];
  // 開いた膝と獣の足。長身の直立姿勢を避け、重心を地面へ近づける。
  for(const sx of [-1,1]){
    const hip=group(`amano-hip-${sx}`),knee=group(`amano-knee-${sx}`);
    bone([sx*.19,1.03,-.06],[sx*.73,.58,.2],.24,.25,skin,hip);
    muscle([sx*.49,.79,.07],[.35,.29,.27],skin,hip);muscle([sx*.75,.52,.23],[.24,.21,.24],skin,hip);
    bone([sx*.75,.5,.23],[sx*.67,.12,-.05],.19,.13,skin,knee);
    muscle([sx*.68,.26,.035],[.16,.22,.18],skin,knee);muscle([sx*.68,.075,.16],[.2,.11,.35],skin,knee);
    for(let j=0;j<3;j++)lock([[sx*.68+(j-1)*.105,.1,.36],[sx*.68+(j-1)*.12,.06,.48],[sx*.68+(j-1)*.13,.03,.56]],.055,0xb7ae79,knee,'fixed',.5);
    legs.push({hip,knee,sx});
    // 腰布は画面の小さいサイズでも分かる、短い黄土色の毛皮。
    for(let j=0;j<7;j++){const x=sx*(.03+j*.042);shape([[x,.99],[x+sx*.068,.96],[x+sx*.05,.66+(j%3)*.045],[x-sx*.02,.73]],.07,j%2?0x9e8c61:0xb3a174,'deco',root,.25,.007);}
  }
  // 肩の付け根ごと動く巨大な腕。上腕の青い帯と前腕の隙間のない包帯。
  const arms=[];
  for(const sx of [-1,1]){
    const arm=group(`amano-arm-${sx}`,[sx*.87,2.12,-.015]);arms.push(arm);
    muscle([0,0,0],[.43,.37,.4],skin,arm);
    bone([sx*.06,-.17,.02],[sx*.35,-.62,.18],.31,.23,skin,arm);
    muscle([sx*.19,-.34,.1],[.235,.31,.21],light,arm);
    muscle([sx*.35,-.64,.19],[.23,.23,.23],skin,arm);
    bone([sx*.36,-.68,.2],[sx*.47,-1.36,.42],.22,.16,skin,arm);
    // 幅のある青い模様を、腕の前面から外側へ巻く。
    for(let j=0;j<3;j++){
      const f=.2+j*.25,g=f+.15;
      bone([sx*(.06+.29*f),-.17-.45*f,.02+.16*f],
        [sx*(.06+.29*g),-.17-.45*g,.02+.16*g],.34-f*.08,.34-g*.08,0x4dabb4,arm,'deco');
    }
    bone([sx*.37,-.77,.23],[sx*.465,-1.35,.42],.224,.165,0xb4a486,arm,'deco');
    for(let j=0;j<9;j++){
      const f=j/8,x=sx*(.37+f*.095),y=-.78-f*.55,z=.23+f*.19,r=.224-f*.059;
      const ps=[];for(let k=0;k<=18;k++){const a=k/18*Math.PI*2;ps.push([x+Math.cos(a)*r,y+Math.cos(a)*.038,z+Math.sin(a)*r]);}
      tube(ps,.0065,0x716953,'fixed',arm);
    }
    // 手首の金の輪と、曲がった五本指。拳の丸い塊で済ませない。
    put(new THREE.TorusGeometry(.187,.026,6,22),0xd1b34e,'deco',arm,[sx*.47,-1.38,.43],[1,1,1],[Math.PI/2,0,.08*sx]);
    muscle([sx*.48,-1.54,.46],[.2,.22,.125],skin,arm);
    for(let j=0;j<4;j++){
      const x=sx*.48+(j-1.5)*.095,y=-1.68+(j===0||j===3?.06:0),z=.49;
      lock([[x,y,z],[x+sx*.026,y-.13,z+.09],[x+sx*.03,y-.16,z+.21]],.046,skin,arm,'body',.9);
      lock([[x+sx*.03,y-.16,z+.21],[x+sx*.035,y-.14,z+.29],[x+sx*.04,y-.08,z+.32]],.03,0xc5be8b,arm,'fixed',.7);
    }
    lock([[sx*.33,-1.45,.48],[sx*.23,-1.55,.57],[sx*.25,-1.66,.63]],.061,skin,arm,'body',.8);
    tube([[sx*.42,-1.47,.578],[sx*.5,-1.55,.589],[sx*.56,-1.58,.576]],.009,ink,'fixed',arm);
  }
  // 首は短く、頭を胸より前へ出す。顔は球ではなく頬骨と顎の面で作る。
  muscle([0,2.15,.17],[.26,.28,.29],shade);
  const head=group('amano-angular-face',[0,2.16,.4]);
  muscle([0,.055,-.015],[.265,.33,.235],skin,head);
  shape([[-.19,-.09],[-.14,-.3],[0,-.405],[.14,-.3],[.19,-.09]],.1,shade,'body',head,.045,.025);
  for(const sx of [-1,1]){
    shape([[sx*.18,.1],[sx*.3,.24],[sx*.64,.48],[sx*.5,.15],[sx*.23,-.09]],.075,skin,'body',head,-.045,.012);
    shape([[sx*.29,.12],[sx*.52,.35],[sx*.4,.12]],.017,ink,'fixed',head,.04,.003);
    // 細い吊り目と、鼻へ斜めに下がる鋭い眉。
    shape([[sx*.055,.047],[sx*.12,.12],[sx*.245,.145],[sx*.21,.045],[sx*.115,-.004]],.021,0xe9dcbc,'eye',head,.208,.004);
    put(new THREE.IcosahedronGeometry(1,1),0x231c21,'fixed',head,[sx*.145,.065,.245],[.02,.043,.015]);
    shape([[sx*.03,.13],[sx*.27,.225],[sx*.255,.154],[sx*.105,.082]],.06,ink,'fixed',head,.188,.005);
    shape([[sx*.12,-.065],[sx*.27,.025],[sx*.195,-.15],[sx*.13,-.24]],.053,light,'body',head,.19,.006);
    // 頭の側から細く伸びる黒い角。
    lock([[sx*.19,.22,-.015],[sx*.27,.45,-.06],[sx*.33,.64,-.17],[sx*.35,.75,-.3]],.1,ink,head,'body',.65);
  }
  shape([[-.075,.12],[0,.215],[.075,.12],[.05,-.105],[0,-.13],[-.05,-.105]],.085,shade,'body',head,.21,.008);
  shape([[-.163,-.11],[-.12,-.3],[0,-.385],[.12,-.3],[.163,-.11],[0,-.16]],.043,0x100f18,'fixed',head,.247,.005);
  tube([[-.16,-.105,.3],[0,-.14,.333],[.16,-.105,.3]],.015,0xc5b756,'fixed',head);
  for(const sx of [-1,1]){
    lock([[sx*.12,-.115,.32],[sx*.104,-.24,.35],[sx*.078,-.27,.354]],.037,0xdfd06b,head,'fixed',.7);
    lock([[sx*.08,-.31,.302],[sx*.072,-.25,.331],[sx*.07,-.22,.34]],.022,0xc5b756,head,'fixed',.7);
  }
  for(let j=0;j<5;j++)lock([[(j-2)*.036,-.143,.334],[(j-2)*.036,-.19,.34]],.017,0xdfd06b,head,'fixed',.7);
  const tongue=group('amano-purple-tongue');head.add(tongue);tongue.position.set(0,-.28,.32);
  lock([[0,0,0],[.024,-.16,.055],[-.12,-.24,.15],[-.16,-.21,.19]],.063,0x7752af,tongue,'deco',.38);
  tube([[0,-.055,.036],[-.007,-.16,.09],[-.12,-.218,.166]],.005,0x382646,'fixed',tongue);
  // 一枚目の額の金の紋。大きな飾り板を置かず細い線で入れる。
  for(const sx of [-1,1])tube([[0,.3,.206],[sx*.05,.25,.224],[sx*.014,.2,.241],[sx*.05,.165,.252]],.009,0xd1b653,'deco',head);

  // 頬の赤い鬣。顔を小さく見せる広い輪郭と、尖った毛先を積み重ねる。
  for(const sx of [-1,1])for(let j=0;j<25;j++){
    const f=j/24;
    lock([[sx*(.24+f*.045),.17-f*.37,-.05],[sx*(.47+f*.07),.17-f*.52,.05],
      [sx*(.48-f*.04),-.1-f*.34,.04],[sx*(.4-f*.27),-.27-f*.28,.14]],.07,j%4?red:0x761d29,head);
  }
  // 毛の根元を板状の大きな束で覆い、その上に細い流れを重ねる。
  owner.mane=[];
  for(let layer=0;layer<4;layer++){
    const g=group(`amano-flowing-mane-${layer}`,[0,2.37,-.06]);owner.mane.push({m:g,rx:0,rz:0,phase:layer*.8});
    for(let j=0;j<30;j++){
      const q=j/29*2-1,k=(j%5)/4,width=j%4===0?.15:.062;
      lock([[q*.3,.06+Math.sin(j)*.045-layer*.08,-.04],[q*.51,.43+Math.cos(j)*.09-layer*.065,-.5],[q*.7+.12,.39-layer*.065,-1.2],
        [q*(.75+k*.24)+.18,.21+Math.sin(j)*.12,-2.03-layer*.12-k*.25]],width,[red,0xbf3030,0x721821][(j+layer)%3],g);
    }
  }
  for(let j=0;j<33;j++){
    const q=(j-16)/16;
    lock([[q*.235,2.52-Math.abs(q)*.2,.04],[q*.35,2.77-Math.abs(q)*.12,-.19],[q*.48,2.82-Math.abs(q)*.13,-.65],[q*.63+.1,2.69,-1.2]],j%3?.043:.11,j%4?red:0xc03a32);
  }
  b.finish();
  // まとめた形状を関節の原点へ移し、膝を股関節の子にする。
  for(const {hip,knee,sx} of legs){
    for(const [joint,pivot] of [[hip,[sx*.19,1.03,-.06]],[knee,[sx*.75,.5,.23]]]){
      joint.children.forEach(m=>m.geometry.translate(-pivot[0],-pivot[1],-pivot[2]));joint.position.set(...pivot);
    }
    hip.attach(knee);
  }
  // 飛行姿勢へ滑らかに移り、威嚇は振りかぶり→両腕の振り下ろし→戻りで見せる。
  let flight=0,lastT=null,previousScare=0,scareStart=-10;
  owner.amanoRig={root,arms,legs,head,tongue,update(t,moving,scare){
    const dt=lastT===null?1/60:Math.max(0,Math.min(.1,t-lastT));lastT=t;
    const run=Math.min(1,Math.max(0,moving)/6);
    flight+=(run-flight)*(1-Math.exp(-dt*9));
    if(scare>previousScare+.2)scareStart=t;
    previousScare=scare;
    const phase=Math.max(0,Math.min(1,(t-scareStart)/.75));
    const wind=phase<.3?Math.sin(Math.PI*phase/.3):0;
    const slam=Math.sin(Math.PI*Math.max(0,Math.min(1,(phase-.2)/.8)));
    root.position.y=flight*(.55+Math.sin(t*2.8)*.1)+scare*(wind*.18+slam*.12);
    root.position.z=scare*slam*.55;
    root.rotation.x=flight*.2+scare*(-wind*.2+slam*.48);
    root.rotation.z=Math.sin(t*2)*flight*.035;
    legs.forEach(({hip,knee},i)=>{
      hip.rotation.x=flight*(.85+Math.sin(t*2.8+i*.7)*.09)+scare*slam*.18;
      hip.rotation.z=(i?1:-1)*flight*.12;
      knee.rotation.x=flight*(.65+Math.sin(t*2.8+i*.7+.8)*.1);
    });
    head.rotation.x=.04+Math.sin(t*2)*.02+scare*(wind*.2-slam*.38);
    head.position.z=.4+scare*slam*.18;
    tongue.rotation.x=Math.sin(t*3)*.12+scare*slam*.5;
    arms.forEach((a,i)=>{
      const idle=-flight*2.1+Math.sin(t*2+i*.65)*(.016+flight*.07);
      a.rotation.x=idle*(1-scare)+(-2.75+slam*1.95)*scare;
      a.rotation.z=(i?1:-1)*(flight*.24+scare*(.32+wind*.4)+Math.sin(t*2)*.018);
    });
  }};
  owner.xray.clear();
  for(const [p,s] of [[[0,1.65,0],[.76,.7,.32]],[[-.98,1.4,.18],[.33,.82,.27]],[[.98,1.4,.18],[.33,.82,.27]],[[0,2.19,.5],[.26,.31,.2]]]){
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),owner.xrayMat);m.position.set(...p);m.scale.set(...s);owner.xray.add(m);
  }
}
