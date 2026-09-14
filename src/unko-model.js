import * as THREE from "../lib/three.module.js";
import { modelBuilder } from "./character-models.js";

// 丸い巻きの重なりと、とがって横へ曲がった先端を連続した立体で作る。
export function buildUnko(owner) {
  const b=modelBuilder(owner,"unko"),{root,put,ball,tube,group}=b;
  const brown=0x79472f;
  ball([0,.39,0],[.93,.4,.69],brown);
  const points=[];
  for(let i=0;i<=130;i++){
    const t=i/130,a=t*Math.PI*4.7+Math.PI*.5,r=.53*Math.pow(1-t,.8);
    points.push(new THREE.Vector3(Math.cos(a)*r+.09*t*t,.36+1.77*t,Math.sin(a)*r*.76));
  }
  const curve=new THREE.CatmullRomCurve3(points),n=160,k=24,frames=curve.computeFrenetFrames(n,false),positions=[],indices=[];
  for(let i=0;i<=n;i++){
    const t=i/n,c=curve.getPointAt(t),radius=.46*Math.pow(1-t,.32)+.001;
    for(let j=0;j<k;j++){
      const a=j/k*Math.PI*2,v=frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));
      positions.push(c.x+v.x*radius,Math.max(.035,c.y+v.y*radius),c.z+v.z*radius);
      if(i<n){const q=i*k+j,h=i*k+(j+1)%k;indices.push(q,h,q+k,h,h+k,q+k);}
    }
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geom.setIndex(indices);geom.computeVertexNormals();put(geom,brown,"body");
  const eyes=[];
  for(const s of [-1,1]){
    const eye=group(`unko-eye-${s}`,[s*.345,.91,.66]);eyes.push(eye);
    ball([0,0,0],[.27,.3,.245],0xfffaf4,"fixed",eye);
    ball([0,.005,.224],[.132,.142,.045],0x1872c0,"eye",eye);
    ball([0,.005,.262],[.053,.06,.018],0x080d14,"fixed",eye);
    ball([-.035,.066,.266],[.027,.032,.012],0xffffff,"fixed",eye);
    tube([[s*.23,1.3,.53],[s*.35,1.34,.54],[s*.47,1.29,.51]],.026,0x18100d,"fixed");
  }
  const mouth=new THREE.Shape();mouth.moveTo(-.44,.51);mouth.quadraticCurveTo(0,.22,.44,.51);mouth.quadraticCurveTo(.1,.03,-.44,.51);
  put(new THREE.ExtrudeGeometry(mouth,{depth:.028,bevelEnabled:true,bevelThickness:.01,bevelSize:.01,bevelSegments:3,curveSegments:24}),0x150906,"fixed",root,[0,0,.689]);
  const tongue=group("unko-tongue",[0,.31,.755]);
  ball([0,-.09,.055],[.175,.24,.09],0xe92635,"deco",tongue);
  ball([0,-.21,.065],[.15,.13,.095],0xf03c47,"deco",tongue);
  tube([[0,.055,.141],[0,-.05,.152],[0,-.17,.158]],.008,0xa91926,"fixed",tongue);
  b.finish();
  root.traverse(m=>{if(!m.isMesh)return;const old=m.material;m.material=new THREE.MeshPhongMaterial({color:old.color,emissive:old.emissive,emissiveIntensity:.06,specular:0xc5a48c,shininess:m.userData.part==="body"?65:90,transparent:true});old.dispose();});
  owner.xray.clear();
  for(const [p,s] of [[[0,.48,0],[.92,.47,.7]],[[0,1.12,0],[.66,.5,.5]],[[.08,1.68,0],[.35,.45,.3]]]){
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),owner.xrayMat);m.position.set(...p);m.scale.set(...s);owner.xray.add(m);
  }
  owner.unkoRig={root,eyes,tongue,update(t,moving,scare){
    const run=Math.min(1,Math.abs(moving)/6),hop=Math.abs(Math.sin(t*8))*run,burst=Math.max(0,scare),wiggle=Math.sin(t*(burst?24:8));
    root.position.y=hop*.17+burst*(.15+Math.abs(Math.sin(t*15))*.18);
    root.rotation.z=Math.sin(t*8)*run*.07+wiggle*burst*.09;
    root.scale.set(1-hop*.06+burst*.1,1+hop*.1-burst*.06,1-hop*.04);
    tongue.rotation.x=Math.sin(t*10)*(.09+run*.16)+burst*wiggle*.5;
    tongue.rotation.z=burst*Math.sin(t*20)*.22;
    eyes.forEach((eye,i)=>{eye.scale.setScalar(1+burst*.2);eye.position.z=.66+burst*(.06+Math.sin(t*19+i)*.03);});
  }};
}
