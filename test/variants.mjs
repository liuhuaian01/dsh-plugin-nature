#!/usr/bin/env node
/**
 * 同义变体测试。
 *
 * rules-coverage.mjs 验证的是「这条规则能不能被触发」——它给每条规则配一个
 * 精心挑的样本，那个样本一定长成正则想要的样子。问题是：真实写作里没人照着
 * 正则写。同一个意思有十来种说法，词表型规则只要差一个字就整条绕过去。
 *
 * 这份测试换一个问法：**换了说法，还认得出来吗？**
 * 每条规则给三到五个同义变体，全部必须触发。一个变体漏掉就红。
 *
 * 它已经抓到过三个真实的绕行：
 * - 「需要注意的是」漏了——词表收了「值得注意的是」，差一个字就不认
 * - 「持续地优化」漏了——正则没给中间的「地」留位置
 * - 对举句式五种说法只认一种——「并非……而是」「不在……而在」「表面上……实际上」全绕过
 *
 * 注意这份测试只放「同义的、应该同样判定」的变体。反例（不该报的）放在 smoke.mjs，
 * 因为那测的是另一件事：宁可漏也不能误伤真人写的正常中文。
 */
import { scanText } from '../lib/scan.js';

let failures = 0;
let checks = 0;

function hit(text, id, genre = 'general') {
  checks += 1;
  const findings = scanText(text, { genre }).findings;
  const ok = findings.some((f) => f.id === id);
  if (!ok) {
    failures += 1;
    const got = findings.map((f) => `${f.id}(${f.count})`).join(' ') || '什么都没报';
    console.log(`  ✗ ${id}　漏了：${text}`);
    console.log(`      实际命中：${got}`);
  }
}

function group(name) {
  console.log(`\n--- ${name} ---`);
}

// ───────── 对举句式：同一套骨头的不同外衣 ─────────
group('not-but　「不是……而是」的变体');
hit('这不是技术问题，而是管理问题。', 'not-but');
hit('这并非技术问题，而是管理问题。', 'not-but');
hit('问题不在技术，而在管理。', 'not-but');
hit('问题不在于技术，而在于管理。', 'not-but');
hit('表面上是技术问题，实际上是管理问题。', 'not-but');
hit('看似是技术问题，实则是管理问题。', 'not-but');

group('rather-than　「与其说……不如说」的变体');
hit('与其说是方法问题，不如说是态度问题。', 'rather-than');
hit('与其说他是懒，不如说他没想清楚。', 'rather-than');

// ───────── 过渡套话：差一个字就整条绕过 ─────────
group('boilerplate-connector　公文过渡语的变体');
hit('值得注意的是，这个方案还有风险。', 'boilerplate-connector');
hit('值得一提的是，这个方案还有风险。', 'boilerplate-connector');
hit('需要注意的是，这个方案还有风险。', 'boilerplate-connector');
hit('需要指出的是，这个方案还有风险。', 'boilerplate-connector');
hit('要说明的是，这个方案还有风险。', 'boilerplate-connector');
hit('综上所述，这个方案还行。', 'boilerplate-connector');
hit('换言之，这个方案不可行。', 'boilerplate-connector');

// ───────── 空转副词：中间插一个「地」不该改变判定 ─────────
// 阈值按密度算，样本要够长才能稳定触发；短样本靠一次命中就远超阈值。
group('padding-adverb　空转副词的变体');
hit('我们要进一步优化流程。', 'padding-adverb');
hit('我们要持续地优化流程。', 'padding-adverb');
hit('我们要不断优化流程。', 'padding-adverb');
hit('我们要深入深化这项改革。', 'padding-adverb');

// ───────── 情绪套话：成语不同，毛病一样 ─────────
group('emotion-cliche　情绪成语的变体');
hit('她望着窗外，心中思绪万千。', 'emotion-cliche');
hit('听到这个消息，他百感交集。', 'emotion-cliche');
hit('那一刻，她五味杂陈。', 'emotion-cliche');
hit('他站在门口，心潮起伏。', 'emotion-cliche');

// ───────── 去动词化：光杆和变形都要认 ─────────
group('deverbal / deverbal-inflected　「进行+名词」的变体');
hit('我们对方案进行了讨论。', 'deverbal-inflected');
hit('会上进行了一次深入分析。', 'deverbal-inflected');
hit('需要对流程进行讨论。', 'deverbal');

// ───────── 视频腔：开场收尾的不同说法 ─────────
group('video-opening / video-outro　视频腔的变体');
hit('大家好，欢迎来到本期分享。', 'video-opening');
hit('今天我们来聊一个话题。', 'video-opening');
hit('希望今天的分享对你有所帮助，我们下期再见。', 'video-outro');
hit('觉得有用的话，记得点赞收藏。', 'video-outro');

// ───────── 结尾拔高：三种收法，同一个空 ─────────
group('significance-inflation / answer-lie-in　收尾的变体');
hit('本次大会为行业发展带来了新的机遇。', 'significance-inflation');
hit('这一举措为乡村振兴注入了新的动力。', 'significance-inflation');
hit('或许，答案就在于那些无法替代的东西。', 'answer-lie-in');
hit('也许答案就是坚持本身。', 'answer-lie-in');

// ───────── 旧形态：2019–2021 那批模型留下的腔调 ─────────
// 这一组现在的模型基本不写了（25 份语料零命中），但旧模型输出和人工模仿还会出现。
// 写这组之前先犯了个错：按「我以为的句型」造句子，七条里有四条根本没命中——
// 不是规则死了，是我测的东西和规则说的不是一回事（把「既…又…」写成「不仅…而且」，
// 把「正是…才」写成「正是在…背景下」）。测规则之前，先确认测的是规则说的那个。
group('翻译腔与欧化句');
hit('作为一名记者，他在这件事里扮演着重要的角色。', 'translationese');
hit('这项政策具有重要的意义，也受到了广泛关注。', 'translationese');
hit('作为这个行业的一种存在，他很清楚自己的位置。', 'existence');
hit('这个说法被大家所熟知。', 'passive-suo');
hit('那个方案被团队所否定。', 'passive-suo');

group('对举句式补');
hit('这项工作既提高了效率，又降低了成本。', 'both-and');
hit('无论是技术还是产品，都需要重新审视一遍。', 'either-or');
hit('正是这种坚持，才让他走到了今天。', 'zhengshi');

group('排版腔');
hit('它有三个特点：高效、稳定、易用。', 'colon-list');

console.log(
  `\n${failures === 0 ? `全部通过（${checks} 个变体）` : `${failures} / ${checks} 个变体没认出来`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
