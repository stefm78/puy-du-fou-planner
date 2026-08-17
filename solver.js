(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.PuySolver=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';

const min=t=>{const [h,m]=String(t).split(':').map(Number);return h*60+m};
const tm=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(Math.round(n)%60).padStart(2,'0')}`;
const bitCount=n=>{let c=0;while(n){n&=n-1;c++}return c};
const addRank=(a,b)=>a.map((x,i)=>x+(b[i]||0));
const cmpRank=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d}return 0};

function create(data){
  const A=Object.fromEntries(data.activities.map(a=>[String(a.id),a]));
  const priority=data.activities.filter(a=>a.priority);
  const priorityBit=Object.fromEntries(priority.map((a,i)=>[String(a.id),1<<i]));
  const fullMask=priority.reduce((m,a)=>m|priorityBit[String(a.id)],0);
  const zoneVal={B:0,M:1,H:2};

  const travel=(a,b)=>data.travel[a]?.[b]??12;
  const sessionsFor=(a,day)=>a.sessionsByDay?.[day]||a.sessions||[];
  const windowsFor=(a,day)=>a.continuousByDay?.[day]||a.continuous||[];
  const isBlocked=(input,day,id,start)=>(input.blocked?.[day]?.[String(id)]||[]).includes(start);
  const globallyDone=(input,id)=>[...(input.completed?.[18]||[]),...(input.completed?.[19]||[])].includes(String(id));
  const opening=day=>min(data.opening[day]);
  const limit=day=>min(data.planningEnd[day]);
  const dayCompletedPriority=(input,day)=>(input.completed?.[day]||[]).some(id=>A[String(id)]?.priority);

  function remainingMask(input){
    let mask=fullMask;
    for(const a of priority) if(globallyDone(input,a.id)) mask&=~priorityBit[String(a.id)];
    return mask;
  }

  function startContext(input,day){
    if(day===input.day) return {time:Math.max(input.now?.[day]??opening(day),opening(day)),zone:input.zone?.[day]||data.strategy.entranceZone};
    return {time:opening(day),zone:data.strategy.entranceZone};
  }

  function isOpeningPhase(input,day){
    const ctx=startContext(input,day);
    return ctx.time<=opening(day)+30&&!dayCompletedPriority(input,day);
  }

  function feasiblePriorityEvent(input,day,t,z,a,s){
    if(isBlocked(input,day,a.id,s)) return null;
    if(day===18&&(input.postponed18||[]).includes(String(a.id))) return null;
    const start=min(s),arrival=start-data.placementPriorityMin,walk=travel(z,a.zone);
    if(t+walk>arrival) return null;
    const finish=start+a.duration+6;
    if(finish+travel(a.zone,'B')>limit(day)) return null;
    return {kind:'show',id:a.id,start:s,zone:a.zone,arrival,finish,walk,slack:arrival-(t+walk)};
  }

  function openingPenalty(input,day,hasEvent,a,start){
    if(hasEvent||!isOpeningPhase(input,day)) return 0;
    if(a.zone===data.strategy.deepZone&&start<=min(data.strategy.deepStartBestBefore)) return 0;
    if(a.zone===data.strategy.deepZone&&start<=min(data.strategy.deepStartGoodBefore)) return 1;
    if(a.zone==='M') return 4;
    return 7;
  }

  function emptyDayPenalty(input,day,hasEvent){
    if(hasEvent||!isOpeningPhase(input,day)) return 0;
    return 8;
  }

  function nominalPenalty(day,a,start){
    const target=data.strategy.nominalPriority?.[String(a.id)];
    if(!target) return 0;
    if(Number(target.day)!==Number(day)) return 6;
    if(target.start===tm(start)) return 0;
    return 1+Math.min(4,Math.abs(start-min(target.start))/60);
  }

  function eventCost(input,day,t,z,hasEvent,e){
    const a=A[String(e.id)],start=min(e.start),slack=e.slack;
    const fragility=Math.max(0,data.comfortSlackMin-slack);
    const [hs,he]=data.heatWindow[day]||[810,1005];
    const heat=!a.covered&&start>=hs&&start<he?2:0;
    const delta=zoneVal[a.zone]-zoneVal[z];
    const uphill=hasEvent&&delta>0?delta*3:0;
    const skipMiddle=hasEvent&&delta===-2?1:0;
    const sessions=sessionsFor(a,day),idx=sessions.indexOf(e.start),later=sessions.slice(idx+1).filter(x=>!isBlocked(input,day,a.id,x));
    const lastChance=later.length?0:1;
    let crowd=idx===0?1:0;
    if(!hasEvent&&isOpeningPhase(input,day)&&a.zone===data.strategy.entranceZone) crowd+=4;
    if(!hasEvent&&isOpeningPhase(input,day)&&a.zone===data.strategy.deepZone) crowd=Math.max(-1,crowd-1);
    return [0,fragility,uphill,nominalPenalty(day,a,start),openingPenalty(input,day,hasEvent,a,start),heat,0,lastChance,e.walk,crowd,skipMiddle];
  }

  function endDayCost(input,day,z,hasEvent){
    const rank=[0,0,0,0,emptyDayPenalty(input,day,hasEvent),0,0,0,0,0,0];
    if(hasEvent) rank[6]=zoneVal[z];
    return rank;
  }

  function findSkeleton(input,options={}){
    const mask0=remainingMask(input),force=options.forceFirst||null,memo=new Map();
    const c18=startContext(input,18),c19=startContext(input,19);

    function dp(day,t,z,mask,hasEvent,forcePending){
      if(day>19) return {rank:[bitCount(mask),0,0,0,0,0,0,0,0,0,0],path:[],minSlack:null};
      const key=`${day}|${t}|${z}|${mask}|${hasEvent?1:0}|${forcePending?1:0}`;
      if(memo.has(key)) return memo.get(key);
      let best=null;
      const forceThisDay=forcePending&&force?.day===day;

      if(!forceThisDay){
        if(day===18){
          const trans=dp(19,c19.time,c19.zone,mask,false,forcePending);
          best={rank:addRank(endDayCost(input,18,z,hasEvent),trans.rank),path:trans.path,minSlack:trans.minSlack};
        }else{
          best={rank:addRank(endDayCost(input,19,z,hasEvent),[bitCount(mask),0,0,0,0,0,0,0,0,0,0]),path:[],minSlack:null};
        }
      }

      for(const a of priority){
        const bit=priorityBit[String(a.id)]; if(!(mask&bit)) continue;
        for(const s of sessionsFor(a,day)){
          if(forceThisDay&&(String(force.id)!==String(a.id)||force.start!==s)) continue;
          const e=feasiblePriorityEvent(input,day,t,z,a,s); if(!e) continue;
          const cost=eventCost(input,day,t,z,hasEvent,e);
          const nextForce=forceThisDay?false:forcePending;
          const tail=dp(day,e.finish,a.zone,mask&~bit,true,nextForce);
          const rank=addRank(cost,tail.rank);
          const minSlack=tail.minSlack===null?e.slack:Math.min(e.slack,tail.minSlack);
          const cand={rank,path:[{...e,day},...tail.path],minSlack};
          if(!best||cmpRank(cand.rank,best.rank)<0) best=cand;
        }
      }

      if(!best){
        if(day===18){
          const trans=dp(19,c19.time,c19.zone,mask,false,forcePending&&force?.day===19);
          best={rank:addRank(endDayCost(input,18,z,hasEvent),trans.rank),path:trans.path,minSlack:trans.minSlack};
        }else{
          best={rank:addRank(endDayCost(input,19,z,hasEvent),[bitCount(mask),0,0,0,0,0,0,0,0,0,0]),path:[],minSlack:null};
        }
      }
      memo.set(key,best); return best;
    }

    const startDay=input.day===19?19:18;
    const ctx=startDay===18?c18:c19;
    const forcePending=!!force&&force.day>=startDay;
    const best=dp(startDay,ctx.time,ctx.zone,mask0,false,forcePending);
    const p18=best.path.filter(e=>e.day===18),p19=best.path.filter(e=>e.day===19);
    return {18:p18,19:p19,diag:{rank:best.rank,missing:best.rank[0],minSlack:best.minSlack}};
  }

  function zoneAllowedForFiller(aZone,z,nextZone,openingJump){
    if(openingJump) return aZone===data.strategy.deepZone;
    const cv=zoneVal[z],nv=zoneVal[nextZone],av=zoneVal[aZone];
    if(nv<=cv) return av<=cv&&av>=nv;
    return aZone===z;
  }

  function optionalNominalScore(day,a,start){
    const target=data.strategy.nominalOptional?.[String(a.id)];
    if(!target) return 0;
    if(Number(target.day)!==Number(day)) return -45;
    return Math.max(20,120-Math.abs(start-min(target.start))*1.5);
  }

  function optionalCandidate(input,day,cursor,z,deadline,nextZone,used,openingJump=false){
    const candidates=[],safety=data.fillerSafetyMin;
    for(const a of data.activities){
      if(a.priority||globallyDone(input,a.id)||used.has(String(a.id))) continue;
      if(!zoneAllowedForFiller(a.zone,z,nextZone,openingJump)) continue;
      const heat=data.heatWindow[day]||[810,1005];
      if(a.sessions){
        for(const s of sessionsFor(a,day)){
          if(isBlocked(input,day,a.id,s)) continue;
          const st=min(s),arr=st-data.normalShowBufferMin,walk=travel(z,a.zone); if(cursor+walk+(data.optionalArrivalSafetyMin??4)>arr) continue;
          const finish=st+a.duration+3; if(finish+travel(a.zone,nextZone)+safety>deadline) continue;
          const descent=(zoneVal[z]-zoneVal[a.zone])*50;
          const hot=st>=heat[0]&&st<heat[1],outdoorHeat=day===18?90:25,coveredHeat=day===18?60:20;
          let score=(a.zone===z?50:0)+(a.covered&&hot?coveredHeat:0)-(!a.covered&&hot?outdoorHeat:0)-walk-travel(a.zone,nextZone)*0.5+descent+optionalNominalScore(day,a,st);
          score-=Math.max(0,arr-cursor)*0.03;
          candidates.push({entry:{kind:'show',id:a.id,start:s},finish,zone:a.zone,score}); break;
        }
      }else{
        for(const [ws,we] of windowsFor(a,day)){
          const walk=travel(z,a.zone),st=Math.max(min(ws),cursor+walk+5),finish=st+a.duration;
          if(finish>min(we)||finish+travel(a.zone,nextZone)+safety>deadline) continue;
          const descent=(zoneVal[z]-zoneVal[a.zone])*50;
          const hot=st>=heat[0]&&st<heat[1],outdoorHeat=day===18?90:25,coveredHeat=day===18?70:20;
          let score=(a.zone===z?50:0)+(a.covered&&hot?coveredHeat:15)-(!a.covered&&hot?outdoorHeat:0)-walk-travel(a.zone,nextZone)*0.5+descent+8+optionalNominalScore(day,a,st);
          candidates.push({entry:{kind:'flex',id:a.id,start:tm(st)},finish,zone:a.zone,score}); break;
        }
      }
    }
    candidates.sort((a,b)=>b.score-a.score||min(a.entry.start)-min(b.entry.start));
    return candidates[0]?.score>=-5?candidates[0]:null;
  }

  function fillSegment(input,day,cursor,z,deadline,nextZone,used,maxItems,openingJump=false){
    const out=[];
    for(let i=0;i<maxItems;i++){
      const c=optionalCandidate(input,day,cursor,z,deadline,nextZone,used,openingJump&&out.length===0); if(!c) break;
      out.push(c.entry); used.add(String(c.entry.id)); cursor=c.finish; z=c.zone;
      openingJump=false;
    }
    return {entries:out,cursor,zone:z};
  }

  function buildDayPlan(input,day,skeleton,used){
    const ctx=startContext(input,day); let cursor=ctx.time,z=ctx.zone,lunchDone=!!input.lunchDone?.[day]; const out=[];
    const anchors=skeleton.map(e=>({...e,anchorArrival:min(e.start)-data.placementPriorityMin}));
    if(day===18){
      const dinner=data.fixed[18].find(x=>x.id==='dinner');
      if(dinner&&min(dinner.start)>=cursor)anchors.push({...dinner,anchorArrival:min(dinner.start)});
    }
    anchors.sort((a,b)=>min(a.start)-min(b.start));
    let hasAnchor=false;

    for(const anchor of anchors){
      const nextZone=anchor.zone||A[String(anchor.id)]?.zone||z,deadline=anchor.anchorArrival; if(deadline<cursor) continue;
      const openingJump=!hasAnchor&&isOpeningPhase(input,day)&&nextZone===data.strategy.deepZone;

      if(!lunchDone&&hasAnchor&&deadline>=11*60+50&&cursor<=14*60+15){
        const lunchAt=Math.max(cursor,11*60+50);
        if(lunchAt>cursor){
          const pre=fillSegment(input,day,cursor,z,Math.min(lunchAt,deadline),z,used,1,false);
          out.push(...pre.entries);cursor=pre.cursor;z=pre.zone;
        }
        const lunchStart=Math.max(cursor+5,11*60+50);
        if(lunchStart+45+travel(z,nextZone)+data.fillerSafetyMin<=deadline&&lunchStart<=14*60+15){
          out.push({kind:'lunch',id:'lunch',start:tm(lunchStart),duration:45,zone:z,name:'Déjeuner'});
          cursor=lunchStart+45;lunchDone=true;
        }
      }

      const filled=fillSegment(input,day,cursor,z,deadline,nextZone,used,3,openingJump);
      out.push(...filled.entries);cursor=filled.cursor;z=filled.zone;

      out.push(anchor.kind==='fixed'?anchor:{kind:'show',id:anchor.id,start:anchor.start,openingMove:false});
      cursor=anchor.kind==='fixed'?min(anchor.start)+(anchor.duration||0):min(anchor.start)+A[String(anchor.id)].duration+6;
      z=nextZone;hasAnchor=true;
    }

    if(day===18){
      if(out.some(x=>x.id==='dinner')){
        const noces=data.fixed[18].find(x=>x.id==='noces');
        if(noces&&min(noces.start)>=cursor)out.push({...noces});
      }
    }else{
      const filled=fillSegment(input,19,cursor,z,limit(19)-travel(z,'B'),z,used,3,false);
      out.push(...filled.entries);
    }

    const firstPriority=out.find(e=>A[String(e.id)]?.priority);
    if(firstPriority&&isOpeningPhase(input,day)){
      const a=A[String(firstPriority.id)];
      if(a.zone===data.strategy.deepZone&&min(firstPriority.start)<=min(data.strategy.deepStartGoodBefore)){
        firstPriority.openingMove=true;
        firstPriority.note='Contre-courant H→M→B : partir vers le Haut dès l’ouverture';
      }
    }
    return out.sort((a,b)=>min(a.start)-min(b.start));
  }

  function solve(input,options={}){
    const skeleton=findSkeleton(input,options),used=new Set([...(input.completed?.[18]||[]),...(input.completed?.[19]||[])].map(String));
    const plans={18:[],19:[]};
    if(input.day<=18)plans[18]=buildDayPlan(input,18,skeleton[18],used);
    plans[19]=buildDayPlan(input,19,skeleton[19],used);
    const expected=bitCount(remainingMask(input)),covered=expected-skeleton.diag.missing;
    const hmbViolations=skeleton.diag.rank?.[2]||0;
    return {plans,skeleton:{18:skeleton[18].map(e=>({id:e.id,start:e.start})),19:skeleton[19].map(e=>({id:e.id,start:e.start}))},
      diagnostics:{...skeleton.diag,expectedPriority:expected,coveredPriority:covered,complete:skeleton.diag.missing===0,hmbViolations,strategy:data.strategy.label}};
  }

  function alternatives(input,day,limitCount=6){
    const ctx=startContext(input,day),mask=remainingMask(input),out=[];
    for(const a of priority){
      const bit=priorityBit[String(a.id)];if(!(mask&bit))continue;
      if(day===18&&(input.postponed18||[]).includes(String(a.id)))continue;
      for(const s of sessionsFor(a,day)){
        if(!feasiblePriorityEvent(input,day,ctx.time,ctx.zone,a,s))continue;
        const sol=solve(input,{forceFirst:{day,id:a.id,start:s}});
        out.push({id:a.id,start:s,zone:a.zone,covered:sol.diagnostics.coveredPriority,missing:sol.diagnostics.missing,rank:sol.diagnostics.rank,plan:sol.plans[day]});
      }
    }
    out.sort((a,b)=>a.missing-b.missing||cmpRank(a.rank,b.rank)||min(a.start)-min(b.start));
    const seen=new Set();
    return out.filter(x=>{const k=`${x.id}@${x.start}`;if(seen.has(k))return false;seen.add(k);return true}).slice(0,limitCount);
  }

  return {solve,alternatives,minutes:min,time:tm,compareRank:cmpRank};
}

return {create,minutes:min,time:tm};
});
