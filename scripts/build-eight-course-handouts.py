import json, re, copy, hashlib, argparse, os
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='同步生成八课教师讲义与课堂演示资料')
parser.add_argument('--output', type=Path, default=PROJECT/'handouts'/'eight-course', help='Markdown讲义输出目录')
OUT = parser.parse_args().output.resolve()
(OUT/'分课教师版').mkdir(parents=True,exist_ok=True)
seed = PROJECT / 'seed'
bank = json.loads((seed/'lessons.json').read_text()) + json.loads((seed/'selected-papers.json').read_text())
allbank = bank + [json.loads((seed/'english-monthly-exam.json').read_text())]
teaching = json.loads((seed/'eight-course-teaching.json').read_text())
course_docs=[]

# 数字为源资料在合并清单中的位置、题目在该资料中的位置（从1开始）。
plans = [
 dict(title='语音、冠词、名词与数词', focus='先辨词类，再看数量与限定',
      singles=[(1,3,'不发音的 h'),(149,1,'an 与元音音素'),(149,4,'a 与辅音音素'),(149,3,'零冠词固定搭配'),(145,1,'不可数名词的计量'),(145,3,'experience 的可数性'),(52,10,'复合名词的复数'),(52,6,'时间名词所有格'),(147,1,'具体数词与 thousand'),(12,8,'基数词与序数词')],
      cloze=(161,0,10), reading=164, ctitle='爷爷的生日', rtitle='电影放映信息', difficulty='基础',
      goals='区分字母与音素；识别单复数、不可数名词和所有格；用年龄与票价条件完成信息计算。',
      key='单选2、3对比 hour 与 university 的起始音；单选8说明 forty minutes’；阅读4先判年龄条件，再算票价。',
      exit='口头解释为什么是 an hour，却是 a university；写出三十分钟步行路程的表达。',
      words='birthday 生日；Beijing Opera 京剧；adult 成年人；under 在……以下；free 免费的'),
 dict(title='代词、介词与指代链', focus='每个代词都要找到所指对象',
      singles=[(146,2,'another 与其他代词'),(146,3,'everybody 与部分否定'),(146,4,'it 作形式宾语'),(55,10,'两者中的另一个'),(55,9,'名词性物主代词'),(55,11,'反身代词'),(148,1,'具体日期用 on'),(148,2,'of sb 与品质评价'),(148,4,'on the left'),(53,12,'with 与 in 作定语')],
      cloze=(45,10,20), reading=163, ctitle='我的朋友 Peter', rtitle='茶与咖啡', difficulty='基础',
      goals='把人称、物主、反身和不定代词放回句子；区分时间、方位与特征介词；通过段落功能概括主旨。',
      key='单选3画出形式宾语与真正宾语；单选1、4比较 another 和 the other；阅读5把两个主体的共同话题合并成标题。',
      exit='分别造句使用 another、the other；指出完形中 His、me、They 的所指。',
      words='helpful 乐于助人的；secondary school 中学；relieve 缓解；offer 提供；awake 醒着的'),
 dict(title='形容词、副词、比较与逻辑', focus='比较范围、词性位置与连接关系一起判断',
      singles=[(151,1,'序数词加最高级'),(151,3,'最高级的比较范围'),(151,6,'同范围比较排除自身'),(151,8,'than 与比较级'),(151,9,'population 的形容词搭配'),(56,1,'副词修饰动词与 -ly'),(56,10,'hardly 的否定意义'),(150,2,'not … until'),(150,3,'as long as 条件'),(62,10,'unless 条件')],
      cloze=(45,0,10), reading=169, ctitle='风和太阳', rtitle='颜色与英语表达', difficulty='基础至中等',
      goals='识别形容词与副词的句法作用；区分比较级与最高级；用语境而非颜色字面意思判断习语。',
      key='单选1、4、6分别圈出序数词、than、动词；完形2提醒 see sb do 与 see sb doing 都成立；阅读按颜色建立信息对应。',
      exit='解释 hard 与 hardly 的区别；把“她比班里其他任何女生都高”译成英语。',
      words='argument 争论；coat 外套；turn 轮次；expression 表达；in the pink 身体健康'),
 dict(title='时态、语态与时间线', focus='先定时间，再定主动或被动',
      singles=[(152,1,'一般现在时与第三人称单数'),(152,5,'现在完成时与不及物短语'),(152,11,'时间从句表将来'),(152,20,'一般过去时被动'),(152,22,'过去完成时'),(59,1,'过去时与过去进行时'),(59,2,'现在进行时与系表结构'),(59,7,'there be 的将来式'),(60,8,'一般将来时被动'),(39,6,'客观规律与时态')],
      cloze=(162,0,10), reading=167, ctitle='三亚之旅', rtitle='马克·吐温的假期', difficulty='中等',
      goals='对照过去、现在和过去截止点判断时态；防止给 take place 加被动；按叙事顺序定位细节。',
      key='单选2、5画时间轴；单选3与9对照从句时态和被动结构；阅读5核对 NOT 与 all year round 的范围。',
      exit='写出 build 的过去时被动与将来时被动；解释 had learned 的过去参照点。',
      words='exciting 令人兴奋的；delicious 美味的；baggage 行李；pleasant 愉快的；allow 允许'),
 dict(title='情态动词与动词短语', focus='区分能力、必要、禁止与推测',
      singles=[(37,1,'can 的否定简答'),(37,2,'must 问句的否定回答'),(37,6,'may 表可能性'),(37,8,'can’t 表否定推测'),(57,6,'mustn’t 表禁止'),(152,3,'turn down'),(152,9,'take off'),(152,12,'break down'),(152,17,'turn up'),(152,21,'rob … of 与 steal … from')],
      cloze=(45,50,60), reading=74, ctitle='合理安排作业', rtitle='机器人图书馆', difficulty='中等',
      goals='区分 needn’t 与 mustn’t；结合宾语和情境辨析短语；把礼貌请求与故事发展联系起来。',
      key='单选2、5必须比较“不必”和“禁止”；单选6—9用主语和宾语验证短语；阅读4明确是语境推断。',
      exit='分别用 needn’t、mustn’t 造句；解释完形 put off 后为何用 doing。',
      words='divide 分配；put off 推迟；habitual 习惯性的；assistant 助理；polite 有礼貌的'),
 dict(title='非谓语动词与宾语补足语', focus='先找谓语，再辨搭配和逻辑主被动',
      singles=[(153,1,'allow sb to do'),(153,2,'介词 to 后的动名词'),(153,3,'spend 时间 doing'),(153,4,'feel like doing'),(153,5,'动名词作主语'),(153,6,'过去分词作后置定语'),(153,8,'It’s no use doing'),(153,9,'make oneself heard'),(153,10,'have trouble doing'),(153,11,'have sth done')],
      cloze=(160,0,10), reading=165, ctitle='贫与富的乡村旅行', rtitle='一摄氏度的爱', difficulty='中等',
      goals='区分不定式、动名词与过去分词；把句法判断和上下文情感结合；分清人物误解与真实动机。',
      key='单选2中的 to 是介词；单选6、8、10都要问“谁被怎样”；阅读2与4分别回答人物当时想法和真实原因。',
      exit='比较 allow him to work、look forward to working 和 have the work finished。',
      words='cherish 珍爱；villager 村民；bankruptcy 破产；support 养活；diary 日记'),
 dict(title='复合句与从句连接词', focus='先看从句缺什么，再选连接词',
      singles=[(155,1,'定语从句缺宾语'),(155,2,'whatever 引导宾语从句'),(155,4,'which 指代前面整件事'),(155,6,'whether … or not'),(155,7,'where 作地点状语'),(64,1,'宾语从句语序与方式'),(64,3,'宾语从句时间与被动'),(64,4,'宾语从句原因与语序'),(62,12,'before 时间关系'),(152,15,'if 条件从句表将来')],
      cloze=(49,25,35), reading=75, ctitle='职场庆祝活动', rtitle='窗户与偏见', difficulty='中等至提高',
      goals='用缺失成分区分关系代词与关系副词；结合答句排除错误疑问词；识别叙事反转与寓意。',
      key='单选1 spent 后缺宾语，不能看到 days 就用 when；单选5从句主谓完整；阅读从“看不清”追踪到“自己的窗户脏”。',
      exit='解释 the days that he spent 与 the town where he grew up 的区别。',
      words='employee 员工；achievement 成就；efficiency 效率；criticize 批评；shortcoming 缺点'),
 dict(title='句式、主谓一致与综合运用', focus='从完整结构检查最后一个语法点',
      singles=[(154,1,'Let’s 的反意疑问句'),(154,2,'What 感叹句'),(154,4,'含 never 的反意疑问句'),(61,6,'祈使句用动词原形'),(150,1,'not only … but also 就近一致'),(156,1,'并列主语与过去进行时'),(157,1,'现在虚拟条件句'),(158,1,'Not until 句首部分倒装'),(159,4,'回应赞美'),(159,5,'表达同情')],
      cloze=(50,25,35), reading=166, ctitle='Lily 的节水发明', rtitle='一瓶垃圾挑战', difficulty='综合',
      goals='综合识别句式与主谓一致；掌握常见虚拟和倒装结构；用信息配对、猜词和证据排除完成篇章。',
      key='单选3先识别 never 的否定意义；单选8只倒装主句；阅读3通过 after dinner 判断 leftovers。',
      exit='改写 Not until … did …；用一句英语写下可实行的减废行动。',
      words='invention 发明；competition 比赛；attention 注意；leftovers 剩饭菜；produce 产生'),
]

