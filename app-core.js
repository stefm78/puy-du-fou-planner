(() => {
'use strict';
const D=window.PUY_DATA, ENGINE=window.PuySolver.create(D);
const ACT=Object.fromEntries(D.activities.map(a=>[String(a.id),a]));
const STORE='puyPlannerV4';
const DEFAULT={
  version:6,engineVersion:D.engineVersion,day:18,viewDay:18,clockMode:'system',simulationDay:18,
  completed:{18:[],19:[]},blocked:{18:{},19:{}},postponed18:[],
  manualZone:{18:'auto',19:'auto'},lastZone:{18:null,19:null},virtualTime:{18:'09:00',19:'09:00'},
  customPlan:{18:null,19:null},simulationPlan:{18:null,19:null},
  lunchDone:{18:false,19:false},solverMeta:null,simulationMeta:null,history:[]
};
const clone=x=>JSON.parse(JSON.stringify(x));
const min=window.PuySolver.minutes,tm=window.PuySolver.time;
let state=loadState(),swRegistration=null,toastTimer=null;

function systemDateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function systemVisitDay(){const k=systemDateKey();return k==='2026-08-18'?18:k==='2026-08-19'?19:null}
function systemNowMin(){const d=new Date();return d.getHours()*60+d.getMinutes()}
function effectiveDay(){return state.clockMode==='simulation'?Number(state.simulationDay||18):(systemVisitDay()||Number(state.day||18))}
function displayDay(){return [18,19].includes(Number(state.viewDay))?Number(state.viewDay):effectiveDay()}
function isOperationalView(){return state.clockMode==='system'&&!!systemVisitDay()&&displayDay()===systemVisitDay()}
function isSimulation(){return state.clockMode==='simulation'}
function nowMin(day=effectiveDay()){
  day=Number(day);
  if(isSimulation()){
    const sd=Number(state.simulationDay||18);
    if(day===sd)return min(state.virtualTime[sd]||D.opening[sd]);
    return day<sd?min(D.planningEnd[day]):min(D.opening[day]);
  }
  const sys=systemVisitDay();
  if(sys){
    if(day===sys)return systemNowMin();
    return day<sys?min(D.planningEnd[day]):min(D.opening[day]);
  }
  return min(D.opening[day]||'09:00');
}
function clockLabel(){
  if(isSimulation())return `Simulation · ${state.simulationDay}/08 ${tm(nowMin(state.simulationDay))}`;
  const sd=systemVisitDay();return sd?`Système · ${sd}/08 ${tm(systemNowMin())}`:'Système · hors dates de visite';
}
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
      completed:{...clone(DEFAULT.completed),...(x.completed||{})},
      blocked:{...clone(DEFAULT.blocked),...(x.blocked||{})},
      manualZone:{...clone(DEFAULT.manualZone),...(x.manualZone||{})},
      lastZone:{...clone(DEFAULT.lastZone),...(x.lastZone||{})},
      virtualTime:{...clone(DEFAULT.virtualTime),...(x.virtualTime||{})},
      lunchDone:{...clone(DEFAULT.lunchDone),...(x.lunchDone||{})},
      customPlan:{...clone(DEFAULT.customPlan),...(x.customPlan||{})},
      simulationPlan:{...clone(DEFAULT.simulationPlan),...(x.simulationPlan||{})},
      history:x.history||[],postponed18:x.postponed18||x.postponed?.[18]||[]
    };
    migrated.clockMode=x.clockMode==='simulation'?'simulation':'system';
    migrated.simulationDay=Number(x.simulationDay||x.day||18);
    migrated.viewDay=Number(x.viewDay||x.day||18);
    if(x.engineVersion!==D.engineVersion){
      migrated.engineVersion=D.engineVersion;
      migrated.customPlan={18:null,19:null};migrated.solverMeta=null;
    }
    migrated.simulationPlan={18:null,19:null};migrated.simulationMeta=null;
    return migrated;
  }catch(e){return clone(DEFAULT)}
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));return true}catch(e){console.warn(e);toast('Sauvegarde locale indisponible');return false}}
function snapshot(label){const clean=clone({...state,history:[]});state.history.push({label,at:Date.now(),state:clean});if(state.history.length>15)state.history.shift()}
function undoLast(){if(!isOperationalView())return toast('Annulation disponible uniquement en mode système sur le jour actif');if(!state.history.length)return toast('Rien à annuler');const h=state.history.pop(),hist=state.history;state=h.state;state.history=hist;save();recalculate(false);toast('Action annulée')}

