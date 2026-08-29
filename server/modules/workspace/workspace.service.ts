import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';

import { workspaceDocument } from '../../database/schema';
import {
  collectionDefinitions,
  isCollectionName,
  sourceCollectionByType,
  type CollectionName,
} from './collection-definitions';

export type Entity = Record<string, any> & { id: string };
export type WorkspaceState = Record<string, any> & {
  settings: Record<string, any>;
  trash: Entity[];
  dailyReviews: Entity[];
};

const emptyCollections = Object.keys(collectionDefinitions) as CollectionName[];

@Injectable()
export class WorkspaceService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async state(userId: string): Promise<WorkspaceState> {
    const state = await this.rawState(userId);
    const visible = structuredClone(state);
    for (const collection of emptyCollections) visible[collection] = (visible[collection] as Entity[]).filter((row) => !row.deleted_at);
    return visible;
  }

  async rawState(userId: string): Promise<WorkspaceState> {
    const document = await this.getOrCreateDocument(userId);
    return normalizeState(document.state as Record<string, any>);
  }

  async ownerIds(): Promise<string[]> {
    const rows = await this.db.select({ ownerProfile: workspaceDocument.ownerProfile }).from(workspaceDocument);
    return rows.map((row) => row.ownerProfile).filter(Boolean);
  }

  async dashboard(userId: string, date: string): Promise<Record<string, any>> {
    const state = await this.state(userId);
    const planItems: Entity[] = this.listFromState(state, 'planItems').map((item) => ({
      ...item,
      display_title: this.sourceTitle(state, item.source_entity_type, item.source_entity_id) || item.title,
    } as Entity));
    const todayItems = planItems.filter((item) => item.plan_date === date && item.status !== 'cancelled');
    const timeline = todayItems.filter((item) => item.start_time).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    const unscheduled = todayItems.filter((item) => !item.start_time);
    const completed = todayItems.filter((item) => item.status === 'done').length;
    const horizon = plusDays(date, 3);
    const attention: Entity[] = [
      ...planItems
        .filter((item) => item.plan_date < date && !['done', 'cancelled'].includes(item.status))
        .map((item) => ({ ...item, attention_type: 'overdue', module: 'today' })),
      ...this.listFromState(state, 'consultingDeliverables')
        .filter((item) => item.due_date && item.due_date <= horizon && item.status !== 'done')
        .map((item) => ({ ...item, attention_type: 'deliverable', module: 'consulting' })),
      ...this.listFromState(state, 'consultingFollowups')
        .filter((item) => item.followup_at?.slice(0, 10) <= date && item.status !== 'done')
        .map((item) => ({ ...item, attention_type: 'followup', module: 'consulting', title: item.content })),
      ...this.listFromState(state, 'workouts')
        .filter((item) => item.workout_date === date && item.status !== 'completed')
        .map((item) => ({ ...item, attention_type: 'workout', module: 'fitness', title: item.name })),
    ];
    const summaries = {
      media: this.listFromState(state, 'mediaContents').filter((item) => ['producing', 'ready'].includes(item.stage)).slice(0, 3),
      development: this.listFromState(state, 'devWorkItems').filter((item) => item.priority === 'high' && item.status !== 'done').slice(0, 3),
      consulting: this.listFromState(state, 'consultingFollowups').filter((item) => item.status !== 'done').slice(0, 3),
      fitness: this.listFromState(state, 'workouts').filter((item) => item.workout_date >= date).slice(0, 3),
      diet: this.listFromState(state, 'meals').filter((item) => item.meal_date === date).slice(0, 4),
      reading: this.listFromState(state, 'readingBooks').filter((item) => Number(item.progress ?? 0) > 0 && Number(item.finished ?? 0) !== 1).slice(0, 3),
    };
    return {
      date,
      overview: {
        completed,
        total: todayItems.length,
        progress: todayItems.length ? Math.round((completed / todayItems.length) * 100) : 0,
        scheduledMinutes: todayItems.reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0),
      },
      timeline,
      unscheduled,
      attention: attention.slice(0, 12),
      summaries,
    };
  }

  async search(userId: string, query: string): Promise<Entity[]> {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalized) return [];
    const state = await this.state(userId);
    const results: Entity[] = [];
    for (const [name, definition] of Object.entries(collectionDefinitions) as Array<[CollectionName, any]>) {
      if (!definition.search.length) continue;
      for (const row of this.listFromState(state, name)) {
        if (!definition.search.some((field: string) => String(row[field] ?? '').toLocaleLowerCase('zh-CN').includes(normalized))) continue;
        results.push({
          id: row.id,
          title: row[definition.title],
          updated_at: row.updated_at,
          collection: name,
          module: definition.module,
        });
      }
    }
    return results.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))).slice(0, 80);
  }

  async create(userId: string, name: string, input: Record<string, any>): Promise<Entity> {
    const collection = this.assertCollection(name);
    return this.mutate(userId, (state) => {
      const definition = collectionDefinitions[collection] as any;
      const clean = this.sanitize(collection, input);
      this.requireFields(definition.required, clean);
      const now = new Date().toISOString();
      const row = { id: randomUUID(), ...clean, created_at: now, updated_at: now, deleted_at: null } as Entity;
      state[collection].unshift(row);
      return row;
    });
  }

  async update(userId: string, name: string, id: string, input: Record<string, any>): Promise<Entity> {
    const collection = this.assertCollection(name);
    return this.mutate(userId, (state) => this.updateInState(state, collection, id, input));
  }

  async softDelete(userId: string, name: string, id: string): Promise<Entity> {
    const collection = this.assertCollection(name);
    return this.mutate(userId, (state) => {
      const row = this.getFromState(state, collection, id);
      if (row.deleted_at) throw new NotFoundException('没有找到这条记录');
      const now = new Date().toISOString();
      row.deleted_at = now;
      row.updated_at = now;
      const definition = collectionDefinitions[collection] as any;
      state.trash = state.trash.filter((item) => !(item.collection === collection && item.entity_id === id));
      state.trash.unshift({
        id: randomUUID(),
        collection,
        entity_id: id,
        display_title: String(row[definition.title] ?? '未命名记录'),
        deleted_at: now,
      });
      return row;
    });
  }

  async restore(userId: string, name: string, id: string): Promise<Entity> {
    const collection = this.assertCollection(name);
    return this.mutate(userId, (state) => {
      const row = this.getFromState(state, collection, id, true);
      row.deleted_at = null;
      row.updated_at = new Date().toISOString();
      state.trash = state.trash.filter((item) => !(item.collection === collection && item.entity_id === id));
      return row;
    });
  }

  async permanentDelete(userId: string, name: string, id: string): Promise<void> {
    const collection = this.assertCollection(name);
    await this.mutate(userId, (state) => {
      const index = state[collection].findIndex((row: Entity) => row.id === id && row.deleted_at);
      if (index < 0) throw new NotFoundException('没有找到已删除记录');
      state[collection].splice(index, 1);
      state.trash = state.trash.filter((item) => !(item.collection === collection && item.entity_id === id));
    });
  }

  async completePlan(userId: string, id: string): Promise<Entity> {
    return this.mutate(userId, (state) => {
      const item = this.getFromState(state, 'planItems', id);
      const now = new Date().toISOString();
      const updated = this.updateInState(state, 'planItems', id, { status: 'done', completed_at: now });
      if (item.complete_source && item.source_entity_type && item.source_entity_id) {
        const collection = sourceCollectionByType[item.source_entity_type];
        if (collection) {
          const source = this.getFromState(state, collection, item.source_entity_id);
          if (Object.hasOwn(source, 'status')) {
            source.status = collection === 'workouts' ? 'completed' : 'done';
            source.updated_at = now;
          }
        }
      }
      return updated;
    });
  }

  async postponePlan(userId: string, id: string, date: string): Promise<Entity> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('日期格式无效');
    return this.mutate(userId, (state) => this.updateInState(state, 'planItems', id, { plan_date: date, status: 'todo', completed_at: null }));
  }

  async getReview(userId: string, date: string): Promise<Entity | null> {
    const state = await this.state(userId);
    return state.dailyReviews.find((row) => row.review_date === date) ?? null;
  }

  async setReview(userId: string, date: string, content: string): Promise<Entity> {
    return this.mutate(userId, (state) => {
      const now = new Date().toISOString();
      let review = state.dailyReviews.find((row) => row.review_date === date);
      if (review) {
        review.content = content;
        review.updated_at = now;
      } else {
        review = { id: date, review_date: date, content, created_at: now, updated_at: now };
        state.dailyReviews.unshift(review);
      }
      const metaId = `daily-review:${date}`;
      const metacognition = state.dailyMetacognitions.find((row) => row.id === metaId);
      if (metacognition) {
        metacognition.content = content;
        metacognition.updated_at = now;
        metacognition.deleted_at = null;
      } else {
        state.dailyMetacognitions.unshift({
          id: metaId,
          entry_date: date,
          content,
          source_type: 'daily_review',
          source_id: date,
          created_at: review.created_at ?? now,
          updated_at: now,
          deleted_at: null,
        });
      }
      return review;
    });
  }

  async convertMemo(userId: string, id: string, target: string, fields: Record<string, any>): Promise<Entity> {
    const collection = this.assertCollection(target);
    return this.mutate(userId, (state) => {
      const memo = this.getFromState(state, 'quickMemos', id);
      const definition = collectionDefinitions[collection] as any;
      const clean = this.sanitize(collection, { ...fields, [definition.title]: fields[definition.title] ?? memo.content });
      this.requireFields(definition.required, clean);
      const now = new Date().toISOString();
      const created = { id: randomUUID(), ...clean, created_at: now, updated_at: now, deleted_at: null } as Entity;
      state[collection].unshift(created);
      memo.converted_type = collection;
      memo.converted_id = created.id;
      memo.archived_at = now;
      memo.updated_at = now;
      return created;
    });
  }

  async getSettings(userId: string): Promise<Record<string, any>> {
    return (await this.state(userId)).settings;
  }

  async saveSettings(userId: string, input: Record<string, any>): Promise<Record<string, any>> {
    if (Object.keys(input).some((key) => /(secret|token|password|cookie|api[_-]?key|authorization|credential)/i.test(key))) {
      throw new BadRequestException('密钥只能保存在妙搭私有环境变量中');
    }
    return this.mutate(userId, (state) => {
      state.settings = { ...state.settings, ...input };
      return state.settings;
    });
  }

  async replaceState(userId: string, nextState: WorkspaceState): Promise<void> {
    const document = await this.getOrCreateDocument(userId);
    const now = new Date();
    await this.db.update(workspaceDocument).set({
      state: normalizeState(nextState),
      updatedAt: now,
      updatedBy: userId,
    }).where(and(eq(workspaceDocument.id, document.id), eq(workspaceDocument.ownerProfile, userId)));
  }

  private async mutate<T>(userId: string, operation: (state: WorkspaceState) => T): Promise<T> {
    if (!userId) throw new BadRequestException('请先登录飞书账号');
    const document = await this.getOrCreateDocument(userId);
    const state = normalizeState(structuredClone(document.state as Record<string, any>));
    const result = operation(state);
    const now = new Date();
    await this.db.update(workspaceDocument).set({ state, updatedAt: now, updatedBy: userId })
      .where(and(eq(workspaceDocument.id, document.id), eq(workspaceDocument.ownerProfile, userId)));
    return result;
  }

  private async getOrCreateDocument(userId: string): Promise<typeof workspaceDocument.$inferSelect> {
    if (!userId) throw new BadRequestException('请先登录飞书账号');
    const [existing] = await this.db.select().from(workspaceDocument).where(eq(workspaceDocument.ownerProfile, userId)).limit(1);
    if (existing) return existing;
    const now = new Date();
    const [created] = await this.db.insert(workspaceDocument).values({
      ownerProfile: userId,
      schemaVersion: 'barry_workspace_v1',
      state: normalizeState({}),
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
    }).returning();
    return created;
  }

  private assertCollection(name: string): CollectionName {
    if (!isCollectionName(name)) throw new NotFoundException('模块不存在');
    return name;
  }

  private listFromState(state: WorkspaceState, name: CollectionName, includeDeleted = false): Entity[] {
    return (state[name] as Entity[]).filter((row) => includeDeleted || !row.deleted_at);
  }

  private getFromState(state: WorkspaceState, name: CollectionName, id: string, includeDeleted = false): Entity {
    const row = (state[name] as Entity[]).find((item) => item.id === id && (includeDeleted || !item.deleted_at));
    if (!row) throw new NotFoundException('没有找到这条记录');
    return row;
  }

  private updateInState(state: WorkspaceState, name: CollectionName, id: string, input: Record<string, any>): Entity {
    const row = this.getFromState(state, name, id, true);
    const clean = this.sanitize(name, input);
    if (!Object.keys(clean).length) throw new BadRequestException('没有可更新的内容');
    Object.assign(row, clean, { updated_at: new Date().toISOString() });
    return row;
  }

  private sanitize(name: CollectionName, input: Record<string, any>): Record<string, any> {
    const allowed = new Set<string>((collectionDefinitions[name] as any).fields);
    return Object.fromEntries(Object.entries(input)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  }

  private requireFields(required: readonly string[], input: Record<string, any>): void {
    const missing = required.filter((field) => input[field] === undefined || input[field] === null || input[field] === '');
    if (missing.length) throw new BadRequestException(`请填写必填内容：${missing.join('、')}`);
  }

  private sourceTitle(state: WorkspaceState, type: string | null, id: string | null): string | null {
    if (!type || !id) return null;
    const collection = sourceCollectionByType[type];
    if (!collection) return null;
    const row = (state[collection] as Entity[]).find((item) => item.id === id && !item.deleted_at);
    if (!row) return null;
    return String(row[(collectionDefinitions[collection] as any).title] ?? '');
  }
}

export function normalizeState(input: Record<string, any>): WorkspaceState {
  const state = { ...input } as WorkspaceState;
  for (const collection of emptyCollections) {
    if (!Array.isArray(state[collection])) state[collection] = [];
  }
  if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) state.settings = {};
  if (!Array.isArray(state.trash)) state.trash = [];
  if (!Array.isArray(state.dailyReviews)) state.dailyReviews = [];
  for (const review of state.dailyReviews) {
    if (!review?.review_date || !String(review.content ?? '').trim()) continue;
    const id = `daily-review:${review.review_date}`;
    if ((state.dailyMetacognitions as Entity[]).some((entry) => entry.id === id)) continue;
    (state.dailyMetacognitions as Entity[]).push({
      id,
      entry_date: review.review_date,
      content: review.content,
      source_type: 'daily_review',
      source_id: review.review_date,
      created_at: review.created_at ?? review.updated_at ?? `${review.review_date}T12:00:00.000Z`,
      updated_at: review.updated_at ?? review.created_at ?? `${review.review_date}T12:00:00.000Z`,
      deleted_at: null,
    });
  }
  return state;
}

function plusDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
