# 在线简历网站（BlazeCV）PRD

> 状态：待确认　｜　参考：https://www.wondercv.com/cvs　｜　仓库：`F:\Projects\blazecv`（greenfield，无可复用实现）

## 背景与问题

国内求职者做简历的真实卡点不在“写内容”，而在“排得出来”：

- Word 调间距、分页、对齐耗时，改一行全乱；
- 网上下载的模板转成自己的内容后格式崩坏；
- 导出 PDF 字体乱码、页尾多出空白页、投递端打开样式不一致；
- 应届生不知道简历该多长、模块怎么排，写完没人给结构反馈。

参考站点 WonderCV 验证了这条路：模板 + 左表单右预览 + 一键导出，把“排版”从用户手里拿走。V1 复刻这条最短链路，不复制它的会员、AI 诊断和投递体系。

## 目标 / 非目标

### 目标（V1）

1. 用户无需注册，打开即编辑；
2. 10 分钟内从空白到导出可投递的简历（PDF / PNG / Word）；
3. 模板切换不丢数据，排版与导出结果一致；
4. 数据默认只存在本机，可自行导出 JSON 备份与迁移；
5. 可自托管部署（自有服务器，Docker + nginx，Postgres 预留）。

### 非目标（V1 明确不做）

- 账号、登录、云同步、（V1 不启用 Postgres 存简历）
- 支付、会员、水印、模板付费墙
- AI 润色、简历评分、JD 匹配、ATS 解析
- 分享链接 / 个人主页 / 投递追踪
- 自动多页排版（V1 单页，超出给明确提示）
- 英文简历与双语切换
- 手机端编辑（移动端只保证预览可读，给出桌面端提示）
- 第三方埋点与任何 PII 上报

## 用户故事

| # | 角色 | 故事 | 验收信号 |
|---|---|---|---|
| U0 | 求职者 | 我想先浏览不同风格的模板，再决定用哪套 | 首页展示 48 套模板与 7 种分类，点击后进入编辑器并应用所选模板 |
| U1 | 应届生 | 我想用现成结构快速填完一份单页简历 | 新用户 30 秒内看到示例内容，清空后开始填 |
| U2 | 社招用户 | 我想调整模块顺序、隐藏不想展示的模块 | 拖拽排序后预览即时更新，刷新后保持 |
| U3 | 求职者 | 我想把简历换成更合适的模板而不重填 | 切换模板后所有字段与顺序不变 |
| U4 | 投递者 | 我要按对方要求交付 PDF、图片或 Word | 三种格式导出成功且内容一致 |
| U5 | 谨慎用户 | 我不想简历上传到任何服务器 | 断网状态下编辑与导出仍可用 |
| U6 | 换机用户 | 我想把简历带到另一台电脑继续改 | 导出 JSON 后导入可完整还原 |
| U7 | 手滑用户 | 我误删了一段经历想恢复 | 撤销/重做覆盖 ≥ 50 步 |

## 方案设计

### 总体架构

```
浏览器（数据与渲染主体）
├─ Next.js App Router（静态优先，V1 无服务端数据接口）
├─ 编辑器：Zustand 状态树 + 命令栈（undo/redo）
├─ 预览：与导出同源的 React 模板组件（A4 DOM）
├─ 存储：IndexedDB（Dexie），版本化 JSON Schema
└─ 导出：打印 DOM → PDF ｜ html-to-image → PNG ｜ docx → Word

自有服务器
├─ nginx → Next.js standalone（Docker）
├─ Postgres 容器（V1 仅建库与迁移占位，不接业务）
└─ 可选：Playwright 渲染服务（V2 批量/分享链接时启用）
```

**关键取舍**

