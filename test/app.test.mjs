import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'classroom-test-'));
process.env.ALLOW_LOCAL_MODEL_HTTP='1';process.env.CLASSROOM_ACCESS_CODE='test-access-123';process.env.SESSION_SECRET='test-session-secret-that-is-at-least-32-characters';
const {validateLesson,parseModelJSON}=await import('../lib/lesson.mjs');
const {handler}=await import('../lib/api.mjs');
const {getLesson,saveLesson,Conflict}=await import('../lib/storage.mjs');
const lesson={title:'测试题',topic:'介词',notes:[],ocrText:'We have lived here ____ five years.',questions:[{label:'1',stem:'We have lived here ____ five years.',mode:'choice',options:[{key:'A',text:'for'},{key:'B',text:'since'}],answer:'A',reviewStatus:'ok',reason:'for后接一段时间。',examNote:'',context:[],enrichment:[],optionNotes:[{key:'A',text:'for',reason:'接时长。'},{key:'B',text:'since',reason:'接起点。'}]}]};
let app,model,base,modelRequests=0,mockReply=lesson,mockResponder=null;
before(async()=>{
 model=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks));modelRequests++;if(b.model==='qwen3.8-flash')assert.equal(b.enable_thinking,false);else assert.equal(b.enable_thinking,undefined);assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer fake-test-key');if(b.messages[1].content.some(c=>c.type==='image_url'))assert.ok(b.messages[1].content.some(c=>c.type==='image_url'&&c.image_url.url.startsWith('data:image/png;base64,')));else if(!mockResponder)assert.match(b.messages[1].content[0].text,/文档导入原题/);if(mockResponder){const reply=mockResponder(b);res.writeHead(reply.httpStatus||200,{'Content-Type':'application/json'});res.end(JSON.stringify(reply));return;}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(mockReply)}}]}));});
 await new Promise(r=>model.listen(0,'127.0.0.1',r));process.env.MODEL_BASE_URL=`http://127.0.0.1:${model.address().port}/v1`;process.env.MODEL_API_KEY='fake-test-key';process.env.MODEL_ID='test-vision-model';
 app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;
});
after(async()=>{await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>model.close(r))]);await rm(process.env.DATA_DIR,{recursive:true,force:true});});
async function call(url,method='GET',body){const r=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),serverTiming:r.headers.get('server-timing')};}
test('内置原图及副本保留可读取的静态资源地址，不进入上传照片接口',async()=>{
 const original=await call('/lessons/builtin-danzhao2025-reading-22');
 assert.equal(original.data.lesson.images[0].url,'/builtin-assets/danzhao-2025/reading-22-page-075.png');
 const copy=await call('/lessons/builtin-danzhao2025-reading-22/copy','POST',{});
 assert.equal(copy.status,201);assert.equal(copy.data.lesson.images[0].url,original.data.lesson.images[0].url);
 const saved=await call('/lessons/'+copy.data.lesson.id);
 assert.equal(saved.data.lesson.images[0].url,original.data.lesson.images[0].url);
});
test('选择题必须为一个有效字母，重复题号不通过',()=>{assert.throws(()=>validateLesson({...lesson,questions:[{...lesson.questions[0],answer:'A或B'}]}),/答案必须/);assert.throws(()=>validateLesson({...lesson,questions:[lesson.questions[0],lesson.questions[0]]}),/重复/);});
test('模型的不确定答案不计分且不自动完成老师校对',()=>{const d=validateLesson({...lesson,questions:[{...lesson.questions[0],reviewStatus:'needs_review',answer:''}]},{fromModel:true});assert.equal(d.questions[0].invalid,true);assert.deepEqual(d.questions[0].accepted,[]);assert.equal(d.questions[0].reviewed,false);});
test('支持代码围栏JSON，不接受损坏的JSON',()=>{assert.equal(parseModelJSON('```json\n{"title":"a"}\n```').title,'a');assert.throws(()=>parseModelJSON('{"title":'),/完整有效/);});
test('原51份1570项全部保留，内置题库不可直接覆盖',async()=>{const r=await call('/lessons');assert.equal(r.status,200);const built=r.data.lessons.filter(d=>d.sourceType==='builtin');assert.equal(built.length,146);assert.equal(built.reduce((s,d)=>s+d.count,0),2612);const original=built.filter(d=>!d.id.startsWith('builtin-danzhao2025-')&&d.id!=='builtin-25-class-english-monthly-exam');assert.equal(original.length,51);assert.equal(original.reduce((s,d)=>s+d.count,0),1570);const update=await call('/lessons/'+built[0].id,'PUT',{version:1,lesson});assert.equal(update.status,400);});
test('错误文件类型及跨站写入被拒绝',async()=>{const x=await call('/imports','POST',{images:[{dataUrl:'data:text/html;base64,PHNjcmlwdD4='}]});assert.equal(x.status,400);const r=await fetch(base+'/api/import-json',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({lesson})});assert.equal(r.status,403);});
test('上传→真实协议请求到本地mock→校对→保存课堂→重新读取',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ0kAAAAASUVORK5CYII=';
 let r=await call('/imports','POST',{title:'流水线测试',topic:'介词',text:'',images:[{name:'page.png',dataUrl:'data:image/png;base64,'+png}]});assert.equal(r.status,201);let d=r.data.lesson;assert.equal(d.status,'uploaded');assert.equal(d.images.length,1);
 r=await call('/lessons/'+d.id,'PUT',{version:d.version,lesson:{...d,title:'上传后可编辑标题',ocrText:'补充过的原文'}});assert.equal(r.status,200);d=r.data.lesson;assert.equal(d.status,'uploaded');assert.equal(d.title,'上传后可编辑标题');
 const image=await fetch(base+d.images[0].url);assert.equal(Buffer.compare(Buffer.from(await image.arrayBuffer()),Buffer.from(png,'base64')),0);
 r=await call('/lessons/'+d.id+'/recognize','POST',{});assert.equal(r.status,200);d=r.data.lesson;assert.equal(d.status,'draft');assert.equal(d.questions[0].reviewed,false);assert.ok(r.data.timings.modelMs>=0);assert.ok(r.data.timings.imageReadMs>=0);assert.ok(r.data.timings.prepareMs>=0);assert.match(r.serverTiming,/model;dur=/);assert.ok(d.modelInfo.timings.totalMs>=d.modelInfo.timings.modelMs);assert.equal(modelRequests,1);
 r=await call('/lessons/'+d.id+'/publish','POST',{version:d.version});assert.equal(r.status,400);
 d.questions[0].reviewed=true;r=await call('/lessons/'+d.id,'PUT',{version:d.version,lesson:d});assert.equal(r.status,200);d=r.data.lesson;
 r=await call('/lessons/'+d.id+'/publish','POST',{version:d.version});assert.equal(r.status,200);assert.equal(r.data.lesson.status,'ready');
 const stored=JSON.parse(await readFile(path.join(process.env.DATA_DIR,'lessons',d.id+'.json'),'utf8'));assert.equal(stored.status,'ready');assert.equal((await getLesson(d.id)).ocrText,lesson.ocrText);
 const stale=await call('/lessons/'+d.id,'PUT',{version:1,lesson:d});assert.equal(stale.status,409);
});
test('十张图片逐张保存，小题按原题号排序，模型页序与原上传编号仍可追溯',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ0kAAAAASUVORK5CYII=';
 const image={name:'multi.png',dataUrl:'data:image/png;base64,'+png};let r=await call('/imports','POST',{title:'多图排序测试',images:[image]});let d=r.data.lesson;
 for(let i=1;i<10;i++){r=await call('/lessons/'+d.id+'/images','POST',{version:d.version,image});assert.equal(r.status,201);d=r.data.lesson;}
 assert.equal(d.images.length,10);r=await call('/lessons/'+d.id+'/images','POST',{version:d.version,image});assert.equal(r.status,400);
 mockReply={...lesson,pageOrder:[10,9,8,7,6,5,4,3,2,1],orderNote:'根据印刷页码识别为倒序上传。',questions:[{...lesson.questions[0],label:'1',sourcePages:[1]},{...lesson.questions[0],label:'10',sourcePages:[10]},{...lesson.questions[0],label:'5',sourcePages:[5]}]};
 process.env.MODEL_ID='qwen3.8-flash';r=await call('/lessons/'+d.id+'/recognize','POST',{});assert.equal(r.status,200);assert.deepEqual(r.data.lesson.pageOrder,mockReply.pageOrder);process.env.MODEL_ID='test-vision-model';assert.deepEqual(r.data.lesson.questions.map(q=>q.label),['1','5','10']);assert.deepEqual(r.data.lesson.questions[0].sourcePages,[1]);mockReply=lesson;
});
test('并发保存只允许一个相同版本成功，不覆盖其他设备修改',async()=>{const d={id:'concurrency-test',...validateLesson(lesson),status:'draft',sourceType:'import',createdAt:new Date().toISOString(),images:[]};const saved=await saveLesson(d,0);const results=await Promise.allSettled([saveLesson({...saved,title:'a'},1),saveLesson({...saved,title:'b'},1)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.ok(results.find(x=>x.status==='rejected').reason instanceof Conflict);});
test('未认证的手机请求无法读取题目或模型密钥',async()=>{let output='';const res={writeHead(s){this.status=s;},end(s){output=s;},setHeader(){}};await handler({url:'/api/lessons',method:'GET',headers:{host:'example.com'},socket:{remoteAddress:'192.168.1.7'}},res);assert.equal(res.status,401);assert.doesNotMatch(output,/fake-test-key/);});

test('首批多图保存保持原始顺序并能读取',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ0kAAAAASUVORK5CYII=';
 const images=['第一页.png','第二页.png','第三页.png'].map(name=>({name,dataUrl:'data:image/png;base64,'+png}));
 const r=await call('/imports','POST',{title:'首批多图',images});assert.equal(r.status,201);assert.deepEqual(r.data.lesson.images.map(x=>x.name),images.map(x=>x.name));
 for(const image of r.data.lesson.images){const b=await fetch(base+image.url);assert.equal(b.status,200);assert.deepEqual(Buffer.from(await b.arrayBuffer()),Buffer.from(png,'base64'));}
});
test('记录内置资料最近使用时间而不改变题库版本',async()=>{const before=await call('/lessons');const id=before.data.lessons.find(d=>d.sourceType==='builtin').id;const original=(await call('/lessons/'+id)).data.lesson;const used=await call('/lessons/'+id+'/use','POST',{});assert.equal(used.status,200);const listed=(await call('/lessons')).data.lessons.find(d=>d.id===id);assert.equal(listed.lastUsedAt,used.data.lastUsedAt);const after=(await call('/lessons/'+id)).data.lesson;assert.deepEqual(after.questions,original.questions);assert.equal(after.version,original.version);});

test('文档上传保存原件、提取文字、调用模型，下载需经过认证',async()=>{
 const text='# 文档导入原题\nWe have lived here ____ five years.\nA. for B. since';
 let r=await call('/imports','POST',{images:[],text:'补充材料',document:{name:'英语.md',base64:Buffer.from(text).toString('base64')}});assert.equal(r.status,201);const d=r.data.lesson;
 assert.equal(d.sourceType,'document');assert.equal(d.title,'英语');assert.equal(d.inputText,text+'\n\n补充材料');assert.equal(d.documents.length,1);assert.equal(d.documents[0].storage,undefined);
 const raw=await fetch(base+d.documents[0].url);assert.equal(await raw.text(),text);assert.match(raw.headers.get('content-disposition'),/attachment/);
 const exported=await call('/lessons/'+d.id+'/export');assert.deepEqual(exported.data.documents,[]);
 let output='';const res={writeHead(status){this.status=status;},end(value){output=value;},setHeader(){}};await handler({url:d.documents[0].url,method:'GET',headers:{host:'example.com'},socket:{remoteAddress:'192.168.1.9'}},res);assert.equal(res.status,401);assert.doesNotMatch(output,/文档导入原题/);
 r=await call('/lessons/'+d.id+'/recognize','POST',{});assert.equal(r.status,200);assert.equal(r.data.lesson.questions.length,1);assert.equal(r.data.lesson.documents[0].name,'英语.md');assert.equal(r.data.lesson.questions[0].reviewed,false);
 const invalid=await call('/imports','POST',{images:[],document:{name:'bad.docx',base64:Buffer.from('broken').toString('base64')}});assert.equal(invalid.status,400);
});

const modelReply=(value,finish='stop')=>({choices:[{finish_reason:finish,message:{content:JSON.stringify(value)}}]});
const batchText=b=>b.messages[1].content[0].text.split('【本批原文】\n').at(-1).split('\n【本批原文结束】')[0];
function replyFromText(b){const source=batchText(b);const labels=[...source.matchAll(/^(\d+)\. Question/gm)].map(m=>m[1]);return modelReply({...lesson,ocrText:source,questions:labels.map(label=>({...lesson.questions[0],label,stem:'Question '+label}))});}
test('长文自动逐批整理：原文不截断，题序保留，状态不暴露内部队列',async()=>{
 const text='文档导入原题\n'+Array.from({length:25},(_,i)=>`${i+1}. Question ${i+1} ${'x'.repeat(200)}\nA. for B. since`).join('\n');
 let r=await call('/imports','POST',{images:[],title:'长文测试',text});const id=r.data.lesson.id;
 try{mockResponder=replyFromText;let rounds=0;
 do{r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.status,200,JSON.stringify(r.data));rounds++;assert.equal(r.data.lesson.recognitionState,undefined);if(r.data.pending){assert.equal(r.data.lesson.status,'uploaded');assert.ok(r.data.progress.completed>0);}}while(r.data.pending&&rounds<20);
 assert.ok(rounds>1);assert.equal(r.data.pending,false);assert.equal(r.data.lesson.status,'draft');assert.equal(r.data.lesson.ocrText,text);
 assert.deepEqual(r.data.lesson.questions.map(q=>q.label),Array.from({length:25},(_,i)=>String(i+1)));assert.equal(r.data.lesson.modelInfo.batches,rounds);
 }finally{mockResponder=null;}
});
test('输出截断及无效JSON自动缩小批次，失败后继续已完成进度',async()=>{
 const text='文档导入原题\n'+Array.from({length:6},(_,i)=>`${i+1}. Question ${i+1} ${'x'.repeat(160)}\nA. for B. since`).join('\n');
 let r=await call('/imports','POST',{images:[],text});const id=r.data.lesson.id;let requests=0;
 try{mockResponder=b=>{requests++;if(requests===1)return modelReply({},'length');return replyFromText(b);};
 r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.status,200);assert.equal(r.data.pending,true);assert.equal(r.data.progress.split,true);assert.equal(r.data.progress.completed,0);
 r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.data.progress.completed,1);const saved=await getLesson(id);assert.equal(saved.recognitionState.results.length,1);
 mockResponder=()=>({httpStatus:503,error:'temporary'});r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.status,500);assert.equal(r.data.error.includes('503'),true);
 assert.equal((await getLesson(id)).recognitionState.results.length,1);
 let invalid=true;mockResponder=b=>invalid?(invalid=false,{choices:[{finish_reason:'stop',message:{content:'{"questions":['}}]}):replyFromText(b);
 r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.data.progress.split,true);
 let attempts=0;do{r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.status,200,JSON.stringify(r.data));}while(r.data.pending&&++attempts<20);
 assert.equal(r.data.lesson.status,'draft');assert.deepEqual(r.data.lesson.questions.map(q=>q.label),['1','2','3','4','5','6']);assert.equal(r.data.lesson.ocrText,text);
 }finally{mockResponder=null;}
});
test('DOC 原件可上传下载并参与模型整理',async()=>{
 const bytes=await readFile(new URL('./fixtures/questions.doc',import.meta.url));
 let r=await call('/imports','POST',{images:[],document:{name:'练习.doc',base64:bytes.toString('base64')}});assert.equal(r.status,201);const d=r.data.lesson;
 assert.match(d.inputText,/英语练习/);assert.equal(d.documents[0].mime,'application/msword');assert.deepEqual(Buffer.from(await (await fetch(base+d.documents[0].url)).arrayBuffer()),bytes);
 try{mockResponder=b=>{assert.match(batchText(b),/We have lived here/);return modelReply(lesson);};r=await call('/lessons/'+d.id+'/recognize','POST',{});assert.equal(r.status,200);assert.equal(r.data.lesson.status,'draft');}finally{mockResponder=null;}
});

