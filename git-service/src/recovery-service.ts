import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { assertNoLinks, atomicJson, exists, gitRun, safeRelative, sha256, within, withVaultLock } from './recovery-io.js';
import { captureSource, fingerprint, selectCapture, type CapturedSource, type SnapshotFile } from './recovery-capture.js';
import { COVERAGE_LIMITS, exclusionReason, MAX_CAPTURE_BYTES, MAX_CAPTURE_FILES, MAX_FILE_BYTES } from './recovery-policy.js';
import { pendingRepair, repairFiles, rollbackRepair } from './recovery-repair.js';
import { backupCheckpoint, importRemoteCheckpoint, listRemoteCheckpoints, verifyBackup } from './recovery-remote.js';
import { autoTick, readRecoverySettings, updateRecoverySettings } from './recovery-automation.js';
import { recordEvidence, runCheckpointCheck, readEvidenceImage } from './recovery-evidence.js';
import { getRegression, observeRegression, startRegression } from './recovery-regression.js';
import { readCheckpointMetadata } from './recovery-metadata.js';
import type { Checkpoint, CheckpointPreview, RecoveryComparison, RecoveryReceipt, RecoveryRequest, RecoveryResults, RecoverySettings, RecoveryState } from './recovery-types.js';

export const DEFAULT_RECOVERY_SETTINGS: RecoverySettings = { automaticEnabled: false, idleMinutes: 5, retention: 'keep_all' };
export interface RecoveryOptions { vaultRoot?: string; githubToken?: string; now?: () => Date; }
export interface CheckpointManifest extends Omit<Checkpoint, 'commitOid' | 'treeOid' | 'backup' | 'evidence' | 'recoveredAt' | 'metadataError'> {
  format: 'bitgit-checkpoint';
  version: 1;
  entries: Array<{ path: string; sizeBytes: number; sha256: string; mode: '100644' | '100755' }>;
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const validOid = (oid: string): boolean => /^[0-9a-f]{40}$/.test(oid);

export class RecoveryService {
  readonly repoPath: string;
  readonly vaultPath: string;
  readonly gitDir: string;
  readonly vaultKey: string;
  readonly options: RecoveryOptions;

  constructor(repoPath: string, options: RecoveryOptions = {}) {
    if (!path.isAbsolute(repoPath)) throw new Error('Recovery requires an absolute source folder');
    this.repoPath = path.resolve(repoPath);
    this.options = options;
    const normalized = process.platform === 'win32' ? this.repoPath.toLowerCase() : this.repoPath;
    this.vaultKey = sha256(normalized).slice(0, 24);
    const dataRoot = process.env.APPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const vaultRoot = options.vaultRoot || path.join(dataRoot, 'BitGit', 'checkpoints');
    this.vaultPath = path.resolve(vaultRoot, this.vaultKey);
    this.gitDir = path.join(this.vaultPath, 'repository.git');
    if (within(this.repoPath, this.vaultPath)) throw new Error('Checkpoint storage must be outside the source folder');
  }

