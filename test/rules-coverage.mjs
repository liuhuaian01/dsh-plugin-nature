// 规则覆盖测试 —— 每条规则至少一个「必然触发」的样本。
//
// 目的不是验证判得准不准（那是 regression.mjs 和人工看样本的事），
// 而是防止规则被改坏之后静默失效：正则写错了、词表漏了、阈值调高了，
// 表面上测试还是全绿，实际上这条规则再也不会响。
//
// 每条样本都写得尽量短，只在规则本身要求足够的句子数时才拉长
//（节奏类规则要 6 句以上，碎片化要 10 句以上）。
//
// 运行：node test/rules-coverage.mjs

import { scanText } from '../lib/scan.js';
import { RULES, RHYTHM_RULES } from '../lib/rules.js';

let failures = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? `  ← ${detail}` : ''}`);
  }
}

// 12 句短句、全用句号：同时满足碎片化（句数够、不用逗号、短句成串）
const FRAGMENTED_TEXT =
  '天亮了。他走了。雨停了。她来了。门开了。灯灭了。车走了。人散了。风起了。云散了。鸟飞了。夜来了。';

const CASES = [
  // ───────── 词表型 ─────────
  { id: 'boilerplate-connector', text: '值得注意的是，这个方案有问题。' },
  { id: 'era-backdrop', text: '在当今这个快速变化的时代，AI 正在改变一切。' },
  { id: 'elevating-ending', text: '让我们共同期待一个更美好的未来。' },
  { id: 'inflated-degree', text: '这项技术极大地提升了效率。' },
  { id: 'jargon', text: '我们要形成闭环，找到抓手，对齐颗粒度。' },
  { id: 'deverbal', text: '我们需要对方案进行讨论，再进行分析。' },
  { id: 'deverbal-inflected', text: '会上进行了讨论，之后进行了一次深入分析。' },
  { id: 'padding-adverb', text: '我们要进一步优化流程，持续推进改进。' },
  { id: 'hedge-phrase', text: '这个季度业绩有所提升。' },
  { id: 'aspect-frame', text: '在用户增长方面，我们做得不错。' },
  { id: 'self-reflect-cliche', text: '我们也清醒地认识到问题还存在。' },
  { id: 'next-stage-cliche', text: '下一阶段，我们要把成本降下来。' },
  { id: 'enumeration-tail', text: '通过加强管理、优化流程等举措，效率提升了。' },
  { id: 'around-goal', text: '围绕年初制定的目标，我们做了很多事。' },
  { id: 'emotion-cliche', text: '她望着窗外，心中思绪万千。' },
  { id: 'dramatic-pause', text: '那一刻，时间仿佛静止了。' },
  { id: 'life-philosophy', text: '生活就是这样，给了你遗憾，也给了你希望。' },
  { id: 'think-aloud', text: '这也让我们不禁思考，问题到底出在哪里。' },
  { id: 'both-reasonable', text: '这两种观点都有其合理性。' },
  { id: 'video-opening', text: '大家好，欢迎来到本期分享，今天我们来聊聊成长。' },
  { id: 'video-outro', text: '希望今天的分享对你有所帮助，我们下期再见。' },
  { id: 'vague-source', text: '相关负责人表示，下一步将继续推进。' },
  { id: 'boilerplate-success', text: '本次大会成功举办，活动圆满落幕。' },
  { id: 'article-meta', text: '本文将介绍如何使用这个工具。' },
  { id: 'relatable-opening', text: '不知道你有没有这种感觉。' },
  { id: 'news-peg', text: '最近，一则关于 AI 版权归属的新闻引发了广泛讨论。' },
  { id: 'significance-inflation', text: '本次大会为行业发展带来了新的机遇。' },
  { id: 'answer-lie-in', text: '或许，答案就在于那些无法替代的东西。' },
  { id: 'hope-inspire', text: '希望今天的分享对你有所启发。' },
  { id: 'eye-flash', text: '他抬起头，眼中闪过一丝不易察觉的复杂情绪。' },
  { id: 'lip-arc', text: '她转过身，嘴角勾起一抹淡淡的弧度。' },
  { id: 'deep-breath', text: '他不由得深吸一口气，努力让自己平静下来。' },
  { id: 'inner-monologue', text: '林越心中暗道，此人的修为至少在自己之上。' },
  { id: 'pupil-contract', text: '看到这一幕，他的瞳孔骤然收缩。' },
  { id: 'just-began', text: '他知道，属于他的时代终于要来了。而这一切，才刚刚开始。' },
  { id: 'suddenly-punct', text: '就在这时，一道寒光从身后骤然袭来。' },
  { id: 'all-different', text: '今夜之后，一切都将不同。' },
  { id: 'nominalization', text: '可操作性和必要性都很强。' },
  { id: 'translationese', text: '他在公司里扮演着重要的角色。' },
  { id: 'adjective-stack', text: '丰富的资源，独特的视角，深刻的洞察。' },
  { id: 'we-voice', text: '我们可以看到，这个方案有风险。' },
  { id: 'deliberate-balance', text: '这件事有利也有弊。' },

  // ───────── 对举句式 ─────────
  { id: 'not-but', text: '这不是技术问题，而是管理问题。' },
  { id: 'not-only', text: '他不仅聪明，而且勤奋。' },
  { id: 'both-and', text: '他既聪明又勤奋，很受欢迎。' },
  { id: 'either-or', text: '无论刮风还是下雨，都要去。' },
  { id: 'rather-than', text: '与其说他是老师，不如说他是朋友。' },
  { id: 'zhengshi', text: '正是这种坚持，才让他走到今天。' },
  { id: 'from-to-from-to', text: '从北京到上海，从广州到深圳，他跑了很多地方。' },
  { id: 'enumeration', text: '首先，要冷静。其次，要思考。最后，要行动。' },

  // ───────── 翻译腔 / 中文语感 ─────────
  { id: 'existence', text: '他作为一个榜样般的存在，影响了很多人。' },
  { id: 'passive-suo', text: '他被大家所熟知。' },
  { id: 'has-de', text: '他有着独特的气质。' },
  { id: 'de-chain', text: '一个有着丰富经验的内容运营团队的负责人的助手' },
  { id: 'redundant-conjunction', text: '因为下雨，所以我们没去。' },

  // ───────── 排版腔 / 标点 ─────────
  { id: 'colon-list', text: '它有三个特点：快速、稳定、便宜。' },
  { id: 'ascii-quote', text: '他说"你好"。' },
  { id: 'ascii-ellipsis', text: '我们明天再说...' },
  { id: 'dash-overuse', text: '他来了——走了——又回来了——最后散了。' },
  { id: 'emoji', text: '太好了😀😀😀' },
  { id: 'bold-overuse', text: '**重点**内容**关键**在**这里**。' },
  {
    id: 'list-overuse',
    text: '- 第一点内容\n- 第二点内容\n- 第三点内容\n- 第四点内容',
  },
  { id: 'exclaim-overuse', text: '太好了！！！真的！！！' },

  // ───────── 假装口语 ─────────
  { id: 'colloquial-overdose', text: '说白了，这事就是这样。说实话，我也不知道。讲道理，你想想。' },
  { id: 'net-meme', text: '绝绝子，yyds，破防了。' },

  // ───────── 情绪直陈（只对小说/网文生效） ─────────
  { id: 'emotion-telling', text: '他心中满是悲凉。', genre: 'fiction' },

  // ───────── 用字错误 ─────────
  { id: 'di-noun-mismatch', text: '他眼中闪过一丝冷峻地寒意。' },
  { id: 'de-verb-mismatch', text: '他愤愤然的骂道。' },
  { id: 'typo-collocation', text: '他们素未蒙面。' },

  // ───────── 地区用语 ─────────
  { id: 'locale-tw', text: '透过软体就能看到。' },

  // ───────── 自定义回避词 ─────────
  { id: 'custom-banned', text: '我们要赋能整个行业。', options: { customBannedWords: ['赋能'] } },

  // ───────── 节奏 ─────────
  { id: 'rhythm-fragmented', text: FRAGMENTED_TEXT },
  { id: 'rhythm-too-short', text: FRAGMENTED_TEXT },
  // 6 句不触发碎片化（那要 10 句以上），只留下「连续短句成串」
  { id: 'rhythm-consecutive-short', text: '天亮了。他走了。雨停了。她来了。门开了。灯灭了。' },
  { id: 'rhythm-subject-repeat', text: '他走进来。他坐下。他拿起杯子。他喝了一口。他放下。他看向窗外。' },
  {
    id: 'rhythm-one-sentence-paragraph',
    text: '他走进屋子。\n\n她放下杯子。\n\n门外有人喊。\n\n窗台上落灰。\n\n灯还亮着。\n\n他坐了下来。',
  },
  {
    id: 'rhythm-uniform-long',
    // 句数门槛是 20：句长变异系数是统计量，句数太少时它自己就不稳。
    text:
      '他走进屋子看了看桌子上摆着的那几样东西。' +
      '她拿起杯子喝了一口然后又慢慢地放了回去。' +
      '门外传来脚步声有人推开门站在了走廊中间。' +
      '窗台上的灰尘积了厚厚一层没有人来打扫过。' +
      '他把外套脱下来挂在门后那把旧椅子的背上。' +
      '她低头看了看自己的手然后握紧了又松开了。' +
      '楼下有人在喊什么听不清楚像是卖东西的人。' +
      '屋子里的灯光很暗只照得见桌面上的纸张。' +
      '桌上的茶杯还剩下半杯水早就已经凉透了。' +
      '他抬起头看了一眼窗户外面那条安静的街道。' +
      '街上没有行人只有一盏路灯还在那里亮着。' +
      '她站起来走到门口又回过头看了看这个房间。' +
      '墙角的箱子上面盖着一块洗得发白的旧布。' +
      '他伸手把窗户关上然后拉了一下窗帘的绳子。' +
      '窗外的风停了树叶也不再发出任何的声音。' +
      '她转过身来面对着他站在那里一句话也没有。' +
      '两个人就这样站着谁也没有先开口说话的意思。' +
      '过了很久他才轻轻地叹了一口气低下了头去。' +
      '她把手里的东西放在桌上转身朝门口走了出去。' +
      '门关上的声音很轻但是在屋子里听得清清楚楚。',
  },
  {
    id: 'rhythm-duplicate-passage',
    text:
      '他把外套脱下来挂在门后那把旧椅子的背上，然后转身走进了里屋。' +
      '窗外的雨下了一整夜，天亮的时候才渐渐停了下来。' +
      '院子里的水没过了门槛，几片叶子浮在水面上打转。' +
      '邻居家的狗叫了半夜，后来也不叫了，大概是被主人放进了屋。' +
      '天亮以后他推开门看了看院子，又回屋把炉子点上了。' +
      '他把外套脱下来挂在门后那把旧椅子的背上，然后转身走进了里屋。',
  },
  // 第 48 轮：新闻特写 / 都市言情这两个亚型逼出来的七条
  { id: 'refraction-cliche', text: '这看似简单的坚持背后，折射出的却是一座城市治理理念的转变。' },
  { id: 'lift-up-cliche', text: '正是这些人，用自己的汗水，托起了这座城市的体面与温度。' },
  { id: 'behind-simple', text: '这看似简单的一句话背后，折射出的是完全不同的东西。' },
  { id: 'not-think', text: '他或许不会想到，正是这些平凡的人改变了这里。' },
  { id: 'it-is-just', text: '正是无数个像他这样的普通人，用自己的汗水托起了这里。' },
  { id: 'unnamed-expert', text: '一位长期关注城市治理问题的专家指出，这个指标很重要。' },
  { id: 'ripple-cliche', text: '这句话像一颗石子，投入她平静的心湖，泛起层层涟漪。' },
];

// ───────── 逐条触发 ─────────
console.log(`规则覆盖：${CASES.length} 个样本\n`);
for (const c of CASES) {
  const result = scanText(c.text, { genre: c.genre || 'general', ...(c.options || {}) });
  if (!result.ok) {
    check(c.id, false, `文本被拒绝：${result.reason || '无原因'}`);
    continue;
  }
  const hit = result.findings.some((f) => f.id === c.id);
  check(c.id, hit, `未触发；实际命中 ${result.findings.map((f) => f.id).join('、') || '无'}`);
}

// ───────── 完整性：新增规则必须补样本 ─────────
console.log('\n--- 完整性 ---');
const declared = new Set(RULES.map((r) => r.id));
for (const key of Object.keys(RHYTHM_RULES)) declared.add(RHYTHM_RULES[key].id);
// custom-banned 是从配置动态生成的，不在静态 RULES 表里
const DYNAMIC_IDS = new Set(['custom-banned']);

const covered = new Set(CASES.map((c) => c.id));
const missing = [...declared].filter((id) => !covered.has(id));
const extra = [...covered].filter((id) => !declared.has(id) && !DYNAMIC_IDS.has(id));

check(`全部 ${declared.size} 条规则都有触发样本`, missing.length === 0, `缺：${missing.join('、')}`);
check('样本里没有已删除的规则 id', extra.length === 0, `多余：${extra.join('、')}`);
check('样本 id 无重复', covered.size === CASES.length);

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exitCode = failures === 0 ? 0 : 1;
