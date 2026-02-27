# Open Agent SDK - API Reference

---

## Table of Contents

- [Core API](#core-api)
  - [prompt()](#prompt)
  - [PromptOptions](#promptoptions)
  - [PromptResult](#promptresult)
- [Session API](#session-api)
  - [createSession()](#createsession)
  - [resumeSession()](#resumesession)
  - [forkSession()](#forksession)
  - [Session](#session)
- [Storage](#storage)
  - [InMemoryStorage](#inmemorystorage)
  - [FileStorage](#filestorage)
- [Providers](#providers)
  - [LLMProvider](#llmprovider)
  - [OpenAIProvider](#openaiprovider)
  - [GoogleProvider](#googleprovider)
  - [AnthropicProvider](#anthropicprovider)
- [Tools](#tools)
  - [Built-in Tools](#built-in-tools)
  - [ToolRegistry](#toolregistry)
  - [Custom Tools](#custom-tools)
- [Permissions](#permissions)
  - [PermissionManager](#permissionmanager)
  - [Permission Modes](#permission-modes)
- [Hooks](#hooks)
  - [Hook Events](#hook-events)
  - [HookManager](#hookmanager)
- [Types](#types)
  - [Message Types](#message-types)
  - [Tool Types](#tool-types)

---

## Core API

### `prompt()`

Execute a single prompt with the agent using the ReAct loop.

#### Signature

```typescript
function prompt(
  prompt: string,
  options: PromptOptions
): Promise<PromptResult>
```

#### Parameters

- **`prompt`** (`string`) - User's question or task
- **`options`** ([`PromptOptions`](#promptoptions)) - Configuration options

#### Returns

`Promise<PromptResult>` - Result with completion text, duration, and token usage

#### Example

```typescript
import { prompt } from 'open-agent-sdk';

const result = await prompt("What files are in the current directory?", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

console.log(result.result);
console.log(`Duration: ${result.duration_ms}ms`);
console.log(`Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);
```

---

### `PromptOptions`

Configuration options for `prompt()` function.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `model` | `string` | ✅ | Model identifier (e.g., 'gpt-4', 'gemini-2.0-flash', 'claude-3-5-sonnet') |
| `apiKey` | `string` | | API key. Defaults to env var based on provider |
| `provider` | `'openai' \| 'google' \| 'anthropic'` | | Provider to use. Auto-detected from model name if not specified |
| `baseURL` | `string` | | Base URL for API (OpenAI only) |
| `maxTurns` | `number` | | Maximum conversation turns. Default: `10` |
| `allowedTools` | `string[]` | | Allowed tools whitelist. Default: all tools |
| `systemPrompt` | `string` | | System prompt for the agent |
| `cwd` | `string` | | Working directory. Default: `process.cwd()` |
| `env` | `Record<string, string>` | | Environment variables |
| `abortController` | `AbortController` | | Cancellation support |
| `permissionMode` | [`PermissionMode`](#permission-modes) | | Permission mode. Default: `'default'` |
| `allowDangerouslySkipPermissions` | `boolean` | | Required `true` when using `bypassPermissions` mode |
| `mcpServers` | `McpServersConfig` | | MCP servers configuration |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | | Log level. Default: `'info'` |
| `canUseTool` | `CanUseTool` | | Custom callback for tool permission checks |
| `storage` | [`SessionStorage`](#storage) | | Storage for session persistence |
| `resume` | `string` | | Session ID to resume |
| `forkSession` | `boolean` | | Fork session instead of resuming |

#### Example

```typescript
const result = await prompt("Analyze the codebase", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  systemPrompt: "You are a code review assistant.",
  maxTurns: 15,
  allowedTools: ['Read', 'Glob', 'Grep'],
  cwd: './src',
  env: { NODE_ENV: 'development' },
  permissionMode: 'default',
});
```

---

### `PromptResult`

Result returned from `prompt()` function.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `result` | `string` | Final result text from the agent |
| `duration_ms` | `number` | Total execution time in milliseconds |
| `usage` | `{ input_tokens: number, output_tokens: number }` | Token usage statistics |
| `session_id` | `string \| undefined` | Session ID (if storage was provided) |

---

## Session API

### `createSession()`

Create a new persistent conversation session.

#### Signature

```typescript
function createSession(
  options: CreateSessionOptions
): Promise<Session>
```

#### Parameters

- **`options`** ([`CreateSessionOptions`](#createsessionoptions)) - Session configuration

#### Returns

`Promise<Session>` - New session instance

#### Example

```typescript
import { createSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage({ directory: './.sessions' });
const session = await createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  storage,
});

await session.send("Hello!");
for await (const message of session.stream()) {
  if (message.type === 'assistant') {
    console.log(message.content);
  }
}

session.close();
```

---

### `resumeSession()`

Resume an existing session from storage.

#### Signature

```typescript
function resumeSession(
  sessionId: string,
  options: ResumeSessionOptions
): Promise<Session>
```

#### Parameters

- **`sessionId`** (`string`) - Session ID to resume
- **`options`** ([`ResumeSessionOptions`](#resumesessionoptions)) - Resume configuration

#### Returns

`Promise<Session>` - Resumed session instance

#### Example

```typescript
import { resumeSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage();
const session = await resumeSession('session-123', {
  storage,
  apiKey: process.env.OPENAI_API_KEY,
});

await session.send("Continue from where we left off");
for await (const message of session.stream()) {
  console.log(message);
}
```

---

### `forkSession()`

Create a new session by forking an existing one (copies conversation history).

#### Signature

```typescript
function forkSession(
  sessionId: string,
  options: ForkSessionOptions
): Promise<Session>
```

#### Parameters

- **`sessionId`** (`string`) - Source session ID to fork
- **`options`** ([`ForkSessionOptions`](#forksessionoptions)) - Fork configuration

#### Returns

`Promise<Session>` - New forked session instance

#### Example

```typescript
import { forkSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage();
const forkedSession = await forkSession('session-123', {
  storage,
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

// Forked session has the same history but is independent
await forkedSession.send("Try a different approach");
```

---

### `Session`

Session instance for persistent conversations.

#### Methods

##### `send(message: string): Promise<void>`

Send a message to the agent.

```typescript
await session.send("What is 5 + 3?");
```

##### `stream(): AsyncGenerator<SDKMessage>`

Stream response messages from the agent.

```typescript
for await (const message of session.stream()) {
  if (message.type === 'assistant') {
    console.log(message.content);
  }
}
```

##### `getMessages(): SDKMessage[]`

Get all messages in the session history.

```typescript
const messages = session.getMessages();
console.log(`Total messages: ${messages.length}`);
```

##### `close(): void`

Close the session and cleanup resources.

```typescript
session.close();
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Session ID |
| `state` | `SessionState` | Current state: `'idle' \| 'ready' \| 'streaming' \| 'closed'` |

---

## Storage

### `InMemoryStorage`

In-memory session storage (default).

#### Constructor

```typescript
new InMemoryStorage()
```

#### Example

```typescript
import { createSession, InMemoryStorage } from 'open-agent-sdk';

const storage = new InMemoryStorage();
const session = await createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  storage,
});
```

---

### `FileStorage`

File-based session storage for persistence.

#### Constructor

```typescript
new FileStorage(options?: FileStorageOptions)
```

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `directory` | `string` | `'./.sessions'` | Directory for session files |

#### Example

```typescript
import { createSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage({ directory: './my-sessions' });
const session = await createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  storage,
});
```

---

## Providers

### `LLMProvider`

Base class for LLM providers. Extend this to create custom providers.

#### Abstract Methods

```typescript
abstract chat(options: ChatOptions): AsyncGenerator<LLMChunk>
```

#### Example: Custom Provider

```typescript
import { LLMProvider, type LLMChunk, type ChatOptions } from 'open-agent-sdk';

class MyCustomProvider extends LLMProvider {
  async *chat(options: ChatOptions): AsyncGenerator<LLMChunk> {
    // Your implementation here
    yield {
      type: 'text',
      text: 'Hello from custom provider',
    };
  }
}
```

---

### `OpenAIProvider`

OpenAI API provider.

#### Constructor

```typescript
new OpenAIProvider(config: OpenAIConfig)
```

#### Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | ✅ | OpenAI API key |
| `model` | `string` | ✅ | Model identifier |
| `baseURL` | `string` | | Base URL for OpenAI-compatible APIs |

#### Example

```typescript
import { OpenAIProvider } from 'open-agent-sdk';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'your-model',
});
```

---

### `GoogleProvider`

Google Gemini API provider.

#### Constructor

```typescript
new GoogleProvider(config: GoogleConfig)
```

#### Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | ✅ | Google API key |
| `model` | `string` | ✅ | Model identifier |

#### Example

```typescript
import { GoogleProvider } from 'open-agent-sdk';

const provider = new GoogleProvider({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'your-model',
});
```

---

### `AnthropicProvider`

Anthropic Claude API provider.

#### Constructor

```typescript
new AnthropicProvider(config: AnthropicConfig)
```

#### Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | ✅ | Anthropic API key |
| `model` | `string` | ✅ | Model identifier |

#### Example

```typescript
import { AnthropicProvider } from 'open-agent-sdk';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'your-model',
});
```

---

## Tools

### Built-in Tools

The SDK provides 17 built-in tools:

#### File Operations

| Tool | Description | Inputs |
|------|-------------|--------|
| **Read** | Read file contents (supports images) | `file_path`, `offset?`, `limit?` |
| **Write** | Write content to a file | `file_path`, `content` |
| **Edit** | Edit file with search/replace | `file_path`, `old_string`, `new_string`, `replace_all?` |

#### Shell Execution

| Tool | Description | Inputs |
|------|-------------|--------|
| **Bash** | Execute shell commands | `command`, `timeout?`, `run_in_background?` |
| **BashOutput** | Get output from background process | `process_id` |
| **KillBash** | Kill a background process | `process_id` |

#### Code Search

| Tool | Description | Inputs |
|------|-------------|--------|
| **Glob** | Find files matching patterns | `pattern`, `path?` |
| **Grep** | Search code with regex | `pattern`, `path?`, `output_mode?`, `case_insensitive?` |

#### Web Access

| Tool | Description | Inputs |
|------|-------------|--------|
| **WebSearch** | Search the web | `query`, `numResults?` |
| **WebFetch** | Fetch webpage content | `url`, `prompt?` |

#### Task Management

| Tool | Description | Inputs |
|------|-------------|--------|
| **Task** | Delegate to subagent | `description`, `prompt`, `subagent_type` |
| **TaskList** | List all tasks | - |
| **TaskCreate** | Create a new task | `description`, `prompt`, `subagent_type` |
| **TaskGet** | Get task details | `task_id` |
| **TaskUpdate** | Update task status | `task_id`, `status` |

#### Interaction

| Tool | Description | Inputs |
|------|-------------|--------|
| **AskUserQuestion** | Ask user questions | `questions` (array of question objects) |

---

### `ToolRegistry`

Manages tool registration and lookup.

#### Methods

##### `register(tool: Tool): void`

Register a new tool.

```typescript
registry.register(myCustomTool);
```

##### `get(name: string): Tool | undefined`

Get a tool by name.

```typescript
const readTool = registry.get('Read');
```

##### `list(): Tool[]`

List all registered tools.

```typescript
const tools = registry.list();
```

##### `getDefinitions(): ToolDefinition[]`

Get tool definitions for LLM.

```typescript
const definitions = registry.getDefinitions();
```

---

### Custom Tools

Create custom tools by implementing the `Tool` interface.

#### Example

```typescript
import { Tool, ToolContext, ToolInput, ToolOutput } from 'open-agent-sdk';

const myTool: Tool = {
  name: 'MyTool',
  description: 'Does something useful',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input parameter' },
    },
    required: ['input'],
  },
  handler: async (input: ToolInput, context: ToolContext): Promise<ToolOutput> => {
    // Tool logic here
    return {
      type: 'text',
      text: `Processed: ${input.input}`,
    };
  },
};

// Register with registry
import { createDefaultRegistry } from 'open-agent-sdk';
const registry = createDefaultRegistry();
registry.register(myTool);
```

---

## Permissions

### `PermissionManager`

Manages tool execution permissions.

#### Constructor

```typescript
new PermissionManager(mode: PermissionMode)
```

#### Methods

##### `checkPermission(toolName: string): Promise<PermissionResult>`

Check if tool execution is allowed.

```typescript
const result = await permissionManager.checkPermission('Write');
if (result.allowed) {
  // Execute tool
}
```

---

### Permission Modes

| Mode | Description |
|------|-------------|
| `default` | Ask user before destructive operations (edit/write/bash) |
| `acceptEdits` | Auto-approve edits, ask for write/bash |
| `bypassPermissions` | Auto-approve everything (requires `allowDangerouslySkipPermissions: true`) |
| `plan` | Generate execution plan without running |

#### Example

```typescript
const result = await prompt("Edit config file", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  permissionMode: 'acceptEdits', // Auto-approve edits
});
```

---

## Hooks

### Hook Events

The SDK provides 9 hook events for extending agent behavior:

| Event | Description | Timing |
|-------|-------------|--------|
| `onTurnStart` | Turn starts | Before each conversation turn |
| `onTurnEnd` | Turn ends | After each conversation turn |
| `onToolExecute` | Tool about to execute | Before tool execution |
| `onToolResult` | Tool execution complete | After tool execution |
| `onPermissionRequest` | Permission requested | When tool needs permission |
| `onPermissionDecision` | Permission decided | After permission decision |
| `onStreamChunk` | Stream chunk received | During streaming |
| `onStreamComplete` | Stream complete | After streaming completes |
| `onError` | Error occurred | When error happens |

#### Example

```typescript
const session = await createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  hooks: {
    onTurnStart: async ({ turnNumber }) => {
      console.log(`Turn ${turnNumber} starting...`);
    },
    onToolExecute: async ({ tool, input }) => {
      console.log(`Executing ${tool.name} with:`, input);
    },
    onToolResult: async ({ tool, output }) => {
      console.log(`${tool.name} result:`, output);
    },
    onError: async ({ error }) => {
      console.error('Error:', error);
    },
  },
});
```

---

### `HookManager`

Manages hook registration and execution.

#### Methods

##### `on(event: HookEvent, callback: HookCallback): void`

Register a hook callback.

```typescript
hookManager.on('onToolExecute', async (input) => {
  console.log(`Tool: ${input.tool.name}`);
});
```

##### `emit(event: HookEvent, input: HookInput): Promise<void>`

Emit a hook event.

```typescript
await hookManager.emit('onTurnStart', { turnNumber: 1 });
```

---

## Types

### Message Types

#### `SDKMessage`

Base message type (union of all message types).

#### `SDKUserMessage`

User message.

```typescript
{
  type: 'user',
  content: string | Array<{ type: 'text' | 'image', ... }>,
}
```

#### `SDKAssistantMessage`

Assistant message.

```typescript
{
  type: 'assistant',
  message: {
    content: string | Array<{ type: 'text', text: string }>,
    tool_calls?: ToolCall[],
  },
}
```

#### `SDKToolResultMessage`

Tool result message.

```typescript
{
  type: 'tool_result',
  tool_name: string,
  tool_call_id: string,
  result: ToolOutput,
}
```

---

### Tool Types

#### `Tool`

Tool interface.

```typescript
{
  name: string,
  description: string,
  parameters: JSONSchema,
  handler: ToolHandler,
}
```

#### `ToolContext`

Tool execution context.

```typescript
{
  cwd: string,
  env: Record<string, string>,
  abortSignal?: AbortSignal,
}
```

#### `ToolOutput`

Tool execution output.

```typescript
{
  type: 'text' | 'image',
  text?: string,
  image_url?: string,
  error?: string,
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPEN_AGENT_SDK_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error`, `silent` |

---

## Error Handling

### Common Errors

#### `SessionError`

Base error for session-related issues.

#### `SessionNotIdleError`

Thrown when trying to send while not idle.

#### `SessionAlreadyStreamingError`

Thrown when trying to stream while already streaming.

#### `SessionClosedError`

Thrown when operating on a closed session.

#### Example

```typescript
try {
  await session.send("Hello");
  for await (const msg of session.stream()) {
    console.log(msg);
  }
} catch (error) {
  if (error instanceof SessionNotIdleError) {
    console.error('Session is not idle');
  } else if (error instanceof SessionClosedError) {
    console.error('Session is closed');
  } else {
    throw error;
  }
}
```

---

## License

MIT License © 2026 Octane0411