test('模型识别到七选五与多选时，题型、共享选项、原空号和多选答案经 API 完整保存',async()=>{
 const bank=Array.from('ABCDEFG',key=>({key,text:'Sentence '+key}));const context=[{type:'p',text:'七选五 passage ____ (36) ____ (37) ____ (38) ____ (39) ____ (40)'}];
 const questions=Array.from('CEBFA',(answer,i)=>({...lesson.questions[0],label:String(36+i),blankLabel:String(36+i),questionType:'sentence_completion',groupId:'Reading A',options:bank,context,answer}));
 questions.push({...lesson.questions[0],label:'41',questionType:'multiple_choice',mode:'multi',answer:'A,C',options:bank});
 try{mockResponder=b=>{assert.match(b.messages[0].content,/每个空单独一题/);assert.match(b.messages[0].content,/multiple_choice/);return modelReply({...lesson,questions});};
 let r=await call('/imports','POST',{images:[],text:'文档导入原题：七选五和多选'});const id=r.data.lesson.id;r=await call('/lessons/'+id+'/recognize','POST',{});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.lesson.questions.length,6);const q=r.data.lesson.questions[0];assert.equal(q.questionType,'sentence_completion');assert.equal(q.options.length,7);assert.equal(q.blankLabel,'36');assert.equal(q.groupId,'Reading A');
 const multiple=r.data.lesson.questions[5];assert.equal(multiple.mode,'multi');assert.deepEqual(multiple.accepted,['A','C']);
 const stored=(await call('/lessons/'+id)).data.lesson;assert.equal(stored.questions[5].questionType,'multiple_choice');assert.equal(stored.materials.find(m=>m.id==='Reading A').context[0].text,context[0].text);
 }finally{mockResponder=null;}
});

