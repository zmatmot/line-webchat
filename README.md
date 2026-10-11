# LINE OA Webchat

A web chat console for a LINE Official Account (OA). Messages that LINE users
send to the OA show up in a two-pane inbox; an agent picks a user, reads the
conversation and replies. Replies are delivered through the LINE Messaging API.

- Receives messages through the Messaging API **webhook** (signature-verified, deduplicated)
- Lists everyone who messaged the OA, with display name, profile picture, last message, relative time and unread count
- Shows the conversation as chat bubbles and sends replies as **push messages**
- Runs on Vercel serverless functions with Upstash Redis for storage

**Stack:** Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · `@line/bot-sdk` · `@upstash/redis`

## Architecture

```
 LINE user                                              Agent (browser)
     |                                                        ^
     | sends a message                     polls every 3 s    |  types a reply
     v                                                        |
+-----------+  POST /api/webhook        +--------------------------------------+
|   LINE    | ------------------------> |           Next.js on Vercel          |
| Platform  |  x-line-signature (HMAC)  |                                      |
|           |                           |  app/api/webhook        (receive)    |
|           | <------------------------ |  app/api/users          (list)       |
|           |  getProfile(userId)       |  app/api/messages       (read/send)  |
|           |                           |  app/api/users/:id/read (mark read)  |
|           | <------------------------ |                                      |
|           |  pushMessage              |  lib/line.ts   LINE client, verify   |
+-----------+  + X-Line-Retry-Key       |  lib/store.ts  data access           |
     |                                  |  lib/redis.ts  Upstash client        |
     | delivers the reply               +--------------------------------------+
     v                                                     |
 LINE user                                                 | REST (HTTPS)
                                                           v
                                                 +-------------------+
                                                 |   Upstash Redis   |
                                                 +-------------------+
```

### Project layout

```
app/
  page.tsx                         renders <ChatApp />
  layout.tsx, globals.css
  api/
    webhook/route.ts               POST  LINE webhook receiver
    users/route.ts                 GET   user list, newest first
    users/[userId]/read/route.ts   POST  reset unread counter
    messages/route.ts              GET   conversation / POST send reply
components/
  ChatApp.tsx                      state, polling, optimistic send
  UserList.tsx                     left pane
  Conversation.tsx                 right pane: header, bubbles, auto-scroll
  Composer.tsx                     input box (Enter / Shift+Enter)
  Avatar.tsx, Toast.tsx
hooks/usePolling.ts                visibility-aware polling
lib/
  types.ts                         shared types (API + storage)
  redis.ts                         Upstash client, both env naming schemes
  store.ts                         every Redis read/write
  line.ts                          LINE client, signature check, error mapping
  http.ts                          JSON error helpers
  api-client.ts                    typed fetch wrappers for the browser
  format.ts                        time formatting
```

## API

| Route | Behaviour |
| --- | --- |
| `POST /api/webhook` | Reads the raw body, verifies `x-line-signature` (401 if invalid), then handles `message` and `follow` events from 1:1 chats. Returns 200 for an empty `events` array, which is what the console's **Verify** button sends. |
| `GET /api/users` | `{ users: ChatUser[] }`, most recently active first (up to 200). |
| `GET /api/messages?userId=U…` | `{ messages: ChatMessage[] }` in chronological order. 400 if `userId` is not `U` + 32 hex characters. |
| `POST /api/messages` | Body `{ userId, text }`. Validates (non-empty after trim, ≤ 5000 chars, known user), pushes the text to LINE, stores it as an outgoing message and returns `{ message }`. |
| `POST /api/users/{userId}/read` | Sets `unread` to 0. |

Errors are always `{ "error": "…" }`. For LINE failures the status is mapped:
LINE 400 → 400, LINE 429 (rate limit / monthly quota) → 429, and LINE 401/403
(bad channel token) or 5xx → 502, because those are the server's problem and
not the caller's.

All routes export `runtime = "nodejs"` and `dynamic = "force-dynamic"`.

## Data model (Redis)

| Key | Type | Content |
| --- | --- | --- |
| `user:{userId}` | hash | `userId`, `displayName`, `pictureUrl`, `lastMessage`, `lastAt` (ms), `unread` (int) |
| `users` | sorted set | member = `userId`, score = `lastAt`; read with `ZRANGE … REV` for newest first |
| `messages:{userId}` | list | JSON `{ id, direction: "in" \| "out", type, text, ts }`, appended with `RPUSH`, capped to the latest 500 with `LTRIM` |
| `webhook:event:{webhookEventId}` | string | dedupe marker, `SET NX EX 86400` |

Storing a message (`RPUSH` + `LTRIM` + `HSET` + `HINCRBY` + `ZADD`) runs as one
`MULTI` transaction, so the list, the summary and the ordering cannot drift
apart. Non-text messages are stored as a readable placeholder (`[sticker]`,
`[image]`, `[file] report.pdf`, `[location] Office`, …) with their `type`.

## Setup

### 1. LINE Official Account and Messaging API channel

