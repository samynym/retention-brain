import type { Event } from "./events.js";

export type UserTimeline = {
  user_id: string;
  email?: string;
  created_at: string;
  events: Event[];
};

export function buildTimelines(events: Event[]): UserTimeline[] {
  const byUser = new Map<string, Event[]>();
  for (const e of events) {
    const arr = byUser.get(e.user_id) ?? [];
    arr.push(e);
    byUser.set(e.user_id, arr);
  }
  return Array.from(byUser.entries()).map(([user_id, evs]) => {
    evs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const first = evs[0];
    if (!first) {
      return { user_id, created_at: new Date(0).toISOString(), events: evs };
    }
    const emailFromPayload = (first.payload as { email?: unknown }).email;
    const email = typeof emailFromPayload === "string" ? emailFromPayload : undefined;
    return { user_id, email, created_at: first.timestamp, events: evs };
  });
}
