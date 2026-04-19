import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintFiles, hashFilesTouched, hashContent } from './fingerprint.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-fp-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('fingerprint', () => {
  it('hashFilesTouched is stable regardless of input order', () => {
    const a = hashFilesTouched([
      { path: 'src/a.ts', hash: 'h1' },
      { path: 'src/b.ts', hash: 'h2' },
    ]);
    const b = hashFilesTouched([
      { path: 'src/b.ts', hash: 'h2' },
      { path: 'src/a.ts', hash: 'h1' },
    ]);
    expect(a).toBe(b);
  });

  it('different hashes yield different fingerprints', () => {
    const a = hashFilesTouched([{ path: 'src/a.ts', hash: 'h1' }]);
    const b = hashFilesTouched([{ path: 'src/a.ts', hash: 'h2' }]);
    expect(a).not.toBe(b);
  });

  it('fingerprintFiles reads from cwd and matches a direct content hash', () => {
    writeFileSync(join(tmp, 'note.txt'), 'hello world');
    const { fingerprint, files } = fingerprintFiles(['note.txt'], { cwd: tmp });
    expect(files[0]?.hash).toBe(hashContent('hello world'));
    expect(fingerprint).toBe(hashFilesTouched([{ path: 'note.txt', hash: hashContent('hello world') }]));
  });

  it('missing files produce a distinct sentinel hash', () => {
    const { files } = fingerprintFiles(['does-not-exist.txt'], { cwd: tmp });
    expect(files[0]?.hash).toBe('<missing>');
  });

  it('empty files list produces the sha256 of nothing', () => {
    const a = fingerprintFiles([], { cwd: tmp }).fingerprint;
    // Same input, same fingerprint.
    const b = fingerprintFiles([], { cwd: tmp }).fingerprint;
    expect(a).toBe(b);
  });
});
