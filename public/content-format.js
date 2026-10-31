// Narrow editorial fixes only: preserve original OCR and deliberately wrong grammar in options.
export function normalizePunctuation(text){if(typeof text!=='string')return text;return text.replace(/\u00a0/g,' ').replace(/[,，]{2,}/g,m=>m[0]).replace(/([,;!?])(?=[A-Za-z_])/g,'$1 ').replace(/([A-Za-z_])\.(?=[A-Z][a-z])/g,'$1. ').replace(/(\b(?:Mr|Mrs|Ms|Dr|Prof))\.(?=[A-Z])/g,'$1. ');}
export function formatDialogue(text){let s=normalizePunctuation(text);if(typeof s!=='string')return s.replace(', But I am not sure',', but I am not sure').replace('— No. you ','— No, you ');
 s=s.replace(/(^|[?!！。]\s*|\n\s*)一\s*(?=[A-Za-z_])/g,'$1— ');
 // Only a marker at the start, after punctuation, or after a space is a dialogue turn.
 s=s.replace(/(^|\n)[ \t]*[-—–－]{1,2}[ \t]*(?=[A-Za-z_])/g,'$1— ');
 s=s.replace(/([?!！。])[ \t]*[-—–－]{1,2}[ \t]*(?=[A-Za-z_])/g,'$1\n— ');
 s=s.replace(/[ \t]+[-—–－]{1,2}[ \t]*(?=[A-Z_])/g,'\n— ');
 s=s.replace(/(—[ \t]*)ls\b/g,'$1Is').replace(/(—[ \t]*)lt\b/g,'$1It');
 return s;
}
export function cleanLessonText(lesson,onChange){function visit(value,path=[]){if(typeof value==='string'){const leaf=path.at(-1);if(['ocrText','inputText','id','source','url','key'].includes(leaf)||path.includes('storage'))return value;const dialogue=leaf==='stem'||leaf==='worked'||(leaf==='text'&&(path.includes('context')||path.includes('reference')));const next=dialogue?formatDialogue(value):normalizePunctuation(value);if(next!==value)onChange?.({path:path.join('.'),before:value,after:next});return next;}if(Array.isArray(value))return value.map((v,i)=>visit(v,[...path,i]));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,[...path,k])]));return value;}return visit(lesson);}
