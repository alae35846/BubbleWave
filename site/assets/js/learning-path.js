const buttons=[...document.querySelectorAll("[data-shape]")];
const silhouette=document.querySelector(".shape-silhouette");
const note=document.getElementById("shape-note");
const title=document.getElementById("shape-title");
const view=document.getElementById("view-angle");
const viewOut=document.getElementById("view-angle-value");
const incidence=document.getElementById("incidence-demo");
const incidenceOut=document.getElementById("incidence-demo-value");
const incident=document.getElementById("learning-ray");
const reflected=document.getElementById("learning-reflected");
const angleLabel=document.getElementById("learning-angle-label");
let shape="sphere";
const messages={
 sphere:"Sphère : sa silhouette orthographique reste un cercle, quelle que soit la direction.",
 ellipsoid:"Ellipsoïde : la silhouette projetée dépend de son orientation par rapport à l’observateur.",
 irregular:"Forme irrégulière : la silhouette peut changer avec la direction. Schéma qualitatif, pas un calcul de diffusion."
};
function renderShape(){
 const a=Number(view?.value||0),rad=a*Math.PI/180;
 if(viewOut)viewOut.value=a+"°";
 if(silhouette){
  if(shape==="sphere"){silhouette.setAttribute("d","M210 45a45 45 0 1 0 0 90a45 45 0 1 0 0-90Z");silhouette.setAttribute("transform","")}
  if(shape==="ellipsoid"){const rx=Math.sqrt(45**2*Math.cos(rad)**2+18**2*Math.sin(rad)**2);silhouette.setAttribute("d",`M ${210-rx} 90 a ${rx} 45 0 1 0 ${rx*2} 0 a ${rx} 45 0 1 0 -${rx*2} 0`);silhouette.setAttribute("transform","")}
  if(shape==="irregular"){silhouette.setAttribute("d","M210 43 C232 39 247 61 250 82 C258 105 238 136 216 135 C196 146 173 128 170 107 C157 87 176 61 192 58 Z");silhouette.setAttribute("transform",`rotate(${a*.28} 210 90)`)}
 }
 if(note)note.textContent=messages[shape];
 if(title)title.textContent=shape==="sphere"?"Silhouette circulaire d’une sphère":shape==="ellipsoid"?"Silhouette projetée d’un ellipsoïde":"Silhouette schématique irrégulière";
}
buttons.forEach(b=>b.addEventListener("click",()=>{shape=b.dataset.shape;buttons.forEach(x=>{const on=x===b;x.classList.toggle("is-active",on);x.setAttribute("aria-pressed",String(on))});renderShape()}));
view?.addEventListener("input",renderShape);
function renderIncidence(){
 const a=Number(incidence?.value||0),r=a*Math.PI/180,dx=174*Math.cos(r),dy=174*Math.sin(r),x=226,y=90;
 if(incident)incident.setAttribute("d",`M${x-dx} ${y-dy} L${x} ${y}`);
 if(reflected)reflected.setAttribute("d",`M${x} ${y} L${x-dx} ${y+dy}`);
 if(incidenceOut)incidenceOut.value=a+"°";
 if(angleLabel)angleLabel.textContent=a+"°";
}
incidence?.addEventListener("input",renderIncidence);
renderShape();renderIncidence();
