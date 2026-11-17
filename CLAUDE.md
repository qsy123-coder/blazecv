# BlazeCV 项目说明与验收标准

本文件是项目级指令，任何在本仓库的改动都必须满足下列验收标准。

## 项目本质

在线简历工具的**模板 1:1 还原**：抓取原站（wondercv.com）模板页的真实 DOM + CSS，
用语义绑定把用户内容填入，预览与导出必须和原站视觉一致。

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
   拖到最左侧（单列，左栏 <480px）时显示粘性 Tab 栏（基本信息/内容检查/排版与主题/模块内容），
   点击平滑定位到对应卡片并同步高亮，避免用户在长表单里来回滚动。

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

## 已知边界

- 编辑型 Word（文字版）是结构化重排，不追求模板逐像素；逐像素用图片版。
- 部分模板版式本身不含「所在城市 / 教育经历」等模块，属模板设计，不是数据丢失。
- 全量 4127 张逐像素审计耗时较长且受内存限制，需分批。
