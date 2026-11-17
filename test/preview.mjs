// 输出真实的诊断报告与处方，用来人工检查可读性。
// 运行：node test/preview.mjs

import { normalizeOptions, createTool } from '../index.js';
import { buildPromptSection } from '../lib/content.js';

const SAMPLE = `在当今数字化的浪潮中，城市交通治理正在经历一场深刻的变革。值得注意的是，人工智能技术的引入不仅仅提升了通行效率，更重塑了城市管理的底层逻辑。

一方面，智能信号灯系统能够根据实时车流进行动态调整，显著缓解了高峰时段的拥堵状况。另一方面，数据孤岛、隐私保护等问题也日益凸显，成为制约进一步发展的关键因素。如何在效率与安全之间取得平衡，已成为各方必须面对的重要课题。

总的来说，智慧交通是一把双刃剑。它既带来了前所未有的机遇，也提出了严峻的挑战。让我们共同期待，在不久的将来，技术将为我们创造更加便捷、更加美好的出行体验。`;

const tool = createTool(normalizeOptions({}));
const value = await tool.execute({
  text: SAMPLE,
  genre: 'commentary',
  strength: 'standard',
  keep: '不新增数据，保留原文的判断方向',
});

console.log(value.report);
console.log('\n\n──────────────── 改写处方（单独返回，模型据此改写）────────────────\n');
console.log(value.prescription);

// ── 第二个样本：刻意短句造成的碎片化。这是「去 AI 味」的另一个方向，
//    必须能看到插件把方向指对，而不是继续喊"再拆短"。
const FRAGMENTED_SAMPLE = `他推开门。屋里没人。桌上放着茶。茶已经凉了。他走过去。伸手摸杯身。杯子还是温的。他愣了一下。然后坐下来。掏出手机。屏幕亮了一下。又暗了。他把手机扣在桌上。窗外有车经过。声音很轻。他没有抬头。`;

const fragValue = await tool.execute({
  text: FRAGMENTED_SAMPLE,
  genre: 'fiction',
  strength: 'standard',
});

console.log('\n\n════════════════ 碎片化样本（刻意短句）════════════════\n');
console.log(fragValue.report);
console.log('\n\n──────────────── 这一段的改写处方 ────────────────\n');
console.log(fragValue.prescription);

console.log('\n\n──────────────── 常驻系统提示片段 ────────────────\n');
console.log(buildPromptSection(normalizeOptions({})));
