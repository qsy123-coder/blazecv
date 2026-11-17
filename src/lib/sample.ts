import type { ResumeDoc, TemplateId } from "./types";
import { uid } from "./utils";

export function createBlankResume(templateId: TemplateId = "minimal"): ResumeDoc {
  return {
    schemaVersion: 1,
    id: uid("resume"),
    title: "未命名简历",
    templateId,
    theme: {
      primary: "",
      fontScale: "md",
      lineHeight: 1.5,
      margin: 16,
    },
    basics: {
      name: "",
      jobTitle: "",
      phone: "",
      email: "",
      city: "",
      links: [],
    },
    sections: [
      { id: "sec_summary", type: "summary", title: "个人简介", visible: true, content: "" },
      {
        id: "sec_education",
        type: "education",
        title: "教育经历",
        visible: true,
        items: [
          {
            id: "edu_blank",
            school: "",
            major: "",
            degree: "",
            start: "",
            end: "",
            detail: "",
          },
        ],
      },
      {
        id: "sec_experience",
        type: "experience",
        title: "工作经历",
        visible: true,
        items: [
          {
            id: "exp_blank",
            org: "",
            role: "",
            start: "",
            end: "",
            location: "",
            bullets: [""],
          },
        ],
      },
      {
        id: "sec_projects",
        type: "projects",
        title: "项目经历",
        visible: true,
        items: [
          {
            id: "proj_blank",
            org: "",
            role: "",
            start: "",
            end: "",
            bullets: [""],
          },
        ],
      },
      {
        id: "sec_skills",
        type: "skills",
        title: "专业技能",
        visible: true,
        items: [{ id: "skill_blank", name: "", detail: "" }],
      },
    ],
    updatedAt: Date.now(),
  };
}

export function createSampleResume(templateId: TemplateId = "minimal"): ResumeDoc {
  return {
    schemaVersion: 1,
    id: "sample-resume",
    title: "前端开发-张三",
    templateId,
    theme: {
      primary: "",
      fontScale: "md",
      lineHeight: 1.5,
      margin: 16,
    },
    basics: {
      name: "张三",
      jobTitle: "前端开发工程师",
      phone: "138-0000-0000",
      email: "zhangsan@example.com",
      city: "上海",
      links: [
        { id: "link_github", label: "GitHub", url: "github.com/zhangsan" },
        { id: "link_site", label: "作品集", url: "zhangsan.dev" },
      ],
    },
    sections: [
      {
        id: "sec_summary",
        type: "summary",
        title: "个人简介",
        visible: true,
        content:
          "4 年前端开发经验，长期负责中后台与低代码平台建设。主导过 3 个从 0 到 1 的业务系统，熟悉性能优化、工程化与组件体系设计；推动团队构建耗时下降 62%，线上首屏时间稳定在 1.2s 以内。",
      },
      {
        id: "sec_education",
        type: "education",
        title: "教育经历",
        visible: true,
        items: [
          {
            id: "edu_1",
            school: "华东理工大学",
            major: "计算机科学与技术",
            degree: "本科",
            start: "2018.09",
            end: "2022.06",
            detail: "GPA 3.8/4.0，专业前 10%；ACM 校赛二等奖",
          },
        ],
      },
      {
        id: "sec_experience",
        type: "experience",
        title: "工作经历",
        visible: true,
        items: [
          {
            id: "exp_1",
            org: "字节跳动",
            role: "前端开发工程师",
            start: "2022.07",
            end: "至今",
            location: "上海",
            bullets: [
              "负责商家后台 12 个核心模块，服务日均 30 万商家，主导从 Vue 2 到 React 18 的渐进式迁移，迁移期间线上零故障。",
              "设计通用表单引擎，覆盖 80% 业务表单场景，新页面平均开发周期从 5 天缩短到 1.5 天。",
              "推动构建体系升级，构建耗时由 9 分钟降至 3.4 分钟，团队 CI 成本每月节省约 120 小时。",
            ],
            tags: ["React", "TypeScript", "性能优化"],
          },
          {
            id: "exp_2",
            org: "拼多多",
            role: "前端开发实习生",
            start: "2021.06",
            end: "2021.12",
            location: "上海",
            bullets: [
              "参与促销活动页搭建系统开发，支撑双十一期间 50+ 活动页上线。",
              "实现图片懒加载与骨架屏方案，活动页 LCP 从 3.8s 优化至 1.9s。",
            ],
          },
        ],
      },
      {
        id: "sec_projects",
        type: "projects",
        title: "项目经历",
        visible: true,
        items: [
          {
            id: "proj_1",
            org: "低代码页面搭建平台",
            role: "核心开发",
            start: "2023.03",
            end: "2024.02",
            bullets: [
              "负责画布渲染引擎与物料协议设计，支持拖拽、吸附、撤销重做，单页渲染 500 个组件仍保持 60fps。",
              "设计物料接入规范，接入 46 个业务组件，平台月活 800+，累计产出页面 1.2 万个。",
            ],
            tags: ["React", "Zustand", "Canvas"],
          },
        ],
      },
      {
        id: "sec_skills",
        type: "skills",
        title: "专业技能",
        visible: true,
        items: [
          {
            id: "skill_1",
            name: "语言",
            detail: "TypeScript / JavaScript / HTML / CSS",
            level: 5,
          },
          { id: "skill_2", name: "框架", detail: "React / Next.js / Vue 3", level: 4 },
          { id: "skill_3", name: "工程化", detail: "Vite / Webpack / pnpm / CI", level: 4 },
          { id: "skill_4", name: "其他", detail: "Node.js / Playwright / 性能优化", level: 3 },
        ],
      },
      {
        id: "sec_certificates",
        type: "certificates",
        title: "证书与荣誉",
        visible: true,
        items: [
          { id: "cert_1", text: "CET-6（562 分）" },
          { id: "cert_2", text: "2023 年度团队优秀员工" },
        ],
      },
    ],
    updatedAt: Date.now(),
  };
}
