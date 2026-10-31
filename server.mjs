import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
// Native env-file loading avoids a dependency and never sends secrets to the frontend.
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const {handler}=await import('./lib/api.mjs');const {config,ROOT}=await import('./lib/config.mjs');await config();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 if(u.pathname.startsWith('/api/'))return handler(req,res);
 try{let name=decodeURIComponent(u.pathname);if(name==='/')name='/index.html';const file=path.resolve(ROOT,'public','.'+name);if(!file.startsWith(path.join(ROOT,'public')+path.sep))throw new Error();if(!(await stat(file)).isFile())throw new Error();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(file));}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('页面不存在');}
});
server.listen(Number(process.env.PORT||8787),process.env.HOST||'0.0.0.0',()=>console.log(`课堂工作台：http://127.0.0.1:${server.address().port}（手机连接入口见页面）`));
