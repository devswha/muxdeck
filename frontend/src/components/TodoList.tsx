import { useState, useEffect } from 'react';
import { Todo } from '../types/Todo';
import * as TodoService from '../services/TodoService';

interface TodoListProps {
  workspaceId: string;
}

export function TodoList({ workspaceId }: TodoListProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTodos();
  }, [workspaceId]);

  async function loadTodos() {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedTodos = await TodoService.fetchTodos(workspaceId);
      setTodos(fetchedTodos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load todos');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) return;

    try {
      const newTodo = await TodoService.createTodo(workspaceId, { text });
      setTodos([...todos, newTodo]);
      setNewTodoText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create todo');
    }
  }

  async function handleToggleComplete(todo: Todo) {
    try {
      const updatedTodo = await TodoService.updateTodo(
        workspaceId,
        todo.id,
        { completed: !todo.completed }
      );
      setTodos(todos.map(t => (t.id === todo.id ? updatedTodo : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update todo');
    }
  }

  async function handleDeleteTodo(todoId: string) {
    try {
      await TodoService.deleteTodo(workspaceId, todoId);
      setTodos(todos.filter(t => t.id !== todoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete todo');
    }
  }

  if (isLoading) {
    return (
      <div className="bg-slate-700/50 backdrop-blur-sm rounded-lg p-3 border border-slate-600/30">
        <div className="text-xs text-slate-400 animate-pulse">Loading todos...</div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-700/40 via-slate-800/30 to-slate-700/40 backdrop-blur-sm rounded-lg border border-slate-600/30 shadow-lg overflow-hidden">
      <div className="bg-slate-800/50 px-3 py-2 border-b border-slate-600/30">
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Tasks</h3>
      </div>

      <div className="p-3 space-y-2">
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded border border-red-800/30">
            {error}
          </div>
        )}

        <form onSubmit={handleAddTodo} className="flex gap-2">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            placeholder="Add new task..."
            className="flex-1 bg-slate-900/50 text-slate-200 text-xs px-3 py-2 rounded border border-slate-600/30
                     placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50
                     transition-all"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600
                     text-white text-xs font-medium rounded transition-all duration-200 shadow-sm hover:shadow-md
                     active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!newTodoText.trim()}
          >
            Add
          </button>
        </form>

        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
          {todos.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4 italic">
              No tasks yet. Add one above.
            </div>
          ) : (
            todos.map((todo) => (
              <div
                key={todo.id}
                className="group flex items-start gap-2 bg-slate-800/30 hover:bg-slate-700/40 p-2 rounded
                         border border-slate-600/20 hover:border-slate-500/30 transition-all duration-200"
              >
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => handleToggleComplete(todo)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-500 bg-slate-900/50 text-blue-600
                           focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-all"
                />
                <span
                  onClick={() => handleToggleComplete(todo)}
                  className={`flex-1 text-xs cursor-pointer select-none transition-all ${
                    todo.completed
                      ? 'text-slate-500 line-through'
                      : 'text-slate-300 hover:text-slate-200'
                  }`}
                >
                  {todo.text}
                </span>
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400
                           transition-all text-xs font-bold w-5 h-5 flex items-center justify-center
                           rounded hover:bg-red-900/20"
                  title="Delete task"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.7);
        }
      `}</style>
    </div>
  );
}
