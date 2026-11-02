#!/usr/bin/env python3
"""Import the two user-supplied PDFs. Requires Poppler and pdfplumber.
Usage: python3 scripts/import-danzhao-2025.py QUESTIONS.pdf ANSWERS.pdf
Existing lessons are retained; IDs make repeated imports idempotent.
"""
import sys, re, json, subprocess, hashlib
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[1]
PREFIX='builtin-danzhao2025-'
STAMP='2026-11-02T00:00:00.000Z'
question_pdf,answer_pdf=map(Path,sys.argv[1:3])
def extract(path):
    raw=subprocess.check_output(['pdftotext','-layout',str(path),'-'],text=True)
    pages=[]
    for number,page in enumerate(raw.split('\f'),1):
        lines=page.splitlines()
        # Printed footer is the last nonblank line; keep numeric text inside passages.
        last=next((i for i in range(len(lines)-1,-1,-1) if lines[i].strip()),None)
        if last is not None and re.fullmatch(r'\s*\d+\s*',lines[last]): lines[last]=''
        pages.extend((number,line.rstrip()) for line in lines)
    return pages
qlines=extract(question_pdf); alines=extract(answer_pdf)
qt='\n'.join(l for _,l in qlines); at='\n'.join(l for _,l in alines)
def flat(t): return re.sub(r'\s+',' ',t).strip()
def blocks(t):
    return [{'type':'p','text':flat(p)} for p in re.split(r'\n\s*\n',t.strip()) if flat(p)]
def sections(t,pattern):
    matches=list(re.finditer(pattern,t,re.M))
    return [(m,t[m.end():matches[i+1].start() if i+1<len(matches) else len(t)]) for i,m in enumerate(matches)]
part1,part2,part3=re.split(r'^\s*第[二三]部分 阅读理解[^\n]*$',qt,flags=re.M)[-3:]
a1,a2,a3=re.split(r'^\s*第[二三]部分 阅读理解[^\n]*$',at,flags=re.M)
head=r'^\s*(\d+)\.\s*(冠词|名词|介词|数词|代词|形容词/副词|情态动词|非谓语动词|时态|被动语态|祈使句/感叹句|连词|定语从句|宾语从句)\s*$'
answer_sections={int(m[1]):(m[2],text) for m,text in sections(a1,head)}
lessons=[];issues=[]
def question(label,stem,options,answer='',reason='',kind='single_choice',context=None,issue=''):
    invalid=bool(issue) or not answer
    return dict(label=str(label),stem=stem,options=options,context=context or [],section={'single_choice':'语法单项选择','reading':'阅读理解选择题','translation':'阅读理解翻译题'}[kind],answer=answer or '待确认',reason=reason,accepted=[answer] if answer and not invalid and options else [],invalid=invalid,ambiguous=False,mode='input' if kind=='translation' else 'choice',questionType=kind,enrichment=[],reviewed=not invalid,reviewStatus='needs_review' if invalid else 'ok',examNote=issue)
def lesson(suffix,title,topic,questions,notes,reference=None):
    return dict(id=PREFIX+suffix,title=title,topic=topic,source=question_pdf.name,answerSource=answer_pdf.name,notes=notes,reference=reference or [],questions=questions,home='/',originalId=f'danzhao-2025/{suffix}',sourceType='builtin',status='ready',createdAt=STAMP,updatedAt=STAMP,images=[],ocrText='',version=1)
base_notes=['来源：'+question_pdf.name+'；参考答案：'+answer_pdf.name+'。','保留原题内容及题号；未提供逐题解析，不把答案表当作解析。存疑题标为待核对，暂不计分。']
def parse_choice(text):
    text=re.sub(r'\bD\s+along\b','D．along',text)
    opts=list(re.finditer(r'(?<![A-Z])([A-D])[．.、]\s*',text))
    if not opts and re.search(r'A\s+B\s+C\s+D',text):
        return flat(re.split(r'\n\s*A\s+B\s+C\s+D',text)[0]),[dict(key=k,text='见原图 '+k+' 项结构图') for k in 'ABCD']
    assert opts, 'No options: '+text[:100]
    stem=flat(text[:opts[0].start()])
    options=[dict(key=m[1],text=flat(text[m.end():opts[i+1].start() if i+1<len(opts) else len(text)])) for i,m in enumerate(opts)]
    assert [o['key'] for o in options]==list('ABCD')[:len(options)], (stem,options)
    assert all(o['text'] for o in options),(stem,options)
    return stem,options
