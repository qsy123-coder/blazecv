import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { activeProviderId } from "@/lib/server/payments/provider";
import {
  alipayQrImage,
  wechatQrImage,
} from "@/lib/server/payments/qrnotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 个人收款码图片托管。
 *
 * 只读取环境变量 QR_NOTIFY_WECHAT_QR_IMAGE / QR_NOTIFY_ALIPAY_QR_IMAGE
 * 指向的本地文件，路径来自部署配置而不是请求参数，避免任意文件读取。
 */
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(request: Request) {
  if (activeProviderId() !== "qrnotify") {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") === "alipay" ? "alipay" : "wechat";
  const configured = channel === "alipay" ? alipayQrImage() : wechatQrImage();
  if (!configured) return new Response("Not Found", { status: 404 });

  const file = resolve(process.cwd(), configured);
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()];
  if (!contentType) return new Response("Unsupported Media Type", { status: 415 });

  try {
    const data = await readFile(file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
