const digits=s=>String(s||'').replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10));
function numberInfo(q){
 const label=digits(q.label).trim().replace(/\s*·\s*\d+(?:-\d+)?$/,''),blank=digits(q.blankLabel).trim();
 const bare=/^(?:第\s*)?(\d+(?:[.．]\d+)*)(?:[.．、)）题])?$/;
 const blankMatch=blank.match(bare),mainMatch=label.match(bare);
 if(mainMatch)return {prefix:'',numbers:(blankMatch?.[1]||mainMatch[1]).split(/[.．]/).map(Number)};
 const match=label.match(/^(.*?)(\d+(?:[.．]\d+)*)(?:[.．、)）题])?$/);if(!match)return null;
 return {prefix:match[1].trim(),numbers:(blankMatch?.[1]||match[2]).split(/[.．]/).map(Number)};
}
export function orderQuestions(questions){
 const records=questions.map((q,index)=>({q,index,info:numberInfo(q)})),seen=new Set();let resets=false;
 for(const r of records){if(!r.info)continue;const key=r.info.numbers.join('.');if(seen.has(key))resets=true;seen.add(key);}
 const groups=new Map();
 for(const r of records){
  const key=r.info?(r.info.prefix&&(resets||/章|单元|chapter|unit|part\s*\d/i.test(r.info.prefix))?'chapter:'+r.info.prefix:resets?'reset:'+(r.q.groupId||r.q.section||''):'number'):'other:'+r.index;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 const compare=(a,b)=>{if(!a.info||!b.info)return a.index-b.index;for(let i=0;i<Math.max(a.info.numbers.length,b.info.numbers.length);i++){const d=(a.info.numbers[i]??-1)-(b.info.numbers[i]??-1);if(d)return d;}return a.index-b.index;};
 return [...groups.values()].flatMap(group=>group.sort(compare).map(r=>r.q));
}
export function orderedLesson(lesson){return lesson.sourceType==='builtin'||lesson.questionOrder==='manual'?lesson:{...lesson,questionOrder:'number',questions:orderQuestions(lesson.questions||[])};}
