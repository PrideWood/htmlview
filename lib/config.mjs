import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const DATA=process.env.DATA_DIR||path.join(ROOT,'data');
export const CLOUD=Boolean(process.env.VERCEL);
let boot;
export async function config(){
 if(!boot)boot=(async()=>{
  if(CLOUD)return {};
  await mkdir(DATA,{recursive:true,mode:0o700});
  try{return JSON.parse(await readFile(path.join(DATA,'config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const c={accessCode:randomBytes(6).toString('hex'),sessionSecret:randomBytes(32).toString('hex')};await writeFile(path.join(DATA,'config.json'),JSON.stringify(c,null,2),{mode:0o600});return c;
 })();
 const local=await boot;
 return {...local,baseUrl:process.env.MODEL_BASE_URL||local.baseUrl||'',apiKey:process.env.MODEL_API_KEY||local.apiKey||'',model:process.env.MODEL_ID||local.model||'',apiMode:process.env.MODEL_API_MODE||local.apiMode||'chat',jsonMode:process.env.MODEL_JSON_MODE?process.env.MODEL_JSON_MODE==='true':Boolean(local.jsonMode),accessCode:process.env.CLASSROOM_ACCESS_CODE||local.accessCode||'',sessionSecret:process.env.SESSION_SECRET||local.sessionSecret||''};
}
export function verifyEndpoint(input){
 let u;try{u=new URL(input);}catch{throw new Error('请输入完整的模型 API 基础地址。');}
 const test=process.env.ALLOW_LOCAL_MODEL_HTTP==='1'&&['127.0.0.1','localhost'].includes(u.hostname);
 if(u.protocol!=='https:'&&!test)throw new Error('模型地址必须使用 HTTPS。');
 if(u.username||u.password||u.search||u.hash)throw new Error('模型基础地址不能包含账号、查询参数或片段。');
 return u.toString().replace(/\/$/,'');
}
export async function saveConfig(values){
 if(CLOUD)throw new Error('云端请通过 Vercel 环境变量修改配置。');
 const current=await config();const local=await boot;
 if(typeof values.baseUrl!=='string'||typeof values.model!=='string'||!values.model.trim())throw new Error('请填写基础地址和视觉模型名称。');
 const next={...local,baseUrl:verifyEndpoint(values.baseUrl),model:values.model.trim(),apiMode:values.apiMode==='responses'?'responses':'chat',jsonMode:Boolean(values.jsonMode)};
 if(values.apiKey?.trim())next.apiKey=values.apiKey.trim();
 if(!next.apiKey&&!current.apiKey)throw new Error('请填写模型服务的 API Key。');
 if(values.accessCode!==undefined){if(!/^[A-Za-z0-9_-]{8,64}$/.test(values.accessCode))throw new Error('访问码需为8—64位字母、数字、下划线或短横线。');next.accessCode=values.accessCode;}
 const tmp=path.join(DATA,'config.json');await writeFile(tmp,JSON.stringify(next,null,2),{mode:0o600});await chmod(tmp,0o600);boot=Promise.resolve(next);return config();
}
export function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function localRequest(req){return !CLOUD&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)&&/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host||'');}
export async function authenticated(req){
 if(localRequest(req))return true;
 const c=await config();if(c.accessCode.length<8||c.sessionSecret.length<32)return false;
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('classroom_session='))?.split('=')[1]||'';
 const [expires,sig]=cookie.split('.');return Number(expires)>Date.now()&&safeEqual(sig||'',createHmac('sha256',c.sessionSecret).update(expires+':'+c.accessCode).digest('hex'));
}
export async function sessionCookie(req){const c=await config();const exp=String(Date.now()+30*86400000);const sig=createHmac('sha256',c.sessionSecret).update(exp+':'+c.accessCode).digest('hex');const secure=CLOUD||req.headers['x-forwarded-proto']==='https:';return `classroom_session=${exp}.${sig}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure?'; Secure':''}`;}
