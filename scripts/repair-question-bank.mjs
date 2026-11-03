import fs from 'node:fs';
import {cleanLessonText} from '../public/content-format.js';
import {repairQuestionBankLesson,questionTextRepairLedger} from '../lib/question-text-repairs.mjs';
const files=['seed/lessons.json','seed/english-monthly-exam.json','seed/selected-papers.json'];
let docs=[];
for(const name of files){const file=new URL('../'+name,import.meta.url),raw=fs.readFileSync(file,'utf8'),data=JSON.parse(raw);const array=Array.isArray(data)?data:[data];const fixed=array.map(d=>cleanLessonText(repairQuestionBankLesson(d)));docs.push(...fixed);if(process.argv.includes('--write')&&JSON.stringify(array)!==JSON.stringify(fixed))fs.writeFileSync(file,JSON.stringify(Array.isArray(data)?fixed:fixed[0],null,raw.includes('\n  ')?2:undefined)+(raw.endsWith('\n')?'\n':''));}
const edits=questionTextRepairLedger.changes;
const summary={lessons:docs.length,questions:docs.reduce((n,d)=>n+d.questions.length,0),changedLessons:new Set(edits.map(e=>e.lessonId)).size,changedQuestions:new Set(edits.filter(e=>e.label).map(e=>e.lessonId+'/'+e.label)).size,stemRepairs:edits.filter(e=>e.path==='stem').length,materialFieldRepairs:edits.filter(e=>e.path!=='stem').length,unrecoverable:questionTextRepairLedger.unrecoverable};
if(process.argv.includes('--write'))fs.writeFileSync(new URL('../review/question-bank-text-audit.json',import.meta.url),JSON.stringify({...summary,changes:edits},null,2)+'\n');
console.log(JSON.stringify(summary));
