<script lang="ts">
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import AiChat from '$lib/components/AiChat.svelte';
	import ApiSettings from '$lib/components/ApiSettings.svelte';
	import { generalSettings } from '$lib/stores/general-settings';

	const API = '/execute';
	const STORAGE_KEY = 'swafcode:state';

	type Language = { id: string; name: string; version: string };

	let languages = $state<Language[]>([]);
	let selectedLang = $state('typescript');
	let code = $state('');
	let output = $state('');
	let running = $state(false);
	let outputTab = $state<'stdout' | 'stderr' | 'stdin' | 'ai'>('stdout');
	let stderr = $state('');
	let stdin = $state('');

	// Settings
	let fontSize = $state(14);
	let showLineNumbers = $state(true);
	let streamingEdits = $state(true);
	let settingsOpen = $state(false);

	// Derived from general settings store
	let autoScrollStreaming = $derived($generalSettings.autoScrollStreaming);
	let editorThemeDerived = $derived($generalSettings.theme);

	const DEFAULT_CODE: Record<string, string> = {
		typescript: `function greet(name: string): string {
    return \`Hello, \${name}!\`;
}

console.log(greet("World"));`,
		python: `print("Hello, World!")`,
		java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
		cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
		rust: `fn main() {
    println!("Hello, World!");
}`,
		go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
	};

	function loadState() {
		if (typeof localStorage === 'undefined') return;
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const state = JSON.parse(saved);
				if (state.codePerLang) {
					Object.entries(state.codePerLang).forEach(([lang, c]) => {
						if (DEFAULT_CODE[lang]) DEFAULT_CODE[lang] = c as string;
					});
				}
				if (state.selectedLang && DEFAULT_CODE[state.selectedLang]) {
					selectedLang = state.selectedLang;
				}
				if (state.fontSize) fontSize = state.fontSize;
				if (typeof state.showLineNumbers === 'boolean') showLineNumbers = state.showLineNumbers;
			}
		} catch {
			// ignore corrupted storage
		}
	}

	function saveState() {
		if (typeof localStorage === 'undefined') return;
		const codePerLang: Record<string, string> = {};
		languages.forEach((l) => {
			codePerLang[l.id] = DEFAULT_CODE[l.id] ?? '';
		});
		localStorage.setItem(STORAGE_KEY, JSON.stringify({
			codePerLang,
			selectedLang,
			fontSize,
			showLineNumbers,
		}));
	}

	function selectLanguage(id: string) {
		selectedLang = id;
		code = DEFAULT_CODE[id] ?? '';
		output = '';
		stderr = '';
		saveState();
	}

	$effect(() => {
		fetch(`${API}/languages`)
			.then((r) => r.json())
			.then((data: Language[]) => {
				languages = data;
				loadState();
				if (data.length > 0 && !DEFAULT_CODE[selectedLang]) {
					selectedLang = data[0].id;
				}
				code = DEFAULT_CODE[selectedLang] ?? '';
			});
	});

	$effect(() => {
		if (code && DEFAULT_CODE[selectedLang] !== code) {
			DEFAULT_CODE[selectedLang] = code;
			saveState();
		}
	});

	$effect(() => {
		saveState();
	});

	async function runCode(switchTab = true) {
		if (!code.trim() || running) return;
		running = true;
		output = '';
		stderr = '';
		if (switchTab) outputTab = 'stdout';

		try {
			const res = await fetch(API, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, language: selectedLang, stdin }),
			});
			const data = await res.json();
			output = data.output ?? '';
			stderr = data.error ?? '';
			if (switchTab) outputTab = stderr ? 'stderr' : 'stdout';
		} catch (err: any) {
			stderr = `Request failed: ${err.message}`;
			if (switchTab) outputTab = 'stderr';
		} finally {
			running = false;
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text).then(() => {
			// could show toast
			console.log(`${label} copied`);
		});
	}

	function copyCode() {
		copyToClipboard(code, 'Code');
	}

	function copyOutput() {
		copyToClipboard(outputTab === 'stdout' ? output : stderr, 'Output');
	}

	function clearOutput() {
		output = '';
		stderr = '';
	}

	function getOutput(): string {
		const parts: string[] = [];
		if (output) parts.push(`stdout:\n${output}`);
		if (stderr) parts.push(`stderr:\n${stderr}`);
		return parts.join('\n\n') || '(no output yet)';
	}

	async function runAndGetOutput(): Promise<string> {
		await runCode(false);
		return getOutput();
	}
</script>

<svelte:head>
	<title>SwafCode</title>
</svelte:head>

