import {filterLibrary,sortLibrary,libraryGroups} from './library-model.js';
import {QUESTION_TYPES,inferQuestionType} from './question-types.js';
import {presentationMaterials} from './lesson-materials.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode = encodeURIComponent;
const icons = {
 camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
 library:'<path d="M4 4h6v16H4zM14 4h6v16h-6zM4 8h6m4 0h6"/>',
 folder:'<path d="M3 7V4h6l3 3h9v13H3z"/>',
 file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
export const phoneStatus = {ready:'课堂资料',draft:'待校对',uploaded:'待识别',processing:'识别中',error:'识别失败',archived:'已收起'};
export function phoneFrameHTML(content, active='library') {
 return `<div class="phone-app">${content}<nav class="phone-bottom-nav" aria-label="手机页面"><button type="button" data-phone-route="upload" ${active==='upload'?'aria-current="page"':''}>${icon('camera')}<span>拍照上传</span></button><button type="button" data-phone-route="library" ${active==='library'?'aria-current="page"':''}>${icon('library')}<span>资料演示</span></button></nav></div>`;
}
export function phoneHeaderHTML(title, back='', subtitle='') {
 return `<header class="phone-page-header">${back?`<button class="phone-back" data-phone-route="${esc(back)}" aria-label="返回上一级">‹</button>`:'<img src="/icons/app-192.png" alt="讲练">'}<div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></header>`;
}
function row(route, title, detail, symbol='file', badge='') {
 return `<button class="phone-library-row" data-phone-route="${esc(route)}"><span class="phone-row-icon">${icon(symbol)}</span><span class="phone-row-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>${badge?`<span class="phone-status">${esc(badge)}</span>`:''}<span class="phone-chevron" aria-hidden="true">›</span></button>`;
}
export function phoneLibraryRowsHTML(lessons, {topic='',search='',filter='all'}={}) {
 const list=filterLibrary(lessons.map(d=>({...d,topic:d.topic||'未分类'})),{topic,search,filter});
 if (!list.length) return '<div class="phone-empty"><strong>暂时没有符合条件的资料</strong><p>试试其他关键词或分类，也可以先拍照上传。</p><button data-phone-route="upload">去上传</button></div>';
 if (!topic && !search.trim()) {
  const groups=libraryGroups(list);
  return `<p class="phone-list-caption">${groups.length} 个专题 · ${list.length} 份资料</p><div class="phone-list">${groups.map(g=>row('library/'+encode(g.topic),g.topic,`${g.count} 份资料 · ${g.questions} 题`,'folder')).join('')}</div>`;
 }
 return `<p class="phone-list-caption">${search.trim()?'搜索结果 · ':''}${list.length} 份资料</p><div class="phone-list">${sortLibrary(list,'title').map(d=>row('lesson/'+encode(d.id),d.title,`${d.count} 题 · ${d.sourceType==='builtin'?'内置题库':d.topic||'我的资料'}`,'file',phoneStatus[d.status])).join('')}</div>`;
}
export function phoneLibraryHTML(lessons, state={}) {
 return `<main class="phone-page phone-library">${phoneHeaderHTML(state.topic||'资料演示',state.topic?'library':'','按专题找到资料，随时浏览与编辑')}<label class="phone-search"><span aria-hidden="true">⌕</span><input id="phone-library-search" type="search" placeholder="搜索资料名称或专题" aria-label="搜索资料名称或专题" value="${esc(state.search||'')}"></label><div class="phone-filters" aria-label="筛选资料">${[['all','全部'],['builtin','内置题库'],['custom','我的资料'],['draft','待校对'],['ready','课堂资料']].map(([value,label])=>`<button data-phone-filter="${value}" aria-pressed="${(state.filter||'all')===value}">${label}</button>`).join('')}<button data-action="refresh" aria-label="刷新资料">刷新</button></div><div id="phone-library-results">${phoneLibraryRowsHTML(lessons,state)}</div></main>`;
}
export function phoneLessonHTML(doc) {
 const questions=doc.questions||[];
 return `<main class="phone-page">${phoneHeaderHTML(doc.title,'library/'+encode(doc.topic||'未分类'),doc.topic)}<section class="phone-lesson-summary"><span class="phone-status">${esc(phoneStatus[doc.status]||'资料')}</span><span>${questions.length} 题 · ${doc.sourceType==='builtin'?'内置题库':'我的资料'}</span></section><div class="phone-lesson-actions">${questions.length?`<a class="phone-primary-link" href="/player.html?id=${encode(doc.id)}">开始演示 ↗</a>`:''}<button data-phone-edit="${esc(doc.id)}">${doc.sourceType==='builtin'?'复制并编辑':'编辑资料'}</button></div>${!questions.length?'<div class="phone-empty"><strong>这份资料还没有题目</strong><p>可以打开编辑，继续识别或手动添加题目。</p></div>':`<p class="phone-list-caption">题目目录 · 点击查看内容</p><div class="phone-list">${questions.map((q,index)=>row(`read/${encode(doc.id)}/${index}`,`原题 ${q.label} · ${QUESTION_TYPES[inferQuestionType(q)]?.label||'题目'}`,(q.stem||'题干待补充').slice(0,160),'file',q.invalid?'待确认':'')).join('')}</div>`}</main>`;
}
function blocksHTML(blocks=[]) {
 return blocks.map(block=>block.type==='table'?`<div class="phone-table"><table>${(block.rows||[]).map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</table></div>`:`<p>${esc(block.text)}</p>`).join('');
}
export function phoneReaderHTML(doc, index=0) {
 const question=presentationMaterials(doc).questions[index];
 if (!question) return `<main class="phone-page">${phoneHeaderHTML('题目不存在','lesson/'+encode(doc.id))}</main>`;
 const q=question;
 return `<main class="phone-page phone-reader">${phoneHeaderHTML(`原题 ${q.label}`,`lesson/${encode(doc.id)}`,`${index+1} / ${doc.questions.length} · ${doc.title}`)}<div class="phone-reader-tools"><span class="phone-status">${esc(QUESTION_TYPES[inferQuestionType(q)]?.label||'题目')}</span><button data-phone-edit="${esc(doc.id)}" data-phone-edit-question="${index}">${doc.sourceType==='builtin'?'复制编辑本题':'编辑本题'}</button></div>${q.context?.length?`<details class="phone-reading-material"><summary>阅读材料 / 共享题干</summary>${blocksHTML(q.context)}</details>`:''}${q.materialFallback==='images'?`<details class="phone-reading-material"><summary>原始资料</summary>${(doc.images||[]).map(image=>`<a href="${esc(image.url)}" target="_blank" rel="noopener"><img src="${esc(image.url)}" alt="原始题目图片，点击放大"></a>`).join('')}</details>`:''}<article class="phone-question-card"><p class="phone-question-stem">${esc(q.stem)}</p>${q.options?.length?`<ol class="phone-question-options">${q.options.map(o=>`<li><b>${esc(o.key)}</b><span>${esc(o.text)}</span></li>`).join('')}</ol>`:''}${q.invalid?`<p class="notice">本题待确认：${esc(q.examNote||'请核对题目与答案。')}</p>`:''}</article><details class="phone-answer"><summary>查看答案与解析</summary><p class="phone-answer-label">参考答案</p><p>${esc(q.answer||'待补充')}</p><p class="phone-answer-label">解析</p><p>${esc(q.reason||'暂无解析')}</p>${q.worked?`<p>${esc(q.worked)}</p>`:''}${q.essay?`<h3>参考范文</h3><p>${esc(q.essay)}</p>`:''}${(q.optionNotes||[]).map(n=>`<section><h3>${esc(n.key)} · ${esc(n.text)}</h3><p>${esc(n.reason)}</p></section>`).join('')}${(q.enrichment||[]).map(e=>`<section><h3>${esc(e.phrase)}</h3>${['meaning','usage','example','translation','contrast'].filter(k=>e[k]).map(k=>`<p>${esc(e[k])}</p>`).join('')}</section>`).join('')}</details><div class="phone-question-pagination"><button data-phone-route="read/${encode(doc.id)}/${index-1}" ${index===0?'disabled':''}>‹ 上一题</button><span>${index+1} / ${doc.questions.length}</span><button data-phone-route="read/${encode(doc.id)}/${index+1}" ${index>=doc.questions.length-1?'disabled':''}>下一题 ›</button></div></main>`;
}
export function phoneQuestionPickerHTML(doc,index) {
 return `<div class="phone-edit-picker"><label for="phone-edit-question">选择校对题目</label><select id="phone-edit-question">${doc.questions.map((q,i)=>`<option value="${i}" ${i===index?'selected':''}>${i+1} / ${doc.questions.length} · 原题 ${esc(q.label)}${q.reviewed?' ✓':q.invalid?' · 待确认':''}</option>`).join('')}</select><div class="phone-question-pagination"><button data-phone-question="${index-1}" ${index===0?'disabled':''}>‹ 上一题</button><button data-phone-question="${index+1}" ${index>=doc.questions.length-1?'disabled':''}>下一题 ›</button></div></div>`;
}