changes=[]
manifest=[]

def change(q, field, old, new, why, cid):
    if field.startswith('option:'):
        k=field.split(':')[1]; item=next(o for o in q['options'] if o['key']==k)
        assert item['text']==old, (field,item['text'],old)
        item['text']=new
    elif field=='context':
        found=0
        for b in q['context']:
            if old in b.get('text',''):
                found+=1;b['text']=b['text'].replace(old,new)
        assert found==1, (cid,old,found)
    else:
        assert q[field]==old
        q[field]=new
    changes.append(dict(id=cid,field=field,before=old,after=new,reason=why))

# 只在讲义副本上改动。题库文件保持原样。
cloze_reasons={
 '爷爷的生日':[
 '后文 today he gets up at 6:30 与平时 7:00 对比，都是“起床”，选 gets up。主语 He 与 usually 对应第三人称单数。',
 '平时与今天的起床时间不同，but 表转折；because、so 分别表原因和结果，or 表选择。',
 '后文 Happy birthday, Grandpa! 明确过生日的是爷爷，birthday 前用 grandpa’s 表所有关系。',
 '动词同时支配蛋糕和两张京剧 CD，buy 均可搭配；make 不能自然表达这里的两件购礼行为。decide to 后用原形。',
 'buy sth for sb 表“为某人买某物”，物在前、人随后用 for；不要套用 give sth to sb。',
 '校订后用 them，回指刚提到的蛋糕与两张 CD 这些礼物，作 like 的宾语。her、me、him 都指人，不合文意。',
 'get home 表“到家”，home 在这里为副词，前面不加 at/to；leaves home 是离家，与中午回家庆生的后文不符。',
 '喝茶与听京剧同时发生，while 后省略重复的 he is，保留 listening。or、but、so 不能准确表达这里的同时关系。',
 'cuts 与空格动词由 and 并列，同一主语 he，叙事此处为一般现在时，因此用 gives。',
 '忙碌了一天之后“有点累，但很开心”，tired 与 happy 形成转折。sad、worried 没有相应情节，excited 与 happy 不构成这里的疲累与快乐对照。'],
 '我的朋友 Peter':[
 'Peter 是男孩；新句修饰名词 name，用形容词性物主代词 His。He 是主格，不能直接修饰 name。',
 'in front of 中 of 是介词，后用人称代词宾格 me；I、my、mine 分别是主格、形容词性和名词性物主代词。',
 'He 作主语，一般现在时“拥有很多 CD”用 has。there is/are 表存在，不能直接跟在 He 后充当这个谓语。',
 'like 后可接 doing；listen 表“听”时接对象须加 to，因此选 listening to。其余选项分别缺 doing 形式或介词。',
 'after school、play football 构成校园运动语境，校订后的四项中 playground（操场）最合适；classroom、library、hospital 均不合该常规活动场所。',
 'each other 是固定搭配，表示“互相”；each others、each one 等不能构成此处所需结构。',
 'be from 后此处须接国家名 England。Chinese、English、American 在所给形式中不是与本句匹配的国家名称。',
 'with his family 表“与家人一起”，说明同行者；from 表来源、on 表在……上、for 表目的等，都不表示这里的伴随。',
 'from Monday to Friday 是“从星期一到星期五”，用 from … to … 连接起止时间。',
 '主语 They 是复数，现在时系动词用 are，后接表语 happy；am 对应 I，is 对应第三人称单数。'],
 '风和太阳':[
 'much 后接比较级，than 明确比较两者，选 stronger。more stronger 重复使用两种比较标记。',
 'saw a man walking 描写当时看见一个人正在路上走；see sb doing 表看到正在进行的动作。see sb walk 本来也成立，因此本讲义把原 walk 干扰项校订为 to walk；see 后的这一主动结构不带 to。',
 'let 是动词，后面的人称代词作宾语，用 us，再接 see；we 为主格，our 为物主限定词。',
 'take off his coat 表“脱下外套”，对应最后 The man took off his coat。take up/on/in 不表示脱衣。',
 'so + 副词 hard + that 从句表示“吹得如此猛烈，以至于……”。such 通常修饰名词结构，本空后只有 hard。',
 '风未能让人脱衣，反而让人裹紧衣服，因而 angry 最贴合失败后的反应；be angry with sb 为固定搭配。',
 'It’s your turn 表“轮到你了”。前面风试过，接下来由太阳尝试，turn 为单数；way、turns、coat 都不能完成该表达。',
 'start to do 中 to 后用动词原形 shine。shines 是单数谓语，shining 是 -ing 形式，sunshine 是名词。',
 'get 是系动词，very 修饰形容词原级 hot；very 不能直接修饰此处比较级，句中也没有最高级的比较范围。',
 '结尾人因太阳照射而脱下外套，达到比赛目标的是 sun。要以比赛结果判断，不能因风吹得猛烈就选 wind。'],
 '合理安排作业':[
 '前句建议先吃点东西，所以不要在很 hungry（饥饿）时开始做作业。full 表吃饱，和建议的目的相反。',
 'Don’t wait until late in the evening 表“不要等到深夜才开始”。until 标明等待的终点；不能用 when 直接连接此处时间短语。',
 'than 要求比较级，hard 的比较级是 harder，可再用 much 修饰，故选 much harder；more hard、much hard 形式不合。',
 'an hour’s work 是“一小时的工作量”，用时间名词所有格修饰 work。an hour/one hour 均缺所有格标记，an-hours 拼写与结构都不合。',
 'too short to do anything 表“太短而无法做什么”，too … to … 构成结果结构。so/such 通常需用相应的 that 从句表达该结果。',
 'without 是介词，后接动名词 stopping；without stopping 表“不停下来”。stop、stops、stopped 不能直接用于该位置。',
 'put off doing 表“推迟做某事”，与后文拖到周末或考试前相照应。put on 穿上，put away 收好，put up 张贴或搭建等。',
 '作业一直挂心就无法 enjoy your free time（享受空闲时间）。take 不能这样搭配，spend your free time 与“不能享受”的情感重点不同；原 like 也可成立，已替换为 borrow 以消除竞争答案。',
 'have too much to do 中 too much 指过量的事情，不定式 to do 作后置修饰，表示“有太多事情要做”；不是把 do 当本句谓语。',
 'habitual 为形容词，修饰 part，表示把作业变成每日惯常的一部分。hobby、pleasure、joy 不构成此处自然搭配；不能据此推导所有名词都不能作定语。'],
 'Lily 的节水发明':[
 'expensive water bill 与 using too much water 表明水费负担让父母难过，四项中 sad 最贴合；happy、relaxed 不合情境，bored 表无聊。',
 'especially during showers 表“尤其在淋浴时”，从总体用水突出一个耗水场景。simply、suddenly、luckily 分别侧重简单、突然和幸运。',
 'come up with an idea 表“想出主意”，过去式为 came up with；look forward to 期待，take care of/look after 照顾。',
 '在减少水流的同时仍“提供”舒适体验，用 providing。while 后为省略形式；其余三项的词义分别是准备、保护、放置，不合 experience 这一宾语。',
 'shower head 是她设计出的发明，后文反复用 invention 回指。project 只泛指项目，不能像 invention 一样准确承接可参赛、可生产出售的装置。',
 'share sth with sb 表“与某人分享某物”，介词 with 引出 others；about/from/for 不构成这个搭配。',
 '向评委说明装置如何节水节钱，用 explained how …。realized 是意识到，imagined 是想象，advised 是建议，都不表示现场解释工作原理。',
 '主语 Lily 是女孩，be proud of herself 表“为自己自豪”，反身代词的人称与性别须对应。',
 'catch the attention of sb 表“引起某人的注意”，attention 与 caught 构成固定搭配；feeling、courage、purpose 不合。',
 '发明过程艰辛与结果带来快乐构成让步，Although 表“尽管”。Because/Since 侧重原因，When 侧重时间，均不如 Although 表达这里的对照。'],
}

