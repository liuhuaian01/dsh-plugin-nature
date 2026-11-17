// nature · 中文写作体检 · 内容层（文体画像、处方、报告）
//
// 三块文本资产：
//   1. 文体处方：不同中文文体里，「像人写的」具体意味着什么
//   2. 诊断报告：把 scan.js 的结构化结果渲染成模型和人都能读的 markdown
//   3. 常驻规则与技能正文：平时就约束模型的中文表达
//
// 这一层是插件的主要价值所在，改文案比改代码更能提升效果。

import { RHYTHM_PROFILES, DEFAULT_RHYTHM_PROFILE } from './rules.js';

/** 文体定义。id 用作工具参数枚举值。 */
export const GENRES = {
  general: {
    id: 'general',
    label: '日常对话与通用说明',
    reader: '一个具体的人：同事、朋友、客户。他只想快点知道结论。',
    must: [
      '结论前置，第一句就是答案',
      '给出具体动作和条件边界，说清什么时候不适用',
      '用「我」「你」，不用「我们」',
      '长短交错；关系紧密的小句用逗号连着写，不要切成一句一段',
    ],
    avoid: ['铺垫时代背景', '面面俱到', '写一段「总的来说」来收尾', '把句子切成一堆三五字的短句'],
    skeleton: [
      '第一句给答案，不铺垫',
      '中间给理由，一到三条，能删的删掉',
      '最后给边界或下一步，没有就不写',
    ],
    examples: [
      {
        bad: '在当今社会，随着科技的飞速发展，人工智能已经深刻地改变了我们的生活方式。',
        good: '手机里那个会说话的助手，三年前还只会查天气，现在能帮你订机票了。',
        why: '前者在铺背景，后者直接给你一个能看见的变化。读者不需要被告知时代变了，他需要看到变了什么。',
      },
      {
        bad: '综上所述，我们必须高度重视这一问题，采取有效措施加以解决。',
        good: '这事得管。不管的话，下个月还得再来一次。',
        why: '「高度重视」「加以解决」不是动作。说清楚不管的后果，比说十遍要重视管用。',
      },
    ],
  },
  media: {
    id: 'media',
    label: '自媒体推文：公众号、小红书',
    reader: '在划手机的人，三秒内决定走不走。',
    must: [
      '前 15 字给出钩子：一个具体场景、一个反常识判断、或一个真实数字',
      '口语节奏，允许不完整句——但短句之间要夹长句，全是重音等于没有重音',
      '一句一段是这类版面的常态，不用改',
      '留一个能带走的结论或动作',
    ],
    avoid: ['「今天我们来聊聊」', '时代背景开场', '总分总', '结尾升华', '通篇一个长度的短句连排'],
    skeleton: [
      '开头十五个字：一个具体场景、一个反常识判断，或者一个真实数字',
      '中间说清为什么这事值得看，每条配一个能核对的东西',
      '结尾给读者能带走的一句话或一个动作',
    ],
    examples: [
      {
        bad: '值得注意的是，这一现象背后蕴含着深刻的社会意义。',
        good: '有意思的是，评论区吵得最凶的那批人，其实都没看完。',
        why: '「蕴含深刻意义」是空话，读者抓不到东西。把你能看见的那个细节写出来，意义让读者自己得出。',
      },
      {
        bad: '让我们一起期待这个行业更加美好的明天。',
        good: '明年这个时候，这部片子是赔是赚，数字会说话。',
        why: '收尾别升华。给一个具体的观察时点，读者会自己回来对账，比喊口号记得住。',
      },
    ],
  },
  script: {
    id: 'script',
    label: '口播稿、视频脚本',
    reader: '要用耳朵听的人。他没法回看，也没法重读。',
    must: [
      '写出来是给人念的：句子短到一口气能念完',
      '关键信息说两遍——听众没有回看的机会',
      '用口语词和短语，不用书面连接词（因此、故而、综上、换言之）',
      '数字换算成能听懂的量级，别丢一串小数',
      '段落就是换气点，一句一段完全正常',
    ],
    avoid: [
      '长定语和从句——念出来会断气',
      '同音会听岔的词',
      '书面语连接词',
      '需要看一眼才能懂的表格和括号注释',
    ],
    skeleton: [
      '前三秒说清这期讲什么，或者抛一个反常识',
      '两到三个点，每个点先给结论再说原因，关键信息说两遍',
      '结尾回扣开头那句',
    ],
    examples: [
      {
        bad: '综上所述，我们可以看到，人工智能技术正在深刻影响各个行业的发展。',
        good: '你看现在做图的、写文案的、剪视频的，哪一行没被AI掺一脚？',
        why: '「综上所述」「我们可以看到」是写给眼睛的，念出来很别扭。口播用反问、用具体行当，才像人在说话。',
      },
      {
        bad: '首先，我们需要明确目标；其次，我们需要制定策略；最后，我们需要落地执行。',
        good: '先说干什么，再说怎么干，最后才是谁去干。',
        why: '「首先其次最后」是文件体的三段论。口播里换成「先说…再说…最后」，听众才跟得上。',
      },
    ],
  },
  fiction: {
    id: 'fiction',
    label: '小说、故事、剧本',
    reader: '想沉浸进去的人。他要画面，不要总结。',
    must: [
      '感官细节：看到什么、听到什么、身体什么感觉',
      '用动作和对话推进情节',
      '叙述部分长短交错；流水句（逗号串小句、最后落句号）是正常且成熟的中文',
      '留白，允许读者自己补',
    ],
    avoid: [
      '直接解释人物心理（「他感到十分悲伤」）',
      '形容词堆砌',
      '旁白式评论人物性格',
      '把叙述切成一堆短句，读起来像分镜脚本的字卡',
    ],
    skeleton: [
      '先给场景：时间、地点、此刻正在发生什么',
      '用动作和对话推进，别替人物解释心理',
      '这一段结束时，有一样东西变了',
    ],
    examples: [
      {
        bad: '他的内心充满了复杂的情绪，既有对过去的不舍，也有对未来的迷茫。',
        good: '他把烟按灭在窗台上。烟灰掉下去，没落地就被风吹散了。',
        why: '「不舍」「迷茫」是标签，读者感受不到。给一个动作，让读者自己读出那个状态。',
      },
      {
        bad: '夜幕降临，城市的灯火逐渐亮起，一切都显得那么宁静而美好。',
        good: '楼下烧烤摊的灯先亮了，然后是便利店，最后整条街都醒了。',
        why: '「宁静而美好」是形容词堆砌。写出灯亮的顺序，画面自己就出来了。',
      },
    ],
  },
  webnovel: {
    id: 'webnovel',
    label: '网络小说连载',
    reader: '在手机上追更的人。他要画面和钩子，随时可能划走。',
    must: [
      '开篇直接进事件，设定边走边给，不要先倒背景',
      '感官和动作具体，情绪靠身体反应带出来，不直接说',
      '对话推动情节；段落可以短，一句一段是手机阅读的正常排版',
      '叙述部分仍要长短交错，流水句是正常且成熟的中文',
      '每章结尾留一个钩子或转折',
    ],
    avoid: [
      '开篇大段世界观和身世说明',
      '直接解释人物心理（「心中满是悲凉」）',
      '旁白式评论人物性格（「他是个坚韧不拔的人」）',
      '成语堆砌和文言腔套话（「俨然有…之象」「端的是有些邪性」）',
      '把叙述切成一堆等长的短句，读起来像分镜脚本的字卡',
    ],
    skeleton: [
      '开篇直接进事件，不铺背景',
      '障碍加深或出现新变数，一环推一环',
      '结尾留一个问题、一个威胁或一个反转',
    ],
    examples: [
      {
        bad: '他心中暗自发誓，一定要让所有看不起他的人付出代价。',
        good: '他咬了口冷馒头，把那张纸条揣进怀里。三年后回来，他要让这个铺子姓陈。',
        why: '「付出代价」是空头誓言，谁都能说。落到馒头、纸条、铺子这些具体东西上，狠劲才立得住。',
      },
      {
        bad: '这一刻，他终于明白了什么是真正的力量。',
        good: '他伸手一推，那面墙塌了半截。',
        why: '「明白什么是真正的力量」是替读者总结。让他推一堵墙，力量自己会说话。',
      },
    ],
  },
  report: {
    id: 'report',
    label: '报告、公文、商务邮件',
    reader: '要据此做决定的人。他要依据，不要态度。',
    must: [
      '结论、依据、数字、时间点、责任人、风险，能写的都写清',
      '把不确定的地方明说出来',
      '坏消息放在前面，不要埋在第三段',
      '句子写完整；准确优先于简短，不要为了利落而碎成短句',
    ],
    avoid: ['形容词和口号', '「高度重视」「有序推进」这类空转词', '无主语的被动句'],
    skeleton: [
      '结论放第一段，只看这一段也能知道结果',
      '依据：数字、时间、责任人，一项一行',
      '风险：不确定的地方和坏消息，别藏',
      '建议：下一步做什么、谁来做、什么时候',
    ],
    examples: [
      {
        bad: '本次工作取得了显著成效，为公司的发展奠定了坚实基础。',
        good: '全年交付 47 个项目，按期率从 71% 提到 89%。延期集中在三家供应商，其中两家是轴承件。',
        why: '「显著成效」「坚实基础」不携带信息。数字和原因摆出来，读的人才敢据此做决定。',
      },
      {
        bad: '综上所述，我们需要进一步加强管理，提升效率。',
        good: '建议把验收环节从项目尾部前移到设计评审之后，预计能减少三成返工。',
        why: '「加强管理」派不了活、也没法验收。改成一个谁都能照着执行的动作。',
      },
    ],
  },
  tech: {
    id: 'tech',
    label: '技术文档与技术博客',
    reader: '要照着做的人。照做不通他就会骂人。',
    must: [
      '前提条件、版本、平台写清楚',
      '能复制的命令或代码',
      '预期结果，以及失败时怎么办',
    ],
    avoid: ['营销话术', '「简单来说」「众所周知」', '含糊的「配置一下即可」'],
    skeleton: [
      '前提：版本、平台、依赖',
      '步骤：一步一条，命令可复制',
      '预期：做完应该看到什么',
      '失败：不通时先查什么',
    ],
    examples: [
      {
        bad: '该系统具有较高的可扩展性和良好的可维护性。',
        good: '加一个新数据源只需要改一个配置文件，不用动代码。',
        why: '「可扩展性」是名词化的空话。说清楚加什么、改哪里、不用动什么，读者才能判断。',
      },
      {
        bad: '值得注意的是，在实际应用过程中可能会遇到一些问题。',
        good: '上线后大概率会撞上两种情况：老数据没有时间戳，重跑会重复计数。',
        why: '「可能会遇到一些问题」等于没说。把具体会撞上什么写出来，读者才带得走。',
      },
    ],
  },
  news: {
    id: 'news',
    label: '新闻、媒体报道',
    reader: '要知道究竟发生了什么的人。',
    must: [
      '信源：谁说的、什么时候说的、能不能核实',
      '最重要的事实放第一段，时间地点数字齐全',
      '多方说法并列，冲突处如实呈现',
      '段落可以短，但一个意思通常用两三句交代完，不要拆成一条一句',
      '快讯只交代发生了什么；特写和深度报道要有场景和具体的人，但场景是为事实服务的，不是氛围',
    ],
    avoid: ['形容词定性（「令人震惊的」）', '无信源的「据悉」', '把评论混进事实', '升华收尾'],
    skeleton: [
      '导语：最重要的事实，谁、做了什么、什么时候、哪里',
      '展开：细节和数字，按重要性递减',
      '信源：这话是谁说的',
      '有争议时并列另一方说法，不替任何一方下结论',
    ],
    examples: [
      {
        bad: '此次会议的召开，对于推动行业高质量发展具有十分重要的意义。',
        good: '会上通过了三项标准，其中两项明年一月起实施。',
        why: '新闻说发生了什么。「重要意义」是评论，而且是最没信息量的那种——读者要的是通过了什么、什么时候生效。',
      },
      {
        bad: '与会人员纷纷表示，将以此次会议为契机，进一步加大工作力度。',
        good: '一家参会企业的负责人说，他们打算把测试周期从两周压到五天。',
        why: '「纷纷表示」「以此为契机」是通稿套话，谁都能往里填。引一个具体的人、一句具体的话，才是信源。',
      },
    ],
  },
  business: {
    id: 'business',
    label: '财经、商业分析',
    reader: '关心钱和风险的人。他要数据，也要判断。',
    must: [
      '数据带来源和时间点；估算值和实际值分开说',
      '每个判断后面跟上依据，不要空放结论',
      '风险写在机会前面，或者至少并排写',
      '段落短、一句一段是这类稿件的标准排版，不用改',
    ],
    avoid: [
      '把推测写成既定事实',
      '只堆数据不给判断',
      '「业内人士称」这类没有具体信源的说法',
      '形容词定性（惊人的、震撼的、史无前例的）',
    ],
    skeleton: [
      '数据：核心数字，带来源和时间点',
      '判断：这些数字意味着什么',
      '风险：什么情况下这个判断会错',
      '对照：和上季度比、和同行比',
    ],
    examples: [
      {
        bad: '该公司业绩表现亮眼，营收和利润均实现了大幅增长。',
        good: '营收 42 亿，同比增 31%；净利 3.7 亿，但经营现金流只有 1.2 亿。',
        why: '「亮眼」「大幅」不构成信息。数字摆出来读者自己会判断，而且最后那半句才是真正该被看见的。',
      },
      {
        bad: '总体来看，行业前景广阔，但仍面临一定挑战。',
        good: '需求端在涨，但产能明年集中释放，价格战大概率跑不掉。',
        why: '「前景广阔」加「面临挑战」两边都对，等于什么都没说。把涨和跌放进同一句，判断才成立。',
      },
    ],
  },
  commentary: {
    id: 'commentary',
    label: '分析评论、专栏',
    reader: '想听一个判断的人。他不缺信息，缺的是看法。',
    must: [
      '开头就给判断，不要绕',
      '支撑判断的事实和推理过程',
      '回应反方最强的那个论点',
      '交代作者站在什么位置说话',
    ],
    avoid: ['两边都对', '只罗列现象不给结论', '「值得深思」', '假装没有立场'],
    skeleton: [
      '开头就亮判断，别让读者猜你站哪',
      '论证：事实加推理，每条事实可核对',
      '反方：最强的反对意见是什么，为什么它不成立',
      '收在判断上，不留悬念',
    ],
    examples: [
      {
        bad: '这一现象值得我们深思。',
        good: '问题在于，做这件事的人越多，能赚到钱的人反而越少。',
        why: '「值得深思」是把思考的活推给读者。你想的那个矛盾，直接写出来。',
      },
      {
        bad: '我们既要看到成绩，也要正视问题。',
        good: '成绩是真的，但代价是这三年没出过一部能重看的片子。',
        why: '「既要…也要…」是骑墙，两边都不得罪也就两边都没说。先认一半，再给另一半的代价。',
      },
    ],
  },
  proposal: {
    id: 'proposal',
    label: '方案策划、提案',
    reader: '要拍板的人。他不缺信息，缺的是「做什么」和「为什么这么做」。',
    must: [
      '结论放第一段：要做什么、为什么、怎么做成一句话',
      '顺序是目标 → 策略 → 执行。策略没定死之前，不动执行层（分镜、物料、脚本、排期）',
      '洞察写成冲突，不是现象：用户量在涨、但留存持续掉，因为……没有「但是」的只是观察',
      '策略是选择，不是动作：主打高端、放弃低价带是策略；拍一支 TVC 是动作',
      '每个判断配证据：数字、出处、或可核验的事实',
      '给预算区间、时间表、验收标准。该给建议值就直接给，标「假设」，不要满屏待定',
    ],
    avoid: [
      '只罗列现象不给结论',
      '把动作当策略',
      '「赋能」「抓手」「闭环」「心智」「颗粒度」这类黑话',
      '两边都对',
      '满屏「待定」读起来像没做完',
      '结尾升华或总结段',
    ],
    skeleton: [
      '第一段：要做什么、为什么、怎么做，一句话说完',
      '目标：可量化的目标，带时间',
      '策略：选择，说清放弃什么、主打什么',
      '执行：具体动作、谁做、什么时候',
      '预算与验收：钱、时间表、验收指标，不确定的标「假设」',
    ],
    examples: [
      {
        bad: '本次营销活动将围绕品牌调性，通过多渠道联动，实现品效合一。',
        good: '目标是把复购率从 18% 提到 25%。做法只有一条：把首单赠品换成第二次下单才能用的券。',
        why: '「围绕调性」「品效合一」是黑话，拍板的人听完不知道要批什么。给一个数字、一个动作，他才好决定批不批。',
      },
      {
        bad: '我们将持续优化用户体验，打造差异化竞争优势。',
        good: '改三处：结算页去掉两步跳转、库存提示改成实时、退货入口挪到订单详情第一屏。',
        why: '「优化体验」没法验收。改成三个能派活、能排期、能打勾的改动。',
      },
    ],
    // 方案文体有个别的文体没有的问题：它的「空」恰好长在规则没覆盖的位置。
    // 语料里两份模型默认写的方案稿（品牌营销 / 新品上市），通篇没有预算、
    // 没有说清放弃什么、没有一句可核对的事实，规则只抓得住 jargon 和程度副词，
    // 结果一份 23 分、一份 22 分。同一个空洞程度写在报告里能到 99 分。
    // 分数低不等于没问题——这句话必须直接说出来，不然读者会拿 B 级当合格。
    scoreNote:
      '方案策划这个文体，模型默认写法在这套规则下通常只到二十多分。不是它写得好，是它的毛病集中在「有没有预算、有没有说清放弃什么、有没有一句可核对的事实」，这几条规则查不出来。分数低别当成没问题。',
  },
};
export const GENRE_IDS = Object.keys(GENRES);

