// 去AI味 · 契约集成测试
// 运行：node test/integration.mjs
//
// 用一个假的 Cordis ctx 调用 apply()，检查：
//   1. 三个注册点都发生了（工具、提示词片段、技能）
//   2. 注册出去的 ToolDefinition 完全符合 dsh 的契约（尤其是 JsonSchemaNode 的封闭键集）
//   3. 配置开关和兜底逻辑正确
//
// 这一步能在重启宿主之前抓出所有 API 层面的错误。

import { apply, name, inject, normalizeOptions } from '../index.js';
import { GENRES } from '../lib/content.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
};

/** dsh 的 JsonSchemaNode 是封闭结构，多一个键就是无效 schema */
const SCHEMA_KEYS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties',
  'items', 'enum', 'const', 'description', 'title', 'default', 'examples',
]);
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function validateSchema(node, path, problems) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    problems.push(`${path}: 不是对象`);
    return;
  }
  for (const key of Object.keys(node)) {
    if (!SCHEMA_KEYS.has(key)) problems.push(`${path}.${key}: 非法键`);
  }
  if (node.type !== undefined && !SCHEMA_TYPES.has(node.type)) {
    problems.push(`${path}.type: 非法类型 ${node.type}`);
  }
  if (node.properties) {
    for (const [k, v] of Object.entries(node.properties)) validateSchema(v, `${path}.properties.${k}`, problems);
  }
  if (node.items) validateSchema(node.items, `${path}.items`, problems);
  if (node.oneOf) node.oneOf.forEach((v, i) => validateSchema(v, `${path}.oneOf[${i}]`, problems));
}

function makeCtx({ orderThrows = false } = {}) {
  const log = { tools: [], sections: [], skills: [] };
  const disposers = [];
  const services = {
    systemPrompt: {
      getSectionOrder(key) {
        if (orderThrows) throw new Error(`unknown order ${key}`);
        if (key === 'DEPLOYMENT_PERSONA_SUFFIX') return 42;
        throw new Error(`unknown order ${key}`);
      },
      section(s) {
        log.sections.push(s);
        return () => {};
      },
    },
    skills: {
      register(s) {
        log.skills.push(s);
        return () => {};
      },
    },
  };
  const ctx = {
    get(n) {
      return services[n];
    },
    effect(fn) {
      const d = fn();
      disposers.push(d);
      return d;
    },
    tools: {
      register(def) {
        log.tools.push(def);
        return () => {};
      },
    },
  };
  return { ctx, log, disposers };
}

console.log('--- 1. 模块导出 ---');
check('name 正确', name === 'nature-chinese', name);
check('inject 硬依赖 tools', Array.isArray(inject) && inject.includes('tools'));
check('apply 是函数', typeof apply === 'function');

console.log('\n--- 2. 默认配置下完整注册 ---');
const a = makeCtx();
apply(a.ctx, {});
check('注册了 1 个工具', a.log.tools.length === 1);
check('注册了 1 个提示词片段', a.log.sections.length === 1);
check('注册了 1 个技能', a.log.skills.length === 1);
check('三个 disposer 都是函数', a.disposers.length === 3 && a.disposers.every((d) => typeof d === 'function'));

const tool = a.log.tools[0];
check('工具名是 nature', tool.name === 'nature');
check('工具有描述', typeof tool.description === 'string' && tool.description.length > 50);
check('工具有 execute', typeof tool.execute === 'function');
check('工具有 output.render', typeof tool.output?.render === 'function');
check('工具有 output.schema', tool.output?.schema?.type === 'object');
check('isConcurrencySafe 返回 true', tool.isConcurrencySafe() === true);

