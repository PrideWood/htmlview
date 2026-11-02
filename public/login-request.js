export const pendingKey='classroom-pending-login';
export function loginMode({standalone=false,userAgent=''}){const ios=/iPhone|iPad|iPod/i.test(userAgent);return {standalone,mobile:standalone||ios||/Android/i.test(userAgent),ios};}
export function validPendingTicket(t,origin,now=Date.now()){
 try{const u=new URL(t.url);return typeof t.id==='string'&&/^[a-f0-9]{64}$/.test(t.secret)&&/^\d{6}$/.test(t.code)&&t.expiresAt>now&&t.expiresAt<=now+300000&&[origin,'https://ppt.dacnote.com'].includes(u.origin)&&u.pathname==='/phone'&&/^#request=[a-f0-9]{64}$/.test(u.hash)&&typeof t.qr==='string'&&t.qr.startsWith('data:image/png;base64,');}catch{return false;}
}
export function browserApprovalURL(url,{ios=false}={}){return ios?url.replace(/^https:/,'googlechromes:').replace(/^http:/,'googlechrome:'):url;}