/** 改写强度 */
export const STRENGTHS = {
  light: {
    id: 'light',
    label: '轻度去味',
    rule: '只删套话、虚词、多余的形容词和「的」，保留原有结构和句子顺序。不改观点，不补新材料。',
  },
  standard: {
    id: 'standard',
    label: '标准改写',
    rule: '重组句子：拆掉欧化定语长链、合并被切碎的短句、换掉 AI 腔句式。允许调整段落划分和顺序，允许补入原文已隐含的具体信息。注意方向是双向的——该拆的拆，该合的合，不是一律变短。',
  },
  rewrite: {
    id: 'rewrite',
    label: '推倒重写',
    rule: '只保留原文的事实、数字、专有名词和结论，其余全部重写。结构和措辞都可以推翻，篇幅可以增减。',
  },
};

export const STRENGTH_IDS = Object.keys(STRENGTHS);

/** 常驻系统提示片段。要短，因为它每一轮都在花 token。 */
export function buildPromptSection(options = {}) {
  const tone = options.promptTone || 'balanced';
  const locale = options.locale || 'zh-CN';
  const localeLine =
    locale === 'zh-TW' || locale === 'zh-HK'
      ? '- 用繁体中文与该地区的自然用词（影片、软体、资讯、透过），不要混入大陆用词。'
      : '- 用大陆简体中文的自然用词，不要混入港台用词（影片、软体、资讯、透过、专案）。';

  const strictExtra =
    tone === 'strict'
      ? `
- 不要用「不是……而是……」「不仅……更是……」「正是……才……」这类对举句式。想对比就把两句分开写。
- 不要在段末追加一句拔高或总结。
- 每段长度不要接近，长短交错。`
      : '';

  const extra = options.extraRules ? `\n- ${String(options.extraRules).trim()}` : '';

  return `# 中文表达：说人话

写中文时按下面的规矩来。目标不是「文采」，是让人读着不别扭、不觉得是机器写的。

下面这些是所有文体共同的底线。小说、报告、方案策划、口播稿、新闻各有各的写法——同一个「不装」，在不同文体里长得不一样。需要具体文体的处方时，用 nature 工具带上 genre 参数查。

**直接删掉这些**
- 公文过渡语：值得注意的是、需要指出的是、综上所述、总而言之、换言之、与此同时、由此可见、不难发现
- 万能背景：在当今社会、随着科技的发展、在这个快速变化的时代、在……的大背景下
- 升华收尾：让我们共同、相信在不久的将来、这正是……的意义所在、值得我们深思
- 空转动词：进行讨论、加以优化、作出决定、推动发展、实现突破 → 直接写讨论、改进、定下来、推、做到
- 抽象黑话：赋能、抓手、闭环、颗粒度、对齐、沉淀、落地、心智、范式、底层逻辑 → 翻译成具体的人和事
- 概括性形容词：丰富的、独特的、深刻的、全面的、系统的 → 删掉，或者换成能被验证的细节

**还有一种空，不在词里，在位置里**
- 开场先说正事。「大家好，欢迎来到本期」「最近，一则……引发了广泛讨论」「不知道你有没有这种感觉」都是开场话，删掉直接说。
- 中间别打太极。「在……方面」「某种程度上」「这也让我们不禁思考」——要么给数字，要么删。
- 结尾说结果，别升华。「希望对你有所启发」「我们下期再见」「答案就在于……」都是收尾话。
- 「相关负责人表示」「业内人士指出」不算信源。有名字写名字，没有就说没有人愿意具名。
- 小说写他做了什么。写「思绪万千」「那一刻，时间仿佛静止了」是在告诉读者该感动了，读者不会感动。

**改成这样**
- 结论放在第一句。理由和背景放在后面，或者不放。
- **分清两种长**。定语堆叠、「的」字连挂三层、从句套从句的长句要拆；用逗号串起一串小句、最后才落句号的流水句是正常中文，不许切碎。
- **长短交错**：一个长句后面接一个短句，或者几个短句之后放开写一个长句。全短句和全长句一样假。
- 别把每句话都写成一段。一段通常有两句以上——自媒体推文、口播稿、网文连载这类平台排版本来就是一句一段，不在此列。
- 中文可以承前省略主语。连着几句讲同一个人，不必每句都补「他」。
- 少用连词。中文靠语序和语义接续，不必每句都挂「因为／所以／虽然／但是」。
- 用具体的数字、时间、地点、人名、原话。写不出具体细节，说明这句可以删。
- 可以出现「其实」「说白了」「问题是」「我」「你」，也可以有不完整的句子。
- 段落长短不要整齐，句子长短不要整齐。整齐本身就是机器痕迹。
- 需要强调就靠语序和位置，不要靠加粗和感叹号。
${localeLine}${strictExtra}${extra}

**判断标准**：如果一段话换成任何别的主题也成立，那它就是空话，删掉重写。`;
}

