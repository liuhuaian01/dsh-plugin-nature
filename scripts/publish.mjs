#!/usr/bin/env node
// 发布到 DSH 社区的三步走：建仓 → 发 npm → 生成 awesome-dsh-plugin 的投稿文件。
// 每一步都会先检查前置条件，缺什么就停下来说清楚缺什么，不会半路挂掉留下烂摊子。
//
// 用法：
//   node scripts/publish.mjs --check          只体检，不动任何东西（默认）
//   node scripts/publish.mjs --repo           建 GitHub 仓库并推代码（需要 gh 已登录）
//   node scripts/publish.mjs --npm            发布到 npm（需要 npm 已登录）
//   node scripts/publish.mjs --submission     生成 awesome-dsh-plugin 的投稿 yml
//   node scripts/publish.mjs --all            以上全做
//
// 前置：gh auth login  /  npm login --registry=https://registry.npmjs.org

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_PATH = join(ROOT, 'package.json');
const REPO_NAME = 'dsh-plugin-nature';
const NPM_REGISTRY = 'https://registry.npmjs.org';

// ---------- 环境探测 ----------

// 这台机器的 WinINET 代理开着、git 自己读不到，所以直连 github.com 会被 reset。
// Invoke-WebRequest 走的是系统代理所以看起来正常，git 走的是 libcurl，得显式告诉它。
function detectProxy() {
  const fromEnv = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (fromEnv) return fromEnv;
  try {
    const out = execFileSync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer',
    ], { encoding: 'utf8' });
    const m = out.match(/ProxyServer\s+REG_SZ\s+(\S+)/);
    if (m && /^(127\.0\.0\.1|localhost):\d+$/.test(m[1])) return `http://${m[1]}`;
  } catch {
    // 读不到就算了，直连试试
  }
  return '';
}

const PROXY = detectProxy();

// 用户全局 .gitconfig 里有一条 url.insteadOf 把 https://github.com/
// 全部改写成了 codeload.github.com（那是不通 git 协议的下载站），
// 任何 git 操作都会 404。这里用一份临时全局配置把它挡掉，
// 同时带上 gh 的凭据助手，push 才能认证。
function buildGitConfig(owner) {
  const lines = [
    '[user]',
    `\tname = ${owner || 'nature'}`,
    `\temail = ${owner ? `${owner}@users.noreply.github.com` : 'nature@localhost'}`,
  ];
  if (PROXY) lines.push(`\thttpsproxy = ${PROXY}`, `\thttpproxy = ${PROXY}`);
  lines.push(
    '[credential "https://github.com"]',
    '\thelper = ',
    '\thelper = !gh auth git-credential',
    '[safe]',
    '\tdirectory = *',
  );
  // 放临时目录，不能放 <ROOT>/.git —— 那个目录一旦被提前创建，
  // 后面 existsSync('.git') 就会真，git init 被跳过，提交落到上一级的仓库里。
  const p = join(tmpdir(), `nature-publish-${process.pid}.gitconfig`);
  return { path: p, content: `${lines.join('\n')}\n` };
}

let GIT_ENV = { ...process.env };

function primeGitEnv(owner) {
  const { path, content } = buildGitConfig(owner);
  writeFileSync(path, content, 'utf8');
  // 加进 .git 里不会被提交，也不污染用户自己的全局配置
  GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: path, GIT_TERMINAL_PROMPT: '0' };
  if (PROXY) {
    GIT_ENV.https_proxy = PROXY;
    GIT_ENV.http_proxy = PROXY;
    GIT_ENV.HTTPS_PROXY = PROXY;
    GIT_ENV.HTTP_PROXY = PROXY;
  }
}


const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const wantAll = flags.has('--all');
const wantRepo = wantAll || flags.has('--repo');
const wantNpm = wantAll || flags.has('--npm');
const wantSubmission = wantAll || flags.has('--submission');

function run(cmd, args = [], opts = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: cmd === 'git' ? GIT_ENV : { ...process.env, ...(PROXY ? { HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY, https_proxy: PROXY, http_proxy: PROXY } : {}) },
    ...opts,
  }).trim();
}

