import {lookupWord, wordAtOffset, normalizeWord, validWord} from './dictionary-data.js';

const scope = '.stem,.option-text,#passage-content,#explanation-body,#dialog-body,.side-content';
const dialog = document.createElement('dialog');
dialog.id = 'dictionary-dialog';
dialog.setAttribute('aria-labelledby', 'dictionary-title');
dialog.innerHTML = `<header class="dictionary-heading"><div><p>随读随查 · 内置英汉词典</p><h2 id="dictionary-title">查一个单词</h2></div><button type="button" id="dictionary-close" aria-label="关闭词典">×</button></header>
 <form id="dictionary-form" role="search"><label class="dictionary-sr" for="dictionary-input">输入英文单词</label><input id="dictionary-input" type="search" placeholder="输入英文单词" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="80"><button type="submit">查询</button></form>
 <div id="dictionary-result" aria-live="polite" aria-atomic="true"></div>
 <footer class="dictionary-footer"><span>词库：<a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener noreferrer">ECDICT</a> · <a href="https://github.com/skywind3000/ECDICT/blob/master/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a></span><a id="dictionary-online" target="_blank" rel="noopener noreferrer" hidden>有道在线查词 ↗</a></footer>`;
document.body.append(dialog);
const input = dialog.querySelector('#dictionary-input');
const result = dialog.querySelector('#dictionary-result');
const online = dialog.querySelector('#dictionary-online');
let generation = 0;
let returnFocus = null;

function element(tag, className, text) {
 const node = document.createElement(tag);
 if (className) node.className = className;
 if (text) node.textContent = text;
 return node;
}
const exchangeLabels = {p:'过去式', d:'过去分词', i:'现在分词', '3':'第三人称单数', r:'比较级', t:'最高级', s:'复数'};
const tagLabels = {zk:'中考', gk:'高考', cet4:'四级', cet6:'六级', ky:'考研', toefl:'托福', ielts:'雅思', gre:'GRE'};
function renderEntry(entry, related) {
 const section = element('section', 'dictionary-entry');
 if (related) section.append(element('p', 'dictionary-label', '原形释义'));
 section.append(element('h3', '', entry.word));
 if (entry.phonetic) section.append(element('p', 'dictionary-phonetic', `/${entry.phonetic}/`));
 const tags = entry.tag.split(' ').map(tag => tagLabels[tag]).filter(Boolean);
 if (tags.length) section.append(element('p', 'dictionary-tags', tags.join(' · ')));
 section.append(element('p', 'dictionary-translation', entry.translation));
 const forms = entry.exchange.split('/').map(part => {
  const [kind, value] = part.split(':');
  return exchangeLabels[kind] && value ? `${exchangeLabels[kind]} ${value}` : '';
 }).filter(Boolean);
 if (forms.length) section.append(element('p', 'dictionary-forms', forms.join(' · ')));
 if (entry.definition) {
  const details = element('details');
  details.append(element('summary', '', '英文释义'), element('p', 'dictionary-definition', entry.definition));
  section.append(details);
 }
 return section;
}
async function queryWord(value) {
 const request = ++generation;
 const query = normalizeWord(value);
 online.hidden = !validWord(query);
 if (!online.hidden) online.href = 'https://m.youdao.com/dict?le=eng&q=' + encodeURIComponent(query);
 result.setAttribute('aria-busy', 'true');
 result.replaceChildren(element('p', 'dictionary-message', '正在查询内置词库…'));
 try {
  const data = await lookupWord(query);
  if (request !== generation || !dialog.open) return;
  result.replaceChildren();
  if (data.invalid) result.append(element('p', 'dictionary-message', '请输入一个英文单词，可包含连字符或英文撇号。'));
  else if (!data.entries.length) result.append(element('p', 'dictionary-message', `内置词库未收录“${query}”。可尝试单词原形，或使用下方有道在线查词。`));
  else data.entries.forEach((entry, index) => result.append(renderEntry(entry, index > 0 || normalizeWord(entry.word) !== query)));
 } catch {
  if (request !== generation || !dialog.open) return;
  result.replaceChildren(element('p', 'dictionary-message', '内置词库暂时无法读取。请点击“查询”重试，或使用下方有道在线查词。'));
 } finally {
  if (request === generation) result.setAttribute('aria-busy', 'false');
 }
}
function openDictionary(word = '') {
 if (!dialog.open) {
  returnFocus = document.activeElement;
  dialog.showModal();
 }
 input.value = word;
 // A reading gesture should not summon the phone's onscreen keyboard.
 if (word) dialog.querySelector('#dictionary-close').focus({preventScroll:true});
 else {input.focus({preventScroll:true}); input.select();}
 if (word) queryWord(word);
 else {
  ++generation;
  online.hidden = true;
  result.setAttribute('aria-busy', 'false');
  result.replaceChildren(element('p', 'dictionary-message', '长按英文约半秒，即可查看释义。也可以在这里输入单词查询。'));
 }
}
dialog.querySelector('#dictionary-form').addEventListener('submit', event => {
 event.preventDefault();
 queryWord(input.value);
});
dialog.querySelector('#dictionary-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
 if (event.target !== dialog) return;
 const rect = dialog.getBoundingClientRect();
 if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
 ++generation;
 result.setAttribute('aria-busy', 'false');
 if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
});
// Intercept before the presenter's document handlers, while retaining native form and Tab behavior.
window.addEventListener('keydown', event => {
 if (!dialog.open) return;
 event.stopImmediatePropagation();
 if (event.key === 'Escape') {event.preventDefault(); dialog.close();}
}, true);

