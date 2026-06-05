import "dotenv/config";
import Stripe from "stripe";

/**
 * Seeds TEST-MODE Stripe data with billing signals the engine can flag:
 * purchases, healthy renewals, unrecovered payment failures, and cancellations.
 * Safe + free — refuses anything but an sk_test_ key. Idempotent by customer email.
 *   pnpm --filter @retention-brain/server exec tsx src/dev-seed-stripe.ts
 */

const key = process.env.STRIPE_TEST_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  throw new Error("Refusing to seed: STRIPE_TEST_KEY must be an sk_test_ key.");
}
const stripe = new Stripe(key);

const CUSTOMERS = [
  { email: "alice@stripe-test.example", name: "Alice", scenario: "healthy" },
  { email: "bob@stripe-test.example", name: "Bob", scenario: "healthy" },
  { email: "carol@stripe-test.example", name: "Carol", scenario: "payment_failed" },
  { email: "dave@stripe-test.example", name: "Dave", scenario: "payment_failed" },
  { email: "erin@stripe-test.example", name: "Erin", scenario: "canceled" },
  { email: "frank@stripe-test.example", name: "Frank", scenario: "canceled" },
] as const;

async function ensureProductPrice(): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: ["rb_pro_monthly"], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({ name: "Pro (test)" });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 999,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: "rb_pro_monthly",
  });
  return price.id;
}

async function getOrCreateCustomer(email: string, name: string): Promise<Stripe.Customer> {
  const found = await stripe.customers.list({ email, limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.customers.create({ email, name });
}

async function charge(customerId: string, pm: string, desc: string): Promise<void> {
  // Direct PaymentIntent (no attach needed). pm_card_visa succeeds,
  // pm_card_chargeDeclined throws card_declined and leaves a failed charge.
  try {
    await stripe.paymentIntents.create({
      amount: 999,
      currency: "usd",
      customer: customerId,
      payment_method: pm,
      confirm: true,
      off_session: true,
      description: desc,
    });
  } catch {
    /* declined card is expected for the failure scenario */
  }
}

async function main() {
  const priceId = await ensureProductPrice();
  console.log(`price: ${priceId}\n`);

  for (const def of CUSTOMERS) {
    const c = await getOrCreateCustomer(def.email, def.name);
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 1 });
    if (subs.data[0]) {
      console.log(`${def.email}: already seeded (${def.scenario})`);
      continue;
    }

    // Everyone gets a subscription via invoice billing (no payment method needed) → purchase
    const sub = await stripe.subscriptions.create({
      customer: c.id,
      items: [{ price: priceId }],
      collection_method: "send_invoice",
      days_until_due: 30,
    });

    if (def.scenario === "healthy") {
      await charge(c.id, "pm_card_visa", "renewal (test success)"); // → payment.success
    } else if (def.scenario === "payment_failed") {
      await charge(c.id, "pm_card_chargeDeclined", "renewal (test failure)"); // → payment.failure
    } else if (def.scenario === "canceled") {
      await stripe.subscriptions.cancel(sub.id); // → subscription.cancel
    }

    console.log(`${def.email}: seeded (${def.scenario})`);
  }
  console.log("\ndone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
