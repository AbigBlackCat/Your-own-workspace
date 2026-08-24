import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';

import { WorkspaceService, type Entity, type WorkspaceState } from './workspace.service';

const trainApiUrl = 'https://trains.xunjiapp.cn/api_trains_for_llm_v2';

export type XunjiSyncResult = { syncedAt: string; startDate: string; endDate: string; trainCount: number };

@Injectable()
export class XunjiService {
  constructor(private readonly workspace: WorkspaceService) {}

  async status(userId: string): Promise<XunjiSyncResult | null> {
    const state = await this.workspace.state(userId);
    const row = active(state.xunjiSyncs).sort((a, b) => String(b.synced_at).localeCompare(String(a.synced_at)))[0];
    return row ? { syncedAt: row.synced_at, startDate: row.start_date, endDate: row.end_date, trainCount: number(row.train_count) } : null;
  }

  async sync(userId: string, input: { startDate?: string; endDate?: string } = {}): Promise<XunjiSyncResult> {
    const endDate = input.endDate ?? localDate();
    const startDate = input.startDate ?? shiftDate(endDate, -89);
    validateRange(startDate, endDate);
    const responses = await batchMap(datesBetween(startDate, endDate), 3, async (date) => ({ date, payload: await requestXunjiTraining(date) }));
    const trains = responses.flatMap(({ date, payload }) => trainsFromResponse(payload).map((train: any, index: number) => ({ train, date, index })));
    const state = await this.workspace.rawState(userId);
    const now = new Date().toISOString();
    for (const item of trains) upsertTrain(state, item.train, item.date, item.index, now);
    state.xunjiSyncs.unshift({
      id: randomUUID(), synced_at: now, start_date: startDate, end_date: endDate, train_count: trains.length,
      created_at: now, updated_at: now, deleted_at: null,
    });
    await this.workspace.replaceState(userId, state);
    return { syncedAt: now, startDate, endDate, trainCount: trains.length };
  }
}

async function requestXunjiTraining(date: string): Promise<any> {
  const key = process.env.XUNJI_TRAINING_API_KEY?.trim();
  if (!key) throw new BadRequestException('训记私有密钥尚未配置');
  const response = await fetch(trainApiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema_version: 'train_open_api_v2', datestr: date, include_full_data: false }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new BadRequestException(payload?.message ?? payload?.errmsg ?? '训记训练数据暂时无法访问，请稍后再试');
  if (!payload?.res) throw new BadRequestException(payload?.message ?? payload?.errmsg ?? '训记没有返回可导入的训练数据');
  return payload;
}

