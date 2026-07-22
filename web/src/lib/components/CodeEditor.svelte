<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, placeholder as ph } from '@codemirror/view';
	import { EditorState, type Extension } from '@codemirror/state';
	import { javascript } from '@codemirror/lang-javascript';
	import { python } from '@codemirror/lang-python';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { defaultKeymap, indentWithTab } from '@codemirror/commands';
	import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

	let {
		code = $bindable(''),
		language = 'javascript',
		onRun,
	}: {
		code: string;
		language: string;
		onRun?: () => void;
	} = $props();

	let container: HTMLDivElement;
	let view: EditorView;
	let mounted = false;

	function getLangExtension(lang: string): Extension {
		switch (lang) {
			case 'python':
				return python();
			case 'javascript':
			default:
				return javascript();
		}
	}

	function createExtensions(lang: string): Extension {
		return [
			oneDark,
			syntaxHighlighting(defaultHighlightStyle),
			getLangExtension(lang),
			keymap.of([...defaultKeymap, indentWithTab]),
			keymap.of([
				{
					key: 'Mod-Enter',
					run: () => {
						onRun?.();
						return true;
					},
				},
			]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
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
		const lang = language;
		const currentDoc = view.state.doc.toString();
		view.destroy();
		view = createView(lang, code || currentDoc);
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
		font-size: 0.9rem;
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
