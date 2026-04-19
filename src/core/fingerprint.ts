import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

// A cache entry's context fingerprint is the sha256 of its sorted
// (path, content_hash) pairs. Sorting keeps the hash stable regardless of
// the order files were touched in.

export interface FileHash {
  path: string;
  hash: string;
}

export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hashFilesTouched(files: FileHash[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const h = createHash('sha256');
  for (const f of sorted) {
    h.update(f.path);
    h.update('\x00');
    h.update(f.hash);
    h.update('\x00');
  }
  return h.digest('hex');
}

// Resolves each path relative to cwd (if not already absolute) and reads it
// from disk. Missing files are included with hash='<missing>' so that a
// later-created file shows up as a fingerprint change and invalidates
// the entry rather than matching silently.
export function fingerprintFiles(
  paths: string[],
  opts: { cwd: string },
): { fingerprint: string; files: FileHash[] } {
  const files: FileHash[] = paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(opts.cwd, p);
    if (!existsSync(abs)) return { path: p, hash: '<missing>' };
    try {
      return { path: p, hash: hashContent(readFileSync(abs)) };
    } catch {
      return { path: p, hash: '<unreadable>' };
    }
  });
  return { fingerprint: hashFilesTouched(files), files };
}
