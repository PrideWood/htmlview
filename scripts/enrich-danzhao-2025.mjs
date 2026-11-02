import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cleanLessonText} from '../public/content-format.js';
const root=new URL('../',import.meta.url);
const seedFile=new URL('seed/lessons.json',root);
const folder=new URL('seed/danzhao-2025-explanations/',root);
const prefix='builtin-danzhao2025-';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const corrections=read(new URL('corrections.json',folder));
export function enrichDanzhao(docs){
 let authored=0;
 const changes=[];
 const enriched=docs.map(doc=>{
  if(!doc.id.startsWith(prefix))return doc;
  const name=doc.id.slice(prefix.length);
  const reasons=read(new URL(name+'.json',folder));
  if(reasons.length!==doc.questions.length)throw Error(`${name}: 解析数与题目数不一致`);
  const questions=doc.questions.map((original,index)=>{
   const q={...original},reason=reasons[index];
   if(typeof reason!=='string'||reason.length<12)throw Error(`${name}/${q.label}: 缺少切题解析`);
   q.originalAnswer??=q.answer;
   q.originalExamNote??=q.examNote||'';
   q.originalInvalid??=q.invalid;
   q.answer=q.originalAnswer;q.invalid=q.originalInvalid;q.examNote=q.originalExamNote;
   q.reasonSource='本项目逐题补编';
   if(name.startsWith('reading-')){
    const separator=reason.indexOf('|'),key=reason.slice(0,separator);
    if(separator!==1||!/[A-D?]/.test(key))throw Error(`${name}/${q.label}: 阅读答案格式错误`);
    q.reason=reason.slice(separator+1);
    q.answer=key==='?'?'待确认':key;
    q.invalid=key==='?';
    q.examNote=q.invalid?q.reason:'';
    q.answerBasis='依据本篇原文独立核对；未按无篇号答案表的行序匹配';
   }else q.reason=reason;
   Object.assign(q,corrections[name]?.[q.label]||{});
   q.accepted=q.mode==='choice'&&!q.invalid?[q.answer]:[];
   q.reviewStatus=q.invalid?'needs_review':'ok';
   q.reviewed=!q.invalid;
   if(!q.invalid&&q.mode==='choice'&&!q.options.some(o=>o.key===q.answer))throw Error(`${name}/${q.label}: 答案不是有效选项`);
   if(q.originalAnswer!==q.answer||q.originalInvalid!==q.invalid)changes.push({lessonId:doc.id,label:q.label,before:q.originalAnswer,after:q.answer,wasInvalid:q.originalInvalid,invalid:q.invalid,note:q.examNote||q.reason});
   authored++;
   return q;
  });
  const pending=questions.filter(q=>q.invalid).length;
  const notes=doc.notes.filter(t=>!t.includes('未提供逐题解析')&&!t.includes('只有46行答案')&&!t.startsWith('本批解析')&&!t.startsWith('本资料'));
  notes.push('本批解析为本项目逐题补编，语法解释具体选词与句型，阅读说明本篇原文依据，翻译解释本句关键表达；不是原书解析。');
  notes.push(`本资料${pending?'有'+pending+'题因原题歧义或缺少判定依据标为待核对，暂不计分。':'题目已逐题配有解析。'}阅读答案依据原文独立核对，不机械套用无篇号答案表；翻译答案允许其他准确表达。`);
  return cleanLessonText({...doc,notes,questions,version:2,updatedAt:'2026-11-02T09:00:00.000Z'});
 });
 if(authored!==1000)throw Error(`应有1000题解析，实际${authored}`);
 return {docs:enriched,changes};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {docs,changes}=enrichDanzhao(read(seedFile));
 fs.writeFileSync(seedFile,JSON.stringify(docs));
 const added=docs.filter(d=>d.id.startsWith(prefix));
 const pending=added.flatMap(d=>d.questions.filter(q=>q.invalid).map(q=>({lessonId:d.id,label:q.label,reason:q.reason})));
 const report={authoredExplanations:1000,grammar:600,reading:250,translation:150,pending:pending.length,changes,pendingQuestions:pending};
 fs.writeFileSync(new URL('review/danzhao-2025-explanations.json',root),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({authored:1000,pending:pending.length,answersOrReviewStatesChanged:changes.length}));
}
