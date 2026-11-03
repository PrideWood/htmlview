import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {dashboardHTML,resumeURL} from '../public/dashboard.js';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'classroom-study-'));
const {recordStudyProgress,listStudySessions}=await import('../lib/storage.mjs');
after(()=>rm(process.env.DATA_DIR,{recursive:true,force:true}));
const doc={id:'study-test',title:'课堂 <一>',topic:'语法',sourceType:'builtin',questions:[{label:'1',stem:'Question one'},{label:'2',stem:'Question two'},{label:'3',stem:'Question three'}]};
test('一次课堂合并进度、保留开始时间，乱序请求不会倒退，重复打开另存记录',async()=>{
 const first=await recordStudyProgress(doc,{sessionId:'class-1',sequence:1,index:0,visited:[0]});
 const next=await recordStudyProgress(doc,{sessionId:'class-1',sequence:3,index:2,visited:[0,2]});
 await recordStudyProgress(doc,{sessionId:'class-1',sequence:2,index:1,visited:[0,1]});
 let sessions=await listStudySessions();assert.equal(sessions.length,1);assert.equal(sessions[0].lastQuestion.label,'3');assert.equal(next.startedAt,first.startedAt);assert.deepEqual(sessions[0].visited.map(q=>q.label),['1','3']);
 await recordStudyProgress(doc,{sessionId:'class-2',sequence:1,index:2,visited:[2]});
 sessions=await listStudySessions();assert.equal(sessions.length,2);assert.equal(JSON.parse(await readFile(path.join(process.env.DATA_DIR,'study-sessions.json'))).length,2);
});
test('拒绝不存在的题目、非法会话与越界浏览列表',async()=>{
 for(const input of [{sessionId:'../x',sequence:1,index:0,visited:[0]},{sessionId:'valid',sequence:1,index:99,visited:[0]},{sessionId:'valid',sequence:1,index:0,visited:[-1]},{sessionId:'valid',sequence:0,index:0,visited:[0]}])await assert.rejects(recordStudyProgress(doc,input),/格式不正确/);
});
test('历史保留最近30次、恢复原题号和索引，已移除资料禁用入口并转义标题',async()=>{
 for(let i=0;i<32;i++)await recordStudyProgress(doc,{sessionId:'recent-'+i,sequence:1,index:1,visited:[1]});
 const sessions=await listStudySessions();assert.equal(sessions.length,30);assert.equal(sessions[0].id,'recent-31');
 const record=sessions[0];assert.match(resumeURL(record),/#q=2&i=1$/);
 const html=dashboardHTML([record],[{id:doc.id,count:3,status:'ready'}]);assert.match(html,/课堂 &lt;一&gt;/);assert.match(html,/Question two/);assert.match(html,/从此处继续/);
 assert.doesNotMatch(dashboardHTML([record],[{id:doc.id,count:3,status:'trashed'}]),/href="\/player/);
});

test('班级持久保存，同一资料各班进度独立，旧记录归未分班',async()=>{
 const {createClass,listClasses}=await import('../lib/storage.mjs');
 const [a,b]=await Promise.all([createClass({name:'高一（1）班'}),createClass({name:'高一（2）班'})]);
 assert.equal((await listClasses()).length,2);
 await recordStudyProgress(doc,{sessionId:'group-a',classId:a.id,sequence:1,index:0,visited:[0]});
 await recordStudyProgress(doc,{sessionId:'group-b',classId:b.id,sequence:1,index:2,visited:[0,1,2]});
 assert.equal((await listStudySessions(a.id))[0].lastQuestion.label,'1');assert.equal((await listStudySessions(b.id))[0].lastQuestion.label,'3');
 // A session cannot be reassigned by a late or mismatched request.
 await recordStudyProgress(doc,{sessionId:'group-a',classId:b.id,sequence:2,index:2,visited:[2]});
 assert.equal((await listStudySessions(a.id))[0].lastQuestion.label,'1');assert.equal((await listStudySessions(b.id)).length,1);
 for(let i=0;i<35;i++)await recordStudyProgress(doc,{sessionId:'busy-b-'+i,classId:b.id,sequence:1,index:1,visited:[1]});
 assert.equal((await listStudySessions(a.id)).length,1);assert.equal((await listStudySessions(b.id)).length,30);assert.ok((await listStudySessions('')).every(r=>!r.classId));
 const records=await listStudySessions(a.id),html=dashboardHTML(records,[{id:doc.id,count:3,status:'ready'}],{classes:[a,b],classId:a.id});
 assert.match(html,/高一（1）班/);assert.match(resumeURL(records[0]),new RegExp('classId='+a.id));assert.doesNotMatch(html,/接着上节课|dashboard-resume|dashboard-stats|累计浏览/);
 assert.equal(JSON.parse(await readFile(path.join(process.env.DATA_DIR,'classes.json'))).length,2);
 await assert.rejects(createClass({name:'  '}),/班级名称/);await assert.rejects(createClass({name:'a'.repeat(41)}),/班级名称/);
 await assert.rejects(recordStudyProgress(doc,{sessionId:'bad-class',classId:'missing',sequence:1,index:0,visited:[0]}),/班级不存在/);
});

test('编辑班级名称保留编号和既有进度，非法名称和不存在的班级被拒绝',async()=>{
 const {createClass,renameClass,listClasses}=await import('../lib/storage.mjs');
 const entry=await createClass({name:'原班级'});await recordStudyProgress(doc,{sessionId:'rename-progress',classId:entry.id,sequence:1,index:2,visited:[1,2]});
 const renamed=await renameClass(entry.id,{name:'  高二（3）班  '});assert.equal(renamed.id,entry.id);assert.equal(renamed.name,'高二（3）班');assert.equal(renamed.createdAt,entry.createdAt);
 assert.equal((await listClasses()).find(c=>c.id===entry.id).name,'高二（3）班');assert.equal((await listStudySessions(entry.id))[0].lastQuestion.index,2);
 for(const name of ['', ' '.repeat(3),'a'.repeat(41)])await assert.rejects(renameClass(entry.id,{name}),/班级名称/);
 await assert.rejects(renameClass('unknown',{name:'新名称'}),/班级不存在/);
 const html=dashboardHTML([],[],{classes:[renamed],classId:entry.id});assert.match(html,/data-action="continue-class"/);assert.match(html,/data-rename-class=/);assert.match(html,/添加班级/);
});