function isDone(day,id){const s=String(id);return state.completed[day].includes(s)||(day===19&&state.completed[18].includes(s))}
function isPostponed(day,id){return day===18&&state.postponed18.includes(String(id))}
function isBlocked(day,id,start){return(state.blocked[day]?.[String(id)]||[]).includes(start)}
function basePlan(day){return clone(D.fallbackPlans[day]||[])}
function realPlan(day){return state.customPlan[day]||basePlan(day)}
function currentPlan(day=displayDay()){
  if(isSimulation())return state.simulationPlan?.[day]||realPlan(day);
  return realPlan(day);
}
function predictedZone(day,n,plan){
  let z=D.strategy.entranceZone;
  const openingMove=plan.find(e=>e.openingMove&&min(e.start)>n);
  if(openingMove&&n>=min(D.opening[day]))return zoneOf(openingMove);
  for(const e of plan)if(endMin(e)<=n)z=zoneOf(e);
  return z;
}
function currentZone(day=effectiveDay()){
  day=Number(day);const n=nowMin(day);
  if(isSimulation())return predictedZone(day,n,realPlan(day));
  if(day===systemVisitDay()){
    const manual=state.manualZone[day];if(manual&&manual!=='auto')return manual;
    if(state.lastZone[day])return state.lastZone[day];
  }
  return predictedZone(day,n,realPlan(day));
}
function solverInput(){
  const d=effectiveDay();
  return {day:d,now:{18:nowMin(18),19:nowMin(19)},
    zone:{18:d===18?currentZone(18):D.strategy.entranceZone,19:d===19?currentZone(19):D.strategy.entranceZone},
    completed:state.completed,blocked:state.blocked,postponed18:state.postponed18,lunchDone:state.lunchDone};
}
function currentMeta(){return isSimulation()?(state.simulationMeta||state.solverMeta||{}):(state.solverMeta||{})}
function recalculate(userInitiated=false,forceFirst=null){
  if(userInitiated&&!isSimulation()&&!isOperationalView())return toast('Passez sur le jour système actif ou utilisez le mode Simulation');
  if(userInitiated&&!isSimulation())snapshot('Recalcul global');
  const sol=ENGINE.solve(solverInput(),forceFirst?{forceFirst}:{});
  if(isSimulation()){
    state.simulationPlan={18:sol.plans[18]||null,19:sol.plans[19]||null};
    state.simulationMeta={...sol.diagnostics,skeleton:sol.skeleton,at:Date.now()};
  }else{
    const d=effectiveDay();
    if(d===18){state.customPlan[18]=sol.plans[18];state.customPlan[19]=sol.plans[19]}
    else state.customPlan[19]=sol.plans[19];
    state.solverMeta={...sol.diagnostics,skeleton:sol.skeleton,at:Date.now()};
  }
  save();render();
  if(userInitiated)toast(isSimulation()?'Simulation recalculée · plan réel inchangé':'Planning global recalculé');
  if(!isSimulation()&&!sol.diagnostics.complete)setTimeout(openChatGPT,250);
  return sol;
}

