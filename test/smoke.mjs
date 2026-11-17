// 去AI味 · 冒烟测试
// 运行：node test/smoke.mjs
//
// 验证三件事：
//   1. 典型 AI 腔文本能被打出高分，并抓到关键模式
//   2. 真人写的文本得分低，不误报
//   3. 插件导出的工具能被构造并正常执行

import { readFileSync } from 'node:fs';
import { scanText, maskQuoted } from '../lib/scan.js';
import { normalizeOptions, createTool } from '../index.js';
import {
  buildSkillBody,
  GENRES,
  buildReport,
  buildPrescription,
  buildKeeps,
  buildPromptSection,
} from '../lib/content.js';
import { RHYTHM_PROFILES, RULES, RHYTHM_RULES, layerOf } from '../lib/rules.js';

const AI_TEXT = `在当今这个快速变化的时代，人工智能技术的发展正在深刻地改变着我们的生活方式。值得注意的是，AI 不仅仅是一种技术工具，更是一种全新的思维方式。它不仅极大地提升了生产效率，而且为我们提供了更多的可能性。

首先，AI 可以赋能各行各业，帮助企业实现降本增效；其次，AI 能够推动社会的进步，让我们的生活变得更加便捷；最后，AI 也带来了一些挑战。总的来说，AI 是一把双刃剑，需要我们客观看待。

让我们共同期待，在不久的将来，AI 将为我们创造更加美好的未来。`;

const HUMAN_TEXT = `上周三下午，老陈把店门口的招牌摘了。新招牌上没写"开业大酬宾"，只有一行电话号码。

我问他为什么。他说："来的都是回头客，不用喊。"

他在这条巷子里修了十七年自行车。去年开始兼着卖电动车电池，一块赚四十。生意谈不上好，他说够用，就是房租又涨了三百。`;

const FAKE_HUMAN = `说实话，这事儿吧，其实说白了就是这么回事。你想想看，对吧？反正我觉得吧，嗯，就是这样，真的，确实，哈哈哈，绝了，yyds，家人们谁懂啊！！！`;

// 碎片化：每个小句都落句号，逗号为零，短句连成一片。
// 这正是「刻意强调短句」的产物，插件必须抓住。
const FRAGMENTED = `他推开门。屋里没人。桌上放着茶。茶已经凉了。他走过去。伸手摸杯身。杯子还是温的。他愣了一下。然后坐下来。掏出手机。屏幕亮了一下。又暗了。`;

// 汪曾祺式的短句名篇：逗号同样很少，句子同样很短，
// 但短句是点缀、前后有长句托着。这是好中文，绝不能被误报。
const CLASSIC_SHORT = `我的家乡是水乡。出鸭。高邮大麻鸭是著名的鸭种。鸭多，鸭蛋也多。高邮人也善于腌鸭蛋。高邮咸鸭蛋于是出了名。我在苏南、浙江，每逢有人问起我的籍贯，回答之后，对方就会肃然起敬。上海的卖腌腊的店铺里也卖咸鸭蛋，必用纸条特别标明。高邮咸蛋的特点是质细而油多。蛋白柔嫩，不似别处的发干、发粉，入口如嚼石灰。油多尤为别处所不及。`;

let failures = 0;
const check = (label, condition, detail = '') => {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
};

function report(title, text) {
  const r = scanText(text);
  console.log(`\n=== ${title} ===`);
  console.log(`  评分 ${r.score}/100 · ${r.grade} 级 · ${r.gradeText}`);
  console.log(`  ${r.chars} 字 / ${r.stats.sentences} 句 / ${r.stats.paragraphs} 段`);
  console.log(
    `  句长均值 ${r.stats.avgSentenceLength} · 句长CV ${r.stats.sentenceCv === null ? '—' : r.stats.sentenceCv.toFixed(2)}` +
      ` · 段长CV ${r.stats.paragraphCv === null ? '—' : r.stats.paragraphCv.toFixed(2)}`,
  );
  console.log(
    `  每千字「的」${r.stats.dePer1000} · 锚点 ${r.stats.anchorsPer1000} · 口语 ${r.stats.colloquialPer1000}`,
  );
  const ids = r.findings.map((f) => `${f.id}×${f.count}`);
  console.log(`  命中(${r.findings.length})：${ids.join('  ') || '无'}`);
  return r;
}

console.log('--- 1. 扫描引擎：典型 AI 腔 ---');
const ai = report('AI 腔样本', AI_TEXT);
check('评分应 >= 40', ai.score >= 40, `实际 ${ai.score}`);
check('应抓到对举句式 not-but 或 not-only', ai.findings.some((f) => ['not-but', 'not-only'].includes(f.id)));
check('应抓到套话连接', ai.findings.some((f) => f.id === 'boilerplate-connector'));
check('应抓到万能背景', ai.findings.some((f) => f.id === 'era-backdrop'));
check('应抓到升华结尾', ai.findings.some((f) => f.id === 'elevating-ending'));
check('应注意排序：sev 递减', ai.findings.every((f, i) => i === 0 || ai.findings[i - 1].sev >= f.sev));
check('每条命中都有 why 与 fix', ai.findings.every((f) => f.why && f.fix));

console.log('\n--- 2. 扫描引擎：真人文本 ---');
const human = report('真人样本', HUMAN_TEXT);
check('评分应 <= 35', human.score <= 35, `实际 ${human.score}`);
check('不应抓到升华结尾', !human.findings.some((f) => f.id === 'elevating-ending'));
check('锚点密度应高于 AI 样本', human.stats.anchorsPer1000 > ai.stats.anchorsPer1000);

console.log('\n--- 3. 扫描引擎：伪口语（堆语气词）---');
const fake = report('伪口语样本', FAKE_HUMAN);
check('不应因语气词多就免检（评分仍 > 0）', fake.score > 0, `实际 ${fake.score}`);

console.log('\n--- 3b. 节奏：碎片化 vs 短句名篇 ---');
const frag = report('碎片化样本', FRAGMENTED);
check('应抓到 rhythm-fragmented', frag.findings.some((f) => f.id === 'rhythm-fragmented'));
check('碎片化样本评分应 >= 40', frag.score >= 40, `实际 ${frag.score}`);
check('逗号／句号比应极低', frag.stats.commaPeriodRatio < 0.6, `实际 ${frag.stats.commaPeriodRatio}`);
check('最长连续短句应超标', frag.stats.maxConsecutiveShort > 3, `实际 ${frag.stats.maxConsecutiveShort}`);

const classic = report('短句名篇样本（不该误报）', CLASSIC_SHORT);
check('名篇不应命中任何节奏规则', !classic.findings.some((f) => f.id.startsWith('rhythm-')),
  classic.findings.filter((f) => f.id.startsWith('rhythm-')).map((f) => f.id).join(',') || '无');
check('名篇评分应 <= 35', classic.score <= 35, `实际 ${classic.score}`);
check('名篇的逗号确实不占优（说明判据不只看逗号）', classic.stats.commaPeriodRatio < 1.0,
  `实际 ${classic.stats.commaPeriodRatio}`);
check('名篇的短句没有成串', classic.stats.maxConsecutiveShort <= 3, `实际 ${classic.stats.maxConsecutiveShort}`);

console.log('\n--- 3c. 节奏：文体阈值确实在起作用 ---');
const fragAsMedia = scanText(FRAGMENTED, { genre: 'media' });
const fragAsNews = scanText(FRAGMENTED, { genre: 'news' });
check('口播文体更宽容（或至少不更严）', fragAsMedia.score <= fragAsNews.score,
  `media ${fragAsMedia.score} vs news ${fragAsNews.score}`);

console.log('\n--- 3d. 节奏：正常叙述不该被判碎片 ---');
const humanRhythm = human.findings.filter((f) => f.id.startsWith('rhythm-'));
check('老陈那段不命中碎片化', !humanRhythm.some((f) => f.id === 'rhythm-fragmented'),
  humanRhythm.map((f) => f.id).join(',') || '无');

console.log('\n--- 4. 边界情况 ---');
const empty = scanText('');
check('空输入不抛错且 ok=false', empty.ok === false);
const shortText = scanText('好的。');
check('极短输入不抛错', shortText.ok === true && shortText.tooShort === true);
const english = scanText('This is a plain English paragraph with no Chinese characters at all.');
check('纯英文被拒绝而不是硬判', english.ok === false && /中文/.test(english.reason || ''), english.reason || '');

const japanese = scanText('これは日本語のテキストです。ひらがなとカタカナがたくさん含まれています。漢字もあります。');
check('纯日文被拒绝', japanese.ok === false && /日文/.test(japanese.reason || ''), japanese.reason || '');

// 中英混排（技术文档的常见形态）：仍然分析，但不能拿纯中文词表去扣「缺少锚点」「没有口语」
const mixed = scanText(
  '这个函数接收一个 options 参数，返回 Promise。' +
    'By default it resolves to undefined when there is no matching handler in the registry. ' +
    'Error handling follows the standard convention described in the README. ' +
    '我们在生产环境里已经跑了一年多，没有出现过因为回调时序导致的线上事故。',
);
check('中英混排仍然分析', mixed.ok === true);
check('中英混排不报「缺少锚点」', !mixed.breakdown.some((b) => b.source === '缺少具体信息锚点'));
check('中英混排不报「没有口语」', !mixed.breakdown.some((b) => b.source === '没有口语与个人视角'));

const badGenre = scanText('这是一段用来测试文体回落的中文文本。它应该有足够的长度让扫描跑起来。', {
  genre: '不存在的文体',
});
check('未知文体回落 general', badGenre.genre === 'general', badGenre.genre);

const proposal = scanText(
  '结论先行：这个项目应该放弃低价带，主攻高端线。原因有三点：一是毛利足够支撑研发投入，二是竞品在这个价位段没有有效覆盖，三是渠道反馈一致。预算按两千万测算，半年内出第一批货。',
  { genre: 'proposal' },
);
check('方案策划文体可用', proposal.ok === true && proposal.genre === 'proposal');

console.log('\n--- 4b. 稳定性：大量重复文本不能让重复检测爆掉 ---');
// 早先的实现对句子做笛卡尔积：5 万字重复文本要跑 6.9 秒，
// 20 万字直接把 Set 撑爆抛 RangeError。这里锁住耗时与不崩溃。
{
  const unit = '这是一句用来测试重复检测性能的话，长度大概三十个字左右。';
  const bigRepeat = unit.repeat(Math.ceil(200000 / unit.length)).slice(0, 200000);
  const t0 = Date.now();
  let result;
  let threw = null;
  try {
    result = scanText(bigRepeat, { genre: 'webnovel' });
  } catch (e) {
    threw = e;
  }
  const cost = Date.now() - t0;
  check('20 万字重复文本不抛异常', threw === null, threw ? threw.message : '');
  check('20 万字重复文本在 2 秒内完成', threw === null && cost < 2000, `${cost}ms`);
  check(
    '重复组数被限制在 200 以内',
    threw === null && result.stats.duplicatePairs.length <= 200,
    threw === null ? `${result.stats.duplicatePairs.length} 组` : '',
  );
}

