import test from 'node:test';
import {restoreQuestionBankLessonBeforeRepairs} from '../lib/question-text-repairs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateLesson} from '../lib/lesson.mjs';
import {getLesson,publicLesson} from '../lib/storage.mjs';
import {presentationMaterials} from '../public/lesson-materials.js';
const docs=JSON.parse(fs.readFileSync(new URL('../seed/lessons.json',import.meta.url)));
const added=docs.filter(d=>d.id.startsWith('builtin-danzhao2025-'));
test('原51份1570项保持完整',()=>{const original=docs.filter(d=>!d.id.startsWith('builtin-danzhao2025-')).map(restoreQuestionBankLessonBeforeRepairs);assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'d498edf4a9570e2fdb6d79adc023ffa8be5bca1690321dc01a5ac55aef818f5b');});
test('1000题按14语法专题、50阅读篇章、30翻译篇章完整导入，原题号连续',()=>{
 assert.equal(added.length,94);assert.equal(new Set(docs.map(d=>d.id)).size,145);
 for(const [kind,count,questions] of [['grammar',14,600],['reading',50,250],['translation',30,150]]){
  const group=added.filter(d=>d.id.includes('-'+kind+'-'));assert.equal(group.length,count);assert.equal(group.reduce((n,d)=>n+d.questions.length,0),questions);
  for(const d of group){assert.equal(d.sourceType,'builtin');assert.deepEqual(d.questions.map(q=>q.label),d.questions.map((_,i)=>String(i+1)));assert.equal(validateLesson(d,{draft:true}).questions.length,d.questions.length);}
 }
});
test('阅读逐题依据原文补答，原题歧义继续不计分',()=>{
 const pending=added.flatMap(d=>d.questions).filter(q=>q.invalid);assert.equal(pending.length,20);
 const reading=added.filter(d=>d.id.includes('-reading-')).flatMap(d=>d.questions);
 assert.equal(reading.length,250);assert.equal(reading.filter(q=>!q.invalid).length,244);assert.ok(reading.every(q=>q.answerBasis.includes('依据本篇原文独立核对')));assert.ok(pending.every(q=>q.answer==='待确认'&&q.accepted.length===0&&q.examNote));
 for(const d of added)for(const q of d.questions){assert.ok(q.stem.trim());if(q.mode==='choice'){assert.ok(q.options.length>=2);assert.equal(new Set(q.options.map(o=>o.key)).size,q.options.length);assert.ok(q.options.every(o=>o.text.trim()));if(!q.invalid)assert.ok(q.options.some(o=>o.key===q.answer));}}
});
test('阅读保留全文，翻译保留划线题干和150条参考译文，图形题保留可展示原图',async()=>{
 for(const d of added.filter(d=>!d.id.includes('-grammar-'))){const loaded=presentationMaterials(publicLesson(await getLesson(d.id)));for(const q of loaded.questions)assert.ok(q.context.length);}
 const translation=added.filter(d=>d.id.includes('-translation-')).flatMap(d=>d.questions);
 assert.equal(translation.length,150);assert.ok(translation.every(q=>q.mode==='input'&&q.questionType==='translation'&&/^【[英汉]译[英汉]】/.test(q.stem)&&!q.invalid&&q.answer!=='待确认'));
 for(const d of added.filter(d=>d.images.length)){
  assert.ok(d.questions.every(q=>q.materialFallback==='images'));
  for(const img of d.images){assert.ok(img.url.startsWith('/builtin-assets/danzhao-2025/'));const bytes=fs.readFileSync(new URL('../public'+img.url,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');}
 }
 const graphic=added.find(d=>d.id.endsWith('reading-22')).questions[4];assert.deepEqual(graphic.options.map(o=>o.key),['A','B','C','D']);
});

test('1000题均有补编解析，题干已登记修订可追溯，选项篇章保持完整，补编可重复应用',async()=>{
 const content=added.map(restoreQuestionBankLessonBeforeRepairs).map(d=>({id:d.id,questions:d.questions.map(({label,stem,options,context,mode,questionType,materialFallback})=>({label,stem,options,context,mode,questionType,materialFallback}))}));
 assert.equal(createHash('sha256').update(JSON.stringify(content)).digest('hex'),'e6ca53854e003663bf499876e8c6540202a45767b8f8c6b99be82eb6a31b2865');
 const questions=added.flatMap(d=>d.questions);assert.equal(questions.length,1000);
 for(const q of questions){assert.equal(q.reasonSource,'本项目逐题补编');assert.ok(q.reason.length>=12);assert.doesNotMatch(q.reason,/原答案文件未提供逐题解析|请补充解析|答案PDF的阅读选择部分只有46行/);assert.equal(typeof q.originalAnswer,'string');}
 assert.equal(new Set(questions.map(q=>q.reason)).size,1000);
 const {enrichDanzhao}=await import('../scripts/enrich-danzhao-2025.mjs');assert.deepEqual(enrichDanzhao(docs).docs,docs);
});
test('关键错答和译文范围修订有记录，不把多解误作多选',()=>{
 const q=(name,n)=>added.find(d=>d.id.endsWith(name)).questions[n-1];
 for(const [name,n,before,after] of [['grammar-02',38,'D','B'],['grammar-04',12,'D','B'],['grammar-08',10,'C','B']]){assert.equal(q(name,n).originalAnswer,before);assert.equal(q(name,n).answer,after);assert.equal(q(name,n).invalid,false);}
 assert.equal(q('reading-22',5).answer,'A');assert.equal(q('reading-30',1).answer,'B');assert.equal(q('reading-42',1).answer,'B');
 assert.equal(q('translation-08',3).answer,'这些食物能给他足够的能量。');assert.doesNotMatch(q('translation-26',2).answer,/成绩|所以/);assert.match(q('translation-28',5).answer,/继续前进/);assert.equal(q('translation-22',5).answer,'Second, they often encourage others.');
 for(const [name,n] of [['grammar-04',2],['grammar-13',35],['grammar-13',46],['reading-21',3],['reading-29',4]]){assert.equal(q(name,n).invalid,true);assert.equal(q(name,n).mode,'choice');assert.deepEqual(q(name,n).accepted,[]);}
});