test('已校对部分题目时，其他误标选择题及缺失选项不阻止草稿保存',async()=>{
 const original={...lesson,id:'partial-review-save',status:'draft',sourceType:'document',inputText:'Original paper',images:[],questions:[{...lesson.questions[0],label:'1',reviewed:true},{...lesson.questions[0],label:'42',questionType:'sentence_completion',mode:'choice',options:[],answer:'The machines are being repaired.',stem:'They are busy repairing the machines. ____ ____ are being repaired.'},{...lesson.questions[0],label:'43',options:[],answer:'',reviewed:false}]};
 await saveLesson(original,0);let r=await call('/lessons/'+original.id);assert.equal(r.data.lesson.questions[1].mode,'input');
 const doc=r.data.lesson;doc.questions[0].reason='老师已校对的解析';r=await call('/lessons/'+doc.id,'PUT',{version:doc.version,lesson:doc});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.lesson.questions[0].reviewed,true);assert.equal(r.data.lesson.questions[0].reason,'老师已校对的解析');assert.equal(r.data.lesson.questions[1].answer,original.questions[1].answer);assert.equal(r.data.lesson.questions[1].mode,'input');assert.equal(r.data.lesson.questions[2].invalid,true);assert.deepEqual(r.data.lesson.questions[2].accepted,[]);
 const stored=await getLesson(doc.id);assert.equal(stored.questions.length,3);assert.equal(stored.questions[0].reason,'老师已校对的解析');
});
test('旧资料补全篇章可分批重试，不改已校对的小题答案与解析，保存完整材料',async()=>{
 const passage='第一段：原始篇章。\n'+'The complete passage continues. '.repeat(40)+'\n最后一段：文章结束。';
 const original={...lesson,id:'repair-shared-material',status:'draft',sourceType:'document',inputText:passage,ocrText:'incomplete OCR',images:[],questions:[{...lesson.questions[0],label:'36',questionType:'reading',groupId:'reading-a',reviewed:true,reason:'老师已修改解析'},{...lesson.questions[0],label:'37',questionType:'reading',groupId:'reading-a',reviewed:true}]};
 let doc=await saveLesson(original,0),requests=0;
 try{mockResponder=b=>{requests++;assert.match(b.messages[1].content[0].text,/最后一段：文章结束/);assert.match(b.messages[1].content[0].text,/本次只补全/);if(requests===1)return modelReply({},'length');if(requests===3)return {httpStatus:503,error:'temporary'};return modelReply({...lesson,questions:[],materials:[{id:'reading-a',title:'全文',questionLabels:['36','37'],context:[{type:'p',text:passage}]}]});};
 let r=await call('/lessons/'+doc.id+'/materials','POST',{version:doc.version});assert.equal(r.status,200);assert.equal(r.data.pending,true);assert.equal(r.data.lesson.materialRepairState,undefined);doc=r.data.lesson;
 r=await call('/lessons/'+doc.id+'/materials','POST',{version:doc.version});assert.equal(r.data.pending,true);doc=r.data.lesson;
 r=await call('/lessons/'+doc.id+'/materials','POST',{version:doc.version});assert.equal(r.status,500);doc=(await call('/lessons/'+doc.id)).data.lesson;assert.equal(doc.materialRepairProgress.completed,1);
 r=await call('/lessons/'+doc.id+'/materials','POST',{version:doc.version});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.pending,false);doc=r.data.lesson;
 assert.equal(doc.status,'draft');assert.equal(doc.materials[0].context[0].text,passage);assert.equal(doc.questions[0].reason,'老师已修改解析');assert.equal(doc.questions[0].answer,original.questions[0].answer);assert.equal(doc.questions[0].reviewed,false);assert.equal(doc.questions.length,2);assert.equal(doc.materialRepairState,undefined);assert.equal(doc.materialRepairProgress,undefined);
 const stored=await getLesson(doc.id);assert.equal(stored.materials[0].context[0].text,passage);assert.deepEqual(stored.questions[0].context,[]);
 r=await call('/lessons/'+doc.id+'/materials','POST',{version:1});assert.equal(r.status,409);
 }finally{mockResponder=null;}
});
test('乱序小题在读取和保存后按原题号排序，手动顺序明确保存后不被重排',async()=>{
 const doc=await saveLesson({...lesson,id:'question-order-save',status:'draft',sourceType:'document',images:[],questions:['42','2','34','1'].map(label=>({...lesson.questions[0],label}))},0);
 let r=await call('/lessons/'+doc.id);assert.deepEqual(r.data.lesson.questions.map(q=>q.label),['1','2','34','42']);
 r.data.lesson.questionOrder='manual';r.data.lesson.questions.reverse();r=await call('/lessons/'+doc.id,'PUT',{version:r.data.lesson.version,lesson:r.data.lesson});assert.equal(r.status,200);assert.deepEqual(r.data.lesson.questions.map(q=>q.label),['42','34','2','1']);
 assert.deepEqual((await call('/lessons/'+doc.id)).data.lesson.questions.map(q=>q.label),['42','34','2','1']);
});
test('资料移入回收站后保留附件和原状态，恢复时版本冲突不会覆盖修改',async()=>{
 const r=await call('/import-json','POST',{lesson});let d=r.data.lesson;const id=d.id;d=await saveLesson({...await getLesson(id),status:'ready'},d.version);
 let x=await call('/lessons/'+id+'/trash','POST',{version:d.version});assert.equal(x.status,200);assert.equal(x.data.lesson.status,'trashed');assert.equal(x.data.lesson.questions.length,1);
 const trashed=x.data.lesson;x=await call('/lessons/'+id+'/untrash','POST',{version:d.version});assert.equal(x.status,409);
 x=await call('/lessons/'+id+'/untrash','POST',{version:trashed.version});assert.equal(x.status,200);assert.equal(x.data.lesson.status,'ready');assert.equal(x.data.lesson.questions[0].stem,lesson.questions[0].stem);
});
test('内置资料可移入回收站并恢复，原始题库未改变',async()=>{
 const before=(await call('/lessons')).data.lessons;let builtin=before.find(d=>d.sourceType==='builtin');const id=builtin.id;
 let r=await call('/lessons/'+id+'/trash','POST',{version:builtin.version});assert.equal(r.status,200);assert.equal(r.data.lesson.status,'trashed');
 const listed=(await call('/lessons')).data.lessons;assert.equal(listed.find(d=>d.id===id).status,'trashed');assert.equal(listed.filter(d=>d.sourceType==='builtin').length,before.filter(d=>d.sourceType==='builtin').length);assert.equal(listed.some(d=>d.sourceType==='builtin-trash-marker'),false);
 r=await call('/lessons/'+id+'/untrash','POST',{version:r.data.lesson.version});assert.equal(r.status,200);assert.equal(r.data.lesson.status,builtin.status);assert.equal(r.data.lesson.questions.length,builtin.count);
});
test('删除和恢复期间原始文档附件仍可读取',async()=>{
 const content='Question source';let r=await call('/imports','POST',{images:[],document:{name:'source.txt',base64:Buffer.from(content).toString('base64')}});let d=r.data.lesson;const url=d.documents[0].url;
 r=await call('/lessons/'+d.id+'/trash','POST',{version:d.version});assert.equal(r.status,200);assert.equal(await (await fetch(base+url)).text(),content);
 r=await call('/lessons/'+d.id+'/untrash','POST',{version:r.data.lesson.version});assert.equal(r.status,200);assert.equal(await (await fetch(base+url)).text(),content);assert.equal(r.data.lesson.status,'uploaded');
});

