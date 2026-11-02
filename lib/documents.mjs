import mammoth from 'mammoth';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {inflateRawSync} from 'node:zlib';
import {ValidationError} from './lesson.mjs';
export const DOCUMENT_LIMIT=2*1024*1024;
// Check ZIP directory sizes before the Word parser inflates any XML or embedded files.
export function inspectDocx(bytes){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new ValidationError('Word 文件损坏，请重新另存为 .docx。');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);let cursor=offset,total=0,document=false;
 if(!count||count>1000||offset>=end)throw new ValidationError('Word 文件结构过大或不受支持。');
 for(let n=0;n<count;n++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw new ValidationError('Word 文件目录无效。');
  const size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32);
  total+=size;if(total>20*1024*1024||size>8*1024*1024)throw new ValidationError('Word 解压内容过大，请拆分文档。');
  const local=bytes.readUInt32LE(cursor+42),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20);
  if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||![0,8].includes(method))throw new ValidationError('Word 压缩格式不受支持。');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+compressed>offset)throw new ValidationError('Word 压缩数据无效。');
  try{const chunk=bytes.subarray(start,start+compressed),decoded=method===8?inflateRawSync(chunk,{maxOutputLength:8*1024*1024}):chunk;if(decoded.length!==size)throw new Error();}catch{throw new ValidationError('Word 压缩内容无效或超过大小限制。');}
  const name=bytes.toString('utf8',cursor+46,cursor+46+nameLength);if(name==='word/document.xml')document=true;
  if(bytes.readUInt16LE(cursor+8)&1)throw new ValidationError('不支持加密 Word 文档。');cursor+=46+nameLength+extra+comment;
 }
 if(!document)throw new ValidationError('这不是有效的 .docx 文档。');
}
// A malformed OLE allocation chain must not block the HTTP process indefinitely.
async function extractLegacyWord(bytes){
 // A literal import lets Vercel trace the parser and its transitive dependencies.
 // Keep parser loading inside this feature so its failures cannot break session/login APIs.
 await import('word-extractor');
 const legacyParserPath=createRequire(import.meta.url).resolve('word-extractor');
 return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./doc-worker.mjs',import.meta.url),{workerData:{bytes,parserPath:legacyParserPath},resourceLimits:{maxOldGenerationSizeMb:64}});
 const timer=setTimeout(()=>{worker.terminate();reject(new Error('DOC parsing timed out'));},10000);
 const finish=(error,value)=>{clearTimeout(timer);worker.terminate();if(error)reject(error);else resolve(value);};
 worker.once('message',result=>finish(result.error?new Error('Invalid DOC'):null,result.text));
 worker.once('error',error=>finish(error));
 worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error('DOC parser stopped'));});
});}
export async function extractDocument(input){
 const name=String(input?.name||'').replace(/[\\/\x00-\x1f]/g,'_').slice(0,160),ext=name.split('.').pop().toLowerCase();
 if(!['doc','docx','md','markdown','txt'].includes(ext))throw new ValidationError('支持 .doc、.docx、.md、.txt 文档。');
 if(typeof input.base64!=='string'||input.base64.length>Math.ceil(DOCUMENT_LIMIT/3)*4||! /^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw new ValidationError('文档需小于2MB，且内容编码有效。');
 const bytes=Buffer.from(input.base64,'base64');if(!bytes.length||bytes.length>DOCUMENT_LIMIT)throw new ValidationError('文档为空或超过2MB。');
 let text,mime;
 if(ext==='doc'){
  if(!bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))throw new ValidationError('这不是有效的 DOC 文档，请用 Word 另存为 DOC 或 DOCX。');
  try{text=await extractLegacyWord(bytes);}catch{throw new ValidationError('无法读取 DOC 文档，文件可能损坏或已加密，请另存为未加密的 DOC/DOCX。');}
  mime='application/msword';
 }else if(ext==='docx'){
  inspectDocx(bytes);try{text=(await mammoth.extractRawText({buffer:bytes})).value;}catch{throw new ValidationError('无法读取 Word 文档，请重新另存为 .docx。');}
  mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 }else{
  try{const utf16=bytes[0]===255&&bytes[1]===254;text=new TextDecoder(utf16?'utf-16le':'utf-8',{fatal:true}).decode(bytes);}catch{throw new ValidationError('文本编码无法读取，请另存为 UTF-8 后上传。');}
  if(text.includes('\0'))throw new ValidationError('文件不是有效的文本。');mime=ext==='txt'?'text/plain':'text/markdown';
 }
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 if(!text)throw new ValidationError('文档没有可提取的文字；扫描图片请通过照片上传。');
 if(text.length>100000)throw new ValidationError('文档文字超过10万字，请按章节拆分。');
 return {name,ext,mime,bytes,text};
}
