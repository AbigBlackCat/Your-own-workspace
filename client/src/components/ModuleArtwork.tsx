import { classNames } from "../workspace-utils";
import { Barbell, BookOpen, CalendarBlank, ChartLine, Database, ForkKnife, GitBranch, SquaresFour, Users } from "../icons";

const moduleArtwork = {
  dashboard: SquaresFour,
  today: CalendarBlank,
  media: ChartLine,
  development: GitBranch,
  consulting: Users,
  fitness: Barbell,
  diet: ForkKnife,
  settings: Database,
  reading: BookOpen,
} as const;

export type ModuleArtworkName = keyof typeof moduleArtwork;

export function ModuleArtwork({ module, label, className, loading = "eager" }: {
  module: ModuleArtworkName;
  label?: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  void loading;
  const Icon = moduleArtwork[module];
  return <Icon className={classNames("module-artwork", module === "reading" && "reading-artwork", className)} aria-label={label} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} />;
}