<div class="app">
	<header>
		<h1>Swaf<span>Code</span></h1>
		<div class="header-controls">
			<div class="lang-tabs">
				{#each languages as lang}
					<button
						class="lang-tab"
						class:active={selectedLang === lang.id}
						onclick={() => selectLanguage(lang.id)}
					>
						{lang.name}
					</button>
				{/each}
			</div>
			<div class="header-actions">
				<button class="icon-btn" onclick={() => settingsOpen = true} title="AI Settings">⚙️</button>
				<button class="icon-btn" onclick={() => fontSize = Math.min(24, fontSize + 1)} title="Increase font size">A+</button>
				<button class="icon-btn" onclick={() => fontSize = Math.max(10, fontSize - 1)} title="Decrease font size">A-</button>
			</div>
			<button class="run-btn" onclick={() => runCode()} disabled={running}>
				{#if running}
					<span class="spinner"></span> Running...
				{:else}
					▶ Run
				{/if}
			</button>
		</div>
	</header>

	<main>
		<div class="panel editor-panel">
			<div class="panel-header">
				<span class="panel-title">Editor</span>
				<div class="editor-actions">
					<label class="checkbox-label">
						<input type="checkbox" checked={showLineNumbers} onchange={() => showLineNumbers = !showLineNumbers} />
						<span>Line numbers</span>
					</label>
					<label class="checkbox-label">
						<input type="checkbox" checked={streamingEdits} onchange={() => streamingEdits = !streamingEdits} />
						<span>Streaming</span>
					</label>
					<button class="icon-btn secondary" onclick={copyCode} title="Copy code (Ctrl+C)">📋</button>
				</div>
			</div>
			<CodeEditor bind:code language={selectedLang} onRun={runCode} theme={editorThemeDerived} {fontSize} {showLineNumbers} streaming={streamingEdits} autoScroll={autoScrollStreaming} />
		</div>

		<div class="panel output-panel">
			<div class="panel-header">
				<div class="output-tabs">
					<button
						class="tab"
						class:active={outputTab === 'stdout'}
						onclick={() => (outputTab = 'stdout')}
					>
						Output
					</button>
					<button
						class="tab"
						class:active={outputTab === 'stderr'}
						onclick={() => (outputTab = 'stderr')}
					>
						Errors
						{#if stderr}<span class="badge"></span>{/if}
					</button>
					<button
						class="tab"
						class:active={outputTab === 'stdin'}
						onclick={() => (outputTab = 'stdin')}
					>
						Stdin
					</button>
					<button
						class="tab"
						class:active={outputTab === 'ai'}
						onclick={() => (outputTab = 'ai')}
					>
						AI Agent
					</button>
				</div>
				{#if outputTab !== 'ai' && outputTab !== 'stdin'}
					<div class="output-actions">
						<button class="icon-btn secondary" onclick={copyOutput} title="Copy output">📋</button>
						<button class="icon-btn secondary" onclick={clearOutput} title="Clear output">🗑️</button>
					</div>
				{/if}
			</div>
			<pre class="output-content" class:hidden={outputTab === 'ai' || outputTab === 'stdin'}><code>{outputTab === 'stdout' ? output : stderr || 'No errors.'}</code></pre>
			<div class="stdin-wrapper" class:hidden={outputTab !== 'stdin'}>
				<textarea bind:value={stdin} placeholder="Enter input for your program..." rows="10"></textarea>
			</div>
			<div class="ai-wrapper" class:hidden={outputTab !== 'ai'}>
				<AiChat bind:code language={selectedLang} getOutput={getOutput} runCode={runAndGetOutput} embedded streaming={streamingEdits} />
			</div>
		</div>
	</main>

	<ApiSettings open={settingsOpen} onClose={() => settingsOpen = false} />
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--bg-primary);
		color: var(--text-primary);
		transition: background 0.2s, color 0.2s;
	}

	/* Header */
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border-primary);
	}

	h1 {
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--text-bright);
	}

	h1 span {
		color: var(--accent-primary);
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.lang-tabs {
		display: flex;
		gap: 4px;
		background: var(--bg-primary);
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		padding: 3px;
	}

	.lang-tab {
		padding: 6px 16px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.lang-tab:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.lang-tab.active {
		background: var(--bg-tertiary);
		color: var(--text-bright);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.icon-btn:hover {
		background: var(--bg-hover);
	}

	.icon-btn.secondary {
		background: var(--bg-tertiary);
		font-size: 0.8rem;
		padding: 0 8px;
		width: auto;
	}

	.run-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 20px;
		border: none;
		border-radius: 8px;
		background: var(--accent-success);
		color: var(--text-inverse);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.run-btn:hover:not(:disabled) {
		background: var(--accent-success-hover);
	}

	.run-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Main layout */
	main {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.editor-panel {
		border-right: 1px solid var(--border-primary);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border-primary);
		min-height: 40px;
	}

	.editor-actions,
	.output-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.checkbox-label input {
		accent-color: var(--accent-success);
	}

	.panel-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Output panel */
	.output-tabs {
		display: flex;
		gap: 4px;
	}

	.tab {
		padding: 4px 12px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		position: relative;
		transition: all 0.15s;
	}

	.tab:hover {
		color: var(--text-primary);
	}

	.tab.active {
		background: var(--bg-tertiary);
		color: var(--text-bright);
	}

	.badge {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 7px;
		height: 7px;
		background: var(--accent-error);
		border-radius: 50%;
	}

	.output-content {
		flex: 1;
		padding: 16px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.ai-wrapper {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.stdin-wrapper {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: 16px;
	}

	.stdin-wrapper textarea {
		flex: 1;
		resize: none;
		background: var(--bg-input);
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		color: var(--text-primary);
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
		padding: 12px;
		outline: none;
	}

	.stdin-wrapper textarea:focus {
		border-color: var(--border-focus);
	}

	.hidden {
		display: none;
	}
</style>
