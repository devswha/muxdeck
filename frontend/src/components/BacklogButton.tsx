import { useState, useEffect } from 'react';
import { BacklogStats } from '../types/Backlog';
import { getBacklogStats } from '../services/BacklogService';

interface BacklogButtonProps {
  onClick: () => void;
}

export function BacklogButton({ onClick }: BacklogButtonProps) {
  const [stats, setStats] = useState<BacklogStats | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getBacklogStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load backlog stats:', err);
      }
    };

    loadStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const pendingCount = stats?.pending ?? 0;

  return (
    <button
      onClick={onClick}
      className="relative px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors flex items-center gap-2"
      title="Backlog (Ctrl+B)"
    >
      <span>📋</span>
      <span className="hidden sm:inline">Backlog</span>
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-xs bg-red-500 text-white rounded-full px-1">
          {pendingCount}
        </span>
      )}
    </button>
  );
}
