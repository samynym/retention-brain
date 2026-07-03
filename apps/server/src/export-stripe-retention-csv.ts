import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import Stripe from "stripe";
import { Event, buildTimelines } from "@retention-brain/core";
import { scoreAll } from "@retention-brain/risk-engine";

type CustomerStats = {
  user_id: string;
  email: string;
  created: number;
  subscription_count: number;
  activeish_subscription_count: number;
  churned_subscription_count: number;
  active_subscription_count: number;
  canceled_subscription_count: number;
  trialing_subscription_count: number;
  past_due_subscription_count: number;
  unpaid_subscription_count: number;
  incomplete_subscription_count: number;
  days_since_first_subscription_created: number | null;
  days_since_last_subscription_created: number | null;
  days_since_last_cancel: number | null;
  total_successful_payments: number;
  successful_payments_30d: number;
  successful_payments_90d: number;
  total_failed_payments: number;
  failed_payments_30d: number;
  failed_payments_90d: number;
  days_since_last_payment_success: number | null;
  days_since_last_payment_failure: number | null;
  total_paid_usd: number;
  avg_successful_payment_usd: number;
  churn: 0 | 1;
};

const DAY_SECONDS = 86_400;
const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);
const CHURN_STATUSES = new Set<Stripe.Subscription.Status>(["canceled", "incomplete_expired", "unpaid"]);

dotenv.config();
dotenv.config({ path: "apps/server/.env", override: false });

const key = process.env.STRIPE_TEST_KEY ?? process.env.STRIPE_API_KEY ?? "";
if (!key.startsWith("sk_")) {
  throw new Error("Set STRIPE_TEST_KEY or STRIPE_API_KEY before exporting Stripe retention data.");
}

const stripe = new Stripe(key);
const outDir = path.resolve(".retention-brain", "exports");
const now = new Date();
const nowUnix = Math.floor(now.getTime() / 1000);
const runStamp = now.toISOString().replace(/[:.]/g, "-");

async function main() {
  await mkdir(outDir, { recursive: true });

  const customers = await loadCustomers();
  const stats = new Map<string, CustomerStats>();
  for (const c of customers.values()) stats.set(c.id, emptyStats(c));

  const events: Event[] = [];
  await addSubscriptionSignals(stats, events);
  await addChargeSignals(stats, events);

  const rows = [...stats.values()]
    .filter((r) => r.subscription_count > 0 || r.total_successful_payments > 0 || r.total_failed_payments > 0)
    .sort((a, b) => a.user_id.localeCompare(b.user_id));

  const uploadRows = rows.map(toUploadRow);
  const uploadCsv = toCsv(uploadRows);
  const auditCsv = toCsv(rows);
  const eventsJsonl = events
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((e) => JSON.stringify(e))
    .join("\n");

  const timelines = buildTimelines(events);
  const scores = await scoreAll(timelines, { useLLM: false, nowIso: now.toISOString() });
  const predictionCsv = toCsv(
    scores
      .sort((a, b) => b.score - a.score)
      .map((s) => ({
        user_id: s.user_id,
        retention_brain_risk_score: round(s.score),
        top_signal_1: s.top_signals[0]?.name ?? "",
        top_signal_2: s.top_signals[1]?.name ?? "",
        top_signal_3: s.top_signals[2]?.name ?? "",
        narrative: s.narrative,
      })),
  );

  const uploadPath = path.join(outDir, `stripe-retention-upload-${runStamp}.csv`);
  const auditPath = path.join(outDir, `stripe-retention-audit-${runStamp}.csv`);
  const eventsPath = path.join(outDir, `stripe-retention-events-${runStamp}.jsonl`);
  const predictionsPath = path.join(outDir, `stripe-retentionbrain-predictions-${runStamp}.csv`);

  await writeFile(uploadPath, uploadCsv);
  await writeFile(auditPath, auditCsv);
  await writeFile(eventsPath, `${eventsJsonl}\n`);
  await writeFile(predictionsPath, predictionCsv);

  console.log(`customers exported: ${rows.length}`);
  console.log(`events exported: ${events.length}`);
  console.log(`upload csv: ${uploadPath}`);
  console.log(`audit csv: ${auditPath}`);
  console.log(`events jsonl: ${eventsPath}`);
  console.log(`our predictions csv: ${predictionsPath}`);
}

