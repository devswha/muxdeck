interface SessionControlsProps {
  onNewWorkspace: () => void;
  onManageHosts: () => void;
  onRefresh: () => void;
}

export function SessionControls({ onNewWorkspace, onManageHosts, onRefresh }: SessionControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onNewWorkspace}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
      >
        + New Workspace
      </button>
      <button
        onClick={onManageHosts}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors"
      >
        Manage Hosts
      </button>
      <button
        onClick={onRefresh}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}
