# wondercv-crawler

采集 [超级简历 WonderCV 模板库](https://www.wondercv.com/jianlimoban/) 的全部模板，输出 blazecv 可直接消费的数据集。

采集内容：

| 数据 | 说明 | 位置 |
| --- | --- | --- |
| 模板列表 | token / 名称 / 标签 / 简介 / 热度 / 会员标记 | `data/list.json` |
| 模板详情 | 官方接口原始响应，含 `cv_data`（示例简历全量内容） | `data/details/{token}.json` |
| 版式配置 | `format_info`：纸张、字体、字号、主题色、页边距、模块样式、顶部样式等 | 详情内 / 索引 / 导出 |
| 预览图 | 模板整页预览 PNG（2382×3546） | `data/images/{token}.png` |
| 索引 | 归一化后的模板元数据 + 版式 + 内容模块计数 | `data/index.json` |
| 导出集 | blazecv 数据集（完整 / 精简 / 统计） | `dist/` |

当前模板总量约 **4100+**（列表接口 20 条/页，页数会随站点更新变化，脚本自动读取 `page_count`）。

本次全量采集快照（2026-11-16）：

- 模板 4127 个（207 页），详情 4127 份，`format_info` 覆盖率 100%
- 预览图 4126 张（1 个源图 404），详情 250 MB，图片 2.7 GB
- 导出 `dist/templates.json` 47 MB，`templates-lite.json` 6.6 MB
- 耗时 18m29s，8455 次请求，约 2.9 GB 传输

## 快速开始

要求 Node.js >= 18（本机 26.x 已验证），零第三方依赖。

```bash
cd tools/wondercv-crawler

# 1. 配置会员 cookie（见下一节）
#    编辑 config.json，把 _t 的值填进 auth.token

# 2. 全量采集（列表 + 详情 + 预览图 + 索引）
node src/crawl.js

# 3. 导出 blazecv 数据集
node src/export.js
```

只想要数据和版式、不下载几 GB 预览图：

```bash
node src/crawl.js --no-images
node src/export.js
```

## 配置会员态（`_t`）

站点登录态保存在 Cookie `_t`（JWT）。采集器会同时把它放进 `Authorization` 和 `Cookie` 请求头，
用于解锁会员模板、记录 `unlock` 状态。

1. 浏览器登录 https://www.wondercv.com
2. F12 → Application（应用）→ Cookies → `https://www.wondercv.com`
3. 复制 `_t` 的值（`eyJ...` 开头）
4. 写入 `config.json`：

```json
{ "auth": { "token": "eyJhbGciOi...." } }
```

也可以用环境变量，避免 token 落盘：

```bash
# Git Bash
WONDERCV_TOKEN='eyJ...' node src/crawl.js
# CMD
set WONDERCV_TOKEN=eyJ... && node src\crawl.js
# PowerShell
$env:WONDERCV_TOKEN='eyJ...'; node src\crawl.js
```

token 过期后接口会返回 401 / 未登录态，重新复制即可。匿名态也能抓到公开模板的元数据和
`cv_data`，会员态用于确保会员模板完整。

## 命令行参数

| 参数 | 作用 |
| --- | --- |
| `--config <file>` | 指定配置文件，默认 `config.json` |
| `--token <jwt>` | 直接传入 `_t`，优先级高于配置文件 |
| `--list-only` | 只抓模板列表 |
| `--index-only` | 不联网，只根据已有详情重建 `data/index.json` |
| `--no-images` | 跳过预览图下载 |
| `--no-details` | 跳过详情（配合已有数据） |
| `--with-blog` | 详情里附带 `article_content` 写作建议（体积明显变大） |
| `--max-pages <n>` | 限制列表页数（调试用） |
| `--max-items <n>` | 限制处理的模板数（调试用） |
| `--concurrency <n>` | 并发数，默认 4 |
| `--delay <ms>` | 全局请求间隔，默认 120ms |
| `--force` | 强制重抓已存在的详情/图片 |
| `--force-list` | 强制刷新列表缓存 |
| `--quiet` | 关闭进度输出 |

## 断点续爬

- 列表缓存到 `data/list.json`，存在即复用；`--force-list` 刷新。
- 详情/图片按 `{token}` 命名，已存在且非空自动跳过，中断后直接重跑原命令。
- 单条失败不会中断整体，记录到 `data/failed.jsonl`；重跑会自动补抓失败项。
- 日志追加写入 `data/crawl.log`。

## 输出结构

```
tools/wondercv-crawler/
├─ config.json            # 你的配置（含 token，勿提交）
├─ data/
│  ├─ list.json           # 列表快照
│  ├─ details/{token}.json# 官方详情原始响应
│  ├─ images/{token}.png  # 预览图
│  ├─ index.json          # 归一化索引
│  ├─ failed.jsonl        # 失败记录
│  └─ crawl.log
└─ dist/
   ├─ templates.json      # 完整数据集（含示例内容）
   ├─ templates-lite.json # 仅元数据 + format_info
   ├─ templates.csv       # 模板清单（Excel 可直接打开，UTF-8 BOM）
   └─ summary.json        # 标签 / 语言 / 主题色统计
```

`templates.json` 单条结构：

```json
{
  "token": "d9d0ec05a0515f93",
  "cvToken": "ZxMygqMP",
  "name": "应届生通用简历模板",
  "desc": "…",
  "lang": "cn",
  "tags": ["应届生简历模板", "实习"],
  "preview": "../data/images/d9d0ec05a0515f93.png",
  "format": {
    "body_format": "two_line",
    "font": "font-3",
    "font_size": 12,
    "theme_color": "#dc2127",
    "title_color": "#4183FF",
    "head_format": "body_center",
    "head_module_format": "circle",
    "module_format": "neat-flat",
    "page_size": "a4",
    "page_margin": 5,
    "line_spacing": 15,
    "top_format": "fancy",
    "skill_format": "icon",
    "pattern": "https://logo.wondercv.com/banners/pfiKdscjwCzEad0.png",
    "pattern_position": "right",
    "pattern_type": "circle"
  },
  "content": {
    "mode": "pdf",
    "profile": { "…": "性别/学历/城市等示例字段" },
    "basicInfo": { "…": "各模块标题文案" },
    "edus": [], "works": [], "orgs": [], "opus": [],
    "customSections": [ { "category": "personal_summary", "section_title": "自我总结", "infos": [] } ],
    "others": { "skill": {}, "language": {}, "certificate": {}, "interest": {}, "other": {} },
    "submoduleInfo": { "…": "模块顺序与标题" }
  }
}
```

导出时会自动剔除账号相关字段（邮箱/手机号/头像/内部 id/时间戳/预测缓存），保留模板本身需要的
版式配置、模块标题、示例文案和结构化经历。

## 在 blazecv 中使用

- 模板选择页：读 `dist/templates-lite.json`，用 `preview` 展示卡片，`format.theme_color` 做主题色。
- 版式渲染：`format` 字段与 blazecv 的模板配置做一次映射（`page_size`、`font_size`、`page_margin`、
  `line_spacing`、`body_format`、`head_format`、`module_format`、`top_format`、`skill_format`、
  `pattern*` 等）。
- 新建简历：把 `content` 作为示例数据或空白模板的初始结构。

## 资源占用参考

- 详情：约 4100 份 × 65 KB ≈ **260 MB**
- 预览图：约 4100 张 × 1.5 MB ≈ **6 GB**（`--no-images` 可跳过）
- 耗时：4 并发 + 120ms 间隔，详情约 15–25 分钟；图片取决于带宽。

## 常见问题

**图片返回 200 但 0 字节**：预览图 CDN 校验 Referer。采集器默认带
`Referer: https://www.wondercv.com/jianlimoban/`，自己写脚本时也要带上。

**接口 404 `no Route matched`**：路径必须带 `/cv` 前缀，即
`https://api.wondercv.com/cv/v3/sample_cvs`。

**列表 page_size 不生效**：参数名是 `size`，服务端上限 20，传更大值也按 20 返回。

**频繁失败 / 429**：调大 `--delay`（例如 300）、降低 `--concurrency`（例如 2），失败项重跑会自动补抓。
