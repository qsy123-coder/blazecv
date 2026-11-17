import { NextResponse } from "next/server";

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
  try {
    const upstream = await fetch(url.toString(), {
      headers: { "User-Agent": "BlazeCV-Export/1.0" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    return new NextResponse(buffer, {
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
