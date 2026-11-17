// nature · 中文写作体检 · 扫描引擎
//
// 纯确定性分析，不调用模型、不联网。输入一段中文，输出：
//   1. 命中清单（哪条规则、命中几次、原句片段、为什么、怎么改）
//   2. 量化指标（句长分布、段落均匀度、"的"密度、具体信息锚点……）
//   3. 综合 AI 味评分与等级
//
// 评分刻意做成可解释的：每一分都能追到某条规则或某个指标上。

import {
  RULES,
  RHYTHM_RULES,
  RHYTHM_PROFILES,
  DEFAULT_RHYTHM_PROFILE,
  buildCustomRules,
  SEVERITY_LABEL,
  layerOf,
  LAYER_LABEL,
} from './rules.js';
import { GENRE_IDS } from './content.js';

// 中文字符与日文假名。语言检测用：这套规则是为中文语感设计的，
// 拿它去判英文、日文、或者中英混排的技术文档，出来的分数没有意义。
const CJK_CHAR = /[\u4e00-\u9fff]/g;
const KANA_CHAR = /[\u3040-\u30ff]/g;

// 中文占比低于这个值就直接不分析——句长、锚点、口语这几项全都建立在
// 中文的句子边界和词表上，非中文文本必然被误判成「句子过长、缺少锚点」。
const CJK_MIN_RATIO = 0.1;
// 太短的输入没有句子，也没有段落。它照样扫（粘一段话随手看看是主用法），
// 但报告要把「没查到什么」说在这些项上，别让「0 分 A 级」读成「写得没问题」。
const TINY_CHARS = 8;

// 低于这个比例算中英混排：仍然分析，但跳过最受语言影响的几项结构扣分。
const CJK_CLEAN_RATIO = 0.5;

// 假名占比超过这个值，判定为日文（日文有大量汉字，光看汉字占比会漏）。
const KANA_MIN_RATIO = 0.05;

/**
 * 统计中文占比。返回 0–1 的比值（以非空白字符为准）。
 */
function measureCjk(text) {
  const visible = text.replace(/\s/g, '');
  if (!visible.length) return { cjkRatio: 0, kanaRatio: 0 };
  const cjk = (text.match(CJK_CHAR) || []).length;
  const kana = (text.match(KANA_CHAR) || []).length;
  return {
    cjkRatio: cjk / visible.length,
    kanaRatio: kana / visible.length,
  };
}

// 句末标点。中文的分号连接并列分句，属于句内停顿；省略号常出现在句中
// 表示迟疑，两者都不算句末。
const SENTENCE_SPLIT = /[。！？!?]|\n+/;

// 判为「极短句」的门槛：中文里十个字以下基本就是一个独立小句。
// 单句短不是问题，连着成串才是。
const SHORT_SENTENCE_MAX = 10;

// 超长句门槛。长本身不是罪，欧化的定语长链才是——那由 de-chain 规则负责。
const LONG_SENTENCE_MIN = 70;

// 连续重复的主语。中文可以承前省略，反复补主语是句子被切碎的副作用。
const SUBJECT_RE = /^(他|她|它|我|你|我们|他们|她们|它们|大家|咱)/;
// 只有短句连排才算机械排比，长句里重复主语是叙述节奏。
const SUBJECT_RUN_MAX_CHARS = 40;

// 列表项不该参与段落统计，否则 markdown 清单会被误判成"一句一段"。
const LIST_LIKE_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

const PUNCT_RE = /[。！？!?…，,、；;：:「」『』“”‘’（）()《》〈〉—\-·\s]/g;

// 「具体信息锚点」：数字、引号里的原话、书名号、时间、金额。
// 一篇没有任何锚点的中文长文，几乎可以断定是空转的抽象话。
const ANCHOR_RE = /(?:\d+(?:\.\d+)?%?)|(?:[一二三四五六七八九十百千万亿几]{1,4}(?:年|月|日|天|人|元|块|万|亿|岁|次|倍|公里|平米))|(?:「[^」]{1,24}」)|(?:《[^》]{1,30}》)|(?:“[^”]{1,24}”)|(?:今天|昨天|前天|上周|本周|去年|今年|上午|下午|晚上|凌晨)/g;

const COLLOQUIAL_RE = /(?:啊|吧|呢|嘛|哦|嗯|唉|哎|其实|说白了|反正|干脆|倒是|偏偏|居然|竟然|结果|后来|本来|说实话|讲道理|问题是|说真的|老实说)/g;
const FIRST_PERSON_RE = /我(?!们)/g;
const DE_RE = /的/g;
const NUMBER_RE = /\d/g;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** 变异系数：标准差 / 均值。越小说明长度越整齐，越像机器排版。 */
function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function countMatches(re, text) {
  const pattern = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const hits = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    hits.push({ index: m.index, text: m[0] });
    if (m.index === pattern.lastIndex) pattern.lastIndex += 1; // 防零宽死循环
    if (hits.length >= 400) break;
  }
  return hits;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function excerpt(text, index, length, pad = 14) {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  return `${head}${text.slice(start, end).replace(/\s+/g, ' ')}${tail}`;
}

/**
 * 基础统计。
 *
 * 除了长度和密度，这里还要算「节奏」——因为断句是否离谱是分布问题：
 * 逗号与句号的比例、极短句是否成串、段落里是不是只有一句话、主语有没有
 * 被迫反复补上。这些指标单独看都没意义，合起来才能区分"长短交错的中文"
 * 和"被切碎的短句流"。
 */
