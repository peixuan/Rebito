# Rebito

The web platform under development. See [architecture](../docs/platform/ARCHITECTURE.md)
and [status](../docs/platform/STATUS.md) for scope and verified capabilities.

Requires Node.js 24 or newer (supported LTS recommended) and npm.

```sh
cd platform
npm ci
npm run check
npm run dev
```

The initial service listens on `http://127.0.0.1:3000`. `/health/live` is a liveness
probe only, not proof that storage, authentication or a game runtime is ready.
`npm run build && npm start` runs the compiled server. Configuration is read from
the environment; never commit a local `.env` file.

The application currently has no game library or login flow. These are tracked
milestones, not functionality supplied by this skeleton.
