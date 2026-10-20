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
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

	let {
		code = $bindable(''),
		language = 'typescript',
		onRun,
		theme = 'dark',
		fontSize = 14,
		showLineNumbers = true,
		streaming = false,
	}: {
		code: string;
		language: string;
		onRun?: () => void;
		theme?: 'dark' | 'light';
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

	function getThemeExtension(t: 'dark' | 'light'): Extension {
		if (t === 'dark') {
			return oneDark;
		}
		// Light theme using default highlight style
		return EditorView.theme({
			'&': {
				backgroundColor: '#ffffff',
				color: '#24292f',
			},
			'.cm-gutters': {
				backgroundColor: '#f6f8fa',
				borderRight: '1px solid #d0d7de',
			},
			'.cm-activeLineGutter': {
				backgroundColor: '#eaeef2',
			},
			'.cm-activeLine': {
				backgroundColor: 'rgba(9, 105, 218, 0.04)',
			},
			'.cm-selectionBackground': {
				backgroundColor: '#cce5ff',
			},
		});
	}

	function createExtensions(lang: string): Extension[] {
		return [
			themeCompartment.of(getThemeExtension(theme)),
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
			effects: themeCompartment.reconfigure(getThemeExtension(theme)),
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
			view.dispatch({
				changes: { from: 0, to: currentDoc.length, insert: code },
			});
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