function analyzeStats(text) {
  const chars = text.replace(/\s/g, '').length;

  // 分句：只在真正的句末标点处切，并把收尾引号并回上一句。
  //
  // 中文省略号「……」不能当切分点——它经常出现在句中表示迟疑（「殿……殿下」），
  // 也常被收尾引号跟着（「……杀人呐……”」）。拿它切会产生大量只剩一个引号的
  // 碎片，既虚增句数、拉低平均句长，还会凑出假的「连续短句」。
  const fragments = [];
  for (const part of text.split(/(?<=[。！？!?])/)) {
    for (const line of part.split(/\n+/)) {
      const trimmedLine = line.trim();
      if (trimmedLine.length > 0) fragments.push(trimmedLine);
    }
  }

  const rawSentences = [];
  for (const fragment of fragments) {
    if (fragment.replace(PUNCT_RE, '').length === 0) {
      // 只剩标点，多半是上一句的收尾引号，并回去
      if (rawSentences.length > 0) rawSentences[rawSentences.length - 1] += fragment;
      continue;
    }
    rawSentences.push(fragment);
  }

  const rawParagraphs = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !LIST_LIKE_RE.test(s));

  const sentenceLengths = rawSentences.map((s) => s.replace(PUNCT_RE, '').length);
  // 长句要看是不是真由中文撑起来的。一串哈希、坐标、时间戳去掉标点后
  // 也能超过 70 字，但它不是长句——读者一眼扫过去就跳过了，不会累。
  // 所以中文占比不到三成半的，不算进长句统计。
  const sentenceCjkLengths = rawSentences.map((s) => (s.match(CJK_CHAR) || []).length);
  const isLongSentence = (i) =>
    sentenceLengths[i] > LONG_SENTENCE_MIN && sentenceCjkLengths[i] >= LONG_SENTENCE_MIN * 0.35;
  const isVeryLongSentence = (i) =>
    sentenceLengths[i] > 100 && sentenceCjkLengths[i] >= 100 * 0.35;
  const paragraphLengths = rawParagraphs.map((s) => s.replace(PUNCT_RE, '').length);

  const deCount = countMatches(DE_RE, text).length;
  const anchors = countMatches(ANCHOR_RE, text).length;
  const colloquial = countMatches(COLLOQUIAL_RE, text).length;
  const firstPerson = countMatches(FIRST_PERSON_RE, text).length;
  const digits = countMatches(NUMBER_RE, text).length;

  // ── 标点节奏：逗号／句号比是判断"切碎"最灵敏的单个指标。
  // 健康的中文叙述通常在 1.5–3 之间（一个句号前平均有一到三个逗号）；
  // 碎片化文本会掉到 1 以下，极端情况接近 0。
  const commaCount = (text.match(/[，,]/g) || []).length;
  const periodCount = (text.match(/[。！？!?]/g) || []).length + (text.match(/……/g) || []).length;
  const commaPeriodRatio = Number(((commaCount + 1) / (periodCount + 1)).toFixed(2));

  // ── 段落节奏：一句一段是社交媒体排版，不该出现在文章里。
  const paragraphSentenceCounts = rawParagraphs.map(
    (p) => p.split(SENTENCE_SPLIT).map((s) => s.trim()).filter((s) => s.length > 0).length,
  );
  const oneSentenceParagraphs = paragraphSentenceCounts.filter((n) => n === 1).length;

  // ── 极短句连排
  // 对话天生就短。「后来呢？」「后来打折了腿了。」这样的问答连着六句都不到
  // 十个字，那是两个人在说话，不是把叙述切碎了。所以只统计叙述句——以引号
  // 起头的句子跳过，不计数也不算打断（它既不是长句也不构成碎片串）。
  // 切句只在句末标点处切，所以对话里「怎样？」后面的「」「后来呢？」会以
  // 闭引号起头——那也是对话，闭引号和开引号一样要认。
  const isDialogueSentence = (i) => /^[「『“"」』”"]/.test(rawSentences[i].trim());
  let maxConsecutiveShort = 0;
  let currentShortStart = -1;
  let longestShortRun = { start: -1, length: 0 };
  for (let i = 0; i < sentenceLengths.length; i += 1) {
    if (isDialogueSentence(i)) continue;
    if (sentenceLengths[i] < SHORT_SENTENCE_MAX) {
      if (currentShortStart < 0) currentShortStart = i;
      const run = i - currentShortStart + 1;
      if (run > longestShortRun.length) longestShortRun = { start: currentShortStart, length: run };
      maxConsecutiveShort = Math.max(maxConsecutiveShort, run);
    } else {
      currentShortStart = -1;
    }
  }

  // ── 主语重复：连续几句都由同一个代词开头
  // 只数「短句」连排。九十多字一句、连着三句「我……」是叙述节奏，不是机械排比——
  // 2026-11 用人民日报副刊一篇散文（平均 90.7 字一句，连三句以「我」开头）
  // 验证过：那 14 分是误报。短句连着同主语开头，才是需要改的排比腔。
  let maxConsecutiveSameSubject = 0;
  let subjectRun = 0;
  let subjectRunStart = 0;
  let lastSubject = null;
  let longestSubjectRun = { start: -1, length: 0 };
  for (let i = 0; i < rawSentences.length; i += 1) {
    const match = rawSentences[i].match(SUBJECT_RE);
    const subject = match ? match[1] : null;
    const shortEnough = rawSentences[i].replace(PUNCT_RE, '').length <= SUBJECT_RUN_MAX_CHARS;
    if (subject && subject === lastSubject && shortEnough) {
      subjectRun += 1;
    } else if (subject && shortEnough) {
      subjectRun = 1;
      subjectRunStart = i;
    } else {
      subjectRun = 0;
    }
    lastSubject = subject;
    if (subjectRun > longestSubjectRun.length) {
      longestSubjectRun = { start: subjectRunStart, length: subjectRun };
    }
    maxConsecutiveSameSubject = Math.max(maxConsecutiveSameSubject, subjectRun);
  }

  const per1000 = (n) => (chars > 0 ? (n / chars) * 1000 : 0);

  return {
    chars,
    sentences: rawSentences.length,
    paragraphs: rawParagraphs.length,
    sentenceList: rawSentences,
    sentenceLengths,
    paragraphLengths,
    paragraphSentenceCounts,
    avgSentenceLength: sentenceLengths.length
      ? Number((sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length).toFixed(1))
      : 0,
    maxSentenceLength: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
    minSentenceLength: sentenceLengths.length ? Math.min(...sentenceLengths) : 0,
    sentenceCv: coefficientOfVariation(sentenceLengths),
    avgParagraphLength: paragraphLengths.length
      ? Number((paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length).toFixed(1))
      : 0,
    paragraphCv: coefficientOfVariation(paragraphLengths),
    dePer1000: Number(per1000(deCount).toFixed(1)),
    anchorsPer1000: Number(per1000(anchors).toFixed(1)),
    anchorCount: anchors,
    colloquialPer1000: Number(per1000(colloquial).toFixed(1)),
    firstPersonPer1000: Number(per1000(firstPerson).toFixed(1)),
    digitCount: digits,
    commaCount,
    periodCount,
    commaPeriodRatio,
    oneSentenceParagraphs,
    oneSentenceParagraphRatio: rawParagraphs.length
      ? Number((oneSentenceParagraphs / rawParagraphs.length).toFixed(2))
      : 0,
    shortSentenceCount: sentenceLengths.filter((n) => n < SHORT_SENTENCE_MAX).length,
    maxConsecutiveShort,
    longestShortRun,
    maxConsecutiveSameSubject,
    longestSubjectRun,
    longSentences: rawSentences.map((_, i) => i).filter(isLongSentence).length,
    veryLongSentences: rawSentences.map((_, i) => i).filter(isVeryLongSentence).length,
    duplicatePairs: detectDuplicatePassages(rawSentences),
  };
}

