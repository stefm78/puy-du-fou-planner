(() => {
'use strict';
const D=window.PUY_DATA, ENGINE=window.PuySolver.create(D);
const ACT=Object.fromEntries(D.activities.map(a=>[String(a.id),a]));
const STORE='puyPlannerV4';
const DEFAULT={
  version:5,engineVersion:D.engineVersion,day:18,
  completed:{18:[],19:[]},blocked:{18:{},19:{}},postponed18:[],
  manualZone:{18:'auto',19:'auto'},lastZone:{18:null,19:null},virtualTime:{18:'09:00',19:'09:00'},
  customPlan:{18:null,19:null},lunchDone:{18:false,19:false},solverMeta:null,history:[]
};
let state=loadState(),swRegistration=null,toastTimer=null;

const clone=x=>JSON.parse(JSON.stringify(x));
const min=window.PuySolver.minutes,tm=window.PuySolver.time;
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function isLiveDay(day){return todayKey()===`2026-08-${day}`}
function nowMin(day=state.day){const d=new Date();return isLiveDay(day)?d.getHours()*60+d.getMinutes():min(state.virtualTime[day]||D.opening[day])}
function activity(id){return ACT[String(id)]}
function labelZone(z){return z==='H'?'Haut':z==='B'?'Bas':'Milieu'}
function travel(a,b){return D.travel[a]?.[b]??12}
function arrivalBuffer(e){if(e.arrivalBuffer!=null)return e.arrivalBuffer;const a=activity(e.id);return e.kind==='show'&&a?.priority?D.placementPriorityMin:e.kind==='show'?D.normalShowBufferMin:0}
function exitBuffer(e){const a=activity(e.id);return e.kind==='show'&&a?.priority?6:e.kind==='show'?3:0}
function durationOf(e){return e.duration??activity(e.id)?.duration??0}
function zoneOf(e){return e.zone||activity(e.id)?.zone||'M'}
function nameOf(e){return e.name||activity(e.id)?.name||String(e.id)}
function endMin(e){return min(e.start)+durationOf(e)+exitBuffer(e)}

function loadState(){
  try{
    const x=JSON.parse(localStorage.getItem(STORE)||'null');if(!x)return clone(DEFAULT);
    const migrated={...clone(DEFAULT),...x,
      completed:{...clone(DEFAULT.completed),...(x.completed||{})},blocked:{...clone(DEFAULT.blocked),...(x.blocked||{})},
      manualZone:{...clone(DEFAULT.manualZone),...(x.manualZone||{})},lastZone:{...clone(DEFAULT.lastZone),...(x.lastZone||{})},
      virtualTime:{...clone(DEFAULT.virtualTime),...(x.virtualTime||{})},lunchDone:{...clone(DEFAULT.lunchDone),...(x.lunchDone||{})},
      customPlan:{...clone(DEFAULT.customPlan),...(x.customPlan||{})},history:x.history||[],postponed18:x.postponed18||x.postponed?.[18]||[]};
    if(x.engineVersion!==D.engineVersion){migrated.engineVersion=D.engineVersion;migrated.customPlan={18:null,19:null};migrated.solverMeta=null}
    return migrated;
  }catch(e){return clone(DEFAULT)}
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));return true}catch(e){console.warn(e);toast('Sauvegarde locale indisponible');return false}}
function snapshot(label){const clean=clone({...state,history:[]});state.history.push({label,at:Date.now(),state:clean});if(state.history.length>15)state.history.shift()}
function undoLast(){if(!state.history.length)return toast('Rien à annuler');const h=state.history.pop(),hist=state.history;state=h.state;state.history=hist;save();recalculate(false);toast('Action annulée')}

