import type { ResumeDoc } from "./types";
import map from "./legacy-identity-map.json";
import avatarGender from "./avatar-gender.json";
import namePools from "./placeholder-names.json";

/**
 * 已保存简历的旧样例数据清洗。
 *
 * 模板文件（public/template-*）在 2026-11 已全量清洗，但用户在那之前保存的简历
 * （浏览器 IndexedDB / 云端 user_resumes）仍带着原始样例的身份数据：
 * 陈媛媛Abbey、abbey@wondercv.com、188-8888-8888、超级公司、外部 OSS 真人头像……
 *
 * 这里按「字段级」替换，而不是全局字符串替换——只有明确是身份字段的值才映射，
 * 避免把正文里的「123」「刘丽」之类的字面量误伤。
 */

const NAME_MAP: Record<string, string> = map.names;
const EMAIL_MAP: Record<string, string> = map.emails;
const PHONE_MAP: Record<string, string> = map.phones;

/** 与模板清洗一致的非身份替换（公司/品牌/域名）。 */
const TEXT_RULES: Array<[string, string]> = [
  ["超级公司", "示例公司"],
  ["超级简历", "示例"],
  ["wondercv.com", "example.com"],
];

const EXTERNAL_AVATAR_RE = /^https?:\/\//i;

const AVATAR_DIR = "/wondercv-assets/avatars/";
/**
 * 头像按同名文件替换过（13 张 → 2 张），而线上给 `/wondercv-assets/*` 发的是
 * `immutable` 一年缓存，浏览器会一直显示旧图。资源 URL 带版本号强制换缓存键。
 * 换头像文件时把这个值 +1。
 */
const AVATAR_VERSION = "?v=2";
const AVATAR_GENDER = avatarGender as Record<string, "male" | "female">;
/** 头像编号列表来自 avatar-gender.json，新增/删除头像时无需改代码。 */
const AVATAR_INDEXES = Object.keys(AVATAR_GENDER);
const AVATAR_COUNT = AVATAR_INDEXES.length;
const MALE_NAMES: string[] = namePools.male;
const FEMALE_NAMES: string[] = namePools.female;

/**
 * 历史上用过的全部占位名（混合池 16 个 + 男女池 32 个），
 * 同样视为可安全对齐的占位名，会被收敛到当前的单名。
 */
const LEGACY_PLACEHOLDERS = new Set([
  // 最早的混合池
  "王小明", "李思远", "张若曦", "陈嘉宁", "刘子涵", "杨晨曦",
  "周慕白", "吴清和", "郑亦然", "孙可欣", "徐嘉树", "何书言",
  "林知远", "黄予安", "赵清欢", "马一诺",
  // 性别池（男）
  "张皓宇", "陈子昂", "刘博文", "杨志强", "周天成", "吴俊杰",
  "郑凯文", "孙浩然", "徐明轩", "何子豪", "高远航", "林建国",
  "罗子轩", "马天佑",
  // 性别池（女）
  "杨雪晴", "林思彤", "周语桐", "吴静怡", "郑雅婷", "徐婉清",
  "何书瑶", "刘雨桐", "马晓萱", "高静雯", "罗佳怡",
]);

const ALL_PLACEHOLDERS = new Set([
  ...MALE_NAMES,
  ...FEMALE_NAMES,
  ...LEGACY_PLACEHOLDERS,
]);

function genderOfAvatar(path: string): "male" | "female" | null {
  const match = path.replace(/\?.*$/, "").match(/avatar-(\d+)\.jpg$/);
  if (!match) return null;
  return AVATAR_GENDER[match[1]] ?? null;
}

function pickNameFor(seed: string, gender: "male" | "female"): string {
  const pool = gender === "male" ? MALE_NAMES : FEMALE_NAMES;
  return pool[rawHash(`${seed}#name`) % pool.length];
}

