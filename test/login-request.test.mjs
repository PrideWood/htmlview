import test from 'node:test';
import assert from 'node:assert/strict';
import {loginMode,validPendingTicket,browserApprovalURL} from '../public/login-request.js';
test('iPhone主屏幕应用可请求长期信任，Chrome链接带原授权片段',()=>{
 const mode=loginMode({standalone:true,userAgent:'iPhone Safari'});assert.deepEqual(mode,{standalone:true,mobile:true,ios:true});const url='https://ppt.dacnote.com/phone#request='+'a'.repeat(64);assert.equal(browserApprovalURL(url,mode),'googlechromes://ppt.dacnote.com/phone#request='+'a'.repeat(64));assert.equal(browserApprovalURL(url,{ios:false}),url);assert.equal(loginMode({userAgent:'Windows Chrome'}).mobile,false);
});
test('恢复未完成请求仅接受未过期且合法的授权链接，拒绝外部站点和错误凭证',()=>{
 const t={id:'test-id',secret:'a'.repeat(64),code:'123456',expiresAt:Date.now()+180000,url:'https://ppt.dacnote.com/phone#request='+'b'.repeat(64),qr:'data:image/png;base64,abc'};
 assert.equal(validPendingTicket(t,'https://ppt.dacnote.com'),true);assert.equal(validPendingTicket({...t,expiresAt:Date.now()-1},'https://ppt.dacnote.com'),false);assert.equal(validPendingTicket({...t,url:'https://evil.example/phone#request='+'b'.repeat(64)},'https://ppt.dacnote.com'),false);assert.equal(validPendingTicket({...t,secret:'bad'},'https://ppt.dacnote.com'),false);assert.equal(validPendingTicket(null,'https://ppt.dacnote.com'),false);
});
