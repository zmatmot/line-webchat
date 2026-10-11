"use client";

import { useCallback, useRef, useState } from "react";
import { usePolling } from "@/hooks/usePolling";
import {
  fetchMessages,
  fetchUsers,
  markRead,
  sendMessage,
} from "@/lib/api-client";
import type { ChatMessage, ChatUser } from "@/lib/types";
import { Conversation, type PendingMessage } from "./Conversation";
import { Toast } from "./Toast";
import { UserList } from "./UserList";

const POLL_INTERVAL_MS = 3000;

interface OpenConversation {
  userId: string;
  messages: ChatMessage[];
  loaded: boolean;
  error: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

/**
 * Applies a polled snapshot. A poll that started before a send finished does
 * not contain the sent message yet, so local messages newer than the snapshot
 * are kept; the previous array is reused when nothing changed.
 */
function mergeMessages(
  local: ChatMessage[],
  server: ChatMessage[],
): ChatMessage[] {
  const serverIds = new Set(server.map((message) => message.id));
  const lastServerTs = server.at(-1)?.ts ?? 0;
  const localOnly = local.filter(
    (message) => !serverIds.has(message.id) && message.ts > lastServerTs,
  );
  const merged = localOnly.length > 0 ? [...server, ...localOnly] : server;

  const unchanged =
    merged.length === local.length &&
    merged.at(-1)?.id === local.at(-1)?.id &&
    merged[0]?.id === local[0]?.id;
  return unchanged ? local : merged;
}

export function ChatApp() {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<OpenConversation | null>(
    null,
  );
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pendingCounter = useRef(0);

  const selectedId = conversation?.userId ?? null;
  const selectedUser = users.find((user) => user.userId === selectedId);

  const refreshUsers = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchUsers();
      // Messages that arrive while the conversation is open are read at once.
      const openHasUnread = next.some(
        (user) => user.userId === selectedId && user.unread > 0,
      );
      if (selectedId && openHasUnread) {
        void markRead(selectedId).catch(() => undefined);
      }
      setUsers(
        next.map((user) =>
          user.userId === selectedId ? { ...user, unread: 0 } : user,
        ),
      );
      setUsersError(null);
    } catch (error) {
      setUsersError(errorMessage(error));
    } finally {
      setUsersLoaded(true);
      setNow(Date.now());
    }
  }, [selectedId]);

  const refreshMessages = useCallback(async (): Promise<void> => {
    if (!selectedId) return;
    try {
      const server = await fetchMessages(selectedId);
      // Ignore the response if another conversation was opened meanwhile.
      setConversation((current) =>
        current?.userId === selectedId
          ? {
              ...current,
              messages: mergeMessages(current.messages, server),
              loaded: true,
              error: null,
            }
          : current,
      );
    } catch (error) {
      setConversation((current) =>
        current?.userId === selectedId
          ? { ...current, error: errorMessage(error) }
          : current,
      );
    }
  }, [selectedId]);

  usePolling(refreshUsers, POLL_INTERVAL_MS);
  usePolling(refreshMessages, POLL_INTERVAL_MS, selectedId !== null);

  const selectUser = useCallback(
    (userId: string): void => {
      if (userId === selectedId) return;
      setConversation({ userId, messages: [], loaded: false, error: null });
      setUsers((current) =>
        current.map((user) =>
          user.userId === userId ? { ...user, unread: 0 } : user,
        ),
      );
      void markRead(userId).catch(() => undefined);
    },
    [selectedId],
  );

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const userId = selectedId;
      if (!userId) return false;

      pendingCounter.current += 1;
      const tempId = `pending-${pendingCounter.current}`;
      setPending((current) => [
        ...current,
        { tempId, userId, text, ts: Date.now() },
      ]);

      try {
        const message = await sendMessage(userId, text);
        setConversation((current) =>
          current?.userId === userId &&
          !current.messages.some((existing) => existing.id === message.id)
            ? { ...current, messages: [...current.messages, message] }
            : current,
        );
        setUsers((current) => {
          const sender = current.find((user) => user.userId === userId);
          if (!sender) return current;
          return [
            { ...sender, lastMessage: message.text, lastAt: message.ts },
            ...current.filter((user) => user.userId !== userId),
          ];
        });
        return true;
      } catch (error) {
        setToast(`Message not sent: ${errorMessage(error)}`);
        return false;
      } finally {
        // On success the real message replaces the optimistic one; on failure
        // this is the rollback.
        setPending((current) =>
          current.filter((item) => item.tempId !== tempId),
        );
      }
    },
    [selectedId],
  );

  const closeConversation = useCallback(() => setConversation(null), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const openPending = pending.filter((item) => item.userId === selectedId);

  return (
    <main className="flex h-dvh overflow-hidden bg-white text-slate-900">
      <aside
        className={`${
          conversation ? "hidden md:flex" : "flex"
        } w-full flex-col border-r border-slate-200 md:w-80 lg:w-96`}
      >
        <UserList
          users={users}
          loaded={usersLoaded}
          error={usersError}
          selectedId={selectedId}
          now={now}
          onSelect={selectUser}
        />
      </aside>

      <section
        className={`${
          conversation ? "flex" : "hidden md:flex"
        } min-w-0 flex-1 flex-col`}
      >
        {conversation ? (
          <Conversation
            key={conversation.userId}
            displayName={selectedUser?.displayName ?? "Unknown"}
            pictureUrl={selectedUser?.pictureUrl ?? ""}
            messages={conversation.messages}
            pending={openPending}
            loaded={conversation.loaded}
            error={conversation.error}
            sending={openPending.length > 0}
            onBack={closeConversation}
            onSend={handleSend}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-50 p-8 text-center">
            <p className="font-medium text-slate-700">No chat selected</p>
            <p className="text-sm text-slate-500">
              Select a chat from the list to view the conversation and reply
            </p>
          </div>
        )}
      </section>

      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </main>
  );
}
