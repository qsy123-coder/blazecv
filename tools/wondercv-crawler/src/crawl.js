#!/usr/bin/env node
import { access, appendFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createClient,
  decodeJwtPayload,
  normalizeToken,
  ensureDir,
  writeFileAtomic,
  sleep,
  formatDuration,
} from './http.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DIR_DETAILS = path.join(DATA, 'details');
const DIR_IMAGES = path.join(DATA, 'images');
const FILE_LIST = path.join(DATA, 'list.json');
const FILE_INDEX = path.join(DATA, 'index.json');
const FILE_FAILED = path.join(DATA, 'failed.jsonl');
const FILE_LOG = path.join(DATA, 'crawl.log');

// ---------- CLI ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function loadConfig() {
  const file = path.resolve(ROOT, args.config || 'config.json');
  let cfg = {};
  if (await exists(file)) cfg = JSON.parse(await readFile(file, 'utf8'));
  else if (await exists(path.join(ROOT, 'config.example.json'))) {
    cfg = JSON.parse(await readFile(path.join(ROOT, 'config.example.json'), 'utf8'));
  }
  cfg.auth = cfg.auth || {};
  if (args.token) cfg.auth.token = args.token;
  if (process.env.WONDERCV_TOKEN) cfg.auth.token = process.env.WONDERCV_TOKEN;
  if (args.concurrency) cfg.network.concurrency = Number(args.concurrency);
  if (args.delay) cfg.network.delayMs = Number(args.delay);
  if (args['with-blog']) cfg.detail.needBlog = true;
  return cfg;
}

const cfg = await loadConfig();
const client = createClient(cfg);
const CONCURRENCY = Math.max(1, Number(cfg.network?.concurrency) || 4);
const QUIET = Boolean(args.quiet);

function log(...a) { if (!QUIET) console.log(...a); }

async function logFile(line) {
  await ensureDir(DATA);
  await appendFile(FILE_LOG, `[${new Date().toISOString()}] ${line}\n`);
}

async function fail(phase, token, err) {
  const rec = { time: new Date().toISOString(), phase, token, error: String(err?.message || err) };
  await ensureDir(DATA);
  await appendFile(FILE_FAILED, JSON.stringify(rec) + '\n');
  await logFile(`FAIL ${phase} ${token}: ${rec.error}`);
}

