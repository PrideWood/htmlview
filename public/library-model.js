export function filterLibrary(lessons,{filter='all',search='',topic=''}={}){
 const query=search.trim().toLocaleLowerCase();
 return lessons.filter(d=>filter==='archived'?d.status==='archived':d.status!=='archived').filter(d=>filter==='custom'?d.sourceType!=='builtin':filter==='builtin'?d.sourceType==='builtin':filter==='draft'?['draft','uploaded','error','processing'].includes(d.status):filter==='ready'?d.status==='ready':filter==='recent'?Boolean(d.lastUsedAt):true).filter(d=>(!topic||d.topic===topic)&&(!query||(d.title+' '+d.topic).toLocaleLowerCase().includes(query)));
}
export function sortLibrary(list,order='recent'){
 return [...list].sort((a,b)=>{if(order==='title')return a.title.localeCompare(b.title,'zh-CN',{numeric:true});const field=order==='updated'?'updatedAt':'lastUsedAt';const delta=(b[field]||'').localeCompare(a[field]||'');return delta||a.topic.localeCompare(b.topic,'zh-CN',{numeric:true})||a.title.localeCompare(b.title,'zh-CN',{numeric:true});});
}
export function libraryGroups(list){const map=new Map();for(const d of list){const topic=d.topic||'未分类';const g=map.get(topic)||{topic,count:0,questions:0};g.count++;g.questions+=d.count;map.set(topic,g);}return [...map.values()].sort((a,b)=>a.topic.localeCompare(b.topic,'zh-CN',{numeric:true}));}