function entryStatus(e,day=displayDay(),n=nowMin(day)){
  if(e.kind==='lunch'&&state.lunchDone[day])return'done';
  if(e.kind!=='fixed'&&e.kind!=='lunch'&&isDone(day,e.id))return'done';
  if(endMin(e)<=n)return'past';if(min(e.start)<=n&&endMin(e)>n)return'current';return'future';
}
function nextEntry(day=displayDay()){const n=nowMin(day),p=currentPlan(day);return p.find(e=>entryStatus(e,day,n)==='current')||p.find(e=>entryStatus(e,day,n)==='future')||null}
function riskAnalysis(){const m=currentMeta();return{missing:m.missing||0,complete:m.complete!==false,minSlack:m.minSlack}}
function recommendedLeave(e,z,day=displayDay()){if(e.openingMove)return min(D.opening[day]);return min(e.start)-arrivalBuffer(e)-travel(z,zoneOf(e))}
function requireOperational(){if(isOperationalView())return true;toast(isSimulation()?'Simulation en lecture seule · le plan réel est protégé':'Cette journée est en aperçu · aucune action réelle');return false}

function markDone(id){
  if(!requireOperational())return;snapshot('Fait');const d=effectiveDay(),s=String(id);
  if(s==='lunch')state.lunchDone[d]=true;
  else if(!['dinner','noces'].includes(s)&&!state.completed[d].includes(s)){state.completed[d].push(s);if(activity(id))state.lastZone[d]=activity(id).zone}
  save();recalculate(false);toast('Fait · les deux jours ont été réoptimisés');
}
function toggleDone(id){
  if(!requireOperational())return;snapshot('Basculer fait');const d=effectiveDay(),s=String(id),i=state.completed[d].indexOf(s);
  if(i>=0)state.completed[d].splice(i,1);else{state.completed[d].push(s);if(activity(id))state.lastZone[d]=activity(id).zone}
  save();recalculate(false);
}
function blockCurrent(id,start,why){
  if(!requireOperational())return;snapshot(why);const d=effectiveDay(),k=String(id);state.blocked[d][k]=state.blocked[d][k]||[];
  if(!state.blocked[d][k].includes(start))state.blocked[d][k].push(start);
  save();const sol=recalculate(false);toast(why==='full'?'Séance marquée complète · plan recalculé':'Séance abandonnée · plan recalculé');
  if(sol&&!sol.diagnostics.complete)setTimeout(openChatGPT,250);
}
function postpone(id){
  if(!requireOperational()||effectiveDay()!==18)return; snapshot('Report 19');const k=String(id);
  if(!state.postponed18.includes(k))state.postponed18.push(k);save();recalculate(false);toast('Reporté au 19 et planning global recalculé');
}
function manualZone(v){
  if(!requireOperational())return;const d=effectiveDay();snapshot('Position');state.manualZone[d]=v;if(v!=='auto')state.lastZone[d]=v;save();recalculate(false);
}
function setDay(d){state.viewDay=Number(d);save();render()}

