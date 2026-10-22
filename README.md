# SwafCode

A web-based code execution playground supporting multiple programming languages. Built with NestJS (backend) and SvelteKit (frontend).

## Features

- **6 Languages Supported**: TypeScript, Python, Java, C++, Rust, Go
- **Accounts**: sign up or sign in; programs and runs belong to your account
- **Access and refresh tokens**: short-lived access token, long-lived refresh token that rotates on every use
- **Live Output**: The console fills as the program writes, not when it ends
- **Live Input**: Send lines to a program that is still running
- **Real-time Execution**: Run code with a 10s timeout, stop it early
- **Exit Status**: Every run reports its exit code, how long it took and whether it timed out
- **Bounded Runs**: Programs get 256 MB of memory and are killed as a group, so nothing outlives its run
- **Syntax Highlighting**: CodeMirror 6 with language-specific highlighting
- **Language Tabs**: Populated from the backend, with the runtime shown on hover
- **Example Programs**: the same program in all six languages, one click away
- **Format**: prettier, black, clang-format, rustfmt and gofmt, when they are installed
- **Share Links**: a link carries the program, so it can be sent to someone else
- **Console**: stdout and stderr in one panel, with a standard-input tab
- **AI Agent**: reads, rewrites and runs the program in the editor (sign in to use it)
- **7 Editor Themes**: each theme re-skins the whole interface

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS, TypeScript |
| Frontend | SvelteKit, Svelte 5, TypeScript |
| Editor | CodeMirror 6 |
| Build Tool | Vite |

## Project Structure

```
SwafCode/
├── backend/                 # NestJS API
│   └── src/
│       ├── mongodb.module.ts # MongoDB connection
│       ├── auth/             # Register, login, refresh, logout
│       │   ├── auth.service.ts
│       │   ├── auth.controller.ts
│       │   └── auth.guard.ts
│       ├── users/            # User records in MongoDB
│       └── code-execution/  # Code execution service
│           ├── code-execution.service.ts
│           ├── code-execution.controller.ts
│           ├── code-format.controller.ts
│           └── dto/execute-code.dto.ts
├── frontend/                # SvelteKit app
│   ├── static/fonts/        # Self-hosted Public Sans + JetBrains Mono
│   └── src/
│       ├── app.css          # Design tokens, theme palettes, shared controls
│       ├── lib/
│       │   ├── auth.ts      # Token handling, refresh, retry
│       │   ├── components/
│       │   │   ├── CodeEditor.svelte
│       │   │   ├── ConsolePanel.svelte
│       │   │   ├── AiChat.svelte
│       │   │   ├── SettingsDialog.svelte
│       │   │   ├── SignInDialog.svelte
│       │   │   └── Icon.svelte
│       │   └── stores/      # general-settings.ts, ai-settings.ts, auth.ts
│       └── routes/+page.svelte
├── Taskfile.yml             # Task runner commands
├── docker-compose.yml       # Backend, frontend and MongoDB
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Language runtimes (optional, for local execution):
  - `tsx` (TypeScript) — `npm i -g tsx`
  - `python3` (Python)
  - `openjdk` + `javac` (Java)
  - `g++` (C++)
  - `rustc` (Rust)
  - `go` (Go)

### Installation

```bash
# Install all dependencies
task install

# Or manually:
cd backend && npm install
cd ../frontend && npm install
```

### Development

```bash
# Run both backend (port 3000) and frontend (port 5173)
task dev

# Run individually
task dev:backend   # http://localhost:3000
task dev:frontend  # http://localhost:5173
```

### Production Build

```bash
# Build both
task build

# Run built backend
task start

# Preview built frontend
task preview
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Sign in, get a pair of tokens |
| POST | `/auth/refresh` | Swap a refresh token for a new pair |
| POST | `/auth/logout` | Sign out, kill the refresh token |
| POST | `/auth/me` | Who the access token belongs to |
| GET | `/execute/languages` | List supported languages and what is installed |
| POST | `/execute` | Execute code |
| POST | `/execute/stream` | Execute code, streaming the output |
| POST | `/execute/:runId/stdin` | Send text to a running program |
| DELETE | `/execute/:runId` | Stop a running program |
| POST | `/format` | Format a program |

Everything except `/auth/register`, `/auth/login`, `/auth/refresh` and
`/execute/languages` needs an access token.

### Accounts

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your password"}'
```

```json
{ "id": "6ad8d7ee4219cc02d69ec70c", "email": "you@example.com" }
```

The password is stored as a bcrypt hash. The refresh tokens are stored hashed
too, so a leaked database cannot be used to sign in.

### Sign In

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your password"}'
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "8f14e45fceea167a5a36dedd4bea2543..."
}
```

The access token is a JWT that lasts 15 minutes and is sent with every
request:

```
Authorization: Bearer <accessToken>
```

The refresh token lasts 7 days. It is **rotated**: every refresh returns a new
pair and retires the old refresh token, so a stolen one is only good once.

### Refresh and Sign Out

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

Signing out kills the refresh token, so the session ends there:

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

