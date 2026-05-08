import type { Source } from "@rcrb/sources";
import { postHogApi, type PostHogConfig } from "./api.js";
import { mapPostHogEvent } from "./map.js";

export function postHogSource(config: PostHogConfig): Source {
  const api = postHogApi(config);
  return {
    name: "posthog",
    async *backfill({ since, until }) {
      for await (const event of api.listEvents({ since, until })) {
        const mapped = mapPostHogEvent(event);
        if (mapped) yield mapped;
      }
    },
  };
}

export type { PostHogConfig, PostHogEvent, PostHogPerson } from "./api.js";
export { postHogApi } from "./api.js";
export { mapPostHogEvent } from "./map.js";
export { classifyPostHogEvent } from "./kinds.js";
