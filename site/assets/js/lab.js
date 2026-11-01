import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';
import { maxwellGarnettSpheroid,matrixPermittivity,computeSlab,sweepFrequency,electricFieldProfile,inclusionPermittivity,porePermittivity,C0 } from './physics.js';
const $=id=>document.getElementById(id), fmt=(n,d=1)=>new Intl.NumberFormat('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n), pct=n=>fmt(n*100,1)+' %';
const s={f:1e9,angle:0,pol:'TE',por:.2,thick:.09,eps:6,loss:.03,radius:.5,shape:"sphere",aspect:2,inclusionType:"air",saturation:1,playing:true};
const EPSAIR={re:1,im:0};let result,epsEff,renderer,scene,camera,orbit,wall,bubbleGroup,waveGroup,clock;
const host=$('scene');scene=new THREE.Scene();scene.fog=new THREE.Fog(0x091725,9,22);camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(4.4,3.1,6.7);
renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.target.set(0,0,0);orbit.minDistance=3;orbit.maxDistance=14;
scene.add(new THREE.HemisphereLight(0xc6eaff,0x182638,2));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,5);scene.add(key);const rim=new THREE.PointLight(0x42cbe8,24,12);rim.position.set(-3,1,2);scene.add(rim);
const grid=new THREE.GridHelper(12,24,0x29465c,0x1b3042);grid.position.y=-1.5;scene.add(grid);
const mat=new THREE.MeshPhysicalMaterial({color:0x4e7893,metalness:.18,roughness:.38,transparent:true,opacity:.86,side:THREE.DoubleSide,clearcoat:.4});
wall=new THREE.Mesh(new THREE.BoxGeometry(3,2.8,.65),mat);scene.add(wall);
const edges=new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry),new THREE.LineBasicMaterial({color:0x8bd9e9,transparent:true,opacity:.5}));wall.add(edges);
bubbleGroup=new THREE.Group();scene.add(bubbleGroup);
const seed=()=>{let x=173;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}};
function rebuildBubbles(){bubbleGroup.clear();const rand=seed(),count=Math.round(12+s.por*95),radius=.045+s.radius*.014;for(let i=0;i<count;i++){const r=radius*(.55+rand()*.9),geometry=s.shape==='cube'?new THREE.BoxGeometry(r*1.65,r*1.65,r*1.65):new THREE.SphereGeometry(r,22,16),m=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color:$('bubbleColor').value,metalness:.05,roughness:.12,transparent:true,opacity:.72,transmission:.28,thickness:.12,clearcoat:1}));if(s.shape==='prolate')m.scale.set(1,1,s.aspect);else if(s.shape==='oblate')m.scale.set(1,1,1/s.aspect);m.rotation.set(rand()*Math.PI,rand()*Math.PI,rand()*Math.PI);m.position.set((rand()-.5)*2.8,(rand()-.5)*2.55,(rand()-.5)*.57);bubbleGroup.add(m)}}
function rebuildWaves(){waveGroup?.removeFromParent();waveGroup=new THREE.Group();scene.add(waveGroup);const colors=[0x63d8ed,0xff806f,0x50d6ad];for(let k=0;k<3;k++){const g=new THREE.Group();for(let i=0;i<5;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.32+i*.09,.009,5,72),new THREE.MeshBasicMaterial({color:colors[k],transparent:true,opacity:.72-i*.1}));ring.rotation.y=Math.PI/2;ring.position.x=(k===0?-2.8:k===1?-2.8:2.8)+(k===0?i*.27:k===1?-i*.22:-i*.22);g.add(ring)}if(k===1)g.rotation.y=Math.PI;waveGroup.add(g)}}
rebuildBubbles();rebuildWaves();
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(host);resize();
function calculate(){s.f=+$('freq').value*1e9;s.angle=+$('angle').value;s.por=+$('por').value/100;s.thick=+$('thick').value/100;s.eps=+$('eps').value;s.loss=+$('loss').value;s.radius=+$('radius').value;s.aspect=+$('aspect').value;s.shape=$('shape').value;s.inclusionType=$('inclusionType').value;s.saturation=+$('saturation').value/100;
const matrix=matrixPermittivity(s.eps,s.loss),waterOrPhase=porePermittivity(s.inclusionType,s.f,s.saturation);epsEff=maxwellGarnettSpheroid(matrix,waterOrPhase,s.por,s.shape,s.aspect);result=computeSlab({frequencyHz:s.f,thetaDeg:s.angle,polarization:s.pol,epsWall:epsEff,thicknessM:s.thick});
$('freqOut').textContent=fmt(s.f/1e9,2)+' GHz';$('angleOut').textContent=s.angle+'°';$('porOut').textContent=fmt(s.por*100,0)+' %';$('thickOut').textContent=fmt(s.thick*100,1)+' cm';$('radiusOut').textContent=fmt(s.radius,1)+' mm';$('aspectOut').textContent=fmt(s.aspect,1)+' : 1';$('saturationOut').textContent=fmt(s.saturation*100,0)+' %';$('saturationControl').style.display=s.inclusionType==='water'?'block':'none';$('porLabel').textContent=s.inclusionType==='aggregate'?'Fraction volumique de granulat':'Porosité volumique';$('aspectOut').textContent=(s.shape==='sphere'||s.shape==='cube'?'1,0':fmt(s.aspect,1))+' : 1';$('materialNote').textContent=({air:'Air : εr ≈ 1 ; pores secs.',water:'Eau à 25 °C : modèle de Debye dispersif ; le curseur règle la fraction des pores remplie.',ice:'Glace : permittivité constante indicative (approximation pédagogique).',aggregate:'Granulat minéral : inclusion solide indicative, ce n’est pas un pore.'})[s.inclusionType];
$('sceneFreq').textContent=fmt(s.f/1e9,2)+' GHz';$('sceneAngle').textContent=s.angle+'°';$('scenePol').textContent=s.pol;$('sceneLambda').textContent=fmt(C0/s.f*100,1)+' cm';
for(const [id,v] of [['R',result.R],['T',result.T],['A',result.absorption]])$(id).textContent=pct(v);
for(const [id,v] of [['barR',result.R],['barT',result.T],['barA',result.absorption]])$(id).style.width=Math.max(0,v*100)+'%';
$('balance').textContent='R + T + A = '+fmt((result.R+result.T+result.absorption)*100,3)+' %';$('balanceState').textContent=Math.abs(result.R+result.T+result.absorption-1)<1e-9?'Conservation vérifiée':'Vérifier le bilan';
$('epsEff').textContent=fmt(epsEff.re,3)+' − j'+fmt(Math.abs(epsEff.im),3);$('indexEff').textContent=fmt(result.nReal,3);$('lambdaWall').textContent=fmt(result.lambdaWall*100,2)+' cm';$('atten').textContent=fmt(result.attenuationDb,2)+' dB';
function updateRayDiagram(){
 const theta=s.angle*Math.PI/180;
 const n=Math.max(1.001,Math.sqrt(Math.max(.01,epsEff.re)));
 const theta2=Math.asin(Math.min(.999,Math.sin(theta)/n));
 const deg=x=>fmt(x*180/Math.PI,1)+'°';
 const x0=320,y0=105,xL=145,xR=620;
 const rayLength=100;
 const xIncident=x0-rayLength*Math.cos(theta), yIncident=y0+rayLength*Math.sin(theta);
 const xReflected=x0-rayLength*Math.cos(theta), yReflected=y0-rayLength*Math.sin(theta);
 const yInside=y0-Math.tan(theta2)*110;
 const xTransmit=430+55*Math.cos(theta), yExit=yInside-55*Math.sin(theta);
 const set=(id,d)=>{const el=$(id);if(el)el.setAttribute('d',d)};
 set('incidentRay',`M${xIncident} ${yIncident}L${x0} ${y0}`);
 set('reflectedRay',`M${x0} ${y0}L${xReflected} ${yReflected}`);
 set('refractedRay',`M${x0} ${y0}L430 ${yInside}`);
 set('transmittedRay',`M430 ${yInside}L${xTransmit} ${yExit}`);
 const arc=(cx,cy,r,a,side=1)=>{const x1=cx-r*Math.cos(a),y1=cy+side*r*Math.sin(a),x2=cx-r,y2=cy;return `M${x2} ${y2}A${r} ${r} 0 0 0 ${x1} ${y1}`};
 set('thetaIncidentArc',arc(x0,y0,40,theta,1));
 set('thetaReflectedArc',arc(x0,y0,54,theta,-1));
 set('thetaRefractedArc',arc(x0,y0,27,theta2,-1));
 $('incidentLabel').textContent='INCIDENTE · θᵢ = '+deg(theta);
 $('reflectedLabel').textContent='RÉFLÉCHIE · θᵣ = '+deg(theta);
 $('refractedLabel').textContent='RÉFRACTÉE · θ₂ = '+deg(theta2);
 $('rayThetaI').textContent=s.angle===0?'0° · incidence normale':deg(theta)+' · oblique';
 $('rayThetaR').textContent=deg(theta);
 $('rayTheta2').textContent=deg(theta2);
 $('rayThetaOut').textContent=deg(theta);
}
const c=x=>fmt(x.re,3)+(x.im<0?' − j':' + j')+fmt(Math.abs(x.im),3);$('gamma').textContent=c(result.Gamma);$('tau').textContent=c(result.tau);
$('insight').innerHTML='<b>Lecture physique</b><p>'+(s.angle===0?'Incidence normale : les coefficients TE et TM sont identiques. ':'Incidence oblique : les admittances dépendent de la polarisation. ')+(s.por>0?'Les bulles diminuent la permittivité effective du béton. ':'Sans porosité, le mur est modélisé comme du béton plein. ')+(result.absorption>result.R?'Ici, la dissipation dans le mur domine la réflexion.':'Ici, la réflexion est supérieure à l’absorption.')+'</p>';
$('sceneNote').textContent=({sphere:'SPHÈRES',prolate:'SPHÉROÏDES ALLONGÉS',oblate:'SPHÉROÏDES APLATIS',cube:'CUBES · GÉOMÉTRIE ILLUSTRATIVE'})[s.shape]+' · '+Math.round(s.por*100)+' %';
mat.color.set($('wallColor').value);wall.scale.z=Math.max(.3,s.thick/.09);wall.position.z=0;bubbleGroup.scale.z=Math.max(.3,s.thick/.09);bubbleGroup.visible=$('cutaway').checked;waveGroup.visible=$('wavefronts').checked;
updateRayDiagram();drawChart();updateUrl();
}
function drawChart(){const rows=sweepFrequency({fraction:s.por,frequencyMinHz:.5e9,frequencyMaxHz:6e9,thetaDeg:s.angle,polarization:s.pol,epsMatrix:matrixPermittivity(s.eps,s.loss),thicknessM:s.thick,shape:s.shape,aspectRatio:s.aspect,inclusionType:s.inclusionType,saturation:s.saturation,points:121});const canvas=$('chart'),ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=220,dpr=Math.min(devicePixelRatio,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);const L=34,R=10,T=12,B=24,pw=w-L-R,ph=h-T-B;ctx.clearRect(0,0,w,h);ctx.font='9px DM Mono';ctx.fillStyle='#8197ab';for(let i=0;i<=4;i++){const y=T+ph*i/4;ctx.strokeStyle='#263b4d';ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillText((100-i*25)+'%',2,y+3)}ctx.fillText('.5 GHz',L,h-5);ctx.fillText('6 GHz',w-48,h-5);for(const [key,color] of [['R','#ff806f'],['T','#50d6ad'],['A','#f3b85f']]){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();rows.forEach((p,i)=>{const x=L+pw*i/(rows.length-1),y=T+ph*(1-p[key]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}const ix=(s.f/1e9-.5)/5.5*pw;ctx.strokeStyle='#eaf3fa';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(L+ix,T);ctx.lineTo(L+ix,T+ph);ctx.stroke();ctx.setLineDash([])}
let last=0;function animate(t){requestAnimationFrame(animate);const dt=Math.min(.05,(t-last)/1000||0);last=t;orbit.update();if(waveGroup?.visible){waveGroup.rotation.y+=dt*.12;waveGroup.children.forEach((g,i)=>{g.children.forEach((o,j)=>{o.material.opacity=.28+.42*(.5+.5*Math.sin(t*.0018+j*.7+i))})})}renderer.render(scene,camera)}requestAnimationFrame(animate);
function updateUrl(){const u=new URL(location.href);u.searchParams.set('f',(s.f/1e9).toFixed(2));u.searchParams.set('p',(s.por*100).toFixed(0));u.searchParams.set('a',String(s.angle));u.searchParams.set('pol',s.pol);u.searchParams.set('shape',s.shape);u.searchParams.set('aspect',String(s.shape==='sphere'||s.shape==='cube'?1:s.aspect));u.searchParams.set('type',s.inclusionType);u.searchParams.set('sat',String(Math.round(s.saturation*100)));history.replaceState({},'',u)}
['freq','angle','por','thick','radius','aspect','saturation'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='por')document.querySelectorAll('[data-por]').forEach(b=>b.classList.toggle('selected',+b.dataset.por===+$('por').value));calculate();if(id==='radius'||id==='por'||id==='aspect')rebuildBubbles()}));
['eps','loss'].forEach(id=>$(id).addEventListener('change',calculate));
document.querySelectorAll('[data-pol]').forEach(b=>b.addEventListener('click',()=>{s.pol=b.dataset.pol;document.querySelectorAll('[data-pol]').forEach(x=>x.classList.toggle('selected',x===b));calculate()}));
document.querySelectorAll('[data-por]').forEach(b=>b.addEventListener('click',()=>{$('por').value=b.dataset.por;document.querySelectorAll('[data-por]').forEach(x=>x.classList.toggle('selected',x===b));calculate();rebuildBubbles()}));
$('shape').addEventListener('change',()=>{s.shape=$('shape').value;$('aspect').disabled=s.shape==='cube'||s.shape==='sphere';calculate();rebuildBubbles()});$('inclusionType').addEventListener('change',()=>{calculate();rebuildBubbles()});
['wallColor','bubbleColor'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='wallColor')mat.color.set($('wallColor').value);else rebuildBubbles()}));
$('cutaway').addEventListener('change',()=>bubbleGroup.visible=$('cutaway').checked);$('wavefronts').addEventListener('change',()=>waveGroup.visible=$('wavefronts').checked);
$('viewFront').onclick=()=>{camera.position.set(0,0,8);orbit.target.set(0,0,0);$('viewFront').classList.add('active');$('viewIso').classList.remove('active')};$('viewIso').onclick=()=>{camera.position.set(4.4,3.1,6.7);orbit.target.set(0,0,0);$('viewIso').classList.add('active');$('viewFront').classList.remove('active')};
$('fullscreen').onclick=()=>{const el=$('sceneWrap');if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.()};
const settingsDrawer=$('settingsDrawer'),settingsToggle=$('toggleControls');
function setSettingsOpen(open){document.body.classList.toggle('settings-open',open);settingsToggle.setAttribute('aria-expanded',String(open));settingsToggle.textContent=open?'✕ Fermer':'☰ Paramètres'}
settingsToggle.addEventListener('click',()=>{
 if(window.matchMedia('(max-width: 760px)').matches) setSettingsOpen(!document.body.classList.contains('settings-open'));
 else settingsDrawer.scrollTo({top:0,behavior:'smooth'});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('settings-open'))setSettingsOpen(false)});
