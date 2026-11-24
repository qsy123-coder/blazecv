# BlazeCV

免登录的在线简历工具：先在模板市场挑版式，再进入编辑器填写，实时 A4 预览，一键导出 PDF / PNG / Word，数据只存在本机浏览器。

在线使用：<https://aetouban.cn> · 模板库：<https://aetouban.cn/templates> · 写简历指南：<https://aetouban.cn/guides>

## 功能

- 模块化编辑：基本信息、个人简介、教育、工作、项目、技能、证书、自定义模块，可拖拽排序、显隐、增删
- 模板市场首页：7 种版式分类筛选，48 套模板大图预览；点击模板创建一份新简历
- 全部模板库 `/templates`：4127 套采集模板、4127 张 720px WebP 预览图、版式/用途筛选与分页；点击后带模板示例内容进入编辑器
- 原站 1:1 渲染：抓取模板页真实 DOM + 13 个 CSS 分片，编辑器/分享页用同源 iframe 实时绑定字段；无捕获页时回退映射版式
- 多份简历：独立「我的简历」页面（`/resumes`），模板缩略图、搜索、打开、复制、删除与当前标记
- 历史版本：每 10 分钟自动保留，最多 20 个；支持手动保存、恢复、删除
- 多页排版：超出一页自动分页，按模块/条目/段落断页，预览显示页数
- 页面高度：原站渲染保留模板字号/行距/间距，页高取 `max(A4, 自然内容高度)`——短内容一页 A4，长内容自然增高，与原站封面/下载件一致（不压缩、不拉伸）；映射版式继续使用行距/页边距/字号/`fitScale` 压缩
- 继续编辑：已有简历时，首页与编辑器都保留入口
- 可选账号与云同步：邮箱注册 / 登录，多份云端简历的保存、列表、载入、删除；自托管 Postgres，本地无数据库时使用 PGlite
- 公开分享链接：登录后生成只读 `/r/<token>` 页面，可设置访问密码与 7/30/90 天有效期，支持更新快照、复制、撤销；不暴露账号信息
- 48 套模板、7 种版式家族（14 套精选 + 34 套由爬取版式元数据生成）：
  - 单栏：极简黑白、紧凑单色、学术风
  - 浅色侧栏：商务蓝、技术岗、校招清新
  - 时间轴：时间轴经典、双栏时间轴
  - 通栏横幅：翡翠横幅、墨黑斜切
  - 深色侧栏：暗夜侧栏
  - 居中框线：左右分栏
  - 编辑标签栏：杂志衬线、瑞士蓝
- 技能熟练度 1–5 可编辑，深色侧栏/左右分栏按档位渲染技能条
- 内容检查：本地规则评分，覆盖联系方式、简介长度、量化结果、要点数量，问题可一键定位到模块
- 多标签冲突：另一标签页保存后提示刷新载入
- 模板画廊：7 种版式分组 + 筛选，热门/新模板标记
- 主题调节：主色、字号、行距、页边距
- 导出：多页打印级 PDF、逐页 2x PNG、可编辑 Word
- 备份：JSON 导出 / 导入，换设备可迁移
- 撤销 / 重做：`Ctrl+Z` / `Ctrl+Shift+Z`（或 `Ctrl+Y`），50 步
- 本地持久化：IndexedDB 自动保存，刷新不丢
- 无账号、无埋点、无简历内容外发

## 技术栈

Next.js 15（App Router）+ TypeScript + Tailwind CSS + Zustand + Dexie + docx + html-to-image。
V1 为纯前端数据层；自有服务器只托管静态/SSR 产物，Postgres 已建库占位，供 V2 账号与云同步启用。

## 本地运行

```bash
npm install
npm run dev          # 模板市场：http://localhost:3000
                     # 全部模板库：http://localhost:3000/templates
                     # 我的简历：http://localhost:3000/resumes
                     # 编辑器：  http://localhost:3000/editor
npm run typecheck
npm run build && npm run start
```

账号与云同步默认使用 PGlite 文件库（`.data/pglite`），无需安装数据库；设置 `DATABASE_URL` 后自动切换为 Postgres。首次调用 `/api/*` 时自动建表。

### 登录方式

