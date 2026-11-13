import { createRequire } from 'node:module';

// src/version.ts and dist/version.js both sit one level below package.json.
export function packageVersion(): string {
  return (createRequire(import.meta.url)('../package.json') as { version: string }).version;
}