function renderStatus(){
  const d=displayDay(),n=nowMin(d),z=currentZone(d),done=[...new Set([...state.completed[18],...(d===19?state.completed[19]:[])])].length,r=riskAnalysis();
  const viability=r.complete?'<span class="chip good">Tous les O sécurisables</span>':`<span class="chip bad">${r.missing} O à arbitrer</span>`;
  const mode=isSimulation()?'<span class="chip">Simulation isolée</span>':(isOperationalView()?'<span class="chip good">Heure système</span>':'<span class="chip">Aperçu</span>');
  document.getElementById('statusbar').innerHTML=`<span class="chip">${d}/08 · ${tm(n)}</span><span class="chip">Zone ${z}</span><span class="chip good">${done} fait${done>1?'s':''}</span>${mode}${viability}`;
}
function renderAlerts(){
  const r=riskAnalysis(),d=displayDay();let h='';
  if(isSimulation())h+=`<div class="notice" style="margin-bottom:10px"><strong>Simulation isolée :</strong> jour et heure sont simulés. Les calculs n'écrasent ni le planning réel, ni la progression.</div>`;
  else if(!systemVisitDay())h+=`<div class="alert"><b>Mode système hors dates de visite</b><br>Le planner ne recalculera rien automatiquement. Passez en Simulation pour tester un jour et une heure.</div>`;
  else if(!isOperationalView())h+=`<div class="notice" style="margin-bottom:10px"><strong>Aperçu du ${d} août :</strong> consulter cette journée ne change pas le jour opérationnel ni le planning.</div>`;
  if(d===19)h+=`<div class="notice" style="margin-bottom:10px"><strong>19 août provisoire :</strong> horaires encore copiés du 18. Le moteur réoptimisera seulement lors d'une action explicite ou en simulation.</div>`;
  if(d===18&&nowMin(18)<=10*60+15)h+=`<div class="notice" style="margin-bottom:10px"><strong>Stratégie contre-courant :</strong> départ profond vers le Haut, puis H→M→B.</div>`;
  if(!r.complete)h+=`<div class="alert"><b>Arbitrage nécessaire</b><br>Le solveur local ne peut plus garantir tous les spectacles O sur les deux jours.${!isSimulation()?'<button class="btn primary" onclick="openChatGPT()">🤖 Demander à ChatGPT</button>':''}</div>`;
  document.getElementById('alerts').innerHTML=h;
}
function renderNext(){
  const d=displayDay(),e=nextEntry(d),box=document.getElementById('nextCard'),n=nowMin(d),z=currentZone(d);
  if(!e){box.innerHTML='<div class="eyebrow">Terminé</div><div class="nexttitle">Plus d’étape planifiée</div>';return}
  const a=activity(e.id),ez=zoneOf(e),walk=travel(z,ez),buf=arrivalBuffer(e),leave=recommendedLeave(e,z,d),delta=leave-n,cls=delta<0?'danger':delta<=15?'wait':'safe';
  let msg;
  if(e.openingMove&&n<min(D.opening[d]))msg=`À l’ouverture ${D.opening[d]}, partez vers le ${labelZone(ez)}`;
  else if(e.openingMove&&n<=min(D.opening[d])+15)msg=`Partez maintenant vers le ${labelZone(ez)} · contre-courant`;
  else if(e.kind==='fixed')msg=`Rendez-vous à ${e.start}`;
  else msg=delta<=0?'Partez maintenant':`Départ conseillé ${tm(leave)} · dans ${delta} min`;
  const badges=[`<span class="badge zone">${labelZone(ez)} · ${ez}</span>`];
  if(a?.priority)badges.push('<span class="badge o">O · grand spectacle</span>');
  if(a?.covered)badges.push('<span class="badge cover">Couvert</span>');
  if(e.openingMove)badges.push('<span class="badge cover">Contre-courant</span>');
  if(isSimulation())badges.push('<span class="badge cover">Simulation</span>');
  let actions='';
  if(isOperationalView()){
    if(e.kind==='show'||e.kind==='flex')actions=`<button class="btn good" onclick="markDone('${e.id}')">✓ Fait</button>${e.kind==='show'?`<button class="btn bad" onclick="blockCurrent('${e.id}','${e.start}','full')">🚫 Complet</button><button class="btn outline" onclick="blockCurrent('${e.id}','${e.start}','late')">⌛ Trop tard</button>`:''}<button class="btn outline" onclick="openAlternatives()">⇄ Changer</button>${d===18&&a?.priority?`<button class="btn outline wide" onclick="postpone('${e.id}')">↪ Reporter au 19</button>`:''}`;
    else if(e.kind==='lunch')actions='<button class="btn good" onclick="markDone(\'lunch\')">✓ Déjeuner terminé</button><button class="btn outline" onclick="openAlternatives()">⇄ Recalculer</button>';
    else actions='<button class="btn outline wide" onclick="openAlternatives()">Voir les alternatives</button>';
  }else actions=`<div class="small">${isSimulation()?'Simulation en lecture seule : le planning réel reste inchangé.':'Aperçu : revenez au jour système actif pour agir.'}</div>`;
  const detail=e.kind==='show'?`Spectacle ${e.start} · placement ${buf} min · marche prudente ${walk} min`:e.note||`Durée ${durationOf(e)} min`;
  box.innerHTML=`<div class="eyebrow">${entryStatus(e,d,n)==='current'?'MAINTENANT':'PROCHAINE ÉTAPE'}</div><div class="nexttitle">${a?`${a.id} · `:''}${nameOf(e)}</div><div class="meta">${badges.join('')}</div><div class="countdown ${cls}"><strong>${msg}</strong><span class="small">${detail}</span></div><div class="actions">${actions}</div>`;
}
function renderTimeline(){
  const d=displayDay(),n=nowMin(d);let h='';
  for(const e of currentPlan(d)){
    const st=entryStatus(e,d,n),a=activity(e.id),classes=['item',a?.priority?'priority':'',e.kind==='fixed'?'fixed':'',st==='current'?'current':'',st==='done'||st==='past'?'done':''].join(' '),
      sub=[labelZone(zoneOf(e)),a?.priority?'O':null,a?.covered?'couvert':null,e.openingMove?'contre-courant':null,e.note||null].filter(Boolean).join(' · ');
    h+=`<div class="${classes}"><div class="time">${e.start}</div><div><div class="iname">${a?`${a.id} · `:''}${nameOf(e)}</div><div class="isub">${sub}</div></div><div class="dot"></div></div>`;
  }
  document.getElementById('timeline').innerHTML=h||'<div class="notice">Aucune étape future.</div>';
}
function plannedSlot(id){for(const d of [18,19]){const e=currentPlan(d).find(x=>String(x.id)===String(id));if(e)return`${d}/08 ${e.start}`}return''}
function renderShows(){
  let h='';const d=displayDay(),editable=isOperationalView();
  for(const z of ['H','M','B']){
    h+=`<div class="sectionTitle">${z} · ${labelZone(z)}</div>`;
    for(const a of D.activities.filter(x=>x.zone===z)){
      const done=isDone(d,a.id),post=isPostponed(d,a.id),times=a.sessions?a.sessions.join(' · '):(a.continuous||[]).map(w=>w.join('–')).join(' · '),slot=plannedSlot(a.id);
      h+=`<div class="showrow ${done?'done':''}"><div class="num">${a.id}</div><div class="grow"><div class="name">${a.name}</div><div class="details">${a.priority?'O · ':''}${a.covered?'couvert':'extérieur'} · ${a.duration} min<br>${times}${slot?`<br><b>Plan : ${slot}</b>`:''}${post?' · REPORTÉ AU 19':''}</div></div>${editable?`<button class="iconbtn" onclick="toggleDone('${a.id}')">${done?'↶':'✓'}</button>`:''}</div>`;
    }
  }
  document.getElementById('showsList').innerHTML=h;
}
function renderEngine(){
  const m=currentMeta(),sk=m.skeleton||{18:[],19:[]},d=displayDay(),zoneSelect=document.getElementById('zoneSelect');
  zoneSelect.value=state.manualZone[effectiveDay()]||'auto';zoneSelect.disabled=!isOperationalView();
  const fmt=x=>(sk[x]||[]).map(y=>`${y.id} ${activity(y.id)?.name} ${y.start}`).join(' → ')||'aucun O restant';
  document.getElementById('engineState').innerHTML=`Horloge : <b>${clockLabel()}</b><br>Jour affiché : <b>${d}/08</b> · position calculée : <b>${currentZone(d)}</b><br>Moteur : <b>${isSimulation()?'bac à sable de simulation':'plan réel'}</b>, stratégie <b>${D.strategy.label}</b>.<br>Le simple passage du temps ou le changement d’onglet ne déclenche plus de recalcul silencieux.<br><br><b>18 :</b> ${fmt(18)}<br><b>19 :</b> ${fmt(19)}<br><b>Marge minimale entre grands spectacles :</b> ${m.minSlack==null?'—':m.minSlack+' min'}`;
}
function render(){
  const d=displayDay();
  renderAlerts();renderStatus();renderNext();renderTimeline();renderShows();renderEngine();
  document.getElementById('day18').classList.toggle('active',d===18);document.getElementById('day19').classList.toggle('active',d===19);
  const mode=isSimulation()?`simulation ${state.simulationDay}/08 ${tm(nowMin(state.simulationDay))}`:(systemVisitDay()?`système ${systemVisitDay()}/08 ${tm(systemNowMin())}`:'système hors visite');
  document.getElementById('sourceLine').textContent=`${d===18?'18 officiel · édition '+D.sourceEdit:'19 provisoire'} · v${D.appVersion} · ${mode}`;
}

