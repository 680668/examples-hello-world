import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const app = document.querySelector<HTMLElement>('#app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#142a35');
scene.fog = new THREE.FogExp2('#53676a', 0.0036);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 1800);
camera.position.set(0, 18, 115);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

scene.add(new THREE.HemisphereLight('#b8d8df', '#17262d', 1.4));
const sunLight = new THREE.PointLight('#ff874e', 1200, 620, 1.7);
sunLight.position.set(-18, 24, -165);
scene.add(sunLight);

const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: `
    varying vec3 vWorld; uniform float uTime;
    void main(){
      vec3 d=normalize(vWorld-cameraPosition);
      vec3 deep=vec3(.025,.065,.10), blue=vec3(.08,.20,.26);
      vec3 coral=vec3(.84,.34,.20), gold=vec3(.96,.66,.43);
      vec3 c=mix(coral,gold,smoothstep(-.06,.22,d.y));
      c=mix(c,blue,smoothstep(.08,.56,d.y));
      c=mix(c,deep,smoothstep(.48,.98,d.y));
      float glow=exp(-abs(d.y+.015)*25.)*exp(-abs(d.x+.08)*7.);
      c+=vec3(1.,.28,.08)*glow*.42;
      float cloud=sin(vWorld.x*.018+sin(vWorld.z*.012+uTime*.04))*sin(vWorld.y*.025+uTime*.02);
      c+=vec3(.16,.19,.17)*smoothstep(.25,.9,cloud)*.08;
      gl_FragColor=vec4(c,1.);
    }`
}));
scene.add(sky);