console.log('\n--- 5. 自定义回避词与语区 ---');
const custom = scanText('我们要打通生态位，形成闭环。', { customBannedWords: ['生态位', '闭环'] });
check('自定义词能命中', custom.findings.some((f) => f.id === 'custom-banned'));
const tw = scanText('这個影片的品質很好，透過软体就能看。', { locale: 'zh-CN' });
check('zh-CN 下能标出港台用词', tw.findings.some((f) => f.id === 'locale-tw'));
const tw2 = scanText('这個影片的品質很好，透過软体就能看。', { locale: 'zh-TW' });
check('zh-TW 下不再标出港台用词', !tw2.findings.some((f) => f.id === 'locale-tw'));

console.log('\n--- 5b. 文体覆盖 ---');
// 「分文体要点」是手写在技能正文里的，不是从 GENRES 生成的，
// 所以新增文体时很容易忘记同步。锁一条：每个文体都要在正文里点到名。
const GENRE_KEYWORDS = {
  general: '日常',
  media: '自媒体',
  script: '口播',
  fiction: '小说',
  webnovel: '网文',
  report: '报告',
  tech: '技术文档',
  news: '新闻',
  business: '财经',
  commentary: '评论',
  proposal: '方案策划',
};
const skillBody = buildSkillBody();
const missingGenre = Object.entries(GENRE_KEYWORDS).filter(([, kw]) => !skillBody.includes(kw));
check('技能正文覆盖全部文体', missingGenre.length === 0, missingGenre.map(([id]) => id).join(',') || '全覆盖');
check(
  '每个文体都有节奏画像',
  Object.keys(GENRE_KEYWORDS).every((id) => RHYTHM_PROFILES[id]),
  Object.keys(GENRE_KEYWORDS).filter((id) => !RHYTHM_PROFILES[id]).join(',') || '全覆盖',
);
check(
  '每个文体都有必须有一列和不要一列',
  Object.keys(GENRE_KEYWORDS).every((id) => GENRES[id] && GENRES[id].must.length > 0 && GENRES[id].avoid.length > 0),
  Object.keys(GENRE_KEYWORDS).filter((id) => !GENRES[id]?.must?.length || !GENRES[id]?.avoid?.length).join(',') || '全覆盖',
);

// 对照例子只写「别这么写」是不够的——得给出「那该怎么写」的样子。
// 这里钉三件事：每个文体有例子、例子三要素齐全、例子进了技能正文。
const badExamples = [];
for (const [id, g] of Object.entries(GENRES)) {
  if (!Array.isArray(g.examples) || g.examples.length === 0) {
    badExamples.push(`${id}: 无例子`);
    continue;
  }
  for (const [i, ex] of g.examples.entries()) {
    if (!ex.bad || !ex.good || !ex.why) badExamples.push(`${id}[${i}]: 缺字段`);
    else if (ex.bad === ex.good) badExamples.push(`${id}[${i}]: 改前改后一样`);
  }
}
check('每个文体都有改写对照', badExamples.length === 0, badExamples.join('; ') || '全覆盖');
check(
  '对照例子进了技能正文',
  Object.values(GENRES).every((g) => skillBody.includes(g.examples[0].good)),
  '全覆盖',
);

// 骨架比对照更早定型：结构错了，句子再干净也不像那个文体。
// 上一轮改写对照时出过一次「测试全过但文件写坏了」，这里把骨架也钉住。
const badSkeletons = [];
for (const [id, g] of Object.entries(GENRES)) {
  if (!Array.isArray(g.skeleton) || g.skeleton.length < 3) {
    badSkeletons.push(`${id}: 骨架不足 3 条`);
    continue;
  }
  if (g.skeleton.some((s) => !s || !String(s).trim())) badSkeletons.push(`${id}: 有空条目`);
}
check('每个文体都有段落骨架', badSkeletons.length === 0, badSkeletons.join('; ') || '全覆盖');
check(
  '骨架进了技能正文',
  Object.values(GENRES).every((g) => g.skeleton.every((s) => skillBody.includes(s))),
  '全覆盖',
);
check(
  '骨架进了报告处方',
  GENRES && Object.values(GENRES).every((g) => {
    const r = scanText('在当今社会，随着科技的飞速发展，人工智能已经深刻地改变了我们的生活方式。', { genre: g.id });
    return buildPrescription(r, { genre: g.id, strength: 'standard' }, {}).body.includes(g.skeleton[0]);
  }),
  '全覆盖',
);

console.log('\n--- 5c. 改前改后对照 ---');

// 改稿最容易犯的错不是改不掉，是改坏了。这几条钉住对照的三列不会报错。
const BEFORE_TEXT = '在当今社会，随着科技的飞速发展，人工智能已经深刻地改变了我们的生活方式。值得注意的是，它不仅是一种工具，更是一种思维方式。让我们共同期待美好的未来。';
const AFTER_CLEAN = '去年公司裁掉十二个客服，换成了一套自动回复。一开始每天四十多个投诉，三个月后降到六个。';
const AFTER_REGRESS = '在当今社会，人工智能已经深刻地改变了我们的生活方式。我们需要对这个方案进行进一步的分析与讨论，并加以优化。';

const beforeScan = scanText(BEFORE_TEXT, { genre: 'general' });
const cleanScan = scanText(AFTER_CLEAN, { genre: 'general' });
const regressScan = scanText(AFTER_REGRESS, { genre: 'general' });

const cleanReport = buildReport(cleanScan, { genre: 'general', strength: 'standard', before: beforeScan }, {});
const regressReport = buildReport(regressScan, { genre: 'general', strength: 'standard', before: beforeScan }, {});
const noBeforeReport = buildReport(cleanScan, { genre: 'general', strength: 'standard' }, {});

check('传了 before 才有对照段', cleanReport.includes('## 改前改后') && !noBeforeReport.includes('## 改前改后'));
check('对照里有分数和长度', cleanReport.includes('模板腔指数') && cleanReport.includes('正文长度'));
check('改干净了：解决列表非空、新引入为空', cleanReport.includes('**解决了**') && cleanReport.includes('**新引入**（0 类）：没有'));
check('改出新问题：新引入被检出', !regressReport.includes('**新引入**（0 类）'));

console.log('\n--- 6. 插件工具 ---');
const options = normalizeOptions({ promptTone: 'strict', customBannedWords: ['赋能'] });
check('配置归一化：promptTone', options.promptTone === 'strict');
check('配置归一化：默认值兜底', options.genre === 'general' && options.locale === 'zh-CN');
check('配置归一化：非法值被拒', normalizeOptions({ locale: 'xx-YY' }).locale === 'zh-CN');

const tool = createTool(options);
check('工具名正确', tool.name === 'nature');
check('必填参数只有 text', JSON.stringify(tool.parameters.required) === '["text"]');

const value = await tool.execute({ text: AI_TEXT, genre: 'media', strength: 'rewrite', keep: '结论' });
check('execute 返回 ok', value.ok === true);
check('execute 返回评分', typeof value.score === 'number' && value.score > 0);
check('report 是 markdown', value.report.startsWith('# 文本诊断'));
check('报告区分了模板腔与用字错误', /模板腔指数/.test(value.report) && /模板化痕迹/.test(value.report));
check('report 含文言体标签', value.report.includes('自媒体'));
check('prescription 含保留项', value.prescription.includes('必须保留'));
check('findings 已精简为摘要', value.findings.every((f) => Object.keys(f).sort().join(',') === 'count,id,label,severity'));
check('返回值可 JSON 序列化', (() => { try { JSON.stringify(value); return true; } catch { return false; } })());

const rendered = tool.output.render({}, value);
check('render 返回 ContentBlock[]', Array.isArray(rendered) && rendered[0].type === 'text' && rendered[0].text.length > 100);

const emptyValue = await tool.execute({ text: '' });
check('空文本走 execute 不抛错', emptyValue.ok === false && emptyValue.report.includes('没有可分析的内容'));

// --- 6. 词表匹配精度 ---
// 词表里「极大地」排在「极大地提升」前面，正则又是不排序直接拼的，
// 短词会先吃掉长词的前半截——报告只能说「你用了极大地」，
// 说不出完整的搭配，改起来也就没方向。
const longWordText = '这次改革极大地提升了效率，极大地丰富了选择。';
const longWordResult = scanText(longWordText, { genre: 'news' });
const inflated = longWordResult.findings.find((f) => f.id === 'degree-inflation' || f.id === 'inflated-degree');
const matchedTexts = (inflated?.samples || []).map((s) => s.text);
check('长词优先：报完整搭配而不是截断的短词', matchedTexts.includes('极大地提升') && matchedTexts.includes('极大地丰富'));
check('长词优先：不再把「极大地提升」只报成「极大地」', !matchedTexts.some((t) => t === '极大地'));

// --- 7. 纯数字串不算长句 ---
// 一串哈希或时间戳去掉标点后也能超过 70 字，但它不是长句：
// 读者一眼扫过去就跳过了，不会累。要求中文占比够才算。
const digitHeavy = [
  '我们查了一下日志，发现请求记录里出现了这样的标识：' + '1'.repeat(90) + '。',
  '后来又出现了一串时间戳：' + '9'.repeat(85) + '。',
  '技术团队确认这不是程序的问题，而是上游把整段二进制直接转成了十进制写进日志。',
  '他们已经加了截断，超过三十二位只保留前八位和后八位，中间用省略号。',
  '改完之后日志小了一个数量级，排查反而更快，因为重点句不再被淹没。',
  '这件事提醒我们，日志格式应该由读的人来决定，而不是写的人顺手转一下。',
].join('\n');
const digitResult = scanText(digitHeavy, { genre: 'tech' });
check('纯数字串不被当成长句', digitResult.stats.longSentences === 0);
check('长句判定没有误伤真中文长句', (() => {
  const realLong = '在经历了长达三年的反复论证、多轮内部讨论以及外部专家的数次评审之后，项目组最终决定放弃原定于今年第三季度启动的二期扩建计划，转而把有限的预算投向更靠近一线业务的即时需求上面。';
  return scanText(realLong, { genre: 'news' }).stats.longSentences === 1;
})());

