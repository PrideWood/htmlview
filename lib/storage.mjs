import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {DATA,CLOUD,ROOT} from './config.mjs';
import {cleanLessonText} from '../public/content-format.js';
const seeds=JSON.parse(await readFile(path.join(ROOT,'seed/lessons.json'),'utf8'));
export const builtins=new Map(seeds.map(d=>[d.id,d]));
let sqlPromise,localQueue=Promise.resolve(),usageQueue=Promise.resolve();
export class Conflict extends Error {constructor(){super('资料已在其他设备更新，请刷新后重试。');this.status=409;}}
async function sql(){if(!sqlPromise)sqlPromise=(async()=>{const {neon}=await import('@neondatabase/serverless');const query=neon(process.env.DATABASE_URL);await query`CREATE TABLE IF NOT EXISTS classroom_lessons (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data JSONB NOT NULL)`;await query`CREATE TABLE IF NOT EXISTS classroom_usage (id TEXT PRIMARY KEY, last_used_at TEXT NOT NULL)`;return query;})();return sqlPromise;}
function checkStorage(){if(CLOUD&&!process.env.DATABASE_URL)throw Object.assign(new Error('云端尚未配置 DATABASE_URL，不能可靠保存资料。'),{status:503});}
function valid(id){if(!/^[a-zA-Z0-9_-]{1,90}$/.test(id))throw Object.assign(new Error('无效资料编号。'),{status:400});return id;}
export function metadata(d){return {id:d.id,title:d.title,topic:d.topic,status:d.status,sourceType:d.sourceType,createdAt:d.createdAt,updatedAt:d.updatedAt,version:d.version,count:d.questions.length,pending:d.questions.filter(q=>q.invalid).length,images:d.images?.length||0,error:d.error||''};}
async function localUsage(){try{return JSON.parse(await readFile(path.join(DATA,'usage.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
export async function recordUsage(id){valid(id);checkStorage();const usedAt=new Date().toISOString();if(process.env.DATABASE_URL){const q=await sql();await q`INSERT INTO classroom_usage(id,last_used_at) VALUES (${id},${usedAt}) ON CONFLICT(id) DO UPDATE SET last_used_at=GREATEST(classroom_usage.last_used_at,EXCLUDED.last_used_at)`;return usedAt;}const operation=usageQueue.then(async()=>{await mkdir(DATA,{recursive:true,mode:0o700});const usage=await localUsage();usage[id]=usedAt;const temp=path.join(DATA,'usage.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(usage),{mode:0o600});await rename(temp,path.join(DATA,'usage.json'));return usedAt;});usageQueue=operation.catch(()=>{});return operation;}
export async function listLessons(){checkStorage();let custom=[],usage={};if(process.env.DATABASE_URL){const q=await sql();const [docs,recent]=await Promise.all([q`SELECT data FROM classroom_lessons`,q`SELECT id,last_used_at FROM classroom_usage`]);custom=docs.map(r=>r.data);usage=Object.fromEntries(recent.map(r=>[r.id,r.last_used_at]));}else{await mkdir(path.join(DATA,'lessons'),{recursive:true,mode:0o700});const names=await readdir(path.join(DATA,'lessons'));[custom,usage]=await Promise.all([Promise.all(names.filter(n=>n.endsWith('.json')).map(n=>readFile(path.join(DATA,'lessons',n),'utf8').then(JSON.parse))),localUsage()]);}return [...seeds,...custom].map(d=>({...metadata(d),lastUsedAt:usage[d.id]||null}));}
export async function getLesson(id){valid(id);if(builtins.has(id))return structuredClone(builtins.get(id));checkStorage();if(process.env.DATABASE_URL){const q=await sql();return (await q`SELECT data FROM classroom_lessons WHERE id=${id}`)[0]?.data||null;}try{return JSON.parse(await readFile(path.join(DATA,'lessons',id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function saveLesson(doc,expectedVersion=0){
 valid(doc.id);if(builtins.has(doc.id))throw Object.assign(new Error('内置题库需先复制为新资料再编辑。'),{status:400});checkStorage();
 const next={...doc,version:expectedVersion+1,updatedAt:new Date().toISOString()};
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
export function publicLesson(doc){doc=cleanLessonText(doc);return {...doc,documents:(doc.documents||[]).map(({storage,...d})=>({...d,url:`/api/lessons/${doc.id}/documents/${d.id}`})),images:(doc.images||[]).map(({storage,...i})=>({...i,url:`/api/lessons/${doc.id}/images/${i.id}`}))};}
