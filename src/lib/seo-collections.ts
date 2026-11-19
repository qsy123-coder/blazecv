import type { CatalogFile, CatalogTemplate } from "./catalog";

/**
 * Server-side helpers for SEO landing pages built from the template catalog.
 * Tag pages target real search intent ("应届生简历模板", "银行简历模板", ...)
 * using inventory that actually exists in the catalog, so each page has
 * unique, non-doorway content and a real list of templates.
 */

export const LAYOUT_LABELS: Record<string, string> = {
  single: "单栏",
  sidebar: "侧栏",
  timeline: "时间轴",
  banner: "横幅",
  "dark-sidebar": "深色侧栏",
  split: "分栏",
  editorial: "编辑标签栏",
};

export const LAYOUT_KEYS = Object.keys(LAYOUT_LABELS);

export const LAYOUT_COPY: Record<string, { summary: string; tips: string[] }> = {
  single: {
    summary:
      "单栏简历模板自上而下排列教育、工作、项目与技能，没有左右分栏，阅读顺序最接近招聘方的浏览习惯，也最不容易被 ATS 解析出错。",
    tips: [
      "工作或实习经历按时间倒序排列，最近的一段放最前面。",
      "每段经历用「动词 + 事情 + 结果」写 2–4 条要点，能量化就写数字。",
      "技能与证书放在最后一栏，避免挤占经历部分的版面。",
    ],
  },
  sidebar: {
    summary:
      "侧栏简历模板把联系方式、技能、证书等辅助信息收进窄栏，主栏留给经历与项目，版面层次清楚，适合内容较多的求职者。",
    tips: [
      "侧栏只放短信息（技能、工具、证书），长段落放进主栏。",
      "主栏宽度变窄后每行字数减少，要点控制在两行以内。",
      "投递前确认侧栏文字在 A4 打印时没有被裁切。",
    ],
  },
  timeline: {
    summary:
      "时间轴简历模板用纵向时间线串起教育和工作经历，时间跨度与先后顺序一眼可见，适合同一行业连续发展或经历较完整的求职者。",
    tips: [
      "时间节点写到月份即可，避免出现无法解释的空档。",
      "每段经历只保留与目标岗位相关的 2–3 条要点。",
      "如果经历较少，可以把校园项目和实践补充到时间线上。",
    ],
  },
  banner: {
    summary:
      "横幅简历模板在页首用整条色块承载姓名、职位与联系方式，视觉重心明确，适合设计、市场、运营等需要展示个人风格的岗位。",
    tips: [
      "横幅里的职位名称与投递岗位保持一致，方便 HR 快速匹配。",
      "主色不要超过两种，避免打印后发灰。",
      "正文部分保持单栏阅读顺序，保证信息可被系统解析。",
    ],
  },
  "dark-sidebar": {
    summary:
      "深色侧栏简历模板用深色区块突出个人信息与技能标签，对比强、辨识度高，适合互联网、设计、游戏等行业。",
    tips: [
      "深色区域只放短文本，长段落放在浅色主栏。",
      "投递传统行业或国企时，优先选择颜色更克制的模板。",
      "导出 PDF 前检查深色底上的小字是否仍然清晰。",
    ],
  },
  split: {
    summary:
      "分栏简历模板把版面切成左右两块，信息密度高、视觉节奏强，适合经历丰富且需要在一页内呈现较多内容的求职者。",
    tips: [
      "左右两栏的信息要分主次，不要把同一段经历拆到两边。",
      "控制每栏的行数，避免一栏过长、一栏留白。",
      "内容超出 A4 时优先删减次要要点，而不是继续缩小字号。",
    ],
  },
  editorial: {
    summary:
      "编辑标签栏简历模板用标签式的模块标题组织内容，版式接近杂志排版，适合媒体、内容、品牌与创意类岗位。",
    tips: [
      "模块标题保持统一，不要混用多种标签样式。",
      "标签本身不承载信息，关键内容仍要写在正文里。",
      "投递前用 A4 预览确认标签栏没有压到正文。",
    ],
  },
};

