# 发布到 DSH 社区

三件事：建 GitHub 仓库 → 发 npm → 给 `awesome-dsh-plugin` 提 PR。做完第三件，插件才会出现在 dshmarket 里能被一键安装。

## 一次性的准备（需要你自己动手，30 秒）

```powershell
gh auth login                                    # 选 GitHub.com → HTTPS → 浏览器授权
npm login --registry=https://registry.npmjs.org  # npm 官方源，不是淘宝镜像
```

两条都要在**你自己的终端**里跑。授权是交互式的，我这边跑不了。

## 然后一条命令做完

```powershell
cd E:\Natredo\dsh-plugin-nature
node scripts/publish.mjs --all
```

它会依次做：

1. **体检** —— 查 `package.json` 是否合规、两个账号是否登录、工作区是否干净
2. **建仓** —— 自动补 `repository` / `homepage` / `bugs` 字段（npm 靠它把包指回仓库）、`git init`、首次提交、`gh repo create --public --source . --push`、加 `dsh-plugin` topic
3. **发 npm** —— 先 `--dry-run` 预检，再正式发到 registry.npmjs.org
4. **生成投稿文件** —— 写出 `data/plugins` 要的那份 yml，并打印提交 PR 的命令

只想做其中一步：`--repo` / `--npm` / `--submission`。只想体检：不带参数（默认）。

## 投稿到 awesome-dsh-plugin

收录规则里有几条容易被忽略的：

- 仓库创建满 **1 天** 才能投
- 必须有 `dsh.bundle`（只有 `dsh.client` 会被拒）
- 描述必须与代码相符 —— **夸大是主要被拒原因**
- 一个 PR 最多 3 条
- 只加**一个文件**，路径在仓库根，命名 `<owner>__<repo>.yml`：

```yaml
url: https://github.com/<owner>/dsh-plugin-nature
name: <owner>/dsh-plugin-nature
category: tools
description:
  en: '...'
  zh: '...'
```

`category` 可选值：`agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun`。

描述里出现 `: ` 必须加引号。两个 README 由这些 yml 生成，不要手改。

## 发完之后

装的人用：

```powershell
dsh plugin install dsh-plugin-nature
```

或者从 dshmarket 里搜。npm 是可选路径 —— 只上 GitHub 也能装（`dsh plugin install <仓库地址>`），但走 npm 免掉构建授权那一步，用户少一个卡点。

## 如果 `gh auth login` 之后 `--repo` 还报权限错

检查 SSH key：`ssh -T git@github.com`。`gh` 用的是它自己的 token，不走 SSH，但如果仓库地址被 git 改写成了 SSH 就会打架。`git remote -v` 看一眼是 `https://` 还是 `git@` 开头。