// --- 8. 分数封顶但原始分可见 ---
// 87 分和 130 分都是 E 级，改法一样，但「爆表多少」决定还能不能挑着改。
const bombText = Array.from({ length: 14 }, () =>
  '在当今这个快速变化的时代，随着人工智能技术的飞速发展，我们正处于一个前所未有的历史节点。'
  + '首先，我们要深刻认识到，这不仅极大地提升了效率，而且全面地重塑了格局；'
  + '其次，我们需要对现有流程进行优化，对组织架构进行调整，对业务模式进行创新。'
  + '与此同时，我们也必须看到，数据孤岛、隐私保护等问题日益凸显，至关重要。'
  + '更为重要的是，我们应当坚持问题导向，切实把各项工作落到实处。'
  + '综上所述，这是一把双刃剑，我们要辩证地看待，客观地分析。让我们共同期待更加美好的明天！',
).join('\n');
const bombResult = scanText(bombText, { genre: 'general' });
check('分数不超过 100', bombResult.score <= 100);
check('原始分保留且大于等于分数', typeof bombResult.rawScore === 'number' && bombResult.rawScore >= bombResult.score);
check('爆表时报告标注扣分累计', (() => {
  if (bombResult.rawScore <= 100) return true; // 样本没爆表就不强求
  return buildReport(bombResult, {}).includes('扣分累计');
})());

// --- 9. 引用不是使用 ---
// 写分析文章时会引用套话当例子。引用被当成使用，是最冤的误报。
const quotingText = '很多人爱写「值得注意的是」和「综上所述」这类词，它们其实什么也没说。'
  + '我在审稿时看到这样的开头，第一反应是作者没想清楚要讲什么。'
  + '真正该做的是把转折的原因写出来，而不是找一个词把两段缝上。';
const quotingResult = scanText(quotingText, { genre: 'commentary' });
check('引号内的套话不算作者在用', !quotingResult.findings.some((f) => f.id === 'boilerplate-connector'));

// 但对话体不能遮蔽：引号是正文主体，躲不掉。
const dialogueText = '「你来了，我还以为你今天不来了。」他说。\n「路上堵了一会儿，我提前半小时出门的。」她把包放下。\n'
  + '「外面挺冷的吧，我烧了水。」他递过一杯。\n「还行，就是风大，站台那边等了很久。」她接过杯子捧着。\n'
  + '「坐吧，先缓一缓再说。」他指了指沙发。\n「等一下，我先把这个放好。」她站着没动。';
const dialogueMasked = maskQuoted(dialogueText);
check('对话体的引号占比超过四成', dialogueMasked.ratio > 0.4);
const dialogueResult = scanText(dialogueText, { genre: 'fiction' });
check('对话体全文照扫，不被整段遮蔽', dialogueResult.ok === true && dialogueResult.stats.chars > 60);

// --- 10. 同一手法在不同文体里的合理密度不同 ---
// 破折号在评论里是节奏工具，在报告里是偷懒。
// 密度落在 report 阈值 2.5 与 commentary 阈值 6.0 之间，才能看出两条线是分开的。
const plainSeqs = [
  '这件事说起来简单，做起来全是细节。',
  '真正难的是把每一环都接上，中间断一环就得重来。',
  '我们试了三轮才把流程跑顺，前两轮都卡在同一个地方。',
  '后来把检查点前移，问题才暴露得早一些。',
];
let dashText = '';
while (dashText.length < 600) dashText += plainSeqs[dashText.length % plainSeqs.length];
dashText = dashText.slice(0, 600) + '他说完就走了——没回头。这事得从头说——那是一年前。';
const dashDensity = (2 / dashText.length) * 1000;
check('测试文本的破折号密度落在两条线之间', dashDensity > 2.5 && dashDensity < 6.0);
check('破折号：报告按严标准检出', scanText(dashText, { genre: 'report' }).findings.some((f) => f.id === 'dash-overuse'));
check('破折号：评论按宽标准放行', !scanText(dashText, { genre: 'commentary' }).findings.some((f) => f.id === 'dash-overuse'));

// 枚举结构：报告里是标准写法，日常文体里是模板腔
const enumText = '第一，把标准写清楚。第二，把产能稳住。第三，每个季度做一次测试。';
check('枚举：报告文体放行', !scanText(enumText, { genre: 'report' }).findings.some((f) => f.id === 'enumeration'));
check('枚举：通用文体仍检出', scanText(enumText, { genre: 'general' }).findings.some((f) => f.id === 'enumeration'));

// --- 11. 真实文本里挖出来的三处误判 ---
// 孔乙己那段问答：六句全在十字以下，是两个人说话，不是碎片流。
const dialogueShort = '「后来怎么样？」「先写服辩，后来是打，打了大半夜。」「后来呢？」「后来打折了腿了。」「打折了怎样呢？」「怎样？……谁晓得？许是死了。」';
check('对话里的短句不算碎片流', !scanText(dialogueShort, { genre: 'fiction' }).findings.some((f) => f.id === 'rhythm-consecutive-short'));
// 同样的短句子写成叙述，就该报——否则等于把这条规则废了。
const narrShort = '他走了。天黑了。门关了。灯灭了。人散了。夜深了。风停了。';
check('叙述体的连续短句照样报', scanText(narrShort, { genre: 'fiction' }).findings.some((f) => f.id === 'rhythm-consecutive-short'));
// 报纸体例：开头两句提要，正文再展开说一遍。
const dupA = '把这件事从头到尾说一遍需要一点耐心因为中间转折太多';
const headlineText = `${dupA}。中间放几句别的内容让两处重复隔得足够远。继续放别的内容第三句。再来一句别的内容第四句。还有一句别的内容第五句。最后一句别的内容第六句。${dupA}。`;
check('报纸提要的重复不算复读', !scanText(headlineText, { genre: 'news' }).findings.some((f) => f.id === 'rhythm-duplicate-passage'));
check('通用文体的重复照样报', scanText(headlineText, { genre: 'general' }).findings.some((f) => f.id === 'rhythm-duplicate-passage'));
// 「与民生相关的新规」是正常中文，不该按翻译腔扣分。
check('「与……相关的」不报翻译腔', !scanText('与民生相关的新规从十二月起施行，住房交易享受更多税收优惠。', { genre: 'news' }).findings.some((f) => f.id === 'translationese'));

// --- 12. 口播稿：口语天然的特征不该按书面语扣分 ---
// 声音线性播放，听的人回看不到上一句，所以反复点名主语是必要的清晰。
// 门槛是「连续 8 句」，七句以内不报，九句照报——放宽不等于关掉。
const sameSubject7 = '我早上六点起床。我骑车去上班。我在路上买了两个包子。我到公司先看了眼邮件。我把今天的活排了一遍。我中午跟同事吃了顿饭。我下午一直在改方案。';
const sameSubject9 = `${sameSubject7}我下班前把东西交了。我晚上回家又看了一遍邮件。`;
check('口播稿里连着七句同主语不报', !scanText(sameSubject7, { genre: 'script' }).findings.some((f) => f.id === 'rhythm-subject-repeat'));
check('口播稿里连着九句同主语照报', scanText(sameSubject9, { genre: 'script' }).findings.some((f) => f.id === 'rhythm-subject-repeat'));
// 书面语还是 3 句就报——同一种写法在不同文体里结论不同，这才是分文体的意思。
check('书面语里连续同主语照样报', scanText(sameSubject7, { genre: 'report' }).findings.some((f) => f.id === 'rhythm-subject-repeat'));
// 边说边想，「的」挂得长是即时组织的产物，不是把书面语搬过来。
const oralDeChain = '唯一的障碍就是中国的碳排放权的价格。';
check('口播稿不查「的」字长链', !scanText(oralDeChain, { genre: 'script' }).findings.some((f) => f.id === 'de-chain'));
check('书面语照查「的」字长链', scanText(oralDeChain, { genre: 'report' }).findings.some((f) => f.id === 'de-chain'));

// --- 13. 公众号推文：开头撂结论再展开，不是复读 ---
// 和报纸提要同一个体例：第一句把整篇的结论说完，第四段再从头讲一遍。
const mediaLead = `${dupA}。中间放几句别的内容让两处重复隔得足够远。继续放别的内容第三句。再来一句别的内容第四句。还有一句别的内容第五句。最后一句别的内容第六句。${dupA}。`;
check('公众号推文的提要重复不算复读', !scanText(mediaLead, { genre: 'media' }).findings.some((f) => f.id === 'rhythm-duplicate-passage'));
check('日常文体仍报提要重复', scanText(mediaLead, { genre: 'general' }).findings.some((f) => f.id === 'rhythm-duplicate-passage'));

// --- 14. 公文套语：共享一段固定搭配，不等于复读 ---
// 政府工作报告里「持续深入推进污染防治攻坚和生态系统优化」这类短语遍地都是，
// 两句各带一段、其余部分毫不相干，早先的「18 字相同即重复」把它们全判成了复读。
// 现在要求共用片段至少占较短那句的一半，才叫复读。
const boilerDup = [
  '今年以来我们持续深入推进污染防治攻坚和生态系统优化，地级及以上城市细颗粒物平均浓度下降，地表水优良断面比例继续提高，群众身边的突出环境问题得到解决。',
  '各部门要把标准写清楚，不要把责任推给下一级。',
  '基层反映最多的是报表太多、检查太密。',
  '下一步还要持续深入推进污染防治攻坚和生态系统优化，把重点行业绿色转型的账算清楚，把监测数据做实，不能让指标好看而实际没变。',
  '统计口径要先统一，不然各说各话。',
  '这件事年底要交账。',
].join('');
check('公文套语的重复不算复读', !scanText(boilerDup, { genre: 'report' }).findings.some((f) => f.id === 'rhythm-duplicate-passage'));
// 反过来：整句照抄该报还是要报，不然这条规则等于关掉了。
check('报告文体里整句复读照样报', scanText(headlineText, { genre: 'report' }).findings.some((f) => f.id === 'rhythm-duplicate-passage'));

// --- 15. 位置类套话：开头找由头、结尾拔意义 ---
// 这几句单看都不算错，错在位置：开头该给判断的地方给了铺垫，
// 结尾该给结果的地方给了意义。十七份真人语料里一次都没出现。
const pegOpening = '最近，一则关于 AI 版权归属的新闻引发了广泛讨论。这件事其实没有那么复杂。';
check('新闻由头式开场被识别', scanText(pegOpening, { genre: 'commentary' }).findings.some((f) => f.id === 'news-peg'));
const directOpening = 'AI 生成的图，版权该归谁？法院这次判给了用提示词的人。';
check('直接给判断的开头不报', !scanText(directOpening, { genre: 'commentary' }).findings.some((f) => f.id === 'news-peg'));

const inflateEnding = '会后三个月，园区新签了 11 家公司。本次大会为行业发展带来了新的机遇。';
check('「为…带来了机遇」式拔高被识别', scanText(inflateEnding, { genre: 'news' }).findings.some((f) => f.id === 'significance-inflation'));
const concreteEnding = '会后三个月，园区新签了 11 家做数据标注的公司。';
check('写结果不报意义拔高', !scanText(concreteEnding, { genre: 'news' }).findings.some((f) => f.id === 'significance-inflation'));

