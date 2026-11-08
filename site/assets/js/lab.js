let THREE=null,OrbitControls=null;
try{const threeModule=await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');const controlsModule=await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js');THREE=threeModule;OrbitControls=controlsModule.OrbitControls;}catch(error){console.warn('BubbleWave : moteur 3D indisponible, la vue 2D reste active.',error);}
import { maxwellGarnettSpheroid,matrixPermittivity,computeSlab,computeMultilayer,sweepFrequency,electricFieldProfile,inclusionPermittivity,porePermittivity,C0 } from './physics.js';
const $=id=>document.getElementById(id), fmt=(n,d=1)=>new Intl.NumberFormat('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n), pct=n=>fmt(n*100,1)+' %';
const s={f:1e9,angle:0,pol:'TE',por:.2,thick:.09,eps:6,loss:.03,radius:.5,shape:"sphere",aspect:2,inclusionType:"air",saturation:1,playing:true};
const EPSAIR={re:1,im:0};let layers=[{id:1,name:'Béton',material:'concrete',thicknessM:.09,eps:{re:6,im:-.18}}],nextLayerId=2;let result,epsEff,renderer,scene,camera,orbit,wall,bubbleGroup,waveGroup,clock;
const wavefronts={incident:[],reflected:[],inside:[],transmitted:[]};
const host=$('scene');let threeReady=false,mat=null;
if(THREE){try{
 scene=new THREE.Scene();scene.fog=new THREE.Fog(0x091725,9,22);camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(4.4,3.1,6.7);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
 orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.target.set(0,0,0);orbit.minDistance=3;orbit.maxDistance=14;
 scene.add(new THREE.HemisphereLight(0xc6eaff,0x182638,2));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,5);scene.add(key);const rim=new THREE.PointLight(0x42cbe8,24,12);rim.position.set(-3,1,2);scene.add(rim);
 const grid=new THREE.GridHelper(12,24,0x29465c,0x1b3042);grid.position.y=-1.5;scene.add(grid);
 mat=new THREE.MeshPhysicalMaterial({color:0x4e7893,metalness:.18,roughness:.38,transparent:true,opacity:.28,side:THREE.DoubleSide,clearcoat:.4});
 wall=new THREE.Mesh(new THREE.BoxGeometry(3,2.8,.65),mat);scene.add(wall);
 const edges=new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry),new THREE.LineBasicMaterial({color:0x8bd9e9,transparent:true,opacity:.5}));wall.add(edges);
 bubbleGroup=new THREE.Group();scene.add(bubbleGroup);threeReady=true;
 }catch(error){console.warn('BubbleWave : WebGL indisponible, activation de la vue 2D.',error);renderer=null;scene=null;camera=null;orbit=null;wall=null;bubbleGroup=null;host.innerHTML='';}}
const seed=()=>{let x=173;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}};