/**
 * 技能正文。按需加载，可以比常驻提示详细。
 * 控制在 6000 字符以内，避免被工具结果修剪器截断。
 */
export function buildSkillBody(options = {}) {
  const extra = options.extraRules ? `\n\n## 附加要求\n\n${String(options.extraRules).trim()}` : '';
  const banned = Array.isArray(options.customBannedWords) && options.customBannedWords.length
    ? `\n\n## 使用者指定的回避词\n\n${options.customBannedWords.join('、')}`
    : '';

  // 段落级的骨架。对照管的是「这一句怎么说」，骨架管的是「先说什么后说什么」。
  // 顺序比措辞更早定型：结构错了，句子再干净也不像那个文体。
  const genreSkeletons = Object.values(GENRES)
    .filter((g) => g.skeleton && g.skeleton.length)
    .map((g) => `**${g.label}**\n${g.skeleton.map((s) => `　${s}`).join('\n')}`)
    .join('\n\n');

  // 按文体的对照，每个文体取第一组。通用对照治的是跨文体的毛病，
  // 这一节治的是「同一个词在这儿是毛病、在那儿是行话」。
  const genreExamples = Object.values(GENRES)
    .map((g) => {
      const ex = g.examples && g.examples[0];
      if (!ex) return '';
      return `**${g.label}**\n✗ ${ex.bad}\n✓ ${ex.good}\n　${ex.why}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `# nature · 中文写作体检

把一段中文改到读起来像人写的。核心不是换同义词，是**把抽象换回具体，把结构打散，把腔调降下来**。

## 一、先判断：AI 味从哪来

按杀伤力排序，从大到小查：

1. **空**：整段没有一个数字、时间、地点、人名或原话。这是最致命的。
2. **齐**：句子一样长，段落一样长，每段都是「主题句 + 展开 + 收束」。
3. **套**：套话过渡语、万能背景、升华结尾。
4. **虚**：形容词和程度副词顶替了事实。
5. **翻**：欧化长句、被动句、「的」字长链、连词冗余。

## 二、必删清单

**过渡语**：值得注意的是、需要指出的是、综上所述、总而言之、换言之、换句话说、与此同时、在此基础上、从这个角度看、不难发现、由此可见、更重要的是

**背景铺垫**：在当今社会、随着……的发展、在……的大背景下、在这个快速变化的时代

**结尾升华**：让我们共同、共同期待、未来可期、相信在不久的将来、这正是……的意义所在、值得我们深思

**对举句式**：不是……而是……、不仅……更是……、既……又……、无论……还是……都……、与其说……不如说……、正是……才……、从……到……，从……到……

**空转动词**：进行／加以／予以／作出／开展／推动／促进／实现／打造／构建 + 名词 → 直接用那个动词

**抽象名词**：可操作性、必要性、重要性、复杂性、多元性 → 换成具体判断

**行业黑话**：赋能、抓手、闭环、颗粒度、对齐、沉淀、落地、心智、范式、底层逻辑、护城河、组合拳 → 翻译成「谁对谁做了什么」

**虚高程度**：极大地、深刻地、充分地、有效地、全面地、至关重要、举足轻重、不可或缺

**概括形容词**：丰富的、独特的、深刻的、全面的、系统的、广泛的、有力的

## 三、句式改造

**分清两种长**。中文有两种长句，待遇完全相反。

该拆的是定语堆叠的欧化长句：
> 原：一个在县城长大、后来去深圳打工、最后又回到老家开店的年轻人
> 改：他在县城长大，后来去深圳打工，最后回老家开了个店。

不该拆的是意合的流水句：
> 他推开门，屋里没人，桌上放着半杯凉掉的茶，杯壁上有一圈茶渍。

这句用逗号串起四个小句、最后落一个句号，是成熟的中文，不是病句。把它切成「他推开门。屋里没人。桌上放着半杯凉掉的茶。」才是把它写坏了。

判断标准只有一个：出声读一遍。不该换气的地方换了气，就拆；读下来顺，就别动。

**去连词**。中文重意合。删掉「因为／所以」「虽然／但是」「如果／那么」，读一遍，多数时候仍然通顺，而且更利落。

**改被动**。「被……所……」改成主动句，或者用「让」「由」。不知道施动者就换主语。

**去掉名词化**。「进行讨论」→「讨论」，「作出决定」→「定下来」，「具有良好的可操作性」→「照着这几步就能做」。

**打散对称**。三个排比句删掉一个或两个；并列短语改成有详有略的叙述；总-分-总砍掉头和尾。

## 四、节奏：别把中文切碎

有一类模型（和一些提示词）把「简洁」「清晰」直接理解成「句子要短」，写出来的中文全是三五字的短句，一句一段，读起来像口播稿或者 PPT 要点。这和欧化长句是同一个病的两个极端，而且更常见。

**中文的句子边界靠语气和语义，不靠语法结构。** 逗号串起一串小句、最后才落句号，是正常写法。健康的中文叙述里，逗号数通常是句号数的 1.5 到 3 倍——一个句号前平均有一到三个逗号。如果你写的东西里句号比逗号还多，那基本可以确定是切碎了。

**四条要守的**：

1. **关系紧密的小句用逗号连着写。** 因果、转折、递进如果发生在同一口气里，就不要断开。断开了，读者得自己拼逻辑。
2. **长短交错，不是一律短。** 一个长句后面接一个短句，或者几个短句之后放开写一个长句。短句的分量来自它周围有长句；全是短句，就没有重音了。
3. **一段通常两句以上。** 一句一段是社交媒体的排版习惯，写文章和小说会显得轻飘。
4. **可以承前省略主语。** 连着几句讲同一个人，不必每句都补「他」。中文省略主语不会造成歧义，反而更顺。

**短句什么时候是对的**：写紧张、写动作、写急促的对话，短句能加快节奏。但那是局部手段，不能通篇如此。用了三四个短句之后，就该放开写一个长的。

**对照**：
> 碎片化：他推开门。屋里没人。桌上有茶。茶是凉的。他摸了摸。杯身是温的。
> 正常：他推开门，屋里没人。桌上放着半杯凉掉的茶，杯壁上有一圈茶渍。他伸手摸了摸杯身，还是温的。

第二种只多了几个逗号，但读起来是人在讲故事；第一种像在念字卡。

## 五、加什么

- **具体锚点**：数字、金额、日期、地名、机构名、当事人原话。每 300 字至少一个。
- **动作**：把「体现了……」改成「他把……」。
- **人的痕迹**：可以有「其实」「说白了」「问题是」，可以有犹豫和补充，可以用「我」。
- **长短交错**：一个长句后面跟一个短句，会立刻显得有人味。
- **留白**：不是每段都要收束。想到哪写到哪，写不动就停。

## 六、分文体要点

同一个「不装」，在不同文体里长得不一样。先认清写给谁、用什么介质，再动笔。

- **日常/说明**：结论第一句。给动作和边界，不写总结段。
- **自媒体推文**：前 15 字是钩子。可以短，但一个长度的短句连排也会腻，中间放一个长的。一句一段是版面惯例，不用改。
- **口播稿/视频脚本**：写出来是要念的，不是要看的。句子短到一口气能念完，关键信息说两遍——听众没法回看。书面连接词（因此、综上、换言之）全换成口语。数字换算成能听懂的量级。
- **小说**：写感官和动作，不写「他感到悲伤」。对话要有来回，不要一问一答的说明文。叙述部分尤其要长短交错，流水句是好东西。
- **网文连载**：一句一段是手机阅读的平台惯例，不是 AI 腔。每章结尾留钩子，但别每段都留。
- **报告/公文**：数字、时间、责任人、风险。坏消息放前面。能写「张三 3 月 5 日前验收完」就别写「相关工作有序推进」。求准确，不必刻意求短。
- **技术文档**：版本、平台、可复制的命令、预期结果、失败怎么办。第二人称。步骤用列表，解释用完整句子。
- **新闻**：信源、时间、地点、数字。事实和评论分开。第一段放最重要的事实。短段落是体裁要求，但一条消息通常不止一句。
- **财经/商业分析**：数据带来源和时间点，估算值和实际值分开说。每个判断后面跟依据。风险写在机会前面，或者至少并排写。一句一段是这类稿件的标准排版。
- **评论/专栏**：开头给判断，中间给理由和反方最强论点，交代自己站在哪说话。
- **方案策划**：结论放第一段，然后目标 → 策略 → 执行。策略没定死之前不动执行层（分镜、物料、脚本、排期）。洞察要写出冲突——用户量在涨、但留存持续掉，因为什么；没有「但是」的只是观察。策略是选择不是动作：主打高端、放弃低价带是策略，拍一支 TVC 是动作。每个判断配证据，给预算区间和时间表，该给的建议值直接给并标「假设」。

## 七、改完自检

逐条过：

1. 有没有一句话，换成别的主题也成立？有就删。
2. 有没有连续三句长度接近？有就拆一句或并一句。
3. 有没有段落以「因此」「总之」「由此可见」开头？有就删掉开头那半句。
4. 最后一段是不是在升华？是就整段砍掉，停在具体事实上。
5. 通篇有没有一个数字、一个时间、一个具体的人？没有就补，补不出就说明这段没内容。
6. **数一下逗号和句号。** 句号比逗号多，说明切碎了——把关系紧密的短句用逗号合起来。
7. **出声读一段。** 如果在不该换气的地方换了气，或者读起来像在念字卡，就是碎片化，合并它。
8. **看有没有连续三句都由「他」「她」「我」开头。** 有就删掉后面几句的主语，让语势接下去。

## 八、改写对照

左边是机器写法，右边是人写法。照这个方向改。

**1. 套话开场**
✗ 在当今这个快速变化的时代，人工智能正在深刻地改变着我们的生活。
✓ 去年公司裁掉十二个客服，换成了一套自动回复。

**2. 对举句式**
✗ 这不仅仅是一次产品升级，更是一次思维方式的变革。
✓ 这次升级只动了三处：首页、搜索、结算。

**3. 空转的动词**
✗ 我们需要对该方案进行进一步的优化与调整。
✓ 这方案还得改，主要卡在第三步。

**4. 升华收尾**
✗ 让我们共同期待，在不久的将来会变得更好。
✓ 删掉整句。停在上一句的事实上。

**5. 抽象黑话**
✗ 打通底层链路，对齐颗粒度，最终形成业务闭环。
✓ 先把几个部门的数据接口对上，统一用一套口径统计。

**6. 没有落点的形容词**
✗ 这是一次非常丰富、独特而深刻的体验。
✓ 排了四十分钟队，进去只看了六分钟。

**7. 欧化长句**
✗ 一个在县城长大、后来去深圳打工、最终又回到老家开店的年轻人。
✓ 他在县城长大，后来去深圳打工，最后回老家开了个店。

**8. 骑墙表态**
✗ 人工智能是一把双刃剑，既有积极的一面，也有消极的一面。
✓ 我更担心成本，不是失业——算力账单比工资账单还贵。

**9. 无主语被动**
✗ 相关工作正在有序推进中。
✓ 张三在核对第三批数据，周五之前给结果。

**10. 排比堆砌**
✗ 无论是效率、质量还是体验，都得到了全面的提升。
✓ 出图时间从四十分钟压到六分钟，返工率降了一半。

## 九、按文体再看一眼

同一个写法，在一个文体里是毛病，在另一个文体里是行话。动笔前先对一下自己写的是哪一类。

### 先定结构

段落放什么、先后顺序，比句子怎么写更早决定像不像那个文体。

${genreSkeletons}

### 再看句子

换汤不换药是最常见的敷衍：改的是句子，不是词。

${genreExamples}

## 十、不要做的事

- 不要把 AI 腔换成另一种腔（比如改成文艺腔、鸡汤腔、营销腔）。目标是**普通人在说事**。
- 不要为了「去味」而堆口语词。「其实说白了真的是」同样假。
- 不要改掉事实、数字、结论和当事人的立场。
- 不要加原文没有的信息。缺细节时，宁可留着空缺，也不要编。${banned}${extra}`;
}

/** 指标参考区间，用于报告里的对照 */
/**
 * 指标参考区间。
 *
 * 跟节奏有关的几项按文体取值——口播稿和报告的下限本来就不同，
 * 写死一个数字会让报告自相矛盾（表格说"1.5–3"，正文却按 0.7 判）。
 */
function metricReference(genre) {
  const profile = RHYTHM_PROFILES[genre] || DEFAULT_RHYTHM_PROFILE;
  return [
    {
      key: 'avgSentenceLength',
      label: '平均句长',
      unit: '字',
      good: `${profile.minAvgSentence}–80`,
      bad: (v) => v > 80 || v < profile.minAvgSentence,
    },
    {
      key: 'commaPeriodRatio',
      label: '逗号／句号比',
      unit: '',
      digits: 2,
      good: `≥ ${profile.minCommaRatio}`,
      bad: (v) => v < profile.minCommaRatio,
    },
    {
      key: 'maxConsecutiveShort',
      label: '最长连续短句',
      unit: '句',
      good: `≤ ${profile.maxConsecutiveShort}`,
      bad: (v) => v > profile.maxConsecutiveShort,
    },
    { key: 'sentenceCv', label: '句长变异系数', unit: '', digits: 2, good: '> 0.40', bad: (v) => v !== null && v < 0.35 },
    { key: 'paragraphCv', label: '段长变异系数', unit: '', digits: 2, good: '> 0.35', bad: (v) => v !== null && v < 0.30 },
    {
      key: 'oneSentenceParagraphRatio',
      label: '一句一段占比',
      unit: '',
      digits: 2,
      good: `< ${profile.maxOneSentenceParagraph}`,
      needParagraphs: 3,
      bad: (v) => v > profile.maxOneSentenceParagraph,
    },
    { key: 'dePer1000', label: '每千字「的」', unit: '个', digits: 1, good: '25–50', bad: (v) => v > 55 },
    { key: 'anchorsPer1000', label: '每千字具体锚点', unit: '处', digits: 1, good: '> 5', bad: (v) => v < 3 },
    { key: 'colloquialPer1000', label: '每千字口语标记', unit: '处', digits: 1, good: '> 2', bad: (v) => v < 1.5 },
  ];
}

/** 保留旧名字，供外部按 general 文体引用 */
const METRIC_REFERENCE = metricReference('general');

function fmt(value, digits) {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return String(value);
  if (typeof digits === 'number') return value.toFixed(digits);
  return String(Math.round(value * 10) / 10);
}

/**
 * 渲染诊断报告（markdown）。这是工具返回给模型的主要内容。
 */
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八'];

/** 渲染一组命中项 */
function renderFindings(lines, findings, max = 8) {
  const top = findings.slice(0, max);
  top.forEach((f, i) => {
    // 节奏类命中是分布问题，「次数」含义不同，单独标。
    const countLabel = f.mode === 'rhythm' ? `节奏 · ${f.count} 句相关` : `${f.severity} × ${f.count}`;
    // 扣分写在标题里。原来末尾还有一节「模板腔指数是怎么来的」把同样的
    // 八个名字再列一遍，读者已经在这里看过一次了。
    const pointLabel = f.points > 0 ? ` · 扣 ${f.points} 分` : '';
    lines.push(`### ${i + 1}. ${f.label}　〔${countLabel}${pointLabel}〕`);
    lines.push('');
    if (f.detail) lines.push(`实测：${f.detail}`);
    for (const sample of f.samples.slice(0, 3)) {
      const note = sample.note ? `${sample.note}　` : '';
      lines.push(
        sample.line > 0 ? `- ${note}第 ${sample.line} 行：${sample.context}` : `- ${note}${sample.context}`,
      );
    }
    if (f.detail || f.samples.length) lines.push('');
    lines.push(`- **为什么是问题**：${f.why}`);
    lines.push(`- **怎么改**：${f.fix}`);
    lines.push('');
  });
  if (findings.length > top.length) {
    const rest = findings
      .slice(top.length)
      .map((f) => `${f.label}(${f.count})`)
      .join('、');
    lines.push(`其余较轻的：${rest}`);
    lines.push('');
  }
}

