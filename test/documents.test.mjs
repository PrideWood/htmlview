import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';
import {extractDocument} from '../lib/documents.mjs';
const input=(name,text)=>({name,base64:Buffer.from(text).toString('base64')});
test('Markdown/TXT 按原顺序提取，保留题号与空格',async()=>{
 const text='# 阅读\r\n1. A ____ B\r\n2. C';const result=await extractDocument(input('test.md',text));assert.equal(result.text,'# 阅读\n1. A ____ B\n2. C');assert.equal(result.mime,'text/markdown');assert.deepEqual(result.bytes,Buffer.from(text));
 const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from('英语练习','utf16le')]);assert.equal((await extractDocument({name:'test.txt',base64:utf16.toString('base64')})).text,'英语练习');
});
test('Word 提取段落、表格内文字，不执行文档中的内容',async()=>{
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1. Is she ill?</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A. No</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});const result=await extractDocument({name:'questions.docx',base64:bytes.toString('base64')});assert.match(result.text,/1\. Is she ill\?[\s\S]*A\. No/);
});
test('拒绝伪造 DOC、空文档、伪造 ZIP、超长文本和 ZIP 膨胀',async()=>{
 for(const value of [input('a.doc','x'),input('a.txt',''),input('a.docx','fake'),input('a.txt','a'.repeat(100001)),input('a.txt','a\0b')])await assert.rejects(extractDocument(value));
 const zip=new JSZip();zip.file('word/document.xml','x'.repeat(9*1024*1024));await assert.rejects(extractDocument({name:'bomb.docx',base64:(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})).toString('base64')}),/解压内容过大/);
});

test('真实 OLE DOC 提取中英文题干及选项，原始字节保留',async()=>{
 const bytes=await readFile(new URL('./fixtures/questions.doc',import.meta.url));
 const result=await extractDocument({name:'英语.doc',base64:bytes.toString('base64')});
 assert.equal(result.mime,'application/msword');assert.equal(result.ext,'doc');assert.deepEqual(result.bytes,bytes);
 assert.match(result.text,/英语练习[\s\S]*1\. We have lived here ____ five years\.[\s\S]*A\. for[\s\S]*B\. since[\s\S]*2\. Is she ill/);
});
