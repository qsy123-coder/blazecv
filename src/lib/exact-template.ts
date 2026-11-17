import type {
  EducationSection,
  ExperienceSection,
  ResumeDoc,
  Section,
  TextSection,
} from "./types";
import { splitDetailLines } from "./utils";

/**
 * Bind a ResumeDoc onto the semantic DOM produced by the original WonderCV
 * template renderer. The captured page is a static snapshot of that renderer;
 * its class names are stable across layouts, so one binder covers every
 * captured template while the per-template CSS keeps the exact visual design.
 */

export const EXACT_WIDTH_PX = 794;
export const EXACT_HEIGHT_PX = 1123;

// Last measured natural height of the exact preview, shared with the editor so
// "鑷姩閫傞厤涓€椤? can compute a compression factor.
let lastExactHeight = EXACT_HEIGHT_PX;
export function getExactHeightRef(): number {
  return lastExactHeight;
}
export function setExactHeightRef(height: number) {
  if (Number.isFinite(height) && height > 0) lastExactHeight = height;
}

const MONTH = /^(\d{4})[.\-/年]?(\d{1,2})?/;

function month(value: string): string {
  if (!value) return "";
  const match = String(value).match(MONTH);
  if (!match) return String(value);
  return match[1] + (match[2] ? `年${match[2].padStart(2, "0")}月` : "年");
}

function range(item: { start?: string; end?: string }): string {
  // Only render the "鑷充粖" that the source data actually carries. Items with a
  // start but no end (one-off past entries) must not gain a trailing "鑷充粖".
  const start = month(item.start ?? "");
  const end = month(item.end ?? "");
  return [start, end].filter(Boolean).join(" - ");
}

