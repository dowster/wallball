# Development workflow

The active application is the browser/Worker port in `web/` and `worker/`.
The original Java/NetBeans files remain a reference project.

- Create or reuse a feature branch for changes. Push that branch to trigger
  its Cloudflare preview; use a pull request to review changes before production.
- Do not push directly to `main` or merge a pull request unless the user asks.
  Production deploys from `main`; each preview Worker has separate room state.
- Run `npm run format`, `npm run format:check`, `npm test`, and
  `npm run test:browser` for relevant code changes. The browser tests use the
  real local Worker/Durable Object runtime. An installed Chromium can be selected
  with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
- Never commit generated builds, local Worker state, or credentials.
- Keep normal WebSocket input, heartbeat, and snapshot traffic out of logs.
  Persistent application logs are for lifecycle events and errors; automatic
  invocation logs remain disabled.
- Future cloud tasks already have isolated checkouts. Do not create a Git
  worktree unless the user explicitly requests one.
