import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {reviseLegacyExplanations} from '../scripts/revise-legacy-explanations.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const report=read('review/explanation-revision-audit.json');
const banks=Object.fromEntries(Object.keys(report.banks).map(name=>[name,read('seed/'+name+'.json')]));
const selected=banks['selected-papers'],monthly=banks['english-monthly-exam'];
const get=(name,label)=>selected.find(d=>d.id==='builtin-selected-papers-'+name).questions.find(q=>q.label===String(label));
test('296条解析修订保持全部题干、选项、答案、判分及来源信息完整',()=>{
 assert.equal(report.revised,296);
 for(const [name,expected] of Object.entries(report.banks)){
  const docs=structuredClone(Array.isArray(banks[name])?banks[name]:[banks[name]]);
  for(const doc of docs)for(const q of doc.questions)delete q.reason;
  const data=Array.isArray(banks[name])?docs:docs[0];
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'),expected.immutableSha256,name);
 }
});
test('精选199题正文不再混入来源，月考42题均替换模板，解析逐题独立',()=>{
 const qs=selected.flatMap(d=>d.questions);assert.equal(qs.length,199);assert.equal(new Set(qs.map(q=>q.reason)).size,199);
 for(const q of [...qs,...monthly.questions]){assert.ok(q.reason.length>50);assert.doesNotMatch(q.reason,/真题来源|扫描PDF第|教材第|参考答案依据原题|请教师核对|结合本题的主语、空格位置及上下文应用/);}
 assert.equal(monthly.questions.length,42);
 assert.match(monthly.questions.find(q=>q.label==='33').reason,/主语从句.*取决于/);
 assert.match(monthly.questions.find(q=>q.label==='39').reason,/should \+ be \+ 过去分词/);
 assert.match(monthly.questions.find(q=>q.label==='42').reason,/How busy.*也可成立/);
});
test('解析解释本题的语法、干扰项、原文证据、改错与作文要点',()=>{
 const verb=get('verbs',3);assert.match(verb.reason,/turn out/);assert.doesNotMatch(verb.reason,/turn in/);
 assert.match(get('nonfinite',2).reason,/to是介词.*动名词/);
 assert.match(get('adjectives',7).reason,/并不是too/);
 assert.match(get('reading-2024-2',9).reason,/9岁.*免费|9岁.*不收费/);
 assert.match(get('reading-2024-3',12).reason,/妻子当时.*误解/);
 assert.match(get('cloze-2024',7).reason,/a lot须加of/);
 assert.match(get('correction-2024',1).reason,/同位语.*has/);
 assert.match(get('correction-2022',8).reason,/本行正确.*did not后hear/);
 assert.match(get('writing-2022',1).reason,/To make it come true.*具体行动/);
 const pending=selected.flatMap(d=>d.questions).filter(q=>q.invalid);assert.equal(pending.length,2);for(const q of pending)assert.match(q.reason,/多解|不.*判分/);
});
test('旧题库55条修订登记原文，重复应用不改变内容，原文变动时停止覆盖',()=>{
 const revisions=read('seed/legacy-explanation-revisions.json');assert.equal(revisions.length,55);
 assert.deepEqual(reviseLegacyExplanations(banks.lessons),banks.lessons);
 const before=structuredClone(banks.lessons);for(const e of revisions)before.find(d=>d.id===e.lessonId).questions.find(q=>q.label===e.label).reason=e.before;
 assert.deepEqual(reviseLegacyExplanations(before),banks.lessons);
 before.find(d=>d.id===revisions[0].lessonId).questions.find(q=>q.label===revisions[0].label).reason='新的人工作答依据';
 assert.throws(()=>reviseLegacyExplanations(before),/需复核/);
});