test('课堂进度接口支持内置资料、独立课堂历史和原题快照，越界请求被拒绝',async()=>{
 const id=(await call('/lessons')).data.lessons.find(d=>d.sourceType==='builtin'&&d.count>2).id;
 const original=(await call('/lessons/'+id)).data.lesson;
 let result=await call('/lessons/'+id+'/progress','POST',{sessionId:'api-class-1',sequence:1,index:1,visited:[0,1]});
 assert.equal(result.status,200);assert.equal(result.data.session.lastQuestion.label,original.questions[1].label);
 await call('/lessons/'+id+'/progress','POST',{sessionId:'api-class-2',sequence:1,index:2,visited:[2]});
 const history=await call('/study-sessions');assert.equal(history.status,200);assert.equal(history.data.sessions.length,2);
 result=await call('/lessons/'+id+'/progress','POST',{sessionId:'api-class-1',sequence:2,index:999999,visited:[0]});assert.equal(result.status,400);
 assert.deepEqual((await call('/lessons/'+id)).data.lesson,original);
 let output='';const response={writeHead(status){this.status=status;},end(value){output=value;},setHeader(){}};
 await handler({url:'/api/study-sessions',method:'GET',headers:{host:'example.com'},socket:{remoteAddress:'192.168.1.7'}},response);assert.equal(response.status,401);assert.doesNotMatch(output,/api-class/);
});

