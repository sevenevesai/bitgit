import { open } from '@tauri-apps/api/shell';
import toast from 'react-hot-toast';

// The seveneves.ai redirect, never a raw invite, so the invite can change without an app update.
const DISCORD_URL = 'https://seveneves.ai/discord/';

export type DiscordSource = 'bitgit-app' | 'bitgit-nudge';

export const SYNC_SUCCEEDED_EVENT = 'bitgit:sync-succeeded';

export async function openDiscord(source: DiscordSource): Promise<void> {
  try {
    await open(`${DISCORD_URL}?from=${source}`);
  } catch (error) {
    console.error('[Community] Failed to open the Discord link:', error);
    toast.error('Could not open the link in your browser.');
  }
}

export function announceSyncSucceeded(): void {
  window.dispatchEvent(new Event(SYNC_SUCCEEDED_EVENT));
}
