import {compactMaterials} from '../public/lesson-materials.js';
import {orderedLesson} from '../public/question-order.js';
import {repairQuestionTypes} from '../public/question-types.js';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {DATA,CLOUD,ROOT} from './config.mjs';
import {cleanLessonText} from '../public/content-format.js';
const seeds=JSON.parse(await readFile(path.join(ROOT,'seed/lessons.json'),'utf8'));
const monthlyExam=JSON.parse(await readFile(path.join(ROOT,'seed/english-monthly-exam.json'),'utf8'));
const oldMonthly=seeds.findIndex(d=>d.id===monthlyExam.id||d.title===monthlyExam.title);
if(oldMonthly>=0)seeds.splice(oldMonthly,1,monthlyExam);else seeds.push(monthlyExam);
const selectedPapers=JSON.parse(await readFile(path.join(ROOT,'seed/selected-papers.json'),'utf8'));
for(const doc of selectedPapers){if(seeds.some(d=>d.id===doc.id))throw new Error('精选真题ID重复：'+doc.id);seeds.push(doc);}
export const builtins=new Map(seeds.map(d=>[d.id,d]));
let sqlPromise,localQueue=Promise.resolve(),usageQueue=Promise.resolve(),studyQueue=Promise.resolve(),classQueue=Promise.resolve();
export class Conflict extends Error {constructor(){super('资料已在其他设备更新，请刷新后重试。');this.status=409;}}
async function sql(){if(!sqlPromise)sqlPromise=(async()=>{const {neon}=await import('@neondatabase/serverless');const query=neon(process.env.DATABASE_URL);await query`CREATE TABLE IF NOT EXISTS classroom_lessons (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data JSONB NOT NULL)`;await query`CREATE TABLE IF NOT EXISTS classroom_usage (id TEXT PRIMARY KEY, last_used_at TEXT NOT NULL)`;await query`CREATE TABLE IF NOT EXISTS classroom_study_sessions (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, sequence INTEGER NOT NULL, data JSONB NOT NULL)`;await query`CREATE TABLE IF NOT EXISTS classroom_classes (id TEXT PRIMARY KEY, data JSONB NOT NULL)`;return query;})();return sqlPromise;}
function checkStorage(){if(CLOUD&&!process.env.DATABASE_URL)throw Object.assign(new Error('云端尚未配置 DATABASE_URL，不能可靠保存资料。'),{status:503});}
function valid(id){if(!/^[a-zA-Z0-9_-]{1,90}$/.test(id))throw Object.assign(new Error('无效资料编号。'),{status:400});return id;}
export function metadata(d){return {id:d.id,title:d.title,topic:d.topic,status:d.status,sourceType:d.sourceType,createdAt:d.createdAt,updatedAt:d.updatedAt,version:d.version,count:d.questions.length,pending:d.questions.filter(q=>q.invalid).length,images:d.images?.length||0,error:d.error||'',deletedAt:d.deletedAt||null};}
async function localUsage(){try{return JSON.parse(await readFile(path.join(DATA,'usage.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
export async function recordUsage(id){valid(id);checkStorage();const usedAt=new Date().toISOString();if(process.env.DATABASE_URL){const q=await sql();await q`INSERT INTO classroom_usage(id,last_used_at) VALUES (${id},${usedAt}) ON CONFLICT(id) DO UPDATE SET last_used_at=GREATEST(classroom_usage.last_used_at,EXCLUDED.last_used_at)`;return usedAt;}const operation=usageQueue.then(async()=>{await mkdir(DATA,{recursive:true,mode:0o700});const usage=await localUsage();usage[id]=usedAt;const temp=path.join(DATA,'usage.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(usage),{mode:0o600});await rename(temp,path.join(DATA,'usage.json'));return usedAt;});usageQueue=operation.catch(()=>{});return operation;}
export async function listLessons(){checkStorage();let custom=[],usage={};if(process.env.DATABASE_URL){const q=await sql();const [docs,recent]=await Promise.all([q`SELECT data FROM classroom_lessons`,q`SELECT id,last_used_at FROM classroom_usage`]);custom=docs.map(r=>r.data);usage=Object.fromEntries(recent.map(r=>[r.id,r.last_used_at]));}else{await mkdir(path.join(DATA,'lessons'),{recursive:true,mode:0o700});const names=await readdir(path.join(DATA,'lessons'));[custom,usage]=await Promise.all([Promise.all(names.filter(n=>n.endsWith('.json')).map(n=>readFile(path.join(DATA,'lessons',n),'utf8').then(JSON.parse))),localUsage()]);}const markers=new Map(custom.filter(d=>d.sourceType==='builtin-trash-marker').map(d=>[d.builtinId,d]));return [...seeds.map(d=>{const m=markers.get(d.id);return {...d,version:m?.version||0,...(m?.status==='trashed'?{status:'trashed',deletedAt:m.deletedAt}:{} )};}),...custom.filter(d=>d.sourceType!=='builtin-trash-marker')].map(d=>({...metadata(d),lastUsedAt:usage[d.id]||null}));}
export async function getLesson(id){valid(id);if(builtins.has(id)){const original=structuredClone(builtins.get(id));const marker=await getLesson('trash__'+id);return {...original,version:marker?.version||0,...(marker?.status==='trashed'?{status:'trashed',deletedAt:marker.deletedAt}:{})};}checkStorage();if(process.env.DATABASE_URL){const q=await sql();return (await q`SELECT data FROM classroom_lessons WHERE id=${id}`)[0]?.data||null;}try{return JSON.parse(await readFile(path.join(DATA,'lessons',id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function saveLesson(doc,expectedVersion=0){
 valid(doc.id);if(builtins.has(doc.id))throw Object.assign(new Error('内置题库需先复制为新资料再编辑。'),{status:400});checkStorage();
 const next={...compactMaterials(doc),version:expectedVersion+1,updatedAt:new Date().toISOString()};
 if(process.env.DATABASE_URL){const q=await sql();let rows;if(expectedVersion===0)rows=await q`INSERT INTO classroom_lessons(id,version,data) VALUES (${doc.id},1,${JSON.stringify(next)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`;else rows=await q`UPDATE classroom_lessons SET version=${next.version},data=${JSON.stringify(next)}::jsonb WHERE id=${doc.id} AND version=${expectedVersion} RETURNING id`;if(!rows.length)throw new Conflict();return next;}
 const operation=localQueue.then(async()=>{await mkdir(path.join(DATA,'lessons'),{recursive:true,mode:0o700});const current=await getLesson(doc.id);if((current?.version||0)!==expectedVersion)throw new Conflict();const file=path.join(DATA,'lessons',doc.id+'.json'),tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,file);return next;});localQueue=operation.catch(()=>{});return operation;
}
// Reuse just-uploaded bytes when the next function invocation reaches this warm instance.
// The private store remains the source of truth; misses always fetch it normally.
const recentImages=new Map();let recentBytes=0;
function rememberImage(key,bytes){const now=Date.now();for(const [k,v] of recentImages){if(v.until<now||recentBytes+bytes.length>16000000){recentImages.delete(k);recentBytes-=v.bytes.length;}}const old=recentImages.get(key);if(old)recentBytes-=old.bytes.length;recentImages.set(key,{bytes:Buffer.from(bytes),until:now+120000});recentBytes+=bytes.length;}
export async function storeImage(bytes,mime,name){
 const id=randomUUID();const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';const key=`classroom/${id}.${ext}`;let storage;
 if(CLOUD||process.env.BLOB_READ_WRITE_TOKEN){if(!process.env.BLOB_READ_WRITE_TOKEN)throw Object.assign(new Error('云端尚未配置私有 BLOB_READ_WRITE_TOKEN。'),{status:503});const {put}=await import('@vercel/blob');const b=await put(key,bytes,{access:'private',contentType:mime,addRandomSuffix:false});storage={kind:'blob',key:b.url};}
 else{await mkdir(path.join(DATA,'images'),{recursive:true,mode:0o700});await writeFile(path.join(DATA,'images',id+'.'+ext),bytes,{mode:0o600});storage={kind:'local',key:id+'.'+ext};}
 rememberImage(storage.key,bytes);
 return {id,name:String(name||'题目照片').slice(0,160),mime,size:bytes.length,storage};
}
export async function readImage(image){const cached=recentImages.get(image.storage.key);if(cached&&cached.until>Date.now())return cached.bytes;if(image.storage.kind==='blob'){const {get}=await import('@vercel/blob');const result=await get(image.storage.key,{access:'private'});if(!result||result.statusCode!==200)throw new Error('原图读取失败。');return Buffer.from(await new Response(result.stream).arrayBuffer());}return readFile(path.join(DATA,'images',path.basename(image.storage.key)));}
export async function storeDocument(file){
 const id=randomUUID(),key=`classroom/documents/${id}.${file.ext}`;let storage;
 if(CLOUD||process.env.BLOB_READ_WRITE_TOKEN){if(!process.env.BLOB_READ_WRITE_TOKEN)throw Object.assign(new Error("尚未配置私有 BLOB_READ_WRITE_TOKEN。"),{status:503});const {put}=await import("@vercel/blob");const result=await put(key,file.bytes,{access:"private",contentType:file.mime,addRandomSuffix:false});storage={kind:"blob",key:result.url};}
 else{await mkdir(path.join(DATA,"images"),{recursive:true,mode:0o700});const name=id+"."+file.ext;await writeFile(path.join(DATA,"images",name),file.bytes,{mode:0o600});storage={kind:"local",key:name};}
 return {id,name:file.name,mime:file.mime,size:file.bytes.length,storage};
}
export function publicLesson(doc){const {recognitionState,materialRepairState,...visible}=doc;doc=cleanLessonText(orderedLesson(visible.sourceType==='builtin'?visible:repairQuestionTypes(visible)));if(materialRepairState)doc.materialRepairProgress={completed:materialRepairState.completed,remaining:materialRepairState.tasks.length};if(recognitionState)doc.recognitionProgress={completed:recognitionState.completed,remaining:recognitionState.tasks.length};return {...doc,documents:(doc.documents||[]).map(({storage,...d})=>({...d,url:`/api/lessons/${doc.id}/documents/${d.id}`})),images:(doc.images||[]).map(({storage,...i})=>({...i,url:!storage&&i.url?.startsWith('/builtin-assets/')?i.url:`/api/lessons/${doc.id}/images/${i.id}`}))};}

export async function setBuiltinTrash(id,trashed,expectedVersion){const markerId='trash__'+id,marker=await getLesson(markerId);if((marker?.version||0)!==expectedVersion)throw new Conflict();await saveLesson({id:markerId,builtinId:id,title:'',topic:'',questions:[],images:[],sourceType:'builtin-trash-marker',status:trashed?'trashed':'restored',deletedAt:trashed?new Date().toISOString():''},expectedVersion);return getLesson(id);}

async function localStudySessions(){try{return JSON.parse(await readFile(path.join(DATA,'study-sessions.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export async function listStudySessions(classId){checkStorage();if(classId!==undefined&&classId!=='')valid(classId);if(process.env.DATABASE_URL){const q=await sql();return (classId===undefined?await q`SELECT data FROM classroom_study_sessions ORDER BY updated_at DESC LIMIT 30`:await q`SELECT data FROM classroom_study_sessions WHERE COALESCE(data->>'classId','')=${classId} ORDER BY updated_at DESC LIMIT 30`).map(r=>r.data);}return (await localStudySessions()).filter(r=>classId===undefined||(r.classId||'')===classId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,30);}
async function localClasses(){try{return JSON.parse(await readFile(path.join(DATA,'classes.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export async function listClasses(){checkStorage();if(process.env.DATABASE_URL){const q=await sql();return (await q`SELECT data FROM classroom_classes ORDER BY data->>'createdAt',id`).map(r=>r.data);}return localClasses();}
export async function createClass(input){
 if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>40)throw Object.assign(new Error('请输入 1～40 字的班级名称。'),{status:400});
 checkStorage();const entry={id:randomUUID(),name:input.name.trim(),createdAt:new Date().toISOString()};
 if(process.env.DATABASE_URL){const q=await sql();await q`INSERT INTO classroom_classes(id,data) VALUES (${entry.id},${JSON.stringify(entry)}::jsonb)`;return entry;}
 const operation=classQueue.then(async()=>{await mkdir(DATA,{recursive:true,mode:0o700});const classes=await localClasses();classes.push(entry);const temp=path.join(DATA,'classes.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(classes),{mode:0o600});await rename(temp,path.join(DATA,'classes.json'));return entry;});classQueue=operation.catch(()=>{});return operation;
}
export async function renameClass(id,input){
 valid(id);if(typeof input?.name!=='string'||!input.name.trim()||input.name.trim().length>40)throw Object.assign(new Error('请输入 1～40 字的班级名称。'),{status:400});checkStorage();
 const name=input.name.trim();
 if(process.env.DATABASE_URL){const q=await sql();const rows=await q`UPDATE classroom_classes SET data=jsonb_set(data,'{name}',${JSON.stringify(name)}::jsonb) WHERE id=${id} RETURNING data`;if(!rows.length)throw Object.assign(new Error('班级不存在。'),{status:404});return rows[0].data;}
 const operation=classQueue.then(async()=>{const classes=await localClasses(),entry=classes.find(c=>c.id===id);if(!entry)throw Object.assign(new Error('班级不存在。'),{status:404});entry.name=name;const temp=path.join(DATA,'classes.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(classes),{mode:0o600});await rename(temp,path.join(DATA,'classes.json'));return entry;});classQueue=operation.catch(()=>{});return operation;
}
export async function recordStudyProgress(doc,input){
 const fail=()=>{throw Object.assign(new Error('学习进度格式不正确，请重新打开课堂。'),{status:400});};
 if(!/^[a-zA-Z0-9_-]{1,90}$/.test(input.sessionId||'')||!Number.isSafeInteger(input.sequence)||input.sequence<1||!Number.isInteger(input.index))fail();
 const classId=input.classId??'';if(typeof classId!=='string'||(classId&&!/^[a-zA-Z0-9_-]{1,90}$/.test(classId)))fail();if(classId&&!(await listClasses()).some(c=>c.id===classId))throw Object.assign(new Error('班级不存在，请返回仪表盘重新选择。'),{status:400});
 const questions=publicLesson(doc).questions;
 if(input.index<0||input.index>=questions.length||!Array.isArray(input.visited)||input.visited.length>questions.length||input.visited.some(i=>!Number.isInteger(i)||i<0||i>=questions.length))fail();
 const now=new Date().toISOString(),snapshot=i=>({index:i,label:String(questions[i].label),stem:String(questions[i].stem||'').slice(0,240),section:String(questions[i].section||'')});
 const next={id:input.sessionId,classId,lessonId:doc.id,title:doc.title,topic:doc.topic,startedAt:now,updatedAt:now,sequence:input.sequence,total:questions.length,lastQuestion:snapshot(input.index),visited:[...new Set([...input.visited,input.index])].map(snapshot)};
 checkStorage();
 if(process.env.DATABASE_URL){const q=await sql();const rows=await q`INSERT INTO classroom_study_sessions(id,updated_at,sequence,data) VALUES (${next.id},${now},${next.sequence},${JSON.stringify(next)}::jsonb) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at,sequence=EXCLUDED.sequence,data=jsonb_set(EXCLUDED.data,'{startedAt}',classroom_study_sessions.data->'startedAt') WHERE classroom_study_sessions.sequence<EXCLUDED.sequence AND classroom_study_sessions.data->>'lessonId'=EXCLUDED.data->>'lessonId' AND COALESCE(classroom_study_sessions.data->>'classId','')=COALESCE(EXCLUDED.data->>'classId','') RETURNING data`;return rows[0]?.data||null;}
 const operation=studyQueue.then(async()=>{await mkdir(DATA,{recursive:true,mode:0o700});const sessions=await localStudySessions(),old=sessions.find(s=>s.id===next.id);if(old&&(old.lessonId!==doc.id||(old.classId||'')!==classId||old.sequence>=next.sequence))return old;next.startedAt=old?.startedAt||now;const all=[next,...sessions.filter(s=>s.id!==next.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter((r,i,all)=>all.slice(0,i).filter(previous=>(previous.classId||'')===(r.classId||'')).length<100);const temp=path.join(DATA,'study-sessions.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(all),{mode:0o600});await rename(temp,path.join(DATA,'study-sessions.json'));return next;});studyQueue=operation.catch(()=>{});return operation;
}
