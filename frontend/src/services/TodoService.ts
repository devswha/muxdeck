import { Todo, CreateTodoRequest, UpdateTodoRequest } from '../types/Todo';

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('session-manager-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchTodos(workspaceId: string): Promise<Todo[]> {
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/todos`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch todos');
  }
  const data = await response.json();
  return data.todos;
}

export async function createTodo(workspaceId: string, request: CreateTodoRequest): Promise<Todo> {
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/todos`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create todo');
  }
  const data = await response.json();
  return data.todo;
}

export async function updateTodo(workspaceId: string, todoId: string, request: UpdateTodoRequest): Promise<Todo> {
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/todos/${todoId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update todo');
  }
  const data = await response.json();
  return data.todo;
}

export async function deleteTodo(workspaceId: string, todoId: string): Promise<void> {
  const token = localStorage.getItem('session-manager-token');
  const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/todos/${todoId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    // Only try to parse JSON if there's content
    const text = await response.text();
    if (text) {
      const error = JSON.parse(text);
      throw new Error(error.error || 'Failed to delete todo');
    }
    throw new Error('Failed to delete todo');
  }
}
