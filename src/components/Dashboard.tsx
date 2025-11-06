import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { ProjectCard } from './ProjectCard';
import { SettingsModal } from './SettingsModal';
import { AddProjectModal } from './AddProjectModal';
import { Plus, RefreshCw, Settings } from 'lucide-react';

export function Dashboard() {
  console.log('[Dashboard] Rendering...');
  const { projects, isLoading, loadProjects, selectedProjectIds } = useAppStore();
  console.log('[Dashboard] State:', { projects, isLoading, projectCount: projects?.length });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);

  useEffect(() => {
    console.log('[Dashboard] Loading projects...');
    loadProjects();
  }, [loadProjects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2 text-gray-600">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading projects...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">BitGit</h1>
              <p className="text-sm text-gray-600 mt-1">
                {projects.length} projects tracked
                {selectedProjectIds.size > 0 && ` • ${selectedProjectIds.size} selected`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadProjects()}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>

              <button
                onClick={() => setIsAddProjectOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Project
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-8 py-8">
        {projects.length === 0 ? (
          <EmptyState onAddProject={() => setIsAddProjectOpen(true)} />
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Plus className="w-8 h-8 text-teal-600" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          No Projects Yet
        </h2>

        <p className="text-gray-600 mb-6">
          Get started by creating your first project. You can link it to a GitHub repository
          and/or a local directory, or configure those details later.
        </p>

        <button
          onClick={onAddProject}
          className="px-6 py-3 text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors inline-flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Your First Project
        </button>
      </div>
    </div>
  );
}
