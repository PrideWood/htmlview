import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {DATA,CLOUD} from './config.mjs';
let database,queue=Promise.resolve();
const empty=()=>({phone:null,pairings:[],requests:[],sessions:[],throttles:[]});
async function sql(){if(!database)database=(async()=>{const {neon}=await import('@neondatabase/serverless');const q=neon(process.env.DATABASE_URL);await q`CREATE TABLE IF NOT EXISTS classroom_auth (id INTEGER PRIMARY KEY,version INTEGER NOT NULL,data JSONB NOT NULL)`;await q`INSERT INTO classroom_auth(id,version,data) VALUES(1,0,${JSON.stringify(empty())}::jsonb) ON CONFLICT DO NOTHING`;return q;})();return database;}
async function load(){if(CLOUD&&!process.env.DATABASE_URL)throw Object.assign(new Error('请先配置 DATABASE_URL。'),{status:503});if(process.env.DATABASE_URL){const q=await sql();return (await q`SELECT version,data FROM classroom_auth WHERE id=1`)[0];}try{return JSON.parse(await readFile(path.join(DATA,'auth.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {version:0,data:empty()};}}
export async function readAuth(){return (await load()).data;}
// Every mutation retries against the latest version. Single-use approvals and phone replacement
// are atomic across serverless instances; local writes use the same serialized operation.
export async function updateAuth(mutate){
 if(process.env.DATABASE_URL){const q=await sql();for(let n=0;n<20;n++){const {version,data}=await load();const result=mutate(data);const rows=await q`UPDATE classroom_auth SET version=${version+1},data=${JSON.stringify(data)}::jsonb WHERE id=1 AND version=${version} RETURNING id`;if(rows.length)return result;}throw Object.assign(new Error('授权请求繁忙，请重试。'),{status:409});}
 const operation=queue.then(async()=>{const {version,data}=await load(),result=mutate(data);await mkdir(DATA,{recursive:true,mode:0o700});const temp=path.join(DATA,'auth.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify({version:version+1,data}),{mode:0o600});await rename(temp,path.join(DATA,'auth.json'));return result;});queue=operation.catch(()=>{});return operation;
}
