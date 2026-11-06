import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {readAllBuiltinSources,auditQuestionBank} from '../scripts/audit-question-bank.mjs';
import {repairQuestionBankLesson,restoreQuestionBankLessonBeforeRepairs,questionTextRepairLedger} from '../lib/question-text-repairs.mjs';
import {cleanLessonText} from '../public/content-format.js';
const docs=readAllBuiltinSources(),q=(id,label)=>docs.find(d=>d.id===id).questions.find(q=>q.label===String(label));
test('全部180份2831项均通过横线、篇章空号和题干残字核查',()=>{const report=auditQuestionBank(docs);assert.equal(report.lessons,180);assert.equal(report.questions,2831);assert.equal(report.reviewed.length,2831);assert.deepEqual(report.issues,[]);});
test('双空题补齐两个空，遗漏主语被恢复，词义题保留完整原句并补清问题',()=>{
 for(const [topic,n] of [['01',35],['01',42],['01',47],['01',48],['09',1],['09',2],['12',38],['12',39],['13',11]]){const item=q('builtin-danzhao2025-grammar-'+topic,n);assert.equal((item.stem.match(/_+/g)||[]).length,2,topic+'/'+n);}
 assert.match(q('builtin-danzhao2025-grammar-09',15).stem,/^I ____ this bike/);
 assert.match(q('builtin-danzhao2025-grammar-13',11).stem,/his ____ birthday/);
 assert.match(q('builtin-danzhao2025-grammar-06',31).stem,/in apple-pie order.*\n句中/);
 assert.match(q('builtin-danzhao2025-reading-38',1).stem,/difficulty staying open.*____/);
});
test('完形每个编号都显示横线，正常语音题与阅读问句不被改成填空',()=>{
 const d=docs.find(d=>d.id==='builtin-selected-papers-cloze-2024');const text=d.questions[0].context.map(b=>b.text).join('\n');for(let n=1;n<=10;n++)assert.ok(text.includes('____('+n+')'));
 const sound=q('builtin-b69d579ac582890d',1);assert.match(sound.stem,/surr\[ou\]nd/);assert.ok(!sound.stem.includes('_'));
 const reading=q('builtin-danzhao2025-reading-01',1);assert.equal(reading.stem,'What is “Bing Dwen Dwen” good at in this passage?');
 const correction=q('builtin-selected-papers-correction-2022',1);assert.ok(correction.stem.includes('see a boy'));assert.equal(correction.answer,'see改saw');
});
test('修订幂等且可逆，仅改登记字段，旧选项答案及有意错误均保持',()=>{
 const before=docs.map(restoreQuestionBankLessonBeforeRepairs);
 const after=before.map(repairQuestionBankLesson);assert.deepEqual(after,docs);
 for(const d of docs){assert.deepEqual(repairQuestionBankLesson(d),d);assert.deepEqual(cleanLessonText(d),d);}
 assert.ok(auditQuestionBank(before).issues.some(i=>i.type==='unapplied-reviewed-fix'));
 for(let i=0;i<docs.length;i++)for(let j=0;j<docs[i].questions.length;j++){const a=docs[i].questions[j],b=before[i].questions[j];for(const field of ['answer','options','accepted','mode','questionType','reason','invalid','section','examYear','sourcePdfPages'])assert.deepEqual(a[field],b[field]);}
 assert.equal(questionTextRepairLedger.changes.filter(c=>c.path==='stem').length,109);
});
test('真正缺失的原题只明确说明，不补造语境或答案、不启用判分',()=>{const missing=q('builtin-3622b512096493b5',56);assert.match(missing.stem,/缺少完整题干/);assert.equal(missing.invalid,true);assert.equal(missing.answer,'待确认');assert.equal(missing.mode,'invalid');assert.deepEqual(missing.accepted,[]);assert.equal(missing.options.length,4);});

test('横线样式覆盖共享篇章和选项，不限于题干',()=>{const css=fs.readFileSync(new URL('../public/legacy/player.css',import.meta.url),'utf8');assert.match(css,/(?:^|})\.blank\{[^}]*display:inline-block[^}]*border-bottom:2px/);assert.doesNotMatch(css,/\.stem \.blank\{/);});
