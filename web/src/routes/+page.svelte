<script lang="ts">
	const API = '/execute';

	type Language = { id: string; name: string; version: string };

	let languages = $state<Language[]>([]);
	let selectedLang = $state('javascript');
	let code = $state('');
	let output = $state('');
	let running = $state(false);
	let outputTab = $state<'stdout' | 'stderr'>('stdout');
	let stderr = $state('');

	const DEFAULT_CODE: Record<string, string> = {
		javascript: `console.log("Hello, World!");`,
		python: `print("Hello, World!")`,
	};

	$effect(() => {
		fetch(`${API}/languages`)
			.then((r) => r.json())
			.then((data: Language[]) => {
				languages = data;
				if (data.length > 0) selectedLang = data[0].id;
			});
	});

	function selectLanguage(id: string) {
		selectedLang = id;
		code = DEFAULT_CODE[id] ?? '';
		output = '';
		stderr = '';
	}

	async function runCode() {
		if (!code.trim() || running) return;
		running = true;
		output = '';
		stderr = '';
		outputTab = 'stdout';

		try {
			const res = await fetch(API, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, language: selectedLang }),
			});
			const data = await res.json();
			output = data.output ?? '';
			stderr = data.error ?? '';
			if (stderr) outputTab = 'stderr';
		} catch (err: any) {
			stderr = `Request failed: ${err.message}`;
			outputTab = 'stderr';
		} finally {
			running = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			runCode();
		}
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
			<button class="run-btn" onclick={runCode} disabled={running}>
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
				<span class="shortcut">Ctrl+Enter to run</span>
			</div>
			<textarea
				bind:value={code}
				onkeydown={handleKeydown}
				spellcheck="false"
				placeholder="Write your code here..."
			></textarea>
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
				</div>
			</div>
			<pre class="output-content"><code>{outputTab === 'stdout' ? output : stderr || 'No errors.'}</code></pre>
		</div>
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
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

	.panel-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #8b949e;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.shortcut {
		font-size: 0.75rem;
		color: #484f58;
	}

	textarea {
		flex: 1;
		padding: 16px;
		background: #0d1117;
		color: #c9d1d9;
		border: none;
		outline: none;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.9rem;
		line-height: 1.6;
		resize: none;
		tab-size: 2;
	}

	textarea::placeholder {
		color: #484f58;
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
</style>
