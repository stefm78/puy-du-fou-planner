global.window={};
require('../data.js');
const S=require('../solver.js');
const D=window.PUY_DATA,E=S.create(D);
const assert=(x,m)=>{if(!x)throw new Error(m)};
const priorityIds=plan=>plan.filter(e=>D.activities.find(a=>a.id===e.id)?.priority).map(e=>String(e.id));
const base=()=>({day:18,now:{18:540,19:540},zone:{18:'B',19:'B'},completed:{18:[],19:[]},blocked:{18:{},19:{}},postponed18:[],lunchDone:{18:false,19:false}});

let i=base();
let t0=Date.now(),s=E.solve(i),elapsed=Date.now()-t0;
assert(elapsed<1000,`baseline solve too slow: ${elapsed}ms`);
assert(s.diagnostics.complete,'baseline must cover every remaining O');
assert(s.diagnostics.hmbViolations===0,'baseline must preserve H→M→B without upward reversal');
assert((s.diagnostics.minSlack??0)>=10,'baseline should keep at least 10 min inter-show comfort slack');
assert(JSON.stringify(s.skeleton[18])===JSON.stringify([{id:3,start:'10:15'},{id:2,start:'12:15'},{id:6,start:'15:15'},{id:7,start:'19:00'}]),'day 18 nominal O skeleton drifted');
assert(JSON.stringify(s.skeleton[19])===JSON.stringify([{id:1,start:'11:15'},{id:4,start:'15:45'},{id:5,start:'18:15'}]),'day 19 nominal O skeleton drifted');
assert(s.plans[18].find(e=>e.id===3)?.openingMove===true,'day 18 must start counter-flow toward H');
assert(s.plans[19].find(e=>e.id===1)?.openingMove===true,'day 19 must start counter-flow toward H');
const all=[...priorityIds(s.plans[18]),...priorityIds(s.plans[19])];
assert(new Set(all).size===7&&all.length===7,'each O must appear exactly once across the two days');
const optionalIds=[...s.plans[18],...s.plans[19]].filter(e=>Number.isInteger(Number(e.id))&&!D.activities.find(a=>a.id===Number(e.id))?.priority).map(e=>String(e.id));
for(const id of ['10','19','12','18','13','8','11'])assert(optionalIds.includes(id),`nominal optional ${id} missing`);
assert(!optionalIds.includes('9'),'L’Épée du Roi Arthur must remain the nominal reserve, not a fragile filler');
assert(s.plans[18].some(e=>e.id==='dinner'&&e.start==='20:00'),'Madelon 20:00 fixed constraint missing');
assert(s.plans[18].some(e=>e.id==='noces'&&e.start==='22:00'),'Noces 22:00 fixed constraint missing');

i=base();i.blocked[18]['3']=['10:15'];s=E.solve(i);
assert(s.diagnostics.complete,'a full Bal 10:15 must be recoverable without ChatGPT');
assert(s.diagnostics.hmbViolations===0,'Bal recovery should keep H→M→B if possible');
assert(!(s.skeleton[18][0]?.id===3&&s.skeleton[18][0]?.start==='10:15'),'blocked session cannot survive the replan');

i=base();i.completed[18]=['3','2'];i.now[18]=14*60;i.zone[18]='H';s=E.solve(i);
assert(s.diagnostics.complete,'afternoon replan should preserve every remaining O');
assert(s.diagnostics.hmbViolations===0,'afternoon repair should not introduce an upward reversal');
assert(!priorityIds(s.plans[18]).includes('3')&&!priorityIds(s.plans[19]).includes('3'),'completed O must never be replanned');

i=base();i.postponed18=['6'];s=E.solve(i);
assert(s.diagnostics.complete,'manual day-19 report should remain globally solvable');
assert(!s.skeleton[18].some(e=>e.id===6),'reported O cannot remain on day 18');

i=base();for(const d of [18,19])i.blocked[d]['1']=[...D.activities.find(a=>a.id===1).sessions];s=E.solve(i);
assert(!s.diagnostics.complete&&s.diagnostics.missing>=1,'an O unavailable on both days must trigger arbitration');

i=base();const alts=E.alternatives(i,18,5);
assert(alts.length>1,'planner should offer several globally evaluated alternatives');
assert(alts.some(a=>a.missing===0),'at least one alternative must preserve every O');
console.log('H-M-B global solver scenarios OK');
