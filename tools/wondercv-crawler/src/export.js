#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './http.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const FILE_INDEX = path.join(DATA, 'index.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const OUT = path.resolve(ROOT, args.out || 'dist');

// 清除账号相关、时间戳、预测缓存等与模板无关的字段
const DROP_KEYS = new Set([
  'avatar_url', 'email', 'phone', 'wechat', 'contact_id', 'username',
  'github_name', 'linked_in', 'homepage', 'cv_account', 'mentor_id', 'user_id',
  'last_sign_in_at', 'last_sign_in_platform', 'created_at', 'updated_at',
  'expired_at', 'predicted_result', 'predict_at', 'predict_cities',
  'pdf_file', 'pdf_count', 'share_code', 'visibility', 'editable',
]);

function scrub(value, key = '', parent = '') {
  if (Array.isArray(value)) return value.map((v) => scrub(v, key, parent));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k)) continue;
      // profile / basic_info 里的账号主键不保留
      if ((parent === 'profile' || parent === 'basicInfo') && (k === 'id' || k === 'cv_id')) continue;
      out[k] = scrub(v, k, parent === '' ? k : parent);
    }
    return out;
  }
  return value;
}

function tagsOf(sc) {
  return (sc.tags || []).map((t) => t?.cn).filter(Boolean);
}

function buildContent(cv) {
  return scrub({
    mode: cv.mode ?? '',
    profile: cv.profile ?? {},
    basicInfo: {
      cv_name: cv.basic_info?.cv_name,
      cv_type: cv.basic_info?.cv_type,
      lang: cv.basic_info?.lang,
      edu_title: cv.basic_info?.edu_title,
      work_title: cv.basic_info?.work_title,
      org_title: cv.basic_info?.org_title,
      other_title: cv.basic_info?.other_title,
      skills_title: cv.basic_info?.skills_title,
      languages_title: cv.basic_info?.languages_title,
      certificates_title: cv.basic_info?.certificates_title,
      interests_title: cv.basic_info?.interests_title,
      extras_position: cv.basic_info?.extras_position,
      sections_position: cv.basic_info?.sections_position,
    },
    edus: cv.edus ?? [],
    works: cv.works ?? [],
    orgs: cv.orgs ?? [],
    opus: cv.opus ?? [],
    customSections: cv.custom_sections ?? [],
    others: cv.others ?? {},
    submoduleInfo: cv.submodule_info ?? {},
  });
}

async function main() {
  await access(FILE_INDEX).catch(() => {
    throw new Error(`缺少 ${path.relative(ROOT, FILE_INDEX)}，先运行 node src/crawl.js`);
  });
  const index = JSON.parse(await readFile(FILE_INDEX, 'utf8'));
  const limit = args.limit ? Number(args.limit) : Infinity;

  await mkdir(OUT, { recursive: true });
  const full = [];
  const lite = [];
  let missing = 0;

  for (const entry of index.entries.slice(0, limit)) {
    let res;
    try {
      res = JSON.parse(await readFile(path.join(ROOT, entry.detailFile), 'utf8'));
    } catch {
      missing++;
      continue;
    }
    const sc = res.data?.sample_cv || {};
    const cv = res.data?.cv_data || {};
    const preview = entry.imageFile
      ? path.relative(OUT, path.join(ROOT, entry.imageFile)).split(path.sep).join('/')
      : null;

    const common = {
      token: entry.token,
      cvToken: entry.cvToken,
      name: sc.name || entry.name,
      desc: sc.desc || entry.desc,
      lang: sc.lang || entry.lang,
      tags: tagsOf(sc),
      tagDetails: (sc.tags || []).map((t) => ({ cn: t?.cn, en: t?.en, category: t?.category })),
      price: sc.price ?? 0,
      memberType: sc.member_type ?? null,
      peopleCount: sc.people_count ?? null,
      preview,
      format: cv.format_info || {},
    };

    lite.push({ ...common, counts: entry.counts });
    if (!args['no-content']) full.push({ ...common, content: buildContent(cv) });
  }

  await writeFileAtomic(path.join(OUT, 'templates.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'https://www.wondercv.com/jianlimoban/',
    count: full.length,
    templates: full,
  }, null, 1));

  await writeFileAtomic(path.join(OUT, 'templates-lite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: lite.length,
    templates: lite,
  }, null, 1));

  // CSV（带 BOM，Excel 直接打开不乱码）
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['token,name,lang,tags,theme_color,preview']
    .concat(lite.map((t) => [
      csvEscape(t.token),
      csvEscape(t.name),
      csvEscape(t.lang),
      csvEscape(t.tags.join('/')),
      csvEscape(t.format?.theme_color || ''),
      csvEscape(t.preview || ''),
    ].join(',')))
    .join('\r\n');
  await writeFileAtomic(path.join(OUT, 'templates.csv'), '﻿' + csv);

  // 统计
  const byTag = {};
  const byLang = {};
  const byColor = {};
  for (const t of lite) {
    for (const tag of t.tags) byTag[tag] = (byTag[tag] || 0) + 1;
    byLang[t.lang || '?'] = (byLang[t.lang || '?'] || 0) + 1;
    const color = t.format?.theme_color || '?';
    byColor[color] = (byColor[color] || 0) + 1;
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    count: lite.length,
    missingDetails: missing,
    withPreview: lite.filter((t) => t.preview).length,
    byLang,
    topTags: Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 40),
    topThemeColors: Object.entries(byColor).sort((a, b) => b[1] - a[1]).slice(0, 30),
  };
  await writeFileAtomic(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));

  console.log(`导出完成 -> ${path.relative(ROOT, OUT)}`);
  console.log(`  templates.json      ${full.length} 条（含内容）`);
  console.log(`  templates-lite.json ${lite.length} 条（仅元数据/版式）`);
  console.log(`  summary.json        标签/配色统计`);
  if (missing) console.log(`  缺失详情 ${missing} 条，可重跑 crawl 补抓`);
  if (args['no-content']) console.log('  （--no-content：templates.json 只含元数据）');
}

main().catch((err) => {
  console.error('导出失败:', err.message || err);
  process.exitCode = 1;
});
