import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const API_BASE = 'https://api.wondercv.com/cv';
export const WEB_BASE = 'https://www.wondercv.com';

/** 串行令牌桶：保证全局请求间隔不低于 delayMs。 */
export function createLimiter(delayMs) {
  let nextAt = 0;
  return async function take() {
    if (!delayMs) return;
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + delayMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 从用户粘贴的内容中提取 JWT / cookie。
 * 支持：纯 JWT、"a=b; _t=xxx" 形式的整段 Cookie、带 "Cookie:" 前缀。
 */
export function normalizeToken(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (/^cookie:/i.test(s)) s = s.replace(/^cookie:/i, '').trim();
  if (s.includes('_t=')) {
    const m = s.match(/(?:^|[;\s])_t=([^;\s]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  if (s.includes('=') && s.includes(';')) {
    for (const part of s.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === '_t') return decodeURIComponent(v.join('='));
    }
  }
  return s.replace(/^Bearer\s+/i, '').trim();
}

/** 解析 _t（JWT）中的会员信息，只用于日志展示。 */
export function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function createClient(cfg) {
  const token = normalizeToken(cfg.auth?.token);
  const ua = cfg.headers?.userAgent
    || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const retries = cfg.network?.retries ?? 4;
  const timeoutMs = cfg.network?.timeoutMs ?? 30000;
  const limiter = createLimiter(cfg.network?.delayMs ?? 120);
  const stats = { requests: 0, retries: 0, bytes: 0 };

  function baseHeaders(extra = {}) {
    const h = {
      'User-Agent': ua,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Origin': WEB_BASE,
      'Referer': `${WEB_BASE}/jianlimoban/`,
      ...extra,
    };
    if (token) {
      h.Authorization = token;
      h.Cookie = `_t=${token}`;
    }
    return h;
  }

  async function request(url, { binary = false, accept } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await limiter();
      try {
        stats.requests++;
        const res = await fetch(url, {
          headers: baseHeaders(accept ? { Accept: accept } : {}),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'follow',
        });
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get('retry-after')) * 1000;
          throw Object.assign(new Error(`HTTP ${res.status}`), { retryable: true, retryAfter: ra || 0 });
        }
        if (!res.ok) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { retryable: false });
        }
        if (binary) {
          const buf = Buffer.from(await res.arrayBuffer());
          stats.bytes += buf.length;
          return { buffer: buf, contentType: res.headers.get('content-type') || '' };
        }
        const text = await res.text();
        stats.bytes += Buffer.byteLength(text);
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          throw Object.assign(new Error(`非 JSON 响应: ${text.slice(0, 120)}`), { retryable: true });
        }
        return json;
      } catch (err) {
        lastErr = err;
        const retryable = err.retryable !== false;
        if (attempt === retries || !retryable) break;
        stats.retries++;
        const wait = err.retryAfter || Math.min(15000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300);
        await sleep(wait);
      }
    }
    throw lastErr;
  }

  async function getApi(pathname, params) {
    const url = new URL(API_BASE + pathname);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return request(url.toString());
  }

  async function getImage(url) {
    return request(url, {
      binary: true,
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
    });
  }

  return { getApi, getImage, stats, hasToken: Boolean(token) };
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/** 原子写：先写 .part 再 rename，避免中断留下半个文件。 */
export async function writeFileAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.part`;
  await writeFile(tmp, data);
  try {
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h${m}m` : m ? `${m}m${sec}s` : `${sec}s`;
}
