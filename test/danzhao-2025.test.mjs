import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateLesson} from '../lib/lesson.mjs';
import {getLesson,publicLesson} from '../lib/storage.mjs';
import {presentationMaterials} from '../public/lesson-materials.js';
const docs=JSON.parse(fs.readFileSync(new URL('../seed/lessons.json',import.meta.url)));
const added=docs.filter(d=>d.id.startsWith('builtin-danzhao2025-'));
test('原51份1570项保持完整',()=>{const original=docs.filter(d=>!d.id.startsWith('builtin-danzhao2025-'));assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'d498edf4a9570e2fdb6d79adc023ffa8be5bca1690321dc01a5ac55aef818f5b');});
test('1000题按14语法专题、50阅读篇章、30翻译篇章完整导入，原题号连续',()=>{
 assert.equal(added.length,94);assert.equal(new Set(docs.map(d=>d.id)).size,145);
 for(const [kind,count,questions] of [['grammar',14,600],['reading',50,250],['translation',30,150]]){
  const group=added.filter(d=>d.id.includes('-'+kind+'-'));assert.equal(group.length,count);assert.equal(group.reduce((n,d)=>n+d.questions.length,0),questions);
  for(const d of group){assert.equal(d.sourceType,'builtin');assert.deepEqual(d.questions.map(q=>q.label),d.questions.map((_,i)=>String(i+1)));assert.equal(validateLesson(d,{draft:true}).questions.length,d.questions.length);}
 }
});
test('存疑答案不计分，46行无篇号阅读答案不按顺序强行匹配',()=>{
 const pending=added.flatMap(d=>d.questions).filter(q=>q.invalid);assert.equal(pending.length,254);
 const reading=added.filter(d=>d.id.includes('-reading-')).flatMap(d=>d.questions);
 assert.equal(reading.length,250);assert.ok(reading.every(q=>q.invalid&&q.answer==='待确认'&&q.accepted.length===0&&q.examNote.includes('46行')));
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
