import { useId, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import type { CheckpointEvidence } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { CopyButton } from './CopyButton';
import { inputClass, outcomeBadgeClass, outcomeLabel, primaryButton, safeMultiline, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';

const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_COMMAND_LENGTH = 4000;

interface CheckPanelProps {
  checkpoint: { id: string; label: string; metadataError?: string };
  // Called after a result is recorded so the workspace can reload the saved version's entries.
  onRecorded?: (entry: CheckpointEvidence) => Promise<void>;
}

function timeoutProblem(text: string): string | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 600 ? null : 'Enter a whole number of seconds from 1 to 600.';
}

function CheckResult({ entry, checkpointLabel }: { entry: CheckpointEvidence; checkpointLabel: string }) {
  const tone = entry.outcome === 'passed' ? 'success' : entry.outcome === 'failed' ? 'error' : 'warning';
  const title =
    entry.outcome === 'passed'
      ? 'The command passed on this saved version'
      : entry.outcome === 'failed'
        ? 'The command failed on this saved version'
        : 'The command ran, but the result is recorded as not tested';
  return (
    <div className="space-y-2">
      <Notice tone={tone} title={title}>
        {entry.command !== undefined && (
          <>
            <code className="font-mono break-all">{safeText(entry.command)}</code> on “{safeText(checkpointLabel) || '(unnamed)'}”.{'\n'}
          </>
        )}
        {safeMultiline(entry.description)}
        {'\nThis says only that this command gave this result on this saved version. It does not show that the rest of the project works.'}
      </Notice>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <span className={`px-2 py-0.5 mr-2 text-xs rounded-full ${outcomeBadgeClass(entry.outcome)}`}>{outcomeLabel(entry.outcome)}</span>
        {entry.exitCode === null || entry.exitCode === undefined ? 'No exit code (the command was stopped or could not start).' : `Exit code ${entry.exitCode}.`}
      </p>
      {entry.output !== undefined && (
        <div>
          <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Output (the end of it, text only)</div>
          <pre className="p-2 text-xs font-mono overflow-auto max-h-72 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded text-gray-800 dark:text-gray-200">
            {entry.output === '' ? '(no output)' : safeMultiline(entry.output)}
          </pre>
        </div>
      )}
      {entry.workingCopyPath && (
        <div className="p-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg space-y-1">
          <div className="text-gray-500 dark:text-gray-400">The copy the command ran in is kept for you to look at. It is in a temporary folder that may be cleaned up later; delete it yourself when you are done.</div>
          <div className="font-mono break-all text-gray-900 dark:text-white">{safeText(entry.workingCopyPath)}</div>
          <CopyButton text={entry.workingCopyPath} label="Copy path" />
        </div>
      )}
    </div>
  );
}

// Nothing here runs on selection or when a tab opens: only the confirmed button starts a check.
export function CheckPanel({ checkpoint, onRecorded }: CheckPanelProps) {
  const { call, busy } = useRecoveryGate();
  const commandId = useId();
  const timeoutId = useId();
  const [command, setCommand] = useState('');
  const [timeout, setTimeoutText] = useState(String(DEFAULT_TIMEOUT_SECONDS));
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckpointEvidence | null>(null);

  const trimmed = command.trim();
  const commandProblem = trimmed.length > MAX_COMMAND_LENGTH ? `The command can be at most ${MAX_COMMAND_LENGTH} characters.` : null;
  const limitProblem = timeoutProblem(timeout);
  const ready = trimmed !== '' && commandProblem === null && limitProblem === null;
  const name = safeText(checkpoint.label) || '(unnamed)';

  const run = async () => {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const entry = await call(
        'Running the check in a recovered copy…',
        { action: 'runCheck', checkpointId: checkpoint.id, command: trimmed, timeoutSeconds: Number(timeout) },
        { mutating: true },
      );
      setResult(entry);
      setConfirming(false);
      await onRecorded?.(entry);
    } catch (runError) {
      setError(errorMessage(runError));
      setConfirming(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby={`${commandId}-title`} className="space-y-3">
      <h4 id={`${commandId}-title`} className="text-sm font-semibold text-gray-900 dark:text-white">
        Run a check on this saved version
      </h4>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Try a command, such as your tests, against exactly this saved version. BitGit makes a <strong>new recovered copy</strong> of it in a temporary folder and
        runs your command there. Your current project is not used and is not changed. The command runs with your normal permissions on this computer, so it can
        use the network and reach any file you can; only run commands you trust. Nothing is installed for you: saved versions leave out dependency folders such
        as <span className="font-mono">node_modules</span>, so include an install step in the command if it needs one.
      </p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div>
          <label htmlFor={commandId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Command
          </label>
          <input
            id={commandId}
            type="text"
            value={command}
            onChange={(event) => {
              setCommand(event.target.value);
              setConfirming(false);
            }}
            placeholder="e.g. npm test"
            className={`${inputClass} font-mono`}
            disabled={running}
            spellCheck={false}
            aria-invalid={commandProblem !== null}
          />
          {commandProblem && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{commandProblem}</p>}
        </div>
        <div>
          <label htmlFor={timeoutId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Time limit (seconds)
          </label>
          <input
            id={timeoutId}
            type="number"
            min={1}
            max={600}
            step={1}
            value={timeout}
            onChange={(event) => {
              setTimeoutText(event.target.value);
              setConfirming(false);
            }}
            className={inputClass}
            disabled={running}
            aria-invalid={limitProblem !== null}
          />
        </div>
      </div>
      {limitProblem && <p className="text-xs text-red-600 dark:text-red-400">{limitProblem}</p>}

      {error && (
        <Notice tone="error" title="The check needs attention">
          {error}
        </Notice>
      )}

      {!confirming ? (
        <button type="button" className={primaryButton} onClick={() => setConfirming(true)} disabled={busy !== null || !ready || Boolean(checkpoint.metadataError)}>
          <Play className="w-4 h-4" aria-hidden="true" />
          Run check…
        </button>
      ) : (
        <div role="group" aria-label="Confirm the check" className="space-y-3">
          <Notice tone="warning" title="Run this command now?">
            <code className="font-mono break-all">{safeText(trimmed)}</code>
            {'\n'}on the saved version “{name}” (<span className="font-mono">{shortId(checkpoint.id)}</span>), in a new recovered copy, for at most {timeout} second
            {Number(timeout) === 1 ? '' : 's'}. It runs with your normal permissions and can use the network. Your current project is not touched.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={() => void run()} disabled={busy !== null || !ready || Boolean(checkpoint.metadataError)}>
              {running ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
              Run “{safeText(trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed)}” on this version
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && <CheckResult entry={result} checkpointLabel={checkpoint.label} />}
    </section>
  );
}
