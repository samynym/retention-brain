import "dotenv/config";
import { resolve } from "node:path";
import kleur from "kleur";
import { startWebhookServer } from "@rcrb/webhook-receiver";

const DEFAULT_PORT = 4044;
const DEFAULT_STORE = ".rcrb/events.jsonl";

export async function runWebhookListen(opts: { port?: string; store?: string }): Promise<void> {
  const port = opts.port ? Number(opts.port) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(kleur.red(`invalid --port: ${opts.port}`));
    process.exit(2);
  }
  const storePath = resolve(process.cwd(), opts.store ?? DEFAULT_STORE);

  const handle = await startWebhookServer({
    port,
    storePath,
    ...(process.env.STRIPE_WEBHOOK_SECRET && { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET }),
    ...(process.env.REVENUECAT_WEBHOOK_SECRET && { revenueCatWebhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET }),
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
  console.log(kleur.dim(`   • POST /webhooks/stripe       ${process.env.STRIPE_WEBHOOK_SECRET ? "(signature required)" : "(no signature check — sandbox use)"}`));
  console.log(kleur.dim(`   • POST /webhooks/revenuecat   ${process.env.REVENUECAT_WEBHOOK_SECRET ? "(auth required)" : "(no auth check — sandbox use)"}`));
  console.log(kleur.dim(`   • storing events at ${storePath}`));
  console.log(kleur.dim(`   • Ctrl-C to stop`));

  process.on("SIGINT", async () => {
    console.log(kleur.yellow("\nshutting down…"));
    await handle.close();
    process.exit(0);
  });
}
