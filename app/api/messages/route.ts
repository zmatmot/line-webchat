import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError, serverError } from "@/lib/http";
import { LineApiError, MAX_TEXT_LENGTH, pushText } from "@/lib/line";
import {
  appendMessage,
  getUser,
  isValidUserId,
  listMessages,
} from "@/lib/store";
import type {
  ChatMessage,
  MessagesResponse,
  SendMessageResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!isValidUserId(userId)) {
    return jsonError("Invalid or missing userId", 400);
  }

  try {
    const body: MessagesResponse = { messages: await listMessages(userId) };
    return NextResponse.json(body);
  } catch (error) {
    return serverError("GET /api/messages failed", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Request body must be JSON", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Request body must be a JSON object", 400);
  }

  const { userId, text: rawText } = payload as Record<string, unknown>;
  if (!isValidUserId(userId)) {
    return jsonError("Invalid or missing userId", 400);
  }
  if (typeof rawText !== "string") {
    return jsonError("text must be a string", 400);
  }
  const text = rawText.trim();
  if (text.length === 0) {
    return jsonError("text must not be empty", 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonError(
      `text must be at most ${MAX_TEXT_LENGTH} characters`,
      400,
    );
  }

  try {
    // Only reply to users who have contacted the OA.
    if (!(await getUser(userId))) {
      return jsonError("User not found", 404);
    }
  } catch (error) {
    return serverError("POST /api/messages failed to load the user", error);
  }

  try {
    await pushText(userId, text, randomUUID());
  } catch (error) {
    if (error instanceof LineApiError) {
      return jsonError(error.message, error.status);
    }
    return serverError("POST /api/messages failed to push", error);
  }

  const message: ChatMessage = {
    id: randomUUID(),
    direction: "out",
    type: "text",
    text,
    ts: Date.now(),
  };
  try {
    await appendMessage(userId, message);
  } catch (error) {
    console.error("Message was pushed but could not be stored", error);
    return jsonError(
      "The message was delivered to LINE but could not be saved to the " +
        "conversation history. Do not resend it.",
      500,
    );
  }

  const body: SendMessageResponse = { message };
  return NextResponse.json(body);
}
