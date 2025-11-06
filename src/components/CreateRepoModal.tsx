import { X, Globe, Lock, Info } from 'lucide-react';

interface CreateRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (isPrivate: boolean) => void;
  projectName: string;
}

export function CreateRepoModal({ isOpen, onClose, onCreate, projectName }: CreateRepoModalProps) {
  if (!isOpen) return null;

  const handleCreate = (isPrivate: boolean) => {
    onCreate(isPrivate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Create GitHub Repository</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <p className="text-gray-700 mb-2">
              Create a new GitHub repository for <span className="font-semibold">"{projectName}"</span>
            </p>
            <p className="text-sm text-gray-500">
              Choose the visibility for your new repository:
            </p>
          </div>

          {/* Public Option */}
          <button
            onClick={() => handleCreate(false)}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <Globe className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-gray-900 group-hover:text-green-700">
                  Public Repository
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Anyone on the internet can see this repository. You choose who can commit.
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <Info className="w-3 h-3" />
                  <span>Free for unlimited repositories</span>
                </div>
              </div>
            </div>
          </button>

          {/* Private Option */}
          <button
            onClick={() => handleCreate(true)}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <Lock className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-700">
                  Private Repository
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Only you and people you explicitly share with can see this repository.
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <Info className="w-3 h-3" />
                  <span>Recommended for personal or sensitive projects</span>
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
