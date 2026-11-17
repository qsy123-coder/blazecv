import type { ResumeDoc, Section } from "./types";

export type Severity = "high" | "medium" | "low";

export interface DiagnosticIssue {
  id: string;
  severity: Severity;
  message: string;
  sectionId?: string;
}

export interface DiagnosticResult {
  score: number;
  grade: "优秀" | "良好" | "待完善";
  issues: DiagnosticIssue[];
  passed: number;
  total: number;
}

const DEDUCTION: Record<Severity, number> = {
  high: 12,
  medium: 5,
  low: 2,
};

type SummarySection = Extract<Section, { type: "summary" }>;
type EducationSection = Extract<Section, { type: "education" }>;
type ExperienceSection = Extract<Section, { type: "experience" | "projects" }>;
type SkillsSection = Extract<Section, { type: "skills" }>;

export function diagnose(
  doc: ResumeDoc,
  overflowPx: number,
  overflowSection: string | null = null,
): DiagnosticResult {
  const issues: DiagnosticIssue[] = [];
  let passed = 0;
  let total = 0;
  let sequence = 0;

  const check = (
    ok: boolean,
    severity: Severity,
    message: string,
    sectionId?: string,
  ) => {
    total += 1;
    if (ok) {
      passed += 1;
      return;
    }
    sequence += 1;
    issues.push({ id: `issue_${sequence}`, severity, message, sectionId });
  };

  const visible = doc.sections.filter((section) => section.visible);
  const summary = visible.find((section): section is SummarySection => section.type === "summary");
  const education = visible.find(
    (section): section is EducationSection => section.type === "education",
  );
  const experienceSections = visible.filter(
    (section): section is ExperienceSection =>
      section.type === "experience" || section.type === "projects",
  );
  const skills = visible.find((section): section is SkillsSection => section.type === "skills");

  check(Boolean(doc.basics.name.trim()), "high", "填写姓名");
  check(Boolean(doc.basics.jobTitle.trim()), "medium", "补充求职意向");
  check(
    Boolean(doc.basics.phone.trim() || doc.basics.email.trim()),
    "high",
    "补充手机号或邮箱",
  );
  check(Boolean(doc.basics.city.trim()), "low", "补充所在城市");

  const summaryText = summary?.content.trim() ?? "";
  check(Boolean(summaryText), "medium", "补充个人简介，建议 2–4 行", summary?.id);
  if (summaryText) {
    check(
      summaryText.length >= 40 && summaryText.length <= 220,
      "low",
      summaryText.length < 40
        ? "个人简介偏短，建议补充到 40–220 字"
        : "个人简介偏长，建议压缩到 220 字以内",
      summary?.id,
    );
  }

  check(
    Boolean(education?.items.some((item) => item.school.trim())),
    "high",
    "补充教育经历",
    education?.id,
  );

  const validExperience = experienceSections.filter((section) =>
    section.items.some((item) => item.org.trim() || item.bullets.some((b) => b.trim())),
  );
  check(
    validExperience.length > 0,
    "high",
    "补充工作或项目经历",
    experienceSections[0]?.id,
  );

  for (const section of validExperience) {
    const items = section.items.filter(
      (item) => item.org.trim() || item.bullets.some((b) => b.trim()),
    );
    if (items.length === 0) continue;

    check(
      items.every((item) => Boolean(item.end.trim())),
      "low",
      "部分经历缺少结束时间",
      section.id,
    );
    check(
      items.every((item) => item.bullets.filter((b) => b.trim()).length >= 2),
      "medium",
      "每条经历建议写 2–5 条要点",
      section.id,
    );

    const bullets = items.flatMap((item) =>
      item.bullets.map((b) => b.trim()).filter(Boolean),
    );
    if (bullets.length >= 3) {
      const quantified = bullets.filter((line) => /[\d%]/.test(line)).length;
      check(
        quantified / bullets.length >= 0.4,
        "medium",
        "要点缺少量化结果，建议补充数字或百分比",
        section.id,
      );
      check(
        bullets.every((line) => line.length <= 100),
        "low",
        "部分要点过长，建议控制在 100 字内",
        section.id,
      );
    }
  }

  const validSkills = (skills?.items ?? []).filter(
    (item) => item.name.trim() || item.detail.trim(),
  );
  check(validSkills.length >= 3, "low", "技能建议至少 3 组", skills?.id);

  check(
    overflowPx <= 0,
    "high",
    `内容超出一页${
      overflowSection ? `（「${overflowSection}」已越过 A4 底边）` : ""
    }，建议精简或调小字号`,
  );

  const deduction = issues.reduce((sum, issue) => sum + DEDUCTION[issue.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - deduction));
  const grade = score >= 85 ? "优秀" : score >= 70 ? "良好" : "待完善";

  const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return { score, grade, issues, passed, total };
}
