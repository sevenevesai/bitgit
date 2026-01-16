import React from 'react';
import { GitCommit, GitBranch, GitPullRequest, Search, Folder, ChevronRight, Check, RefreshCw } from 'lucide-react';

const MockInterface: React.FC = () => {
  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-border bg-surface select-none">
      {/* Window Controls */}
      <div className="h-10 bg-surfaceHighlight flex items-center px-4 border-b border-border justify-between">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
        </div>
        <div className="text-xs text-textMuted font-mono flex items-center gap-2">
          <GitBranch size={12} />
          <span>main</span>
          <span className="text-border">|</span>
          <span>BitGit-v0.1.0</span>
        </div>
        <div className="w-10"></div> {/* Spacer */}
      </div>

      <div className="flex h-[500px] md:h-[600px]">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-surface hidden md:flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-1.5 text-sm text-textMuted">
              <Search size={14} />
              <span>Filter repos...</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {[
              { name: 'bitgit-core', active: true },
              { name: 'tauri-driver', active: false },
              { name: 'rust-utils', active: false },
              { name: 'website-v2', active: false },
              { name: 'legacy-api', active: false },
            ].map((repo, i) => (
              <div 
                key={i}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-default transition-colors ${repo.active ? 'bg-primaryDim text-primary' : 'text-textMuted hover:text-textMain hover:bg-surfaceHighlight'}`}
              >
                <Folder size={16} />
                <span>{repo.name}</span>
                {repo.active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"></div>}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border text-xs text-textMuted flex justify-between items-center">
             <span>Synced 2m ago</span>
             <RefreshCw size={12} />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-background flex flex-col relative overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-border flex justify-between items-end">
            <div>
              <h2 className="text-xl font-semibold text-textMain tracking-tight">bitgit-core</h2>
              <p className="text-textMuted text-sm mt-1">Local branch is up to date with origin/main</p>
            </div>
            <div className="flex gap-3">
              <button className="px-4 py-2 rounded-md border border-border bg-surface hover:bg-surfaceHighlight text-sm text-textMain transition-colors">
                Pull
              </button>
              <button className="px-4 py-2 rounded-md bg-primary hover:bg-orange-600 text-white text-sm font-medium shadow-[0_0_15px_-3px_rgba(255,77,0,0.4)] transition-all">
                Push Changes
              </button>
            </div>
          </div>

          {/* Commit Graph Area */}
          <div className="flex-1 p-6 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,77,0,0.03),transparent_70%)]"></div>
            
            <div className="space-y-6 relative z-10">
              {/* Commit Item 1 */}
              <div className="flex gap-4 group">
                 <div className="flex flex-col items-center mt-1">
                    <div className="w-3 h-3 rounded-full border-2 border-primary bg-background z-10"></div>
                    <div className="w-0.5 h-full bg-border -mt-1 group-last:hidden"></div>
                 </div>
                 <div className="flex-1 pb-2">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-textMain font-medium">feat: implement tauri command handlers</span>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-border text-textMuted bg-surface">a7f3d2</span>
                      <span className="text-xs text-textMuted ml-auto">12 mins ago</span>
                    </div>
                    <p className="text-textMuted text-sm">Added async functionality for git process checking...</p>
                 </div>
              </div>

              {/* Commit Item 2 */}
              <div className="flex gap-4 group">
                 <div className="flex flex-col items-center mt-1">
                    <div className="w-3 h-3 rounded-full border-2 border-border bg-surfaceHighlight z-10 group-hover:border-primary transition-colors"></div>
                    <div className="w-0.5 h-full bg-border -mt-1"></div>
                 </div>
                 <div className="flex-1 pb-2">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-textMuted group-hover:text-textMain transition-colors">fix: resolve merge conflict in cargo.toml</span>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-border text-textMuted bg-surface">9c2b1a</span>
                      <span className="text-xs text-textMuted ml-auto">1 hour ago</span>
                    </div>
                 </div>
              </div>

              {/* Commit Item 3 - Merge */}
              <div className="flex gap-4 group">
                 <div className="flex flex-col items-center mt-1 relative">
                    {/* Branch line logic visualization */}
                    <svg className="absolute top-2 left-1.5 w-6 h-12 text-border" style={{ overflow: 'visible' }}>
                        <path d="M 0 0 C 0 15, 12 15, 12 30" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <div className="w-3 h-3 rounded-full border-2 border-border bg-surfaceHighlight z-10"></div>
                    <div className="w-0.5 h-full bg-border -mt-1"></div>
                 </div>
                 <div className="flex-1 pb-2 pl-4"> {/* Indented for branch visual */}
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-textMuted">refactor: ui component structure</span>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-border text-textMuted bg-surface">b4e1f9</span>
                      <span className="text-xs text-textMuted ml-auto">3 hours ago</span>
                    </div>
                 </div>
              </div>

               {/* Commit Item 4 */}
               <div className="flex gap-4 group">
                 <div className="flex flex-col items-center mt-1">
                    <div className="w-3 h-3 rounded-full border-2 border-border bg-surfaceHighlight z-10"></div>
                    <div className="w-0.5 h-full bg-border -mt-1"></div>
                 </div>
                 <div className="flex-1 pb-2">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-textMuted">chore: initial commit</span>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-border text-textMuted bg-surface">11a22b</span>
                      <span className="text-xs text-textMuted ml-auto">Yesterday</span>
                    </div>
                 </div>
              </div>
            </div>
          </div>
          
          {/* Status Bar */}
          <div className="h-8 border-t border-border bg-surface flex items-center px-4 text-xs text-textMuted justify-between">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-green-500"><Check size={10} /> Rust environment active</span>
              <span className="flex items-center gap-1"><GitPullRequest size={10} /> 0 outgoing</span>
            </div>
            <div>
              Mem: 14MB
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockInterface;
