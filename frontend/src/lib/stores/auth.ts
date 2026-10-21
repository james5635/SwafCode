import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'swafcode:auth';

export type AuthUser = {
	id: string;
	email: string;
};

export type AuthState = {
	user: AuthUser | null;
	accessToken: string | null;
	refreshToken: string | null;
};

const DEFAULTS: AuthState = { user: null, accessToken: null, refreshToken: null };

function load(): AuthState {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
	} catch {
		// ignore corrupted storage
	}
	return { ...DEFAULTS };
}

export const auth = writable<AuthState>(load());

function persist(state: AuthState) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const authActions = {
	set(tokens: { accessToken: string; refreshToken: string }, user: AuthUser) {
		const state = { user, ...tokens };
		auth.set(state);
		persist(state);
	},
	updateTokens(tokens: { accessToken: string; refreshToken: string }) {
		const state = { ...get(auth), ...tokens };
		auth.set(state);
		persist(state);
	},
	clear() {
		auth.set({ ...DEFAULTS });
		persist({ ...DEFAULTS });
	}
};

export function accessToken(): string | null {
	return get(auth).accessToken;
}

export function isSignedIn(): boolean {
	return Boolean(get(auth).accessToken);
}
