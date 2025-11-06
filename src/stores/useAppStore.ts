import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import { Project, SyncAction, SyncResult, AppSettings } from '../types';

interface AppState {
  // State
  projects: Project[];
  settings: AppSettings;
  isLoading: boolean;
  selectedProjectIds: Set<string>;

  // Project actions
  loadProjects: () => Promise<void>;
  createProject: (name: string, githubOwner?: string, githubRepo?: string, githubUrl?: string, localPath?: string) => Promise<Project>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProject: (id: string) => Promise<void>;
  syncProject: (id: string, action: SyncAction) => Promise<void>;

  // Legacy aliases for compatibility
  repositories: Project[];
  loadRepositories: () => Promise<void>;
  syncRepository: (id: string, action: SyncAction) => Promise<void>;
  removeRepository: (id: string) => void;

  // Selection actions
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Settings actions
  updateSettings: (settings: Partial<AppSettings>) => void;
  saveGitHubToken: (username: string, token: string) => Promise<void>;
  toggleTheme: () => void;

  // Batch operations
  syncSelected: (action: SyncAction) => Promise<void>;
}

const defaultSettings: AppSettings = {
  github: {
    username: '',
    hasToken: false,
  },
  scanning: {
    directories: [],
    depth: 3,
    excludePatterns: ['node_modules', '.git', 'target', 'dist', 'build'],
  },
  ui: {
    theme: 'system',
    refreshInterval: 0,
    showNotifications: true,
  },
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  projects: [],
  settings: defaultSettings,
  isLoading: false,
  selectedProjectIds: new Set(),

  // Load projects from cache
  loadProjects: async () => {
    console.log('[Store] loadProjects called');
    set({ isLoading: true });
    try {
      console.log('[Store] Invoking load_projects...');
      const projects = await invoke<Project[]>('load_projects');
      console.log('[Store] Received projects:', projects);
      set({ projects, isLoading: false });
      console.log('[Store] State updated successfully');
    } catch (error) {
      console.error('[Store] Failed to load projects:', error);
      toast.error('Failed to load projects');
      set({ isLoading: false });
    }
  },

  // Create a new project
  createProject: async (name: string, githubOwner?: string, githubRepo?: string, githubUrl?: string, localPath?: string) => {
    try {
      const project = await invoke<Project>('create_project', {
        name,
        githubOwner: githubOwner || null,
        githubRepo: githubRepo || null,
        githubUrl: githubUrl || null,
        localPath: localPath || null,
      });

      set((state) => ({
        projects: [...state.projects, project],
      }));

      toast.success(`Project "${name}" created`);
      return project;
    } catch (error: any) {
      console.error('Failed to create project:', error);
      toast.error(`Failed to create project: ${error}`);
      throw error;
    }
  },

  // Update an existing project
  updateProject: async (project: Project) => {
    try {
      const updated = await invoke<Project>('update_project', { project });

      set((state) => ({
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      }));

      toast.success(`Project "${project.name}" updated`);
    } catch (error: any) {
      console.error('Failed to update project:', error);
      toast.error(`Failed to update project: ${error}`);
      throw error;
    }
  },

  // Delete a project
  deleteProject: async (id: string) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    try {
      await invoke('delete_project', { projectId: id });

      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectIds: new Set([...state.selectedProjectIds].filter((sid) => sid !== id)),
      }));

      toast.success(`Project "${project.name}" deleted`);
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      toast.error(`Failed to delete project: ${error}`);
      throw error;
    }
  },

  // Refresh a single project status
  refreshProject: async (id: string) => {
    console.log('[Store] refreshProject called with id:', id);
    try {
      const project = get().projects.find((p) => p.id === id);
      console.log('[Store] Found project:', project ? project.name : 'NOT FOUND');

      if (!project) {
        console.error('[Store] Project not found in store for id:', id);
        return;
      }

      // Only refresh if both GitHub and Local are configured
      if (!project.githubUrl || !project.localPath) {
        console.log('[Store] Project not fully configured, skipping status check', {
          githubUrl: project.githubUrl,
          localPath: project.localPath,
        });
        return;
      }

      console.log('[Store] Invoking check_project_status for:', project.name, { projectId: id });
      const updated = await invoke<Project>('check_project_status', { projectId: id });
      console.log('[Store] Received updated project:', {
        name: updated.name,
        status: updated.projectStatus,
        gitStatus: updated.gitStatus,
      });

      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
      }));
      console.log('[Store] State updated with new project data');
    } catch (error) {
      console.error('[Store] Failed to refresh project:', error);
      toast.error('Failed to refresh project status');
    }
  },

  // Sync a project with given action
  syncProject: async (id: string, action: SyncAction) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    const actionName = action.type.replace('_', ' ');
    const loadingToast = toast.loading(`${actionName} in progress...`);

    try {
      const result = await invoke<SyncResult>('sync_project', { projectId: id, action });

      if (result.success) {
        toast.success(`${actionName} completed successfully`, { id: loadingToast });

        // Refresh the project status
        await get().refreshProject(id);
      } else {
        toast.error(`${actionName} failed: ${result.message}`, { id: loadingToast });
      }
    } catch (error: any) {
      console.error('Sync failed:', error);
      toast.error(`${actionName} failed: ${error}`, { id: loadingToast });
    }
  },

  // Legacy aliases for compatibility
  get repositories() {
    return get().projects;
  },
  loadRepositories: () => get().loadProjects(),
  syncRepository: (id: string, action: SyncAction) => get().syncProject(id, action),
  removeRepository: (id: string) => get().deleteProject(id),

  // Selection management
  toggleSelection: (id: string) => {
    set((state) => {
      const newSelection = new Set(state.selectedProjectIds);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return { selectedProjectIds: newSelection };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedProjectIds: new Set(state.projects.map((p) => p.id)),
    }));
  },

  clearSelection: () => {
    set({ selectedProjectIds: new Set() });
  },

  // Update settings
  updateSettings: (newSettings: Partial<AppSettings>) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },

  // Toggle theme (simple 2-state: light <-> dark)
  toggleTheme: () => {
    set((state) => {
      const currentTheme = state.settings.ui.theme;
      // Simple toggle between light and dark only
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

      // Apply theme to document
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      return {
        settings: {
          ...state.settings,
          ui: { ...state.settings.ui, theme: newTheme },
        },
      };
    });
  },

  // Save GitHub token securely
  saveGitHubToken: async (username: string, token: string) => {
    try {
      await invoke('save_github_token', { username, token });
      set((state) => ({
        settings: {
          ...state.settings,
          github: { username, hasToken: true },
        },
      }));
      toast.success('GitHub token saved securely');
    } catch (error) {
      console.error('Failed to save token:', error);
      toast.error('Failed to save GitHub token');
      throw error;
    }
  },

  // Batch sync selected projects
  syncSelected: async (action: SyncAction) => {
    const selectedIds = Array.from(get().selectedProjectIds);
    if (selectedIds.length === 0) {
      toast.error('No projects selected');
      return;
    }

    const loadingToastId = toast.loading(`Starting batch sync of ${selectedIds.length} projects...`);

    let completed = 0;
    const results = await Promise.allSettled(
      selectedIds.map(async (id) => {
        const result = await get().syncProject(id, action);
        completed++;
        toast.loading(`Syncing projects... (${completed}/${selectedIds.length})`, { id: loadingToastId });
        return result;
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    if (failed === 0) {
      toast.success(`Successfully synced all ${successful} projects!`, { id: loadingToastId });
    } else if (successful === 0) {
      toast.error(`All ${failed} projects failed to sync`, { id: loadingToastId });
    } else {
      toast.error(`Synced ${successful} of ${selectedIds.length} projects (${failed} failed)`, { id: loadingToastId });
    }
  },
}));
