import {hydrateMaterials,compactMaterials,updateSharedMaterial,hasMaterial,needsMaterial} from '../public/lesson-materials.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {QUESTION_TYPES,OPTION_KEYS,inferQuestionType} from '../public/question-types.js';
import {readFile} from 'node:fs/promises';
const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/^boot\(\)\.catch.*$/m,'');
function app(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
 const context=vm.createContext({hydrateMaterials,compactMaterials,updateSharedMaterial,hasMaterial,needsMaterial,QUESTION_TYPES,OPTION_KEYS,inferQuestionType,document:{getElementById:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}},window:{addEventListener(){}},matchMedia:()=>({matches:true,addEventListener(){}}),location:{hash:''},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},mountLogin(){},stopLogin(){}});
 vm.runInContext(code,context);return {context,node,run:s=>vm.runInContext(s,context)};
}
test('电脑与手机都提供 DOC 文件选择和文档清单，上传进度文案适用于文档',()=>{
 const a=app();for(const html of [a.run('uploadHTML()'),a.run('phoneCaptureHTML()')]){assert.match(html,/id="document-file"[^>]*accept="\.doc,\.docx/);assert.match(html,/id="document-list"/);assert.match(html,/长文本.*自动分批/);}
 a.run("uploadDocument={name:'练习.doc'};photoList()");assert.match(a.node('document-list').innerHTML,/练习.doc/);
 assert.doesNotMatch(code,/正在保存图片|DOC 请先另存/);
});
test('客户端自动请求后续批次直至完成，不需用户逐批点击',async()=>{
 const a=app();a.run("session={authenticated:true};doc={id:'batch',title:'批次',status:'uploaded',images:[],questions:[]};view='editor';let requests=0;api=async path=>{if(path==='/lessons')return {lessons:[]};requests++;const pending=requests<3;return {pending,progress:{completed:requests,remaining:3-requests},lesson:{id:'batch',title:'批次',status:pending?'uploaded':'draft',images:[],questions:pending?[]:[{label:'1'}]},timings:{}}}");
 await a.run('processDoc()');assert.equal(a.run('requests'),3);assert.equal(a.run('doc.status'),'draft');assert.equal(a.run('busy'),false);
});

test('校对表单提供七选五、匹配、多选等具体题型，保留选项及原始空号',()=>{
 const a=app();a.run("doc={questions:[]};qi=0");
 const html=a.run("questionHTML({label:'36',blankLabel:'36',questionType:'sentence_completion',mode:'choice',options:Array.from('ABCDEFG',key=>({key,text:'Sentence '+key})),answer:'C',context:[],enrichment:[]})");
 assert.match(html,/具体题型/);for(const type of ['sentence_completion','multiple_choice','matching','fill_blank','correction','translation'])assert.match(html,new RegExp('value="'+type+'"'));
 assert.match(html,/原始空号/);assert.equal((html.match(/aria-label="选项 /g)||[]).length,7);
 const multi=a.run("questionHTML({label:'1',questionType:'multiple_choice',mode:'multi',options:[{key:'A',text:'one'},{key:'B',text:'two'}],answer:'A,B',context:[],enrichment:[]})");assert.match(multi,/多选答案用逗号分隔/);assert.match(multi,/data-q="answer" value="A,B"/);assert.equal((multi.match(/aria-label="选项 /g)||[]).length,2);
});

test('保存后重新按题号排序仍停留在正在校对的原题，不跳到其他题',async()=>{
 const a=app();a.run("doc={id:'sort-save',version:1,questions:['42','34','1'].map(label=>({label,options:[],context:[]}))};qi=0;api=async()=>({lesson:{...doc,version:2,questions:[doc.questions[2],doc.questions[1],doc.questions[0]]}})");
 await a.run('saveDraft()');assert.equal(a.run('qi'),2);assert.equal(a.run('doc.questions[qi].label'),'42');assert.equal(a.run('dirty'),false);
});
test('补全篇章自动请求后续批次并带上最新版本号，不覆盖小题',async()=>{
 const a=app();a.run("session={authenticated:true};view='editor';doc={id:'repair',title:'篇章补全',version:1,status:'draft',questions:[{label:'1',stem:'original',options:[],context:[]}],images:[]};let versions=[];api=async(path,options)=>{versions.push(options.body.version);const pending=versions.length<3;return {pending,progress:{completed:versions.length,remaining:3-versions.length},lesson:{...doc,version:doc.version+1,materials:[{id:'reading-a',questionLabels:['1'],context:[{type:'p',text:'Complete original passage.'}]}]}}}");
 await a.run('repairMaterials()');assert.equal(a.run('JSON.stringify(versions)'),'[1,2,3]');assert.equal(a.run('doc.questions[0].stem'),'original');assert.equal(a.run('doc.questions[0].context[0].text'),'Complete original passage.');assert.equal(a.run('busy'),false);
});