def qcopy(li, qi):
    return copy.deepcopy(bank[li]['questions'][qi-1])

def clean(s):
    # 把源库中的下划线式横线变为不会触发 Markdown 强调的方括号。
    s=re.sub(r'_{2,}\s*\((\d+)\)',lambda m:'【'+m[1]+'】',s)
    s=re.sub(r'_{2,}','［空］',s)
    return s.strip()

def context_text(q):
    blocks=[]
    for b in q.get('context',[]):
        if b['type']=='p': blocks.append(clean(b['text']).replace('\n','\\\n'))
        elif b['type']=='table':
            rows=b['rows']; blocks.append('\n'.join(['| '+' | '.join(row)+' |' for row in rows[:1]]+['| '+' | '.join(['---']*len(rows[0]))+' |']+['| '+' | '.join(row)+' |' for row in rows[1:]]))
        else: raise ValueError(b)
    return '\n\n'.join(blocks)

def source(li, q):
    l=bank[li]
    s=f'《{l["title"]}》原题 {q["label"]}'
    if q.get('sourceBook'):
        s+=f'；《{q["sourceBook"]}》教材第 '+ '、'.join(map(str,q['sourceBookPages']))+' 页'
        s+='；扫描件第 '+'、'.join(map(str,q['sourcePdfPages']))+' 页'
        if q.get('examYear'):s+=f'；教材标注 {q["examYear"]} 年真题'
    else:s+=f'；题库所记原文件：{l["source"]}'
    return s

