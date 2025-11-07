import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { TrendingUp, Activity, AlertTriangle, Calendar, RefreshCw } from 'lucide-react';

export function AnalyticsDashboard() {
  const { analytics, isLoadingAnalytics, loadAnalytics, refreshAnalytics } = useAppStore();

  useEffect(() => {
    // Load analytics on mount
    loadAnalytics();
  }, [loadAnalytics]);

  if (isLoadingAnalytics && !analytics) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-600 dark:text-teal-400" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Activity className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No Analytics Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Start committing to your projects to see analytics insights.
          </p>
        </div>
      </div>
    );
  }

  const { overview, timeline, health, heatmap } = analytics;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Insights across all your projects • Last updated: {new Date(analytics.lastUpdated).toLocaleString()}
          </p>
        </div>
        <button
          onClick={refreshAnalytics}
          disabled={isLoadingAnalytics}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overview Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Projects */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Projects</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{overview.totalProjects}</p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 dark:text-green-400 font-medium">{overview.activeProjects}</span>
            <span className="text-gray-600 dark:text-gray-400 ml-1">active this week</span>
          </div>
        </div>

        {/* Commits Today */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Commits Today</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{overview.commitsToday}</p>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
              <Activity className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-600 dark:text-gray-400">{overview.commitsThisWeek} this week</span>
            <span className="text-gray-400 dark:text-gray-500 mx-1">•</span>
            <span className="text-gray-600 dark:text-gray-400">{overview.commitsThisMonth} this month</span>
          </div>
        </div>

        {/* Needs Attention */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Needs Attention</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{overview.needsAttention}</p>
            </div>
            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Projects with uncommitted changes or pending branches
          </div>
        </div>

        {/* Current Streak */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Streak</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{heatmap.currentStreak}</p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-600 dark:text-gray-400">Best: {heatmap.longestStreak} days</span>
          </div>
        </div>
      </div>

      {/* Most Active Project */}
      {overview.mostActiveProject && (
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-lg border border-teal-200 dark:border-teal-800 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-teal-100 dark:bg-teal-900/30 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-teal-900 dark:text-teal-100">Most Active Project</p>
              <p className="text-2xl font-bold text-teal-900 dark:text-white mt-1">
                {overview.mostActiveProject.name}
              </p>
              <p className="text-sm text-teal-700 dark:text-teal-300 mt-1">
                {overview.mostActiveProject.commitCount} commits in the last 90 days
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h2>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {timeline.slice(0, 10).map((entry) => (
            <div key={entry.id} className="flex items-start gap-4 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div
                className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                style={{ backgroundColor: entry.projectColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {entry.commitMessage}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {entry.projectName} • {entry.author}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <span>{entry.filesChanged} files</span>
                  <span className="text-green-600 dark:text-green-400">+{entry.additions}</span>
                  <span className="text-red-600 dark:text-red-400">-{entry.deletions}</span>
                  <span className="text-gray-400 dark:text-gray-500">•</span>
                  {entry.commitHash ? (
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {entry.commitHash.substring(0, 7)}
                    </code>
                  ) : (
                    <span className="text-xs text-gray-400">N/A</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Repository Health */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Repository Health</h2>
        <div className="space-y-3">
          {health.map((indicator) => {
            const healthColors = {
              healthy: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
              attention: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
              warning: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
              critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
            };

            return (
              <div
                key={indicator.projectId}
                className={`p-4 rounded-lg border ${healthColors[indicator.healthStatus as keyof typeof healthColors]}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{indicator.projectName}</p>
                    {indicator.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {indicator.warnings.map((warning, idx) => (
                          <p key={idx} className="text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {warning}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium uppercase tracking-wide">
                    {indicator.healthStatus}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
