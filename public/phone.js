const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.hash.slice(1)),pair=params.get('pair'),scan=params.get('request');
// The token stays in memory after loading; it is never sent in a query string or referrer.
history.replaceState(null,'',location.pathname);
async function api(path,body){const r=await fetch('/api/auth/phone'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'授权失败');return d;}
function status(text){$('phone-status').textContent=text;}
let expiry;
function done(text){clearInterval(expiry);status(text);$('phone-actions').innerHTML='<a class="primary auth-link" href="/">打开手机上传</a>';}
async function start(){
 if(pair){status('仅绑定你自己的手机；继续后将替换旧手机并退出所有电脑。');$('phone-actions').innerHTML='<button id="pair-phone" class="primary">绑定这部手机</button>';$('pair-phone').onclick=async()=>{const b=$('pair-phone');b.disabled=true;try{await api('/pair',{token:pair});done('手机已绑定，以后可用这部手机扫码授权电脑登录');}catch(e){status(e.message);b.disabled=false;}};return;}
 const state=await api('/status');if(!state.trusted){status('这部手机尚未绑定。请在可信电脑生成绑定二维码，并用手机的同一个浏览器打开。');return;}
 if(!scan){done('这部手机已绑定，可扫码授权电脑登录');return;}
 const ticket=await api('/request',{token:scan});if(ticket.state!=='pending'){status('此授权请求已经处理，请在电脑重新生成二维码');return;}
 status(ticket.trustRequested?'核对主屏幕应用的授权码，确认是你自己的应用':'核对电脑显示的授权码，确认是你正在使用的设备');
 $('phone-actions').innerHTML=`<div class="auth-code">${esc(ticket.code)}</div><p>${esc(ticket.device)}</p><label class="check auth-confirm"><input id="confirm-code" type="checkbox">我已核对电脑上的授权码</label>${ticket.trustRequested?'<label class="check auth-confirm"><input id="trust-app" type="checkbox">信任此应用180天，免重复登录</label>':''}<div class="auth-actions"><button class="primary" id="allow-login" disabled>允许登录</button><button id="deny-login">拒绝</button></div>`;
 const allow=$('allow-login'),deny=$('deny-login');$('confirm-code').onchange=e=>allow.disabled=!e.target.checked;
 async function approve(value){allow.disabled=true;deny.disabled=true;try{await api('/approve',{token:scan,code:ticket.code,allow:value,trustApp:$('trust-app')?.checked===true});done(value?(ticket.trustRequested?'已允许，请切回原来的主屏幕应用继续':'已允许登录，请回到电脑继续'):'已拒绝此请求');}catch(e){status(e.message);}}
 allow.onclick=()=>approve(true);deny.onclick=()=>approve(false);
 expiry=setInterval(()=>{if(Date.now()>=ticket.expiresAt){clearInterval(expiry);if($('allow-login')){allow.disabled=true;deny.disabled=true;status('二维码已过期，请在电脑重新生成');}}},1000);
}
start().catch(e=>status(e.message));