for m,text in sections(part1,head):
    num,title=int(m[1]),m[2]
    ans=answer_sections[num][1]
    # The supplied answer PDF prints 226.B between 25 and 27 in 定语从句.
    if num==13:
        assert '226.B' in ans
        ans=ans.replace('226.B','26.B')
        issues.append(dict(section=title,label='26',type='answer-number-typo',detail='答案表原印226.B，按25、27间的序号及题库26题配对为26.B。'))
    am=list(re.finditer(r'(\d+)\.\s*([A-D](?:/[A-D])?)(?:\s*（([^）]*)）)?',ans))
    answers={int(x[1]):(x[2],x[3] or '') for x in am}
    qm=list(re.finditer(r'^\s*(\d{1,2})[ \t]*[．.]\s*',text,re.M))
    qs=[]
    for i,qm0 in enumerate(qm):
        n=int(qm0[1]); raw=text[qm0.end():qm[i+1].start() if i+1<len(qm) else len(text)]
        stem,opts=parse_choice(raw); answer,note=answers[n]
        issue=''
        if '/' in answer:
            issue='原答案表标注 '+answer+'（'+note+'）；本题为单项选择，存在多个可选答案，暂不计分。'
            issues.append(dict(section=title,label=str(n),type='alternative-answers',detail=issue))
            reason=issue;answer=''
        else: reason='参考答案：'+answer+'。'+('答案表备注：'+note+'。' if note else '')+'原答案文件未提供逐题解析。'
        assert not answer or answer in [o['key'] for o in opts], (title,n,answer,opts)
        qs.append(question(n,stem,opts,answer,reason,issue=issue))
    assert [int(q['label']) for q in qs]==list(range(1,len(qs)+1)),title
    assert len(qs)==len(answers),(title,len(qs),len(answers))
    lessons.append(lesson(f'grammar-{num:02}',f'2025单招1000题 · {num:02} {title}','21 单招1000题 · 语法',qs,base_notes))
# Unnumbered answer rows cannot safely be assigned to 50 passages: retain them in the audit report.
reading_answers=[re.findall(r'[1-5]\.\s*([A-D])',l) for l in a2.splitlines() if re.search(r'1\.[A-D]',l)]
assert len(reading_answers)==46 and all(len(row)==5 for row in reading_answers)
reading_issue='答案PDF的阅读选择部分只有46行答案，未标明篇号，题库有50篇；缺行位置无法确定，未按行号套用答案。请老师核对，此题暂不计分。'
for m,text in sections(part2,r'^\s*第\s*(\d+)\s*篇\s*$'):
    n=int(m[1])
    if n==16: text=text.replace('How many events are there in Figure Skating', '1．How many events are there in Figure Skating')
    qm=list(re.finditer(r'^\s*([1-5])[．.]\s*(?=\S)',text,re.M))
    assert len(qm)==5,(n,len(qm))
    context=blocks(text[:qm[0].start()]); assert context
    qs=[]
    for i,qm0 in enumerate(qm):
        stem,opts=parse_choice(text[qm0.end():qm[i+1].start() if i+1<len(qm) else len(text)])
        qs.append(question(qm0[1],stem,opts,kind='reading',context=context,reason=reading_issue,issue=reading_issue))
    lessons.append(lesson(f'reading-{n:02}',f'2025单招1000题 · 阅读选择 第{n:02}篇','22 单招1000题 · 阅读选择',qs,base_notes+[reading_issue]))
