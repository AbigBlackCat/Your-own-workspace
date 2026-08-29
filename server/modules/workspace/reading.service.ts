import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';

import { WorkspaceService, type Entity, type WorkspaceState } from './workspace.service';

const gatewayUrl = 'https://i.weread.qq.com/api/agent/gateway';
const skillVersion = '1.0.4';

@Injectable()
export class ReadingService {
  constructor(private readonly workspace: WorkspaceService) {}

  async dashboard(userId: string): Promise<Record<string, any>> {
    return buildReadingDashboard(await this.workspace.state(userId));
  }

  async calendar(userId: string, month: string): Promise<Record<string, any>> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式无效');
    const state = await this.workspace.state(userId);
    return buildCalendar(state, month);
  }

  async setGoalMinutes(userId: string, value: number): Promise<Record<string, any>> {
    const minutes = Math.round(value);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600) throw new BadRequestException('每日阅读目标应在 5 到 600 分钟之间');
    await this.workspace.saveSettings(userId, { readingGoalMinutes: minutes });
    return this.dashboard(userId);
  }

  async sync(userId: string): Promise<Record<string, any>> {
    const [shelf, monthly, weekly, overall, notebooks] = await Promise.all([
      requestWeRead('/shelf/sync'),
      requestWeRead('/readdata/detail', { mode: 'monthly' }),
      requestWeRead('/readdata/detail', { mode: 'weekly' }),
      requestWeRead('/readdata/detail', { mode: 'overall' }),
      listNotebooks(),
    ]);
    const currentYear = new Date().getFullYear();
    const registrationYear = timestampYear(number(overall.registTime), currentYear);
    const annualData = await Promise.all(Array.from({ length: currentYear - registrationYear + 1 }, (_, index) => {
      const year = registrationYear + index;
      return requestWeRead('/readdata/detail', { mode: 'annually', baseTime: Math.floor(new Date(`${year}-07-01T12:00:00Z`).getTime() / 1000) });
    }));
    const shelfRows = [
      ...(shelf.books ?? []).map((item: any) => normaliseBook(item, 'book')),
      ...(shelf.albums ?? []).map((item: any) => normaliseBook(item, 'album')),
    ];
    const progressRows = await batchMap(shelfRows.filter((book) => book.content_kind === 'book'), 5, async (book) => {
      const progress = await requestWeRead('/book/getprogress', { bookId: book.source_id });
      const percentage = number(progress.book?.progress, book.progress);
      return { id: book.id, progress: percentage, last_read_at: number(progress.book?.updateTime, book.last_read_at), finished: percentage === 100 ? 1 : book.finished };
    });
    const progressById = new Map(progressRows.map((item) => [item.id, item]));
    const notebookRows = notebooks.map((item: any) => normaliseBook(item.book ?? item, 'book', item));
    const books = mergeBooks([...shelfRows, ...notebookRows], progressById);
    const noteBundles = await batchMap(notebooks, 4, async (notebook: any) => {
      const sourceId = String(notebook.bookId ?? notebook.book?.bookId ?? '');
      if (!sourceId) return [];
      const [bookmarks, reviews] = await Promise.all([
        requestWeRead('/book/bookmarklist', { bookId: sourceId }),
        listReviews(sourceId),
      ]);
      const bookId = bookKey('book', sourceId);
      const highlights = (bookmarks.updated ?? []).map((item: any) => normaliseHighlight(bookId, sourceId, item));
      const thoughts = reviews.map((item: any) => normaliseThought(bookId, sourceId, item.review ?? item));
      return [...highlights, ...thoughts].filter((note) => note.source_created_at && (note.quote_text || note.thought_text));
    });
    const notes = [...new Map(noteBundles.flat().map((note) => [note.id, note])).values()];
    const dailySeconds = mergeDailySeconds([...annualData, monthly, weekly]);
    const state = await this.workspace.rawState(userId);
    const now = new Date().toISOString();
    const today = localDate();
    const previous = latestReadingSync(state);
    const weeklyBooks = (weekly.readLongest ?? []).map(normaliseWeeklyBook).filter((item: any) => item.id && item.seconds > 0);

    state.readingBooks = replaceSyncedRows(state.readingBooks, books, now);
    state.readingNotes = replaceSyncedRows(state.readingNotes, notes, now);
    state.readingDays = upsertRows(state.readingDays, Object.entries(dailySeconds).map(([date, seconds]) => ({ id: date, read_date: date, seconds })), now);
    state.readingBookDays = recordBookDeltas(state.readingBookDays, previous, number(weekly.baseTime), weeklyBooks, today, now);
    state.readingSyncs.unshift({
      id: randomUUID(),
      synced_at: now,
      summary_json: JSON.stringify({ weekBaseTime: number(weekly.baseTime), date: today, weeklyBooks }),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    await this.workspace.replaceState(userId, state);
    return buildReadingDashboard(state);
  }
}

export function buildReadingDashboard(state: WorkspaceState): Record<string, any> {
  const today = localDate();
  const days = active(state.readingDays).sort((a, b) => String(a.read_date).localeCompare(String(b.read_date)));
  const secondsByDate = Object.fromEntries(days.map((item) => [item.read_date, number(item.seconds)])) as Record<string, number>;
  const books = active(state.readingBooks).sort((a, b) => number(b.last_read_at) - number(a.last_read_at) || String(b.updated_at).localeCompare(String(a.updated_at)));
  const todayNotes = notesForDate(state, today);
  const latestNotes = todayNotes.length ? todayNotes : notesWithBooks(state).sort((a, b) => String(b.source_created_at).localeCompare(String(a.source_created_at))).slice(0, 12);
  const currentMonth = today.slice(0, 7);
  const latestSync = active(state.readingSyncs).sort((a, b) => String(b.synced_at).localeCompare(String(a.synced_at)))[0];
  const recentHistory = buildRecentHistory(secondsByDate, today);
  return {
    goalMinutes: clamp(number(state.settings.readingGoalMinutes, 30), 5, 600),
    today,
    todaySeconds: number(secondsByDate[today]),
    weeklySeconds: Object.entries(secondsByDate).filter(([date]) => date >= weekStart(today) && date <= today).reduce((total, [, seconds]) => total + number(seconds), 0),
    totalSeconds: Object.values(secondsByDate).reduce((total, seconds) => total + number(seconds), 0),
    readDays: Object.values(secondsByDate).filter((seconds) => number(seconds) >= 60).length,
    streak: readingStreak(secondsByDate, today),
    syncedAt: latestSync?.synced_at ?? null,
    notes: latestNotes,
    books: books.slice(0, 8),
    recentHistory,
    calendar: Object.fromEntries(Object.entries(secondsByDate).filter(([date]) => date.startsWith(currentMonth))),
    bookRecords: bookRecords(state, currentMonth, books),
  };
}

function buildRecentHistory(secondsByDate: Record<string, number>, today: string): Array<{ date: string; seconds: number }> {
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    return { date, seconds: number(secondsByDate[date]) };
  });
}

