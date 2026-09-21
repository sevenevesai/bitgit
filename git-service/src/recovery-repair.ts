import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertNoLinks, atomicJson, exists, readJson, safeRelative, sha256, within } from './recovery-io.js';
import type { RecoveryService } from './recovery-service.js';
import type { RecoveryReceipt, RecoveryRequest, RecoveryState } from './recovery-types.js';
import type { SnapshotFile } from './recovery-capture.js';

interface RepairEntry {
  path: string;
  beforeHash: string | null;
  afterHash: string | null;
  beforeMode: '100644' | '100755';
  backup: string | null;
}
interface RepairJournal {
  version: 1;
  id: string;
  safetyCheckpointId: string;
  targetCheckpointId: string;
  startedAt: string;
  entries: RepairEntry[];
}
const journalFile = (service: RecoveryService) => path.join(service.vaultPath, 'pending-repair.json');
const isId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
async function readJournal(service: RecoveryService): Promise<RepairJournal | null> {
  let journal: RepairJournal | undefined;
  try { journal = await readJson<RepairJournal | undefined>(journalFile(service), undefined); } catch {
    throw new Error('Interrupted repair journal is unreadable. Saving and file repair are paused; recover a safety checkpoint into a separate folder. The original journal is preserved.');
  }
  if (journal === undefined) return null;
  if (!journal || journal.version !== 1 || !isId(journal.id) || !isId(journal.safetyCheckpointId) || !isId(journal.targetCheckpointId)
    || typeof journal.startedAt !== 'string' || !Number.isFinite(Date.parse(journal.startedAt))
    || !Array.isArray(journal.entries) || journal.entries.length > 10_000) throw new Error('Interrupted repair journal is unreadable; recover its safety checkpoint into a separate folder');
  const names = new Set<string>();
  for (const entry of journal.entries) {
    if (!entry || typeof entry.path !== 'string' || !['100644', '100755'].includes(entry.beforeMode)) throw new Error('Interrupted repair journal contains unsafe entries');
    safeRelative(entry.path);
    if (names.has(entry.path.toLowerCase()) || (entry.beforeHash !== null && !/^[0-9a-f]{64}$/.test(entry.beforeHash))
      || (entry.afterHash !== null && !/^[0-9a-f]{64}$/.test(entry.afterHash))
      || (entry.backup !== null && !/^[0-9]+\.bin$/.test(entry.backup))) throw new Error('Interrupted repair journal contains unsafe entries');
    names.add(entry.path.toLowerCase());
  }
  return journal;
}
export async function pendingRepair(service: RecoveryService): Promise<RecoveryState['pendingRepair']> {
  const journal = await readJournal(service);
  return journal ? { safetyCheckpointId: journal.safetyCheckpointId, startedAt: journal.startedAt, affectedFiles: journal.entries.length } : null;
}
async function sourceBytes(service: RecoveryService, relative: string): Promise<Buffer | null> {
  const absolute = path.join(service.repoPath, ...safeRelative(relative).split('/'));
  // Check every existing ancestor even if the final file is absent.
  let current = service.repoPath;
  await assertNoLinks(path.parse(current).root, current);
  const realRoot = await fs.realpath(service.repoPath);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (!(await exists(current))) return null;
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Cannot repair a linked path: ${relative}`);
    const realCurrent = await fs.realpath(current);
    const resolvedParts = path.relative(realRoot, realCurrent).split(path.sep);
    if (!within(realRoot, realCurrent) || resolvedParts.some(part => part.toLowerCase() === '.git')) {
      throw new Error(`Cannot repair Git metadata or an aliased path: ${relative}`);
    }
  }
  const stat = await fs.lstat(absolute);
  if (!stat.isFile()) throw new Error(`Repair destination is not a regular file: ${relative}`);
  if (stat.size > 100 * 1024 * 1024) throw new Error(`Repair destination is outside checkpoint coverage: ${relative}`);
  return fs.readFile(absolute);
}
async function replaceFile(service: RecoveryService, relative: string, bytes: Buffer | null, mode: string): Promise<void> {
  const destination = path.join(service.repoPath, ...safeRelative(relative).split('/'));
  if (!within(service.repoPath, destination)) throw new Error('Repair path escapes source folder');
  await sourceBytes(service, relative); // Also rejects links on a file slated for deletion.
  if (bytes === null) { await fs.rm(destination, { force: true }); return; }
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  await assertNoLinks(service.repoPath, parent);
  const temp = path.join(parent, `.bitgit-repair-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx', mode: mode === '100755' ? 0o755 : 0o644 });
    await fs.rename(temp, destination);
  } finally { await fs.rm(temp, { force: true }); }
}
async function cleanJournal(service: RecoveryService, journal: RepairJournal): Promise<void> {
  await fs.rm(journalFile(service));
  const backupDir = path.join(service.vaultPath, 'repairs', journal.id);
  if (!within(path.join(service.vaultPath, 'repairs'), backupDir)) throw new Error('Invalid repair backup directory');
  await fs.rm(backupDir, { recursive: true, force: true });
}

