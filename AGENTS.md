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
│   └── src/
│       ├── lib/components/CodeEditor.svelte  # CodeMirror 6 editor
│       ├── routes/+page.svelte               # Main page
│       └── app.html
├── Taskfile.yml             # Task runner config
└── README.md
```

## Backend: Code Execution Flow

1. `POST /execute` receives `{ code, language }`
2. Service creates temp dir, writes code to language-specific file
3. Compiled languages (Java, C++, Rust): compile with 10s timeout
4. Execute binary or run interpreted (TypeScript via `tsx`, Python via `python3`, Go via `go run`)
5. Capture stdout/stderr (100KB limit, 10s timeout)
6. Cleanup temp files
7. Return `{ output, error }`

**Languages config** in `code-execution.service.ts:19-67`

## Frontend: State Management

- Svelte 5 runes (`$state`, `$effect`, `$bindable`)
- Language list fetched from `/execute/languages` on mount
- Code bound bidirectionally to CodeMirror via `bind:code`
- Language switching uses CodeMirror `Compartment.reconfigure()` (no editor destroy/recreate)
- Output/Error tabs with error badge indicator

## Adding a New Language

1. **Backend** (`code-execution.service.ts`):
   - Add entry to `languages` record with `ext`, optional `filename`, `compile`, and `run`
   - Compiled: implement `compile` (returns `{command, args, execPath}`) and `run`
   - Interpreted: only `run` needed

2. **Backend** (`code-execution.controller.ts`):
   - Add to `LANGUAGES` array: `{ id, name, version }`

3. **Backend** (`dto/execute-code.dto.ts`):
   - Add to union type

4. **Frontend** (`CodeEditor.svelte`):
   - Import language from `@codemirror/lang-*`
   - Add case in `getLangExtension()`

5. **Frontend** (`+page.svelte`):
   - Add boilerplate to `DEFAULT_CODE` record

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
| Language not highlighting | Verify `@codemirror/lang-*` installed and imported |
| Compilation fails | Ensure runtime installed (`tsx`, `javac`, `g++`, `rustc`, `go`) |

## Environment

- Node.js 20+
- npm
- Language runtimes (see README Prerequisites)