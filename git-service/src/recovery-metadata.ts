import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertNoLinks, readJson } from './recovery-io.js';
import type { Checkpoint, CheckpointEvidence } from './recovery-types.js';

type Metadata = Partial<Pick<Checkpoint, 'backup' | 'evidence' | 'recoveredAt'>>;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const optionalText = (value: unknown, limit: number) => value === undefined || text(value, limit);
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);

function validEvidence(entry: unknown, id: string): entry is CheckpointEvidence {
  return object(entry) && uuid(entry.id) && entry.checkpointId === id && date(entry.recordedAt)
    && ['manual', 'command'].includes(String(entry.kind)) && ['passed', 'failed', 'untested'].includes(String(entry.outcome))
    && text(entry.description, 4000) && optionalText(entry.command, 4000) && optionalText(entry.output, 32768)
    && optionalText(entry.screenshotPath, 32768) && optionalText(entry.workingCopyPath, 32768)
    && (entry.exitCode === undefined || entry.exitCode === null || Number.isInteger(entry.exitCode));
}

// Receipts are mutable annotations, independent of the immutable snapshot manifest. A damaged
// receipt is never reset implicitly: readers can recover code; writers refuse before doing work.
export async function readCheckpointMetadata(file: string, id: string): Promise<Metadata> {
  try {
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('Invalid receipt file');
      await assertNoLinks(path.parse(file).root, file);
    } catch (error: any) { if (error.code === 'ENOENT') return {}; throw error; }
    const value = await readJson<unknown>(file, {});
    if (!object(value)) throw new Error('Invalid receipt');
    if (value.recoveredAt !== undefined && value.recoveredAt !== null && !date(value.recoveredAt)) throw new Error('Invalid recovery date');
    if (value.evidence !== undefined && (!Array.isArray(value.evidence) || value.evidence.length > 500
      || !value.evidence.every(entry => validEvidence(entry, id)))) throw new Error('Invalid evidence');
    const backup = value.backup;
    if (backup !== undefined && backup !== null && (!object(backup) || !text(backup.remoteUrl, 2048)
      || !text(backup.ref, 1024) || typeof backup.commitOid !== 'string' || !/^[0-9a-f]{40}$/.test(backup.commitOid)
      || !date(backup.verifiedAt) || (backup.lastCheckedAt !== undefined && !date(backup.lastCheckedAt))
      || (backup.lastCheckError !== undefined && backup.lastCheckError !== null && !text(backup.lastCheckError, 2000)))) throw new Error('Invalid backup receipt');
    return value as Metadata;
  } catch {
    throw new Error(`Checkpoint notes and receipts are unreadable (${path.basename(file)}). Saved files remain recoverable. The original metadata is preserved; new notes, checks, repairs and backup receipts are paused for this checkpoint.`);
  }
}
