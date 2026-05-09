import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Event } from "@rcrb/core";

export const STAGED_PATH = resolve(process.cwd(), ".staged-future.json");

export type StagedFile = {
  generated_at: string;
  seed: string;
  cutoff_iso: string;
  eval_until_iso: string;
  user_emails: Record<string, string>;
  events: Event[];
};

export async function writeStaged(staged: StagedFile): Promise<string> {
  await writeFile(STAGED_PATH, JSON.stringify(staged, null, 2), "utf8");
  return STAGED_PATH;
}

export async function readStaged(): Promise<StagedFile> {
  let raw: string;
  try {
    raw = await readFile(STAGED_PATH, "utf8");
  } catch (err) {
    throw new Error(
      `staged file not found at ${STAGED_PATH} — run \`rc-retention-brain seed-sandbox\` first`,
      { cause: err }
    );
  }
  return JSON.parse(raw) as StagedFile;
}

/** Returns null if the staged file doesn't exist or can't be parsed. */
export async function tryReadStaged(): Promise<StagedFile | null> {
  try {
    const raw = await readFile(STAGED_PATH, "utf8");
    return JSON.parse(raw) as StagedFile;
  } catch {
    return null;
  }
}
