// Recovery wire contract. The UI imports these types; Rust forwards validated requests.
export type CheckpointKind = 'manual' | 'automatic' | 'safety';
export interface ExcludedFile { path: string; reason: string }
export interface Coverage {
  included: Array<{ path: string; sizeBytes: number }>;
  excluded: ExcludedFile[];
  totalBytes: number;
  warnings: string[];
  limits: string[];
}
export interface CheckpointEvidence {
  id: string;
  recordedAt: string;
  kind: 'manual' | 'command';
  description: string;
  outcome: 'passed' | 'failed' | 'untested';
  checkpointId: string;
  command?: string;
  exitCode?: number | null;
  output?: string;
  screenshotPath?: string;
  // runCheck only: the retained recovered copy the command ran in (a temporary folder; may be deleted later).
  workingCopyPath?: string;
}
export interface BackupReceipt {
  remoteUrl: string;
  ref: string;
  commitOid: string;
  verifiedAt: string;
  lastCheckedAt?: string;
  lastCheckError?: string | null;
}
export interface Checkpoint {
  id: string;
  label: string;
  note: string;
  kind: CheckpointKind;
  createdAt: string;
  branch: string | null;
  head: string | null;
  commitOid: string;
  treeOid: string;
  fingerprint: string;
  coverage: Coverage;
  evidence: CheckpointEvidence[];
  backup: BackupReceipt | null;
  recoveredAt: string | null;
}
export interface CheckpointPreview {
  fingerprint: string;
  coverage: Coverage;
  branch: string | null;
  head: string | null;
}
export interface RecoveryChange {
  path: string;
  // Effect of replacing current code with the checkpoint's version.
  kind: 'add' | 'replace' | 'delete';
  binary: boolean;
  before: string | null;
  after: string | null;
  truncated: boolean;
}
export interface RecoveryComparison {
  checkpointId: string;
  currentFingerprint: string;
  changes: RecoveryChange[];
  unchangedCount: number;
  warnings: string[];
}
export interface RecoveryReceipt {
  checkpointId: string;
  destination: string;
  fileCount: number;
  verifiedAt: string;
  safetyCheckpointId?: string;
}
export interface RecoverySettings {
  automaticEnabled: boolean;
  idleMinutes: number;
  excludedPaths?: string[];
  // No automatic pruning in v1: manual, safety, and automatic checkpoints are retained.
  retention: 'keep_all';
}
export interface RecoveryState {
  checkpoints: Checkpoint[];
  settings: RecoverySettings;
  vaultPath: string;
  sourceAvailable: boolean;
  pendingRepair?: { safetyCheckpointId: string; startedAt: string; affectedFiles: number } | null;
}
export interface RemoteCheckpoint {
  id: string;
  ref: string;
  commitOid: string;
}
export interface RegressionSession {
  id: string;
  goodId: string;
  badId: string;
  candidateIds: string[];
  observations: Record<string, 'good' | 'bad' | 'skip'>;
  nextId: string | null;
  firstBadId: string | null;
  inconclusiveIds: string[];
  complete: boolean;
}
export type RecoveryRequest =
  | { action: 'state' }
  | { action: 'preview' }
  | { action: 'create'; label: string; note?: string; kind?: CheckpointKind; expectedFingerprint?: string; excludedPaths?: string[] }
  | { action: 'compare'; checkpointId: string }
  | { action: 'recover'; checkpointId: string; destination: string }
  | { action: 'repair'; checkpointId: string; paths: string[]; expectedFingerprint: string }
  | { action: 'repairRollback' }
  | { action: 'backup'; checkpointId: string; remoteUrl: string }
  | { action: 'verifyBackup'; checkpointId: string }
  | { action: 'remoteList'; remoteUrl: string }
  | { action: 'remoteImport'; remoteUrl: string; ref: string }
  | { action: 'settings'; settings: RecoverySettings }
  | { action: 'autoTick' }
  | { action: 'evidence'; checkpointId: string; description: string; outcome: 'passed' | 'failed' | 'untested'; screenshotPath?: string }
  | { action: 'runCheck'; checkpointId: string; command: string; timeoutSeconds?: number }
  | { action: 'regressionStart'; goodId: string; badId: string }
  | { action: 'regressionObserve'; sessionId: string; checkpointId: string; outcome: 'good' | 'bad' | 'skip' }
  | { action: 'regressionGet'; sessionId: string };

export interface RecoveryResults {
  state: RecoveryState;
  preview: CheckpointPreview;
  create: Checkpoint;
  compare: RecoveryComparison;
  recover: RecoveryReceipt;
  repair: RecoveryReceipt;
  repairRollback: RecoveryReceipt;
  backup: BackupReceipt;
  verifyBackup: BackupReceipt;
  remoteList: RemoteCheckpoint[];
  remoteImport: Checkpoint;
  settings: RecoverySettings;
  autoTick: { checkpoint: Checkpoint | null; reason: string };
  evidence: CheckpointEvidence;
  runCheck: CheckpointEvidence;
  regressionStart: RegressionSession;
  regressionObserve: RegressionSession;
  regressionGet: RegressionSession;
}