function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
function openModal(html){document.getElementById('sheet').innerHTML=html;document.getElementById('modal').classList.add('open')}
function closeModal(){document.getElementById('modal').classList.remove('open')}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
function openAlternatives(){
  if(!isSimulation()&&!isOperationalView())return toast('Alternatives indisponibles depuis un simple aperçu');
  const d=effectiveDay(),alts=ENGINE.alternatives(solverInput(),d,6);
  openModal(`<h2>Changer le prochain grand spectacle</h2><p>${isSimulation()?'<b>Simulation :</b> aucune proposition ne modifiera le planning réel.':'Chaque proposition est recalculée sur les deux jours.'}</p>${alts.map(c=>{const a=activity(c.id),ok=c.missing===0;return`<button class="option" onclick="chooseAlternative('${a.id}','${c.start}')"><b>${a.id} · ${a.name} — ${c.start}</b><small>${labelZone(a.zone)} · ${a.covered?'couvert':'extérieur'} · ${ok?'✓ tous les O restent couverts':`⚠ ${c.missing} O non garanti`}</small></button>`}).join('')||'<div class="notice">Pas d’alternative robuste.</div>'}<button class="btn outline" style="width:100%;margin-top:8px" onclick="closeModal()">Fermer</button>`);
}
function chooseAlternative(id,start){closeModal();recalculate(true,{day:effectiveDay(),id:Number(id),start})}
function chatState(){
  const d=effectiveDay(),n=nowMin(d),m=currentMeta(),remaining=D.activities.filter(a=>!isDone(d,a.id)&&!isPostponed(d,a.id));
  const schedules=remaining.map(a=>`${a.id} ${a.name} | ${a.zone} | ${a.covered?'couvert':'extérieur'} | ${a.priority?'O':'optionnel'} | ${a.sessions?a.sessions.join('/'):(a.continuous||[]).map(w=>w.join('-')).join('/')}`).join('\n');
  const blocked=[18,19].flatMap(day=>Object.entries(state.blocked[day]||{}).flatMap(([id,ss])=>ss.map(s=>`${day}:${id}@${s}`))).join(', ')||'aucune';
  const plans=[18,19].map(day=>`${day}/08: ${currentPlan(day).map(e=>`${e.start} ${activity(e.id)?.id?activity(e.id).id+' ':''}${nameOf(e)}`).join(' | ')}`).join('\n');
  return `PUY_STATE_V3\nMode horloge: ${clockLabel()}\nDate active solveur: ${d}/08/2026\nHeure: ${tm(n)}\nPosition: ${currentZone(d)} (${labelZone(currentZone(d))})\nDéjà faits 18: ${state.completed[18].join(', ')||'aucun'}\nDéjà faits 19: ${state.completed[19].join(', ')||'aucun'}\nSéances bloquées/pleines: ${blocked}\nReportés au 19: ${state.postponed18.join(', ')||'aucun'}\nSolveur: ${m.complete?'tous les O encore couverts':`${m.missing||'?'} O non garanti`}\nStratégie: ${D.strategy.label}\nContraintes: 18/08 Café de la Madelon 20:00; Noces de Feu 22:00.\n\nPlanning actuel:\n${plans}\n\nHoraires restants:\n${schedules}\n\nDemande: recalcule la meilleure stratégie à partir de cet état en préservant tous les O si possible.`;
}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('État copié · collez-le dans ChatGPT')}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('État copié')}}
function openChatGPT(){const txt=chatState().replace(/</g,'&lt;');openModal(`<h2>🤖 ChatGPT est nécessaire pour arbitrer</h2><p>Copiez cet état dans notre conversation : vous n'avez rien à réexpliquer.</p><textarea id="chatState" readonly>${txt}</textarea><div class="actions" style="margin-top:10px"><button class="btn primary wide" onclick="copyText(document.getElementById('chatState').value)">Copier l'état</button><button class="btn outline wide" onclick="closeModal()">Fermer</button></div>`)}
function openSettings(){
  const sd=systemVisitDay(),sysText=sd?`${sd}/08/2026 · ${tm(systemNowMin())}`:'hors 18–19 août 2026',sim=isSimulation();
  openModal(`<h2>Horloge & réglages</h2>
    <div class="settingsrow"><span>Source du temps</span><select onchange="setClockMode(this.value)"><option value="system" ${!sim?'selected':''}>Système</option><option value="simulation" ${sim?'selected':''}>Simulation</option></select></div>
    <div class="small"><b>Système :</b> ${sysText}. Le temps qui passe met l'affichage à jour mais ne réoptimise plus silencieusement le programme.</div>
    <div class="settingsrow"><span>Jour simulé</span><select ${sim?'':'disabled'} onchange="setSimulationDay(this.value)"><option value="18" ${Number(state.simulationDay)===18?'selected':''}>Mardi 18</option><option value="19" ${Number(state.simulationDay)===19?'selected':''}>Mercredi 19</option></select></div>
    <div class="settingsrow"><span>Heure simulée</span><input type="time" value="${state.virtualTime[state.simulationDay]||D.opening[state.simulationDay]}" ${sim?'':'disabled'} onchange="setVirtualTime(this.value)"></div>
    <div class="small">${sim?'La simulation est isolée : elle ne modifie ni le planning réel, ni les activités faites/bloquées.':'Activez Simulation pour tester une autre date ou heure.'}</div>
    <div class="settingsrow"><span>Source programme</span><span class="small">18 officiel · ${D.sourceEdit}</span></div>
    <div class="settingsrow"><span>Version</span><span class="small">v${D.appVersion}</span></div>
    <div class="settingsrow"><span>Mise à jour</span><button class="btn outline" onclick="checkForAppUpdate(true)">Vérifier</button></div>
    ${isOperationalView()?'<div class="settingsrow"><span>Réinitialiser le jour réel</span><button class="btn bad" onclick="resetDay()">Réinitialiser</button></div>':''}
    <button class="btn outline" style="width:100%;margin-top:12px" onclick="closeModal()">Fermer</button>`);
}
function setClockMode(mode){
  if(!['system','simulation'].includes(mode))return;
  if(mode==='simulation'){
    const sd=systemVisitDay()||displayDay()||18;
    state.clockMode='simulation';state.simulationDay=sd;state.viewDay=sd;
    if(systemVisitDay()===sd)state.virtualTime[sd]=tm(systemNowMin());
    state.simulationPlan={18:null,19:null};state.simulationMeta=null;save();closeModal();recalculate(false);toast('Simulation activée · plan réel protégé');
  }else{
    state.clockMode='system';state.simulationPlan={18:null,19:null};state.simulationMeta=null;
    const sd=systemVisitDay();if(sd){state.day=sd;state.viewDay=sd}
    save();closeModal();
    if(sd&&!state.customPlan[sd])recalculate(false);else render();
    toast(sd?'Heure système activée':'Heure système activée · hors dates de visite');
  }
}
function setSimulationDay(v){
  if(!isSimulation())return;const d=Number(v);if(![18,19].includes(d))return;
  state.simulationDay=d;state.viewDay=d;state.simulationPlan={18:null,19:null};state.simulationMeta=null;save();closeModal();recalculate(false);
}
function setVirtualTime(v){
  if(!isSimulation())return;const d=Number(state.simulationDay);state.virtualTime[d]=v;state.simulationPlan={18:null,19:null};state.simulationMeta=null;save();closeModal();recalculate(false);
}
function resetDay(){
  if(!requireOperational())return;snapshot('Reset');const d=effectiveDay();state.completed[d]=[];state.blocked[d]={};state.customPlan[d]=null;state.lunchDone[d]=false;state.manualZone[d]='auto';state.lastZone[d]=null;
  if(d===18){state.postponed18=[];state.customPlan[19]=null}state.solverMeta=null;save();closeModal();recalculate(false);toast('Journée réinitialisée');
}
function toast(msg){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.display='none',2600)}