export function buildCalendar(state: WorkspaceState, month: string): Record<string, any> {
  const days = active(state.readingDays).filter((item) => String(item.read_date).startsWith(month));
  const books = active(state.readingBooks).sort((a, b) => number(b.last_read_at) - number(a.last_read_at));
  return { month, days: Object.fromEntries(days.map((item) => [item.read_date, number(item.seconds)])), bookRecords: bookRecords(state, month, books) };
}

async function requestWeRead(apiName: string, fields: Record<string, unknown> = {}): Promise<any> {
  const key = process.env.WEREAD_API_KEY?.trim();
  if (!key) throw new BadRequestException('微信读书私有密钥尚未配置');
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_name: apiName, skill_version: skillVersion, ...fields }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BadRequestException(result?.errmsg ?? '微信读书服务暂时无法访问，请稍后再试');
  if (result?.upgrade_info) throw new BadRequestException(result.upgrade_info.message || '微信读书技能需要更新后才能同步');
  if (number(result?.errcode) !== 0) throw new BadRequestException(result?.errmsg || '微信读书数据暂时无法获取，请稍后再试');
  return result.data ?? result;
}

async function listNotebooks(): Promise<any[]> {
  const rows: any[] = [];
  let lastSort: number | undefined;
  let hasMore = true;
  while (hasMore) {
    const payload = await requestWeRead('/user/notebooks', { count: 100, ...(lastSort === undefined ? {} : { lastSort }) });
    const books = payload.books ?? [];
    rows.push(...books);
    hasMore = number(payload.hasMore) === 1;
    lastSort = number(books.at(-1)?.sort);
    if (hasMore && !lastSort) throw new BadRequestException('微信读书笔记分页数据不完整');
  }
  return rows;
}

async function listReviews(bookId: string): Promise<any[]> {
  const rows: any[] = [];
  let synckey = 0;
  let hasMore = true;
  while (hasMore) {
    const payload = await requestWeRead('/review/list/mine', { bookid: bookId, count: 100, synckey });
    rows.push(...(payload.reviews ?? []));
    hasMore = number(payload.hasMore) === 1;
    synckey = number(payload.synckey);
    if (hasMore && !synckey) throw new BadRequestException('微信读书想法分页数据不完整');
  }
  return rows;
}

