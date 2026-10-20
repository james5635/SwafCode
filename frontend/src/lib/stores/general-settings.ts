import { writable, derived, get } from 'svelte/store';

const STORAGE_KEY = 'swafcode:general-settings';

export type ThemeId = 'default' | 'light' | 'monokai' | 'vscode' | 'github' | 'gruvbox';

export const themeList = [
	{ id: 'default', name: 'Default (One Dark)' },
	{ id: 'light', name: 'Light' },
	{ id: 'monokai', name: 'Monokai' },
	{ id: 'vscode', name: 'VS Code Dark+' },
	{ id: 'github', name: 'GitHub Dark' },
	{ id: 'gruvbox', name: 'Gruvbox Dark' },
] as const;

export const themes: Record<ThemeId, { name: string; colors: Record<string, string> }> = {
	default: {
		name: 'Default (One Dark)',
		colors: {
			'--bg-primary': '#0d1117',
			'--bg-secondary': '#161b22',
			'--bg-tertiary': '#21262d',
			'--bg-hover': '#30363d',
			'--bg-input': '#0d1117',
			'--bg-panel': '#161b22',
			'--bg-gutter': '#0d1117',
			'--text-primary': '#c9d1d9',
			'--text-secondary': '#8b949e',
			'--text-muted': '#484f58',
			'--text-inverse': '#161b22',
			'--accent-primary': '#58a6ff',
			'--accent-secondary': '#a371f7',
			'--accent-success': '#3fb950',
			'--text-bright': '#f0f6fc',
			'--accent-success-hover': '#2ea043',
			'--accent-warning': '#d29922',
			'--accent-error': '#f85149',
			'--accent-error-hover': '#da3633',
			'--border-primary': '#30363d',
			'--border-secondary': '#21262d',
			'--border-focus': '#58a6ff',
			'--cm-bg': '#0d1117',
			'--cm-gutter-bg': '#0d1117',
			'--cm-gutter-border': '#21262d',
			'--cm-active-line': '#161b22',
			'--cm-active-line-bg': 'rgba(56, 139, 253, 0.04)',
			'--cm-selection': '#264f78',
			'--cm-comment': '#8b949e',
			'--cm-keyword': '#ff7b72',
			'--cm-string': '#a5d6ff',
			'--cm-number': '#79c0ff',
			'--cm-function': '#d2a8ff',
			'--cm-type': '#ffa657',
			'--cm-variable': '#e4e4e4',
		},
	},
	monokai: {
		name: 'Monokai',
		colors: {
			'--bg-primary': '#272822',
			'--bg-secondary': '#2d2d2d',
			'--bg-tertiary': '#383830',
			'--bg-hover': '#3e3d32',
			'--bg-input': '#272822',
			'--bg-panel': '#2d2d2d',
			'--bg-gutter': '#272822',
			'--text-primary': '#f8f8f2',
			'--text-secondary': '#a59f85',
			'--text-muted': '#75715e',
			'--text-inverse': '#272822',
			'--accent-primary': '#f92672',
			'--accent-secondary': '#ae81ff',
			'--accent-success': '#a6e22e',
			'--text-bright': '#f8f8f2',
			'--accent-success-hover': '#b8bb26',
			'--accent-warning': '#fd971f',
			'--accent-error': '#f92672',
			'--accent-error-hover': '#f92672',
			'--border-primary': '#3e3d32',
			'--border-secondary': '#35352c',
			'--border-focus': '#f92672',
			'--cm-bg': '#272822',
			'--cm-gutter-bg': '#272822',
			'--cm-gutter-border': '#3e3d32',
			'--cm-active-line': '#3e3d32',
			'--cm-active-line-bg': 'rgba(255, 255, 255, 0.04)',
			'--cm-selection': '#49483e',
			'--cm-comment': '#75715e',
			'--cm-keyword': '#f92672',
			'--cm-string': '#e6db74',
			'--cm-number': '#ae81ff',
			'--cm-function': '#66d9ef',
			'--cm-type': '#fd971f',
			'--cm-variable': '#f8f8f2',
		},
	},
	vscode: {
		name: 'VS Code Dark+',
		colors: {
			'--bg-primary': '#1e1e1e',
			'--bg-secondary': '#252526',
			'--bg-tertiary': '#2d2d2d',
			'--bg-hover': '#2d2d2d',
			'--bg-input': '#1e1e1e',
			'--bg-panel': '#252526',
			'--bg-gutter': '#1e1e1e',
			'--text-primary': '#d4d4d4',
			'--text-secondary': '#9cdcfe',
			'--text-muted': '#6a9955',
			'--text-inverse': '#1e1e1e',
			'--accent-primary': '#569cd6',
			'--accent-secondary': '#c586c0',
			'--accent-success': '#4ec9b0',
			'--text-bright': '#e9e9e9',
			'--accent-success-hover': '#6ec3a5',
			'--accent-warning': '#dcdcaa',
			'--accent-error': '#f44747',
			'--accent-error-hover': '#f14c4c',
			'--border-primary': '#3c3c3c',
			'--border-secondary': '#2d2d30',
			'--border-focus': '#569cd6',
			'--cm-bg': '#1e1e1e',
			'--cm-gutter-bg': '#1e1e1e',
			'--cm-gutter-border': '#2d2d30',
			'--cm-active-line': '#252526',
			'--cm-active-line-bg': 'rgba(255, 255, 255, 0.03)',
			'--cm-selection': '#264f78',
			'--cm-comment': '#6a9955',
			'--cm-keyword': '#569cd6',
			'--cm-string': '#ce9178',
			'--cm-number': '#b5cea8',
			'--cm-function': '#dcdcaa',
			'--cm-type': '#4ec9b0',
			'--cm-variable': '#9cdcfe',
		},
	},
	github: {
		name: 'GitHub Dark',
		colors: {
			'--bg-primary': '#0d1117',
			'--bg-secondary': '#161b22',
			'--bg-tertiary': '#21262d',
			'--bg-hover': '#30363d',
			'--bg-input': '#0d1117',
			'--bg-panel': '#161b22',
			'--bg-gutter': '#0d1117',
			'--text-primary': '#e6edf3',
			'--text-secondary': '#8b949e',
			'--text-muted': '#8b949e',
			'--text-inverse': '#161b22',
			'--accent-primary': '#58a6ff',
			'--accent-secondary': '#a371f7',
			'--accent-success': '#3fb950',
			'--text-bright': '#f0f6fc',
			'--accent-success-hover': '#2ea043',
			'--accent-warning': '#d29922',
			'--accent-error': '#f85149',
			'--accent-error-hover': '#da3633',
			'--border-primary': '#30363d',
			'--border-secondary': '#21262d',
			'--border-focus': '#58a6ff',
			'--cm-bg': '#0d1117',
			'--cm-gutter-bg': '#0d1117',
			'--cm-gutter-border': '#21262d',
			'--cm-active-line': '#161b22',
			'--cm-active-line-bg': 'rgba(56, 139, 253, 0.04)',
			'--cm-selection': '#1f6feb33',
			'--cm-comment': '#8b949e',
			'--cm-keyword': '#ff7b72',
			'--cm-string': '#a5d6ff',
			'--cm-number': '#79c0ff',
			'--cm-function': '#d2a8ff',
			'--cm-type': '#ffa657',
			'--cm-variable': '#e6edf3',
		},
	},
	gruvbox: {
		name: 'Gruvbox Dark',
		colors: {
			'--bg-primary': '#282828',
			'--bg-secondary': '#3c3836',
			'--bg-tertiary': '#504945',
			'--bg-hover': '#504945',
			'--bg-input': '#282828',
			'--bg-panel': '#3c3836',
			'--bg-gutter': '#282828',
			'--text-primary': '#ebdbb2',
			'--text-secondary': '#a89984',
			'--text-muted': '#928374',
			'--text-inverse': '#282828',
			'--accent-primary': '#fb4934',
			'--accent-secondary': '#d3869b',
			'--accent-success': '#b8bb26',
			'--text-bright': '#fbf1c7',
			'--accent-success-hover': '#b8bb26',
			'--accent-warning': '#fabd2f',
			'--accent-error': '#fb4934',
			'--accent-error-hover': '#fb4934',
			'--border-primary': '#504945',
			'--border-secondary': '#3c3836',
			'--border-focus': '#fb4934',
			'--cm-bg': '#282828',
			'--cm-gutter-bg': '#282828',
			'--cm-gutter-border': '#504945',
			'--cm-active-line': '#3c3836',
			'--cm-active-line-bg': 'rgba(255, 255, 255, 0.04)',
			'--cm-selection': '#504945',
			'--cm-comment': '#928374',
			'--cm-keyword': '#fb4934',
			'--cm-string': '#b8bb26',
			'--cm-number': '#d3869b',
			'--cm-function': '#fabd2f',
			'--cm-type': '#8ec07c',
			'--cm-variable': '#ebdbb2',
		},
	},

	light: {
		name: 'Light',
		colors: {
			'--bg-primary': '#ffffff',
			'--bg-secondary': '#f6f8fa',
			'--bg-tertiary': '#eaeef2',
			'--bg-hover': '#d0d7de',
			'--bg-input': '#ffffff',
			'--bg-panel': '#f6f8fa',
			'--bg-gutter': '#f6f8fa',
			'--text-primary': '#24292f',
			'--text-secondary': '#656d76',
			'--text-muted': '#8b949e',
			'--text-inverse': '#ffffff',
			'--text-bright': '#24292f',
			'--accent-primary': '#0969da',
			'--accent-secondary': '#8250df',
			'--accent-success': '#1f883d',
			'--accent-success-hover': '#1a7f37',
			'--accent-warning': '#9a6700',
			'--accent-error': '#cf222e',
			'--accent-error-hover': '#a40e26',
			'--border-primary': '#d0d7de',
			'--border-secondary': '#eaeef2',
			'--border-focus': '#0969da',
			'--cm-bg': '#ffffff',
			'--cm-gutter-bg': '#f6f8fa',
			'--cm-gutter-border': '#eaeef2',
			'--cm-active-line': '#f6f8fa',
			'--cm-active-line-bg': 'rgba(9, 105, 218, 0.06)',
			'--cm-selection': '#cce5ff',
			'--cm-comment': '#6e7781',
			'--cm-keyword': '#cf222e',
			'--cm-string': '#0a3069',
			'--cm-number': '#0550ae',
			'--cm-function': '#8250df',
			'--cm-type': '#953800',
			'--cm-variable': '#24292f',
		},
	},
} as const;