# Capture actual underlined text, including fragments and line continuations.
# These overrides address source line wrapping, numbering errors, and underline fragments
# on mixed Chinese/English baselines. Text is preserved from the question PDF.
fixes={
1:["When you go for a run outside, chances are that you'll find litter (垃圾) all around you.",'你是直接走过去，还是停下来捡起来?','What a plogger needs is a rubbish bag and a pair of gloves to protect your hands.','It can not only make the world greener, but also get you full body exercise','你的身体和环境会感谢你的。'],
6:['他在伦敦附近的一个小城市上学','He had a bad illness that stopped him from moving and talking.','To communicate with others, he moved two fingers to control the computer’s mouse.','然而，这并没有阻止我在工作上取得成功。','You just have to do the best you can in your own situation.'],
11:['Finally, if we connect our exercise with a healthy diet, we will look healthier and feel more confident about ourselves.','听起来很不错，不是吗?','Start small！','Choose an activity that not only exercises your body, but that you also enjoy.','这样，你就绝不会放弃了!'],
12:['However, the Palace Museum has designed some cultural and creative products.','产品可以带来很大的收益.','这是一个非常有趣的应用程序，它有很多用户.','They say that they can learn a lot about Chinese history and culture by watching the documentary.','China encourages more and more museums to take different measures (措施) to make young people interested in Chinese history and culture.'],
14:['“A child with a mother is like a treasure.”','She is a mother who is common and wants nothing in return at all.','她成功地实现了自己的诺言.','母亲在我们的生活中扮演着重要的角色.','Full love in their eyes, bright light in their hearts.'],
15:['它既方便又高效.','It was one of the legends（传说）about chopsticks.','They are regarded as one of the symbols of Chinese food culture.','此外，筷子是成对使用的.','The influence of Chinese culture has stretched（延伸）far and wide.'],
16:['Courage is often thought to be one of the important spirits everyone needs.','Courage always stands side by side with fear.','勇气存在于我们每天所做的选择中.','Learning to fail is another important part of courage.','我明天再试试！'],
18:['Plastic brings us convenience, and pollution as well.','那我们该怎么办呢?','Use a glass or metal cup instead of a plastic one.','塑料无处不在.','All in all, we should use plastic products properly.'],
27:['In recent years, with the development of technology, many popular apps（应用程序）have been produced.','一款应用程序引发了广泛的关注','抖音，一款视频分享应用程序。',"Now it is many people's favorite app, especially the young.",'With Douyin, users can record videos, edit（编辑）them and share them online.']}
translation_answers={int(m[1]):{int(a[1]):flat(a[2]) for a in re.finditer(r'^\s*([1-5])\.\s*(.*?)(?=^\s*[1-5]\.\s*|\Z)',text,re.M|re.S)} for m,text in sections(a3,r'^\s*第\s*(\d+)\s*篇\s*$')}
targets={}
with pdfplumber.open(question_pdf) as pdf:
    for page_idx in range(115,145):
        p=pdf.pages[page_idx]; groups=[]
        for line in sorted(p.lines,key=lambda l:(l['top'],l['x0'])):
            chars=[c for c in p.chars if c['x0']>=line['x0']-1 and c['x1']<=line['x1']+1 and abs(line['top']-c['bottom'])<5]
            if not chars: continue
            t=pdfplumber.utils.extract_text(chars,x_tolerance=1.5,y_tolerance=3)
            before=[c for c in p.chars if c['x1']<=line['x0']+0.3 and abs(line['top']-c['bottom'])<5]
            prefix=pdfplumber.utils.extract_text(before,x_tolerance=1.5,y_tolerance=3)
            marker=re.search(r'([1-5])\s*\.\s*$',prefix)
            if marker: groups.append([int(marker[1]),t])
            elif groups: groups[-1][1]+=' '+t
        n=page_idx-114
        if n in fixes: targets[n]=fixes[n]
        elif n==10: targets[n]=[t for _,t in groups] # Source repeats number 4 for its third target.
        else:
            groups.sort(key=lambda g:g[0]);assert [g[0] for g in groups]==[1,2,3,4,5],(n,groups)
            targets[n]=[t for _,t in groups]
