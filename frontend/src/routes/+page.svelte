<script lang="ts">
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import AiChat from '$lib/components/AiChat.svelte';
	import ConsolePanel from '$lib/components/ConsolePanel.svelte';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import SignInDialog from '$lib/components/SignInDialog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { generalSettings } from '$lib/stores/general-settings';
	import { auth } from '$lib/stores/auth';
	import { authFetch, signOut } from '$lib/auth';
	import { runShortcut } from '$lib/shortcut';
	import { untrack } from 'svelte';

	const API = '/execute';
	const FORMAT_API = '/format';
	const STORAGE_KEY = 'swafcode:state';

	type Language = {
		id: string;
		name: string;
		runtime: string;
		filename: string;
		available?: boolean;
		formatter?: boolean;
	};

	// The same list the backend serves, so the interface is complete before
	// the first request lands.
	const FALLBACK_LANGUAGES: Language[] = [
		{ id: 'typescript', name: 'TypeScript', runtime: 'tsx', filename: 'code.ts' },
		{ id: 'python', name: 'Python', runtime: 'python3', filename: 'code.py' },
		{ id: 'java', name: 'Java', runtime: 'openjdk', filename: 'Main.java' },
		{ id: 'cpp', name: 'C++', runtime: 'g++', filename: 'code.cpp' },
		{ id: 'rust', name: 'Rust', runtime: 'rustc', filename: 'code.rs' },
		{ id: 'go', name: 'Go', runtime: 'go', filename: 'code.go' }
	];

	// The same program in every language, so switching tabs shows the same
	// algorithm written the way that language writes it.
	const DEFAULT_CODE: Record<string, string> = {
		typescript: `function isPrime(n: number): boolean {
	for (let d = 2; d * d <= n; d++) {
		if (n % d === 0) return false;
	}
	return true;
}

const primes: number[] = [];
for (let n = 2; n <= 30; n++) {
	if (isPrime(n)) primes.push(n);
}

for (const p of primes) {
	console.log(\`prime \${String(p).padStart(2)}  \${String(p * p).padStart(4)}\`);
}

console.log(\`\${primes.length} primes below 30\`);`,
		python: `def is_prime(n):
    for d in range(2, int(n ** 0.5) + 1):
        if n % d == 0:
            return False
    return True


primes = [n for n in range(2, 31) if is_prime(n)]
squares = {p: p * p for p in primes}

for p in primes:
    print(f"prime {p:>2}  {squares[p]:>4}")

print(f"{len(primes)} primes below 30")`,
		java: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> primes = primesUpTo(30);

        for (int p : primes) {
            System.out.printf("prime %2d  %4d%n", p, p * p);
        }

        System.out.println(primes.size() + " primes below 30");
    }

    static List<Integer> primesUpTo(int limit) {
        List<Integer> found = new ArrayList<>();
        for (int n = 2; n <= limit; n++) {
            if (isPrime(n)) {
                found.add(n);
            }
        }
        return found;
    }

    static boolean isPrime(int n) {
        for (int d = 2; d * d <= n; d++) {
            if (n % d == 0) {
                return false;
            }
        }
        return true;
    }
}`,
		cpp: `#include <iomanip>
#include <iostream>
#include <vector>
using namespace std;

bool isPrime(int n) {
    for (int d = 2; d * d <= n; d++) {
        if (n % d == 0) return false;
    }
    return true;
}

int main() {
    vector<int> primes;
    for (int n = 2; n <= 30; n++) {
        if (isPrime(n)) primes.push_back(n);
    }

    for (int p : primes) {
        cout << "prime " << setw(2) << p << "  " << setw(4) << p * p << endl;
    }
    cout << primes.size() << " primes below 30" << endl;
    return 0;
}`,
		rust: `fn is_prime(n: u32) -> bool {
    let mut d = 2;
    while d * d <= n {
        if n % d == 0 {
            return false;
        }
        d += 1;
    }
    true
}

