# 乘法猫猫乐园

3D 猫咪养成与乘法练习。网页版使用 Google 登录，每个账号拥有独立的猫咪、鱼干和学习记录，数据保存在 Cloudflare D1。只有经过 Google 验证、与私密配置匹配的专属账号有无限鱼干。

## 本地开发

需要 Node.js 22.13 或更新版本，推荐 Node.js 24。

### 首次运行

从 GitHub 克隆或下载项目后，在终端进入项目目录，再安装依赖和创建本地配置：

```sh
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

如果已经有 `.dev.vars`，跳过复制配置这一步，以免覆盖已有配置。`npm run dev` 会自动构建游戏、初始化或更新本地数据库，然后启动本地服务端。

### 以后每次启动

在当前电脑上打开终端，执行：

```sh
cd "/Users/fanqie/Documents/multiplication table"
npm run dev
```

如果项目放在其他位置，修改 `cd` 后的路径。依赖已安装、配置已创建时，不需要重复执行首次安装步骤；从 GitHub 更新了依赖后，再执行 `npm install`。

等终端显示 `Ready on http://127.0.0.1:8787`，打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。选择“我的测试账号”或“普通测试账号”，不用 Google 登录，也不需要 Cloudflare 账号。测试账号分别模拟无限鱼干和答题赚鱼干；两者存档独立。

测试期间保持终端中的服务运行。结束时在该终端按 `Ctrl+C` 停止服务；下次执行相同的启动命令即可继续玩。

本地数据库位于项目的 `.wrangler/state/`，停止服务、重启服务或刷新页面不会清空存档；选择同一个测试账号即可恢复进度。删除 `.wrangler/` 会删除本地数据库，因此需要保留这个目录。它与线上数据库分开。`.dev.vars` 中的 `APP_ENV=local` 只在开发环境使用，测试登录还要求请求来自回环地址；生产环境禁止测试登录。

### 运行测试

```sh
npm test
# 另一个终端已经运行 npm run dev 时，可执行真实本地 API 检查：
npm run test:local
```

`npm test` 会构建文件，验证 3D 场景、前端答题和存档流程、账号隔离、权限、奖励和 Google OAuth 模拟流程。`test:local` 验证 Wrangler 与本地 D1；只在空测试账号上执行领养和奖励操作，随后重置，已有本地进度会保留。

日常修改游戏和地图不需要联调 Google 或线上 Cloudflare。直接打开原来的 HTML 也可继续使用旧版浏览器存档；登录和数据库功能需要通过本地服务器打开。

## 上传 GitHub

项目已提供 `.gitignore`。使用 Git 提交时，下列文件和目录会被忽略，不要强制添加：

- `.dev.vars`、`.env*`：本地配置及可能包含的密钥。
- `.wrangler/`：本地数据库、存档及运行文件。
- `node_modules/`：安装的依赖，可通过 `npm install` 重建。
- `dist/`：构建产物，可通过 `npm run build` 重建。

保留并提交 `.dev.vars.example`、`package.json`、`package-lock.json`、`wrangler.jsonc`、`migrations/` 和游戏源码，让下载项目的人可以按上面的步骤启动。真实 Google 客户端密钥和 `SESSION_SECRET` 不要写入这些公开文件。

如果通过 GitHub 网页直接上传文件，`.gitignore` 不会替你筛选文件，需要手动跳过上述文件和目录。GitHub 只保存项目代码，不会备份被忽略的本地游戏存档；换电脑前，可以在游戏里导出一份存档备份。

## 保存与旧存档迁移

游戏自动保存，不需要每次导出。更新时显示保存状态；本地服务停止、数据库写入失败，或线上网络中断时，在当前浏览器为当前账号保留待同步缓存。服务或连接恢复后可重试；显示“已保存”表示数据库已收到进度。两个页面同时更新同一账号时，较旧页面会提示重新加载，并保留可以导出的备份。

鱼干和成长由后端结算，普通存档上传不能增加鱼干、猫咪数量或成长。账号权限由后端验证的 Google 身份决定。

旧版存档迁移只需一次：

1. 用原来的浏览器打开本地 HTML，点击顶部“导出存档”。
2. 登录线上配置的专属账号，点击“导入旧存档”，选择导出的 JSON。
3. 确认后，猫咪和答题记录会覆盖该账号的云端进度。

导入旧存档仅对专属账号开放；所有账号都可以导出备份。切换账号不会自动混用旧版浏览器存档。云端保存猫咪、成长、名字、性别、睡眠、当前家/公园区域、学习记录和鱼干；人物实时位置、移动动画、答题中途的当前回合不会恢复。

## 配置并部署 Cloudflare

此项目目前仅在本地实现和验证。真实 Google 登录、线上 D1 和部署需要以下配置。

1. 登录 Cloudflare 并创建 D1：

```sh
npx wrangler login
npx wrangler d1 create cat-game
```

把返回的数据库 ID 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，替换全零占位值。确定网站地址，可使用 Workers 的 `https://cat-multiplication-park.<你的子域>.workers.dev` 或自定义域名，并在 `vars` 添加 `PUBLIC_ORIGIN`，值只包含协议和域名，不带路径。

2. 在 Google Cloud Console 创建 OAuth 客户端，类型选择“Web 应用”，启用 OpenID Connect 所需的 `openid email profile` 范围。配置授权重定向 URI：

```text
https://<网站域名>/auth/google/callback
```

要测试真实 Google 本地登录，再添加 `http://127.0.0.1:8787/auth/google/callback`。配置 Google 应用受众与测试用户；处于测试模式时，把自己的邮箱加入测试用户名单。使用多个真实账号时按 Google 的发布要求配置受众。

3. 保存生产密钥，按命令提示输入，勿写入源码或公开文件：

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OWNER_EMAIL
```

`SESSION_SECRET` 使用密码工具生成的至少 32 字符的随机值。`OWNER_EMAIL` 填入需要专属权限的 Google 账号邮箱，通过 Cloudflare secret 保存，不写入公开源码。Google 密钥来自 OAuth 客户端，不需要提供 Google 邮箱密码。可把这些配置放入不提交的 `.dev.vars`，用于可选的本地真实 Google 测试；示例配置只使用虚构邮箱。

4. 初始化远程数据库，再部署：

```sh
npx wrangler d1 migrations apply cat-game --remote
npm run deploy
```

生产 `APP_ENV` 保持 `production`，`OWNER_EMAIL` 通过上面的 secret 命令配置。`.dev.vars` 不会替代部署配置。`npm run build` 仅把游戏、必要脚本和 vendor 文件输出到 `dist/`；密钥、数据库、测试和服务端源文件不会作为静态资源发布。

5. 上线后验证 Google 登录、退出、刷新恢复存档，以及用另一 Google 账号验证独立存档和普通鱼干规则。配置真实 Google 客户端前，自动测试中的模拟登录不能替代这一步。
