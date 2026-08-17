(() => {
'use strict';
const D = window.PUY_DATA;
const ACT = Object.fromEntries(D.activities.map(a => [String(a.id), a]));
const STORE = 'puyPlannerV4';
const DEFAULT = {
  version:4, day:18,
  completed:{18:[],19:[]}, blocked:{18:{},19:{}}, postponed18:[],
  manualZone:{18:'auto',19:'auto'}, virtualTime:{18:'09:00',19:'09:00'},
  customPlan:{18:null,19:null}, lunchDone:{18:false,19:false}, history:[]
};
let state = loadState();
let swRegistration = null;
let toastTimer = null;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function min(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function tm(m){ m=Math.round(m); return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function isLiveDay(day){ return todayKey()===`2026-08-${day}`; }
function nowMin(day=state.day){ const d=new Date(); return isLiveDay(day)?d.getHours()*60+d.getMinutes():min(state.virtualTime[day]||'09:00'); }
function activity(id){ return ACT[String(id)]; }
function labelZone(z){ return z==='H'?'Haut':z==='B'?'Bas':'Milieu'; }
function travel(a,b){ return D.travel[a]?.[b] ?? 12; }
function arrivalBuffer(e){ const a=activity(e.id); return e.kind==='show'&&a?.priority?D.placementPriorityMin:e.kind==='show'?10:0; }
function exitBuffer(e){ const a=activity(e.id); return e.kind==='show'&&a?.priority?6:e.kind==='show'?3:0; }
function durationOf(e){ return e.duration ?? activity(e.id)?.duration ?? 0; }
function zoneOf(e){ return e.zone || activity(e.id)?.zone || 'M'; }
function nameOf(e){ return e.name || activity(e.id)?.name || String(e.id); }
function endMin(e){ return min(e.start)+durationOf(e)+exitBuffer(e); }

function loadState(){
  try{
    const x=JSON.parse(localStorage.getItem(STORE)||'null');
    if(!x) return clone(DEFAULT);
    return {
      ...clone(DEFAULT), ...x,
      completed:{...clone(DEFAULT.completed),...(x.completed||{})},
      blocked:{...clone(DEFAULT.blocked),...(x.blocked||{})},
      manualZone:{...clone(DEFAULT.manualZone),...(x.manualZone||{})},
      virtualTime:{...clone(DEFAULT.virtualTime),...(x.virtualTime||{})},
      customPlan:{...clone(DEFAULT.customPlan),...(x.customPlan||{})},
      lunchDone:{...clone(DEFAULT.lunchDone),...(x.lunchDone||{})},
      history:x.history||[], postponed18:x.postponed18||x.postponed?.[18]||[]
    };
  }catch(e){ return clone(DEFAULT); }
}
function save(){
  try{ localStorage.setItem(STORE,JSON.stringify(state)); return true; }
  catch(e){ console.warn(e); toast('Sauvegarde locale indisponible'); return false; }
}
function snapshot(label){
  const clean=clone({...state,history:[]});
  state.history.push({label,at:Date.now(),state:clean});
  if(state.history.length>15) state.history.shift();
}
function undoLast(){
  if(!state.history.length) return toast('Rien à annuler');
  const h=state.history.pop(), hist=state.history;
  state=h.state; state.history=hist; save(); render(); toast('Action annulée');
}

function isDone(day,id){ const s=String(id); return state.completed[day].includes(s)||(day===19&&state.completed[18].includes(s)); }
function isPostponed(day,id){ return day===18&&state.postponed18.includes(String(id)); }
function isBlocked(day,id,start){ return (state.blocked[day]?.[String(id)]||[]).includes(start); }
function basePlan(day){ return clone(D.initialPlans[day]); }
function currentPlan(day=state.day){ return state.customPlan[day] || basePlan(day); }
function currentZone(day=state.day){
  const manual=state.manualZone[day];
  if(manual && manual!=='auto') return manual;
  const n=nowMin(day); let z=day===18?'B':'H';
  for(const e of currentPlan(day)) if(endMin(e)<=n) z=zoneOf(e);
  return z;
}
function remainingPriority(day){
  return D.activities.filter(a=>a.priority&&!isDone(day,a.id)&&!isPostponed(day,a.id)&&(day===19||D.homeDay[String(a.id)]===18));
}
function fixedLimit(day){ return day===18?20*60:20*60+30; }
function fitsBeforeFixed(day,start,finish,zone){
  if(day===18) return finish+travel(zone,'B')<=20*60;
  return finish<=20*60+30;
}

function sessionCandidates(a,day,t,z){
  const out=[];
  if(a.sessions){
    for(const s of a.sessions){
      if(isBlocked(day,a.id,s)) continue;
      const start=min(s), buf=a.priority?D.placementPriorityMin:10, walk=travel(z,a.zone), leave=start-buf-walk;
      if(leave<t) continue;
      const finish=start+a.duration+(a.priority?6:3);
      if(!fitsBeforeFixed(day,start,finish,a.zone)) continue;
      out.push({kind:'show',id:a.id,start:s,leave,finish,zone:a.zone});
    }
  }else{
    for(const [ws,we] of a.continuous||[]){
      const w0=min(ws),w1=min(we),walk=travel(z,a.zone);
      let start=Math.max(w0,t+walk);
      if(start+a.duration>w1) continue;
      if(!fitsBeforeFixed(day,start,start+a.duration,a.zone)) continue;
      out.push({kind:'flex',id:a.id,start:tm(start),leave:t,finish:start+a.duration,zone:a.zone});
    }
  }
  return out;
}
function scoreCandidate(c,a,day,t,z){
  let s=0;
  const start=min(c.start), walk=travel(z,a.zone), inHeat=start>=D.heatWindow[0]&&start<=D.heatWindow[1];
  if(a.priority) s+=1000;
  if(a.priority&&D.homeDay[String(a.id)]===day) s+=280;
  if(a.zone===z) s+=150; else if(walk<=14) s+=55; else s-=90;
  if(inHeat) s+=a.covered?210:-120;
  s-=walk*4;
  s-=Math.max(0,c.leave-t)*1.4;
  if(a.sessions){
    const feasible=a.sessions.filter(x=>!isBlocked(day,a.id,x)&&min(x)>=start).length;
    if(feasible===1) s+=260; else if(feasible===2) s+=120;
  }
  if(!a.priority) s-=80;
  return s;
}
function candidateSessions(day,t,z,forceId=null){
  const out=[];
  const localPriority=remainingPriority(day).length>0;
  for(const a of D.activities){
    if(isDone(day,a.id)||isPostponed(day,a.id)) continue;
    if(forceId && String(a.id)!==String(forceId)) continue;
    if(day===18&&a.priority&&D.homeDay[String(a.id)]===19&&localPriority&&!forceId) continue;
    for(const c of sessionCandidates(a,day,t,z)) out.push({...c,score:scoreCandidate(c,a,day,t,z)});
  }
  return out.sort((x,y)=>y.score-x.score||min(x.start)-min(y.start));
}
function maybeLunch(day,t,z,nextLeave,plan){
  if(state.lunchDone[day]||plan.some(e=>e.kind==='lunch')) return null;
  if(t<11*60+50||t>14*60+15) return null;
  const dur=45;
  if(nextLeave!==null && t+dur>nextLeave) return null;
  return {kind:'lunch',id:'lunch',start:tm(t),duration:dur,zone:z,name:'Déjeuner'};
}
function buildPlan(day,forceId=null){
  let t=nowMin(day), z=currentZone(day); const plan=[]; let first=true;
  for(let step=0;step<14;step++){
    if(t>=fixedLimit(day)-25) break;
    let cand=candidateSessions(day,t,z,first?forceId:null);
    if(!cand.length&&first&&forceId) cand=candidateSessions(day,t,z,null);
    const best=cand[0];
    const lunch=maybeLunch(day,t,z,best?best.leave:null,plan);
    if(lunch){ plan.push(lunch); t+=lunch.duration; first=false; continue; }
    if(!best) break;
    const a=activity(best.id);
    plan.push({kind:best.kind,id:a.id,start:best.start});
    t=best.finish; z=a.zone; first=false;
  }
  if(!state.lunchDone[day]&&!plan.some(e=>e.kind==='lunch')&&t>=12*60&&t<=14*60){
    plan.push({kind:'lunch',id:'lunch',start:tm(t),duration:45,zone:z,name:'Déjeuner'});
  }
  if(day===18){
    const n=nowMin(day);
    if(n<21*60+15) plan.push({kind:'fixed',id:'dinner',start:'20:00',duration:75,zone:'B',name:'Café de la Madelon — rendez-vous',note:'Réservation 20:15'});
    if(n<22*60+30) plan.push({kind:'fixed',id:'noces',start:'22:00',duration:30,zone:'M',name:'Les Noces de Feu',note:'Spectacle nocturne'});
  }
  return plan.sort((a,b)=>min(a.start)-min(b.start));
}
function recalculate(userInitiated=false,forceId=null){
  if(userInitiated) snapshot('Recalcul');
  state.customPlan[state.day]=buildPlan(state.day,forceId); save(); render();
  if(userInitiated) toast('Suite recalculée');
  if(needsChatGPT()) setTimeout(openChatGPT,250);
}

function entryStatus(e,day=state.day,n=nowMin(day)){
  if(e.kind==='lunch'&&state.lunchDone[day]) return 'done';
  if(e.kind!=='fixed'&&e.kind!=='lunch'&&isDone(day,e.id)) return 'done';
  if(endMin(e)<=n) return 'past';
  if(min(e.start)<=n&&endMin(e)>n) return 'current';
  return 'future';
}
function nextEntry(day=state.day){
  const n=nowMin(day), p=currentPlan(day);
  return p.find(e=>entryStatus(e,day,n)==='current') || p.find(e=>entryStatus(e,day,n)==='future') || null;
}
function riskAnalysis(day=state.day){
  const t=nowMin(day),z=currentZone(day), impossible=[];
  const targets=D.activities.filter(a=>a.priority&&!isDone(day,a.id)&&!isPostponed(day,a.id)&&(day===19||D.homeDay[String(a.id)]===18));
  for(const a of targets) if(!candidateSessions(day,t,z,a.id).length) impossible.push(a);
  return {impossible};
}
function needsChatGPT(){ return riskAnalysis().impossible.length>0; }

function markDone(id){
  snapshot('Fait'); const d=state.day;
  if(String(id)==='lunch') state.lunchDone[d]=true;
  else if(!['dinner','noces'].includes(String(id))&&!state.completed[d].includes(String(id))) state.completed[d].push(String(id));
  save(); recalculate(false); toast('Fait · suite recalculée');
}
function toggleDone(id){
  snapshot('Basculer fait'); const d=state.day,s=String(id),i=state.completed[d].indexOf(s);
  if(i>=0) state.completed[d].splice(i,1); else state.completed[d].push(s);
  save(); recalculate(false);
}
function blockCurrent(id,start,why){
  snapshot(why); const d=state.day,k=String(id);
  state.blocked[d][k]=state.blocked[d][k]||[];
  if(!state.blocked[d][k].includes(start)) state.blocked[d][k].push(start);
  const a=activity(id);
  if(d===18&&a?.priority&&!candidateSessions(d,nowMin(d),currentZone(d),id).length&&!state.postponed18.includes(k)) state.postponed18.push(k);
  save(); recalculate(false); toast(why==='full'?'Séance marquée complète':'Séance abandonnée');
  if(needsChatGPT()) setTimeout(openChatGPT,250);
}
function postpone(id){
  if(state.day!==18) return;
  snapshot('Report 19'); const k=String(id); if(!state.postponed18.includes(k)) state.postponed18.push(k);
  save(); recalculate(false); toast('Reporté au 19');
}
function manualZone(v){ snapshot('Position'); state.manualZone[state.day]=v; save(); recalculate(false); }
function setDay(d){ state.day=d; save(); render(); }

function renderStatus(){
  const d=state.day,n=nowMin(d),z=currentZone(d),done=[...new Set([...state.completed[18],...(d===19?state.completed[19]:[])])].length;
  const r=riskAnalysis(d);
  document.getElementById('statusbar').innerHTML=`<span class="chip">${tm(n)}</span><span class="chip">Zone ${z}</span><span class="chip good">${done} fait${done>1?'s':''}</span>${r.impossible.length?`<span class="chip bad">${r.impossible.length} priorité${r.impossible.length>1?'s':''} à arbitrer</span>`:'<span class="chip good">Plan viable</span>'}`;
}
function renderAlerts(){
  const r=riskAnalysis(), d=state.day; let h='';
  if(d===19) h+=`<div class="notice" style="margin-bottom:10px"><strong>19 août provisoire :</strong> horaires copiés du 18 pour l'instant. Ils seront remplacés par le programme officiel dès publication.</div>`;
  if(r.impossible.length) h+=`<div class="alert"><b>Arbitrage nécessaire</b><br>Plus de séance simple trouvée pour : ${r.impossible.map(a=>a.name).join(', ')}.<button class="btn primary" onclick="openChatGPT()">🤖 Demander à ChatGPT</button></div>`;
  document.getElementById('alerts').innerHTML=h;
}
function renderNext(){
  const e=nextEntry(), box=document.getElementById('nextCard'), d=state.day, n=nowMin(d), z=currentZone(d);
  if(!e){ box.innerHTML='<div class="eyebrow">Terminé</div><div class="nexttitle">Plus d’étape planifiée</div><button class="btn primary" onclick="recalculate(true)">Recalculer</button>'; return; }
  const a=activity(e.id), ez=zoneOf(e), walk=travel(z,ez), buf=arrivalBuffer(e), leave=min(e.start)-buf-walk, delta=leave-n;
  const cls=delta<0?'danger':delta<=15?'wait':'safe';
  const msg=e.kind==='fixed'?`Rendez-vous à ${e.start}`:delta<=0?'Partez maintenant':`Départ conseillé ${tm(leave)} · dans ${delta} min`;
  const badges=[`<span class="badge zone">${labelZone(ez)} · ${ez}</span>`];
  if(a?.priority) badges.push('<span class="badge o">O · grand spectacle</span>');
  if(a?.covered) badges.push('<span class="badge cover">Couvert</span>');
  let actions='';
  if(e.kind==='show'||e.kind==='flex') actions=`<button class="btn good" onclick="markDone('${e.id}')">✓ Fait</button>${e.kind==='show'?`<button class="btn bad" onclick="blockCurrent('${e.id}','${e.start}','full')">🚫 Complet</button><button class="btn outline" onclick="blockCurrent('${e.id}','${e.start}','late')">⌛ Trop tard</button>`:''}<button class="btn outline" onclick="openAlternatives()">⇄ Changer</button>${d===18&&a?.priority?`<button class="btn outline wide" onclick="postpone('${e.id}')">↪ Reporter au 19</button>`:''}`;
  else if(e.kind==='lunch') actions='<button class="btn good" onclick="markDone(\'lunch\')">✓ Déjeuner terminé</button><button class="btn outline" onclick="openAlternatives()">⇄ Recalculer</button>';
  else actions='<button class="btn outline wide" onclick="openAlternatives()">Voir les alternatives avant/après</button>';
  box.innerHTML=`<div class="eyebrow">${entryStatus(e)==='current'?'MAINTENANT':'PROCHAINE ÉTAPE'}</div><div class="nexttitle">${a?`${a.id} · `:''}${nameOf(e)}</div><div class="meta">${badges.join('')}</div><div class="countdown ${cls}"><strong>${msg}</strong><span class="small">${e.kind==='show'?`Spectacle ${e.start} · placement ${buf} min · marche prudente ${walk} min`:e.note||`Durée ${durationOf(e)} min`}</span></div><div class="actions">${actions}</div>`;
}
function renderTimeline(){
  const d=state.day,n=nowMin(d); let h='';
  for(const e of currentPlan(d)){
    const st=entryStatus(e,d,n),a=activity(e.id),classes=['item',a?.priority?'priority':'',e.kind==='fixed'?'fixed':'',st==='current'?'current':'',st==='done'||st==='past'?'done':''].join(' ');
    const sub=[labelZone(zoneOf(e)),a?.priority?'O':null,a?.covered?'couvert':null,e.note||null].filter(Boolean).join(' · ');
    h+=`<div class="${classes}"><div class="time">${e.start}</div><div><div class="iname">${a?`${a.id} · `:''}${nameOf(e)}</div><div class="isub">${sub}</div></div><div class="dot"></div></div>`;
  }
  document.getElementById('timeline').innerHTML=h||'<div class="notice">Aucune étape future.</div>';
}
function renderShows(){
  let h=''; const d=state.day;
  for(const z of ['H','M','B']){
    h+=`<div class="sectionTitle">${z} · ${labelZone(z)}</div>`;
    for(const a of D.activities.filter(x=>x.zone===z)){
      const done=isDone(d,a.id), post=isPostponed(d,a.id), times=a.sessions?a.sessions.join(' · '):(a.continuous||[]).map(w=>w.join('–')).join(' · ');
      h+=`<div class="showrow ${done?'done':''}"><div class="num">${a.id}</div><div class="grow"><div class="name">${a.name}</div><div class="details">${a.priority?'O · ':''}${a.covered?'couvert':'extérieur'} · ${a.duration} min<br>${times}${post?' · REPORTÉ AU 19':''}</div></div><button class="iconbtn" onclick="toggleDone('${a.id}')">${done?'↶':'✓'}</button></div>`;
    }
  }
  document.getElementById('showsList').innerHTML=h;
}
function renderEngine(){
  const d=state.day,n=nowMin(d),z=currentZone(d),c=candidateSessions(d,n,z).slice(0,5);
  document.getElementById('zoneSelect').value=state.manualZone[d]||'auto';
  document.getElementById('engineState').innerHTML=`Heure : <b>${tm(n)}</b> · position : <b>${z}</b><br>Priorité : O → dernières chances → proximité → couvert aux heures chaudes → contraintes fixes.<br><br><b>Top candidats :</b><br>${c.map(x=>`${x.id} ${activity(x.id).name} ${x.start} (score ${Math.round(x.score)})`).join('<br>')||'aucun'}`;
}
function render(){
  document.getElementById('day18').classList.toggle('active',state.day===18); document.getElementById('day19').classList.toggle('active',state.day===19);
  document.getElementById('sourceLine').textContent=state.day===18?`18 officiel · édition ${D.sourceEdit} · v${D.appVersion}`:`19 provisoire · v${D.appVersion}`;
  renderAlerts(); renderStatus(); renderNext(); renderTimeline(); renderShows(); renderEngine();
}

function showView(id,btn){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id).classList.add('active'); document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active')); btn?.classList.add('active'); window.scrollTo({top:0,behavior:'smooth'}); }
function openModal(html){ document.getElementById('sheet').innerHTML=html; document.getElementById('modal').classList.add('open'); }
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
document.getElementById('modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeModal(); });
function openAlternatives(){
  const d=state.day,n=nowMin(d),z=currentZone(d),alts=candidateSessions(d,n,z).slice(0,6);
  openModal(`<h2>Changer la prochaine étape</h2><p>Les choix proposés respectent les contraintes fixes connues. Le reste sera recalculé.</p>${alts.map(c=>{const a=activity(c.id);return `<button class="option" onclick="chooseAlternative('${a.id}')"><b>${a.id} · ${a.name} — ${c.start}</b><small>${labelZone(a.zone)} · ${a.covered?'couvert':'extérieur'}${a.priority?' · O':''} · départ limite ${tm(c.leave)}</small></button>`}).join('')||'<div class="notice">Pas d’alternative simple : demandez à ChatGPT.</div>'}<button class="btn outline" style="width:100%;margin-top:8px" onclick="closeModal()">Fermer</button>`);
}
function chooseAlternative(id){ closeModal(); recalculate(true,id); }
function chatState(){
  const d=state.day,n=nowMin(d),z=currentZone(d),r=riskAnalysis(d);
  const remaining=D.activities.filter(a=>!isDone(d,a.id)&&!isPostponed(d,a.id));
  const schedules=remaining.map(a=>`${a.id} ${a.name} | ${a.zone} | ${a.covered?'couvert':'extérieur'} | ${a.priority?'O':'optionnel'} | ${a.sessions?a.sessions.join('/'):(a.continuous||[]).map(w=>w.join('-')).join('/')}`).join('\n');
  const blocked=Object.entries(state.blocked[d]||{}).flatMap(([id,ss])=>ss.map(s=>`${id}@${s}`)).join(', ')||'aucune';
  const plan=currentPlan(d).filter(e=>endMin(e)>n).map(e=>`${e.start} ${activity(e.id)?.id?activity(e.id).id+' ':''}${nameOf(e)}`).join(' | ');
  return `PUY_STATE_V1\nDate: ${d}/08/2026\nHeure: ${tm(n)}\nPosition: ${z} (${labelZone(z)})\nDéjà faits 18: ${state.completed[18].join(', ')||'aucun'}\nDéjà faits 19: ${state.completed[19].join(', ')||'aucun'}\nSéances bloquées/pleines: ${blocked}\nReportés au 19: ${state.postponed18.join(', ')||'aucun'}\nPriorités sans solution simple: ${r.impossible.map(a=>a.id+' '+a.name).join(', ')||'aucune'}\nContraintes: ${d===18?'20:00 Café de la Madelon; 22:00 Noces de Feu':'départ visé 20:00–21:00'}\nPlanning actuel: ${plan}\n\nHoraires restants (${d===19?'provisoires copiés du 18':'officiels du 18'}):\n${schedules}\n\nRègles: O = arrivée visée 40 min avant; H/M/B = regroupement géographique; couvert privilégié 13:30–17:00; temps prudents même zone 7–8 min, zone adjacente 14 min, H↔B 22 min.\n\nDemande: recalcule la meilleure suite à partir de maintenant et indique précisément la prochaine action et l'heure de départ.`;
}
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); toast('État copié · collez-le dans ChatGPT'); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('État copié'); }
}
function openChatGPT(){
  const txt=chatState().replace(/</g,'&lt;');
  openModal(`<h2>🤖 ChatGPT est nécessaire pour arbitrer</h2><p>Copiez l'état ci-dessous puis revenez dans cette conversation ChatGPT. Vous n'avez rien à réexpliquer.</p><textarea id="chatState" readonly>${txt}</textarea><div class="actions" style="margin-top:10px"><button class="btn primary wide" onclick="copyText(document.getElementById('chatState').value)">Copier l'état</button><button class="btn outline wide" onclick="closeModal()">Fermer</button></div><div class="footerNote">Aucune clé API n'est stockée dans la page. Si le moteur local ne sait plus arbitrer proprement, il le dit explicitement au lieu de laisser l'utilisateur perdu.</div>`);
}
function openSettings(){
  const live=isLiveDay(state.day);
  openModal(`<h2>Réglages</h2><div class="settingsrow"><span>Heure utilisée</span><input type="time" value="${tm(nowMin())}" ${live?'disabled':''} onchange="setVirtualTime(this.value)"></div><div class="small">${live?'Heure réelle du téléphone utilisée automatiquement.':'Mode aperçu : simulez une heure pour tester.'}</div><div class="settingsrow"><span>Source</span><span class="small">18 officiel · ${D.sourceEdit}</span></div><div class="settingsrow"><span>Version</span><span class="small">v${D.appVersion}</span></div><div class="settingsrow"><span>Mise à jour</span><button class="btn outline" onclick="checkForAppUpdate(true)">Vérifier</button></div><div class="settingsrow"><span>Réinitialiser le jour</span><button class="btn bad" onclick="resetDay()">Réinitialiser</button></div><div class="footerNote">iPhone : ouvrez cette URL dans Safari, puis Partager → Sur l'écran d'accueil. Après le premier chargement, le planner reste utilisable hors ligne.</div><button class="btn outline" style="width:100%;margin-top:12px" onclick="closeModal()">Fermer</button>`);
}
function setVirtualTime(v){ state.virtualTime[state.day]=v; save(); closeModal(); render(); }
function resetDay(){ snapshot('Reset'); const d=state.day; state.completed[d]=[]; state.blocked[d]={}; state.customPlan[d]=null; state.lunchDone[d]=false; state.manualZone[d]='auto'; if(d===18)state.postponed18=[]; save(); closeModal(); render(); toast('Journée réinitialisée'); }
function toast(msg){ let t=document.getElementById('toast'); if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)} t.textContent=msg;t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.display='none',2600); }

