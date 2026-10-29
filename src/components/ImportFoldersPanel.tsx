import { useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import toast from 'react-hot-toast';
import { Check, FolderGit, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { importRepositories, pathKey, scanForRepositories } from '../lib/repoImport';

interface ImportFoldersPanelProps {
  onCancel: () => void;
  onDone: () => void;
}

// Add Project's import tab: scan one folder for Git repositories and add the ones the user ticks.
// Folders already in BitGit are listed but cannot be ticked.
export function ImportFoldersPanel({ onCancel, onDone }: ImportFoldersPanelProps) {
  const { projects, settings, loadProjects } = useAppStore();
  const [scanRoot, setScanRoot] = useState('');
  const [foundRepos, setFoundRepos] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const knownPaths = new Set(
    projects.flatMap((project) => (project.localPath ? [pathKey(project.localPath)] : []))
  );

  const handleChooseFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: 'Select a folder to scan for Git repositories',
    });
    if (!picked || typeof picked !== 'string') return;

    setScanRoot(picked);
    setFoundRepos([]);
    setSelected(new Set());
    setIsScanning(true);
    try {
      const repos = await scanForRepositories([picked], settings.scanning);
      setFoundRepos(repos);
      setSelected(new Set(repos.filter((path) => !knownPaths.has(pathKey(path)))));
    } catch (error) {
      toast.error(`Scan failed: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  const toggle = (path: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setIsAdding(true);
    try {
      const { added, already } = await importRepositories([...selected], projects);
      await loadProjects();
      toast.success(
        `Added ${added} project${added !== 1 ? 's' : ''}` +
          (already > 0 ? `; ${already} ${already !== 1 ? 'were' : 'was'} already in BitGit and re-checked.` : '.')
      );
      onDone();
    } catch (error) {
      toast.error(`Failed to add projects: ${error}`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Choose a folder. BitGit lists it and any subfolders that are Git repositories, up to {settings.scanning.depth}{' '}
          levels deep.
        </p>
        <button
          type="button"
          onClick={() => void handleChooseFolder()}
          disabled={isScanning || isAdding}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:border-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
        >
          {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderGit className="w-5 h-5" />}
          {scanRoot ? 'Choose Another Folder' : 'Choose Folder'}
        </button>

        {scanRoot && <p className="text-sm text-gray-700 break-all">{scanRoot}</p>}

        {scanRoot && !isScanning && (
          foundRepos.length === 0 ? (
            <p className="text-sm text-gray-500">No Git repositories were found in this folder.</p>
          ) : (
            <ul className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto" aria-label="Repositories found">
              {foundRepos.map((path) => {
                const already = knownPaths.has(pathKey(path));
                const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
                return (
                  <li key={path} className="border-b border-gray-200 last:border-b-0">
                    <label className={`flex items-start gap-3 px-4 py-3 ${already ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(path)}
                        disabled={already || isAdding}
                        onChange={() => toggle(path)}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900">{name}</span>
                        <span className="block text-xs text-gray-500 break-all">{path}</span>
                        {already && <span className="block text-xs text-gray-500">Already in BitGit</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      <div className="flex items-center justify-end gap-2 p-6 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleAdd()}
          disabled={isAdding || isScanning || selected.size === 0}
          className="flex items-center gap-2 px-6 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {selected.size > 0 ? `Add ${selected.size} Selected` : 'Add Selected'}
        </button>
      </div>
    </>
  );
}