- **手机号 + 短信验证码**：验证码 5 分钟有效、单次使用、最多试错 5 次；同一手机号 60 秒内只能重发一次（10 分钟 5 条、单 IP 每小时 20 条上限）。首次验证通过自动创建账号。
- **邮箱 + 密码**：仅支持 QQ 邮箱（qq.com / foxmail.com）与网易邮箱（163.com / 126.com / yeah.net）。
- **忘记密码**：邮箱登录下点「忘记密码？」→ 邮箱验证码 → 设置新密码，重置后用新密码登录。验证码同样 5 分钟有效、单次使用、60 秒重发冷却。
- **登录后修改密码**：登录面板「修改密码」，需校验当前密码；纯验证码账号不显示该入口。
- **登录设备管理**：登录面板「登录设备」列出所有有效会话（系统 · 浏览器、登录时间、当前标记），可单独退出某个会话，或「退出其他设备」。会话表只保存 token 的 SHA-256 哈希与 UA，公开 ID 为哈希前 16 位，不可反推 token。
- 短信通道在服务端按 `SMS_PROVIDER` 选择阿里云 / 腾讯云 / 通用 HTTP 网关；邮件通道按 `EMAIL_PROVIDER` 选择 SMTP / 通用 HTTP 网关，配置见 `.env.example`。未配置时对应发送接口返回 503，密码登录不受影响。
- 本地联调可设 `SMS_PROVIDER=console` / `EMAIL_PROVIDER=console`，验证码会打印到服务端日志。

## 验证

`scripts/verify.mjs` 通过 CDP 驱动真实浏览器，覆盖：首页 48 套模板与用途筛选、点击模板创建新简历、生成模板应用、我的简历独立页面（复制/删除）、内容检查、撤销重做、模板切换、自动保存恢复、多页排版/多页 PDF/逐页 PNG、模板一页适配、版本保存与恢复、JSON 备份与导入、离线编辑与导出、多标签冲突提示、返回首页继续编辑、云端注册/多份保存/载入/退出、分享链接创建/密码解锁/有效期/公开访问/撤销、全部模板库使用、运行时错误检查。

1. 启动应用（生产或开发均可）。
2. 用独立 profile 启动 headless Edge 并开启远程调试：

```powershell
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList @(
  "--headless=new","--disable-gpu","--no-first-run",
  "--remote-debugging-port=9222",
  "--user-data-dir=$env:TEMP\blazecv-cdp",
  "http://127.0.0.1:3000"
)
```

3. 运行：

```bash
npm run verify
```

脚本会把截图与 PDF 输出到临时目录并在控制台打印路径。

手机号验证码登录的端到端验证（脚本内置短信接收端）：

```powershell
# 终端 A：应用以测试网关启动（仅测试用，生产按 .env.example 配置真实短信）
$env:SMS_PROVIDER="http"
$env:SMS_HTTP_URL="http://127.0.0.1:9109/send"
$env:SMS_CODE_RESEND_SECONDS="2"
npm run build; npm run start

# 终端 B：
node scripts/verify-sms-login.mjs
```

邮箱验证码找回密码 / 修改密码的端到端验证（脚本内置 SMTP 接收端）：

```powershell
# 终端 A：应用接入本地 SMTP
$env:EMAIL_PROVIDER="smtp"
$env:EMAIL_SMTP_HOST="127.0.0.1"
$env:EMAIL_SMTP_PORT="1025"
$env:EMAIL_SMTP_SECURE="false"
$env:EMAIL_FROM="no-reply@blazecv.local"
npm run build; npm run start

# 终端 B：
node scripts/verify-reset.mjs
```

登录设备（会话）管理的接口级验证，无需浏览器，也不需要额外通道配置：

```bash
node scripts/verify-sessions.mjs
```

需要与主构建并行跑测试时，可用独立构建目录：`NEXT_DIST_DIR=.next-test npm run build`，启动时带同样的环境变量。

批量导出 14 套精选模板预览图（生成变体可在首页/模板面板查看）：

```bash
npm run shots
```

输出目录默认在系统临时目录的 `blazecv-templates`，文件名按 `01-minimal.png` … `08-timeline-dual.png` 排序。

## 自托管部署

```bash
cp .env.example .env       # 修改 POSTGRES_PASSWORD
docker compose up -d --build
```

- 入口：`http://<server>:8080`（nginx → Next.js standalone）
- Postgres：`db` 服务，首次启动执行 `infra/db/migrations/0001_init.sql`
- web 服务通过 `DATABASE_URL` 连接 db；HTTPS 部署时设置 `COOKIE_SECURE=true`
- 未设置 `DATABASE_URL` 时会退回 PGlite，适合单机；多实例部署必须使用 Postgres
- 反向代理提供 HTTPS 时设置 `EXPORT_INTERNAL_ORIGIN=http://127.0.0.1:3000`，否则服务端导出会尝试访问 `https://localhost:3000` 而失败
- 当前生产示例：`/opt/blazecv` + systemd `blazecv.service` + nginx `aetouban.conf`，`aetouban.cn` 由 Cloudflare DNS 解析到 `43.135.10.175`

## 目录

