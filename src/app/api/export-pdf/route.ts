import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Text-based PDF export: render the resume in a real browser and print it with
 * Chrome's native PDF writer. Unlike the image PDF, the text here is real text
 * (selectable / searchable / editable), and printBackground keeps the coloured
 * headers and icons.
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
        defaultViewport: { width: 1000, height: 2600, deviceScaleFactor: 1 },
        protocolTimeout: 120000,
      });
      return { browser, owned: false };
    } catch {
      /* next */
    }
  }
  const chrome = process.env.EXPORT_CHROME_PATH;
  if (chrome) {
    try {
      const browser = await puppeteer.launch({
        executablePath: chrome,
        headless: true,
        // Match the editor's rasterization (see export-image).
        args: ["--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: 1000, height: 2600, deviceScaleFactor: 1 },
      });
      return { browser, owned: true };
    } catch {
      /* fall */
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

  const acquired = await getBrowser();
  if (!acquired) return NextResponse.json({ error: "no browser" }, { status: 503 });
  const { browser, owned } = acquired;

  // See export-image: the internal renderer must use loopback HTTP even when
  // the public site is served over HTTPS by a reverse proxy.
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
    // Inline external images so the printed PDF keeps avatars/banners.
    await page.evaluate(async () => {
      const frame = document.querySelector(
        'iframe[title="原站模板 1:1 预览"]',
      ) as HTMLIFrameElement | null;
      const d = frame?.contentDocument;
      if (!d) return;
      const origin = location.origin;
      const isExt = (u: string) => /^https?:\/\//i.test(u) && !u.startsWith(origin);
      const toData = async (src: string): Promise<string | null> => {
        try {
          const res = await fetch(`/api/img-proxy?u=${encodeURIComponent(src)}`);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result ?? ""));
            r.onerror = () => resolve("");
            r.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      };
      const imgs = Array.from(d.querySelectorAll("img"));
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
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
      );
    });
    // Cold headless browsers have no font cache; wait for fonts/images before
    // printing so the text metrics match the editor preview.
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
    });
    // Make the printed page contain only the resume sheet, at the natural size.
    await page.addStyleTag({
      content: `html,body{margin:0;padding:0;background:#fff !important}
        #__next,body>*{margin:0 !important}
        @page{margin:0}`,
    });
    // If the content only exceeds A4 by a hair (trailing whitespace), emit a
    // single page at the natural height to avoid a near-empty page 2. Genuine
    // overflow paginates with native A4 so text stays selectable.
    const pageCount = Math.max(1, Math.ceil((height - 20) / 1123));
    if (pageCount <= 1 && height > 1123) {
      // A few px over A4: shrink slightly so it becomes exactly one A4 page
      // instead of spilling a blank page 2.
      await page.addStyleTag({ content: `html{zoom:${(1123 / height).toFixed(5)}}` });
    }
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "X-Page-Height": String(height || 0),
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
