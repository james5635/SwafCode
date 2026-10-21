# AGENTS.md — SwafCode Development Guide

## Project Overview

SwafCode is a web-based code execution playground with a NestJS backend and SvelteKit frontend. Supports 6 languages: TypeScript, Python, Java, C++, Rust, Go.

## Quick Commands

```bash
task dev              # Run both servers (backend:3000, frontend:5173)
task dev:backend      # Backend only
task dev:frontend     # Frontend only
task build            # Production build both
task start            # Run built backend
task preview          # Preview built frontend
task install          # Install all dependencies
task lint             # Lint backend
task format           # Format backend (Prettier)
task check            # Type-check frontend (svelte-check)
task test             # Backend unit tests
task test:e2e         # Backend e2e tests
task clean            # Remove build artifacts
```

> **Note for agents**: The dev servers are started manually by the developer. Do not run `task dev`, `task dev:backend`, or `task dev:frontend` yourself. Use `task build`, `task check`, `task lint`, `task test` for verification instead.

## Architecture

```
SwafCode/
├── backend/                 # NestJS API (port 3000)
│   └── src/
│       ├── main.ts          # Bootstrap, CORS, port 3000
│       ├── app.module.ts
│       └── code-execution/  # Core execution logic
│           ├── code-execution.service.ts   # Language execution
│           ├── code-execution.controller.ts # REST endpoints
│           └── dto/execute-code.dto.ts     # Validation
├── frontend/                # SvelteKit + Vite (port 5173)
│   ├── static/fonts/        # Self-hosted Public Sans + JetBrains Mono
│   └── src/
│       ├── app.css          # Tokens, theme palettes, shared controls
│       ├── app.html         # Font preload + no-flash theme bootstrap
│       ├── lib/components/
│       │   ├── CodeEditor.svelte    # CodeMirror 6 editor
│       │   ├── ConsolePanel.svelte  # stdout / stderr / stdin panel
│       │   ├── AiChat.svelte         # Agent transcript + composer
│       │   ├── SettingsDialog.svelte # General and AI agent settings
│       │   └── Icon.svelte           # One set of 16px outline icons
│       ├── lib/stores/      # general-settings.ts, ai-settings.ts
│       └── routes/+page.svelte       # Workbench layout
├── Taskfile.yml             # Task runner config
└── README.md
```

## Backend: Code Execution Flow

1. `POST /execute` receives `{ code, language, stdin?, runId? }`
2. Service creates a temp dir, writes code to language-specific file
3. Checks the runtime is installed; a missing one is a `spawn` error
4. Compiled languages (Java, C++, Rust, Go): compile asynchronously, 45s timeout
5. Run the program in its own process group, under a 256 MB memory cap, 10s timeout
6. Capture stdout/stderr (100KB limit per stream)
7. Remove the temp dir and every compiled artifact
8. Return `{ output, error, exitCode, durationMs, compileMs, timedOut, kind }`

`kind` is one of `ok`, `runtime`, `compile`, `spawn`, `timeout`, `cancelled`.

**Stopping a run**: `DELETE /execute/:runId` kills the process group and the
run resolves with `kind: 'cancelled'`. The client sends a `runId` with the
request so it can stop the run.

**Memory cap**: Node gets `--max-old-space-size`, the JVM gets `-Xmx`, Go gets
`GOMEMLIMIT`, everything else runs under `ulimit -v`.

**Languages config** in `code-execution.service.ts`

## Frontend: Workbench Layout

- Top bar: wordmark, language tabs (underline selection), settings, agent toggle, Run
- Workbench: editor over console, separated by a draggable splitter
- Agent rail: 372px on wide screens, a sheet under 1100px
- Svelte 5 runes (`$state`, `$effect`, `$derived`, `$bindable`)
- Language list fetched from `/execute/languages`, with a built-in fallback list
- Code bound bidirectionally to CodeMirror via `bind:code`
- One program kept per language in `localStorage` (`swafcode:state`)
- Editor preferences (theme, font size, line numbers) live in `general-settings.ts`
- Theme = a `data-theme` attribute on `<html>`; the palettes live in `app.css`
- The console shows a status line: the exit code, how long the run took, and
  what kind of run it was (`compile error`, `timed out`, `stopped`, ...)
- `Stop` asks the server to kill the run; the request resolves with the
  cancelled result instead of being aborted

### Design rules

- One ground, divided by 1px rules. No shadows except on the dialog and the agent sheet.
- Every selection is a 1px accent line as wide as its label, on the nearest edge.
- One filled primary action per screen (Run). Everything else is quiet.
- Public Sans for interface text, JetBrains Mono for code and every figure.
- No emoji, no gradients, no glass, no uppercase tracked labels.
- Every text colour must clear 4.5:1 on the surface it sits on.

## Adding a New Language

1. **Backend** (`code-execution.service.ts`):
   - Add entry to `languages` record with `ext`, optional `filename`, `memory` and `run`
   - `memory` picks the cap: `node`, `jvm`, `go` or `rlimit`
   - Compiled: implement `compile` (returns `{command, args, execPath}`) and `run`
   - Interpreted: only `run` needed

2. **Backend** (`code-execution.controller.ts`):
   - Add to the `LANGUAGES` array: `{ id, name, runtime, filename }`

3. **Backend** (`dto/execute-code.dto.ts`):
   - Add to union type

4. **Frontend** (`CodeEditor.svelte`):
   - Import language from `@codemirror/lang-*`
   - Add case in `getLangExtension()`
   - Add the syntax palette to `swafHighlightStyle` (the built-in theme)

5. **Frontend** (`+page.svelte`):
   - Add to `FALLBACK_LANGUAGES` and to `DEFAULT_CODE`
   - `DEFAULT_CODE` is the example program for that language; the `Example` action
     in the editor header restores it, so keep it runnable and short

6. **Install CodeMirror language package** if needed:
   ```bash
   cd frontend && npm install @codemirror/lang-<name>
   ```

## Code Style

- **Backend**: ESLint + Prettier (run `task lint` / `task format`)
- **Frontend**: svelte-check (run `task check`)
- TypeScript strict mode enabled
- No comments unless requested

## Testing

```bash
task test       # Jest unit tests (backend)
task test:e2e   # Jest e2e tests (backend)
```

## Common Issues

| Issue | Fix |
|-------|-----|
| Port 3000/5173 in use | `lsof -ti:3000 | xargs kill -9` |
| Editor can't type | Check `Compartment.reconfigure()` not destroying view |
| Typing is reverted | `applyingExternal` in `CodeEditor.svelte` must only wrap our own dispatches |
| Language not highlighting | Verify `@codemirror/lang-*` installed and imported |
| Compilation fails | Ensure runtime installed (`tsx`, `javac`, `g++`, `rustc`, `go`) |
| Theme looks wrong | The palette lives in `app.css` under `[data-theme='…']`; check contrast at 4.5:1 |

## Environment

- Node.js 20+
- npm
- Language runtimes (see README Prerequisites)