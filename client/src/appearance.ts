export type Appearance = "liquid" | "notebook" | "neo";

export function normalizeAppearance(value: unknown): Appearance {
  return value === "notebook" || value === "neo" ? value : "liquid";
}
