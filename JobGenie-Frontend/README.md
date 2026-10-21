# JobGenie frontend

React 18 + Vite + TypeScript + Tailwind (shadcn/ui components). See the [root README](../README.md)
to run the whole stack.

```bash
npm ci
npm run dev        # http://localhost:3000; /api and /ws are proxied to the gateway on :8080
npm test           # Vitest
npm run build      # production build in dist/
```

- Sign-in uses Firebase (config in `src/firebase.ts`). `src/lib/authFetch.ts` attaches the user's
  ID token to every request to the JobGenie API, and to nothing else.
- API clients live in `src/lib/api.ts`; pages in `src/pages/` are loaded on demand.
- `VITE_API_BASE_URL` sets the gateway URL at build time (default `http://localhost:8080`).