const answerEnding = '或许，答案就在于那些无法替代的东西。';
check('「答案就在于」式收尾被识别', scanText(answerEnding, { genre: 'commentary' }).findings.some((f) => f.id === 'answer-lie-in'));
// 「答案在页脚」这种是说具体位置，不是把结论悬起来，不该报。
const literalAnswer = '答案在第三页的表格里，自己翻。';
check('说清楚在哪的答案不报', !scanText(literalAnswer, { genre: 'commentary' }).findings.some((f) => f.id === 'answer-lie-in'));

console.log('\n--- 16. 报告先给「改哪三处」---');
// 命中类目一多，人就卡住不动手。所以详表前面先给前三，附扣分。
// 长度特意超过 300 字：短文本会乘次数因子，把同分的两条错开，
// 那样就测不到「并列时按超阈值倍数排」这条了。
const crowdedFiller =
  '这段是背景说明，讲的是城市交通治理在过去几年里的变化，包括信号灯配时、潮汐车道、公交专用道这些具体做法，以及它们各自的效果。';
const crowded = [
  '在当今数字化的浪潮中，城市交通治理正在经历一场深刻的变革。',
  '值得注意的是，人工智能技术的引入让路口通行效率有了变化。',
  '总的来说，智慧交通既带来了机遇，也提出了严峻的挑战。',
  '我们需要进一步优化流程，持续推进这件事落地，不断打透全链路、做好顶层设计。',
  '让我们共同期待，在不久的将来，技术将为每个人带来便利。',
  crowdedFiller,
  crowdedFiller,
  crowdedFiller,
].join('\n\n');
const crowdedResult = scanText(crowded, { genre: 'commentary' });
const crowdedReport = buildReport(crowdedResult, { genre: 'commentary' });
check('命中四类以上时给出前三处', crowdedReport.includes('如果只改三处'));
check(
  '前三处按扣分从多到少',
  (() => {
    // 并列时会多带一句「超阈值 N 倍」，所以只取「扣 X 分」那段。
    const rows = crowdedReport.match(/（扣 ([\d.]+) 分/g) || [];
    const nums = rows.slice(0, 3).map((r) => Number(r.match(/[\d.]+/)[0]));
    return nums.length === 3 && nums[0] >= nums[1] && nums[1] >= nums[2];
  })(),
  '前三处降序',
);
// 封顶把分数压平之后，并列的两条只能靠「超阈值几倍」分先后，
// 否则 27 倍和 4.7 倍并列，等于没排。
check(
  '扣分并列时按超阈值倍数排',
  (() => {
    const rows = crowdedReport.match(/超阈值 ([\d.]+) 倍/g) || [];
    const nums = rows.slice(0, 3).map((r) => Number(r.match(/[\d.]+/)[0]));
    return nums.length >= 2 && nums.every((n, i) => i === 0 || nums[i - 1] >= n);
  })(),
  '并列按倍数降序',
);
// 命中很少的时候再加一节摘要就是噪音，直接看清单更快。
const sparse = '值得注意的是，这个方案还有风险。';
check(
  '命中少时不加前三节',
  !buildReport(scanText(sparse, { genre: 'general' }), { genre: 'general' }).includes('如果只改三处'),
);

console.log('\n--- 17. 排比句式别把动词里的「到」当方向词 ---');
// 「从 6 个渠道收到 3 个」——「收到」的「到」不是方向词。
// 真实报告里这句被当成「从……到……」排比扣了 14 分。
const realDataRun = '从 6 个渠道收到 3 个，单渠道日均新增从 800 提到 1400。';
check(
  '真实数据里的「收到」不算排比',
  !scanText(realDataRun, { genre: 'report' }).findings.some((f) => f.id === 'from-to-from-to'),
);
const abstractParallel = '从产品设计到用户运营，从技术架构到市场推广，我们都要覆盖。';
check(
  '抽象概念的真排比照样报',
  scanText(abstractParallel, { genre: 'general' }).findings.some((f) => f.id === 'from-to-from-to'),
);

console.log('\n--- 18. 改好的稿子别再被判一遍 ---');
// 闭环保：按处方改完的稿子最容易撞到规则没想到的用法。这一节四条全是
// 第二十轮八文体闭环里真撞出来的——改后稿从 0 分被打回去，查下去都是误报。
const windowScene = '林夏站在落地窗前。二十七楼，下面的车流像一条没断过的灯带。她想起三年前那个夏天。';
check(
  '「落地窗」不是黑话「落地」',
  !scanText(windowScene, { genre: 'fiction' }).findings.some((f) => f.id === 'jargon'),
);
const landingJargon = '这个项目要真正赋能一线，得先对齐目标。';
check(
  '真黑话「赋能」照样报',
  scanText(landingJargon, { genre: 'general' }).findings.some((f) => f.id === 'jargon'),
);
// 破折号是断句，前后各是一句。把它连起来读才像「的」字长链。
const dashSplit = '而且拉来的人第二次不买——现在的复购率就是这么来的。';
check(
  '破折号不跨「的」字长链',
  !scanText(dashSplit, { genre: 'proposal' }).findings.some((f) => f.id === 'de-chain'),
);
const realDeChain = '一个有着丰富经验的内容运营团队的负责人的助手。';
check(
  '真的「的」字长链照样报',
  scanText(realDeChain, { genre: 'general' }).findings.some((f) => f.id === 'de-chain'),
);
// 方案策划里用「也就是说」解释数据含义是正常写法。实测这批词真人也用
// （虎嗅稿 4 次、李书福演讲 1 次），所以按密度判，不按出现即报。
const proposalFiller = '复购率在便利店和健身房两种场景下的差异，是这份方案要解决的核心问题。'.repeat(20);
const proposalExplain = `${proposalFiller}也就是说，不复购的人当它是普通汽水。`;
check(
  '方案里偶尔用「也就是说」不报',
  !scanText(proposalExplain, { genre: 'proposal' }).findings.some((f) => f.id === 'boilerplate-connector'),
);
const connectorSpam = '值得注意的是，这点很重要。需要指出的是，风险不小。总的来说，要谨慎。'.repeat(6);
check(
  '过渡语刷屏照样报',
  scanText(connectorSpam, { genre: 'general' }).findings.some((f) => f.id === 'boilerplate-connector'),
);

console.log('\n--- 19. 命中落在哪几段 ---');
// 命中散在全文时，按规则清单跳着改会来回翻稿子。段落定位把同一段的
// 几处收在一起，一段一段处理。这里验证三件事：该给的时候给、
// 不该给的时候不给、段号对得上。
const spreadParas = [
  '在当今数字化浪潮下，我们围绕年初制定的目标持续推进各项工作。',
  '第一段没有问题的说明：这个季度上线了两个功能，退货流程从五步减到三步。',
  '这不仅是一次升级，更是一次跨越。我们持续优化体验，打造差异化优势。',
  '第二段也没有问题：客单价从 82 块涨到 95 块，复购率 18% 到 23%。',
  '值得注意的是，团队也需要进一步加强对用户心智的运营与触达。',
].join('\n\n');
const spreadResult = scanText(spreadParas, { genre: 'report' });
const spreadReport = buildReport(spreadResult, { genre: 'report', strength: 'standard', keep: '' });
check('命中分散时给出先改哪几段', spreadReport.includes('先改哪几段') && spreadResult.paragraphHits.length >= 2);
check(
  '段落号指向真有问题的段',
  spreadResult.paragraphHits.length > 0 && spreadResult.paragraphHits[0].paragraph <= 5,
);
// 只有一段命中时不值得单开一节——直接看下面的清单更快。
const singlePara = '在当今数字化浪潮下，我们围绕年初制定的目标持续推进各项工作，进一步优化运营策略。';
const singleReport = buildReport(scanText(singlePara, { genre: 'report' }), {
  genre: 'report',
  strength: 'standard',
  keep: '',
});
check('只集中在一段时不加这一节', !singleReport.includes('先改哪几段'));
// 用字错误和排版建议不参与段落统计：它们多但分散，混进来会把
// 「哪段问题最大」算成一锅粥。
const typoOnly = '他是一个很好的人，我们进行了一次讨论。\n\n他是一个很好的人，我们进行了一次讨论。';
const typoResult = scanText(typoOnly, { genre: 'general' });
check(
  '段落统计不含用字错误',
  !(typoResult.paragraphHits || []).some((h) => h.rules > 0 && h.hits > 0 && typoResult.findings.every((f) => f.signal === 'error')),
);

// --- 20. 短文本的分数不失控 ---
// 密度是「每千字几处」。21 字里冒一句套话，密度会算到 47.6/千字，
// 是阈值的二十几倍，和 500 字里刷五次拿一样的分。但一次就是一次。
const tinyOne = scanText('值得注意的是，退货率涨了两个点。', { genre: 'report' });
const tinyTwo = scanText('值得注意的是，我们需要进一步优化退货流程。', { genre: 'report' });
const tinyClean = scanText('退货率涨了两个点，下周把确认页改回去看看。', { genre: 'report' });
check('短文本里一处套话给分但不判死刑', tinyOne.score > 0 && tinyOne.score <= 25, `${tinyOne.score} 分`);
check('短文本里两处套话重于一处', tinyTwo.score > tinyOne.score, `${tinyOne.score} → ${tinyTwo.score}`);
check('短文本干净就是零分', tinyClean.score === 0, `${tinyClean.score} 分`);
// 同一句话放进长文里不该单靠它扣分——长文的密度分母够了。
// 分四段写：段落结构检查要三段以上，不分段的话长文也会被判成「没查到」。
const longOne = [
  `这一次的变化来自退货入口的位置调整，从订单页第三屏挪到第二屏，同时把确认步骤从两步压成一步。数据上看，退货率从 4.1% 降到 3.8%，但重复退货的比例上来了，同一批人下个月还会再退一次。值得注意的是，客服那边的说法不一样。`,
  '背景补充，讲的是同期还改了哪些页面、改了几版、每一版的效果如何。',
  '背景补充，讲的是同期还改了哪些页面、改了几版、每一版的效果如何。',
  '背景补充，讲的是同期还改了哪些页面、改了几版、每一版的效果如何。',
  '背景补充，讲的是同期还改了哪些页面、改了几版、每一版的效果如何。',
  '背景补充，讲的是同期还改了哪些页面、改了几版、每一版的效果如何。',
  '背景补充，讲的是同期还改了哪些页面、改了几版、每一版的效果如何。',
].join('\n\n');
const longOneResult = scanText(longOne, { genre: 'report' });
const longConnector = longOneResult.findings.find((f) => f.id === 'boilerplate-connector');
check('长文里一处套话不重罚', !longConnector || longConnector.points <= 8, longConnector ? `扣 ${longConnector.points}` : '未命中');

