const $=id=>document.getElementById(id);
async function request(path,body){const r=await fetch('/api/auth'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'授权失败');return d;}
let generation=0,timer;
export function stopLogin(){generation++;clearTimeout(timer);}
export async function mountLogin(onSuccess){
 stopLogin();const current=generation;const active=()=>current===generation&&Boolean($('login-qr'));
 $('login-qr').hidden=true;$('login-qr').classList.remove('qr-expired');$('login-code').textContent='';$('login-status').textContent='正在生成二维码…';$('login-refresh').disabled=true;
 try{
  const ticket=await request('/requests');if(!active())return;
  $('login-qr').src=ticket.qr;$('login-qr').hidden=false;$('login-code').textContent=ticket.code;$('login-refresh').disabled=false;
  async function poll(){if(!active())return;const left=Math.max(0,Math.ceil((ticket.expiresAt-Date.now())/1000));if(!left){$('login-status').textContent='二维码已过期，请刷新';$('login-qr').classList.add('qr-expired');return;}
   $('login-status').textContent=`等待手机确认 · ${left} 秒后失效`;
   try{const result=await request('/requests/status',{id:ticket.id,secret:ticket.secret});if(!active())return;
    if(result.state==='approved'){$('login-status').textContent='已批准，正在登录…';await request('/requests/claim',{id:ticket.id,secret:ticket.secret});if(!active())return;stopLogin();await onSuccess();return;}
    if(result.state!=='pending'){$('login-status').textContent=result.state==='denied'?'手机已拒绝此请求，请刷新':'授权已结束，请刷新';return;}
    timer=setTimeout(poll,2000);
   }catch(e){if(active())$('login-status').textContent=e.message;}
  }
  timer=setTimeout(poll,250);$('login-refresh').onclick=()=>mountLogin(onSuccess);
 }catch(e){if(active()){$('login-status').textContent=e.message;$('login-refresh').disabled=false;$('login-refresh').onclick=()=>mountLogin(onSuccess);}}
}