console.log('\n--- 3. schema 合法性（JsonSchemaNode 封闭键集）---');
const problems = [];
validateSchema(tool.parameters, 'parameters', problems);
validateSchema(tool.output.schema, 'output.schema', problems);
check('两处 schema 都合法', problems.length === 0, problems.slice(0, 5).join(' | '));
check('parameters 只要求 text', JSON.stringify(tool.parameters.required) === '["text"]');
check(
  'genre 枚举覆盖全部文体',
  Array.isArray(tool.parameters.properties.genre.enum) &&
    tool.parameters.properties.genre.enum.length === Object.keys(GENRES).length,
  `枚举 ${tool.parameters.properties.genre.enum?.length} 项 / GENRES ${Object.keys(GENRES).length} 项`,
);
check('包含网文文体', tool.parameters.properties.genre.enum.includes('webnovel'));
check('strength 枚举为三种', JSON.stringify(tool.parameters.properties.strength.enum) === '["light","standard","rewrite"]');
check('有 before 参数（改前改后对照）', tool.parameters.properties.before?.type === 'string');

console.log('\n--- 4. 提示词片段 ---');
const section = a.log.sections[0];
check('片段名不冲突', section.name === 'nature-chinese-voice');
check('order 是有限数', Number.isFinite(section.order), String(section.order));
check('order 紧跟 persona（42 之后）', section.order === 42.5, String(section.order));
check('text 是函数', typeof section.text === 'function');
const sectionText = section.text({});
check('片段内容非空且是中文', typeof sectionText === 'string' && sectionText.length > 300 && /中文表达/.test(sectionText));
check('片段含必删清单', /值得注意的是/.test(sectionText));

console.log('\n--- 5. 技能 ---');
const skill = a.log.skills[0];
check('技能名是 nature-chinese', skill.name === 'nature-chinese');
check('技能有 description', typeof skill.description === 'string' && skill.description.length > 20);
check('技能有 whenToUse', typeof skill.whenToUse === 'string' && skill.whenToUse.length > 20);
check('技能 source 是 runtime', skill.source === 'runtime');
check('技能正文够长但不过长', skill.content.length > 2000 && skill.content.length < 8192, `${skill.content.length} 字符`);
check('技能含完整章节', /必删清单/.test(skill.content) && /分文体要点/.test(skill.content) && /改完自检/.test(skill.content));
check('技能可被模型与用户调用', skill.invocation.modelInvocable === true && skill.invocation.userInvocable === true);

console.log('\n--- 6. 配置开关 ---');
const b = makeCtx();
apply(b.ctx, { promptSection: false, skill: false });
check('关掉片段与技能后只剩工具', b.log.tools.length === 1 && b.log.sections.length === 0 && b.log.skills.length === 0);
check('只有一个 disposer', b.disposers.length === 1);

const c = makeCtx();
apply(c.ctx, { customBannedWords: ['闭环'], extraRules: '不要用网络流行语。', promptTone: 'strict' });
const strictText = c.log.sections[0].text({});
check('strict 追加了对举句式禁令', /不要用「不是……而是……」/.test(strictText));
check('extraRules 进入片段', /不要用网络流行语/.test(strictText));
check('customBannedWords 进入技能', /闭环/.test(c.log.skills[0].content));

console.log('\n--- 7. 排序兜底与缺失服务 ---');
const d = makeCtx({ orderThrows: true });
apply(d.ctx, {});
check('排序名全失败时退回固定值', d.log.sections[0].order === 100, String(d.log.sections[0].order));

const e = makeCtx();
const originalGet = e.ctx.get;
e.ctx.get = (n) => (n === 'skills' ? undefined : originalGet(n));
apply(e.ctx, {});
check('skills 服务缺失时不崩且不注册技能', e.log.skills.length === 0 && e.log.tools.length === 1);

console.log('\n--- 8. 工具端到端（假 ctx 注册的那个实例）---');
const value = await a.log.tools[0].execute({
  text: '在当前的大背景下，我们需要对现有流程进行优化，以赋能业务增长。',
  genre: 'report',
  strength: 'light',
});
check('execute 正常返回', value.ok === true && typeof value.report === 'string');
check('命中了去动词化', value.findings.some((f) => f.id === 'deverbal'));
check('命中了黑话', value.findings.some((f) => f.id === 'jargon'));
const blocks = a.log.tools[0].output.render({}, value);
check('render 产出文本块', blocks[0].type === 'text' && blocks[0].text.includes('文本诊断'));
check('返回值符合 output.schema 的必填项', 
  ['ok', 'score', 'grade', 'chars', 'report', 'prescription'].every((k) => k in value));

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exitCode = failures === 0 ? 0 : 1;
