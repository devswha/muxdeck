import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type {
  Workspace,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
} from '../types/Workspace.js';

interface WorkspaceFile {
  version: number;
  workspaces: Workspace[];
}

export class WorkspaceStorage {
  private readonly storagePath: string;

  constructor() {
    this.storagePath = path.join(
      os.homedir(),
      '.session-manager',
      'workspaces.json'
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
      const initial: WorkspaceFile = {
        version: 1,
        workspaces: [],
      };
      await this.writeFile(initial);
    }
  }

  /**
   * Read workspaces from file
   */
  private async readFile(): Promise<WorkspaceFile> {
    await this.ensureStorage();
    const content = await fs.readFile(this.storagePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Write workspaces to file atomically
   */
  private async writeFile(data: WorkspaceFile): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${this.storagePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, this.storagePath);
  }

  /**
   * Get all workspaces
   */
  async getAll(): Promise<Workspace[]> {
    const data = await this.readFile();
    return data.workspaces;
  }

  /**
   * Get workspace by ID
   */
  async getById(id: string): Promise<Workspace | null> {
    const data = await this.readFile();
    return data.workspaces.find((w) => w.id === id) || null;
  }

  /**
   * Create a new workspace
   */
  async create(request: CreateWorkspaceRequest): Promise<Workspace> {
    const data = await this.readFile();

    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: request.name,
      description: request.description,
      createdAt: now,
      updatedAt: now,
    };

    data.workspaces.push(workspace);
    await this.writeFile(data);

    return workspace;
  }

  /**
   * Update an existing workspace
   */
  async update(
    id: string,
    request: UpdateWorkspaceRequest
  ): Promise<Workspace | null> {
    const data = await this.readFile();
    const index = data.workspaces.findIndex((w) => w.id === id);

    if (index === -1) {
      return null;
    }

    const workspace = data.workspaces[index];
    const updated: Workspace = {
      ...workspace,
      name: request.name ?? workspace.name,
      description: request.description ?? workspace.description,
      updatedAt: new Date().toISOString(),
    };

    data.workspaces[index] = updated;
    await this.writeFile(data);

    return updated;
  }

  /**
   * Delete a workspace
   */
  async delete(id: string): Promise<boolean> {
    const data = await this.readFile();
    const initialLength = data.workspaces.length;
    data.workspaces = data.workspaces.filter((w) => w.id !== id);

    if (data.workspaces.length === initialLength) {
      return false;
    }

    await this.writeFile(data);
    return true;
  }
}