/**
 * 改前改后对照。
 *
 * 改稿最容易犯的错不是改不掉，是改坏了：删掉了事实、把结论改软、
 * 或者一边去味一边长出新的腔调。只看改后那一稿看不出来，必须和改前对上。
 *
 * 三列各有各的用处：解决了说明改对了方向，还没处理说明改得不够，
 * 新引入说明改出了新问题——最后这一列最容易被忽略，也最伤。
 */
export function buildComparison(before, after) {
  if (!before || !before.ok || !after || !after.ok) return '';

  const beforeIds = new Map((before.findings || []).map((f) => [f.id, f]));
  const afterIds = new Map((after.findings || []).map((f) => [f.id, f]));
  const resolved = [...beforeIds.keys()].filter((id) => !afterIds.has(id));
  const remaining = [...afterIds.keys()].filter((id) => beforeIds.has(id));
  const introduced = [...afterIds.keys()].filter((id) => !beforeIds.has(id));

  const names = (ids, map) => (ids.length ? ids.map((id) => map.get(id).label).join('、') : '没有');

  const lines = [];
  lines.push('## 改前改后');
  lines.push('');
  lines.push('| | 改前 | 改后 |');
  lines.push('|---|---|---|');
  lines.push(`| 模板腔指数 | ${before.score} / 100（${before.grade} 级） | ${after.score} / 100（${after.grade} 级） |`);
  lines.push(`| 正文长度 | ${before.chars} 字 | ${after.chars} 字 |`);
  lines.push(`| 命中类目 | ${beforeIds.size} 类 | ${afterIds.size} 类 |`);
  lines.push('');
  lines.push(`**解决了**（${resolved.length} 类）：${names(resolved, beforeIds)}`);
  lines.push(`**还没处理**（${remaining.length} 类）：${names(remaining, afterIds)}`);
  lines.push(`**新引入**（${introduced.length} 类）：${names(introduced, afterIds)}`);
  lines.push('');

  const warnings = [];
  if (after.score > before.score) {
    warnings.push(`分数涨了 ${after.score - before.score} 分。这是改反了方向，不是没改够——先回退，再重来。`);
  }
  if (introduced.length) {
    warnings.push('「新引入」里的每一条都是这次改稿自己长出来的。逐条看：是原文真没有，还是改的时候顺手写成了套话。');
  }
  const dropRatio = before.chars > 0 ? 1 - after.chars / before.chars : 0;
  if (dropRatio > 0.3) {
    warnings.push(
      `长度掉了 ${Math.round(dropRatio * 100)}%。去味通常只会少一成到两成，掉这么多往往是删掉了事实或整段。回去核对原文，别把数字、时间、人名删没了。`,
    );
  }
  if (warnings.length) {
    lines.push('**要注意**：');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  return lines.join('\n');
}

const LAYER_ADVICE = {
  word: '把词换成具体的东西就行，句子骨架不用动。',
  position: '这些话本身不假，是位置不对——开头别铺背景，结尾别升华，该给数的地方别打太极。',
  structure: '词和位置都还行，是长短和顺序的问题——该长的地方别切碎，该断的地方别拖着。',
};

// 同样四十分：全是黑话，改词就行；全是万能开场，挪位置就行；
// 全是节奏问题，得重排。不说清是哪一层，用户只会觉得「哪儿都不对」，
// 然后一处都不改。
function buildLayerNote(result) {
  const layers = result.layerSummary || [];
  if (!layers.length) return '';
  const top = layers[0];
  const advice = LAYER_ADVICE[top.layer];
  if (!advice) return '';
  const others = layers.slice(1).filter((l) => l.points > 0);
  const rest = layers
    .slice(1)
    .filter((l) => l.share >= 20)
    .map((l) => `${l.label}占 ${l.share}%`);
  const tail = rest.length ? `其次是${rest.join('，')}。` : '';
  // 占比同一个数字，分量可以差很远：占 86% 但只扣 8 分，和占 86% 扣 80 分，
  // 一个是顺手改改，一个得推倒重来。所以绝对分和占比一起给。
  const after = Math.max(0, Math.round((result.score || 0) - top.points));
  const scale =
    others.length === 0
      ? `这一层处理完基本就干净了。`
      : `这一层处理完，大概能从 ${result.score} 降到 ${after}，剩下的主要是${others[0].label}。`;
  return `**问题主要在${top.label}上**（扣 ${top.points} 分，占 ${top.share}%）。${advice}${tail}${scale}`;
}

export function buildReport(result, args = {}, options = {}) {
  if (!result.ok) {
    return `# nature · 写作体检\n\n没有可分析的内容：${result.reason || '输入为空'}。`;
  }

  const genre = GENRES[args.genre] || GENRES.general;
  const strength = STRENGTHS[args.strength] || STRENGTHS.standard;
  const s = result.stats;
  const lines = [];

  // 分栏用排除法：凡是没有被显式标成 error / style 的，都算模板腔这一类。
  // 之前用显式列举（template | rhetoric | rhythm），会让标了 style 的
  // 节奏类命中同时进两组。
  const templateFindings = result.findings.filter((f) => f.signal !== 'error' && f.signal !== 'style');
  const errorFindings = result.findings.filter((f) => f.signal === 'error');
  const styleFindings = result.findings.filter((f) => f.signal === 'style');

  lines.push('# 文本诊断');
  lines.push('');
  // 封顶说明：分数到 100 就不动了，但改稿人要区分「刚到顶」和「早就爆了」。
  const overflow = (result.rawScore || 0) > 100 ? `（扣分累计 ${result.rawScore}，分数已封顶）` : '';
  lines.push(
    `**模板腔指数 ${result.score} / 100 · ${result.grade} 级 — ${result.gradeText}**${overflow}　|　` +
      `${result.chars} 字 · ${s.sentences} 句 · ${s.paragraphs} 段 · 文体「${genre.label}」· 强度「${strength.label}」`,
  );
  lines.push('');
  lines.push('> 这个指数衡量的是文本里的**模板化痕迹**——套话、黑话、对举句式、节奏碎片。');
  lines.push('> 它不判断作者是谁。真人写作同样会命中这些模式，把每一条命中都当成「这是 AI 写的」证据，是错的用法。');
  lines.push('> 用字错误和排版建议不算分，单列在下面。');
  lines.push('');

  // 同一个分数，改法可以完全不同。这一行决定后面所有建议怎么读。
  const layerNote = buildLayerNote(result);
  if (layerNote) {
    lines.push(layerNote);
    lines.push('');
  }

  // 有些文体的分数天生偏低，因为它的毛病长在规则够不着的地方。
  // 不说的话，读者会把「22 分 B 级」读成「基本合格」。
  if (genre.scoreNote && (result.score || 0) >= 10 && (result.score || 0) < 50) {
    lines.push(`> ${genre.scoreNote}`);
    lines.push('');
  }

  // 改了再验一遍：只看改后这一稿，分不清「改对了」和「改坏了」。
  if (args.before) {
    const comparison = buildComparison(args.before, result);
    if (comparison) lines.push(comparison);
  }

  // 文体提示：文体选错是这套规则最容易误判的地方。
  // 与其让插件猜，不如把「换个体文体会差多少」摆出来，让使用者自己定。
  const penaltyMap = result.rhythmPenaltyByGenre || {};
  const currentPenalty = penaltyMap[result.genre] ?? 0;
  const looser = Object.entries(penaltyMap)
    .filter(([g, p]) => g !== result.genre && p < currentPenalty - 6)
    .sort((a, b) => a[1] - b[1]);
  if (looser.length > 0) {
    const [bestGenre, bestPenalty] = looser[0];
    const bestLabel = GENRES[bestGenre]?.label || bestGenre;
    lines.push(
      `> **文体提示**：现在按「${genre.label}」判定，节奏部分扣了 ${currentPenalty} 分。` +
        `同一段文本按「${bestLabel}」判定只扣 ${bestPenalty} 分。` +
        '如果你写的就是那个类型，换文体再跑一次结论会更准——排版惯例随平台变，不是写作水平。',
    );
    lines.push('');
  }

  if (result.tooShort) {
    lines.push('> 样本偏短（不足 80 字），指标仅供参考，重点看下面的命中项。');
    lines.push('');
  }

  let sectionNo = 0;

  // 命中的类目一多，人就卡住了：不知道先改哪条，常见的反应是一条都不改。
  // 所以先给前三，附上各自扣了多少分、合起来占多少。
  // 只在这一节比详表短的时候才有价值——命中两三条时直接看下面的清单就行。
  // 扣分并列时按超阈值的倍数排：同样拿 16 分，超 27 倍和超 4.7 倍不是一回事。
  // 封顶把分数压平了，倍数还留着真实差距。
  const ranked = templateFindings
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points || (b.over || 0) - (a.over || 0));
  if (ranked.length >= 4) {
    const top3 = ranked.slice(0, 3);
    const topSum = top3.reduce((n, f) => n + f.points, 0);
    const share = result.score > 0 ? Math.round((topSum / result.score) * 100) : 0;
    lines.push(`## ${CN_NUM[sectionNo++]}、如果只改三处`);
    lines.push('');
    lines.push(
      `这份稿子命中 ${ranked.length} 类模板腔。一处一处改，多半改到一半就停了。` +
        `按扣分从多到少，前三条占 ${share}%：`,
    );
    lines.push('');
    top3.forEach((f, i) => {
      // 只有真并列才写倍数。不并列时分数线本身就排好了序，再挂一句
      // 「超阈值 7.6 倍」是冗余，还会让人以为它跟下面那条同分。
      const tied = top3.some((g, j) => j !== i && g.points === f.points);
      const tie = tied && f.over && f.over >= 2 ? `，超阈值 ${f.over} 倍` : '';
      lines.push(`${i + 1}. **${f.label}**（扣 ${f.points} 分${tie}）—— ${f.fix}`);
    });
    lines.push('');
    lines.push('改完再跑一次。剩下的通常是零散的，逐条处理就行。');
    lines.push('');
  }

  // 命中分散在全文时，逐条规则改会来回翻稿子。先说哪几段最有问题，
  // 一鼓作气改完一段，比按规则清单跳着改省一半时间。
  // 只列前三段：排在后面的命中密度已经很低，一段一处不值得专门跑一趟。
  // 少于四段就不列了：三五段的稿子，上一节的「先改三处」已经把该动的点说完，
  // 再叠一份段号清单，两份排法还不一样，读者要在脑子里对齐两遍。
  const hotspots = (result.paragraphHits || []).filter((h) => h.rules >= 2);
  if (hotspots.length >= 2 && s.paragraphs >= 4) {
    const top = hotspots.slice(0, 3);
    lines.push(`## ${CN_NUM[sectionNo++]}、先改哪几段`);
    lines.push('');
    lines.push(`全文 ${s.paragraphs} 段，问题最集中的是这几段：`);
    lines.push('');
    top.forEach((h) => {
      lines.push(`- 第 ${h.paragraph} 段：命中 ${h.rules} 类，共 ${h.hits} 处`);
    });
    lines.push('');
    lines.push('一段一段来。同一段里的几处往往能一起处理掉，按规则清单跳着改反而来回翻。');
    lines.push('');
  }

  // ── 局部特别密的地方（长文才有）
  // 分数按全文算，这是对的：文体校准就是按全文统计的。
  // 但读者真正要改的常常是那一小段，所以另外指出来，不动分数。
  const local = result.localHotspots || [];
  if (local.length) {
    lines.push(`## ${CN_NUM[sectionNo++]}、局部特别密的地方`);
    lines.push('');
    lines.push('全文的分数按整篇算，所以某一段特别密会被平均掉。这几段单独看比整篇密得多：');
    lines.push('');
    local.forEach((h) => {
      lines.push(`- 第 ${h.paragraph} 段：${h.hits} 处（全文平均每段 ${h.avg} 处）`);
    });
    lines.push('');
    // 分数本来就低的时候，这几段多半是文体惯例（公文的政策列举、财经稿的
    // 行业词），不是毛病。说清楚这一层，免得读者以为整篇到处是雷。
    if ((result.score || 0) < 20) {
      lines.push('整篇分数不高，这几段很可能只是这个文体的惯例，看一眼就行。');
    } else {
      lines.push('分数没算这一段，要改就单独把它拎出来扫一遍。');
    }
    lines.push('');
  }

  // ── 没查到的部分
  if (result.blindSpots && result.blindSpots.length) {
    lines.push(`## ${CN_NUM[sectionNo++]}、这段没查到的部分`);
    lines.push('');
    result.blindSpots.forEach((s) => {
      lines.push(`- ${s}`);
    });
    lines.push('');
    // 两个方向的话不能混着说：短文本是「查得少所以分低」，
    // 长文本是「查得到但会平均掉」。说反了就是误导。
    if (result.stats.sentences < 6 || result.stats.paragraphs < 3) {
      lines.push('短文本的分数别和整篇稿子比。能查的项目更少，这个数只代表这几项查出来的东西——它可能偏高，也可能偏低。');
    } else {
      lines.push('这一篇的分数只代表整体。局部特别密的地方，要单独把那几段拎出来扫。');
    }
    lines.push('');
  }

  // ── 模板腔信号
  lines.push(`## ${CN_NUM[sectionNo++]}、模板腔信号`);
  lines.push('');
  if (templateFindings.length === 0) {
    lines.push('没有命中任何模板腔模式。');
    lines.push('');
  } else {
    renderFindings(lines, templateFindings, 8);
  }

  // ── 文字错误
  if (errorFindings.length) {
    lines.push(`## ${CN_NUM[sectionNo++]}、文字错误`);
    lines.push('');
    lines.push('这一类与「像不像机器写的」无关——谁写的都该改。');
    lines.push('');
    renderFindings(lines, errorFindings, 6);
  }

  // ── 编辑建议
  if (styleFindings.length) {
    lines.push(`## ${CN_NUM[sectionNo++]}、编辑建议`);
    lines.push('');
    lines.push('口味和排版上的取舍，不是错误。按你的文体和读者自己判断。');
    lines.push('');
    renderFindings(lines, styleFindings, 6);
  }

  // ── 指标
  lines.push(`## ${CN_NUM[sectionNo++]}、结构性指标`);
  lines.push('');
  lines.push('| 指标 | 本文 | 人写的常见区间 | 判断 |');
  lines.push('| --- | --- | --- | --- |');
  for (const m of metricReference(result.genre)) {
    const value = s[m.key];
    // 段落太少时，「一句一段占比」这类指标没有意义，显示为 —，
    // 免得单段文本被判成「正常」给读者错误暗示。
    const notApplicable =
      value === null || value === undefined || (m.needParagraphs && (s.paragraphs ?? 0) < m.needParagraphs);
    const flag = notApplicable ? '—' : m.bad(value) ? '⚠ 偏离' : '正常';
    const shown = notApplicable
      ? '—'
      : m.unit
        ? `${fmt(value, m.digits)} ${m.unit}`
        : fmt(value, m.digits);
    lines.push(`| ${m.label} | ${shown} | ${m.good} | ${flag} |`);
  }
  lines.push('');
  // 这张表里标了「偏离」的项目不一定扣了分：严重的会变成上面的节奏类命中，
  // 轻微的只是提醒。不说清楚，读者会拿表格里的偏离去对分数，对不上就以为算错了。
  lines.push('> 标⚠的不一定扣了分——严重的会变成上面「模板腔信号」里的节奏类命中，轻微的只是提醒。');
  lines.push('');

  const notes = [];
  // 长句不是罪：中文的流水句可以很长，烽火戏诸侯通篇四五十字一句也是好文章。
  // 这里只报事实，不下「必须拆」的判断。
  const veryLongRatio = s.sentences > 0 ? s.veryLongSentences / s.sentences : 0;
  if (s.veryLongSentences > 0) {
    notes.push(
      `有 ${s.veryLongSentences} 句超过 100 字（占 ${Math.round(veryLongRatio * 100)}%）。` +
        '长句本身不是问题——中文的流水句可以很长——要确认的不是长度，是有没有定语堆叠、从句套从句。',
    );
  }
  if (s.anchorCount === 0) notes.push('全文没有任何数字、日期、引语或专名——这是最典型的「空转」。');
  if (s.firstPersonPer1000 === 0 && s.colloquialPer1000 === 0) notes.push('没有「我」，也没有任何语气词，通篇书面语。');
  if (notes.length) {
    for (const n of notes) lines.push(`- ${n}`);
    lines.push('');
  }

  // ── 扣分构成
  // 规则命中的扣分已经写在上面每条的标题里了。这里只补「没有对应命中、但确实
  // 扣了分」的那几项——句长整齐、缺锚点、没有口语标记这些结构性指标。
  // 原来这一节把八个名字再列一遍，读者在上面刚看过。
  if (result.breakdown.length) {
    const hitLabels = new Set(templateFindings.map((f) => f.label));
    const structuralOnly = result.breakdown.filter((b) => !hitLabels.has(b.source));
    if (structuralOnly.length) {
      lines.push(`## ${CN_NUM[sectionNo++]}、另外几处扣分`);
      lines.push('');
      for (const b of structuralOnly) {
        lines.push(`- ${b.source}　+${b.points}`);
      }
      lines.push('');
    }
  }

  // ── 别动的地方
  const keeps = buildKeeps(result);
  if (keeps.length) {
    lines.push(`## ${CN_NUM[sectionNo++]}、这些地方不用动`);
    lines.push('');
    lines.push('改稿最常见的翻车不是没改掉毛病，是把好东西一起改掉了。下面几条是这份稿子本来就有、统计上看得出来是对的：');
    lines.push('');
    for (const k of keeps) lines.push(`- ${k}`);
    lines.push('');
  }

  // ── 处方
  lines.push(`## ${CN_NUM[sectionNo++]}、改写处方`);
  lines.push('');
  lines.push(buildPrescription(result, args, options).body);

  return lines.join('\n');
}