for m,text in sections(part3,r'^\s*第\s*(\d+)\s*篇\s*$'):
    n=int(m[1]); passage=re.split(r'^\s*1\.\s*$',text,flags=re.M)[0]
    context=blocks(passage);qs=[]
    assert len(targets[n])==5 and len(translation_answers[n])==5
    for i,target in enumerate(targets[n],1):
        target=flat(target)
        # Remove CJK spacing introduced at PDF line wraps, without altering English words.
        target=re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])','',target)
        direction='汉译英' if len(re.findall('[A-Za-z]',target))<len(re.findall('[\u4e00-\u9fff]',target)) else '英译汉'
        qs.append(question(i,f'【{direction}】{target}',[],translation_answers[n][i],'参考译文来自配套答案PDF；翻译为开放作答，其他准确表达也可。',kind='translation',context=context))
    extra=['各题直接列出原文划线文字；保留完整篇章，答案为参考译文。']
    if n in [10,19]: extra+=['原文划线序号存在错印或排版次序问题，按内容与配套译文对应为第1—5题。']
    lessons.append(lesson(f'translation-{n:02}',f'2025单招1000题 · 阅读翻译 第{n:02}篇','23 单招1000题 · 阅读翻译',qs,base_notes+extra))
# Preserve table layout and image-based questions using the existing source-image viewer.
starts={};part=1
for page,line in qlines:
    if re.search(r'第二部分 阅读理解.*50',line): part=2
    if re.search(r'第三部分 阅读理解.*30',line): part=3
    match=re.fullmatch(r'\s*第\s*(\d+)\s*篇\s*',line)
    if part==2 and match: starts[int(match[1])]=page
assets=ROOT/'public/builtin-assets/danzhao-2025';assets.mkdir(parents=True,exist_ok=True)
for n in [3,16,22,29]:
    doc=next(d for d in lessons if d['id']==PREFIX+f'reading-{n:02}')
    for page in range(starts[n],starts[n+1]):
        filename=f'reading-{n:02}-page-{page:03}'
        subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1800','-png',str(question_pdf),str(assets/filename)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        doc['images'].append(dict(id=f'page-{page}',name=f'题库原始PDF第{page}页',url=f'/builtin-assets/danzhao-2025/{filename}.png'))
    for q in doc['questions']:
        q['materialFallback']='images'
    doc['notes'].append('原文包含表格或图片题；演示时展示原始PDF页面以保留表格、配图和图形选项。')
assert len(lessons)==94 and sum(len(d['questions']) for d in lessons)==1000
seed=ROOT/'seed/lessons.json';old=json.loads(seed.read_text());retained=[d for d in old if not d['id'].startswith(PREFIX)]
assert len({d['id'] for d in retained+lessons})==len(retained)+len(lessons)
seed.write_text(json.dumps(retained+lessons,ensure_ascii=False,separators=(',',':')))
subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs';import {cleanLessonText} from './public/content-format.js';const file='seed/lessons.json';const docs=JSON.parse(fs.readFileSync(file));fs.writeFileSync(file,JSON.stringify(docs.map(d=>d.id.startsWith('builtin-danzhao2025-')?cleanLessonText(d):d)));"],cwd=ROOT,check=True)
report=dict(sourceFiles=[dict(name=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in [question_pdf,answer_pdf]],newLessons=len(lessons),newQuestions=1000,sections=dict(grammar=600,reading=250,translation=150),totalLessons=len(retained+lessons),totalQuestions=sum(len(d['questions']) for d in retained+lessons),pending=sum(q['invalid'] for d in lessons for q in d['questions']),issues=issues,readingAnswerIssue=reading_issue,unassignedReadingAnswerRows=reading_answers)
(ROOT/'review/danzhao-2025-import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['unassignedReadingAnswerRows','issues','sourceFiles']},ensure_ascii=False))
