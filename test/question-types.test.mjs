import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateLesson,modelSchema} from '../lib/lesson.mjs';
import {QUESTION_TYPES,multipleAnswerKeys} from '../public/question-types.js';
import {QUESTION_TYPE_PROMPT} from '../lib/model.mjs';
const options=Array.from('ABCDEFG',key=>({key,text:`Sentence ${key}.`}));
const context=[{type:'p',text:'七选五：Two options are extra. Reading passage ____ (36), ____ (37), ____ (38), ____ (39), ____ (40).'}];
const question={label:'36',blankLabel:'36',questionType:'sentence_completion',groupId:'Unit 1 Reading A',stem:'选择填入第36空的句子',mode:'choice',options,answer:'C',context,reason:'前后文衔接。',reviewStatus:'ok'};
const normalize=(questions,extra={})=>validateLesson({title:'新题型',questions},extra);
test('七选五每空保留完整文章与七个选项，五个答案按原空号独立保存',()=>{
 const result=normalize(Array.from('CEBFA',(answer,i)=>({...question,label:String(36+i),blankLabel:String(36+i),answer})),{fromModel:true});
 assert.equal(result.questions.length,5);for(const [i,q] of result.questions.entries()){assert.equal(q.questionType,'sentence_completion');assert.equal(q.mode,'choice');assert.equal(q.options.length,7);assert.deepEqual(q.context,context);assert.equal(q.blankLabel,String(36+i));assert.equal(q.groupId,question.groupId);assert.equal(q.reviewed,false);assert.equal(q.invalid,false);}
 assert.deepEqual(result.questions.map(q=>q.answer),['C','E','B','F','A']);
});
test('七选五不允许五个空的合并答案误当单选；缺少共享选项标为待确认',()=>{
 const combined=normalize([{...question,answer:'C,E,B,F,A'}],{fromModel:true}).questions[0];assert.equal(combined.invalid,true);assert.deepEqual(combined.accepted,[]);
 const missing=normalize([{...question,options:options.slice(0,4)}],{fromModel:true}).questions[0];assert.equal(missing.invalid,true);assert.match(missing.examNote,/A—G/);
});
test('六选四选句题保存与再次校验时不会被误当成七选五缺项',()=>{
 const q={...question,section:undefined,stem:'选择填入第1空的句子',label:'1',options:options.slice(0,6),context:[{type:'p',text:'六选四：reading passage ____ (1)'}]};
 const first=normalize([q]);assert.equal(first.questions[0].invalid,false);assert.equal(normalize(first.questions).questions[0].invalid,false);
});
test('多选答案按完整集合保存和校验，不接受不确定答案、重复项或不存在的字母',()=>{
 const q={...question,questionType:'multiple_choice',mode:'choice',answer:'C、A',context:[]};const result=normalize([q]).questions[0];assert.equal(result.mode,'multi');assert.equal(result.answer,'A,C');assert.deepEqual(result.accepted,['A','C']);
 for(const answer of ['A or B','A或B','A,A','A,Z','A']){assert.throws(()=>normalize([{...q,answer}]),/多选答案/);assert.equal(normalize([{...q,answer}],{fromModel:true}).questions[0].invalid,true);}
 assert.deepEqual(multipleAnswerKeys('A or B'),[]);
});
test('匹配支持超过七项的选项库；非选择题保留参考答案，未知题型向旧格式兼容',()=>{
 const bank=Array.from('ABCDEFGHIJ',key=>({key,text:key}));const matching=normalize([{...question,questionType:'matching',options:bank,answer:'J'}]).questions[0];assert.equal(matching.options.length,10);assert.equal(matching.answer,'J');
 for(const type of ['fill_blank','correction','translation','short_answer','writing','study']){const q=normalize([{...question,questionType:type,options:[],answer:'A complete reference answer.'}]).questions[0];assert.equal(q.mode,QUESTION_TYPES[type].mode);assert.equal(q.answer,'A complete reference answer.');}
 assert.equal(normalize([{...question,questionType:undefined,section:'七选五'}]).questions[0].questionType,'sentence_completion');
});
test('模型严格结构和题型提示覆盖新题型及跨批共享材料规则',()=>{
 const schema=modelSchema.properties.questions.items;assert.deepEqual(schema.properties.questionType.enum,Object.keys(QUESTION_TYPES));assert.ok(schema.required.includes('groupId'));assert.ok(schema.required.includes('blankLabel'));assert.ok(schema.properties.mode.enum.includes('multi'));assert.match(QUESTION_TYPE_PROMPT,/每个空单独一题/);assert.match(QUESTION_TYPE_PROMPT,/跨批次/);
});
const player=await readFile(new URL('../public/legacy/player.js',import.meta.url),'utf8');
function presenter(questions){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',value:'',style:{},classList:{add(){},remove(){},toggle(){}}});return nodes.get(id);};
 get('lesson-data').textContent=JSON.stringify({id:'new-types',title:'新题型',questions});
 const context={document:{getElementById:get,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}};
 vm.createContext(context);vm.runInContext(player.split("$('home').href=lesson.home;")[0],context);return {get,run:s=>vm.runInContext(s,context)};
}
test('七选五原空号独立于章节前缀，切换同篇材料保留位置，匹配题分栏',()=>{
 const q=normalize([{...question,label:'Unit1-36'}]).questions[0];const h=presenter([q,{...q,label:'Unit2-36',groupId:'Unit2 Reading A'},{...q,questionType:'matching'}]);
 h.run('render()');assert.match(h.get('question-kind').textContent,/七选五/);assert.match(h.get('passage-heading').textContent,/选句填空/);assert.match(h.get('passage-content').innerHTML,/<mark[^>]*>.*\(36\)<\/mark>/);assert.equal((h.get('question-content').innerHTML.match(/data-key=/g)||[]).length,7);
 h.get('passage-content').scrollTop=200;h.run('index=1;renderPassage()');assert.equal(h.get('passage-content').scrollTop,0);h.run('index=2;renderPassage()');assert.match(h.get('passage-heading').textContent,/信息匹配/);
});
test('多选先切换选项，确认后才按完整集合计分；漏选和错选均判错',()=>{
 const q=normalize([{...question,questionType:'multiple_choice',answer:'A,C'}]).questions[0];
 for(const [choices,result] of [[['A','C'],'good'],[['A'],'bad'],[['A','B','C'],'bad']]){
  const h=presenter([q]);h.run('render()');assert.match(h.get('question-content').innerHTML,/确认选择/);
  for(const key of choices)h.run(`choose('${key}')`);assert.equal(h.run('state().result'),undefined);h.run('submitMultiple()');assert.equal(h.run('state().result'),result);
 }
 const h=presenter([q]);h.run("choose('A');choose('A')");assert.equal(h.run('state().choices.length'),0);h.run('submitMultiple()');assert.equal(h.run('state().result'),undefined);
 h.run('reveal()');assert.equal(h.run('state().result'),undefined);assert.equal(h.run('state().revealed'),true);
});

test('阅读、完形与七选五完整材料在左侧，当前小题和选项在右侧，不把文章混入题干',()=>{
 const full=[{type:'p',text:'Article title and instructions.'},{type:'p',text:'First paragraph ____ (36).'},{type:'p',text:'Final paragraph and ending.'}];
 for(const type of ['reading','cloze','sentence_completion']){
  const q=normalize([{...question,questionType:type,context:full}]).questions[0],h=presenter([q]);h.run('render()');assert.equal(h.get('passage-panel').hidden,false);assert.match(h.get('passage-content').innerHTML,/First paragraph/);assert.match(h.get('passage-content').innerHTML,/Final paragraph and ending/);assert.equal((h.get('passage-content').innerHTML.match(/<p>/g)||[]).length,3);assert.doesNotMatch(h.get('question-content').innerHTML,/Final paragraph and ending/);assert.match(h.get('question-content').innerHTML,/选择填入第36空/);
 }
});