function tryRun(cmd, args = []) {
  try {
    return { ok: true, out: run(cmd, args) };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}`.trim() };
  }
}

function say(msg) {
  console.log(msg);
}

function fail(msg, hint) {
  console.error(`\n✗ ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

// ---------- 体检 ----------

function checkGh() {
  const auth = tryRun('gh', ['auth', 'status']);
  if (!auth.ok) {
    return { ok: false, detail: 'GitHub CLI 未登录', hint: '运行 gh auth login' };
  }
  const user = tryRun('gh', ['api', 'user', '--jq', '.login']);
  if (!user.ok || !user.out) {
    return { ok: false, detail: '拿不到 GitHub 用户名', hint: '重跑 gh auth login' };
  }
  return { ok: true, owner: user.out, detail: `已登录为 ${user.out}` };
}

function checkNpm() {
  const who = tryRun('npm', ['whoami', `--registry=${NPM_REGISTRY}`]);
  if (!who.ok || !who.out) {
    return { ok: false, detail: 'npm 未登录', hint: `运行 npm login --registry=${NPM_REGISTRY}` };
  }
  return { ok: true, detail: `npm 已登录为 ${who.out}` };
}

function checkPackage() {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  const problems = [];
  if (!pkg.dsh?.bundle) problems.push('package.json 缺 dsh.bundle（只有 dsh.client 会被拒收）');
  if (!pkg.repository?.url) problems.push('package.json 缺 repository（npm 与仓库靠它关联）');
  if (!pkg.description) problems.push('package.json 缺 description');
  if (!pkg.license) problems.push('package.json 缺 license');
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) problems.push('有运行时依赖，社区版应零依赖');
  return { ok: problems.length === 0, problems, pkg };
}

function report() {
  say(`\n仓库目录：${ROOT}\n`);

  const pkgCheck = checkPackage();
  say(pkgCheck.ok ? '✓ package.json 合规' : '✗ package.json 有问题：');
  pkgCheck.problems.forEach((p) => say(`    - ${p}`));

  say(PROXY ? `✓ 检测到系统代理 ${PROXY}（git 会走它）` : '· 没检测到系统代理，git 直连');

  const gh = checkGh();
  say(gh.ok ? `✓ ${gh.detail}` : `✗ ${gh.detail} —— ${gh.hint}`);

  const npm = checkNpm();
  say(npm.ok ? `✓ ${npm.detail}` : `✗ ${npm.detail} —— ${npm.hint}`);

  // git 能不能真的连上 github（只读，不动任何东西）
  primeGitEnv(gh.ok ? gh.owner : null);
  const reach = tryRun('git', ['ls-remote', '--heads', 'https://github.com/octocat/Hello-World.git']);
  say(reach.ok ? '✓ git 能连上 github.com' : `✗ git 连不上 github.com —— ${reach.out.split('\n')[0]}`);

  const git = tryRun('git', ['status', '--porcelain']);
  if (git.ok) {
    const dirty = git.out ? git.out.split('\n').length : 0;
    say(dirty ? `! 工作区有 ${dirty} 个未提交改动（--repo 会一并提交）` : '✓ 工作区干净');
  } else {
    say('· 这里还不是独立 git 仓库（--repo 会 git init）');
  }

  say('');
  return { pkgCheck, gh, npm, reach };
}

// ---------- 建仓 ----------

function createRepo(owner) {
  const remote = `https://github.com/${owner}/${REPO_NAME}`;

  // 把 repository 字段补进 package.json（npm 靠它把包指回仓库）
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  pkg.repository = { type: 'git', url: `git+${remote}.git` };
  pkg.homepage = `${remote}#readme`;
  pkg.bugs = { url: `${remote}/issues` };
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  say(`✓ package.json 已补 repository / homepage / bugs`);

  // 判「是不是已初始化的仓库」要看 .git/HEAD，不是 .git 目录存不存在
  if (!existsSync(join(ROOT, '.git', 'HEAD'))) {
    run('git', ['init', '-b', 'main']);
    say('✓ git init');
  }

  // 安全闸：cwd 不等于仓库根，说明 git 往上找到了别的仓库，
  // 这一提交就会落到别人的历史里（2026-11 已经误操作过一次）。
  const top = tryRun('git', ['rev-parse', '--show-toplevel']);
  const topPath = top.ok ? realpathSync(top.out.trim()) : '';
  if (topPath !== realpathSync(ROOT)) {
    fail('git 找到的仓库根不是这个项目目录，已停止提交', `实际：${topPath || '(空)'}\n  应为：${realpathSync(ROOT)}`);
  }

  run('git', ['add', '-A']);
  const staged = tryRun('git', ['diff', '--cached', '--name-only']);
  if (staged.ok && staged.out) {
    // 仓库内局部身份，不动全局配置
    tryRun('git', ['config', 'user.name', owner]);
    tryRun('git', ['config', 'user.email', `${owner}@users.noreply.github.com`]);
    run('git', ['commit', '-m', 'nature 1.0.0：中文写作体检']);
    say('✓ 已提交');
  } else {
    say('· 没有新改动需要提交');
  }

  const exists = tryRun('gh', ['repo', 'view', `${owner}/${REPO_NAME}`, '--json', 'name']);
  if (!exists.ok) {
    run('gh', ['repo', 'create', `${owner}/${REPO_NAME}`, '--public',
      '--description', '中文写作体检：按 11 个文体判定模板腔并给出改写处方。不判断作者身份。',
      '--source', '.', '--remote', 'origin', '--push']);
    say(`✓ 已建仓并推送：${remote}`);
  } else {
    const hasRemote = tryRun('git', ['remote', 'get-url', 'origin']);
    if (!hasRemote.ok) run('git', ['remote', 'add', 'origin', `${remote}.git`]);
    run('git', ['push', '-u', 'origin', 'main']);
    say(`✓ 已推送到 ${remote}`);
  }

  // 投稿要求里明写了「加 dsh-plugin topic」
  const topics = tryRun('gh', ['repo', 'edit', `${owner}/${REPO_NAME}`, '--add-topic', 'dsh-plugin,dsh,bundle']);
  say(topics.ok ? '✓ 已加 topic：dsh-plugin / dsh / bundle' : `! topic 没设上，手工加：${topics.out.split('\n')[0]}`);

  return remote;
}