export const TAG_COPY: Record<string, { summary: string; tips: string[] }> = {
  应届生: {
    summary:
      "应届生没有正式工作经验，简历的重点是教育背景、实习、校园项目与可迁移技能。这一组模板把学校、专业、绩点和项目放在靠前位置，方便 HR 在几秒内判断匹配度。",
    tips: [
      "把实习和校园项目当成工作经历来写，写清楚职责、动作和结果。",
      "绩点、排名、奖学金只在确实有优势时展示。",
      "求职意向写具体岗位，不要只写「相关岗位」。",
    ],
  },
  校招: {
    summary:
      "校招简历需要在网申系统和人工筛选之间取得平衡：关键词要全，版面要清楚。这一组模板保留了标准模块顺序，方便批量投递不同公司时快速替换内容。",
    tips: [
      "按岗位 JD 调整技能关键词，但不要编造不会的工具。",
      "一页优先，经历特别丰富时最多两页。",
      "投递不同公司前，替换求职意向与项目排序。",
    ],
  },
  实习: {
    summary:
      "实习简历的重点是证明你能快速上手：课程项目、社团经历、工具熟练度和可到岗时间都比空泛的自我评价有用。",
    tips: [
      "写清楚可实习的时间段与每周可到岗天数。",
      "项目里说明你具体负责的部分，而不是团队整体成果。",
      "没有实习经历时，用课程设计、竞赛或开源项目补位。",
    ],
  },
  实习生: {
    summary:
      "面向实习生岗位的简历模板，突出在校时间、项目经历与基础技能，版面简洁，方便招聘方快速确认到岗条件。",
    tips: [
      "联系方式、学校、专业、年级放在页首。",
      "技能栏只写岗位真正会用到的工具。",
      "用一页完成，避免把高中经历也写进去。",
    ],
  },
  社招: {
    summary:
      "社招简历看的是最近一段工作的职责与成果。这一组模板把工作经历放在最前，弱化校园信息，适合 1–10 年经验的求职者。",
    tips: [
      "最近两段工作写详细，早期经历一笔带过。",
      "用数字说明业务规模、增长幅度或效率提升。",
      "离职原因、薪资期望不必写进简历正文。",
    ],
  },
  跳槽: {
    summary:
      "跳槽简历要解释「为什么换」和「能带来什么」。模板强调连续的工作成果与技能迁移，帮助你在同行业或跨行业转岗时说清楚价值。",
    tips: [
      "把与目标岗位最接近的项目放到最前面。",
      "跨行业时，用技能和成果建立可迁移性。",
      "空档期可以用学习、自由职业或家庭原因简短说明。",
    ],
  },
  大学生: {
    summary:
      "大学生简历模板适合没有全职经验的在校生，重点呈现教育背景、课程项目、社团与竞赛经历，版面清爽、信息集中。",
    tips: [
      "项目描述写清楚背景、你的动作和最终结果。",
      "社团经历突出组织、协调和落地能力。",
      "证书与技能按与岗位的相关度排序。",
    ],
  },
  金融: {
    summary:
      "金融行业简历普遍偏保守：单栏、深色文字、少装饰，重点看院校、专业、证书与实习机构。这一组模板保留了行业常见的稳重版式。",
    tips: [
      "把 CFA、CPA、FRM 等证书放在显眼位置。",
      "实习经历写清楚项目规模、数据和使用的模型。",
      "避免花哨配色，黑白灰或深蓝更稳妥。",
    ],
  },
  银行: {
    summary:
      "银行校招和社招都偏好规范、克制的版式。模板突出教育背景、金融相关实习、证书与客户服务经验，适合柜员、客户经理、管培生等岗位。",
    tips: [
      "管培生岗位突出轮岗意愿与学习能力。",
      "客户经理岗位写清楚客户规模与业绩指标。",
      "证书、党员信息、学生干部经历按岗位需要保留。",
    ],
  },
  互联网: {
    summary:
      "互联网岗位节奏快、看重结果。这一组模板强调项目、数据指标与工具栈，版式简洁，方便在简历筛选系统中被快速读取。",
    tips: [
      "用「指标 + 动作 + 结果」描述项目，避免只写职责。",
      "技术岗写清楚语言、框架、中间件和部署环境。",
      "一页优先，作品集用链接放在联系方式附近。",
    ],
  },
  程序员: {
    summary:
      "程序员简历的核心是技术栈、项目复杂度与工程结果。模板把技能、项目和技术关键词放在靠前位置，方便面试官快速判断技术匹配度。",
    tips: [
      "技术栈按熟练程度分组，不要罗列所有听过的名词。",
      "项目写清楚架构、你负责的模块和性能/稳定性结果。",
      "GitHub、博客或开源贡献可以放在个人信息栏。",
    ],
  },
  数据分析: {
    summary:
      "数据分析简历需要同时证明业务理解和工具能力。模板突出 SQL、Python、BI 工具与分析项目，适合数据分析师、商业分析和增长分析岗位。",
    tips: [
      "项目里写清楚数据规模、分析方法和最终业务结论。",
      "工具栈按 SQL、Python、可视化、数仓分层列出。",
      "用指标变化说明分析带来的实际影响。",
    ],
  },
  算法工程师: {
    summary:
      "算法岗简历看重论文、竞赛、模型落地与工程能力。模板把教育背景、研究方向、项目与论文专利集中呈现，适合校招和社招算法岗位。",
    tips: [
      "项目写清楚数据规模、模型结构、离线/在线指标。",
      "论文与竞赛只保留有含金量的部分。",
      "工程能力（训练框架、部署、推理优化）单独成栏。",
    ],
  },
  产品经理: {
    summary:
      "产品经理简历要用项目和指标证明判断力。模板突出需求分析、方案设计、跨团队协作与上线结果，适合校招产品岗与社招产品经理。",
    tips: [
      "每个项目写清楚用户问题、你的方案和上线后的数据。",
      "区分「负责」和「参与」，避免夸大主导权。",
      "附上作品集或需求文档链接时，确保可公开访问。",
    ],
  },
  运营: {
    summary:
      "运营简历看的是拉新、留存、转化和内容能力。模板把项目数据、渠道经验和协作结果放在显眼位置，适合用户运营、内容运营、活动运营等岗位。",
    tips: [
      "用增长率、转化率、GMV 等指标说明成果。",
      "写清楚你负责的渠道、预算和投放节奏。",
      "内容类岗位可以附上阅读量、涨粉数或爆款案例。",
    ],
  },
  设计: {
    summary:
      "设计岗位简历本身就是作品的一部分。这一组模板版式感更强，同时保留清晰的经历结构，适合 UI、平面、品牌与交互设计求职。",
    tips: [
      "简历里放作品集链接，不要塞入过多缩略图。",
      "写清楚项目角色、设计目标和落地结果。",
      "投递传统企业时，选择配色更克制的版本。",
    ],
  },
  "UI/UX": {
    summary:
      "UI/UX 简历需要兼顾视觉表达与项目逻辑。模板突出设计工具、项目流程、用户研究和上线结果，适合交互设计、用户体验与产品设计岗位。",
    tips: [
      "项目按「问题—研究—方案—验证」组织。",
      "工具栈写 Figma、Sketch、Principle 等实际使用的软件。",
      "作品集链接放在页首，确保无需登录即可查看。",
    ],
  },
  教师: {
    summary:
      "教师简历看重学历、教师资格、教学经历与班级管理能力。模板版式稳重，突出授课科目、年级、课时与教学成果。",
    tips: [
      "写清楚教师资格证学段与学科。",
      "教学经历写授课年级、班级规模和成绩变化。",
      "班主任、教研、公开课经历可以单独列出。",
    ],
  },
  财务: {
    summary:
      "财务简历强调证书、核算经验与合规意识。模板把学历、证书、账务与报表经验放在靠前位置，适合会计、财务分析和审计岗位。",
    tips: [
      "初级/中级会计、CPA 等证书按取得时间列出。",
      "写清楚负责的账套规模、报表类型和系统。",
      "避免使用过于花哨的配色和图标。",
    ],
  },
  人力资源: {
    summary:
      "HR 简历需要体现招聘、培训、绩效与员工关系的实操经验。模板突出模块经验、覆盖人数和项目结果，适合 HRBP、招聘与薪酬岗位。",
    tips: [
      "写清楚负责的业务线、员工规模和招聘量。",
      "项目写明白优化了哪个流程、节省了多少时间。",
      "涉及薪酬数据时注意脱敏。",
    ],
  },
  销售: {
    summary:
      "销售简历的核心是业绩数字。模板把销售额、完成率、客户资源和团队管理经验放在显眼位置，适合 To B、To C 与渠道销售岗位。",
    tips: [
      "用销售额、回款、完成率、客户数说明业绩。",
      "写清楚客户类型、客单价和销售周期。",
      "团队管理经验单独列出，注明团队规模。",
    ],
  },
  市场营销: {
    summary:
      "市场营销简历看重 campaign、预算和转化结果。模板突出品牌项目、渠道投放、内容传播与数据复盘，适合市场、品牌与增长岗位。",
    tips: [
      "写清楚项目预算、渠道组合和最终 ROI。",
      "品牌项目说明覆盖人群、曝光量和转化。",
      "附作品或案例链接时确认对外可访问。",
    ],
  },
  新媒体: {
    summary:
      "新媒体简历要用账号数据和内容案例说话。模板突出平台、粉丝量、爆款内容与涨粉节奏，适合公众号、短视频与社媒运营岗位。",
    tips: [
      "写清楚负责的平台、账号定位和粉丝规模。",
      "用阅读量、完播率、互动率说明内容效果。",
      "附 2–3 个代表作品链接，而不是全部作品。",
    ],
  },
  电子商务: {
    summary:
      "电商简历看重店铺 GMV、投放效率与活动策划。模板突出平台经验、类目、预算与转化数据，适合运营、推广与店长岗位。",
    tips: [
      "写清楚平台（天猫、京东、抖音等）与类目。",
      "用 GMV、ROI、转化率、客单价说明结果。",
      "大促项目写清楚你负责的环节和最终产出。",
    ],
  },
  制造业: {
    summary:
      "制造业简历强调工艺、设备、质量与项目管理经验。模板版式务实，突出专业背景、产线经验和改善成果，适合工程、生产与质量岗位。",
    tips: [
      "写清楚负责的设备、工艺段和产品类型。",
      "用良率、产能、停机时间等指标说明改善结果。",
      "项目经历注明团队规模和你的具体职责。",
    ],
  },
  行政: {
    summary:
      "行政简历看重流程、成本与服务意识。模板突出办公管理、采购、会务与跨部门协作经验，适合行政、前台与综合管理岗位。",
    tips: [
      "写清楚管理的办公面积、人数和预算规模。",
      "流程优化用时间或成本变化说明效果。",
      "会务与活动经历注明规模和角色。",
    ],
  },
  咨询: {
    summary:
      "咨询简历看重结构化思维、行业研究和项目交付。模板突出教育背景、项目类型、分析方法和客户结果，适合战略、管理与行业咨询岗位。",
    tips: [
      "项目写清楚行业、客户问题、分析框架和结论。",
      "用数据说明项目带来的决策变化。",
      "教育背景与实习机构是校招筛选的重点。",
    ],
  },
  游戏: {
    summary:
      "游戏行业简历风格更自由，但项目与岗位匹配仍然是核心。模板适合策划、程序、美术与运营岗位，版式辨识度高。",
    tips: [
      "策划岗写清楚玩法设计、数值或关卡方案。",
      "程序岗写清楚引擎、语言和性能优化结果。",
      "附 Demo、作品集或项目链接时确认可访问。",
    ],
  },
  汽车: {
    summary:
      "汽车行业简历覆盖研发、制造、供应链与销售岗位。模板强调专业背景、项目经验和行业工具，版式稳重、信息密度适中。",
    tips: [
      "研发岗写清楚系统、零部件和验证结果。",
      "供应链岗用交付、库存或成本指标说明成果。",
      "注明是否接受出差、驻厂或轮岗。",
    ],
  },
  测试: {
    summary:
      "测试简历看重用例设计、自动化与质量保障结果。模板突出测试类型、工具链、缺陷管理和项目覆盖范围。",
    tips: [
      "写清楚负责的模块、用例数量和缺陷发现率。",
      "自动化经验注明框架、语言和覆盖率。",
      "性能与安全测试经验单独列出。",
    ],
  },
  Java: {
    summary:
      "Java 岗位简历强调技术栈深度与项目复杂度。模板突出框架、中间件、数据库与高并发经验，适合后端开发与架构岗位。",
    tips: [
      "写清楚 Spring、MyBatis、消息队列和数据库版本。",
      "项目注明 QPS、数据量、响应时间等指标。",
      "不要只列技术名词，说明你在项目中解决了什么问题。",
    ],
  },
  通信: {
    summary:
      "通信行业简历覆盖网络、射频、嵌入式与交付岗位。模板突出专业课程、设备经验、协议栈与项目交付结果。",
    tips: [
      "写清楚涉及的制式、频段、设备和测试仪器。",
      "项目注明网络规模、覆盖场景和你的职责。",
      "运营商或设备商经历按公司类型分开描述。",
    ],
  },
  房地产: {
    summary:
      "房地产简历看重项目全周期经验与业绩。模板突出开发、营销、成本与工程岗位的项目规模、货值和回款结果。",
    tips: [
      "写清楚项目体量、业态和你负责的阶段。",
      "营销岗用销售额、去化率和回款说明业绩。",
      "跨城市项目注明是否接受外派。",
    ],
  },
  "医疗/健康": {
    summary:
      "医疗健康简历强调资质、临床或研发经验与合规意识。模板版式稳重，突出执业资格、科室轮转、项目与科研成果。",
    tips: [
      "执业医师、护士执业证等资质放在显眼位置。",
      "临床经历写清楚科室、床位数和操作项目。",
      "科研经历注明课题、角色和产出。",
    ],
  },
  "文案/策划": {
    summary:
      "文案与策划简历要用作品和传播结果证明能力。模板突出内容类型、平台、阅读数据与项目落地情况。",
    tips: [
      "按内容类型分类展示作品：品牌、活动、社媒。",
      "用阅读量、转发量或转化率说明效果。",
      "附作品链接时挑选 3–5 个最有代表性的。",
    ],
  },
};