/**
 * 成段重复检测。
 *
 * 做法：把每句归一化（去标点空白），在够长的句子上滑一个固定窗口，
 * 同一个窗口片段出现在两个不同句子里就判为重复。
 *
 * 为什么不用完全相等匹配：拼接出来的重复段落通常有细微差异——
 * 空格、半角标点、个别字不同（「2026年09月24日」和「2026-09-24」）。
 * 一旦有差异，逐字比对就漏了。窗口匹配能容忍这些。
 *
 * 为什么按「句子组」而不是「句对」输出：
 * 早先的版本对每个片段的两组句子做笛卡尔积，句数一多就是 O(N²)。
 * 实测 5 万字高度重复的文本要跑 6.9 秒（产出 138 万个句对），
 * 20 万字直接把 V8 的 Set 撑爆，抛 RangeError。
 * 现在改成：每个片段最多记 MAX_BUCKET 个句子，同一个句子组只记一次，
 * 每组只输出一对代表。建索引是线性的，输出有硬上限。
 *
 * 局限：超过 MAX_BUCKET 句共享同一片段的极端重复文本，只会报组数不精确，
 * 但不会再崩溃——那种文本本来也不需要精确报第几句。
 */
/**
 * 从共享片段向两侧扩，得到这两句真正共有的最长连续内容。
 *
 * 不这么做的话，18 字片段除以整句长度，永远算不出两句整句相同——
 * 37 字的两句一字不差，覆盖率也只有 18/37 = 0.49，直接被当成「只是共用了套语」。
 * 反过来，七十字的公文句子共用二十字套语，真实覆盖率 0.29，扩到最长也还是 0.29。
 * 用的是同一个量，只是这次量的是「共有内容到底有多长」，而不是「随便截的那十八个字」。
 */
function sharedRunLength(a, b, fragment) {
  const ai = a.indexOf(fragment);
  const bi = b.indexOf(fragment);
  if (ai === -1 || bi === -1) return fragment.length;
  let left = 0;
  while (ai - left > 0 && bi - left > 0 && a[ai - left - 1] === b[bi - left - 1]) left += 1;
  let right = fragment.length;
  while (ai + right < a.length && bi + right < b.length && a[ai + right] === b[bi + right]) right += 1;
  return left + right;
}

function detectDuplicatePassages(sentenceList, windowSize = 18) {
  const MAX_BUCKET = 200; // 单个片段最多记多少个句子
  const MAX_GROUPS = 200; // 最多输出多少组
  const MIN_COVERAGE = 0.5; // 共用片段至少要占较短那句的一半
  // 两句长度差太远的，不是复读，是「纲要 + 展开」或「标题 + 正文」。
  // 实测 48 份语料里 4 组重复对，长度比是 0.20 / 0.30 / 0.89 / 1.00：
  // 前两组是列表项与它的展开段、文章标题与小标题，后两组才是真的说了两遍。
  // 真正的复读是同一段内容被说了两次，两句长度自然接近。
  const MIN_LENGTH_RATIO = 0.5;

  // 去标点后的内容与长度，覆盖率判定要用，先算一遍存着
  const plains = sentenceList.map((s) => s.replace(PUNCT_RE, ''));
  const plainLengths = plains.map((s) => s.length);

  const index = new Map(); // 片段 -> 句子下标数组（保持插入顺序，天然递增）

  for (let i = 0; i < sentenceList.length; i += 1) {
    const text = sentenceList[i].replace(PUNCT_RE, '');
    if (text.length < windowSize) continue;
    for (let j = 0; j + windowSize <= text.length; j += 1) {
      const fragment = text.slice(j, j + windowSize);
      const bucket = index.get(fragment);
      if (!bucket) {
        index.set(fragment, [i]);
      } else if (bucket.length < MAX_BUCKET && bucket[bucket.length - 1] !== i) {
        bucket.push(i);
      }
    }
  }

  const groups = new Map(); // 句子组签名 -> 代表句对
  for (const [fragment, bucket] of index) {
    if (bucket.length < 2) continue;
    const signature = bucket.join(',');
    if (groups.has(signature)) continue;

    // 光有 18 字相同还不够。公文、公告、报告里有大量固定搭配
    // （「持续深入推进」「以…为核心的党中央团结带领…」），
    // 两句共享一段套语、其余部分毫不相干，那不是复读。
    // 复读的特征是这段相同的内容占掉了句子的大半。
    let best = null;
    let bestCoverage = 0;
    for (let k = 1; k < bucket.length; k += 1) {
      const shorter = Math.min(plainLengths[bucket[0]], plainLengths[bucket[k]]);
      const longer = Math.max(plainLengths[bucket[0]], plainLengths[bucket[k]]);
      if (shorter === 0 || longer === 0) continue;
      if (shorter / longer < MIN_LENGTH_RATIO) continue;
      const run = sharedRunLength(plains[bucket[0]], plains[bucket[k]], fragment);
      // 一句把另一句整个复述一遍、再往后补一段，那是复沓，不是复读。
      // 《雪中悍刀行》里「…却有着自己的情怀。」下一句又全引一遍再加
      // 「如一坛子尘封许多许多年的老酒」——这是章法，不是作者忘了自己写过。
      // 只有两句一样长（或几乎一样）时，才算真的说了两遍。
      if (run >= shorter && longer > shorter) continue;
      const coverage = run / shorter;
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        best = [bucket[0], bucket[k]];
      }
    }
    if (best && bestCoverage >= MIN_COVERAGE) {
      groups.set(signature, best);
    }
    if (groups.size >= MAX_GROUPS) break;
  }

  return [...groups.values()];
}

