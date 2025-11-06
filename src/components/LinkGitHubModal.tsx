import { useState, useEffect } from 'react';
import { X, Github, Search, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';

interface GitHubRepo {
  name: string;
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
}

interface LinkGitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (githubUrl: string, owner: string, repo: string) => Promise<void>;
  projectName: string;
}

export function LinkGitHubModal({ isOpen, onClose, onLink, projectName }: LinkGitHubModalProps) {
  const [mode, setMode] = useState<'select' | 'manual'>('select');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    if (isOpen && mode === 'select' && repos.length === 0) {
      loadGitHubRepos();
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredRepos(repos);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredRepos(
        repos.filter(
          (repo) =>
            repo.name.toLowerCase().includes(query) ||
            repo.fullName.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, repos]);

  const loadGitHubRepos = async () => {
    setIsLoadingRepos(true);
    try {
      // Get stored GitHub credentials
      const credentials = await invoke<{ username: string; hasToken: boolean }>('get_stored_github_credentials');

      if (!credentials || !credentials.username) {
        toast.error('GitHub credentials not found. Please configure in Settings.');
        return;
      }

      // Get token
      const token = await invoke<string>('get_github_token', { username: credentials.username });

      // Fetch repos
      const fetchedRepos = await invoke<GitHubRepo[]>('fetch_github_repos', { token });
      setRepos(fetchedRepos);
      setFilteredRepos(fetchedRepos);
    } catch (error: any) {
      toast.error(`Failed to load repositories: ${error}`);
      setMode('manual'); // Fall back to manual mode
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    // Parse URLs like:
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const patterns = [
      /github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/,
      /github\.com\/([^/]+)\/([^/]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2].replace('.git', '') };
      }
    }

    return null;
  };

  const handleLink = async () => {
    let githubUrl: string;
    let owner: string;
    let repo: string;

    if (mode === 'select') {
      if (!selectedRepo) {
        toast.error('Please select a repository');
        return;
      }
      githubUrl = selectedRepo.cloneUrl;
      owner = selectedRepo.owner;
      repo = selectedRepo.name;
    } else {
      if (!manualUrl.trim()) {
        toast.error('Please enter a GitHub URL');
        return;
      }

      const parsed = parseGitHubUrl(manualUrl);
      if (!parsed) {
        toast.error('Invalid GitHub URL format');
        return;
      }

      githubUrl = manualUrl.includes('.git') ? manualUrl : `${manualUrl}.git`;
      owner = parsed.owner;
      repo = parsed.repo;
    }

    setIsLinking(true);
    try {
      await onLink(githubUrl, owner, repo);
      onClose();
      resetState();
    } catch (error: any) {
      toast.error(`Failed to link: ${error}`);
    } finally {
      setIsLinking(false);
    }
  };

  const resetState = () => {
    setSelectedRepo(null);
    setManualUrl('');
    setSearchQuery('');
  };

  const handleClose = () => {
    if (!isLinking) {
      resetState();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Link GitHub Repository</h2>
          <button
            onClick={handleClose}
            disabled={isLinking}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="p-6 border-b">
          <p className="text-gray-600 mb-4">
            Link project <span className="font-semibold">{projectName}</span> to an existing GitHub repository.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('select')}
              disabled={isLinking}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'select'
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Select from List
            </button>
            <button
              onClick={() => setMode('manual')}
              disabled={isLinking}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'manual'
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Enter URL Manually
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'select' ? (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search repositories..."
                  disabled={isLoadingRepos || isLinking}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Repository List */}
              {isLoadingRepos ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                  <span className="ml-3 text-gray-600">Loading repositories...</span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {repos.length === 0 ? 'No repositories found' : 'No matching repositories'}
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredRepos.map((repo) => (
                    <button
                      key={`${repo.owner}-${repo.name}-${repo.fullName}`}
                      onClick={() => setSelectedRepo(repo)}
                      disabled={isLinking}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        selectedRepo?.fullName === repo.fullName
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Github className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <p className="font-medium text-gray-900 truncate">{repo.name}</p>
                            {repo.isPrivate && (
                              <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                                Private
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{repo.fullName}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GitHub Repository URL
                </label>
                <input
                  type="text"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  disabled={isLinking}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Enter the full GitHub repository URL (e.g., https://github.com/username/repo)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            disabled={isLinking}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={
              isLinking ||
              (mode === 'select' && !selectedRepo) ||
              (mode === 'manual' && !manualUrl.trim())
            }
            className="px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLinking ? 'Linking...' : 'Link Repository'}
          </button>
        </div>
      </div>
    </div>
  );
}
