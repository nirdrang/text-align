import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type CacheRecord = { key: string, he: string, en: string, [extra: string]: any };

// Returns a filesystem-safe hash for a given URL.
function getLectureCacheFilename(url: string): string {
  const base64Url = Buffer.from(url, "utf-8").toString("base64");
  const hash = crypto.createHash("sha256").update(base64Url).digest("hex").slice(0, 16);
  return `cache/${hash}.jsonl`;
}

// Returns the cache filename for a given lecture index (string or number)
function getLectureCacheFilenameByIndex(lectureIdx: string | number): string {
  return `cache/${lectureIdx}.jsonl`;
}

let cache: Record<string, CacheRecord> = {};
let currentLectureIdx: string | number | null = null;
let currentCacheFile: string | null = null;
let cacheIsPersistent: boolean = false;

export async function loadCacheForLecture(lectureIdx: string | number) {
  // Bump up the index by 2 before using it for the filename
  const idxNum = typeof lectureIdx === 'number' ? lectureIdx + 2 : parseInt(lectureIdx, 10) + 2;
  const idxStr = String(idxNum);
  currentLectureIdx = idxStr;
  currentCacheFile = getLectureCacheFilenameByIndex(idxStr);
  cache = {};
  try {
    const data = await fs.readFile(currentCacheFile, "utf-8");
    cacheIsPersistent = true;
    const records: CacheRecord[] = [];
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as CacheRecord;
        if (rec.key) records.push(rec);
      } catch {}
    }
    for (const rec of records) {
      cache[rec.key] = rec;
    }
  } catch (err: any) {
    cacheIsPersistent = false;
    console.error(`[Cache] Failed to read cache file '${currentCacheFile}': ${err?.message || err}`);
  }
}

export function clearCache() {
  cache = {};
  currentLectureIdx = null;
  currentCacheFile = null;
}

export function getCache(): Record<string, CacheRecord> {
  return cache;
}

export function getCacheCount(): number {
  return Object.keys(cache).length;
}

export function getFromCache(key: string): CacheRecord | undefined {
  return cache[key];
}

export async function addToCache(record: CacheRecord) {
  if (cacheIsPersistent) return;
  if (cache[record.key]) return;
  cache[record.key] = record;
}

export async function writeCacheToDisk() {
  if (!currentCacheFile) return;
  const records = Object.values(cache);
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  await fs.writeFile(currentCacheFile, content, 'utf-8');
} 