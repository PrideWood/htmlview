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
test('选择题必须为一个有效字母，重复题号不通过',()=>{assert.throws(()=>validateLesson({...lesson,questions:[{...lesson.questions[0],answer:'A或B'}]}),/答案必须/);assert.throws(()=>validateLesson({...lesson,questions:[lesson.questions[0],lesson.questions[0]]}),/重复/);});
test('模型的不确定答案不计分且不自动完成老师校对',()=>{const d=validateLesson({...lesson,questions:[{...lesson.questions[0],reviewStatus:'needs_review',answer:''}]},{fromModel:true});assert.equal(d.questions[0].invalid,true);assert.deepEqual(d.questions[0].accepted,[]);assert.equal(d.questions[0].reviewed,false);});
test('支持代码围栏JSON，不接受损坏的JSON',()=>{assert.equal(parseModelJSON('```json\n{"title":"a"}\n```').title,'a');assert.throws(()=>parseModelJSON('{"title":'),/完整有效/);});
test('原51份1570项全部保留，内置题库不可直接覆盖',async()=>{const r=await call('/lessons');assert.equal(r.status,200);const built=r.data.lessons.filter(d=>d.sourceType==='builtin');assert.equal(built.length,51);assert.equal(built.reduce((s,d)=>s+d.count,0),1570);const update=await call('/lessons/'+built[0].id,'PUT',{version:1,lesson});assert.equal(update.status,400);});
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
test('十张图片逐张保存，模型页序决定题目顺序，原上传编号可追溯',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ0kAAAAASUVORK5CYII=';
 const image={name:'multi.png',dataUrl:'data:image/png;base64,'+png};let r=await call('/imports','POST',{title:'多图排序测试',images:[image]});let d=r.data.lesson;
 for(let i=1;i<10;i++){r=await call('/lessons/'+d.id+'/images','POST',{version:d.version,image});assert.equal(r.status,201);d=r.data.lesson;}
 assert.equal(d.images.length,10);r=await call('/lessons/'+d.id+'/images','POST',{version:d.version,image});assert.equal(r.status,400);
 mockReply={...lesson,pageOrder:[10,9,8,7,6,5,4,3,2,1],orderNote:'根据印刷页码识别为倒序上传。',questions:[{...lesson.questions[0],label:'1',sourcePages:[1]},{...lesson.questions[0],label:'10',sourcePages:[10]},{...lesson.questions[0],label:'5',sourcePages:[5]}]};
 process.env.MODEL_ID='qwen3.8-flash';r=await call('/lessons/'+d.id+'/recognize','POST',{});assert.equal(r.status,200);assert.deepEqual(r.data.lesson.pageOrder,mockReply.pageOrder);process.env.MODEL_ID='test-vision-model';assert.deepEqual(r.data.lesson.questions.map(q=>q.label),['10','5','1']);assert.deepEqual(r.data.lesson.questions[0].sourcePages,[10]);mockReply=lesson;
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
