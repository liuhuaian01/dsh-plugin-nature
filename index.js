// nature · 中文写作体检 · dsh 插件主体
//
// 三件事：
//   1. 常驻系统提示片段：让模型平时写中文就说人话（可关闭）
//   2. 内嵌技能 nature-chinese：按需加载的中文写作体检方法论
//   3. 工具 nature：确定性扫描一段中文，给出命中清单、结构性指标和改写处方
//
// 工具本身不调用模型，只做检查和开方；真正的改写由调用它的模型完成。

import { scanText } from './lib/scan.js';
import {
  GENRES,
  GENRE_IDS,
  STRENGTHS,
  STRENGTH_IDS,
  buildPromptSection,
  buildSkillBody,
  buildReport,
  buildPrescription,
} from './lib/content.js';

export const name = 'nature-chinese';
export const inject = ['tools'];

const LOCALES = ['zh-CN', 'zh-TW', 'zh-HK'];

const DEFAULTS = {
  promptSection: true,
  promptTone: 'balanced',
  skill: true,
  locale: 'zh-CN',
  genre: 'general',
  strictness: 'standard',
  customBannedWords: [],
  extraRules: '',
};

function normalizeOptions(config) {
  const c = config && typeof config === 'object' ? config : {};
  return {
    promptSection: c.promptSection !== false,
    promptTone: ['strict', 'balanced'].includes(c.promptTone) ? c.promptTone : DEFAULTS.promptTone,
    skill: c.skill !== false,
    locale: LOCALES.includes(c.locale) ? c.locale : DEFAULTS.locale,
    genre: GENRE_IDS.includes(c.genre) ? c.genre : DEFAULTS.genre,
    strictness: STRENGTH_IDS.includes(c.strictness) ? c.strictness : DEFAULTS.strictness,
    customBannedWords: Array.isArray(c.customBannedWords)
      ? c.customBannedWords.map((w) => String(w)).filter(Boolean)
      : [],
    extraRules: typeof c.extraRules === 'string' ? c.extraRules : '',
  };
}

/**
 * 把常驻片段放在 persona 之后、工具说明之前。
 * 拿不到仓库里的排序常量就退回一个靠后的固定值——宁可位置不理想，也不要抛错。
 */
function resolveSectionOrder(systemPrompt) {
  const anchors = ['DEPLOYMENT_PERSONA_SUFFIX', 'HARNESS_IDENTITY', 'PLAN_POLICY'];
  for (const anchor of anchors) {
    try {
      const base = systemPrompt.getSectionOrder(anchor);
      if (typeof base === 'number' && Number.isFinite(base)) return base + 0.5;
    } catch {
      // 该排序名在当前版本不存在，试下一个
    }
  }
  return 100;
}