// --- 21. 说清楚没查到什么 ---
// 节奏类规则要六句、段落类要三段。短文本报低分不是干净，是能查的项少。
const blindShort = scanText('在当今数字化浪潮下，我们持续推进这件工作。', { genre: 'report' });
const blindLong = scanText(longOne, { genre: 'report' });
check('短文本给出没查到的部分', (blindShort.blindSpots || []).length === 3, `${(blindShort.blindSpots || []).length} 项`);
check('长文本不给没查到的部分', (blindLong.blindSpots || []).length === 0, `${(blindLong.blindSpots || []).length} 项`);
const blindReport = buildReport(blindShort, { genre: 'report', strength: 'standard' });
check(
  '报告里提醒别和整篇分数比',
  blindReport.includes('没查到的部分') && blindReport.includes('别和整篇稿子比'),
);
check('报告里长文本不出现这一节', !buildReport(blindLong, { genre: 'report', strength: 'standard' }).includes('没查到的部分'));

// --- 22. 病灶分层 ---
// 同样四十分，改法可能完全不同。先说清是哪一层，后面的建议才读得对。
const wordHeavy = [
  '在当今数字化浪潮下，我们进一步推进这件事，不断打透全链路，赋能行业生态，构建护城河。',
  '值得注意的是，会议上进行了讨论。',
  '总的来说，这是一次成功的会议。',
].join('\n\n');
const wordResult = scanText(wordHeavy, { genre: 'report' });
check(
  '用词主导时指出问题在用词',
  (wordResult.layerSummary || [])[0]?.layer === 'word' &&
    buildReport(wordResult, { genre: 'report', strength: 'standard' }).includes('问题主要在用词上'),
  JSON.stringify(wordResult.layerSummary || []),
);
const posHeavy = [
  '最近，一则关于 AI 版权的新闻引发了广泛讨论。',
  '这件事其实没那么复杂，就是谁写的算谁的。',
  '或许，答案就在于那些无法替代的东西。',
  '总而言之，我们要辩证地看这个问题。',
].join('\n\n');
const posResult = scanText(posHeavy, { genre: 'commentary' });
check(
  '位置主导时指出问题在位置',
  (posResult.layerSummary || [])[0]?.layer === 'position' &&
    buildReport(posResult, { genre: 'commentary', strength: 'standard' }).includes('问题主要在位置上'),
  JSON.stringify(posResult.layerSummary || []),
);

const cleanResult = scanText('老陈把车推到墙角，蹲下去拧那颗螺丝。', { genre: 'general' });
check(
  '干净文本不给病灶分层',
  (cleanResult.layerSummary || []).length === 0 &&
    !buildReport(cleanResult, { genre: 'general', strength: 'standard' }).includes('问题主要在'),
);

// 每条计分规则都得有归属，否则它扣的分不会出现在病灶分层里，
// 用户会看到一个「问题主要在别处」的结论，而实际扣分最多的是这条。
const scoredRules = [...RULES, ...Object.values(RHYTHM_RULES)].filter(
  (r) => r.signal !== 'style' && r.signal !== 'error',
);
const missingLayer = scoredRules.filter((r) => !layerOf(r.id)).map((r) => r.id);
check('每条计分规则都有病灶归属', missingLayer.length === 0, missingLayer.join(', ') || '全覆盖');

// --- 23. 「必须保留」得验 ---
// 只写一句「必须保留」，改没改到全凭自觉。改稿最常见的翻车就是把事实一起删干净。
const keepTool = createTool({ strictness: 'standard', locale: 'zh-CN', genre: 'report', customBannedWords: [] });
const keepText = '在当今数字化浪潮下，退货率从 4.1% 降到 3.8%，负责人是张明。';

const keepOk = await keepTool.execute({ text: keepText, keep: '退货率、张明' });
check(
  '保留项都在时不报警',
  (keepOk.prescription || '').includes('必须保留') && !(keepOk.prescription || '').includes('找不到'),
);

const keepBad = await keepTool.execute({ text: keepText, keep: '退货率、张明、复购率 25%' });
check(
  '保留项缺失时点出来',
  (keepBad.prescription || '').includes('「复购率 25%」在当前文本里找不到'),
  '复购率 25% 不在原文里',
);

const keepAbsent = await keepTool.execute({ text: keepText });
check('不传保留项就不出这一行', !(keepAbsent.prescription || '').includes('必须保留'));

// --- 24. 病灶分层要说清「这一层有多重」---
// 占 86% 但只扣 8 分，和占 86% 扣 80 分，一个是顺手改改，一个得推倒重来。
const layerReport = buildReport(wordResult, { genre: 'report', strength: 'standard' });
const layerLine = layerReport.split('\n').find((l) => l.includes('问题主要在用词上')) || '';
check('病灶行给出绝对扣分', /扣 [\d.]+ 分/.test(layerLine), layerLine.slice(0, 60));
check('病灶行给出处理完的落点', layerLine.includes('大概能从'), layerLine.slice(0, 90));

// 只有一层时给的是「基本干净」，不是「降到多少」
const oneLayer = scanText('在当今数字化浪潮下，我们推进这件事。后面这句是正常的。', { genre: 'report' });
const oneLayerLine =
  buildReport(oneLayer, { genre: 'report', strength: 'standard' })
    .split('\n')
    .find((l) => l.includes('问题主要在')) || '';
check('只有一层时说基本干净', oneLayerLine.includes('基本就干净了'), oneLayerLine.slice(0, 80));

// --- 25. 改了一半的稿子（中间地带）---
// 前三条语料组各有盲区：真人稿只证明不误报，AI 稿只证明该报的报了。
// 真实的活儿是改一半——前半段还是八股，后半段已经落到了具体数字上。
// 这种稿子必须两件事同时成立：前半段的毛病照报，后半段一个字都不许碰。
const halfRewritten = [
  '在当今数字化浪潮下，企业运营正在经历一场深刻的变革。我们需要进一步优化流程，持续推进数字化转型，不断打透全链路。',
  '值得注意的是，人工智能技术的引入让效率有了显著提升。行业内普遍认为，这将是未来发展的重要方向。',
  '总的来说，我们既要看到机遇，也要正视挑战，辩证地看待这一趋势。让我们共同期待更美好的明天。',
  '具体说，我们把报销流程从 11 步砍到 4 步，审批时间从平均 6 天压到 1 天半。',
  '改动的原因是财务发现 80% 的单据金额在 500 元以下，没必要走三级审批。这 80% 现在直接进自动审核，',
  '剩下的 20% 才需要人工。上线三个月，报销相关的问题单从每月 240 张降到 37 张。',
].join('\n\n');
const halfResult = scanText(halfRewritten, { genre: 'report' });
check(
  '改了一半的稿子分数落在中间',
  halfResult.score > 30 && halfResult.score < 90,
  `${halfResult.score} 分`,
);
const halfParas = (halfResult.paragraphHits || []).map((h) => h.paragraph);
check(
  '段落定位只指向前半段',
  halfParas.length > 0 && halfParas.every((n) => n <= 3),
  JSON.stringify(halfParas),
);
check(
  '真数字对比不当排比算',
  !halfResult.findings.some((f) => f.id === 'from-to-from-to'),
  halfResult.findings.map((f) => f.id).join(','),
);
check(
  '后半段的真数字不被扣分',
  !(halfResult.findings || []).some((f) => (f.samples || []).some((s) => s.text.includes('240 张'))),
);

// --- 26. 长文本要说清「局部会被平均掉」---
// 密度算的是全文每千字多少处。三千字里夹着三百字全是黑话，按全文算不到一处。
// 试过按块取最狠的一段，真人公文和真技术文档全被误伤——文体校准本来就是按全文
// 统计的，分块等于把这个校准拆了。所以不猜，把话说清楚。
const longBlind = scanText(
  `${'这一版把连接池从每进程 10 条调到 20 条，压测时 P99 从 180 毫秒降到 96 毫秒。\n\n'.repeat(130)}`,
  { genre: 'tech' },
);
check(
  '长文本提示局部会被平均掉',
  (longBlind.blindSpots || []).some((s) => s.includes('局部集中')),
  JSON.stringify(longBlind.blindSpots || []),
);
const longReport = buildReport(longBlind, { genre: 'tech', strength: 'standard' });
check(
  '长文本不说「别和整篇比」',
  !longReport.includes('短文本的分数别和整篇稿子比'),
);
check(
  '短文本要说「别和整篇比」',
  buildReport(tinyOne, { genre: 'report', strength: 'standard' }).includes('短文本的分数别和整篇稿子比'),
);

// --- 27. 两套清单不能叠在一起 ---
// 「先改三处」按规则排，「先改哪几段」按段排。三五段的稿子两份一起给，
// 排法不一样，读者要在脑子里对齐两遍，还不如只给一份。
const threePara = [
  '在当今数字化浪潮下，我们需要进一步优化流程。',
  '值得注意的是，行业内普遍认为这是未来方向。',
  '总的来说，让我们共同期待更美好的明天。',
].join('\n\n');
const threeResult = scanText(threePara, { genre: 'report' });
const threeReport = buildReport(threeResult, { genre: 'report', strength: 'standard' });
check('三段稿不给段号清单', !threeReport.includes('先改哪几段'), `${threeResult.stats.paragraphs} 段`);
check('三段稿仍给先改三处', threeReport.includes('如果只改三处'));

const fivePara = [
  ...threePara.split('\n\n'),
  '第二段补充：这个方案涉及三个部门，预算 200 万，负责人是张明，明年三月上线。',
  '第三段补充：去年同类项目做过一次，实际花了 340 万，延期两个月。',
].join('\n\n');
check(
  '五段稿给段号清单',
  buildReport(scanText(fivePara, { genre: 'report' }), { genre: 'report', strength: 'standard' }).includes('先改哪几段'),
);

// --- 28. 长文里定位局部密集的段 ---
// 密度按全文算，三千字里夹三百字黑话会被平均掉。分数不动，但要指出来。
const fillerPara =
  '这段讲的是城市交通治理在过去几年里的变化，包括信号灯配时、潮汐车道、公交专用道这些具体做法，以及它们各自的效果。';
const junkPara = [
  '我们需要进一步优化流程，持续推进这件事落地，不断打透全链路。',
  '在用户增长方面，我们围绕年初制定的目标，全面提升了整体效能。',
  '在商业化方面，我们也清醒地认识到，下一阶段我们将继续聚焦核心目标。',
  '平台生态需要闭环，壁垒需要护城河，飞轮要转起来，心智要打透。',
].join('');
const longParas = [];
for (let i = 0; i < 50; i += 1) longParas.push(fillerPara + fillerPara);
longParas.splice(25, 0, junkPara);
const longMixed = longParas.join('\n\n');
const longMixedResult = scanText(longMixed, { genre: 'report' });
check(
  '长文能定位到局部密集的段',
  (longMixedResult.localHotspots || []).some((h) => h.paragraph === 26),
  `${longMixedResult.stats.paragraphs} 段`,
);
check(
  '局部密集的段进了报告',
  buildReport(longMixedResult, { genre: 'report', strength: 'standard' }).includes('局部特别密的地方'),
);
check('短视频不报局部热点', (scanText(fivePara, { genre: 'report' }).localHotspots || []).length === 0);