function setOfflineUi(){document.getElementById('offlineBar')?.classList.toggle('show',!navigator.onLine)}
function showUpdateBar(){document.getElementById('updateBar')?.classList.add('show')}
async function registerPwa(){
  setOfflineUi();window.addEventListener('online',()=>{setOfflineUi();checkForAppUpdate(false)});window.addEventListener('offline',setOfflineUi);if(!('serviceWorker'in navigator))return;
  try{swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});if(swRegistration.waiting)showUpdateBar();swRegistration.addEventListener('updatefound',()=>{const w=swRegistration.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)showUpdateBar()})});navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForAppUpdate(false)})}catch(e){console.warn('Service worker indisponible',e)}
}
async function checkForAppUpdate(userInitiated=false){if(!swRegistration){if(userInitiated)toast('Vérification disponible après le premier chargement HTTPS');return}try{await swRegistration.update();if(swRegistration.waiting)showUpdateBar();else if(userInitiated)toast('Vous avez déjà la dernière version')}catch(e){if(userInitiated)toast(navigator.onLine?'Vérification impossible maintenant':'Hors ligne · vérification impossible')}}
function applyAppUpdate(){if(swRegistration?.waiting)swRegistration.waiting.postMessage({type:'SKIP_WAITING'});else location.reload()}