function normaliseBook(source: any, contentKind: 'book' | 'album', notebook?: any): Entity {
  const info = contentKind === 'album' ? source.albumInfo ?? source : source;
  const extra = contentKind === 'album' ? source.albumInfoExtra ?? {} : source;
  const sourceId = String(info.bookId ?? info.albumId ?? source.bookId ?? '');
  return {
    id: bookKey(contentKind, sourceId), source_id: sourceId, content_kind: contentKind,
    title: String(info.title ?? info.name ?? '未命名书籍'), author: String(info.author ?? info.authorName ?? ''),
    cover_url: String(info.cover ?? ''), deep_link: String(info.deepLink ?? source.deepLink ?? ''), category: String(info.category ?? ''),
    progress: numberOrNull(source.readingProgress ?? notebook?.readingProgress), last_read_at: numberOrNull(extra.readUpdateTime ?? extra.lectureReadUpdateTime ?? info.readUpdateTime ?? source.readUpdateTime),
    finished: number(info.finishReading ?? info.finish ?? notebook?.markedStatus) === 1 ? 1 : 0,
    note_count: number(notebook?.reviewCount) + number(notebook?.noteCount) + number(notebook?.bookmarkCount),
    highlight_count: number(notebook?.noteCount), bookmark_count: number(notebook?.bookmarkCount),
  };
}

function mergeBooks(rows: Entity[], progress: Map<string, Partial<Entity>>): Entity[] {
  const books = new Map<string, Entity>();
  for (const row of rows) {
    const existing = books.get(row.id);
    books.set(row.id, {
      ...existing,
      ...row,
      note_count: Math.max(number(existing?.note_count), number(row.note_count)),
      highlight_count: Math.max(number(existing?.highlight_count), number(row.highlight_count)),
      bookmark_count: Math.max(number(existing?.bookmark_count), number(row.bookmark_count)),
    });
  }
  return [...books.values()].map((book) => ({ ...book, ...(progress.get(book.id) ?? {}) }));
}

function normaliseHighlight(bookId: string, sourceId: string, mark: any): Entity {
  const created = number(mark.createTime);
  return { id: `highlight:${bookId}:${String(mark.bookmarkId ?? `${created}:${mark.range ?? ''}`)}`, book_id: bookId, source_id: String(mark.bookmarkId ?? sourceId), note_kind: 'highlight', chapter_uid: mark.chapterUid == null ? null : String(mark.chapterUid), chapter_title: '', quote_text: String(mark.markText ?? ''), thought_text: '', source_created_at: iso(created), source_date: dateKey(created) };
}

function normaliseThought(bookId: string, sourceId: string, review: any): Entity {
  const created = number(review.createTime);
  return { id: `thought:${bookId}:${String(review.reviewId ?? `${created}:${review.content ?? ''}`)}`, book_id: bookId, source_id: String(review.reviewId ?? sourceId), note_kind: 'thought', chapter_uid: review.chapterUid == null ? null : String(review.chapterUid), chapter_title: String(review.chapterName ?? ''), quote_text: String(review.abstract ?? ''), thought_text: String(review.content ?? ''), source_created_at: iso(created), source_date: dateKey(created) };
}

function replaceSyncedRows(existing: Entity[], incoming: Entity[], now: string): Entity[] {
  const byId = new Map<string, Entity>(existing.map((row) => [row.id, { ...row, deleted_at: row.deleted_at ? row.deleted_at : now, updated_at: now } as Entity]));
  for (const row of incoming) {
    const prior = byId.get(row.id);
    byId.set(row.id, { ...prior, ...row, created_at: prior?.created_at ?? now, updated_at: now, deleted_at: null });
  }
  return [...byId.values()];
}

function upsertRows(existing: Entity[], incoming: Entity[], now: string): Entity[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) {
    const prior = byId.get(row.id);
    byId.set(row.id, { ...prior, ...row, created_at: prior?.created_at ?? now, updated_at: now, deleted_at: null });
  }
  return [...byId.values()];
}

function latestReadingSync(state: WorkspaceState): any | null {
  const latest = active(state.readingSyncs).sort((a, b) => String(b.synced_at).localeCompare(String(a.synced_at)))[0];
  try { return latest?.summary_json ? JSON.parse(latest.summary_json) : null; } catch { return null; }
}