function isDone(day,id){const s=String(id);return state.completed[day].includes(s)||(day===19&&state.completed[18].includes(s))}
function isPostponed(day,id){return day===18&&state.postponed18.includes(String(id))}
function isBlocked(day,id,start){return(state.blocked[day]?.[String(id)]||[]).includes(start)}
function basePlan(day){return clone(D.fallbackPlans[day]||[])}
function currentPlan(day=state.day){return state.customPlan[day]||basePlan(day)}
function currentZone(day=state.day){
  const manual=state.manualZone[day];if(manual&&manual!=='auto')return manual;
  if(state.lastZone[day])return state.lastZone[day];
  const n=nowMin(day),plan=currentPlan(day);let z=D.strategy.entranceZone;
  const openingMove=plan.find(e=>e.openingMove&&min(e.start)>n);
  if(openingMove&&n>=min(D.opening[day]))return zoneOf(openingMove);
  for(const e of plan)if(endMin(e)<=n)z=zoneOf(e);
  return z;
}
function solverInput(){
  return {day:state.day,now:{18:nowMin(18),19:nowMin(19)},zone:{18:state.day===18?currentZone(18):D.strategy.entranceZone,19:state.day===19?currentZone(19):D.strategy.entranceZone},completed:state.completed,blocked:state.blocked,postponed18:state.postponed18,lunchDone:state.lunchDone};
}
function ensurePlan(){if(!state.customPlan[state.day]||!state.solverMeta)recalculate(false)}
function recalculate(userInitiated=false,forceFirst=null){
  if(userInitiated)snapshot('Recalcul global');
  const sol=ENGINE.solve(solverInput(),forceFirst?{forceFirst}:{});
  if(state.day===18){state.customPlan[18]=sol.plans[18];state.customPlan[19]=sol.plans[19]}
  else state.customPlan[19]=sol.plans[19];
  state.solverMeta={...sol.diagnostics,skeleton:sol.skeleton,at:Date.now()};save();render();
  if(userInitiated)toast('Planning global recalculé');
  if(!sol.diagnostics.complete)setTimeout(openChatGPT,250);
  return sol;
}

function entryStatus(e,day=state.day,n=nowMin(day)){
  if(e.kind==='lunch'&&state.lunchDone[day])return'done';
  if(e.kind!=='fixed'&&e.kind!=='lunch'&&isDone(day,e.id))return'done';
  if(endMin(e)<=n)return'past';if(min(e.start)<=n&&endMin(e)>n)return'current';return'future';
}
function nextEntry(day=state.day){const n=nowMin(day),p=currentPlan(day);return p.find(e=>entryStatus(e,day,n)==='current')||p.find(e=>entryStatus(e,day,n)==='future')||null}
function riskAnalysis(){const m=state.solverMeta||{};return{missing:m.missing||0,complete:m.complete!==false,minSlack:m.minSlack}}
function recommendedLeave(e,z){
  if(e.openingMove)return min(D.opening[state.day]);
  return min(e.start)-arrivalBuffer(e)-travel(z,zoneOf(e));
}

function markDone(id){
  snapshot('Fait');const d=state.day,s=String(id);
  if(s==='lunch')state.lunchDone[d]=true;
  else if(!['dinner','noces'].includes(s)&&!state.completed[d].includes(s)){state.completed[d].push(s);if(activity(id))state.lastZone[d]=activity(id).zone}
  save();recalculate(false);toast('Fait · les deux jours ont été réoptimisés');
}
function toggleDone(id){
  snapshot('Basculer fait');const d=state.day,s=String(id),i=state.completed[d].indexOf(s);
  if(i>=0)state.completed[d].splice(i,1);else{state.completed[d].push(s);if(activity(id))state.lastZone[d]=activity(id).zone}
  save();recalculate(false);
}
function blockCurrent(id,start,why){
  snapshot(why);const d=state.day,k=String(id);state.blocked[d][k]=state.blocked[d][k]||[];if(!state.blocked[d][k].includes(start))state.blocked[d][k].push(start);
  save();const sol=recalculate(false);toast(why==='full'?'Séance marquée complète · plan recalculé':'Séance abandonnée · plan recalculé');if(!sol.diagnostics.complete)setTimeout(openChatGPT,250);
}
function postpone(id){if(state.day!==18)return;snapshot('Report 19');const k=String(id);if(!state.postponed18.includes(k))state.postponed18.push(k);save();recalculate(false);toast('Reporté au 19 et planning global recalculé')}
function manualZone(v){snapshot('Position');state.manualZone[state.day]=v;if(v!=='auto')state.lastZone[state.day]=v;save();recalculate(false)}
function setDay(d){state.day=d;save();if(!state.customPlan[d])recalculate(false);else render()}