const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    uniform float uTime; varying vec3 vWorld; varying float vWave;
    void main(){vec3 p=position;
      float w=sin(p.x*.035+uTime*.7)*.24+sin(p.z*.05-uTime*.45)*.16+sin((p.x+p.z)*.018+uTime*.3)*.25;
      p.y+=w;vWave=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;
      gl_Position=projectionMatrix*viewMatrix*world;
    }`,
  fragmentShader: `
    uniform float uTime; varying vec3 vWorld; varying float vWave;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){vec2 p=vWorld.xz;
      vec3 deep=vec3(.025,.13,.17),teal=vec3(.08,.29,.30),slate=vec3(.19,.33,.34);
      vec3 c=mix(deep,teal,.5+.28*sin(p.y*.009+uTime*.1));
      c=mix(c,slate,smoothstep(30.,240.,abs(p.x))*.2);
      float sparkle=step(.72,hash(floor(vec2(p.x*.26+p.y*.012,p.y*.19))));
      float lane=exp(-abs(p.x+18.)*.085)*exp(-abs(p.y+18.)*.008);
      float glint=sparkle*smoothstep(.02,.3,abs(vWave))*.7;
      c=mix(c,vec3(1.,.46,.18),lane*(.2+glint));
      c+=vec3(.3,.5,.46)*glint*(.25+.75*lane);
      gl_FragColor=vec4(c,1.);
    }`
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 240, 240), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -2;
scene.add(water);

const sun = new THREE.Group();
sun.position.set(-18, 24, -165);
scene.add(sun);
sun.add(new THREE.Mesh(new THREE.SphereGeometry(7.2, 48, 48), new THREE.MeshBasicMaterial({ color: '#ff6b35' })));
const halos: THREE.Sprite[] = [];
[25, 42, 75, 125].forEach((r, i) => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    color: ['#ff5c2d', '#ff7944', '#e88a58', '#e7a06e'][i],
    transparent: true, opacity: [.36, .15, .065, .025][i], depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sprite.scale.set(r, r, 1); sun.add(sprite); halos.push(sprite);
});
const raysPos: number[] = [];
for (let i = 0; i < 320; i++) {
  const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 28;
  raysPos.push(Math.cos(a)*7.4, Math.sin(a)*7.4, 0, Math.cos(a)*r, Math.sin(a)*r, 0);
}
const raysGeo = new THREE.BufferGeometry();
raysGeo.setAttribute('position', new THREE.Float32BufferAttribute(raysPos, 3));
sun.add(new THREE.LineSegments(raysGeo, new THREE.LineBasicMaterial({
  color: '#ff9861', transparent: true, opacity: .28, blending: THREE.AdditiveBlending
})));

function ridge(z: number, y: number, width: number, color: string, seed: number) {
  const points: THREE.Vector2[] = [new THREE.Vector2(-width/2, -30)];
  for (let i=0;i<=44;i++) {
    const x=-width/2+width*i/44;
    const h=y+Math.sin(i*.8+seed)*2.8+Math.sin(i*.23+seed)*4+Math.random()*1.5;
    points.push(new THREE.Vector2(x,h));
  }
  points.push(new THREE.Vector2(width/2,-30));
  const shape = new THREE.Shape(points);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
  mesh.position.z=z; scene.add(mesh);
}
ridge(-210, 4, 470, '#30464a', 1);
ridge(-195, 2, 340, '#233b40', 2);
for (let i=0;i<42;i++) {
  const x=-170+i*8.5+(Math.random()-.5)*5;
  const h=8+Math.random()*28;
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.08,.13,h,5),new THREE.MeshBasicMaterial({color:'#1b3036'}));
  mast.position.set(x,h/2-2,-190+Math.random()*14); scene.add(mast);
  if (i%3===0) {
    const sail=new THREE.Mesh(new THREE.ConeGeometry(2.3,h*.34,3),new THREE.MeshBasicMaterial({color:'#172d33',side:THREE.DoubleSide}));
    sail.position.set(x+1,h*.35,-188+Math.random()*12); sail.rotation.z=Math.PI/2; scene.add(sail);
  }
}

const boats: THREE.Group[] = [];
for (let i=0;i<7;i++) {
  const boat=new THREE.Group();
  const hull=new THREE.Mesh(new THREE.ConeGeometry(2.8,10,5),new THREE.MeshStandardMaterial({color:'#17282c',roughness:1}));
  hull.rotation.z=Math.PI/2; hull.rotation.y=Math.PI/2; hull.scale.set(.55,.42,1.3); boat.add(hull);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,5.8,5),new THREE.MeshBasicMaterial({color:'#17272b'}));
  mast.position.y=2.7; boat.add(mast);
  const sail=new THREE.Mesh(new THREE.ConeGeometry(1.5,3.8,3),new THREE.MeshBasicMaterial({color:'#22363a',side:THREE.DoubleSide}));
  sail.position.set(.9,2.6,0); sail.rotation.z=-.45; boat.add(sail);
  boat.position.set(-34+i*12,-1.3+Math.random()*.5,-42-Math.random()*62);
  boat.rotation.y=(Math.random()-.5)*.7; scene.add(boat); boats.push(boat);
}

const dustCount=1800, dustPos=new Float32Array(dustCount*3);
for(let i=0;i<dustCount;i++){
  dustPos[i*3]=(Math.random()-.5)*440;
  dustPos[i*3+1]=Math.random()*95-5;
  dustPos[i*3+2]=-240+Math.random()*330;
}
const dustGeo=new THREE.BufferGeometry();
dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dustMat=new THREE.PointsMaterial({color:'#ffbb86',size:.45,transparent:true,opacity:.58,blending:THREE.AdditiveBlending,depthWrite:false});
scene.add(new THREE.Points(dustGeo,dustMat));

const strokes=new THREE.Group(); scene.add(strokes);
for(let i=0;i<170;i++){
  const x=(Math.random()-.5)*260, z=-20-Math.random()*210;
  const len=2+Math.random()*15;
  const geo=new THREE.PlaneGeometry(len,.08+Math.random()*.25);
  const mat=new THREE.MeshBasicMaterial({color:Math.random()>.25?'#e6a16d':'#72a69a',transparent:true,opacity:.08+Math.random()*.16,side:THREE.DoubleSide,depthWrite:false});
  const m=new THREE.Mesh(geo,mat);m.position.set(x,-1.1+Math.random()*1.3,z);m.rotation.x=-Math.PI/2;strokes.add(m);
}

type CameraMode='orbit'|'drift';
let mode:CameraMode='orbit', entered=false, progress=0;
let px=0,py=0,tx=0,ty=0,last=performance.now(),intro=0;
const look=new THREE.Vector3(-5,9,-120);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,t:number)=>a+(b-a)*t;

document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b=>b.addEventListener('click',()=>{
  mode=b.dataset.camera as CameraMode;
  document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));
}));
document.querySelector<HTMLButtonElement>('#enter')!.addEventListener('click',()=>{entered=true;app.classList.add('immersed');});
document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click',()=>{
  entered=false;progress=0;app.classList.remove('immersed');
  document.querySelector<HTMLElement>('#progressBar')!.style.width='0%';
});
window.addEventListener('pointermove',e=>{px=(e.clientX/innerWidth-.5)*2;py=(e.clientY/innerHeight-.5)*2;});
window.addEventListener('wheel',e=>{
  if(!entered&&e.deltaY>0){entered=true;app.classList.add('immersed');}
  progress=clamp(progress+e.deltaY*.00042,0,1);
  document.querySelector<HTMLElement>('#progressBar')!.style.width=(progress*100)+'%';
},{passive:true});
window.addEventListener('touchmove',e=>{
  if(e.touches[0]){px=(e.touches[0].clientX/innerWidth-.5)*2;py=(e.touches[0].clientY/innerHeight-.5)*2;}
},{passive:true});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){entered=false;app.classList.remove('immersed');}if(e.key===' '){entered=true;app.classList.add('immersed');}});

function animate(now:number){
  requestAnimationFrame(animate);
  const dt=Math.min((now-last)/1000,.05);last=now;const t=now*.001;
  waterMat.uniforms.uTime.value=t;sky.material instanceof THREE.ShaderMaterial&&(sky.material.uniforms.uTime.value=t);
  sun.rotation.z=Math.sin(t*.16)*.025;
  halos.forEach((h,i)=>{const s=1+Math.sin(t*(.7+i*.11)+i)*.035;h.scale.set([25,42,75,125][i]*s,[25,42,75,125][i]*s,1);});
  boats.forEach((b,i)=>{b.position.y=-1.3+Math.sin(t*.7+i*2)*.17;b.rotation.z=Math.sin(t*.3+i)*.012;});
  intro=smooth(intro,entered?1:0,1-Math.exp(-dt*1.4));
  tx=smooth(tx,px,1-Math.exp(-dt*1.8));ty=smooth(ty,py,1-Math.exp(-dt*1.8));
  if(mode==='orbit'){
    const a=tx*.34+t*.025,r=smooth(115,48,intro)-progress*18,y=smooth(18,9,intro)-progress*7+ty*-4;
    camera.position.set(Math.sin(a)*r-5,y,Math.cos(a)*r+8);
    camera.lookAt(look.x+tx*9,look.y-ty*4,look.z+progress*40);
  }else{
    const x=tx*27+Math.sin(t*.09)*5,y=11-ty*13+Math.sin(t*.14)*2;
    camera.position.lerp(new THREE.Vector3(x,y,45-progress*105),.025);
    camera.lookAt(x+tx*18,y+ty*7,-155+progress*15);
  }
  const n=Math.min(3,Math.floor(progress*4));
  document.querySelector('#sceneNumber')!.textContent=String(n+1).padStart(2,'0');
  document.querySelector('#sceneLabel')!.textContent=['THE DISTANT SHORE','THE LUMINOUS AIR','A SEA OF COLOUR','INSIDE THE IMPRESSION'][n];
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));});
setTimeout(()=>document.querySelector('#loading')?.classList.add('gone'),700);
