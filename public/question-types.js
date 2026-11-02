export const QUESTION_TYPES={
 single_choice:{label:'单项选择',mode:'choice'},
 multiple_choice:{label:'多项选择',mode:'multi'},
 reading:{label:'阅读理解',mode:'choice'},
 cloze:{label:'完形填空',mode:'choice'},
 sentence_completion:{label:'七选五 / 选句填空',mode:'choice'},
 matching:{label:'信息匹配 / 选词填空',mode:'choice'},
 fill_blank:{label:'语法 / 词形填空',mode:'input'},
 correction:{label:'改错',mode:'input'},
 translation:{label:'翻译',mode:'input'},
 short_answer:{label:'阅读简答 / 问答',mode:'input'},
 writing:{label:'书面表达',mode:'self'},
 study:{label:'讲解卡',mode:'study'}
};
export const OPTION_KEYS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function inferQuestionType(q){
 if(QUESTION_TYPES[q.questionType])return q.questionType;
 const hint=[q.section,q.stem].join(' ');
 if(/七选五|[七7]\s*选\s*[五5]|选句填空|阅读[七7]选[五5]/i.test(hint))return 'sentence_completion';
 if(/完形|cloze/i.test(hint))return 'cloze';
 if(/匹配|配对|选词填空|选词补全/i.test(hint))return 'matching';
 if(q.mode==='multi')return 'multiple_choice';
 if(q.mode==='study')return 'study';
 if(q.mode==='self')return 'writing';
 if(q.mode==='input'){if(/改错/.test(hint))return 'correction';if(/翻译/.test(hint))return 'translation';if(/语法|词形|填空/.test(hint))return 'fill_blank';return 'short_answer';}
 return q.context?.length?'reading':'single_choice';
}
// Exact sets only: A or B is an uncertain answer, not a multi-select answer.
export function multipleAnswerKeys(answer){
 const value=String(answer||'').trim().toUpperCase();
 if(/\bOR\b/.test(value))return [];
 if(!/^[A-Z](?:[A-Z]|[\s,，、;/；]+[A-Z])*$/.test(value))return [];
 const keys=value.match(/[A-Z]/g)||[];return new Set(keys).size===keys.length?keys.sort():[];
}

// Older imports sometimes tagged free-text exercises as sentence completion.
// Honor an explicit free-response mode and use missing options + textual answers
// as evidence to repair the tag, rather than requiring invented choices.
export function questionPresentation(q){
 let questionType=inferQuestionType(q);
 if(q.typeSelected&&QUESTION_TYPES[q.questionType])return {questionType:q.questionType,mode:QUESTION_TYPES[q.questionType].mode};
 const hint=[q.section,q.stem].join(' '),count=Array.isArray(q.options)?q.options.length:0;
 const semantic=/翻译/.test(hint)?'translation':/改错|纠错/.test(hint)?'correction':/句型转换|同义句|改写|改为|划线部分提问|画线部分提问/.test(hint)?'short_answer':/所给词|适当形式|语法填空|词形变化/.test(hint)?'fill_blank':'';
 if(['input','self','study'].includes(q.mode))return {questionType:semantic||questionType,mode:q.mode};
 if(QUESTION_TYPES[questionType]&&!['choice','multi'].includes(QUESTION_TYPES[questionType].mode))return {questionType,mode:QUESTION_TYPES[questionType].mode};
 const answer=String(q.answer||'').trim();
 const textualAnswer=answer&&!/待确认|无法辨认|未知/.test(answer)&&!/^[A-Z](?:[A-Z]|[\s,，、;/；]+[A-Z])*$/.test(answer);
 if(count<2&&(semantic||textualAnswer))return {questionType:semantic||'fill_blank',mode:'input'};
 return {questionType,mode:questionType==='multiple_choice'?'multi':q.mode==='multi'?'multi':'choice'};
}
export function repairQuestionTypes(lesson){
 return {...lesson,questions:(lesson.questions||[]).map(q=>{
  const presentation=questionPresentation(q),changed=q.mode&&q.mode!==presentation.mode;
  return {...q,...presentation,...(changed?{reviewed:false}:{}),accepted:changed?[]:q.accepted};
 })};
}

export function selectQuestionType(q,type){
 if(!QUESTION_TYPES[type])return;
 const previous=QUESTION_TYPES[q.questionType];
 q.questionType=type;q.mode=QUESTION_TYPES[type].mode;q.typeSelected=true;
 if(!['reading','cloze','sentence_completion','matching'].includes(type)){q.groupId='';q.materialDetached=true;}else q.materialDetached=false;
 if(previous&&q.section===previous.label)q.section=QUESTION_TYPES[type].label;
 q.accepted=[];q.reviewed=false;
 const keys=q.mode==='multi'?multipleAnswerKeys(q.answer):[];
 q.invalid=!String(q.answer||'').trim()||(q.mode==='choice'&&!q.options?.some(o=>o.key===q.answer))||(q.mode==='multi'&&(keys.length<2||!keys.every(k=>q.options?.some(o=>o.key===k))));
 q.reviewStatus=q.invalid?'needs_review':'ok';
}
