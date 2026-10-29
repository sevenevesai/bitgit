import { invoke } from '@tauri-apps/api/tauri';
import type { Project, ScanSettings } from '../types';

// Comparison key for a local folder, mirroring normalize_path_key in project_sync.rs: separators
// and trailing slashes are normalized, and case is ignored only for Windows paths.
export function pathKey(path: string): string {
  const windows = /^[a-z]:[\\/]/i.test(path) || path.includes('\\');
  const key = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return windows ? key.toLowerCase() : key;
}

// Git repositories in the given folders and their subfolders, using the depth and exclusions in Settings.
export function scanForRepositories(directories: string[], scanning: ScanSettings): Promise<string[]> {
  return invoke<string[]>('scan_directories', {
    directories,
    maxDepth: scanning.depth,
    excludePatterns: scanning.excludePatterns,
  });
}

// Adds the folders as projects. Folders already in BitGit keep their settings and are only re-checked.
export async function importRepositories(
  repoPaths: string[],
  existing: Project[],
): Promise<{ added: number; already: number }> {
  const knownIds = new Set(existing.map((project) => project.id));
  const saved = await invoke<Project[]>('add_repositories', { repoPaths });
  const added = saved.filter((project) => !knownIds.has(project.id)).length;
  return { added, already: saved.length - added };
}
