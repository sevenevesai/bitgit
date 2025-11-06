import { useState } from 'react';
import { Project, SyncAction } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import toast from 'react-hot-toast';
import { LinkLocalModal } from './LinkLocalModal';
import { LinkGitHubModal } from './LinkGitHubModal';
import { CreateRepoModal } from './CreateRepoModal';
import { ProjectDetails } from './ProjectDetails';
import {
  GitBranch,
  GitCommit,
  CheckCircle,
  AlertCircle,
  Clock,
  Code,
  Upload,
  GitMerge,
  RefreshCw,
  FolderGit,
  Github,
  Link as LinkIcon,
  Download,
  Trash2,
  RotateCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  console.log('[ProjectCard] Rendering:', project.name, project);
  const { syncProject, toggleSelection, selectedProjectIds, deleteProject, updateProject, refreshProject } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLinkLocalModal, setShowLinkLocalModal] = useState(false);
  const [showLinkGitHubModal, setShowLinkGitHubModal] = useState(false);
  const [showCreateRepoModal, setShowCreateRepoModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const isSelected = selectedProjectIds.has(project.id);

  // Show details button only when both GitHub and Local are configured
  const canShowDetails = project.githubUrl && project.localPath;

  const handleRefreshStatus = async () => {
    console.log('[ProjectCard] handleRefreshStatus clicked for project:', project.id, project.name);
    console.log('[ProjectCard] Project details:', {
      id: project.id,
      name: project.name,
      githubUrl: project.githubUrl,
      localPath: project.localPath,
      status: project.projectStatus,
    });
    setIsRefreshing(true);
    try {
      console.log('[ProjectCard] Calling refreshProject from store...');
      await refreshProject(project.id);
      console.log('[ProjectCard] refreshProject completed successfully');
      toast.success('Status refreshed', { duration: 2000 });
    } catch (error: any) {
      console.error('[ProjectCard] refreshProject failed:', error);
      toast.error(`Failed to refresh: ${error}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSync = async (action: SyncAction) => {
    setIsLoading(true);
    try {
      await syncProject(project.id, action);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    // Show confirmation dialog BEFORE doing anything
    const confirmed = window.confirm(`Are you sure you want to delete project "${project.name}"?\n\nThis will only remove the project from BitGit. Your files and GitHub repository will not be affected.`);

    if (!confirmed) {
      return; // User cancelled, don't delete
    }

    // User confirmed, proceed with deletion
    try {
      await deleteProject(project.id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      // Error toast is already shown by the store
    }
  };

  const handleOpenVSCode = async () => {
    if (!project.localPath) {
      toast.error('No local path configured');
      return;
    }

    try {
      await invoke('open_in_vscode', { path: project.localPath });
      toast.success('Opening in VS Code...');
    } catch (error: any) {
      toast.error(`Failed to open VS Code: ${error}`);
    }
  };

  const handleCloneToLocal = async () => {
    if (!project.githubUrl) {
      toast.error('No GitHub URL configured');
      return;
    }

    try {
      // Open directory picker for clone destination
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select directory to clone repository into',
      });

      if (!selectedPath || typeof selectedPath !== 'string') {
        return; // User cancelled
      }

      setIsLoading(true);
      toast.loading('Cloning repository...', { id: 'clone' });

      // Clone repository - Tauri automatically converts camelCase to snake_case
      await invoke<Project>('clone_repository', {
        githubUrl: project.githubUrl,
        localPath: `${selectedPath}\\${project.name}`,
        projectId: project.id,
      });

      toast.success('Repository cloned successfully!', { id: 'clone' });

      // Refresh project in store
      await useAppStore.getState().refreshProject(project.id);
    } catch (error: any) {
      toast.error(`Failed to clone: ${error}`, { id: 'clone' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGitHubRepoClick = async () => {
    if (!project.localPath) {
      toast.error('No local path configured');
      return;
    }

    // Check for GitHub token before opening modal
    try {
      const credentials = await invoke<{ username: string; hasToken: boolean }>('get_stored_github_credentials');

      if (!credentials || !credentials.username) {
        toast.error('GitHub credentials not found. Please configure your GitHub token in Settings.');
        return;
      }

      // Actually try to retrieve the token (will throw if not found)
      try {
        await invoke<string>('get_github_token', { username: credentials.username });
      } catch (tokenError) {
        toast.error('GitHub token not found. Please configure in Settings.');
        return;
      }

      // Token is valid, show the modal
      setShowCreateRepoModal(true);
    } catch (error: any) {
      toast.error('Failed to verify GitHub credentials');
    }
  };

  const handleCreateGitHubRepo = async (isPrivate: boolean) => {
    setShowCreateRepoModal(false);

    try {
      // Get GitHub token
      const credentials = await invoke<{ username: string; hasToken: boolean }>('get_stored_github_credentials');
      const token = await invoke<string>('get_github_token', { username: credentials.username });

      setIsLoading(true);
      toast.loading('Creating GitHub repository...', { id: 'create-repo' });

      // Create GitHub repository - Tauri automatically converts camelCase to snake_case
      await invoke<Project>('create_github_repository', {
        projectId: project.id,
        repoName: project.name,
        isPrivate: isPrivate,
        token: token,
      });

      const visibility = isPrivate ? 'private' : 'public';
      toast.success(`GitHub repository created and pushed as ${visibility}!`, { id: 'create-repo' });

      // Refresh project in store
      await useAppStore.getState().refreshProject(project.id);
    } catch (error: any) {
      const errorMsg = String(error);

      // Check if repository already exists on GitHub
      if (errorMsg.includes('name already exists on this account')) {
        toast.error(
          `Repository "${project.name}" already exists on GitHub.\n\nOptions:\n1. Delete it from GitHub and try again\n2. Use "Link Existing GitHub" to connect to the existing repo`,
          { id: 'create-repo', duration: 8000 }
        );
      } else {
        toast.error(`Failed to create repository: ${error}`, { id: 'create-repo' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkLocal = async (localPath: string) => {
    toast.loading('Linking local directory...', { id: 'link-local' });
    try {
      // Update project with local path
      const updatedProject: Project = {
        ...project,
        localPath: localPath,
        projectStatus: project.githubUrl ? 'ready' : 'local_only',
      };

      await updateProject(updatedProject);
      toast.success('Local directory linked successfully!', { id: 'link-local' });

      // Refresh to update status
      await refreshProject(project.id);
    } catch (error: any) {
      toast.error(`Failed to link local directory: ${error}`, { id: 'link-local' });
      throw error;
    }
  };

  const handleLinkGitHub = async (githubUrl: string, owner: string, repo: string) => {
    toast.loading('Linking GitHub repository...', { id: 'link-github' });
    try {
      // Update project with GitHub info
      const updatedProject: Project = {
        ...project,
        githubUrl: githubUrl,
        githubOwner: owner,
        githubRepo: repo,
        projectStatus: project.localPath ? 'ready' : 'github_only',
      };

      await updateProject(updatedProject);
      toast.success('GitHub repository linked successfully!', { id: 'link-github' });

      // Refresh to update status
      await refreshProject(project.id);
    } catch (error: any) {
      toast.error(`Failed to link GitHub repository: ${error}`, { id: 'link-github' });
      throw error;
    }
  };

  // Determine status color based on project status
  const getStatusColor = () => {
    switch (project.projectStatus) {
      case 'synced':
        return 'border-green-500';
      case 'needs_push':
        return 'border-yellow-500';
      case 'needs_merge':
        return 'border-orange-500';
      case 'needs_sync':
        return 'border-red-500';
      case 'ready':
        return 'border-blue-500';
      case 'github_only':
        return 'border-purple-500';
      case 'local_only':
        return 'border-indigo-500';
      case 'not_configured':
        return 'border-gray-300';
      default:
        return 'border-gray-300';
    }
  };

  const getStatusIcon = () => {
    switch (project.projectStatus) {
      case 'synced':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'needs_push':
      case 'needs_merge':
      case 'needs_sync':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'ready':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'github_only':
        return <Github className="w-5 h-5 text-purple-600" />;
      case 'local_only':
        return <FolderGit className="w-5 h-5 text-indigo-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (project.projectStatus) {
      case 'synced':
        return 'Synced';
      case 'needs_push':
        return 'Needs Push';
      case 'needs_merge':
        return 'Needs Merge';
      case 'needs_sync':
        return 'Needs Sync';
      case 'ready':
        return 'Ready';
      case 'github_only':
        return 'GitHub Only';
      case 'local_only':
        return 'Local Only';
      case 'not_configured':
        return 'Not Configured';
      default:
        return 'Unknown';
    }
  };

  // Render different action buttons based on project status
  const renderActions = () => {
    switch (project.projectStatus) {
      case 'not_configured':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => setShowLinkGitHubModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-white bg-purple-600 dark:bg-purple-700 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
              title="Link to GitHub repository"
            >
              <Github className="w-4 h-4" />
              Link GitHub
            </button>
            <button
              onClick={() => setShowLinkLocalModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 dark:bg-indigo-700 rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
              title="Link to local directory"
            >
              <FolderGit className="w-4 h-4" />
              Link Local
            </button>
          </div>
        );

      case 'github_only':
        return (
          <div className="flex gap-2">
            <button
              onClick={handleCloneToLocal}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clone repository to local directory"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Clone to Local
            </button>
            <button
              onClick={() => setShowLinkLocalModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Link to existing local directory"
            >
              <LinkIcon className="w-4 h-4" />
              Link Existing Local
            </button>
          </div>
        );

      case 'local_only':
        return (
          <div className="flex gap-2">
            <button
              onClick={handleCreateGitHubRepoClick}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Create GitHub repository and push"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Create GitHub Repo
            </button>
            <button
              onClick={() => setShowLinkGitHubModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Link to existing GitHub repository"
            >
              <LinkIcon className="w-4 h-4" />
              Link Existing GitHub
            </button>
          </div>
        );

      case 'ready':
      case 'synced':
      case 'needs_push':
      case 'needs_merge':
      case 'needs_sync':
        // Show Git sync actions
        const hasLocalChanges = project.gitStatus && (project.gitStatus.uncommittedFiles > 0 || project.gitStatus.unpushedCommits > 0);
        const hasRemoteBranches = project.gitStatus && project.gitStatus.remoteBranches.length > 0;

        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleSync({ type: 'push_local' })}
              disabled={!hasLocalChanges || isLoading}
              className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Commit and push local changes"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Push Local
            </button>

            <button
              onClick={() => handleSync({ type: 'pull_branches', branches: project.gitStatus?.remoteBranches || [] })}
              disabled={!hasRemoteBranches || isLoading}
              className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Pull branch updates without deleting (for iterative work)"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Pull Updates
            </button>

            <button
              onClick={() => handleSync({ type: 'merge_branches', branches: project.gitStatus?.remoteBranches || [] })}
              disabled={!hasRemoteBranches || isLoading}
              className="flex items-center gap-2 px-4 py-2 text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Merge and delete remote branches (final cleanup)"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <GitMerge className="w-4 h-4" />
              )}
              Merge & Delete
            </button>

            <button
              onClick={() => handleSync({ type: 'full_sync' })}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Full sync: push local + merge remote"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Full Sync
            </button>

            <button
              onClick={handleOpenVSCode}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Open in VS Code"
            >
              <Code className="w-4 h-4" />
            </button>

            {canShowDetails && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="Show advanced Git features"
              >
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Details
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 ${getStatusColor()} p-6 transition-all hover:shadow-md dark:hover:shadow-lg`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelection(project.id)}
            className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
          />
          {getStatusIcon()}
          <div>
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{project.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{getStatusText()}</p>
          </div>
          {/* Refresh button - only show if both GitHub and Local are configured */}
          {project.githubUrl && project.localPath && (
            <button
              onClick={handleRefreshStatus}
              disabled={isRefreshing}
              className="ml-2 p-1.5 text-gray-400 dark:text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh status"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          title="Delete project"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Project Info */}
      <div className="space-y-2 mb-4 text-sm">
        {project.githubUrl && (
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Github className="w-4 h-4" />
            <span className="font-medium">GitHub:</span>
            <span className="text-gray-600 dark:text-gray-400">{project.githubOwner}/{project.githubRepo}</span>
          </div>
        )}
        {project.localPath && (
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <FolderGit className="w-4 h-4" />
            <span className="font-medium">Local:</span>
            <span className="text-gray-600 dark:text-gray-400 truncate">{project.localPath}</span>
          </div>
        )}

        {/* Git Status Details (if available) */}
        {project.gitStatus && (
          <>
            {project.gitStatus.uncommittedFiles > 0 && (
              <div className="flex items-center gap-2 text-yellow-600">
                <GitCommit className="w-4 h-4" />
                <span>{project.gitStatus.uncommittedFiles} uncommitted file(s)</span>
              </div>
            )}
            {project.gitStatus.remoteBranches.length > 0 && (
              <div className="flex items-center gap-2 text-orange-600">
                <GitBranch className="w-4 h-4" />
                <span>{project.gitStatus.remoteBranches.length} remote branch(es): {project.gitStatus.remoteBranches.join(', ')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      {renderActions()}

      {/* Expandable Details Panel */}
      {showDetails && canShowDetails && (
        <ProjectDetails project={project} onClose={() => setShowDetails(false)} />
      )}

      {/* Modals */}
      <LinkLocalModal
        isOpen={showLinkLocalModal}
        onClose={() => setShowLinkLocalModal(false)}
        onLink={handleLinkLocal}
        projectName={project.name}
      />
      <LinkGitHubModal
        isOpen={showLinkGitHubModal}
        onClose={() => setShowLinkGitHubModal(false)}
        onLink={handleLinkGitHub}
        projectName={project.name}
      />
      <CreateRepoModal
        isOpen={showCreateRepoModal}
        onClose={() => setShowCreateRepoModal(false)}
        onCreate={handleCreateGitHubRepo}
        projectName={project.name}
      />
    </div>
  );
}

// Export as RepositoryCard for backward compatibility
export { ProjectCard as RepositoryCard };