function bulletList(item: { bullets?: string[] | string }): string[] {
  if (Array.isArray(item.bullets)) {
    return item.bullets
      .flatMap((line) => String(line).split(/\n+/))
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return String(item.bullets ?? "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=。)\s*/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function setSpanValue(span: HTMLElement, value: string) {
  const label = span.querySelector(".attr-name");
  if (!label) {
    span.textContent = value;
    return;
  }
  const nodes = Array.from(span.childNodes);
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (nodes[i].nodeType === Node.TEXT_NODE) {
      (nodes[i] as Text).textContent = ` ${value}`;
      return;
    }
  }
  span.appendChild(document.createTextNode(` ${value}`));
}

function bindBasics(root: HTMLElement, doc: ResumeDoc) {
  const basics = doc.basics;
  const name = root.querySelector<HTMLElement>(".user-name");
  if (name) name.textContent = basics.name || "";

  const user = root.querySelector<HTMLElement>(".user");
  const avatar = root.querySelector<HTMLElement>(".user-avatar-image");
  if (avatar) {
    // The preview element lives in an iframe realm: instanceof checks against
    // the parent window's constructors are always false here.
    if (avatar.tagName === "IMG") {
      const image = avatar as HTMLImageElement;
      if (basics.avatar) {
        image.src = basics.avatar;
        image.style.display = "";
        user?.classList.remove("no-avatar");
      } else {
        image.removeAttribute("src");
        image.style.display = "none";
        user?.classList.add("no-avatar");
      }
    } else if (basics.avatar) {
      avatar.style.backgroundImage = `url("${basics.avatar.replace(/"/g, "%22")}")`;
      user?.classList.remove("no-avatar");
    } else {
      avatar.style.backgroundImage = "";
      user?.classList.add("no-avatar");
    }
  }

  const CITY_LABELS = [
    "城市",
    "现居",
    "所在地",
    "所在城市",
    "现居地",
    "居住地",
    "所在地点",
    "期望城市",
    "意向城市",
    "目标城市",
  ];
  const JOB_LABELS = [
    "求职意向",
    "意向",
    "岗位",
    "求职",
    "职位",
    "期望职位",
    "意向职位",
    "目标职位",
    "期望岗位",
    "应聘职位",
  ];
  const PHONE_LABELS = ["电话", "手机"];
  const EMAIL_LABELS = ["邮箱", "邮件"];
  const values: Record<string, string | undefined> = {
    电话: basics.phone,
    手机: basics.phone,
    邮箱: basics.email,
    邮件: basics.email,
    城市: basics.city,
    现居: basics.city,
    所在地: basics.city,
    所在城市: basics.city,
    现居地: basics.city,
    居住地: basics.city,
    所在地点: basics.city,
    期望城市: basics.city,
    意向城市: basics.city,
    目标城市: basics.city,
    求职意向: basics.jobTitle,
    意向: basics.jobTitle,
    岗位: basics.jobTitle,
    求职: basics.jobTitle,
    职位: basics.jobTitle,
    期望职位: basics.jobTitle,
    意向职位: basics.jobTitle,
    目标职位: basics.jobTitle,
    期望岗位: basics.jobTitle,
    应聘职位: basics.jobTitle,
  };
  const cleanLabel = (value: string | null | undefined) =>
    (value ?? "").replace(/[:：]\s*$/, "").trim();
  const renderedFields = new Set<string>();
  const markField = (label: string) => {
    if (PHONE_LABELS.includes(label)) renderedFields.add("phone");
    else if (EMAIL_LABELS.includes(label)) renderedFields.add("email");
    else if (CITY_LABELS.includes(label)) renderedFields.add("city");
    else if (JOB_LABELS.includes(label)) renderedFields.add("jobTitle");
  };

  root.querySelectorAll<HTMLElement>(".profile-item > span").forEach((span) => {
    const label = cleanLabel(span.querySelector(".attr-name")?.textContent);
    if (!label) return;
    if (!(label in values)) return;
    const value = values[label] ?? "";
    if (!value) {
      span.style.display = "none";
      return;
    }
    setSpanValue(span, value);
    markField(label);
  });

  // Sidebar / professional headers use `.info-item` rows instead of
  // `.profile-item`: <div class="info-item"><span>期望职位：</span><span>值</span></div>.
  root.querySelectorAll<HTMLElement>(".info-item").forEach((item) => {
    const spans = Array.from(item.children).filter(
      (child): child is HTMLElement => child.tagName === "SPAN",
    );
    const labelSpan = spans.find((span) => /[:：]\s*$/.test(span.textContent ?? ""));
    if (!labelSpan) return;
    const label = cleanLabel(labelSpan.textContent);
    if (!(label in values)) return;
    const value = values[label] ?? "";
    if (!value) {
      item.style.display = "none";
      return;
    }
    let valueSpan = [...spans].reverse().find((span) => span !== labelSpan);
    if (!valueSpan) {
      valueSpan = item.ownerDocument.createElement("span");
      item.appendChild(valueSpan);
    }
    if (valueSpan.children.length === 0) valueSpan.textContent = value;
    else setSpanValue(valueSpan, value);
    item.style.display = "";
    markField(label);
  });

  // Append fields the template has no slot for (job title / city) and custom
  // links, but only after the user edited basics — template samples stay 1:1.
  const profileItem = root.querySelector<HTMLElement>(".profile-item");
  const profileOther = root.querySelector<HTMLElement>(".profile-other");
  const appendRow = (label: string, value: string) => {
    if (!value.trim()) return;
    const doc = root.ownerDocument;
    if (profileItem) {
      const span = doc.createElement("span");
      span.textContent = label ? `${label}：${value}` : value;
      span.style.display = "inline-block";
      span.style.marginRight = "14px";
      profileItem.appendChild(span);
      return;
    }
    if (profileOther) {
      const item = doc.createElement("div");
      item.className = "other-item";
      const span = doc.createElement("span");
      span.textContent = label ? `${label}：${value}` : value;
      item.appendChild(span);
      profileOther.appendChild(item);
      return;
    }
    const fallback = root.querySelector<HTMLElement>(".user-info, .user");
    if (!fallback) return;
    const span = doc.createElement("span");
    span.textContent = label ? `${label}：${value}` : value;
    span.style.display = "inline-block";
    span.style.marginRight = "14px";
    fallback.appendChild(span);
  };
  if (doc.basicsEdited) {
    if (!renderedFields.has("jobTitle")) appendRow("求职意向", basics.jobTitle);
    if (!renderedFields.has("city")) appendRow("所在城市", basics.city);
  }
  if (Array.isArray(basics.links) && basics.links.length > 0) {
    for (const link of basics.links) {
      const text = [link.label, link.url].filter(Boolean).join("：").trim();
      if (!text) continue;
      appendRow("", text);
    }
  }

  root.querySelectorAll<HTMLElement>(".profile-item").forEach((item) => {
    const visible = Array.from(item.children).some(
      (child) => (child as HTMLElement).style.display !== "none",
    );
    if (!visible) item.style.display = "none";
  });
}

function bindTitle(option: HTMLElement, title: string) {
  const target = option.querySelector<HTMLElement>(".module-title-wrapper .title");
  if (target) target.textContent = title;
}

type ItemSection = Exclude<Section, { type: "summary" }>;

/**
 * Set a `.menu-title .left` value while preserving the template's bold wrapper.
 * Org / school / major names are often wrapped in `<span class="font_w_b">` (or
 * <b>/<strong>); replacing textContent would drop the bold. Update the bold
 * node's text and keep it.
 */
function setLeftText(left: HTMLElement, text: string) {
  const bold = left.querySelector<HTMLElement>(".font_w_b, b, strong");
  if (bold) {
    bold.textContent = text;
    Array.from(left.childNodes).forEach((node) => {
      if (node !== bold) node.remove();
    });
  } else {
    left.textContent = text;
  }
}

/** Build a bulleted list (one <li> per line) inside a content block. */
function setBulletContent(container: HTMLElement, text: string) {
  const lines = splitDetailLines(text);
  container.replaceChildren();
  if (lines.length === 0) {
    container.style.display = "none";
    return;
  }
  const doc = container.ownerDocument;
  const ul = doc.createElement("ul");
  for (const line of lines) {
    const li = doc.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
  container.appendChild(ul);
  container.style.display = "";
}

function bindItems(
  option: HTMLElement,
  section: ItemSection,
  kind: "experience" | "education" | "text",
  keepEmpty = false,
) {
  bindTitle(option, section.title);
  const content = option.querySelector<HTMLElement>(".info-content") ?? option;
  const template =
    content.querySelector<HTMLElement>(".section-item-container") ??
    option.querySelector<HTMLElement>(".section-item-container");

  const items = section.items.filter((item) => {
    if (kind === "education") {
      const edu = item as EducationSection["items"][number];
      return Boolean(
        edu.school || edu.major || edu.degree || (edu.detail || "").trim(),
      );
    }
    if (kind === "text") {
      return Boolean((item as TextSection["items"][number]).text?.trim());
    }
    const exp = item as ExperienceSection["items"][number];
    return Boolean(
      exp.org?.trim() ||
        exp.role?.trim() ||
        exp.location?.trim() ||
        (Array.isArray(exp.bullets) ? exp.bullets.some((line) => line.trim()) : false),
    );
  });

  if (!template) {
    // Some templates don't expose a `.section-item-container` (or a cloned
    // option came from another type). Render the section as plain text and
    // clear any sample items the clone carried, instead of leaving stale
    // bullets.
    const target = option.querySelector<HTMLElement>(".menu-content") ?? option;
    const text = items
      .map((item) => {
        if (kind === "education") {
          const e = item as EducationSection["items"][number];
          return [e.school, e.major, e.degree].filter(Boolean).join(" ");
        }
        if (kind === "text") {
          return (item as TextSection["items"][number]).text || "";
        }
        const x = item as ExperienceSection["items"][number];
        const bullets = Array.isArray(x.bullets) ? x.bullets : [];
        return [x.org, x.role, ...bullets].filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join("；");
    option.querySelectorAll(".section-item-container").forEach((n) => n.remove());
    // Wipe every content wrapper so no sample bullets the clone carried remain.
    option.querySelectorAll(".menu-content").forEach((n) => {
      n.textContent = "";
    });
    target.textContent = text;
    option.style.display = text || keepEmpty ? "" : "none";
    return;
  }

  // The original renderer marks only the LAST item in a section with a bottom
  // rule (e.g. "1px solid #222734" in table-border templates). Every item is a
  // clone of the first node, which carries "border-bottom:none", so remember
  // the last item's border and reapply it to the final cloned node.
  const originals = Array.from(
    content.querySelectorAll<HTMLElement>(".section-item-container"),
  );
  const lastOriginal = originals[originals.length - 1];
  let lastBorder = { width: "", style: "", color: "" };
  if (lastOriginal) {
    const cs = window.getComputedStyle(lastOriginal);
    lastBorder = {
      width: cs.borderBottomWidth,
      style: cs.borderBottomStyle,
      color: cs.borderBottomColor,
    };
  }

  const templateNode = template.cloneNode(true) as HTMLElement;
  option.querySelectorAll(".section-item-container").forEach((node) => node.remove());

  for (const item of items) {
    const node = templateNode.cloneNode(true) as HTMLElement;
    const titles = node.querySelectorAll<HTMLElement>(".menu-title");
    if (kind === "education") {
      const first = titles.item(0);
      const edu = item as Extract<Section, { type: "education" }>["items"][number];
      if (first) {
        const left = first.querySelector<HTMLElement>(".left");
        const right = first.querySelector<HTMLElement>(".right");
        if (left) setLeftText(left, edu.school || "");
        if (right) right.textContent = range(edu);
      }
      const second = titles.item(1);
      if (second) {
        const left = second.querySelector<HTMLElement>(".left");
        const right = second.querySelector<HTMLElement>(".right");
        if (left) setLeftText(left, [edu.major, edu.degree].filter(Boolean).join(" "));
        if (right) right.textContent = "";
      }
      // Show 补充（GPA / 排名 / 荣誉）as a bullet list (one <li> per line),
      // matching the project-experience style. This also clears any sample <ul>
      // inherited from the cloned slot.
      const detail = (edu.detail || "").trim();
      const target =
        node.querySelector<HTMLElement>(".menu-content") ??
        node.querySelector<HTMLElement>(".menu-content-wrapper");
      if (target) setBulletContent(target, detail);
    } else if (kind === "text") {
      const first = titles.item(0);
      const text = item as Extract<Section, { type: "certificates" | "custom" }>["items"][number];
      if (first) {
        const left = first.querySelector<HTMLElement>(".left");
        const right = first.querySelector<HTMLElement>(".right");
        if (left) setLeftText(left, text.text || "");
        if (right) right.textContent = "";
      }
      titles.item(1)?.remove();
      node.querySelector(".menu-content-wrapper")?.remove();
    } else {
      const exp = item as Extract<Section, { type: "experience" | "projects" }>["items"][number];
      const first = titles.item(0);
      if (first) {
        const left = first.querySelector<HTMLElement>(".left");
        const right = first.querySelector<HTMLElement>(".right");
        if (left) setLeftText(left, exp.org || "");
        if (right) right.textContent = range(exp);
      }
      const second = titles.item(1);
      if (second) {
        const left = second.querySelector<HTMLElement>(".left");
        const right = second.querySelector<HTMLElement>(".right");
        if (left) {
          setLeftText(
            left,
            [exp.role, exp.department]
              .map((part) => part?.trim())
              .filter(Boolean)
              .join(" "),
          );
        }
        if (right) right.textContent = exp.location || "";
      }
      const bullets = bulletList(exp);
      const depths =
        Array.isArray(exp.bulletDepths) && exp.bulletDepths.length === bullets.length
          ? exp.bulletDepths
          : null;
      const ul = node.querySelector<HTMLUListElement>(".menu-content ul");
      if (ul) {
        // Clone the first original <li> as a prototype so the rebuilt items keep
        // the template's inner structure (e.g. <li><p>text</p></li> 鈥?dropping
        // the <p> changes line spacing and shortens the section).
        const origLi = ul.querySelector<HTMLLIElement>(":scope > li");
        const liProto = origLi ? (origLi.cloneNode(true) as HTMLLIElement) : null;
        const setLiText = (li: HTMLLIElement, text: string) => {
          const p = li.querySelector<HTMLElement>("p");
          if (p) {
            p.textContent = text;
            // Remove any sibling block that held the original sample text.
            li.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => {
              if (child !== p) child.remove();
            });
          } else {
            li.textContent = text;
          }
        };
        ul.replaceChildren();
        // Reproduce the original renderer's exact list structure. Captured
        // markup uses one of two shapes for sub-items:
        //   inside  鈥?<li>琛屽姩锛?ul>鈥?/ul></li>   (sub-list nested in the <li>)
        //   sibling 鈥?<li>琛屽姩锛?/li><ul>鈥?/ul>   (sub-list is a sibling <ul>)
        // The box model differs, so mirror whichever the template used.
        const style = exp.bulletNestStyle ?? "sibling";
        let subList: HTMLUListElement | null = null;
        let lastTopLi: HTMLLIElement | null = null;
        bullets.forEach((bullet, index) => {
          const depth = depths ? Math.max(0, depths[index] ?? 0) : 0;
          const li = liProto
            ? (liProto.cloneNode(true) as HTMLLIElement)
            : document.createElement("li");
          // A nested <ul> inside the prototype must not leak into a plain item.
          li.querySelectorAll("ul").forEach((u) => u.remove());
          setLiText(li, bullet);
          if (depth === 0) {
            ul.appendChild(li);
            lastTopLi = li;
            subList = null;
          } else if (depth === 1) {
            if (style === "inside" && lastTopLi) {
              let sub = lastTopLi.querySelector<HTMLUListElement>(":scope > ul");
              if (!sub) {
                sub = document.createElement("ul");
                lastTopLi.appendChild(sub);
              }
              sub.appendChild(li);
              subList = sub;
            } else {
              if (!subList) {
                subList = document.createElement("ul");
                ul.appendChild(subList);
              }
              subList.appendChild(li);
            }
          } else {
            // Deeper nesting is rare; attach under the last sub-item.
            const lastSub = subList?.lastElementChild as HTMLElement | undefined;
            if (lastSub) {
              let deep = lastSub.querySelector<HTMLUListElement>(":scope > ul");
              if (!deep) {
                deep = document.createElement("ul");
                lastSub.appendChild(deep);
              }
              deep.appendChild(li);
            } else {
              ul.appendChild(li);
            }
          }
        });
      } else {
        const target = node.querySelector<HTMLElement>(".menu-content");
        if (target) target.textContent = bullets.join("；");
      }
    }
    content.appendChild(node);
  }

  // Apply the "last item has a bottom rule" pattern the original renderer uses.
  const built = Array.from(
    content.querySelectorAll<HTMLElement>(".section-item-container"),
  );
  if (
    built.length > 0 &&
    lastBorder.width &&
    lastBorder.width !== "0px" &&
    lastBorder.style !== "none"
  ) {
    built.forEach((node) => {
      node.style.borderBottomWidth = "0px";
    });
    const lastNode = built[built.length - 1];
    lastNode.style.borderBottomWidth = lastBorder.width;
    lastNode.style.borderBottomStyle = lastBorder.style;
    lastNode.style.borderBottomColor = lastBorder.color;
  }

  if (items.length === 0) {
    // Clear any leftover sample content the clone may carry, anywhere in the
    // module (not only inside .info-content).
    option.querySelectorAll(".section-item-container").forEach((n) => n.remove());
    option.querySelectorAll(".menu-content").forEach((n) => {
      n.textContent = "";
    });
    if (keepEmpty) {
      // A newly added, still-empty module: show its title so it appears on the
      // right like in the editor.
      option.style.display = "";
    } else {
      // Template sample with no items: hide, preserving the original layout.
      option.style.display = "none";
    }
  }
}

function extrasFor(sections: Section[]) {
  const rows: { title: string; value: string; section: Section }[] = [];
  for (const section of sections) {
    if (!("items" in section) || section.items.length === 0) continue;
    // Prefer the exact string the original template rendered (separator and
    // spacing vary per template); fall back to joining the items.
    const raw = (section as { rawValue?: string }).rawValue?.trim();
    const value =
      raw ||
      (section.type === "skills"
        ? section.items
            .map((item) =>
              [item.name, item.detail ? `（${item.detail}）` : ""].join(""),
            )
            .filter(Boolean)
            .join("，")
        : (section.items as { text?: string }[])
            .map((item) => item.text ?? "")
            .filter(Boolean)
            .join("，"));
    if (!value.trim()) continue;
    rows.push({
      section,
      title: section.title || (section.type === "skills" ? "技能" : "其他"),
      value,
    });
  }
  return rows;
}

function bindExtras(option: HTMLElement, sections: Section[]) {
  const content = option.querySelector<HTMLElement>(".info-content");
  if (!content) return;
  const rows = extrasFor(sections);
  if (rows.length === 0) {
    option.style.display = "none";
    return;
  }

  const iconItems = content.querySelectorAll<HTMLElement>(".extras-icon-item");
  if (iconItems.length > 0) {
    const all = Array.from(iconItems);
    const templates = all.map((node) => node.cloneNode(true) as HTMLElement);
    all.forEach((node) => node.remove());
    const container =
      content.querySelector<HTMLElement>(".extras-icon-container") ?? content;
    // Preserve the template's original row order: walk the captured rows and
    // fill each with the matching section; unmatched rows are hidden, and any
    // extra sections are appended after.
    const used = new Set<number>();
    const labelOf = (node: HTMLElement) =>
      (node.querySelector(".extras-icon-title")?.textContent ?? "").replace(/[:：]/g, "").trim();
    all.forEach((orig, index) => {
      const label = labelOf(orig);
      const rowIndex = rows.findIndex(
        (row, rIdx) => !used.has(rIdx) && row.title.includes(label),
      );
      if (rowIndex < 0) return; // no matching section for this template row
      used.add(rowIndex);
      const row = rows[rowIndex];
      const node = templates[index].cloneNode(true) as HTMLElement;
      const title = node.querySelector<HTMLElement>(".extras-icon-title");
      const value = node.querySelector<HTMLElement>(".extras-icon-right span");
      if (title) title.textContent = `${row.title}：`;
      if (value) value.textContent = row.value;
      container.appendChild(node);
    });
    rows.forEach((row, rIdx) => {
      if (used.has(rIdx)) return;
      const node = templates[0]?.cloneNode(true) as HTMLElement | undefined;
      if (!node) return;
      const title = node.querySelector<HTMLElement>(".extras-icon-title");
      const value = node.querySelector<HTMLElement>(".extras-icon-right span");
      if (title) title.textContent = `${row.title}：`;
      if (value) value.textContent = row.value;
      container.appendChild(node);
    });
    return;
  }

  const listItem = content.querySelector<HTMLElement>("li.extras-item");
  if (listItem) {
    const originals = Array.from(
      content.querySelectorAll<HTMLElement>("li.extras-item"),
    );
    content.querySelectorAll("li.extras-item").forEach((node) => node.remove());
    const list = content.querySelector("ul.menu");
    const labelOf = (li: HTMLElement) =>
      (li.querySelector(":scope > span")?.textContent ?? "")
        .replace(/[:：]/g, "")
        .trim();
    const fill = (node: HTMLElement, row: { title: string; value: string }) => {
      // Preserve the two-span structure (<span class="font_w_b">label</span>
      // <span>value</span>) so the bold label and value wrap like the original;
      // flattening to textContent would drop the bold span and change wrapping.
      const spans = node.querySelectorAll<HTMLElement>(":scope > span");
      const labelSpan = spans[0];
      const valueSpan = spans[1];
      if (labelSpan && valueSpan) {
        labelSpan.textContent = `${row.title}：`;
        valueSpan.textContent = row.value;
      } else {
        node.textContent = `${row.title}： ${row.value}`;
      }
    };
    // Preserve original row order; unmatched rows hidden, extra rows appended.
    const used = new Set<number>();
    originals.forEach((orig) => {
      const label = labelOf(orig);
      const rowIndex = rows.findIndex(
        (row, rIdx) => !used.has(rIdx) && row.title.includes(label),
      );
      if (rowIndex < 0) return;
      used.add(rowIndex);
      const node = orig.cloneNode(true) as HTMLElement;
      fill(node, rows[rowIndex]);
      (list ?? content).appendChild(node);
    });
    rows.forEach((row, rIdx) => {
      if (used.has(rIdx)) return;
      const node = listItem.cloneNode(true) as HTMLElement;
      fill(node, row);
      (list ?? content).appendChild(node);
    });
    return;
  }

  content.textContent = rows.map((row) => `${row.title}：${row.value}`).join("  ");
}

/**
 * Layout the captured page at its natural content height, minimum one A4 page.
 *
 * The original site's own template covers are generated in "image" mode
 * (`.main.image { height: max-content !important; min-height: 297mm }`), so the
 * cover 鈥?which the user downloads and compares against 鈥?is a natural-height
 * render, taller than A4 when the content needs it. Reproducing that exactly
 * means: never shrink, never stretch; set the page to A4 width, let the height
 * follow the content, and only clamp upward at one page.
 *
 * Returns the final page height in pixels.
 */
/**
 * Apply the editor's theme controls (瀛楀彿 / 琛岃窛 / 椤佃竟璺?/ 涓昏壊) on top of the
 * template's own styles. Scaling is relative to the template's native values,
 * so the neutral theme (fontScale "md", lineHeight 1.2, margin 10, primary "")
 * leaves the 1:1 render untouched.
 */
/**
 * 左右页边距：把增量加到“最外层的内容留白载体”上。
 * 模板用内容块自身的 margin/padding 实现水平留白；只调整每侧最外层的一个载体，
 * 避免父子同时加导致留白成倍变化。全幅背景/花纹（绝对定位）不参与，保持原样。
 */
function adjustContentGutters(main: HTMLElement, deltaPx: number, view: Window) {
  const selector = [
    ".content",
    ".content-scroll",
    ".option",
    ".info-content",
    ".module-title-wrapper",
    ".section-item-container",
    ".menu.extras",
    ".user",
    ".user-info",
    ".profile-content",
  ].join(",");
  const nodes = Array.from(main.querySelectorAll<HTMLElement>(selector));
  const candidates = new Set(nodes);
  const carrier = (cs: CSSStyleDeclaration, side: "Left" | "Right") => {
    const margin = Number.parseFloat(cs.getPropertyValue(`margin-${side.toLowerCase()}`)) || 0;
    if (margin > 0.5) return "margin" as const;
    const padding = Number.parseFloat(cs.getPropertyValue(`padding-${side.toLowerCase()}`)) || 0;
    if (padding > 0.5) return "padding" as const;
    return null;
  };
  for (const el of nodes) {
    const style = view.getComputedStyle(el);
    for (const side of ["Left", "Right"] as const) {
      const mode = carrier(style, side);
      if (!mode) continue;
      // 若祖先已经是同侧载体，本元素属于内层排版，不再叠加。
      let ancestor = el.parentElement;
      let covered = false;
      while (ancestor && ancestor !== main) {
        if (candidates.has(ancestor) && carrier(view.getComputedStyle(ancestor), side)) {
          covered = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (covered) continue;

      const prop = `${mode}-${side.toLowerCase()}`;
      const attr = `data-blazecv-gutter-${side.toLowerCase()}-${mode}`;
      if (el.getAttribute(attr) === null) {
        el.setAttribute(attr, String(Number.parseFloat(style.getPropertyValue(prop)) || 0));
      }
      const base = Number.parseFloat(el.getAttribute(attr) ?? "") || 0;
      el.style.setProperty(prop, `${Math.max(0, base + deltaPx)}px`, "important");
    }
  }
}

function applyThemeOverrides(root: HTMLElement, doc: ResumeDoc) {
  const main = root.querySelector<HTMLElement>(".main");
  const theme = doc.theme;
  if (!main || !theme) return;
  const view = root.ownerDocument.defaultView ?? window;
  const cs = view.getComputedStyle(main);
  const scaleMap: Record<string, number> = {
    xs: 0.86,
    sm: 0.94,
    smd: 0.97,
    md: 1,
    lg: 1.06,
  };
  const scale =
    theme.fontScale === "custom"
      ? Math.min(1.3, Math.max(0.7, theme.customFontScale ?? 1))
      : scaleMap[theme.fontScale] ?? 1;
  // fitScale compresses everything to reach a single page ("自动适配一页").
  const fit = theme.fitScale && theme.fitScale < 1 ? theme.fitScale : 1;
  const mul = scale * fit;
  // 字号变化必须同时缩放行高：模板大量节点写了显式 px 行高，只缩字号时
  // 行盒高度不变，降字号不会腾出任何纵向空间（自动适配一页因此失效）。
  // lineHeight 控件与 fit 再叠加在这之上；中性值(1.0 × 1.2 / 1.2) 仍为 1。
  const lhMul = mul * ((theme.lineHeight ?? 1.2) / 1.2);
  const scaleFonts = Math.abs(mul - 1) > 0.001;
  const scaleLines = Math.abs(lhMul - 1) > 0.001;
  if (scaleFonts || scaleLines) {
    // 先快照再写入：父元素改成 px 后，子元素的 computed 值会跟着变，
    // 边读边写会把继承字号/行高重复缩放。
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("*"));
    const snapshot = nodes.map((el) => {
      const style = view.getComputedStyle(el);
      return {
        font: scaleFonts ? Number.parseFloat(style.fontSize) || 0 : 0,
        line: scaleLines ? Number.parseFloat(style.lineHeight) || 0 : 0,
      };
    });
    nodes.forEach((el, index) => {
      if (snapshot[index].font) {
        el.style.setProperty("font-size", `${snapshot[index].font * mul}px`, "important");
      }
      if (snapshot[index].line) {
        el.style.setProperty("line-height", `${snapshot[index].line * lhMul}px`, "important");
      }
    });
  }

  // 页边距：相对中性值 10mm 的增量，避免默认改变模板原生内边距。
  if (typeof theme.margin === "number") {
    const deltaPx = ((theme.margin - 10) * 96) / 25.4;
    if (Math.abs(deltaPx) > 0.5) {
      // Remember the template's native padding once: applyExactTemplate can be
      // called repeatedly on the same root, and padding must not accumulate.
      const base = (key: string, value: string, fallback = 0) => {
        const attr = `blazecvBase${key}`;
        if (main.dataset[attr] === undefined) {
          main.dataset[attr] = String(Number.parseFloat(value) || fallback);
        }
        return Number.parseFloat(main.dataset[attr] ?? "") || fallback;
      };
      const padTop = base("paddingTop", cs.paddingTop);
      const padBottom = base("paddingBottom", cs.paddingBottom);
      const padLeft = base("paddingLeft", cs.paddingLeft);
      const padRight = base("paddingRight", cs.paddingRight);

      // The captured CSS implements page margin as top/bottom padding only; the
      // horizontal padding is always 0. Changing left/right here shifted the
      // full-bleed header artwork sideways and clipped it.
      main.style.setProperty("padding-top", `${Math.max(0, padTop + deltaPx)}px`, "important");
      main.style.setProperty("padding-bottom", `${Math.max(0, padBottom + deltaPx)}px`, "important");
      main.style.setProperty("padding-left", `${Math.max(0, padLeft)}px`, "important");
      main.style.setProperty("padding-right", `${Math.max(0, padRight)}px`, "important");

      // 水平页边距：模板的左右留白不在 .main 上，而在内容块自己的
      // margin/padding（.user / .info-content / .module-title-wrapper /
      // .section-item-container / .menu.extras …）。直接给 .main 加左右 padding
      // 会把绝对定位的全幅头部花纹推歪并裁切（历史 bug），所以只调整这些
      // “最外层留白载体”的左右间距；背景/花纹保持全幅。
      adjustContentGutters(main, deltaPx, view);

      // Templates raise .header-line to the padding height (padding-5/6/8/10).
      // Grow the top band by the same delta so it never detaches from the
      // header, which is the "solid blue bar + white gap" artifact.
      const headerLine = root.querySelector<HTMLElement>(".header-line");
      if (headerLine) {
        const lineStyle = view.getComputedStyle(headerLine);
        const lineTop = Number.parseFloat(lineStyle.top) || 0;
        const isTopBand =
          lineStyle.position === "absolute" &&
          Math.abs(lineTop) <= 0.5 &&
          headerLine.getBoundingClientRect().width >= main.clientWidth * 0.8;
        const lineHeight = Number.parseFloat(lineStyle.height) || 0;
        if (isTopBand && lineHeight > 0) {
          const lineBase = base("headerLineHeight", `${lineHeight}px`);
          headerLine.style.setProperty(
            "height",
            `${Math.max(0, lineBase + deltaPx)}px`,
            "important",
          );
        }
      }
    }
  }

  // 主色：把模板实际使用的强调色替换为用户选的主色（theme.primary 为空则跟随模板）。
  // 注意：改字号会让浏览器把内联 #4183FF 重新序列化为 rgb(65,131,255)，需同时按 hex 与 rgb() 匹配。
  const targetPrimary = (theme.primary || "").trim().toLowerCase();
  if (targetPrimary) {
    const accent = detectAccent(root);
    if (accent && accent !== targetPrimary) {
      const accentRgb = hexToRgbParts(accent);
      const accentHexRe = new RegExp(accent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const accentRgbRe = accentRgb
        ? new RegExp(
            `rgba?\\(\\s*${accentRgb[0]}\\s*,\\s*${accentRgb[1]}\\s*,\\s*${accentRgb[2]}\\s*(?:,\\s*[\\d.]+\\s*)?\\)`,
            "gi",
          )
        : null;
      root.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
        const style = el.getAttribute("style") || "";
        let out = style.replace(accentHexRe, targetPrimary);
        if (accentRgbRe) out = out.replace(accentRgbRe, targetPrimary);
        if (out !== style) el.setAttribute("style", out);
      });
      root.querySelectorAll<SVGElement>("[fill]").forEach((el) => {
        const fill = el.getAttribute("fill") || "";
        if (fill.toLowerCase() === accent) el.setAttribute("fill", targetPrimary);
      });
    }
  }
}

function hexToRgbParts(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  return [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ];
}

function rgbStringToHex(value: string): string {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i);
  if (!m) return "";
  if (m[4] !== undefined && Number(m[4]) === 0) return "";
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Pick the template's dominant accent colour from its own markup. */
function detectAccent(root: HTMLElement): string {
  const view = root.ownerDocument.defaultView ?? window;
  const header = root.querySelector<HTMLElement>(".header-line, .cv-pattern");
  if (header) {
    const fromComputed = rgbStringToHex(view.getComputedStyle(header).backgroundColor);
    if (fromComputed) return fromComputed;
    const fromFill = header.getAttribute("fill") || "";
    if (/^#[0-9a-f]{6}$/i.test(fromFill)) return fromFill.toLowerCase();
  }
  const svgFill = root.querySelector<SVGElement>("svg [fill]");
  if (svgFill) {
    const f = (svgFill.getAttribute("fill") || "").toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(f)) return f;
  }
  const title = root.querySelector<HTMLElement>(".module-title-wrapper .title, .title");
  if (title) {
    const hex = rgbStringToHex(view.getComputedStyle(title).color);
    if (hex) return hex;
  }
  return "";
}

async function layoutNaturalPage(
  root: HTMLElement,
  options: { fast?: boolean } = {},
): Promise<number> {
  const main = root.querySelector<HTMLElement>(".main");
  if (!main) return EXACT_HEIGHT_PX;

  main.style.removeProperty("zoom");
  main.style.setProperty("width", `${EXACT_WIDTH_PX}px`, "important");
  // Let the content decide the height; the page-floor is one A4 sheet.
  main.style.setProperty("height", "auto");
  main.style.setProperty("min-height", `${EXACT_HEIGHT_PX}px`);

  const content = root.querySelector<HTMLElement>(".content");
  if (content) {
    content.style.height = "auto";
    content.style.overflow = "visible";
  }
  const scroll = root.querySelector<HTMLElement>(".content-scroll");
  if (scroll) {
    scroll.style.height = "auto";
    scroll.style.overflow = "visible";
  }

  if (!options.fast) {
    // Web fonts change metrics; measure only after they settle, otherwise the
    // frozen height is a few pixels short and every row below drifts.
    // Auto-fit measurements skip this: the preview already rendered once, fonts
    // are loaded, and getBoundingClientRect below forces layout synchronously.
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    await root.ownerDocument.fonts?.ready.catch(() => undefined);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  const naturalHeight = Math.ceil(main.getBoundingClientRect().height);
  const pageHeight = Math.max(EXACT_HEIGHT_PX, naturalHeight);

  // Freeze the measured height so every capture path (PNG/PDF/Word) and the
  // scaled preview all see exactly the same sheet.
  main.style.setProperty("min-height", "0");
  main.style.setProperty("height", `${pageHeight}px`, "important");
  root.style.setProperty("height", `${pageHeight}px`, "important");
  root.style.setProperty("width", `${EXACT_WIDTH_PX}px`, "important");

  // Sidebar layouts anchor an absolutely-positioned profile column at
  // min-height:297mm; grow it to the natural page so the rail background fills.
  root
    .querySelectorAll<HTMLElement>(
      ".left-profile-wrapper, .left-profile-wrapper .profile-content",
    )
    .forEach((node) => {
      node.style.setProperty("height", `${pageHeight}px`, "important");
      node.style.setProperty("min-height", `${pageHeight}px`, "important");
    });

  setExactHeightRef(pageHeight);
  return pageHeight;
}

export function getExactTemplateToken(doc: ResumeDoc): string | null {
  const safe = (value?: string) =>
    value && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
  // Resolve ONLY from this document's own template identity. Never fall back to
  // getDocTemplate(): an unknown id there resolves to TEMPLATE_PRESETS[0], i.e.
  // a different template, which made the editor occasionally jump templates.
  // The preset must also match the current templateId — a stale preset left
  // after switching templates must not turn a classic template into an exact one.
  const preset = doc.templatePreset;
  const fromSource =
    preset && preset.id === doc.templateId ? safe(preset.source?.token) : null;
  if (fromSource) return fromSource;
  const presetId =
    preset && preset.id === doc.templateId ? preset.id : undefined;
  if (presetId && presetId.startsWith("wcx-")) {
    const fromPresetId = safe(presetId.slice(4));
    if (fromPresetId) return fromPresetId;
  }
  const templateId = String(doc.templateId ?? "");
  if (templateId.startsWith("wcx-")) {
    return safe(templateId.slice(4));
  }
  return null;
}

export async function applyExactTemplate(
  root: HTMLElement,
  doc: ResumeDoc,
  settings: { fit?: boolean; onBind?: (boundHtml: string) => void } = {},
): Promise<number> {
  const page = root.ownerDocument;
  page.body.style.width = `${EXACT_WIDTH_PX}px`;
  page.body.style.height = "auto";
  root.style.setProperty("width", `${EXACT_WIDTH_PX}px`, "important");
  root.style.setProperty("height", "auto");
  const mainElement = root.querySelector<HTMLElement>(".main");
  if (mainElement) {
    mainElement.style.setProperty("width", `${EXACT_WIDTH_PX}px`, "important");
    mainElement.style.setProperty("height", "auto");
    mainElement.style.setProperty("min-height", `${EXACT_HEIGHT_PX}px`);
    mainElement.style.removeProperty("zoom");
  }
  bindBasics(root, doc);
  const visible = doc.sections.filter((section) => section.visible !== false);
  const summary = visible.find((section) => section.type === "summary");
  const experiences = visible.filter(
    (section): section is ExperienceSection => section.type === "experience",
  );
  const projects = visible.filter(
    (section): section is ExperienceSection => section.type === "projects",
  );
  const educations = visible.filter(
    (section): section is EducationSection => section.type === "education",
  );
  const certificates = visible.filter(
    (section): section is TextSection => section.type === "certificates",
  );
  const extras: Section[] = visible.filter((section) => section.type === "skills");
  const customSections = visible.filter(
    (section): section is TextSection => section.type === "custom",
  );

  const options = Array.from(root.querySelectorAll<HTMLElement>(".option"));
  const used = new Set<HTMLElement>();
  const optionsParent = options[0]?.parentElement ?? root;
  // The template's 其它 slot (技能/语言 merge target), if present.
  const extrasOptionNode =
    options.find(
      (o) => o.classList.contains("extras") && o.style.display !== "none",
    ) ?? null;
  // section → rendered option, so we can reorder to the editor's module order.
  const mapped: { section: Section; option: HTMLElement }[] = [];

  // Prototypes let a section that has no free template slot (a newly added
  // module, or a second module of a type the template only has once) still be
  // rendered by cloning a same-type option.
  const protoByClass = (cls: string) =>
    options.find((o) => o.classList.contains(cls))?.cloneNode(true) as
      | HTMLElement
      | undefined;
  const protos: Record<string, HTMLElement | undefined> = {
    works: protoByClass("works") ?? protoByClass("orgs"),
    orgs: protoByClass("orgs") ?? protoByClass("works"),
    project_experience: protoByClass("project_experience") ?? protoByClass("works"),
    edus: protoByClass("edus"),
    honor: protoByClass("honor") ?? protoByClass("certificates") ?? protoByClass("custom"),
    custom: protoByClass("custom") ?? protoByClass("works"),
  };

  const findOption = (predicate: (option: HTMLElement) => boolean) => {
    for (const option of options) {
      if (used.has(option)) continue;
      if (predicate(option) && option.style.display !== "none") {
        used.add(option);
        return option;
      }
    }
    return null;
  };

  const cloneOption = (cls: string, force = false): HTMLElement | null => {
    // Only create new slots for modules the user added/moved — except the
    // skills/language fallback below (force), which must render even for a
    // template that simply has no 其它 module.
    if (!doc.orderEdited && !force) return null;
    const proto = protos[cls] ?? protos.works ?? protos.custom;
    if (!proto) return null;
    const clone = proto.cloneNode(true) as HTMLElement;
    clone.style.display = "";
    optionsParent.appendChild(clone);
    options.push(clone);
    used.add(clone);
    return clone;
  };

  const summaryOption = findOption((option) => option.classList.contains("personal_summary"));
  if (summaryOption && summary?.content.trim()) {
    bindTitle(summaryOption, summary.title);
    const target = summaryOption.querySelector<HTMLElement>(".menu-content");
    if (target) target.textContent = summary.content;
    if (summary) mapped.push({ section: summary, option: summaryOption });
  } else {
    if (summaryOption) summaryOption.style.display = "none";
  }

  for (const section of experiences) {
    const title = section.title;
    let option = findOption(
      (node) =>
        node.classList.contains("works") &&
        node.querySelector(".module-title-wrapper .title")?.textContent?.trim() === title,
    );
    option ??= findOption(
      (node) =>
        (node.classList.contains("works") || node.classList.contains("orgs")) &&
        node.querySelector(".module-title-wrapper .title")?.textContent?.trim() === title,
    );
    option ??= findOption((node) => node.classList.contains("works"));
    option ??= findOption((node) => node.classList.contains("orgs"));
    option ??= cloneOption("works") ?? cloneOption("orgs");
    if (option) {
      bindItems(option, section, "experience", !!doc.orderEdited);
      mapped.push({ section, option });
    }
  }

  for (const section of projects) {
    let option = findOption((node) => node.classList.contains("project_experience"));
    option ??= cloneOption("project_experience") ?? cloneOption("works");
    if (option) {
      bindItems(option, section, "experience", !!doc.orderEdited);
      mapped.push({ section, option });
    }
  }

  for (const section of educations) {
    let option = findOption((node) => node.classList.contains("edus"));
    option ??= cloneOption("edus");
    if (option) {
      bindItems(option, section, "education", !!doc.orderEdited);
      mapped.push({ section, option });
    }
  }

  for (const section of certificates) {
    let option = findOption(
      (node) => node.classList.contains("honor") || node.classList.contains("certificates"),
    );
    option ??= cloneOption("honor");
    if (option) {
      bindItems(option, section, "text", !!doc.orderEdited);
      mapped.push({ section, option });
    } else {
      extras.push(section);
    }
  }

  for (const section of customSections) {
    let option = findOption((node) => node.classList.contains("custom"));
    if (!option) {
      // Template-provided language/interest sections (ids from the catalog
      // builder start with "ph_") merge into 其它; a NEW custom module the user
      // added still gets its own cloned module.
      if (extrasOptionNode && section.id.startsWith("ph_")) {
        extras.push(section);
        continue;
      }
      option = cloneOption("custom", true);
    }
    if (!option) {
      extras.push(section);
      continue;
    }
    if (option.querySelector(".section-item-container")) {
      bindItems(option, section, "text", !!doc.orderEdited);
    } else {
      bindTitle(option, section.title);
      const target = option.querySelector<HTMLElement>(".menu-content");
      if (target) {
        target.textContent = section.items.map((item) => item.text).join("；");
      }
    }
    mapped.push({ section, option });
  }

  const extrasOption = extrasOptionNode;
  if (extrasOption) {
    used.add(extrasOption);
    if (extras.length > 0) {
      bindExtras(extrasOption, extras);
      // Position the merged 其它 block at the earliest constituent section in
      // the editor order, so moving those modules reorders it correctly.
      const first = doc.sections.find((s) => extras.includes(s));
      mapped.push({ section: first ?? extras[0], option: extrasOption });
    } else {
      extrasOption.style.display = "none";
    }
  } else {
    // No 其它 module in this template: render each skills / language section as
    // its own module so the content isn't lost.
    const fillTextModule = (opt: HTMLElement, title: string, text: string) => {
      bindTitle(opt, title);
      const content = opt.querySelector<HTMLElement>(".info-content");
      const tpl = content?.querySelector<HTMLElement>(".section-item-container");
      if (content && tpl) {
        const node = tpl.cloneNode(true) as HTMLElement;
        content.querySelectorAll(".section-item-container").forEach((n) => n.remove());
        const titles = Array.from(node.querySelectorAll<HTMLElement>(".menu-title"));
        titles.slice(1).forEach((t) => t.remove());
        const mc = node.querySelector<HTMLElement>(".menu-content");
        if (mc) mc.textContent = text;
        content.appendChild(node);
      } else {
        const mc = opt.querySelector<HTMLElement>(".menu-content");
        if (mc) mc.textContent = text;
      }
    };
    for (const sec of extras) {
      if (!("items" in sec)) continue;
      const opt = cloneOption("custom", true) ?? cloneOption("works", true);
      if (!opt) continue;
      const text =
        sec.type === "skills"
          ? (sec.items as { name: string; detail?: string }[])
              .map((it) => [it.name, it.detail ? `（${it.detail}）` : ""].join(""))
              .join("，")
          : (sec.items as { text?: string }[]).map((it) => it.text ?? "").join("，");
      fillTextModule(opt, sec.title || "技能", text);
      mapped.push({ section: sec, option: opt });
    }
  }

  for (const option of options) {
    if (!used.has(option)) option.style.display = "none";
  }

  // Reflect the editor's module order ONLY after the user has manually moved /
  // added / removed a module. Template sample docs keep the original DOM order
  // so the 1:1 fidelity audit stays intact.
  const visibleOrder = doc.orderEdited
    ? doc.sections.filter((s) => s.visible !== false)
    : [];
  const ordered: HTMLElement[] = [];
  for (const s of visibleOrder) {
    for (const m of mapped) {
      if (m.section === s && !ordered.includes(m.option)) ordered.push(m.option);
    }
  }
  const reorder = ordered.filter((o) => o.parentElement === optionsParent);
  if (reorder.length > 1) {
    for (const option of reorder) optionsParent.appendChild(option);
  }

  // Snapshot the bound DOM before theme overrides so auto-fit can restore it and
  // try different 字号/行距/页边距 combinations without re-binding the document.
  settings.onBind?.(root.innerHTML);
  applyThemeOverrides(root, doc);
  if (settings.fit === false) return EXACT_HEIGHT_PX;
  return layoutNaturalPage(root);
}

/**
 * Auto-fit measurement helper: apply only the theme overrides to an already
 * bound DOM and return the natural height. `fast` skips the rAF/font waits —
 * fonts are already loaded in the live preview and layout is forced on read.
 */
export async function applyExactTheme(
  root: HTMLElement,
  doc: ResumeDoc,
  options: { fast?: boolean } = {},
): Promise<number> {
  applyThemeOverrides(root, doc);
  return layoutNaturalPage(root, options);
}

