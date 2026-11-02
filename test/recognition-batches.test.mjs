import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTextRange,createRecognitionState,mergeRecognition} from '../lib/recognition-batches.mjs';
test('按题目边界拆分，长段落及无换行文本也完整覆盖，不丢空白',()=>{
 for(const text of ['x'.repeat(19000),Array.from({length:120},(_,i)=>`\n${i+1}. stem\nA. answer\nB. option`).join(''),'Intro\n'+'阅读段落'.repeat(4000)+'\n1. First?\n2. Second?']){
  const ranges=splitTextRange(text);assert.ok(ranges.length>1);assert.equal(ranges.map(r=>text.slice(r.start,r.end)).join(''),text);assert.ok(ranges.every(r=>r.end>r.start&&r.end-r.start<=5250));
 }
 const text=Array.from({length:20},(_,i)=>`${i+1}. stem\nA. answer`).join('\n');const ranges=splitTextRange(text);assert.ok(ranges.length>=3);assert.match(text.slice(ranges[1].start),/^9\./);
});
test('长文配图分开处理，短补充文字与照片一起处理以保留排序',()=>{
 assert.equal(createRecognitionState({images:[{},{}],inputText:'short'}).tasks.length,1);
 const state=createRecognitionState({images:[{},{}],inputText:'x'.repeat(12000)});assert.ok(state.tasks.length>2);assert.equal(state.tasks.at(-1).kind,'images');assert.deepEqual(state.tasks.at(-1).indices,[0,1]);
});

test('合并批次保留阅读材料，重复题号补后缀后仍符合长度与唯一性要求',()=>{
 const question={label:'1'.repeat(40),context:[{type:'p',text:'shared reading passage'}]};
 const result={questions:[{...question},{...question}],notes:[],pageOrder:[],orderNote:'',ocrText:'part',modelInfo:{timings:{modelMs:5,totalMs:7},usage:{total_tokens:10}}};
 const state={source:'original source',completed:2,results:[structuredClone(result),structuredClone(result)]};
 const merged=mergeRecognition(state,{title:'title',topic:'topic',images:[]});assert.equal(merged.questions.length,4);assert.equal(new Set(merged.questions.map(q=>q.label)).size,4);assert.ok(merged.questions.every(q=>q.label.length<=40));assert.equal(merged.ocrText,'original source');assert.equal(merged.questions[3].context[0].text,'shared reading passage');assert.equal(merged.modelInfo.usage.total_tokens,20);
});