function setOfflineUi(){ document.getElementById('offlineBar')?.classList.toggle('show',!navigator.onLine); }
function showUpdateBar(){ document.getElementById('updateBar')?.classList.add('show'); }
async function registerPwa(){
  setOfflineUi(); window.addEventListener('online',()=>{setOfflineUi();checkForAppUpdate(false)}); window.addEventListener('offline',setOfflineUi);
  if(!('serviceWorker' in navigator)) return;
  try{
    swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    if(swRegistration.waiting) showUpdateBar();
    swRegistration.addEventListener('updatefound',()=>{ const w=swRegistration.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)showUpdateBar()}); });
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForAppUpdate(false)});
  }catch(e){ console.warn('Service worker indisponible',e); }
}
async function checkForAppUpdate(userInitiated=false){
  if(!swRegistration){ if(userInitiated)toast('Vérification disponible après le premier chargement HTTPS'); return; }
  try{ await swRegistration.update(); if(swRegistration.waiting)showUpdateBar(); else if(userInitiated)toast('Vous avez déjà la dernière version'); }
  catch(e){ if(userInitiated)toast(navigator.onLine?'Vérification impossible maintenant':'Hors ligne · vérification impossible'); }
}
function applyAppUpdate(){ if(swRegistration?.waiting)swRegistration.waiting.postMessage({type:'SKIP_WAITING'}); else location.reload(); }

Object.assign(window,{setDay,showView,openSettings,recalculate,openAlternatives,openChatGPT,undoLast,manualZone,markDone,toggleDone,blockCurrent,postpone,chooseAlternative,closeModal,copyText,setVirtualTime,resetDay,checkForAppUpdate,applyAppUpdate});
setInterval(()=>{ if(isLiveDay(state.day)){renderStatus();renderNext();renderAlerts();} },30000);
registerPwa(); render();
})();