function renderStatus(){
  const d=state.day,n=nowMin(d),z=currentZone(d),done=[...new Set([...state.completed[18],...(d===19?state.completed[19]:[])])].length,r=riskAnalysis();
  const viability=r.complete?'<span class="chip good">Tous les O sécurisables</span>':`<span class="chip bad">${r.missing} O à arbitrer</span>`;
  document.getElementById('statusbar').innerHTML=`<span class="chip">${tm(n)}</span><span class="chip">Zone ${z}</span><span class="chip good">${done} fait${done>1?'s':''}</span>${viability}`;
}
function renderAlerts(){
  const r=riskAnalysis(),d=state.day;let h='';
  if(d===19)h+=`<div class="notice" style="margin-bottom:10px"><strong>19 août provisoire :</strong> horaires encore copiés du 18. Le moteur réoptimisera automatiquement dès remplacement par le programme officiel.</div>`;
  if(d===18&&nowMin(18)<=10*60+15)h+=`<div class="notice" style="margin-bottom:10px"><strong>Stratégie contre-courant :</strong> le solveur optimise les 18 + 19 ensemble et privilégie un départ profond vers le Haut à l'ouverture plutôt que la première attraction rencontrée.</div>`;
  if(!r.complete)h+=`<div class="alert"><b>Arbitrage nécessaire</b><br>Le solveur local ne peut plus garantir tous les spectacles O sur les deux jours.<button class="btn primary" onclick="openChatGPT()">🤖 Demander à ChatGPT</button></div>`;
  document.getElementById('alerts').innerHTML=h;
}
function renderNext(){
  const e=nextEntry(),box=document.getElementById('nextCard'),d=state.day,n=nowMin(d),z=currentZone(d);
  if(!e){box.innerHTML='<div class="eyebrow">Terminé</div><div class="nexttitle">Plus d’étape planifiée</div><button class="btn primary" onclick="recalculate(true)">Recalculer</button>';return}
  const a=activity(e.id),ez=zoneOf(e),walk=travel(z,ez),buf=arrivalBuffer(e),leave=recommendedLeave(e,z),delta=leave-n,cls=delta<0?'danger':delta<=15?'wait':'safe';
  let msg;if(e.openingMove&&n<min(D.opening[d]))msg=`À l’ouverture ${D.opening[d]}, partez vers le ${labelZone(ez)}`;else if(e.openingMove&&n<=min(D.opening[d])+15)msg=`Partez maintenant vers le ${labelZone(ez)} · contre-courant`;else if(e.kind==='fixed')msg=`Rendez-vous à ${e.start}`;else msg=delta<=0?'Partez maintenant':`Départ conseillé ${tm(leave)} · dans ${delta} min`;
  const badges=[`<span class="badge zone">${labelZone(ez)} · ${ez}</span>`];if(a?.priority)badges.push('<span class="badge o">O · grand spectacle</span>');if(a?.covered)badges.push('<span class="badge cover">Couvert</span>');if(e.openingMove)badges.push('<span class="badge cover">Contre-courant</span>');
  let actions='';
  if(e.kind==='show'||e.kind==='flex')actions=`<button class="btn good" onclick="markDone('${e.id}')">✓ Fait</button>${e.kind==='show'?`<button class="btn bad" onclick="blockCurrent('${e.id}','${e.start}','full')">🚫 Complet</button><button class="btn outline" onclick="blockCurrent('${e.id}','${e.start}','late')">⌛ Trop tard</button>`:''}<button class="btn outline" onclick="openAlternatives()">⇄ Changer</button>${d===18&&a?.priority?`<button class="btn outline wide" onclick="postpone('${e.id}')">↪ Reporter au 19</button>`:''}`;
  else if(e.kind==='lunch')actions='<button class="btn good" onclick="markDone(\'lunch\')">✓ Déjeuner terminé</button><button class="btn outline" onclick="openAlternatives()">⇄ Recalculer</button>';
  else actions='<button class="btn outline wide" onclick="openAlternatives()">Voir les alternatives</button>';
  const detail=e.kind==='show'?`Spectacle ${e.start} · placement ${buf} min · marche prudente ${walk} min`:e.note||`Durée ${durationOf(e)} min`;
  box.innerHTML=`<div class="eyebrow">${entryStatus(e)==='current'?'MAINTENANT':'PROCHAINE ÉTAPE'}</div><div class="nexttitle">${a?`${a.id} · `:''}${nameOf(e)}</div><div class="meta">${badges.join('')}</div><div class="countdown ${cls}"><strong>${msg}</strong><span class="small">${detail}</span></div><div class="actions">${actions}</div>`;
}
function renderTimeline(){
  const d=state.day,n=nowMin(d);let h='';
  for(const e of currentPlan(d)){
    const st=entryStatus(e,d,n),a=activity(e.id),classes=['item',a?.priority?'priority':'',e.kind==='fixed'?'fixed':'',st==='current'?'current':'',st==='done'||st==='past'?'done':''].join(' '),sub=[labelZone(zoneOf(e)),a?.priority?'O':null,a?.covered?'couvert':null,e.openingMove?'contre-courant':null,e.note||null].filter(Boolean).join(' · ');
    h+=`<div class="${classes}"><div class="time">${e.start}</div><div><div class="iname">${a?`${a.id} · `:''}${nameOf(e)}</div><div class="isub">${sub}</div></div><div class="dot"></div></div>`;
  }
  document.getElementById('timeline').innerHTML=h||'<div class="notice">Aucune étape future.</div>';
}
function plannedSlot(id){for(const d of [18,19]){const e=currentPlan(d).find(x=>String(x.id)===String(id));if(e)return`${d}/08 ${e.start}`}return''}
function renderShows(){
  let h='';const d=state.day;
  for(const z of ['H','M','B']){
    h+=`<div class="sectionTitle">${z} · ${labelZone(z)}</div>`;
    for(const a of D.activities.filter(x=>x.zone===z)){
      const done=isDone(d,a.id),post=isPostponed(d,a.id),times=a.sessions?a.sessions.join(' · '):(a.continuous||[]).map(w=>w.join('–')).join(' · '),slot=plannedSlot(a.id);
      h+=`<div class="showrow ${done?'done':''}"><div class="num">${a.id}</div><div class="grow"><div class="name">${a.name}</div><div class="details">${a.priority?'O · ':''}${a.covered?'couvert':'extérieur'} · ${a.duration} min<br>${times}${slot?`<br><b>Plan : ${slot}</b>`:''}${post?' · REPORTÉ AU 19':''}</div></div><button class="iconbtn" onclick="toggleDone('${a.id}')">${done?'↶':'✓'}</button></div>`;
    }
  }
  document.getElementById('showsList').innerHTML=h;
}
function renderEngine(){
  const m=state.solverMeta||{},sk=m.skeleton||{18:[],19:[]};document.getElementById('zoneSelect').value=state.manualZone[state.day]||'auto';
  const fmt=d=>(sk[d]||[]).map(x=>`${x.id} ${activity(x.id)?.name} ${x.start}`).join(' → ')||'aucun O restant';
  document.getElementById('engineState').innerHTML=`Heure : <b>${tm(nowMin())}</b> · position : <b>${currentZone()}</b><br>Moteur : <b>optimisation globale 18 + 19</b>, stratégie <b>${D.strategy.label}</b>.<br>Ordre de décision : couverture des O → robustesse → chaleur → trajectoire sans retours → dernière chance → marche / affluence heuristique.<br><br><b>18 :</b> ${fmt(18)}<br><b>19 :</b> ${fmt(19)}<br><b>Marge minimale entre grands spectacles :</b> ${m.minSlack==null?'—':m.minSlack+' min'}<br><br>Les activités non-O sont ajoutées seulement dans les créneaux qui ne fragilisent pas ce squelette.`;
}
function render(){renderAlerts();renderStatus();renderNext();renderTimeline();renderShows();renderEngine();document.getElementById('day18').classList.toggle('active',state.day===18);document.getElementById('day19').classList.toggle('active',state.day===19);document.getElementById('sourceLine').textContent=state.day===18?`18 officiel · édition ${D.sourceEdit} · v${D.appVersion}`:`19 provisoire · v${D.appVersion}`}

