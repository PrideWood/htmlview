/* Shared classroom controls. No network or build step required. */
(()=>{
const root=document.documentElement;
const explanation=document.createElement('dialog');
explanation.id='explanation-dialog';explanation.setAttribute('aria-labelledby','explanation-title');
explanation.innerHTML=`<header class="explanation-header"><h2 id="explanation-title">解析与积累</h2><div class="explanation-tools"><button id="exp-material">题目材料</button><button id="exp-smaller" aria-label="减小解析字号">A−</button><input id="exp-font" aria-label="解析字号" type="range" min="18" max="48"><span id="exp-size"></span><button id="exp-larger" aria-label="增大解析字号">A+</button><button id="exp-close" aria-label="关闭解析">关闭 ×</button></div></header><div id="explanation-body" tabindex="0"></div><footer class="explanation-footer"><span></span><button id="exp-up">↑ 上一屏</button><button id="exp-down">↓ 下一屏</button></footer>`;
document.body.append(explanation);
let expFont=Number(store.get('ybt-explanation-font'))||26;
function changeExp(n){expFont=Math.max(18,Math.min(48,n));root.style.setProperty('--explanation-font',expFont+'px');$('exp-font').value=expFont;$('exp-size').textContent=expFont;store.set('ybt-explanation-font',expFont);}
changeExp(expFont);
$('exp-smaller').onclick=()=>changeExp(expFont-2);$('exp-larger').onclick=()=>changeExp(expFont+2);$('exp-font').oninput=e=>changeExp(+e.target.value);$('exp-close').onclick=()=>explanation.close();
function scrollExp(dir){$('explanation-body').scrollBy({top:dir*Math.max(100,$('explanation-body').clientHeight*.8),behavior:'smooth'});}
$('exp-up').onclick=()=>scrollExp(-1);$('exp-down').onclick=()=>scrollExp(1);
function explanationHTML(q){
 const answer=q.options.find(o=>o.key===q.answer);
 const entries=q.enrichment.map(e=>'<section class="expression"><h4>'+esc(e.phrase)+'</h4><p>'+esc(e.meaning)+'</p>'+(e.usage&&e.usage!=='结合本题的主语、空格位置及上下文应用上述规则。'?'<p class="usage">'+esc(e.usage)+'</p>':'')+(e.example?'<p class="example">'+esc(e.example)+'</p>':'')+(e.translation?'<p class="translation">'+esc(e.translation)+'</p>':'')+(e.contrast?'<p class="usage">辨析 · '+esc(e.contrast)+'</p>':'')+'</section>').join('');
 return '<h3>'+(q.invalid?'待确认题目':'参考答案')+'</h3><p class="answer-line">'+esc(q.answer)+(answer?' · '+esc(answer.text):'')+'</p>'+(q.examNote?'<p class="exam-note">'+esc(q.examNote)+'</p>':'')+'<h3>判断依据与解析</h3><p>'+esc(q.reason)+'</p>'+(q.worked?'<h3>代入检查</h3><p class="worked">'+esc(q.worked)+'</p>'+(q.worked.includes('∅')?'<p class="translation">∅ 表示此处不填任何词。</p>':''):'')+(q.optionNotes?.length?'<h3>逐项辨析</h3>'+q.optionNotes.map(o=>'<section class="option-explanation"><strong>'+esc(o.key)+' · '+esc(o.text)+'</strong><p>'+esc(o.reason)+'</p></section>').join(''):'')+(q.essay?'<h3>书面表达参考范文</h3><p>'+esc(q.essay)+'</p>':'')+(q.evidence?'<h3>原文依据</h3><p class="worked">'+esc(q.evidence)+'</p>':'')+(entries?'<h3>规则、用法与例句</h3>'+entries:'');
}
showSide=function(view){sideView=view;if(!view){if(explanation.open)explanation.close();return;}
 const q=current();$('explanation-body').innerHTML=view==='context'?blocks(q.context,q.label):pageIndices().map(i=>'<section class="page-explanation"><h2>原题 '+esc(lesson.questions[i].label)+'</h2>'+explanationHTML(lesson.questions[i])+'</section>').join('');$('explanation-title').textContent=(view==='context'?'题目材料':'解析与积累')+' · 原题 '+pageIndices().map(i=>lesson.questions[i].label).join('、');$('side').hidden=true;$('layout').classList.remove('with-side');
 $('exp-material').hidden=!q.context.length;$('exp-material').textContent=view==='context'?'查看解析':'题目材料';$('exp-material').onclick=()=>{if(sideView==='context')explain();else showSide('context');};
 if(!explanation.open)explanation.showModal();$('explanation-body').scrollTop=0;$('explanation-body').focus({preventScroll:true});
};
renderSide=function(){ $('material').hidden=!current().context.length;$('side').hidden=true;$('layout').classList.remove('with-side'); };
const nav=document.createElement('aside');nav.id='question-navigation';nav.setAttribute('aria-label','题目导航');nav.hidden=true;
nav.innerHTML='<header><strong>题目导航</strong><button id="nav-close" aria-label="收起题目导航">收起 ‹</button></header><p>✓ 正确　✕ 待复习　● 已查看</p><label>跳转第 <input id="nav-number" type="number" min="1" max="'+lesson.questions.length+'" value="1" aria-label="题目序号"> 题 <button id="nav-go">前往</button></label><div id="nav-grid" class="question-grid"></div>';
$('workspace').prepend(nav);
document.addEventListener('pointerdown',e=>{if(!nav.hidden&&!nav.contains(e.target)&&!$('picker').contains(e.target))toggleNav(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!nav.hidden)toggleNav(false);});
function updateNav(){ $('nav-grid').innerHTML=lesson.questions.map((q,i)=>{const s=states[q.label]||{};return '<button title="第 '+(i+1)+' 题 · 原题 '+esc(q.label)+'" aria-label="第 '+(i+1)+' 题，原题 '+esc(q.label)+'" '+(i===index?'aria-current="true"':'')+' class="'+(q.invalid?'pending':s.result||s.revealed&&'revealed'||'')+' '+(i===index?'current':'')+'" data-go="'+i+'">'+(i+1)+(q.invalid?' ?':s.result==='good'?' ✓':s.result==='bad'?' ✕':s.revealed?' ●':'')+'</button>';}).join('');$('nav-number').value=index+1;nav.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{index=+b.dataset.go;render();}); }
function toggleNav(open){nav.hidden=!open;$('picker').setAttribute('aria-expanded',String(open));if(open)updateNav();}
picker=function(){toggleNav(nav.hidden);};$('picker').onclick=picker;$('picker').setAttribute('aria-controls','question-navigation');$('nav-close').onclick=()=>toggleNav(false);
$('nav-go').onclick=()=>{const n=Number($('nav-number').value);if(Number.isInteger(n)&&n>=1&&n<=lesson.questions.length){index=n-1;render();}};$('nav-number').onkeydown=e=>{if(e.key==='Enter')$('nav-go').click();};
const originalRender=render;render=function(){clearPresenterSelection();if(explanation.open)explanation.close();originalRender();updateNav();};
const originalStats=renderStats;renderStats=function(){originalStats();updateNav();};
let lastMove=-Infinity,unlockTimer;const originalMove=move;
move=function(delta){const now=performance.now();if(now-lastMove<800)return;lastMove=now;originalMove(delta);$('next').disabled=true;$('prev').disabled=true;clearTimeout(unlockTimer);unlockTimer=setTimeout(()=>{$('next').disabled=false;$('prev').disabled=presentationPages[0].includes(index);},800);};
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);
// Presenter buttons use the short Tab / Enter key events; OS window shortcuts remain untouched.
let selectedPresenterControl=null,lastEnter=-Infinity;
function clearPresenterSelection(){if(selectedPresenterControl){selectedPresenterControl.classList.remove('presenter-focus');if(document.activeElement===selectedPresenterControl)selectedPresenterControl.blur();}selectedPresenterControl=null;}
function presenterChoices(){return [...document.querySelectorAll('.option:not(:disabled)')].filter(b=>!b.hidden&&!b.disabled);}
function focusPresenterChoice(reverse=false){const choices=presenterChoices();if(!choices.length)return;const pos=choices.indexOf(selectedPresenterControl);const next=pos<0?(reverse?choices.length-1:0):(pos+(reverse?-1:1)+choices.length)%choices.length;clearPresenterSelection();selectedPresenterControl=choices[next];selectedPresenterControl.classList.add('presenter-focus');selectedPresenterControl.focus({preventScroll:true});selectedPresenterControl.scrollIntoView({block:'nearest',inline:'nearest'});}
function enterPresenter(){const now=performance.now();if(now-lastEnter<800)return;lastEnter=now;const selected=selectedPresenterControl;clearPresenterSelection();if(selected&&!selected.disabled){selected.click();return;}const choices=presenterChoices();if(choices.length){focusPresenterChoice();return;}if(current().mode==='choice')return;if(pageIsRevealed())explain();else reveal();}
$('show-answer').onclick=reveal;
document.addEventListener('pointerdown',()=>clearPresenterSelection());
explanation.addEventListener('close',()=>{clearPresenterSelection();const active=document.activeElement;if(active&&active!==document.body&&active.blur)active.blur();});
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 const active=document.activeElement,k=e.key.toLowerCase();
 if(/INPUT|TEXTAREA|SELECT/.test(active.tagName)||active.isContentEditable)return;
 const next=['arrowright','arrowdown','pagedown',' '].includes(k),prev=['arrowleft','arrowup','pageup','backspace'].includes(k);
 if(explanation.open){
  if(k==='enter'){
   // A focused dialog control keeps native activation; Enter on its content returns to the question.
   if(active.closest('button,a')){if(e.repeat)e.preventDefault();return;}
   e.preventDefault();e.stopImmediatePropagation();const now=performance.now();if(!e.repeat&&now-lastEnter>=800){lastEnter=now;explanation.close();}return;
  }
  if(['j','b','.'].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)explanation.close();return;}
  if(next||prev){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)scrollExp(next?1:-1);}return;
 }
 if($('dialog').open||!nav.hidden)return;
 if(k==='tab'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)focusPresenterChoice(e.shiftKey);return;}
 if(k==='enter'){
  e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)enterPresenter();return;
 }
 if(next||prev){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)move(next?1:-1);}
 else if(['j','b','.'].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)explain();}
},true);
reference=function(){modal('讲义与说明','<p><strong>修订版操作：</strong>解析与材料以大对话框显示；解析字号独立保存。点击左下角图标展开导航，点击区域外收起。翻页后锁定 0.8 秒，防止连点跳题。上下翻页键切题；Tab 只轮选当前题可用选项，Enter 确认选项；未轮选时 Enter 仅定位首个选项，不猜选答案。非选择题用 Enter 逐个显示答案，全部显示后再按 Enter 打开解析；长按下翻页键（B/句号）仍开关解析。解析打开时翻页键滚动，Esc 关闭。</p>'+ (lesson.reference.length?blocks(lesson.reference):'')+'<h3>来源</h3><p>'+esc(lesson.source)+'</p>'+lesson.notes.map(n=>'<p>'+esc(n)+'</p>').join(''));};$('reference').onclick=reference;
// Preserve the chosen question font across questions and window resizes.
fit=function(reset=true){cancelAnimationFrame(fitFrame);if(reset)setFont(preferred);};

const requested=new URLSearchParams(location.hash.slice(1)).get('q');if(requested){const target=lesson.questions.findIndex(q=>q.label===requested);if(target>=0)index=target;}
render();
})();
