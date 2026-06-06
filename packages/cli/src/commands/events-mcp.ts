import { resolve } from "node:path";
import { startLocalEventsMCP } from "@retention-brain/webhook-receiver";

const DEFAULT_STORE = ".retention-brain/events.jsonl";

export async function runEventsMcp(opts: { store?: string }): Promise<void> {
  const storePath = resolve(process.cwd(), opts.store ?? DEFAULT_STORE);
  await startLocalEventsMCP({ storePath });
}
