import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/revision.js',import.meta.url),'utf8');
const controls=source.slice(source.indexOf('let selectedPresenterControl='),source.indexOf('reference=function()'));
function harness({mode='choice'}={}){
 const listeners={},closeListeners={},events={reveal:0,explain:0,move:[],scroll:[],choice:[]};let now=1000;const state={};
 const document={activeElement:null,addEventListener:(n,f)=>listeners[n]=f,querySelectorAll:()=>mode==='choice'?options.filter(b=>!b.disabled):[]};
 function button(id,tagName='BUTTON'){const classes=new Set();return {id,tagName,hidden:false,disabled:false,isContentEditable:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},focus(){document.activeElement=this;},blur(){document.activeElement=body;},scrollIntoView(){},closest(){return tagName==='BUTTON'||tagName==='A'?this:null;},matches(selector){return selector.split(',').some(s=>s==='#'+id||(s==='.option'&&id.startsWith('option-')));},click(){if(!this.disabled)this.onclick?.();}};}
 const body=button('body','BODY');document.activeElement=body;
 const options=['A','B','C','D'].map(key=>{const b=button('option-'+key);b.onclick=()=>{events.choice.push(key);state.result=key==='B'?'good':'bad';options.forEach(b=>b.disabled=true);};return b;});
 const map=Object.fromEntries(['show-answer','explain','prev','next'].map(id=>[id,button(id)]));
 const explanation={open:false,addEventListener:(n,f)=>closeListeners[n]=f,close(){this.open=false;closeListeners.close?.();}};
 const context={document,performance:{now:()=>now},$:id=>map[id],explanation,nav:{hidden:true},revealed:false,current:()=>({mode}),pageIsRevealed:()=>Boolean(state.revealed||state.result),state:()=>state,reveal(){events.reveal++;state.revealed=true;options.forEach(b=>b.disabled=true);},explain(){events.explain++;state.revealed=true;explanation.open=true;document.activeElement=button('explanation-body','DIV');},move:d=>events.move.push(d),scrollExp:d=>events.scroll.push(d)};
 map.dialog={open:false};document.body=body;map.explain.onclick=context.explain;vm.createContext(context);vm.runInContext(controls,context);
 function key(value,extra={}){const e={key:value,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,repeat:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};listeners.keydown(e);return e;}
 return {context,key,events,map,options,document,explanation,state,tick:()=>now+=900,button};
}
test('Enter依次显示答案、打开解析、关闭解析，不切题',()=>{const h=harness({mode:'input'});h.key('Enter');assert.equal(h.events.reveal,1);assert.equal(h.state.result,undefined);assert.equal(h.explanation.open,false);h.tick();h.key('Enter');assert.equal(h.explanation.open,true);h.tick();h.key('Enter');assert.equal(h.explanation.open,false);assert.deepEqual(h.events.move,[]);});
test('Tab选中B后Enter按B作答，Enter不切题，B仍开关解析',()=>{const h=harness();h.key('Tab');h.key('Tab');assert.equal(h.document.activeElement,h.options[1]);assert.equal(h.options[1].classList.contains('presenter-focus'),true);h.key('Enter');assert.deepEqual(h.events.choice,['B']);assert.equal(h.state.result,'good');h.tick();h.key('Enter');assert.equal(h.explanation.open,false);h.key('b');assert.equal(h.explanation.open,true);h.key('b');assert.equal(h.explanation.open,false);assert.deepEqual(h.events.move,[]);});
test('Tab仅在四个选项内循环，ShiftTab反向，不进入工具按钮',()=>{const h=harness();for(let i=0;i<5;i++)h.key('Tab');assert.equal(h.document.activeElement,h.options[0]);h.key('Tab',{shiftKey:true});assert.equal(h.document.activeElement,h.options[3]);assert.equal(h.map['show-answer'].classList.contains('presenter-focus'),false);});
test('Enter重复事件及0.8秒内再次按下不继续揭示',()=>{const h=harness({mode:'input'});h.key('Enter');h.key('Enter');h.key('Enter',{repeat:true});assert.equal(h.events.reveal,1);assert.equal(h.events.explain,0);h.tick();h.key('Enter');assert.equal(h.events.explain,1);});
test('PageDown切题，解析内仅滚动；按键长按不连续触发',()=>{const h=harness();h.key('PageDown');h.key('PageDown',{repeat:true});assert.deepEqual(h.events.move,[1]);h.explanation.open=true;h.key('PageDown');h.key('PageUp');assert.deepEqual(h.events.scroll,[1,-1]);assert.deepEqual(h.events.move,[1]);});
test('输入框及系统窗口快捷键保留原行为',()=>{const h=harness();h.document.activeElement=h.button('response','INPUT');assert.equal(h.key('Enter').prevented,undefined);assert.equal(h.key('Tab').prevented,undefined);h.document.activeElement=h.button('body','BODY');assert.equal(h.key('Tab',{altKey:true}).prevented,undefined);assert.equal(h.events.reveal,0);});
test('翻页按钮残留焦点不会让Enter意外切题',()=>{const h=harness();h.map.next.focus();h.key('Enter');assert.equal(h.events.reveal,0);assert.equal(h.document.activeElement,h.options[0]);assert.deepEqual(h.events.move,[]);});
test('真实显示答案逻辑只揭示参考，不伪造答对或自动打开解析',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}}});return nodes.get(id);};
 const lesson={id:'presenter-test',questions:[{label:'1',mode:'choice',answer:'B',accepted:['B'],options:[{key:'A',text:'since'},{key:'B',text:'for'}],context:[],enrichment:[]}]};get('lesson-data').textContent=JSON.stringify(lesson);
 const context={document:{getElementById:get,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},cancelAnimationFrame(){}};vm.createContext(context);
 const player=fs.readFileSync(new URL('../public/legacy/player.js',import.meta.url),'utf8');vm.runInContext(player.slice(0,player.indexOf("$('home').href=lesson.home;"))+`let opened=0;showSide=()=>opened++;render=()=>{renderOptions();renderFeedback();renderStats();};reveal();if(state().result)throw Error('揭示被计分');if(!state().revealed)throw Error('未保存揭示状态');if(opened)throw Error('自动打开解析');`,context);
 assert.match(get('feedback').innerHTML,/参考答案：B · for/);
});
