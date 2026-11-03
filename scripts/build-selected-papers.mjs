import fs from 'node:fs';
import {repairQuestionBankLesson} from '../lib/question-text-repairs.mjs';
import {cleanLessonText} from '../public/content-format.js';
const root=new URL('../',import.meta.url),folder=new URL('seed/selected-papers/',root);
const read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',folder),'utf8'));
const book='陕西省职教高考总复习指导与同步练：英语',file='Images 261103 162421.pdf';
const audit=JSON.parse(fs.readFileSync(new URL('review/selected-papers-ocr.json',root),'utf8'));
const pageInfo=n=>audit.pages[n-1];
const categories=[['nouns','名词',1,21],['pronouns','代词',2,42],['numbers','数词',3,50],['prepositions','介词',4,67],['articles','冠词',5,75],['conjunctions','连词',6,85],['adjectives','形容词和副词',7,107],['verbs','动词',8,140],['nonfinite','非谓语动词',9,156],['sentence-types','句子的种类',11,180],['complex-sentences','复合句',12,206],['agreement','主谓一致',13,215],['subjunctive','虚拟语气',14,224],['inversion','倒装',16,235],['communication','情景交际',null,247]];
const blocks=paragraphs=>paragraphs.map(text=>({type:'p',text}));
const docs=[];
function source(r){const printed=r.bookPages||[...new Set(r.pdfPages.map(n=>pageInfo(n).bookPage))];return {collection:'精选真题',examYear:r.year,sourceBook:book,sourceBookPages:printed,sourcePdf:file,sourcePdfPages:r.pdfPages,attributionBasis:'年份与真题身份按扫描教材印刷标注记录，未另行假定教材页码等于PDF页码'};}
function makeQuestion(r,type,context=[]){
 const s=source(r),invalid=r.invalid||r.answer==='?';
 return {...s,label:String(r.label),stem:r.stem,options:(r.options||[]).map((text,i)=>({key:'ABCD'[i],text})),mode:type==='writing'?'self':type==='correction'?'input':'choice',questionType:type,context,section:r.section||'',answer:invalid?'待确认':r.answer,accepted:!invalid&&r.options?[r.answer]:[],invalid,ambiguous:false,reviewed:!invalid,reviewStatus:invalid?'needs_review':'ok',reason:r.reason+'\n真题来源：'+r.year+'年真题（'+book+'，教材第'+s.sourceBookPages.join('、')+'页；扫描PDF第'+r.pdfPages.join('、')+'页）。',examNote:invalid?r.reason:'',enrichment:[],reasonSource:'本项目按题意补编，非官方答案',sourcePages:[]};
}
function add(name,title,topic,questions,extra={}){
 const pages=[...new Set(questions.flatMap(q=>q.sourcePdfPages))].sort((a,b)=>a-b);
 const images=pages.map(n=>({id:`scan-${n}`,name:`PDF第${n}页 · 教材第${pageInfo(n).bookPage}页`,url:pageInfo(n).imageUrl}));
 for(const q of questions)q.sourcePages=q.sourcePdfPages.map(n=>pages.indexOf(n)+1);
 const notes=['来源：'+book+'，用户提供扫描PDF《'+file+'》。','按PDF前3页目录分类，仅把印刷标注为真题的题目收入本集合；未标真题的同步练及知识讲解保留在全文识别记录。','年份沿用教材“某年真题”标签；来源为教材收录，未冒充已逐题核验过官方原卷。','参考答案与切题解析为本项目补编；不以页面上手写勾画作为官方答案。','目录不计题；PDF第14/15页及第31/32页分别为重复拍摄，只收录一次题目，保留两份页码溯源。'];
 docs.push(repairQuestionBankLesson(cleanLessonText({id:'builtin-selected-papers-'+name,title:'精选真题 · '+title,topic,source:book,sourceType:'builtin',status:'ready',createdAt:'2026-11-03T08:00:00.000Z',updatedAt:'2026-11-03T08:00:00.000Z',version:1,notes,reference:blocks(['来源教材：'+book,'原始扫描：'+file+'；目录为PDF第1—3页。']),questions,images,documents:[],ocrText:'',home:'/',collection:'精选真题',sourcePdfPages:pages,...extra})));
}
for(const [name,title,order,printed] of categories){
 const questions=read(name).map(r=>makeQuestion({...r,section:title+' · '+r.year+'年真题',bookPages:[...new Set(r.pdfPages.map(n=>pageInfo(n).bookPage))]},'single_choice'));
 if(name==='nonfinite'){const q=questions.find(q=>q.label==='7');q.invalid=true;q.reviewed=false;q.reviewStatus='needs_review';q.answer='待确认';q.accepted=[];q.examNote='常规考试推荐not to laugh；to not laugh在现代英语中亦可作为分裂不定式，保留多解提示，暂不计分。';}
 if(name==='complex-sentences'){const q=questions.find(q=>q.label==='5');q.invalid=true;q.reviewed=false;q.reviewStatus='needs_review';q.answer='待确认';q.accepted=[];q.examNote='原选项that与which均可构成限定性从句，保留推荐形式提示，暂不唯一计分。';}
 // Individual book pages follow the scan, rather than assigning the chapter start page to every item.
 for(const q of questions)q.sourceBookPages=[...new Set(q.sourcePdfPages.map(n=>pageInfo(n).bookPage))];
 add(name,(order?String(order).padStart(2,'0')+' ':'')+title,name==='communication'?'25 精选真题 · 情景交际':'24 精选真题 · 语法',questions,{catalogPart:name==='communication'?'第三部分 情景交际':'第二部分 语法知识',catalogTopic:title,catalogOrder:order});
}
for(const year of [2024,2023,2022]){
 const r=read('cloze-'+year),context=blocks(r.paragraphs);
 const questions=r.questions.map(q=>({...makeQuestion({...r,...q,section:year+'年真题 · 完形填空'},'cloze',context),groupId:'selected-cloze-'+year,blankLabel:q.label}));
 add('cloze-'+year,year+' 完形填空 · '+r.title,'26 精选真题 · 完形填空',questions,{catalogPart:'第四部分 题型专项',catalogTopic:'完形填空'});
}
for(const year of [2024,2023])for(let n=1;n<=4;n++){
 const r=read('reading-'+year+'-'+n),context=blocks(r.paragraphs);
 const questions=r.questions.map(q=>({...makeQuestion({...r,...q,section:year+'年真题 · 阅读理解'},'reading',context),groupId:'selected-reading-'+year+'-'+n}));
 add('reading-'+year+'-'+n,year+' 阅读理解 '+n+' · '+r.title,'27 精选真题 · 阅读理解',questions,{catalogPart:'第四部分 题型专项',catalogTopic:'阅读理解'});
}
for(const year of [2024,2023,2022,2021]){
 const r=read('correction-'+year);
 const context=blocks(['每行至多一处错误，无错标“正确”；有错按原文要求改词、加词或删词。以下原文中的错误属于题目，不预先改正。',...(r.intro?[r.intro]:[]),...r.lines.map((l,i)=>`第${i+1}行：${l.text}`),...(r.ending?[r.ending]:[])]);
 const questions=r.lines.map((l,i)=>({...makeQuestion({...r,label:i+1,stem:l.text,answer:l.answer.trim(),reason:l.reason,section:year+'年真题 · 短文改错'},'correction',context),groupId:'selected-correction-'+year}));
 add('correction-'+year,year+' 短文改错','28 精选真题 · 短文改错',questions,{catalogPart:'第四部分 题型专项',catalogTopic:'短文改错'});
}
for(const r of read('writing')){
 const context=blocks([r.prompt,'内容包括：',...r.points.map((s,i)=>(i+1)+'. '+s),'写作要求：',...r.requirements.map((s,i)=>(i+1)+'. '+s),...(r.opening?['给定开头：'+r.opening]:[])]);
 const q=makeQuestion({...r,label:'1',stem:[r.title,...context.map(b=>b.text)].join('\n'),answer:'开放作文：按题干要点组织内容，参考写作检查见解析。',section:r.year+'年真题 · 书面表达'},'writing',context);
 add('writing-'+r.year,r.year+' 书面表达 · '+r.title,'29 精选真题 · 书面表达',[q],{catalogPart:'第四部分 题型专项',catalogTopic:'书面表达'});
}
const total=docs.reduce((n,d)=>n+d.questions.length,0);
if(docs.length!==33||total!==199)throw Error(`精选真题数量异常：${docs.length}份/${total}题`);
if(new Set(docs.map(d=>d.id)).size!==docs.length)throw Error('资料ID重复');
for(const d of docs){if(new Set(d.questions.map(q=>q.label)).size!==d.questions.length)throw Error('题号重复');for(const q of d.questions){if(!q.stem||!q.sourcePdfPages.length||!q.examYear)throw Error('缺少题干或来源');if(q.mode==='choice'&&(q.options.length!==4||(!q.invalid&&!q.options.some(o=>o.key===q.answer))))throw Error('选项/答案异常');}}
fs.writeFileSync(new URL('seed/selected-papers.json',root),JSON.stringify(docs));
const summary={collection:'精选真题',sourceBook:book,sourcePdf:file,sourceSha256:audit.sha256,pdfPages:41,contentsPages:[1,2,3],duplicatePagePairs:[[14,15],[31,32]],lessons:docs.length,questions:total,counts:{grammar:81,communication:5,cloze:30,reading:40,correction:40,writing:3},pending:docs.flatMap(d=>d.questions).filter(q=>q.invalid).length,years:[2024,2023,2022,2021,2020],sourcePolicy:'年份、真题标签按教材印刷内容；无真题标签的同步练不冒充真题；手写答案不作为官方标准。',materials:docs.map(d=>({id:d.id,title:d.title,count:d.questions.length,pdfPages:d.sourcePdfPages}))};
fs.writeFileSync(new URL('review/selected-papers-import.json',root),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({lessons:docs.length,questions:total,pending:summary.pending}));
