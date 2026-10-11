export type MessageDirection = "in" | "out";

export type MessageType =
  | "text"
  | "sticker"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "location"
  | "unknown";

/** One entry of the `messages:{userId}` list. */
export interface ChatMessage {
  id: string;
  direction: MessageDirection;
  type: MessageType;
  text: string;
  /** Unix epoch in milliseconds. */
  ts: number;
}

/** The `user:{userId}` hash, with numeric fields parsed. */
export interface ChatUser {
  userId: string;
  displayName: string;
  pictureUrl: string;
  lastMessage: string;
  /** Unix epoch in milliseconds. */
  lastAt: number;
  unread: number;
}

export interface UserProfile {
  displayName: string;
  pictureUrl: string;
}

export interface UsersResponse {
  users: ChatUser[];
}

export interface MessagesResponse {
  messages: ChatMessage[];
}

export interface SendMessageRequest {
  userId: string;
  text: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
}

export interface ErrorResponse {
  error: string;
}
