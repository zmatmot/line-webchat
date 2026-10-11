"use client";

import { useState, type KeyboardEvent } from "react";

const MAX_LENGTH = 5000;

interface ComposerProps {
  sending: boolean;
  /** Resolves to false when sending failed, so the draft can be restored. */
  onSend: (text: string) => Promise<boolean>;
}

export function Composer({ sending, onSend }: ComposerProps) {
  const [draft, setDraft] = useState("");

  const text = draft.trim();
  const tooLong = text.length > MAX_LENGTH;
  const canSend = !sending && text.length > 0 && !tooLong;

  const submit = async (): Promise<void> => {
    if (!canSend) return;
    setDraft("");
    const sent = await onSend(text);
    if (!sent) {
      // Give the text back, unless the agent already started a new draft.
      setDraft((current) => (current === "" ? text : current));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // isComposing: Enter that confirms an IME candidate (Thai, Japanese, …)
    // must not send the message.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="shrink-0 border-t border-slate-200 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Type a message"
          aria-label="Message"
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-2 text-[15px] outline-none focus:border-[#06c755]"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-10 shrink-0 rounded-full bg-[#06c755] px-5 font-semibold text-white transition-colors hover:bg-[#05b34c] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <p
        className={`mt-1 px-1 text-xs ${
          tooLong ? "text-red-600" : "text-slate-400"
        }`}
      >
        {tooLong
          ? `${text.length} / ${MAX_LENGTH} characters — too long to send`
          : "Enter to send, Shift+Enter for a new line"}
      </p>
    </form>
  );
}
