<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, placeholder as ph, lineNumbers } from '@codemirror/view';
	import { EditorState, type Extension, Compartment } from '@codemirror/state';
	import { javascript } from '@codemirror/lang-javascript';
	import { python } from '@codemirror/lang-python';
	import { java } from '@codemirror/lang-java';
	import { cpp } from '@codemirror/lang-cpp';
	import { rust } from '@codemirror/lang-rust';
	import { go } from '@codemirror/lang-go';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { monokai } from '@fsegurai/codemirror-theme-monokai';
	import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
	import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
	import { gruvboxDark } from '@fsegurai/codemirror-theme-gruvbox-dark';
	import { defaultKeymap, indentWithTab } from '@codemirror/commands';
	import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

	type ThemeId = 'default' | 'monokai' | 'vscode' | 'github' | 'gruvbox';

	let {
		code = $bindable(''),
		language = 'typescript',
		onRun,
		theme: editorTheme = 'default',
		fontSize = 14,
		showLineNumbers = true,
		streaming = false,
	}: {
		code: string;
		language: string;
		onRun?: () => void;
		theme?: ThemeId;
		fontSize?: number;
		showLineNumbers?: boolean;
		streaming?: boolean;
	} = $props();

	let container: HTMLDivElement;
	let view: EditorView;
	let mounted = false;

	const langCompartment = new Compartment();
	const themeCompartment = new Compartment();
	const fontSizeCompartment = new Compartment();
	const lineNumbersCompartment = new Compartment();

	function getLangExtension(lang: string): Extension {
		switch (lang) {
			case 'python':
				return python();
			case 'java':
				return java();
			case 'cpp':
				return cpp();
			case 'rust':
				return rust();
			case 'go':
				return go();
			case 'typescript':
			default:
				return javascript({ typescript: true });
		}
	}

	function getThemeExtension(t: ThemeId): Extension {
		switch (t) {
			case 'monokai':
				return monokai;
			case 'vscode':
				return vsCodeDark;
			case 'github':
				return githubDark;
			case 'gruvbox':
				return gruvboxDark;
			case 'default':
			default:
				return oneDark;
		}
	}

	function createExtensions(lang: string): Extension[] {
		return [
			themeCompartment.of(getThemeExtension(editorTheme)),
			syntaxHighlighting(defaultHighlightStyle),
			langCompartment.of(getLangExtension(lang)),
			fontSizeCompartment.of(EditorView.theme({
				'&': {
					fontSize: `${fontSize}px`,
				},
			})),
			lineNumbersCompartment.of(showLineNumbers ? lineNumbers() : []),
			keymap.of([{
				key: 'Mod-Enter',
				run: () => {
					onRun?.();
					return true;
				},
				preventDefault: true,
			}, ...defaultKeymap, indentWithTab]),
			EditorView.updateListener.of((update) => {
				if (!streaming && update.docChanged) {
					code = update.state.doc.toString();
				}
			}),
			ph('Write your code here...'),
			EditorView.lineWrapping,
		];
	}

	function createView(lang: string, doc: string) {
		const state = EditorState.create({
			doc,
			extensions: createExtensions(lang),
		});
		return new EditorView({ state, parent: container });
	}

	onMount(() => {
		view = createView(language, code);
		mounted = true;
	});

	onDestroy(() => {
		view?.destroy();
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: langCompartment.reconfigure(getLangExtension(language)),
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: themeCompartment.reconfigure(getThemeExtension(editorTheme)),
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: fontSizeCompartment.reconfigure(EditorView.theme({
				'&': {
					fontSize: `${fontSize}px`,
				},
			})),
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: lineNumbersCompartment.reconfigure(showLineNumbers ? lineNumbers() : []),
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		const currentDoc = view.state.doc.toString();
		if (currentDoc !== code) {
			if (streaming && code.startsWith(currentDoc)) {
				// Streaming: only append the new tail
				view.dispatch({
					changes: { from: currentDoc.length, insert: code.slice(currentDoc.length) },
				});
			} else {
				// Normal: full replace
				view.dispatch({
					changes: { from: 0, to: currentDoc.length, insert: code },
				});
			}
		}
	});
</script>

<div class="editor" bind:this={container}></div>

<style>
	.editor {
		flex: 1;
		overflow: hidden;
	}

	.editor :global(.cm-editor) {
		height: 100%;
	}

	.editor :global(.cm-scroller) {
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		line-height: 1.6;
	}

	.editor :global(.cm-gutters) {
		background: #0d1117;
		border-right: 1px solid #21262d;
	}

	.editor :global(.cm-activeLineGutter) {
		background: #161b22;
	}

	.editor :global(.cm-activeLine) {
		background: rgba(56, 139, 253, 0.04);
	}
</style>