let layerMarkerGroup=null;
function rebuildLayerMarkers(){
 if(!threeReady||!wall)return;
 if(layerMarkerGroup)wall.remove(layerMarkerGroup);
 layerMarkerGroup=new THREE.Group();wall.add(layerMarkerGroup);
 const depth=wall.geometry.parameters.depth, total=layers.reduce((a,l)=>a+l.thicknessM,0);
 let z=-depth/2;
 layers.slice(0,-1).forEach(l=>{z+=depth*l.thicknessM/total;const g=new THREE.EdgesGeometry(new THREE.PlaneGeometry(3,2.8));const line=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xe5f5ff,transparent:true,opacity:.75}));line.position.z=z;layerMarkerGroup.add(line)});
}
function renderSvgWall(){
 const bubbles=$('wallBubbles'),marks=$('wallLayerMarks');if(!bubbles||!marks)return;
 const count=Math.round(8+s.por*78),colors={air:'#d9f4ff',water:'#68bde8',ice:'#c4e8ff',aggregate:'#b7a68b'},fill=colors[s.inclusionType]||colors.air;
 let seed=9817,rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 let svg='';
 for(let i=0;i<count;i++){const x=444+rand()*197,y=115+rand()*333,r=3+rand()*11,rx=s.shape==='prolate'?r*1.65:s.shape==='oblate'?r*1.35:r,ry=s.shape==='prolate'?r*.68:s.shape==='oblate'?r*.78:r;
  if(s.shape==='cube')svg+=`<rect x="${x-r}" y="${y-r}" width="${2*r}" height="${2*r}" rx="2" fill="${fill}" fill-opacity=".66" stroke="#fff" stroke-opacity=".8" transform="rotate(${rand()*40-20} ${x} ${y})"/>`;
  else svg+=`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" fill-opacity=".72" stroke="#fff" stroke-opacity=".9" stroke-width="1.4"/><ellipse cx="${x-rx*.28}" cy="${y-ry*.3}" rx="${Math.max(1,rx*.24)}" ry="${Math.max(1,ry*.2)}" fill="#fff" fill-opacity=".72"/>`;
 }
 bubbles.innerHTML=svg;
 let pos=430,lines='';
 layers.slice(0,-1).forEach(l=>{pos+=225*l.thicknessM/layers.reduce((a,x)=>a+x.thicknessM,0);lines+=`<path d="M${pos} 96V464" stroke="#287fae" stroke-width="2" stroke-dasharray="5 5" opacity=".8"/>`});
 marks.innerHTML=lines;
 const meta=$('wallMeta');if(meta)meta.textContent=`${s.inclusionType==='air'?'Pores d’air':s.inclusionType==='water'?'Pores humides':s.inclusionType==='ice'?'Pores gelés':'Granulats'} · ${Math.round(s.por*100)} % · ${layers.length} couche(s)`;
}
function rebuildBubbles(){renderSvgWall();if(!threeReady||!bubbleGroup)return;bubbleGroup.clear();const rand=seed(),count=Math.round(12+s.por*95),radius=.045+s.radius*.014;for(let i=0;i<count;i++){const r=radius*(.55+rand()*.9),geometry=s.shape==='cube'?new THREE.BoxGeometry(r*1.65,r*1.65,r*1.65):new THREE.SphereGeometry(r,22,16),m=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color:$('bubbleColor').value,metalness:.05,roughness:.12,transparent:true,opacity:.72,transmission:.28,thickness:.12,clearcoat:1}));if(s.shape==='prolate')m.scale.set(1,1,s.aspect);else if(s.shape==='oblate')m.scale.set(1,1,1/s.aspect);m.rotation.set(rand()*Math.PI,rand()*Math.PI,rand()*Math.PI);m.position.set((rand()-.5)*2.8,(rand()-.5)*2.55,(rand()-.5)*.57);bubbleGroup.add(m)}renderSvgWall()}

