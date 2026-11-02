import {inferQuestionType} from './question-types.js';
export function materialBlocks(value){
 if(!Array.isArray(value))return [];
 return value.flatMap(b=>{
  if(b?.type==='table'&&Array.isArray(b.rows)){const rows=b.rows.filter(Array.isArray).map(row=>row.map(c=>String(c??'')));return rows.length?[{type:'table',rows}]:[];}
  return typeof b?.text==='string'&&b.text.trim()?[{type:'p',text:b.text}]:[];
 });
}
export function hasMaterial(context){return materialBlocks(context).length>0;}
const length=blocks=>JSON.stringify(blocks).length;
export function needsMaterial(q){
 return ['reading','cloze','sentence_completion','matching'].includes(inferQuestionType(q))||/阅读|完形|七选五|选句填空|选择填入第.+空/.test([q.section,q.stem].join(' '));
}
// Shared material is stored once and hydrated into the legacy per-question shape.
// Explicit group IDs are required; questions with no group are never mixed by proximity.
export function hydrateMaterials(lesson){
 const byId=new Map(),explicit=new Set();
 for(const m of Array.isArray(lesson.materials)?lesson.materials:[]){
  const id=String(m?.id||'').trim(),context=materialBlocks(m?.context);if(!id||!context.length)continue;
  explicit.add(id);const old=byId.get(id);if(!old||length(context)>length(old.context))byId.set(id,{...m,id,title:String(m.title||''),context});
 }
 for(const q of Array.isArray(lesson.questions)?lesson.questions:[]){
  if(!q.groupId||!hasMaterial(q.context))continue;
  const context=materialBlocks(q.context),old=byId.get(q.groupId);
  if(!old||(!explicit.has(q.groupId)&&length(context)>length(old.context)))byId.set(q.groupId,{id:q.groupId,title:'',context});
 }
 const questions=(Array.isArray(lesson.questions)?lesson.questions:[]).map(q=>{
  const material=byId.get(q.groupId)||[...byId.values()].find(m=>Array.isArray(m.questionLabels)&&m.questionLabels.includes(q.label));
  return {...q,groupId:material?.id||q.groupId,context:material?material.context:materialBlocks(q.context)};
 });
 return {...lesson,materials:[...byId.values()],questions};
}
export function presentationMaterials(lesson){
 const hydrated=hydrateMaterials(lesson),source=String(lesson.inputText||lesson.ocrText||'').trim();
 return {...hydrated,questions:hydrated.questions.map(q=>{
  if(hasMaterial(q.context)||!needsMaterial(q))return q;
  if(source)return {...q,context:[{type:'p',text:source}],materialFallback:'source'};
  if(hasMaterial(lesson.reference))return {...q,context:materialBlocks(lesson.reference),materialFallback:'source'};
  if(lesson.images?.length)return {...q,materialFallback:'images'};
  return {...q,materialFallback:'missing'};
 })};
}
export function updateSharedMaterial(lesson,question,context){
 question.context=materialBlocks(context);
 if(!question.groupId)return;
 const material={id:question.groupId,title:(lesson.materials||[]).find(m=>m.id===question.groupId)?.title||'',context:question.context};
 lesson.materials=[...(lesson.materials||[]).filter(m=>m.id!==question.groupId),material];
 for(const q of Array.isArray(lesson.questions)?lesson.questions:[])if(q.groupId===question.groupId){q.context=question.context;q.reviewed=false;}
}

export function compactMaterials(lesson){
 const hydrated=hydrateMaterials(lesson),ids=new Set(hydrated.materials.map(m=>m.id));
 return {...hydrated,questions:hydrated.questions.map(q=>ids.has(q.groupId)?{...q,context:[]}:q)};
}
