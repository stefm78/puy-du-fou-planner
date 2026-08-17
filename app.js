(() => {
'use strict';
const VERSION='1.3.2';
const STORE='puyPlannerV4';
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
function seedInstantPlan(){
  try{
    const D=window.PUY_DATA;
    const x=JSON.parse(localStorage.getItem(STORE)||'null')||{};
    const stale=x.engineVersion!==D.engineVersion;
    const missing=!x.customPlan?.[18]||!x.customPlan?.[19]||!x.solverMeta;
    if(!stale&&!missing) return false;
    x.engineVersion=D.engineVersion;
    x.customPlan={18:D.fallbackPlans[18],19:D.fallbackPlans[19]};
    x.solverMeta={complete:true,missing:0,minSlack:null,fallback:true,skeleton:{18:[],19:[]},at:Date.now()};
    localStorage.setItem(STORE,JSON.stringify(x));
    return true;
  }catch(err){
    console.warn('Fast-plan seed unavailable',err);
    return false;
  }
}
async function boot(){
  try{
    if(!window.PUY_DATA) throw new Error('Données du programme indisponibles');
    const seeded=seedInstantPlan();
    if(!window.PuySolver) await loadScript(`./solver.js?v=${VERSION}`);
    await loadScript(`./app-core.js?v=${VERSION}`);
    if(seeded&&typeof window.recalculate==='function'){
      setTimeout(()=>{
        try{window.recalculate(false)}catch(err){console.warn('Background optimisation failed',err)}
      },450);
    }
  }catch(err){
    console.error('Boot planner',err);
    if(status) status.textContent='Mode secours · rechargez la page';
    const box=document.getElementById('nextCard');
    if(box) box.innerHTML='<div class="eyebrow">MODE SECOURS</div><div class="nexttitle">Le planner n\'a pas pu charger son moteur</div><div class="countdown danger"><strong>Rechargez la page avec Internet.</strong><span class="small">Votre progression locale est conservée. Si le problème persiste, revenez dans ChatGPT.</span></div><div class="actions"><button class="btn primary wide" onclick="location.reload()">↻ Recharger</button></div>';
  }
}
boot();
})();
