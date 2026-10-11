"use client";

import { Fragment, useEffect, useRef } from "react";
import { formatClockTime, formatDayLabel } from "@/lib/format";
import type { ChatMessage, MessageDirection } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";

/** Distance from the bottom within which new messages keep the view pinned. */
const STICK_THRESHOLD_PX = 80;

export interface PendingMessage {
  tempId: string;
  userId: string;
  text: string;
  ts: number;
}

interface ConversationProps {
  displayName: string;
  pictureUrl: string;
  messages: ChatMessage[];
  pending: PendingMessage[];
  loaded: boolean;
  error: string | null;
  sending: boolean;
  onBack: () => void;
  onSend: (text: string) => Promise<boolean>;
}

interface BubbleItem {
  key: string;
  direction: MessageDirection;
  text: string;
  ts: number;
  isText: boolean;
  pending: boolean;
}

export function Conversation({
  displayName,
  pictureUrl,
  messages,
  pending,
  loaded,
  error,
  sending,
  onBack,
  onSend,
}: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const items: BubbleItem[] = [
    ...messages.map((message) => ({
      key: message.id,
      direction: message.direction,
      text: message.text,
      ts: message.ts,
      isText: message.type === "text",
      pending: false,
    })),
    ...pending.map((message) => ({
      key: message.tempId,
      direction: "out" as const,
      text: message.text,
      ts: message.ts,
      isText: true,
      pending: true,
    })),
  ];
  const lastKey = items.at(-1)?.key;

  // Follow new messages, unless the agent scrolled up to read history.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lastKey, loaded]);

  const handleSend = (text: string): Promise<boolean> => {
    stickToBottom.current = true;
    return onSend(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 md:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <Avatar
          name={displayName}
          pictureUrl={pictureUrl}
          className="h-10 w-10"
        />
        <h2 className="truncate font-semibold">{displayName}</h2>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            STICK_THRESHOLD_PX;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-[#8cabd9]/20 px-3 py-4 md:px-6"
      >
        {error && (
          <p
            role="alert"
            className="mx-auto mb-3 w-fit rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700"
          >
            Could not load messages: {error}
          </p>
        )}
        {!loaded && !error ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : (
          loaded &&
          items.length === 0 && (
            <p className="text-center text-sm text-slate-500">
              No messages in this chat yet
            </p>
          )
        )}

        <ol className="flex flex-col gap-2">
          {items.map((item, index) => {
            const previous = items[index - 1];
            const dayLabel = formatDayLabel(item.ts);
            const showDay = !previous || formatDayLabel(previous.ts) !== dayLabel;
            return (
              <Fragment key={item.key}>
                {showDay && (
                  <li className="my-2 self-center rounded-full bg-black/10 px-3 py-0.5 text-xs text-slate-600">
                    {dayLabel}
                  </li>
                )}
                <Bubble item={item} />
              </Fragment>
            );
          })}
        </ol>
      </div>

      <Composer sending={sending} onSend={handleSend} />
    </div>
  );
}

function Bubble({ item }: { item: BubbleItem }) {
  const outgoing = item.direction === "out";
  return (
    <li
      className={`flex items-end gap-1.5 ${
        outgoing ? "flex-row-reverse self-end" : "self-start"
      } max-w-[85%] md:max-w-[70%]`}
    >
      <p
        className={`rounded-2xl px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap ${
          outgoing
            ? "rounded-br-md bg-[#06c755] text-white"
            : "rounded-bl-md bg-slate-200 text-slate-900"
        } ${item.pending ? "opacity-60" : ""} ${item.isText ? "" : "italic"}`}
      >
        {item.text}
      </p>
      <span className="shrink-0 pb-0.5 text-[11px] text-slate-500">
        {item.pending ? "Sending…" : formatClockTime(item.ts)}
      </span>
    </li>
  );
}
