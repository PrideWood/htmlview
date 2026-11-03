import {orderedLesson} from './question-order.js';
import {presentationMaterials} from './lesson-materials.js';
import {QUESTION_TYPES} from './question-types.js';
import {buildPresentationPages} from './presentation-pages.js';
import {trackStudySession} from './study-progress.js';
const url=new URL(location.href),id=url.searchParams.get('id'),classId=url.searchParams.get('classId')||'';
try{
 const response=await fetch('/api/lessons/'+encodeURIComponent(id));if(response.status===401){location.href='/?return='+encodeURIComponent(location.pathname+location.search);throw new Error('请先登录');}const data=await response.json();if(!response.ok)throw new Error(data.error);
 fetch('/api/lessons/'+encodeURIComponent(id)+'/use',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
 if(!data.lesson.questions.length)throw new Error('这份资料尚无题目，请先完成识别或编辑。');
 let className='',resumeQuestion=null;
 if(classId){const classesResponse=await fetch('/api/classes');if(!classesResponse.ok)throw new Error('无法读取班级，请返回工作台重试。');const classes=await classesResponse.json(),selected=classes.classes.find(c=>c.id===classId);if(!selected)throw new Error('班级不存在，请返回工作台重新选择。');className=selected.name;
 const historyResponse=await fetch('/api/study-sessions?classId='+encodeURIComponent(classId));if(!historyResponse.ok)throw new Error('无法读取班级进度，请返回工作台重试。');const history=await historyResponse.json();resumeQuestion=history.sessions.find(r=>r.lessonId===id)?.lastQuestion||null;
 }
 const presentation=presentationMaterials(orderedLesson(data.lesson));
 document.getElementById('lesson-data').textContent=JSON.stringify({...presentation,classId,resumeQuestion,home:'/#dashboard',questionTypeLabels:Object.fromEntries(Object.entries(QUESTION_TYPES).map(([k,v])=>[k,v.label])),presentationPages:buildPresentationPages(presentation.questions)});document.title=data.lesson.title+' · 课堂演示';
 for(const file of ['/legacy/player.js','/legacy/revision.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=file;s.onload=resolve;s.onerror=reject;document.body.append(s);});
 if(className){const classBadge=document.createElement('span');classBadge.className='study-class-name';classBadge.textContent=className;document.querySelector('.question-meta>div').prepend(classBadge);}
 trackStudySession(data.lesson,classId);
 await import('./dictionary.js');
 if(data.lesson.status!=='ready'){const badge=document.createElement('span');badge.textContent='草稿预览 · 尚未确认用于课堂';badge.className='draft-badge';document.querySelector('.question-meta>div').append(badge);}
}catch(e){document.body.className='';document.body.innerHTML='';const p=document.createElement('p');p.style.cssText='padding:40px;font:20px sans-serif';p.textContent=e.message;document.body.append(p);}
