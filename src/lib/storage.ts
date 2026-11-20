import type { Table } from "dexie";
import type { ResumeDoc } from "./types";
import { getTemplate } from "./templates";
import { uid } from "./utils";
import { scrubLegacyDoc } from "./legacy-identity";

export interface ResumeRecord {
  id: string;
  title: string;
  updatedAt: number;
  doc: ResumeDoc;
}

export interface ResumeSummary {
  id: string;
  title: string;
  updatedAt: number;
  templateId: ResumeDoc["templateId"];
  templateName: string;
}

export interface ResumeVersion {
  id?: number;
  resumeId: string;
  title: string;
  savedAt: number;
  doc: ResumeDoc;
}

/**
 * Bound template document for a card thumbnail, keyed by resume revision and
 * template token. Reusing it skips the network fetch, the 980 KB CSS parse and
 * the whole semantic binder on every visit.
 */
export interface ThumbCacheRecord {
  key: string;
  resumeId: string;
  updatedAt: number;
  html: string;
}

interface BlazeDB {
  resumes: Table<ResumeRecord, string>;
  settings: Table<{ key: string; value: string }, string>;
  versions: Table<ResumeVersion, number>;
  thumbs: Table<ThumbCacheRecord, string>;
}

const ACTIVE_KEY = "active-resume";
const LEGACY_SCRUB_KEY = "legacy-scrub-v4";
const VERSION_INTERVAL_MS = 10 * 60 * 1000;
const VERSION_LIMIT = 20;

let dbPromise: Promise<BlazeDB> | null = null;

async function getDb(): Promise<BlazeDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { default: Dexie } = await import("dexie");
      const db = new Dexie("blazecv") as unknown as BlazeDB & {
        version: (n: number) => { stores: (schema: Record<string, string>) => void };
      };
      db.version(1).stores({
        resumes: "id, updatedAt",
        settings: "key",
      });
      db.version(2).stores({
        versions: "++id, resumeId, savedAt",
      });
      db.version(3).stores({
        thumbs: "key, resumeId, updatedAt",
      });
      return db;
    })();
  }
  return dbPromise;
}

export async function loadActiveResume(): Promise<ResumeDoc | null> {
  const db = await getDb();
  const active = await db.settings.get(ACTIVE_KEY);
  if (active?.value) {
    const record = await db.resumes.get(active.value);
    if (record) return record.doc;
  }
  const latest = await db.resumes.orderBy("updatedAt").last();
  return latest?.doc ?? null;
}

export async function loadResumeById(id: string): Promise<ResumeDoc | null> {
  const db = await getDb();
  const record = await db.resumes.get(id);
  return record?.doc ?? null;
}

export async function listResumeRecords(): Promise<ResumeRecord[]> {
  const db = await getDb();
  return db.resumes.orderBy("updatedAt").reverse().toArray();
}

export async function listResumes(): Promise<ResumeSummary[]> {
  const rows = await listResumeRecords();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
    templateId: row.doc.templateId,
    templateName:
      row.doc.templatePreset?.name ?? getTemplate(row.doc.templateId).name,
  }));
}

export async function getActiveResumeId(): Promise<string | null> {
  const db = await getDb();
  const active = await db.settings.get(ACTIVE_KEY);
  return active?.value ?? null;
}

export async function setActiveResume(id: string): Promise<void> {
  const db = await getDb();
  await db.settings.put({ key: ACTIVE_KEY, value: id });
}

export async function saveResume(doc: ResumeDoc): Promise<void> {
  const db = await getDb();
  const existing = await db.resumes.get(doc.id);
  if (existing && existing.doc.updatedAt !== doc.updatedAt) {
    await maybeSnapshot(db, existing.doc);
  }
  await db.resumes.put({
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    doc,
  });
  await db.settings.put({ key: ACTIVE_KEY, value: doc.id });
}

export async function deleteResume(id: string): Promise<void> {
  const db = await getDb();
  await db.resumes.delete(id);
  await db.versions.where("resumeId").equals(id).delete();
  await db.thumbs.where("resumeId").equals(id).delete();

  const active = await db.settings.get(ACTIVE_KEY);
  if (active?.value === id) {
    const latest = await db.resumes.orderBy("updatedAt").last();
    if (latest) {
      await db.settings.put({ key: ACTIVE_KEY, value: latest.id });
    } else {
      await db.settings.delete(ACTIVE_KEY);
    }
  }
}

