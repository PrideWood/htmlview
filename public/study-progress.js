// Each player opening is one class record. Rendering and answering update that record.
export function trackStudySession(lesson,classId=''){
 const sessionId=crypto.randomUUID(),visited=new Set();let sequence=0,pending=null,timer;
 const badge=document.createElement('span');badge.className='study-save-state';badge.setAttribute('role','status');document.querySelector('.question-meta>div').append(badge);
 async function flush(){
  clearTimeout(timer);if(!pending)return;const snapshot=pending;
  try{const r=await fetch('/api/lessons/'+encodeURIComponent(lesson.id)+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),keepalive:true});if(!r.ok)throw new Error();if(pending===snapshot){pending=null;badge.textContent='学习进度已保存';}}
  catch{badge.textContent='进度尚未保存 · 正在重试';if(pending===snapshot)timer=setTimeout(flush,5000);}
 }
 window.addEventListener('classroom-progress',e=>{for(const i of e.detail.indices)visited.add(i);pending={sessionId,classId,sequence:++sequence,index:e.detail.index,visited:[...visited]};badge.textContent='正在保存进度…';clearTimeout(timer);timer=setTimeout(flush,500);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 window.addEventListener('pagehide',flush);window.addEventListener('online',flush);
 window.dispatchEvent(new Event('classroom-progress-request'));
}