/**
 * 引号内的内容遮蔽。
 *
 * 写分析文章时经常会引用「值得注意的是」这类套话当例子——引用不是使用。
 * 不遮蔽的话，一篇讨论套话的文章会被自己引用的例子判成套话，这是最冤的误报。
 *
 * 用等长空格替换，位置和行号都不变，命中样本还能定位回原文。
 *
 * 但如果引号内容占比很高（对话体小说），说明引号是正文主体，就不能遮蔽，
 * 否则整段对话里的规则全部失效。
 */
function maskQuoted(text) {
  let quotedLen = 0;
  let masked = text;
  const pairs = [
    ['「', '」'],
    ['『', '』'],
    ['“', '”'],
    ['"', '"'],
  ];
  for (const [open, close] of pairs) {
    const re = new RegExp(`${open}[^${close}\\n]{1,200}${close}`, 'g');
    masked = masked.replace(re, (match) => {
      quotedLen += match.length - 2;
      return open + ' '.repeat(match.length - 2) + close;
    });
  }
  const ratio = text.length > 0 ? quotedLen / text.length : 0;
  return { masked, ratio };
}

/**
 * 长文里找「局部特别密」的段落。
 *
 * 密度判据算的是全文每千字多少处，这对整篇是公平的，对局部不公平：
 * 三千字里夹着三百字全是黑话，按全文算每千字不到一处，规则一条都不报。
 * 可用户要改的恰恰是那三百字。
 *
 * 这里的做法和评分脱钩——**只定位，不扣分**。评分仍按全文算，因为文体校准
 * 就是按全文统计的（试过按块改评分，政府工作报告从 5 分涨到 37 分，
 * 掘金技术文从 1 分涨到 26 分，真人稿全被误伤）。定位则没有这个问题：
 * 说「第 X 段比全文平均密三倍」是事实描述，不需要跨文体校准。
 */
const LOCAL_MIN_CHARS = 5000;
const LOCAL_RATIO = 2.5;
const LOCAL_MIN_HITS = 3;

function findLocalHotspots(text, rules, stats) {
  if (stats.chars < LOCAL_MIN_CHARS) return [];
  const lines = text.split('\n');
  const contentPrefix = [0];
  for (let i = 1; i <= lines.length; i += 1) {
    contentPrefix[i] = contentPrefix[i - 1] + (lines[i - 1].trim().length > 0 ? 1 : 0);
  }
  const paragraphOfLine = (line) =>
    contentPrefix[Math.min(Math.max(0, line), contentPrefix.length - 1)];
  const perPara = new Map();
  let total = 0;
  for (const rule of rules) {
    if (rule.mode !== 'density' || !rule.re) continue;
    if (rule.signal === 'style' || rule.signal === 'error') continue;
    for (const h of countMatches(rule.re, text)) {
      const p = paragraphOfLine(lineOf(text, h.index));
      perPara.set(p, (perPara.get(p) || 0) + 1);
      total += 1;
    }
  }
  const paraCount = contentPrefix[contentPrefix.length - 1];
  if (paraCount < 4 || total === 0) return [];
  const avg = total / paraCount;
  const out = [];
  for (const [paragraph, hits] of perPara) {
    if (hits >= LOCAL_MIN_HITS && hits >= avg * LOCAL_RATIO) out.push({ paragraph, hits });
  }
  out.sort((a, b) => b.hits - a.hits || a.paragraph - b.paragraph);
  return out.slice(0, 3).map((h) => ({ ...h, avg: Number(avg.toFixed(1)) }));
}

/**
 * 应用规则，收集命中。
 */
