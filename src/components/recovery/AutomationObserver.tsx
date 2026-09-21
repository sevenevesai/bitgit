import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';
import { retryRecoveryAutomation, startRecoveryObserver, stopRecoveryObserver, syncRecoveryProjects, syncRecoveryGitActivity, useAutomationProblems } from '../../lib/recovery-automation';
import type { AutomationStatus } from '../../lib/recovery-automation';
import { formatRelative, formatTimestamp, safeMultiline, safeText, secondaryButton } from './format';

function problemText(status: AutomationStatus): string {
  if (status.error) return status.error.message;
  if (status.settingsError) return `${status.settingsError}\nAutomatic saves are off for this project until you save its settings again in Save & Recover, on the Automatic saves tab.`;
  return 'A file repair was interrupted, so automatic saves are paused for this project. Open Save & Recover to undo it.';
}

// One persistent summary instead of a toast per failure. It stays until each problem is fixed.
function ProblemSummary() {
  const problems = useAutomationProblems();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (problems.length === 0) return null;

  return (
    <div role="status" className="fixed bottom-4 left-4 z-40 max-w-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-yellow-900 bg-yellow-100 border border-yellow-400 rounded-lg shadow-lg dark:text-yellow-100 dark:bg-yellow-900 dark:border-yellow-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
      >
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        Automatic saves need attention ({problems.length} project{problems.length === 1 ? '' : 's'})
        {open ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Automatic save problems"
          className="mt-2 p-3 space-y-3 max-h-80 overflow-y-auto text-sm bg-white border border-gray-300 rounded-lg shadow-lg dark:bg-gray-800 dark:border-gray-600"
        >
          {problems.map((status) => (
            <div key={status.projectId} className="space-y-1">
              <p className="font-medium text-gray-900 dark:text-white break-words">{safeText(status.projectName)}</p>
              <p className="text-xs whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">{safeMultiline(problemText(status))}</p>
              {status.error && (
                <p className="text-xs text-gray-500 dark:text-gray-400" title={formatTimestamp(status.error.at)}>
                  Failed {formatRelative(status.error.at) || 'just now'}
                  {status.error.retryAt ? `; next automatic try after ${formatTimestamp(status.error.retryAt)}` : ''}
                </p>
              )}
              {status.skipped && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {status.skipped === 'workspace-open' ? 'Paused while Save & Recover is open for this project.' : 'Waiting for a running recovery action to finish.'}
                </p>
              )}
              <button type="button" className={secondaryButton} onClick={() => retryRecoveryAutomation(status.projectId)} disabled={status.ticking}>
                <RefreshCw className={`w-4 h-4 ${status.ticking ? 'animate-spin' : ''}`} aria-hidden="true" />
                Retry now
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Mounted once by App. Renders the summary only; everything else is timers in lib/recovery-automation.
export function RecoveryBackground() {
  const projects = useAppStore((state) => state.projects);
  const syncingProjects = useAppStore((state) => state.syncingProjects);
  const key = useMemo(() => JSON.stringify(projects.map((project) => [project.id, project.name, project.localPath])), [projects]);

  useEffect(() => {
    startRecoveryObserver();
    return stopRecoveryObserver;
  }, []);

  useEffect(() => {
    syncRecoveryGitActivity(syncingProjects);
  }, [syncingProjects]);

  useEffect(() => {
    syncRecoveryProjects(projects.map(({ id, name, localPath }) => ({ id, name, localPath })));
  }, [key]);

  return <ProblemSummary />;
}
