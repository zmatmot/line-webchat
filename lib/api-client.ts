import type {
  ChatMessage,
  ChatUser,
  MessagesResponse,
  SendMessageRequest,
  SendMessageResponse,
  UsersResponse,
} from "./types";

function errorFrom(data: unknown, status: number): Error {
  if (typeof data === "object" && data !== null) {
    const { error } = data as Record<string, unknown>;
    if (typeof error === "string") return new Error(error);
  }
  return new Error(`Request failed (${status})`);
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw errorFrom(data, response.status);
  }
  return data as T;
}

export async function fetchUsers(): Promise<ChatUser[]> {
  const { users } = await request<UsersResponse>("/api/users");
  return users;
}

export async function fetchMessages(userId: string): Promise<ChatMessage[]> {
  const { messages } = await request<MessagesResponse>(
    `/api/messages?userId=${encodeURIComponent(userId)}`,
  );
  return messages;
}

export async function sendMessage(
  userId: string,
  text: string,
): Promise<ChatMessage> {
  const body: SendMessageRequest = { userId, text };
  const { message } = await request<SendMessageResponse>("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return message;
}

export async function markRead(userId: string): Promise<void> {
  await request<{ ok: true }>(
    `/api/users/${encodeURIComponent(userId)}/read`,
    { method: "POST" },
  );
}
