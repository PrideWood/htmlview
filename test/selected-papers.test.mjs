import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {builtins,getLesson,publicLesson} from '../lib/storage.mjs';
import {validateLesson} from '../lib/lesson.mjs';
import {cleanLessonText} from '../public/content-format.js';
import {presentationMaterials} from '../public/lesson-materials.js';
const file=new URL('../seed/selected-papers.json',import.meta.url);
const docs=JSON.parse(fs.readFileSync(file));
const ocr=JSON.parse(fs.readFileSync(new URL('../review/selected-papers-ocr.json',import.meta.url)));
test('精选真题按目录六类整理33份199题，目录与重复照片不计题',()=>{
 assert.equal(docs.length,33);assert.equal(docs.reduce((n,d)=>n+d.questions.length,0),199);
 const counts={};for(const d of docs){counts[d.catalogTopic]=(counts[d.catalogTopic]||0)+d.questions.length;assert.ok(d.title.startsWith('精选真题 · '));assert.equal(d.sourceType,'builtin');assert.ok(builtins.has(d.id));assert.equal(new Set(d.questions.map(q=>q.label)).size,d.questions.length);assert.ok(d.sourcePdfPages.every(p=>p>3));}
 assert.equal(counts['动词'],23);assert.equal(counts['非谓语动词'],12);assert.equal(counts['完形填空'],30);assert.equal(counts['阅读理解'],40);assert.equal(counts['短文改错'],40);assert.equal(counts['书面表达'],3);
 const keys=docs.flatMap(d=>d.questions.map(q=>[d.catalogTopic,q.examYear,q.stem].join('|')));assert.equal(new Set(keys).size,199);
});
test('41页全页识别与正向原图均可追溯，保留两组重复扫描记录',()=>{
 assert.equal(ocr.pages.length,41);assert.deepEqual(ocr.contentsPages,[1,2,3]);assert.equal(ocr.pages[14].duplicateOf,14);assert.equal(ocr.pages[31].duplicateOf,31);
 for(const [i,p] of ocr.pages.entries()){assert.equal(p.pdfPage,i+1);assert.ok(p.pdfTextLayer.trim());assert.ok(p.visionText.trim());assert.match(p.orientation,/正向/);assert.ok(p.width>0&&p.height>0);const bytes=fs.readFileSync(new URL('../public'+p.imageUrl,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');}
});
test('每题保留真题年份、教材和PDF页码，答案不靠手写批注认定',()=>{
 for(const d of docs)for(const q of d.questions){assert.ok([2020,2021,2022,2023,2024].includes(q.examYear));assert.match(q.sourceBook,/陕西省职教高考/);assert.ok(q.sourcePdfPages.length&&q.sourceBookPages.length);assert.ok(q.sourcePdfPages.every(n=>n>3&&n<=41));assert.ok(q.sourcePages.every(n=>n>0&&n<=d.images.length));assert.doesNotMatch(q.reason,/真题来源|扫描PDF第|教材第/);assert.match(q.reasonSource,/补编/);if(q.mode==='choice'&&!q.invalid){assert.equal(q.options.length,4);assert.ok(q.options.some(o=>o.key===q.answer));}}
 const verb=docs.find(d=>d.id.endsWith('-verbs')).questions[2];assert.match(verb.stem,/was turned ____/);assert.equal(verb.options[0].text,'down');assert.equal(verb.answer,'A');
 const p=docs.find(d=>d.id.endsWith('-cloze-2024')).questions[0];assert.deepEqual(p.sourceBookPages,[253,254]);assert.deepEqual(p.sourcePdfPages,[25,26]);
 const intro=docs.find(d=>d.id.endsWith('-subjunctive'));assert.ok(intro.notes.some(n=>n.includes('未标真题')));assert.equal(intro.questions[0].examYear,2024);
});
test('阅读完形保留全篇，改错保留原错误和行号，作文保留跨页开头与词数',async()=>{
 for(const d of docs){assert.equal(validateLesson(d,{draft:true}).questions.length,d.questions.length);assert.deepEqual(cleanLessonText(d),d);const loaded=presentationMaterials(publicLesson(await getLesson(d.id)));if(['阅读理解','完形填空','短文改错','书面表达'].includes(d.catalogTopic))assert.ok(loaded.questions.every(q=>q.context.length));}
 const cloze=docs.find(d=>d.id.endsWith('cloze-2024'));assert.ok(cloze.questions[0].context.at(-1).text.includes('stood there quietly'));
 const reading=docs.find(d=>d.id.endsWith('reading-2024-4'));assert.equal(reading.questions[0].label,'16');assert.ok(reading.questions[0].context.at(-1).text.includes('small actions'));
 const edit=docs.find(d=>d.id.endsWith('correction-2022'));assert.ok(edit.questions[0].stem.includes('see a boy'));assert.equal(edit.questions[0].answer,'see改saw');assert.ok(edit.questions[0].context.some(b=>b.text.includes('Everybody laughed')));
 const writing=docs.find(d=>d.id.endsWith('writing-2022'));assert.deepEqual(writing.sourcePdfPages,[40,41]);assert.ok(writing.questions[0].context.some(b=>b.text.includes("It's important for everyone")));assert.ok(writing.questions[0].context.some(b=>b.text.includes('不少于80')));
 const pending=docs.flatMap(d=>d.questions).filter(q=>q.invalid);assert.equal(pending.length,2);assert.ok(pending.every(q=>q.answer==='待确认'&&q.accepted.length===0&&q.examNote));
});
test('构建可重复，原题库文件不被改写',()=>{
 const oldFile=new URL('../seed/lessons.json',import.meta.url),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');const before=hash(file),old=hash(oldFile);
 execFileSync(process.execPath,['scripts/build-selected-papers.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});assert.equal(hash(file),before);assert.equal(hash(oldFile),old);
});