1. Create an Official Account in [LINE Official Account Manager](https://manager.line.biz/).
2. In **Settings → Messaging API**, enable the Messaging API and pick (or create) a provider.
3. Open the channel in the [LINE Developers Console](https://developers.line.biz/console/):
   - **Basic settings → Channel secret** → `LINE_CHANNEL_SECRET`
   - **Messaging API → Channel access token (long-lived)** → issue it → `LINE_CHANNEL_ACCESS_TOKEN`
4. In OA Manager **Settings → Response settings**, turn off auto-reply and
   greeting messages if you don't want LINE answering alongside the agent.

### 2. Deploy to Vercel with Upstash Redis

1. Push this repository to GitHub and import it in Vercel.
2. In the Vercel project: **Storage → Create Database → Upstash → Redis**, and
   connect it to the project. The integration injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically.
3. Under **Settings → Environment Variables**, add `LINE_CHANNEL_SECRET` and
   `LINE_CHANNEL_ACCESS_TOKEN`.
4. Redeploy so the new variables are picked up.

### 3. Environment variables

| Variable | Source |
| --- | --- |
| `LINE_CHANNEL_SECRET` | LINE Developers Console → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → Messaging API |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel Upstash integration, **or** |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | a database created directly on upstash.com |

`lib/redis.ts` uses whichever Redis pair is present and throws a descriptive
error if neither is. See [.env.example](.env.example).

### 4. Point the webhook at the deployment

In the LINE Developers Console, **Messaging API** tab:

1. Set **Webhook URL** to `https://<your-domain>/api/webhook`.
2. Click **Verify** — it should report success.
3. Turn on **Use webhook**.
4. Optional: turn on **Webhook redelivery**. Failed events are then retried by
   LINE, and the dedupe key keeps the retries from creating duplicates.

Add the OA as a friend, send it a message, and the chat appears in the console.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values; .env.local is git-ignored
npm run dev                  # http://localhost:3000
```

LINE can only deliver webhooks to a public HTTPS URL, so `localhost` never
receives messages by itself. Either:

- point the webhook at a deployment (the simplest option — a local `npm run dev`
  using the same Redis credentials then shows the same data and can send
  replies), or
- expose the dev server with a tunnel, e.g. `ngrok http 3000`, and temporarily
  set the webhook URL to `https://<id>.ngrok-free.app/api/webhook`.

Checks: `npm run lint` and `npm run build`.

## Design decisions

**Push instead of reply.** A reply token is valid for a short time and can be
used once. A human agent may answer minutes or hours later, or send several
messages in a row, so replies go out with `pushMessage` and the reply token is
never used. The trade-off is that push messages count against the monthly
quota, while replies are free.

**Redis.** Vercel functions are stateless and short-lived, so in-memory state
is lost between invocations. Upstash Redis is reached over HTTPS (no connection
pool to exhaust from serverless), and its data types map directly onto the
problem: a sorted set for "conversations by last activity", a capped list per
conversation, a hash per user, and `SET NX EX` for dedupe.

**Polling.** The UI polls `/api/users` and the open conversation every 3
seconds, and stops while the tab is hidden. It needs no extra infrastructure
and works within serverless request limits. The upgrade path is server push —
SSE/WebSocket where long-lived connections are available, or a hosted pub/sub
service such as Pusher or Ably, published to from the webhook handler. A
cheaper intermediate step is an `?after=<ts>` cursor so a poll returns only new
messages.

**Signature verification.** `/api/webhook` is a public URL, so every request
must prove it comes from LINE. The handler reads the body as raw text and
checks the HMAC-SHA256 in `x-line-signature` against the channel secret
*before* parsing JSON — the signature covers the exact bytes, and re-serialised
JSON would not match.

**Idempotency in both directions.** Inbound: `webhookEventId` is claimed with
`SET NX` (1-day TTL), so a redelivered event is skipped. If handling fails, the
claim is released and the route returns 500, so a redelivery is processed
rather than deduped away. Outbound: each push carries an `X-Line-Retry-Key`
(UUID), which LINE uses to reject duplicates of the same request.

**Profile lookups.** The profile is fetched the first time a user is seen, on
every `follow` event, and again while only the `Unknown` fallback is stored.
If `getProfile` fails, the user is stored as `Unknown` and the message is kept.

**Optimistic UI.** A sent message appears immediately in a "Sending…" state.
On failure it is removed, the text is put back into the input box, and a toast
shows the reason.

**Cache Components is disabled** in `next.config.ts`. `create-next-app` enables
it by default in Next.js 16, but it removes the `dynamic` route segment config,
and these routes declare `dynamic = "force-dynamic"` explicitly.

## Known limitations

- **No authentication on the console.** Anyone with the URL can read
  conversations and send messages as the OA. Before real use, put it behind
  auth (e.g. Auth.js, or Vercel Deployment Protection) — this is the first
  thing to add.
- **Push quota.** Every reply is a push message. The free plan includes
  only a small number of messages per month (the exact figure depends on
  country and plan — check OA Manager). When it is exhausted LINE returns 429
  and the UI shows the error.
- **Text only.** Incoming stickers, images, video, audio, files and locations
  appear as placeholders; their content is not downloaded. Outgoing messages
  are text only.
- **1:1 chats only.** Group and multi-person chat events are ignored.
- **History is capped** at the latest 500 messages per user, and the list
  shows the 200 most recently active users. Each poll re-fetches the whole
  open conversation.
- **Polling latency** of up to 3 seconds, and steady request volume while a
  tab is open and visible.
- **Unread is per OA, not per agent**, and nothing prevents two agents from
  answering the same user at once.
- **Push then store is not atomic.** If Redis fails after LINE accepted the
  push, the user receives the message but it is missing from the history; the
  API reports this case explicitly.
- **No automated tests** are included.