function upsertTrain(state: WorkspaceState, train: any, date: string, index: number, now: string): void {
  const xunjiLocalId = String(train.localid ?? train.localId ?? train.id ?? `xunji:${date}:${number(train.start)}:${index}`);
  let workout = active(state.workouts).find((item) => item.xunji_localid === xunjiLocalId);
  const workoutId = workout?.id ?? randomUUID();
  const startedAt = isoTime(train.start);
  const completedAt = isoTime(train.end);
  const durationSeconds = durationFrom(train, startedAt, completedAt);
  const status = completedAt || train.done === true || String(train.status ?? '').toLowerCase() === 'completed' ? 'completed' : 'in_progress';
  const fields = {
    template_id: workout?.template_id ?? null,
    name: String(train.title ?? train.name ?? '训记训练'),
    body_part: String(train.bodyPart ?? train.body_part ?? ''),
    workout_date: date,
    status,
    feeling: noteText(train.note),
    started_at: startedAt,
    completed_at: completedAt,
    source_system: 'xunji',
    xunji_localid: xunjiLocalId,
    duration_seconds: durationSeconds,
    updated_at: now,
    deleted_at: null,
  };
  if (workout) Object.assign(workout, fields);
  else {
    workout = { id: workoutId, ...fields, created_at: now };
    state.workouts.unshift(workout);
  }

  const oldExerciseIds = new Set(state.workoutExercises.filter((item: Entity) => item.workout_id === workoutId).map((item: Entity) => item.id));
  state.workoutExercises = state.workoutExercises.filter((item: Entity) => item.workout_id !== workoutId);
  state.workoutSets = state.workoutSets.filter((item: Entity) => !oldExerciseIds.has(item.workout_exercise_id));
  const movements = Array.isArray(train.movements) ? train.movements : [];
  for (const [movementIndex, movement] of movements.entries()) {
    const exerciseId = randomUUID();
    state.workoutExercises.push({
      id: exerciseId,
      workout_id: workoutId,
      name: String(movement.name ?? '未命名动作'),
      sort_order: movementIndex,
      rest_seconds: numberOrNull(movement.restTime),
      difficulty: normaliseDifficulty(movement.difficulty),
      metrics_json: json(movement.metrics),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    const sourceSets = Array.isArray(movement.sets) ? movement.sets : [];
    const flattened = sourceSets.flatMap((set: any) => Array.isArray(set.items) && set.items.length ? set.items.map((item: any) => item.set ?? item) : [set]);
    for (const [setIndex, set] of flattened.entries()) {
      state.workoutSets.push({
        id: randomUUID(),
        workout_exercise_id: exerciseId,
        set_number: setIndex + 1,
        reps: numberOrNull(set.reps),
        weight: numberOrNull(set.weight ?? set.weight_kg),
        completed: set.done === false ? 0 : 1,
        unit: String(set.unit ?? 'kg'),
        rpe: normaliseRpe(set.rpe),
        rest_seconds: numberOrNull(set.restSeconds),
        duration_seconds: numberOrNull(set.time ?? set.duration_s ?? set.metrics?.workoutTime ?? movement.metrics?.workoutTime ?? movement.duration_s),
        self_weight: set.selfWeight ? 1 : 0,
        metrics_json: json(set.metrics),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
    }
  }
}

function trainsFromResponse(payload: any): any[] { const value = payload?.res ?? payload; if (Array.isArray(value?.trains)) return value.trains; return Array.isArray(value) ? value : []; }
async function batchMap<T, R>(items: T[], size: number, operation: (item: T) => Promise<R>): Promise<R[]> { const output: R[] = []; for (let index = 0; index < items.length; index += size) output.push(...await Promise.all(items.slice(index, index + size).map(operation))); return output; }
function validateRange(startDate: string, endDate: string): void { if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) throw new BadRequestException('同步日期范围无效'); if (datesBetween(startDate, endDate).length > 92) throw new BadRequestException('单次最多同步 92 天训练记录'); }
function datesBetween(startDate: string, endDate: string): string[] { const dates: string[] = []; for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) dates.push(date); return dates; }
function isDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)); }
function shiftDate(date: string, days: number): string { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function localDate(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function active(rows: Entity[]): Entity[] { return rows.filter((row) => !row.deleted_at); }
function number(value: unknown): number { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function numberOrNull(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const result = Number(value); return Number.isFinite(result) ? result : null; }
function isoTime(value: unknown): string | null { const timestamp = number(value); if (!timestamp) return null; return new Date(timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp).toISOString(); }
function durationFrom(train: any, startedAt: string | null, completedAt: string | null): number | null { if (startedAt && completedAt) return Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000)); return numberOrNull(train.duration_s ?? train.duration ?? train.workoutTime); }
function normaliseDifficulty(value: unknown): string { return ['easy', 'normal', 'hard'].includes(String(value)) ? String(value) : ''; }
function normaliseRpe(value: unknown): string { const parsed = String(value ?? ''); return /^(6|6\.5|7|7\.5|8|8\.5|9|9\.5|10)$/.test(parsed) ? parsed : ''; }
function json(value: unknown): string { try { return JSON.stringify(value ?? {}); } catch { return '{}'; } }
function noteText(value: unknown): string { if (value && typeof value === 'object') return String((value as Record<string, unknown>).text ?? ''); if (typeof value !== 'string') return ''; try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? String(parsed.text ?? '') : value; } catch { return value; } }
