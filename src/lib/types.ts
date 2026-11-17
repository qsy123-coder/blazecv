export type TemplateId = string;

export type LayoutKind =
  | "single"
  | "sidebar"
  | "timeline"
  | "banner"
  | "dark-sidebar"
  | "split"
  | "editorial";
export type FontScale = "xs" | "sm" | "smd" | "md" | "lg" | "custom";

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface Basics {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  city: string;
  avatar?: string;
  links: LinkItem[];
}

export interface EducationItem {
  id: string;
  school: string;
  major: string;
  degree: string;
  start: string;
  end: string;
  detail?: string;
}

export interface ExperienceItem {
  id: string;
  org: string;
  role: string;
  /** 部门/团队，原站模板在第二行与职位并列显示（如“动画设计助理 创意部”） */
  department?: string;
  start: string;
  end: string;
  location?: string;
  bullets: string[];
  /** 与 bullets 对应；>0 表示该项是上一层级条目的子项（原站嵌套 <ul>） */
  bulletDepths?: number[];
  /** 子列表结构：“inside” = <ul> 在 <li> 内；“sibling” = <ul> 与 <li> 同级 */
  bulletNestStyle?: "inside" | "sibling";
  tags?: string[];
}

export interface SkillItem {
  id: string;
  name: string;
  detail: string;
  /** 1–5，可选；用于深色侧栏、左右分栏等模板的熟练度条 */
  level?: number;
}

export interface TextItem {
  id: string;
  text: string;
}

export type SectionType =
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "certificates"
  | "custom";

export interface SummarySection {
  id: string;
  type: "summary";
  title: string;
  visible: boolean;
  content: string;
}

export interface EducationSection {
  id: string;
  type: "education";
  title: string;
  visible: boolean;
  items: EducationItem[];
}

export interface ExperienceSection {
  id: string;
  type: "experience" | "projects";
  title: string;
  visible: boolean;
  items: ExperienceItem[];
}

export interface SkillsSection {
  id: string;
  type: "skills";
  title: string;
  visible: boolean;
  items: SkillItem[];
  /** 原站“其他”行的原始合并文本（分隔符因模板而异，绑定时按原样输出） */
  rawValue?: string;
}

export interface TextSection {
  id: string;
  type: "certificates" | "custom";
  title: string;
  visible: boolean;
  items: TextItem[];
  rawValue?: string;
}

export type Section =
  | SummarySection
  | EducationSection
  | ExperienceSection
  | SkillsSection
  | TextSection;

export interface Theme {
  /** 空字符串表示跟随模板默认主色 */
  primary: string;
  fontScale: FontScale;
  /** 自定义字号倍率（0.7–1.3），fontScale = "custom" 时生效 */
  customFontScale?: number;
  lineHeight: number;
  /** 页边距，单位 mm */
  margin: number;
  /** 一页适配时启用的紧凑模块间距 */
  dense?: boolean;
  /** 极限一页适配的额外缩放（0.7–1），默认不启用 */
  fitScale?: number;
}

export interface ResumeDoc {
  schemaVersion: 1;
  id: string;
  title: string;
  templateId: TemplateId;
  /** 来自模板库的可编辑预设快照；用于静态模板表之外的模板 */
  templatePreset?: TemplatePreset;
  theme: Theme;
  basics: Basics;
  sections: Section[];
  /** 用户手动移动/增删模块后置真：精确模板按 sections 顺序重排模块 */
  orderEdited?: boolean;
  /** 用户编辑过基本信息后置真：模板缺少槽位时追加显示求职意向/城市等 */
  basicsEdited?: boolean;
  updatedAt: number;
}

export interface TemplateTokens {
  layout: LayoutKind;
  primary: string;
  headingColor: string;
  bodyColor: string;
  muted: string;
  border: string;
  fontHead: string;
  fontBody: string;
  nameSize: number;
  baseSize: number;
  sectionSize: number;
  nameWeight: number;
  lineHeight: number;
  margin: number;
  headerAlign: "left" | "center";
  titleStyle: "rule" | "bar" | "plain" | "uppercase";
  /** 侧栏模板 */
  sidebarBg?: string;
  sidebarWidth?: number;
  /** 时间轴模板右侧栏 */
  timelineSidebar?: boolean;
  dense?: boolean;
  /** 横幅模板：直边或斜切 */
  bannerStyle?: "band" | "diagonal";
  /** 窄栏模板：日期换行到标题下，避免挤压 */
  stackedEntries?: boolean;
  /** 深色侧栏文字 */
  sidebarText?: string;
  sidebarMuted?: string;
  sidebarAccent?: string;
}

export interface TemplatePreset {
  id: TemplateId;
  name: string;
  desc: string;
  layout: LayoutKind;
  tags?: string[];
  source?: { token: string; name: string };
  base: Omit<TemplateTokens, "lineHeight" | "margin">;
}
