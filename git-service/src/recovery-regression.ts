import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { atomicJson, readJson } from './recovery-io.js';
import { MAX_CAPTURE_FILES } from './recovery-policy.js';
import type { RecoveryService } from './recovery-service.js';
import type { RegressionSession } from './recovery-types.js';

type Outcome = 'good' | 'bad' | 'skip';
interface StoredSession extends RegressionSession { version: 1; }
export interface TimelineEntry { id: string; createdAt: string; fingerprint: string; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OUTCOMES: readonly string[] = ['good', 'bad', 'skip'];
const chronological = (a: TimelineEntry, b: TimelineEntry) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

// One Git call reads the manifests (all checkpoints, or only `only`), avoiding three Git processes per checkpoint.
export async function checkpointTimeline(service: RecoveryService, only?: string[]): Promise<TimelineEntry[]> {
  if (only && !only.length) return [];
  const refs = only ? only.map(id => `refs/checkpoints/${id}`) : ['refs/checkpoints/'];
  const listing = (await service.git(['for-each-ref', '--format=%(refname:strip=2)%00%(contents)%00', ...refs])).toString('utf8').split('\0');
  const entries: TimelineEntry[] = [];
  for (let index = 0; index + 1 < listing.length; index += 2) {
    const id = listing[index].trim();
    let manifest: Partial<TimelineEntry> = {};
    try { manifest = JSON.parse(listing[index + 1]); } catch { /* Reported below with the checkpoint ID. */ }
    if (!UUID.test(id) || manifest.id !== id || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))
      || typeof manifest.fingerprint !== 'string') throw new Error(`Checkpoint ${id} has an unreadable manifest; its history position cannot be trusted`);
    entries.push({ id, createdAt: manifest.createdAt, fingerprint: manifest.fingerprint });
  }
  return entries.sort(chronological);
}

const sessionFile = (service: RecoveryService, id: unknown): string => {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid regression session ID');
  return path.join(service.vaultPath, 'regressions', `${id}.json`);
};

// Next/first-bad/uncertainty are always derived from the ordered interval and observations,
// so a stored file can never disagree with the evidence it records.
function derive(base: Pick<RegressionSession, 'id' | 'goodId' | 'badId' | 'candidateIds' | 'observations'>): RegressionSession {
  const { candidateIds, observations } = base;
  const position = new Map(candidateIds.map((id, index) => [id, index]));
  let lastGood = -1, firstBad = candidateIds.length;
  for (const [id, outcome] of Object.entries(observations)) {
    const index = position.get(id)!;
    if (outcome === 'good') lastGood = Math.max(lastGood, index);
    else if (outcome === 'bad') firstBad = Math.min(firstBad, index);
  }
  const untested: string[] = [], inconclusiveIds: string[] = [];
  for (let index = lastGood + 1; index < firstBad; index++) {
    const id = candidateIds[index];
    if (!observations[id]) untested.push(id);
    else if (observations[id] === 'skip') inconclusiveIds.push(id);
  }
  const complete = untested.length === 0;
  return { ...base, nextId: complete ? null : untested[(untested.length - 1) >> 1], firstBadId: complete ? candidateIds[firstBad] : null, inconclusiveIds, complete };
}

function validateStored(value: unknown, id: string): RegressionSession {
  const fail = (): never => { throw new Error('Regression session file is invalid; start a new session from the same milestones'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const stored = value as Partial<StoredSession>;
  const candidates = stored.candidateIds;
  if (stored.version !== 1 || stored.id !== id || !Array.isArray(candidates) || candidates.length < 2 || candidates.length > MAX_CAPTURE_FILES
    || candidates.some(candidate => typeof candidate !== 'string' || !UUID.test(candidate)) || new Set(candidates).size !== candidates.length
    || stored.goodId !== candidates[0] || stored.badId !== candidates[candidates.length - 1]
    || !stored.observations || typeof stored.observations !== 'object' || Array.isArray(stored.observations)) return fail();
  const position = new Map(candidates.map((candidate, index) => [candidate, index]));
  const observations: Record<string, Outcome> = {};
  for (const [checkpointId, outcome] of Object.entries(stored.observations)) {
    if (!position.has(checkpointId) || !OUTCOMES.includes(outcome)) return fail();
    observations[checkpointId] = outcome as Outcome;
  }
  const good = Object.keys(observations).filter(key => observations[key] === 'good').map(key => position.get(key)!);
  const bad = Object.keys(observations).filter(key => observations[key] === 'bad').map(key => position.get(key)!);
  if (observations[candidates[0]] !== 'good' || observations[candidates[candidates.length - 1]] !== 'bad' || Math.max(...good) >= Math.min(...bad)) return fail();
  return derive({ id, goodId: candidates[0], badId: candidates[candidates.length - 1], candidateIds: [...candidates], observations });
}

async function load(service: RecoveryService, sessionId: unknown): Promise<RegressionSession> {
  const file = sessionFile(service, sessionId);
  const stored = await readJson<unknown>(file, undefined);
  if (stored === undefined) throw new Error('Regression session not found');
  return validateStored(stored, sessionId as string);
}
const persist = (service: RecoveryService, session: RegressionSession) =>
  atomicJson(sessionFile(service, session.id), { version: 1, ...session } satisfies StoredSession);

export async function startRegression(service: RecoveryService, goodId: string, badId: string): Promise<RegressionSession> {
  if (goodId === badId) throw new Error('Choose two different milestones: one known good and one known bad');
  await service.readCheckpoint(goodId);
  await service.readCheckpoint(badId);
  const timeline = (await checkpointTimeline(service)).map(entry => entry.id);
  const from = timeline.indexOf(goodId), to = timeline.indexOf(badId);
  if (from < 0 || to < 0) throw new Error('Both milestones must be saved checkpoints');
  if (from > to) throw new Error('The known-good milestone must have been saved before the known-bad milestone');
  const candidateIds = timeline.slice(from, to + 1);
  const session = derive({ id: randomUUID(), goodId, badId, candidateIds, observations: { [goodId]: 'good', [badId]: 'bad' } });
  await persist(service, session);
  return session;
}

export async function observeRegression(service: RecoveryService, sessionId: string, checkpointId: string, outcome: Outcome): Promise<RegressionSession> {
  if (!OUTCOMES.includes(outcome)) throw new Error('Mark the milestone good, bad or skip');
  await service.readCheckpoint(checkpointId);
  const session = await load(service, sessionId);
  const position = session.candidateIds.indexOf(checkpointId);
  if (position < 0) throw new Error('That milestone is outside this regression session');
  const recorded = session.observations[checkpointId];
  if (recorded) {
    if (recorded === outcome) return session;
    throw new Error(`This milestone is already recorded as ${recorded}. Observations are never overwritten; start a new session to retest.`);
  }
  for (const [id, seen] of Object.entries(session.observations)) {
    const other = session.candidateIds.indexOf(id);
    if ((outcome === 'good' && seen === 'bad' && other < position) || (outcome === 'bad' && seen === 'good' && other > position)) {
      throw new Error(`Marking this milestone ${outcome} contradicts an earlier ${seen} result; regression search assumes failures continue once they begin. Recheck or skip it.`);
    }
  }
  const next = derive({ ...session, observations: { ...session.observations, [checkpointId]: outcome } });
  await persist(service, next);
  return next;
}

export async function getRegression(service: RecoveryService, sessionId: string): Promise<RegressionSession> {
  return load(service, sessionId);
}
