export type PlanStatus = 'todo' | 'doing' | 'done' | 'cancelled';

export interface PlanScheduleSnapshot {
  date: string;
  title: string;
  startTime: string;
  estimatedMinutes: number;
  priority: string;
  movedTo: string;
  changedAt: string;
}

export interface PostponePlanInput { date: string }

export interface ReviewInput { content: string }
