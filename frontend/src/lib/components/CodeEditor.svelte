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

	type ThemeId = 'swaf' | 'onedark' | 'light' | 'monokai' | 'vscode' | 'github' | 'gruvbox';

	let {
		code = $bindable(''),
		language = 'typescript',
		onRun,
		theme: editorTheme = 'swaf',
		fontSize = 14,
		showLineNumbers = true,
		streaming = false,
		autoScroll = true
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
	// True while we push code into the editor, so the listener below does
	// not echo our own edit back to the parent and fight the user's cursor.
	let applyingExternal = false;

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
		{ tag: [tags.function(tags.variableName), tags.labelName], color: '#0550ae' },
		{ tag: tags.definition(tags.variableName), color: '#24292f' },
		{ tag: [tags.number, tags.bool, tags.null], color: '#0550ae' },
		{ tag: [tags.string, tags.special(tags.string)], color: '#0a3069' },
		{ tag: [tags.comment, tags.blockComment, tags.lineComment], color: '#6e7781', fontStyle: 'italic' },
		{ tag: [tags.meta, tags.processingInstruction], color: '#0550ae' },
		{ tag: [tags.constant(tags.name), tags.standard(tags.name)], color: '#0550ae' },
		{ tag: tags.tagName, color: '#116329' },
		{ tag: tags.attributeName, color: '#0550ae' },
		{ tag: tags.heading, color: '#0550ae', fontWeight: 'bold' },
		{ tag: [tags.link, tags.url], color: '#0969da' },
		{ tag: tags.invalid, color: '#cf222e' }
	]);

	// SwafCode's own theme: One Dark's hues with the violet keywords and the
	// grey comments lifted until every colour clears 4.5:1 on the ground.
	const swafHighlightStyle = HighlightStyle.define([
		{ tag: [tags.comment, tags.blockComment, tags.lineComment], color: '#98a1b0', fontStyle: 'italic' },
		{ tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: '#e48087' },
		{ tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#e48087' },
		{ tag: [tags.propertyName, tags.definition(tags.variableName), tags.separator], color: '#e48087' },
		{ tag: [tags.function(tags.variableName), tags.labelName], color: '#8ec9e0' },
		{ tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#8ec9e0' },
		{ tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#e5c07b' },
		{
			tag: [
				tags.typeName,
				tags.className,
				tags.number,
				tags.changed,
				tags.annotation,
				tags.modifier,
				tags.self,
				tags.namespace
			],
			color: '#e5c07b'
		},
		{
			tag: [
				tags.operator,
				tags.operatorKeyword,
				tags.url,
				tags.escape,
				tags.regexp,
				tags.link,
				tags.special(tags.string)
			],
			color: '#56b6c2'
		},
		{ tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#98c379' },
		{ tag: [tags.meta], color: '#98a1b0' },
		{ tag: tags.heading, fontWeight: 'bold', color: '#e48087' },
		{ tag: tags.strong, fontWeight: 'bold' },
		{ tag: tags.emphasis, fontStyle: 'italic' },
		{ tag: tags.invalid, color: '#e48087' }
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
		EditorView.theme(
			{
				'&': { backgroundColor: 'var(--ground)', color: 'var(--text)' },
				'.cm-gutters': {
					backgroundColor: 'var(--ground)',
					color: 'var(--faint)',
					borderRight: '1px solid var(--rule)'
				},
				'.cm-activeLine': { backgroundColor: 'var(--editor-active)' },
				'.cm-activeLineGutter': { backgroundColor: 'var(--editor-active)', color: 'var(--muted)' },
				'.cm-selectionBackground, ::selection': { backgroundColor: 'var(--editor-selection)' },
				'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' }
			},
			{ dark: false }
		),
		syntaxHighlighting(lightHighlightStyle)
	];

	// The shell palette wins over the imported editor theme, so the editor
	// always sits on the same ground as the rest of the application.
	function shellTheme(dark: boolean): Extension {
		return EditorView.theme(
			{
				'&': { backgroundColor: 'var(--ground)', color: 'var(--text)' },
				'.cm-scroller': { fontFamily: 'var(--font-code)' },
				'.cm-gutters': {
					backgroundColor: 'var(--ground)',
					color: 'var(--faint)',
					borderRight: '1px solid var(--rule)'
				},
				'.cm-activeLine': { backgroundColor: 'var(--editor-active)' },
				'.cm-activeLineGutter': { backgroundColor: 'var(--editor-active)', color: 'var(--muted)' },
				'.cm-selectionBackground, ::selection': { backgroundColor: 'var(--editor-selection)' },
				'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
				'.cm-placeholder': { color: 'var(--faint)' }
			},
			{ dark }
		);
	}

	function getThemeExtension(t: ThemeId): Extension {
		switch (t) {
			case 'monokai':
				return [monokai, shellTheme(true)];
			case 'vscode':
				return [vsCodeDark, shellTheme(true)];
			case 'github':
				return [githubDark, shellTheme(true)];
			case 'gruvbox':
				return [gruvboxDark, shellTheme(true)];
			case 'onedark':
				return [oneDark, shellTheme(true)];
			case 'light':
				return lightTheme;
			case 'swaf':
			default:
				return [syntaxHighlighting(swafHighlightStyle), shellTheme(true)];
		}
	}

	function createExtensions(lang: string): Extension[] {
		return [
			themeCompartment.of(getThemeExtension(editorTheme)),
			langCompartment.of(getLangExtension(lang)),
			fontSizeCompartment.of(
				EditorView.theme({
					'&': { fontSize: `${fontSize}px` }
				})
			),
			lineNumbersCompartment.of(showLineNumbers ? lineNumbers() : []),
			keymap.of([
				{
					key: 'Mod-Enter',
					run: () => {
						onRun?.();
						return true;
					},
					preventDefault: true
				},
				...defaultKeymap,
				indentWithTab
			]),
			EditorView.updateListener.of((update) => {
				if (!update.docChanged || applyingExternal) return;
				code = update.state.doc.toString();
			}),
			EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
			ph('Write your code here…'),
			EditorView.lineWrapping
		];
	}

	function createView(lang: string, doc: string) {
		const state = EditorState.create({
			doc,
			extensions: createExtensions(lang)
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
			effects: langCompartment.reconfigure(getLangExtension(language))
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: themeCompartment.reconfigure(getThemeExtension(editorTheme))
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: fontSizeCompartment.reconfigure(
				EditorView.theme({
					'&': {
						fontSize: `${fontSize}px`
					}
				})
			)
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: lineNumbersCompartment.reconfigure(showLineNumbers ? lineNumbers() : [])
		});
	});

	$effect(() => {
		if (!mounted || !view) return;
		const currentDoc = view.state.doc.toString();
		if (currentDoc === code) return;

		applyingExternal = true;
		try {
			if (streaming && code.startsWith(currentDoc)) {
				// Streaming: only append the new tail
				const scroller = view.scrollDOM;
				const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;

				view.dispatch({
					changes: { from: currentDoc.length, insert: code.slice(currentDoc.length) }
				});

				if (autoScroll && atBottom) {
					view.dispatch({
						effects: EditorView.scrollIntoView(code.length, { y: 'end' })
					});
				}
			} else {
				// Normal: full replace
				view.dispatch({
					changes: { from: 0, to: currentDoc.length, insert: code }
				});
			}
		} finally {
			applyingExternal = false;
		}
	});
</script>

<div class="editor" bind:this={container}></div>

<style>
	.editor {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.editor :global(.cm-editor) {
		height: 100%;
	}

	.editor :global(.cm-scroller) {
		font-family: var(--font-code);
		line-height: 1.6;
		padding: 14px 0 40px;
	}

	.editor :global(.cm-content) {
		caret-color: var(--accent);
	}
</style>
