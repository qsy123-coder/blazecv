"use client";

import { useEffect, useState } from "react";
import { useResumeStore } from "@/store/useResumeStore";
import { DEFAULT_SECTION_TITLE } from "@/lib/schema";
import type { Section, SectionType } from "@/lib/types";
import { Button, Field, TextArea, TextInput } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<SectionType, string> = {
  summary: "简介",
  education: "教育",
  experience: "工作",
  projects: "项目",
  skills: "技能",
  certificates: "证书",
  custom: "自定义",
};

const ADDABLE: SectionType[] = [
  "education",
  "experience",
  "projects",
  "skills",
  "certificates",
  "custom",
];

function SectionBodyEditor({ section }: { section: Section }) {
  const update = useResumeStore((state) => state.update);
  const addItem = useResumeStore((state) => state.addItem);
  const removeItem = useResumeStore((state) => state.removeItem);

  const patchSection = (patch: Record<string, unknown>, key: string) =>
    update((draft) => {
      const target = draft.sections.find((item) => item.id === section.id);
      if (target) Object.assign(target, patch);
    }, key);

  const patchItem = (itemId: string, patch: Record<string, unknown>, key: string) =>
    update((draft) => {
      const target = draft.sections.find((item) => item.id === section.id);
      if (!target || !("items" in target)) return;
      const items = target.items as unknown as Array<{ id: string } & Record<string, unknown>>;
      const item = items.find((entry) => entry.id === itemId);
      if (item) Object.assign(item, patch);
    }, key);

  const titleField = (
    <Field label="模块标题">
      <TextInput
        value={section.title}
        onChange={(event) =>
          patchSection({ title: event.target.value }, `section.title.${section.id}`)
        }
      />
    </Field>
  );

  if (section.type === "summary") {
    return (
      <div className="space-y-3">
        {titleField}
        <Field label="内容" hint="建议 2–4 行，突出年限、方向与可量化成果">
          <TextArea
            rows={5}
            value={section.content}
            placeholder="4 年经验，负责……，推动……提升 30%。"
            onChange={(event) =>
              patchSection(
                { content: event.target.value },
                `section.content.${section.id}`,
              )
            }
          />
        </Field>
      </div>
    );
  }

  if (section.type === "education") {
    return (
      <div className="space-y-3">
        {titleField}
        {section.items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">
                教育经历 {index + 1}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="删除教育经历"
                onClick={() => removeItem(section.id, item.id)}
              >
                <Icon name="trash" size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="学校">
                <TextInput
                  value={item.school}
                  onChange={(event) =>
                    patchItem(item.id, { school: event.target.value }, `edu.school.${item.id}`)
                  }
                />
              </Field>
              <Field label="专业">
                <TextInput
                  value={item.major}
                  onChange={(event) =>
                    patchItem(item.id, { major: event.target.value }, `edu.major.${item.id}`)
                  }
                />
              </Field>
              <Field label="学历">
                <TextInput
                  value={item.degree}
                  placeholder="本科 / 硕士"
                  onChange={(event) =>
                    patchItem(item.id, { degree: event.target.value }, `edu.degree.${item.id}`)
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="开始">
                  <TextInput
                    value={item.start}
                    placeholder="2018.09"
                    onChange={(event) =>
                      patchItem(item.id, { start: event.target.value }, `edu.start.${item.id}`)
                    }
                  />
                </Field>
                <Field label="结束">
                  <TextInput
                    value={item.end}
                    placeholder="2022.06"
                    onChange={(event) =>
                      patchItem(item.id, { end: event.target.value }, `edu.end.${item.id}`)
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="mt-2">
              <Field label="补充（GPA、排名、荣誉）" hint="每行一条，右侧会显示为圆点条目">
                <TextArea
                  rows={3}
                  value={item.detail ?? ""}
                  placeholder={"GPA 3.9 / 专业前 5%\n校级三好学生"}
                  onChange={(event) =>
                    patchItem(item.id, { detail: event.target.value }, `edu.detail.${item.id}`)
                  }
                />
              </Field>
            </div>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addItem(section.id)}>
          <Icon name="plus" size={13} />
          添加教育经历
        </Button>
      </div>
    );
  }

  if (section.type === "experience" || section.type === "projects") {
    const isProject = section.type === "projects";
    return (
      <div className="space-y-3">
        {titleField}
        {section.items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">
                {isProject ? "项目" : "经历"} {index + 1}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="删除条目"
                onClick={() => removeItem(section.id, item.id)}
              >
                <Icon name="trash" size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={isProject ? "项目名称" : "公司"}>
                <TextInput
                  value={item.org}
                  onChange={(event) =>
                    patchItem(item.id, { org: event.target.value }, `exp.org.${item.id}`)
                  }
                />
              </Field>
              <Field label={isProject ? "角色" : "职位"}>
                <TextInput
                  value={item.role}
                  onChange={(event) =>
                    patchItem(item.id, { role: event.target.value }, `exp.role.${item.id}`)
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="开始">
                  <TextInput
                    value={item.start}
                    placeholder="2022.07"
                    onChange={(event) =>
                      patchItem(item.id, { start: event.target.value }, `exp.start.${item.id}`)
                    }
                  />
                </Field>
                <Field label="结束">
                  <TextInput
                    value={item.end}
                    placeholder="至今"
                    onChange={(event) =>
                      patchItem(item.id, { end: event.target.value }, `exp.end.${item.id}`)
                    }
                  />
                </Field>
              </div>
              <Field label="地点（可选）">
                <TextInput
                  value={item.location ?? ""}
                  placeholder="上海"
                  onChange={(event) =>
                    patchItem(
                      item.id,
                      { location: event.target.value },
                      `exp.location.${item.id}`,
                    )
                  }
                />
              </Field>
            </div>
            <div className="mt-2">
              <Field
                label={isProject ? "项目内容（每行一条）" : "工作内容（每行一条）"}
                hint="用动词开头，尽量带数字结果"
              >
                <TextArea
                  rows={4}
                  value={item.bullets.join("\n")}
                  onChange={(event) =>
                    patchItem(
                      item.id,
                      { bullets: event.target.value.split("\n") },
                      `exp.bullets.${item.id}`,
                    )
                  }
                />
              </Field>
            </div>
            <div className="mt-2">
              <Field label="标签（可选，逗号分隔）">
                <TextInput
                  value={(item.tags ?? []).join(", ")}
                  placeholder="React, TypeScript"
                  onChange={(event) =>
                    patchItem(
                      item.id,
                      {
                        tags: event.target.value
                          .split(/[,，、/]/)
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      },
                      `exp.tags.${item.id}`,
                    )
                  }
                />
              </Field>
            </div>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addItem(section.id)}>
          <Icon name="plus" size={13} />
          {isProject ? "添加项目" : "添加经历"}
        </Button>
      </div>
    );
  }

  if (section.type === "skills") {
    return (
      <div className="space-y-3">
        {titleField}
        {section.items.map((item) => (
          <div key={item.id} className="space-y-1">
            <div className="flex items-start gap-1.5">
              <TextInput
                value={item.name}
                placeholder="语言"
                className="w-[32%]"
                onChange={(event) =>
                  patchItem(item.id, { name: event.target.value }, `skill.name.${item.id}`)
                }
              />
              <TextInput
                value={item.detail}
                placeholder="TypeScript / React / Node.js"
                onChange={(event) =>
                  patchItem(item.id, { detail: event.target.value }, `skill.detail.${item.id}`)
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="删除技能"
                onClick={() => removeItem(section.id, item.id)}
              >
                <Icon name="x" size={14} />
              </Button>
            </div>
            <div className="flex items-center gap-1 pl-0.5">
              <span className="mr-1 text-[10px] text-slate-400">熟练度</span>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`熟练度 ${value}`}
                  title={`熟练度 ${value}/5`}
                  onClick={() =>
                    patchItem(item.id, { level: value }, `skill.level.${item.id}`)
                  }
                  className={cn(
                    "h-2.5 w-2.5 rounded-full border transition",
                    (item.level ?? 0) >= value
                      ? "border-slate-900 bg-slate-900"
                      : "border-slate-300 bg-white hover:border-slate-400",
                  )}
                />
              ))}
              {item.level ? (
                <button
                  type="button"
                  className="ml-1 text-[10px] text-slate-400 hover:text-slate-600"
                  onClick={() =>
                    patchItem(item.id, { level: undefined }, `skill.level.${item.id}`)
                  }
                >
                  清除
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addItem(section.id)}>
          <Icon name="plus" size={13} />
          添加技能组
        </Button>
      </div>
    );
  }

  if (section.type !== "certificates" && section.type !== "custom") {
    return null;
  }

  return (
    <div className="space-y-3">
      {titleField}
      {section.items.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5">
          <TextInput
            value={item.text}
            placeholder={section.type === "certificates" ? "CET-6（562 分）" : "一行内容"}
            onChange={(event) =>
              patchItem(item.id, { text: event.target.value }, `text.${item.id}`)
            }
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="删除条目"
            onClick={() => removeItem(section.id, item.id)}
          >
            <Icon name="x" size={14} />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => addItem(section.id)}>
        <Icon name="plus" size={13} />
        添加条目
      </Button>
    </div>
  );
}

function SectionCard({
  section,
  index,
  total,
  expanded,
  onToggle,
}: {
  section: Section;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const toggleSection = useResumeStore((state) => state.toggleSection);
  const removeSection = useResumeStore((state) => state.removeSection);
  const moveSection = useResumeStore((state) => state.moveSection);

  return (
    <div
      id={`section-${section.id}`}
      className="scroll-mt-12 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData("application/x-blazecv-section"));
        if (!Number.isNaN(from)) moveSection(from, index);
      }}
    >
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/60 px-2 py-1.5">
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-blazecv-section", String(index));
            event.dataTransfer.effectAllowed = "move";
          }}
          className="cursor-grab px-1 text-slate-300 hover:text-slate-500"
          title="拖动排序"
        >
          <Icon name="grip" size={14} />
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Icon
            name={expanded ? "chevronDown" : "chevronDown"}
            size={13}
            className={cn("text-slate-400 transition", expanded && "rotate-180")}
          />
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              section.visible ? "text-slate-700" : "text-slate-400 line-through",
            )}
          >
            {section.title || DEFAULT_SECTION_TITLE[section.type]}
          </span>
          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-400">
            {TYPE_LABEL[section.type]}
          </span>
        </button>
        <button
          type="button"
          aria-label={section.visible ? "隐藏模块" : "显示模块"}
          title={section.visible ? "隐藏模块" : "显示模块"}
          onClick={() => toggleSection(section.id)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Icon name={section.visible ? "eye" : "eyeOff"} size={14} />
        </button>
        <button
          type="button"
          aria-label="上移"
          disabled={index === 0}
          onClick={() => moveSection(index, index - 1)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
        >
          <Icon name="arrowUp" size={14} />
        </button>
        <button
          type="button"
          aria-label="下移"
          disabled={index === total - 1}
          onClick={() => moveSection(index, index + 1)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
        >
          <Icon name="arrowDown" size={14} />
        </button>
        <button
          type="button"
          aria-label="删除模块"
          onClick={() => {
            if (window.confirm(`删除「${section.title}」模块？`)) removeSection(section.id);
          }}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      {expanded ? (
        <div className="p-3">
          <SectionBodyEditor section={section} />
        </div>
      ) : null}
    </div>
  );
}

export function SectionsEditor() {
  const doc = useResumeStore((state) => state.doc);
  const addSection = useResumeStore((state) => state.addSection);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      setExpanded((current) => ({ ...current, [id]: true }));
      window.setTimeout(() => {
        document
          .getElementById(`section-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    };
    window.addEventListener("blazecv:focus-section", handler);
    return () => window.removeEventListener("blazecv:focus-section", handler);
  }, []);

  if (!doc) return null;

  return (
    <div className="space-y-2">
      {doc.sections.map((section, index) => (
        <SectionCard
          key={section.id}
          section={section}
          index={index}
          total={doc.sections.length}
          expanded={expanded[section.id] ?? false}
          onToggle={() =>
            setExpanded((current) => ({
              ...current,
              [section.id]: !(current[section.id] ?? false),
            }))
          }
        />
      ))}

      <details className="group rounded-lg border border-dashed border-slate-300 bg-white/60">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-slate-500 hover:text-slate-700">
          <Icon name="plus" size={14} />
          添加模块
        </summary>
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
          {ADDABLE.map((type) => (
            <button
              key={type}
              type="button"
              onClick={(event) => {
                addSection(type);
                (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute(
                  "open",
                );
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              {DEFAULT_SECTION_TITLE[type]}
            </button>
          ))}
        </div>
      </details>

      {doc.sections.length === 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          还没有模块，点上方「添加模块」开始。
        </p>
      ) : null}
    </div>
  );
}
