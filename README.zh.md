# Open Agent SDK

[![Build in Public](https://img.shields.io/badge/Build%20in%20Public-blue)](https://twitter.com/octane0411)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

Claude Agent SDK 的开源替代品 —— 轻量、可定制、无供应商锁定。

**📚 文档**
- [项目介绍](./docs/introduction.zh.md) - 了解核心概念和架构
- [API 参考](./docs/api-reference.zh.md) - 完整的 API 文档
- [English Documentation](./README.md) - English README

---

## 这是什么？

Open Agent SDK 是一个用于构建 AI Agent 的 TypeScript 框架。它提供了与 Claude Agent SDK 类似的开发体验，但完全开源透明，没有供应商锁定。

## 为什么选择它？

### 🎯 API 与 Claude Agent SDK 对齐
- **API 设计对齐** - 可直接替换大多数 Claude Agent SDK 使用场景
- **功能对齐** - 完整支持 ReAct 循环、工具、会话、权限和 Hooks 等核心功能
- **熟悉的开发体验** - 相同的概念、相似的模式、学习成本低

### 🔓 开源透明
- **完整源码访问** - 清楚了解 Agent 的工作原理
- **MIT 许可证** - 可自由用于商业项目
- **社区驱动** - 可直接贡献功能和修复

### 🔌 供应商无关
- **无供应商锁定** - 支持 OpenAI、Google Gemini 和 Anthropic
- **易于扩展** - 通过简单接口添加自定义 Provider
- **成本灵活** - 根据价格和性能在不同 Provider 间切换

### 🛠️ 高度可定制
- **自定义工具** - 通过简单 API 注册自己的工具
- **Hook 系统** - 在 9 个不同生命周期点扩展行为
- **权限控制** - 细粒度控制 Agent 的操作权限
- **无 Claude Code 依赖** - 纯 TypeScript 实现，不需要 Claude Code 进程

**核心特性：**
- **ReAct 循环** —— 观察-思考-行动的自主 Agent 循环
- **内置工具** —— 文件操作（读/写/编辑）、Shell 执行、代码搜索（Glob/Grep）、网页搜索
- **流式支持** —— 实时响应流和 Token 使用量追踪
- **多供应商** —— 支持 OpenAI、Google Gemini 和 Anthropic
- **供应商可扩展** —— 通过简单接口添加自定义 Provider
- **会话管理** —— 支持内存和文件存储的持久化对话
- **权限系统** —— 4 种权限模式（default/acceptEdits/bypassPermissions/plan）
- **Hooks 框架** —— 事件驱动的可扩展性（9 个钩子事件）
- **子 Agent 系统** —— 将任务委托给专门的 Agent
- **类型安全** —— 完整的 TypeScript 支持，严格的类型约束
- **取消支持** —— 通过 AbortController 中断长时间运行的操作

## 安装

```bash
npm install open-agent-sdk@alpha
```

或指定包管理器：

```bash
# npm
npm install open-agent-sdk@alpha

# yarn
yarn add open-agent-sdk@alpha

# pnpm
pnpm add open-agent-sdk@alpha

# bun
bun add open-agent-sdk@alpha
```

> **注意**：当前为 alpha 版本。使用 `@alpha` 标签安装最新的 alpha 版本。

**环境要求：**
- Bun >= 1.0.0（主要运行环境）
- Node.js >= 20（需安装 peer dependencies）
- TypeScript >= 5.0

## 快速开始

### 基础用法

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

### 使用 Gemini

```typescript
const result = await prompt("解释量子计算", {
  model: 'your-model',
  provider: 'google',
  apiKey: process.env.GEMINI_API_KEY,
});
```

### 基于会话的对话

```typescript
import { createSession } from 'open-agent-sdk';

const session = createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

// 发送消息
await session.send("5 + 3 等于多少？");

// 流式获取响应
for await (const message of session.stream()) {
  if (message.type === 'assistant') {
    console.log(message.content);
  }
}

// 继续对话（上下文会被保留）
await session.send("将结果乘以 2");
for await (const message of session.stream()) {
  console.log(message.content);
}

session.close();
```

### 高级选项

```typescript
const result = await prompt("分析代码库", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  systemPrompt: "你是一个代码审查助手。",
  maxTurns: 15,
  allowedTools: ['Read', 'Glob', 'Grep'],
  cwd: './src',
  env: { NODE_ENV: 'development' },
  permissionMode: 'default', // 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
});
```

### 取消操作

```typescript
const abortController = new AbortController();

// 30 秒后取消
setTimeout(() => abortController.abort(), 30000);

const result = await prompt("长时间运行的分析...", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  abortController,
});
```

## API 参考

### `prompt(prompt, options)`

使用 ReAct 循环执行单个提示。

**参数：**
- `prompt` (`string`): 用户的问题或任务
- `options` (`PromptOptions`): 配置对象
  - `model` (`string`, **必需**): 模型标识符
  - `apiKey` (`string`): API 密钥（默认从环境变量读取）
  - `provider` (`'openai' | 'google' | 'anthropic'`): 供应商（未指定时自动检测）
  - `baseURL` (`string`): API 基础 URL（OpenAI 兼容）
  - `maxTurns` (`number`): 最大对话轮数（默认：10）
  - `allowedTools` (`string[]`): 允许使用的工具白名单
  - `systemPrompt` (`string`): 系统提示词
  - `cwd` (`string`): 工作目录（默认：`process.cwd()`）
  - `env` (`Record<string, string>`): 环境变量
  - `abortController` (`AbortController`): 取消支持
  - `permissionMode` (`PermissionMode`): 权限模式
  - `hooks` (`HooksConfig`): 事件钩子配置

**返回：** `Promise<PromptResult>`
- `result` (`string`): 最终结果文本
- `duration_ms` (`number`): 执行时间（毫秒）
- `usage` (`object`): Token 使用统计

### `createSession(options)` / `resumeSession(id, options)`

创建或恢复持久化对话会话。

**方法：**
- `send(message: string): Promise<void>`
- `stream(): AsyncGenerator<SDKMessage>`
- `close(): void`

## 内置工具

| 工具 | 描述 | 参数 |
|------|------|------|
| `Read` | 读取文件内容，支持图片 | `file_path`, `offset?`, `limit?` |
| `Write` | 写入内容到文件 | `file_path`, `content` |
| `Edit` | 使用查找替换编辑文件 | `file_path`, `old_string`, `new_string` |
| `Bash` | 执行 Shell 命令 | `command`, `timeout?`, `run_in_background?` |
| `Glob` | 查找匹配模式的文件 | `pattern`, `path?` |
| `Grep` | 使用正则搜索代码 | `pattern`, `path?`, `output_mode?` |
| `WebSearch` | 网页搜索 | `query`, `numResults?` |
| `WebFetch` | 获取网页内容 | `url`, `prompt?` |
| `Task` | 委托给子 Agent（包含任务管理） | `description`, `prompt`, `subagent_type` |

## 供应商支持

| 供应商 | 状态 |
|--------|------|
| OpenAI | ✅ 已支持 |
| Google Gemini | ✅ 已支持 |
| Anthropic | ✅ 已支持 |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Open Agent SDK                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   prompt()   │  │   Session    │  │  ReActLoop       │  │
│  │  (单次)      │  │ (持久化)     │  │ (推理 + 行动)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         └─────────────────┴───────────────────┘            │
│                           │                                │
│         ┌─────────────────┼─────────────────┐              │
│         ▼                 ▼                 ▼              │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────┐     │
│  │  Provider  │   │ ToolRegistry │   │  Permission  │     │
│  │(OpenAI/    │   │(Read/Write/  │   │   Manager    │     │
│  │ Google)    │   │ Bash/Web...) │   │(4 种模式)    │     │
│  └────────────┘   └──────────────┘   └──────────────┘     │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────┐                         │
│                    │HookManager  │                         │
│                    │(9 个事件)   │                         │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## 项目状态

**当前版本：** v0.1.0-alpha.0

本项目正在公开开发中。关注我们的进展：

- Twitter: [@octane0411](https://twitter.com/octane0411)
- 讨论区: [GitHub Discussions](../../discussions)

### 路线图

| 版本 | 特性 | 状态 |
|---------|----------|--------|
| v0.1.0-alpha | 核心 ReAct 循环、17 个工具、3 个供应商、Session、Hooks、权限系统 | ✅ 已发布 |
| v0.1.0-beta | 结构化输出、文件检查点、会话分叉增强 | 🚧 开发中 |
| v0.1.0 | 稳定版本 | 📋 计划中 |
| v0.2.0 | 浏览器自动化、Skill 系统、Query 类 | 📋 计划中 |
| v1.0.0 | 完整的 Claude Agent SDK 兼容、Python SDK | 📋 计划中 |

### 性能对比

我们正在准备全面的性能对比测试，对比 Open Agent SDK 与 Claude Agent SDK 在各种真实场景下的表现：

- **代码理解** - 分析和解释复杂代码库
- **文件操作** - 高效读取、写入和编辑文件
- **任务完成** - 多步骤任务执行和推理
- **工具使用** - 内置工具的使用效率
- **性能指标** - 响应时间、Token 使用量和准确性

**状态**：📋 即将发布

结果将发布在 [`docs/benchmarks/`](./docs/benchmarks/) 目录中，包含完整的方法论和可复现的测试用例。

## 开发

```bash
# 克隆仓库
git clone https://github.com/Octane0411/open-agent-sdk.git
cd open-agent-sdk

# 安装依赖
bun install

# 运行测试
bun test

# 覆盖率测试
bun test --coverage

# 类型检查
cd packages/core && npx tsc --noEmit

# 运行演示
GEMINI_API_KEY=your-key bun examples/demo.ts
```

## 为什么构建这个项目？

Claude Agent SDK 非常优秀，但是闭源的。我们想要：

1. **完全透明** —— 代码开源，可自由定制
2. **供应商独立** —— 不被单一供应商锁定
3. **轻量核心** —— 专注、易理解的架构
4. **面试友好** —— 每个设计决策都可解释

## 贡献

欢迎贡献。请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

[MIT](./LICENSE) © 2026 Octane0411
