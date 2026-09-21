import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { atomicJson, readJson, safeRelative } from './recovery-io.js';
import { selectCapture, type CapturedSource } from './recovery-capture.js';
import { MAX_CAPTURE_FILES } from './recovery-policy.js';
import { checkpointTimeline, type TimelineEntry } from './recovery-regression.js';
import { DEFAULT_RECOVERY_SETTINGS, type RecoveryService } from './recovery-service.js';
import type { RecoveryResults, RecoverySettings } from './recovery-types.js';

interface Observation { version: 1; fingerprint: string; changedAt: string; }

const SETTING_KEYS = ['automaticEnabled', 'idleMinutes', 'excludedPaths', 'retention'];
// The exact reason string is what compare() uses to recognise an intentional exclusion.
const EXCLUDED_BY_SELECTION = 'Excluded by your selection';
const settingsFile = (service: RecoveryService) => path.join(service.vaultPath, 'settings.json');
const observationFile = (service: RecoveryService) => path.join(service.vaultPath, 'automatic-observation.json');
const signature = (settings: RecoverySettings) => JSON.stringify([settings.automaticEnabled, settings.idleMinutes, [...(settings.excludedPaths ?? [])].sort()]);

export function validateRecoverySettings(value: unknown): RecoverySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Automatic-save settings must be an object');
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find(key => !SETTING_KEYS.includes(key));
  if (unknown) throw new Error(`Unknown automatic-save setting: ${unknown}`);
  if (typeof input.automaticEnabled !== 'boolean') throw new Error('automaticEnabled must be true or false');
  const idleMinutes = input.idleMinutes;
  if (typeof idleMinutes !== 'number' || !Number.isInteger(idleMinutes) || idleMinutes < 1 || idleMinutes > 60) throw new Error('Idle time must be a whole number of minutes from 1 to 60');
  if (input.retention !== 'keep_all') throw new Error('Retention must be keep_all: automatic saves are never pruned');
  const settings: RecoverySettings = { automaticEnabled: input.automaticEnabled, idleMinutes, retention: 'keep_all' };
  if (input.excludedPaths !== undefined) {
    const paths = input.excludedPaths;
    if (!Array.isArray(paths) || paths.length > MAX_CAPTURE_FILES) throw new Error('excludedPaths must be a list of at most 10,000 project-relative file paths');
    const seen = new Set<string>();
    for (const file of paths) {
      if (typeof file !== 'string' || file.length > 4096) throw new Error('excludedPaths must contain project-relative file paths');
      safeRelative(file);
      if (seen.has(file)) throw new Error(`excludedPaths lists ${file} more than once`);
      seen.add(file);
    }
    settings.excludedPaths = [...paths];
  }
  return settings;
}

export async function readRecoverySettings(service: RecoveryService): Promise<RecoverySettings> {
  const stored = await readJson<unknown>(settingsFile(service), undefined);
  if (stored === undefined) return { ...DEFAULT_RECOVERY_SETTINGS };
  try { return validateRecoverySettings(stored); } catch (error) {
    throw new Error(`Saved automatic-save settings are invalid (${error instanceof Error ? error.message : error}). Save settings again to replace them.`);
  }
}

export async function updateRecoverySettings(service: RecoveryService, settings: RecoverySettings): Promise<RecoverySettings> {
  const next = validateRecoverySettings(settings);
  let previous: RecoverySettings | null = null;
  try { previous = await readRecoverySettings(service); } catch { /* Unreadable settings are being replaced; the observation resets below. */ }
  // Removed first: a lost observation only delays a save, a stale one could save too early.
  if (!previous || signature(previous) !== signature(next)) await fs.rm(observationFile(service), { force: true });
  await atomicJson(settingsFile(service), next);
  return next;
}

// Reads only checkpoints committed within two seconds of the newest ref, so a periodic tick does not
// parse every manifest. Commit dates have 1 s resolution; the manifests' millisecond createdAt orders ties.
async function newestCheckpoint(service: RecoveryService): Promise<TimelineEntry | null> {
  const rows = (await service.git(['for-each-ref', '--format=%(refname:strip=2) %(committerdate:unix)', 'refs/checkpoints/'])).toString('utf8')
    .split('\n').filter(Boolean).map(row => { const [id, seconds] = row.split(' '); return { id, seconds: Number(seconds) }; });
  if (!rows.length) return null;
  const newest = Math.max(...rows.map(row => row.seconds));
  const timeline = await checkpointTimeline(service, rows.filter(row => row.seconds >= newest - 2).map(row => row.id));
  return timeline[timeline.length - 1] ?? null;
}

async function readObservation(service: RecoveryService): Promise<Observation | null> {
  let stored: Partial<Observation> | null;
  try { stored = await readJson<Partial<Observation> | null>(observationFile(service), null); } catch {
    return null; // Derived state: unreadable means "not observed yet", which only delays the next save.
  }
  if (!stored || stored.version !== 1 || typeof stored.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(stored.fingerprint)
    || typeof stored.changedAt !== 'string' || !Number.isFinite(Date.parse(stored.changedAt))) return null;
  return stored as Observation;
}

function applyConfiguredExclusions(captured: CapturedSource, configured: string[]): CapturedSource {
  const present = new Set(captured.files.map(file => file.path));
  const selected = selectCapture(captured, configured.filter(file => present.has(file)));
  // A configured exclusion whose file is absent today still describes this checkpoint's coverage.
  const listed = new Set(selected.coverage.excluded.map(file => file.path));
  for (const file of configured) if (!listed.has(file)) selected.coverage.excluded.push({ path: file, reason: EXCLUDED_BY_SELECTION });
  return selected;
}

export async function autoTick(service: RecoveryService): Promise<RecoveryResults['autoTick']> {
  const settings = await readRecoverySettings(service);
  if (!settings.automaticEnabled) return { checkpoint: null, reason: 'disabled' };
  let captured: CapturedSource;
  try { captured = await service.capture(); } catch (error) {
    throw new Error(`Automatic save cannot read the source folder: ${error instanceof Error ? error.message : error}`);
  }
  const configured = settings.excludedPaths ?? [];
  const selected = applyConfiguredExclusions(captured, configured);
  if (!selected.files.length) return { checkpoint: null, reason: 'no-eligible-files' };

  const now = service.now(), nowMs = Date.parse(now);
  const observed = await readObservation(service);
  // A clock that moved backwards restarts the wait rather than counting negative idle time.
  if (!observed || observed.fingerprint !== selected.fingerprint || Date.parse(observed.changedAt) > nowMs) {
    await atomicJson(observationFile(service), { version: 1, fingerprint: selected.fingerprint, changedAt: now } satisfies Observation);
    return { checkpoint: null, reason: 'waiting-for-idle' };
  }
  if (nowMs - Date.parse(observed.changedAt) < settings.idleMinutes * 60_000) return { checkpoint: null, reason: 'waiting-for-idle' };

  if ((await newestCheckpoint(service))?.fingerprint === selected.fingerprint) return { checkpoint: null, reason: 'unchanged' };
  const note = `Saved automatically after ${settings.idleMinutes} minute${settings.idleMinutes === 1 ? '' : 's'} without file changes`
    + (configured.length ? `; ${configured.length} configured exclusion${configured.length === 1 ? '' : 's'} applied.` : '.');
  const checkpoint = await service.saveCaptured(selected, `Automatic save ${now}`, note, 'automatic', captured.fingerprint);
  return { checkpoint, reason: 'saved' };
}
