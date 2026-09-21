import { useSyncExternalStore } from 'react';
import type { RecoveryResults, RecoverySettings, RecoveryState } from '../types/recovery';
import { errorMessage, projectActivity, recoveryCall } from './recovery';

// Opt-in automatic saves for every local project while BitGit is open. There is no service or
// daemon: a timer in the app calls the engine's `autoTick`, which decides for itself whether the
// files have been idle long enough. The engine's vault lock is the final authority on overlap;
// this module only avoids starting a background call when recovery is already open or busy.

export const TICK_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 15 * 60_000;
// A project whose settings are corrupt or whose repair is interrupted cannot save until the user
// acts; its state is re-read now and then in case that was done outside this window.
const PROBLEM_RECHECK_MS = 4 * 60_000;

export interface AutomationStatus {
  projectId: string;
  projectName: string;
  // Settings have been read from the engine at least once.
  known: boolean;
  enabled: boolean;
  idleMinutes: number;
  settingsError: string | null;
  repairPending: boolean;
  lastTick: { at: string; reason: string } | null;
  lastSave: { at: string; checkpointId: string; label: string } | null;
  error: { message: string; at: string; failures: number; retryAt: string | null } | null;
  // Why the latest pass did nothing for this project.
  skipped: 'workspace-open' | 'busy' | null;
  ticking: boolean;
}

export interface TrackedProject {
  id: string;
  name: string;
  localPath: string | null;
}

export type TickOutcome = { result: RecoveryResults['autoTick'] } | { error: string };

export function hasProblem(status: AutomationStatus): boolean {
  return status.error !== null || status.settingsError !== null || (status.enabled && status.repairPending);
}

export function describeTickReason(reason: string, idleMinutes: number): string {
  switch (reason) {
    case 'disabled':
      return 'Automatic saves are off.';
    case 'waiting-for-idle':
      return `Waiting: your files changed recently or have not stayed unchanged for ${idleMinutes} minute${idleMinutes === 1 ? '' : 's'} yet. Nothing was saved.`;
    case 'saved':
      return 'Saved a version automatically.';
    case 'unchanged':
      return 'Your files match the newest saved version. Nothing new to save.';
    case 'no-eligible-files':
      return 'No eligible files: every file is excluded or missing. Nothing was saved.';
    default:
      return `The engine reported “${reason}”. Nothing else is known about this result.`;
  }
}

// ---- Status store (read with useSyncExternalStore) ----

let statuses: ReadonlyMap<string, AutomationStatus> = new Map();
let problems: readonly AutomationStatus[] = [];
const listeners = new Set<() => void>();

function commit(next: Map<string, AutomationStatus>) {
  statuses = next;
  problems = [...next.values()].filter(hasProblem);
  listeners.forEach((listener) => listener());
}

