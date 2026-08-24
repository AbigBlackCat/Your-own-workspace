import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { WorkspaceState } from "./workspace-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type SaveHandler = () => Promise<void> | void;

type WorkspaceContextValue = {
  data: WorkspaceState;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  run: <T>(operation: () => Promise<T>) => Promise<T>;
  saveNow: () => Promise<void>;
  registerSaveHandler: (handler: SaveHandler) => () => void;
  refresh: () => Promise<void>;
};

const emptyState: WorkspaceState = {
  planItems: [], quickMemos: [], mediaContents: [], devProjects: [], devMilestones: [], devWorkItems: [], devLogs: [],
  clients: [], consultingProjects: [], consultingInteractions: [], consultingDeliverables: [], consultingFollowups: [], consultingTimeEntries: [],
  workoutTemplates: [], workoutTemplateExercises: [], workouts: [], workoutExercises: [], workoutSets: [], bodyMetrics: [], nutritionTargets: [],
  foods: [], meals: [], mealItems: [], readingBooks: [], readingDays: [], readingNotes: [], readingBookDays: [], readingSyncs: [], xunjiSyncs: [], settings: {}, trash: [],
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveHandlers = useRef(new Set<SaveHandler>());
  const query = useQuery({ queryKey: ["workspace"], queryFn: api.state, staleTime: 15_000 });

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const refreshSavedData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["system"] }),
      queryClient.invalidateQueries({ queryKey: ["backups"] }),
    ]);
  }, [queryClient]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setSaveStatus("saving");
    try {
      const result = await operation();
      await refreshSavedData();
      setSaveStatus("saved");
      return result;
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [refreshSavedData]);

  const registerSaveHandler = useCallback((handler: SaveHandler) => {
    saveHandlers.current.add(handler);
    return () => saveHandlers.current.delete(handler);
  }, []);

  const saveNow = useCallback(async () => {
    setSaveStatus("saving");
    try {
      for (const handler of [...saveHandlers.current]) await handler();
      await refreshSavedData();
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [refreshSavedData]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    data: query.data ?? emptyState,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    saveStatus,
    run,
    saveNow,
    registerSaveHandler,
    refresh: async () => {
      await queryClient.invalidateQueries();
    },
  }), [query.data, query.isLoading, query.error, queryClient, registerSaveHandler, run, saveNow, saveStatus]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}
