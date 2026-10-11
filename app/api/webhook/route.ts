import type { webhook } from "@line/bot-sdk";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { describeMessage, fetchProfile, verifySignature } from "@/lib/line";
import {
  appendMessage,
  claimWebhookEvent,
  hasProfile,
  isValidUserId,
  releaseWebhookEvent,
  saveProfile,
  touchUser,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEvents(rawBody: string): webhook.Event[] | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { events } = parsed as Record<string, unknown>;
    // The signature has been verified, so the payload shape is LINE's.
    return Array.isArray(events) ? (events as webhook.Event[]) : null;
  } catch {
    return null;
  }
}

async function ensureProfile(userId: string, force: boolean): Promise<void> {
  if (!force && (await hasProfile(userId))) return;
  await saveProfile(userId, await fetchProfile(userId));
}

async function handleEvent(event: webhook.Event): Promise<void> {
  // Only 1:1 chats are supported; group and room events are ignored.
  const source = event.source;
  if (source?.type !== "user" || !isValidUserId(source.userId)) return;
  const userId = source.userId;

  if (event.type === "message") {
    await ensureProfile(userId, false);
    const { type, text } = describeMessage(event.message);
    await appendMessage(userId, {
      id: event.message.id,
      direction: "in",
      type,
      text,
      ts: event.timestamp,
    });
    return;
  }

  if (event.type === "follow") {
    // A (re-)follow is a good moment to refresh the name and picture.
    await ensureProfile(userId, true);
    await touchUser(userId, event.timestamp);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // The signature is computed over the exact bytes LINE sent, so the body is
  // read as text and verified before any JSON parsing.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-line-signature"))) {
    return jsonError("Invalid signature", 401);
  }

  const events = parseEvents(rawBody);
  if (!events) {
    return jsonError("Invalid webhook payload", 400);
  }

  // The console's "Verify" button sends an empty events array and lands here
  // with nothing to do.
  let failed = false;
  for (const event of events) {
    const eventId = event.webhookEventId;
    try {
      if (!(await claimWebhookEvent(eventId))) continue;
    } catch (error) {
      console.error(`Could not claim webhook event ${eventId}`, error);
      failed = true;
      continue;
    }

    try {
      await handleEvent(event);
    } catch (error) {
      console.error(`Failed to handle webhook event ${eventId}`, error);
      failed = true;
      // Let a redelivery of this event through instead of deduping it away.
      await releaseWebhookEvent(eventId).catch(() => undefined);
    }
  }

  // A non-2xx asks LINE to redeliver (when redelivery is enabled); events
  // that did succeed are skipped by the dedupe key.
  if (failed) {
    return jsonError("Failed to process some events", 500);
  }
  return NextResponse.json({ ok: true });
}