function update(projectId: string, patch: Partial<AutomationStatus>) {
  const current = statuses.get(projectId);
  if (!current) return;
  const changed = (Object.keys(patch) as (keyof AutomationStatus)[]).some((key) => current[key] !== patch[key]);
  if (!changed) return;
  const next = new Map(statuses);
  next.set(projectId, { ...current, ...patch });
  commit(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAutomationStatus(projectId: string): AutomationStatus | undefined {
  return useSyncExternalStore(subscribe, () => statuses.get(projectId));
}

export function useAutomationProblems(): readonly AutomationStatus[] {
  return useSyncExternalStore(subscribe, () => problems);
}

const initialStatus = (project: { id: string; name: string }): AutomationStatus => ({
  projectId: project.id,
  projectName: project.name,
  known: false,
  enabled: false,
  idleMinutes: 5,
  settingsError: null,
  repairPending: false,
  lastTick: null,
  lastSave: null,
  error: null,
  skipped: null,
  ticking: false,
});

// ---- Scheduler ----

let tracked = new Map<string, { name: string; path: string }>();
let started = false;
let passing = false;
let soon = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const failures = new Map<string, number>();
const retryAt = new Map<string, number>();
const stateCheckedAt = new Map<string, number>();
const forceState = new Set<string>();

function schedule(delay: number) {
  if (!started || passing) {
    if (passing && delay < TICK_INTERVAL_MS) soon = true;
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pass();
  }, delay);
}

async function pass() {
  if (!started || passing) return;
  passing = true;
  try {
    for (const id of [...tracked.keys()]) {
      if (!started) break;
      if (tracked.has(id)) await visit(id);
    }
  } finally {
    passing = false;
    const again = soon;
    soon = false;
    schedule(again ? 500 : TICK_INTERVAL_MS);
  }
}

function fail(projectId: string, message: string) {
  const count = (failures.get(projectId) ?? 0) + 1;
  failures.set(projectId, count);
  const delay = Math.min(TICK_INTERVAL_MS * 2 ** count, MAX_BACKOFF_MS);
  retryAt.set(projectId, Date.now() + delay);
  update(projectId, { error: { message, at: new Date().toISOString(), failures: count, retryAt: new Date(Date.now() + delay).toISOString() }, skipped: null });
}

function applyState(projectId: string, state: RecoveryState) {
  update(projectId, {
    known: true,
    // Corrupt settings read back as safe defaults; automatic saves fail closed until valid settings are saved.
    enabled: state.settingsError ? false : state.settings.automaticEnabled,
    idleMinutes: state.settings.idleMinutes,
    settingsError: state.settingsError ?? null,
    repairPending: Boolean(state.pendingRepair || state.repairJournalError),
  });
  stateCheckedAt.set(projectId, Date.now());
  if (!state.settingsError && !state.pendingRepair && !state.repairJournalError) {
    failures.delete(projectId);
    retryAt.delete(projectId);
  }
}

function recordTick(projectId: string, result: RecoveryResults['autoTick']) {
  const now = new Date().toISOString();
  const previous = statuses.get(projectId);
  update(projectId, {
    lastTick: { at: now, reason: result.reason },
    lastSave: result.checkpoint ? { at: now, checkpointId: result.checkpoint.id, label: result.checkpoint.label } : (previous?.lastSave ?? null),
    enabled: result.reason !== 'disabled',
    error: null,
    skipped: null,
  });
  failures.delete(projectId);
  retryAt.delete(projectId);
}

async function readState(projectId: string): Promise<boolean> {
  forceState.delete(projectId);
  try {
    const state = await recoveryCall(projectId, { action: 'state' }, { background: true });
    if (!started || !tracked.has(projectId)) return false;
    applyState(projectId, state);
    return true;
  } catch (error) {
    if (started && tracked.has(projectId)) fail(projectId, `Could not read the automatic-save settings: ${errorMessage(error)}`);
    return false;
  }
}

async function tick(projectId: string) {
  update(projectId, { ticking: true, skipped: null });
  try {
    const result = await recoveryCall(projectId, { action: 'autoTick' }, { background: true });
    if (started && tracked.has(projectId)) recordTick(projectId, result);
  } catch (error) {
    if (started && tracked.has(projectId)) fail(projectId, errorMessage(error));
  } finally {
    update(projectId, { ticking: false });
  }
}

function skipReason(projectId: string): AutomationStatus['skipped'] {
  const activity = projectActivity(projectId);
  if (activity.workspaceOpen) return 'workspace-open';
  return activity.interactiveBusy || activity.backgroundBusy || gitBusyProjects.has(projectId) ? 'busy' : null;
}

async function visit(projectId: string) {
  const status = statuses.get(projectId);
  if (!status) return;
  const forced = forceState.has(projectId);
  const wait = retryAt.get(projectId);
  if (!forced && wait !== undefined && wait > Date.now()) return;

  const skipped = skipReason(projectId);
  if (skipped) {
    update(projectId, { skipped });
    return;
  }

  // Harness changes must be noticed even when this app last saw automatic saving disabled.
  if (!status.known || forced || Date.now() - (stateCheckedAt.get(projectId) ?? 0) > PROBLEM_RECHECK_MS) {
    if (!(await readState(projectId))) return;
  }

  const current = statuses.get(projectId);
  if (!started || !current) return;
  if (!current.enabled || current.settingsError || current.repairPending) {
    update(projectId, { skipped: null });
    return;
  }
  // The state read above took time; recovery may have opened meanwhile.
  const late = skipReason(projectId);
  if (late) {
    update(projectId, { skipped: late });
    return;
  }
  await tick(projectId);
}

// ---- Public control surface ----

let gitBusyProjects: ReadonlySet<string> = new Set();
export function syncRecoveryGitActivity(projectIds: ReadonlySet<string>) { gitBusyProjects = projectIds; }

export function startRecoveryObserver() {
  if (started) return;
  // Not immediately: the dashboard's own startup Git calls share the service and go first.
  started = true;
  schedule(5000);
}

// Called when the app component unmounts. Statuses stay so a remount shows the last known picture.
export function stopRecoveryObserver() {
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

export function syncRecoveryProjects(projects: readonly TrackedProject[]) {
  const next = new Map<string, { name: string; path: string }>();
  for (const project of projects) {
    if (project.localPath && project.localPath.trim()) next.set(project.id, { name: project.name, path: project.localPath });
  }
  const nextStatuses = new Map<string, AutomationStatus>();
  let changed = statuses.size !== next.size;
  let added = false;
  for (const [id, project] of next) {
    const existing = statuses.get(id);
    const previous = tracked.get(id);
    if (!existing) {
      nextStatuses.set(id, initialStatus({ id, name: project.name }));
      changed = true;
      added = true;
    } else if (previous && previous.path !== project.path) {
      // A different folder has a different history and different settings.
      nextStatuses.set(id, initialStatus({ id, name: project.name }));
      failures.delete(id);
      retryAt.delete(id);
      changed = true;
      added = true;
    } else if (existing.projectName !== project.name) {
      nextStatuses.set(id, { ...existing, projectName: project.name });
      changed = true;
    } else {
      nextStatuses.set(id, existing);
    }
  }
  for (const id of statuses.keys()) {
    if (next.has(id)) continue;
    failures.delete(id);
    retryAt.delete(id);
    stateCheckedAt.delete(id);
    forceState.delete(id);
    changed = true;
  }
  tracked = next;
  if (changed) commit(nextStatuses);
  if (added) schedule(2000);
}

// The workspace reloaded state: adopt it so the observer never works from older settings.
export function noteRecoveryState(projectId: string, state: RecoveryState) {
  if (statuses.has(projectId)) applyState(projectId, state);
}

// Settings were saved from the Automation tab.
export function noteRecoverySettings(projectId: string, settings: RecoverySettings) {
  if (!statuses.has(projectId)) return;
  update(projectId, { known: true, enabled: settings.automaticEnabled, idleMinutes: settings.idleMinutes, settingsError: null });
  failures.delete(projectId);
  retryAt.delete(projectId);
}

// An explicit "check now" from the Automation tab reports here so the summary stays truthful.
export function noteRecoveryTick(projectId: string, outcome: TickOutcome) {
  if (!statuses.has(projectId)) return;
  if ('error' in outcome) update(projectId, { error: { message: outcome.error, at: new Date().toISOString(), failures: 1, retryAt: null }, skipped: null });
  else recordTick(projectId, outcome.result);
}

// Retry from the persistent banner: forget the backoff and re-read settings on the next pass.
export function retryRecoveryAutomation(projectId: string) {
  if (!statuses.has(projectId)) return;
  failures.delete(projectId);
  retryAt.delete(projectId);
  forceState.add(projectId);
  schedule(0);
}
