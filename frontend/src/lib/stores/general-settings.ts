import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'swafcode:general-settings';

export type ThemeId =
	| 'swaf'
	| 'onedark'
	| 'light'
	| 'monokai'
	| 'vscode'
	| 'github'
	| 'gruvbox';

export const themeList = [
	{ id: 'swaf', name: 'SwafCode Dark' },
	{ id: 'onedark', name: 'One Dark' },
	{ id: 'light', name: 'Light' },
	{ id: 'monokai', name: 'Monokai' },
	{ id: 'vscode', name: 'VS Code Dark+' },
	{ id: 'github', name: 'GitHub Dark' },
	{ id: 'gruvbox', name: 'Gruvbox Dark' }
] as const satisfies readonly { id: ThemeId; name: string }[];

export const fontSizes = [12, 14, 16, 18] as const;

export type GeneralSettings = {
	theme: ThemeId;
	fontSize: number;
	lineNumbers: boolean;
	streamEdits: boolean;
	autoScrollStreaming: boolean;
};

const DEFAULTS: GeneralSettings = {
	theme: 'swaf',
	fontSize: 14,
	lineNumbers: true,
	streamEdits: true,
	autoScrollStreaming: true
};

function load(): GeneralSettings {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// 'default' was the old name of the built-in theme
			if (parsed.theme === 'default') parsed.theme = 'swaf';
			return { ...DEFAULTS, ...parsed };
		}
	} catch {
		// ignore corrupted storage
	}
	return { ...DEFAULTS };
}

export const generalSettings = writable<GeneralSettings>(load());

function persist(state: GeneralSettings) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const generalSettingsActions = {
	setTheme(theme: ThemeId) {
		generalSettings.update((s) => {
			const next = { ...s, theme };
			persist(next);
			return next;
		});
	},
	setFontSize(fontSize: number) {
		generalSettings.update((s) => {
			const next = { ...s, fontSize };
			persist(next);
			return next;
		});
	},
	setLineNumbers(lineNumbers: boolean) {
		generalSettings.update((s) => {
			const next = { ...s, lineNumbers };
			persist(next);
			return next;
		});
	},
	setStreamEdits(streamEdits: boolean) {
		generalSettings.update((s) => {
			const next = { ...s, streamEdits };
			persist(next);
			return next;
		});
	},
	setAutoScroll(autoScrollStreaming: boolean) {
		generalSettings.update((s) => {
			const next = { ...s, autoScrollStreaming };
			persist(next);
			return next;
		});
	}
};

// The theme is a data attribute on <html> so the palettes in app.css
// apply before first paint; nothing else needs to reach into the DOM.
if (typeof window !== 'undefined') {
	generalSettings.subscribe(($s) => {
		document.documentElement.dataset.theme = $s.theme;
	});
}

export function currentFontSize(): number {
	return get(generalSettings).fontSize;
}
