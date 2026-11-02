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
