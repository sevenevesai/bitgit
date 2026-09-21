import { useState } from 'react';
import { Copy } from 'lucide-react';
import { errorMessage } from '../../lib/recovery';
import { secondaryButton } from './format';

interface CopyButtonProps {
  text: string;
  label: string;
}

export function CopyButton({ text, label }: CopyButtonProps) {
  const [note, setNote] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied.');
    } catch (error) {
      setNote(`Could not copy: ${errorMessage(error)}`);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={secondaryButton} onClick={() => void copy()}>
        <Copy className="w-4 h-4" aria-hidden="true" />
        {label}
      </button>
      <span role="status" className="text-xs text-gray-600 dark:text-gray-400">
        {note}
      </span>
    </span>
  );
}
