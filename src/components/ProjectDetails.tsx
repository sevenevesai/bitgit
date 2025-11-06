import { useState, useEffect } from 'react';
import { Project, BranchInfo, CommitInfo, DiffInfo, StashInfo, TagInfo } from '../types';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import {
  GitBranch,
  GitCommit,
  FileText,
  Archive,
  Tag,
  X,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Check,
  Clock,
} from 'lucide-react';

interface ProjectDetailsProps {
  project: Project;
  onClose: () => void;
}

type TabType = 'branches' | 'commits' | 'changes' | 'stashes' | 'tags';

export function ProjectDetails({ project, onClose }: ProjectDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('branches');
  const [isLoading, setIsLoading] = useState(false);

  // Data state
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [diffs, setDiffs] = useState<DiffInfo[]>([]);
  const [stashes, setStashes] = useState<StashInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');

  // Load data based on active tab
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    if (!project.localPath) return;

    setIsLoading(true);
    try {
      switch (activeTab) {
        case 'branches':
          await loadBranches();
          break;
        case 'commits':
          await loadCommits();
          break;
        case 'changes':
          await loadDiffs();
          break;
        case 'stashes':
          await loadStashes();
          break;
        case 'tags':
          await loadTags();
          break;
      }
    } catch (error: any) {
      toast.error(`Failed to load ${activeTab}: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBranches = async () => {
    const result = await invoke<BranchInfo[]>('git_get_branches', {
      repoPath: project.localPath,
    });
    setBranches(result);
    const current = result.find(b => b.current);
    setCurrentBranch(current?.name || 'main');
  };

  const loadCommits = async () => {
    const result = await invoke<CommitInfo[]>('git_get_commit_history', {
      repoPath: project.localPath,
      limit: 50,
    });
    setCommits(result);
  };

  const loadDiffs = async () => {
    const result = await invoke<DiffInfo[]>('git_get_diff', {
      repoPath: project.localPath,
    });
    setDiffs(result);
  };

  const loadStashes = async () => {
    const result = await invoke<StashInfo[]>('git_list_stashes', {
      repoPath: project.localPath,
    });
    setStashes(result);
  };

  const loadTags = async () => {
    const result = await invoke<TagInfo[]>('git_list_tags', {
      repoPath: project.localPath,
    });
    setTags(result);
  };

  const tabs = [
    { id: 'branches' as TabType, label: 'Branches', icon: GitBranch, count: branches.length },
    { id: 'commits' as TabType, label: 'Commits', icon: GitCommit, count: commits.length },
    { id: 'changes' as TabType, label: 'Changes', icon: FileText, count: diffs.length },
    { id: 'stashes' as TabType, label: 'Stashes', icon: Archive, count: stashes.length },
    { id: 'tags' as TabType, label: 'Tags', icon: Tag, count: tags.length },
  ];

  return (
    <div className="mt-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-teal-600 dark:bg-teal-700 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
                {tab.count > 0 && (
                  <span className="text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-600 dark:text-teal-400" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading...</span>
          </div>
        ) : (
          <>
            {activeTab === 'branches' && <BranchesTab branches={branches} currentBranch={currentBranch} project={project} onRefresh={loadBranches} />}
            {activeTab === 'commits' && <CommitsTab commits={commits} />}
            {activeTab === 'changes' && <ChangesTab diffs={diffs} />}
            {activeTab === 'stashes' && <StashesTab stashes={stashes} project={project} onRefresh={loadStashes} />}
            {activeTab === 'tags' && <TagsTab tags={tags} project={project} onRefresh={loadTags} />}
          </>
        )}
      </div>
    </div>
  );
}

// Branches Tab Component
function BranchesTab({ branches, project, onRefresh }: { branches: BranchInfo[]; currentBranch: string; project: Project; onRefresh: () => void }) {
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    setIsCreating(true);
    try {
      await invoke('git_create_branch', {
        repoPath: project.localPath,
        branchName: newBranchName,
        checkout: false,
      });
      toast.success(`Branch "${newBranchName}" created`);
      setNewBranchName('');
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to create branch: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    try {
      await invoke('git_switch_branch', {
        repoPath: project.localPath,
        branchName,
      });
      toast.success(`Switched to branch "${branchName}"`);
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to switch branch: ${error}`);
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    if (!confirm(`Delete branch "${branchName}"?`)) return;

    try {
      await invoke('git_delete_branch', {
        repoPath: project.localPath,
        branchName,
        force: false,
      });
      toast.success(`Branch "${branchName}" deleted`);
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to delete branch: ${error}`);
    }
  };

  const localBranches = branches.filter(b => !b.isRemote);
  const remoteBranches = branches.filter(b => b.isRemote);

  return (
    <div className="space-y-4">
      {/* Create new branch */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          placeholder="New branch name..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          onKeyPress={(e) => e.key === 'Enter' && handleCreateBranch()}
        />
        <button
          onClick={handleCreateBranch}
          disabled={!newBranchName.trim() || isCreating}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 dark:bg-teal-700 text-white rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create
        </button>
      </div>

      {/* Local branches */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Local Branches</h4>
        <div className="space-y-2">
          {localBranches.map((branch) => (
            <div
              key={branch.name}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                branch.current
                  ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <GitBranch className={`w-4 h-4 ${branch.current ? 'text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`font-medium ${branch.current ? 'text-teal-900 dark:text-teal-100' : 'text-gray-900 dark:text-white'}`}>
                  {branch.name}
                </span>
                {branch.current && (
                  <span className="text-xs bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded">
                    CURRENT
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{branch.commit.substring(0, 7)}</span>
                {!branch.current && (
                  <>
                    <button
                      onClick={() => handleSwitchBranch(branch.name)}
                      className="text-sm px-3 py-1 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded transition-colors"
                    >
                      Switch
                    </button>
                    {branch.name !== 'main' && branch.name !== 'master' && (
                      <button
                        onClick={() => handleDeleteBranch(branch.name)}
                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {localBranches.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No local branches</p>
          )}
        </div>
      </div>

      {/* Remote branches */}
      {remoteBranches.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Remote Branches</h4>
          <div className="space-y-2">
            {remoteBranches.map((branch) => (
              <div
                key={branch.name}
                className="flex items-center justify-between p-3 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="font-medium text-gray-900 dark:text-white">origin/{branch.name}</span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{branch.commit.substring(0, 7)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Commits Tab Component
function CommitsTab({ commits }: { commits: CommitInfo[] }) {
  return (
    <div className="space-y-2">
      {commits.map((commit) => (
        <div
          key={commit.hash}
          className="p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">{commit.message}</p>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                <span>{commit.author}</span>
                <span>•</span>
                <span>{new Date(commit.date).toLocaleDateString()}</span>
                <span>•</span>
                <span className="font-mono text-xs">{commit.hash.substring(0, 7)}</span>
              </div>
            </div>
            {commit.refs && (
              <div className="flex gap-1">
                {commit.refs.split(',').map((ref, i) => {
                  const cleanRef = ref.trim();
                  if (!cleanRef) return null;
                  return (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    >
                      {cleanRef}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {commit.body && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
              {commit.body}
            </p>
          )}
        </div>
      ))}
      {commits.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No commits yet</p>
      )}
    </div>
  );
}

// Changes Tab Component
function ChangesTab({ diffs }: { diffs: DiffInfo[] }) {
  return (
    <div className="space-y-4">
      {diffs.map((diff) => (
        <div key={diff.fileName} className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-2 bg-gray-100 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
            <span className="font-mono text-sm text-gray-900 dark:text-white">{diff.fileName}</span>
          </div>
          <div className="p-2 font-mono text-xs max-h-60 overflow-y-auto">
            {diff.changes.map((change, idx) => (
              <div
                key={idx}
                className={`px-2 py-0.5 ${
                  change.type === 'add'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                    : change.type === 'remove'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="text-gray-500 dark:text-gray-500 mr-4">{change.line}</span>
                <span className={change.type === 'add' ? 'text-green-700 dark:text-green-300' : change.type === 'remove' ? 'text-red-700 dark:text-red-300' : ''}>
                  {change.type === 'add' ? '+ ' : change.type === 'remove' ? '- ' : '  '}
                  {change.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {diffs.length === 0 && (
        <div className="text-center py-8">
          <Check className="w-12 h-12 text-green-500 dark:text-green-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No uncommitted changes</p>
        </div>
      )}
    </div>
  );
}

// Stashes Tab Component
function StashesTab({ stashes, project, onRefresh }: { stashes: StashInfo[]; project: Project; onRefresh: () => void }) {
  const [stashMessage, setStashMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateStash = async () => {
    setIsCreating(true);
    try {
      await invoke('git_create_stash', {
        repoPath: project.localPath,
        message: stashMessage || undefined,
      });
      toast.success('Stash created');
      setStashMessage('');
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to create stash: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleApplyStash = async (index: number) => {
    try {
      await invoke('git_apply_stash', {
        repoPath: project.localPath,
        index,
      });
      toast.success('Stash applied');
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to apply stash: ${error}`);
    }
  };

  const handlePopStash = async () => {
    try {
      await invoke('git_pop_stash', {
        repoPath: project.localPath,
      });
      toast.success('Stash popped');
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to pop stash: ${error}`);
    }
  };

  const handleDropStash = async (index: number) => {
    if (!confirm('Delete this stash?')) return;

    try {
      await invoke('git_drop_stash', {
        repoPath: project.localPath,
        index,
      });
      toast.success('Stash deleted');
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to delete stash: ${error}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Create stash */}
      <div className="space-y-2">
        <input
          type="text"
          value={stashMessage}
          onChange={(e) => setStashMessage(e.target.value)}
          placeholder="Stash message (optional)..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <div className="flex gap-2">
          <button
            onClick={handleCreateStash}
            disabled={isCreating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 dark:bg-teal-700 text-white rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            <Archive className="w-4 h-4" />
            Create Stash
          </button>
          {stashes.length > 0 && (
            <button
              onClick={handlePopStash}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Pop Latest
            </button>
          )}
        </div>
      </div>

      {/* Stash list */}
      <div className="space-y-2">
        {stashes.map((stash) => (
          <div
            key={stash.index}
            className="flex items-center justify-between p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">{stash.message || 'WIP on branch'}</p>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{new Date(stash.date).toLocaleString()}</span>
                <span>•</span>
                <span className="font-mono text-xs">{stash.hash.substring(0, 7)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleApplyStash(stash.index)}
                className="text-sm px-3 py-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => handleDropStash(stash.index)}
                className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {stashes.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No stashes saved</p>
        )}
      </div>
    </div>
  );
}

// Tags Tab Component
function TagsTab({ tags, project, onRefresh }: { tags: TagInfo[]; project: Project; onRefresh: () => void }) {
  const [newTagName, setNewTagName] = useState('');
  const [tagMessage, setTagMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    setIsCreating(true);
    try {
      await invoke('git_create_tag', {
        repoPath: project.localPath,
        tagName: newTagName,
        message: tagMessage || undefined,
      });
      toast.success(`Tag "${newTagName}" created`);
      setNewTagName('');
      setTagMessage('');
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to create tag: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePushTag = async (tagName: string) => {
    try {
      await invoke('git_push_tag', {
        repoPath: project.localPath,
        tagName,
      });
      toast.success(`Tag "${tagName}" pushed`);
    } catch (error: any) {
      toast.error(`Failed to push tag: ${error}`);
    }
  };

  const handlePushAllTags = async () => {
    try {
      await invoke('git_push_all_tags', {
        repoPath: project.localPath,
      });
      toast.success('All tags pushed');
    } catch (error: any) {
      toast.error(`Failed to push tags: ${error}`);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    if (!confirm(`Delete tag "${tagName}"?`)) return;

    try {
      await invoke('git_delete_tag', {
        repoPath: project.localPath,
        tagName,
      });
      toast.success(`Tag "${tagName}" deleted`);
      onRefresh();
    } catch (error: any) {
      toast.error(`Failed to delete tag: ${error}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Create tag */}
      <div className="space-y-2">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="Tag name (e.g., v1.0.0)..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <input
          type="text"
          value={tagMessage}
          onChange={(e) => setTagMessage(e.target.value)}
          placeholder="Tag message (optional)..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <div className="flex gap-2">
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim() || isCreating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 dark:bg-teal-700 text-white rounded-lg hover:bg-teal-700 dark:hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Tag
          </button>
          {tags.length > 0 && (
            <button
              onClick={handlePushAllTags}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Push All
            </button>
          )}
        </div>
      </div>

      {/* Tag list */}
      <div className="space-y-2">
        {tags.map((tag) => (
          <div
            key={tag.name}
            className="flex items-center justify-between p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-gray-900 dark:text-white">{tag.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePushTag(tag.name)}
                className="text-sm px-3 py-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors"
              >
                Push
              </button>
              <button
                onClick={() => handleDeleteTag(tag.name)}
                className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No tags created</p>
        )}
      </div>
    </div>
  );
}
