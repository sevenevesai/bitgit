import toast from 'react-hot-toast';

// Errors outside rendering and outside any awaited call would otherwise vanish. The message is the
// toast id, so a repeating failure replaces its toast instead of stacking. Nothing is persisted or sent.
export function installGlobalErrorHandlers(): void {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    console.error('[Unhandled rejection]', reason);
    showError(reason instanceof Error ? reason.message : String(reason));
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    // Benign: the browser reports a resize callback that did not settle within one frame.
    if (event.message.includes('ResizeObserver loop')) return;
    console.error('[Unhandled error]', event.error ?? event.message);
    showError(event.message);
  });
}

function showError(message: string): void {
  toast.error(message, { id: message });
}