/**
 * 改稿最容易的翻车方式是把好东西一起改掉。所以先说哪些别动。
 *
 * 只陈述客观统计，不夸、不打分：句长变异系数、段长变异系数、锚点数量、
 * 口语词密度。这四项都有量出来的阈值，不是感觉。
 */
export function buildKeeps(result) {
  const s = result.stats;
  if (!s) return [];
  const keeps = [];
  if (s.sentences >= 10 && s.sentenceCv >= 0.45) {
    keeps.push(
      `句子长短本来就有起伏（变异系数 ${s.sentenceCv.toFixed(2)}）——别为了「整齐」把长句都切碎`,
    );
  }
  if (s.paragraphs >= 5 && s.paragraphCv !== null && s.paragraphCv >= 0.4) {
    keeps.push(
      `段落长短本来就不整齐（变异系数 ${s.paragraphCv.toFixed(2)}）——别为了「匀称」去凑字数`,
    );
  }
  if (s.anchorCount >= 5) {
    keeps.push(`有 ${s.anchorCount} 处数字、原话或时间——这些是全文最不该动的部分`);
  }
  if (s.colloquialPer1000 >= 1.5) {
    keeps.push(
      `每千字有 ${s.colloquialPer1000.toFixed(1)} 处口语词——这是人味，别换成更正式的说法`,
    );
  }
  return keeps;
}