| 决策 | 选择 | 备选与不选原因 |
|---|---|---|
| 数据层 | IndexedDB + JSON 导入导出 | Supabase Cloud（用户明确不用）；账号云同步（超出 V1 范围）。本地优先让“断网可用、零隐私外发”成为卖点 |
| PDF 生成 | 浏览器打印（`window.print()` + A4 打印样式） | 服务端 Playwright PDF 一致性好，但 V1 增容器依赖与冷启动成本；预览 DOM 即打印 DOM，天然同源 |
| 图片导出 | `html-to-image` 截取 A4 节点，2x DPR | Canvas 手绘成本高；截图与预览同源，不做二次排版 |
| Word 导出 | `docx` 库从结构化数据生成 | HTML→Word 兼容性差（分页/字体不可控）；结构化生成可保证“内容可编辑、版式近似”，并在 UI 明示差异 |
| 分页 | V1 单页 + 溢出检测 | Paged.js 自动分页在模板差异下不稳定；单页是中文简历主流，先把一页做到位 |
| 状态管理 | Zustand + 不可变命令栈 | Redux 样板重；Context 高频更新会拖垮预览 |
| 模板来源 | 自研 14 套 + 爬取版式元数据生成 34 套 + 开源布局参考（MIT/Apache/LPPL）+ StyleKit 设计输入 | 只转换 `format_info` 等版式参数，不搬运 HTML/CSS/预览图；生成脚本与来源可追溯 |
| 部署 | Next.js standalone + Docker Compose 自托管 | Vercel 不符合“接入自有服务器”；Postgres 先占位避免 V2 迁移返工 |

### 编辑器交互

- 页面结构：模板市场首页（`/`）→ 点击模板 → 编辑器（`/editor?template=<id>`）。已有简历保留全部内容，只切换模板；首页提供「继续编辑」入口。
- 左栏：模块化表单（个人信息 / 求职意向 / 教育 / 工作实习 / 项目 / 技能 / 证书 / 自定义模块）；
- 右栏：A4 实时预览（210×297mm），模板组件按 `templateId` 渲染；
- 模块操作：拖拽排序、显隐、重命名、复制、删除；
- 全局设置：模板、主色、字号（小/标准/大）、行距、页边距、头像开关；
- 顶部栏：撤销/重做、模板切换、预览（全屏）、导出（PDF/PNG/Word）、导入/导出 JSON、清空；
- 自动保存：变更后 500ms 落库，页面 `visibilitychange` 时强制落库；
- 溢出提示：内容超出 A4 时顶部出现“超出一页”黄条，标出溢出起始元素，建议缩字号/减模块（不自动截断）。
- 内容检查：本地规则评分（0–100），覆盖姓名/求职意向/联系方式、简介长度、经历要点数量与量化比例、技能组数、单页溢出；问题可定位并展开对应模块。规则在浏览器内执行，不上传内容。
- 模板画廊：按 7 种版式分组，支持筛选与热门/新模板标记。

### 模板（当前 48 套：14 套精选 + 34 套生成变体，7 种版式家族）

| 版式 | 模板 | 适用 |
|---|---|---|
| 单栏 | 极简黑白、紧凑单色、学术风 | 通用 / 科研 / 转行 |
| 浅色侧栏 | 商务蓝、技术岗、校招清新 | 社招 / 研发 / 应届 |
| 时间轴 | 时间轴经典、双栏时间轴 | 经历连续、项目多 |
| 通栏横幅 | 翡翠横幅、墨黑斜切 | 设计岗 / 内容岗 |
| 深色侧栏 | 暗夜侧栏 | 技术岗 / 产品 |
| 居中框线 | 左右分栏 | 通用 / 应届 |
| 编辑标签栏 | 杂志衬线、瑞士蓝 | 学术 / 品牌 |

模板以配置驱动：`layout`（single / sidebar / timeline / banner / dark-sidebar / split / editorial）+ `tokens`（颜色、字体、间距、标题样式），避免逐套硬编码 JSX。参考开源布局的调研见 `docs/template-research.md`。

另有全部模板库 `/templates`：4127 套采集模板，使用原预览图，点击后按 `format_info` 生成可编辑预设并写入 `ResumeDoc.templatePreset`。

### 模板来源与质量标准

**来源策略：自研为主，开源借鉴布局，商业模板只做灵感。**

