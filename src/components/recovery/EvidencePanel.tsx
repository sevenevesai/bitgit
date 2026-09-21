import { useId, useMemo, useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { Image as ImageIcon, Loader2, ClipboardCheck } from 'lucide-react';
import type { Checkpoint, CheckpointEvidence } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { CheckPanel } from './CheckPanel';
import { CopyButton } from './CopyButton';
import { formatTimestamp, inputClass, outcomeBadgeClass, outcomeLabel, primaryButton, safeMultiline, safeText, secondaryButton, shortId } from './format';
import type { EvidenceOutcome } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';
import { PagedList } from './PagedList';

const MAX_DESCRIPTION = 4000;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,/;

const OUTCOMES: { value: EvidenceOutcome; label: string; help: string }[] = [
  { value: 'untested', label: 'Not tested', help: 'Just a note; you have not tried it.' },
  { value: 'passed', label: 'Worked', help: 'You tried it and it worked.' },
  { value: 'failed', label: 'Did not work', help: 'You tried it and it failed.' },
];

interface EvidencePanelProps {
  checkpoint: Checkpoint;
  onChanged: () => Promise<void>;
}

function EvidenceEntry({ entry, savedVersionLabel }: { entry: CheckpointEvidence; savedVersionLabel: string }) {
  const { call, busy } = useRecoveryGate();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = entry.kind === 'command' ? 'command check' : 'note';

  const showImage = async () => {
    setError(null);
    setLoading(true);
    try {
      const { dataUrl } = await call('Loading the screenshot…', { action: 'evidenceImage', checkpointId: entry.checkpointId, evidenceId: entry.id });
      if (!IMAGE_DATA_URL.test(dataUrl)) throw new Error('The saved screenshot is not a PNG, JPEG or WebP image, so it is not shown.');
      setImage(dataUrl);
    } catch (imageError) {
      setError(errorMessage(imageError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="px-2 py-0.5 text-gray-700 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-200">{entry.kind === 'command' ? 'Command check' : 'Your note'}</span>
        <span className={`px-2 py-0.5 rounded-full ${outcomeBadgeClass(entry.outcome)}`}>{outcomeLabel(entry.outcome)}</span>
        <span title={entry.recordedAt}>{formatTimestamp(entry.recordedAt)}</span>
        <span>
          for saved version “{safeText(savedVersionLabel) || '(unnamed)'}” <span className="font-mono">{shortId(entry.checkpointId)}</span>
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">{safeMultiline(entry.description)}</p>
      {entry.command !== undefined && (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          Command: <code className="font-mono break-all">{safeText(entry.command)}</code>
          {' · '}
          {entry.exitCode === null || entry.exitCode === undefined ? 'no exit code' : `exit code ${entry.exitCode}`}
        </p>
      )}
      {entry.output !== undefined && entry.output !== '' && (
        <details>
          <summary className="text-xs cursor-pointer text-gray-700 dark:text-gray-300">Output</summary>
          <pre className="p-2 mt-1 text-xs font-mono overflow-auto max-h-60 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded text-gray-800 dark:text-gray-200">
            {safeMultiline(entry.output)}
          </pre>
        </details>
      )}
      {entry.workingCopyPath && (
        <div className="text-xs space-y-1">
          <div className="text-gray-500 dark:text-gray-400">Recovered copy the check ran in (temporary; it may have been cleaned up):</div>
          <div className="font-mono break-all text-gray-800 dark:text-gray-200">{safeText(entry.workingCopyPath)}</div>
          <CopyButton text={entry.workingCopyPath} label="Copy path" />
        </div>
      )}
      {entry.screenshotPath && (
        <div className="space-y-2">
          {image ? (
            <>
              <img
                src={image}
                alt={`Screenshot attached to a ${kind} recorded ${formatTimestamp(entry.recordedAt)} for saved version ${safeText(savedVersionLabel) || shortId(entry.checkpointId)}`}
                className="max-w-full max-h-96 border border-gray-200 dark:border-gray-700 rounded"
              />
              <div>
                <button type="button" className={secondaryButton} onClick={() => setImage(null)}>
                  Hide screenshot
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={secondaryButton} onClick={() => void showImage()} disabled={busy !== null}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="w-4 h-4" aria-hidden="true" />}
              Show screenshot
            </button>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function EvidencePanel({ checkpoint, onChanged }: EvidencePanelProps) {
  const { call, busy } = useRecoveryGate();
  const descriptionId = useId();
  const outcomeName = useId();
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState<EvidenceOutcome>('untested');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<CheckpointEvidence | null>(null);

  const entries = useMemo(
    () => [...checkpoint.evidence].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || (a.id < b.id ? 1 : -1)),
    [checkpoint.evidence],
  );
  const own = entries.filter((entry) => entry.checkpointId === checkpoint.id);
  const foreign = entries.length - own.length;
  const text = description.trim();
  const tooLong = text.length > MAX_DESCRIPTION;
  const canAdd = !busy && !checkpoint.metadataError && text !== '' && !tooLong;

  const choose = async () => {
    setPickerError(null);
    try {
      const picked = await open({
        directory: false,
        multiple: false,
        title: 'Choose a screenshot (PNG, JPEG or WebP)',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (typeof picked === 'string') setScreenshot(picked);
    } catch (pickError) {
      setPickerError(errorMessage(pickError));
    }
  };

  const add = async () => {
    setError(null);
    setAdded(null);
    setSaving(true);
    try {
      const entry = await call(
        'Saving your note…',
        { action: 'evidence', checkpointId: checkpoint.id, description: text, outcome, screenshotPath: screenshot ?? undefined },
        { mutating: true },
      );
      setAdded(entry);
      setDescription('');
      setOutcome('untested');
      setScreenshot(null);
      await onChanged();
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Notes, screenshots and command checks are attached to <strong>this exact saved version</strong> and never to another one. They are your record of what
          you saw; they do not mark the version as good.
        </p>
        <Notice tone="info">
          Notes, checks and screenshots stay on this computer. They are <strong>not</strong> included in a remote backup, and a version imported from a remote
          starts without them. Only the saved files are backed up.
        </Notice>
      </div>

      <section aria-labelledby={`${descriptionId}-title`} className="space-y-3">
        <h4 id={`${descriptionId}-title`} className="text-sm font-semibold text-gray-900 dark:text-white">
          Add a note
        </h4>
        <div>
          <label htmlFor={descriptionId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            What did you observe with this version?
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="e.g. Login worked by hand; the export button was missing"
            className={inputClass}
            disabled={saving}
            aria-invalid={tooLong}
          />
          <p className={`mt-1 text-xs ${tooLong ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {text.length} / {MAX_DESCRIPTION} characters. Shown as plain text.
          </p>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Result of your own check</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {OUTCOMES.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer" title={option.help}>
                <input
                  type="radio"
                  name={outcomeName}
                  checked={outcome === option.value}
                  onChange={() => setOutcome(option.value)}
                  disabled={saving}
                  className="w-4 h-4 text-teal-600 focus:ring-2 focus:ring-teal-500"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Screenshot <span className="text-gray-400">(optional)</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={secondaryButton} onClick={() => void choose()} disabled={busy !== null}>
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
              {screenshot ? 'Change image…' : 'Choose image…'}
            </button>
            {screenshot && (
              <button type="button" className={secondaryButton} onClick={() => setScreenshot(null)} disabled={busy !== null}>
                Remove image
              </button>
            )}
            <span className="text-xs font-mono break-all text-gray-700 dark:text-gray-300">{screenshot ? safeText(screenshot) : 'No image chosen'}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPEG or WebP, up to 10 MB. BitGit keeps its own copy, so editing or deleting the original changes nothing.</p>
          {pickerError && <p className="text-xs text-red-600 dark:text-red-400">Could not open the file picker: {pickerError}</p>}
        </div>

        {error && (
          <Notice tone="error" title="The note was not saved">
            {error}
          </Notice>
        )}
        {added && (
          <Notice tone="success" title="Note added">
            Recorded {formatTimestamp(added.recordedAt)} for this saved version only.
          </Notice>
        )}
        <button type="button" className={primaryButton} onClick={() => void add()} disabled={!canAdd}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ClipboardCheck className="w-4 h-4" aria-hidden="true" />}
          Add note
        </button>
      </section>

      <CheckPanel checkpoint={checkpoint} onRecorded={onChanged} />

      <section aria-labelledby={`${descriptionId}-history`} className="space-y-3">
        <h4 id={`${descriptionId}-history`} className="text-sm font-semibold text-gray-900 dark:text-white">
          Notes and checks for this version ({own.length})
        </h4>
        {foreign > 0 && (
          <Notice tone="warning" title="Some entries are not shown">
            {foreign} entr{foreign === 1 ? 'y refers' : 'ies refer'} to a different saved version, so {foreign === 1 ? 'it is' : 'they are'} not shown as evidence for this one.
          </Notice>
        )}
        {own.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{checkpoint.metadataError ? 'The notes and check records could not be read.' : 'Nothing recorded for this saved version yet.'}</p>
        ) : (
          <PagedList
            items={own}
            step={20}
            itemKey={(entry) => entry.id}
            className="space-y-2"
            renderItem={(entry) => <EvidenceEntry entry={entry} savedVersionLabel={checkpoint.label} />}
          />
        )}
      </section>
    </div>
  );
}
