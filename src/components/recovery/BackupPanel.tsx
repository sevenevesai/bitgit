import { useId, useState } from 'react';
import { Loader2, ShieldCheck, Upload } from 'lucide-react';
import type { BackupReceipt, Checkpoint } from '../../types/recovery';
import { errorMessage, redactSecrets, validateRemoteUrl } from '../../lib/recovery';
import { backupStatus, formatBytes, formatRelative, formatTimestamp, inputClass, primaryButton, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';

interface BackupPanelProps {
  checkpoint: Checkpoint;
  defaultRemoteUrl: string | null;
  onChanged: () => Promise<void>;
}

const showUrl = (url: string) => safeText(redactSecrets(url));

export function BackupPanel({ checkpoint, defaultRemoteUrl, onChanged }: BackupPanelProps) {
  const { call, busy } = useRecoveryGate();
  const urlId = useId();
  const [remoteUrl, setRemoteUrl] = useState(redactSecrets(defaultRemoteUrl ?? checkpoint.backup?.remoteUrl ?? ''));
  const [confirming, setConfirming] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState<BackupReceipt | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState<BackupReceipt | null>(null);
  const [working, setWorking] = useState<'backup' | 'verify' | null>(null);

  const receipt = checkpoint.backup;
  // The saved receipt is the truth after a reopen; session notices below only ever agree with it.
  const status = receipt ? backupStatus(receipt) : null;
  const urlProblem = remoteUrl.trim() ? validateRemoteUrl(remoteUrl) : null;
  const canBackUp = !busy && !checkpoint.metadataError && remoteUrl.trim() !== '' && urlProblem === null;

  const backUp = async () => {
    setBackupError(null);
    setBackedUp(null);
    setVerifyError(null);
    setVerified(null);
    setWorking('backup');
    try {
      const result = await call('Uploading to the remote…', { action: 'backup', checkpointId: checkpoint.id, remoteUrl: remoteUrl.trim() }, { mutating: true });
      setBackedUp(result);
      setConfirming(false);
      await onChanged();
    } catch (error) {
      setBackupError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  };

  const verify = async () => {
    setBackedUp(null);
    setVerifyError(null);
    setVerified(null);
    setWorking('verify');
    try {
      const result = await call('Checking the remote copy…', { action: 'verifyBackup', checkpointId: checkpoint.id });
      setVerified(result);
      await onChanged();
    } catch (error) {
      setVerifyError(errorMessage(error));
      // The engine records a failed check on the receipt; reload so the saved state replaces the old one.
      await onChanged();
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <section aria-labelledby={`${urlId}-status`} className="space-y-2">
        <h3 id={`${urlId}-status`} className="text-sm font-semibold text-gray-900 dark:text-white">
          Remote copy of this saved version
        </h3>
        {receipt ? (
          <div className="p-3 text-sm space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-gray-800 dark:text-gray-200">
              Copied to <span className="font-mono break-all">{showUrl(receipt.remoteUrl)}</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
              {safeText(receipt.ref)} · commit {shortId(receipt.commitOid, 10)}
            </p>
            {status?.state === 'unconfirmed' ? (
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                Not confirmed: the latest check{status.checkedAt ? ` (${formatTimestamp(status.checkedAt)}, ${formatRelative(status.checkedAt)})` : ''} failed. It was last
                confirmed {formatTimestamp(status.lastVerifiedAt)}, before that failure, so it is no longer evidence that the remote copy is there.
              </p>
            ) : (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Last confirmed {formatTimestamp(status?.checkedAt)} ({formatRelative(status?.checkedAt)}). That is a historical record, not a live check.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">{checkpoint.metadataError ? 'The backup record is unreadable. The remote copy has not been checked.' : 'No remote copy of this saved version has been recorded.'}</p>
        )}

        {verified && status?.state === 'verified' && (
          <Notice tone="success" title={`Remote copy matches — checked ${formatTimestamp(verified.lastCheckedAt ?? verified.verifiedAt)}`}>
            The remote reference was read back and matches this saved version. This proves the remote copy exists; it does not test that the code runs.
          </Notice>
        )}
        {status?.state === 'unconfirmed' ? (
          <Notice tone="error" title="The remote copy could not be confirmed">
            {safeText(redactSecrets(status.error))}
          </Notice>
        ) : (
          verifyError && (
            <Notice tone="error" title="The remote copy could not be confirmed">
              {verifyError}
            </Notice>
          )
        )}
        {receipt && (
          <button type="button" className={secondaryButton} onClick={() => void verify()} disabled={busy !== null}>
            {working === 'verify' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4" aria-hidden="true" />}
            Re-check remote copy
          </button>
        )}
      </section>

      <section aria-labelledby={`${urlId}-upload`} className="space-y-3">
        <h3 id={`${urlId}-upload`} className="text-sm font-semibold text-gray-900 dark:text-white">
          {receipt ? 'Copy to a remote again' : 'Copy to a remote'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Backing up uploads this saved version’s files to the repository below, on a separate checkpoint branch. Your own branches are not changed. Only the
          files included in this saved version are uploaded. Notes, checks and screenshots stay on this computer and are not part of the backup. Nothing is backed
          up unless you do it here.
        </p>
        <div>
          <label htmlFor={urlId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Remote repository URL
          </label>
          <input
            id={urlId}
            type="text"
            value={remoteUrl}
            onChange={(event) => {
              setRemoteUrl(event.target.value);
              setConfirming(false);
            }}
            placeholder="https://github.com/you/your-repo.git"
            className={`${inputClass} font-mono`}
            disabled={working !== null}
            aria-invalid={urlProblem !== null}
            spellCheck={false}
          />
          {urlProblem && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{urlProblem}</p>}
          {defaultRemoteUrl && remoteUrl === redactSecrets(defaultRemoteUrl) && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Prefilled from this project’s linked GitHub repository. You can change it.</p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Public or private: <strong>unknown</strong>. BitGit has not checked who can read this repository.
          </p>
        </div>

        {backupError && (
          <Notice tone="error" title="The upload did not complete">
            {backupError}
          </Notice>
        )}
        {backedUp && status?.state === 'verified' && (
          <Notice tone="success" title={`Copied to the remote — verified ${formatTimestamp(backedUp.verifiedAt)}`}>
            <span className="font-mono break-all">{showUrl(backedUp.remoteUrl)}</span>
            {'\n'}
            <span className="font-mono break-all">{safeText(backedUp.ref)}</span> at commit {shortId(backedUp.commitOid, 10)}. The reference was read back from the
            remote after upload.
          </Notice>
        )}

        {!confirming ? (
          <button type="button" className={primaryButton} onClick={() => setConfirming(true)} disabled={!canBackUp}>
            <Upload className="w-4 h-4" aria-hidden="true" />
            Back up this version…
          </button>
        ) : (
          <div className="space-y-3" role="group" aria-label="Confirm upload">
            <Notice tone="warning" title="Confirm the destination">
              Upload {checkpoint.coverage.included.length} files ({formatBytes(checkpoint.coverage.totalBytes)}) from “{safeText(checkpoint.label)}” to
              {'\n'}
              <span className="font-mono break-all">{showUrl(remoteUrl.trim())}</span>
              {'\n'}Anyone who can read that repository can read these files.
            </Notice>
            <div className="flex gap-2">
              <button type="button" className={primaryButton} onClick={() => void backUp()} disabled={!canBackUp}>
                {working === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Upload className="w-4 h-4" aria-hidden="true" />}
                Upload to this remote
              </button>
              <button type="button" className={secondaryButton} onClick={() => setConfirming(false)} disabled={busy !== null}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