/** 固定并发 worker 池，逐项消费。 */
async function runPool(items, concurrency, worker, every = 25) {
  let cursor = 0;
  let done = 0;
  const total = items.length;
  const started = Date.now();
  async function next() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { await worker(items[i], i); }
      catch (err) { await fail(items[i]?.phase || 'worker', items[i]?.token || String(i), err); }
      done++;
      if (!QUIET && (done % every === 0 || done === total)) {
        const elapsed = Date.now() - started;
        const rate = done / Math.max(1, elapsed / 1000);
        const eta = rate > 0 ? ((total - done) / rate) * 1000 : 0;
        log(`  ${done}/${total}  ${rate.toFixed(1)}/s  剩余 ${formatDuration(eta)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

// ---------- 阶段 1：列表 ----------
async function crawlList() {
  if (!args['force-list'] && await exists(FILE_LIST)) {
    const cached = JSON.parse(await readFile(FILE_LIST, 'utf8'));
    if (cached.items?.length) {
      log(`列表已存在：${cached.items.length} 个模板（--force-list 可强制刷新）`);
      return cached.items;
    }
  }

  log('抓取模板列表 ...');
  const first = await client.getApi('/v3/sample_cvs', { page: 1, size: 20 });
  if (first.code !== 1000) throw new Error(`列表接口异常: ${first.code} ${first.message}`);
  let pageCount = first.data.page_count;
  if (args['max-pages']) pageCount = Math.min(pageCount, Number(args['max-pages']));

  const seen = new Map();
  const add = (items) => {
    for (const it of items) if (it?.token && !seen.has(it.token)) seen.set(it.token, it);
  };
  add(first.data.sample_cvs);

  const pages = [];
  for (let p = 2; p <= pageCount; p++) pages.push(p);
  let donePages = 1;
  const started = Date.now();

  await runPool(pages.map((p) => ({ page: p, phase: 'list' })), CONCURRENCY, async (job) => {
    const res = await client.getApi('/v3/sample_cvs', { page: job.page, size: 20 });
    if (res.code !== 1000) throw new Error(`code ${res.code} ${res.message}`);
    add(res.data.sample_cvs);
    donePages++;
    if (!QUIET && donePages % 20 === 0) {
      const elapsed = Date.now() - started;
      log(`  列表 ${donePages}/${pageCount} 页，去重后 ${seen.size} 个，${(elapsed / 1000).toFixed(0)}s`);
    }
  }, 20);
  await sleep(50);

  const items = [...seen.values()];
  const payload = {
    fetchedAt: new Date().toISOString(),
    pageCount,
    count: items.length,
    items,
  };
  await writeFileAtomic(FILE_LIST, JSON.stringify(payload, null, 1));
  log(`列表完成：${items.length} 个模板 -> ${path.relative(ROOT, FILE_LIST)}`);
  return items;
}

// ---------- 阶段 2：详情 ----------
function detailFile(token) { return path.join(DIR_DETAILS, `${token}.json`); }

async function crawlDetails(items) {
  if (!cfg.download?.details && !args['with-details']) {
    log('已关闭详情下载（download.details=false）');
    return;
  }
  await ensureDir(DIR_DETAILS);
  const todo = [];
  for (const it of items) {
    const file = detailFile(it.token);
    if (!args.force && await exists(file)) {
      const st = await stat(file);
      if (st.size > 200) continue;
    }
    todo.push({ token: it.token, img: it.img, phase: 'detail' });
  }
  log(`详情待抓取：${todo.length} / ${items.length}`);
  if (!todo.length) return;

  await runPool(todo, CONCURRENCY, async (job) => {
    const res = await client.getApi(`/v3/sample_cvs/${encodeURIComponent(job.token)}`, {
      need_moban: cfg.detail?.needMoban === false ? 0 : 1,
      need_blog: cfg.detail?.needBlog ? 1 : 0,
      need_tag: cfg.detail?.needTag === false ? 0 : 1,
    });
    if (res.code !== 1000) throw new Error(`code ${res.code} ${res.message || ''}`);
    await writeFileAtomic(detailFile(job.token), JSON.stringify(res));
  });
}

// ---------- 阶段 3：预览图 ----------
function extFromUrl(u) {
  try {
    const p = new URL(u).pathname.toLowerCase();
    const m = p.match(/\.(png|jpe?g|webp|gif)$/);
    if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  } catch { /* ignore */ }
  return 'png';
}

async function crawlImages(items) {
  if (!cfg.download?.images) { log('已关闭预览图下载'); return; }
  await ensureDir(DIR_IMAGES);
  const todo = [];
  for (const it of items) {
    const img = it.img;
    if (!img) continue;
    const file = path.join(DIR_IMAGES, `${it.token}.${extFromUrl(img)}`);
    if (!args.force && await exists(file)) {
      const st = await stat(file);
      if (st.size > 1000) continue;
    }
    todo.push({ token: it.token, img, file, phase: 'image' });
  }
  const missing = items.filter((it) => !it.img).length;
  log(`预览图待下载：${todo.length} / ${items.length}${missing ? `（${missing} 个无图）` : ''}`);
  if (!todo.length) return;

  await runPool(todo, CONCURRENCY, async (job) => {
    const { buffer } = await client.getImage(job.img);
    if (!buffer?.length) throw new Error('空图片响应');
    await writeFileAtomic(job.file, buffer);
  }, 50);
}

// ---------- 阶段 4：索引 ----------
function pickTags(tags) {
  return (tags || []).map((t) => t?.cn).filter(Boolean);
}

function moduleCounts(cv) {
  const len = (x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 0);
  const custom = Array.isArray(cv.custom_sections) ? cv.custom_sections : [];
  return {
    edus: len(cv.edus),
    works: len(cv.works),
    orgs: len(cv.orgs),
    projects: custom.filter((s) => s?.category === 'project').length,
    customSections: custom.length,
    skills: cv.others?.skill?.description ? 1 : 0,
  };
}

async function findImage(token) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
    const f = path.join(DIR_IMAGES, `${token}.${ext}`);
    if (await exists(f)) {
      const st = await stat(f);
      if (st.size > 0) return { file: path.relative(ROOT, f), bytes: st.size };
    }
  }
  return null;
}

async function buildIndex() {
  await ensureDir(DATA);
  if (!(await exists(DIR_DETAILS))) {
    log('没有详情目录，跳过索引');
    return;
  }
  const files = (await readdir(DIR_DETAILS)).filter((f) => f.endsWith('.json'));
  log(`构建索引：${files.length} 份详情 ...`);
  const entries = [];
  let bad = 0;
  for (const f of files) {
    const token = f.slice(0, -5);
    try {
      const res = JSON.parse(await readFile(path.join(DIR_DETAILS, f), 'utf8'));
      const sc = res.data?.sample_cv || {};
      const cv = res.data?.cv_data || {};
      const image = await findImage(token);
      entries.push({
        token,
        id: sc.id ?? null,
        cvToken: sc.cv_token ?? null,
        name: sc.name ?? '',
        desc: sc.desc ?? '',
        lang: sc.lang ?? '',
        price: sc.price ?? 0,
        memberType: sc.member_type ?? null,
        unlock: Boolean(sc.unlock),
        peopleCount: sc.people_count ?? null,
        tags: pickTags(sc.tags),
        tagDetails: (sc.tags || []).map((t) => ({ cn: t?.cn, en: t?.en, category: t?.category })),
        img: sc.img || '',
        imageFile: image?.file || null,
        imageBytes: image?.bytes || 0,
        cvName: cv.basic_info?.cv_name || '',
        mode: cv.mode || '',
        format: cv.format_info || {},
        counts: moduleCounts(cv),
        detailFile: path.relative(ROOT, path.join(DIR_DETAILS, f)),
      });
    } catch (err) {
      bad++;
      await fail('index', token, err);
    }
  }
  entries.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const out = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    bad,
    entries,
  };
  await writeFileAtomic(FILE_INDEX, JSON.stringify(out, null, 1));
  log(`索引完成：${entries.length} 条 -> ${path.relative(ROOT, FILE_INDEX)}`);
}

// ---------- main ----------
async function main() {
  const started = Date.now();
  await ensureDir(DATA);
  await logFile(`start argv=${process.argv.slice(2).join(' ')}`);
  log(`wondercv-crawler  ${new Date().toISOString()}`);
  log(`认证：${client.hasToken ? '已配置 _t token' : '未配置 token（匿名态）'}`);
  if (client.hasToken) {
    const payload = decodeJwtPayload(normalizeToken(cfg.auth?.token));
    const u = payload?.User || payload || {};
    if (u.is_membership !== undefined || u.membership_expired_at) {
      log(`会员态：${u.is_membership ? '是' : '否'}，到期：${u.membership_expired_at || '未知'}`);
    } else {
      log('会员态：token 已加载（payload 无会员字段，按接口返回为准）');
    }
  }

  if (args['index-only']) {
    await buildIndex();
    return;
  }

  const items = await crawlList();
  const limited = args['max-items'] ? items.slice(0, Number(args['max-items'])) : items;
  if (!args['list-only']) {
    if (cfg.download?.details !== false) await crawlDetails(limited);
    if (cfg.download?.images !== false && !args['no-images']) await crawlImages(limited);
    await buildIndex();
  }

  const s = client.stats;
  log(`完成，用时 ${formatDuration(Date.now() - started)}；请求 ${s.requests} 次（重试 ${s.retries}），传输 ${(s.bytes / 1048576).toFixed(1)} MB`);
  if (await exists(FILE_FAILED)) log(`存在失败记录：${path.relative(ROOT, FILE_FAILED)}（重跑会自动补抓）`);
}

main().catch((err) => {
  console.error('致命错误:', err);
  logFile(`fatal ${err?.stack || err}`).catch(() => {});
  process.exitCode = 1;
});
