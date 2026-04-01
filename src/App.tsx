import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { Dashboard } from "./components/Dashboard";
import { useAppStore } from "./stores/useAppStore";

function App() {
  console.log('[App] Rendering App component');
  const { settings } = useAppStore();

  // Initialize theme on mount
  useEffect(() => {
    const theme = settings.ui.theme;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.ui.theme]);

  try {
    return (
      <>
        <Toaster position="top-right" />
        <Dashboard />
      </>
    );
  } catch (error) {
    console.error('[App] Error rendering:', error);
    throw error;
  }
}

export default App;
