<script lang="ts">
	type IconName =
		| 'settings'
		| 'copy'
		| 'trash'
		| 'stop'
		| 'agent'
		| 'close'
		| 'chevron'
		| 'right'
		| 'send'
		| 'check'
		| 'warning';

	// One set of 16px outline icons, drawn on a 24px grid.
	const ICONS: Record<IconName, string> = {
		settings:
			'<path d="M4 8h9M19 8h1"/><path d="M4 16h3M13 16h7"/><circle cx="15.5" cy="8" r="2.5"/><circle cx="9.5" cy="16" r="2.5"/>',
		copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"/>',
		trash:
			'<path d="M4 7h16"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7"/><path d="M10.5 11v5M13.5 11v5"/>',
		stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
		agent:
			'<path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/><path d="M18 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>',
		close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
		chevron: '<path d="M6.5 9.5L12 15l5.5-5.5"/>',
		right: '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
		send: '<path d="M12 19V5.5"/><path d="M6.5 11L12 5.5 17.5 11"/>',
		check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
		warning: '<path d="M12 4.5L21 20H3z"/><path d="M12 10v4M12 17.2v.1"/>'
	};

	let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html ICONS[name]}
</svg>