type GeneralState = {
	theme: ThemeId;
	autoScrollStreaming: boolean;
};

function load() {
	if (typeof localStorage === 'undefined') return { theme: 'default', autoScrollStreaming: true };
	try {
		const saved = localStorage.getItem('swafcode:general-settings');
		if (saved) return { theme: 'default', autoScrollStreaming: true, ...JSON.parse(saved) };
	} catch { }
	return { theme: 'default', autoScrollStreaming: true };
}

const initial = load();

export const generalSettings = writable<{ theme: ThemeId; autoScrollStreaming: boolean }>(initial);

export const autoScrollStreaming = derived(generalSettings, ($s) => $s.autoScrollStreaming);
export const editorTheme = derived(generalSettings, ($s) => $s.theme);
export const currentTheme = derived(generalSettings, ($s) => themes[$s.theme]);

export const generalSettingsActions = {
	setTheme(themeId: ThemeId) {
		generalSettings.update((s) => ({ ...s, theme: themeId }));
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('swafcode:general-settings', JSON.stringify({
				theme: themeId,
				autoScrollStreaming: get(generalSettings).autoScrollStreaming,
			}));
		}
	},
	setAutoScroll(value: boolean) {
		generalSettings.update((s) => ({ ...s, autoScrollStreaming: value }));
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('swafcode:general-settings', JSON.stringify({
				theme: get(generalSettings).theme,
				autoScrollStreaming: value,
			}));
		}
	},
};

// Apply theme on load and on changes
if (typeof window !== 'undefined') {
	generalSettings.subscribe(($s) => {
		const theme = themes[$s.theme];
		const root = document.documentElement;
		for (const [key, value] of Object.entries(theme.colors)) {
			root.style.setProperty(key, value);
		}
		document.body.dataset.theme = $s.theme;
	});
}