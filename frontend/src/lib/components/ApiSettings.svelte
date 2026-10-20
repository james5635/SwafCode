<script lang="ts">
	import { aiSettings } from '$lib/stores/ai-settings';
	import { generalSettings, themeList, generalSettingsActions, editorTheme, autoScrollStreaming } from '$lib/stores/general-settings';

	type Tab = 'ai' | 'general';

	let { open = $bindable(false), onClose }: { open: boolean; onClose: () => void } = $props();

	let activeTab = $state<Tab>('ai');

	let aiConfig = $state({ ...$aiSettings });
	let generalConfig = $state({
		theme: $editorTheme,
		autoScrollStreaming: $autoScrollStreaming,
	});

	function save() {
		aiSettings.set(aiConfig);
		generalSettingsActions.setTheme(generalConfig.theme);
		generalSettingsActions.setAutoScroll(generalConfig.autoScrollStreaming);
		onClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation" tabindex="-1">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings" tabindex="-1">
			<div class="modal-header">
				<h2>Settings</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
			</div>

			<div class="modal-tabs">
				<button class="modal-tab" class:active={activeTab === 'ai'} onclick={() => activeTab = 'ai'}>AI</button>
				<button class="modal-tab" class:active={activeTab === 'general'} onclick={() => activeTab = 'general'}>General</button>
			</div>

			<div class="modal-body">
				{#if activeTab === 'ai'}
					<label class="field">
						<span class="field-label">Base URL</span>
						<input
							type="text"
							bind:value={aiConfig.baseUrl}
							placeholder="https://api.openai.com/v1"
						/>
						<span class="field-hint">OpenAI-compatible endpoint (e.g. OpenAI, Ollama, LM Studio)</span>
					</label>
					<label class="field">
						<span class="field-label">API Key</span>
						<input
							type="password"
							bind:value={aiConfig.apiKey}
							placeholder="sk-..."
							autocomplete="off"
						/>
						<span class="field-hint">Stored locally in your browser only</span>
					</label>
					<label class="field">
						<span class="field-label">Model</span>
						<input
							type="text"
							bind:value={aiConfig.model}
							placeholder="gpt-4o-mini"
						/>
					</label>
				{:else}
					<label class="field">
						<span class="field-label">Theme</span>
						<select bind:value={generalConfig.theme}>
							{#each themeList as t}
								<option value={t.id}>{t.name}</option>
							{/each}
						</select>
					</label>
					<label class="field checkbox">
						<input type="checkbox" bind:checked={generalConfig.autoScrollStreaming} />
						<span>Auto-scroll editor when AI streams</span>
					</label>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn secondary" onclick={onClose}>Cancel</button>
				<button class="btn primary" onclick={save}>Save</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		width: 480px;
		max-width: 90vw;
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-primary);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 1rem;
		cursor: pointer;
	}

	.close-btn:hover {
		color: var(--text-primary);
	}

	.modal-tabs {
		display: flex;
		background: var(--bg-primary);
		border-bottom: 1px solid var(--border-primary);
	}

	.modal-tab {
		flex: 1;
		padding: 10px 0;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		border-bottom: 2px solid transparent;
	}

	.modal-tab:hover {
		color: var(--accent-primary);
		background: var(--bg-tertiary);
	}

	.modal-tab.active {
		color: var(--accent-primary);
		border-bottom-color: var(--accent-primary);
	}

	.modal-body {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field.checkbox {
		flex-direction: row;
		align-items: center;
		gap: 10px;
	}

	.field.checkbox input {
		width: 16px;
		height: 16px;
		accent-color: var(--accent-success);
	}

	.field-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.field input,
	.field select {
		padding: 8px 12px;
		background: var(--bg-input);
		border: 1px solid var(--border-primary);
		border-radius: 6px;
		color: var(--text-primary);
		font-size: 0.85rem;
		outline: none;
	}

	.field input:focus,
	.field select:focus {
		border-color: var(--border-focus);
	}

	.field-hint {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid var(--border-primary);
	}

	.btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
	}

	.btn.primary {
		background: var(--accent-success);
		color: var(--text-inverse);
	}

	.btn.primary:hover {
		filter: brightness(1.1);
	}

	.btn.secondary {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-primary);
	}

	.btn.secondary:hover {
		background: var(--bg-hover);
	}
</style>