### Execute Code

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"Hello\")", "language": "python"}'
```

**Request:**
```json
{
  "code": "string",
  "language": "typescript" | "python" | "java" | "cpp" | "rust" | "go",
  "stdin": "string",
  "runId": "string",
  "interactive": false
}
```

`runId` is optional. Send one and the run can be stopped with
`DELETE /execute/:runId` while it is still going. `interactive` keeps the
program's input open, so lines can be sent to it while it runs.

**Response:**
```json
{
  "output": "string",
  "error": "string",
  "exitCode": 0,
  "durationMs": 12,
  "compileMs": 0,
  "timedOut": false,
  "kind": "ok"
}
```

`kind` says what happened:

| Kind | Meaning |
|------|---------|
| `ok` | The program ran and exited with 0 |
| `runtime` | The program ran and exited with something else |
| `compile` | The compiler rejected the program |
| `spawn` | The runtime is not installed on the server |
| `timeout` | The program was killed after the time limit |
| `cancelled` | The program was stopped from the interface |

### Stream a Run

`POST /execute/stream` takes the same request and answers with newline
delimited events, so the output can be shown while the program runs:

```
{"type":"out","data":"first line\n"}
{"type":"err","data":"a warning\n"}
{"type":"end","result":{"output":"…","exitCode":0,"kind":"ok", …}}
```

### Send Input to a Running Program

```bash
curl -X POST http://localhost:3000/execute/<runId>/stdin \
  -H "Content-Type: application/json" \
  -d '{"data": "hello\n"}'
```

```json
{ "written": true }
```

### Format a Program

```bash
curl -X POST http://localhost:3000/format \
  -H "Content-Type: application/json" \
  -d '{"code": "const  x=1", "language": "typescript"}'
```

```json
{ "code": "const x = 1;\n" }
```

Each language is formatted with the tool that fits it: prettier for
TypeScript, black for Python, clang-format for Java and C++, rustfmt for Rust
and gofmt for Go. A language whose formatter is not installed answers with an
error.

### Stop a Run

```bash
curl -X DELETE http://localhost:3000/execute/<runId>
```

```json
{ "cancelled": true }
```

The run resolves with `kind: "cancelled"`. The answer is `false` when the run
had already finished.

### Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `MONGODB_URI` | `mongodb://localhost:27017/swafcode` | Where the users live |
| `JWT_SECRET` | `change-me-in-production` | Signs the access tokens |
| `SWAFCODE_RUN_TIMEOUT_MS` | `10000` | How long a program may run |
| `SWAFCODE_COMPILE_TIMEOUT_MS` | `45000` | How long a compiler may run |

`JWT_SECRET` has to be set for a real deployment: every deployment that shares
a secret shares its accounts. The backend warns when it is missing in
production.

## Running with Docker

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
```

MongoDB comes up with it, on port 27017, with its data in a named volume. The
backend waits for MongoDB to be healthy before it starts.

For local development without Docker Compose, run MongoDB on its own:

```bash
task mongo     # docker run ... mongo:latest
task dev       # backend on 3000, frontend on 5173
```

## Language Details

| Language | ID | Compilation | File Name |
|----------|-----|-------------|-----------|
| TypeScript | `typescript` | `tsx` (direct) | `code.ts` |
| Python | `python` | Interpreted | `code.py` |
| Java | `java` | `javac` | `Main.java` |
| C++ | `cpp` | `g++` | `code.cpp` |
| Rust | `rust` | `rustc` | `code.rs` |
| Go | `go` | `go build` | `code.go` |

## Task Commands

```bash
task --list              # Show all tasks
task install             # Install all dependencies
task dev                 # Run dev servers (parallel)
task dev:backend         # Backend only
task dev:frontend        # Frontend only
task build               # Production build
task start               # Run built backend
task preview             # Preview built frontend
task lint                # Lint backend
task format              # Format backend (Prettier)
task check               # Type-check frontend (svelte-check)
task test                # Backend unit tests
task test:e2e            # Backend e2e tests
task clean               # Remove build artifacts
```

## Architecture

### Backend Execution Flow

1. Receive code + language (+ optional runId) via POST `/execute`
2. Create a temp directory, write the code to a language-specific file
3. Check the runtime is installed on the server
4. For compiled languages (Java, C++, Rust, Go): compile asynchronously, 45s timeout
5. Run the program in its own process group, under a 256 MB memory cap, 10s timeout
6. Capture stdout/stderr (100KB limit per stream)
7. Remove the temp directory, compiled artifacts and all
8. Return the output, the exit status, the timings and the kind of the run

A run that is stopped from the interface is killed as a group, so a program
cannot leave children behind.

`POST /execute/stream` does the same, but writes every chunk of output as it
arrives, so the console fills while the program runs.

### Frontend State

- Language list fetched from `/execute/languages` on load, with a built-in fallback
- Selected language stored in `$state`; one program kept per language in `localStorage`
- Code bound bidirectionally to CodeMirror via `bind:code`
- The editor never opens on an empty program: it falls back to the language's example
- The `Example` action in the editor header restores that program (it asks first if the program was edited)
- Console shows stdout and stderr together, with standard input on its own tab
- A link in the address bar (`#lang=…&code=…`) carries the program
- Editor preferences (theme, font size, line numbers) live in the general-settings store
- The interface is one ground divided by 1px rules; every selection is a 1px accent line

## License

MIT License — see [LICENSE](LICENSE) for details.