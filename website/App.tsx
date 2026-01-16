import React from 'react';
import { Download, Github, Command, ArrowDown } from 'lucide-react';
import MockInterface from './components/MockInterface';
import FeatureGrid from './components/FeatureGrid';

const App: React.FC = () => {
  const scrollToDownload = () => {
    const element = document.getElementById('download-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-textMain overflow-x-hidden selection:bg-primary selection:text-white">
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full opacity-40"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[60%] bg-blue-900/5 blur-[120px] rounded-full opacity-30"></div>
        {/* Subtle Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 w-full px-6 py-6 max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2 font-mono font-bold text-xl tracking-tighter">
          <div className="w-3 h-3 bg-primary rounded-sm"></div>
          BitGit
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com" target="_blank" rel="noreferrer" className="text-textMuted hover:text-textMain transition-colors">
            <Github size={20} />
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-12 pb-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surfaceHighlight/50 backdrop-blur-sm text-xs font-mono text-primary mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            v1.0.4 Available Now
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-500">
            Git. Simplified.
          </h1>
          
          <p className="text-lg md:text-xl text-textMuted leading-relaxed max-w-2xl mx-auto mb-10">
            Stop fighting the CLI. A lightning-fast, native interface for solo developers to manage repositories without the headache. Built in Rust.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={scrollToDownload}
              className="group relative px-8 py-3 bg-primary hover:bg-orange-600 text-white rounded-lg font-medium transition-all shadow-[0_0_20px_-5px_rgba(255,77,0,0.5)] flex items-center gap-2"
            >
              <Download size={18} />
              <span>Get BitGit</span>
              <div className="absolute inset-0 rounded-lg border border-white/20"></div>
            </button>
            <div className="px-8 py-3 text-textMuted font-mono text-sm border border-border rounded-lg bg-surface/50 backdrop-blur flex items-center gap-3">
              <Command size={14} />
              <span>brew install bitgit</span>
            </div>
          </div>
        </div>

        {/* Visual Hook */}
        <div className="mb-32 relative">
          <MockInterface />
           {/* Decorative elements behind interface */}
           <div className="absolute -z-10 -bottom-10 -right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl"></div>
        </div>

        {/* Features Grid */}
        <div className="mb-32">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-px flex-1 bg-border"></div>
            <h2 className="text-sm font-mono text-textMuted uppercase tracking-widest">Why BitGit?</h2>
            <div className="h-px flex-1 bg-border"></div>
          </div>
          <FeatureGrid />
        </div>

        {/* Download Section */}
        <div id="download-section" className="relative rounded-2xl bg-surface border border-border overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,77,0,0.05),transparent_40%)]"></div>
          
          <div className="relative p-10 md:p-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to commit?</h2>
            <p className="text-textMuted mb-12 max-w-xl mx-auto">
              Free and open source. No accounts, no cloud sync, just local file management.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
              {/* Windows */}
              <a href="#" className="group flex flex-col items-center p-6 rounded-xl border border-border bg-background hover:border-primary transition-all hover:-translate-y-1">
                <div className="mb-3 text-textMain group-hover:text-primary transition-colors">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                    <path d="M0 3.449L9.75 2.1v9.451H0V3.449zm10.949-1.672L24 0v11.46H10.949V1.777zM0 12.6h9.75v9.451L0 20.55V12.6zm10.949 0H24v11.46l-13.051-1.848V12.6z"/>
                  </svg>
                </div>
                <span className="font-medium text-textMain">Windows</span>
                <span className="text-xs text-textMuted mt-1">x64 .msi</span>
                <span className="mt-4 text-xs font-mono text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Download <ArrowDown size={10} />
                </span>
              </a>

              {/* macOS */}
              <a href="#" className="group flex flex-col items-center p-6 rounded-xl border border-border bg-background hover:border-primary transition-all hover:-translate-y-1">
                <div className="mb-3 text-textMain group-hover:text-primary transition-colors">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                     <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.96 1.07-3.11-1.05.05-2.31.74-3.03 1.58-.67.77-1.24 2.02-1.01 3.12 1.17.09 2.35-.75 2.97-1.59z"/>
                  </svg>
                </div>
                <span className="font-medium text-textMain">macOS</span>
                <span className="text-xs text-textMuted mt-1">Apple Silicon / Intel</span>
                <span className="mt-4 text-xs font-mono text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Download <ArrowDown size={10} />
                </span>
              </a>

              {/* Linux */}
              <a href="#" className="group flex flex-col items-center p-6 rounded-xl border border-border bg-background hover:border-primary transition-all hover:-translate-y-1">
                <div className="mb-3 text-textMain group-hover:text-primary transition-colors">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                    <path d="M12 0L1.75 4.97v14.06L12 24l10.25-4.97V4.97L12 0zm-1.5 2.26l.03.02 8.36 4.05-4.5 2.3-8.36-4.28 4.47-2.09zM3.25 6.42l3.41 1.75v8.11l-3.41-1.7V6.42zm11 11.16l-4.5 2.25v-8.1l4.5-2.18v8.03zm.75-9.6l3.44 1.76-3.44 1.67V8l-.03-.02zM19.25 14.58l-3.41 1.7v-8.1l3.41-1.66v8.06z"/>
                  </svg>
                </div>
                <span className="font-medium text-textMain">Linux</span>
                <span className="text-xs text-textMuted mt-1">.deb / .AppImage</span>
                <span className="mt-4 text-xs font-mono text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Download <ArrowDown size={10} />
                </span>
              </a>
            </div>
            
            <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center text-sm text-textMuted gap-4">
               <div className="font-mono text-xs">
                 SHA256: 8f4e2...3a1b
               </div>
               <div className="flex gap-6">
                 <a href="#" className="hover:text-textMain">Source Code</a>
                 <a href="#" className="hover:text-textMain">Release Notes</a>
                 <a href="#" className="hover:text-textMain">License (MIT)</a>
               </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border bg-surface text-textMuted py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm">
            &copy; {new Date().getFullYear()} BitGit. Built with <span className="text-primary">Rust</span> & <span className="text-blue-400">Tauri</span>.
          </div>
          <div className="flex items-center gap-2 text-xs font-mono opacity-50">
            <span>TERMINAL IS OPTIONAL</span>
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
