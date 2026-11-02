import {randomBytes,randomUUID,randomInt,createHash} from 'node:crypto';
import QRCode from 'qrcode';
import {readAuth,updateAuth} from './auth-store.mjs';
import {CLOUD} from './config.mjs';
export const hash=value=>createHash('sha256').update(value||'').digest('hex');
const token=()=>randomBytes(32).toString('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
export function authCookie(req,name,value,seconds){return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${CLOUD||req.headers['x-forwarded-proto']==='https:'?'; Secure':''}`;}
function validToken(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail(400,'授权凭证无效，请重新扫码。');return value;}
function trusted(state,req){const p=state.phone;return p&&p.expires>Date.now()&&p.hash===hash(cookie(req,'classroom_phone'))?p:null;}
export async function isPhone(req){return Boolean(trusted(await readAuth(),req));}
export async function isAuthenticated(req){const state=await readAuth();if(trusted(state,req))return true;const h=hash(cookie(req,'classroom_session'));return state.sessions.some(s=>s.hash===h&&s.expires>Date.now());}
function prune(s){const now=Date.now();s.requests=s.requests.filter(t=>t.expires>now);s.pairings=s.pairings.filter(t=>t.expires>now);s.sessions=s.sessions.filter(t=>t.expires>now);s.throttles=s.throttles.filter(t=>t.until>now);}
function throttle(s,req,action,max){const ip=CLOUD?String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'remote').split(',')[0]:req.socket?.remoteAddress||'local',key=hash(action+':'+ip);let t=s.throttles.find(x=>x.key===key);if(!t){t={key,count:0,until:Date.now()+600000};s.throttles.push(t);}if(++t.count>max)fail(429,'请求过于频繁，请10分钟后再试。');}
function origin(req){let url;try{url=new URL(process.env.APP_URL||(!CLOUD?`http://${req.headers.host}`:''));}catch{fail(503,'请在服务端配置 APP_URL 为网站的完整 HTTPS 地址。');}if(url.protocol!=='https:'&&(CLOUD||url.protocol!=='http:'))fail(503,'APP_URL 必须使用 HTTPS。');return url.origin;}
export async function createPairing(){const value=token(),expires=Date.now()+600000;await updateAuth(s=>{prune(s);s.pairings=[{hash:hash(value),expires}];});return {token:value,expires};}
export async function revokePhone(){await updateAuth(s=>{s.phone=null;s.sessions=[];s.requests=[];s.pairings=[];});}
export async function logout(req){await updateAuth(s=>{s.sessions=s.sessions.filter(x=>x.hash!==hash(cookie(req,'classroom_session')));});}
export async function phoneRoute(pathname,req,input={}){
 if(pathname==='/api/auth/phone/status'&&req.method==='GET'){const s=await readAuth();return {data:{trusted:Boolean(trusted(s,req)),expiresAt:trusted(s,req)?.expires||null}};}
 if(req.method!=='POST')fail(405,'不支持此操作。');
 if(pathname==='/api/auth/phone/pair'){
  const value=validToken(input.token),credential=token();
  await updateAuth(s=>{prune(s);throttle(s,req,'pair',10);if(!s.pairings.some(p=>p.hash===hash(value)))fail(410,'绑定二维码已失效，请在可信电脑重新生成。');s.phone={hash:hash(credential),expires:Date.now()+180*86400000};s.pairings=[];s.requests=[];s.sessions=[];});
  return {data:{trusted:true},cookie:authCookie(req,'classroom_phone',credential,180*86400)};
 }
 if(pathname==='/api/auth/requests'){
  const browser=cookie(req,'classroom_browser')||token(),scan=token(),secret=token(),id=randomUUID(),code=String(randomInt(100000,1000000)),expires=Date.now()+180000;
  const url=origin(req)+'/phone.html#request='+scan;
  const agent=String(req.headers['user-agent']||'');const device=/Windows/i.test(agent)?'Windows 电脑':/Macintosh/i.test(agent)?'Mac 电脑':/iPhone|iPad/i.test(agent)?'iPhone / iPad':/Android/i.test(agent)?'Android 设备':'浏览器';
  await updateAuth(s=>{prune(s);throttle(s,req,'create',20);if(!s.phone||s.phone.expires<Date.now())fail(503,'尚未绑定手机，请先在可信电脑运行 npm run phone:pair。');s.requests.push({id,scan:hash(scan),secret:hash(secret),browser:hash(browser),code,expires,device,state:'pending'});});
  return {data:{id,secret,code,expiresAt:expires,qr:await QRCode.toDataURL(url,{width:256,margin:2,errorCorrectionLevel:'M'})},cookie:authCookie(req,'classroom_browser',browser,86400)};
 }
 if(pathname==='/api/auth/requests/status'||pathname==='/api/auth/requests/claim'){
  const secret=validToken(input.secret);let credential;
  const result=await updateAuth(s=>{prune(s);const t=s.requests.find(t=>t.id===input.id&&t.secret===hash(secret)&&t.browser===hash(cookie(req,'classroom_browser')));if(!t)fail(410,'二维码已过期或不属于此浏览器，请刷新。');
   if(pathname.endsWith('/status'))return {state:t.state};
   if(t.state!=='approved')fail(403,'授权尚未批准或已被使用。');t.state='consumed';credential=token();s.sessions.push({hash:hash(credential),expires:Date.now()+12*3600000});return {ok:true};
  });return {data:result,...(credential?{cookie:authCookie(req,'classroom_session',credential,12*3600)}:{})};
 }
 if(pathname==='/api/auth/phone/request'||pathname==='/api/auth/phone/approve'){
  const scan=validToken(input.token);const result=await updateAuth(s=>{prune(s);if(!trusted(s,req))fail(401,'这部手机尚未绑定或绑定已过期，请使用已绑定手机的同一个浏览器。');const t=s.requests.find(t=>t.scan===hash(scan));if(!t)fail(410,'此二维码已过期，请在电脑重新生成。');
   if(pathname.endsWith('/request'))return {code:t.code,device:t.device,state:t.state,expiresAt:t.expires};
   if(t.state!=='pending')fail(409,'此请求已经处理。');if(input.code!==t.code||typeof input.allow!=='boolean')fail(400,'请核对电脑上的六位授权码。');t.state=input.allow?'approved':'denied';return {state:t.state};
  });return {data:result};
 }
 fail(404,'授权接口不存在。');
}
