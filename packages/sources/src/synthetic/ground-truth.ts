import type { ChurnReason } from "./personas/types.js";

export type GroundTruthLabel = {
  user_id: string;
  persona: string;
  will_churn: boolean;
  churn_at: string | null;
  churn_reason: ChurnReason | null;
};
