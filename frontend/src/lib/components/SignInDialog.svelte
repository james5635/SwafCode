<script lang="ts">
	import Icon from './Icon.svelte';
	import { signIn, signUp } from '$lib/auth';

	let { open = $bindable(false), onSignedIn }: { open: boolean; onSignedIn?: () => void } =
		$props();

	let mode = $state<'signin' | 'signup'>('signin');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	let emailInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (!open) return;
		mode = 'signin';
		email = '';
		password = '';
		error = '';
		requestAnimationFrame(() => emailInput?.focus());
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (!email.trim() || !password) {
			error = 'Enter an email and a password.';
			return;
		}

		busy = true;
		error = '';
		const failure =
			mode === 'signin'
				? await signIn(email.trim(), password)
				: await signUp(email.trim(), password);
		busy = false;

		if (failure) {
			error = failure;
			return;
		}

		open = false;
		onSignedIn?.();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scrim" role="presentation" onclick={() => (open = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="signin-heading"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<header class="head">
				<div>
					<h2 id="signin-heading">
						{mode === 'signin' ? 'Sign in' : 'Create an account'}
					</h2>
					<p class="head-note">
						{mode === 'signin'
							? 'Your programs and runs belong to your account.'
							: 'An account keeps your programs and your runs together.'}
					</p>
				</div>
				<button class="icon-btn" aria-label="Close" onclick={() => (open = false)}>
					<Icon name="close" />
				</button>
			</header>

			<form class="form" onsubmit={submit}>
				<label class="field-label" for="signin-email">Email</label>
				<input
					id="signin-email"
					class="input"
					type="email"
					autocomplete="email"
					bind:value={email}
					bind:this={emailInput}
					placeholder="you@example.com"
				/>

				<label class="field-label" for="signin-password">Password</label>
				<input
					id="signin-password"
					class="input"
					type="password"
					autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
					bind:value={password}
					placeholder="••••••••"
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="actions">
					<button
						class="btn btn--text"
						type="button"
						onclick={() => {
							mode = mode === 'signin' ? 'signup' : 'signin';
							error = '';
						}}
					>
						{mode === 'signin' ? 'Create an account' : 'I have an account'}
					</button>
					<button class="btn btn--primary" type="submit" disabled={busy}>
						{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
					</button>
				</div>
			</form>
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
		width: min(400px, 100%);
		background: var(--surface);
		border-radius: 10px;
		box-shadow: var(--shadow); /* taste-skill-ignore: a real overlay floats */
		overflow: hidden;
	}

	.head {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 20px 20px 12px;
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

	.form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 20px 20px;
	}

	.form .field-label {
		margin-top: 6px;
	}

	.error {
		margin-top: 8px;
		font-size: var(--fs-small);
		color: var(--negative);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--rule);
	}
</style>
