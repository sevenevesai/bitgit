import { useId, useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { Copy, FolderInput, FolderSearch, Loader2 } from 'lucide-react';
import type { RecoveryReceipt } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { formatTimestamp, inputClass, primaryButton, safeText, secondaryButton } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';

interface RecoverCopyProps {
  checkpointId: string;
  projectName: string;
  projectPath?: string | null;
  vaultPath?: string | null;
  onRecovered: () => Promise<void>;
}

function defaultFolderName(projectName: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const base = projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').trim() || 'project';
  return `${base}-recovered-${stamp}`;
}

function validateFolderName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name for the new folder.';
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(trimmed)) return 'The folder name cannot contain \\ / : * ? " < > | or control characters.';
  if (trimmed === '.' || trimmed === '..') return 'Choose a real folder name.';
  if (/[. ]$/.test(trimmed)) return 'The folder name cannot end with a dot or a space.';
  return null;
}

function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${name}`;
}

function isInsidePath(path: string, root: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const candidate = normalize(path);
  const base = normalize(root);
  return candidate === base || candidate.startsWith(`${base}/`);
}

export function RecoverCopy({ checkpointId, projectName, projectPath, vaultPath, onRecovered }: RecoverCopyProps) {
  const { call, busy } = useRecoveryGate();
  const nameId = useId();
  const [parent, setParent] = useState<string | null>(null);
  const [folderName, setFolderName] = useState(() => defaultFolderName(projectName));
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<RecoveryReceipt | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const nameProblem = validateFolderName(folderName);
  const destination = parent && !nameProblem ? joinPath(parent, folderName.trim()) : null;
  const locationProblem =
    destination && projectPath && isInsidePath(destination, projectPath)
      ? 'That location is inside your project. Choose a folder outside it.'
      : destination && vaultPath && isInsidePath(destination, vaultPath)
        ? 'That location is inside BitGit’s saved history. Choose a different folder.'
        : null;
  const canRecover = !busy && destination !== null && locationProblem === null;

  const choose = async () => {
    setPickerError(null);
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Choose where the recovered copy will be created' });
      if (typeof selected === 'string') setParent(selected);
    } catch (pickError) {
      setPickerError(errorMessage(pickError));
    }
  };

  const recover = async () => {
    if (!destination) return;
    setError(null);
    setReceipt(null);
    setCopyNote(null);
    setRecovering(true);
    try {
      const result = await call('Recovering files…', { action: 'recover', checkpointId, destination }, { mutating: true });
      setReceipt(result);
      setFolderName(defaultFolderName(projectName));
      await onRecovered();
    } catch (recoverError) {
      setError(errorMessage(recoverError));
    } finally {
      setRecovering(false);
    }
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopyNote('Path copied.');
    } catch (copyError) {
      setCopyNote(`Could not copy the path: ${errorMessage(copyError)}`);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Recovering writes this saved version into a <strong>new folder</strong>. Your current project is not touched. The folder must not exist yet;
        BitGit creates it.
      </p>

      <div className="space-y-3">
        <div>
          <span className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Parent folder</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={secondaryButton} onClick={() => void choose()} disabled={busy !== null}>
              <FolderSearch className="w-4 h-4" aria-hidden="true" />
              {parent ? 'Change folder…' : 'Choose folder…'}
            </button>
            <span className="text-sm font-mono break-all text-gray-700 dark:text-gray-300">{parent ? safeText(parent) : 'No folder chosen'}</span>
          </div>
          {pickerError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Could not open the folder picker: {pickerError}</p>}
        </div>

        <div>
          <label htmlFor={nameId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            New folder name
          </label>
          <input
            id={nameId}
            type="text"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            className={inputClass}
            disabled={recovering}
            aria-invalid={nameProblem !== null}
          />
          {nameProblem && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{nameProblem}</p>}
        </div>

        <div className="p-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30">
          <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Files will be written to</span>
          {destination ? (
            <span className="font-mono break-all text-gray-900 dark:text-white">{safeText(destination)}</span>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">Choose a parent folder and a valid name to see the destination.</span>
          )}
        </div>
        {locationProblem && <p className="text-xs text-red-600 dark:text-red-400">{locationProblem}</p>}
      </div>

      {error && (
        <Notice tone="error" title="Nothing was recovered">
          {error}
        </Notice>
      )}

      <button type="button" className={primaryButton} onClick={() => void recover()} disabled={!canRecover}>
        {recovering ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FolderInput className="w-4 h-4" aria-hidden="true" />}
        Recover to new folder
      </button>

      {receipt && (
        <Notice
          tone="success"
          title={`Recovered ${receipt.fileCount} files — verified ${formatTimestamp(receipt.verifiedAt)}`}
          actions={
            <button type="button" className={secondaryButton} onClick={() => void copyPath(receipt.destination)}>
              <Copy className="w-4 h-4" aria-hidden="true" />
              Copy path
            </button>
          }
        >
          <span className="font-mono break-all">{safeText(receipt.destination)}</span>
          {'\n'}BitGit checked each written file against the saved version. It did not copy Git history, run scripts or install dependencies. The folder is a
          plain copy, not a Git repository, and nothing has checked that the code runs.
          {copyNote && `\n${copyNote}`}
          {receipt.warnings?.map((warning) => <span key={warning} className="block mt-2 text-yellow-800 dark:text-yellow-300">{safeText(warning)}</span>)}
        </Notice>
      )}
    </div>
  );
}