function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
function openModal(html){document.getElementById('sheet').innerHTML=html;document.getElementById('modal').classList.add('open')}
function closeModal(){document.getElementById('modal').classList.remove('open')}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
function openAlternatives(){
  const alts=ENGINE.alternatives(solverInput(),state.day,6);
  openModal(`<h2>Changer le prochain grand spectacle</h2><p>Chaque proposition est recalculée sur <b>les deux jours</b>. Les solutions qui perdent un O sont signalées.</p>${alts.map(c=>{const a=activity(c.id),ok=c.missing===0;return`<button class="option" onclick="chooseAlternative('${a.id}','${c.start}')"><b>${a.id} · ${a.name} — ${c.start}</b><small>${labelZone(a.zone)} · ${a.covered?'couvert':'extérieur'} · ${ok?'✓ tous les O restent couverts':`⚠ ${c.missing} O non garanti`}</small></button>`}).join('')||'<div class="notice">Pas d’alternative robuste : demandez à ChatGPT.</div>'}<button class="btn outline" style="width:100%;margin-top:8px" onclick="closeModal()">Fermer</button>`);
}
function chooseAlternative(id,start){closeModal();recalculate(true,{day:state.day,id:Number(id),start})}
function chatState(){
  const d=state.day,n=nowMin(d),m=state.solverMeta||{},remaining=D.activities.filter(a=>!isDone(d,a.id)&&!isPostponed(d,a.id));
  const schedules=remaining.map(a=>`${a.id} ${a.name} | ${a.zone} | ${a.covered?'couvert':'extérieur'} | ${a.priority?'O':'optionnel'} | ${a.sessions?a.sessions.join('/'):(a.continuous||[]).map(w=>w.join('-')).join('/')}`).join('\n');
  const blocked=[18,19].flatMap(day=>Object.entries(state.blocked[day]||{}).flatMap(([id,ss])=>ss.map(s=>`${day}:${id}@${s}`))).join(', ')||'aucune';
  const plans=[18,19].map(day=>`${day}/08: ${currentPlan(day).filter(e=>endMin(e)>(day===d?n:min(D.opening[day]))).map(e=>`${e.start} ${activity(e.id)?.id?activity(e.id).id+' ':''}${nameOf(e)}`).join(' | ')}`).join('\n');
  return `PUY_STATE_V2\nDate active: ${d}/08/2026\nHeure: ${tm(n)}\nPosition: ${currentZone()} (${labelZone(currentZone())})\nDéjà faits 18: ${state.completed[18].join(', ')||'aucun'}\nDéjà faits 19: ${state.completed[19].join(', ')||'aucun'}\nSéances bloquées/pleines: ${blocked}\nReportés au 19: ${state.postponed18.join(', ')||'aucun'}\nSolveur global: ${m.complete?'tous les O encore couverts':`${m.missing||'?'} O non garanti`} · marge minimale ${m.minSlack??'—'} min\nStratégie: ${D.strategy.label}; ouverture opérationnelle ${D.opening[18]}; priorité au Haut en début du 18; extérieur évité dans la fenêtre chaude; trajectoires H/M/B sans retours inutiles.\nContraintes: 18/08 Café de la Madelon 20:00 (réservation 20:15); Noces de Feu 22:00.\n\nPlanning global actuel:\n${plans}\n\nHoraires restants (${d===19?'19 encore provisoire, copié du 18':'18 officiel'}):\n${schedules}\n\nDemande: le solveur local n'arrive plus à garantir une décision suffisamment robuste. Recalcule la meilleure stratégie à partir de cet état, en préservant tous les O si possible, et donne la prochaine action et son heure de départ.`;
}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('État copié · collez-le dans ChatGPT')}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('État copié')}}
function openChatGPT(){const txt=chatState().replace(/</g,'&lt;');openModal(`<h2>🤖 ChatGPT est nécessaire pour arbitrer</h2><p>Le planner a détecté qu'il ne peut plus garantir la stratégie tout seul. Copiez cet état dans notre conversation : vous n'avez rien à réexpliquer.</p><textarea id="chatState" readonly>${txt}</textarea><div class="actions" style="margin-top:10px"><button class="btn primary wide" onclick="copyText(document.getElementById('chatState').value)">Copier l'état</button><button class="btn outline wide" onclick="closeModal()">Fermer</button></div><div class="footerNote">Aucune clé API n'est stockée. ChatGPT n'est sollicité que lorsque l'optimisation locale ne suffit plus.</div>`)}
function openSettings(){
  const live=isLiveDay(state.day);openModal(`<h2>Réglages</h2><div class="settingsrow"><span>Heure utilisée</span><input type="time" value="${tm(nowMin())}" ${live?'disabled':''} onchange="setVirtualTime(this.value)"></div><div class="small">${live?'Heure réelle du téléphone utilisée automatiquement.':'Mode aperçu : simulez une heure pour tester.'}</div><div class="settingsrow"><span>Source</span><span class="small">18 officiel · ${D.sourceEdit}</span></div><div class="settingsrow"><span>Moteur</span><span class="small">Global 18+19 · ${D.strategy.label}</span></div><div class="settingsrow"><span>Version</span><span class="small">v${D.appVersion}</span></div><div class="settingsrow"><span>Mise à jour</span><button class="btn outline" onclick="checkForAppUpdate(true)">Vérifier</button></div><div class="settingsrow"><span>Réinitialiser le jour</span><button class="btn bad" onclick="resetDay()">Réinitialiser</button></div><div class="footerNote">iPhone : Safari → Partager → Sur l'écran d'accueil. La progression est conservée lors des mises à jour.</div><button class="btn outline" style="width:100%;margin-top:12px" onclick="closeModal()">Fermer</button>`)
}
function setVirtualTime(v){state.virtualTime[state.day]=v;save();closeModal();recalculate(false)}
function resetDay(){snapshot('Reset');const d=state.day;state.completed[d]=[];state.blocked[d]={};state.customPlan[d]=null;state.lunchDone[d]=false;state.manualZone[d]='auto';state.lastZone[d]=null;if(d===18){state.postponed18=[];state.customPlan[19]=null}state.solverMeta=null;save();closeModal();recalculate(false);toast('Journée réinitialisée')}
function toast(msg){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.display='none',2600)}

