# WallBall

A browser port of the Java arcade game created by James Etten, Michael Schmidt,
and Brady Dow in 2017 at UW–Platteville. The original NetBeans project remains
in `src/`, `nbproject/`, and `dist/`.

## Play and develop

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open the development server on port 5173. The browser version is vanilla
JavaScript and Canvas. Solo/local games run entirely in the browser; online
rooms run authoritative gameplay in a Cloudflare Durable Object. No application
API keys or external database are needed. `npm run dev` runs Cloudflare’s local
Worker/Durable Object runtime. `npm run dev:static` serves solo/local play only.
`npm run build` creates a deployable static site in `web-dist/`, including the
original power-up artwork. `dist/WallBall.jar` is the original Java artifact;
it is not the browser build.

- Solo: W / S, touch buttons, or drag on the court; choose one of five CPU difficulties.
- Two players on the same device: W / S for the left paddle, arrow keys for the right.
  Touch buttons work for both players.
- Online: choose **Online → Create a private room**, copy the invite, and send it
  to your friend. Both players choose **Ready**. Use W / S, arrow keys, touch
  buttons, or drag to move your assigned paddle.
- Space or the Pause button pauses. Solo/local play resumes immediately; online
  play needs both players to choose Resume. Escape/Leave exits the room. Losing
  focus clears held input; solo/local matches also pause automatically.
- Each player starts with ten lives. Missing a ball costs one life; each paddle
  return earns one point. The last player with lives remaining wins.
- Hit a power-up with the ball to claim it for the last player to return the ball.
  Paddle/ball effects last 12 seconds of active gameplay. Extra life is capped at
  15; multiball adds another ball (up to eight). Unclaimed power-ups expire after 15 seconds.

The port preserves the game's premise and mechanics while using time-based
physics for different screen refresh rates. It enables the original multiball
power-up and corrects shrink-ball and temporary-effect restoration behavior.
Java gameplay and build files are unchanged.

## Validate

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npx wrangler deploy --dry-run --outdir /tmp/wallball-worker
```

CI runs mechanics tests and Chromium browser tests (desktop/mobile and two independent multiplayer clients)
on pull requests and pushes to `main`. To use an already installed Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

## Deploy to Cloudflare

The site uses **Cloudflare Workers Static Assets** and a SQLite-backed
**Durable Object** per online room, configured in `wrangler.jsonc`. Durable
Objects are available on Workers Free and Paid plans, subject to Cloudflare
usage limits and pricing. Worker name
is `wallball`; edit it if that name is already in use in your account.

1. In Cloudflare, create an API token scoped to your account with **Account →
   Workers Scripts → Edit**. Cloudflare's “Edit Cloudflare Workers” token template
   is a suitable starting point; this project does not configure DNS or routes.
2. In this GitHub repository's **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN`: the API token.
   - `CLOUDFLARE_ACCOUNT_ID`: your account ID from the Cloudflare dashboard.
3. Push the changes to `main` or run the **Browser game** workflow manually on
   `main`. Deployment runs only after tests pass. Pull requests never deploy.

The deployment log reports the resulting `workers.dev` address. Enable your
account's `workers.dev` subdomain in Cloudflare if prompted. The existing dashboard-managed domain/route settings are left in the dashboard;
this config does not replace them. Both `wallball.dowster.net/` and
`dowster.net/wallball/` are supported, including assets, invite links and sockets.
For the path route, use **`dowster.net/wallball*`** (or exact `/wallball` plus
`/wallball/*` routes), so the API and assets also reach this Worker. The bare
`/wallball` URL redirects to `/wallball/`. Do not commit credentials to files.

For manual deployment, authenticate using `npx wrangler login`, then run
`npm run deploy` (or supply the two environment variables securely).
Live deployment runs in GitHub Actions using your repository secrets.
The `v1` migration creates the `GameRoom` Durable Object namespace on first
deployment; keep that migration in configuration. The existing Workers Scripts
Edit token deploys the Worker and its own Durable Object binding. This project
does not provision a zone or edit DNS/route settings via CI.


