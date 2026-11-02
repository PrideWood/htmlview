import {chmod} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import QRCode from 'qrcode';
// Load the selected private environment file before importing configuration or storage.
const args=process.argv.slice(2),envIndex=args.indexOf('--env-file');
try{process.loadEnvFile(envIndex<0?'.env':args[envIndex+1]);}catch(e){if(e.code!=='ENOENT'||envIndex>=0)throw e;}
const {createPairing,revokePhone}=await import('../lib/phone-auth.mjs');
const {PRODUCTION_APP_URL,PHONE_PATH}=await import('../lib/site.mjs');
if(args.includes('--revoke')){await revokePhone();console.log('已撤销手机绑定、待处理授权及全部电脑会话。');process.exit(0);}
let address=process.env.APP_URL?.trim()||(process.env.DATABASE_URL?PRODUCTION_APP_URL:undefined);
if(!address&&!process.env.DATABASE_URL){const ip=Object.values(networkInterfaces()).flat().find(x=>x&&!x.internal&&x.family==='IPv4')?.address;if(ip)address=`http://${ip}:${process.env.PORT||8787}`;}
if(!address)throw new Error('请在私有环境文件中设置 APP_URL 为讲练网站地址。');
const origin=new URL(address);if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password)throw new Error('APP_URL 格式无效。');
if(process.env.DATABASE_URL&&origin.protocol!=='https:')throw new Error('云端绑定请使用 HTTPS 网站地址。');
const {token}=await createPairing(),url=origin.origin+PHONE_PATH+'#pair='+token;
const fileIndex=args.indexOf('--qr-file');
if(fileIndex>=0){const file=args[fileIndex+1];if(!file)throw new Error('--qr-file 后需指定文件路径。');await QRCode.toFile(file,url,{width:480,margin:3,errorCorrectionLevel:'M'});await chmod(file,0o600);console.log('一次性绑定二维码已写入指定文件，10分钟内有效。');}
else console.log(await QRCode.toString(url,{type:'terminal',small:true}));
console.log('仅用你自己的手机扫描，并点击“绑定这部手机”。绑定成功将替换旧手机并退出全部电脑。二维码10分钟有效，只能使用一次；不要分享二维码。');