def register(cid, kind, li, q, tag=''):
    assert not q.get('invalid') and not q.get('ambiguous'),cid
    assert q['answer'] in [o['key'] for o in q['options']],cid
    orig=next(x for x in bank[li]['questions'] if x['label']==q['label'])
    manifest.append(dict(id=cid,kind=kind,lessonId=bank[li]['id'],originalLabel=q['label'],
                         source=source(li,q),knowledge=tag,answer=q['answer'],
                         originalAnswer=orig['answer'],adapted=any(c['id']==cid for c in changes),
                         originalHash=hashlib.sha256(json.dumps(orig,ensure_ascii=False,sort_keys=True).encode()).hexdigest()))

def render_q(q,n):
    stem=clean(q['stem']).replace('\n','\\\n')
    opts='\n'.join(f'- {o["key"]}. {clean(o["text"])}' for o in q['options'])
    return f'**{n}.** {stem}\n\n{opts}\n'

def answer_text(q):
    return next(o['text'] for o in q['options'] if o['key']==q['answer'])

def teaching_md(modules):
    return ''.join('#### 知识串讲：'+m['title']+'\n\n'+context_text(m)+'\n\n' for m in modules)

intro='''# 职教高考英语精选讲义（8 课 × 50 分钟）

编排日期：2026-11-05。以工作区现有英语题库为选题范围，按基础至中等水平的复习班编排；每课固定 **10 道单选 + 1 篇十空完形 + 1 篇五题阅读**，共 80 道单选、8 篇完形、8 篇阅读，合计 200 个小题，各课不重复用题。

“精选真题”中的年份与真题身份沿用教材印刷标注，未另行核验官方原卷；“单招1000题”“整理卷”和“模拟卷”保留其原有身份，不统称为职教高考官方真题。讲义答案是按题意核对的教学参考答案，并非官方答案。现有材料足量，本次没有新增网络题目。

筛选不只依赖原题库的“已核对”标记：另检查指代、语境证据、竞争答案、篇章完整性与选项结构。少量题目在讲义副本中作明确校订，见每课说明及《选题与校对记录》。源题库不作改动。篇章题名为教学概括，原文没有标题时不把它冒充原题标题。

## 使用与节奏

学生作答部分和解析部分分开。学生版不附答案；教师版每课先列完整题目，再列答案与解析。单选横线以“［空］”显示；完形横线以“【数字】”显示，保留源题空号；语音题方括号标示比较的字母部分；冠词选项“/”表示不填。

| 环节 | 分钟 | 操作 |
| --- | ---: | --- |
| 导入 | 3 | 回顾上课错因，预读本课少量生词 |
| 单选独立作答 | 5 | 10 题，每题约 30 秒 |
| 单选讲解 | 10 | 逐题核对；重点题每题约 1—2 分钟，其余快速说明依据 |
| 完形作答 | 8 | 先通读，再填空，最后回读 |
| 完形讲解 | 7 | 逐空核对；集中说明搭配与上下文证据 |
| 阅读作答 | 7 | 定位关键词，标出答案依据 |
| 阅读讲解 | 7 | 核对五题，突出本课阅读方法 |
| 出门检测 | 3 | 用一句话解释规则或完成迁移表达 |
| 合计 | **50** | 含学生作答时间 |

此时间适合已有基础、采用重点精讲的复习课。若学生需要逐句翻译，提前预习词汇并将逐句翻译放入课前或课后；不宜在 50 分钟内同时要求所有题详讲、全文翻译和拓展训练。

## 课程与覆盖

| 课次 | 单选核心 | 完形 | 阅读 | 阅读方法 |
| --- | --- | --- | --- | --- |
'''
skills=['公告检索、时长比较、条件计算','细节定位、段落功能、最佳标题','词义语境、分类归纳','顺序定位、否定题、范围词','礼貌语用、情节推断','人物视角、情感变化、真实动机','叙事反转、寓意概括','家庭成员配对、猜词、证据排除']
exit_answers=[
    'hour 的 h 不发音，起始为元音音素，故用 an；university 起始为辅音 /j/，故用 a。“三十分钟步行路程”为 thirty minutes’ walk。',
    '例：Please give me another book.（再给我另一本书。）I have two pens. One is red and the other is blue.（两支中的另一支。）完形 His 指 Peter 的；me 指叙述者；They 指 Peter 一家。',
    'hard 作副词可表示努力地、猛烈地；hardly 表几乎不，并非 hard 加 -ly 后保持原义。例：She is taller than any other girl in her class. 比较范围内须排除她本人。',
    '一般过去时被动：was/were built；一般将来时被动：will be built。单选5以 by the end of last week 为过去截止点，学会单词发生在该点之前，所以用 had learned。',
    '例：You needn’t come tomorrow.（你明天不必来。）You mustn’t smoke here.（这里禁止吸烟。）put off 后接动名词作宾语，表示推迟某项活动，故为 put off doing。',
    'allow him to work：to work 是不定式宾语补足语；look forward to working：to 是介词，后用动名词；have the work finished：work 与 finish 是被动关系，用过去分词作宾语补足语。',
    'he spent 后缺宾语，that 在从句中代替 the days 充当宾语；he grew up 主谓完整，where 表示在那个小镇，充当地点状语。先行词属于时间或地点，不足以独自决定关系词。',
    '倒装句可还原为 Man did not know what heat is until the early years of the 19th century. 否定时间状语提前后为 Not until … did man know …。减废行动示例：I will use both sides of the paper. 开放表达意思清楚、语法正确即可。',
]
for n,p in enumerate(plans,1):
    intro+=f'| {n} | {p["title"]} | {p["ctitle"]} | {p["rtitle"]} | {skills[n-1]} |\n'
