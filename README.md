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
JavaScript and Canvas, with no server-side gameplay, database, or runtime secrets.
`npm run build` creates a deployable static site in `web-dist/`, including the
original power-up artwork. `dist/WallBall.jar` is the original Java artifact;
it is not the browser build.

- Solo: W / S, touch buttons, or drag on the court; choose one of five CPU difficulties.
- Two players on the same device: W / S for the left paddle, arrow keys for the right.
  Touch buttons work for both players. This is local play, not online multiplayer.
- Space or the Pause button pauses/resumes. Escape returns to the menu. Losing
  browser focus automatically pauses the match.
- Each player starts with ten lives. Missing a ball costs one life; each paddle
  return earns one point. The last player with lives remaining wins.
- Hit a power-up with the ball to claim it for the last player to return the ball.
  Paddle/ball effects last 12 seconds of active gameplay. Extra life is capped at
  15; multiball adds another ball. Unclaimed power-ups expire after 15 seconds.

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

CI runs mechanics tests and Chromium browser tests (desktop and mobile layout)
on pull requests and pushes to `main`. To use an already installed Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

## Deploy to Cloudflare

The site uses **Cloudflare Workers Static Assets**, configured in
`wrangler.jsonc`. No paid backend or application API key is needed. Worker name
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
account's `workers.dev` subdomain in Cloudflare if prompted. Custom domains can
be added in the Worker dashboard afterward. Do not commit credentials to files.

For manual deployment, authenticate using `npx wrangler login`, then run
`npm run deploy` (or supply the two environment variables securely).
Deployment from this workspace has not been performed; credentials are supplied
by your GitHub Actions secrets when you enable CI.