Object.assign(window,{setDay,showView,openSettings,recalculate,openAlternatives,openChatGPT,undoLast,manualZone,markDone,toggleDone,blockCurrent,postpone,chooseAlternative,closeModal,copyText,setClockMode,setSimulationDay,setVirtualTime,resetDay,checkForAppUpdate,applyAppUpdate});
(function bootClock(){
  const sd=systemVisitDay();
  if(state.clockMode==='system'&&sd){state.day=sd;if(![18,19].includes(Number(state.viewDay)))state.viewDay=sd}
  if(state.clockMode==='simulation'){state.viewDay=Number(state.simulationDay||18);state.simulationPlan={18:null,19:null};state.simulationMeta=null}
  save();
  if(isSimulation())recalculate(false);
  else if(sd&&!state.customPlan[sd])recalculate(false);
  else render();
})();
let lastSystemDay=systemVisitDay();
setInterval(()=>{
  if(state.clockMode!=='system')return;
  const sd=systemVisitDay();
  if(sd&&sd!==lastSystemDay){
    lastSystemDay=sd;state.day=sd;state.viewDay=sd;save();
    if(!state.customPlan[sd])recalculate(false);else render();
    return;
  }
  renderStatus();renderNext();renderAlerts();
},30000);
registerPwa();
})();
