import {buildPresentationPages} from './presentation-pages.js';
const url=new URL(location.href),id=url.searchParams.get('id');
try{
 const response=await fetch('/api/lessons/'+encodeURIComponent(id));if(response.status===401){location.href='/?return='+encodeURIComponent(location.pathname+location.search);throw new Error('请先登录');}const data=await response.json();if(!response.ok)throw new Error(data.error);
 fetch('/api/lessons/'+encodeURIComponent(id)+'/use',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
 if(!data.lesson.questions.length)throw new Error('这份资料尚无题目，请先完成识别或编辑。');
 document.getElementById('lesson-data').textContent=JSON.stringify({...data.lesson,home:'/',presentationPages:buildPresentationPages(data.lesson.questions)});document.title=data.lesson.title+' · 课堂演示';
 for(const file of ['/legacy/player.js','/legacy/revision.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=file;s.onload=resolve;s.onerror=reject;document.body.append(s);});
 if(data.lesson.status!=='ready'){const badge=document.createElement('span');badge.textContent='草稿预览 · 尚未确认用于课堂';badge.className='draft-badge';document.querySelector('.question-meta>div').append(badge);}
}catch(e){document.body.className='';document.body.innerHTML='';const p=document.createElement('p');p.style.cssText='padding:40px;font:20px sans-serif';p.textContent=e.message;document.body.append(p);}
