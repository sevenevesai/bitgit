import { LucideIcon } from 'lucide-react';

export interface Platform {
  name: string;
  icon: LucideIcon;
  version: string;
  size: string;
  downloadUrl: string;
}

export interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

export enum ThemeColor {
  Primary = '#FF4D00',
  Background = '#0a0a0a',
}
