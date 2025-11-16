import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import {
  Project,
  SyncAction,
  SyncResult,
  AppSettings,
  QueuedOperation,
  RetryConfig,
  AnalyticsData,
  DashboardOverview,
  ActivityEntry,
  ActivityTimeline,
  HealthIndicator,
  ContributionHeatmap
} from '../types';

interface AppState {
  // State
  projects: Project[];
  settings: AppSettings;
  isLoading: boolean;
  selectedProjectIds: Set<string>;

  // Priority 6: Performance & Reliability State
  operationQueue: QueuedOperation[];
  backgroundCheckInterval: number | null;

  // Priority 1: Analytics State
  analytics: AnalyticsData | null;
  isLoadingAnalytics: boolean;

  // Project actions
  loadProjects: () => Promise<void>;
  createProject: (name: string, githubOwner?: string, githubRepo?: string, githubUrl?: string, localPath?: string) => Promise<Project>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProject: (id: string) => Promise<void>;
  syncProject: (id: string, action: SyncAction, retry?: RetryConfig) => Promise<void>;

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

  // Priority 6: Performance & Reliability Actions
  startBackgroundChecking: () => void;
  stopBackgroundChecking: () => void;
  refreshAllProjects: () => Promise<void>;
  queueOperation: (projectId: string, action: SyncAction) => void;
  cancelOperation: (operationId: string) => void;
  retryOperation: (operationId: string) => Promise<void>;
  clearCompletedOperations: () => void;
  syncSelectedParallel: (action: SyncAction, maxConcurrent?: number) => Promise<void>;

  // Priority 1: Analytics Actions
  loadAnalytics: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
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
    refreshInterval: 5 * 60 * 1000, // 5 minutes default
    showNotifications: true,
  },
};

// Helper function for retry with exponential backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  config: RetryConfig = { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
): Promise<T> => {
  let lastError: any;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < config.maxAttempts) {
        const delayTime = config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        console.log(`Attempt ${attempt} failed, retrying in ${delayTime}ms...`);
        await delay(delayTime);
      }
    }
  }

  throw lastError;
};