/** Tags worth indexing: enough inventory to fill a real page. */
export const MIN_TAG_COUNT = 10;

export function decodeTagParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Slash-containing tags would produce ambiguous URL segments; render them as text only. */
export function isLinkableTag(tag: string): boolean {
  return !tag.includes("/") && !tag.includes("\\");
}

export function tagHref(tag: string): string {
  return `/templates/tag/${encodeURIComponent(tag)}`;
}

export function layoutHref(layout: string): string {
  return `/templates/layout/${encodeURIComponent(layout)}`;
}

export function sortByPopularity(items: CatalogTemplate[]): CatalogTemplate[] {
  return [...items].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, "zh-CN"));
}

export function tagStats(catalog: CatalogFile): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of catalog.templates) {
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

export function indexableTags(catalog: CatalogFile, limit = 60): string[] {
  return tagStats(catalog)
    .filter((row) => row.count >= MIN_TAG_COUNT && isLinkableTag(row.tag))
    .slice(0, limit)
    .map((row) => row.tag);
}

export function relatedTags(
  items: CatalogTemplate[],
  current: string,
  limit = 12,
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of items) {
    for (const tag of entry.tags) {
      if (tag === current || !isLinkableTag(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"))
    .slice(0, limit);
}

export function tagCollection(catalog: CatalogFile, tag: string) {
  const items = catalog.templates.filter((entry) => entry.tags.includes(tag));
  return { tag, count: items.length, items: sortByPopularity(items) };
}

export function layoutCollection(catalog: CatalogFile, layout: string) {
  const items = catalog.templates.filter((entry) => entry.layout === layout);
  return { layout, count: items.length, items: sortByPopularity(items) };
}

export function tagMeta(tag: string, count: number) {
  const copy = TAG_COPY[tag];
  const summary =
    copy?.summary ??
    `${tag}方向的简历模板，共收录 ${count} 套，覆盖不同版式与经验阶段。所有模板都支持在线编辑、A4 实时预览；导出 PDF、PNG 与 Word 为会员功能。`;
  return {
    summary,
    tips:
      copy?.tips ?? [
        "先确定目标岗位，再按岗位要求调整技能与项目顺序。",
        "用具体动作和结果描述经历，避免空泛的自我评价。",
        "投递前用 A4 预览检查分页，确保关键信息在第一页。",
      ],
  };
}

export function layoutMeta(layout: string, count: number) {
  const label = LAYOUT_LABELS[layout] ?? layout;
  const copy = LAYOUT_COPY[layout];
  return {
    label,
    summary:
      copy?.summary ??
      `${label}版式简历模板，共收录 ${count} 套，均支持在线编辑、A4 实时预览；导出 PDF、PNG、Word 为会员功能。`,
    tips:
      copy?.tips ?? [
        "按目标岗位调整模块顺序，把最相关的内容放在前面。",
        "控制每段经历的长度，保证一页内可以读完。",
        "导出前检查 A4 分页与字体渲染。",
      ],
  };
}
