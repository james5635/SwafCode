<script lang="ts">
	import { aiSettings } from '$lib/stores/ai-settings';
	import { marked } from 'marked';
	import Icon from './Icon.svelte';

	type Role = 'system' | 'user' | 'assistant' | 'tool';

	type Message = {
		role: Role;
		content: string;
		toolCalls?: ToolCall[];
		toolCallId?: string;
		name?: string;
	};

	type ToolCall = {
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	};

	let {
		code = $bindable(''),
		language = 'typescript',
		getOutput = () => '',
		runCode = async () => '',
		streaming = true,
		signedIn = false,
		onClose = () => {},
		onOpenSettings = () => {},
		onSignIn = () => {}
	}: {
		code: string;
		language: string;
		getOutput?: () => string;
		runCode?: () => Promise<string>;
		streaming?: boolean;
		signedIn?: boolean;
		onClose?: () => void;
		onOpenSettings?: () => void;
		onSignIn?: () => void;
	} = $props();

	let messages = $state<Message[]>([]);
	let input = $state('');
	let loading = $state(false);
	let streamingContent = $state('');
	let abortController: AbortController | null = $state(null);
	let chatContainer: HTMLDivElement;

	const TOOLS = [
		{
			type: 'function',
			function: {
				name: 'get_code',
				description: 'Get the current code in the editor',
				parameters: { type: 'object', properties: {}, required: [] }
			}
		},
		{
			type: 'function',
			function: {
				name: 'set_code',
				description: 'Replace the entire code in the editor',
				parameters: {
					type: 'object',
					properties: { code: { type: 'string', description: 'The full new code' } },
					required: ['code']
				}
			}
		},
		{
			type: 'function',
			function: {
				name: 'append_code',
				description: 'Append code to the end of the editor',
				parameters: {
					type: 'object',
					properties: { code: { type: 'string', description: 'The code to append' } },
					required: ['code']
				}
			}
		},
		{
			type: 'function',
			function: {
				name: 'run_code',
				description: 'Run the current code and return its output or errors',
				parameters: { type: 'object', properties: {}, required: [] }
			}
		}
	];

	const SUGGESTIONS = [
		'Explain what this program does',
		'Find the bug in this code',
		'Write a test for this function'
	];

	function systemPrompt(): string {
		return (
			`You are a coding assistant inside the SwafCode playground.\n` +
			`The current language is "${language}".\n` +
			`You have tools to read and modify the editor code, and to run it.\n` +
			`Use set_code/append_code to make changes, get_code to inspect, run_code to execute.\n` +
			`When you change code, briefly explain what you did. Keep responses concise.`
		);
	}

	// Convert internal messages to the OpenAI wire format (tool_calls / tool_call_id).
	function toApiMessages(msgs: Message[]): Record<string, unknown>[] {
		return msgs.map((m) => {
			if (m.role === 'tool') {
				return {
					role: 'tool',
					content: m.content,
					tool_call_id: m.toolCallId,
					name: m.name
				};
			}
			if (m.role === 'assistant' && m.toolCalls?.length) {
				return {
					role: 'assistant',
					content: m.content,
					tool_calls: m.toolCalls.map((tc) => ({
						id: tc.id,
						type: 'function',
						function: { name: tc.function.name, arguments: tc.function.arguments }
					}))
				};
			}
			return { role: m.role, content: m.content };
		});
	}

	async function executeTool(call: ToolCall): Promise<string> {
		let args: Record<string, any> = {};
		try {
			args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
		} catch {
			args = {};
		}
		switch (call.function.name) {
			case 'get_code':
				return code || '// (empty)';
			case 'set_code': {
				const newCode = args.code ?? '';
				if (streaming) {
					// Stream character by character
					for (let i = 0; i <= newCode.length; i++) {
						code = newCode.slice(0, i);
						await new Promise((r) => setTimeout(r, 3));
					}
					return `Code updated (${newCode.length} chars, streamed)`;
				}
				code = newCode;
				return `Code updated (${newCode.length} chars)`;
			}
			case 'append_code': {
				const newCode = (code ? code + '\n' : '') + (args.code ?? '');
				if (streaming) {
					for (let i = 0; i <= newCode.length; i++) {
						code = newCode.slice(0, i);
						await new Promise((r) => setTimeout(r, 3));
					}
					return 'Code appended (streamed)';
				}
				code = newCode;
				return 'Code appended';
			}
			case 'run_code':
				return await runCode();
			default:
				return `Unknown tool: ${call.function.name}`;
		}
	}

	function scrollToBottom() {
		if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
	}

	function followIfAtBottom() {
		if (!chatContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = chatContainer;
		if (scrollHeight - scrollTop - clientHeight < 100) scrollToBottom();
	}

	// Streams one LLM turn via SSE. Calls onDelta with the growing text and
	// returns the accumulated tool calls (empty if the turn was plain text).
	async function streamTurn(
		turnMessages: Message[],
		onDelta: (text: string) => void,
		signal?: AbortSignal
	): Promise<{ content: string; toolCalls: ToolCall[] }> {
		const settings = $aiSettings;
		const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`
			},
			body: JSON.stringify({
				model: settings.model,
				messages: [{ role: 'system', content: systemPrompt() }, ...toApiMessages(turnMessages)],
				tools: TOOLS,
				tool_choice: 'auto',
				stream: true
			}),
			signal
		});

		if (!res.ok || !res.body) {
			const errText = await res.text();
			throw new Error(`API error ${res.status}: ${errText}`);
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let content = '';
		const toolCalls: ToolCall[] = [];

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith('data:')) continue;
				const payload = trimmed.slice(5).trim();
				if (!payload || payload === '[DONE]') continue;

				let json: any;
				try {
					json = JSON.parse(payload);
				} catch {
					continue;
				}

				const delta = json.choices?.[0]?.delta;
				if (!delta) continue;

				if (delta.content) {
					content += delta.content;
					onDelta(content);
				}

				if (delta.tool_calls) {
					for (const tc of delta.tool_calls as any[]) {
						const idx = tc.index ?? toolCalls.length;
						if (!toolCalls[idx]) {
							toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
						}
						if (tc.id) toolCalls[idx].id = tc.id;
						if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
						if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
					}
				}
			}
		}

		return { content, toolCalls };
	}

	async function send(text?: string) {
		const prompt = (text ?? input).trim();
		if (!prompt || loading) return;

		if (!signedIn) {
			onSignIn();
			return;
		}

		const settings = $aiSettings;
		if (!settings.apiKey) {
			messages = [
				...messages,
				{
					role: 'assistant',
					content: 'Add an API key in Settings before the agent can run.'
				}
			];
			return;
		}

		messages = [...messages, { role: 'user', content: prompt }];
		input = '';
		loading = true;
		abortController = new AbortController();

		function doAutoScroll() {
			followIfAtBottom();
		}

		try {
			const maxRounds = 6;

			for (let round = 0; round < maxRounds; round++) {
				streamingContent = '';
				let latest = '';
				const { content, toolCalls } = await streamTurn(
					messages,
					(t) => {
						latest = t;
						streamingContent = t;
						requestAnimationFrame(doAutoScroll);
					},
					abortController.signal
				);

				if (toolCalls.length) {
					messages = [...messages, { role: 'assistant', content, toolCalls }];
					streamingContent = '';
					for (const call of toolCalls) {
						const result = await executeTool(call);
						messages = [
							...messages,
							{
								role: 'tool',
								content: result,
								toolCallId: call.id,
								name: call.function.name
							}
						];
					}
					followIfAtBottom();
					continue;
				}

				streamingContent = '';
				messages = [...messages, { role: 'assistant', content: latest || content }];
				break;
			}
		} catch (err: any) {
			const partial = streamingContent;
			streamingContent = '';
			if (err?.name === 'AbortError') {
				messages = [...messages, { role: 'assistant', content: partial || '(stopped)' }];
			} else {
				messages = [...messages, { role: 'assistant', content: `Request failed: ${err.message}` }];
			}
		} finally {
			loading = false;
			abortController = null;
			setTimeout(followIfAtBottom, 50);
		}
	}

	function stop() {
		abortController?.abort();
	}

	function renderMarkdown(md: string): string {
		return marked.parse(md) as string;
	}

	function clearChat() {
		messages = [];
		streamingContent = '';
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	// The conversation belongs to the account. Signing out clears it.
	$effect(() => {
		if (signedIn || messages.length === 0) return;
		messages = [];
		streamingContent = '';
	});
</script>

<div class="agent">
	<div class="panel-head">
		<h2 class="panel-title">AI agent</h2>
		<div class="panel-actions">
			<button
				class="icon-btn"
				title="Clear conversation"
				aria-label="Clear conversation"
				onclick={clearChat}
			>
				<Icon name="trash" />
			</button>
			<button class="icon-btn close" aria-label="Close the agent panel" onclick={onClose}>
				<Icon name="close" />
			</button>
		</div>
	</div>

	<div class="transcript" bind:this={chatContainer}>
		{#if !signedIn}
			<div class="empty">
				<p class="empty-title">Sign in to use the agent</p>
				<p class="empty-note">
					The agent works with your account, so your programs and its edits stay yours.
				</p>
				<button class="btn btn--quiet" onclick={onSignIn}>Sign in</button>

				<div class="capabilities">
					<p class="cap-title">What it can do</p>
					<ul>
						<li>Read the program in the editor</li>
						<li>Rewrite or extend it</li>
						<li>Run it and read the result</li>
					</ul>
				</div>
			</div>
		{:else if messages.length === 0}
			<div class="empty">
				{#if !$aiSettings.apiKey}
					<p class="empty-title">The agent needs an API key</p>
					<p class="empty-note">
						Point it at any OpenAI-compatible endpoint — OpenAI, Ollama or LM Studio.
					</p>
					<button class="btn btn--quiet" onclick={onOpenSettings}>Open settings</button>

					<div class="capabilities">
						<p class="cap-title">What it can do</p>
						<ul>
							<li>Read the program in the editor</li>
							<li>Rewrite or extend it</li>
							<li>Run it and read the result</li>
						</ul>
					</div>
				{:else}
					<p class="empty-title">Ask the agent to change the code</p>
					<p class="empty-note">
						It can read the editor, rewrite the program and run it to check the result.
					</p>
					<div class="suggestions">
						{#each SUGGESTIONS as suggestion}
							<button class="suggestion" onclick={() => send(suggestion)}>
								<Icon name="right" size={14} />
								<span>{suggestion}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			{#each messages as msg, i (i)}
				<div class="message {msg.role}">
					{#if msg.role === 'user'}
						<p class="role">You</p>
						<div class="body">{msg.content}</div>
					{:else if msg.role === 'assistant'}
						{#if msg.content}
							<p class="role">Agent</p>
							<div class="body md">{@html renderMarkdown(msg.content)}</div>
						{/if}
					{:else if msg.role === 'tool'}
						<div class="tool">
							<span class="tool-name">{msg.name}</span>
							<pre>{msg.content}</pre>
						</div>
					{/if}
				</div>
			{/each}
			{#if streamingContent}
				<div class="message assistant">
					<p class="role">Agent</p>
					<div class="body md">{@html renderMarkdown(streamingContent)}</div>
				</div>
			{:else if loading}
				<div class="message assistant">
					<p class="role">Agent</p>
					<div class="typing"><span></span><span></span><span></span></div>
				</div>
			{/if}
		{/if}
	</div>

	{#if signedIn}
		<div class="composer">
			<textarea
				bind:value={input}
				onkeydown={onKeydown}
				placeholder="Ask the agent…"
				rows="2"
				aria-label="Message the agent"
			></textarea>
			{#if loading}
				<button class="btn btn--quiet stop" onclick={stop}>
					<Icon name="stop" size={14} />
					Stop
				</button>
			{:else}
				<button class="btn btn--quiet" onclick={() => send()} disabled={!input.trim()}>Send</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.agent {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	.close {
		display: none;
	}

	@media (max-width: 1100px) {
		.close {
			display: inline-flex;
		}
	}

	.transcript {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.empty {
		padding-top: 2px;
	}

	.empty-title {
		font-size: var(--fs-body);
		font-weight: 600;
		color: var(--text);
	}

	.empty-note {
		margin-top: 4px;
		font-size: var(--fs-small);
		color: var(--muted);
		line-height: 1.5;
	}

	.empty .btn {
		margin-top: 14px;
	}

	.capabilities {
		margin-top: 28px;
		padding-top: 18px;
		border-top: 1px solid var(--rule);
	}

	.cap-title {
		font-size: var(--fs-micro);
		color: var(--faint);
		margin-bottom: 8px;
	}

	.capabilities ul {
		list-style: disc;
		padding-left: 16px;
	}

	.capabilities li {
		font-size: var(--fs-small);
		color: var(--muted);
		line-height: 1.7;
	}

	.capabilities li::marker {
		color: var(--faint);
	}

	.suggestions {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}

	.suggestion {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px 6px 0;
		font-size: var(--fs-small);
		color: var(--muted);
		text-align: left;
		transition: color 0.12s ease;
	}

	.suggestion:hover {
		color: var(--text);
	}

	.suggestion :global(svg) {
		color: var(--faint);
	}

	.role {
		font-size: var(--fs-micro);
		color: var(--faint);
		margin-bottom: 4px;
	}

	.body {
		font-size: var(--fs-body);
		line-height: 1.55;
		color: var(--text);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.tool {
		background: var(--raised);
		border-radius: var(--radius-card);
		padding: 10px 12px;
		font-family: var(--font-code);
		font-size: var(--fs-micro);
		color: var(--muted);
	}

	.tool-name {
		display: block;
		color: var(--text);
		font-weight: 500;
		margin-bottom: 4px;
	}

	.tool pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.typing {
		display: flex;
		gap: 4px;
		align-items: center;
		height: 18px;
	}

	.typing span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--faint);
		animation: blink 1.2s infinite;
	}

	.typing span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes blink {
		0%,
		80%,
		100% {
			opacity: 0.3;
		}
		40% {
			opacity: 1;
		}
	}

	.composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		padding: 12px 16px;
		border-top: 1px solid var(--border);
	}

	.composer textarea {
		flex: 1;
		min-width: 0;
		resize: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		color: var(--text);
		font-family: var(--font-sans);
		font-size: var(--fs-body);
		line-height: 1.5;
		padding: 8px 10px;
	}

	.composer textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.composer textarea::placeholder {
		color: var(--faint);
	}

	.composer .btn {
		height: 34px;
		border: 1px solid var(--border);
	}

	.stop {
		color: var(--negative);
	}
</style>
