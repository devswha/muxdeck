export type BacklogItemType = 'bug' | 'feature' | 'improvement';
export type BacklogPriority = 'low' | 'medium' | 'high';
export type BacklogStatus = 'pending' | 'in_progress' | 'done';

export interface BacklogItem {
  id: string;
  type: BacklogItemType;
  title: string;
  description?: string;
  priority: BacklogPriority;
  status: BacklogStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBacklogItemRequest {
  type: BacklogItemType;
  title: string;
  description?: string;
  priority?: BacklogPriority;
}

export interface UpdateBacklogItemRequest {
  type?: BacklogItemType;
  title?: string;
  description?: string;
  priority?: BacklogPriority;
  status?: BacklogStatus;
}