function recordBookDeltas(rows: Entity[], previous: any, weekBaseTime: number, books: Entity[], date: string, now: string): Entity[] {
  if (!previous || previous.weekBaseTime !== weekBaseTime || ![date, previousDate(date)].includes(previous.date)) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const prior = new Map((previous.weeklyBooks ?? []).map((item: any) => [item.id, number(item.seconds)]));
  for (const book of books) {
    const delta = Math.max(0, number(book.seconds) - number(prior.get(book.id)));
    if (!delta) continue;
    const id = `${book.id}:${date}`;
    const existing = byId.get(id);
    byId.set(id, { ...existing, id, book_id: book.id, read_date: date, seconds: number(existing?.seconds) + delta, created_at: existing?.created_at ?? now, updated_at: now, deleted_at: null });
  }
  return [...byId.values()];
}

function notesWithBooks(state: WorkspaceState): Entity[] {
  const books = new Map(active(state.readingBooks).map((book) => [book.id, book]));
  return active(state.readingNotes).flatMap((note) => {
    const book = books.get(note.book_id);
    return book ? [{ ...note, book_title: book.title, book_author: book.author }] : [];
  });
}

function notesForDate(state: WorkspaceState, date: string): Entity[] {
  return notesWithBooks(state).filter((note) => note.source_date === date).sort((a, b) => Number(Boolean(b.thought_text)) - Number(Boolean(a.thought_text)) || String(b.source_created_at).localeCompare(String(a.source_created_at)));
}

function bookRecords(state: WorkspaceState, month: string, books: Entity[]): Record<string, Entity[]> {
  const records: Record<string, Entity[]> = {};
  const booksById = new Map(books.map((book) => [book.id, book]));
  for (const row of active(state.readingBookDays).filter((item) => String(item.read_date).startsWith(month))) {
    const book = booksById.get(row.book_id);
    if (book) (records[row.read_date] ??= []).push({ id: book.id, title: book.title, author: book.author, seconds: number(row.seconds) });
  }
  for (const book of books) {
    if (!book.last_read_at) continue;
    const date = dateKey(number(book.last_read_at));
    if (!date.startsWith(month)) continue;
    const existing = records[date] ??= [];
    if (!existing.some((item) => item.id === book.id)) existing.push({ id: book.id, title: book.title, author: book.author, seconds: null });
  }
  return records;
}

function normaliseWeeklyBook(item: any): Entity { const info = item.book ?? item.albumInfo ?? {}; return { id: bookKey(item.albumInfo ? 'album' : 'book', String(info.bookId ?? info.albumId ?? '')), seconds: number(item.readTime) }; }
function mergeDailySeconds(periods: any[]): Record<string, number> { const output: Record<string, number> = {}; for (const period of periods) for (const [timestamp, seconds] of Object.entries(period.dailyReadTimes ?? period.readTimes ?? {})) { const date = dateKey(number(timestamp)); output[date] = Math.max(number(output[date]), number(seconds)); } return output; }
async function batchMap<T, R>(items: T[], size: number, operation: (item: T) => Promise<R>): Promise<R[]> { const output: R[] = []; for (let index = 0; index < items.length; index += size) output.push(...await Promise.all(items.slice(index, index + size).map(operation))); return output; }
function active(rows: Entity[]): Entity[] { return rows.filter((row) => !row.deleted_at); }
function number(value: unknown, fallback = 0): number { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function numberOrNull(value: unknown): number | null { const result = Number(value); return Number.isFinite(result) && result > 0 ? result : null; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function bookKey(kind: string, sourceId: string): string { return `${kind}:${sourceId}`; }
function iso(timestamp: number): string { return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : new Date(0).toISOString(); }
function dateKey(timestamp: number): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp * 1000)); }
function localDate(): string { return dateKey(Math.floor(Date.now() / 1000)); }
function timestampYear(timestamp: number, fallback: number): number { return timestamp > 0 ? new Date(timestamp * 1000).getUTCFullYear() : fallback; }
function previousDate(date: string): string { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }
function weekStart(date: string): string { const value = new Date(`${date}T12:00:00Z`); const weekday = value.getUTCDay() || 7; value.setUTCDate(value.getUTCDate() - weekday + 1); return value.toISOString().slice(0, 10); }
function addDays(date: string, days: number): string { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function readingStreak(days: Record<string, number>, today: string): number { let cursor = number(days[today]) >= 60 ? today : previousDate(today); let streak = 0; while (number(days[cursor]) >= 60) { streak += 1; cursor = previousDate(cursor); } return streak; }
