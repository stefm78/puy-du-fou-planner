(() => {
'use strict';
const VERSION='1.4.1';
const STORE='puyPlannerV4';
const SCRIPT_TIMEOUT_MS=4500;
const status=document.getElementById('sourceLine');
const bootStarted=performance.now();
let bootStage='démarrage',bootError=null,progressTimer=null;

function elapsed(){return ((performance.now()-bootStarted)/1000).toFixed(1)}
function ensureProgress(){
  let p=document.getElementById('engineProgress');
  if(p)return p;
  const main=document.querySelector('.main');
  if(!main)return null;
  p=document.createElement('div');
  p.id='engineProgress';
  p.className='notice';
  p.style.marginBottom='10px';
  main.prepend(p);
  return p;
}
function setProgress(stage,pct,detail='',state='active'){
  bootStage=stage;
  const p=ensureProgress();
  if(!p)return;
  p.dataset.state=state;
  const safePct=Math.max(0,Math.min(100,pct));
  p.innerHTML=`<strong>${stage}</strong><br><span id="bootProgressDetail">${detail}</span><div style="height:6px;background:#eadfd4;border-radius:99px;margin-top:8px;overflow:hidden"><div style="width:${safePct}%;height:100%;background:#701c2b;transition:width .2s"></div></div><div class="small" style="margin-top:5px">v${VERSION} · ${elapsed()} s · ${state==='failed'?'diagnostic disponible':'progression du démarrage'}</div>`;
}
function startTicker(){
  clearInterval(progressTimer);
  progressTimer=setInterval(()=>{
    const p=document.getElementById('engineProgress');
    if(!p||p.dataset.state!=='active')return;
    const d=p.querySelector('.small');
    if(d)d.textContent=`v${VERSION} · ${elapsed()} s · progression du démarrage`;
  },250);
}
function stopTicker(){clearInterval(progressTimer);progressTimer=null}
function bootDiagnostic(){
  return [
    'PUY_BOOT_DIAG_V1',
    `version=${VERSION}`,
    `stage=${bootStage}`,
    `elapsed_s=${elapsed()}`,
    `online=${navigator.onLine}`,
    `data=${!!window.PUY_DATA}`,
    `solver=${!!window.PuySolver}`,
    `core=${typeof window.recalculate==='function'}`,
    `sw_controller=${!!navigator.serviceWorker?.controller}`,
    `error=${bootError?.message||'none'}`,
    `ua=${navigator.userAgent}`
  ].join('\n');
}
async function copyBootDiagnostic(){
  const t=bootDiagnostic();
  try{await navigator.clipboard.writeText(t)}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}
  const p=ensureProgress();if(p)p.insertAdjacentHTML('beforeend','<div class="small" style="margin-top:6px"><b>Diagnostic copié.</b> Collez-le dans ChatGPT.</div>');
}
async function forceReload(){
  setProgress('Nettoyage du cache…',20,'La progression de visite est conservée dans le stockage local.');
  try{
    if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('puy-planner-')).map(k=>caches.delete(k)))}
    if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(()=>{})))}
  }catch(e){console.warn('Force refresh cleanup',e)}
  location.replace(`./?force=${Date.now()}`);
}
function loadScript(src,label){
  return new Promise((resolve,reject)=>{
    let done=false;
    const s=document.createElement('script');
    const timer=setTimeout(()=>{
      if(done)return;done=true;s.remove();reject(new Error(`Timeout ${label} après ${SCRIPT_TIMEOUT_MS/1000}s`));
    },SCRIPT_TIMEOUT_MS);
    s.src=src;s.async=false;
    s.onload=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};
    s.onerror=()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error(`Impossible de charger ${label}`))};
    document.head.appendChild(s);
  });
}
function seedInstantPlan(){
  try{
    const D=window.PUY_DATA;
    const x=JSON.parse(localStorage.getItem(STORE)||'null')||{};
    const stale=x.engineVersion!==D.engineVersion;
    const missing=!x.customPlan?.[18]||!x.customPlan?.[19]||!x.solverMeta;
    if(!stale&&!missing)return false;
    x.engineVersion=D.engineVersion;
    x.customPlan={18:D.fallbackPlans[18],19:D.fallbackPlans[19]};
    x.solverMeta={complete:true,missing:0,minSlack:null,fallback:true,skeleton:{18:[],19:[]},at:Date.now()};
    localStorage.setItem(STORE,JSON.stringify(x));
    return true;
  }catch(err){console.warn('Fast-plan seed unavailable',err);return false}
}
function fallbackName(e){const a=window.PUY_DATA?.activities?.find(x=>String(x.id)===String(e.id));return a?.name||e.name||String(e.id)}
function fallbackZone(e){const a=window.PUY_DATA?.activities?.find(x=>String(x.id)===String(e.id));return e.zone||a?.zone||'M'}
function renderInstantFallback(){
  const D=window.PUY_DATA;if(!D)return;
  const plan=D.fallbackPlans?.[18]||[];const first=plan[0];
  if(status)status.textContent=`Plan nominal prêt · moteur en chargement · v${VERSION}`;
  const sb=document.getElementById('statusbar');if(sb)sb.innerHTML='<span class="chip good">Plan nominal actif</span><span class="chip">18 août</span><span class="chip">Moteur en chargement</span>';
  const box=document.getElementById('nextCard');if(box&&first)box.innerHTML=`<div class="eyebrow">PLAN DISPONIBLE IMMÉDIATEMENT</div><div class="nexttitle">${first.id} · ${fallbackName(first)}</div><div class="meta"><span class="badge zone">${fallbackZone(first)}</span><span class="badge o">O · grand spectacle</span><span class="badge cover">contre-courant</span></div><div class="countdown safe"><strong>${first.start}</strong><span class="small">Le planning nominal H→M→B est utilisable pendant l’initialisation du moteur.</span></div>`;
  const tl=document.getElementById('timeline');if(tl)tl.innerHTML=plan.map(e=>`<div class="item ${Number(e.id)<=7?'priority':''} ${e.kind==='fixed'?'fixed':''}"><div class="time">${e.start}</div><div><div class="iname">${Number.isFinite(Number(e.id))?e.id+' · ':''}${fallbackName(e)}</div><div class="isub">${fallbackZone(e)} · plan nominal</div></div><div class="dot"></div></div>`).join('');
}
function showFailure(err){
  bootError=err;stopTicker();
  if(status)status.textContent='Mode nominal · moteur non chargé';
  const p=ensureProgress();
  if(p){p.dataset.state='failed';p.className='alert';p.innerHTML=`<b>Le moteur n'a pas terminé son initialisation.</b><br>Le plan nominal reste affiché et aucune progression de visite n'a été effacée.<div class="small" style="margin-top:6px">Étape : <b>${bootStage}</b> · ${elapsed()} s · ${err.message}</div><div class="actions" style="margin-top:9px"><button class="btn primary" onclick="forceReload()">↻ Recharger avec force</button><button class="btn outline" onclick="copyBootDiagnostic()">Copier diagnostic</button></div>`}
}
async function boot(){
  try{
    startTicker();
    setProgress('1/3 · Préparation',15,'Chargement des données et du plan nominal H→M→B.');
    if(!window.PUY_DATA)throw new Error('Données du programme indisponibles');
    seedInstantPlan();
    renderInstantFallback();
    await new Promise(r=>setTimeout(r,30));

    if(!window.PuySolver){
      setProgress('2/3 · Moteur',45,'Chargement du moteur de réparation global.');
      await loadScript(`./solver.js?v=${VERSION}`,'solver.js');
    }else setProgress('2/3 · Moteur',60,'Moteur déjà disponible.');

    setProgress('3/3 · Interface',78,'Chargement des interactions du planner.');
    await loadScript(`./app-core.js?v=${VERSION}`,'app-core.js');
    if(typeof window.recalculate!=='function')throw new Error('Interface chargée mais moteur non exposé');

    const bootState=JSON.parse(localStorage.getItem(STORE)||'null');
    if(bootState?.solverMeta?.fallback){
      setProgress('3/3 · Interface',90,'Validation du plan nominal et insertion des activités secondaires.');
      window.recalculate(false);
    }

    stopTicker();
    setProgress('Prêt',100,'Planner opérationnel · 15 activités · H→M→B sur les deux jours.','done');
    setTimeout(()=>document.getElementById('engineProgress')?.remove(),1400);
  }catch(err){console.error('Boot planner',err);showFailure(err)}
}
Object.assign(window,{copyBootDiagnostic,forceReload});
boot();
})();
