import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceStorage } from './WorkspaceStorage.js';

export class MigrationService {
  private readonly migrationPath: string;
  private readonly workspaceStorage: WorkspaceStorage;

  constructor() {
    this.migrationPath = path.join(os.homedir(), '.session-manager', 'migration.json');
    this.workspaceStorage = new WorkspaceStorage();
  }

  async runMigrations(): Promise<void> {
    const state = this.loadMigrationState();

    if (!state.v1_default_workspace) {
      await this.migrateV1DefaultWorkspace();
      state.v1_default_workspace = true;
      this.saveMigrationState(state);
    }
  }

  private async migrateV1DefaultWorkspace(): Promise<void> {
    const workspaces = await this.workspaceStorage.getAll();

    // Create Default workspace if none exist
    if (workspaces.length === 0) {
      await this.workspaceStorage.create({
        name: 'Default',
        description: 'Default workspace for existing sessions'
      });
      console.log('[Migration] Created Default workspace');
    }
  }

  private loadMigrationState(): Record<string, boolean> {
    try {
      if (fs.existsSync(this.migrationPath)) {
        return JSON.parse(fs.readFileSync(this.migrationPath, 'utf-8'));
      }
    } catch (error) {
      console.error('[Migration] Failed to load state:', error);
    }
    return {};
  }

  private saveMigrationState(state: Record<string, boolean>): void {
    const dir = path.dirname(this.migrationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.migrationPath, JSON.stringify(state, null, 2));
  }
}
