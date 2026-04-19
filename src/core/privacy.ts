// Redaction runs on every capture, even when telemetry is disabled.
// Keep this module side-effect-free so the capture hook can call it
// unconditionally before writing to the DB.

export const REDACTION_PLACEHOLDER = '[REDACTED]';

export interface RedactOptions {
  patterns: string[];
  flags?: string; // default 'gi'
  placeholder?: string;
}

function compile(patterns: string[], flags: string): RegExp[] {
  const compiled: RegExp[] = [];
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p, flags));
    } catch {
      // One malformed pattern must not disable the rest.
      continue;
    }
  }
  return compiled;
}

export function redact(text: string, options: RedactOptions): string {
  if (!text) return text;
  const placeholder = options.placeholder ?? REDACTION_PLACEHOLDER;
  const regexes = compile(options.patterns, options.flags ?? 'gi');
  let out = text;
  for (const re of regexes) {
    out = out.replace(re, placeholder);
  }
  return out;
}

export function redactAll(text: string, patterns: string[]): string {
  return redact(text, { patterns });
}