function collectFindings(text, stats, rules, genre) {
  const findings = [];
  const chars = stats.chars || 1;

  for (const rule of rules) {
    if (!rule.re) continue;
    let hits = countMatches(rule.re, text);
    if (hits.length === 0) continue;
    // 有些词是别人家的正常组成部分：「落地窗」不是黑话「落地」，「出发点」也不是
    // 「出发」加个点。规则里用 excludeAfter 列出「紧跟这些字时不算数」，比把词从
    // 词表里删掉精确（删了黑话本身也就漏了），比给每个词单写一条正则省事。
    if (rule.excludeAfter && rule.excludeAfter.length) {
      const excluded = rule.excludeAfter;
      hits = hits.filter((h) => !excluded.includes(text[h.index + h.text.length]));
    }
    if (hits.length === 0) continue;
    // 有些句型本身是中性的，要看里面填的是不是真东西。「从产品设计到用户运营，
    // 从技术架构到市场推广」是拿抽象概念摆架子，「从 11 步砍到 4 步」是真对比，
    // 一个句型两种命运。填了数字的放过。
    if (rule.requireNoDigit) {
      hits = hits.filter((h) => !/\d/.test(h.text));
    }
    if (hits.length === 0) continue;

    const mode = rule.mode || 'hit';
    const density = (hits.length / chars) * 1000;

    if (mode === 'density') {
      // 同一个手法在不同文体里的合理密度不一样：口播稿的破折号比技术文档多，
      // 技术文档的「方法论」也不算黑话。规则可以按文体给单独门槛。
      const threshold = rule.genreThresholds?.[genre] ?? rule.threshold ?? 1;
      if (density <= threshold) continue;
    }

    const samples = [];
    const seen = new Set();
    for (const hit of hits) {
      const key = `${hit.index}:${hit.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const correction = rule.corrections?.get(hit.text);
      samples.push({
        text: hit.text,
        // 有明确改正建议时（错别字），把建议挂在样本上，报告里逐条标出
        note: correction ? `「${hit.text}」→「${correction}」` : undefined,
        line: lineOf(text, hit.index),
        context: excerpt(text, hit.index, hit.text.length),
      });
      if (samples.length >= 4) break;
    }

    findings.push({
      id: rule.id,
      cat: rule.cat,
      sev: rule.sev,
      severity: SEVERITY_LABEL[rule.sev] || '',
      // 归因强度：这条命中到底说明什么（模板腔／修辞习惯／排版口味／用字错误）
      signal: rule.signal || 'template',
      label: rule.label,
      why: rule.why,
      fix: rule.fix,
      mode,
      count: hits.length,
      density: Number(density.toFixed(2)),
      threshold: rule.threshold,
      samples,
      // 全部命中的行号。samples 最多留四条，够人看，不够做统计——
      // 「问题集中在哪一段」需要完整的命中位置，不能只数可见样本。
      hitLines: hits.map((h) => lineOf(text, h.index)),
    });
  }

  findings.sort((a, b) => b.sev - a.sev || b.count - a.count || a.id.localeCompare(b.id));
  return findings;
}

/**
 * 节奏诊断。
 *
 * 为什么单独一条路径：正则能抓"值得注意的是"这种词，抓不到"断句离谱"，
 * 因为那是分布问题不是词汇问题。
 *
 * 这里做的是双向判断——既报"句子被切碎"，也报"句子长度过于整齐"。
 * 一个只会喊"拆短句"的检查器，本身就会把中文写坏。
 */
function analyzeRhythm(stats, genre) {
  const profile = RHYTHM_PROFILES[genre] || DEFAULT_RHYTHM_PROFILE;
  const out = [];
  if (stats.sentences < 6) return out;

  const sampleOf = (start, length, note) => {
    if (start < 0 || length <= 0) return [];
    const slice = stats.sentenceList.slice(start, start + length).join('');
    if (!slice.trim()) return [];
    return [{ note, line: 0, context: slice.length > 90 ? `${slice.slice(0, 90)}…` : slice }];
  };

  const push = (key, count, samples, detail) => {
    const meta = RHYTHM_RULES[key];
    if (!meta) return;
    out.push({
      id: meta.id,
      cat: meta.cat,
      sev: meta.sev,
      severity: SEVERITY_LABEL[meta.sev] || '',
      // 节奏类默认按分布问题计分；标了 signal 的（比如「重复段落」）另行处理
      signal: meta.signal,
      label: meta.label,
      why: meta.why,
      fix: meta.fix,
      mode: 'rhythm',
      count,
      density: 0,
      threshold: undefined,
      detail,
      samples,
    });
  };

  // 碎片化要两个条件同时成立：几乎不用逗号，而且短句成串。
  // 只看逗号比会误伤短句名家——汪曾祺的逗号就比句号少。
  const shortRunTooLong = stats.maxConsecutiveShort > profile.maxConsecutiveShort;
  const commaStarved = stats.commaPeriodRatio < profile.minCommaRatio;
  const fragmented = stats.sentences >= 10 && commaStarved && shortRunTooLong;

  if (fragmented) {
    push(
      'fragmented',
      stats.sentences,
      sampleOf(stats.longestShortRun.start, Math.min(stats.longestShortRun.length, 4), '连续短句，本该合起来'),
      `逗号／句号比 ${stats.commaPeriodRatio}（该文体参考 ${profile.minCommaRatio} 以上），且最长连续 ${
        stats.maxConsecutiveShort
      } 个短句`,
    );
  }

  // 平均句长只在够长的样本里才有意义，短篇的平均值不稳定，容易误判。
  if (stats.sentences >= 12 && stats.avgSentenceLength < profile.minAvgSentence) {
    push(
      'tooShort',
      stats.sentences,
      [],
      `平均 ${stats.avgSentenceLength} 字一句，该文体下限约 ${profile.minAvgSentence} 字`,
    );
  }

  if (stats.paragraphs >= 5 && stats.oneSentenceParagraphRatio > profile.maxOneSentenceParagraph) {
    push(
      'oneSentenceParagraph',
      stats.oneSentenceParagraphs,
      [],
      `${stats.oneSentenceParagraphs} / ${stats.paragraphs} 段只有一句话`,
    );
  }

  // 已经被 fragmented 报过的连续短句不再重复计分。
  if (shortRunTooLong && !fragmented) {
    push(
      'consecutiveShort',
      stats.maxConsecutiveShort,
      sampleOf(
        stats.longestShortRun.start,
        Math.min(stats.longestShortRun.length, 4),
        `连续 ${stats.maxConsecutiveShort} 个短句`,
      ),
      `最长连续 ${stats.maxConsecutiveShort} 个短句，该文体上限 ${profile.maxConsecutiveShort} 个`,
    );
  }

  // 口语里反复点名主语是必要的清晰，不是啰嗦——声音线性播放，听的人回看不到上一句。
  // 所以门槛按文体走：口播稿放到 8，书面语仍是 3。
  const maxSameSubject = profile.maxConsecutiveSameSubject ?? 3;
  if (stats.maxConsecutiveSameSubject >= maxSameSubject) {
    push(
      'subjectRepeat',
      stats.maxConsecutiveSameSubject,
      sampleOf(
        stats.longestSubjectRun.start,
        Math.min(stats.longestSubjectRun.length, 4),
        '同一主语连续起头',
      ),
      `连续 ${stats.maxConsecutiveSameSubject} 句由同一主语开头，中文可以承前省略`,
    );
  }

  // 只有平均句长不短的时候，"长度整齐"才说明是欧化而不是碎片化——
  // 碎片的整齐已经由上面两条抓过了，避免重复计分。
  //
  // 句数门槛给到 20：句长变异系数是统计量，样本少于二十句时它自己就不稳。
  // 新华社那类消息稿只有十来句，CV 偶尔会掉到 0.35 附近，可它是规整，
  // 不是每句都写成一样长。用十来句的样本来下"句子太整齐"的判断，
  // 判错的机会比判对的机会大。
  if (
    stats.sentences >= 20 &&
    stats.sentenceCv !== null &&
    stats.sentenceCv < 0.35 &&
    stats.avgSentenceLength >= profile.minAvgSentence
  ) {
    push('uniformLong', stats.sentences, [], `句长变异系数 ${stats.sentenceCv.toFixed(2)}，人写的通常 0.4 以上`);
  }

  // 成段重复：留几处样本，让人能直接对照着看。
  //
  // 报纸体例里，开头两句导语和正文重复是常态（提要栏 + 正文展开），
  // 那不是 AI 复读。公众号推文同理——开头先把整篇的结论撂一句，
  // 底下再从头讲。让 news / commentary / business / media 豁免
  // 「开头 vs 后面」这一种重复对，其余位置照报。
  const HEADLINE_GENRES = new Set(['news', 'commentary', 'business', 'media']);
  const headlineCount = Math.min(3, Math.floor(stats.sentences * 0.1) + 1);
  const duplicatePairs = HEADLINE_GENRES.has(genre)
    ? stats.duplicatePairs.filter(([a, b]) => !(a < headlineCount && b >= headlineCount))
    : stats.duplicatePairs;
  if (duplicatePairs.length > 0) {
    const samples = duplicatePairs.slice(0, 3).map(([a, b]) => {
      const text = stats.sentenceList[a] || '';
      return {
        note: `第 ${a + 1} 句与第 ${b + 1} 句`,
        line: 0,
        context: text.length > 70 ? `${text.slice(0, 70)}…` : text,
      };
    });
    push(
      'duplicatePassage',
      duplicatePairs.length,
      samples,
      `${duplicatePairs.length} 组句子在不同位置重复了同一段内容`,
    );
  }

  return out;
}

/**
 * 预期会有「人声」的文体。
 *
 * 新闻、财经、报告、学术要求客观中立，「通篇没有我」是规范不是缺点；
 * 反过来，日常对话和评论如果通篇没有个人视角，那才说明文字是空的。
 * 拿同一个标准去量这两类，必然误伤一半。
 */
const VOICE_EXPECTED_GENRES = new Set(['general', 'media', 'script', 'commentary']);

/**
 * 评分。规则分 + 节奏分 + 结构性指标分，全部可追溯。
 */
function scoreFindings(findings, stats, genre, cjkRatio = 1) {
  const breakdown = [];
  let total = 0;

  for (const f of findings) {
    // 用字错误和排版口味不进模板腔分数。
    // 错别字和「的／地」误用是客观错误，跟「像不像机器写的」无关——
    // 谁写的都该改，那是另一本账。混在一起会让分数彻底失去意义。
    if (f.signal === 'error' || f.signal === 'style') continue;

    let points;
    if (f.mode === 'density') {
      // 密度到阈值的两倍算满，原来是一倍。
      // 改成两倍是因为「刚好超线」和「一篇稿子里十处黑话」不该同分——
      // 一份 481 字的方案稿里出现 10 次营销黑话（20.8/千字，阈值 1.5），
      // 原来和只超一点点拿一样的 8 分，结果整篇判成 A 级。
      //
      // 试过把封顶从两倍放到八倍，方向是错的：AI 稿全降、真人稿反而涨。
      // 因为真人也写高密度文本（新闻通稿的「负责人表示」、财经稿的黑话），
      // 放大高 over 区间等于放大真人的真实特征。并列的问题交给排序解决，
      // 不靠抬分。over 存下来给报告排序用。
      const over = Math.max(0, f.density / (f.threshold || 1) - 1);
      // 次数因子只在短文本上生效。
      // 密度是「每千字几处」，21 字的稿子里冒一句「值得注意的是」，密度 47.6/千字，
      // 是阈值的 24 倍，和 500 字里刷五次拿一样的分。但一次就是一次。
      // 字数上来以后密度本身就是可靠的，不该再乘次数打折——
      // 一稿的 AI 味常常是十几类各出现一次，按次数打折会把这类正确的命中一起压下去。
      const countFactor = stats.chars >= 300 ? 1 : Math.min(1, f.count / 2);
      points = f.sev * 4 * clamp(over, 0, 2) * countFactor;
      f.over = Number((f.density / (f.threshold || 1)).toFixed(1));
    } else if (f.mode === 'rhythm') {
      // 节奏是全局性问题：套话删几个词就行，碎片化要重组全文。
      // 所以权重明显高于词汇类规则，且不按命中次数放大（长文不该被一票否决）。
      points = f.sev * 7;
    } else {
      // 出现即问题的规则（空泛背景、升华结尾、翻译腔、「的」字长链）。
      // 单次基础分用 sev * 3：原来 sev * 1.6 时，40 字的稿子里冒出一句
      // 「在当今数字化浪潮下」只扣 4.8 分，同一个位置换成一条密度规则能扣 16 分。
      // 两类规则的量级差五倍没有道理——它们都是「出现一次就该删」。
      // 上限仍按 sev * 4 封住，避免长文里一票否决。
      const cap = f.sev * 4; // sev3 上限 12，sev2 上限 8，sev1 上限 4
      points = Math.min(cap, f.sev * 3 * Math.min(f.count, 5));
    }
    points = Number(points.toFixed(1));
    if (points <= 0) continue;
    total += points;
    // 存回命中的这一条上：报告要按扣分从多到少排序，
    // 告诉改稿人「先把哪几条改掉」。算完就丢的话还得重算一遍。
    f.points = points;
    breakdown.push({ source: f.label, points });
  }

  const structural = [];
  const add = (label, points, detail) => {
    if (points <= 0) return;
    total += points;
    structural.push({ source: label, points: Number(points.toFixed(1)), detail });
  };

  // 中英混排文本里，句长会被英文句法带偏，锚点会被外文专名带偏，
  // 口语词表更是纯中文的。这几项只在中文占绝大多数时才计分。
  const charsetReliable = cjkRatio >= CJK_CLEAN_RATIO;

  if (stats.chars >= 120) {
    // 这里原来有一条「段落长度过于均匀」（段长变异系数 < 0.32 扣 7 分）。
    // 2026-11 取证时对 33 份语料实测，这条判据不成立，已删除：
    //   8 份模型稿只抓到 2 份；21 份真人稿和改写稿误伤 2 份。
    // 最直接的反证是一对样本——新华网消息稿（人写，5 段，CV 0.22）和
    // AI 默认新闻稿（5 段，CV 0.19），段落结构几乎一样，靠段长根本分不开。
    // 反过来，AI 稿里段落最不齐的几份（ai-commentary ±20% 占比 0.00、
    // ai-proposal 0.13、ai-fiction 0.14）永远不会被这条抓到。
    // 而且它只在 4–7 段时触发，段数一多（>=8）从不命中——等于在变异系数
    // 本身最不稳的区间里判案，和 rhythm-uniform-long 当初从 8 句提到 20 句
    // 是同一个教训。段长不整齐这件事仍然有用，但它是「不要改坏」的证据
    // （见 content.js 的 buildKeeps），不是「写坏了」的证据。
    // 句长是否整齐、是否碎成短句流，仍由 analyzeRhythm 统一判定，
    // 这里不重复计分——同一个毛病扣两次会把分数打穿。
    if (stats.dePer1000 > 55) {
      add('「的」字密度偏高', stats.dePer1000 > 75 ? 8 : 5, `每千字 ${stats.dePer1000} 个「的」`);
    }
    if (charsetReliable) {
      // 长句本身不是罪。只有明显偏向欧化长句时才提示，而且权重低于碎片化——
      // 「一律拆短」正是要治的病。
      // 关键是逗号：九十多字一句、中间带四五个逗号，那是流水句，中文的常态；
      // 九十多字一句只有一两个逗号，才是定语堆叠的欧化长句。
      // 2026-11 加了这条门槛：人民日报副刊一篇散文平均 90.7 字一句、逗号句号比
      // 4.19，按原来的判据要扣 12 分，但它是鲁迅文学奖得主的写法，不是毛病。
      const flowing = stats.commaPeriodRatio >= 3;
      if (stats.avgSentenceLength > 55 && !flowing) {
        add(
          '句子普遍过长',
          stats.avgSentenceLength > 80 ? 8 : 5,
          `平均 ${stats.avgSentenceLength} 字一句，逗号又少（每句 ${stats.commaPeriodRatio} 个）——注意是不是定语堆叠的欧化长句`,
        );
      }
      if (stats.anchorsPer1000 < 3) {
        add('缺少具体信息锚点', stats.anchorsPer1000 < 1 ? 10 : 6, `每千字只有 ${stats.anchorsPer1000} 处数字／引语／时间`);
      }
      if (
        VOICE_EXPECTED_GENRES.has(genre) &&
        stats.colloquialPer1000 < 1.5 &&
        stats.firstPersonPer1000 < 1
      ) {
        add('没有口语与个人视角', 6, '通篇没有语气词，也没有「我」');
      }
      if (stats.longSentences > 0 && stats.sentences >= 5 && !flowing) {
        const ratio = stats.longSentences / stats.sentences;
        if (ratio > 0.25) add('超长句占比过高', 4, `${stats.longSentences} 句超过 ${LONG_SENTENCE_MIN} 字，占 ${Math.round(ratio * 100)}%，逗号又少`);
      }
    }
  }

  // 分数封顶 100 是必须的，但内部累计不截断——原始分要传出去。
  // 一篇 87 分和一篇 130 分的稿子都是 E 级，改法一样，但「爆表多少」
  // 是给改稿人看的：87 分还能挑着改，130 分就别挑了，重写。
  const rawScore = Math.round(total);
  total = clamp(rawScore, 0, 100);
  return { score: total, rawScore, breakdown: [...breakdown, ...structural] };
}

function gradeOf(score) {
  if (score < 20) return { grade: 'A', text: '几乎没有模板痕迹' };
  if (score < 40) return { grade: 'B', text: '有几处模板化写法，改掉就行' };
  if (score < 60) return { grade: 'C', text: '模板痕迹明显，需要动结构' };
  if (score < 80) return { grade: 'D', text: '大量模板化写法，建议整段重写' };
  return { grade: 'E', text: '通篇是模板，重写比修改划算' };
}

/**
 * 主入口。
 *
 * @param {string} text 待分析的中文文本
 * @param {{ locale?: string, genre?: string, customBannedWords?: string[] }} [options]
 *   genre 决定节奏判定的阈值——口播稿天然短，报告天然克制，不能用一把尺子。
 */
export function scanText(text, options = {}) {
  const source = typeof text === 'string' ? text : String(text ?? '');
  const trimmed = source.trim();
  const locale = options.locale || 'zh-CN';
  // 不认识的文体回落 general。原样传出去会让报告标题写「文体「xxx」」，
  // 实际用的却是 general 的画像——说一套做一套。
  const genre = GENRE_IDS.includes(options.genre) ? options.genre : 'general';

  const empty = {
    ok: false,
    chars: 0,
    stats: null,
    findings: [],
    score: 0,
    grade: 'A',
    gradeText: '没有内容可分析',
    breakdown: [],
    categorySummary: [],
    tooShort: true,
    locale,
    genre,
  };

  if (trimmed.length === 0) {
    return { ...empty, reason: '输入为空' };
  }

  // 先把语言判了。这套规则的每一条——句子怎么断、什么叫「的」太多、
  // 什么算口语——都建立在中文上。拿它去量英文或日文，出来的分数是噪声。
  const { cjkRatio, kanaRatio } = measureCjk(trimmed);
  if (kanaRatio >= KANA_MIN_RATIO) {
    return {
      ...empty,
      reason: `这更像是日文（假名占 ${Math.round(kanaRatio * 100)}%）。中文语感指标对它不适用。`,
    };
  }
  if (cjkRatio < CJK_MIN_RATIO) {
    return {
      ...empty,
      reason: `中文字符只占 ${Math.round(cjkRatio * 100)}% 左右。这套规则衡量的是中文语感，对非中文文本下判断没有意义。`,
    };
  }

  const customRules = buildCustomRules(options.customBannedWords);
  const rules = [
    ...RULES.filter((r) => {
      // 港台用词检查只对大陆语区有意义
      if (r.id === 'locale-tw') return locale === 'zh-CN';
      // 有些规则只适用于特定文体（比如「情绪直陈」只对小说类有意义）
      if (r.genres && !r.genres.includes(genre)) return false;
      // 反过来，有些写法在特定文体里是标准格式，不是毛病
      if (r.exceptGenres && r.exceptGenres.includes(genre)) return false;
      return true;
    }),
    ...customRules,
  ];

  const stats = analyzeStats(trimmed);

  // 引号内容遮蔽：引用不是使用。讨论套话的文章不该被自己引用的例子判成套话。
  // 但对话体里引号是正文主体，占比过高时不能遮蔽。
  const { masked, ratio: quotedRatio } = maskQuoted(trimmed);
  const scanTarget = quotedRatio > 0.4 ? trimmed : masked;

  const findings = [
    ...collectFindings(scanTarget, stats, rules, genre),
    ...analyzeRhythm(stats, genre),
  ].sort((a, b) => b.sev - a.sev || b.count - a.count || a.id.localeCompare(b.id));
  const { score, rawScore, breakdown } = scoreFindings(findings, stats, genre, cjkRatio);
  const { grade, text: gradeText } = gradeOf(score);

  // 同一段文本换个体文体判定，节奏扣分会差多少。
  // 用途：文体选错是这套规则最容易产生误判的地方（一次一句一段的排版，
  // 按出版小说算要扣分，按财经稿算完全正常）。把差异摆出来让使用者自己判断，
  // 比让插件猜一个文体更诚实。
  const rhythmPenaltyByGenre = {};
  for (const candidate of Object.keys(RHYTHM_PROFILES)) {
    rhythmPenaltyByGenre[candidate] = analyzeRhythm(stats, candidate)
      .filter((f) => !f.signal)
      .reduce((sum, f) => sum + f.sev * 7, 0); // 与 scoreFindings 中 rhythm 的计分一致
  }

  const byCat = new Map();
  for (const f of findings) {
    const entry = byCat.get(f.cat) || { cat: f.cat, count: 0, rules: 0, maxSev: 0 };
    entry.count += f.count;
    entry.rules += 1;
    entry.maxSev = Math.max(entry.maxSev, f.sev);
    byCat.set(f.cat, entry);
  }

  // ── 命中落在哪几段
  //
  // 一份三千字的稿子，知道「命中十二类」没用，得知道先改哪几段。
  // 段落按非空行算（analyzeStats 用 \n+ 切段，一个非空行就是一段），
  // 用前缀和把行号换成段号，O(1) 一次。
  //
  // 只统计会扣分的那两类（去掉用字错误和排版建议）：这两类多但分散，
  // 混进来会把「哪段问题最大」算成一锅粥。
  const lineHasContent = trimmed.split('\n').map((line) => line.trim().length > 0);
  const contentPrefix = [0];
  for (const hasContent of lineHasContent) {
    contentPrefix.push(contentPrefix[contentPrefix.length - 1] + (hasContent ? 1 : 0));
  }
  const paragraphOfLine = (line) =>
    contentPrefix[Math.min(Math.max(0, line), contentPrefix.length - 1)];

  const paragraphHits = [];
  {
    const buckets = new Map();
    for (const f of findings) {
      if (f.signal === 'error' || f.signal === 'style') continue;
      for (const line of f.hitLines || []) {
        const para = paragraphOfLine(line);
        if (para < 1) continue;
        const entry = buckets.get(para) || { paragraph: para, ids: new Set(), count: 0 };
        entry.ids.add(f.id);
        entry.count += 1;
        buckets.set(para, entry);
      }
    }
    for (const entry of buckets.values()) {
      paragraphHits.push({
        paragraph: entry.paragraph,
        rules: entry.ids.size,
        hits: entry.count,
      });
    }
    // 先比命中的类目数，再比命中次数：一段里套话刷屏但只有一类，
    // 不如一段里五种毛病各来一处值得先动。
    paragraphHits.sort((a, b) => b.rules - a.rules || b.hits - a.hits || a.paragraph - b.paragraph);
  }

  // 短文本只查得到用词和句式。把「没查什么」直接说出来——否则用户看到
  // 十二分 A 级会以为这段干净，实际上只是能查的项目更少。
  const blindSpots = [];
  // 结构性判据（句长、信息密度、口吻）整体挂在 stats.chars >= 120 这个门槛上，
  // 之前这里没写——结果是六十来字的稿子报「0 分 A 级」，却不告诉你句长根本没查。
  if (stats.chars < TINY_CHARS) blindSpots.push('句子本身的检查（太短了，连一句都不完整）');
  if (stats.chars < 120) blindSpots.push('句长与信息密度检查（要 120 字以上）');
  if (stats.sentences < 6) blindSpots.push('节奏和重复检查（要六句以上才跑得起来）');
  if (stats.paragraphs < 3) blindSpots.push('段落结构检查（要三段以上）');
  // 密度类规则算的是全文每千字多少处。这个口径对整篇稿子是公平的，
  // 但对局部不公平：三千字里夹着三百字全是黑话，按全文算不到一处。
  // 试过按块取最狠的一段去扣分，结果真人公文和真技术文档全被误伤——
  // 文体校准本来就是按全文统计的，分块等于把这个校准拆了。
  // 所以定位和评分分开：评分不动，另外把密的段落指出来。
  const localHotspots = findLocalHotspots(scanTarget, rules, stats);
  if (stats.chars > 5000 && localHotspots.length === 0) {
    blindSpots.push('局部集中的问题（密度按全文算，某一段特别密会被平均掉；要抓这一段就单独扫它）');
  }

  // 同样四十分，改法可能完全不同：换词、挪位置、还是重排句子。
  // 不把这一层说出来，用户看到一堆命中项只会觉得「哪儿都不对」。
  const layerTotals = new Map();
  for (const f of findings) {
    if (!(f.points > 0)) continue;
    const layer = layerOf(f.id);
    if (!layer) continue;
    layerTotals.set(layer, (layerTotals.get(layer) || 0) + f.points);
  }
  const layerEntries = [...layerTotals.entries()].sort((a, b) => b[1] - a[1]);
  const layerSum = layerEntries.reduce((n, [, v]) => n + v, 0);
  const layerSummary = layerEntries.map(([layer, points]) => ({
    layer,
    label: LAYER_LABEL[layer],
    points: Number(points.toFixed(1)),
    share: layerSum > 0 ? Math.round((points / layerSum) * 100) : 0,
  }));

  return {
    ok: true,
    chars: stats.chars,
    stats,
    findings,
    score,
    rawScore,
    grade,
    gradeText,
    breakdown,
    blindSpots,
    localHotspots,
    layerSummary,
    categorySummary: [...byCat.values()].sort((a, b) => b.maxSev - a.maxSev || b.count - a.count),
    paragraphHits,
    tooShort: stats.chars < 80,
    locale,
    genre,
    rhythmPenaltyByGenre,
    cjkRatio,
    charsetReliable: cjkRatio >= CJK_CLEAN_RATIO,
  };
}

export { analyzeStats, analyzeRhythm, gradeOf, maskQuoted };
