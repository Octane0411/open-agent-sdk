# Open Agent SDK - API 参考

---

## 目录

- [核心 API](#核心-api)
  - [prompt()](#prompt)
  - [PromptOptions](#promptoptions)
  - [PromptResult](#promptresult)
- [会话 API](#会话-api)
  - [createSession()](#createsession)
  - [resumeSession()](#resumesession)
  - [forkSession()](#forksession)
  - [Session](#session)
- [存储](#存储)
  - [InMemoryStorage](#inmemorystorage)
  - [FileStorage](#filestorage)
- [Provider](#provider)
  - [LLMProvider](#llmprovider)
  - [OpenAIProvider](#openaiprovider)
  - [GoogleProvider](#googleprovider)
  - [AnthropicProvider](#anthropicprovider)
- [工具](#工具)
  - [内置工具](#内置工具)
  - [ToolRegistry](#toolregistry)
  - [自定义工具](#自定义工具)
- [权限](#权限)
  - [PermissionManager](#permissionmanager)
  - [权限模式](#权限模式)
- [Hooks](#hooks)
  - [Hook 事件](#hook-事件)
  - [HookManager](#hookmanager)
- [类型](#类型)
  - [消息类型](#消息类型)
  - [工具类型](#工具类型)

---

## 核心 API

### `prompt()`

使用 ReAct 循环执行单个提示。

#### 签名

```typescript
function prompt(
  prompt: string,
  options: PromptOptions
): Promise<PromptResult>
```

#### 参数

- **`prompt`** (`string`) - 用户的问题或任务
- **`options`** ([`PromptOptions`](#promptoptions)) - 配置选项

#### 返回值

`Promise<PromptResult>` - 包含完成文本、耗时和 Token 使用量的结果

#### 示例

```typescript
import { prompt } from 'open-agent-sdk';

const result = await prompt("当前目录有哪些文件？", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

console.log(result.result);
console.log(`耗时: ${result.duration_ms}ms`);
console.log(`Token: ${result.usage.input_tokens} 输入 / ${result.usage.output_tokens} 输出`);
```

---

### `PromptOptions`

`prompt()` 函数的配置选项。

#### 属性

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `model` | `string` | ✅ | 模型标识符（如 'gpt-4'、'gemini-2.0-flash'、'claude-3-5-sonnet'） |
| `apiKey` | `string` | | API 密钥。默认根据 Provider 从环境变量读取 |
| `provider` | `'openai' \| 'google' \| 'anthropic'` | | 使用的 Provider。未指定时从模型名自动检测 |
| `baseURL` | `string` | | API 基础 URL（仅 OpenAI） |
| `maxTurns` | `number` | | 最大对话轮数。默认：`10` |
| `allowedTools` | `string[]` | | 允许使用的工具白名单。默认：所有工具 |
| `systemPrompt` | `string` | | Agent 的系统提示词 |
| `cwd` | `string` | | 工作目录。默认：`process.cwd()` |
| `env` | `Record<string, string>` | | 环境变量 |
| `abortController` | `AbortController` | | 取消支持 |
| `permissionMode` | [`PermissionMode`](#权限模式) | | 权限模式。默认：`'default'` |
| `allowDangerouslySkipPermissions` | `boolean` | | 使用 `bypassPermissions` 模式时必须为 `true` |
| `mcpServers` | `McpServersConfig` | | MCP 服务器配置 |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | | 日志级别。默认：`'info'` |
| `canUseTool` | `CanUseTool` | | 工具权限检查的自定义回调 |
| `storage` | [`SessionStorage`](#存储) | | 会话持久化存储 |
| `resume` | `string` | | 要恢复的会话 ID |
| `forkSession` | `boolean` | | 分叉会话而不是恢复 |

#### 示例

```typescript
const result = await prompt("分析代码库", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  systemPrompt: "你是一个代码审查助手。",
  maxTurns: 15,
  allowedTools: ['Read', 'Glob', 'Grep'],
  cwd: './src',
  env: { NODE_ENV: 'development' },
  permissionMode: 'default',
});
```

---

### `PromptResult`

`prompt()` 函数返回的结果。

#### 属性

| 属性 | 类型 | 描述 |
|------|------|------|
| `result` | `string` | Agent 的最终结果文本 |
| `duration_ms` | `number` | 总执行时间（毫秒） |
| `usage` | `{ input_tokens: number, output_tokens: number }` | Token 使用统计 |
| `session_id` | `string \| undefined` | 会话 ID（如果提供了 storage） |

---

## 会话 API

### `createSession()`

创建新的持久化对话会话。

#### 签名

```typescript
function createSession(
  options: CreateSessionOptions
): Promise<Session>
```

#### 参数

- **`options`** ([`CreateSessionOptions`](#createsessionoptions)) - 会话配置

#### 返回值

`Promise<Session>` - 新的会话实例

#### 示例

```typescript
import { createSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage({ directory: './.sessions' });
const session = await createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  storage,
});

await session.send("你好！");
for await (const message of session.stream()) {
  if (message.type === 'assistant') {
    console.log(message.content);
  }
}

session.close();
```

---

### `resumeSession()`

从存储中恢复现有会话。

#### 签名

```typescript
function resumeSession(
  sessionId: string,
  options: ResumeSessionOptions
): Promise<Session>
```

#### 参数

- **`sessionId`** (`string`) - 要恢复的会话 ID
- **`options`** ([`ResumeSessionOptions`](#resumesessionoptions)) - 恢复配置

#### 返回值

`Promise<Session>` - 恢复的会话实例

#### 示例

```typescript
import { resumeSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage();
const session = await resumeSession('session-123', {
  storage,
  apiKey: process.env.OPENAI_API_KEY,
});

await session.send("从我们上次的地方继续");
for await (const message of session.stream()) {
  console.log(message);
}
```

---

### `forkSession()`

通过分叉现有会话创建新会话（复制对话历史）。

#### 签名

```typescript
function forkSession(
  sessionId: string,
  options: ForkSessionOptions
): Promise<Session>
```

#### 参数

- **`sessionId`** (`string`) - 要分叉的源会话 ID
- **`options`** ([`ForkSessionOptions`](#forksessionoptions)) - 分叉配置

#### 返回值

`Promise<Session>` - 新的分叉会话实例

#### 示例

```typescript
import { forkSession, FileStorage } from 'open-agent-sdk';

const storage = new FileStorage();
const forkedSession = await forkSession('session-123', {
  storage,
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

// 分叉的会话有相同的历史但是独立的
await forkedSession.send("尝试不同的方法");
```

---

### `Session`

持久化对话的会话实例。

#### 方法

##### `send(message: string): Promise<void>`

向 Agent 发送消息。

```typescript
await session.send("5 + 3 等于多少？");
```

##### `stream(): AsyncGenerator<SDKMessage>`

从 Agent 流式接收响应消息。

```typescript
for await (const message of session.stream()) {
  if (message.type === 'assistant') {
    console.log(message.content);
  }
}
```

##### `getMessages(): SDKMessage[]`

获取会话历史中的所有消息。

```typescript
const messages = session.getMessages();
console.log(`总消息数: ${messages.length}`);
```

##### `close(): void`

关闭会话并清理资源。

```typescript
session.close();
```

#### 属性

| 属性 | 类型 | 描述 |
|------|------|------|
| `id` | `string` | 会话 ID |
| `state` | `SessionState` | 当前状态：`'idle' \| 'ready' \| 'streaming' \| 'closed'` |

---

## 存储

### `InMemoryStorage`

内存会话存储（默认）。

#### 构造函数

```typescript
new InMemoryStorage()
```

#### 示例

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

基于文件的会话存储，用于持久化。

#### 构造函数

```typescript
new FileStorage(options?: FileStorageOptions)
```

#### 选项

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `directory` | `string` | `'./.sessions'` | 会话文件目录 |

#### 示例

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

## Provider

### `LLMProvider`

LLM Provider 的基类。扩展此类以创建自定义 Provider。

#### 抽象方法

```typescript
abstract chat(options: ChatOptions): AsyncGenerator<LLMChunk>
```

#### 示例：自定义 Provider

```typescript
import { LLMProvider, type LLMChunk, type ChatOptions } from 'open-agent-sdk';

class MyCustomProvider extends LLMProvider {
  async *chat(options: ChatOptions): AsyncGenerator<LLMChunk> {
    // 你的实现
    yield {
      type: 'text',
      text: 'Hello from custom provider',
    };
  }
}
```

---

### `OpenAIProvider`

OpenAI API Provider。

#### 构造函数

```typescript
new OpenAIProvider(config: OpenAIConfig)
```

#### 配置

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `apiKey` | `string` | ✅ | OpenAI API 密钥 |
| `model` | `string` | ✅ | 模型标识符 |
| `baseURL` | `string` | | OpenAI 兼容 API 的基础 URL |

#### 示例

```typescript
import { OpenAIProvider } from 'open-agent-sdk';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'your-model',
});
```

---

### `GoogleProvider`

Google Gemini API Provider。

#### 构造函数

```typescript
new GoogleProvider(config: GoogleConfig)
```

#### 配置

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `apiKey` | `string` | ✅ | Google API 密钥 |
| `model` | `string` | ✅ | 模型标识符 |

#### 示例

```typescript
import { GoogleProvider } from 'open-agent-sdk';

const provider = new GoogleProvider({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'your-model',
});
```

---

### `AnthropicProvider`

Anthropic Claude API Provider。

#### 构造函数

```typescript
new AnthropicProvider(config: AnthropicConfig)
```

#### 配置

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `apiKey` | `string` | ✅ | Anthropic API 密钥 |
| `model` | `string` | ✅ | 模型标识符 |

#### 示例

```typescript
import { AnthropicProvider } from 'open-agent-sdk';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'your-model',
});
```

---

## 工具

### 内置工具

SDK 提供 17 个内置工具：

#### 文件操作

| 工具 | 描述 | 输入 |
|------|------|------|
| **Read** | 读取文件内容（支持图片） | `file_path`, `offset?`, `limit?` |
| **Write** | 写入内容到文件 | `file_path`, `content` |
| **Edit** | 使用查找替换编辑文件 | `file_path`, `old_string`, `new_string`, `replace_all?` |

#### Shell 执行

| 工具 | 描述 | 输入 |
|------|------|------|
| **Bash** | 执行 Shell 命令 | `command`, `timeout?`, `run_in_background?` |
| **BashOutput** | 获取后台进程输出 | `process_id` |
| **KillBash** | 终止后台进程 | `process_id` |

#### 代码搜索

| 工具 | 描述 | 输入 |
|------|------|------|
| **Glob** | 查找匹配模式的文件 | `pattern`, `path?` |
| **Grep** | 使用正则搜索代码 | `pattern`, `path?`, `output_mode?`, `case_insensitive?` |

#### 网页访问

| 工具 | 描述 | 输入 |
|------|------|------|
| **WebSearch** | 网页搜索 | `query`, `numResults?` |
| **WebFetch** | 获取网页内容 | `url`, `prompt?` |

#### 任务管理

| 工具 | 描述 | 输入 |
|------|------|------|
| **Task** | 委托给子 Agent | `description`, `prompt`, `subagent_type` |
| **TaskList** | 列出所有任务 | - |
| **TaskCreate** | 创建新任务 | `description`, `prompt`, `subagent_type` |
| **TaskGet** | 获取任务详情 | `task_id` |
| **TaskUpdate** | 更新任务状态 | `task_id`, `status` |

#### 交互

| 工具 | 描述 | 输入 |
|------|------|------|
| **AskUserQuestion** | 询问用户问题 | `questions`（问题对象数组） |

---

### `ToolRegistry`

管理工具注册和查找。

#### 方法

##### `register(tool: Tool): void`

注册新工具。

```typescript
registry.register(myCustomTool);
```

##### `get(name: string): Tool | undefined`

通过名称获取工具。

```typescript
const readTool = registry.get('Read');
```

##### `list(): Tool[]`

列出所有注册的工具。

```typescript
const tools = registry.list();
```

##### `getDefinitions(): ToolDefinition[]`

获取 LLM 的工具定义。

```typescript
const definitions = registry.getDefinitions();
```

---

### 自定义工具

通过实现 `Tool` 接口创建自定义工具。

#### 示例

```typescript
import { Tool, ToolContext, ToolInput, ToolOutput } from 'open-agent-sdk';

const myTool: Tool = {
  name: 'MyTool',
  description: '做一些有用的事情',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: '输入参数' },
    },
    required: ['input'],
  },
  handler: async (input: ToolInput, context: ToolContext): Promise<ToolOutput> => {
    // 工具逻辑
    return {
      type: 'text',
      text: `已处理: ${input.input}`,
    };
  },
};

// 注册到 registry
import { createDefaultRegistry } from 'open-agent-sdk';
const registry = createDefaultRegistry();
registry.register(myTool);
```

---

## 权限

### `PermissionManager`

管理工具执行权限。

#### 构造函数

```typescript
new PermissionManager(mode: PermissionMode)
```

#### 方法

##### `checkPermission(toolName: string): Promise<PermissionResult>`

检查是否允许执行工具。

```typescript
const result = await permissionManager.checkPermission('Write');
if (result.allowed) {
  // 执行工具
}
```

---

### 权限模式

| 模式 | 描述 |
|------|------|
| `default` | 破坏性操作（编辑/写入/bash）前询问用户 |
| `acceptEdits` | 自动批准编辑，写入/bash 需要询问 |
| `bypassPermissions` | 自动批准所有操作（需要 `allowDangerouslySkipPermissions: true`） |
| `plan` | 生成执行计划但不运行 |

#### 示例

```typescript
const result = await prompt("编辑配置文件", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  permissionMode: 'acceptEdits', // 自动批准编辑
});
```

---

## Hooks

### Hook 事件

SDK 提供 9 个 Hook 事件用于扩展 Agent 行为：

| 事件 | 描述 | 时机 |
|------|------|------|
| `onTurnStart` | 回合开始 | 每个对话回合之前 |
| `onTurnEnd` | 回合结束 | 每个对话回合之后 |
| `onToolExecute` | 工具即将执行 | 工具执行之前 |
| `onToolResult` | 工具执行完成 | 工具执行之后 |
| `onPermissionRequest` | 权限请求 | 工具需要权限时 |
| `onPermissionDecision` | 权限决定 | 权限决定之后 |
| `onStreamChunk` | 流块接收 | 流式传输期间 |
| `onStreamComplete` | 流完成 | 流式传输完成后 |
| `onError` | 发生错误 | 错误发生时 |

#### 示例

```typescript
const session = await createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  hooks: {
    onTurnStart: async ({ turnNumber }) => {
      console.log(`回合 ${turnNumber} 开始...`);
    },
    onToolExecute: async ({ tool, input }) => {
      console.log(`执行 ${tool.name}，参数:`, input);
    },
    onToolResult: async ({ tool, output }) => {
      console.log(`${tool.name} 结果:`, output);
    },
    onError: async ({ error }) => {
      console.error('错误:', error);
    },
  },
});
```

---

### `HookManager`

管理 Hook 注册和执行。

#### 方法

##### `on(event: HookEvent, callback: HookCallback): void`

注册 Hook 回调。

```typescript
hookManager.on('onToolExecute', async (input) => {
  console.log(`工具: ${input.tool.name}`);
});
```

##### `emit(event: HookEvent, input: HookInput): Promise<void>`

触发 Hook 事件。

```typescript
await hookManager.emit('onTurnStart', { turnNumber: 1 });
```

---

## 类型

### 消息类型

#### `SDKMessage`

基础消息类型（所有消息类型的联合）。

#### `SDKUserMessage`

用户消息。

```typescript
{
  type: 'user',
  content: string | Array<{ type: 'text' | 'image', ... }>,
}
```

#### `SDKAssistantMessage`

助手消息。

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

工具结果消息。

```typescript
{
  type: 'tool_result',
  tool_name: string,
  tool_call_id: string,
  result: ToolOutput,
}
```

---

### 工具类型

#### `Tool`

工具接口。

```typescript
{
  name: string,
  description: string,
  parameters: JSONSchema,
  handler: ToolHandler,
}
```

#### `ToolContext`

工具执行上下文。

```typescript
{
  cwd: string,
  env: Record<string, string>,
  abortSignal?: AbortSignal,
}
```

#### `ToolOutput`

工具执行输出。

```typescript
{
  type: 'text' | 'image',
  text?: string,
  image_url?: string,
  error?: string,
}
```

---

## 环境变量

| 变量 | 描述 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `GEMINI_API_KEY` | Google Gemini API 密钥 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |
| `OPEN_AGENT_SDK_LOG_LEVEL` | 日志级别：`debug`、`info`、`warn`、`error`、`silent` |

---

## 错误处理

### 常见错误

#### `SessionError`

会话相关问题的基础错误。

#### `SessionNotIdleError`

尝试在非空闲状态发送消息时抛出。

#### `SessionAlreadyStreamingError`

尝试在已经流式传输时再次流式传输时抛出。

#### `SessionClosedError`

在关闭的会话上操作时抛出。

#### 示例

```typescript
try {
  await session.send("你好");
  for await (const msg of session.stream()) {
    console.log(msg);
  }
} catch (error) {
  if (error instanceof SessionNotIdleError) {
    console.error('会话不是空闲状态');
  } else if (error instanceof SessionClosedError) {
    console.error('会话已关闭');
  } else {
    throw error;
  }
}
```

---

## 许可证

MIT License © 2026 Octane0411
