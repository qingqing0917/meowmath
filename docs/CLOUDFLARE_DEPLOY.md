# 部署到 Cloudflare

本文按当前项目的实际配置，记录从代码到可登录、可保存的线上游戏的完整流程。首次部署按顺序操作；以后更新游戏见文末。

GitHub 保存代码，Cloudflare Worker 运行网站和 API，Cloudflare D1 保存各账号的游戏数据，Google Cloud 提供 Google 登录。四者各司其职。

## 1. 准备项目和账号

需要 Node.js 22.13 或更新版本、GitHub 账号、Cloudflare 账号和可使用 Google Cloud Console 的 Google 账号。在项目根目录执行：

```sh
npm ci
npm test
npx wrangler login
```

`wrangler login` 会打开浏览器，请选择**准备托管这个游戏的 Cloudflare 账号**。在 GitHub 创建仓库；代码会在确认好数据库和线上域名后上传。不要上传 `.dev.vars`、`.wrangler/`、`node_modules/` 或 `dist/`。

## 2. 确定线上地址并创建 D1

在 Cloudflare 的 Workers & Pages 中确认账号的 `workers.dev` 子域名。当前项目的 Worker 名称是 `cat-multiplication-park`，线上地址是：

```text
https://cat-multiplication-park.qing-idea.workers.dev
```

复用到另一个账号时，实际地址会变成 `https://cat-multiplication-park.<你的子域名>.workers.dev`。先确定这个地址，后面的 Cloudflare 与 Google 配置必须使用同一个域名。

首次为新账号部署时创建数据库：

```sh
npx wrangler d1 create cat-game
```

在 `wrangler.jsonc` 中核对或修改这些值：

| 配置 | 应填写的内容 |
| --- | --- |
| `name` | Worker 名称，本项目为 `cat-multiplication-park` |
| `vars.PUBLIC_ORIGIN` | 完整线上地址，以 `https://` 开头，不带末尾 `/` 或其他路径 |
| `vars.APP_ENV` | `production` |
| `d1_databases[0].binding` | `DB`，不要随意改名 |
| `d1_databases[0].database_name` | `cat-game` |
| `d1_databases[0].database_id` | 上述命令返回的数据库 ID |

当前仓库已经填了已上线数据库的 ID。**在同一个 Cloudflare 账号继续维护现有网站时，保留这个 ID，不要重新建库**；只有部署到另一个账号或新项目时才替换。`preview_database_id` 是本地数据库标识，保持原值即可。

## 3. 创建 Google 登录客户端

在 [Google Cloud Console](https://console.cloud.google.com/) 新建或选择一个个人项目，确认项目所属账号与组织符合你的预期。进入 **Google Auth Platform**，填写应用名称、用户支持邮箱和开发者联系邮箱；用户支持邮箱是用于接收用户联系的邮箱，**不是所有登录用户的邮箱名单**。受众类型按需要选择“外部”。如果 Google 要求添加测试用户，就在测试用户名单中加入准备登录的 Google 账号。

创建 OAuth 客户端，应用类型选择**Web 应用**。在“已获授权的重定向 URI”中填写实际线上地址加回调路径，例如：

```text
https://cat-multiplication-park.qing-idea.workers.dev/auth/google/callback
```

必须与 `PUBLIC_ORIGIN` 的域名完全一致。本项目由服务端处理回调，线上部署不需要填写“已获授权的 JavaScript 来源”。保存后记录**客户端 ID**和**客户端密钥**，只在下一步输入到 Cloudflare，勿提交到 GitHub。当前代码请求的登录范围是 `openid email profile`。

## 4. 将 GitHub 仓库连接到 Cloudflare Worker

将项目源码、`package-lock.json`、`wrangler.jsonc` 和 `migrations/` 提交到 GitHub。先用 `git status --short` 核对待提交文件；新仓库需要先配置 `origin` 指向它。确认远端地址正确后推送生产分支：

```sh
git status --short
git add .
git commit -m "Prepare Cloudflare deployment"
git push -u origin main
```

在 Cloudflare 的 **Workers & Pages** 创建 Worker，选择连接 GitHub 仓库，授权 Cloudflare 访问这个项目。使用以下构建配置：

| 设置项 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 项目根目录 | 仓库根目录 `/` |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |

第一次构建完成后，到 Worker 的设置中确认 D1 绑定为 `DB`，对应刚才的 `cat-game`。Worker 的环境变量应与 `wrangler.jsonc` 一致：`APP_ENV=production`，`PUBLIC_ORIGIN` 为实际线上地址。此时登录尚未配置完成，先不要用能否登录判断部署是否成功。

## 5. 配置密钥并初始化线上数据库

在项目根目录运行下面四条命令，每条都会提示你输入值：

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OWNER_EMAIL
```

前两项来自 Google OAuth 客户端。`SESSION_SECRET` 填至少 32 字符的随机字符串，可以在本机运行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成。`OWNER_EMAIL` 填拥有游戏专属权限的 Google 邮箱地址。密钥只应通过命令提示输入，不能写入 `wrangler.jsonc`、README 或其他公开文件；也不需要提供 Google 账号密码。Cloudflare 控制台的 Worker 设置中也可以逐项添加同名的 **Secret**。

将仓库中的迁移应用到**远程** D1：

```sh
npx wrangler d1 migrations apply cat-game --remote
```

确认目标是正确的 Cloudflare 账号和数据库。完成后首次手动部署一次：

```sh
npm run deploy
```

这里的 `--remote` 很关键；本地开发使用的 `.wrangler/state/` 与线上 D1 是两份不同的数据。`APP_ENV=local` 只应出现在私有的 `.dev.vars` 中，线上保持 `production`。

## 6. 上线验收

打开实际的 `workers.dev` 地址，依次检查：

1. 页面能正常加载，Google 登录按钮可用。
2. 用准备好的 Google 账号登录，能够进入游戏。
3. 领养或答题后刷新页面，猫咪、鱼干和学习记录仍在。
4. 退出后重新登录，存档仍能恢复。
5. 在 Cloudflare 的 Worker **Builds / Deployments** 页面确认最近一次部署成功。

遇到 Google 的 `redirect_uri_mismatch`，先逐字核对 Google 客户端的回调 URI、`PUBLIC_ORIGIN` 和浏览器中的实际域名。能进入网页但登录提示未配置时，检查四个 Secret 和 Worker 设置；能登录但不能保存时，检查 `DB` 绑定与远程数据库迁移。

`OWNER_EMAIL` 目前只决定无限鱼干等专属权限，**并不阻止其他 Google 账号登录**；其他账号会有各自独立的存档。如需网站只允许一个账号使用，还需要在服务端增加登录邮箱白名单。

## 以后如何更新

日常改动先在本地执行 `npm test`，然后只提交需要发布的文件并推送到 `main`。Cloudflare 会自动运行 `npm run build` 和 `npx wrangler deploy`；在 Builds 中确认成功后刷新线上页面。

Google 客户端密钥和会话密钥仍保存在 Cloudflare，不需要每次重新填写。**新增数据库迁移时**，自动构建不会替你迁移远程 D1，要先运行 `npx wrangler d1 migrations apply cat-game --remote`。本地测试可按 [README 的本地开发说明](../README.md#本地开发)运行 `npm run dev`，默认使用本地测试账号与本地数据库，不依赖线上 Google 登录。
