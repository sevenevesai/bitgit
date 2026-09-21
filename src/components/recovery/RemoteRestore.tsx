import { useId, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import type { Checkpoint, RecoveryState, RemoteCheckpoint } from '../../types/recovery';
import { errorMessage, redactSecrets, validateRemoteUrl } from '../../lib/recovery';
import { formatBytes, formatTimestamp, inputClass, primaryButton, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';
import { RecoverCopy } from './RecoverCopy';

interface RemoteRestoreProps {
  projectName: string;
  projectPath: string;
  defaultRemoteUrl: string | null;
  state: RecoveryState | null;
  onImported: (checkpoint: Checkpoint) => Promise<void>;
  onRecovered: () => Promise<void>;
}

export function RemoteRestore({ projectName, projectPath, defaultRemoteUrl, state, onImported, onRecovered }: RemoteRestoreProps) {
  const { call, busy } = useRecoveryGate();
  const urlId = useId();
  const groupName = useId();
  const [remoteUrl, setRemoteUrl] = useState(redactSecrets(defaultRemoteUrl ?? ''));
  const [listed, setListed] = useState<{ url: string; items: RemoteCheckpoint[] } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [chosenRef, setChosenRef] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<Checkpoint | null>(null);
  const [working, setWorking] = useState<'list' | 'import' | null>(null);

  const urlProblem = remoteUrl.trim() ? validateRemoteUrl(remoteUrl) : null;
  const urlReady = remoteUrl.trim() !== '' && urlProblem === null;
  const localIds = new Set(state?.checkpoints.map((checkpoint) => checkpoint.id) ?? []);

  const list = async () => {
    setListError(null);
    setListed(null);
    setChosenRef(null);
    setImported(null);
    setImportError(null);
    setWorking('list');
    try {
      const url = remoteUrl.trim();
      const items = await call('Listing saved versions on the remote…', { action: 'remoteList', remoteUrl: url });
      setListed({ url, items });
    } catch (error) {
      setListError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  };

  const importChosen = async () => {
    if (!listed || !chosenRef) return;
    setImportError(null);
    setImported(null);
    setWorking('import');
    try {
      const checkpoint = await call('Importing from the remote…', { action: 'remoteImport', remoteUrl: listed.url, ref: chosenRef }, { mutating: true });
      setImported(checkpoint);
      await onImported(checkpoint);
    } catch (error) {
      setImportError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Bring a saved version back from a remote copy, for example on another computer or after local history is gone. This works without any local saved
        versions. Importing adds the version to BitGit’s history; your project is not changed.
      </p>

      <div className="space-y-2">
        <label htmlFor={urlId} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Remote repository URL
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={urlId}
            type="text"
            value={remoteUrl}
            onChange={(event) => {
              setRemoteUrl(event.target.value);
              setListed(null);
              setChosenRef(null);
              setImported(null);
            }}
            placeholder="https://github.com/you/your-repo.git"
            className={`${inputClass} font-mono flex-1 min-w-[16rem]`}
            disabled={working !== null}
            aria-invalid={urlProblem !== null}
            spellCheck={false}
          />
          <button type="button" className={secondaryButton} onClick={() => void list()} disabled={busy !== null || !urlReady}>
            {working === 'list' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Search className="w-4 h-4" aria-hidden="true" />}
            List saved versions
          </button>
        </div>
        {urlProblem && <p className="text-xs text-red-600 dark:text-red-400">{urlProblem}</p>}
      </div>

      {listError && (
        <Notice tone="error" title="Could not list the remote">
          {listError}
        </Notice>
      )}

      {listed && listed.items.length === 0 && (
        <Notice tone="info" title="No saved versions found">
          Nothing BitGit recognises was found at <span className="font-mono break-all">{safeText(redactSecrets(listed.url))}</span>.
        </Notice>
      )}

      {listed && listed.items.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Saved versions at <span className="font-mono break-all">{safeText(redactSecrets(listed.url))}</span>
          </legend>
          <ul className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
            {listed.items.map((item) => (
              <li key={item.ref}>
                <label className="flex items-start gap-3 p-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <input
                    type="radio"
                    name={groupName}
                    checked={chosenRef === item.ref}
                    onChange={() => setChosenRef(item.ref)}
                    disabled={busy !== null}
                    className="mt-0.5 w-4 h-4 text-teal-600 focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono break-all text-gray-900 dark:text-white">{safeText(item.id)}</span>
                    <span className="block font-mono break-all text-gray-500 dark:text-gray-400">
                      {safeText(item.ref)} · commit {shortId(item.commitOid, 10)}
                    </span>
                  </span>
                  {localIds.has(item.id) && <span className="shrink-0 text-gray-500 dark:text-gray-400">already in local history</span>}
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className={primaryButton} onClick={() => void importChosen()} disabled={busy !== null || !chosenRef}>
            {working === 'import' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
            Import selected version
          </button>
        </fieldset>
      )}

      {importError && (
        <Notice tone="error" title="The version was not imported">
          {importError}
        </Notice>
      )}

      {imported && (
        <div className="space-y-4">
          <Notice tone="success" title={`Imported “${safeText(imported.label)}”`}>
            Saved {formatTimestamp(imported.createdAt)} · {imported.coverage.included.length} files · {formatBytes(imported.coverage.totalBytes)}. It is now in
            History. Recover it into a new folder below.
          </Notice>
          <RecoverCopy
            key={imported.id}
            checkpointId={imported.id}
            projectName={projectName}
            projectPath={projectPath}
            vaultPath={state?.vaultPath}
            onRecovered={onRecovered}
          />
        </div>
      )}
    </div>
  );
}
