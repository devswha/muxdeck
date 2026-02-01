import { useState, useEffect, useCallback } from 'react';
import { BacklogItem, BacklogItemType, BacklogPriority, BacklogStats } from '../types/Backlog';
import {
  getBacklogItems,
  getBacklogStats,
  createBacklogItem,
  updateBacklogItem,
  deleteBacklogItem,
  exportBacklogMarkdown
} from '../services/BacklogService';

interface BacklogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const typeIcons: Record<BacklogItemType, string> = {
  bug: '🐛',
  feature: '✨',
  improvement: '🔧',
};

const priorityColors: Record<BacklogPriority, string> = {
  low: 'text-gray-400',
  medium: 'text-yellow-400',
  high: 'text-red-400',
};

export function BacklogPanel({ isOpen, onClose }: BacklogPanelProps) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [stats, setStats] = useState<BacklogStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');

  // Form state
  const [newType, setNewType] = useState<BacklogItemType>('bug');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<BacklogPriority>('medium');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [itemsData, statsData] = await Promise.all([
        getBacklogItems(filter === 'all' ? undefined : filter === 'done' ? 'done' : undefined),
        getBacklogStats(),
      ]);
      setItems(filter === 'pending' ? itemsData.filter(i => i.status !== 'done') : itemsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load backlog:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await createBacklogItem({
        type: newType,
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        priority: newPriority,
      });
      setNewTitle('');
      setNewDescription('');
      setShowAddForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

  const handleToggleStatus = async (item: BacklogItem) => {
    const newStatus = item.status === 'done' ? 'pending' : 'done';
    try {
      await updateBacklogItem(item.id, { status: newStatus });
      loadData();
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await deleteBacklogItem(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleExport = async () => {
    try {
      const markdown = await exportBacklogMarkdown();
      await navigator.clipboard.writeText(markdown);
      alert('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">📋 Backlog</h2>
            {stats && (
              <div className="flex gap-2 text-sm">
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
                  🐛 {stats.bugs}
                </span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                  ✨ {stats.features}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title="Copy as Markdown"
            >
              📋 Export
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors"
            >
              + Add
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
              ×
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="px-6 py-4 border-b border-gray-700 bg-gray-750">
            <div className="flex gap-3 mb-3">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as BacklogItemType)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
              >
                <option value="bug">🐛 Bug</option>
                <option value="feature">✨ Feature</option>
                <option value="improvement">🔧 Improvement</option>
              </select>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as BacklogPriority)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
              />
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Filter */}
        <div className="flex gap-2 px-6 py-3 border-b border-gray-700">
          {(['pending', 'all', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No items. Click "+ Add" to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    item.status === 'done'
                      ? 'bg-gray-800/50 border-gray-700 opacity-60'
                      : 'bg-gray-750 border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <button
                    onClick={() => handleToggleStatus(item)}
                    className="mt-0.5 text-lg"
                  >
                    {item.status === 'done' ? '✅' : '⬜'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{typeIcons[item.type]}</span>
                      <span className={`text-xs font-medium ${priorityColors[item.priority]}`}>
                        [{item.priority.toUpperCase()}]
                      </span>
                      <span className={item.status === 'done' ? 'line-through text-gray-500' : ''}>
                        {item.title}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-400 mt-1">{item.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 text-xs text-gray-500">
          Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Ctrl+B</kbd> to quick add
        </div>
      </div>
    </div>
  );
}
