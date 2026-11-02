import test from 'node:test';
import assert from 'node:assert/strict';
import {orderQuestions,orderedLesson} from '../public/question-order.js';
import {validateLesson} from '../lib/lesson.mjs';
const q=(label,extra={})=>({label,stem:'Exercise',mode:'choice',questionType:'single_choice',options:[{key:'A',text:'Yes'},{key:'B',text:'No'}],answer:'A',...extra});
test('按原题号数值排序而不是按字符或来源图片排序，原数据不变',()=>{
 const questions=['10','３４','2','1','9'].map((label,i)=>q(label,{sourcePages:[i+1]}));const sorted=orderQuestions(questions);assert.deepEqual(sorted.map(q=>q.label),['1','2','9','10','３４']);assert.deepEqual(questions.map(q=>q.label),['10','３４','2','1','9']);assert.deepEqual(sorted.at(-1).sourcePages,[2]);
 assert.deepEqual(orderQuestions(['阅读42','单选1','完形34'].map(label=>q(label))).map(q=>q.label),['单选1','完形34','阅读42']);
 assert.deepEqual(orderQuestions(['1.10','1.2','1.1','2'].map(label=>q(label))).map(q=>q.label),['1.1','1.2','1.10','2']);
});
test('章节前缀及章节重启的题号保留分组，不把两章的1号题混排',()=>{
 assert.deepEqual(orderQuestions(['一章-2','二章-2','一章-1','二章-1'].map(label=>q(label))).map(q=>q.label),['一章-1','一章-2','二章-1','二章-2']);
 const questions=[q('2',{blankLabel:'2',groupId:'article-a'}),q('1',{blankLabel:'1',groupId:'article-a'}),q('2 · 3',{blankLabel:'2',groupId:'article-b'}),q('1 · 4',{blankLabel:'1',groupId:'article-b'})];
 assert.deepEqual(orderQuestions(questions).map(q=>q.label),['1','2','1 · 4','2 · 3']);
});
test('明确手动调整后的顺序保存并保留，内置资料不重排',()=>{
 const questions=[q('3'),q('1'),q('2')];assert.deepEqual(orderedLesson({questions}).questions.map(q=>q.label),['1','2','3']);
 assert.equal(orderedLesson({questions,questionOrder:'manual'}).questions,questions);assert.equal(orderedLesson({questions,sourceType:'builtin'}).questions,questions);
 assert.deepEqual(validateLesson({questions,questionOrder:'manual'}).questions.map(q=>q.label),['3','1','2']);
});
test('误标七选五的无选项文本作答题自动恢复非选择题，显式问答方式不被题型标签覆盖',()=>{
 const wrong=q('42',{questionType:'sentence_completion',options:[],answer:'The machines are being repaired.',stem:'They are busy repairing the machines. ____ ____ are being repaired.'});
 const saved=validateLesson({questions:[wrong]},{draft:true}).questions[0];assert.equal(saved.mode,'input');assert.equal(saved.questionType,'fill_blank');assert.equal(saved.answer,wrong.answer);
 const explicit=validateLesson({questions:[q('34',{mode:'input',questionType:'sentence_completion',options:[],answer:'A'})]}).questions[0];assert.equal(explicit.mode,'input');assert.equal(explicit.answer,'A');
 const semantic=validateLesson({questions:[q('35',{options:[],answer:'',section:'句型转换',stem:'改为被动语态。'})]},{draft:true}).questions[0];assert.equal(semantic.mode,'input');
});
test('部分校对草稿可保留空题干、缺少选项或无效答案，且待确认题不计分',()=>{
 const first=q('1',{reviewed:true});const pending=q('42',{options:[],answer:''});const empty=q('43',{stem:'',options:[{key:'A',text:''}],answer:'original response'});
 const result=validateLesson({questions:[first,pending,empty]},{draft:true});assert.equal(result.questions[0].reviewed,true);assert.equal(result.questions.length,3);
 for(const q of result.questions.slice(1)){assert.equal(q.invalid,true);assert.deepEqual(q.accepted,[]);assert.equal(q.reviewStatus,'needs_review');}assert.equal(result.questions[2].answer,'original response');
 assert.throws(()=>validateLesson({questions:[pending]}),/原题号 42（列表第1题）/);
});
