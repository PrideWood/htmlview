import fs from 'node:fs';
const ledger=JSON.parse(fs.readFileSync(new URL('../seed/question-text-repairs.json',import.meta.url),'utf8'));
export const questionTextRepairLedger=ledger;
const byLesson=new Map();
for(const edit of ledger.changes){const rows=byLesson.get(edit.lessonId)||[];rows.push(edit);byLesson.set(edit.lessonId,rows);}
function transform(doc,reverse){
 const edits=byLesson.get(doc.id);if(!edits)return doc;
 const result=structuredClone(doc);
 for(const edit of edits){
  let owner=edit.label===undefined?result:result.questions.find(q=>String(q.label)===edit.label);
  if(!owner)throw new Error(`题干修订找不到题号：${doc.id}/${edit.label}`);
  const parts=edit.path.split('.');for(const key of parts.slice(0,-1)){owner=owner?.[key];if(owner===undefined)throw new Error(`题干修订路径不存在：${doc.id}/${edit.path}`);}
  const key=parts.at(-1),from=reverse?edit.after:edit.before,to=reverse?edit.before:edit.after;
  if(owner[key]===from)owner[key]=to;
  else if(owner[key]!==to)throw new Error(`题干修订原文已变动，需复核：${doc.id}/${edit.label||''}/${edit.path}`);
 }
 return result;
}
export const repairQuestionBankLesson=doc=>transform(doc,false);
export const restoreQuestionBankLessonBeforeRepairs=doc=>transform(doc,true);
