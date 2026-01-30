import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type {
  Todo,
  CreateTodoRequest,
  UpdateTodoRequest,
} from '../types/Todo.js';

interface TodoFile {
  version: number;
  todos: Todo[];
}

export class TodoStorage {
  private readonly storagePath: string;

  constructor() {
    this.storagePath = path.join(
      os.homedir(),
      '.session-manager',
      'todos.json'
    );
  }

  /**
   * Ensure the storage directory and file exist
   */
  private async ensureStorage(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.storagePath);
    } catch {
      // File doesn't exist, create initial structure
      const initial: TodoFile = {
        version: 1,
        todos: [],
      };
      await this.writeFile(initial);
    }
  }

  /**
   * Read todos from file
   */
  private async readFile(): Promise<TodoFile> {
    await this.ensureStorage();
    const content = await fs.readFile(this.storagePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Write todos to file atomically
   */
  private async writeFile(data: TodoFile): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${this.storagePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, this.storagePath);
  }

  /**
   * Get all todos for a workspace
   */
  async getByWorkspace(workspaceId: string): Promise<Todo[]> {
    const data = await this.readFile();
    return data.todos.filter((t) => t.workspaceId === workspaceId);
  }

  /**
   * Get todo by ID
   */
  async getById(id: string): Promise<Todo | null> {
    const data = await this.readFile();
    return data.todos.find((t) => t.id === id) || null;
  }

  /**
   * Create a new todo
   */
  async create(
    workspaceId: string,
    request: CreateTodoRequest
  ): Promise<Todo> {
    const data = await this.readFile();

    const now = new Date().toISOString();
    const todo: Todo = {
      id: crypto.randomUUID(),
      workspaceId,
      text: request.text,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    data.todos.push(todo);
    await this.writeFile(data);

    return todo;
  }

  /**
   * Update an existing todo
   */
  async update(
    workspaceId: string,
    todoId: string,
    request: UpdateTodoRequest
  ): Promise<Todo | null> {
    const data = await this.readFile();
    const index = data.todos.findIndex(
      (t) => t.id === todoId && t.workspaceId === workspaceId
    );

    if (index === -1) {
      return null;
    }

    const todo = data.todos[index];
    const updated: Todo = {
      ...todo,
      text: request.text ?? todo.text,
      completed: request.completed ?? todo.completed,
      updatedAt: new Date().toISOString(),
    };

    data.todos[index] = updated;
    await this.writeFile(data);

    return updated;
  }

  /**
   * Delete a todo
   */
  async delete(workspaceId: string, todoId: string): Promise<boolean> {
    const data = await this.readFile();
    const initialLength = data.todos.length;
    data.todos = data.todos.filter(
      (t) => !(t.id === todoId && t.workspaceId === workspaceId)
    );

    if (data.todos.length === initialLength) {
      return false;
    }

    await this.writeFile(data);
    return true;
  }

  /**
   * Delete all todos for a workspace
   */
  async deleteByWorkspaceId(workspaceId: string): Promise<number> {
    const data = await this.readFile();
    const initialLength = data.todos.length;
    data.todos = data.todos.filter((t) => t.workspaceId !== workspaceId);

    const deletedCount = initialLength - data.todos.length;
    if (deletedCount > 0) {
      await this.writeFile(data);
    }

    return deletedCount;
  }
}
