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
	let editorTheme = $state<'default' | 'monokai' | 'vscode' | 'github' | 'gruvbox'>('default');

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

<div class="app" class:light={editorTheme !== 'default'}>
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
			<CodeEditor bind:code language={selectedLang} onRun={runCode} theme={editorThemeDerived} {fontSize} {showLineNumbers} streaming={streamingEdits} />
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
				<AiChat bind:code language={selectedLang} theme="dark" getOutput={getOutput} runCode={runAndGetOutput} embedded streaming={streamingEdits} autoScroll={autoScrollStreaming} />
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
		background: #0d1117;
		color: #c9d1d9;
		transition: background 0.2s, color 0.2s;
	}

	.app.light {
		background: #ffffff;
		color: #24292f;
	}

	.app.light header {
		background: #f6f8fa;
		border-bottom: 1px solid #d0d7de;
	}

	.app.light .lang-tabs {
		background: #ffffff;
		border: 1px solid #d0d7de;
	}

	.app.light .lang-tab {
		color: #656d76;
	}

	.app.light .lang-tab:hover {
		color: #24292f;
		background: #f3f4f6;
	}

	.app.light .lang-tab.active {
		background: #eaeef2;
		color: #24292f;
	}

	.app.light .panel-header {
		background: #f6f8fa;
		border-bottom: 1px solid #d0d7de;
	}

	.app.light .panel-title {
		color: #656d76;
	}

	.app.light .tab {
		color: #656d76;
	}

	.app.light .tab:hover {
		color: #24292f;
	}

	.app.light .tab.active {
		background: #eaeef2;
		color: #24292f;
	}

	.app.light .output-content {
		background: #f6f8fa;
		color: #24292f;
	}

	.app.light .icon-btn {
		background: #f3f4f6;
		color: #24292f;
		border: 1px solid #d0d7de;
	}

	.app.light .icon-btn:hover {
		background: #eaeef2;
	}

	.app.light .icon-btn.secondary {
		background: #f3f4f6;
	}

	.app.light .checkbox-label {
		color: #24292f;
	}

	/* Header */
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		background: #161b22;
		border-bottom: 1px solid #30363d;
	}

	h1 {
		font-size: 1.3rem;
		font-weight: 700;
		color: #f0f6fc;
	}

	h1 span {
		color: #58a6ff;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.lang-tabs {
		display: flex;
		gap: 4px;
		background: #0d1117;
		border: 1px solid #30363d;
		border-radius: 8px;
		padding: 3px;
	}

	.lang-tab {
		padding: 6px 16px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #8b949e;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.lang-tab:hover {
		color: #c9d1d9;
		background: #1c2128;
	}

	.lang-tab.active {
		background: #21262d;
		color: #f0f6fc;
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
		background: #21262d;
		color: #c9d1d9;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.icon-btn:hover {
		background: #30363d;
	}

	.icon-btn.secondary {
		background: #21262d;
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
		background: #238636;
		color: #fff;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.run-btn:hover:not(:disabled) {
		background: #2ea043;
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
		border-right: 1px solid #30363d;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: #161b22;
		border-bottom: 1px solid #30363d;
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
		color: #8b949e;
		cursor: pointer;
	}

	.panel-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #8b949e;
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
		color: #8b949e;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		position: relative;
		transition: all 0.15s;
	}

	.tab:hover {
		color: #c9d1d9;
	}

	.tab.active {
		background: #21262d;
		color: #f0f6fc;
	}

	.badge {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 7px;
		height: 7px;
		background: #f85149;
		border-radius: 50%;
	}

	.output-content {
		flex: 1;
		padding: 16px;
		background: #0d1117;
		color: #c9d1d9;
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
		background: #0d1117;
		border: 1px solid #30363d;
		border-radius: 8px;
		color: #f0f6fc;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
		padding: 12px;
		outline: none;
	}

	.stdin-wrapper textarea:focus {
		border-color: #58a6ff;
	}

	.app.light .stdin-wrapper textarea {
		background: #ffffff;
		border: 1px solid #d0d7de;
		color: #24292f;
	}

	.hidden {
		display: none;
	}
</style>