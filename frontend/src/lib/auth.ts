import { get } from 'svelte/store';
import { auth, authActions, type AuthUser } from '$lib/stores/auth';

const AUTH_API = '/auth';

type Tokens = { accessToken: string; refreshToken: string };

let refreshing: Promise<boolean> | null = null;

/**
 * Sends a request with the access token attached. When the token has expired
 * it is refreshed once, and the request is tried again.
 */
export async function authFetch(
	input: string,
	init: RequestInit = {},
	retry = true
): Promise<Response> {
	const state = get(auth);
	const headers = new Headers(init.headers);
	if (state.accessToken) {
		headers.set('Authorization', `Bearer ${state.accessToken}`);
	}

	const res = await fetch(input, { ...init, headers });

	if (res.status === 401 && retry && state.refreshToken) {
		const refreshed = await refreshAccessToken();
		if (refreshed) {
			return authFetch(input, init, false);
		}
	}

	return res;
}

/** Swaps the refresh token for a new pair. Only one refresh runs at a time. */
export async function refreshAccessToken(): Promise<boolean> {
	if (refreshing) return refreshing;

	refreshing = (async () => {
		const state = get(auth);
		if (!state.refreshToken) return false;

		try {
			const res = await fetch(`${AUTH_API}/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refreshToken: state.refreshToken })
			});
			if (!res.ok) {
				authActions.clear();
				return false;
			}
			const data = (await res.json()) as Tokens;
			authActions.updateTokens(data);
			return true;
		} catch {
			return false;
		} finally {
			refreshing = null;
		}
	})();

	return refreshing;
}

export async function signIn(email: string, password: string): Promise<string | null> {
	const res = await fetch(`${AUTH_API}/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});

	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		return data.message ?? 'Sign in failed';
	}

	const tokens = (await res.json()) as Tokens;
	const me = await fetch(`${AUTH_API}/me`, {
		headers: { Authorization: `Bearer ${tokens.accessToken}` }
	});
	const user = me.ok ? ((await me.json()) as AuthUser) : { id: '', email };

	authActions.set(tokens, user);
	return null;
}

export async function signUp(email: string, password: string): Promise<string | null> {
	const res = await fetch(`${AUTH_API}/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});

	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		return data.message ?? 'Sign up failed';
	}

	return signIn(email, password);
}

export async function signOut(): Promise<void> {
	const state = get(auth);
	if (state.refreshToken) {
		await fetch(`${AUTH_API}/logout`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ refreshToken: state.refreshToken })
		}).catch(() => {});
	}
	authActions.clear();
}
