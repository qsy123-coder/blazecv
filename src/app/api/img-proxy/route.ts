import { NextResponse } from "next/server";

/**
 * Small in-process cache so repeated exports (avatar + banner on every page)
 * do not re-fetch the same CDN image. Bounded and best-effort.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
type CacheEntry = { buffer: Buffer; contentType: string; at: number };
const imageCache = new Map<string, CacheEntry>();
let imageCacheBytes = 0;

function cacheGet(key: string): CacheEntry | null {
  const entry = imageCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    imageCache.delete(key);
    imageCacheBytes -= entry.buffer.length;
    return null;
  }
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (entry.buffer.length > 4 * 1024 * 1024) return;
  if (imageCacheBytes + entry.buffer.length > MAX_CACHE_BYTES) {
    imageCache.clear();
    imageCacheBytes = 0;
  }
  const previous = imageCache.get(key);
  if (previous) imageCacheBytes -= previous.buffer.length;
  imageCache.set(key, entry);
  imageCacheBytes += entry.buffer.length;
}

/**
 * Same-origin image proxy.
 *
 * Template pages reference avatars and banner patterns on external CDNs. The
 * editor iframe loads those directly (browsers allow cross-origin <img>), but
 * `html-to-image` used by the PNG/PDF/Word export must fetch each image and
 * inline it — and cross-origin fetches are blocked by CORS, so the exported
 * file silently dropped the avatar/banner. This proxy fetches the bytes on the
 * server (no CORS) and returns them same-origin so the export can inline them.
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("u");
  if (!target) {
    return NextResponse.json({ error: "missing u" }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 });
  }
  const cacheKey = url.toString();
  const cached = cacheGet(cacheKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  // Some CDNs (logo.wondercv.com) hotlink-protect and answer a non-browser
  // User-Agent with HTTP 200 + an empty body, which used to become a broken
  // image in exports. Use browser-like headers and reject empty bodies.
  const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  try {
    const upstream = await fetch(url.toString(), {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://www.wondercv.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: "upstream empty" }, { status: 502 });
    }
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    cacheSet(cacheKey, { buffer, contentType, at: Date.now() });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
