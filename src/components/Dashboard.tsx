import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { ProjectCard } from './ProjectCard';
import { SettingsModal } from './SettingsModal';
import { AddProjectModal } from './AddProjectModal';
import { Plus, RefreshCw, Settings, Sun, Moon, CheckSquare, Square, Upload, Search, Filter } from 'lucide-react';

export function Dashboard() {
  console.log('[Dashboard] Rendering...');
  const { projects, isLoading, loadProjects, selectedProjectIds, settings, toggleTheme, selectAll, clearSelection, syncSelected } = useAppStore();
  console.log('[Dashboard] State:', { projects, isLoading, projectCount: projects?.length });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const ThemeIcon = settings.ui.theme === 'dark' ? Moon : Sun;
  const hasSelection = selectedProjectIds.size > 0;

  // Filter projects based on search and status
  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.localPath?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (project.githubOwner && project.githubOwner.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (project.githubRepo && project.githubRepo.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || project.projectStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    console.log('[Dashboard] Loading projects on mount...');
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load once on mount

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Ctrl+R: Refresh
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        loadProjects();
        return;
      }

      // Ctrl+N: New Project
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setIsAddProjectOpen(true);
        return;
      }

      // Ctrl+F: Focus search (only if not already in an input)
      if (e.ctrlKey && e.key === 'f' && !isInputField) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
        return;
      }

      // Ctrl+A: Select All (only if not in an input field)
      if (e.ctrlKey && e.key === 'a' && !isInputField && projects.length > 0) {
        e.preventDefault();
        selectAll();
        return;
      }

      // Escape: Clear selection
      if (e.key === 'Escape' && hasSelection) {
        clearSelection();
        return;
      }

      // Ctrl+D: Toggle theme (dark mode)
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        toggleTheme();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadProjects, projects.length, hasSelection, selectAll, clearSelection, toggleTheme]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="container mx-auto px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">BitGit</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading projects...
                </p>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-8 py-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 border-gray-300 dark:border-gray-600 p-6 animate-pulse"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded"></div>
                  <div className="flex-1">
                    <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-48 mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">BitGit</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {filteredProjects.length} of {projects.length} projects
                {selectedProjectIds.size > 0 && ` • ${selectedProjectIds.size} selected`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title={`Theme: ${settings.ui.theme} (Ctrl+D to toggle)`}
              >
                <ThemeIcon className="w-4 h-4" />
              </button>

              <button
                onClick={() => loadProjects()}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="Refresh projects (Ctrl+R)"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>

              <button
                onClick={() => setIsAddProjectOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 dark:bg-teal-700 rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 transition-colors"
                title="Add new project (Ctrl+N)"
              >
                <Plus className="w-4 h-4" />
                Add Project
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Search and Filter Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-16 z-10">
        <div className="container mx-auto px-8 py-4">
          <div className="flex gap-4">
            {/* Search Box */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search projects by name, path, or repository... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none cursor-pointer min-w-[180px]"
              >
                <option value="all">All Status</option>
                <option value="synced">Synced</option>
                <option value="needs_push">Needs Push</option>
                <option value="needs_merge">Needs Merge</option>
                <option value="needs_sync">Needs Sync</option>
                <option value="ready">Ready</option>
                <option value="github_only">GitHub Only</option>
                <option value="local_only">Local Only</option>
                <option value="not_configured">Not Configured</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Batch Operations Toolbar */}
      {hasSelection && (
        <div className="bg-teal-50 dark:bg-teal-900/20 border-b border-teal-200 dark:border-teal-800 sticky top-[136px] z-10">
          <div className="container mx-auto px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-teal-900 dark:text-teal-100">
                  {selectedProjectIds.size} project{selectedProjectIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm px-3 py-1.5 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded transition-colors"
                    title="Select all projects (Ctrl+A)"
                  >
                    <CheckSquare className="w-4 h-4 inline mr-1" />
                    Select All
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-sm px-3 py-1.5 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded transition-colors"
                    title="Clear selection (Esc)"
                  >
                    <Square className="w-4 h-4 inline mr-1" />
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => syncSelected({ type: 'push_local' })}
                  className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 dark:bg-teal-700 rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Push Local
                </button>
                <button
                  onClick={() => syncSelected({ type: 'full_sync' })}
                  className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 dark:bg-blue-700 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Bulk Full Sync
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-8 py-8">
        {projects.length === 0 ? (
          <EmptyState onAddProject={() => setIsAddProjectOpen(true)} />
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="max-w-md mx-auto">
              <Search className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No Projects Found
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                No projects match your search or filter criteria. Try adjusting your filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="px-6 py-3 text-white bg-teal-600 dark:bg-teal-700 rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onRepositoriesAdded={loadProjects}
      />

      <AddProjectModal
        isOpen={isAddProjectOpen}
        onClose={() => setIsAddProjectOpen(false)}
      />
    </div>
  );
}

interface EmptyStateProps {
  onAddProject: () => void;
}

function EmptyState({ onAddProject }: EmptyStateProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <Plus className="w-8 h-8 text-teal-600 dark:text-teal-400" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          No Projects Yet
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Get started by creating your first project. You can link it to a GitHub repository
          and/or a local directory, or configure those details later.
        </p>

        <button
          onClick={onAddProject}
          className="px-6 py-3 text-white bg-teal-600 dark:bg-teal-700 rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 transition-colors inline-flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Your First Project
        </button>
      </div>
    </div>
  );
}
