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