export async function repairFiles(service: RecoveryService, request: Extract<RecoveryRequest, { action: 'repair' }>): Promise<RecoveryReceipt> {
  await service.readMetadata(request.checkpointId);
  if (!Array.isArray(request.paths) || !request.paths.length || request.paths.length > 10_000
    || typeof request.expectedFingerprint !== 'string') throw new Error('Select files from a current comparison before repairing');
  const paths = [...new Set(request.paths.map(safeRelative))];
  const checkpoint = await service.readCheckpoint(request.checkpointId);
  const saved = new Map((await service.readSnapshot(checkpoint)).map(file => [file.path, file]));
  const comparison = await service.compare(checkpoint.id);
  if (comparison.currentFingerprint !== request.expectedFingerprint) throw new Error('Files changed after comparison. Compare again before repairing.');
  if (paths.some(file => !comparison.changes.some(change => change.path === file))) throw new Error('Repair selection is stale or contains unchanged files');
  const captured = await service.capture();
  if (captured.fingerprint !== request.expectedFingerprint) throw new Error('Files changed while preparing repair. Compare again.');
  const current = new Map(captured.files.map(file => [file.path, file]));
  for (const file of paths) {
    const bytes = await sourceBytes(service, file);
    if (bytes && (!current.has(file) || sha256(bytes) !== current.get(file)!.sha256)) throw new Error(`Cannot protect current contents of ${file}; repair was cancelled`);
    if (!bytes && current.has(file)) throw new Error(`File changed before repair: ${file}`);
  }
  const safety = await service.saveCaptured(captured, `Before repair: ${checkpoint.label}`.slice(0, 120),
    `Current source preserved before restoring ${paths.length} selected files from ${checkpoint.id}.`, 'safety', captured.fingerprint);
  const journal: RepairJournal = { version: 1, id: randomUUID(), safetyCheckpointId: safety.id,
    targetCheckpointId: checkpoint.id, startedAt: service.now(), entries: [] };
  const backups = path.join(service.vaultPath, 'repairs', journal.id);
  await fs.mkdir(backups, { recursive: true, mode: 0o700 });
  for (let index = 0; index < paths.length; index++) {
    const file = paths[index], before = current.get(file), after = saved.get(file);
    const backup = before ? `${index}.bin` : null;
    if (before) await fs.writeFile(path.join(backups, backup!), before.bytes, { flag: 'wx', mode: 0o600 });
    journal.entries.push({ path: file, beforeHash: before?.sha256 ?? null, afterHash: after?.sha256 ?? null, beforeMode: before?.mode ?? '100644', backup });
  }
  await atomicJson(journalFile(service), journal);
  try {
    for (const entry of journal.entries) {
      const currentBytes = await sourceBytes(service, entry.path);
      if ((currentBytes ? sha256(currentBytes) : null) !== entry.beforeHash) throw new Error(`File changed during repair: ${entry.path}`);
      const after = saved.get(entry.path);
      await replaceFile(service, entry.path, after?.bytes ?? null, after?.mode ?? '100644');
      const written = await sourceBytes(service, entry.path);
      if ((written ? sha256(written) : null) !== entry.afterHash) throw new Error(`Could not verify repaired file: ${entry.path}`);
    }
    await cleanJournal(service, journal);
    return { checkpointId: checkpoint.id, destination: service.repoPath, fileCount: paths.length, verifiedAt: service.now(), safetyCheckpointId: safety.id };
  } catch (error: any) {
    // Retain both the safety checkpoint and exact-byte journal until explicit rollback.
    throw new Error(`${error.message}. Repair is incomplete. Undo the interrupted repair or recover safety checkpoint ${safety.id}.`);
  }
}

export async function rollbackRepair(service: RecoveryService): Promise<RecoveryReceipt> {
  const journal = await readJournal(service);
  if (!journal) throw new Error('There is no interrupted repair to undo');
  await service.readCheckpoint(journal.safetyCheckpointId);
  const originals = new Map<string, SnapshotFile | null>();
  for (const entry of journal.entries) {
    const bytes = await sourceBytes(service, entry.path);
    const currentHash = bytes ? sha256(bytes) : null;
    if (currentHash !== entry.beforeHash && currentHash !== entry.afterHash) {
      throw new Error(`New edits were found in ${entry.path}. Keep them and recover safety checkpoint ${journal.safetyCheckpointId} into a separate folder.`);
    }
    if (entry.backup) {
      const backup = path.join(service.vaultPath, 'repairs', journal.id, entry.backup);
      await assertNoLinks(service.vaultPath, backup);
      const original = await fs.readFile(backup);
      if (sha256(original) !== entry.beforeHash) throw new Error('Repair backup verification failed; use the safety checkpoint');
      originals.set(entry.path, { path: entry.path, bytes: original, mode: entry.beforeMode, sha256: entry.beforeHash! });
    } else {
      if (entry.beforeHash !== null) throw new Error('Repair backup is missing; use the safety checkpoint');
      originals.set(entry.path, null);
    }
  }
  for (const entry of journal.entries) {
    const current = await sourceBytes(service, entry.path);
    const currentHash = current ? sha256(current) : null;
    if (currentHash !== entry.beforeHash && currentHash !== entry.afterHash) throw new Error(`File changed during rollback: ${entry.path}`);
    const before = originals.get(entry.path)!;
    await replaceFile(service, entry.path, before?.bytes ?? null, entry.beforeMode);
    const restored = await sourceBytes(service, entry.path);
    if ((restored ? sha256(restored) : null) !== entry.beforeHash) throw new Error(`Could not verify rollback: ${entry.path}`);
  }
  await cleanJournal(service, journal);
  return { checkpointId: journal.safetyCheckpointId, destination: service.repoPath, fileCount: journal.entries.length,
    verifiedAt: service.now(), safetyCheckpointId: journal.safetyCheckpointId };
}
