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
    let arr = byUser.get(e.user_id);
    if (!arr) {
      arr = [];
      byUser.set(e.user_id, arr);
    }
    arr.push(e);
  }
  return Array.from(byUser.entries()).map(([user_id, evs]) => {
    evs.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    const first = evs[0]!;
    const rawEmail = (first.payload as { email?: unknown }).email;
    const email = typeof rawEmail === "string" ? rawEmail : undefined;
    return { user_id, email, created_at: first.timestamp, events: evs };
  });
}
