(() => {
'use strict';
const VERSION='1.3.1';
const status=document.getElementById('sourceLine');
if(status) status.textContent='Initialisation…';
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.async=false;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('Impossible de charger '+src));
    document.head.appendChild(s);
  });
}
async function boot(){
  try{
    if(!window.PUY_DATA) throw new Error('Données du programme indisponibles');
    if(!window.PuySolver) await loadScript(`./solver.js?v=${VERSION}`);
    await loadScript(`./app-core.js?v=${VERSION}`);
  }catch(err){
    console.error('Boot planner',err);
    if(status) status.textContent='Mode secours · rechargez la page';
    const box=document.getElementById('nextCard');
    if(box) box.innerHTML='<div class="eyebrow">MODE SECOURS</div><div class="nexttitle">Le planner n\'a pas pu charger son moteur</div><div class="countdown danger"><strong>Rechargez la page avec Internet.</strong><span class="small">Votre progression locale est conservée. Si le problème persiste, revenez dans ChatGPT.</span></div><div class="actions"><button class="btn primary wide" onclick="location.reload()">↻ Recharger</button></div>';
  }
}
boot();
})();
