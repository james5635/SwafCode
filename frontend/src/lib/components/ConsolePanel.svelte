<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		stdout = $bindable(''),
		stderr = $bindable(''),
		stdin = $bindable(''),
		notice = $bindable(''),
		tab = $bindable('output'),
		exitCode = null,
		durationMs = 0,
		compileMs = 0,
		kind = null,
		shortcut = 'Ctrl ⏎'
	}: {
		stdout?: string;
		stderr?: string;
		stdin?: string;
		notice?: string;
		tab?: 'output' | 'input';
		exitCode?: number | null;
		durationMs?: number;
		compileMs?: number;
		kind?: string | null;
		shortcut?: string;
	} = $props();

	function copyConsole() {
		const text = [stdout, stderr].filter(Boolean).join('\n');
		if (text) navigator.clipboard?.writeText(text);
	}

	function clearConsole() {
		stdout = '';
		stderr = '';
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${Math.round(ms)} ms`;
		return `${(ms / 1000).toFixed(1)} s`;
	}

	let status = $derived.by(() => {
		if (!kind) return '';
		const parts: string[] = [];
		if (kind === 'compile') parts.push('compile error');
		else if (kind === 'spawn') parts.push('runtime unavailable');
		else if (kind === 'timeout') parts.push('timed out');
		else if (kind === 'cancelled') parts.push('stopped');
		else {
			parts.push(`exit ${exitCode ?? '—'}`);
			if (durationMs) parts.push(formatDuration(durationMs));
		}
		if (compileMs) parts.push(`compiled ${formatDuration(compileMs)}`);
		return parts.join(' · ');
	});

	let statusBad = $derived(
		kind === 'compile' || kind === 'spawn' || kind === 'timeout' || kind === 'runtime'
	);
</script>

<section class="panel console">
	<div class="panel-head">
		<h2 class="panel-title">Console</h2>

		<div class="tabs" role="tablist" aria-label="Console view">
			<button
				class="tab"
				role="tab"
				aria-selected={tab === 'output'}
				onclick={() => (tab = 'output')}
			>
				Output
			</button>
			<button
				class="tab"
				role="tab"
				aria-selected={tab === 'input'}
				onclick={() => (tab = 'input')}
			>
				Input
			</button>
		</div>

		<div class="panel-actions">
			<button class="icon-btn" title="Copy console" aria-label="Copy console" onclick={copyConsole}>
				<Icon name="copy" />
			</button>
			<button class="icon-btn" title="Clear console" aria-label="Clear console" onclick={clearConsole}>
				<Icon name="trash" />
			</button>
		</div>
	</div>

	<div class="panel-body console-body">
		{#if tab === 'output'}
			{#if notice}
				<p class="notice">{notice}</p>
			{/if}
			{#if status}
				<p class="status" class:status--bad={statusBad}>{status}</p>
			{/if}
			{#if stdout || stderr}
				{#if stdout}
					<div class="stream">
						<p class="stream-label">stdout</p>
						<pre class="stream-body">{stdout}</pre>
					</div>
				{/if}
				{#if stderr}
					<div class="stream stream--error">
						<p class="stream-label">stderr</p>
						<pre class="stream-body">{stderr}</pre>
					</div>
				{/if}
			{:else}
				<div class="empty">
					<p class="empty-text">No output yet. Press <span class="kbd">{shortcut}</span> to run this program.</p>
				</div>
			{/if}
		{:else}
			<div class="input-view">
				<label class="field-label" for="stdin">Standard input</label>
				<p class="field-hint">Piped to the program when it runs.</p>
				<textarea
					id="stdin"
					class="input stdin"
					bind:value={stdin}
					placeholder="The program reads from stdin…"
					spellcheck="false"
				></textarea>
			</div>
		{/if}
	</div>
</section>

<style>
	.tabs {
		display: flex;
		align-items: center;
		height: 100%;
	}

	.console-body {
		padding: 14px 16px 18px;
	}

	.notice {
		margin-bottom: 12px;
		font-size: var(--fs-small);
		color: var(--muted);
	}

	.status {
		margin-bottom: 12px;
		font-family: var(--font-code);
		font-size: var(--fs-micro);
		color: var(--muted);
	}

	.status--bad {
		color: var(--negative);
	}

	.stream + .stream {
		margin-top: 16px;
	}

	.stream-label {
		font-family: var(--font-code);
		font-size: var(--fs-micro);
		color: var(--muted);
		margin-bottom: 6px;
	}

	.stream--error .stream-label {
		color: var(--negative);
	}

	.stream-body {
		font-family: var(--font-code);
		font-size: var(--fs-body);
		line-height: 1.6;
		color: var(--text);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.stream--error .stream-body {
		background: var(--raised);
		border-radius: var(--radius-card);
		padding: 12px 14px;
	}

	.empty {
		display: flex;
		align-items: flex-start;
	}

	.empty-text {
		color: var(--muted);
		font-size: var(--fs-body);
	}

	.input-view {
		display: flex;
		flex-direction: column;
		gap: 6px;
		height: 100%;
	}

	.stdin {
		flex: 1;
		min-height: 90px;
		margin-top: 4px;
	}
</style>