## Multiplayer architecture and room lifecycle

`worker/index.js` routes same-origin room requests to `GameRoom` Durable Objects.
`worker/room.js` owns the two reserved seats and uses the shared game engine.
The server runs physics at approximately 60 ticks/second and sends snapshots
at 20 Hz. Browsers send bounded, sequenced paddle inputs at up to 30 Hz; they
never submit scores, collisions, lives, or their own player identity. Touch
movement is capped at paddle speed on the server. Ball IDs support interpolation;
the local paddle is predicted and corrected from acknowledged server input.

Rooms are unlisted, with random ten-character invite codes. Each seat has an
independent random reconnect token stored in the tab's session storage, sent
through the WebSocket subprotocol rather than an invite URL. A third player is
rejected. Joining a room on another domain/origin is a separate browser session;
share the invite's original URL. No accounts, matchmaking, spectators, or voice
chat are included.

Both players must be ready to start, resume, or rematch. A disconnect pauses the
server immediately and reserves the seat for 60 seconds. Reloading the invite
in the same tab reconnects to that seat and needs mutual resume. Opening the
same seat in a duplicate tab replaces its previous connection. Explicitly
leaving closes the room for both players. Rooms waiting/paused/finished for ten
minutes expire; their stored room state is deleted. Input stops moving a paddle after 250 ms without fresh input;
heartbeats detect a dead connection after 35 seconds.

Active matches keep the Durable Object awake. Waiting and paused rooms use the
WebSocket hibernation API and alarms, with no running physics timer. Match
checkpoints are persisted every five seconds and on lifecycle transitions. A
platform restart can roll back at most the latest checkpoint interval; this is
a casual arcade game, not a competitive match ledger.

## Logs and troubleshooting

Persistent application logs are enabled in `wrangler.jsonc`, with full sampling.
Automatic invocation logs are disabled: Cloudflare must not create an invocation
log for every WebSocket input or heartbeat. Room creation, connections, disconnections, phase changes,
match end, invalid messages, and expiry emit structured logs with a Durable
Object ID and seat number. Application logs omit reconnect tokens, invite URLs,
raw messages, and per-frame snapshots.

View **Workers & Pages → wallball → Logs / Observability** in Cloudflare, or use
`npx wrangler tail` after authenticating. Normal paddle inputs, heartbeats and snapshots do not emit application logs;
only room lifecycle events and errors do. `/api/health` and `/wallball/api/health` return `{"multiplayer":true}` once
the backend is deployed. A route/DNS change alone does not deploy new code.


## What stays alive?

The browser starts an HTTP WebSocket upgrade request. The routing Worker maps
its room code to a Durable Object ID and forwards the handshake. `GameRoom`
creates a `WebSocketPair`, accepts its server endpoint with the hibernation API,
and returns the browser endpoint in a `101 Switching Protocols` response.
Cloudflare then delivers frames to that object's `webSocketMessage` method;
they do not run through the routing Worker's HTTP handler again.

A Durable Object is a uniquely addressed stateful actor, with one active
instance owning a room. It is not a dedicated VM or an immortal Node process.
Cloudflare manages its location, execution, connections and durable storage.
Both players reach the same room owner, which keeps their authoritative match
in memory and advances physics with a timer. That timer keeps an active match
awake. When the timer stops for waiting/paused/finished rooms, the object can
hibernate while Cloudflare holds its WebSocket connections open.

When a message or alarm wakes a hibernated room, Cloudflare creates a new JS
instance. Its constructor reloads the stored checkpoint and recovers socket
seat identities from serialized attachments. Durable means the object's
identity and saved state survive eviction; it does not mean every memory update
is automatically persisted or that a connection can never drop. A platform
restart can lose up to five seconds of unsaved match state, and a broken socket
uses the reconnect flow.
