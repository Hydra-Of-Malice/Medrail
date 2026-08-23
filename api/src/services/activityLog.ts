/** A small in-memory ring buffer of recent priced-route calls, powering the
 * frontend's Agent Activity page. Deliberately not persisted and deliberately
 * not backfilled: this is what actually happened since this process started,
 * not a fabricated history. See docs note in web's /agents page for why. */
export interface ActivityEntry {
  id: number;
  timestamp: string;
  requester: string | null;
  endpoint: string;
  method: string;
  price: string;
  status: number;
}

const MAX_ENTRIES = 500;
const entries: ActivityEntry[] = [];
let seq = 0;

export function recordActivity(entry: Omit<ActivityEntry, "id" | "timestamp">): void {
  seq += 1;
  entries.push({ id: seq, timestamp: new Date().toISOString(), ...entry });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function listActivity(): ActivityEntry[] {
  return [...entries].reverse();
}

/** Test seam. */
export function __resetActivity(): void {
  entries.length = 0;
  seq = 0;
}