/**
 * 生成改写处方。工具返回它，模型照着执行。
 */
export function buildPrescription(result, args = {}, options = {}) {
  const genre = GENRES[args.genre] || GENRES.general;
  const strength = STRENGTHS[args.strength] || STRENGTHS.standard;
  const keep = typeof args.keep === 'string' && args.keep.trim() ? args.keep.trim() : '';
  const lines = [];

  const judged = result.findings.filter((f) => f.signal !== 'error' && f.signal !== 'style');
  const errors = result.findings.filter((f) => f.signal === 'error');
  const styles = result.findings.filter((f) => f.signal === 'style');

  // 没有模板腔问题时，不要还摆出一副「要给你挑毛病」的架势。
  // 一段手写的小说被判「标准改写」是荒谬的，处方必须认这个账。
  if (judged.length === 0) {
    lines.push('**这段不需要去模板腔。** 没有命中套话、黑话、对举句式或节奏问题。');
    lines.push('');
    if (errors.length) {
      lines.push('**要做的只有改错**：');
      for (const f of errors) {
        for (const sample of f.samples.slice(0, 12)) {
          if (sample.note) lines.push(`- ${sample.note}`);
          else if (sample.line > 0) lines.push(`- 第 ${sample.line} 行　${f.label}：${sample.context}`);
          else lines.push(`- ${f.label}`);
        }
      }
      lines.push('');
    }
    if (styles.length) {
      lines.push('**再看一眼这几处口味问题**（可改可不改）：');
      for (const f of styles) lines.push(`- ${f.label} → ${f.fix}`);
      lines.push('');
    }
    lines.push('**不要做的事**：不要把长句拆短，不要重排段落，不要改语序。原文的节奏没有毛病，动它只会更差。');

    return {
      body: lines.join('\n'),
      headline: `${genre.label}：只需改错，无需改写`,
    };
  }

  lines.push(`**文体**：${genre.label}。读者是${genre.reader}`);
  lines.push('');
  lines.push(`**强度**：${strength.label} —— ${strength.rule}`);
  lines.push('');

  if (keep) {
    lines.push(`**必须保留**：${keep}`);
    if (args.missingKeep && args.missingKeep.length) {
      lines.push('');
      lines.push(
        `其中${args.missingKeep.map((s) => `「${s}」`).join('、')}在当前文本里找不到。要么是记错了要保的东西，要么是稿子里本来就漏了——先确认，再动笔。`,
      );
    }
    lines.push('');
  }

  lines.push(`**这个文体必须有**：${genre.must.join('；')}。`);
  lines.push(`**这个文体不要**：${genre.avoid.join('；')}。`);
  lines.push('');

  // 结构比句子更靠前：先定下来这一段放什么，再管句子怎么写。
  if (genre.skeleton && genre.skeleton.length) {
    lines.push('**按这个顺序写**（先说结构，再说句子）：');
    for (const step of genre.skeleton) lines.push(`- ${step}`);
    lines.push('');
  }

  // 「别这么写」只说了一半。给一组同义的对照，模型才知道往哪个方向改。
  if (genre.examples && genre.examples.length) {
    lines.push('**对照着看**（换汤不换药是最常见的敷衍，改的是句子，不是词）：');
    for (const ex of genre.examples.slice(0, 2)) {
      lines.push(`- 模板腔：${ex.bad}`);
      lines.push(`  正常中文：${ex.good}`);
      lines.push(`  差别在：${ex.why}`);
    }
    lines.push('');
  }

  const top = result.findings.slice(0, 6);
  if (top.length) {
    lines.push('**优先处理这几处**：');
    for (const f of top) {
      const sample = f.samples[0];
      const where = sample && sample.line > 0 ? `（首见第 ${sample.line} 行）` : '';
      lines.push(`- ${f.label}${where} → ${f.fix}`);
    }
    lines.push('');
  }

  const s = result.stats || {};
  const rhythmIds = new Set(result.findings.filter((f) => f.mode === 'rhythm').map((f) => f.id));
  const actions = [];

  // 碎片化的动作和「拆长句」方向相反，必须排在前面说清楚，否则模型会照着
  // 直觉继续往短里改——那正是要治的病。
  if (rhythmIds.has('rhythm-fragmented') || rhythmIds.has('rhythm-too-short')) {
    actions.push(
      '**注意方向：这段是被切碎了，不是太长。** 把语义相连的短句用逗号合起来，只在意思真正结束的地方落句号。不要再拆句。',
    );
  }
  if (rhythmIds.has('rhythm-consecutive-short')) actions.push('打散连续成串的短句，保留一两处短句当重音，其余合并成完整句子');
  if (rhythmIds.has('rhythm-one-sentence-paragraph')) actions.push('合并一句一段的排版，一段容纳两到六句');
  if (rhythmIds.has('rhythm-subject-repeat')) actions.push('删掉重复的主语，让后面的句子接着上一句的语势走');
  if (rhythmIds.has('rhythm-uniform-long')) actions.push('让句长有明显起伏，长句后面接短句');

  if (typeof s.sentenceCv === 'number' && s.sentenceCv < 0.4 && !rhythmIds.has('rhythm-uniform-long')) {
    actions.push('让句子长短有明显起伏，避免通篇一个节奏');
  }
  if (typeof s.paragraphCv === 'number' && s.paragraphs >= 3 && s.paragraphCv < 0.32) actions.push('让段落长短错开，不要每段一样长');
  if (typeof s.anchorsPer1000 === 'number' && s.anchorsPer1000 < 3) actions.push('补入数字、时间、地点、当事人原话等具体锚点；补不出就删掉对应的空话');
  if (typeof s.avgSentenceLength === 'number' && s.avgSentenceLength > 55) {
    actions.push('平均句长偏长：检查是不是定语堆叠，把定语改成谓语——而不是把句子切成短句');
  }
  if (typeof s.dePer1000 === 'number' && s.dePer1000 > 55) actions.push('删掉多余的「的」');

  if (actions.length) {
    lines.push('**结构性动作**：');
    for (const a of actions) lines.push(`- ${a}`);
    lines.push('');
  }

  lines.push('**硬约束**：');
  lines.push('- 不得新增原文没有的事实、数字、人名或结论。缺信息就留空，不要编。');
  lines.push('- 不得使用：「不是……而是……」「不仅……更是……」「正是……才……」，以及「值得注意的是」「综上所述」「让我们一起」这类套话。');
  lines.push('- 不得在结尾升华或写总结段。');
  lines.push('- 不得为了去味而堆口语词。目标是普通人在说事，不是模仿网红。');
  lines.push('- **不得把长句一律拆成短句。** 中文的流水句——逗号串起一串小句、最后才落句号——是正常写法。只有定语堆叠的欧化长句才需要拆。全篇短句是另一种机器腔。');
  lines.push('');
  lines.push('**输出**：直接给出改写后的正文，不要附解释、不要对比表、不要再说「以下是改写」。');

  const body = lines.join('\n');
  return {
    body,
    headline: `${genre.label} / ${strength.label}，目标 ${Math.max(0, result.score - 35)} 分以下`,
  };
}

export { METRIC_REFERENCE, metricReference };
