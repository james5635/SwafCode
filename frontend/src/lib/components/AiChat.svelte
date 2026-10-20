<script lang="ts">
	import { aiSettings } from '$lib/stores/ai-settings';
	import { marked } from 'marked';

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
		theme = 'dark',
		getOutput = () => '',
		runCode = async () => '',
		embedded = false,
	}: {
		code: string;
		language: string;
		theme?: 'dark' | 'light';
		getOutput?: () => string;
		runCode?: () => Promise<string>;
		embedded?: boolean;
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
				parameters: { type: 'object', properties: {}, required: [] },
			},
		},
		{
			type: 'function',
			function: {
				name: 'set_code',
				description: 'Replace the entire code in the editor',
				parameters: {
					type: 'object',
					properties: { code: { type: 'string', description: 'The full new code' } },
					required: ['code'],
				},
			},
		},
		{
			type: 'function',
			function: {
				name: 'append_code',
				description: 'Append code to the end of the editor',
				parameters: {
					type: 'object',
					properties: { code: { type: 'string', description: 'The code to append' } },
					required: ['code'],
				},
			},
		},
		{
			type: 'function',
			function: {
				name: 'run_code',
				description: 'Run the current code and return its output or errors',
				parameters: { type: 'object', properties: {}, required: [] },
			},
		},
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
					name: m.name,
				};
			}
			if (m.role === 'assistant' && m.toolCalls?.length) {
				return {
					role: 'assistant',
					content: m.content,
					tool_calls: m.toolCalls.map((tc) => ({
						id: tc.id,
						type: 'function',
						function: { name: tc.function.name, arguments: tc.function.arguments },
					})),
				};
			}
			return { role: m.role, content: m.content };
		});
	}

	async function executeTool(call: ToolCall): Promise<string> {
		const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
		switch (call.function.name) {
			case 'get_code':
				return code || '// (empty)';
			case 'set_code':
				code = args.code ?? '';
				return `Code updated (${(args.code ?? '').length} chars)`;
			case 'append_code':
				code = (code ? code + '\n' : '') + (args.code ?? '');
				return 'Code appended';
			case 'run_code':
				return await runCode();
			default:
				return `Unknown tool: ${call.function.name}`;
		}
	}

	function scrollToBottom() {
		if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
	}

	// Streams one LLM turn via SSE. Calls onDelta with the growing text and
	// returns the accumulated tool calls (empty if the turn was plain text).
	async function streamTurn(
		turnMessages: Message[],
		onDelta: (text: string) => void,
		signal?: AbortSignal,
	): Promise<{ content: string; toolCalls: ToolCall[] }> {
		const settings = $aiSettings;
		const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`,
			},
			body: JSON.stringify({
				model: settings.model,
				messages: [{ role: 'system', content: systemPrompt() }, ...toApiMessages(turnMessages)],
				tools: TOOLS,
				tool_choice: 'auto',
				stream: true,
			}),
			signal,
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

	async function send() {
		const text = input.trim();
		if (!text || loading) return;

		const settings = $aiSettings;
		if (!settings.apiKey) {
			messages = [...messages, { role: 'assistant', content: 'Please configure your API key in Settings (gear icon).' }];
			return;
		}

		messages = [...messages, { role: 'user', content: text }];
		input = '';
		loading = true;
		abortController = new AbortController();

		try {
			const maxRounds = 6;

			for (let round = 0; round < maxRounds; round++) {
				streamingContent = '';
				let latest = '';
				const { content, toolCalls } = await streamTurn(messages, (t) => {
					latest = t;
					streamingContent = t;
					requestAnimationFrame(scrollToBottom);
				}, abortController.signal);

				if (toolCalls.length) {
					messages = [...messages, { role: 'assistant', content, toolCalls }];
					streamingContent = '';
					for (const call of toolCalls) {
						const result = await executeTool(call);
						messages = [...messages, {
							role: 'tool',
							content: result,
							toolCallId: call.id,
							name: call.function.name,
						}];
					}
					scrollToBottom();
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
				messages = [...messages, { role: 'assistant', content: `⚠️ ${err.message}` }];
			}
		} finally {
			loading = false;
			abortController = null;
			setTimeout(scrollToBottom, 50);
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
</script>

<div class="chat-panel" class:light={theme === 'light'} class:embedded>
	<div class="chat-header">
		{#if !embedded}
			<span class="panel-title">AI Agent</span>
		{:else}
			<span></span>
		{/if}
		<button class="icon-btn" onclick={clearChat} title="Clear chat">🗑️</button>
	</div>

	<div class="messages" bind:this={chatContainer}>
		{#if messages.length === 0}
			<div class="empty">
				<p>Ask the agent to help with your code.</p>
				<p class="muted">It can read, edit, and run the code in the editor.</p>
			</div>
		{:else}
			{#each messages as msg, i (i)}
				<div class="message {msg.role}">
					{#if msg.role === 'user'}
						<div class="bubble user">{msg.content}</div>
					{:else if msg.role === 'assistant'}
						{#if msg.content}
							<div class="bubble assistant">
								<div class="md">{@html renderMarkdown(msg.content)}</div>
							</div>
						{/if}
					{:else if msg.role === 'tool'}
						<div class="bubble tool">
							<span class="tool-name">{msg.name}()</span>
							<pre>{msg.content}</pre>
						</div>
					{/if}
				</div>
			{/each}
			{#if streamingContent}
				<div class="message assistant">
					<div class="bubble assistant streaming">
						{#if streamingContent}
							<div class="md">{@html renderMarkdown(streamingContent)}</div>
						{/if}
					</div>
				</div>
			{:else if loading}
				<div class="bubble assistant typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
			{/if}
		{/if}
	</div>

	<div class="input-row">
		<textarea
			bind:value={input}
			onkeydown={onKeydown}
			placeholder="Ask the agent..."
			rows="2"
		></textarea>
		{#if loading}
			<button class="stop-btn" onclick={stop} disabled={!loading}>Stop</button>
		{:else}
			<button class="send-btn" onclick={send} disabled={!input.trim()}>
				Send
			</button>
		{/if}
	</div>
</div>

<style>
	.chat-panel {
		display: flex;
		flex-direction: column;
		width: 380px;
		min-width: 280px;
		border-left: 1px solid #30363d;
		background: #0d1117;
		min-height: 0;
	}

	.chat-panel.embedded {
		width: auto;
		min-width: 0;
		flex: 1;
		border-left: none;
		background: transparent;
	}

	.chat-panel.embedded .chat-header {
		background: transparent;
		border-bottom: none;
		min-height: 0;
		padding: 8px 0 0 0;
	}

	.chat-panel.light {
		background: #ffffff;
		border-left: 1px solid #d0d7de;
	}

	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: #161b22;
		border-bottom: 1px solid #30363d;
		min-height: 40px;
	}

	.chat-panel.light .chat-header {
		background: #f6f8fa;
		border-bottom: 1px solid #d0d7de;
	}

	.panel-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #8b949e;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.icon-btn {
		background: none;
		border: none;
		color: #8b949e;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.icon-btn:hover {
		color: #f0f6fc;
	}

	.messages {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.empty {
		margin: auto;
		text-align: center;
		color: #8b949e;
		font-size: 0.85rem;
	}

	.empty .muted {
		color: #484f58;
		font-size: 0.75rem;
		margin-top: 4px;
	}

	.message {
		display: flex;
	}

	.bubble {
		max-width: 100%;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 0.85rem;
		line-height: 1.5;
		word-break: break-word;
	}

	.bubble.user {
		background: #1f6feb;
		color: #fff;
		margin-left: auto;
		border-bottom-right-radius: 2px;
	}

	.bubble.assistant {
		background: #21262d;
		color: #c9d1d9;
		border-bottom-left-radius: 2px;
	}

	.chat-panel.light .bubble.assistant {
		background: #f6f8fa;
		color: #24292f;
		border: 1px solid #d0d7de;
	}

	.bubble :global(.md p) {
		margin: 0 0 8px;
	}

	.bubble :global(.md p:last-child) {
		margin-bottom: 0;
	}

	.bubble :global(.md code) {
		background: rgba(110, 118, 129, 0.3);
		padding: 1px 4px;
		border-radius: 4px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.8rem;
	}

	.bubble :global(.md pre) {
		background: #0d1117;
		padding: 8px 10px;
		border-radius: 6px;
		overflow-x: auto;
		margin: 6px 0;
	}

	.bubble :global(.md pre code) {
		background: none;
		padding: 0;
	}

	.typing {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.dot {
		width: 6px;
		height: 6px;
		background: #8b949e;
		border-radius: 50%;
		animation: blink 1.2s infinite;
	}

	.dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes blink {
		0%, 80%, 100% { opacity: 0.3; }
		40% { opacity: 1; }
	}

	.input-row {
		display: flex;
		gap: 8px;
		padding: 10px 12px;
		border-top: 1px solid #30363d;
		background: #161b22;
	}

	.chat-panel.light .input-row {
		background: #f6f8fa;
		border-top: 1px solid #d0d7de;
	}

	.input-row textarea {
		flex: 1;
		resize: none;
		background: #0d1117;
		border: 1px solid #30363d;
		border-radius: 8px;
		color: #f0f6fc;
		font-family: inherit;
		font-size: 0.85rem;
		padding: 8px 10px;
		outline: none;
	}

	.input-row textarea:focus {
		border-color: #58a6ff;
	}

	.chat-panel.light .input-row textarea {
		background: #ffffff;
		border: 1px solid #d0d7de;
		color: #24292f;
	}

	.send-btn {
		background: #238636;
		color: #fff;
		border: none;
		border-radius: 8px;
		padding: 0 16px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-btn:hover:not(:disabled) {
		background: #2ea043;
	}

	.stop-btn {
		background: #da3633;
		color: #fff;
		border: none;
		border-radius: 8px;
		padding: 0 16px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.stop-btn:hover {
		background: #f85149;
	}

	.bubble.streaming {
		border: 1px solid #1f6feb;
	}

	.bubble.tool {
		background: #161b22;
		border: 1px solid #30363d;
		color: #8b949e;
		max-width: 100%;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.78rem;
	}

	.chat-panel.light .bubble.tool {
		background: #f6f8fa;
		border: 1px solid #d0d7de;
		color: #656d76;
	}

	.bubble.tool .tool-name {
		display: block;
		color: #79c0ff;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.bubble.tool pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>