// ---------- 发 npm ----------

function publishNpm() {
  // 镜像不能发布，必须显式指到官方源
  const dry = tryRun('npm', ['publish', `--registry=${NPM_REGISTRY}`, '--dry-run']);
  if (!dry.ok) fail('npm publish 预检失败', dry.out.split('\n').slice(-4).join('\n  '));
  say('✓ npm publish 预检通过');

  const out = tryRun('npm', ['publish', `--registry=${NPM_REGISTRY}`]);
  if (!out.ok) {
    if (/previously published|EPUBLISHCONFLICT|cannot publish over/i.test(out.out)) {
      fail('这个版本号已经发过了', '改 package.json 的 version 再发');
    }
    fail('npm publish 失败', out.out.split('\n').slice(-6).join('\n  '));
  }
  say(`✓ 已发布到 npm：https://www.npmjs.com/package/${REPO_NAME}`);
}

// ---------- 生成投稿文件 ----------

function writeSubmission(owner) {
  const ymlName = `${owner}__${REPO_NAME}.yml`;
  const outPath = join(ROOT, ymlName);
  const content = [
    `url: https://github.com/${owner}/${REPO_NAME}`,
    `name: ${owner}/${REPO_NAME}`,
    'category: tools',
    'description:',
    // 英文描述里有冒号就必须加引号，这里统一用单引号最省事
    "  en: 'Deterministic Chinese writing checker for 11 genres: scores template-cliché density, names the exact rules that fired, and prints a rewrite prescription. Reads register and style, never authorship.'",
    "  zh: '中文写作体检：按十一个文体分别判定模板腔，每一分都能追到具体规则，并给出可直接照着改的处方。它看的是语域和写法，不是作者身份。'",
    '',
  ].join('\n');
  writeFileSync(outPath, content, 'utf8');
  say(`✓ 投稿文件已生成：${outPath}`);
  say(`\n  把它提交到 awesome-dsh-plugin：`);
  say(`    gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false`);
  say(`    # 在该仓库根目录新建 ${ymlName}，粘贴上面的内容`);
  say(`    gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \\`);
  say(`      --title "Add ${owner}/${REPO_NAME} (tools)" --body "中文写作体检插件，零依赖，确定性扫描。"`);
  return outPath;
}

// ---------- 主流程 ----------

const state = report();

if (!wantRepo && !wantNpm && !wantSubmission) {
  say('只做了体检。要动手加 --repo / --npm / --submission / --all。');
  process.exit(state.pkgCheck.ok && state.gh.ok && state.npm.ok ? 0 : 1);
}

if (wantRepo && !state.gh.ok) fail('建仓需要 GitHub 登录', state.gh.hint);
if (wantNpm && !state.npm.ok) fail('发 npm 需要 npm 登录', state.npm.hint);
if (wantSubmission && !state.gh.ok) fail('生成投稿文件需要知道 GitHub 用户名', state.gh.hint);

const owner = state.gh.ok ? state.gh.owner : null;

if (wantRepo) createRepo(owner);
if (wantNpm) publishNpm();
if (wantSubmission) {
  const p = writeSubmission(owner);
  say(`\n下一步：把 ${p} 提交成 PR。`);
}
