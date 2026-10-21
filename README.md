# SwafCode

A web-based code execution playground supporting multiple programming languages. Built with NestJS (backend) and SvelteKit (frontend).

## Features

- **6 Languages Supported**: TypeScript, Python, Java, C++, Rust, Go
- **Real-time Execution**: Run code with 10s timeout, stop it early
- **Syntax Highlighting**: CodeMirror 6 with language-specific highlighting
- **Language Tabs**: Populated from the backend, with the runtime shown on hover
- **Example Programs**: the same program in all six languages, one click away
- **Console**: stdout and stderr in one panel, with a standard-input tab
- **AI Agent**: reads, rewrites and runs the program in the editor
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
│       └── code-execution/  # Code execution service
│           ├── code-execution.service.ts
│           ├── code-execution.controller.ts
│           └── dto/execute-code.dto.ts
├── frontend/                # SvelteKit app
│   ├── static/fonts/        # Self-hosted Public Sans + JetBrains Mono
│   └── src/
│       ├── app.css          # Design tokens, theme palettes, shared controls
│       ├── lib/components/
│       │   ├── CodeEditor.svelte
│       │   ├── ConsolePanel.svelte
│       │   ├── AiChat.svelte
│       │   ├── SettingsDialog.svelte
│       │   └── Icon.svelte
│       └── routes/+page.svelte
├── Taskfile.yml             # Task runner commands
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
| GET | `/execute/languages` | List supported languages |
| POST | `/execute` | Execute code |

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
  "language": "typescript" | "python" | "java" | "cpp" | "rust" | "go"
}
```

**Response:**
```json
{
  "output": "string",
  "error": "string"
}
```

## Language Details

| Language | ID | Compilation | File Name |
|----------|-----|-------------|-----------|
| TypeScript | `typescript` | `tsx` (direct) | `code.ts` |
| Python | `python` | Interpreted | `code.py` |
| Java | `java` | `javac` | `Main.java` |
| C++ | `cpp` | `g++` | `code.cpp` |
| Rust | `rust` | `rustc` | `code.rs` |
| Go | `go` | `go run` | `code.go` |

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

1. Receive code + language via POST `/execute`
2. Create temp directory, write code to language-specific file
3. For compiled languages (Java, C++, Rust): compile with timeout
4. Execute compiled binary or interpreted script
5. Capture stdout/stderr with 10s timeout, 100KB output limit
6. Cleanup temp files
7. Return output/error JSON

### Frontend State

- Language list fetched from `/execute/languages` on load, with a built-in fallback
- Selected language stored in `$state`; one program kept per language in `localStorage`
- Code bound bidirectionally to CodeMirror via `bind:code`
- The editor never opens on an empty program: it falls back to the language's example
- The `Example` action in the editor header restores that program (it asks first if the program was edited)
- Console shows stdout and stderr together, with standard input on its own tab
- Editor preferences (theme, font size, line numbers) live in the general-settings store
- The interface is one ground divided by 1px rules; every selection is a 1px accent line

## License

MIT License — see [LICENSE](LICENSE) for details.