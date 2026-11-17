export function uid(prefix = "id"): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`;
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 教育「补充（GPA、排名、荣誉）」等自由文本 → 条目列表。
 * 一行一条，分号（中英文）也视为分隔，和原站模板绑定（setBulletContent）保持一致。
 */
export function splitDetailLines(text: string | undefined | null): string[] {
  return (text ?? "")
    .split(/\n+|[；;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatRange(start: string, end: string): string {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

export function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function safeFileName(input: string, fallback = "简历"): string {
  const cleaned = input
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");
  return cleaned || fallback;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string, type = "application/json"): void {
  downloadBlob(new Blob([text], { type }), filename);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsText(file, "utf-8");
  });
}