async function loadCustomers(): Promise<Map<string, Stripe.Customer>> {
  const customers = new Map<string, Stripe.Customer>();
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    if (!customer.deleted) customers.set(customer.id, customer);
  }
  return customers;
}

function emptyStats(customer: Stripe.Customer): CustomerStats {
  return {
    user_id: customer.id,
    email: customer.email ?? "",
    created: customer.created,
    subscription_count: 0,
    activeish_subscription_count: 0,
    churned_subscription_count: 0,
    active_subscription_count: 0,
    canceled_subscription_count: 0,
    trialing_subscription_count: 0,
    past_due_subscription_count: 0,
    unpaid_subscription_count: 0,
    incomplete_subscription_count: 0,
    days_since_first_subscription_created: null,
    days_since_last_subscription_created: null,
    days_since_last_cancel: null,
    total_successful_payments: 0,
    successful_payments_30d: 0,
    successful_payments_90d: 0,
    total_failed_payments: 0,
    failed_payments_30d: 0,
    failed_payments_90d: 0,
    days_since_last_payment_success: null,
    days_since_last_payment_failure: null,
    total_paid_usd: 0,
    avg_successful_payment_usd: 0,
    churn: 0,
  };
}

async function addSubscriptionSignals(stats: Map<string, CustomerStats>, events: Event[]) {
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    const customerId = idOf(sub.customer);
    if (!customerId) continue;
    const row = ensureStats(stats, customerId);
    row.subscription_count += 1;
    if (ACTIVE_STATUSES.has(sub.status)) row.activeish_subscription_count += 1;
    if (CHURN_STATUSES.has(sub.status)) row.churned_subscription_count += 1;
    if (sub.status === "active") row.active_subscription_count += 1;
    if (sub.status === "trialing") row.trialing_subscription_count += 1;
    if (sub.status === "past_due") row.past_due_subscription_count += 1;
    if (sub.status === "unpaid") row.unpaid_subscription_count += 1;
    if (sub.status === "incomplete") row.incomplete_subscription_count += 1;
    if (sub.status === "canceled") row.canceled_subscription_count += 1;

    row.days_since_first_subscription_created = maxNullable(
      row.days_since_first_subscription_created,
      daysSince(sub.created),
    );
    row.days_since_last_subscription_created = minNullable(
      row.days_since_last_subscription_created,
      daysSince(sub.created),
    );

    events.push(
      Event.parse({
        id: `${sub.id}:created`,
        user_id: customerId,
        kind: "subscription.purchase",
        timestamp: iso(sub.created),
        source: "stripe",
        payload: { email: row.email, subscription: sub.id, status: sub.status },
      }),
    );

    if (sub.canceled_at) {
      row.days_since_last_cancel = minNullable(row.days_since_last_cancel, daysSince(sub.canceled_at));
      events.push(
        Event.parse({
          id: `${sub.id}:canceled`,
          user_id: customerId,
          kind: "subscription.cancel",
          timestamp: iso(sub.canceled_at),
          source: "stripe",
          payload: {
            email: row.email,
            subscription: sub.id,
            reason: sub.cancellation_details?.reason ?? undefined,
          },
        }),
      );
    }
  }

  for (const row of stats.values()) {
    const hasChurnedStatus = row.subscription_count > 0 && row.churned_subscription_count === row.subscription_count;
    row.churn = row.activeish_subscription_count === 0 && hasChurnedStatus ? 1 : 0;
  }
}

