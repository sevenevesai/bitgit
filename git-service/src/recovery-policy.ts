// Shared conservative source-coverage policy. These heuristics never certify a file secret-free.
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_CAPTURE_BYTES = 250 * 1024 * 1024;
export const MAX_CAPTURE_FILES = 10_000;
export const COVERAGE_LIMITS = [
  'Source files only. Databases, hosted services, deployment state and credentials are not recovered.',
  'Ignored files, generated/dependency folders, links and nested repositories are excluded.',
  'Secret screening uses filename and content patterns and can miss credentials.',
  'Maximum 100 MiB per file, 250 MiB and 10,000 files per checkpoint.',
  'All checkpoints are retained on this computer until explicitly removed outside BitGit.',
];

export function exclusionReason(file: string, sizeBytes?: number, content?: Buffer): string | null {
  const parts = file.toLowerCase().split('/');
  const base = parts[parts.length - 1];
  if (parts.some(part => ['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.nuxt',
    '.cache', 'target', 'dist', 'build', 'coverage'].includes(part))) return 'Git metadata, dependencies or generated output';
  if (/^\.env(?:\.|$)/i.test(base) && !/^\.env\.(example|sample|template)$/i.test(base)) return 'Environment credentials';
  if (/\.(db|sqlite|sqlite3|mdb|log|pem|key|p12|pfx|jks)$/i.test(base)
    || /^(id_rsa|id_ed25519|credentials(?:\.json)?|\.npmrc|\.netrc)$/i.test(base)) return 'Database, log or credential file';
  if (sizeBytes !== undefined && sizeBytes > MAX_FILE_BYTES) return 'File exceeds the 100 MiB recovery limit';
  if (content) {
    const text = content.toString('utf8');
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text)
      || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})\b/.test(text)
      || /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_+\/=.-]{20,}["']/i.test(text)) {
      return 'Possible credential detected in file contents';
    }
  }
  return null;
}
