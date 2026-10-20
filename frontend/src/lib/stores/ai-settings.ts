import { writable } from 'svelte/store';

const STORAGE_KEY = 'swafcode:ai-settings';

export type AiSettings = {
	baseUrl: string;
	apiKey: string;
	model: string;
};

const DEFAULTS: AiSettings = {
	baseUrl: 'https://api.openai.com/v1',
	apiKey: '',
	model: 'gpt-4o-mini',
};

function load(): AiSettings {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
	} catch {
		// ignore
	}
	return { ...DEFAULTS };
}

export const aiSettings = writable<AiSettings>(load());

aiSettings.subscribe((value) => {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
});