async function addChargeSignals(stats: Map<string, CustomerStats>, events: Event[]) {
  for await (const charge of stripe.charges.list({ limit: 100 })) {
    const customerId = idOf(charge.customer);
    if (!customerId) continue;
    const row = ensureStats(stats, customerId);
    const amountUsd = charge.currency === "usd" ? charge.amount / 100 : 0;

    if (charge.status === "succeeded") {
      row.total_successful_payments += 1;
      if (withinDays(charge.created, 30)) row.successful_payments_30d += 1;
      if (withinDays(charge.created, 90)) row.successful_payments_90d += 1;
      row.days_since_last_payment_success = minNullable(
        row.days_since_last_payment_success,
        daysSince(charge.created),
      );
      row.total_paid_usd += amountUsd;
      row.avg_successful_payment_usd = row.total_paid_usd / row.total_successful_payments;
      events.push(
        Event.parse({
          id: charge.id,
          user_id: customerId,
          kind: "payment.success",
          timestamp: iso(charge.created),
          source: "stripe",
          payload: { email: row.email, amount: amountUsd, currency: charge.currency },
        }),
      );
    } else if (charge.status === "failed") {
      row.total_failed_payments += 1;
      if (withinDays(charge.created, 30)) row.failed_payments_30d += 1;
      if (withinDays(charge.created, 90)) row.failed_payments_90d += 1;
      row.days_since_last_payment_failure = minNullable(
        row.days_since_last_payment_failure,
        daysSince(charge.created),
      );
      events.push(
        Event.parse({
          id: charge.id,
          user_id: customerId,
          kind: "payment.failure",
          timestamp: iso(charge.created),
          source: "stripe",
          payload: { email: row.email, amount: amountUsd, currency: charge.currency },
        }),
      );
    }
  }
}

function toUploadRow(row: CustomerStats) {
  return {
    user_id: row.user_id,
    days_since_customer_created: daysSince(row.created),
    subscription_count: row.subscription_count,
    activeish_subscription_count: row.activeish_subscription_count,
    churned_subscription_count: row.churned_subscription_count,
    active_subscription_count: row.active_subscription_count,
    canceled_subscription_count: row.canceled_subscription_count,
    trialing_subscription_count: row.trialing_subscription_count,
    past_due_subscription_count: row.past_due_subscription_count,
    unpaid_subscription_count: row.unpaid_subscription_count,
    incomplete_subscription_count: row.incomplete_subscription_count,
    days_since_first_subscription_created: valueOrMinusOne(row.days_since_first_subscription_created),
    days_since_last_subscription_created: valueOrMinusOne(row.days_since_last_subscription_created),
    days_since_last_cancel: valueOrMinusOne(row.days_since_last_cancel),
    total_successful_payments: row.total_successful_payments,
    successful_payments_30d: row.successful_payments_30d,
    successful_payments_90d: row.successful_payments_90d,
    total_failed_payments: row.total_failed_payments,
    failed_payments_30d: row.failed_payments_30d,
    failed_payments_90d: row.failed_payments_90d,
    days_since_last_payment_success: valueOrMinusOne(row.days_since_last_payment_success),
    days_since_last_payment_failure: valueOrMinusOne(row.days_since_last_payment_failure),
    total_paid_usd: round(row.total_paid_usd),
    avg_successful_payment_usd: round(row.avg_successful_payment_usd),
    churn: row.churn,
  };
}

function ensureStats(stats: Map<string, CustomerStats>, customerId: string): CustomerStats {
  const existing = stats.get(customerId);
  if (existing) return existing;
  const row = emptyStats({ id: customerId, email: null, created: nowUnix } as Stripe.Customer);
  stats.set(customerId, row);
  return row;
}

function idOf(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function withinDays(unixSeconds: number, days: number): boolean {
  return nowUnix - unixSeconds <= days * DAY_SECONDS;
}

function daysSince(unixSeconds: number): number {
  return Math.max(0, Math.floor((nowUnix - unixSeconds) / DAY_SECONDS));
}

function iso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function minNullable(a: number | null, b: number): number {
  return a === null ? b : Math.min(a, b);
}

function maxNullable(a: number | null, b: number): number {
  return a === null ? b : Math.max(a, b);
}

function valueOrMinusOne(value: number | null): number {
  return value ?? -1;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")),
  ].join("\n") + "\n";
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
