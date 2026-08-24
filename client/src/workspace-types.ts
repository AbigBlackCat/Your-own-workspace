export type Entity = Record<string, any> & { id: string };

export type WorkspaceState = {
  planItems: Entity[];
  quickMemos: Entity[];
  mediaContents: Entity[];
  devProjects: Entity[];
  devMilestones: Entity[];
  devWorkItems: Entity[];
  devLogs: Entity[];
  clients: Entity[];
  consultingProjects: Entity[];
  consultingInteractions: Entity[];
  consultingDeliverables: Entity[];
  consultingFollowups: Entity[];
  consultingTimeEntries: Entity[];
  workoutTemplates: Entity[];
  workoutTemplateExercises: Entity[];
  workouts: Entity[];
  workoutExercises: Entity[];
  workoutSets: Entity[];
  bodyMetrics: Entity[];
  nutritionTargets: Entity[];
  foods: Entity[];
  meals: Entity[];
  mealItems: Entity[];
  readingBooks: Entity[];
  readingDays: Entity[];
  readingNotes: Entity[];
  readingBookDays: Entity[];
  readingSyncs: Entity[];
  xunjiSyncs: Entity[];
  settings: Record<string, any>;
  trash: Entity[];
};

export type CollectionName = Exclude<keyof WorkspaceState, "settings" | "trash">;

export type DashboardData = {
  date: string;
  overview: { completed: number; total: number; progress: number; scheduledMinutes: number };
  timeline: Entity[];
  unscheduled: Entity[];
  attention: Entity[];
  summaries: Record<string, Entity[]>;
};

export type BackupRecord = {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
  type: "manual" | "automatic" | "safety";
  label: string;
  keep: boolean;
};