| 来源 | 用途 | 授权/边界 |
|---|---|---|
| 自研设计系统 | 48 套模板的版式骨架与排版规则 | 自有资产，可长期迭代 |
| StyleKit MCP | 配色、字阶、间距、组件样式参考 | 仅作设计输入，不引入运行时依赖 |
| JSON Resume themes（npm） | 布局结构、信息层级参考 | 逐仓库核对 LICENSE，主流为 MIT；只借鉴结构，不复制 CSS/素材 |
| best-resume-ever（MIT）/ Reactive Resume（AGPL-3.0） | 横幅、深色侧栏、左右分栏、斜切页头等版式参考 | 仅研究公开布局与预览；不复制代码、样式或素材；AGPL 代码不进入本项目 |
| `sb2nov/resume`、`Deedy-Resume`、`Awesome-CV` | 单栏密度、时间轴、学术风布局思路 | 分别为 MIT / Apache-2.0 / LPPL；**不移植 LaTeX 引擎与模板文件** |
| 商业模板市场（Creative Market / Envato） | 仅视觉趋势调研 | 不复制；如需采购须 Extended License 且仅用于自有产品，不得转售模板 |
| 字体 | 正文与标题 | Noto Sans SC / 思源宋体（SIL OFL-1.1，可商用、可嵌入 PDF）；数字与西文 Inter / IBM Plex Sans（OFL） |
| 图标 | 联系方式、模块图标 | Lucide（ISC）/ Tabler（MIT） |

明确不做：抓取 WonderCV 的模板 HTML/截图做 1:1 复刻；搬运竞品模板；使用授权不明的字体或素材。

**质量门槛（每套模板必须全部通过，否则不上线）**

1. **排版系统**：8pt 基线网格；字号阶固定（姓名 21–30pt、模块标题 11.5–13pt、正文 9.5–10pt、辅助信息 8.5–9pt）；正文行高 1.45–1.6；页边距 14–18mm；中英混排加间距；数字用等宽字形。
2. **信息层级**：姓名 > 求职意向 > 模块标题 > 组织/职位 > 正文，任何一套模板不得出现层级倒置或同权重竞争。
3. **三档压测**：1/3 页、满页、超出一页，三种内容密度下均无重叠、无孤行、无孤标题（`break-inside: avoid`）。
4. **打印保真**：100% A4 预览与打印 PDF 逐项对照——边距、字号、颜色、头像位置一致，无空白尾页。
5. **视觉验收**：基线截图入库，两名评审人对照通过；与 WonderCV 同岗位模板并排评审，信息密度和可读性不得落后。
6. **字体渲染**：Windows / macOS 的 Chrome、Edge、Safari 各检查一次，中文不回退成宋体错位。

**生产流程**：设计 token → 7 种版式骨架 → 14 套精选手工变体 → 读取爬取 `format_info` 生成 34 套变体（配色/字体/密度/页头/标题样式）→ 三档压测 → 评审 → 基线截图入库。

### 视觉与设计 token

- 通过 StyleKit MCP（`https://www.stylekit.top/mcp`）取参考配色、字阶、间距与组件样式，落到 `src/design/tokens.ts`；
- 字体：`Noto Sans SC` + 系统回退；打包 woff2 子集，打印时由浏览器嵌入 PDF；
- 不引入运行时对 StyleKit 的依赖，仅作为设计输入。

## 数据与接口变更

### 数据模型（`schemaVersion: 1`）

```ts
type ResumeDoc = {
  schemaVersion: 1;
  id: string;
  title: string;            // 简历名称，如“后端开发-张三”
  templateId: TemplateId;   // 48 套之一
  theme: { primary: string; fontScale: 'sm'|'md'|'lg'; lineHeight: number; margin: number };
  basics: {
    name: string; jobTitle: string; phone: string; email: string;
    city: string; avatar?: string; links: { label: string; url: string }[];
  };
  sections: Section[];      // 顺序即展示顺序
  updatedAt: number;
};

type Section =
  | { id: string; type: 'summary';   title: string; visible: boolean; content: string }
  | { id: string; type: 'education'; title: string; visible: boolean; items: EducationItem[] }
  | { id: string; type: 'experience'|'projects'; title: string; visible: boolean; items: ExperienceItem[] }
  | { id: string; type: 'skills';    title: string; visible: boolean; items: SkillItem[] }
  | { id: string; type: 'certificates'|'custom'; title: string; visible: boolean; items: TextItem[] };

type ExperienceItem = {
  id: string; org: string; role: string; start: string; end: string;
  location?: string; bullets: string[]; tags?: string[];
};
```

### 本地存储

