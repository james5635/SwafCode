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
	import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
	import { tags } from '@lezer/highlight';

	type ThemeId = 'default' | 'light' | 'monokai' | 'vscode' | 'github' | 'gruvbox';

	let {
		code = $bindable(''),
		language = 'typescript',
		onRun,
		theme: editorTheme = 'default',
		fontSize = 14,
		showLineNumbers = true,
		streaming = false,
		autoScroll = true,
	}: {
		code: string;
		language: string;
		onRun?: () => void;
		theme?: ThemeId;
		fontSize?: number;
		showLineNumbers?: boolean;
		streaming?: boolean;
		autoScroll?: boolean;
	} = $props();

	let container: HTMLDivElement;
	let view: EditorView;
	let mounted = false;

	const lightHighlightStyle = HighlightStyle.define([
		{ tag: tags.keyword, color: '#cf222e' },
		{ tag: [tags.controlKeyword, tags.moduleKeyword], color: '#cf222e' },
		{ tag: [tags.name, tags.deleted, tags.character], color: '#24292f' },
		{ tag: [tags.variableName], color: '#24292f' },
		{ tag: [tags.propertyName], color: '#0550ae' },
		{ tag: [tags.typeName, tags.className], color: '#953800' },
		{ tag: [tags.namespace], color: '#116329' },
		{ tag: [tags.operator, tags.operatorKeyword], color: '#0550ae' },
		{ tag: [tags.bracket, tags.brace, tags.punctuation], color: '#24292f' },
		{ tag: [tags.function(tags.variableName), tags.labelName], color: '#8250df' },
		{ tag: tags.definition(tags.variableName), color: '#24292f' },
		{ tag: [tags.number, tags.bool, tags.null], color: '#0550ae' },
		{ tag: [tags.string, tags.special(tags.string)], color: '#0a3069' },
		{ tag: [tags.comment, tags.blockComment, tags.lineComment], color: '#6e7781', fontStyle: 'italic' },
		{ tag: [tags.meta, tags.processingInstruction], color: '#0550ae' },
		{ tag: [tags.constant(tags.name), tags.standard(tags.name)], color: '#0550ae' },
		{ tag: [tags.tagName], color: '#116329' },
		{ tag: [tags.attributeName], color: '#0550ae' },
		{ tag: [tags.heading], color: '#0550ae', fontWeight: 'bold' },
		{ tag: [tags.link, tags.url], color: '#0969da' },
		{ tag: tags.invalid, color: '#cf222e' },
	]);

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

	const lightTheme = [
		EditorView.theme({
			'&': { backgroundColor: '#ffffff', color: '#24292f' },
			'.cm-gutters': { backgroundColor: '#f6f8fa', color: '#8c959f', borderRight: '1px solid #eaeef2' },
			'.cm-activeLine': { backgroundColor: 'rgba(9, 105, 218, 0.06)' },
			'.cm-activeLineGutter': { backgroundColor: '#eaeef2', color: '#1f2328' },
			'.cm-selectionBackground, ::selection': { backgroundColor: '#cce5ff' },
			'.cm-cursor, .cm-dropCursor': { borderLeftColor: '#24292f' },
			'.cm-matchingBracket': { backgroundColor: '#ddf4ff', outline: '1px solid #0969da' },
		}, { dark: false }),
		syntaxHighlighting(lightHighlightStyle),
	];

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
			case 'light':
				return lightTheme;
			case 'default':
			default:
				return oneDark;
		}
	}

	function createExtensions(lang: string): Extension[] {
		return [
			themeCompartment.of(getThemeExtension(editorTheme)),
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
				const scroller = view.scrollDOM;
				const atBottom =
					scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;

				view.dispatch({
					changes: { from: currentDoc.length, insert: code.slice(currentDoc.length) },
				});

				if (autoScroll && atBottom) {
					view.dispatch({
						effects: EditorView.scrollIntoView(code.length, { y: 'end' }),
					});
				}
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
</style>