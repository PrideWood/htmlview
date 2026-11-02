import {recognize} from './model.mjs';
import {ValidationError} from './lesson.mjs';

// Offsets retain the exact source text; no source characters are discarded at boundaries.
export function splitTextRange(text,start=0,end=text.length,limit=3500){
 const cuts=[start];let last=start,count=0;
 const questions=[...text.slice(start,end).matchAll(/^\s*(?:第\s*)?\d{1,4}\s*[.．、)）题]\s*/gm)].map(m=>start+m.index);
 for(const at of questions){if(at===last){count=1;continue;}if(at<last)continue;count++;if(at-last>=limit||count>8){cuts.push(at);last=at;count=1;}}
 const ranges=[];
 for(let i=0;i<cuts.length;i++){
  let a=cuts[i];const b=cuts[i+1]??end;
  while(b-a>limit*1.5){let cut=text.lastIndexOf('\n',a+limit);if(cut<=a+limit/2)cut=a+limit;else cut++;ranges.push({start:a,end:cut});a=cut;}
  if(a<b)ranges.push({start:a,end:b});
 }
 return ranges;
}
export function createRecognitionState(doc){
 const source=doc.ocrText||doc.inputText||'';
 const tasks=source.trim()?splitTextRange(source).map(r=>({...r,kind:'text',depth:0})):[];
 // Keep all photos together initially so the model can infer page order.
 if(doc.images?.length){const includeText=tasks.length<=1;if(includeText)tasks.length=0;tasks.push({kind:'images',indices:doc.images.map((_,i)=>i),depth:0,includeText});}
 if(!tasks.length)throw new ValidationError('没有可整理的原文或照片。');
 return {source,tasks,results:[],completed:0};
}
function smaller(task,state){
 if(task.depth>=8)return null;
 if(task.kind==='images'){
  if(task.indices.length<2)return null;
  const mid=Math.ceil(task.indices.length/2);return [task.indices.slice(0,mid),task.indices.slice(mid)].map((indices,i)=>({...task,indices,includeText:task.includeText&&i===0,depth:task.depth+1}));
 }
 const mid=Math.floor((task.start+task.end)/2);
 const boundaries=[...state.source.slice(task.start,task.end).matchAll(/^\s*\d{1,4}\s*[.．、)）]\s*/gm)].map(m=>task.start+m.index).filter(n=>n>task.start&&n<task.end);
 let cut=boundaries.sort((a,b)=>Math.abs(a-mid)-Math.abs(b-mid))[0];
 if(!cut&&task.end-task.start<200)return null;
 if(!cut){cut=state.source.lastIndexOf('\n',mid);if(cut<=task.start+50||cut>=task.end-50)cut=mid;else cut++;}
 return [{...task,end:cut,depth:task.depth+1},{...task,start:cut,depth:task.depth+1}];
}
export async function recognizeNext(doc){
 const state=structuredClone(doc.recognitionState||createRecognitionState(doc));const task=state.tasks[0];
 const textTask=task.kind==='text',indices=textTask?[]:task.indices;
 const batchInstruction=textTask?`这是自动分批整理。只整理【本批原文】中的题目，不要输出参考原文中的其他题目。边界处的残句只作上下文，题目归属于题号/题干起点所在批次。阅读材料可从完整参考原文补全。没有题目则返回空 questions。\n【完整参考原文，仅用作上下文】\n${state.source}\n【参考原文结束】`:'这是照片批次。只整理本批照片中的题目。';
 let result;
 try{result=await recognize({...doc,ocrText:textTask?state.source.slice(task.start,task.end):(task.includeText?state.source:''),inputText:'',images:indices.map(i=>doc.images[i]),batchInstruction});}
 catch(e){if(e.code!=='MODEL_TRUNCATED')throw e;const parts=smaller(task,state);if(!parts)throw new Error('单题或单页的模型输出仍不完整，已保留整理进度，请更换模型后重试。');state.tasks.splice(0,1,...parts);return {state,pending:true,split:true};}
 if(indices.length){result.pageOrder=result.pageOrder.map(n=>indices[n-1]+1);result.questions.forEach(q=>q.sourcePages=q.sourcePages.map(n=>indices[n-1]+1));}
 state.tasks.shift();state.results.push(result);state.completed++;
 const count=state.results.reduce((n,r)=>n+r.questions.length,0);
 if(count>1000)throw new ValidationError('整理结果超过单份资料1000题上限，已保留此前进度，请按章节建立资料。');
 return {state,pending:state.tasks.length>0};
}
export function mergeRecognition(state,doc){
 const results=state.results,questions=results.flatMap(r=>r.questions);
 if(!questions.length)throw new ValidationError('未找到题目，请检查原文或照片。');
 const labels=new Set();questions.forEach((q,i)=>{
  const original=q.label;let attempt=0;
  while(labels.has(q.label)){const suffix=` · ${i+1}${attempt?'-'+attempt:''}`;q.label=original.slice(0,40-suffix.length)+suffix;attempt++;}
  labels.add(q.label);
 });
 const timings={},usage={};for(const r of results){for(const [k,v] of Object.entries(r.modelInfo.timings))timings[k]=(timings[k]||0)+v;for(const [k,v] of Object.entries(r.modelInfo.usage))usage[k]=(usage[k]||0)+v;}
 const pageOrder=results.flatMap(r=>r.pageOrder);let orderNote=results.map(r=>r.orderNote).filter(Boolean).join('\n');if(results.filter(r=>r.pageOrder.length).length>1)orderNote+='\n图片已分批整理，跨批次暂按上传顺序，请核对相邻批次的阅读材料与页序。';
 return {...results[0],title:doc.title,topic:doc.topic,questions,ocrText:doc.images?.length?results.map(r=>r.ocrText).filter(Boolean).join('\n\n'):state.source,notes:results.flatMap(r=>r.notes),pageOrder,orderNote,modelInfo:{...results.at(-1).modelInfo,timings,usage,batches:state.completed}};
}
