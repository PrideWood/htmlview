import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneFrameHTML,phoneLibraryRowsHTML,phoneLessonHTML,phoneReaderHTML,phoneQuestionPickerHTML} from '../public/phone-library.js';

const question={label:'36',questionType:'sentence_completion',mode:'choice',stem:'Which sentence fits?',answer:'B',reason:'Read the passage.',options:[{key:'A',text:'One.'},{key:'B',text:'Two.'}],context:[{type:'p',text:'A complete passage.\nSecond line.'},{type:'table',rows:[['Day','Time'],['Mon','10:00']]}],enrichment:[],reviewed:true};
const lesson={id:'builtin-example',title:'Reading <A>',topic:'英语 / 阅读',status:'ready',sourceType:'builtin',questions:[question,{...question,label:'37'}],images:[]};
const list=[{...lesson,count:2},{id:'custom',title:'手机练习',topic:'词汇',sourceType:'document',status:'draft',count:3},{id:'trash',title:'已删除',topic:'词汇',status:'trashed',count:1}];

test('手机下方导航固定包含上传和资料演示两项，并标记当前页',()=>{
 const html=phoneFrameHTML('<main>content</main>','library');
 assert.equal((html.match(/data-phone-route=/g)||[]).length,2);
 assert.match(html,/data-phone-route="upload"/);
 assert.match(html,/data-phone-route="library" aria-current="page"/);
});
test('手机菜单按专题逐层展开，搜索可跨专题查找，默认不显示回收站',()=>{
 const root=phoneLibraryRowsHTML(list);
 assert.match(root,/library\/%E8%8B%B1%E8%AF%AD%20%2F%20%E9%98%85%E8%AF%BB/);
 assert.doesNotMatch(root,/已删除|data-phone-route="lesson\//);
 const topic=phoneLibraryRowsHTML(list,{topic:'英语 / 阅读'});
 assert.match(topic,/lesson\/builtin-example/);assert.doesNotMatch(topic,/手机练习/);
 const search=phoneLibraryRowsHTML(list,{search:'手机'});
 assert.match(search,/lesson\/custom/);assert.doesNotMatch(search,/builtin-example/);
 assert.match(phoneLibraryRowsHTML([{id:'none',title:'未分类练习',topic:'',count:1,status:'draft'}],{topic:'未分类'}),/未分类练习/);
});
test('浏览内置题库只提供阅读路由，复制是明确的编辑动作',()=>{
 const html=phoneLessonHTML(lesson);
 assert.match(html,/read\/builtin-example\/0/);
 assert.match(html,/data-phone-edit="builtin-example"/);
 assert.match(html,/复制并编辑/);
 assert.doesNotMatch(html,/data-edit=|\/copy/);
 assert.match(html,/Reading &lt;A&gt;/);
});
test('手机阅读保留全文、表格、选项和参考解析，支持逐题切换',()=>{
 const html=phoneReaderHTML(lesson,0);
 for(const text of ['A complete passage.','Second line.','Mon','10:00','Which sentence fits?','Read the passage.','One.','Two.'])assert.ok(html.includes(text),text);
 assert.match(html,/<table>/);assert.match(html,/class="phone-answer"/);
 assert.match(html,/read\/builtin-example\/1/);
 assert.match(html,/data-phone-route="read\/builtin-example\/-1" disabled/);
 assert.match(phoneReaderHTML(lesson,1),/data-phone-route="read\/builtin-example\/2" disabled/);
 const unsafe=phoneReaderHTML({...lesson,questions:[{...question,stem:'<script>alert(1)</script>'}]});
 assert.doesNotMatch(unsafe,/<script>/);assert.match(unsafe,/&lt;script&gt;/);
});
test('手机校对使用原生选题框，全部原题号与校对状态可访问',()=>{
 const html=phoneQuestionPickerHTML(lesson,1);
 assert.equal((html.match(/<option /g)||[]).length,2);
 assert.match(html,/value="1" selected/);assert.match(html,/原题 37 ✓/);
});
