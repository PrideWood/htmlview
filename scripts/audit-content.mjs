import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {cleanLessonText} from '../public/content-format.js';
const seed=new URL('../seed/lessons.json',import.meta.url),reportFile=new URL('../review/content-fixes.json',import.meta.url);
const docs=JSON.parse(await readFile(seed,'utf8')),changes=[];
const edited=docs.map(d=>cleanLessonText(d,c=>changes.push({lessonId:d.id,title:d.title,...c})));
const base={lessons:docs.length,questions:docs.reduce((n,d)=>n+d.questions.length,0)};
if(process.argv.includes('--write')){
 let prior=[];try{prior=JSON.parse(await readFile(reportFile,'utf8')).changes||[];}catch(e){if(e.code!=='ENOENT')throw e;}
 const all=prior.concat(changes);const summary={...base,changedLessons:new Set(all.map(c=>c.lessonId)).size,changedFields:new Set(all.map(c=>c.lessonId+':'+c.path)).size,changedQuestionStems:new Set(all.filter(c=>/^questions\.\d+\.stem$/.test(c.path)).map(c=>c.lessonId+':'+c.path)).size,editOperations:all.length};
 await writeFile(seed,JSON.stringify(edited));await mkdir(new URL('../review/',import.meta.url),{recursive:true});await writeFile(reportFile,JSON.stringify({summary,changes:all},null,2));console.log(JSON.stringify(summary));
}else console.log(JSON.stringify({...base,remainingFormattingChanges:changes.length}));
