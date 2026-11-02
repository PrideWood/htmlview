import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {appOrigin,PHONE_PATH} from '../lib/site.mjs';
test('生产环境缺少 APP_URL 时使用 ppt.dacnote.com，忽略请求主机',()=>{
 const previous=process.env.APP_URL;try{delete process.env.APP_URL;assert.equal(appOrigin({headers:{host:'attacker.example'}},{cloud:true}),'https://ppt.dacnote.com');assert.equal(PHONE_PATH,'/phone');assert.equal(appOrigin({headers:{host:'192.168.1.10:8787'}},{cloud:false}),'http://192.168.1.10:8787');}finally{if(previous===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous;}
});
test('显式 APP_URL 可覆盖，只取网站 origin；云端拒绝 HTTP 和内嵌凭证',()=>{
 const previous=process.env.APP_URL;try{process.env.APP_URL='https://ppt.dacnote.com/phone';assert.equal(appOrigin(null,{cloud:true})+PHONE_PATH,'https://ppt.dacnote.com/phone');for(const value of ['http://ppt.dacnote.com','https://user:password@ppt.dacnote.com','invalid']){process.env.APP_URL=value;assert.throws(()=>appOrigin(null,{cloud:true}),/APP_URL/);}}finally{if(previous===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous;}
});
test('Vercel /phone 入口路由到已有授权页面，旧页面仍保留',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url)));assert.ok(config.rewrites.some(x=>x.source==='/phone'&&x.destination==='/phone.html'));assert.ok(config.rewrites.some(x=>x.source==='/phone/'&&x.destination==='/phone.html'));assert.match(await readFile(new URL('../public/phone.html',import.meta.url),'utf8'),/src="\/phone.js"/);
});