export async function duplicateResume(id: string): Promise<ResumeDoc | null> {
  const db = await getDb();
  const record = await db.resumes.get(id);
  if (!record) return null;

  const doc: ResumeDoc = structuredClone(record.doc);
  doc.id = uid("resume");
  doc.title = `${record.title} 副本`;
  doc.updatedAt = Date.now();
  await saveResume(doc);
  return doc;
}

async function maybeSnapshot(db: BlazeDB, previous: ResumeDoc): Promise<void> {
  const versions = await db.versions.where("resumeId").equals(previous.id).toArray();
  const latestSavedAt = versions.reduce(
    (latest, version) => Math.max(latest, version.savedAt),
    0,
  );
  if (Date.now() - latestSavedAt < VERSION_INTERVAL_MS) return;

  await db.versions.add({
    resumeId: previous.id,
    title: previous.title,
    savedAt: previous.updatedAt || Date.now(),
    doc: structuredClone(previous),
  });
  await pruneVersions(db, previous.id);
}

async function pruneVersions(db: BlazeDB, resumeId: string): Promise<void> {
  const versions = await db.versions.where("resumeId").equals(resumeId).toArray();
  if (versions.length <= VERSION_LIMIT) return;
  versions.sort((a, b) => a.savedAt - b.savedAt);
  const stale = versions.slice(0, versions.length - VERSION_LIMIT);
  const ids = stale
    .map((version) => version.id)
    .filter((id): id is number => typeof id === "number");
  if (ids.length > 0) await db.versions.bulkDelete(ids);
}

export async function addVersion(doc: ResumeDoc): Promise<void> {
  const db = await getDb();
  await db.versions.add({
    resumeId: doc.id,
    title: doc.title,
    savedAt: Date.now(),
    doc: structuredClone(doc),
  });
  await pruneVersions(db, doc.id);
}

export async function listVersions(resumeId: string): Promise<ResumeVersion[]> {
  const db = await getDb();
  const versions = await db.versions.where("resumeId").equals(resumeId).toArray();
  return versions.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getVersion(id: number): Promise<ResumeVersion | null> {
  const db = await getDb();
  return (await db.versions.get(id)) ?? null;
}

export async function getCachedThumb(key: string): Promise<string | null> {
  const db = await getDb();
  return (await db.thumbs.get(key))?.html ?? null;
}

export async function putCachedThumb(
  key: string,
  resumeId: string,
  updatedAt: number,
  html: string,
): Promise<void> {
  const db = await getDb();
  await db.thumbs.put({ key, resumeId, updatedAt, html });
  // One revision per resume is enough; drop superseded snapshots.
  const stale = await db.thumbs.where("resumeId").equals(resumeId).toArray();
  const removed = stale.filter((row) => row.key !== key).map((row) => row.key);
  if (removed.length > 0) await db.thumbs.bulkDelete(removed);
}

export async function deleteVersion(id: number): Promise<void> {
  const db = await getDb();
  await db.versions.delete(id);
}

/**
 * One-time migration of resumes saved before the template sample-data scrub.
 *
 * Records created earlier carry the original sample identity (陈媛媛Abbey,
 * abbey@wondercv.com, 超级公司, an external OSS avatar …). The templates were
 * cleaned, but a saved doc keeps its own content, so those resumes still render
 * the old data. Rewrite every stored doc/version once and drop the bound-thumb
 * cache so cards re-render from clean data.
 *
 * Idempotent: guarded by a settings flag, and a no-op when nothing matches.
 */
export async function migrateLegacySampleData(): Promise<number> {
  const db = await getDb();
  const done = await db.settings.get(LEGACY_SCRUB_KEY);
  if (done?.value === "1") return 0;

  let rewritten = 0;

  const records = await db.resumes.toArray();
  for (const record of records) {
    const { doc, changed } = scrubLegacyDoc(record.doc);
    if (!changed) continue;
    doc.updatedAt = Date.now();
    await db.resumes.put({
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updatedAt,
      doc,
    });
    rewritten += 1;
  }

  const versions = await db.versions.toArray();
  for (const version of versions) {
    const { doc, changed } = scrubLegacyDoc(version.doc);
    if (!changed) continue;
    await db.versions.put({
      ...version,
      title: doc.title,
      doc,
    });
  }

  if (rewritten > 0) await db.thumbs.clear();
  await db.settings.put({ key: LEGACY_SCRUB_KEY, value: "1" });
  return rewritten;
}