intro+='''
八课覆盖语音、冠词、名词、数词、代词、介词、形容词、副词、连词、时态、语态、情态动词、动词短语、非谓语、复合句、句子的种类、主谓一致、虚拟语气、倒装和交际。构词法通过 carefully、successful/success/successfully 等词族的词性辨析穿插，不把它等同于已系统覆盖全部前后缀。

80 道单选不能穷尽题库的所有细目；本册不另设写作、翻译、短文改错，也未系统训练重音、全部时态及所有从句。定位是八课精选复习，而非完整考纲替代本。

---

'''

teacher=[];student=[]
for n,p in enumerate(plans,1):
    head=f'# 第 {n} 课　{p["title"]}\n\n'
    meta=f'**课时：50 分钟｜难度：{p["difficulty"]}｜主线：{p["focus"]}**\n\n学习目标：{p["goals"]}\n\n'
    sq=[]
    for k,(li,qi,tag) in enumerate(p['singles'],1):
        q=qcopy(li,qi);register(f'L{n}-S{k:02}', 'single',li,q,tag);sq.append(q)
    cli,start,end=p['cloze']
    cq=copy.deepcopy(bank[cli]['questions'][start:end]);assert len(cq)==10
    # 为篇章保留原空号，校订共享文字后同步至十道题。
    if n==1:
        change(cq[0],'context','and he is 78 years old.','and his grandpa is 78 years old.','把年龄主语写明，避免与前文 Li Ming 的 he 混淆。','L1-C01')
        change(cq[5],'option:A','it','them','所购礼物包含蛋糕和两张 CD，明确用复数宾格回指。','L1-C06')
    if n==2:
        change(cq[0],'context','I have a good friend   ____(11)  name is Peter.','I have a good friend. ____(11) name is Peter.','恢复句界，使 His name 自成完整句，避免无连接词拼接。','L2-C01')
        change(cq[4],'option:D','park','hospital','原 park 也可以踢足球，替换竞争项，保留校园运动的目标答案。','L2-C05')
    if n==3:
        change(cq[1],'option:B','walk','to walk','see sb walk 与 see sb walking 都成立，替换同样有效的干扰项。','L3-C02')
        change(cq[6],'option:D','way','coat','原 A/D 都是 way，替换重复的错误干扰项。','L3-C07')
    if n==5:
        change(cq[7],'option:D','like','borrow','like your free time 也可成句，替换与 enjoy 竞争的干扰项。','L5-C08')
    if n==6:
        for key,old,new in [('A','pigs','trees'),('B','hens','flowers'),('C','birds','stones')]:
            change(cq[5],'option:'+key,old,new,'鸟类包含鸭子，猪也可游泳；改用不能与 swimming 自然搭配的非动物项，避免仅凭常见动物习性排除。','L6-C06')
    for q in cq[1:]:q['context']=copy.deepcopy(cq[0]['context'])
    # 讲义专用逐空解析；精选题原解析已有明确定位与干扰项说明。
    if p['ctitle'] in cloze_reasons:
        for q,r in zip(cq,cloze_reasons[p['ctitle']]):q['reason']=r
    for k,q in enumerate(cq,1):register(f'L{n}-C{k:02}','cloze',cli,q)
    rli=p['reading'];rq=copy.deepcopy(bank[rli]['questions']);assert len(rq)==5
    if n==5:
        change(rq[3],'stem','Henry said “________” and gets the book from the robot’s hands.','Henry said “________” and got the book from the robot’s hands.','统一过去叙事的并列谓语时态。','L5-R04')
        rq[3]['reason']='选 A：Thanks。文中已写 Henry 按要求说过 Excuse me 和 please，机器人随后取书，最后一步应表达感谢。这里根据礼貌主题及情节推断，原文并未直接引出该词；不要把推断说成原文逐字信息。Sorry 是道歉，How are you 是问候，再说 Excuse me 不能像 Thanks 一样完成这段礼貌用语链。'
    if n==7:
        rq[3]['reason']='选 B：The writer has met the woman several times。作者明说 whom I had never met，与 B 的“见过多次”直接矛盾。A 带 probably，只是从喝咖啡休息作出的弱推测，并非确定事实；C 对应 Late in the afternoon when I finished the cleaning。否定题优先找明确矛盾，不把弱推测说成明示信息。'
    for k,q in enumerate(rq,1):register(f'L{n}-R{k:02}','reading',rli,q)
    localchanges=[c for c in changes if c['id'].startswith(f'L{n}-')]
    adaptation='本课完形为题库原题选编。'
    if any(c['id'].startswith(f'L{n}-C') for c in localchanges):adaptation='本课完形为**题库原题校订版**；校订处与原因见教师解析后的记录。'
    questions='## 一、单项选择（10 题）\n\n选择最符合句法与上下文的答案。\n\n'+ '\n'.join(render_q(q,k) for k,q in enumerate(sq,1))
    questions+=f'\n## 二、完形填空：{p["ctitle"]}（10 空）\n\n{adaptation}\n\n阅读短文，为每空选择最佳选项。方括号保留源题空号。\n\n'+context_text(cq[0])+'\n\n'
    for k,q in enumerate(cq,1):
        questions+=f'**第 {q["label"]} 空（本课 C{k:02}）**\n\n'+'\n'.join(f'- {o["key"]}. {clean(o["text"])}' for o in q['options'])+'\n\n'
    reading_text=context_text(rq[0])
    if n==8:
        reading_text=reading_text.replace('leftovers','<u>leftovers</u>',1)
    questions+=f'## 三、阅读理解：{p["rtitle"]}（5 题）\n\n根据短文内容选择最佳答案；细节题以原文为准，推断题须有上下文支持。\n\n'+reading_text+'\n\n'
    questions+='\n'.join(render_q(q,k) for k,q in enumerate(rq,1))
    questions+=f'\n## 四、出门检测（3 分钟）\n\n{p["exit"]}\n\n'
    notes=f'## 教学提示\n\n**课前词汇：**{p["words"]}。\n\n**精讲重心：**{p["key"]}\n\n本课仍按总说明的 50 分钟流程实施；所有题均核对，重点题展开讲解。\n\n'
    answers='## 五、答案与逐题解析（教师用）\n\n### 答案速查\n\n'
    answers+='| 题型 | 答案（按本课顺序） |\n| --- | --- |\n'
    for label,qs in [('单选 S01—S10',sq),('完形 C01—C10',cq),('阅读 R01—R05',rq)]:answers+='| '+label+' | '+'　'.join(f'{k}.{q["answer"]}' for k,q in enumerate(qs,1))+' |\n'
    answers+='\n### 单选解析与首次考点串讲\n\n'
    for k,((li,qi,tag),q) in enumerate(zip(p['singles'],sq),1):
        answers+=f'**S{k:02}　{q["answer"]}（{answer_text(q)}）｜{tag}**\n\n{q["reason"]}\n\n'+teaching_md(teaching[n-1].get(f'S{k:02}',[]))+f'来源：{source(li,q)}。\n\n'
    answers+='### 完形解析\n\n'
    answers+=teaching_md(teaching[n-1]['C01'])
    for k,q in enumerate(cq,1):
        answers+=f'**C{k:02}（原第 {q["label"]} 空）　{q["answer"]}：{answer_text(q)}**\n\n{q["reason"]}\n\n'
    answers+='### 阅读解析\n\n'
    answers+=teaching_md(teaching[n-1]['R01'])
    for k,q in enumerate(rq,1):answers+=f'**R{k:02}　{q["answer"]}：{answer_text(q)}**\n\n{q["reason"]}\n\n'
    answers+='### 出门检测参考\n\n'+exit_answers[n-1]+'\n\n'
    answers+='### 篇章来源与校订说明\n\n'
    answers+=f'- 完形：{source(cli,cq[0])}；本课采用该篇全部 10 空。\n'
    answers+=f'- 阅读：{source(rli,rq[0])}；本课采用该篇全部 5 题。\n'
    if localchanges:
        for c in localchanges:answers+=f'- {c["id"]}：`{c["before"]}` → `{c["after"]}`。{c["reason"]}\n'
    else:answers+='- 本课题干、选项与篇章未新增实质校订；仅统一横线显示和 Markdown 排版。\n'
    if n==5:answers+='- 作业篇原第 60 空的 habitual 与第 59 空的 to do 已在现有题库中校订/补全；本册沿用现有版本，不把它们声称为未经改动的原始扫描文字。\n'
    if n==6:answers+='- C06 是为消除竞争答案而简化后的名词语境题，难度低于原题，不用于模拟原卷难度。\n'
    if n==7:answers+='- 阅读 R04 的 A 仅为弱推测；课堂只要求指出 B 与原文的明确矛盾，不延伸为作者一定喜欢咖啡。\n'
    t=head+meta+notes+questions+answers
    s=head+meta+questions
    teacher.append(t);student.append(s)
    (OUT/'分课教师版'/f'{n:02d}_{p["title"]}.md').write_text(t,encoding='utf-8')
    # 演示资料直接使用同一批校订后的题目；独立串讲不增加练习题量。
    presentation_questions=[]
    for prefix,qs,li in [('S',sq,None),('C',cq,cli),('R',rq,rli)]:
        for k,question in enumerate(qs,1):
            q=copy.deepcopy(question)
            original_label=q['label'];label=f'{prefix}{k:02}'
            q.update(label=label,originalLabel=original_label,
                     questionType={'S':'single_choice','C':'cloze','R':'reading'}[prefix],
                     section={'S':'一、单项选择','C':'二、完形填空 · '+p['ctitle'],'R':'三、阅读理解 · '+p['rtitle']}[prefix],
                     blankLabel=original_label if prefix=='C' else '',
                     groupId=f'eight-course-{n:02}-{prefix}' if prefix!='S' else '',
                     accepted=[q['answer']],invalid=False,ambiguous=False,reviewed=True,
                     optionNotes=[],worked='',examNote='')
            source_index=p['singles'][k-1][0] if prefix=='S' else li
            q['originLessonId']=bank[source_index]['id']
            q['sourceCitation']=source(source_index,question)
            q['teaching']=copy.deepcopy(teaching[n-1][label if prefix=='S' else prefix+'01'])
            presentation_questions.append(q)
    course_docs.append(dict(id=f'builtin-eight-course-{n:02}',title=f'第{n:02}课 · '+p['title'],
        topic='八课精选讲义',collection='eight-course',sourceType='course',courseNumber=n,
        status='ready',createdAt='2026-11-05T00:00:00.000Z',updatedAt='2026-11-05T00:00:00.000Z',version=1,
        questionOrder='manual',source='八课英语精选讲义 · 教师版与编排清单',
        notes=['每课50分钟；10道单选、1篇十空完形、1篇五题阅读，共25小题。',
               '扩充知识统一置于原有解析界面；首次讲解先成组梳理，复现时按需回看。',
               '串讲为完整备课内容；课内优先讲本题规则和易混点，扩展词表可用于预习或课后复习。',
               '参考答案按题意编写；教材标注年份保留原身份，不冒充已核验官方原卷。']+
              [c['id']+'：'+c['before']+' → '+c['after']+'；'+c['reason'] for c in localchanges],
        reference=[{'type':'p','text':'本课主线：'+p['focus']+'。学习目标：'+p['goals']},
                   {'type':'p','text':'建议流程：导入3分；单选作答5分与讲解10分；完形作答8分与讲解7分；阅读作答7分与讲解7分；出门检测3分。'},
                   {'type':'p','text':'出门检测：'+p['exit']+' 参考：'+exit_answers[n-1]}],
        questions=presentation_questions,images=[],documents=[],ocrText='',home='/#library'))

