import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { assertNoLinks, atomicWrite, gitRun, within } from './recovery-io.js';
import type { RecoveryService } from './recovery-service.js';
import type { BackupReceipt, Checkpoint, RemoteCheckpoint } from './recovery-types.js';

const REF_PATTERN = /^refs\/heads\/bitgit-checkpoints\/[0-9a-f]{24}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function validateBackupRemote(service: RecoveryService, value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\x00-\x1f]/.test(value)) throw new Error('Choose a Git remote URL without embedded credentials');
  const remote = value.trim();
  if (path.isAbsolute(remote)) {
    if (within(service.repoPath, remote) || within(service.vaultPath, remote)) throw new Error('Backup destination must be separate from source and checkpoint storage');
    return path.resolve(remote);
  }
  if (/\s/.test(remote)) throw new Error('Encode spaces in the remote URL');
  if (/^git@[a-z0-9.-]+:[a-z0-9_./-]+$/i.test(remote) && !remote.split('/').includes('..')) return remote;
  let url: URL;
  try { url = new URL(remote); } catch { throw new Error('Use an HTTPS or SSH Git remote URL'); }
  if (!['https:', 'ssh:'].includes(url.protocol) || !url.hostname || url.password
    || (url.protocol === 'https:' && url.username) || (url.protocol === 'ssh:' && url.username && url.username !== 'git')
    || url.search || url.hash) throw new Error('Use an HTTPS or SSH Git remote without embedded credentials, query or fragment');
  return remote;
}
function validateRef(ref: string): string {
  if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) throw new Error('Select a BitGit checkpoint ref from the remote list');
  return ref;
}
async function remoteGit(service: RecoveryService, args: string[], remote: string): Promise<Buffer> {
  const env: NodeJS.ProcessEnv = { GIT_ALLOW_PROTOCOL: 'https:ssh:file' };
  // Transient header is scoped to GitHub, never added to a URL, argv, or a config file.
  if (remote.startsWith('https://github.com/') && service.options.githubToken) {
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${service.options.githubToken}`).toString('base64')}`;
  }
  try {
    return await gitRun(service.vaultPath, [`--git-dir=${service.gitDir}`, '-c', `core.hooksPath=${path.join(service.vaultPath, 'empty-template')}`, ...args], { env, timeoutMs: 90_000, maxBytes: 2 * 1024 * 1024 });
  } catch (error: any) {
    // Git can include server-controlled text in stderr. Never return bearer material.
    const message = String(error.message).replace(/(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|AUTHORIZATION:[^\r\n]+)/gi, '[redacted]');
    throw new Error(`Remote operation failed: ${message.slice(0, 2000)}`);
  }
}
export async function listRemoteCheckpoints(service: RecoveryService, value: string): Promise<RemoteCheckpoint[]> {
  const remote = validateBackupRemote(service, value);
  const output = await remoteGit(service, ['ls-remote', '--refs', remote, 'refs/heads/bitgit-checkpoints/*/*'], remote);
  const result: RemoteCheckpoint[] = [];
  for (const row of output.toString('utf8').split('\n').filter(Boolean)) {
    const [commitOid, ref] = row.trim().split(/\s+/);
    const match = ref?.match(REF_PATTERN);
    if (match && /^[0-9a-f]{40}$/.test(commitOid)) result.push({ id: match[1], ref, commitOid });
  }
  if (result.length > 2000) throw new Error('The remote contains too many checkpoint refs to display');
  return result.sort((a, b) => a.ref.localeCompare(b.ref));
}
async function verifyRef(service: RecoveryService, remote: string, ref: string, oid: string): Promise<void> {
  const rows = (await remoteGit(service, ['ls-remote', '--refs', remote, validateRef(ref)], remote)).toString('utf8').trim().split('\n');
  if (!rows.some(row => row.trim() === `${oid}\t${ref}`)) throw new Error('The remote checkpoint object does not match. Backup is not verified.');
}
export async function backupCheckpoint(service: RecoveryService, id: string, value: string): Promise<BackupReceipt> {
  const remote = validateBackupRemote(service, value);
  const checkpoint = await service.readCheckpoint(id);
  await service.readMetadata(id); // Refuse before publishing when its receipt cannot be preserved.
  await service.readSnapshot(checkpoint); // Check bounds, hashes and current protection policy before sending.
  await clearVerifiedRootBoundary(service, checkpoint.commitOid);
  const ref = `refs/heads/bitgit-checkpoints/${service.vaultKey}/${checkpoint.id}`;
  await remoteGit(service, ['push', '--porcelain', remote, `${checkpoint.commitOid}:${ref}`], remote);
  await verifyRef(service, remote, ref, checkpoint.commitOid);
  const receipt = { remoteUrl: remote, ref, commitOid: checkpoint.commitOid, verifiedAt: service.now(), lastCheckedAt: service.now(), lastCheckError: null };
  await service.updateMetadata(id, { backup: receipt });
  return receipt;
}
export async function verifyBackup(service: RecoveryService, id: string): Promise<BackupReceipt> {
  await service.readMetadata(id);
  const checkpoint = await service.readCheckpoint(id), receipt = checkpoint.backup;
  if (!receipt) throw new Error('This checkpoint has no recorded remote backup');
  const remote = validateBackupRemote(service, receipt.remoteUrl);
  try {
    if (receipt.commitOid !== checkpoint.commitOid || REF_PATTERN.exec(receipt.ref)?.[1] !== checkpoint.id) throw new Error('The backup receipt does not match this checkpoint');
    await verifyRef(service, remote, receipt.ref, checkpoint.commitOid);
    const updated = { ...receipt, verifiedAt: service.now(), lastCheckedAt: service.now(), lastCheckError: null };
    await service.updateMetadata(id, { backup: updated });
    return updated;
  } catch (error: any) {
    await service.updateMetadata(id, { backup: { ...receipt, lastCheckedAt: service.now(), lastCheckError: String(error.message).slice(0, 2000) } });
    throw error;
  }
}
export async function importRemoteCheckpoint(service: RecoveryService, value: string, selectedRef: string): Promise<Checkpoint> {
  const remote = validateBackupRemote(service, value), ref = validateRef(selectedRef);
  const advertised = (await listRemoteCheckpoints(service, remote)).find(item => item.ref === ref);
  if (!advertised) throw new Error('The selected remote checkpoint is no longer available');
  await remoteGit(service, ['fetch', '--no-tags', '--depth=1', remote, ref], remote);
  const commitOid = (await service.git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'])).toString('utf8').trim();
  if (commitOid !== advertised.commitOid) throw new Error('The remote checkpoint changed during import; refresh the list');
  const rawCommit = (await service.git(['cat-file', '-p', commitOid])).toString('utf8').split('\n\n')[0];
  if (/^parent /m.test(rawCommit)) throw new Error('Checkpoint commits must not include unrelated source history');
  const { manifest, treeOid } = await service.readManifest(commitOid);
  if (manifest.id !== advertised.id) throw new Error('Remote checkpoint ID does not match its manifest');
  const checkpoint: Checkpoint = { ...service.checkpointFromManifest(manifest), commitOid, treeOid, backup: null, evidence: [], recoveredAt: null };
  await service.readSnapshot(checkpoint);
  await verifyRef(service, remote, ref, commitOid);
  await clearVerifiedRootBoundary(service, commitOid);
  // An existing ID is immutable, including imports from a different destination.
  let existing: Checkpoint | null = null;
  try { existing = await service.readCheckpoint(checkpoint.id); } catch {
    const refs = (await service.git(['for-each-ref', '--format=%(objectname)', `refs/checkpoints/${checkpoint.id}`])).toString('utf8').trim();
    if (refs) throw new Error('A local checkpoint with this ID is unreadable; import cannot overwrite it');
  }
  if (existing && existing.commitOid !== commitOid) throw new Error('A different local checkpoint already uses this ID');
  await service.readMetadata(checkpoint.id);
  if (!existing) await service.git(['update-ref', `refs/checkpoints/${checkpoint.id}`, commitOid, '0000000000000000000000000000000000000000']);
  await service.updateMetadata(checkpoint.id, { backup: { remoteUrl: remote, ref, commitOid, verifiedAt: service.now(), lastCheckedAt: service.now(), lastCheckError: null } });
  return service.readCheckpoint(checkpoint.id);
}

// A depth-limited fetch marks even a root commit as shallow. Once its complete snapshot
// and lack of parents are verified, that one boundary is unnecessary and prevents export
// to a new remote. Preserve every other shallow boundary, including rejected imports.
async function clearVerifiedRootBoundary(service: RecoveryService, oid: string): Promise<void> {
  const header = (await service.git(['cat-file', '-p', oid])).toString('utf8').split('\n\n')[0];
  if (/^parent /m.test(header)) throw new Error('Checkpoint commits must not include unrelated source history');
  const file = path.join(service.gitDir, 'shallow');
  let text: string;
  try { await assertNoLinks(service.gitDir, file); text = await fs.readFile(file, 'utf8'); } catch (error: any) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const rows = text.split(/\r?\n/).filter(Boolean);
  if (!rows.includes(oid)) return;
  const remaining = rows.filter(row => row !== oid);
  if (remaining.length) await atomicWrite(file, remaining.join('\n') + '\n');
  else await fs.rm(file);
}
