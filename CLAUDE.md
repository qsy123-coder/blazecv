# BlazeCV 项目说明与工程规范

本文件是项目级指令。任何在本仓库的改动都必须满足下列验收标准；**任何部署都必须走
「部署前质量门禁 → 提交推送 → CI 绿 → 生产备份 → 部署 → 冒烟 → 回滚预案」流程**，
任一步失败即停止，禁止先上线再补测。

## 项目本质

在线简历工具的**模板 1:1 还原**：抓取原站（wondercv.com）模板页的真实 DOM + CSS，
用语义绑定把用户内容填入，预览与导出必须和原站视觉一致。

## 技术栈与线上架构

- **前端/服务端**：Next.js 15（App Router）+ React 19 + TypeScript strict + Tailwind CSS + Zustand
- **数据**：默认 PGlite 文件库（`.data/pglite`）；设置 `DATABASE_URL` 后使用 PostgreSQL 16
- **账号**：自建会话 Cookie（`blazecv_session`，SHA-256 存库，30 天）
  - 手机号 + 短信验证码（阿里云 / 腾讯云 / 通用 HTTP 网关）
  - 邮箱 + 密码（仅 QQ / 网易邮箱）+ 邮箱验证码找回密码 + 登录后改密
  - 登录设备管理（会话列表 / 退出其他设备）
- **导出**：服务端无头浏览器截图/打印（`/api/export-image`、`/api/export-pdf`），
  需要 `EXPORT_CDP_URL` 或 `EXPORT_CHROME_PATH`
- **生产示例**：`/opt/blazecv` + systemd `blazecv.service` + nginx `aetouban.conf`；
  `aetouban.cn` 由 Cloudflare DNS 解析到 `43.135.10.175`
- **仓库**：`https://github.com/qsy123-coder/blazecv.git`，主分支 `main`

## 核心不变量（破坏即为回归）

1. **A4 分页，不拉伸纸张**。内部按自然高度渲染（原站封面即自然高度），再按 A4 高度
   （1123 CSS px）切片成多页：内容超出一页就**另起一页 A4**，不得把纸张拉长成一张长页，
   也不得压扁内容。容差：超出 ≤20px 视为一页（裁掉底部空白），避免近乎空白的分页。
2. **字号缩放作用于所有元素**：模板大量节点有显式 px 字号，改 `.main` 不会生效；必须遍历
   所有元素按计算字号等比缩放（fontScale 中性值 = 标准）。**行高必须同步按同一倍率缩放**：
   模板同样大量使用显式 px `line-height`，只缩字号时行盒高度不变，降字号腾不出纵向空间
   （表现为「字号变了行距没变」、自动适配一页失效）。总行高倍率 = 字号倍率 ×
   `lineHeight / 1.2` × `fitScale`；先快照所有元素的 computed 值再写入，避免父子继承重复缩放。
3. **导出走服务端原生浏览器截图/打印**，不要用 `html-to-image` 产出正式文件：
   它会把文字重新栅格化，丢加粗、字号偏大、行距变松（历史 bug）。
   服务端接口：`/api/export-image`（PNG→PDF图片/Word图片）、`/api/export-pdf`（文字版 PDF）。
   - 冷启动的无头浏览器必须先等 `iframe.contentDocument.fonts.ready` 和图片 `decode()`
     再截图/打印，否则文字度量与编辑页差 ~8px（历史 bug）。
   - `/audit` 的模板 token 必须用 `getExactTemplateToken(doc)` 解析（含 `templatePreset`
     缺失时回退 `wcx-<token>` 的 `templateId`）。只读 `templatePreset.source.token` 会让
     服务端渲染不出 iframe、客户端静默回退 `html-to-image`（导出≠预览，历史 bug）。
4. **外站图片必须内联**：模板里的头像/顶部花纹图在 `logo.wondercv.com`、
   `oss-cn-beijing.aliyuncs.com` 等外站。导出前通过 `/api/img-proxy?u=` 转成同源
   data URL 再截图，否则导出丢图（历史 bug）。
5. **图标字体**：iconfont 需以 base64 `@font-face` 注入（`fontEmbedCSS`），否则图标变叉盒。
6. **精确模板的主题中性**：`字号=标准 / 行距=1.2 / 页边距=10 / 主色=跟随` 是「不改动」基准；
   取模板时把 exact 文档主题重置为中性并跳过经典 `fitThemeToOnePage`。四个控件（字号/行距/
   页边距/主色）都作用到原站模板，默认保持 1:1，调整后才相对变化。
   - 页边距必须**四向生效**：上下改 `.main` 的 padding-top/bottom；左右改内容块的
     margin/padding（`.user` / `.info-content` / `.module-title-wrapper` /
     `.section-item-container` / `.menu.extras` 等，只改每侧最外层载体，避免父子叠加）。
     **禁止**给 `.main` 加左右 padding：绝对定位的全幅头部花纹会被推歪并裁切（历史 bug）。
