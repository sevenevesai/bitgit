import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Tone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  error: {
    box: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200',
    icon: <XCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />,
  },
  warning: {
    box: 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
    icon: <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />,
  },
  info: {
    box: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
    icon: <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />,
  },
  success: {
    box: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200',
    icon: <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />,
  },
};

interface NoticeProps {
  tone: Tone;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function Notice({ tone, title, children, actions }: NoticeProps) {
  const { box, icon } = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 p-3 text-sm border rounded-lg ${box}`}>
      {icon}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="break-words whitespace-pre-wrap">{children}</div>}
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    </div>
  );
}
