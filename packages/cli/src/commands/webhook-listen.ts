import "dotenv/config";
import { resolve } from "node:path";
import kleur from "kleur";
import { startWebhookServer } from "@retention-brain/webhook-receiver";

const DEFAULT_PORT = 4044;
const DEFAULT_STORE = ".retention-brain/events.jsonl";

export async function runWebhookListen(opts: { port?: string; store?: string; insecure?: boolean }): Promise<void> {
  const port = opts.port ? Number(opts.port) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(kleur.red(`invalid --port: ${opts.port}`));
    process.exit(2);
  }
  const storePath = resolve(process.cwd(), opts.store ?? DEFAULT_STORE);
  const allowInsecure = !!opts.insecure;
  const hasStripe = !!process.env.STRIPE_WEBHOOK_SECRET;
  const hasRC = !!process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!allowInsecure && !hasStripe && !hasRC) {
    console.error(
      kleur.red(
        "✗ refusing to start without any webhook secret. Set STRIPE_WEBHOOK_SECRET and/or REVENUECAT_WEBHOOK_SECRET, or pass --insecure for sandbox testing."
      )
    );
    process.exit(2);
  }
  if (allowInsecure) {
    console.warn(
      kleur.yellow(
        "⚠ --insecure: serving webhooks without signature verification. Do not use in production."
      )
    );
  }

  const handle = await startWebhookServer({
    port,
    storePath,
    allowInsecure,
    ...(hasStripe && { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET! }),
    ...(hasRC && { revenueCatWebhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET! }),
    onEvent: ({ source, kind, user_id }) => {
      console.log(
        kleur.dim(new Date().toISOString()),
        kleur.cyan(source),
        kleur.bold(kind),
        kleur.dim("→"),
        user_id
      );
    },
  });

  console.log(
    kleur.green().bold(`🛰  webhook receiver listening on http://localhost:${handle.port}`)
  );
  const stripeMode = hasStripe
    ? "(signature required)"
    : allowInsecure
      ? "(no signature check — sandbox use)"
      : "(503 — STRIPE_WEBHOOK_SECRET unset)";
  const rcMode = hasRC
    ? "(auth required)"
    : allowInsecure
      ? "(no auth check — sandbox use)"
      : "(503 — REVENUECAT_WEBHOOK_SECRET unset)";
  console.log(kleur.dim(`   • POST /webhooks/stripe       ${stripeMode}`));
  console.log(kleur.dim(`   • POST /webhooks/revenuecat   ${rcMode}`));
  console.log(kleur.dim(`   • storing events at ${storePath}`));
  console.log(kleur.dim(`   • Ctrl-C to stop`));

  process.on("SIGINT", async () => {
    console.log(kleur.yellow("\nshutting down…"));
    await handle.close();
    process.exit(0);
  });
}
