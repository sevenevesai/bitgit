import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import toast from 'react-hot-toast';
import { X, Github, Folder, Search, CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2, Info, ChevronDown, ChevronUp, Code, Terminal } from 'lucide-react';
import { EditorPreset, EditorConfig, EditorAvailability } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRepositoriesAdded?: () => void;
}

interface GitHubCredentials {
  username: string;
  token: string;
}

type TokenStatus = 'checking' | 'valid' | 'invalid' | 'none';

export function SettingsModal({ isOpen, onClose, onRepositoriesAdded }: SettingsModalProps) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [directories, setDirectories] = useState<string[]>([]);
  const [foundRepos, setFoundRepos] = useState<string[]>([]);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('none');
  const [showScopeGuide, setShowScopeGuide] = useState(false);

  // Editor settings state
  const [editorPreset, setEditorPreset] = useState<EditorPreset>('vscode');
  const [customCommand, setCustomCommand] = useState('');
  const [editorAvailability, setEditorAvailability] = useState<EditorAvailability | null>(null);
  const [isLoadingEditors, setIsLoadingEditors] = useState(false);
  const [isSavingEditor, setIsSavingEditor] = useState(false);

  // Load and validate stored credentials and editor settings when modal opens
  useEffect(() => {
    let isMounted = true;

    if (isOpen) {
      loadAndValidateCredentials().catch(err => {
        if (isMounted) {
          console.error('Failed to load credentials:', err);
        }
      });

      // Load editor settings and detect installed editors
      loadEditorSettings().catch(err => {
        if (isMounted) {
          console.error('Failed to load editor settings:', err);
        }
      });
      detectEditors().catch(err => {
        if (isMounted) {
          console.error('Failed to detect editors:', err);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const loadEditorSettings = async () => {
    try {
      const config = await invoke<EditorConfig>('load_editor_settings');
      setEditorPreset(config.preset as EditorPreset);
      setCustomCommand(config.customCommand || '');
    } catch (error) {
      console.error('Failed to load editor settings:', error);
    }
  };

  const detectEditors = async () => {
    setIsLoadingEditors(true);
    try {
      const availability = await invoke<EditorAvailability>('detect_installed_editors');
      setEditorAvailability(availability);
    } catch (error) {
      console.error('Failed to detect editors:', error);
    } finally {
      setIsLoadingEditors(false);
    }
  };

  const handleSaveEditorSettings = async () => {
    setIsSavingEditor(true);
    try {
      await invoke('save_editor_settings', {
        preset: editorPreset,
        customCommand: editorPreset === 'custom' ? customCommand : null,
      });
      toast.success('Editor preference saved');
    } catch (error) {
      console.error('Failed to save editor settings:', error);
      toast.error('Failed to save editor preference');
    } finally {
      setIsSavingEditor(false);
    }
  };

  const loadAndValidateCredentials = async () => {
    setTokenStatus('checking');
    try {
      const credentials = await invoke<GitHubCredentials | null>('get_stored_github_credentials');
      if (credentials && credentials.token) {
        setUsername(credentials.username);

        // Validate the token is still valid
        try {
          const isValid = await invoke<boolean>('verify_github_token', { token: credentials.token });
          setTokenStatus(isValid ? 'valid' : 'invalid');
        } catch {
          setTokenStatus('invalid');
        }
      } else {
        setTokenStatus('none');
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
      setTokenStatus('none');
    }
  };

  if (!isOpen) return null;

  const handleSaveToken = async () => {
    if (!username) {
      toast.error('Please enter a username');
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
        toast.error('Invalid GitHub token - please check it has the correct permissions');
        setIsSaving(false);
        return;
      }

      // Save token
      await invoke('save_github_token', { username, token });
      toast.success('GitHub token saved and verified!');
      setToken(''); // Clear token field
      setTokenStatus('valid');

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

  // GitHub token creation URL with recommended scopes pre-selected
  const tokenCreateUrl = 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=BitGit%20App';

  const renderTokenStatus = () => {
    switch (tokenStatus) {
      case 'checking':
        return (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Checking token...</span>
          </div>
        );
      case 'valid':
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Token is valid and working</span>
          </div>
        );
      case 'invalid':
        return (
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Token is invalid or expired</span>
          </div>
        );
      case 'none':
        return (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">No token configured</span>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* GitHub Token Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Github className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">GitHub Connection</h3>
            </div>

            {/* Token Status Banner */}
            <div className={`mb-4 p-3 rounded-lg ${
              tokenStatus === 'valid' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
              tokenStatus === 'invalid' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
              tokenStatus === 'checking' ? 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600' :
              'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            }`}>
              {renderTokenStatus()}

              {(tokenStatus === 'invalid' || tokenStatus === 'none') && (
                <div className="mt-3">
                  <a
                    href={tokenCreateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-medium"
                  >
                    <Github className="w-4 h-4" />
                    Create New Token on GitHub
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Opens GitHub with recommended scopes pre-selected
                  </p>
                </div>
              )}

              {/* Scope Guide Toggle */}
              <button
                onClick={() => setShowScopeGuide(!showScopeGuide)}
                className="mt-3 flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
              >
                <Info className="w-3 h-3" />
                What permissions does BitGit need?
                {showScopeGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showScopeGuide && (
                <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs space-y-3">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Recommended (Full Access):</p>
                    <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                      <li><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">repo</code> - Push, pull, and sync all repositories (public & private)</li>
                      <li><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">read:user</code> - Read your GitHub profile info</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Minimum (Public Only):</p>
                    <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                      <li><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">public_repo</code> - Only works with public repositories</li>
                      <li><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">read:user</code> - Read your GitHub profile info</li>
                    </ul>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 italic">
                    Use "Recommended" if you want to manage private repos. The link above pre-selects recommended scopes.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-username"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={tokenStatus === 'valid' ? "Enter new token to update" : "ghp_xxxxxxxxxxxx"}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {tokenStatus === 'valid' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Your current token is working. Only enter a new token if you want to replace it.
                  </p>
                )}
              </div>

              <button
                onClick={handleSaveToken}
                disabled={isSaving || !username || !token}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Verifying & Saving...' : 'Save Token'}
              </button>
            </div>
          </section>

          {/* Repository Scanning Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Folder className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Repository Scanning</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Directories to Scan
                </label>

                {directories.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {directories.map((dir) => (
                      <div
                        key={dir}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded border border-gray-200 dark:border-gray-600"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{dir}</span>
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
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                >
                  Add Directory
                </button>
              </div>

              <button
                onClick={handleScanDirectories}
                disabled={isScanning || directories.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                <Search className="w-4 h-4" />
                {isScanning ? 'Scanning...' : 'Scan for Repositories'}
              </button>

              {foundRepos.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Found {foundRepos.length} repositories:
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {foundRepos.map((repo) => (
                      <div
                        key={repo}
                        className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded border border-gray-200 dark:border-gray-600"
                      >
                        {repo}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Close this modal to see your repositories in the dashboard.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Code Editor Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Code className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Code Editor</h3>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose which editor to use when opening projects.
              </p>

              {/* Editor Options */}
              <div className="space-y-2">
                {/* VS Code */}
                <label
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    editorPreset === 'vscode'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="editor"
                    value="vscode"
                    checked={editorPreset === 'vscode'}
                    onChange={(e) => setEditorPreset(e.target.value as EditorPreset)}
                    className="text-teal-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">VS Code</span>
                      {isLoadingEditors ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : editorAvailability && (
                        editorAvailability.vscode ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">code</span>
                  </div>
                </label>

                {/* Cursor */}
                <label
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    editorPreset === 'cursor'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="editor"
                    value="cursor"
                    checked={editorPreset === 'cursor'}
                    onChange={(e) => setEditorPreset(e.target.value as EditorPreset)}
                    className="text-teal-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">Cursor</span>
                      {isLoadingEditors ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : editorAvailability && (
                        editorAvailability.cursor ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">cursor</span>
                  </div>
                </label>

                {/* Sublime Text */}
                <label
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    editorPreset === 'sublime'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="editor"
                    value="sublime"
                    checked={editorPreset === 'sublime'}
                    onChange={(e) => setEditorPreset(e.target.value as EditorPreset)}
                    className="text-teal-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">Sublime Text</span>
                      {isLoadingEditors ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : editorAvailability && (
                        editorAvailability.sublime ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">subl</span>
                  </div>
                </label>

                {/* Custom */}
                <label
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    editorPreset === 'custom'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="editor"
                    value="custom"
                    checked={editorPreset === 'custom'}
                    onChange={(e) => setEditorPreset(e.target.value as EditorPreset)}
                    className="text-teal-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <span className="font-medium text-gray-900 dark:text-white">Custom Command</span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Use your own editor command</span>
                  </div>
                </label>

                {/* Custom Command Input */}
                {editorPreset === 'custom' && (
                  <div className="ml-8 mt-2">
                    <input
                      type="text"
                      value={customCommand}
                      onChange={(e) => setCustomCommand(e.target.value)}
                      placeholder="e.g., nvim, neovide --multigrid, /path/to/editor"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Enter the command to open your editor. The project path will be appended.
                    </p>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveEditorSettings}
                disabled={isSavingEditor || (editorPreset === 'custom' && !customCommand.trim())}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingEditor ? 'Saving...' : 'Save Editor Preference'}
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
