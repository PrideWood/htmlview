import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateMaterials,presentationMaterials,updateSharedMaterial} from '../public/lesson-materials.js';
import {validateLesson,modelSchema} from '../lib/lesson.mjs';
import {mergeRecognition,createRecognitionState} from '../lib/recognition-batches.mjs';
const q=(label,groupId='reading-a')=>({label,groupId,questionType:'reading',mode:'choice',stem:'What happened?',options:[{key:'A',text:'Yes'},{key:'B',text:'No'}],answer:'A',context:[],reviewed:true});
const context=Array.from({length:72},(_,i)=>({type:'p',text:`Paragraph ${i+1}: `+'A full sentence. '.repeat(i===20?2000:3)}));
const material={id:'reading-a',title:'A complete passage',questionLabels:['1','2'],context};
test('共享篇章完整关联每个小题，保存与再次校验不截断第51段或超过2万字的段落',()=>{
 const lesson=validateLesson({title:'Reading',questions:[q('1'),q('2')],materials:[material]},{fromModel:true});
 assert.deepEqual(lesson.questions[0].context,context);assert.deepEqual(lesson.questions[1].context,context);assert.deepEqual(lesson.materials[0].context,context);
 const saved=validateLesson(lesson);assert.equal(saved.questions[0].context.length,72);assert.equal(saved.questions[0].context[20].text,context[20].text);assert.match(saved.questions[0].context.at(-1).text,/Paragraph 72/);
 assert.ok(modelSchema.required.includes('materials'));assert.ok(modelSchema.properties.materials.items.required.includes('questionLabels'));
});
test('跨批次只在首批输出的材料仍可关联后续小题和纯篇章批次',()=>{
 const modelInfo={timings:{totalMs:1},usage:{}};
 const merged=mergeRecognition({source:'all original source',completed:3,results:[{materials:[material],questions:[],pageOrder:[],notes:[],modelInfo},{materials:[],questions:[q('1')],pageOrder:[],notes:[],modelInfo},{materials:[],questions:[q('2')],pageOrder:[],notes:[],modelInfo}]},{title:'Reading',topic:'English',images:[]});
 assert.deepEqual(merged.questions.map(q=>q.label),['1','2']);assert.equal(merged.materials.length,1);assert.deepEqual(merged.questions[1].context,context);
});
test('旧资料通过同组最长材料补全空材料，不把不同文章或无组号的小题混合',()=>{
 const lesson=hydrateMaterials({questions:[{...q('1'),context:[{type:'p',text:'short'}]},{...q('2'),context},q('3'),{...q('4','reading-b'),context:[{type:'p',text:'Another article'}]},q('5','')]});
 assert.deepEqual(lesson.questions[0].context,context);assert.deepEqual(lesson.questions[2].context,context);assert.equal(lesson.questions[3].context[0].text,'Another article');assert.deepEqual(lesson.questions[4].context,[]);
});
test('修改共享篇章同步同组所有小题并取消已核对，不改变题干答案',()=>{
 const lesson=hydrateMaterials({materials:[material],questions:[q('1'),q('2'),q('3','b')]});const changed=[{type:'p',text:'Edited first paragraph.\nLast paragraph.'}];updateSharedMaterial(lesson,lesson.questions[0],changed);
 const saved=validateLesson(lesson);assert.deepEqual(saved.questions[1].context,changed);assert.equal(saved.questions[1].reviewed,false);assert.equal(saved.questions[1].answer,'A');assert.equal(saved.questions[2].reviewed,true);
});
test('旧资料缺少篇章时演示仍显示完整原文或原图，并提示回校对页补全',()=>{
 const source='Full original article.\nFinal paragraph.\n1. What happened?';const doc=presentationMaterials({inputText:source,ocrText:'partial',questions:[q('1')]});assert.equal(doc.questions[0].materialFallback,'source');assert.equal(doc.questions[0].context[0].text,source);
 const photo=presentationMaterials({images:[{url:'/image.png'}],questions:[q('1')]});assert.equal(photo.questions[0].materialFallback,'images');
 const missing=presentationMaterials({questions:[q('1')]});assert.equal(missing.questions[0].materialFallback,'missing');
 assert.equal(presentationMaterials({inputText:source,questions:[{...q('1'),questionType:'single_choice'}]}).questions[0].materialFallback,undefined);
 assert.equal(createRecognitionState({materialsOnly:true,inputText:source,ocrText:'partial',images:[]}).source,source);
});
test('表格全部行列保存，材料中的HTML只作为文字数据',()=>{
 const rows=Array.from({length:150},(_,i)=>Array.from({length:24},(_,j)=>`${i},${j}`));const full=[{type:'p',text:'<script>text only</script>'},{type:'table',rows}];
 const lesson=validateLesson({questions:[{...q('1'),context:full}]});assert.equal(lesson.questions[0].context[1].rows.length,150);assert.equal(lesson.questions[0].context[1].rows[149].length,24);
});
test('单题题干和选项原文不再被固定字数截断，共享材料压缩后保存时不重复传输',async()=>{
 const {compactMaterials}=await import('../public/lesson-materials.js');
 const stem='Full original question. '.repeat(1200),option='A complete option sentence. '.repeat(300);
 const lesson=validateLesson({materials:[material],questions:[{...q('1'),stem,options:[{key:'A',text:option},{key:'B',text:'No'}]},q('2')]});
 assert.equal(lesson.questions[0].stem,stem);assert.equal(lesson.questions[0].options[0].text,option);
 const compact=compactMaterials(lesson);assert.deepEqual(compact.questions[0].context,[]);assert.equal(compact.materials[0].context.length,72);assert.deepEqual(hydrateMaterials(compact).questions[1].context,context);
});