// Helper function for parallel execution with concurrency limit
const parallelLimit = async <T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<any>
): Promise<PromiseSettledResult<any>[]> => {
  const results: PromiseSettledResult<any>[] = [];
  const executing: Promise<any>[] = [];

  for (const item of items) {
    const promise = fn(item).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason) => ({ status: 'rejected' as const, reason })
    );

    results.push(promise as any);
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => results.includes(p as any)), 1);
    }
  }

  return Promise.all(results);
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  projects: [],
  settings: defaultSettings,
  isLoading: false,
  selectedProjectIds: new Set(),
  operationQueue: [],
  backgroundCheckInterval: null,
  analytics: null,
  isLoadingAnalytics: false,

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

  // Sync a project with given action (with optional retry)
  syncProject: async (id: string, action: SyncAction, retryConfig?: RetryConfig) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    const actionName = action.type.replace('_', ' ');
    const loadingToast = toast.loading(`${actionName} in progress...`);

    const executSync = async () => {
      const result = await invoke<SyncResult>('sync_project', { projectId: id, action });
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    };

    try {
      await (retryConfig
        ? retryWithBackoff(executSync, retryConfig)
        : executSync());

      toast.success(`${actionName} completed successfully`, { id: loadingToast });

      // Refresh the project status
      await get().refreshProject(id);
    } catch (error: any) {
      console.error('Sync failed:', error);
      toast.error(`${actionName} failed: ${error.message || error}`, { id: loadingToast });
      throw error;
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

      // Determine actual current theme (resolve 'system' to actual preference)
      let actualCurrentTheme = currentTheme;
      if (currentTheme === 'system') {
        actualCurrentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      // Toggle to opposite theme
      const newTheme = actualCurrentTheme === 'dark' ? 'light' : 'dark';

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

  // Batch sync selected projects (sequential)
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

  // ===== Priority 6: Performance & Reliability =====

  // Start background status checking
  startBackgroundChecking: () => {
    const interval = get().settings.ui.refreshInterval;
    if (interval <= 0) return;

    // Clear existing interval if any
    get().stopBackgroundChecking();

    const intervalId = window.setInterval(() => {
      console.log('[Background] Running scheduled status check...');
      get().refreshAllProjects();
    }, interval);

    set({ backgroundCheckInterval: intervalId });
    console.log(`[Background] Status checking started (every ${interval / 1000}s)`);
  },

  // Stop background status checking
  stopBackgroundChecking: () => {
    const intervalId = get().backgroundCheckInterval;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      set({ backgroundCheckInterval: null });
      console.log('[Background] Status checking stopped');
    }
  },

  // Refresh all projects in parallel
  refreshAllProjects: async () => {
    const projects = get().projects.filter(p => p.githubUrl && p.localPath);
    if (projects.length === 0) return;

    console.log(`[Background] Refreshing ${projects.length} projects...`);

    const results = await parallelLimit(
      projects,
      5, // Max 5 concurrent refreshes
      async (project) => {
        try {
          await get().refreshProject(project.id);
        } catch (error) {
          console.error(`[Background] Failed to refresh ${project.name}:`, error);
        }
      }
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[Background] Refreshed ${successful}/${projects.length} projects`);
  },

  // Sync selected projects in parallel with concurrency limit
  syncSelectedParallel: async (action: SyncAction, maxConcurrent = 3) => {
    const selectedIds = Array.from(get().selectedProjectIds);
    if (selectedIds.length === 0) {
      toast.error('No projects selected');
      return;
    }

    const loadingToastId = toast.loading(`Starting parallel sync of ${selectedIds.length} projects...`);

    let completed = 0;
    const results = await parallelLimit(
      selectedIds,
      maxConcurrent,
      async (id) => {
        try {
          await get().syncProject(id, action, { maxAttempts: 2, delayMs: 1000, backoffMultiplier: 2 });
          completed++;
          toast.loading(`Syncing projects... (${completed}/${selectedIds.length})`, { id: loadingToastId });
        } catch (error) {
          console.error(`Failed to sync project ${id}:`, error);
          throw error;
        }
      }
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    if (failed === 0) {
      toast.success(`Successfully synced all ${successful} projects in parallel!`, { id: loadingToastId });
    } else if (successful === 0) {
      toast.error(`All ${failed} projects failed to sync`, { id: loadingToastId });
    } else {
      toast.error(`Synced ${successful} of ${selectedIds.length} projects (${failed} failed)`, { id: loadingToastId });
    }
  },

  // Queue an operation
  queueOperation: (projectId: string, action: SyncAction) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const operation: QueuedOperation = {
      id: `${Date.now()}-${Math.random()}`,
      projectId,
      projectName: project.name,
      action,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
    };

    set((state) => ({
      operationQueue: [...state.operationQueue, operation],
    }));

    toast.success(`Operation queued for ${project.name}`);
  },

  // Cancel an operation
  cancelOperation: (operationId: string) => {
    set((state) => ({
      operationQueue: state.operationQueue.map(op =>
        op.id === operationId && op.status === 'pending'
          ? { ...op, status: 'cancelled' as const }
          : op
      ),
    }));
    toast('Operation cancelled');
  },

  // Retry a failed operation
  retryOperation: async (operationId: string) => {
    const operation = get().operationQueue.find(op => op.id === operationId);
    if (!operation || operation.status !== 'failed') return;

    // Update operation status to pending
    set((state) => ({
      operationQueue: state.operationQueue.map(op =>
        op.id === operationId
          ? { ...op, status: 'pending' as const, error: undefined }
          : op
      ),
    }));

    // Execute the operation
    try {
      set((state) => ({
        operationQueue: state.operationQueue.map(op =>
          op.id === operationId
            ? { ...op, status: 'running' as const, startedAt: new Date().toISOString(), attempts: op.attempts + 1 }
            : op
        ),
      }));

      await get().syncProject(operation.projectId, operation.action);

      set((state) => ({
        operationQueue: state.operationQueue.map(op =>
          op.id === operationId
            ? { ...op, status: 'completed' as const, completedAt: new Date().toISOString() }
            : op
        ),
      }));

      toast.success(`Retry successful for ${operation.projectName}`);
    } catch (error: any) {
      set((state) => ({
        operationQueue: state.operationQueue.map(op =>
          op.id === operationId
            ? { ...op, status: 'failed' as const, error: error.message || String(error) }
            : op
        ),
      }));

      toast.error(`Retry failed for ${operation.projectName}`);
    }
  },

  // Clear completed operations
  clearCompletedOperations: () => {
    set((state) => ({
      operationQueue: state.operationQueue.filter(
        op => op.status !== 'completed' && op.status !== 'cancelled'
      ),
    }));
  },

  // ===== Priority 1: Analytics =====

  // Load analytics data progressively - each section updates as it loads
  loadAnalytics: async () => {
    set({ isLoadingAnalytics: true });
    const timestamp = new Date().toISOString();

    // Initialize empty analytics structure
    const emptyAnalytics: AnalyticsData = {
      overview: null as any,
      timeline: {
        entries: [],
        dateRange: { start: timestamp, end: timestamp },
        totalCommits: 0,
        totalProjects: 0
      },
      health: [],
      heatmap: null as any,
      lastUpdated: timestamp,
      generatedAt: timestamp,
    };
    set({ analytics: emptyAnalytics });

    try {
      console.log('[Store] Loading analytics sections progressively...');

      // Start all sections in parallel, but update state as each completes
      const overviewPromise = invoke<DashboardOverview>('generate_analytics_overview').then(overview => {
        console.log('[Store] Overview loaded');
        set((state) => ({
          analytics: {
            ...(state.analytics || emptyAnalytics),
            overview,
            lastUpdated: timestamp,
          }
        }));
        return overview;
      });

      const timelinePromise = invoke<ActivityEntry[]>('generate_analytics_timeline').then(timelineEntries => {
        console.log('[Store] Timeline loaded:', timelineEntries.length, 'entries');
        const timeline: ActivityTimeline = {
          entries: timelineEntries,
          dateRange: { start: timestamp, end: timestamp },
          totalCommits: timelineEntries.length,
          totalProjects: new Set(timelineEntries.map(e => e.projectId)).size
        };
        set((state) => ({
          analytics: {
            ...(state.analytics || emptyAnalytics),
            timeline,
            lastUpdated: timestamp,
          }
        }));
        return timeline;
      });

      const healthPromise = invoke<HealthIndicator[]>('generate_analytics_health').then(health => {
        console.log('[Store] Health loaded:', health.length, 'indicators');
        set((state) => ({
          analytics: {
            ...(state.analytics || emptyAnalytics),
            health,
            lastUpdated: timestamp,
          }
        }));
        return health;
      });

      const heatmapPromise = invoke<ContributionHeatmap>('generate_analytics_heatmap').then(heatmap => {
        console.log('[Store] Heatmap loaded');
        set((state) => ({
          analytics: {
            ...(state.analytics || emptyAnalytics),
            heatmap,
            lastUpdated: timestamp,
          }
        }));
        return heatmap;
      });

      // Wait for all to complete
      await Promise.all([overviewPromise, timelinePromise, healthPromise, heatmapPromise]);

      console.log('[Store] All analytics sections loaded');
      set({ isLoadingAnalytics: false });
    } catch (error) {
      console.error('[Store] Failed to load analytics:', error);
      toast.error('Failed to load analytics');
      set({ isLoadingAnalytics: false });
    }
  },

  // Refresh analytics (same as load, but with user feedback)
  refreshAnalytics: async () => {
    const loadingToast = toast.loading('Refreshing analytics...');
    set({ isLoadingAnalytics: true });
    try {
      const [overview, timelineEntries, health, heatmap] = await Promise.all([
        invoke<DashboardOverview>('generate_analytics_overview'),
        invoke<ActivityEntry[]>('generate_analytics_timeline'),
        invoke<HealthIndicator[]>('generate_analytics_health'),
        invoke<ContributionHeatmap>('generate_analytics_heatmap'),
      ]);

      const timestamp = new Date().toISOString();
      const timeline: ActivityTimeline = {
        entries: timelineEntries,
        dateRange: { start: timestamp, end: timestamp },
        totalCommits: timelineEntries.length,
        totalProjects: new Set(timelineEntries.map(e => e.projectId)).size
      };

      const analytics: AnalyticsData = {
        overview,
        timeline,
        health,
        heatmap,
        lastUpdated: timestamp,
        generatedAt: timestamp,
      };

      set({ analytics, isLoadingAnalytics: false });
      toast.success('Analytics refreshed', { id: loadingToast });
    } catch (error) {
      console.error('[Store] Failed to refresh analytics:', error);
      toast.error('Failed to refresh analytics', { id: loadingToast });
      set({ isLoadingAnalytics: false });
    }
  },
}));
