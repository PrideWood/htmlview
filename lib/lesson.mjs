export class ValidationError extends Error {constructor(message){super(message);this.status=400;}}
const text=(s,max=20000)=>typeof s==='string'?s.slice(0,max):'';
export function validateLesson(input,{fromModel=false}={}){
 if(!input||!Array.isArray(input.questions)||!input.questions.length)throw new ValidationError('未找到题目，请检查识别结果或手动添加题目。');
 if(input.questions.length>(fromModel?60:200))throw new ValidationError(fromModel?'本次识别超过60题，请分批处理。':'单份资料最多200题。');
 const labels=new Set();
 const questions=input.questions.map((x,i)=>{
  const label=text(String(x.label||i+1),40);if(labels.has(label))throw new ValidationError(`原题号 ${label} 重复，请修改。`);labels.add(label);
  const stem=text(x.stem);if(!stem.trim())throw new ValidationError(`第${i+1}题缺少题干。`);
  const mode=['choice','input','self','study'].includes(x.mode)?x.mode:'choice';
  const options=Array.isArray(x.options)?x.options.map((o,j)=>({key:text(o.key||'ABCDEFG'[j],1).toUpperCase(),text:text(o.text,5000)})):[];
  if(options.length>7||options.some(o=>!/[A-G]/.test(o.key)||!o.text.trim())||new Set(options.map(o=>o.key)).size!==options.length)throw new ValidationError(`第${i+1}题的选项需使用不重复的 A—G，且内容不能为空。`);
  let answer=text(x.answer,5000).trim();let invalid=Boolean(x.invalid)||x.reviewStatus==='needs_review'||!answer;
  if(mode==='choice'){
   if(options.length<2){if(!fromModel)throw new ValidationError(`第${i+1}道选择题至少需要两个选项。`);invalid=true;}
   if(answer&&!options.some(o=>o.key===answer)){if(!fromModel)throw new ValidationError(`第${i+1}题答案必须是选项中的一个字母。`);invalid=true;answer='';}
  }
  const enrichment=(Array.isArray(x.enrichment)?x.enrichment:[]).slice(0,20).map(e=>Object.fromEntries(['phrase','meaning','usage','example','translation','contrast'].map(k=>[k,text(e[k],5000)])));
  const context=(Array.isArray(x.context)?x.context:[]).slice(0,50).map(b=>b.type==='table'&&Array.isArray(b.rows)?{type:'table',rows:b.rows.slice(0,100).map(r=>Array.isArray(r)?r.slice(0,20).map(c=>text(c,2000)):[])}:{type:'p',text:text(b.text)});
  const optionNotes=(Array.isArray(x.optionNotes)?x.optionNotes:[]).map(o=>({key:text(o.key,1),text:text(o.text,5000),reason:text(o.reason,5000)}));
  return {...x,label,stem,mode,options,answer:invalid&&!answer?'待确认':answer,accepted:mode==='choice'&&!invalid?[answer]:[],invalid,ambiguous:false,sourcePages:Array.isArray(x.sourcePages)?x.sourcePages.filter(n=>Number.isInteger(n)&&n>=1&&n<=10):[],section:text(x.section,200)||'拍照练习',reason:text(x.reason)||'请补充解析并核对原图。',context,enrichment,optionNotes,reviewed:fromModel?false:Boolean(x.reviewed),examNote:text(x.examNote)|| (invalid?'原图或答案仍有疑点，需老师核对；此题暂不计分。':'')};
 });
 return {title:text(input.title,120).trim()||'未命名讲练',topic:text(input.topic,100).trim()||'拍照资料',notes:(Array.isArray(input.notes)?input.notes:[]).slice(0,30).map(x=>text(x,2000)),reference:[],questions,ocrText:text(input.ocrText,100000),pageOrder:Array.isArray(input.pageOrder)?input.pageOrder.filter(n=>Number.isInteger(n)&&n>=1&&n<=10):[],orderNote:text(input.orderNote,3000)};
}
export function parseModelJSON(raw){let t=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(t);}catch{throw new ValidationError('模型未返回完整有效的 JSON。原图已保存，请减少照片或重试，亦可手动编辑资料。');}}
export const modelSchema={type:'object',additionalProperties:false,required:['title','topic','ocrText','notes','pageOrder','orderNote','questions'],properties:{title:{type:'string'},topic:{type:'string'},ocrText:{type:'string'},notes:{type:'array',items:{type:'string'}},pageOrder:{type:'array',items:{type:'integer'}},orderNote:{type:'string'},questions:{type:'array',items:{type:'object',additionalProperties:false,required:['label','stem','mode','options','answer','reason','reviewStatus','examNote','context','enrichment','optionNotes','sourcePages'],properties:{sourcePages:{type:'array',items:{type:'integer'}},label:{type:'string'},stem:{type:'string'},mode:{type:'string',enum:['choice','input','self','study']},options:{type:'array',items:{type:'object',additionalProperties:false,required:['key','text'],properties:{key:{type:'string'},text:{type:'string'}}}},answer:{type:'string'},reason:{type:'string'},reviewStatus:{type:'string',enum:['ok','needs_review']},examNote:{type:'string'},context:{type:'array',items:{type:'object',additionalProperties:false,required:['type','text'],properties:{type:{type:'string',enum:['p']},text:{type:'string'}}}},enrichment:{type:'array',items:{type:'object',additionalProperties:false,required:['phrase','meaning','usage','example','translation','contrast'],properties:Object.fromEntries(['phrase','meaning','usage','example','translation','contrast'].map(k=>[k,{type:'string'}]))}},optionNotes:{type:'array',items:{type:'object',additionalProperties:false,required:['key','text','reason'],properties:{key:{type:'string'},text:{type:'string'},reason:{type:'string'}}}}}}}}};