| Key | 内容 |
|---|---|
| `blazecv:resumes` | `{ id, title, updatedAt, doc }` 列表（V1 通常 1 份，结构预留多份） |
| `blazecv:active` | 当前 resume id |
| `blazecv:settings` | 最近使用的模板、上次导出格式 |

- 写入：Dexie 事务，500ms debounce；
- 迁移：`migrate(doc)` 按 `schemaVersion` 顺序升级，未知字段保留；
- 备份文件：`blazecv-<title>-<YYYYMMDD>.json`，含 `schemaVersion` 与完整 `ResumeDoc`。

### 接口

V1 无业务 API。Postgres 只建库：`blazecv`，预留表结构在 `infra/db/migrations/0001_init.sql`（users / resumes），V1 不读写。

## 边界与异常

| 场景 | 行为 |
|---|---|
| 首次访问 | 加载示例简历（标记“示例”），一键清空；不静默写入空数据 |
| 内容超出一页 | 黄条提示 + 预览中溢出元素标红边；导出时再次确认 |
| IndexedDB 不可用（隐私模式） | 降级为内存态 + 顶部常驻提示“刷新会丢失，请导出 JSON” |
| 存储配额不足 | 捕获 QuotaExceededError，提示导出 JSON 并清理旧数据；不丢当前编辑态 |
| JSON 导入损坏/版本过新 | 校验失败给出具体字段与版本，拒绝覆盖现有数据 |
| 图片过大（头像） | 客户端压缩至 ≤ 200KB / 512px，超限提示替换 |
| 字体未加载 | 预览与导出统一使用回退字体栈，避免导出后才变形 |
| 移动端 | 检测宽度 < 1024px 显示“建议在电脑端编辑”，预览只读可缩放 |
| 导出中刷新/关闭 | 导出为同步任务（PNG/Word），PDF 走打印对话框，不做后台任务 |
| 多标签页同时编辑 | `BroadcastChannel` 检测冲突，提示“另一标签页已更新，刷新以合并” |

## 验收标准

- [ ] 全新浏览器打开，无需注册，30 秒内可开始填写；示例数据可一键清空
- [ ] 首页展示 48 套模板，按 7 种版式分组，分类筛选可用；点击任意模板进入编辑器且模板已应用
- [ ] 已有简历时，首页显示「继续编辑」与上次编辑标题
- [ ] 48 套模板全部可切换，切换后字段、顺序、显隐状态零丢失
- [ ] 模块拖拽排序、显隐、重命名、增删生效，预览更新 ≤ 200ms
- [ ] 技能熟练度 1–5 可编辑与清除；深色侧栏、左右分栏按档位渲染技能条，未设置时不渲染伪造进度
- [ ] 内容检查实时评分，问题可定位并展开对应模块；规则全部在本地执行
- [ ] 模板画廊按版式分组，筛选后仅显示对应模板，当前模板有明确状态
- [ ] 撤销/重做 ≥ 50 步，覆盖文本、排序、显隐、模板切换
- [ ] 编辑后 500ms 内自动保存，刷新、关闭标签页重开均可恢复
- [ ] 内容超出一页时出现明确提示并定位溢出元素
- [ ] 超出一页时预览中用虚线标出首个越界模块，提示中显示模块名
- [ ] 多标签页同时编辑时，另一标签页保存后当前页出现「刷新载入」提示
- [ ] 导出 PDF：A4 210×297mm、单页、无空白尾页、文字可选中、中文无乱码、与预览一致
- [ ] 导出 PNG：2x DPR、无裁切、背景与预览一致
- [ ] 导出 Word：Word 与 WPS 均可打开，文字内容完整可编辑，版式近似且导出前有差异说明
- [ ] 导出 JSON 后清空本地数据，再导入可 100% 还原（含模板、主题、顺序）
- [ ] 断网状态下（首次加载后）编辑与三种导出均可用
- [ ] 页面无第三方埋点、无简历内容外发；生产构建中无 Supabase/分析 SDK
- [ ] 桌面端 1280×800 及以上布局不重叠、不横向滚动
- [ ] 自托管：`docker compose up` 后 nginx 可访问，Postgres 健康检查通过（业务不依赖）

## 测试计划