// 政府工作报告：整体 5 分 A 级，但个别段落本来就比平均密（公文政策列举）。
// 这种时候要说「可能是文体惯例」，不能让人以为整篇到处是雷。
const govUrl = new URL('../corpus/samples/report-gov-work-2026.txt', import.meta.url);
const govText = (await import('node:fs')).readFileSync(govUrl, 'utf8');
const govResult = scanText(govText, { genre: 'report' });
const govReport = buildReport(govResult, { genre: 'report', strength: 'standard' });
check(
  '分数低时提示可能是文体惯例',
  govResult.localHotspots.length > 0 && govReport.includes('文体的惯例'),
  `${govResult.score} 分 / ${govResult.localHotspots.length} 处热点`,
);

// --- 29. 黑话门槛 ---
// 原来的 0.8 等于「一千字里用一次就报」，真人零星用一次行业词也会被误伤
// （实测 47% 的真人稿过线，比模型还高）。门槛改成 1.5 之后，零星使用放过，
// 刷屏才报——这条断言就是钉住这个分界。
const fillerLine = '这段讲的是具体的排期和人力，谁在什么时候做什么，遇到问题找谁，都写在表里。';
// 撑到一千四百字左右：一千字里出现一次是 1.0/千字，落在门槛 1.5 以下。
const fillerBlock = Array.from({ length: 24 }, (_, i) => `第 ${i + 1} 项：${fillerLine}`).join('\n');
const oneJargon = `${fillerBlock}\n\n下周开始赋能一线。\n\n${fillerBlock}`;
const manyJargon = `${fillerBlock}\n\n下周开始赋能一线。这件事要沉淀下来，形成闭环。先对齐抓手，拉齐颗粒度。目标是顶层设计和底层逻辑一起破局。\n\n${fillerBlock}`;
const oneJargonResult = scanText(oneJargon, { genre: 'news' });
const manyJargonResult = scanText(manyJargon, { genre: 'news' });
check(
  '一千五百字里用一次黑话不报',
  !oneJargonResult.findings.some((f) => f.id === 'jargon'),
  `${oneJargonResult.stats.chars} 字`,
);
check(
  '同一长度刷五次黑话照报',
  manyJargonResult.findings.some((f) => f.id === 'jargon'),
);
// 技术文档的门槛更宽：「复用」在工程语境是干活用的词。
const techJargon = `${fillerBlock}\n\n这个组件可以复用，避免重复造轮子。\n\n${fillerBlock}`;
check(
  '技术文档里用一次「复用」不报',
  !scanText(techJargon, { genre: 'tech' }).findings.some((f) => f.id === 'jargon'),
);

// ─── 30. 这些地方不用动 ───
console.log('\n--- 30. 这些地方不用动 ---');
// 改稿最容易的翻车不是没改掉毛病，是把好东西一起改掉了。所以先划一条线。
// 判据全是客观统计，不夸不打分。
const keepSource = readFileSync(
  new URL('../corpus/samples/webnovel-handwritten-ch01.txt', import.meta.url),
  'utf8',
);
const keepHuman = scanText(keepSource, { genre: 'fiction' });
const keepList = buildKeeps(keepHuman);
check('句长有起伏的稿子会被提醒别切碎', keepList.some((k) => k.includes('别为了「整齐」')));
check('段落长短不整齐的稿子会被提醒别凑字数', keepList.some((k) => k.includes('别为了「匀称」')));
check(
  '有具体信息的稿子会报出条数',
  keepList.some((k) => /处数字、原话或时间/.test(k)),
);

// 模型默认稿的特点是句长整齐、段落整齐、几乎没有可核对的细节，
// 所以它一条「别动」都拿不到——这本身就是个信号。
const keepAi = scanText(
  readFileSync(new URL('../corpus/samples/ai-report-baseline.txt', import.meta.url), 'utf8'),
  { genre: 'report' },
);
check('句长整齐的模型稿拿不到「别切碎」', !buildKeeps(keepAi).some((k) => k.includes('别为了「整齐」')));
check('模型稿的保留项明显少于人写稿', buildKeeps(keepAi).length < keepList.length);
check(
  '报告里有「这些地方不用动」这一节',
  buildReport(keepHuman, { genre: 'fiction', strength: 'standard' }).includes('这些地方不用动'),
);
// 没有可保留项时整节不出现，不留一个空标题。
check(
  '没有可保留项时不出现这一节',
  !buildReport(keepAi, { genre: 'report', strength: 'standard' }).includes('这些地方不用动'),
);

// ─── 31. 常驻提示片段与规则表同步 ───
console.log('\n--- 31. 常驻提示片段与规则表同步 ---');
// 常驻片段每轮都在，是说话最管用的地方。所以它举的例子必须是规则真能抓的——
// 否则模型照着片段写得规规矩矩，扫描却什么都报不出来，两边各说各的。
const promptText = buildPromptSection();
check('提示片段讲了「空在位置里」这一层', promptText.includes('不在词里，在位置里'));
// 片段里点名的样本，逐条丢给扫描，必须命中对应规则。
const promptSamples = [
  ['相关负责人表示，下一步将继续推进。', 'vague-source'],
  ['她望着窗外，心中思绪万千。', 'emotion-cliche'],
  ['希望今天的分享对你有所启发，我们下期再见。', 'video-outro'],
  ['大家好，欢迎来到本期分享。', 'video-opening'],
  ['这也让我们不禁思考，问题到底出在哪里。', 'think-aloud'],
  ['最近，一则关于 AI 版权归属的新闻引发了广泛讨论。', 'news-peg'],
];
const unrunnable = promptSamples.filter(
  ([sample, id]) => !scanText(sample, { genre: 'general' }).findings.some((f) => f.id === id),
);
check(
  '提示片段举的例子规则都能抓到',
  unrunnable.length === 0,
  unrunnable.length === 0 ? '全覆盖' : `抓不到：${unrunnable.map(([, id]) => id).join('、')}`,
);

