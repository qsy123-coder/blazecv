/**
 * 批量清洗模板里的品牌/个人身份样例字样，并把外部真人头像换成本地占位图。
 *
 * 作用范围：public/template-content/*.json（样例数据）与
 * public/template-pages/*.html（抓取的原站 DOM）。替换均为纯字符串替换，
 * 不涉及引号/反斜杠/换行，不会破坏 JSON 或 HTML 结构；可重复执行（幂等）。
 *
 * 运行：node scripts/scrub-template-identity.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["public/template-content", "public/template-pages"];

// 顺序敏感：先替换「陈媛媛Abbey」这类组合，再替换单独的「陈媛媛」「Abbey」。
const TEXT_REPLACEMENTS = [
  ["陈媛媛Abbey", "王小明"],
  ["陈媛媛 Abbey", "王小明"],
  ["陈媛媛（Abbey）", "王小明"],
  ["Yuanyuan Chen (Abbey)", "Wang Xiaoming"],
  ["Chen Yuanyuan Abbey", "Wang Xiaoming"],
  ["超级简历Abbey", "王小明"],
  ["超级简历Steve", "王小明"],
  ["陈媛媛", "王小明"],
  ["abbey@wondercv.com", "xiaoming@example.com"],
  ["mentor@wondercv.com", "support@example.com"],
  ["success@wondercv.com", "support@example.com"],
  ["xx@wondercv.com", "zhangsan@example.com"],
  ["超级公司", "示例公司"],
  ["超级简历", "示例"],
  ["Abbey", "Alex"],
];

// 外部真人头像（prod/staging 两套 OSS，路径都含 /avatars/）。
const AVATAR_RE = /https:\/\/[^"'()\s]+avatars\/[^"'()\s]+/g;
const AVATAR_REPLACEMENT = "/wondercv-assets/avatar-placeholder.svg";

const stats = new Map();
let totalFiles = 0;
let changedFiles = 0;
let avatarReplacements = 0;

for (const root of ROOTS) {
  const dir = join(process.cwd(), root);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") && !name.endsWith(".html")) continue;
    const file = join(dir, name);
    const before = readFileSync(file, "utf8");
    let content = before;

    for (const [from, to] of TEXT_REPLACEMENTS) {
      if (content.includes(from)) {
        const count = content.split(from).length - 1;
        content = content.split(from).join(to);
        stats.set(from, (stats.get(from) ?? 0) + count);
      }
    }

    const avatarMatches = content.match(AVATAR_RE);
    if (avatarMatches) avatarReplacements += avatarMatches.length;
    content = content.replace(AVATAR_RE, AVATAR_REPLACEMENT);

    if (content !== before) {
      writeFileSync(file, content, "utf8");
      changedFiles++;
    }
    totalFiles++;
  }
}

console.log(`totalFiles=${totalFiles} changedFiles=${changedFiles}`);
console.log(`avatarReplacements=${avatarReplacements}`);
for (const [from, count] of [...stats.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${from} -> ${count}`);
}
