import { useState, useEffect, useCallback } from 'react';
import { Todo } from '../types/Todo';
import { fetchTodos, createTodo, updateTodo, deleteTodo } from '../services/TodoService';

interface TodoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  workspaces: Array<{ id: string; name: string }>;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
}

export function TodoPanel({ isOpen, onClose, onToggle, workspaces, selectedWorkspaceId, onSelectWorkspace }: TodoPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);

  const loadTodos = useCallback(async () => {
    if (!selectedWorkspaceId) return;

    setIsLoading(true);
    try {
      const data = await fetchTodos(selectedWorkspaceId);
      setTodos(data);
    } catch (err) {
      console.error('Failed to load todos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (isOpen && selectedWorkspaceId) {
      loadTodos();
    }
  }, [isOpen, selectedWorkspaceId, loadTodos]);

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId || !newTodoText.trim()) return;

    try {
      await createTodo(selectedWorkspaceId, { text: newTodoText.trim() });
      setNewTodoText('');
      loadTodos();
    } catch (err) {
      console.error('Failed to create todo:', err);
    }
  };

  const handleToggleCompleted = async (todo: Todo) => {
    if (!selectedWorkspaceId) return;

    try {
      await updateTodo(selectedWorkspaceId, todo.id, { completed: !todo.completed });
      loadTodos();
    } catch (err) {
      console.error('Failed to update todo:', err);
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    if (!selectedWorkspaceId || !confirm('Delete this todo?')) return;

    try {
      await deleteTodo(selectedWorkspaceId, todoId);
      loadTodos();
    } catch (err) {
      console.error('Failed to delete todo:', err);
    }
  };

  const completedCount = todos.filter(t => t.completed).length;
  const totalCount = todos.length;

  return (
    <>
      {/* Persistent Tab - Always Visible */}
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-gradient-to-l from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-lg transition-all duration-200 hover:pr-1 group"
        style={{
          writingMode: 'vertical-rl',
          padding: '16px 8px',
          borderTopLeftRadius: '8px',
          borderBottomLeftRadius: '8px',
        }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wider">
          <span className="transform rotate-180">📋</span>
          <span>TODO</span>
        </span>
      </button>

      {/* Slide-out Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-gray-800 shadow-2xl border-l border-gray-700 z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-750">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
              ✓ Todos
            </h2>
            {totalCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                {completedCount}/{totalCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Workspace Selector */}
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-750">
          <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
            Workspace
          </label>
          <select
            value={selectedWorkspaceId || ''}
            onChange={(e) => onSelectWorkspace(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer hover:border-gray-500"
          >
            <option value="" disabled>
              Select a workspace...
            </option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        {/* Add Form */}
        {selectedWorkspaceId && (
          <form onSubmit={handleAddTodo} className="px-6 py-4 border-b border-gray-700 bg-gray-750">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Add a new todo..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <button
                type="submit"
                disabled={!newTodoText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors shadow-sm hover:shadow-md disabled:shadow-none"
              >
                Add
              </button>
            </div>
          </form>
        )}

        {/* Todos List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!selectedWorkspaceId ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-3">👆</div>
              <div className="text-sm">Select a workspace to view todos</div>
            </div>
          ) : isLoading ? (
            <div className="text-center text-gray-400 py-12">
              <div className="animate-pulse">Loading...</div>
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-3">📝</div>
              <div className="text-sm">No todos yet. Add one to get started!</div>
            </div>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 ${
                    todo.completed
                      ? 'bg-gray-800/50 border-gray-700/50 opacity-60'
                      : 'bg-gray-700/30 border-gray-600 hover:border-blue-500/50 hover:bg-gray-700/50'
                  }`}
                >
                  <button
                    onClick={() => handleToggleCompleted(todo)}
                    className="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150 hover:scale-110"
                    style={{
                      borderColor: todo.completed ? '#10b981' : '#6b7280',
                      backgroundColor: todo.completed ? '#10b981' : 'transparent',
                    }}
                  >
                    {todo.completed && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      todo.completed ? 'line-through text-gray-500' : 'text-gray-200'
                    }`}
                  >
                    {todo.text}
                  </span>
                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="flex-shrink-0 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded w-6 h-6 flex items-center justify-center transition-all text-lg"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedWorkspaceId && (
          <div className="px-6 py-3 border-t border-gray-700 bg-gray-750">
            <div className="text-xs text-gray-500">
              {totalCount > 0 && completedCount === totalCount ? (
                <span className="text-green-400 font-semibold">🎉 All done! Great work!</span>
              ) : (
                <span>
                  <span className="font-semibold text-gray-400">{totalCount - completedCount}</span> remaining
                  {selectedWorkspace && (
                    <span className="text-gray-600 ml-2">• {selectedWorkspace.name}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
