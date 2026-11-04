import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const revisions=JSON.parse(fs.readFileSync(new URL('../seed/legacy-explanation-revisions.json',import.meta.url),'utf8'));
export function reviseLegacyExplanations(docs){
 const result=structuredClone(docs);
 for(const edit of revisions){
  const q=result.find(d=>d.id===edit.lessonId)?.questions.find(q=>q.label===edit.label);
  if(!q)throw new Error(`解析修订找不到题目：${edit.lessonId}/${edit.label}`);
  if(q.reason===edit.before)q.reason=edit.after;
  else if(q.reason!==edit.after)throw new Error(`解析原文已变动，需复核：${edit.lessonId}/${edit.label}`);
 }
 return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const file=new URL('../seed/lessons.json',import.meta.url),docs=JSON.parse(fs.readFileSync(file,'utf8')),result=reviseLegacyExplanations(docs);
 if(JSON.stringify(docs)!==JSON.stringify(result))fs.writeFileSync(file,JSON.stringify(result));
 console.log(JSON.stringify({reviewed:revisions.length}));
}
