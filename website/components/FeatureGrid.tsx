import React from 'react';
import { Zap, Shield, GitGraph, Terminal, Coffee, Layers } from 'lucide-react';
import { FeatureItem } from '../types';

const features: FeatureItem[] = [
  {
    title: "Rust Core",
    description: "Built on Tauri. Starts instantly. Uses less memory than your browser's empty tab.",
    icon: Zap,
  },
  {
    title: "Repo Archival",
    description: "Treats git as a history book. Searchable, readable, and perfectly organized.",
    icon: Layers,
  },
  {
    title: "Visual History",
    description: "Linear history mode by default. Understand your project's timeline at a glance.",
    icon: GitGraph,
  },
  {
    title: "Zero Config",
    description: "Detects your .gitconfig and SSH keys. No complex setup wizards.",
    icon: Terminal,
  },
  {
    title: "Solo Focused",
    description: "Optimized for single-maintainer repositories. No team-bloat features.",
    icon: Coffee,
  },
  {
    title: "Privacy First",
    description: "Local only. We don't track your code, your stats, or your usage.",
    icon: Shield,
  },
];

const FeatureGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((feature, index) => (
        <div 
          key={index} 
          className="group p-6 rounded-lg bg-surface border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_20px_-10px_rgba(255,77,0,0.3)]"
        >
          <div className="w-12 h-12 rounded-lg bg-surfaceHighlight flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
            <feature.icon className="text-textMain group-hover:text-primary transition-colors" size={24} />
          </div>
          <h3 className="text-lg font-medium text-textMain mb-2">{feature.title}</h3>
          <p className="text-textMuted text-sm leading-relaxed">
            {feature.description}
          </p>
        </div>
      ))}
    </div>
  );
};

export default FeatureGrid;
