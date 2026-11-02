import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/^boot\(\)\.catch.*$/m,'');
function app(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}},window:{addEventListener(){}},matchMedia:()=>({matches:true,addEventListener(){}}),location:{hash:''},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},mountLogin(){},stopLogin(){}});
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