const trigger = element('button', '', '词典');
trigger.id = 'dictionary-open';
trigger.type = 'button';
trigger.title = '打开词典；长按英文约半秒可直接查词';
trigger.setAttribute('aria-haspopup', 'dialog');
trigger.setAttribute('aria-controls', dialog.id);
trigger.addEventListener('click', () => openDictionary());
document.querySelector('.floating-tools').insertBefore(trigger, document.getElementById('fullscreen'));

function wordAtPoint(x, y) {
 const hit = document.elementFromPoint(x, y);
 const container = hit?.closest(scope);
 if (!container || hit.closest('input,textarea,select,a,[contenteditable="true"]')) return null;
 let node, offset;
 if (document.caretPositionFromPoint) {
  const caret = document.caretPositionFromPoint(x, y);
  node = caret?.offsetNode; offset = caret?.offset;
 } else {
  const caret = document.caretRangeFromPoint?.(x, y);
  node = caret?.startContainer; offset = caret?.startOffset;
 }
 if (node?.nodeType !== Node.TEXT_NODE || !container.contains(node)) return null;
 // A caret can land on either side of a glyph. Test both, but require the actual glyph rectangle.
 for (const index of [offset, offset - 1]) {
  if (index < 0 || index >= node.length) continue;
  const token = wordAtOffset(node.textContent, index);
  if (!token) continue;
  const glyph = document.createRange();
  glyph.setStart(node, index); glyph.setEnd(node, index + 1);
  if (![...glyph.getClientRects()].some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) continue;
  return token;
 }
 return null;
}
let press = null, suppress = null;
function cancelPress() {if (press) clearTimeout(press.timer); press = null;}
document.addEventListener('pointerdown', event => {
 if (press) {cancelPress(); return;}
 if (dialog.open || event.button !== 0 || !event.isPrimary) return;
 const token = wordAtPoint(event.clientX, event.clientY);
 if (!token) return;
 const pending = {id:event.pointerId, target:event.target, x:event.clientX, y:event.clientY};
 pending.timer = setTimeout(() => {
  if (press !== pending) return;
  suppress = {id:pending.id, target:pending.target, until:Date.now() + 1500};
  window.getSelection()?.removeAllRanges();
  openDictionary(token.word);
 }, 520);
 press = pending;
}, true);
document.addEventListener('pointermove', event => {
 if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
}, true);
document.addEventListener('pointerup', event => {
 if (suppress?.id === event.pointerId && suppress.until > Date.now()) {
  // Consume the release before an option is answered or the explanation's tap handler closes it.
  event.preventDefault(); event.stopImmediatePropagation();
  suppress.until = Date.now() + 100;
 }
 cancelPress();
}, true);
document.addEventListener('click', event => {
 if (suppress && suppress.until > Date.now() && event.detail !== 0) {
  event.preventDefault(); event.stopImmediatePropagation(); suppress = null;
 }
}, true);
document.addEventListener('pointercancel', cancelPress, true);
document.addEventListener('scroll', cancelPress, true);
window.addEventListener('blur', cancelPress);
document.addEventListener('contextmenu', event => {
 if (press || (suppress && suppress.until > Date.now())) event.preventDefault();
}, true);
