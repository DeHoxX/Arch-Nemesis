import {
  Activity,
  Bot,
  CreditCard,
  FileText,
  HeartPulse,
  Layers,
  ShieldCheck,
  ShoppingBag,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type ExamplePromptIconKey =
  | "shopping-bag"
  | "bot"
  | "activity"
  | "shield-check"
  | "file-text"
  | "credit-card"
  | "truck"
  | "heart-pulse"
  | "layers";

export interface ExamplePrompt {
  id: string;
  title: string;
  iconKey: ExamplePromptIconKey;
  prompt: string;
}

export const EXAMPLE_PROMPT_ICONS: Record<ExamplePromptIconKey, LucideIcon> = {
  "shopping-bag": ShoppingBag,
  bot: Bot,
  activity: Activity,
  "shield-check": ShieldCheck,
  "file-text": FileText,
  "credit-card": CreditCard,
  truck: Truck,
  "heart-pulse": HeartPulse,
  layers: Layers,
};

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    id: "ecommerce-infra",
    title: "E-commerce infrastructure",
    iconKey: "shopping-bag",
    prompt:
      "Build an online retail storefront backend serving up to 50,000 daily shoppers and 200 catalog managers. Shoppers browse products, manage persistent carts, submit checkout orders, and receive email and SMS order updates. The system tracks stock counts in real time, reserves inventory briefly during payment authorization, routes flagged manual-review orders to fraud analysts, and records an immutable audit log of every order state change.",
  },
  {
    id: "ai-support-platform",
    title: "AI-powered support platform",
    iconKey: "bot",
    prompt:
      "Design a customer support workspace handling roughly 8,000 incoming tickets and live chat messages per day from end users and 60 support agents. Incoming inquiries are categorized by topic, matched against internal help-center articles to draft suggested replies, and automatically escalated to billing or technical specialists before any refund or account credit is approved. Keep a traceable handoff log for supervisors.",
  },
  {
    id: "realtime-monitoring",
    title: "Real-time monitoring system",
    iconKey: "activity",
    prompt:
      "Create a live telemetry and alerting platform ingesting metrics and heartbeat events from 15,000 servers and edge gateways, peaking around 200,000 events per minute. SRE engineers configure threshold and anomaly rules, mute maintenance windows, and receive routed incident pages with acknowledgment tracking. Retain high-resolution recent metrics for fast triage and store downsampled historical trends for capacity reviews.",
  },
  {
    id: "insurance-claims",
    title: "Insurance claims processing",
    iconKey: "shield-check",
    prompt:
      "Build an insurance claims intake and triage portal used by 1,200 policyholders daily alongside 150 claims adjusters and medical reviewers. Users upload incident descriptions, photos, and invoices to open a claim. Automated checks validate policy coverage dates and detect duplicate submissions, then assign simple claims for fast-track review while routing high-value or disputed claims to senior adjusters with manual sign-off required before payout release.",
  },
  {
    id: "contract-review",
    title: "Contract review platform",
    iconKey: "file-text",
    prompt:
      "Design an internal vendor agreement review system supporting 400 procurement staff and 35 contract reviewers handling around 300 documents per day. Users upload PDF agreements and amendment drafts, compare clauses against approved internal fallback templates, track redline comments across versions, and require explicit two-person sign-off before marking an agreement finalized. Store versioned document history and full reviewer action logs.",
  },
  {
    id: "fraud-detection",
    title: "Payment fraud detection",
    iconKey: "credit-card",
    prompt:
      "Create a transaction risk evaluation pipeline screening 120,000 card and bank-transfer events per day for merchant operations teams and 40 risk analysts. Incoming payment requests are enriched with device fingerprints and recent velocity counters, scored synchronously before authorization completes, and either allowed, challenged with step-up verification, or held in a review queue where analysts override or confirm blocks with documented reasons.",
  },
  {
    id: "logistics-fleet",
    title: "Logistics & fleet tracking",
    iconKey: "truck",
    prompt:
      "Build a shipment and fleet coordination platform tracking 4,500 delivery vehicles and 60,000 daily parcels for dispatchers, drivers, and warehouse clerks. Vehicles stream GPS pings and barcode scan events from mobile devices to recalculate route ETAs, alert dispatchers to cold-chain temperature excursions or stalled stops, and require depot manager confirmation whenever damaged cargo is quarantined or rerouted.",
  },
  {
    id: "clinical-triage",
    title: "Clinical patient triage",
    iconKey: "heart-pulse",
    prompt:
      "Design an outpatient clinic intake and nurse triage system serving 6,000 patient check-ins per day across 80 clinics for receptionists, triage nurses, and physicians. Patients submit symptom questionnaires and medication lists before arrival; automated scoring flags urgent symptom combinations to jump to the top of the nurse queue, while licensed clinicians must manually review and approve every triage priority before scheduling.",
  },
  {
    id: "analytics-workspace",
    title: "Multi-tenant analytics workspace",
    iconKey: "layers",
    prompt:
      "Create a self-serve B2B reporting platform hosting 500 enterprise customer organizations and roughly 25,000 daily report queries. Customer analysts build saved dashboards over isolated tenant datasets while data engineers manage scheduled ingestion connectors and warehouse sync jobs. Enforce strict tenant isolation on every query, rate-limit heavy ad-hoc exports per organization, and alert workspace admins when ingestion jobs fail repeatedly.",
  },
];

/**
 * Returns `count` randomly sampled items from the prompt pool using a partial Fisher-Yates shuffle.
 * Does not mutate the source array.
 */
export function pickRandomExamplePrompts(
  pool: ExamplePrompt[] = EXAMPLE_PROMPTS,
  count = 3,
): ExamplePrompt[] {
  if (pool.length <= count) {
    return [...pool];
  }

  const copy = [...pool];
  const result: ExamplePrompt[] = [];

  for (let i = 0; i < count; i++) {
    const pickIdx = i + Math.floor(Math.random() * (copy.length - i));
    const chosen = copy[pickIdx]!;
    copy[pickIdx] = copy[i]!;
    copy[i] = chosen;
    result.push(chosen);
  }

  return result;
}