7. **1:1 基准是「原站抓取页的自然高度渲染」**，不是 720px 封面缩略图（后者是缩放版，仅辅助）。
8. 内容绑定规则：第二行职位 = `role + department`；每段**最后一项**才有下边框；
   技能分隔符按原文保留；`li.extras-item` 保留 `font_w_b` 标签+值两段；嵌套 `<ul>` 区分
   内嵌/同级。
   - 教育「补充（GPA/排名/荣誉）= `detail`」编辑器用**多行 TextArea**（可换行），渲染为
     **圆点条目列表**（每行一个 `<ul><li>`），与项目经历一致；同时清除克隆槽位残留要点。
     **exact 模板与经典模板（无 token）两套渲染器都必须按行拆分**（换行或 `；/;` 分隔），
     经典渲染器在 `blocks.tsx` / `TimelineLayout.tsx`，Word 文字版同样按条输出。
     教育条目只要有学校/专业/学历/**补充**任一非空即保留（只填补充也要显示）。
   - 名称类 `.left`（公司/学校/职位等）必须**保留模板的加粗节点**（`.font_w_b` / `<b>` /
     `<strong>`）：只替换其文字，删除其余文本节点，**不得整体 textContent 覆盖导致丢粗体**。
9. **编辑同步**：模板槽位固定。为反映左侧编辑：
   - 模块顺序：仅在用户移动/增删模块后（`doc.orderEdited=true`）按 `doc.sections` 顺序重排，
     否则保持原站 DOM 顺序（保真审计不受影响）。
   - 新增模块：`orderEdited` 时按同类型克隆一个槽位渲染；空模块也显示标题。
   - 基本信息自定义链接：追加为 `.profile-item` 行显示。
   - 编辑过基本信息（`basicsEdited`）后，模板无槽位的「求职意向 / 所在城市」追加到头部；
     模板示例（未编辑）不追加，保持 1:1。
   - 模板**有**「其它(`.option.extras`)」模块时：技能 / 语言 / 其它一律合并进该模块，**移动时不得拆分**；
     合并块位置跟随这些模块在左侧顺序中的**最靠前一项**。
   - 模板**无**「其它」模块时，技能 / 语言各自克隆成独立模块渲染，内容不丢。
   - 空模块在模板示例（未编辑）时仍隐藏，避免高度偏差。
   - 新建模块（教育/工作/自定义等）绑定时必须**清空克隆槽位里的所有样例条目**（整个 option 的
     `.section-item-container` 与 `.menu-content`），不得残留原模板的要点/文字。若模板没有
     `.section-item-container`，退化为纯文本渲染（标题 + 内容行），也不得保留样例。
10. **模板不得中途切换**：`getExactTemplateToken` 只从文档自身解析（`templatePreset.source.token` /
    `wcx-` id），**禁止**回退 `getDocTemplate()`（未知 id 会落到 `TEMPLATE_PRESETS[0]`，即另一个模板）。
    绑定临时失败时自动重试一次，`onUnavailable` 不得退回经典渲染——否则改字号/行距会“跳模板”。
11. **缩略图与编辑器同源**：「我的简历」卡片 / 模板选择器缩略图在文档有 exact token 时必须用
    `/template-pages/<token>.html` + `applyExactTemplate`（只裁第 1 个 A4 页），不得用经典
    `ResumePaper` 近似；仅无 token 或模板页不可用时才回退经典渲染。
12. **左栏一屏内无滚动**：编辑页「简历内容」在桌面端必须一屏展示完，不允许纵向滚动条。
    默认宽度按视口给（高≥1050px 时 `52vw`，否则 `60vw`，clamp 420–1100px），
    卡片用流式多列（`.editor-cards`）：列数由**容器宽度**决定（@container 480/740px → 2/3 列）。
    矮屏（`max-height: 800px`）收紧间距并隐藏底部说明；模块默认**全部折叠**。
    左右分栏由分隔条 `EditorSplit` 拖拽（最小左 420px / 预览 360px，双击或 Home 复位，
    方向键 ±20px），宽度存入 `localStorage["blazecv.editor-width"]`；不得用 zoom/transform 缩小控件。
    拖到最左侧（单列，左栏 <480px）时头部变为两行（标题 + Tab：基本信息/内容检查/排版与主题/模块内容）；
    头部位于滚动容器之外（占满整栏宽度，滚动条只出现在下方卡片区），点击 Tab 平滑定位并同步高亮。

## 工程协作规范

1. **先理解再行动**：改任何代码前先梳理受影响模块与调用方；跨 3 个以上文件的改动先列变更计划。
2. **小步推进**：一次只做一个功能/修复，不顺手重构无关代码，不删除与任务无关的代码。
3. **类型安全**：`strict: true`，避免 `any`；外部输入先校验（账号、手机号、邮箱、验证码、简历 JSON）。
4. **数据库**：SQL 必须参数化；数据库访问只能经 `src/lib/server/*`；schema 变更只做**可重复执行的增量**
   （`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`），同时同步
   `infra/db/migrations/0001_init.sql`。
5. **敏感信息**：密码只存 bcrypt 哈希；验证码只存 SHA-256；会话只存 token 哈希；
   错误响应不得泄漏供应商密钥、SQL 或内部路径；`.env` 永不入库。
6. **依赖**：不引入未使用的库；新增依赖必须能解释用途并进入 `package-lock.json`。
7. **输出格式**（Claude 执行时）：先给变更计划（受影响文件），再给改动，最后给自检清单
   （类型检查 / 构建 / 测试结果 / 回滚点）。
8. **部署权限**：部署动作必须由用户明确发起（“部署 / 上线”）。未明确指示时不得自行部署；
   commit / push 也以用户指令为准。生产不可逆操作（删数据、改库、动 `.env`、改 nginx/systemd）
   必须先说明并得到确认。

## Git 提交规范

使用 Conventional Commits，一次提交只做一件事：

- `feat:` 新功能
- `fix:` Bug 修复
- `refactor:` 重构
- `perf:` 性能
- `test:` 测试
- `docs:` 文档
- `chore:` 构建/依赖/配置

提交信息用中文或英文均可，但必须有明确的动词与范围，例如
`fix(auth): 修复 header backdrop-blur 导致登录弹窗被包含块裁切`。

## 测试策略

- **脚本级回归为主**（项目没有单元测试框架）：
  - `scripts/acceptance.mjs`：导出与交互验收（25 项）
  - `scripts/verify.mjs`：全量回归（47 项，含运行时错误与左栏无滚动）
  - `scripts/verify-sessions.mjs`：登录设备/会话管理接口（11 项，纯 HTTP）
  - `scripts/verify-sms-login.mjs`：手机号验证码登录（5 项，内置短信网关接收端）
  - `scripts/verify-reset.mjs`：邮箱找回密码 + 修改密码（7 项，内置 SMTP 接收端）
  - `scripts/audit-fidelity.mjs`：模板逐像素保真
- **改动与必跑测试的对应关系**：

| 改动范围 | 必跑 |
|---|---|
| 模板渲染 / 绑定 / 导出 | `acceptance.mjs`、`verify.mjs`、相关模板 `audit-fidelity` |
| 编辑器交互 / 左栏布局 | `acceptance.mjs`、`verify.mjs` |
| 登录 / 账号 / 会话 | `verify-sessions.mjs` + `verify.mjs`；改动短信/邮件通道再跑对应 E2E |
| 分享 / 云端简历 | `verify.mjs` |
| 数据库 schema / 迁移 | `verify.mjs` + 认证接口测试，并在部署前备份数据库 |

- 并行测试实例使用独立构建目录：`NEXT_DIST_DIR=.next-test npm run build`，启动时带同样变量，
  避免与主构建/外部开发循环互相覆盖 chunk。

## 部署前质量门禁（强制，禁止跳过）

**任何部署（systemd 重启、docker compose、手动 scp/热更）之前，必须按顺序完成以下全部步骤。
任一步失败即停止；修复后从第一步重跑。禁止“先上线再看”。**

### 第 1 步：本地静态检查与构建

```powershell
npx tsc --noEmit          # 零错误
npm run build             # 必须成功（生产构建）
```

### 第 2 步：启动本地验收环境

```powershell
# 无头浏览器（导出/回归依赖）
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList @(
  "--headless=new","--disable-gpu","--no-first-run",
  "--remote-debugging-port=9227",
  "--user-data-dir=$env:TEMP\blazecv-cdp"
)
$env:EXPORT_CDP_URL = "http://127.0.0.1:9227"
npm run start
```

### 第 3 步：全量回归与验收

```powershell
$env:CDP_URL = "http://127.0.0.1:9227"
node scripts/verify.mjs          # 必须 47/47，且「无运行时错误」「左栏一屏内无滚动」PASS
node scripts/acceptance.mjs      # 25 项全过
```

### 第 4 步：按改动范围补跑专项测试

```powershell
# 账号/会话改动（无需额外通道配置）
node scripts/verify-sessions.mjs

# 短信通道改动：应用以测试网关启动（见 README「验证」）
$env:SMS_PROVIDER="http"; $env:SMS_HTTP_URL="http://127.0.0.1:9109/send"; $env:SMS_CODE_RESEND_SECONDS="2"
node scripts/verify-sms-login.mjs

# 邮件通道改动：应用接入本地 SMTP（见 README「验证」）
$env:EMAIL_PROVIDER="smtp"; $env:EMAIL_SMTP_HOST="127.0.0.1"; $env:EMAIL_SMTP_PORT="1025"; $env:EMAIL_FROM="no-reply@blazecv.local"
node scripts/verify-reset.mjs
```

### 第 5 步：提交并推送，等待 CI 绿

```powershell
git status --short
git add <本次改动的文件>
git commit -m "fix(scope): 说明"
git push origin main
```

推送后必须等待 GitHub Actions `Quality Checks` 通过（`.github/workflows/quality.yml`：
`npm ci` → `tsc --noEmit` → `npm run build`）。**CI 未绿不得部署**；失败时看日志修复并重新推送。

本机访问 GitHub 需要显式代理（系统代理关闭）：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7897'; $env:HTTP_PROXY=$env:HTTPS_PROXY; git push origin main
# Node 脚本内的 fetch 还需：
$env:NODE_USE_ENV_PROXY='1'
```

代理返回 `502` / `schannel: failed to receive handshake` 说明 Clash 节点不可用（不是断网），
切换节点后再重试；节点切换见 wave-mod 的 `scripts/local-proxy.ps1`。

### 第 6 步：生产备份（部署前最后一步）

```bash
# 记录当前线上版本，作为回滚点
cd /opt/blazecv && git rev-parse HEAD

# 数据库备份（生产使用 PostgreSQL）
pg_dump "$DATABASE_URL" > /root/blazecv-$(date +%F-%H%M).sql

# 若使用 PGlite（单机）
tar -czf /root/blazecv-pglite-$(date +%F-%H%M).tar.gz /opt/blazecv/.data/pglite

# 环境变量与 systemd/nginx 配置留档（敏感文件不要进 git）
cp /opt/blazecv/.env /root/blazecv.env.$(date +%F-%H%M)
cp /etc/systemd/system/blazecv.service /root/ 2>/dev/null || true
```

## 生产部署流程（systemd）

```bash
ssh root@43.135.10.175
cd /opt/blazecv

# 1. 确认工作区干净、拉取与 CI 相同的提交
git status --short          # 必须为空；有本地改动先查明来处
git pull --ff-only origin main
git log -1 --oneline        # 与刚推送的提交一致

# 2. 依赖与构建（与 CI 相同命令）
npm ci
npm run build

# 3. 重启服务
sudo systemctl restart blazecv
systemctl status blazecv --no-pager -l

# 4. 仅当 nginx 配置有改动时
sudo nginx -t && sudo systemctl reload nginx
```

生产环境变量由 systemd unit 的 `EnvironmentFile` 提供，至少包含：

```ini
DATABASE_URL=postgres://...
COOKIE_SECURE=true
EXPORT_INTERNAL_ORIGIN=http://127.0.0.1:3000
EXPORT_CDP_URL=http://127.0.0.1:9222        # 或 EXPORT_CHROME_PATH=/usr/bin/chromium
SMS_PROVIDER=...        # aliyun | tencent | http
EMAIL_PROVIDER=...      # smtp | http
```

`EXPORT_INTERNAL_ORIGIN` 必须设置：反向代理提供 HTTPS 时，否则服务端导出会访问
`https://localhost:3000` 失败。

> docker compose 部署路径保留：`cp .env.example .env && docker compose up -d --build`，
> 同样必须先完成第 1–6 步；容器内 `EXPORT_INTERNAL_ORIGIN` 需指向容器内服务地址。

### 第 7 步：线上冒烟（必须逐项确认）

```bash
# 首页与静态资源
curl -fsSI https://aetouban.cn/ | head -n 3          # 200
# 认证接口存活（未登录应返回 {"user":null}）
curl -fsS https://aetouban.cn/api/auth/me
# 服务端导出依赖的浏览器与字体（登录后从编辑器导出一次 PNG/PDF 验证）
```

浏览器手工确认：

1. 首页模板市场正常渲染（48 套模板入口）；
2. 手机号验证码 / 邮箱密码登录可用（验证码通道已配置时）；
3. 编辑器打开模板，右侧预览正常、左栏无纵向滚动；
4. 导出 PNG / PDF 各一次，页面与预览一致、图片不丢；
5. 登录面板「登录设备」能列出当前会话。

### 第 8 步：失败回滚

```bash
cd /opt/blazecv
git reset --hard <上一版本 SHA>      # 部署前记录的回滚点
npm ci
npm run build
sudo systemctl restart blazecv
# 如本次包含数据迁移且需要回退数据：
# psql "$DATABASE_URL" < /root/blazecv-YYYY-MM-DD-HHMM.sql
```

数据库 schema 变更原则上是**向后兼容的增量**（只加列/表），旧代码可以继续运行；
若必须回退数据，使用第 6 步的备份。回滚后同样执行第 7 步冒烟。

## 部署前检查清单（逐项打勾后才可上线）

- [ ] 变更计划已列明受影响文件，未夹带无关改动
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 成功
- [ ] `node scripts/verify.mjs` 47/47（含无运行时错误、左栏无滚动）
- [ ] `node scripts/acceptance.mjs` 25/25
- [ ] 账号/会话改动：`node scripts/verify-sessions.mjs` 11/11
- [ ] 短信/邮件通道改动：对应 E2E 全过
- [ ] 已提交并推送，GitHub Actions `Quality Checks` 绿
- [ ] 已记录线上回滚点（`git rev-parse HEAD`）
- [ ] 已备份生产数据库、`.env`、systemd/nginx 配置
- [ ] 部署后冒烟五项全部通过
- [ ] 失败时已按回滚流程恢复并复测

## 验收命令

前置：`npm run build`，然后用带无头浏览器的模式启动：
`set EXPORT_CDP_URL=http://127.0.0.1:9227 && npm run start`
（或设置 `EXPORT_CHROME_PATH` 指向 Chrome/Edge；`/api/export-image`、`/api/export-pdf` 依赖它）。

```bash
# 1) 导出与交互验收（浏览器自动化，25 项）
node scripts/acceptance.mjs

# 2) 全量回归（47 项：首页/导出/分享/云端/版本/多页/模板库/左栏无滚动/无运行时错误）
node scripts/verify.mjs

# 3) 模板逐像素保真（原站页 vs 绑定渲染）
AUDIT_START=0 AUDIT_LIMIT=200 AUDIT_CONCURRENCY=4 node scripts/audit-fidelity.mjs

# 4) 指定模板左右对比图（左=编辑页/原站，右=导出或渲染）
node scripts/show-compare.mjs <token...>       # 编辑页渲染 vs 原始页
node scripts/export-10.mjs "<模板名>" ...       # 编辑页 vs 真实导出 PNG（旧版，整页拉伸）
node scripts/export-pages-compare.mjs "<模板名>" ...  # 逐页对齐对比（推荐）
node scripts/export-batch.mjs   # 批量（BATCH_START/BATCH_LIMIT/BATCH_TOKENS，JSONL 断点续跑）

# 5) 账号与登录专项
node scripts/verify-sessions.mjs
node scripts/verify-sms-login.mjs    # 需应用接入测试短信网关
node scripts/verify-reset.mjs        # 需应用接入本地 SMTP
```

对比图输出：`tools/audit/compare/*.png`；审计结果：`tools/audit/fidelity/`。

## 验收判定（全部必须满足）

**导出文件（`scripts/acceptance.mjs`）**
- 分页规则：期望页数 = `max(1, ceil((自然高度 - 20) / 1123))`；超出即多页 A4，不得单张长页。
- Word 图片版：每页一张图、页间有分页符（`分页符 = media-1`），页面 A4（11910×16875 twips）。
- PDF 图片版：页数=期望页数；每页 595.5×842.25pt（A4）；溢出的模板必须 ≥2 页。
- PDF 文字版：页数=期望页数（A4 原生分页）；字节含 `/Font`（真文字，可选中）；单页容差内按自然高度出单页。
- PNG：每个文件都是单页 A4（1588×2246）；多页时导出为 p1、p2…
- Word 文字版：`word/document.xml` 的 `<w:t>` 文本段 ≥ 10。

**交互（必须截图对比，不能只看 DOM 值）**
- 字号/行距/页边距/主色：每次调整后，右侧原站预览的**截图必须发生像素变化**（meanDiff > 1），
  且对应属性变化（font-size / line-height / padding / 页头强调色）。
- 左侧编辑（姓名/总结/条目）→ 右侧预览截图实时变化。
- 模块顺序：点「上移/下移」后，右侧模块顺序必须随之变化（截图/标题顺序核对）。
- 添加模块：点「添加模块」新增后，右侧必须出现该模块（含空模块标题）。
- 基本信息添加链接：点「添加」填链接后，右侧必须出现该链接文本。
- 自动适配一页：必须通过**字号 × 行距 × 页边距的组合搜索**压到 1 个 A4 页，
  **禁止**用 zoom / fitScale 整体缩放，也**禁止**只按“先降行距→再降字号→再降页边距”的单参数贪心。
  做法：生成三项的候选组合，按观感损失排序（页边距 < 行距 < 字号，字号最贵），
  用编辑页 iframe 的 `__blazecvMeasureTheme`（`applyExactTheme` 快路径，不经过 store/React）
  逐个试算，取第一个高度 ≤ `1123+20` 的组合；搜索预算 5s。验收须截图变化 +
  `[data-resume-page]`=1 + 上述属性确实变化 + `zoom` 仍为 1。行距下限 1.00，页边距下限 4mm。
- 城市：仅在模板版式包含 城市/现居/所在地 等字段时可见；含城市的模板改城市后截图必须变化。
- 预览分页：内容超页时编辑页应渲染多个 `[data-resume-page]`（= 期望页数），不得拉长单页。
- 中性值：字号=标准 / 行距=1.20 / 页边距=10mm / 主色=跟随；默认必须保持 1:1。

**保真（`audit-fidelity`，同一浏览器、同宽 794、同自然高度逐像素）**
- 判定一致：`mean ≤ 6`、`changedPct ≤ 8%`、`maxCellPct ≤ 25`、`|heightDelta| ≤ 40`。
- 说明：不同浏览器实例间存在抗锯齿级差异属正常；跨实例对比的 ASCII 均值 ~2–5 可接受。

**导出 vs 编辑页预览（`export-pages-compare`）**
- 逐页截取编辑页的 `[data-resume-page]`，与真实下载的 PNG 分页逐页对比；只裁剪、不拉伸。
- 先用暗像素掩码求全局偏移 `(dx,dy)`，再在共同区域算残差；判定 `aligned mean ≤ 6`、`changedPct ≤ 8%`。
- 多页模板允许 0–5 CSS px 的页边界差（导出会把断点吸附到空白行 ±40px，预览按 1123 硬切）；
  `|dy| > 40 CSS px` 视为分页不一致。
- 注意：多页模板的编辑页元素截图可能把页面外约 5 CSS px 背景裁进来（`dx≈5`），属截图伪影，
  必须按 `dx` 对齐后再判定，不能直接与导出页逐像素比。

**回归**
- `scripts/verify.mjs` 必须 47/47 通过，`无运行时错误` 与 `左栏一屏内无滚动` 项必须 PASS。

## 环境与数据

- 模板页：`public/template-pages/<token>.html`（4127 个，794px 宽）。
- 模板内容：`public/template-content/<token>.json`（示例数据，由
  `scripts/build-template-catalog.mjs` 生成；改动提取逻辑后需重新生成）。
- 共享 CSS：`public/wondercv-assets/template-base.css`；图标字体：`iconfont.woff2`。
- 图片代理：`src/app/api/img-proxy/route.ts`；导出：`src/app/api/export-image`、
  `src/app/api/export-pdf`；渲染入口：`/audit?doc=<base64>`（`window.__auditApply`）。
- 认证：`src/lib/server/auth.ts`（会话/密码/账号解析）、`verify-code.ts`（验证码）、
  `sms.ts` / `email.ts`（通道）、`sessions.ts`（设备管理）；登录 UI 在
  `src/components/account/CloudMenu.tsx`。
- 环境变量模板：`.env.example`（部署前按生产实际填写，`.env` 不入库）。

## 已知边界

- 编辑型 Word（文字版）是结构化重排，不追求模板逐像素；逐像素用图片版。
- 部分模板版式本身不含「所在城市 / 教育经历」等模块，属模板设计，不是数据丢失。
- 全量 4127 张逐像素审计耗时较长且受内存限制，需分批。
