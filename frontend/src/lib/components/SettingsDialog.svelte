<script lang="ts">
	import { aiSettings } from '$lib/stores/ai-settings';
	import {
		generalSettings,
		generalSettingsActions,
		themeList,
		fontSizes,
		type ThemeId
	} from '$lib/stores/general-settings';
	import Icon from './Icon.svelte';

	let { open = $bindable(false), onClose }: { open: boolean; onClose: () => void } = $props();

	type View = 'general' | 'ai';

	let view = $state<View>('general');
	let dialog = $state<HTMLElement>();

	let generalDraft = $state({
		theme: 'default' as ThemeId,
		fontSize: 14,
		lineNumbers: true,
		streamEdits: true,
		autoScrollStreaming: true
	});

	let aiDraft = $state({ baseUrl: '', apiKey: '', model: '' });

	$effect(() => {
		if (!open) return;
		generalDraft = { ...$generalSettings };
		aiDraft = { ...$aiSettings };
		view = 'general';
		requestAnimationFrame(() => dialog?.focus());
	});

	function save() {
		if (view === 'general') {
			generalSettingsActions.apply({ ...generalDraft });
		} else {
			aiSettings.set({ ...aiDraft });
		}
		onClose();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
			return;
		}
		if (e.key !== 'Tab' || !dialog) return;
		const focusable = dialog.querySelectorAll<HTMLElement>(
			'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open || typeof document === 'undefined') return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	const endpoint = $derived(
		`${(aiDraft.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`
	);
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scrim" role="presentation" onclick={onClose}>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="settings-heading"
			tabindex="-1"
			bind:this={dialog}
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKeydown}
		>
			<nav class="nav" aria-label="Settings sections">
				<p class="nav-title">Settings</p>
				<button class="nav-item" aria-current={view === 'general'} onclick={() => (view = 'general')}>
					General
				</button>
				<button class="nav-item" aria-current={view === 'ai'} onclick={() => (view = 'ai')}>
					AI agent
				</button>
			</nav>

			<div class="main">
				<header class="head">
					<div>
						<h2 id="settings-heading">
							{view === 'general' ? 'General settings' : 'AI agent'}
						</h2>
						<p class="head-note">
							{view === 'general'
								? 'How the editor looks and behaves. The interface follows the editor theme.'
								: 'Where the agent sends its requests. Nothing leaves this browser except the request itself.'}
						</p>
					</div>
					<button class="icon-btn" aria-label="Close settings" onclick={onClose}>
						<Icon name="close" />
					</button>
				</header>

				<div class="body">
					{#if view === 'general'}
						<div class="row">
							<div class="row-label">
								<span class="field-label">Editor theme</span>
								<span class="field-hint">The colour scheme of the editor and the interface.</span>
							</div>
							<div class="row-control">
								<div class="select-wrap">
									<select class="input" bind:value={generalDraft.theme}>
										{#each themeList as t}
											<option value={t.id}>{t.name}</option>
										{/each}
									</select>
									<Icon name="chevron" size={14} />
								</div>
							</div>
						</div>

						<div class="row">
							<div class="row-label">
								<span class="field-label">Font size</span>
								<span class="field-hint">The size of the code in the editor.</span>
							</div>
							<div class="row-control">
								<div class="segmented" role="group" aria-label="Editor font size">
									{#each fontSizes as size}
										<button
											aria-pressed={generalDraft.fontSize === size}
											onclick={() => (generalDraft.fontSize = size)}
										>
											{size}
										</button>
									{/each}
								</div>
							</div>
						</div>

						<div class="row">
							<div class="row-label">
								<span class="field-label">Line numbers</span>
								<span class="field-hint">Show the line count in the editor gutter.</span>
							</div>
							<div class="row-control">
								<button
									class="switch"
									role="switch"
									aria-checked={generalDraft.lineNumbers}
									aria-label="Line numbers"
									onclick={() => (generalDraft.lineNumbers = !generalDraft.lineNumbers)}
								></button>
							</div>
						</div>

						<div class="row">
							<div class="row-label">
								<span class="field-label">Stream edits</span>
								<span class="field-hint">Write the agent's changes into the editor as they arrive.</span>
							</div>
							<div class="row-control">
								<button
									class="switch"
									role="switch"
									aria-checked={generalDraft.streamEdits}
									aria-label="Stream edits"
									onclick={() => (generalDraft.streamEdits = !generalDraft.streamEdits)}
								></button>
							</div>
						</div>

						<div class="row">
							<div class="row-label">
								<span class="field-label">Auto-scroll while streaming</span>
								<span class="field-hint">Follow the agent's edits when the editor is already at the end.</span>
							</div>
							<div class="row-control">
								<button
									class="switch"
									role="switch"
									aria-checked={generalDraft.autoScrollStreaming}
									aria-label="Auto-scroll while streaming"
									onclick={() => (generalDraft.autoScrollStreaming = !generalDraft.autoScrollStreaming)}
								></button>
							</div>
						</div>
					{:else}
						<div class="row">
							<div class="row-label">
								<span class="field-label">Base URL</span>
								<span class="field-hint">Any OpenAI-compatible endpoint.</span>
							</div>
							<div class="row-control">
								<input class="input" type="text" bind:value={aiDraft.baseUrl} placeholder="https://api.openai.com/v1" />
							</div>
							<p class="preview mono">Requests go to {endpoint}</p>
						</div>

						<div class="row">
							<div class="row-label">
								<span class="field-label">API key</span>
								<span class="field-hint">Stored in this browser only.</span>
							</div>
							<div class="row-control">
								<input class="input" type="password" bind:value={aiDraft.apiKey} placeholder="sk-…" autocomplete="off" />
							</div>
						</div>

						<div class="row">
							<div class="row-label">
								<span class="field-label">Model</span>
								<span class="field-hint">The model that answers in the agent panel.</span>
							</div>
							<div class="row-control">
								<input class="input" type="text" bind:value={aiDraft.model} placeholder="gpt-4o-mini" />
							</div>
						</div>
					{/if}
				</div>

				<footer class="foot">
					<button class="btn btn--text" onclick={onClose}>Cancel</button>
					<button class="btn btn--primary" onclick={save}>Save changes</button>
				</footer>
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: rgba(0, 0, 0, 0.55);
	}

	.dialog {
		display: grid;
		grid-template-columns: 172px 1fr;
		width: min(760px, 100%);
		max-height: min(680px, 100%);
		background: var(--surface);
		border-radius: 10px;
		box-shadow: var(--shadow); /* taste-skill-ignore: a real overlay floats */
		overflow: hidden;
	}

	.dialog:focus {
		outline: none;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 18px 12px;
		border-right: 1px solid var(--border);
	}

	.nav-title {
		font-size: var(--fs-small);
		font-weight: 600;
		color: var(--muted);
		padding: 0 8px 12px;
	}

	.nav-item {
		text-align: left;
		padding: 7px 8px;
		border-radius: var(--radius-chip);
		font-size: var(--fs-body);
		color: var(--muted);
		transition: background-color 0.12s ease, color 0.12s ease;
	}

	.nav-item:hover {
		color: var(--text);
		background: var(--raised);
	}

	.nav-item[aria-current='true'] {
		color: var(--text);
		background: var(--raised);
	}

	.main {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 20px 20px 16px;
	}

	.head h2 {
		font-size: 16px;
		font-weight: 600;
		color: var(--text);
	}

	.head-note {
		margin-top: 3px;
		font-size: var(--fs-small);
		color: var(--muted);
		line-height: 1.45;
	}

	.head .icon-btn {
		margin-left: auto;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 20px 8px;
	}

	.row {
		display: grid;
		grid-template-columns: 190px 1fr;
		gap: 16px;
		align-items: start;
		padding: 14px 0;
	}

	.row + .row {
		border-top: 1px solid var(--rule);
	}

	.row-label {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.row-control {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}

	.row-control .input {
		max-width: 340px;
	}

	.row-control .switch {
		margin-top: 4px;
	}

	.mono {
		font-family: var(--font-code);
		font-size: var(--fs-micro);
	}

	.preview {
		grid-column: 1 / -1;
		color: var(--faint);
		overflow-wrap: anywhere;
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 14px 20px;
		border-top: 1px solid var(--border);
	}

	@media (max-width: 640px) {
		.dialog {
			grid-template-columns: 1fr;
			max-height: 100%;
			height: 100%;
			border-radius: 0;
		}

		.nav {
			flex-direction: row;
			align-items: center;
			gap: 4px;
			padding: 10px 12px;
			border-right: none;
			border-bottom: 1px solid var(--border);
		}

		.nav-title {
			padding: 0 8px 0 0;
		}

		.row {
			grid-template-columns: 1fr;
			gap: 10px;
		}

		.row-control .input {
			max-width: none;
		}
	}
</style>
