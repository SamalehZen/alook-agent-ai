# Runtime Manager — Zero-touch Managed Runtime Automation

The **Runtime Manager** is the data-plane supervisor that makes Alook's `managed`
runtimes fully self-service. When a user creates an agent or a studio and selects the
`managed` runtime, the runtime is **provisioned, started, supervised, healed and
cleaned up automatically** — the user never installs, registers or starts a CLI.

It is a single operator-run process (`alook runtime-manager start`) that supervises the
whole fleet: one isolated daemon per workspace.

---

## Why this exists

`managed` runtimes are created in the database by `ensureManagedAgentRuntime`
(`daemon_id = managed_<workspaceId>`, `runtime_mode = "managed"`), but nothing brought a
daemon online for them — so they stayed offline and the user had to fall back to the
manual CLI flow (`register` → `daemon start`). The Runtime Manager closes that gap.

```
 ┌──────────────────────────── Control plane (web, Cloudflare, stateless) ───────────────────────────┐
 │  GET  /api/runtime-manager/managed-runtimes   → desired managed runtimes (X-Runtime-Manager-Secret)│
 │  POST /api/runtime-manager/provision          → idempotent machine token per workspace             │
 └───────────────────────────────────────────────▲───────────────────────────────────────────────────┘
                                                  │ reconcile + provision
 ┌────────────────────────────── Data plane (alook runtime-manager) ─────────────────────────────────┐
 │  RuntimeManager  ── reconcile loop (desired vs actual), health sweep, graceful shutdown            │
 │     └── SupervisedDaemon (per workspace)  ── spawn · crash-restart w/ backoff · health checks      │
 │            └── isolated `alook daemon start` child:                                                 │
 │                  ALOOK_PROJECT_ROOT=<baseDir>/<workspaceId>   (config, workdir, pidfile, logs)      │
 │                  ALOOK_DAEMON_ID=managed_<workspaceId>        (owns the managed runtime row)        │
 │                  ALOOK_HEALTH_PORT=<unique>                   (dedicated /health port)              │
 │                  ALOOK_RUNTIME_MODE=managed                  (keeps runtime_mode = "managed")       │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The daemon registers under `managed_<workspaceId>` with provider `opencode`, which matches
the `(workspace_id, daemon_id, provider)` row created by `ensureManagedAgentRuntime`,
flipping the runtime online and letting it claim and run tasks.

---

## Guarantees (mapped to the requirements)

| Requirement | How it's met |
|---|---|
| **Isolation** | Each workspace gets its own `ALOOK_PROJECT_ROOT` (config + workdir + pidfile + logs), its own `daemon_id`, and its own health port. No shared state, no cross-tenant conflict. |
| **Automatic create / start** | The reconcile loop discovers new managed runtimes from the control plane, provisions a machine token, and boots the daemon — no user action. |
| **Supervision / auto-restart** | `SupervisedDaemon` watches the child; on unexpected exit it restarts with exponential backoff (`computeBackoffDelay`). |
| **Cleanup of unused resources** | Runtimes no longer in the desired set (e.g. workspace deleted → cascade) are stopped and their port released. |
| **Health checks** | Each daemon exposes `/health`; the manager probes it every `ALOOK_RM_HEALTH_INTERVAL` and recycles a daemon after `ALOOK_RM_UNHEALTHY_THRESHOLD` consecutive failures. |
| **Retry** | Provisioning failures are isolated per workspace and retried on the next reconcile; control-plane network errors are retried with backoff. |
| **Structured logs** | Per-workspace prefixed logging via the shared `Logger`; child stdout/stderr is forwarded with a workspace tag. |
| **Recovery** | Backoff resets once a health probe succeeds; the loop is self-healing and converges every cycle. |
| **No mandatory CLI for users** | The only CLI is the operator's single `alook runtime-manager start`; end users only click "create agent". |

---

## Usage

On the host that runs the managed fleet (must have the agent provider binary —
`opencode` — installed and authenticated):

```bash
export ALOOK_SERVER_URL=https://your-alook-host
export ALOOK_RUNTIME_MANAGER_SECRET=<same value as web RUNTIME_MANAGER_SECRET>

alook runtime-manager start          # run the supervisor (foreground)
alook runtime-manager start --once   # single reconcile pass (smoke test / cron)
alook runtime-manager status         # print the resolved configuration
```

`SIGINT` / `SIGTERM` trigger a graceful shutdown of every supervised daemon.

---

## Configuration (environment)

| Variable | Default | Description |
|---|---|---|
| `ALOOK_SERVER_URL` | `https://alook.ai` | Control-plane base URL. |
| `ALOOK_RUNTIME_MANAGER_SECRET` | — | Shared secret; must equal the web `RUNTIME_MANAGER_SECRET`. Falls back to `RUNTIME_MANAGER_SECRET`. **Required.** |
| `ALOOK_RM_RECONCILE_INTERVAL` | `15s` | Desired-vs-actual reconcile cadence. |
| `ALOOK_RM_HEALTH_INTERVAL` | `30s` | Health-probe cadence. |
| `ALOOK_RM_UNHEALTHY_THRESHOLD` | `3` | Consecutive failed probes before recycling a daemon. |
| `ALOOK_RM_BASE_DIR` | `<configDir>/managed` | Root for per-workspace isolated state. |
| `ALOOK_RM_HEALTH_PORT_BASE` / `_MAX` | `19600` / `19900` | Health-port allocation range. |
| `ALOOK_RM_BACKOFF_BASE` / `_FACTOR` / `_MAX` / `_JITTER` | `1s` / `2` / `60s` / `0.2` | Restart backoff curve. |

Durations accept `500ms`, `15s`, `2m`, `1h`, or a bare number (ms).

---

## Operational notes

- **Provider requirement:** managed runtimes use `opencode` (set by
  `ensureManagedAgentRuntime`). The host must have `opencode` on `PATH` and authenticated;
  otherwise the daemon registers a different provider and the managed runtime stays offline.
  A daemon that finds no providers exits, and the supervisor will keep retrying with backoff —
  check the logs.
- **Idempotency:** `/api/runtime-manager/provision` returns the existing active token when
  one already exists, so re-provisioning is safe.
- **Scaling:** the supervisor is stateless beyond its in-memory map and the isolated
  per-workspace directories; restart it freely. It rebuilds desired state from the control
  plane on the next reconcile.

---

## Module map

| File | Responsibility |
|---|---|
| `manager.ts` | `RuntimeManager` — reconcile loop, health sweep, teardown, shutdown. |
| `supervised-daemon.ts` | `SupervisedDaemon` — one isolated daemon: spawn, backoff restart, health, logs. |
| `control-plane.ts` | `ControlPlaneClient` — typed client for the two web endpoints (auth + retry). |
| `port-allocator.ts` | Deterministic unique health-port allocation + recycling. |
| `backoff.ts` | Pure exponential-backoff calculation with jitter. |
| `config.ts` | `loadRuntimeManagerConfig()` from the environment. |
| `types.ts` | Shared interfaces. |

All collaborators (spawn, fetch, timers, fs) are injectable, so the full lifecycle is
unit-tested without real processes or sockets — see the co-located `*.test.ts` files.
