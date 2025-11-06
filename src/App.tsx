import { Toaster } from "react-hot-toast";
import { Dashboard } from "./components/Dashboard";

function App() {
  console.log('[App] Rendering App component');

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