const waveLines={incident:null,reflected:null,transmitted:null,inside:null};
let ray3DGroup=null,source3D=null;
function makeWaveLine(color){const geo=new THREE.BufferGeometry(),pts=Array.from({length:100},()=>new THREE.Vector3());geo.setFromPoints(pts);const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:1}));line.frustumCulled=false;return line}
function rebuildWaves(){
 if(!threeReady)return;
 waveGroup?.removeFromParent();waveGroup=new THREE.Group();scene.add(waveGroup);
 for(const [key,color] of [['incident',0x087eea],['reflected',0xe4473c],['transmitted',0x149b63],['inside',0xf29b27]]){waveLines[key]=makeWaveLine(color);waveGroup.add(waveLines[key])}
 ray3DGroup?.removeFromParent();ray3DGroup=new THREE.Group();scene.add(ray3DGroup);
 source3D=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,.52,24),new THREE.MeshStandardMaterial({color:0x29465c,metalness:.25,roughness:.45}));
 body.rotation.z=Math.PI/2;source3D.add(body);
 const lens=new THREE.Mesh(new THREE.SphereGeometry(.145,24,16),new THREE.MeshBasicMaterial({color:0x168df0}));lens.position.x=.28;source3D.add(lens);scene.add(source3D);
 updateWavefronts(0);
}
function updateWavefronts(t){
 if(!threeReady||!waveLines.incident)return;
 const theta=s.angle*Math.PI/180,ni=1,nt=Math.max(1.001,result?.nReal||1.001);
 const thetaInside=Math.asin(Math.min(1,Math.sin(theta)/nt));
 const xFace=.325,halfWall=1.5,impactX=THREE.MathUtils.clamp(-Math.sin(theta)*.72,-1.12,1.12);
 const hit=new THREE.Vector3(impactX,0,xFace),len=1.65;
 const incidentDir=new THREE.Vector3(Math.sin(theta),0,-Math.cos(theta)).normalize();
 const reflectedDir=new THREE.Vector3(Math.sin(theta),0,Math.cos(theta)).normalize();
 const insideDir=new THREE.Vector3(Math.sin(thetaInside),0,-Math.cos(thetaInside)).normalize();
 const exit=hit.clone().add(insideDir.clone().multiplyScalar(.65/Math.max(.15,Math.cos(thetaInside))));
 const transmittedDir=incidentDir.clone();
 const start=hit.clone().add(incidentDir.clone().multiplyScalar(-len));
 const endRef=hit.clone().add(reflectedDir.clone().multiplyScalar(len));
 const endOut=exit.clone().add(transmittedDir.clone().multiplyScalar(len));
 const phase=t*.004,amp=.055;
 const draw=(line,a,b,offset=0)=>{
  const attr=line.geometry.attributes.position,dir=b.clone().sub(a),normal=new THREE.Vector3(-dir.z,0,dir.x).normalize(),dist=dir.length();
  for(let i=0;i<attr.count;i++){const u=i/(attr.count-1),p=a.clone().addScaledVector(dir,u);p.addScaledVector(normal,amp*Math.sin(u*dist*11-phase+offset));attr.setXYZ(i,p.x,p.y,p.z)}
  attr.needsUpdate=true;line.geometry.computeBoundingSphere();
 };
 draw(waveLines.incident,start,hit,0);draw(waveLines.reflected,hit,endRef,1.2);
 draw(waveLines.inside,hit,exit,2.1);draw(waveLines.transmitted,exit,endOut,3.1);
 const placeArrow=(key,origin,direction,color)=>{
  let arrow=ray3DGroup.getObjectByName(key);
  if(!arrow){arrow=new THREE.ArrowHelper(direction,origin,.8,color,.22,.12);arrow.name=key;ray3DGroup.add(arrow)}
  arrow.position.copy(origin);arrow.setDirection(direction);arrow.setLength(Math.max(.35,direction.length?.()||.8),.22,.12);
 };
 ray3DGroup.clear();
 const addArrow=(origin,direction,color)=>{const a=new THREE.ArrowHelper(direction.clone().normalize(),origin,.82,color,.22,.12);ray3DGroup.add(a)};
 addArrow(start,incidentDir,0x087eea);addArrow(hit,reflectedDir,0xe4473c);addArrow(hit,insideDir,0xf29b27);addArrow(exit,transmittedDir,0x149b63);
 if(source3D){source3D.position.copy(start);source3D.position.y=0;source3D.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),incidentDir.clone().negate())}
}
rebuildBubbles();rebuildWaves();
function resize(){if(!threeReady||!renderer||!camera)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}if(threeReady){new ResizeObserver(resize).observe(host);resize();}
function calculate(){s.f=+$('freq').value*1e9;s.angle=+$('angle').value;s.por=+$('por').value/100;s.thick=+$('thick').value/100;if(layers.length===1)layers[0].thicknessM=s.thick;s.eps=+$('eps').value;s.loss=+$('loss').value;s.radius=+$('radius').value;s.aspect=+$('aspect').value;s.shape=$('shape').value;s.inclusionType=$('inclusionType').value;s.saturation=+$('saturation').value/100;
const matrix=matrixPermittivity(s.eps,s.loss),waterOrPhase=porePermittivity(s.inclusionType,s.f,s.saturation);epsEff=maxwellGarnettSpheroid(matrix,waterOrPhase,s.por,s.shape,s.aspect);layers[0].eps=epsEff;layers[0].shape=s.shape;layers[0].aspectRatio=s.aspect;
result=computeMultilayer({frequencyHz:s.f,thetaDeg:s.angle,polarization:s.pol,layers:layers.map(l=>({name:l.name,thicknessM:l.thicknessM,eps:l.material==='concrete'?epsEff:layerPermittivity(l.material)}))});
$('freqOut').textContent=fmt(s.f/1e9,2)+' GHz';$('angleOut').textContent=s.angle+'°';$('porOut').textContent=fmt(s.por*100,0)+' %';$('thickOut').textContent=fmt(s.thick*100,1)+' cm';$('radiusOut').textContent=fmt(s.radius,1)+' mm';$('aspectOut').textContent=fmt(s.aspect,1)+' : 1';$('saturationOut').textContent=fmt(s.saturation*100,0)+' %';$('saturationControl').style.display=s.inclusionType==='water'?'block':'none';$('porLabel').textContent=s.inclusionType==='aggregate'?'Fraction volumique de granulat':'Porosité volumique';$('aspectOut').textContent=(s.shape==='sphere'||s.shape==='cube'?'1,0':fmt(s.aspect,1))+' : 1';$('materialNote').textContent=({air:'Air : εr ≈ 1 ; pores secs.',water:'Eau à 25 °C : modèle de Debye dispersif ; le curseur règle la fraction des pores remplie.',ice:'Glace : permittivité constante indicative (approximation pédagogique).',aggregate:'Granulat minéral : inclusion solide indicative, ce n’est pas un pore.'})[s.inclusionType];
$('sceneFreq').textContent=fmt(s.f/1e9,2)+' GHz';$('sceneAngle').textContent=s.angle+'°';$('scenePol').textContent=s.pol;$('sceneLambda').textContent=fmt(C0/s.f*100,1)+' cm';
for(const [id,v] of [['R',result.R],['T',result.T],['A',result.absorption]])$(id).textContent=pct(v);
for(const [id,v] of [['barR',result.R],['barT',result.T],['barA',result.absorption]])$(id).style.width=Math.max(0,v*100)+'%';
$('balance').textContent='R + T + A = '+fmt((result.R+result.T+result.absorption)*100,3)+' %';$('balanceState').textContent=Math.abs(result.R+result.T+result.absorption-1)<1e-9?'Conservation vérifiée':'Vérifier le bilan';
$('epsEff').textContent=fmt(epsEff.re,3)+' − j'+fmt(Math.abs(epsEff.im),3);$('indexEff').textContent=fmt(result.nReal,3);$('lambdaWall').textContent=fmt(result.lambdaWall*100,2)+' cm';$('atten').textContent=fmt(result.attenuationDb,2)+' dB';
updateRayDiagram(performance.now());drawChart();rebuildLayerMarkers();
}
function updateRayDiagram(time=0){
 const theta=s.angle*Math.PI/180,deg=x=>fmt(x*180/Math.PI,1)+'°',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const x0=430,x1=655,y0=280,thetaR=theta;
 const n0=Math.max(1.001,result.nReal||1.001);
 const layerData=result.layers?.length?result.layers:[{n:{re:n0},thicknessM:1}];
 const nValues=layerData.map(l=>Math.max(1.001,l.n?.re||n0));
 const angles=layerData.map((l,i)=>Math.asin(clamp(Math.sin(theta)/nValues[i],0,1)));
 const incidentDy=155*Math.tan(theta),yIncident=clamp(y0+incidentDy,110,450),yReflected=clamp(y0-incidentDy,110,450);
 const set=(id,d)=>{const el=$(id);if(el)el.setAttribute('d',d)};
 const wavePath=(points,phase,amp=7,wavelength=48)=>{
  const lengths=[0];let total=0;for(let i=1;i<points.length;i++){total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);lengths.push(total)}
  if(total<1)return '';
  const count=Math.max(36,Math.ceil(total/4)),out=[];
  for(let k=0;k<=count;k++){const dist=total*k/count;let seg=1;while(seg<lengths.length-1&&lengths[seg]<dist)seg++;
   const p=points[seg-1],q=points[seg],len=lengths[seg]-lengths[seg-1],u=len?(dist-lengths[seg-1])/len:0;
   const tx=(q[0]-p[0])/(len||1),ty=(q[1]-p[1])/(len||1),nx=-ty,ny=tx;
   const fade=Math.sin(Math.PI*k/count);const off=amp*fade*Math.sin(dist*(Math.PI*2/wavelength)-phase);
   out.push([p[0]+(q[0]-p[0])*u+nx*off,p[1]+(q[1]-p[1])*u+ny*off]);
  }
  return out.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
 };
 const phase=time*.006;
 set('incidentRay',wavePath([[165,yIncident],[x0,y0]],phase,7,43));
 set('reflectedRay',wavePath([[x0,y0],[165,yReflected]],phase+1.2,7,43));
 let x=x0,y=y0,insidePoints=[[x0,y0]],sum=layerData.reduce((a,l)=>a+Math.max(.001,l.thicknessM||1),0);
 layerData.forEach((layer,i)=>{x=i===layerData.length-1?x1:x0+(x1-x0)*layerData.slice(0,i+1).reduce((a,l)=>a+Math.max(.001,l.thicknessM||1),0)/sum;y=clamp(y+(i===layerData.length-1?x1-insidePoints[insidePoints.length-1][0]:x-insidePoints[insidePoints.length-1][0])*Math.tan(angles[i]),105,455);insidePoints.push([x,y])});
 set('insideRay',wavePath(insidePoints,phase+2.1,5.5,39));
 const yExit=y;
 // Parallel outside media: Snell's law gives the same emergent angle as incidence.
 set('transmittedRay',wavePath([[x1,yExit],[845,clamp(yExit+190*Math.tan(theta),80,490)]],phase+3.1,7,43));
 const arc=(r,ang,sign)=>{const ex=x0-r*Math.cos(ang),ey=y0+sign*r*Math.sin(ang);return `M${x0-r} ${y0} A${r} ${r} 0 0 ${sign>0?0:1} ${ex} ${ey}`};
 set('incidentArc',arc(64,theta,1));set('reflectedArc',arc(82,theta,-1));
 const thetaT=theta;
 set('transmittedArc',`M${x1+55} ${yExit} A55 55 0 0 1 ${x1+55*Math.cos(thetaT)} ${yExit+55*Math.sin(thetaT)}`);
 const insideAngle=angles[0]||0;
 [['svgThetaI',`θᵢ = ${deg(theta)}`],['svgThetaR',`θᵣ = ${deg(thetaR)}`],['svgThetaT',`θₜ = ${deg(thetaT)}`],['rayThetaI',deg(theta)],['rayThetaR',deg(thetaR)],['rayThetaOut',deg(thetaT)]].forEach(([id,v])=>{const el=$(id);if(el)el.textContent=v});
 if($('incidentLabel'))$('incidentLabel').textContent='ONDE INCIDENTE · '+deg(theta);
 if($('reflectedLabel'))$('reflectedLabel').textContent='ONDE RÉFLÉCHIE · '+deg(thetaR);
 if($('transmittedLabel'))$('transmittedLabel').textContent='ONDE TRANSMISE · '+deg(thetaT);
 const place=(id,x,y)=>{const el=$(id);if(el){el.setAttribute('x',clamp(x,20,960));el.setAttribute('y',clamp(y,35,530))}};
 place('incidentLabel',Math.max(190,x0-205),yIncident-22);place('reflectedLabel',Math.max(170,x0-220),yReflected+32);place('transmittedLabel',700,clamp(yExit+70,130,500));
 const moveText=(id,x,y)=>{const el=$(id);if(el){el.setAttribute('x',clamp(x,20,960));el.setAttribute('y',clamp(y,35,530))}};
 moveText('svgThetaI',300,yIncident+(y0-yIncident)*.55-18);moveText('svgThetaR',285,yReflected+(y0-yReflected)*.45+24);moveText('svgThetaT',690,yExit+Math.tan(thetaT)*35-18);
 if($('insideAngleLabel'))$('insideAngleLabel').textContent='θ dans le mur = '+deg(insideAngle);
 if($('sceneAngle'))$('sceneAngle').textContent=deg(theta);
 if($('rayR'))$('rayR').textContent=fmt(result.R*100,1)+' %';
 if($('rayT'))$('rayT').textContent=fmt(result.T*100,1)+' %';
 if($('rayGamma'))$('rayGamma').textContent=fmt(Math.hypot(result.Gamma.re,result.Gamma.im),3);
}function drawChart(){const rows=sweepFrequency({layers:layers.map(l=>({name:l.name,material:l.material,thicknessM:l.thicknessM,eps:l.eps,shape:s.shape,aspectRatio:s.aspect})),fraction:s.por,frequencyMinHz:.5e9,frequencyMaxHz:6e9,thetaDeg:s.angle,polarization:s.pol,epsMatrix:matrixPermittivity(s.eps,s.loss),thicknessM:s.thick,layers:layers.map(l=>({name:l.name,material:l.material,thicknessM:l.thicknessM,eps:l.eps,shape:s.shape,aspectRatio:s.aspect})),shape:s.shape,aspectRatio:s.aspect,inclusionType:s.inclusionType,saturation:s.saturation,points:121});const canvas=$('chart'),ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=220,dpr=Math.min(devicePixelRatio,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);const L=34,R=10,T=12,B=24,pw=w-L-R,ph=h-T-B;ctx.clearRect(0,0,w,h);ctx.font='9px DM Mono';ctx.fillStyle='#8197ab';for(let i=0;i<=4;i++){const y=T+ph*i/4;ctx.strokeStyle='#263b4d';ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillText((100-i*25)+'%',2,y+3)}ctx.fillText('.5 GHz',L,h-5);ctx.fillText('6 GHz',w-48,h-5);for(const [key,color] of [['R','#ff806f'],['T','#50d6ad'],['A','#f3b85f']]){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();rows.forEach((p,i)=>{const x=L+pw*i/(rows.length-1),y=T+ph*(1-p[key]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}const ix=(s.f/1e9-.5)/5.5*pw;ctx.strokeStyle='#eaf3fa';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(L+ix,T);ctx.lineTo(L+ix,T+ph);ctx.stroke();ctx.setLineDash([])}

function renderLayerList(){
 const host=$('layerList');if(!host)return;
 host.innerHTML=layers.map((l,i)=>`<div class="layer-card" data-layer="${l.id}">
  <div class="layer-card-top"><b>Couche ${i+1}</b><button type="button" class="layer-remove" data-remove-layer="${l.id}" ${layers.length===1?'disabled':''}>Supprimer</button></div>
  <label>Matériau<select data-layer-material="${l.id}"><option value="concrete" ${l.material==='concrete'?'selected':''}>Béton poreux</option><option value="insulation" ${l.material==='insulation'?'selected':''}>Isolant (εr 2,5)</option><option value="air" ${l.material==='air'?'selected':''}>Air</option><option value="water" ${l.material==='water'?'selected':''}>Eau</option><option value="ice" ${l.material==='ice'?'selected':''}>Glace</option><option value="aggregate" ${l.material==='aggregate'?'selected':''}>Granulat minéral</option></select></label>
  <label>Épaisseur (cm)<input type="number" min="0.1" max="100" step="0.1" value="${(l.thicknessM*100).toFixed(1)}" data-layer-thickness="${l.id}"></label>
 </div>`).join('');
}
function layerPermittivity(material){
 if(material==='air')return {re:1,im:0};if(material==='water')return inclusionPermittivity('water',s.f);
 if(material==='ice')return {re:3.15,im:-.003};if(material==='aggregate')return {re:5,im:-.1};
 if(material==='insulation')return {re:2.5,im:-.025};return epsEff;
}
$('addLayer')?.addEventListener('click',()=>{layers.push({id:nextLayerId++,name:'Couche',material:'concrete',thicknessM:.05,eps:{re:6,im:-.18}});renderLayerList();calculate()});
$('layerList')?.addEventListener('change',e=>{const id=Number(e.target.dataset.layerMaterial||e.target.dataset.layerThickness);const l=layers.find(x=>x.id===id);if(!l)return;if(e.target.dataset.layerMaterial){l.material=e.target.value;l.eps=layerPermittivity(l.material)}if(e.target.dataset.layerThickness)l.thicknessM=Math.max(.001,Number(e.target.value)/100||.05);calculate()});
$('layerList')?.addEventListener('click',e=>{const id=Number(e.target.dataset.removeLayer);if(!id||layers.length===1)return;layers=layers.filter(l=>l.id!==id);renderLayerList();calculate()});
renderLayerList();

let last=0;function animate(t){requestAnimationFrame(animate);const dt=Math.min(.05,(t-last)/1000||0);last=t;if(threeReady){orbit?.update();if(waveGroup?.visible)updateWavefronts(t);renderer.render(scene,camera)}if($('sceneWrap')?.classList.contains('ray-view'))updateRayDiagram(t)}requestAnimationFrame(animate);
function updateUrl(){const u=new URL(location.href);u.searchParams.set('f',(s.f/1e9).toFixed(2));u.searchParams.set('p',(s.por*100).toFixed(0));u.searchParams.set('a',String(s.angle));u.searchParams.set('pol',s.pol);u.searchParams.set('shape',s.shape);u.searchParams.set('aspect',String(s.shape==='sphere'||s.shape==='cube'?1:s.aspect));u.searchParams.set('type',s.inclusionType);u.searchParams.set('sat',String(Math.round(s.saturation*100)));history.replaceState({},'',u)}
['freq','angle','por','thick','radius','aspect','saturation'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='por')document.querySelectorAll('[data-por]').forEach(b=>b.classList.toggle('selected',+b.dataset.por===+$('por').value));calculate();if(id==='radius'||id==='por'||id==='aspect')rebuildBubbles()}));
['eps','loss'].forEach(id=>$(id).addEventListener('change',calculate));
document.querySelectorAll('[data-pol]').forEach(b=>b.addEventListener('click',()=>{s.pol=b.dataset.pol;document.querySelectorAll('[data-pol]').forEach(x=>x.classList.toggle('selected',x===b));calculate()}));
document.querySelectorAll('[data-por]').forEach(b=>b.addEventListener('click',()=>{$('por').value=b.dataset.por;document.querySelectorAll('[data-por]').forEach(x=>x.classList.toggle('selected',x===b));calculate();rebuildBubbles()}));
$('shape').addEventListener('change',()=>{s.shape=$('shape').value;$('aspect').disabled=s.shape==='cube'||s.shape==='sphere';calculate();rebuildBubbles()});$('inclusionType').addEventListener('change',()=>{calculate();rebuildBubbles()});
['wallColor','bubbleColor'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='wallColor'&&mat)mat.color.set($('wallColor').value);else rebuildBubbles()}));
$('cutaway').addEventListener('change',()=>{if(bubbleGroup)bubbleGroup.visible=$('cutaway').checked});$('wavefronts').addEventListener('change',()=>{if(waveGroup)waveGroup.visible=$('wavefronts').checked});
$('viewFront').onclick=()=>{ $('sceneWrap').classList.add('ray-view');$('viewFront').classList.add('active');$('viewIso').classList.remove('active')};$('viewIso').onclick=()=>{ $('sceneWrap').classList.remove('ray-view');if(threeReady){camera.position.set(4.4,3.1,6.7);orbit.target.set(0,0,0)}$('viewIso').classList.add('active');$('viewFront').classList.remove('active')};
$('fullscreen').onclick=()=>{const el=$('sceneWrap');if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.()};
const settingsDrawer=$('settingsDrawer'),settingsToggle=$('toggleControls');
function setSettingsOpen(open){document.body.classList.toggle('settings-open',open);settingsToggle.setAttribute('aria-expanded',String(open));settingsToggle.textContent=open?'✕ Fermer':'☰ Paramètres'}
settingsToggle.addEventListener('click',()=>{
 if(window.matchMedia('(max-width: 760px)').matches) setSettingsOpen(!document.body.classList.contains('settings-open'));
 else settingsDrawer.scrollTo({top:0,behavior:'smooth'});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('settings-open'))setSettingsOpen(false)});