setSettingsOpen(false);
$('theme').onclick=()=>{document.body.classList.toggle('light');document.documentElement.dataset.theme=document.body.classList.contains('light')?'light':'dark'};
$('reset').onclick=()=>{Object.assign(s,{f:1e9,angle:0,pol:'TE',por:.2,thick:.09,eps:6,loss:.03,radius:.5,shape:'sphere',aspect:2,inclusionType:'air',saturation:1});$('shape').value='sphere';$('inclusionType').value='air';$('saturation').value=100;$('aspect').disabled=false;$('aspect').value=2;$('freq').value=1;$('angle').value=0;$('por').value=20;$('thick').value=9;$('eps').value=6;$('loss').value=.03;$('radius').value=.5;document.querySelectorAll('[data-pol]').forEach(b=>b.classList.toggle('selected',b.dataset.pol==='TE'));document.querySelectorAll('[data-por]').forEach(b=>b.classList.toggle('selected',b.dataset.por==='20'));calculate();rebuildBubbles()};
$('export').onclick=()=>{const rows=sweepFrequency({fraction:s.por,frequencyMinHz:.5e9,frequencyMaxHz:6e9,thetaDeg:s.angle,polarization:s.pol,epsMatrix:matrixPermittivity(s.eps,s.loss),thicknessM:s.thick,shape:s.shape,aspectRatio:s.aspect,inclusionType:s.inclusionType,saturation:s.saturation,points:221});const csv=['frequence_GHz,reflection_R,transmission_T,absorption_A',...rows.map(p=>[p.x,p.R,p.T,p.A].join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='bubblewave-resultats.csv';a.click();URL.revokeObjectURL(a.href)};
const params=new URLSearchParams(location.search);if(params.has('shape')){$('shape').value=params.get('shape');s.shape=$('shape').value}if(params.has('aspect')){$('aspect').value=params.get('aspect');s.aspect=+$('aspect').value}if(s.shape==='cube'||s.shape==='sphere')$('aspect').disabled=true;if(params.has('f'))$('freq').value=params.get('f');if(params.has('p'))$('por').value=params.get('p');if(params.has('a'))$('angle').value=params.get('a');if(params.has('type')&&['air','water','ice','aggregate'].includes(params.get('type'))){$('inclusionType').value=params.get('type');s.inclusionType=params.get('type')}if(params.has('sat'))$('saturation').value=params.get('sat');if(params.has('pol')){s.pol=params.get('pol')==='TM'?'TM':'TE';document.querySelectorAll('[data-pol]').forEach(b=>b.classList.toggle('selected',b.dataset.pol===s.pol))}calculate();