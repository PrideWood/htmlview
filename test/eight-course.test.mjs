import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {builtins,metadata,publicLesson} from '../lib/storage.mjs';
import {filterLibrary,sortLibrary} from '../public/library-model.js';
import {presentationMaterials} from '../public/lesson-materials.js';
import {validateLesson} from '../lib/lesson.mjs';
import {phoneReaderHTML} from '../public/phone-library.js';

const courses=JSON.parse(fs.readFileSync(new URL('../seed/eight-course-lessons.json',import.meta.url)));
const teaching=JSON.parse(fs.readFileSync(new URL('../seed/eight-course-teaching.json',import.meta.url)));

test('课堂资料只列八课，原题库及用户可演示资料有各自入口',()=>{
 const originals=[...builtins.values()].filter(d=>d.sourceType==='builtin');
 assert.equal(originals.length,179);assert.equal(originals.reduce((s,d)=>s+d.questions.length,0),2811);
 const custom={id:'custom-ready',title:'自编资料',topic:'自编',sourceType:'copy',status:'ready',count:1};
 const list=[...builtins.values()].map(metadata).concat(custom);
 assert.deepEqual(sortLibrary(filterLibrary(list,{filter:'ready'}),'title').map(d=>d.id),courses.map(d=>d.id));
 assert.equal(filterLibrary(list,{filter:'builtin'}).length,179);
 assert.deepEqual(filterLibrary(list,{filter:'custom'}).map(d=>d.id),[custom.id]);
 assert.equal(filterLibrary(list,{filter:'ready',search:'非谓语'}).length,1);
 assert.equal(filterLibrary([{...metadata(courses[0]),status:'trashed'}],{filter:'ready'}).length,0);
});

test('八课与讲义使用同一批200题，空号和手动题序保持完整',()=>{
 assert.equal(courses.length,8);const origins=new Set();
 for(const [i,d] of courses.entries()){
  assert.ok(builtins.has(d.id));assert.equal(d.courseNumber,i+1);assert.equal(d.questions.length,25);
  assert.equal(d.questionOrder,'manual');
  const expected=[...Array.from({length:10},(_,k)=>`S${String(k+1).padStart(2,'0')}`),...Array.from({length:10},(_,k)=>`C${String(k+1).padStart(2,'0')}`),...Array.from({length:5},(_,k)=>`R${String(k+1).padStart(2,'0')}`)];
  const prepared=presentationMaterials(publicLesson(d));assert.deepEqual(prepared.questions.map(q=>q.label),expected);
  assert.deepEqual(prepared.questions[8].teaching,d.questions[8].teaching);
  assert.deepEqual(validateLesson(d).questions.map(q=>q.label),expected);
  for(const q of prepared.questions){
   assert.equal(q.invalid,false);assert.deepEqual(q.accepted,[q.answer]);assert.ok(q.options.some(o=>o.key===q.answer));
   assert.ok(q.reason&&q.sourceCitation);assert.ok(q.teaching.length);
   const key=q.originLessonId+':'+q.originalLabel;assert.ok(!origins.has(key));origins.add(key);
  }
  const cloze=prepared.questions.filter(q=>q.questionType==='cloze');
  const blanks=[...cloze[0].context.map(b=>b.text||'').join('\n').matchAll(/_{2,}\s*\((\d+)\)/g)].map(m=>m[1]);
  assert.deepEqual(blanks,cloze.map(q=>q.blankLabel));
  assert.equal(new Set(cloze.map(q=>JSON.stringify(q.context))).size,1);
  assert.equal(prepared.questions.filter(q=>q.questionType==='reading').length,5);
 }
 assert.equal(origins.size,200);
});

test('每道单选及每篇篇章均有系统扩充，数字词表覆盖全部基础形式',()=>{
 assert.equal(teaching.flatMap(c=>Object.values(c).flat()).length,99);
 for(const c of teaching){for(let i=1;i<=10;i++)assert.ok(c[`S${String(i).padStart(2,'0')}`]?.length);assert.ok(c.C01.length);assert.ok(c.R01.length);}
 const text=JSON.stringify(teaching[0].S09);
 for(const word of ['zero','eleven','twelve','thirteen','fifteen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million','billion','first','second','third','fifth','eighth','ninth','twelfth','twentieth','fortieth','111th'])assert.ok(text.includes(word),word);
});

test('扩充只出现在原解析中；数字题的题目画面不出现词表或提前作答',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',value:'',style:{},classList:{add(){},remove(){},toggle(){}}});return nodes.get(id);};
 const d=presentationMaterials(publicLesson(courses[0]));get('lesson-data').textContent=JSON.stringify(d);
 const context={document:{getElementById:get,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}};
 vm.createContext(context);
 const player=fs.readFileSync(new URL('../public/legacy/player.js',import.meta.url),'utf8');
 vm.runInContext(player.slice(0,player.indexOf("$('home').href=lesson.home;"))+'index=8;render();',context);
 assert.match(get('question-content').innerHTML,/bridge/);
 assert.doesNotMatch(get('question-content').innerHTML,/fortieth|知识串讲|<table/);
 assert.equal(vm.runInContext('state().revealed',context),undefined);
 const revision=fs.readFileSync(new URL('../public/legacy/revision.js',import.meta.url),'utf8');
 vm.runInContext(revision.slice(revision.indexOf('function teachingHTML'),revision.indexOf('showSide=function'))+'globalThis.analysisHTML=explanationHTML(current());',context);
 assert.match(context.analysisHTML,/判断依据与解析/);assert.match(context.analysisHTML,/知识串讲与易混辨析/);assert.match(context.analysisHTML,/fortieth/);assert.match(context.analysisHTML,/<table>/);
 const html=fs.readFileSync(new URL('../public/player.html',import.meta.url),'utf8');assert.doesNotMatch(html,/id="teaching"/);
 assert.equal(vm.runInContext('state().revealed',context),undefined);
});

test('手机答案详情同样带有完整串讲，不把词表混入题干',()=>{
 const html=phoneReaderHTML(courses[0],8);
 const card=html.split('<article class="phone-question-card">')[1].split('</article>')[0];assert.doesNotMatch(card,/fortieth|<table>/);
 assert.match(html.split('<details class="phone-answer">')[1],/fortieth/);
});