setSettingsOpen(false);
$('theme').onclick=()=>{document.body.classList.toggle('light');document.documentElement.dataset.theme=document.body.classList.contains('light')?'light':'dark'};document.body.classList.add('light');$('sceneWrap').classList.add('ray-view');
$('reset').onclick=()=>{layers=[{id:1,name:'Béton',material:'concrete',thicknessM:.09,eps:{re:6,im:-.18}}];nextLayerId=2;renderLayerList();Object.assign(s,{f:1e9,angle:0,pol:'TE',por:.2,thick:.09,eps:6,loss:.03,radius:.5,shape:'sphere',aspect:2,inclusionType:'air',saturation:1});$('shape').value='sphere';$('inclusionType').value='air';$('saturation').value=100;$('aspect').disabled=false;$('aspect').value=2;$('freq').value=1;$('angle').value=0;$('por').value=20;$('thick').value=9;$('eps').value=6;$('loss').value=.03;$('radius').value=.5;document.querySelectorAll('[data-pol]').forEach(b=>b.classList.toggle('selected',b.dataset.pol==='TE'));document.querySelectorAll('[data-por]').forEach(b=>b.classList.toggle('selected',b.dataset.por==='20'));calculate();rebuildBubbles()};
$('export').onclick=()=>{const rows=sweepFrequency({layers:layers.map(l=>({name:l.name,material:l.material,thicknessM:l.thicknessM,eps:l.eps,shape:s.shape,aspectRatio:s.aspect})),fraction:s.por,frequencyMinHz:.5e9,frequencyMaxHz:6e9,thetaDeg:s.angle,polarization:s.pol,epsMatrix:matrixPermittivity(s.eps,s.loss),thicknessM:s.thick,shape:s.shape,aspectRatio:s.aspect,inclusionType:s.inclusionType,saturation:s.saturation,points:221});const csv=['frequence_GHz,reflection_R,transmission_T,absorption_A',...rows.map(p=>[p.x,p.R,p.T,p.A].join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='bubblewave-resultats.csv';a.click();URL.revokeObjectURL(a.href)};
const params=new URLSearchParams(location.search);if(params.has('shape')){$('shape').value=params.get('shape');s.shape=$('shape').value}if(params.has('aspect')){$('aspect').value=params.get('aspect');s.aspect=+$('aspect').value}if(s.shape==='cube'||s.shape==='sphere')$('aspect').disabled=true;if(params.has('f'))$('freq').value=params.get('f');if(params.has('p'))$('por').value=params.get('p');if(params.has('a'))$('angle').value=params.get('a');if(params.has('type')&&['air','water','ice','aggregate'].includes(params.get('type'))){$('inclusionType').value=params.get('type');s.inclusionType=params.get('type')}if(params.has('sat'))$('saturation').value=params.get('sat');if(params.has('pol')){s.pol=params.get('pol')==='TM'?'TM':'TE';document.querySelectorAll('[data-pol]').forEach(b=>b.classList.toggle('selected',b.dataset.pol===s.pol))}calculate();