export type MediaAnalyticsPoint = {
  id: string;
  title: string;
  label: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
};

export type MediaAnalytics = {
  points: MediaAnalyticsPoint[];
  totals: { views: number; likes: number; comments: number };
  engagementRate: number;
  best: MediaAnalyticsPoint | null;
};

export function buildMediaAnalytics(items: Array<Record<string, any>>): MediaAnalytics {
  const points = items
    .filter((item) => item.stage === "published" && [item.views, item.likes, item.comments].some((value) => value !== null && value !== undefined))
    .sort((a, b) => String(a.published_at ?? a.created_at ?? "").localeCompare(String(b.published_at ?? b.created_at ?? "")))
    .slice(-12)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title || "未命名内容"),
      label: compactTitle(String(item.title || "未命名内容")),
      publishedAt: String(item.published_at ?? ""),
      views: nonNegativeNumber(item.views),
      likes: nonNegativeNumber(item.likes),
      comments: nonNegativeNumber(item.comments),
    }));
  const totals = points.reduce((sum, point) => ({ views: sum.views + point.views, likes: sum.likes + point.likes, comments: sum.comments + point.comments }), { views: 0, likes: 0, comments: 0 });
  const engagementRate = totals.views > 0 ? ((totals.likes + totals.comments) / totals.views) * 100 : 0;
  const best = points.reduce<MediaAnalyticsPoint | null>((winner, point) => !winner || point.views > winner.views ? point : winner, null);
  return { points, totals, engagementRate, best };
}

function compactTitle(title: string): string {
  return title.length > 9 ? `${title.slice(0, 8)}…` : title;
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
