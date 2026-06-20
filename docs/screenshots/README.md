# README screenshots

Regenerates the marketing screenshots in `docs/` (`dashboard.png`, `tree.png`,
`network.png`, `error-panel.png`, `command-palette.png`).

No cluster or backend is needed: the frontend runs against fully mocked data.
`shoot.mjs` intercepts every `/api/*` call and the `/ws` WebSocket with Playwright
and replays a synthetic resource graph from `mockData.mjs`, so the screenshots are
deterministic.

> `mcp.png` is **not** generated here — it's a capture of an external MCP client.
> Leave it untouched.

## Run

```bash
nix develop -c docs/screenshots/run.sh   # chromium comes from the dev shell
```

`run.sh` installs deps, boots `web` on a throwaway Vite port, waits for it, runs
`shoot.mjs`, and tears the server down. Output overwrites the PNGs in `docs/`.

## Knobs

- `CHROMIUM` — path to a real chromium binary. Required because Playwright's
  bundled headless-shell is missing libs nix provides. `run.sh` defaults it to
  `which chromium`; inside `nix develop` that resolves automatically.
- `PORT` — Vite dev-server port (default `5180`).
- `BASE` / `OUT` — override the target URL / output dir when calling `shoot.mjs`
  directly.

## Editing what's shown

The scene (resources, statuses, the failed `paperless-ngx` release that drives
`error-panel.png`) lives in `mockData.mjs`. Routes, viewport, and the per-shot
navigation/waits live in `shoot.mjs`.
