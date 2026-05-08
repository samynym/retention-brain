import { loyal } from "./loyal.js";
import { power } from "./power.js";
import { fresh } from "./fresh.js";
import { wavering } from "./wavering.js";
import { lapsing } from "./lapsing.js";
import { lapsed_returning } from "./lapsed-returning.js";
import { free_rider } from "./free-rider.js";
import { re_engager } from "./re-engager.js";
import { crashy_loyal } from "./crashy-loyal.js";
import { silent_lurker } from "./silent-lurker.js";

export const personas = [
  loyal,
  power,
  fresh,
  wavering,
  lapsing,
  lapsed_returning,
  free_rider,
  re_engager,
  crashy_loyal,
  silent_lurker,
];

export * from "./types.js";
