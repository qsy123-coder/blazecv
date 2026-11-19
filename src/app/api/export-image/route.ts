import { NextResponse } from "next/server";
import { exportGate } from "@/lib/server/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side faithful export: render the resume with the exact template DOM/CSS
 * in a real (headless) browser and screenshot it. This is the same render path
 * the audit uses (pixel-identical to the editor preview), unlike html-to-image
 * which re-rasterises fonts and loses bold/spacing.
 *
 * The browser is reached via a CDP endpoint (EXPORT_CDP_URL) or launched with
 * EXPORT_CHROME_PATH. If neither is available the client falls back to the
 * html-to-image path.
 */
const IFRAME_SELECTOR = 'iframe[title="原站模板 1:1 预览"]';

async function getBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  const endpoints = [
    process.env.EXPORT_CDP_URL,
    "http://127.0.0.1:9227",
    "http://127.0.0.1:9226",
    "http://127.0.0.1:9222",
  ].filter(Boolean) as string[];
  for (const url of endpoints) {
    try {
      const browser = await puppeteer.connect({
        browserURL: url,
        defaultViewport: { width: 1000, height: 2600, deviceScaleFactor: 2 },
        protocolTimeout: 120000,
      });
      return { browser, owned: false };
    } catch {
      /* try next */
    }
  }
  const chrome = process.env.EXPORT_CHROME_PATH;
  if (chrome) {
    try {
      const browser = await puppeteer.launch({
        executablePath: chrome,
        headless: true,
        // Match the editor's rasterization: GPU rasterisation renders text
        // antialiasing differently on high-contrast (dark full-bleed) templates.
        args: ["--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: 1000, height: 2600, deviceScaleFactor: 2 },
      });
      return { browser, owned: true };
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: { doc?: unknown };
  try {
    body = (await request.json()) as { doc?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const doc = body.doc;
  if (!doc || typeof doc !== "object") {
    return NextResponse.json({ error: "missing doc" }, { status: 400 });
  }

  // Members-only gate: fail fast before acquiring a browser.
  const gate = await exportGate();
  if (!gate.allowed) {
    return NextResponse.json({ error: "membership_required" }, { status: 403 });
  }

  const acquired = await getBrowser();
  if (!acquired) {
    return NextResponse.json({ error: "no browser" }, { status: 503 });
  }
  const { browser, owned } = acquired;

  // The internal headless browser always talks to the app over loopback HTTP;
  // behind an HTTPS reverse proxy request.url can be https://localhost:3000,
  // which the local server cannot serve.
  const origin =
    process.env.EXPORT_INTERNAL_ORIGIN || new URL(request.url).origin;
  const b64 = Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/audit?doc=${encodeURIComponent(b64)}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForSelector(IFRAME_SELECTOR, { timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector("[data-audit-ready='1']"),
      { timeout: 45000 },
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
        ),
    );
    const height = await page.evaluate(async () => {
      const apply = (
        window as unknown as { __auditApply?: () => Promise<number> }
      ).__auditApply;
      if (typeof apply !== "function") return 0;
      const h = await apply();
      const target = String(h);
      for (let i = 0; i < 90; i += 1) {
        const cur = document
          .querySelector("[data-audit-height]")
          ?.getAttribute("data-audit-height");
        if (cur === target) break;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return h;
    });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
        ),
    );
    // Inline external avatar/banner images through the same-origin proxy so the
    // capture never depends on the headless browser reaching the CDN.
    await page.evaluate(async () => {
      const frame = document.querySelector(
        'iframe[title="原站模板 1:1 预览"]',
      ) as HTMLIFrameElement | null;
      const doc = frame?.contentDocument;
      if (!doc) return;
      const origin = location.origin;
      const isExt = (u: string) => /^https?:\/\//i.test(u) && !u.startsWith(origin);
      const toData = async (src: string): Promise<string | null> => {
        try {
          const res = await fetch(`/api/img-proxy?u=${encodeURIComponent(src)}`);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => resolve("");
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      };
      const imgs = Array.from(doc.querySelectorAll("img"));
      await Promise.all(
        imgs.map(async (img) => {
          const src = img.getAttribute("src") ?? "";
          if (!isExt(src)) return;
          const data = await toData(src);
          if (data) {
            img.setAttribute("src", data);
            await img.decode?.().catch(() => undefined);
          }
        }),
      );
      const styled = Array.from(doc.querySelectorAll<HTMLElement>('[style*="url("]'));
      await Promise.all(
        styled.map(async (el) => {
          const style = el.getAttribute("style") ?? "";
          const re = /url\((['"]?)(https?:\/\/[^)'"]+)\1\)/g;
          let out = style;
          let changed = false;
          for (const m of [...style.matchAll(re)]) {
            if (!isExt(m[2])) continue;
            const data = await toData(m[2]);
            if (data) {
              out = out.split(m[0]).join(`url("${data}")`);
              changed = true;
            }
          }
          if (changed) el.setAttribute("style", out);
        }),
      );
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
      );
    });
    // Cold headless browsers have no font cache. Wait for the iframe's fonts and
    // images before capturing, otherwise text metrics differ from the editor
    // (observed as an ~8px vertical drift on the first export after launch).
    await page.evaluate(async () => {
      const frame = document.querySelector(
        'iframe[title="原站模板 1:1 预览"]',
      ) as HTMLIFrameElement | null;
      const d = frame?.contentDocument;
      if (!d) return;
      try {
        await d.fonts.ready;
      } catch {
        /* ignore */
      }
      await Promise.all(
        Array.from(d.images).map((img) => img.decode().catch(() => undefined)),
      );
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
      );
    });
    await new Promise((r) => setTimeout(r, 150));
    const frame = await page.$(IFRAME_SELECTOR);
    if (!frame) {
      return NextResponse.json({ error: "no iframe" }, { status: 500 });
    }
    const shot = await frame.screenshot({ type: "png" });
    return new NextResponse(new Uint8Array(shot), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "X-Page-Height": String(height || 0),
        "X-Watermark": "0",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: String((error as Error)?.message ?? error).slice(0, 200) },
      { status: 500 },
    );
  } finally {
    await page.close().catch(() => undefined);
    if (owned) await browser.close().catch(() => undefined);
    else browser.disconnect();
  }
}
