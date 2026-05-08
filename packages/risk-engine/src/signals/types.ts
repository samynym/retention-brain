export type Signal = {
  name: string;
  score: number; // [0,1] where 1 = high risk
  weight: number; // contribution weight
  reason: string; // 1-sentence explanation
};
