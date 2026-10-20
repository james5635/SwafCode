<script lang="ts">
	import { aiSettings } from '$lib/stores/ai-settings';

	let { open = $bindable(false), onClose }: { open: boolean; onClose: () => void } = $props();

	let settings = $state({ ...$aiSettings });

	function save() {
		aiSettings.set(settings);
		onClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation" tabindex="-1">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="AI API Settings" tabindex="-1">
			<div class="modal-header">
				<h2>AI API Settings</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
			</div>
			<div class="modal-body">
				<label class="field">
					<span class="field-label">Base URL</span>
					<input
						type="text"
						bind:value={settings.baseUrl}
						placeholder="https://api.openai.com/v1"
					/>
					<span class="field-hint">OpenAI-compatible endpoint (e.g. OpenAI, Ollama, LM Studio)</span>
				</label>
				<label class="field">
					<span class="field-label">API Key</span>
					<input
						type="password"
						bind:value={settings.apiKey}
						placeholder="sk-..."
						autocomplete="off"
					/>
					<span class="field-hint">Stored locally in your browser only</span>
				</label>
				<label class="field">
					<span class="field-label">Model</span>
					<input
						type="text"
						bind:value={settings.model}
						placeholder="gpt-4o-mini"
					/>
				</label>
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
		background: #161b22;
		border: 1px solid #30363d;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #30363d;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: #f0f6fc;
	}

	.close-btn {
		background: none;
		border: none;
		color: #8b949e;
		font-size: 1rem;
		cursor: pointer;
	}

	.close-btn:hover {
		color: #f0f6fc;
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

	.field-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: #8b949e;
	}

	.field input {
		padding: 8px 12px;
		background: #0d1117;
		border: 1px solid #30363d;
		border-radius: 6px;
		color: #f0f6fc;
		font-size: 0.85rem;
		outline: none;
	}

	.field input:focus {
		border-color: #58a6ff;
	}

	.field-hint {
		font-size: 0.7rem;
		color: #484f58;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid #30363d;
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
		background: #238636;
		color: #fff;
	}

	.btn.primary:hover {
		background: #2ea043;
	}

	.btn.secondary {
		background: #21262d;
		color: #c9d1d9;
	}

	.btn.secondary:hover {
		background: #30363d;
	}
</style>