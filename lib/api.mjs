import {randomUUID} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {config,saveConfig,authenticated,localRequest,CLOUD} from './config.mjs';
import {listLessons,getLesson,saveLesson,storeImage,readImage,publicLesson,builtins,recordUsage,storeDocument} from './storage.mjs';
import {validateLesson,ValidationError} from './lesson.mjs';
import {recognizeNext,mergeRecognition} from './recognition-batches.mjs';
import {extractDocument} from './documents.mjs';
import {phoneRoute,logout,authCookie} from './phone-auth.mjs';
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));}
async function body(req){
 if(req.body&&typeof req.body==='object')return req.body;
 if(typeof req.body==='string'){if(Buffer.byteLength(req.body)>3900000)throw Object.assign(new Error('单次请求过大，请使用页面逐张上传。'),{status:413});return JSON.parse(req.body);}
 if(Number(req.headers['content-length']||0)>3900000)throw Object.assign(new Error('上传内容过大，请分批上传资料。'),{status:413});
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>3900000)throw Object.assign(new Error('上传内容过大。'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new ValidationError('请求 JSON 格式不正确。');}
}
function originOK(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
function emptyDoc(title,topic){const now=new Date().toISOString();return {id:randomUUID(),title:title||'新资料',topic:topic||'英语练习',status:'uploaded',sourceType:'photo',source:'手机拍照上传',createdAt:now,updatedAt:now,images:[],questions:[],notes:[],reference:[],ocrText:'',inputText:'',home:'/',version:0};}
function imageBytes(image){
 const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(image.dataUrl||'');if(!m)throw new ValidationError('照片须为 JPEG、PNG 或 WebP。');
 const bytes=Buffer.from(m[2],'base64');if(bytes.length<12||bytes.length>1000000)throw new ValidationError('每张照片压缩后需小于1MB。');
 const actual=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':'';
 if(actual!==m[1])throw new ValidationError('照片格式与内容不符，请重新选择。');return {bytes,mime:m[1]};
}
export async function handler(req,res){
 const requestStarted=performance.now();
 try{
  const url=new URL(req.url,'http://localhost');const pathname=url.pathname==='/api/index'&&url.searchParams.has('path')?'/api/'+url.searchParams.get('path'):url.pathname;const method=req.method;
  if(!['GET','HEAD'].includes(method)&&!originOK(req))return json(res,403,{error:'请求来源不匹配，请使用当前站点页面操作。'});
  if(pathname==='/api/session'&&method==='GET'){const c=await config();return json(res,200,{authenticated:await authenticated(req),localAdmin:localRequest(req),cloud:CLOUD,configured:Boolean(c.apiKey&&c.baseUrl&&c.model),model:c.model});}
  if(pathname.startsWith('/api/auth/')){const result=await phoneRoute(pathname,req,method==='POST'?await body(req):{});if(result.cookie)res.setHeader('Set-Cookie',result.cookie);return json(res,200,result.data);}
  if(!await authenticated(req))return json(res,401,{error:'请使用已绑定的手机扫码登录。'});
  if(pathname==='/api/logout'&&method==='POST'){await logout(req);res.setHeader('Set-Cookie',[authCookie(req,'classroom_session','',0),authCookie(req,'classroom_app','',0)]);return json(res,200,{ok:true});}
  if(pathname==='/api/settings'){
   if(method==='POST'){if(!localRequest(req))return json(res,403,{error:'模型密钥只能在本机配置；云端使用环境变量。'});await saveConfig(await body(req));}
   const c=await config();const addresses=localRequest(req)?Object.values(networkInterfaces()).flat().filter(n=>n&&!n.internal&&n.family==='IPv4').map(n=>`http://${n.address}:${process.env.PORT||8787}`):[];
   return json(res,200,{baseUrl:c.baseUrl,model:c.model,apiMode:c.apiMode,jsonMode:c.jsonMode,hasKey:Boolean(c.apiKey),localAdmin:localRequest(req),...(localRequest(req)?{phoneUrls:addresses}:{}),storage:process.env.DATABASE_URL?'PostgreSQL＋私有对象存储':CLOUD?'云端持久存储尚未配置':'本机持久化文件'});
  }
  if(pathname==='/api/lessons'&&method==='GET')return json(res,200,{lessons:await listLessons()});
  if(pathname==='/api/imports'&&method==='POST'){
   const input=await body(req);if(!Array.isArray(input.images)||input.images.length>10)throw new ValidationError('每份资料最多10张照片。');if(!input.images.length&&!input.document&&!String(input.text||'').trim())throw new ValidationError('请选择照片、文档或粘贴题目原文。');
   const decoded=input.images.map(imageBytes);if(decoded.reduce((s,x)=>s+x.bytes.length,0)>2600000)throw new ValidationError('照片总大小需小于2.6MB，请减少图片。');
   const doc=emptyDoc(String(input.title||'').slice(0,120),String(input.topic||'').slice(0,100));doc.inputText=String(input.text||'').slice(0,100000);
   if(input.document){const file=await extractDocument(input.document);const combined=[file.text,doc.inputText].filter(Boolean).join('\n\n');if(combined.length>100000)throw new ValidationError('文档与补充文字总计超过10万字，请拆分。');doc.inputText=combined;doc.documents=[await storeDocument(file)];doc.sourceType='document';doc.source='文档上传';if(!input.title)doc.title=file.name.replace(/\.[^.]+$/,'');}
   // Validate the full batch before writing any image.
   doc.images=await Promise.all(decoded.map((image,i)=>storeImage(image.bytes,image.mime,input.images[i].name)));
   return json(res,201,{lesson:publicLesson(await saveLesson(doc,0))});
  }
  if(pathname==='/api/import-json'&&method==='POST'){
   const input=await body(req);const normalized=validateLesson(input.lesson);const doc={...emptyDoc(normalized.title,normalized.topic),...normalized,sourceType:'import',source:'JSON 导入',status:'draft'};doc.questions.forEach(q=>q.reviewed=false);return json(res,201,{lesson:publicLesson(await saveLesson(doc,0))});
  }
  const match=/^\/api\/lessons\/([A-Za-z0-9_-]+)(?:\/(recognize|publish|copy|archive|restore|export|images|documents|use)(?:\/([A-Za-z0-9_-]+))?)?$/.exec(pathname);
  if(!match)return json(res,404,{error:'接口不存在。'});
  const [,id,action,imageId]=match;let doc=await getLesson(id);if(!doc)return json(res,404,{error:'资料不存在。'});
  if(method==='GET'&&action==='documents'){
   const file=doc.documents?.find(d=>d.id===imageId);if(!file)return json(res,404,{error:'文档不存在。'});const bytes=await readImage(file);res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
  }
  if(method==='GET'&&action==='images'){
   const image=doc.images?.find(i=>i.id===imageId);if(!image)return json(res,404,{error:'照片不存在。'});const bytes=await readImage(image);res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(bytes);
  }
  if(method==='GET'&&action==='export'){res.setHeader('Content-Disposition',`attachment; filename="lesson-${id}.json"`);return json(res,200,{...publicLesson(doc),images:[],documents:[],notes:[...doc.notes,'此JSON备份不包含原始照片与文档附件。']});}
  if(method==='GET'&&!action)return json(res,200,{lesson:publicLesson(doc)});
  if(method==='POST'&&action==='copy'){
   const copy={...doc,id:randomUUID(),title:doc.title+' · 副本',sourceType:'copy',status:'draft',createdAt:new Date().toISOString(),version:0};copy.questions=copy.questions.map(q=>({...q,reviewed:false}));return json(res,201,{lesson:publicLesson(await saveLesson(copy,0))});
  }
  if(method==='POST'&&action==='use')return json(res,200,{lastUsedAt:await recordUsage(id)});
  if(builtins.has(id))return json(res,400,{error:'内置资料保持原样，请先复制再编辑。'});
  if(method==='POST'&&action==='images'){
   if(doc.status!=='uploaded'||doc.questions.length)throw new ValidationError('只能为尚未识别的资料继续添加照片。');
   if((doc.images||[]).length>=10)throw new ValidationError('每份资料最多10张照片。');
   const input=await body(req);if(Number(input.version)!==doc.version)return json(res,409,{error:'资料图片已更新，请重新打开后上传。'});
   const decoded=imageBytes(input.image||{});const image=await storeImage(decoded.bytes,decoded.mime,input.image?.name);
   return json(res,201,{lesson:publicLesson(await saveLesson({...doc,recognitionState:null,images:[...doc.images,image]},doc.version))});
  }
  if(method==='POST'&&action==='recognize'){
   if(doc.status==='processing'&&Number(doc.processingUntil)>Date.now())return json(res,409,{error:'该资料正在识别，请稍候，勿重复提交。'});
   if(doc.questions.length&&!['error','uploaded'].includes(doc.status))throw new ValidationError('为保护已编辑结果，请新建一份资料重新识别。');
   doc=await saveLesson({...doc,status:'processing',processingUntil:Date.now()+200000,error:''},doc.version);
   try{
    const prepareMs=Math.round(performance.now()-requestStarted);const step=await recognizeNext(doc);
    if(step.pending){
     doc=await saveLesson({...doc,recognitionState:step.state,status:'uploaded',processingUntil:0,error:''},doc.version);
     return json(res,200,{lesson:publicLesson(doc),pending:true,progress:{completed:step.state.completed,remaining:step.state.tasks.length,split:Boolean(step.split)}});
    }
    const recognized=mergeRecognition(step.state,doc);recognized.modelInfo.timings.prepareMs=prepareMs;recognized.modelInfo.timings.totalMs+=prepareMs;
    const saveStarted=performance.now();doc=await saveLesson({...doc,...recognized,recognitionState:null,status:'draft',error:'',processingUntil:0,home:'/'},doc.version);
    const timings={...doc.modelInfo.timings,resultSaveMs:Math.round(performance.now()-saveStarted),requestMs:Math.round(performance.now()-requestStarted)};
    res.setHeader('Server-Timing',`prepare;dur=${prepareMs},images;dur=${timings.imageReadMs},model;dur=${timings.modelMs},save;dur=${timings.resultSaveMs}`);
    console.info(JSON.stringify({event:'recognition-complete',lessonId:doc.id,model:doc.modelInfo.model,images:doc.images.length,questions:doc.questions.length,batches:doc.modelInfo.batches,timings,usage:doc.modelInfo.usage}));
    return json(res,200,{lesson:publicLesson(doc),pending:false,timings});
   }catch(e){await saveLesson({...doc,status:'error',processingUntil:0,error:e.message},doc.version);throw e;}
  }
  if(doc.status==='processing'&&Number(doc.processingUntil)>Date.now())return json(res,409,{error:'识别中，请完成后再修改。'});
  const input=await body(req);if(Number(input.version)!==doc.version)return json(res,409,{error:'资料已在其他设备更新，请重新打开后编辑。'});
  if(method==='PUT'&&!action){const empty=Array.isArray(input.lesson?.questions)&&input.lesson.questions.length===0;const normalized=empty?{title:String(input.lesson.title||'未命名资料').slice(0,120),topic:String(input.lesson.topic||'拍照资料').slice(0,100),ocrText:String(input.lesson.ocrText||'').slice(0,100000),questions:[]}:validateLesson(input.lesson);const saved=await saveLesson({...doc,...normalized,recognitionState:null,status:empty?'uploaded':'draft'},doc.version);return json(res,200,{lesson:publicLesson(saved)});}
  if(method==='POST'&&action==='publish'){
   validateLesson(doc);if(doc.questions.some(q=>!q.reviewed&&!q.invalid))throw new ValidationError('请先逐题核对，或明确点击“全部标为已核对”，保存后再用于课堂。');
   if(doc.questions.some(q=>q.invalid)&&input.allowPending!==true)throw new ValidationError('仍有待确认题。请修正，或勾选保留待确认题（不计分）。');
   return json(res,200,{lesson:publicLesson(await saveLesson({...doc,status:'ready'},doc.version))});
  }
  if(method==='POST'&&['archive','restore'].includes(action))return json(res,200,{lesson:publicLesson(await saveLesson({...doc,status:action==='archive'?'archived':'draft'},doc.version))});
  return json(res,405,{error:'不支持此操作。'});
 }catch(e){return json(res,e.status||500,{error:e.message||'操作失败，请重试。'});}
}