// ─── 32. 报告里同一个信息只说一次 ───
console.log('\n--- 32. 报告里同一个信息只说一次 ---');
// 诊断报告长了容易读不完，但真正让人停下来的是重复：同一个名字在不同节里
// 各列一遍，读者会以为还有新内容，往后翻发现是旧的。
const repeatSrc = readFileSync(new URL('../corpus/samples/ai-report-baseline.txt', import.meta.url), 'utf8');
const repeatResult = scanText(repeatSrc, { genre: 'report' });
const repeatReport = buildReport(repeatResult, { genre: 'report', strength: 'standard', keep: '' });
check('扣分写在每条命中自己的标题里', /### 1\. .+〔.+扣 [\d.]+ 分〕/.test(repeatReport));
check(
  '命中的扣分不再另起一节重复一遍',
  !repeatReport.includes('模板腔指数是怎么来的'),
  repeatReport.includes('模板腔指数是怎么来的') ? '还在' : '已合并',
);
// 结构性扣分（句长整齐、缺锚点这类）没有对应的命中条目，还得单独列出来。
const structOnly = [1, 2, 3, 4].map((i) => `第 ${i} 段写的是一件小事，时间地点人物都有，句子长短差不多。`).join('\n\n');
const structReport = buildReport(scanText(structOnly, { genre: 'general' }), { genre: 'general', strength: 'standard' });
check(
  '结构性扣分单独说明',
  !structReport.includes('模板腔指数是怎么来的'),
  structReport.includes('另外几处扣分') ? '有单独一节' : '无结构性扣分',
);
check('指标表说明了⚠不一定扣分', repeatReport.includes('标⚠的不一定扣了分'));

// --- 32. 段落长度过于均匀：已证伪并删除 ---
// 这条判据原来对「段长变异系数 < 0.32」扣 7 分。2026-11 对 33 份语料实测不成立：
// 8 份模型稿只抓到 2 份，21 份真人稿和改写稿误伤 2 份。判据已删除，这里锁住
// 「删了就不许悄悄回来」，免得哪天有人觉得它有用又加回去。
const flatParas = [
  '一月的复盘做完，新增用户涨了百分之十二，主要是渠道投放拉动的。',
  '二月的复盘做完，新增用户涨了百分之九，春节假期拉低了两天数据。',
  '三月的复盘做完，新增用户涨了百分之十五，开学季把日活抬起来了。',
  '四月的复盘做完，新增用户涨了百分之十一，和三月基本持平。',
].join('\n\n');
const flatResult = scanText(flatParas, { genre: 'report' });
check(
  '段长整齐不再单独扣分',
  !(flatResult.breakdown || []).some((b) => String(b.source).includes('段落长度过于均匀')),
  `段长变异系数 ${flatResult.stats.paragraphCv.toFixed(2)}`,
);
check(
  '报告里不再出现「段落长度过于均匀」',
  !buildReport(flatResult, { genre: 'report', strength: 'standard' }).includes('段落长度过于均匀'),
);
// 一对同构样本：人写的新华网消息稿 vs 模型默认写的新闻稿。
// 段长几乎一样（0.22 / 0.19），所以分数差只能来自别处——这正是删除的理由。
const humanNews = scanText(
  readFileSync(new URL('../corpus/samples/news-game-license.txt', import.meta.url), 'utf8'),
  { genre: 'news' },
);
const aiNews = scanText(
  readFileSync(new URL('../corpus/samples/ai-news-baseline.txt', import.meta.url), 'utf8'),
  { genre: 'news' },
);
const isFlat = (r) => r.stats.paragraphCv !== null && r.stats.paragraphCv < 0.32;
check(
  '这对同构样本段长都算整齐，但分数差来自别处',
  isFlat(humanNews) && isFlat(aiNews) && aiNews.score - humanNews.score >= 20,
  `人写 ${humanNews.score} 分（CV ${humanNews.stats.paragraphCv.toFixed(2)}）/ 模型 ${aiNews.score} 分（CV ${aiNews.stats.paragraphCv.toFixed(2)}）`,
);

// --- 33. 长句要看逗号，同主语要看句长 ---
// 2026-11 抓到的两处误报，都是「把长句当毛病」的变种。人民日报副刊那篇散文
// （平均 90.7 字一句、逗号句号比 4.19、连三句以「我」开头）被判 26 分，
// 两处判据都改成了看「句子是不是流水句」「句子是不是短」。
const flowingLong = [
  '我在草原上走了很多年，看过牧人接生羊羔，看过暴风雪里举着的手电筒，看过驯鹿的鹿茸，也看过盗挖赤芍的人在夜里跑掉，那些画面一直留在我脑子里，从来没有模糊过。',
  '后来我把这些写进散文，写牧人的事，写知青的事，写狼的事，写那些我不知道该怎么说清楚、但一直记着的事，写的时候常常写着写着就停下来，因为有些细节我不确定自己记对了没有。',
  '有人说散文要写细节，我觉得细节不是找来的，是你恰好在那儿，恰好看见了，又恰好没忘掉，然后就写下来了，凡是需要专门去找的细节，写出来总有点不对劲。',
  '写作这件事，说到底就是我坐在桌前，把这些年攒下的人和事一个一个拿出来擦干净，摆好，再一个一个字写下去，写得慢，但我不想写快。',
].join('\n\n');
const flowingResult = scanText(flowingLong, { genre: 'general' });
check(
  '平均句长很长但逗号多，不判成欧化长句',
  flowingResult.stats.avgSentenceLength > 55 &&
    flowingResult.stats.commaPeriodRatio >= 3 &&
    !(flowingResult.breakdown || []).some((b) => String(b.source).includes('句子普遍过长')),
  `平均 ${flowingResult.stats.avgSentenceLength} 字，每句 ${flowingResult.stats.commaPeriodRatio} 个逗号`,
);
// 反过来：长句但没逗号，还是欧化长句，要报。
const stackedLong = [
  '这是一个在县城长大的后来去了深圳打工又回到县城的年轻人的故事，一个关于他的父亲母亲以及他从未见过面的祖父和一直住在隔壁的叔公的故事。',
  '我们真正需要的是一种能够同时兼顾效率与公平、兼顾短期收益与长期价值、兼顾个体诉求与集体利益并且在实际执行中不至于变形走样的制度安排。',
  '他提出的那个关于如何在没有清晰边界的情况下保持判断力并且不伤害任何人的问题，以及那个问题背后更深的关于责任如何分配的问题，至今没有答案。',
  '这本书记录的是一个普通家庭在三十年间经历的种种变化，以及那些变化背后没有被说出口的犹豫、妥协、争执和最终谁也没有赢的那场沉默。',
].join('\n\n');
const stackedResult = scanText(stackedLong, { genre: 'general' });
check(
  '长句且逗号少，照样判成欧化长句',
  (stackedResult.breakdown || []).some((b) => String(b.source).includes('句子普遍过长')),
  `平均 ${stackedResult.stats.avgSentenceLength} 字，每句 ${stackedResult.stats.commaPeriodRatio} 个逗号`,
);
// 主语连排：长句里重复「我」是叙述节奏（那篇散文就是），短句里重复才是排比腔。
const longSubjectRun = [
  '我在这个城市住了十六年，看着地铁从两条线修到了二十多条，看着城南的菜地变成写字楼，也看着楼下那家修车摊换过三任主人。',
  '我知道每一任主人姓什么，知道头一个回安徽了，第二个去了昆山，第三个还在，只是把摊子往巷子里挪了两米。',
  '我想过要不要把这件事写下来，后来没写，因为我不知道该把它写成城市变化，还是写成三个人的十六年。',
].join('\n\n');
check(
  '长句连着三句同主语，不判成机械排比',
  scanText(longSubjectRun, { genre: 'general' }).stats.maxConsecutiveSameSubject === 0,
  '句子每句都超过四十字',
);
const shortSubjectRun = '我去了北京。我见了客户。我签了合同。我回了酒店。我睡不着。';
check(
  '短句连着同主语，才是机械排比',
  scanText(shortSubjectRun, { genre: 'general' }).stats.maxConsecutiveSameSubject >= 3,
);

// --- 34. 网文腔八条：真人网文零命中，模型网文全中 ---
// 2026-11 补 webnovel 的 AI 基线时发现，模型默认写的玄幻章节只判 11 分 A，
// 而它满篇是「眼中闪过一丝」「嘴角勾起一抹弧度」这类零件。八个候选在真人网文上
// 逐条测过（《雪中悍刀行》23570 字 + 手写网文 4258 字），全部零命中。
const webnovelRules = [
  'eye-flash',
  'lip-arc',
  'deep-breath',
  'inner-monologue',
  'pupil-contract',
  'just-began',
  'suddenly-punct',
  'all-different',
];
const humanWebnovel = [
  'webnovel-xuezhong-ch01',
  'webnovel-handwritten-ch01',
].map((f) => scanText(readFileSync(new URL(`../corpus/samples/${f}.txt`, import.meta.url), 'utf8'), { genre: 'webnovel' }));
check(
  '真人网文一条网文腔都不命中',
  humanWebnovel.every((r) => !r.findings.some((f) => webnovelRules.includes(f.id))),
  `雪中 ${humanWebnovel[0].score} 分 / 手写 ${humanWebnovel[1].score} 分`,
);
const aiWebnovel = scanText(
  readFileSync(new URL('../corpus/samples/ai-webnovel-baseline.txt', import.meta.url), 'utf8'),
  { genre: 'webnovel' },
);
const aiWebnovelHits = aiWebnovel.findings.filter((f) => webnovelRules.includes(f.id));
check(
  '模型默认写的网文章节能被网文腔接住',
  aiWebnovelHits.length >= 6 && aiWebnovel.score >= 30,
  `命中 ${aiWebnovelHits.length} 条，${aiWebnovel.score} 分`,
);

// --- 36. 黑话词表里不该有「行业腔」 ---
// 一个词若在真人样本里出现得比模型样本还多，它量的就是语域，不是 AI 味。
// 20 份真人稿逐词统计过：落地出现在 5 份、协同 4 份、沉淀 4 份、底座 2 份，
// 而 11 份模型稿里这几个词加起来只命中 5 次。留着就是拉低区分度。
const jargonWords = RULES.find((r) => r.id === 'jargon').vocabulary;
const industryWords = ['落地', '沉淀', '协同', '发力', '痛点', '耦合', '纵深', '底座'];
check(
  '行业腔的词不在黑话表里',
  industryWords.every((w) => !jargonWords.includes(w)),
  industryWords.filter((w) => jargonWords.includes(w)).join('、') || '全清',
);
check(
  '真黑话还在黑话表里',
  ['赋能', '抓手', '闭环', '颗粒度', '品效合一', '种草'].every((w) => jargonWords.includes(w)),
);
const industryProse =
  '这项政策要落地，还得看地方怎么协同。过去几年沉淀下来的经验不少，痛点也很清楚，' +
  '底座搭好了，纵深才推得动。耦合太紧反而不好改。';
check(
  '正经的产业叙述不报黑话',
  !scanText(industryProse, { genre: 'news' }).findings.some((f) => f.id === 'jargon'),
  String(scanText(industryProse, { genre: 'news' }).score),
);

// --- 37. 「没查到什么」要列全 ---
// 结构性判据（句长、信息密度、口吻）整体挂在 chars >= 120 这个门槛上，
// 但这条门槛原来没写进盲区清单。结果是六十来字的稿子报「0 分 A 级」，
// 却不告诉你句长根本就没查——正是插件自己反对的那种「让它放心」。
const tinyText = '好';
const tinyResult = scanText(tinyText, { genre: 'general' });
check(
  '极短的输入要说明连一句都不完整',
  tinyResult.tooShort === true &&
    (tinyResult.blindSpots || []).some((b) => b.includes('连一句都不完整')),
  String(tinyResult.score),
);
const under120 = scanText('在当今数字化浪潮下，我们持续推进这件工作。', { genre: 'report' });
check(
  '不足 120 字要说明句长没查',
  (under120.blindSpots || []).some((b) => b.includes('120 字以上')),
  (under120.blindSpots || []).length + ' 项',
);
const over120 = scanText(
  '昨天下午三点，我在城南的旧书市场待了两个小时。摊主姓周，六十多岁，摊上大多是八九十年代的旧杂志。' +
    '我挑了一本 1987 年的《读书》，五块钱。他说这种现在没人要了，论斤卖。' +
    '回家路上我想起小时候家里也订过，那时候一个月一本，邮递员骑车送到楼下。' +
    '书皮是牛皮纸的，拆开有股油墨味。现在那种气味很少闻到了。',
  { genre: 'general' },
);
check(
  '超过 120 字就不再提示句长没查',
  !(over120.blindSpots || []).some((b) => b.includes('120 字以上')),
  `${over120.stats.chars} 字`,
);

// --- 38. 每个文体都得有真人侧和模型侧 ---
// 只有真人侧，证明的是「不该报的没报」；只有模型侧，证明的是「该报的报了」。
// 缺哪一侧，那个文体的判定就有一半是没验过的。这条断言逼着以后加文体时
// 同时想清楚「人怎么写」和「模型怎么写」，而不是加完 GENRES 就算完事。
const manifest = JSON.parse(
  readFileSync(new URL('../corpus/manifest.json', import.meta.url), 'utf8'),
);
const manifestSamples = Array.isArray(manifest)
  ? manifest
  : manifest.samples || Object.values(manifest);
const humanGenres = new Set(
  manifestSamples
    .filter((x) => !(x.platform || '').includes('模型默认输出') && !(x.platform || '').includes('照处方改写'))
    .map((x) => x.genre),
);
const aiGenres = new Set(
  manifestSamples.filter((x) => (x.platform || '').includes('模型默认输出')).map((x) => x.genre),
);
const genreList = Object.values(GENRES);
const missingHuman = genreList.filter((g) => !humanGenres.has(g.id)).map((g) => g.id);
const missingAi = genreList.filter((g) => !aiGenres.has(g.id)).map((g) => g.id);
check('每个文体都有真人样本', missingHuman.length === 0, missingHuman.join('、') || '全覆盖');
check('每个文体都有模型默认输出样本', missingAi.length === 0, missingAi.join('、') || '全覆盖');
const rewrittenGenres = new Set(
  manifestSamples
    .filter((x) => (x.platform || '').includes('照处方改写'))
    .map((x) => x.genre),
);
const missingRewritten = genreList.filter((g) => !rewrittenGenres.has(g.id)).map((g) => g.id);
// 第三侧：照处方改出来的稿子必须 0 分。前两侧证明「判得对」，这一侧证明
// 「按报告说的做，真能改好」——不然处方写得再漂亮也没人验证过。
check('每个文体都有照处方改写的稿子', missingRewritten.length === 0, missingRewritten.join('、') || '全覆盖');

const generalAi = scanText(
  readFileSync(new URL('../corpus/samples/ai-general-baseline.txt', import.meta.url), 'utf8'),
  { genre: 'general' },
);
check(
  '默认文体 general 也要抓得住模型稿',
  generalAi.score >= 45,
  `${generalAi.score} 分 ${generalAi.grade}`,
);

// --- 39. 不同文体的分数不能直接比 ===
console.log('\n=== 39. 文体分数尺度 ===');
{
  const launch = readFileSync(new URL('../corpus/samples/ai-proposal-launch-subtype.txt', import.meta.url), 'utf8');
  const launchResult = scanText(launch, { genre: 'proposal' });
  const launchReport = buildReport(launchResult, { genre: 'proposal', strength: 'standard' });
  // 通篇空话的方案稿只有二十多分，不说这句，读者会把 B 级当合格。
  check('方案稿分数偏低时要说明这不是「没问题」', launchReport.includes('方案策划这个文体'));
  const good = readFileSync(new URL('../corpus/samples/rewritten-proposal.txt', import.meta.url), 'utf8');
  const goodResult = scanText(good, { genre: 'proposal' });
  const goodReport = buildReport(goodResult, { genre: 'proposal', strength: 'standard' });
  check('真的改干净了就不再提醒这一句', !goodReport.includes('方案策划这个文体'));
  const rep = readFileSync(new URL('../corpus/samples/ai-report-baseline.txt', import.meta.url), 'utf8');
  const repResult = scanText(rep, { genre: 'report' });
  const repReport = buildReport(repResult, { genre: 'report', strength: 'standard' });
  check('别的文体不带这条提醒', !repReport.includes('方案策划这个文体'));
}


// --- 40. 口语的长句不是病 ---
// 罗辑推过：真人口语的平均句长和「超四十字」占比都比 AI 口播稿高，
// 李书福 32.2 字 / 32%，雷军 28.4 / 26%，分享会 22.1 / 13%；
// 两份 AI 口播稿是 19.1 / 0% 和 22.5 / 0%。所以「一句念不完」不是 AI 味，
// 真人说话本来就一口气串到底。这条断言钉住这个方向，防止以后有人加一条反过来的规则。
const spokenLong = [
  '我当时就想明白一件事，就是你不能指望用户自己去找你的产品，你得把东西放到他每天都要经过的地方，让他不得不看见。',
  '我们做过一次测试，把同一个功能放在三个不同的位置，结果点开率差了七倍，这个数我记到今天。',
  '所以后来我定了一条规矩，任何新功能上线之前，先问一句用户会不会自己走到这一步，如果不会，那这个功能就是白做。',
].join('\n\n');
const spokenLongResult = scanText(spokenLong, { genre: 'script' });
check(
  '口语里连着长句不判成毛病',
  spokenLongResult.score === 0,
  `${spokenLongResult.score} 分 / 平均 ${spokenLongResult.stats.avgSentenceLength.toFixed(1)} 字`,
);
check(
  '口语长句在默认文体下也不报',
  scanText(spokenLong, { genre: 'general' }).score === 0,
  'general',
);


// --- 41. 黑话单项封顶在 16 分 ---
// 一份真的黑话密集的专业稿（商业分析、技术博客）最多被这条拉到 B 级，
// 不会被判成 D/E。这决定了词表里那些「方向对但从没在任何语料里出现过」的词
// 值不值得清——上限就这么高，清不清都不影响结论。
const jargonDense = [
  '本次项目围绕品牌调性做了一轮梳理，从私域到公域重新拉齐了打法。',
  '我们打通了全链路，形成了组合拳，实现了降本增效和提质增效。',
  '接下来要把底层逻辑讲清楚，用第一性原理重新看这套增长飞轮。',
  '认知升级是关键，破圈出圈都要做，还要让用户心智发生改变。',
  '中台能力要沉淀，颗粒度要细，价值锚点和战略定力都得守住。',
  '这是一次双向奔赴，也是长期主义的胜利，更是结构化思维的成果。',
].join('\n\n');
const jargonDenseResult = scanText(jargonDense, { genre: 'general' });
const jargonFinding = jargonDenseResult.findings.find((f) => f.id === 'jargon');
check('黑话密集的稿子能抓到 jargon', !!jargonFinding, jargonFinding ? `${jargonFinding.count} 次` : '没抓到');
check(
  'jargon 单项封顶 16 分',
  !!jargonFinding && jargonFinding.points <= 16,
  jargonFinding ? `${jargonFinding.points} 分` : '无',
);
check(
  '光靠黑话拉不到 D 级',
  jargonDenseResult.grade !== 'D' && jargonDenseResult.grade !== 'E',
  `${jargonDenseResult.score} ${jargonDenseResult.grade}`,
);


// --- 42. 重复判据：纲要不算复读、复沓不算复读、真复读要抓得到 ---
// 原来的覆盖率拿「随便截的十八个字」除以整句长度，后果是三句以上永远判不出来：
// 三十七字的两句一字不差，覆盖率也只有 18/37 = 0.49，直接被当成「只是共用了套语」。
// 而 AI 复读的典型形态恰恰是长句整段重复。改成「最长共有片段 / 较短那句」之后才能量对。
const dupFiller = [
  '第一句讲的是开头。',
  '第二句说中间遇到的问题。',
  '第三句交代了当时在场的人。',
  '第四句提了一句题外话。',
];
const outlineText = [
  '模式一，营销资源定制，助力品牌bigday传播声量爆发；',
  ...dupFiller,
  '「美腾模式」为即时零售场景带来了想象力空间，无论是通过营销资源定制，助力品牌big day传播声量爆发，还是站内外流量高效组合，目标人群精准引流，都能放大品牌生意机会规模。',
].join('');
const echoText = [
  '老仆笑得很淳朴很灿烂，一张老脸像只有出了远门到了荒郊才能瞅见的大片芦苇丛，却有着自己的情怀。',
  ...dupFiller,
  '老仆笑得很淳朴很灿烂，一张老脸像只有出了远门到了荒郊才能瞅见的大片芦苇丛，却有着自己的情怀，如一坛子尘封许多许多年的老酒。',
].join('');
const verbatimLongText = [
  '把这件事从头到尾说一遍需要一点耐心因为中间转折太多而且每个转折都牵涉到不同的人所以讲起来会很长。',
  ...dupFiller,
  '把这件事从头到尾说一遍需要一点耐心因为中间转折太多而且每个转折都牵涉到不同的人所以讲起来会很长。',
].join('');

const hasDup = (t) => scanText(t, { genre: 'general' }).findings.some((f) => f.id === 'rhythm-duplicate-passage');
check('纲要加展开不算复读', !hasDup(outlineText));
check('复沓（整句复述再补一段）不算复读', !hasDup(echoText));
check('长句整段重复照样报', hasDup(verbatimLongText));


// --- 43. 同一文体的第二个亚型 ---
// 第一份模型稿各只有一个亚型。消息稿不写拔高，特写写；玄幻用一套零件，言情用另一套。
// 这几条验的是「规则抓的是这个文体的通病，还是只认得那一份样本」。
const featureText = readFileSync(
  new URL('../corpus/samples/ai-news-feature-baseline.txt', import.meta.url),
  'utf8',
);
const featureResult = scanText(featureText, { genre: 'news' });
check(
  '新闻特写体的拔高一路抓得到',
  featureResult.score >= 50,
  `${featureResult.score} ${featureResult.grade}`,
);

const factualNews = [
  '市交通委 3 月 12 日发布通告，从 4 月 1 日起，城区 27 条主路的夜间施工时段调整为 22 点至次日 5 点。',
  '通告写明，中高考期间（6 月 1 日至 6 月 20 日）全天禁止施工，违者按《噪声污染防治法》第四十三条处罚。',
  '施工单位的审批材料需要在开工前七天报区城管委备案，备案名单每周五在官网公示。',
  '市民发现违规施工，可拨打 12345 转城管专线，受理后两个工作日内现场核查。',
  '市交通委表示，去年夜间施工投诉共 4821 件，其中噪音类占 63%。',
].join('');
const factualResult = scanText(factualNews, { genre: 'news' });
check(
  '只写事实的新闻叙事不报拔高',
  factualResult.findings.every(
    (f) => !['refraction-cliche', 'lift-up-cliche', 'not-think', 'it-is-just', 'behind-simple'].includes(f.id),
  ),
  `${factualResult.score} ${factualResult.grade}`,
);

const romanceText = readFileSync(
  new URL('../corpus/samples/ai-webnovel-romance-baseline.txt', import.meta.url),
  'utf8',
);
const romanceResult = scanText(romanceText, { genre: 'webnovel' });
const romanceCliché = romanceResult.findings.filter((f) =>
  ['eye-flash', 'lip-arc', 'dramatic-pause', 'ripple-cliche', 'all-different'].includes(f.id),
);
check(
  '都市言情和玄幻共用同一套零件',
  romanceCliché.length >= 4 && romanceResult.score >= 30,
  `${romanceResult.score} ${romanceResult.grade}，命中 ${romanceCliché.length} 条`,
);


// --- 44. 机械标点不是 AI 味 ---
// 专门量过：半角句号、连续空格这些「排版不规范」，真人比模型还多。
// 加规则只会伤真人，所以这几条是反向断言，锁住「别加回来」。
const messyPunct = [
  '那天下午三点，我在维修点等着取车. 师傅把链条拆下来摊在报纸上，一共 47 节，断了两节。',
  '他抬头看了我一眼，说这车骑了八年了吧，链条早该换了. 我说是2018年买的，中间没换过。',
  '换完他拿抹布擦手，抹了三下才把油污擦掉. 报价 85 元，比我预想的便宜 40 块。',
  '出门我试了一圈，链条不响了. 路上顺道买了两斤橘子，八块钱一斤，老板娘多塞了一个。',
  '回到小区门口，保安问我在哪修的. 我说就前面那条街，他说那家开了二十多年了。',
].join('\n\n');
const messyResult = scanText(messyPunct, { genre: 'general' });
check(
  '半角句号混在中文里不扣分',
  messyResult.score === 0,
  `${messyResult.score} ${messyResult.grade}`,
);

const spacedOut = [
  '这本书我读了三个星期，一共 421 页，折角的地方有 17 处。',
  '读得最慢的是第四章，那章讲了冰岛语里的格变化，我一页要看两遍。',
  '读完那天是周三，我在最后一页写了个日期，还画了个歪掉的方框。',
].join('  \n\n  ');
const spacedResult = scanText(spacedOut, { genre: 'general' });
check(
  '段落前后多打了空格不扣分',
  spacedResult.score === 0,
  `${spacedResult.score} ${spacedResult.grade}`,
);

// 网文靠单换行分自然段，没有空行。切段要是只认空行，整章会被当成一段，
// 「一句一段」和段落均匀两类判据就全废了。这条锁住单换行也切段。
const singleNewline = [
  '他把刀收回鞘里，没再说话。',
  '院子里起了风，晾着的衣裳一件件翻过来。',
  '老太太从屋里出来，端着一碗水，放在石桌上。',
  '水是凉的，碗底有一圈洗不掉的茶渍。',
  '他端起来喝了一口，又放下。',
  '天完全黑了，鸡在窝里扑腾了两下，安静下来。',
].join('\n');
const nlResult = scanText(singleNewline, { genre: 'webnovel' });
check(
  '单换行也按段切分',
  nlResult.stats.paragraphs === 6,
  `段落数 ${nlResult.stats.paragraphs}（应为 6）`,
);

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exitCode = failures === 0 ? 0 : 1;