expansion_note='''## 教师版扩充说明

每道单选的解析后，按首次考点补上成组规则、词表、词形与易混辨析；每篇完形和阅读另有词汇、固定搭配及方法串讲。共99个模块，不只扩充数词。数词部分完整列出0—20基数词与序数词、全部整十、常用大数及组合规则；其他专题同样先成组梳理再回到本题。

串讲是完整备课内容，不意味着50分钟内逐字读完所有拓展。首次出现先带读本题涉及的整组基础词和高频易混词；复现题用对比或提问回顾。教师可把扩展例句、备查结构用于预习及课后巩固。原200道练习题与学生版题量保持一致。

配套工作台：侧边栏“课堂资料”只列这8课。扩充内容放在原有“查看解析”界面的本题判断依据之后；题目页面不新增讲解卡或按钮。同一模块内容与本教师版共用源数据。

---

'''
(OUT/'教师版_八课完整讲义.md').write_text(intro+expansion_note+'\n\n---\n\n'.join(teacher),encoding='utf-8')
student_intro=intro.replace('## 使用与节奏','## 使用与节奏')
(OUT/'学生版_八课练习.md').write_text(student_intro+'\n\n---\n\n'.join(student),encoding='utf-8')
(OUT/'编排清单.json').write_text(json.dumps(dict(date='2026-11-05',items=manifest,changes=changes),ensure_ascii=False,indent=2),encoding='utf-8')
(seed/'eight-course-lessons.json').write_text(json.dumps(course_docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

stats=sum(len(l['questions']) for l in allbank)
report=f'''# 选题与校对记录

## 选题范围与判定边界

本次以 `英语拍照讲练_MVP/seed/lessons.json`、`selected-papers.json`、`english-monthly-exam.json` 为当前题库，合计 {len(allbank)} 份资料、{stats} 个题目/学习条目。旧版、修订版 HTML 与 Windows 离线包中的复制资料不重复计数。条目总数包括翻译、写作、学习卡等，不能当作可用单选题数量。

先检查分类、现有勘误与待确认标记，再比较单选知识点及篇章候选。完成逐题复核的是最终入选的 200 小题和本记录点名的候选疑点；不声称本次重新逐题审定全部 {stats} 条。

最终：80 道单选、8 篇十空完形、8 篇五题阅读。阅读有足够的现成完整材料，完形亦足量；本次未补充网络题目，因此没有新增网络出处或未经核实的网络真题身份。

## 选题原则

- 优先选能代表不同知识点、语境信息足够、篇章完整的题；分课由基础过渡到综合，不靠同一规则反复凑题。
- 不以“常规答案”排除现代英语中同样成立的选项。不把英美差异、that/which 并存或可拆分不定式简单判错。
- 对少量可局部修复的篇章题，明确标“校订版”，逐项记录变更。校订只作用于讲义副本。
- 保留入选原题的干扰项，即使其拼写或语法有误；这本身可能是考点。格式规范化不算新增题。
- 解析按该题的句法、搭配、证据与语境说明；不沿用原完形中反复出现的泛泛“结合上下文判断”作为完整解析。

## 主动避开的候选问题

| 候选题 | 未采用的原因 |
| --- | --- |
| 精选真题·非谓语第 7 题 | not to laugh 与 to not laugh 均可能成立 |
| 精选真题·复合句第 5 题 | 限定性定语从句中 that 与 which 形成竞争答案 |
| 精选真题·复合句第 3 题 | where it was 是常规答案，但地点信息仍有效时保留现在时亦有实际用法；改选带明确答句的题 |
| 精选真题·名词第 2 题 | go for a walk 与习惯性 go for walks 不宜简单判唯一 |
| 精选真题·形容词副词第 2 题 | rarely/hardly/finally 可改变句意，原句不足以严格限定所问结果 |
| 精选真题·动词第 6 题 | 计划 sounds good 与 feels good 均可能自然成立 |
| 原完形宴会礼仪篇（31—40 空） | bring/take 的视角、晚到几分钟等多处缺少唯一依据 |
| 原完形“语文老师”篇第 24 空 | tell a story 与 tell stories 都合语法，不靠偏好判错 |
| 2021 整理卷动物园篇第 33 空 | live with 与拟人语境的 talk with 竞争 |
| 2022 整理卷父亲上学篇第 34 空 | After 与 When 都可衔接听故事后的反应 |
| 精选真题·香港旅游套餐第 5 题 | 推断广告发布时间的证据不足，未来措辞并不能排除圣诞当天或两节之间 |
| 精选真题·睡眠篇 | 睡眠阶段表述容易与现行科学分类混淆；本次选用其他主题以保持讲义准确性 |
| 单招阅读第 7 篇 | 书评版面的 OCR 存在明显串栏，纯 Markdown 不宜原样搬入 |
| 单招阅读第 13 篇第 4 题 | 四个学位的说法未被正文完整支持，会与“电话联系”形成否定题的竞争项 |

上述举例说明筛选判断，不表示已列出原题库的所有问题。

## 本次校订明细

共享篇章改动按一个逻辑位置登记，应用于同篇全部十题；下表 ID 中 C 后数字为本课空序号，原空号另见讲义。

| 本课题号 | 字段 | 原文 | 讲义文字 | 校订理由 |
| --- | --- | --- | --- | --- |
'''
for c in changes:
    report+='| '+' | '.join(str(c[k]).replace('|','\\|').replace('\n',' ') for k in ['id','field','before','after','reason'])+' |\n'
report+='''
所有校订均未改变目标答案的字母；爷爷生日 C06 保留 A，但其文字由 it 明确改为 them。没有把校订稿冒充原卷逐字转录。源题库已有的文字修订不是本次新增，详见项目既有题干核查说明和对应 JSON。

## 校核方式与结果

- 按课核对 10+10+5 的数量，检查每空均有对应选项、每个答案均在该组选项中；共 200 个有效答案。
- 核对 80 道单选题目身份与题干不重复，8 篇完形和 8 篇阅读分别不重复；每篇只展示一次完整材料。
- 核对每篇完形的十个空号与十组选项严格一致；保留原空号而非机械改号，以便回查。
- 对单选重看词性、时间线、主被动和从句成分；对完形把目标答案带回完整短文；对阅读逐题核对定位句、同义转换、推断和否定范围。
- 学生版与教师版共用同一组题目生成，答案独立放在教师解析区；学生版不包含答案速查与解析。
- 本次没有宣称完成独立的官方原卷校验；对本地扫描件采用既有题库保存的出处及页码，保留教材收录身份。既有扫描整理说明明确参考答案为项目补编。

机器数量与结构检查不能证明自然语言绝无其他解释。当前讲义已处理本次复核发现的主要歧义；题意允许推断时，解析注明推断依据与边界，不把主观合理性冒充原文直接信息。

## 来源定位

每道单选的教师解析后附资料名与原题号；篇章在本课末附来源。教材题另外给教材页码、扫描件页码和教材标注年份。`编排清单.json` 保存全部 200 题的来源资料 ID、原题号、答案、是否校订，以及源题对象哈希，便于日后回查。

本次主要依赖的既有整理记录：

- [题干核查说明](../英语拍照讲练_MVP/review/题干核查说明.md)
- [精选真题导入说明](../英语拍照讲练_MVP/review/精选真题导入说明.md)
- [单招1000题导入说明](../英语拍照讲练_MVP/review/单招1000题导入说明.md)

这些记录说明此前的来源和整理方法；本讲义的重新选题与校订责任由本记录单独说明。
'''
report=report.replace('../英语拍照讲练_MVP/review/',os.path.relpath(PROJECT/'review',OUT).replace(os.sep,'/')+'/')
(OUT/'选题与校对记录.md').write_text(report,encoding='utf-8')
readme='''# 八课英语精选讲义

- [教师版：八课完整讲义](教师版_八课完整讲义.md)：课程安排、完整题目、200 小题答案与解析、来源。
- [学生版：八课练习](学生版_八课练习.md)：同一套题，不附答案。
- [选题与校对记录](选题与校对记录.md)：筛选范围、剔除疑点、逐项校订和核查边界。
- `编排清单.json`：原资料 ID、原题号、答案与校订记录，便于追溯。

每课 50 分钟，10 道单选、1 篇十空完形、1 篇五题阅读。现有题库足量，未新增网络题。少量局部修复题明确标为校订版；原题库文件保持不变。

## 分课教师版

'''
for n,p in enumerate(plans,1):readme+=f'- [第 {n} 课：{p["title"]}](分课教师版/{n:02d}_{p["title"]}.md)\n'
(OUT/'README.md').write_text(readme,encoding='utf-8')
with (OUT/'README.md').open('a',encoding='utf-8') as f:
    f.write('\n## 扩充与课堂演示\n\n教师版含99个知识串讲模块，覆盖80道单选及16篇篇章。工作台侧边栏“课堂资料”显示第01—08课；进入演示后，扩充内容在原有“查看解析”界面中展开，题目页面保持原样。原题库从“内置题库”访问。\n\n重建：在项目中运行 `python3 scripts/build-eight-course-handouts.py`。串讲内容源为 `seed/eight-course-teaching.json`，会同步生成教师讲义与课堂演示资料。\n')
for file in OUT.rglob('*.md'):
    file.write_text(file.read_text(encoding='utf-8').rstrip()+'\n',encoding='utf-8')
print(json.dumps(dict(lessons=len(plans),items=len(manifest),changes=len(changes),bankItems=stats,output=str(OUT)),ensure_ascii=False))
