export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  created: string;
  updated: string;
  dueDate?: string;
}