function createTool(options) {
  const toolDescription = [
    '检查一段中文的模板化痕迹，并给出可执行的改写处方。',
    '它会做确定性扫描（不调用模型、不联网），返回三类东西：模板腔信号（套话、黑话、对举句式、节奏碎片）、客观用字错误（错别字、「的／地」误用）、以及不参与评分的编辑建议。',
    '重要：这个工具衡量的是文本的模板化程度，不是作者身份。真人写作同样会命中这些模式——用它去断定「这段是 AI 写的」是错误用法，也不要在回答里下这种结论。',
    '适用场景：写完一稿想确认有没有套路化写法；改稿前做一次体检；审别人交来的文字。',
    '调用后按返回的处方执行：有模板腔问题才改写，只有用字错误就只改错，不要无端重写。',
  ].join(' ');

  return {
    name: 'nature',
    description: toolDescription,
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '要检查的中文原文。整段传入，不要截断。',
        },
        genre: {
          type: 'string',
          enum: GENRE_IDS,
          description:
            '文体。决定处方的读者预期和取舍标准：' +
            GENRE_IDS.map((id) => `${id}=${GENRES[id].label}`).join('，') +
            '。不确定时用 general——同一份稿子换个文体，分数可能相差二十几分，选错比选宽更糟。',
        },
        strength: {
          type: 'string',
          enum: STRENGTH_IDS,
          description:
            '改写强度。light=只删套话保留结构；standard=重组句子、调整段落；rewrite=只保留事实结论、推倒重写。',
        },
        keep: {
          type: 'string',
          description: '必须原样保留的内容：关键事实、数字、术语、当事人立场、结论。逗号分隔即可。',
        },
        before: {
          type: 'string',
          description:
            '改之前的原文。传了它就生成「改前改后」对照：哪些问题解决了、哪些还没处理、哪些是这次改稿新引入的，以及分数和长度变化。改完稿做验收时用。',
        },
        locale: {
          type: 'string',
          enum: LOCALES,
          description: '目标中文语区。默认 zh-CN（大陆简体）。zh-TW／zh-HK 时不再检查港台用词混入。',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', description: '文本是否可分析。' },
          score: { type: 'number', description: 'AI 味评分，0–100，越高越像机器写的。' },
          grade: { type: 'string', description: 'A–E 等级。' },
          chars: { type: 'number', description: '正文非空白字符数。' },
          genre: { type: 'string', description: '实际采用的文体。' },
          strength: { type: 'string', description: '实际采用的改写强度。' },
          findings: {
            type: 'array',
            description: '命中的 AI 腔条目摘要。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                severity: { type: 'number' },
                count: { type: 'number' },
              },
              required: ['id', 'label', 'severity', 'count'],
              additionalProperties: false,
            },
          },
          report: { type: 'string', description: '完整诊断报告（markdown）。' },
          prescription: { type: 'string', description: '改写处方（markdown），模型应据此改写。' },
        },
        required: ['ok', 'score', 'grade', 'chars', 'report', 'prescription'],
        additionalProperties: false,
      },
      render(_args, value) {
        const text =
          value && typeof value === 'object' && typeof value.report === 'string'
            ? value.report
            : JSON.stringify(value, null, 2);
        return [{ type: 'text', text }];
      },
    },
    isConcurrencySafe() {
      return true;
    },
    async execute(rawArgs) {
      const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
      const text = typeof args.text === 'string' ? args.text : '';
      const strength = STRENGTH_IDS.includes(args.strength) ? args.strength : options.strictness;
      const locale = LOCALES.includes(args.locale) ? args.locale : options.locale;
      const keep = typeof args.keep === 'string' ? args.keep : '';

      const genre = GENRE_IDS.includes(args.genre) ? args.genre : options.genre;

      const result = scanText(text, {
        locale,
        // 文体会决定节奏判定的阈值：口播稿天然短，报告天然克制，
        // 用一把尺子量会把正常文本判成碎片化。
        genre,
        customBannedWords: options.customBannedWords,
      });

      const prescriptionArgs = { genre, strength, keep };

      // 「这几项不许动」得验。只写一句「必须保留」，改没改到全凭自觉——
      // 而改稿最常见的翻车就是把事实、数字、原话一起删干净了。
      const keepItems = keep
        .split(/[、，,；;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (keepItems.length) {
        const missing = keepItems.filter((item) => !text.includes(item));
        if (missing.length) prescriptionArgs.missingKeep = missing;
      }

      // 传了 before 就多扫一遍原文，报告里出「改前改后」对照。
      // 改稿最容易犯的错不是改不掉，是改坏了——只看改后这一稿看不出来。
      const beforeText = typeof args.before === 'string' ? args.before.trim() : '';
      if (beforeText) {
        const beforeResult = scanText(beforeText, {
          locale,
          genre,
          customBannedWords: options.customBannedWords,
        });
        if (beforeResult.ok) prescriptionArgs.before = beforeResult;
      }

      const report = buildReport(result, prescriptionArgs, options);
      const prescription = buildPrescription(result, prescriptionArgs, options);

      return {
        ok: result.ok === true,
        score: result.score,
        grade: result.grade,
        chars: result.chars,
        genre,
        strength,
        findings: result.findings.map((f) => ({
          id: f.id,
          label: f.label,
          severity: f.sev,
          count: f.count,
        })),
        report,
        prescription: prescription.body,
      };
    },
  };
}

export function apply(ctx, config = {}) {
  const options = normalizeOptions(config);

  // 1. 常驻中文表达规则
  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt && options.promptSection) {
    ctx.effect(() =>
      systemPrompt.section({
        name: 'nature-chinese-voice',
        order: resolveSectionOrder(systemPrompt),
        text: () => buildPromptSection(options),
      }),
    );
  }

  // 2. 内嵌技能：按需加载的详细方法论，不占常驻上下文
  const skills = ctx.get('skills');
  if (skills && options.skill) {
    ctx.effect(() =>
      skills.register({
        name: 'nature-chinese',
        description:
          '中文写作体检方法论：判断模板腔来自哪里、必删清单、句式改造手法、十一种文体的具体写法、改写对照、改完自检表。',
        whenToUse:
          '需要把一段中文改到像真人写的，或者要判断一段文字为什么读着像机器写的、审稿、润色、去腔调时。',
        source: 'runtime',
        content: buildSkillBody(options),
        invocation: { modelInvocable: true, userInvocable: true },
      }),
    );
  }

  // 3. 诊断工具
  ctx.effect(() => ctx.tools.register(createTool(options)));
}

export { normalizeOptions, createTool };
