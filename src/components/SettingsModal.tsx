import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import toast from 'react-hot-toast';
import { X, Github, Folder, Search, CheckCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRepositoriesAdded?: () => void;
}

interface GitHubCredentials {
  username: string;
  token: string;
}

export function SettingsModal({ isOpen, onClose, onRepositoriesAdded }: SettingsModalProps) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [directories, setDirectories] = useState<string[]>([]);
  const [foundRepos, setFoundRepos] = useState<string[]>([]);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  // Load stored credentials when modal opens
  useEffect(() => {
    if (isOpen) {
      loadStoredCredentials();
    }
  }, [isOpen]);

  const loadStoredCredentials = async () => {
    try {
      const credentials = await invoke<GitHubCredentials | null>('get_stored_github_credentials');
      if (credentials) {
        setUsername(credentials.username);
        setHasStoredToken(true);
        // Don't show the token for security, but indicate it exists
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  };

  if (!isOpen) return null;

  const handleSaveToken = async () => {
    if (!username) {
      toast.error('Please enter a username');
      return;
    }

    // If no token provided but has stored token, nothing to do
    if (!token && hasStoredToken) {
      return;
    }

    if (!token) {
      toast.error('Please enter a token');
      return;
    }

    setIsSaving(true);
    try {
      // Verify token first
      const isValid = await invoke<boolean>('verify_github_token', { token });
      if (!isValid) {
        toast.error('Invalid GitHub token');
        setIsSaving(false);
        return;
      }

      // Save token
      await invoke('save_github_token', { username, token });
      toast.success('GitHub token saved successfully');
      setToken(''); // Clear token field
      setHasStoredToken(true);

      // Auto-fetch GitHub repositories
      const fetchToast = toast.loading('Fetching your GitHub repositories...');
      try {
        await invoke('fetch_github_repos', { token });
        toast.success('GitHub repositories loaded!', { id: fetchToast });

        // Trigger refresh on the dashboard
        if (onRepositoriesAdded) {
          onRepositoriesAdded();
        }
      } catch (fetchError: any) {
        toast.error(`Failed to fetch repos: ${fetchError}`, { id: fetchToast });
      }
    } catch (error: any) {
      toast.error(`Failed to save token: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Directory to Scan',
      });

      if (selected && typeof selected === 'string') {
        if (!directories.includes(selected)) {
          setDirectories([...directories, selected]);
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleScanDirectories = async () => {
    if (directories.length === 0) {
      toast.error('Please add at least one directory to scan');
      return;
    }

    setIsScanning(true);
    try {
      // First, scan for repositories
      const repos = await invoke<string[]>('scan_directories', {
        directories,
        maxDepth: 3,
        excludePatterns: ['node_modules', 'target', 'dist', 'build', '.git'],
      });

      if (repos.length === 0) {
        toast.error('No repositories found');
        setIsScanning(false);
        return;
      }

      setFoundRepos(repos);
      toast.success(`Found ${repos.length} repositories, adding them...`);

      // Then, add them to the backend cache
      await invoke('add_repositories', { repoPaths: repos });
      toast.success(`Added ${repos.length} repositories to dashboard`);

      // Trigger refresh on the dashboard
      if (onRepositoriesAdded) {
        onRepositoriesAdded();
      }
    } catch (error: any) {
      toast.error(`Scan failed: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  const removeDirectory = (dir: string) => {
    setDirectories(directories.filter((d) => d !== dir));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* GitHub Token Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Github className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">GitHub Token</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-username"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Personal Access Token
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={hasStoredToken ? "Token saved ✓ (enter new token to update)" : "ghp_..."}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  />
                  {hasStoredToken && !token && (
                    <CheckCircle className="absolute right-3 top-2.5 w-5 h-5 text-green-500" />
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {hasStoredToken ? (
                    'Token is securely saved. Enter a new token only if you want to update it.'
                  ) : (
                    <>
                      Create a token at{' '}
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:underline"
                      >
                        github.com/settings/tokens
                      </a>
                    </>
                  )}
                </p>
              </div>

              <button
                onClick={handleSaveToken}
                disabled={isSaving || !username}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : hasStoredToken && !token ? 'Token Saved ✓' : 'Save Token'}
              </button>
            </div>
          </section>

          {/* Repository Scanning Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Folder className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Repository Scanning</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Directories to Scan
                </label>

                {directories.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {directories.map((dir) => (
                      <div
                        key={dir}
                        className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border border-gray-200"
                      >
                        <span className="text-sm text-gray-700 truncate">{dir}</span>
                        <button
                          onClick={() => removeDirectory(dir)}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleSelectDirectory}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Add Directory
                </button>
              </div>

              <button
                onClick={handleScanDirectories}
                disabled={isScanning || directories.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Search className="w-4 h-4" />
                {isScanning ? 'Scanning...' : 'Scan for Repositories'}
              </button>

              {foundRepos.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Found {foundRepos.length} repositories:
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {foundRepos.map((repo) => (
                      <div
                        key={repo}
                        className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200"
                      >
                        {repo}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Close this modal to see your repositories in the dashboard.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
