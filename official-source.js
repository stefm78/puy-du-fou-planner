(() => {
'use strict';
function sourceEdit(day){return window.PUY_DATA?.sourceEdits?.[day]||window.PUY_DATA?.sourceEdit||'—'}
function patchSourceUi(){
  const src=document.getElementById('sourceLine');
  if(src&&src.textContent.includes('19 provisoire')){
    const next=src.textContent.replace('19 provisoire',`19 officiel · édition ${sourceEdit(19)}`);
    if(src.textContent!==next)src.textContent=next;
  }
  document.querySelectorAll('#alerts .notice').forEach(n=>{if(n.textContent.includes('19 août provisoire'))n.remove()});
  const provisional=document.getElementById('day19')?.querySelector('.provisional');
  if(provisional)provisional.remove();
  const sheet=document.getElementById('sheet');
  if(sheet?.textContent.includes('Source programme')){
    for(const row of sheet.querySelectorAll('.settingsrow')){
      if(row.firstElementChild?.textContent?.trim()!=='Source programme')continue;
      const value=row.lastElementChild;
      const target=`18 officiel · ${sourceEdit(18)}<br>19 officiel · ${sourceEdit(19)}`;
      if(value&&value.innerHTML!==target)value.innerHTML=target;
    }
  }
}
let pending=false;
const observer=new MutationObserver(()=>{
  if(pending)return;
  pending=true;
  queueMicrotask(()=>{pending=false;patchSourceUi()});
});
function start(){patchSourceUi();observer.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