test('班级接口创建并持久查询，进度列表按班级筛选且拒绝无效班级',async()=>{
 const a=await call('/classes','POST',{name:'测试一班'}),b=await call('/classes','POST',{name:'测试二班'});assert.equal(a.status,201);assert.equal(b.status,201);
 const classes=await call('/classes');assert.ok(classes.data.classes.some(c=>c.id===a.data.class.id));assert.equal((await call('/classes','POST',{name:''})).status,400);
 const id=(await call('/lessons')).data.lessons.find(d=>d.sourceType==='builtin'&&d.count>2).id;
 for(const [group,index] of [[a,0],[b,2]])assert.equal((await call('/lessons/'+id+'/progress','POST',{sessionId:'session-'+group.data.class.id,classId:group.data.class.id,sequence:1,index,visited:[index]})).status,200);
 const history=await call('/study-sessions?classId='+a.data.class.id);assert.equal(history.data.sessions.length,1);assert.equal(history.data.sessions[0].lastQuestion.index,0);
 assert.equal((await call('/lessons/'+id+'/progress','POST',{sessionId:'invalid-group',classId:'unknown',sequence:1,index:0,visited:[0]})).status,400);
 let output='';const response={writeHead(status){this.status=status;},end(value){output=value;},setHeader(){}};
 await handler({url:'/api/classes',method:'GET',headers:{host:'example.com'},socket:{remoteAddress:'192.168.1.7'}},response);assert.equal(response.status,401);assert.doesNotMatch(output,/测试一班/);
});

test('班级改名接口保留ID，名称验证与认证生效',async()=>{
 const created=(await call('/classes','POST',{name:'改名前'})).data.class;
 let result=await call('/classes/'+created.id,'PATCH',{name:'改名后'});assert.equal(result.status,200);assert.equal(result.data.class.id,created.id);assert.equal(result.data.class.name,'改名后');
 assert.equal((await call('/classes/'+created.id,'PATCH',{name:''})).status,400);assert.equal((await call('/classes/missing','PATCH',{name:'新班'})).status,404);
 const response={writeHead(status){this.status=status;},end(){},setHeader(){}};
 await handler({url:'/api/classes/'+created.id,method:'PATCH',body:{name:'不允许'},headers:{host:'example.com'},socket:{remoteAddress:'192.168.1.7'}},response);assert.equal(response.status,401);
});
