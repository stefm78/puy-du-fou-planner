(() => {
'use strict';
function sourceEdit(day){return window.PUY_DATA?.sourceEdits?.[day]||window.PUY_DATA?.sourceEdit||'—'}
function patchSourceUi(){
  const src=document.getElementById('sourceLine');
  if(src&&src.textContent.includes('19 provisoire'))src.textContent=src.textContent.replace('19 provisoire',`19 officiel · édition ${sourceEdit(19)}`);
  document.querySelectorAll('#alerts .notice').forEach(n=>{if(n.textContent.includes('19 août provisoire'))n.remove()});
  const d19=document.getElementById('day19');d19?.querySelector('.provisional')?.remove();
  const sheet=document.getElementById('sheet');
  if(sheet?.textContent.includes('Source programme')){
    for(const row of sheet.querySelectorAll('.settingsrow')){
      const label=row.firstElementChild?.textContent?.trim();
      if(label==='Source programme'){
        const value=row.lastElementChild;
        if(value)value.innerHTML=`18 officiel · ${sourceEdit(18)}<br>19 officiel · ${sourceEdit(19)}`;
      }
    }
  }
}
const observer=new MutationObserver(patchSourceUi);
function start(){patchSourceUi();observer.observe(document.body,{childList:true,subtree:true,characterData:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
