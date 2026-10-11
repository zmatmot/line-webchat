"use client";

import { formatRelativeTime } from "@/lib/format";
import type { ChatUser } from "@/lib/types";
import { Avatar } from "./Avatar";

interface UserListProps {
  users: ChatUser[];
  loaded: boolean;
  error: string | null;
  selectedId: string | null;
  now: number;
  onSelect: (userId: string) => void;
}

export function UserList({
  users,
  loaded,
  error,
  selectedId,
  now,
  onSelect,
}: UserListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#06c755]" aria-hidden />
        <h1 className="text-lg font-semibold">Chats</h1>
      </header>

      {error && (
        <p
          role="alert"
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          Could not load chats: {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loaded ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
        ) : users.length === 0 ? (
          !error && (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-700">No chats yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Add the OA as a friend and send a message
              </p>
            </div>
          )
        ) : (
          <ul>
            {users.map((user) => (
              <li key={user.userId}>
                <UserListItem
                  user={user}
                  selected={user.userId === selectedId}
                  now={now}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface UserListItemProps {
  user: ChatUser;
  selected: boolean;
  now: number;
  onSelect: (userId: string) => void;
}

function UserListItem({ user, selected, now, onSelect }: UserListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(user.userId)}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        selected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <Avatar name={user.displayName} pictureUrl={user.pictureUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{user.displayName}</span>
          <span className="shrink-0 text-xs text-slate-400">
            {formatRelativeTime(user.lastAt, now)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={`truncate text-sm ${
              user.unread > 0 ? "font-medium text-slate-800" : "text-slate-500"
            }`}
          >
            {user.lastMessage || "No messages yet"}
          </span>
          {user.unread > 0 && (
            <span
              aria-label={`${user.unread} unread`}
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#06c755] px-1.5 text-xs font-semibold text-white"
            >
              {user.unread > 99 ? "99+" : user.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
