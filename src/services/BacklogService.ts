import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BacklogItem, CreateBacklogItemRequest, UpdateBacklogItemRequest, BacklogStatus } from '../types/Backlog.js';

export class BacklogService {
  private backlogPath: string;
  private items: BacklogItem[] = [];

  constructor() {
    this.backlogPath = path.join(os.homedir(), '.session-manager', 'backlog.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.backlogPath)) {
        const data = fs.readFileSync(this.backlogPath, 'utf-8');
        this.items = JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load backlog:', err);
      this.items = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.backlogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this.backlogPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.items, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.backlogPath);
    } catch (err) {
      console.error('Failed to save backlog:', err);
    }
  }

  private generateId(): string {
    return `bl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  getAll(status?: BacklogStatus): BacklogItem[] {
    if (status) {
      return this.items.filter(item => item.status === status);
    }
    return [...this.items];
  }

  getPending(): BacklogItem[] {
    return this.items.filter(item => item.status !== 'done');
  }

  getById(id: string): BacklogItem | undefined {
    return this.items.find(item => item.id === id);
  }

  create(request: CreateBacklogItemRequest): BacklogItem {
    const now = new Date().toISOString();
    const item: BacklogItem = {
      id: this.generateId(),
      type: request.type,
      title: request.title,
      description: request.description,
      priority: request.priority || 'medium',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.items.unshift(item); // Add to beginning
    this.save();
    return item;
  }

  update(id: string, request: UpdateBacklogItemRequest): BacklogItem | undefined {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return undefined;

    const item = this.items[index];
    const updated: BacklogItem = {
      ...item,
      ...request,
      updatedAt: new Date().toISOString(),
    };
    this.items[index] = updated;
    this.save();
    return updated;
  }

  delete(id: string): boolean {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return false;

    this.items.splice(index, 1);
    this.save();
    return true;
  }

  getStats(): { total: number; pending: number; bugs: number; features: number } {
    const pending = this.items.filter(i => i.status !== 'done');
    return {
      total: this.items.length,
      pending: pending.length,
      bugs: pending.filter(i => i.type === 'bug').length,
      features: pending.filter(i => i.type === 'feature' || i.type === 'improvement').length,
    };
  }

  exportMarkdown(): string {
    const pending = this.getPending();
    const bugs = pending.filter(i => i.type === 'bug');
    const features = pending.filter(i => i.type === 'feature');
    const improvements = pending.filter(i => i.type === 'improvement');

    let md = '# Backlog\n\n';

    if (bugs.length > 0) {
      md += '## Bugs\n\n';
      bugs.forEach(b => {
        md += `- [ ] **[${b.priority.toUpperCase()}]** ${b.title}${b.description ? ` - ${b.description}` : ''}\n`;
      });
      md += '\n';
    }

    if (features.length > 0) {
      md += '## Features\n\n';
      features.forEach(f => {
        md += `- [ ] **[${f.priority.toUpperCase()}]** ${f.title}${f.description ? ` - ${f.description}` : ''}\n`;
      });
      md += '\n';
    }

    if (improvements.length > 0) {
      md += '## Improvements\n\n';
      improvements.forEach(i => {
        md += `- [ ] **[${i.priority.toUpperCase()}]** ${i.title}${i.description ? ` - ${i.description}` : ''}\n`;
      });
    }

    return md;
  }
}

export const backlogService = new BacklogService();