  now(): string { return (this.options.now?.() ?? new Date()).toISOString(); }
  async locked<T>(operation: () => Promise<T>): Promise<T> {
    return withVaultLock(this.vaultPath, async () => { await this.initialize(); return operation(); });
  }
  async initialize(): Promise<void> {
    await fs.mkdir(this.vaultPath, { recursive: true });
    await assertNoLinks(path.parse(this.vaultPath).root, this.vaultPath);
    if (!(await exists(this.gitDir))) {
      const emptyTemplate = path.join(this.vaultPath, 'empty-template');
      await fs.mkdir(emptyTemplate, { recursive: true });
      await gitRun(this.vaultPath, ['init', '--bare', '--initial-branch=checkpoints', `--template=${emptyTemplate}`, this.gitDir], { env: this.localEnvironment() });
    }
  }
  localEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_AUTHOR_NAME: 'BitGit', GIT_AUTHOR_EMAIL: 'checkpoint@bitgit.local',
      GIT_COMMITTER_NAME: 'BitGit', GIT_COMMITTER_EMAIL: 'checkpoint@bitgit.local', ...extra };
  }
  async git(args: string[], input?: Buffer | string, extraEnv: NodeJS.ProcessEnv = {}): Promise<Buffer> {
    return gitRun(this.vaultPath, [`--git-dir=${this.gitDir}`, '-c', `core.hooksPath=${path.join(this.vaultPath, 'empty-template')}`, ...args], { input, env: this.localEnvironment(extraEnv) });
  }
  metadataPath(id: string): string {
    if (!validId(id)) throw new Error('Invalid checkpoint ID');
    return path.join(this.vaultPath, 'receipts', `${id}.json`);
  }
  async updateMetadata(id: string, update: Partial<Pick<Checkpoint, 'backup' | 'evidence' | 'recoveredAt'>>): Promise<void> {
    const file = this.metadataPath(id);
    const previous = await this.readMetadata(id);
    await atomicJson(file, { ...previous, ...update });
  }
  async readMetadata(id: string) { return readCheckpointMetadata(this.metadataPath(id), id); }
  async capture(): Promise<CapturedSource> { return captureSource(this.repoPath, this.gitDir); }
  async preview(): Promise<CheckpointPreview> {
    const { fingerprint, coverage, branch, head } = await this.capture();
    return { fingerprint, coverage, branch, head };
  }
  async state(): Promise<RecoveryState> {
    const refs = (await this.git(['for-each-ref', '--format=%(refname:strip=2)', 'refs/checkpoints/'])).toString('utf8').trim();
    const checkpoints: Checkpoint[] = [];
    for (const id of refs.split('\n').filter(Boolean)) checkpoints.push(await this.readCheckpoint(id.trim()));
    checkpoints.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    let settings = { ...DEFAULT_RECOVERY_SETTINGS }, settingsError: string | undefined;
    try { settings = await readRecoverySettings(this); } catch (error) {
      settingsError = error instanceof Error ? error.message : String(error);
    }
    let pending: RecoveryState['pendingRepair'] = null, repairJournalError: string | undefined;
    try { pending = await pendingRepair(this); } catch (error) {
      repairJournalError = error instanceof Error ? error.message : String(error);
    }
    return { checkpoints, settings, settingsError, repairJournalError, vaultPath: this.vaultPath, sourceAvailable: await exists(this.repoPath), pendingRepair: pending };
  }
  async create(request: Extract<RecoveryRequest, { action: 'create' }>): Promise<Checkpoint> {
    if (typeof request.label !== 'string' || !request.label.trim() || request.label.length > 120) throw new Error('Name the milestone using 1–120 characters');
    if (request.note !== undefined && (typeof request.note !== 'string' || request.note.length > 4000)) throw new Error('Milestone notes can contain up to 4,000 characters');
    if (request.kind && !['manual', 'automatic', 'safety'].includes(request.kind)) throw new Error('Invalid checkpoint kind');
    const captured = await this.capture();
    if (request.expectedFingerprint && request.expectedFingerprint !== captured.fingerprint) throw new Error('Your files changed after the preview. Refresh coverage and save again.');
    const selected = selectCapture(captured, request.excludedPaths);
    if (!selected.files.length) throw new Error('No eligible source files were selected');
    return this.saveCaptured(selected, request.label.trim(), request.note || '', request.kind || 'manual', captured.fingerprint);
  }
  async saveCaptured(captured: CapturedSource, label: string, note: string, kind: Checkpoint['kind'], expectedSourceFingerprint?: string): Promise<Checkpoint> {
    const id = randomUUID();
    const staging = path.join(this.vaultPath, `capture-${id}`);
    await fs.mkdir(staging, { mode: 0o700 });
    const indexFile = path.join(staging, 'index');
    try {
      const inputPaths: string[] = [];
      for (let index = 0; index < captured.files.length; index++) {
        const file = path.join(staging, String(index));
        await fs.writeFile(file, captured.files[index].bytes, { flag: 'wx', mode: 0o600 });
        inputPaths.push(file);
      }
      const oids = inputPaths.length ? (await this.git(['hash-object', '-w', '--no-filters', '--stdin-paths'], `${inputPaths.join('\n')}\n`)).toString('utf8').trim().split('\n') : [];
      if (oids.length !== captured.files.length || oids.some(oid => !validOid(oid))) throw new Error('Could not verify captured Git objects');
      const env = { GIT_INDEX_FILE: indexFile };
      await this.git(['read-tree', '--empty'], undefined, env);
      await this.git(['update-index', '-z', '--index-info'], captured.files.map((file, i) => `${file.mode} ${oids[i]}\t${file.path}\0`).join(''), env);
      const treeOid = (await this.git(['write-tree'], undefined, env)).toString('utf8').trim();
      if (expectedSourceFingerprint && (await this.capture()).fingerprint !== expectedSourceFingerprint) throw new Error('Files changed while saving. Pause the edits and save again.');
      const manifest: CheckpointManifest = { format: 'bitgit-checkpoint', version: 1, id, label, note, kind,
        createdAt: this.now(), branch: captured.branch, head: captured.head, fingerprint: captured.fingerprint,
        coverage: captured.coverage, entries: captured.files.map(file => ({ path: file.path, mode: file.mode, sizeBytes: file.bytes.length, sha256: file.sha256 })) };
      const commitOid = (await this.git(['commit-tree', treeOid], JSON.stringify(manifest))).toString('utf8').trim();
      if (!validOid(commitOid)) throw new Error('Invalid checkpoint commit');
      const checkpoint = { ...this.checkpointFromManifest(manifest), commitOid, treeOid, backup: null, evidence: [], recoveredAt: null };
      // update-index can warn and still exit 0 after ignoring a path. A save or safety
      // copy is published only after the same complete byte validation used for recovery.
      await this.readSnapshot(checkpoint);
      await this.git(['update-ref', `refs/checkpoints/${id}`, commitOid, '0000000000000000000000000000000000000000']);
      return checkpoint;
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  checkpointFromManifest(manifest: CheckpointManifest): Omit<Checkpoint, 'commitOid' | 'treeOid' | 'backup' | 'evidence' | 'recoveredAt'> {
    const { format: _format, version: _version, entries: _entries, ...checkpoint } = manifest;
    return checkpoint;
  }
  async readManifest(commitOid: string): Promise<{ manifest: CheckpointManifest; treeOid: string }> {
    if (!validOid(commitOid)) throw new Error('Invalid checkpoint object ID');
    const message = (await this.git(['show', '-s', '--format=%B', commitOid])).toString('utf8');
    let manifest: CheckpointManifest;
    try { manifest = JSON.parse(message); } catch { throw new Error('Checkpoint manifest is unreadable'); }
    if (manifest.format !== 'bitgit-checkpoint' || manifest.version !== 1 || !validId(manifest.id)
      || typeof manifest.label !== 'string' || !manifest.label.trim() || manifest.label.length > 120
      || typeof manifest.note !== 'string' || manifest.note.length > 4000
      || !['manual', 'automatic', 'safety'].includes(manifest.kind) || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))
      || (manifest.branch !== null && (typeof manifest.branch !== 'string' || manifest.branch.length > 512))
      || (manifest.head !== null && (typeof manifest.head !== 'string' || !/^[0-9a-f]{40,64}$/.test(manifest.head)))
      || !/^[0-9a-f]{64}$/.test(manifest.fingerprint) || !Array.isArray(manifest.entries)
      || manifest.entries.length > MAX_CAPTURE_FILES
      || !manifest.coverage || !Array.isArray(manifest.coverage.included) || !Array.isArray(manifest.coverage.excluded)
      || !Array.isArray(manifest.coverage.limits) || !Array.isArray(manifest.coverage.warnings)) throw new Error('Unsupported checkpoint manifest');
    let size = 0;
    const seen = new Set<string>();
    for (const entry of manifest.entries) {
      safeRelative(entry.path);
      if (seen.has(entry.path.toLowerCase()) || !['100644', '100755'].includes(entry.mode)
        || !/^[0-9a-f]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.sizeBytes)
        || entry.sizeBytes < 0 || entry.sizeBytes > MAX_FILE_BYTES || (size += entry.sizeBytes) > MAX_CAPTURE_BYTES) throw new Error('Checkpoint contains unsupported or oversized entries');
      seen.add(entry.path.toLowerCase());
    }
    if (manifest.coverage.included.length !== manifest.entries.length || manifest.coverage.totalBytes !== size
      || manifest.coverage.excluded.length > 20_000 || manifest.coverage.warnings.length > MAX_CAPTURE_FILES) throw new Error('Checkpoint coverage does not match its entries');
    const entrySizes = new Map(manifest.entries.map(entry => [entry.path, entry.sizeBytes]));
    const included = new Set<string>();
    for (const file of manifest.coverage.included) {
      if (!file || typeof file.path !== 'string' || included.has(file.path) || entrySizes.get(file.path) !== file.sizeBytes) throw new Error('Checkpoint coverage contains inconsistent files');
      included.add(file.path);
    }
    for (const file of manifest.coverage.excluded) {
      if (!file || typeof file.path !== 'string' || file.path.length > 4096 || typeof file.reason !== 'string' || file.reason.length > 1000) throw new Error('Checkpoint exclusion receipt is invalid');
    }
    if (manifest.coverage.warnings.some(warning => typeof warning !== 'string' || warning.length > 4096)) throw new Error('Checkpoint warning receipt is invalid');
    // Imported coverage cannot replace this installation's actual recovery limits.
    manifest.coverage.limits = [...COVERAGE_LIMITS];
    const treeOid = (await this.git(['rev-parse', `${commitOid}^{tree}`])).toString('utf8').trim();
    return { manifest, treeOid };
  }
  async readCheckpoint(id: string): Promise<Checkpoint> {
    this.metadataPath(id); // Validate before constructing a ref or filesystem path.
    const commitOid = (await this.git(['rev-parse', '--verify', `refs/checkpoints/${id}^{commit}`])).toString('utf8').trim();
    const { manifest, treeOid } = await this.readManifest(commitOid);
    if (manifest.id !== id) throw new Error('Checkpoint ID does not match its saved manifest');
    let metadata: Awaited<ReturnType<RecoveryService['readMetadata']>> = {}, metadataError: string | undefined;
    try { metadata = await this.readMetadata(id); } catch (error) {
      metadataError = error instanceof Error ? error.message : String(error);
    }
    return { ...this.checkpointFromManifest(manifest), commitOid, treeOid, evidence: metadata.evidence ?? [], backup: metadata.backup ?? null, recoveredAt: metadata.recoveredAt ?? null, metadataError };
  }
  async readSnapshot(checkpoint: Checkpoint): Promise<SnapshotFile[]> {
    const { manifest } = await this.readManifest(checkpoint.commitOid);
    const tree = (await this.git(['ls-tree', '-r', '-z', '--full-tree', checkpoint.commitOid])).toString('utf8').split('\0').filter(Boolean);
    if (tree.length !== manifest.entries.length) throw new Error('Checkpoint tree does not match its manifest');
    const entries = new Map(manifest.entries.map(entry => [entry.path, entry]));
    const parsed = tree.map(row => {
      const tab = row.indexOf('\t'), [mode, type, oid] = row.slice(0, tab).split(' '), name = row.slice(tab + 1);
      const entry = entries.get(name);
      if (tab < 0 || type !== 'blob' || !entry || entry.mode !== mode || !validOid(oid)) throw new Error('Checkpoint contains an unsupported tree entry');
      safeRelative(name);
      return { ...entry, oid };
    });
    const data = parsed.length ? await this.git(['cat-file', '--batch'], `${parsed.map(entry => entry.oid).join('\n')}\n`) : Buffer.alloc(0);
    let offset = 0;
    const files: SnapshotFile[] = [];
    for (const entry of parsed) {
      const end = data.indexOf(10, offset);
      const [oid, type, length] = data.subarray(offset, end).toString('utf8').split(' ');
      const size = Number(length);
      if (end < 0 || oid !== entry.oid || type !== 'blob' || size !== entry.sizeBytes) throw new Error('Checkpoint blob size mismatch');
      const bytes = data.subarray(end + 1, end + 1 + size);
      if (bytes.length !== size || data[end + 1 + size] !== 10 || sha256(bytes) !== entry.sha256) throw new Error('Checkpoint content verification failed');
      const reason = exclusionReason(entry.path, size, bytes);
      if (reason) throw new Error(`Checkpoint cannot be recovered: ${entry.path}: ${reason}`);
      files.push({ path: entry.path, mode: entry.mode, bytes, sha256: entry.sha256 });
      offset = end + size + 2;
    }
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (fingerprint(files) !== manifest.fingerprint) throw new Error('Checkpoint fingerprint does not match its content');
    return files;
  }
  async compare(id: string): Promise<RecoveryComparison> {
    const checkpoint = await this.readCheckpoint(id);
    const saved = new Map((await this.readSnapshot(checkpoint)).map(file => [file.path, file]));
    const captured = await this.capture();
    const intentionallyExcluded = new Set(checkpoint.coverage.excluded.filter(file => file.reason === 'Excluded by your selection').map(file => file.path));
    const current = new Map(captured.files.filter(file => !intentionallyExcluded.has(file.path)).map(file => [file.path, file]));
    const changes: RecoveryComparison['changes'] = [];
    let unchangedCount = 0;
    for (const file of [...new Set([...saved.keys(), ...current.keys()])].sort()) {
      const before = current.get(file), after = saved.get(file);
      if (before?.sha256 === after?.sha256 && before?.mode === after?.mode) { unchangedCount++; continue; }
      const binary = [before, after].some(value => value?.bytes.subarray(0, 8192).includes(0));
      const truncated = [before, after].some(value => value && value.bytes.length > 32_768);
      changes.push({ path: file, kind: !before ? 'add' : !after ? 'delete' : 'replace', binary, truncated,
        before: before && !binary ? before.bytes.subarray(0, 32_768).toString('utf8') : null,
        after: after && !binary ? after.bytes.subarray(0, 32_768).toString('utf8') : null });
    }
    return { checkpointId: id, currentFingerprint: captured.fingerprint, changes, unchangedCount, warnings: captured.coverage.warnings };
  }
  async recover(id: string, destination: string): Promise<RecoveryReceipt> {
    if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw new Error('Choose an absolute path for the new recovered folder');
    const target = path.resolve(destination);
    safeRelative(path.basename(target));
    if (within(this.repoPath, target) || within(target, this.repoPath) || within(this.vaultPath, target) || within(target, this.vaultPath)) throw new Error('Recover into a separate folder outside the source and checkpoint storage');
    const parent = path.dirname(target);
    await assertNoLinks(path.parse(parent).root, parent);
    if (await exists(target)) throw new Error('The destination already exists. Choose a new folder so nothing is overwritten.');
    const checkpoint = await this.readCheckpoint(id), files = await this.readSnapshot(checkpoint);
    const staging = path.join(parent, `.bitgit-recover-${randomUUID()}`);
    await fs.mkdir(staging, { mode: 0o700 });
    try {
      for (const file of files) {
        const dest = path.join(staging, ...safeRelative(file.path).split('/'));
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, file.bytes, { flag: 'wx', mode: file.mode === '100755' ? 0o755 : 0o644 });
        if (sha256(await fs.readFile(dest)) !== file.sha256) throw new Error(`Recovered file could not be verified: ${file.path}`);
      }
      if (await exists(target)) throw new Error('The destination was created by another operation. Choose a new folder.');
      await fs.rename(staging, target);
      const verifiedAt = this.now();
      const warnings: string[] = [];
      try { await this.updateMetadata(id, { recoveredAt: verifiedAt }); } catch {
        warnings.push('The recovered files were verified, but the recovery receipt could not be saved. Existing metadata was preserved.');
      }
      return { checkpointId: id, destination: target, fileCount: files.length, verifiedAt, ...(warnings.length ? { warnings } : {}) };
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  async dispatch<R extends RecoveryRequest>(request: R): Promise<RecoveryResults[R['action']]> {
    if (!request || typeof request !== 'object' || typeof request.action !== 'string') throw new Error('Invalid recovery request');
    return this.locked(async () => {
      let result: unknown;
      if (['create', 'repair', 'autoTick'].includes(request.action) && await pendingRepair(this)) {
        throw new Error('A file repair was interrupted. Review its safety checkpoint and undo the interrupted repair before saving or repairing again.');
      }
      switch (request.action) {
        case 'state': result = await this.state(); break;
        case 'preview': result = await this.preview(); break;
        case 'create': result = await this.create(request); break;
        case 'compare': result = await this.compare(request.checkpointId); break;
        case 'recover': result = await this.recover(request.checkpointId, request.destination); break;
        case 'repair': result = await repairFiles(this, request); break;
        case 'repairRollback': result = await rollbackRepair(this); break;
        case 'backup': result = await backupCheckpoint(this, request.checkpointId, request.remoteUrl); break;
        case 'verifyBackup': result = await verifyBackup(this, request.checkpointId); break;
        case 'remoteList': result = await listRemoteCheckpoints(this, request.remoteUrl); break;
        case 'remoteImport': result = await importRemoteCheckpoint(this, request.remoteUrl, request.ref); break;
        case 'settings': result = await updateRecoverySettings(this, request.settings); break;
        case 'autoTick': result = await autoTick(this); break;
        case 'evidence': result = await recordEvidence(this, request); break;
        case 'evidenceImage': result = await readEvidenceImage(this, request.checkpointId, request.evidenceId); break;
        case 'runCheck': result = await runCheckpointCheck(this, request); break;
        case 'regressionStart': result = await startRegression(this, request.goodId, request.badId); break;
        case 'regressionObserve': result = await observeRegression(this, request.sessionId, request.checkpointId, request.outcome); break;
        case 'regressionGet': result = await getRegression(this, request.sessionId); break;
        default: throw new Error(`Unknown recovery action: ${String((request as { action?: unknown }).action)}`);
      }
      return result as RecoveryResults[R['action']];
    });
  }
}