**单元测试（Vitest）**
- Schema 校验与迁移：v1→未来版本、字段缺失、未知字段保留；
- docx 生成器：给定 `ResumeDoc` 断言 `document.xml` 中模块标题与条目文本齐全、顺序正确；
- 溢出测量函数：构造刚好一页 / 超 1 行的内容，断言检测结果；
- JSON 导入校验：损坏文件、错误版本、非法模板 id 的拒绝路径。

**组件测试（Testing Library）**
- 编辑器表单输入 → 预览同步；
- 模块拖拽后顺序变化；
- 模板切换后内容映射；
- 撤销/重做状态栈。

**E2E（Playwright）**
1. 打开 → 清空示例 → 填写 → 选模板 → 刷新恢复 → 导出 PDF（用 `pdf-parse` 断言页数与关键文本）；
2. 导出 PNG（断言尺寸 1588×2246 ± 2）与 Word（解压 `word/document.xml` 断言文本）；
3. 导出 JSON → `indexedDB.deleteDatabase` → 导入 → 断言字段一致；
4. 断网（`context.setOffline`）→ 编辑与导出仍成功；
5. 关闭再开新标签页 → 数据恢复。

**人工验收**
- 48 套模板逐一用 1 页、1 页满、超页三种内容检查；
- Chrome / Edge / Safari 各导出一次 PDF，检查分页与字体。

## 分期

| 阶段 | 内容 | 出口条件 |
|---|---|---|
| P0 骨架 | Next.js + TS + Tailwind + shadcn/ui、设计 token、数据模型、Dexie、示例数据 | 本地可跑，类型与 lint 通过 |
| P1 编辑器 | 模块表单、拖拽排序、显隐、实时预览、undo/redo、自动保存 | 单模板下 U2/U7 可用 |
| P2 模板 | 48 套模板 + 主题设置 + 溢出检测 | 模板切换零丢失，溢出提示准确 |
| P3 导出 | PDF / PNG / Word + JSON 导入导出 + 异常态 | 验收清单 1–11 全绿 |
| P4 部署 | Dockerfile + compose（nginx / next / postgres）+ 健康检查 + 回滚说明 | 服务器可访问，`docker compose up` 一次成功 |

**V2 进展**：
- 账号与云同步已实现（Postgres / PGlite、邮箱密码、多份云端简历、手动保存与载入），详见 `docs/account-sync-prd.md`。
- 公开分享链接已实现（只读 `/r/<token>`、访问密码、有效期、快照更新、撤销），详见 `docs/share-prd.md`。
- 多份简历与历史版本已实现（本地列表、复制/删除、自动与手动版本、恢复），详见 `docs/multi-resume-version-prd.md`。
- 多页排版已实现（测量式自动分页、多页 PDF、逐页 PNG、分享页分页），详见 `docs/multi-page-prd.md`。

**V2 后续候选**：邮箱验证与找回密码、版本历史云端同步、手动分页符、AI 诊断、模板市场与付费。完整优先级、验收与依赖见 `docs/roadmap.md`。

## 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 |
|---|---|---|
| 打印导出与预览不一致 | 核心体验失败 | 预览 DOM 与打印 DOM 同节点；用打印媒体查询只做尺寸适配，不做结构重排 |
| 用户电脑缺中文字体 | PDF 乱码/替换 | 打包 woff2 子集并由浏览器嵌入；回退至系统字体栈 |
| Word 版式差异 | 用户预期落空 | UI 明示“Word 为可编辑近似版”；docx 仅做 2 套布局映射 |
| IndexedDB 被清理 | 数据丢失 | 自动保存 + 顶部“上次导出备份”提醒；JSON 可迁移 |
| 自托管部署失败 | 无法上线 | 版本化镜像 tag，`docker compose` 回滚至上一 tag；Postgres 卷备份 `pg_dump`（V1 无业务数据） |

- 本阶段无数据库写入、无不可逆数据操作；上线回滚只需切换镜像 tag。
- `.env.production` 仅含部署地址，不含任何密钥（V1 无第三方服务）。

## 待确认

1. 模板采用“自研 + 开源布局参考”策略，是否再加预算委托设计师打磨 2 套旗舰模板（会拉长 P2 约 1–2 周，但决定第一印象）；
2. Word 导出接受“内容可编辑、版式近似”的定位；
3. 验收口径以本清单第 1–14 条为准，通过后进入实现。