function rawHash(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function stableIndex(key: string): number {
  return rawHash(key) % AVATAR_COUNT;
}

function localAvatar(seed: string): string {
  return `/wondercv-assets/avatars/avatar-${stableIndex(seed) + 1}.jpg${AVATAR_VERSION}`;
}

/** 只在明确是身份字段时才做姓名映射。 */
function scrubName(value: string): string {
  const direct = NAME_MAP[value];
  if (direct) return direct;
  // 形如「陈媛媛 · 示例简历」的标题：替换其中已知的姓名片段
  let out = value;
  for (const [from, to] of Object.entries(NAME_MAP)) {
    if (from.length < 2) continue;
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function scrubText(value: string): string {
  let out = value;
  for (const [from, to] of TEXT_RULES) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function scrubEmail(value: string): string {
  return EMAIL_MAP[value] ?? value;
}

function scrubPhone(value: string): string {
  // 只映射真正的手机号形态，避免「123」这类短值误伤
  if (value.replace(/\D/g, "").length < 7) return value;
  return PHONE_MAP[value] ?? value;
}

/** 历史 13 张头像的性别，用于把旧编号映射到当前两套头像。 */
const LEGACY_AVATAR_GENDER: Record<string, "male" | "female"> = {
  "1": "female", "2": "male", "3": "male", "4": "female", "5": "male", "6": "female",
  "7": "male", "8": "female", "9": "male", "10": "male", "11": "male", "12": "female",
  "13": "female",
};

function avatarForGender(gender: "male" | "female"): string {
  const idx = AVATAR_INDEXES.find((i) => AVATAR_GENDER[i] === gender) ?? AVATAR_INDEXES[0];
  return `${AVATAR_DIR}avatar-${idx}.jpg${AVATAR_VERSION}`;
}

function scrubAvatar(value: string, seed: string): string {
  if (!value) return value;

  const bare = value.replace(/\?.*$/, "");
  const local = bare.match(/\/wondercv-assets\/avatars\/avatar-(\d+)\.jpg$/);
  if (local) {
    // 当前编号仍在用就直接保留，并补上缓存版本号
    if (AVATAR_GENDER[local[1]]) return `${bare}${AVATAR_VERSION}`;
    // 旧编号（如已删除的 avatar-5）按性别映射到现存头像
    const legacyGender = LEGACY_AVATAR_GENDER[local[1]];
    return legacyGender ? avatarForGender(legacyGender) : localAvatar(seed);
  }

  if (EXTERNAL_AVATAR_RE.test(value) && /avatars?\//i.test(value)) {
    return localAvatar(seed);
  }
  return value;
}

export interface ScrubResult {
  doc: ResumeDoc;
  changed: boolean;
}

/** 对一份简历 doc 做字段级清洗；无变化时返回原对象。 */
export function scrubLegacyDoc(input: ResumeDoc): ScrubResult {
  const doc: ResumeDoc = structuredClone(input);
  let changed = false;

  const setIfChanged = <T extends Record<string, unknown>, K extends keyof T>(
    target: T,
    key: K,
    next: string,
  ) => {
    if (typeof target[key] === "string" && target[key] !== next) {
      (target[key] as unknown as string) = next;
      changed = true;
    }
  };

  if (doc.title) {
    const next = scrubText(scrubName(doc.title));
    if (next !== doc.title) {
      doc.title = next;
      changed = true;
    }
  }

  const basics = doc.basics as unknown as Record<string, unknown>;
  if (typeof basics.name === "string") setIfChanged(basics, "name", scrubName(basics.name));
  if (typeof basics.email === "string") setIfChanged(basics, "email", scrubEmail(basics.email));
  if (typeof basics.phone === "string") setIfChanged(basics, "phone", scrubPhone(basics.phone));
  if (typeof basics.jobTitle === "string") {
    const next = scrubText(basics.jobTitle);
    if (next !== basics.jobTitle) {
      basics.jobTitle = next;
      changed = true;
    }
  }
  if (typeof basics.avatar === "string") {
    const next = scrubAvatar(basics.avatar, doc.id ?? "resume");
    if (next !== basics.avatar) {
      basics.avatar = next;
      changed = true;
    }
  }

  // 性别一致性：占位姓名必须与头像性别匹配。
  // 只在姓名仍是我们生成的占位名时校正——用户自己改过的真实姓名一律不动。
  const nameBeforeAlignment = typeof basics.name === "string" ? basics.name : null;
  if (typeof basics.name === "string" && ALL_PLACEHOLDERS.has(basics.name)) {
    const avatarPath = typeof basics.avatar === "string" ? basics.avatar : "";
    const gender = genderOfAvatar(avatarPath);
    if (gender) {
      const aligned = pickNameFor(doc.id ?? "resume", gender);
      if (aligned !== basics.name) {
        basics.name = aligned;
        changed = true;
      }
    } else {
      // 没有头像，或头像是用户自己的：按姓名性别选一张匹配的占位头像
      const nameGender = MALE_NAMES.includes(basics.name) ? "male" : "female";
      const pool = nameGender === "male" ? MALE_NAMES : FEMALE_NAMES;
      if (pool.includes(basics.name)) {
        const candidates = AVATAR_INDEXES.filter(
          (idx) => AVATAR_GENDER[idx] === nameGender,
        );
        const chosen = candidates[rawHash(`${doc.id ?? "resume"}#avatar`) % candidates.length];
        const local = `${AVATAR_DIR}avatar-${chosen}.jpg`;
        if (basics.avatar !== local) {
          basics.avatar = local;
          changed = true;
        }
      }
    }
  }

  // 正文：只做公司/品牌/域名替换，不动姓名映射，避免误伤叙述文本
  for (const section of doc.sections ?? []) {
    const raw = section as unknown as Record<string, unknown>;
    if (typeof raw.title === "string") {
      const next = scrubText(raw.title);
      if (next !== raw.title) {
        raw.title = next;
        changed = true;
      }
    }
    if (typeof raw.content === "string") {
      const next = scrubText(raw.content);
      if (next !== raw.content) {
        raw.content = next;
        changed = true;
      }
    }
    const items = raw.items as Array<Record<string, unknown>> | undefined;
    for (const item of items ?? []) {
      for (const key of ["org", "role", "school", "major", "detail", "text", "location", "name"]) {
        const value = item[key];
        if (typeof value !== "string") continue;
        const next = scrubText(value);
        if (next !== value) {
          item[key] = next;
          changed = true;
        }
      }
      if (Array.isArray(item.bullets)) {
        const bullets = item.bullets as string[];
        for (let i = 0; i < bullets.length; i += 1) {
          if (typeof bullets[i] !== "string") continue;
          const next = scrubText(bullets[i]);
          if (next !== bullets[i]) {
            bullets[i] = next;
            changed = true;
          }
        }
      }
    }
  }

  // 姓名若因性别对齐而改了，标题里的旧名字同步更新，避免「标题与正文不同名」
  if (
    nameBeforeAlignment &&
    typeof doc.basics.name === "string" &&
    doc.basics.name !== nameBeforeAlignment &&
    typeof doc.title === "string" &&
    doc.title.includes(nameBeforeAlignment)
  ) {
    doc.title = doc.title.split(nameBeforeAlignment).join(doc.basics.name);
    changed = true;
  }

  const preset = doc.templatePreset as unknown as Record<string, unknown> | undefined;
  if (preset && typeof preset.name === "string") {
    const next = scrubText(preset.name);
    if (next !== preset.name) {
      preset.name = next;
      changed = true;
    }
  }

  return { doc, changed };
}
