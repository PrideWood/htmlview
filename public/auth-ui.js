import {pendingKey,loginMode,validPendingTicket,browserApprovalURL} from './login-request.js';
const $=id=>document.getElementById(id);
async function request(path,body){const r=await fetch('/api/auth'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'授权失败');return d;}
let generation=0,timer,resumePoll;
function forget(){try{localStorage.removeItem(pendingKey);}catch{}}
function cached(){try{const t=JSON.parse(localStorage.getItem(pendingKey));if(validPendingTicket(t,location.origin))return t;}catch{}forget();return null;}
export function stopLogin(){generation++;clearTimeout(timer);resumePoll=null;}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumePoll?.();});
export async function mountLogin(onSuccess,{refresh=false}={}){
 stopLogin();if(refresh)forget();const current=generation;const active=()=>current===generation&&Boolean($('login-qr'));
 const mode=loginMode({standalone:navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches===true,userAgent:navigator.userAgent});
 $('login-qr').hidden=true;$('login-qr').classList.remove('qr-expired');$('login-code').textContent='';$('login-status').textContent='正在生成授权请求…';$('login-refresh').disabled=true;$('login-browser-actions').hidden=true;
 const refreshLogin=()=>mountLogin(onSuccess,{refresh:true});$('login-refresh').onclick=refreshLogin;
 try{
  const ticket=cached()||await request('/requests',{trustApp:mode.standalone});if(!active())return;
  try{localStorage.setItem(pendingKey,JSON.stringify(ticket));}catch{}
  $('login-qr').src=ticket.qr;$('login-qr').hidden=mode.mobile;$('login-code').textContent=ticket.code;$('login-refresh').disabled=false;
  const instruction=document.querySelector('.auth-instruction');if(instruction)instruction.textContent=mode.mobile?'在已绑定浏览器中核对授权码，允许后切回此应用':'用已绑定手机的浏览器扫码，核对授权码后确认';
  if(mode.mobile){$('login-browser-actions').hidden=false;const link=$('login-open-browser');link.href=browserApprovalURL(ticket.url,mode);link.textContent=mode.ios?'在 Chrome 中授权':'在已绑定浏览器中授权';$('login-copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(ticket.url);$('login-status').textContent='已复制，请粘贴到已绑定的浏览器中打开';}catch{$('login-status').textContent='请手动复制下方链接，在已绑定浏览器中打开';let field=$('login-link-fallback');if(!field){field=document.createElement('input');field.id='login-link-fallback';field.readOnly=true;field.setAttribute('aria-label','授权链接');$('login-browser-actions').append(field);}field.value=ticket.url;field.focus();field.select();}};}
  let polling=false;
  function end(text){forget();resumePoll=null;$('login-status').textContent=text;$('login-browser-actions').hidden=true;$('login-qr').classList.add('qr-expired');}
  async function poll(){if(!active()||polling)return;clearTimeout(timer);const left=Math.max(0,Math.ceil((ticket.expiresAt-Date.now())/1000));if(!left){end('授权请求已过期，请刷新');return;}
   polling=true;$('login-status').textContent=`等待手机确认 · ${left} 秒后失效`;
   try{const result=await request('/requests/status',{id:ticket.id,secret:ticket.secret});if(!active())return;
    if(result.state==='approved'){$('login-status').textContent='已批准，正在登录…';await request('/requests/claim',{id:ticket.id,secret:ticket.secret});if(!active())return;forget();stopLogin();await onSuccess();return;}
    if(result.state!=='pending'){end(result.state==='denied'?'手机已拒绝此请求，请刷新':'授权已结束，请刷新');return;}
    timer=setTimeout(poll,2000);
   }catch(e){if(active())end(e.message);}finally{polling=false;}
  }
  resumePoll=()=>void poll();timer=setTimeout(poll,250);
 }catch(e){if(active()){$('login-status').textContent=e.message;$('login-refresh').disabled=false;}}
}