fn main() {
    let primes: Vec<u32> = (2..=30).filter(|n| is_prime(*n)).collect();

    for p in &primes {
        println!("prime {p:>2}  {:>4}", p * p);
    }

    println!("{} primes below 30", primes.len());
}`,
		go: `package main

import "fmt"

func isPrime(n int) bool {
	for d := 2; d*d <= n; d++ {
		if n%d == 0 {
			return false
		}
	}
	return true
}

func main() {
	primes := []int{}
	for n := 2; n <= 30; n++ {
		if isPrime(n) {
			primes = append(primes, n)
		}
	}

	for _, p := range primes {
		fmt.Printf("prime %2d  %4d\\n", p, p*p)
	}

	fmt.Printf("%d primes below 30\\n", len(primes))
}`
	};

	let languages = $state<Language[]>(FALLBACK_LANGUAGES);
	let selectedLang = $state('typescript');
	let codeByLang = $state<Record<string, string>>({ ...DEFAULT_CODE });
	let stdout = $state('');
	let stderr = $state('');
	let stdin = $state('');
	let notice = $state('');
	let consoleTab = $state<'output' | 'input'>('output');
	let running = $state(false);
	let railOpen = $state(
		typeof window === 'undefined' ? true : window.innerWidth >= 1200
	);
	let consoleHeight = $state(220);
	let settingsOpen = $state(false);
	let confirmExample = $state(false);
	let signInOpen = $state(false);

	let exitCode = $state<number | null>(null);
	let durationMs = $state(0);
	let compileMs = $state(0);
	let runKind = $state<string | null>(null);
	let liveInput = $state(false);

	let signedIn = $derived(Boolean($auth.accessToken));
	let accountEmail = $derived($auth.user?.email ?? '');
	let accountInitial = $derived(accountEmail.charAt(0).toUpperCase());

	let abortController: AbortController | null = null;
	let activeRunId: string | null = null;
	let stopFallback: ReturnType<typeof setTimeout> | null = null;

	let fontSize = $derived($generalSettings.fontSize);
	let showLineNumbers = $derived($generalSettings.lineNumbers);
	let streamEdits = $derived($generalSettings.streamEdits);
	let autoScroll = $derived($generalSettings.autoScrollStreaming);
	let editorTheme = $derived($generalSettings.theme);

	let activeLanguage = $derived(
		languages.find((l) => l.id === selectedLang) ?? FALLBACK_LANGUAGES[0]
	);

	function loadState() {
		if (typeof localStorage === 'undefined') return;
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (!saved) return;
			const state = JSON.parse(saved);
			if (state.codeByLang) {
				codeByLang = { ...codeByLang, ...state.codeByLang };
			}
			if (state.selectedLang && codeByLang[state.selectedLang] !== undefined) {
				selectedLang = state.selectedLang;
			}
			if (typeof state.railOpen === 'boolean' && window.innerWidth >= 1200) {
				railOpen = state.railOpen;
			}
			if (typeof state.consoleHeight === 'number') {
				consoleHeight = Math.min(Math.max(state.consoleHeight, 160), 640);
			}
		} catch {
			// ignore corrupted storage
		}
	}

	loadState();

	// A link can carry a program, so it can be sent to someone else.
	const shared = readSharedState();
	if (shared.language && FALLBACK_LANGUAGES.some((l) => l.id === shared.language)) {
		selectedLang = shared.language;
	}

	// The editor opens on the program that was last open for this language,
	// and never on an empty one: an empty program is not a program.
	let code = $state(
		untrack(() => shared.code ?? codeByLang[selectedLang] ?? DEFAULT_CODE[selectedLang] ?? '')
	);

	function saveState() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ codeByLang, selectedLang, railOpen, consoleHeight })
		);
	}

	function exampleCode(): string {
		return DEFAULT_CODE[selectedLang] ?? '';
	}

	function selectLanguage(id: string) {
		selectedLang = id;
		code = codeByLang[id] || DEFAULT_CODE[id] || '';
		stdout = '';
		stderr = '';
		notice = '';
		consoleTab = 'output';
		confirmExample = false;
	}

	function requestExample() {
		const example = exampleCode();
		if (!example || code === example) return;
		if (!code.trim()) {
			// nothing to lose
			code = example;
			return;
		}
		confirmExample = true;
	}

	function applyExample() {
		code = exampleCode();
		confirmExample = false;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		// A link pasted into the address bar loads its program.
		const onHashChange = () => {
			const next = readSharedState();
			if (next.language && FALLBACK_LANGUAGES.some((l) => l.id === next.language)) {
				selectedLang = next.language;
			}
			if (next.code !== undefined) code = next.code;
		};
		window.addEventListener('hashchange', onHashChange);
		return () => window.removeEventListener('hashchange', onHashChange);
	});

	$effect(() => {
		fetch(`${API}/languages`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data: Language[] | null) => {
				if (data?.length) languages = data;
			})
			.catch(() => {
				// the interface keeps the built-in list
			});
	});

	$effect(() => {
		codeByLang[selectedLang] = code;
	});

	$effect(() => {
		saveState();
	});

	async function runCode(options: { live?: boolean } = {}) {
		if (!code.trim() || running) return;
		const useLive = options.live ?? liveInput;
		const runId = newRunId();
		activeRunId = runId;
		running = true;
		stdout = '';
		stderr = '';
		notice = '';
		exitCode = null;
		durationMs = 0;
		compileMs = 0;
		runKind = null;
		// With live input on, the reader wants to type, not to watch.
		consoleTab = useLive ? 'input' : 'output';
		abortController = new AbortController();

		try {
			const res = await authFetch(`${API}/stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					code,
					language: selectedLang,
					stdin: useLive ? undefined : stdin,
					runId,
					interactive: useLive
				}),
				signal: abortController.signal
			});

			if (res.status === 401) {
				signInOpen = true;
				throw new Error('Sign in to run programs');
			}
			if (!res.ok || !res.body) {
				throw new Error(`Request failed with status ${res.status}`);
			}

			await readStream(res.body);
		} catch (err: any) {
			if (err?.name === 'AbortError') {
				notice = 'Run stopped before it finished.';
			} else {
				stderr = `Request failed: ${err?.message ?? 'unknown error'}`;
			}
		} finally {
			running = false;
			abortController = null;
			activeRunId = null;
			if (stopFallback) {
				clearTimeout(stopFallback);
				stopFallback = null;
			}
		}
	}

	// Reads the newline-delimited events the server streams back: the output
	// as it is produced, and the result of the run at the end.
	async function readStream(body: ReadableStream<Uint8Array>) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let index = buffer.indexOf('\n');
			while (index >= 0) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				index = buffer.indexOf('\n');
				if (!line) continue;

				const event = JSON.parse(line);
				if (event.type === 'out') stdout += event.data;
				else if (event.type === 'err') stderr += event.data;
				else if (event.type === 'end') {
					exitCode = event.result.exitCode ?? null;
					durationMs = event.result.durationMs ?? 0;
					compileMs = event.result.compileMs ?? 0;
					runKind = event.result.kind ?? null;
				} else if (event.type === 'error') {
					stderr = event.message;
				}
			}
		}
	}

	// Asks the server to kill the running program. The request resolves with
	// a cancelled result; the abort is only the fallback for a dead server.
	function stopRun() {
		const id = activeRunId;
		if (!id) return;
		authFetch(`${API}/${id}`, { method: 'DELETE' }).catch(() => {});
		stopFallback = setTimeout(() => abortController?.abort(), 2000);
	}

	// Sends a line to a program that is still running.
	function sendInput(data: string) {
		const id = activeRunId;
		if (!id) return;
		authFetch(`${API}/${id}/stdin`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ data })
		}).catch(() => {});
	}

	function newRunId(): string {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	function copyCode() {
		if (code) navigator.clipboard?.writeText(code);
	}

	function getOutput(): string {
		const parts: string[] = [];
		if (runKind && runKind !== 'ok') {
			const code = exitCode !== null ? ` (exit ${exitCode})` : '';
			parts.push(`status: ${runKind}${code}`);
		}
		if (stdout) parts.push(`stdout:\n${stdout}`);
		if (stderr) parts.push(`stderr:\n${stderr}`);
		return parts.join('\n\n') || '(no output yet)';
	}

	async function runAndGetOutput(): Promise<string> {
		await runCode({ live: false });
		return getOutput();
	}

	// A link that carries the program, so it can be sent to someone else.
	function shareLink(): string {
		const params = new URLSearchParams();
		params.set('lang', selectedLang);
		params.set('code', encodeCode(code));
		return `${location.origin}${location.pathname}#${params.toString()}`;
	}

	async function copyLink() {
		const link = shareLink();
		try {
			await navigator.clipboard.writeText(link);
			notice = 'Link copied to the clipboard.';
		} catch {
			notice = link;
		}
	}

	function encodeCode(source: string): string {
		const bytes = new TextEncoder().encode(source);
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	function decodeCode(encoded: string): string {
		const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
		const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	}

	// Reads a shared program out of the address bar.
	function readSharedState(): { language?: string; code?: string } {
		if (typeof window === 'undefined') return {};
		const params = new URLSearchParams(window.location.hash.slice(1));
		const encoded = params.get('code');
		if (!encoded) return {};
		const language = params.get('lang') ?? undefined;
		try {
			return { language, code: decodeCode(encoded) };
		} catch {
			// a broken link keeps the program that is already open
			return { language };
		}
	}

	async function formatCode() {
		try {
			const res = await authFetch(FORMAT_API, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, language: selectedLang })
			});
			if (res.status === 401) {
				signInOpen = true;
				return;
			}
			const data = await res.json();
			if (data.code) {
				code = data.code;
			} else {
				notice = data.message ?? 'Formatting failed.';
			}
		} catch (err: any) {
			notice = `Formatting failed: ${err?.message ?? 'unknown error'}`;
		}
	}

	async function handleSignOut() {
		await signOut();
		stdout = '';
		stderr = '';
		runKind = null;
	}

	function startResize(event: PointerEvent) {
		event.preventDefault();
		const startY = event.clientY;
		const startHeight = consoleHeight;

		const onMove = (ev: PointerEvent) => {
			const max = Math.max(200, window.innerHeight - 220);
			consoleHeight = Math.min(max, Math.max(160, startHeight - (ev.clientY - startY)));
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			document.body.style.userSelect = '';
		};

		document.body.style.userSelect = 'none';
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	function nudgeResize(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') consoleHeight = Math.min(640, consoleHeight + 16);
		else if (event.key === 'ArrowDown') consoleHeight = Math.max(160, consoleHeight - 16);
		else return;
		event.preventDefault();
	}
</script>

<svelte:head>
	<title>SwafCode — a playground for six languages</title>
</svelte:head>

<div class="app">
	<header class="topbar">
		<div class="brand">
			<svg
				class="mark"
				width="18"
				height="18"
				viewBox="0 0 18 18"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3.5 5.5L7.5 9l-4 3.5" />
				<path d="M9.5 12.5h5" />
			</svg>
			<h1>SwafCode</h1>
		</div>

		<nav class="langs" aria-label="Language">
			{#each languages as lang (lang.id)}
				<button
					class="tab"
					class:unavailable={lang.available === false}
					role="tab"
					aria-selected={selectedLang === lang.id}
					title={lang.available === false
						? `${lang.runtime} is not installed on the server`
						: `Runs on ${lang.runtime}`}
					onclick={() => selectLanguage(lang.id)}
				>
					{lang.name}
				</button>
			{/each}
		</nav>

		<div class="topbar-actions">
			<button
				class="icon-btn"
				title="Settings"
				aria-label="Settings"
				onclick={() => (settingsOpen = true)}
			>
				<Icon name="settings" />
			</button>
			<button
				class="icon-btn"
				title={signedIn ? 'AI agent' : 'AI agent — sign in to use it'}
				aria-label="AI agent"
				aria-pressed={railOpen}
				onclick={() => (railOpen = !railOpen)}
			>
				<Icon name="agent" />
			</button>
			{#if signedIn}
				<button
					class="account"
					title="{accountEmail} — sign out"
					aria-label="Sign out of {accountEmail}"
					onclick={handleSignOut}
				>
					<span class="avatar" aria-hidden="true">{accountInitial}</span>
					<span class="account-action">Sign out</span>
				</button>
			{:else}
				<button class="btn btn--quiet signin" onclick={() => (signInOpen = true)}>
					Sign in
				</button>
			{/if}
			{#if running}
				<button class="btn btn--text stop" onclick={stopRun}>
					<Icon name="stop" size={13} />
					Stop
				</button>
			{/if}
			<button class="btn btn--primary run" onclick={() => runCode()} disabled={running}>
				{#if running}
					<span class="spinner" aria-hidden="true"></span>
				{/if}
				<span>{running ? 'Running' : 'Run'}</span>
				<span class="kbd run-key">{runShortcut}</span>
			</button>
		</div>
	</header>

	<div class="workspace">
		<div class="workbench" style:--console-h="{consoleHeight}px">
			<section class="panel editor">
				<div class="panel-head">
					<h2 class="panel-title">Editor</h2>
					<span class="chip">{activeLanguage.filename}</span>
					<div class="panel-actions">
						<button
							class="btn btn--text example-btn"
							title="Load the {activeLanguage.name} example program"
							onclick={requestExample}
						>
							Example
						</button>
						{#if activeLanguage.formatter !== false}
							<button
								class="btn btn--text example-btn"
								title="Format the program for {activeLanguage.name}"
								onclick={formatCode}
							>
								Format
							</button>
						{/if}
						<button
							class="icon-btn"
							title="Copy a link to this program"
							aria-label="Copy a link to this program"
							onclick={copyLink}
						>
							<Icon name="link" />
						</button>
						<button
							class="icon-btn"
							title="Copy code"
							aria-label="Copy code"
							onclick={copyCode}
						>
							<Icon name="copy" />
						</button>
					</div>
				</div>

				{#if confirmExample}
					<div class="confirm">
						<p class="confirm-text">
							Replace the program with the {activeLanguage.name} example?
						</p>
						<div class="confirm-actions">
							<button class="btn btn--text" onclick={() => (confirmExample = false)}>
								Keep
							</button>
							<button class="btn btn--quiet" onclick={applyExample}>Replace</button>
						</div>
					</div>
				{/if}

				<CodeEditor
					bind:code
					language={selectedLang}
					onRun={runCode}
					theme={editorTheme}
					{fontSize}
					{showLineNumbers}
					streaming={streamEdits}
					autoScroll={autoScroll}
				/>
			</section>

			<div
				class="resizer"
				role="slider"
				aria-orientation="horizontal"
				aria-label="Console height"
				aria-valuemin={160}
				aria-valuemax={640}
				aria-valuenow={Math.round(consoleHeight)}
				aria-valuetext="{Math.round(consoleHeight)} pixels"
				tabindex="0"
				onpointerdown={startResize}
				onkeydown={nudgeResize}
			></div>

			<ConsolePanel
				bind:stdout
				bind:stderr
				bind:stdin
				bind:tab={consoleTab}
				bind:notice
				bind:liveInput
				{exitCode}
				{durationMs}
				{compileMs}
				kind={runKind}
				{running}
				onSendInput={sendInput}
				shortcut={runShortcut}
			/>
		</div>

		<aside class="rail" class:open={railOpen} aria-label="AI agent">
			<AiChat
				bind:code
				language={selectedLang}
				{getOutput}
				runCode={runAndGetOutput}
				streaming={streamEdits}
				{signedIn}
				onClose={() => (railOpen = false)}
				onOpenSettings={() => (settingsOpen = true)}
				onSignIn={() => (signInOpen = true)}
			/>
		</aside>
	</div>
</div>

<SettingsDialog bind:open={settingsOpen} onClose={() => (settingsOpen = false)} />

<SignInDialog bind:open={signInOpen} />

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		overflow: hidden;
	}

	/* ---- Top bar ------------------------------------------- */

	.topbar {
		display: flex;
		align-items: center;
		gap: 24px;
		height: var(--bar-h);
		flex: none;
		padding: 0 16px;
		border-bottom: 1px solid var(--border);
		background: var(--ground);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	.mark {
		color: var(--text);
	}

	.brand h1 {
		font-size: var(--fs-title);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.langs {
		display: flex;
		align-items: stretch;
		height: 100%;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.langs::-webkit-scrollbar {
		display: none;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}

	.run {
		padding: 0 12px 0 14px;
		gap: 8px;
	}

	.run[disabled] {
		opacity: 1;
		cursor: default;
	}

	.run-key {
		background: rgba(127, 127, 127, 0.28);
		color: inherit;
	}

	.signin {
		flex: none;
	}

	.account {
		display: flex;
		align-items: center;
		gap: 8px;
		height: var(--control-h);
		padding: 0 10px 0 4px;
		border-radius: var(--radius-chip);
		transition: background-color 0.12s ease;
	}

	.account:hover {
		background: var(--raised);
	}

	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex: none;
		border-radius: 999px;
		background: var(--raised);
		color: var(--text);
		font-size: var(--fs-small);
		font-weight: 600;
		line-height: 1;
	}

	.account-action {
		font-size: var(--fs-small);
		color: var(--muted);
		white-space: nowrap;
		transition: color 0.12s ease;
	}

	.account:hover .account-action {
		color: var(--text);
	}

	.stop {
		color: var(--negative);
		gap: 6px;
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 1.6px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ---- Workspace ----------------------------------------- */

	.workspace {
		display: grid;
		grid-template-columns: 1fr auto;
		flex: 1;
		min-height: 0;
	}

	.workbench {
		display: grid;
		grid-template-rows: 1fr 6px var(--console-h);
		min-height: 0;
		min-width: 0;
	}

	.editor {
		min-height: 0;
	}

	.example-btn {
		height: 26px;
		font-size: var(--fs-small);
	}

	.confirm {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: none;
		padding: 8px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.confirm-text {
		font-size: var(--fs-small);
		color: var(--text);
	}

	.confirm-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}

	.confirm-actions .btn {
		height: 26px;
		font-size: var(--fs-small);
	}

	.resizer {
		position: relative;
		cursor: row-resize;
		background: transparent;
	}

	.resizer::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 2px;
		height: 1px;
		background: var(--border);
	}

	.resizer:hover::after,
	.resizer:focus-visible::after {
		background: var(--control);
	}

	.rail {
		width: 372px;
		min-width: 0;
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--ground);
	}

	@media (max-width: 1100px) {
		.rail {
			position: fixed;
			top: 0;
			right: 0;
			bottom: 0;
			width: min(400px, 100%);
			z-index: 60;
			transform: translateX(101%);
			transition: transform 0.2s ease;
			box-shadow: -12px 0 32px rgba(0, 0, 0, 0.35); /* taste-skill-ignore: a real overlay floats */
		}

		.rail.open {
			transform: none;
		}

		.workspace {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 900px) {
		.topbar {
			flex-wrap: wrap;
			height: auto;
			gap: 0 12px;
			padding: 0 16px;
		}

		.brand {
			height: var(--bar-h);
		}

		.topbar-actions {
			height: var(--bar-h);
		}

		.langs {
			order: 3;
			width: 100%;
			height: 40px;
			border-top: 1px solid var(--rule);
		}

		.tab {
			margin-right: 20px;
		}
	}
</style>
