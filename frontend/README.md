# indigoQ frontend

Next.js + React + TypeScript infinite canvas for indigoQ. See the repository
[root README](../README.md) for the full setup, controls, and architecture.

Local scripts (normally run through moon):

```bash
pnpm install
pnpm dev        # next dev
pnpm build      # next build
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
```

The app talks to the API through a Next rewrite: `/api/*` proxies to
`process.env.INDIGOQ_API_URL` (default `http://127.0.0.1:8787`).

## Core workflow browser tests

```sh
pnpm exec playwright install chromium
INDIGOQ_STATIC_EXPORT=1 NEXT_PUBLIC_API_URL="" pnpm build
pnpm test:browser
```

These checks start the static app and backend on port 8897 using a disposable
graph. Install backend dependencies first with `uv sync --directory backend`
from the root. Failure traces go to `test-results/` (ignored by Git).
The **Core workflows** GitHub workflow runs these checks on pushes and pull
requests. See [first workflows](../docs/FIRST_WORKFLOWS.md) for scope and manual
voice-quality/first-user testing.
