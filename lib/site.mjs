import {CLOUD} from './config.mjs';
export const PRODUCTION_APP_URL='https://ppt.dacnote.com';
export const PHONE_PATH='/phone';
// Canonical production URL is fixed, never inferred from forwarded/request hosts.
// APP_URL remains an override for deployments on another domain.
export function appOrigin(req,{cloud=CLOUD}={}){
 const address=process.env.APP_URL?.trim()||(cloud?PRODUCTION_APP_URL:`http://${req?.headers.host||'localhost:8787'}`);
 let url;try{url=new URL(address);}catch{throw Object.assign(new Error('APP_URL 格式无效，请使用完整 HTTPS 网站地址。'),{status:503});}
 if(url.username||url.password||url.protocol!=='https:'&&(cloud||url.protocol!=='http:'))throw Object.assign(new Error('APP_URL 必须使用 HTTPS 网站地址。'),{status:503});
 return url.origin;
}
