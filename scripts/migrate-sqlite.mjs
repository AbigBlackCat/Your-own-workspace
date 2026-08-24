import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";

const [snapshotPath, outputPath] = process.argv.slice(2);
if (!snapshotPath || !outputPath) {
  throw new Error("Usage: node scripts/migrate-sqlite.mjs <snapshot.sqlite> <output.json>");
}

const collectionTables = {
  planItems: "plan_items",
  quickMemos: "quick_memos",
  mediaContents: "media_contents",
  devProjects: "dev_projects",
  devMilestones: "dev_milestones",
  devWorkItems: "dev_work_items",
  devLogs: "dev_logs",
  clients: "clients",
  consultingProjects: "consulting_projects",
  consultingInteractions: "consulting_interactions",
  consultingDeliverables: "consulting_deliverables",
  consultingFollowups: "consulting_followups",
  consultingTimeEntries: "consulting_time_entries",
  workoutTemplates: "workout_templates",
  workoutTemplateExercises: "workout_template_exercises",
  workouts: "workouts",
  workoutExercises: "workout_exercises",
  workoutSets: "workout_sets",
  bodyMetrics: "body_metrics",
  nutritionTargets: "nutrition_targets",
  foods: "foods",
  meals: "meals",
  mealItems: "meal_items",
  readingBooks: "reading_books",
  readingDays: "reading_days",
  readingNotes: "reading_notes",
  readingBookDays: "reading_book_days",
  readingSyncs: "reading_syncs",
  xunjiSyncs: "xunji_syncs",
};

function query(sql) {
  const raw = execFileSync("sqlite3", ["-json", snapshotPath, sql], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
  return raw ? JSON.parse(raw) : [];
}

function parseSetting(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function containsSecretName(key) {
  return /(secret|token|password|cookie|api[_-]?key|authorization|credential)/i.test(key);
}

const integrity = query("PRAGMA integrity_check;");
if (integrity[0]?.integrity_check !== "ok") {
  throw new Error("SQLite snapshot integrity check failed");
}

const state = Object.fromEntries(
  Object.entries(collectionTables).map(([collection, table]) => [
    collection,
    query(`SELECT * FROM ${table} ORDER BY created_at DESC`),
  ]),
);

const settingRows = query("SELECT key, value, updated_at FROM settings ORDER BY key");
const excludedSettingKeys = settingRows.filter((row) => containsSecretName(row.key)).map((row) => row.key);
state.settings = Object.fromEntries(
  settingRows
    .filter((row) => !containsSecretName(row.key))
    .map((row) => [row.key, parseSetting(row.value)]),
);
state.trash = query("SELECT * FROM trash_entries ORDER BY deleted_at DESC");
state.dailyReviews = query("SELECT * FROM daily_reviews ORDER BY review_date DESC");
state._migration = {
  source: "Barry Workspace SQLite read-only snapshot",
  importedAt: new Date().toISOString(),
  snapshotSha256: createHash("sha256").update(readFileSync(snapshotPath)).digest("hex"),
  snapshotBytes: statSync(snapshotPath).size,
  schemaMigrations: query("SELECT * FROM schema_migrations ORDER BY version"),
  excludedSettingKeys,
};

writeFileSync(outputPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
chmodSync(outputPath, 0o600);

const counts = Object.fromEntries(
  Object.entries(state)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, value.length]),
);
process.stdout.write(`${JSON.stringify({ outputPath, bytes: statSync(outputPath).size, counts, excludedSettingKeys }, null, 2)}\n`);
