import { z } from "zod";
import { requirementBriefSchema } from "./api";
import type { RequirementBrief } from "./types";

export const INTAKE_STORAGE_KEY = "archnemesis.intake.v1";
export const INTAKE_STORAGE_MAX_BYTES = 512_000; // 500 KB cap to prevent quota exhaustion

export interface StoredChatMessage {
  id: string;
  sender: "user" | "assistant";
  text?: string;
  questions?: string[];
}

export const storedChatMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["user", "assistant"]),
  text: z.string().optional(),
  questions: z.array(z.string()).optional(),
});

export const storedFailedRequestSchema = z.object({
  kind: z.enum(["intake", "design"]),
  message: z.string(),
  text: z.string().optional(),
});

export type StoredFailedRequest = z.infer<typeof storedFailedRequestSchema>;

export const intakeStorageSchema = z.object({
  version: z.literal("v1"),
  sessionId: z.string().nullable(),
  inputText: z.string().default(""),
  messages: z.array(storedChatMessageSchema).default([]),
  brief: requirementBriefSchema.nullable().default(null),
  designId: z.string().nullable().optional(),
  failedRequest: storedFailedRequestSchema.nullable().optional().default(null),
});

export type IntakeStorageData = z.infer<typeof intakeStorageSchema>;

export interface SaveIntakeInput {
  sessionId: string | null;
  inputText: string;
  messages: StoredChatMessage[];
  brief: RequirementBrief | null;
  designId?: string | null;
  failedRequest?: StoredFailedRequest | null;
}

/**
 * Retrieve saved intake state from sessionStorage.
 *
 * Rules:
 * - Scoped to browser tab (sessionStorage, cleared on tab close)
 * - Validated with Zod schema (intakeStorageSchema)
 * - Returns null if missing, corrupt, version mismatched, or unparseable
 * - Safe for SSR (returns null when window is undefined)
 */
export function loadIntakeState(): IntakeStorageData | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(INTAKE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    const result = intakeStorageSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Persist active intake state into sessionStorage.
 *
 * Rules:
 * - Scoped strictly to tab-level sessionStorage (never localStorage, never backend logs)
 * - Capped at 500 KB (512,000 bytes)
 * - Swallows storage quota and security errors gracefully
 */
export function saveIntakeState(input: SaveIntakeInput): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: IntakeStorageData = {
      version: "v1",
      sessionId: input.sessionId ?? null,
      inputText: input.inputText ?? "",
      messages: input.messages ?? [],
      brief: input.brief ?? null,
      designId: input.designId ?? null,
      failedRequest: input.failedRequest ?? null,
    };

    const serialized = JSON.stringify(payload);
    const byteLength =
      typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(serialized).length
        : serialized.length;

    if (byteLength > INTAKE_STORAGE_MAX_BYTES) {
      return;
    }

    window.sessionStorage.setItem(INTAKE_STORAGE_KEY, serialized);
  } catch {
    // Gracefully ignore storage quota or access errors in restricted modes
  }
}

/**
 * Clear stored intake state from sessionStorage.
 *
 * Used when user explicitly clicks "New design" (?new=1).
 */
export function clearIntakeState(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(INTAKE_STORAGE_KEY);
  } catch {
    // Gracefully ignore
  }
}
