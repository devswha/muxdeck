export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface Todo {
  id: string;
  workspaceId: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoRequest {
  text: string;
}

export interface UpdateTodoRequest {
  text?: string;
  completed?: boolean;
}

export interface WorkspaceTodos {
  workspaceId: string;
  items: TodoItem[];
}

export interface TodosData {
  todos: WorkspaceTodos[];
}