```
src/
  app/
    page.tsx            模板市场首页
    templates/page.tsx  全部模板库（4127 套）
    resumes/page.tsx    「我的简历」独立页面
    editor/page.tsx     编辑器路由（?id=<resumeId>&template=<id>）
    r/[token]/page.tsx  公开只读分享页
    api/                auth / resumes / resume / share 接口
    globals.css         全局与打印样式
  components/
    account/CloudMenu   登录、注册、多份云端简历、分享链接
    share/ShareView     公开分享页分页、渲染与打印
    editor/VersionHistory.tsx  历史版本弹窗
    preview/paginate.tsx       测量式自动分页
    home/HomePage.tsx   模板市场首页
    home/ResumeLibrary.tsx     我的简历页面（列表、搜索、复制、删除）
    templates/TemplateCatalog.tsx  全部模板库（原预览图、筛选、分页）
    AppShell.tsx        会话、自动保存、导出编排
    Toolbar.tsx         撤销重做、模板、导出、备份
    PreviewPane.tsx     A4 缩放、溢出检测
    editor/             基本信息、内容检查、主题、模块编辑器
    preview/            7 种布局 + 48 套模板 token（含生成变体）
  lib/
    types.ts            ResumeDoc 数据模型
    schema.ts           JSON 校验与版本迁移
    storage.ts          Dexie / IndexedDB
    templates.ts        模板预设与 token 解析
    cloud.ts            客户端云端 API
    diagnostics.ts      本地内容检查规则
    server/             数据库、会话、限流（仅服务端）
    export/             PNG 与 Word 导出
  store/                Zustand 状态与历史栈
infra/db/migrations/    V2 数据库迁移
nginx/                  反向代理配置
scripts/verify.mjs      CDP 端到端验证
scripts/shots.mjs       精选模板批量预览截图
scripts/generate-wondercv-templates.mjs  从本地爬取元数据生成精选变体
scripts/build-template-catalog.mjs       生成全部模板目录、720px WebP 缩略图与示例内容
scripts/build-wondercv-base-css.mjs      合并原站 13 个模板 CSS 分片
scripts/capture-all-template-pages.mjs   批量抓取 4127 个原站模板页的真实 DOM
scripts/patch-template-pages.mjs         修正捕获页的 cover 图层与本地图标字体
docs/                   PRD、路线图与设计系统
```

## 已知边界

- PDF 走浏览器打印，依赖本机字体；建议 Windows / macOS 的 Chrome、Edge 各验证一次
- Word 是“内容可编辑、版式近似”版本，复杂双栏模板会退化为单栏近似
- 多页排版自动完成，暂无手动分页符；超过 12 页的极端文档会并到最后一页
- 一页适配依次压缩行距、页边距、字号、模块间距，最后启用 70%–95% 额外缩放；极端内容仍放不下时保留多页
- 多页 PNG 逐页下载，部分浏览器可能限制连续自动下载
- 全部模板库使用原预览图 1:1 展示；点击后优先加载 `public/template-pages/<token>.html`（原站 SSR DOM/CSS + 语义绑定）。未捕获成功的模板回退 `format_info` 映射
- 渲染高度对齐原站 `.main.image` 规则：页高 = `max(A4, 自然内容高度)`，与原站封面/下载件同高（封面缩略图是其 720px 缩放版）。逐模板像素对比见 `scripts/audit-fidelity.mjs`
- 原站模板页中的示例头像/背景图仍引用原站 CDN；完全离线部署需补资源本地化
- 原站模板的 PDF/Word 导出为图片版（宽 A4、高按自然页面高度，视觉与 PNG/编辑器一致，文字不可编辑，保证红色页头与标题底图不丢）；经典模板仍导出可打印 PDF 与可编辑结构化 Word
- 模板示例内容来自采集站的 `cv_data`，可能包含其示例姓名、电话、邮箱；使用前应替换为真实信息
- 历史版本只保存在本机 IndexedDB，不随云端同步
- 手机端只保证预览可读，编辑面板仅在 ≥768px 显示
- 账号已支持多份云端简历；暂无邮箱验证、找回密码、自动同步与冲突合并
- 分享链接为快照并自动分页；暂无访问统计、自定义 slug 与多份分享
- AI 诊断、付费仍在后续范围

## 文档

- 产品路线图与里程碑：`docs/roadmap.md`
- 产品需求与验收标准：`docs/resume-builder-prd.md`
- 模板设计系统与 StyleKit 依据：`docs/design-system.md`
- 开源模板布局调研与许可结论：`docs/template-research.md`
- 原站 DOM/CSS 1:1 还原验收报告：`docs/template-fidelity-report.md`
- 账号与云同步设计、接口与安全：`docs/account-sync-prd.md`
- 分享链接设计、密码、有效期与撤销：`docs/share-prd.md`
- 多份简历与版本历史：`docs/multi-resume-version-prd.md`
- 多页排版算法与边界：`docs/multi-page-prd.md`
