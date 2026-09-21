import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertNoLinks, gitRun, safeRelative, sha256 } from './recovery-io.js';
import { COVERAGE_LIMITS, exclusionReason, MAX_CAPTURE_BYTES, MAX_CAPTURE_FILES } from './recovery-policy.js';
import type { Coverage } from './recovery-types.js';

export interface SnapshotFile { path: string; bytes: Buffer; mode: '100644' | '100755'; sha256: string; }
export interface CapturedSource {
  files: SnapshotFile[];
  coverage: Coverage;
  fingerprint: string;
  branch: string | null;
  head: string | null;
}
export function fingerprint(files: SnapshotFile[]): string {
  return sha256(JSON.stringify(files.map(file => [file.path, file.mode, file.sha256])));
}

export async function captureSource(repoPath: string, gitDir: string): Promise<CapturedSource> {
  if (!(await fs.stat(repoPath)).isDirectory()) throw new Error('The source folder is not available');
  await assertNoLinks(path.parse(repoPath).root, repoPath);
  const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
  const scope = [`--git-dir=${gitDir}`, `--work-tree=${repoPath}`];
  const untracked = (await gitRun(repoPath, [...scope, 'ls-files', '-z', '--others', '--exclude-standard'], { env })).toString('utf8').split('\0').filter(Boolean);
  const ignored = (await gitRun(repoPath, [...scope, 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'], { env })).toString('utf8').split('\0').filter(Boolean);
  const tracked = new Map<string, string>();
  let branch: string | null = null, head: string | null = null;
  let sourceIsGit = false;
  try {
    const top = (await gitRun(repoPath, ['rev-parse', '--show-toplevel'])).toString('utf8').trim();
    const sameRoot = process.platform === 'win32'
      ? path.resolve(top).toLowerCase() === path.resolve(repoPath).toLowerCase()
      : path.resolve(top) === path.resolve(repoPath);
    if (sameRoot) sourceIsGit = true;
  } catch { /* Plain folders can also have source checkpoints. */ }
  if (sourceIsGit) {
    const index = (await gitRun(repoPath, ['ls-files', '--stage', '-z'])).toString('utf8');
    for (const row of index.split('\0').filter(Boolean)) {
      const tab = row.indexOf('\t');
      if (tab !== -1) tracked.set(row.slice(tab + 1), row.slice(0, 6));
    }
    try { branch = (await gitRun(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).toString('utf8').trim(); } catch { /* Detached HEAD. */ }
    try { head = (await gitRun(repoPath, ['rev-parse', '--verify', 'HEAD'])).toString('utf8').trim(); } catch { /* Unborn branch. */ }
  }
  const candidates = [...new Set([...untracked, ...tracked.keys()])].sort();
  if (candidates.length > MAX_CAPTURE_FILES * 2) throw new Error('Too many source files; exclude generated folders before saving');
  const coverage: Coverage = { included: [], excluded: [], totalBytes: 0, warnings: [], limits: [...COVERAGE_LIMITS] };
  for (const file of ignored) {
    if (!tracked.has(file)) coverage.excluded.push({ path: file, reason: 'Ignored by Git rules' });
  }
  const files: SnapshotFile[] = [];
  const seen = new Set<string>();
  for (const file of candidates) {
    let reason = exclusionReason(file);
    if (!reason) {
      try { safeRelative(file); } catch { reason = 'Unsupported or unsafe path'; }
    }
    if (!reason && tracked.get(file) === '160000') reason = 'Nested repository or submodule';
    if (reason) { coverage.excluded.push({ path: file, reason }); continue; }
    const absolute = path.join(repoPath, ...file.split('/'));
    let stat;
    try { stat = await fs.lstat(absolute); } catch (error: any) {
      if (error.code === 'ENOENT' && tracked.has(file)) continue; // Working-tree deletion is captured by absence.
      throw new Error(`Source changed or cannot be read: ${file}`);
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      coverage.excluded.push({ path: file, reason: 'Link, nested repository or non-regular file' }); continue;
    }
    try { await assertNoLinks(repoPath, absolute); } catch {
      coverage.excluded.push({ path: file, reason: 'Linked parent directory' }); continue;
    }
    reason = exclusionReason(file, stat.size);
    if (reason) { coverage.excluded.push({ path: file, reason }); continue; }
    if (coverage.totalBytes + stat.size > MAX_CAPTURE_BYTES || files.length >= MAX_CAPTURE_FILES) {
      throw new Error('Checkpoint exceeds the 250 MiB / 10,000 file limit; narrow the project coverage');
    }
    const handle = await fs.open(absolute, 'r');
    let bytes: Buffer;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size !== stat.size || opened.ino !== stat.ino) throw new Error('File changed during capture');
      bytes = await handle.readFile();
      const after = await handle.stat();
      if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error('File changed during capture');
    } finally { await handle.close(); }
    reason = exclusionReason(file, bytes.length, bytes);
    if (reason) { coverage.excluded.push({ path: file, reason }); continue; }
    const key = file.toLowerCase();
    if (seen.has(key)) throw new Error(`File names collide on Windows: ${file}`);
    seen.add(key);
    const mode = tracked.get(file) === '100755' || (process.platform !== 'win32' && (stat.mode & 0o111)) ? '100755' : '100644';
    files.push({ path: file, bytes, mode, sha256: sha256(bytes) });
    coverage.included.push({ path: file, sizeBytes: bytes.length });
    coverage.totalBytes += bytes.length;
    if (bytes.length > 50 * 1024 * 1024) coverage.warnings.push(`${file} is larger than 50 MiB`);
  }
  if (coverage.excluded.length) coverage.warnings.push('Some files are outside this checkpoint; review the excluded list.');
  return { files, coverage, fingerprint: fingerprint(files), branch, head };
}

export function selectCapture(capture: CapturedSource, excludedPaths: string[] = []): CapturedSource {
  const selection = new Set(excludedPaths.map(safeRelative));
  if ([...selection].some(file => !capture.files.some(candidate => candidate.path === file))) {
    throw new Error('File selection is stale or contains a file outside coverage; refresh the preview');
  }
  const files = capture.files.filter(file => !selection.has(file.path));
  return { ...capture, files, fingerprint: fingerprint(files), coverage: {
    ...capture.coverage,
    included: files.map(file => ({ path: file.path, sizeBytes: file.bytes.length })),
    totalBytes: files.reduce((size, file) => size + file.bytes.length, 0),
    excluded: [...capture.coverage.excluded, ...[...selection].map(file => ({ path: file, reason: 'Excluded by your selection' }))],
  } };
}
