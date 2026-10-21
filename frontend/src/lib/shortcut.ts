export const isMac =
	typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const modKey = isMac ? '⌘' : 'Ctrl';

export const runShortcut = isMac ? '⌘⏎' : 'Ctrl ⏎';
