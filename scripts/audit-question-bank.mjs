import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {hydrateMaterials} from '../public/lesson-materials.js';
import {repairQuestionBankLesson,questionTextRepairLedger} from '../lib/question-text-repairs.mjs';
export function readAllBuiltinSources(){return ['lessons','english-monthly-exam','selected-papers'].flatMap(name=>{const value=JSON.parse(fs.readFileSync(new URL('../seed/'+name+'.json',import.meta.url),'utf8'));return Array.isArray(value)?value:[value];});}
export function auditQuestionBank(docs){
 const issues=[],reviewed=[];let questions=0;
 const ids=new Set();
 for(const original of docs){
  if(ids.has(original.id))issues.push({id:original.id,type:'duplicate-lesson'});ids.add(original.id);
  if(JSON.stringify(repairQuestionBankLesson(original))!==JSON.stringify(original))issues.push({id:original.id,type:'unapplied-reviewed-fix'});
  const d=hydrateMaterials(original),labels=new Set();
  for(const q of d.questions){questions++;let classification='无需填空横线的非选择题';
   const issue=type=>issues.push({id:d.id,label:q.label,type,stem:q.stem});
   if(!q.stem?.trim())issue('empty-stem');
   if(labels.has(q.label))issue('duplicate-label');labels.add(q.label);
   if(/课件课堂练习\d+|课件第\s*\d+页|\uFFFD/.test(q.stem))issue('ocr-or-slide-residue');
   if(/(?<!_)_(?!_)/.test(q.stem))issue('single-underscore-not-rendered');
   if(q.options?.length&&['choice','multi'].includes(q.mode)){
    if(q.options.some(o=>!o.text.trim()))issue('empty-option');
    if(/选择填入第/.test(q.stem)||['cloze','sentence_completion','matching'].includes(q.questionType)){
     const label=String(q.blankLabel||q.label).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
     const material=q.context.map(b=>b.text||'').join('\n');
     if(!new RegExp('_{2,}\\s*[（(\\[]\\s*'+label+'\\s*[）)\\]]').test(material))issue('numbered-slot-has-no-line');
     classification='空号对应共享篇章中的横线';
    }else if(/_{2,}/.test(q.stem))classification='题干含可显示填空横线';
    else if(/选出.*读音|读音.*选出/.test(q.stem))classification='完整语音辨析指令';
    else if(/[?？]/.test(q.stem))classification='完整问句或词义辨析指令';
    else issue('completion-stem-without-slot-or-question');
   }
   if(/缺少完整题干/.test(q.stem))classification='原始资料缺题记录（不计分）';
   reviewed.push({lessonId:d.id,label:q.label,classification});
  }
 }
 return {lessons:docs.length,questions,issues,reviewed,unrecoverable:questionTextRepairLedger.unrecoverable};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=auditQuestionBank(readAllBuiltinSources());
 if(process.argv.includes('--write'))fs.writeFileSync(new URL('../review/question-bank-coverage.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({lessons:report.lessons,questions:report.questions,issues:report.issues,sourceMissing:report.unrecoverable.length}));
 if(report.issues.length)process.exitCode=1;
}