function setOfflineUi(){document.getElementById('offlineBar')?.classList.toggle('show',!navigator.onLine)}
function showUpdateBar(){document.getElementById('updateBar')?.classList.add('show')}
async function registerPwa(){
  setOfflineUi();window.addEventListener('online',()=>{setOfflineUi();checkForAppUpdate(false)});window.addEventListener('offline',setOfflineUi);if(!('serviceWorker'in navigator))return;
  try{swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});if(swRegistration.waiting)showUpdateBar();swRegistration.addEventListener('updatefound',()=>{const w=swRegistration.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)showUpdateBar()})});navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForAppUpdate(false)})}catch(e){console.warn('Service worker indisponible',e)}
}
async function checkForAppUpdate(userInitiated=false){if(!swRegistration){if(userInitiated)toast('Vérification disponible après le premier chargement HTTPS');return}try{await swRegistration.update();if(swRegistration.waiting)showUpdateBar();else if(userInitiated)toast('Vous avez déjà la dernière version')}catch(e){if(userInitiated)toast(navigator.onLine?'Vérification impossible maintenant':'Hors ligne · vérification impossible')}}
function applyAppUpdate(){if(swRegistration?.waiting)swRegistration.waiting.postMessage({type:'SKIP_WAITING'});else location.reload()}

Object.assign(window,{setDay,showView,openSettings,recalculate,openAlternatives,openChatGPT,undoLast,manualZone,markDone,toggleDone,blockCurrent,postpone,chooseAlternative,closeModal,copyText,setVirtualTime,resetDay,checkForAppUpdate,applyAppUpdate});
if(isLiveDay(state.day)||!state.customPlan[state.day]||!state.solverMeta)recalculate(false);else render();
setInterval(()=>{if(isLiveDay(state.day)){const before=nowMin();renderStatus();renderNext();renderAlerts();if(before%5===0){} }},30000);
registerPwa();
})();
