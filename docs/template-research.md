# 开源简历模板调研

> 目标：解决“模板只是换色”的问题。只参考公开的布局结构与视觉思路，不复制代码、样式表或图片资源；所有模板均为本项目原创实现。

## 调研对象

### 1. best-resume-ever（MIT）

- 仓库：https://github.com/salomonelli/best-resume-ever
- 许可证：MIT（`package.json` 声明，已核对）
- 已研究的模板：Side Bar、Left Right、Material Dark、Oblique、Cool、Creative
- 布局特征：
  - **Side Bar**：浅色双栏，头像与联系方式在左，经历在右，技能用圆角胶囊。
  - **Left Right**：姓名居中并加框线，头像居中，正文 44% / 44% 左右分栏；右栏教育 + 技能条。
  - **Material Dark**：深色左栏放头像、图标式联系方式与技能进度条，右栏白底正文。
  - **Oblique**：深色斜切/三角形页头，姓名与职位在页头，正文单栏；技能用箭头前缀。
  - **Cool / Creative**：彩色页头横幅 + 彩色侧栏，头像跨区，技能胶囊。
- 借鉴点：页头形态、左右分栏、深色侧栏、技能条、头像位置。
- 未借鉴：代码、字体包、图标库与预览图片。

### 2. Reactive Resume（AGPL-3.0，仅研究）

- 仓库：https://github.com/AmruthPillai/Reactive-Resume
- 许可证：AGPL-3.0（未复制任何代码，仅阅读公开模板清单与说明）
- 模板家族：Azurill、Bronzor、Chikorita、Ditto、Gengar、Glalie、Kakuna、Lapras、Leafish、Onyx、Pikachu、Rhyhorn 等 16 套。
- 关键结论：每套模板是**独立版式**（页头、分栏、时间轴、侧栏结构不同），不是同一版式换色。模板数量本身不构成竞争力，版式家族数量才是。

### 3. JSON Resume 主题（MIT）

- 主题库：https://jsonresume.org/themes
- 代表作：
  - `jsonresume-theme-even`（https://github.com/rbardini/jsonresume-theme-even）：CSS Grid、扁平单栏、Markdown 支持，`resume-cli` 默认主题。
  - `jsonresume-theme-stackoverflow`：侧栏 + 打印友好。
  - `jsonresume-theme-elegant`：经典单栏、强调排版节奏。
- 借鉴点：同一份数据通过不同网格和页头组织；单栏也可以靠字阶与留白做出品质。

## 采用后的版式家族

| 版式家族 | 来源灵感 | 本项目模板 |
|---|---|---|
| 单栏 + 页头线 | JSON Resume even / elegant | 极简黑白、紧凑单色、学术风 |
| 浅色侧栏 | best-resume-ever Side Bar | 商务蓝、技术岗、校招清新 |
| 时间轴 | 常见 CV 时间轴 | 时间轴经典、双栏时间轴 |
| 通栏横幅 / 斜切页头 | best-resume-ever Green、Purple、Oblique | 翡翠横幅、墨黑斜切 |
| 深色侧栏 + 技能条 | Material Dark、Cool | 暗夜侧栏 |
| 居中框线 + 左右分栏 | Left Right | 左右分栏 |
| 编辑栏目标签 + 巨大姓名 | 杂志排版 / JSON Resume editorial | 杂志衬线、瑞士蓝 |

## 数据与交互配套

- `SkillItem.level`（1–5）为可选字段；技能条只在该字段存在时渲染，不伪造熟练度。
- 编辑器提供 5 点熟练度控件，可清除。
- 窄栏模板（左右分栏）启用 `stackedEntries`：日期换行到标题下方，避免挤压长学校名/专业名。

## 爬取数据扩充（2026-11-16）

数据源：`tools/wondercv-crawler`（本机采集，未随产品分发）。

- 详情 JSON 4127 份，预览 PNG 3122 张
- 只读取 `sample_cv` 的名称/描述/标签/使用人数与 `cv_data.format_info` 的版式参数
- **未使用**模板 HTML、CSS、预览图、简历正文与账号字段
- 生成 34 套变体，与现有 14 套精选合计 48 套

### 字段映射

| 爬取字段 | 本项目 token / 决策 |
|---|---|
| `body_format` / `head_format` | 页头对齐（left / center）、单栏基础 |
| `head_module_format` | 侧栏、分栏、编辑标签、深色侧栏的版式提示 |
| `module_format` | 侧栏 / 分栏 / 时间轴 / 标签栏 |
| `pattern_type` / `pattern_position` | 横幅斜切、深色侧栏、留白节奏 |
| `font` / `font_size` | 无衬线 / 衬线、正文 9.8–10.5pt |
| `title_color` / `head_module_color` / `top_line_color` | 主色（自动校正对比度） |
| `line_spacing` | 紧凑模式（模块/条目间距） |
| `name` / `desc` / `tags` | 用途标签、展示名（用途 · 颜色 · 版式） |
| `people_count` | 同一版式内的代表模板选择 |

### 版式分配

单栏 6、侧栏 7、时间轴 2、横幅 5、深色侧栏 4、居中框线 5、编辑标签 5；与精选合并后为单栏 9、侧栏 10、时间轴 4、横幅 7、深色 5、分栏 6、标签 7。

