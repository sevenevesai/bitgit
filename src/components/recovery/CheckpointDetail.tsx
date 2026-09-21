import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ClipboardCheck, Cloud, FileText, FolderInput, GitCompare } from 'lucide-react';
import type { Checkpoint, RecoveryState } from '../../types/recovery';
import { redactSecrets } from '../../lib/recovery';
import { BackupPanel } from './BackupPanel';
import { CompareView } from './CompareView';
import { CoverageView } from './CoverageView';
import { EvidencePanel } from './EvidencePanel';
import { backupStatus, formatBytes, formatRelative, formatTimestamp, kindBadgeClass, kindLabel, safeMultiline, safeText, shortId } from './format';
import { RecoverCopy } from './RecoverCopy';
import { Notice } from './Notice';
import { TabBar, panelId, tabId } from './TabBar';
import type { TabDef } from './TabBar';

type DetailTab = 'overview' | 'compare' | 'recover' | 'evidence' | 'backup';

const tabsFor = (checkpoint: Checkpoint): TabDef<DetailTab>[] => [
  { id: 'overview', label: 'Details', icon: <FileText className="w-4 h-4" aria-hidden="true" /> },
  { id: 'compare', label: 'Compare & repair', icon: <GitCompare className="w-4 h-4" aria-hidden="true" /> },
  { id: 'recover', label: 'Recover copy', icon: <FolderInput className="w-4 h-4" aria-hidden="true" /> },
  { id: 'evidence', label: `Notes & checks${checkpoint.evidence.length > 0 ? ` (${checkpoint.evidence.length})` : ''}`, icon: <ClipboardCheck className="w-4 h-4" aria-hidden="true" /> },
  { id: 'backup', label: 'Remote backup', icon: <Cloud className="w-4 h-4" aria-hidden="true" /> },
];

interface CheckpointDetailProps {
  checkpoint: Checkpoint;
  state: RecoveryState;
  projectName: string;
  projectPath: string;
  githubUrl: string | null;
  onOpenCheckpoint: (id: string) => void;
  onChanged: () => Promise<void>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 break-words">{children}</dd>
    </div>
  );
}

// Saved locally, copied to a remote, and recovered are separate facts with separate times.
function Facts({ checkpoint }: { checkpoint: Checkpoint }) {
  const { backup } = checkpoint;
  const status = backup ? backupStatus(backup) : null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <Fact label="Saved locally">
        {formatTimestamp(checkpoint.createdAt)} <span className="text-gray-500 dark:text-gray-400">({formatRelative(checkpoint.createdAt)})</span>
      </Fact>
      <Fact label="Type">
        <span className={`px-2 py-0.5 text-xs rounded-full ${kindBadgeClass(checkpoint.kind)}`}>{kindLabel(checkpoint.kind)}</span>
      </Fact>
      <Fact label="Branch and HEAD when saved">
        {checkpoint.branch ? safeText(checkpoint.branch) : 'No Git branch'}
        {checkpoint.head ? ` · ${shortId(checkpoint.head)}` : ' · no commits'}
      </Fact>
      <Fact label="Contents">
        {checkpoint.coverage.included.length} files · {formatBytes(checkpoint.coverage.totalBytes)}
      </Fact>
      <Fact label="Copied to a remote">
        {backup ? (
          <>
            <span className="font-mono break-all">{safeText(redactSecrets(backup.remoteUrl))}</span>
            {status?.state === 'unconfirmed' ? (
              <span className="block text-xs text-yellow-700 dark:text-yellow-400">
                Not confirmed: the latest check{status.checkedAt ? ` (${formatTimestamp(status.checkedAt)})` : ''} failed. It was last confirmed{' '}
                {formatTimestamp(status.lastVerifiedAt)}, before that failure. Use Remote backup to see the error and re-check.
              </span>
            ) : (
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                last confirmed {formatTimestamp(status?.checkedAt)} (historical; use Remote backup to re-check)
              </span>
            )}
          </>
        ) : (
          checkpoint.metadataError ? 'Backup record unreadable' : 'Not copied to a remote'
        )}
      </Fact>
      <Fact label="Recovered copy">
        {checkpoint.metadataError ? 'Recovery record unreadable' : checkpoint.recoveredAt ? `A recovered copy was verified ${formatTimestamp(checkpoint.recoveredAt)}` : 'No recovered copy recorded'}
      </Fact>
      <Fact label="ID">
        <span className="font-mono break-all">{safeText(checkpoint.id)}</span>
      </Fact>
    </dl>
  );
}

export function CheckpointDetail({ checkpoint, state, projectName, projectPath, githubUrl, onOpenCheckpoint, onChanged }: CheckpointDetailProps) {
  const prefix = useId();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [visited, setVisited] = useState<ReadonlySet<DetailTab>>(new Set<DetailTab>(['overview']));

  const show = (next: DetailTab) => {
    setTab(next);
    setVisited((previous) => new Set(previous).add(next));
  };

  const panel = (id: DetailTab, content: ReactNode) =>
    visited.has(id) && (
      <div id={panelId(prefix, id)} role="tabpanel" aria-labelledby={tabId(prefix, id)} hidden={tab !== id} className="pt-4">
        {content}
      </div>
    );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{safeText(checkpoint.label) || '(unnamed)'}</h3>
      </div>
      {checkpoint.metadataError && <Notice tone="warning" title="Saved files are available; notes and receipts need attention">{checkpoint.metadataError}</Notice>}
      <TabBar prefix={prefix} label="Saved version actions" tabs={tabsFor(checkpoint)} active={tab} onChange={show} />

      {panel(
        'overview',
        <div className="space-y-4">
          {checkpoint.note && (
            <div>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Note</h4>
              <p className="text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">{safeMultiline(checkpoint.note)}</p>
            </div>
          )}
          <Facts checkpoint={checkpoint} />
          <CoverageView coverage={checkpoint.coverage} />
        </div>,
      )}
      {panel(
        'compare',
        <CompareView checkpoint={checkpoint} sourceAvailable={state.sourceAvailable} onChanged={onChanged} onOpenCheckpoint={onOpenCheckpoint} />,
      )}
      {panel(
        'recover',
        <RecoverCopy
          checkpointId={checkpoint.id}
          projectName={projectName}
          projectPath={projectPath}
          vaultPath={state.vaultPath}
          onRecovered={onChanged}
        />,
      )}
      {panel('evidence', <EvidencePanel checkpoint={checkpoint} onChanged={onChanged} />)}
      {panel('backup', <BackupPanel checkpoint={checkpoint} defaultRemoteUrl={githubUrl} onChanged={onChanged} />)}
    </div>
  );
}
