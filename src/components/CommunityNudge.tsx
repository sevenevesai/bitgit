import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { openDiscord, SYNC_SUCCEEDED_EVENT } from '../lib/community';

const VISIBLE_MS = 12_000;
const FIRST_TRY_MS = 4_000;
const BUSY_RETRY_MS = 15_000;
const AFTER_SYNC_MS = 2_000;

// Modals are the app's `fixed inset-0` overlays; the recovery workspace is one of them.
const isModalOpen = () => document.querySelector('.fixed.inset-0') !== null;

const isBusy = () => {
  const { syncingProjects, reviewRequest } = useAppStore.getState();
  return syncingProjects.size > 0 || reviewRequest !== null || isModalOpen();
};

// One-time card. Rust decides eligibility and records "seen" before the card is shown, so every
// way of leaving it (Join, close, timeout, quitting) is final. Nothing touches the network
// until Join is pressed.
export function CommunityNudge() {
  const [visible, setVisible] = useState(false);
  const synced = useRef(false);
  const settled = useRef(false);
  const timer = useRef<number>();

  const attempt = useCallback(async () => {
    if (settled.current) return;
    if (isBusy()) {
      timer.current = window.setTimeout(attempt, BUSY_RETRY_MS);
      return;
    }
    try {
      const show = await invoke<boolean>('claim_community_nudge', {
        busy: false,
        syncedThisLaunch: synced.current,
      });
      if (show) {
        settled.current = true;
        setVisible(true);
      }
    } catch (error) {
      // Fail closed and quiet: no card, no toast.
      settled.current = true;
      console.error('[Community] Nudge check failed:', error);
    }
  }, []);

  useEffect(() => {
    timer.current = window.setTimeout(attempt, FIRST_TRY_MS);
    const onSync = () => {
      synced.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(attempt, AFTER_SYNC_MS);
    };
    window.addEventListener(SYNC_SUCCEEDED_EVENT, onSync);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener(SYNC_SUCCEEDED_EVENT, onSync);
    };
  }, [attempt]);

  useEffect(() => {
    if (!visible) return;
    const hide = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => window.clearTimeout(hide);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Community"
      className="fixed bottom-4 right-4 z-40 flex w-80 items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-800"
    >
      <p className="flex-1 text-sm text-gray-800 dark:text-gray-200">
        Found a bug or want a feature? Tell me on Discord.
      </p>
      <button
        onClick={() => {
          void openDiscord('bitgit-nudge');
          setVisible(false);
        }}
        className="rounded-md bg-teal-600 px-3 py-1 text-sm text-white hover:bg-teal-700 transition-colors"
      >
        Join
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