### 生成方式

```bash
node scripts/generate-wondercv-templates.mjs tools/wondercv-crawler src/lib/templates.generated.ts
```

- 脚本只读本地 JSON，不执行爬虫代码、不访问网络
- 生成文件 `src/lib/templates.generated.ts` 保留来源 token 与名称
- 首页/模板面板使用懒加载缩略图，避免 48 套同时渲染

### 全部模板库（4127 套）

```bash
node scripts/build-template-catalog.mjs tools/wondercv-crawler .
```

- 读取全部详情，生成 `public/template-catalog.json`（4127 条，含版式、token、标签、来源）
- 3122 张原预览 PNG（794×1107）经 sharp 转为 **720px WebP**，输出 `public/template-thumbs/<token>.webp`
- 页面 `/templates`：原预览图、版式/用途筛选、搜索、分页（48/页）
- 点击模板：优先进入原站 DOM/CSS 渲染；无静态页面时回退到 `format_info` 映射预设
- **1:1 的范围**：缩略图与原图一致；编辑器已抓取原站模板页的真实 `#cv-container` + 13 个 CSS 分片，字段实时绑定到语义 DOM，详见下节
- 原图仅用于本地模板库展示；不重新分发为独立素材包

### 示例内容占位

`cv_data` 已随详情抓取，构建时转换为 `ResumeDoc` 占位内容：

| cv_data | ResumeDoc |
|---|---|
| `profile` / `basic_info` | 姓名、职位、电话、邮箱、城市、链接 |
| `edus` | 教育经历 |
| `works` | 工作经历（HTML 描述转要点） |
| `custom_sections.project_experience` / `reasearch_experience` | 项目经历 |
| `orgs` | 社团和组织经历（experience 模块） |
| `custom_sections.personal_summary` | 个人总结 |
| `custom_sections.honor` / `others.certificate` | 证书与荣誉 |
| `others.skill` | 专业技能 |
| `others.language` / `others.interest` | 语言、兴趣（custom 模块） |
| `opus` | 作品集 |
| 其他 `custom_sections` | 自定义模块 |

- 输出 `public/template-content/<token>.json`
- 目录条目带 `content` 字段；点击「使用此模板」时拉取并填充，若缺失则回退空白模板
- 填充后自动执行一页适配：按行距 → 页边距 → 字号 → 模块间距压缩；仍超出时启用 70%–95% 额外缩放，尽量让示例内容落在单页
- 示例内容来自采集站模板本身的样例数据，含其示例姓名/联系方式；用于占位，不保证真实
- 重新生成：`node scripts/build-template-catalog.mjs tools/wondercv-crawler .`

### 原站 DOM/CSS 1:1 渲染

> 2026-11-16 起，编辑器不再只用 7 种映射版式渲染模板库模板。

- 原站模板页 URL：`https://www.wondercv.com/jianlimoban/<token>.html`，Nuxt SSR 输出真实 `#cv-container`
- 页面依赖 13 个 CSS 分片（含 initial 11 个 + JS 注入的 `235630d.css`、`359aa32.css`）；合并为
  `public/wondercv-assets/template-base.css`（约 980KB），图标字体本地化为 `iconfont.woff2`
- 批量抓取脚本：`node scripts/capture-all-template-pages.mjs tools/wondercv-crawler .`
  - 只读 SSR HTML，不执行站点 JS
  - 输出 `public/template-pages/<token>.html`；统一 A4 宽度 794px，并修正 `.cover` 图层顺序
  - 失败页面回退映射版式，不影响其他模板
- 语义绑定：`src/lib/exact-template.ts`
  - `.user-name`、`.profile-item`、`.option.personal_summary/works/edus/project_experience/orgs/honor/extras`
  - `.section-item-container` 克隆/删除；`.menu-title` 左右字段；`.menu-content ul li` 要点
  - 技能/语言/自定义模块写入 `.extras-icon-item`，保留模板图标
  - 一页适配：优先 `fontsize-12/lineH-15`，逐步压缩到 `10/12`；仍超出时对 `.main` 做 zoom-to-fit
- 渲染入口：`src/components/preview/ExactTemplatePreview.tsx`（同源 iframe + 实时重绑）
  - 编辑器右侧、分享页、打印、PNG 导出均使用同一渲染
  - 模板切换/字段修改/增删条目会重新绑定，不改动抓取文件
- 验收边界：
  - **与线上模板页 DOM/CSS 一致**；封面 PNG 是独立的 720×1019 营销/导出图，与页面 794×1123 渲染存在页头高度与缩放差异，不能同时作为两套基准
  - Word 导出仍是结构化映射；PDF 走原站渲染打印页
  - 页面中的示例头像/图案仍引用原站 CDN；离线使用需另行本地化资源

## 许可结论

- 布局思路不受著作权保护；本项目未复制上述仓库的源代码、样式或素材。
- 字体仍使用 OFL 授权的 Noto Sans SC / Noto Serif SC / Inter / IBM Plex Sans。
- 若后续直接复用某个 MIT 主题的 CSS，需在仓库中保留其版权与许可声明；AGPL 项目代码不进入本项目。
