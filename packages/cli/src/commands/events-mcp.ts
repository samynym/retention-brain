import { resolve } from "node:path";
import { startLocalEventsMCP } from "@rcrb/webhook-receiver";

const DEFAULT_STORE = ".rcrb/events.jsonl";

export async function runEventsMcp(opts: { store?: string }): Promise<void> {
  const storePath = resolve(process.cwd(), opts.store ?? DEFAULT_STORE);
  await startLocalEventsMCP({ storePath });
}
