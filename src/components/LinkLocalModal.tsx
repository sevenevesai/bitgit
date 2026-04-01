import { useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/api/dialog';
import toast from 'react-hot-toast';

interface LinkLocalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (localPath: string) => Promise<void>;
  projectName: string;
}

export function LinkLocalModal({ isOpen, onClose, onLink, projectName }: LinkLocalModalProps) {
  const [localPath, setLocalPath] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select local project directory',
      });

      if (selectedPath && typeof selectedPath === 'string') {
        setLocalPath(selectedPath);
      }
    } catch (error: any) {
      toast.error(`Failed to open directory picker: ${error}`);
    }
  };

  const handleLink = async () => {
    if (!localPath.trim()) {
      toast.error('Please select a directory');
      return;
    }

    setIsLinking(true);
    try {
      await onLink(localPath);
      onClose();
      setLocalPath('');
    } catch (error: any) {
      toast.error(`Failed to link: ${error}`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleClose = () => {
    if (!isLinking) {
      setLocalPath('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Link Local Directory</h2>
          <button
            onClick={handleClose}
            disabled={isLinking}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-gray-600">
            Link project <span className="font-semibold">{projectName}</span> to an existing local directory.
          </p>

          {/* Directory Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Local Directory Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="C:\Users\YourName\Projects\my-project"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                disabled={isLinking}
              />
              <button
                onClick={handleBrowse}
                disabled={isLinking}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <FolderOpen className="w-4 h-4" />
                Browse
              </button>
            </div>
          </div>

          {localPath && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Selected:</span> {localPath}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            disabled={isLinking}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={isLinking || !localPath.trim()}
            className="px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLinking ? 'Linking...' : 'Link Directory'}
          </button>
        </div>
      </div>
    </div>
  );
}
