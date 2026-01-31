# ADR 001: Monorepo Package Structure

## 状态
Accepted

## 背景

Open Agent SDK 需要设计包结构，平衡以下目标：
1. **易用性**: 用户安装简单，快速上手
2. **灵活性**: 按需加载，减小 bundle 体积
3. **可扩展性**: 支持未来添加更多 Provider 和工具

## 考虑的选项

### 选项 A: 单包

所有功能在一个包里。

```
@open-agent-sdk/core  # 包含所有功能
```

**优点:**
- 用户简单，一行命令安装
- 版本管理简单
- 没有依赖冲突问题

**缺点:**
- 体积大，即使用不到的功能也打包
- 无法按需加载
- Provider 更新要发整个包

### 选项 B: 细粒度多包

每个功能一个独立包。

```
@open-agent-sdk/core
@open-agent-sdk/provider-openai
@open-agent-sdk/provider-anthropic
@open-agent-sdk/tools-fs
@open-agent-sdk/tools-web
@open-agent-sdk/mcp
...
```

**优点:**
- 极致按需加载
- 各模块独立版本
- 依赖清晰

**缺点:**
- 用户需要装多个包
- 版本兼容性管理复杂
- peerDependencies 地狱

### 选项 C: 内核+扩展（推荐）

Core 包含最常用的基础功能，扩展包按需安装。

```bash
# 必须安装	npm install @open-agent-sdk/core

# 按需选择 Provider
npm install @open-agent-sdk/provider-openai
npm install @open-agent-sdk/provider-anthropic

# 按需选择扩展工具
npm install @open-agent-sdk/tools-web
npm install @open-agent-sdk/tools-advanced
```

**优点:**
- 平衡易用性和灵活性
- Core 装完就能用基础功能
- 扩展点清晰

**缺点:**
- 需要设计好扩展机制
- Core 和扩展的接口要稳定

## 决策

选择 **选项 C：内核+扩展模式**

## 包结构

### @open-agent-sdk/core

包含最常用的基础功能，用户安装后即可使用。

**内置内容:**
- ReAct 循环框架
- 消息类型系统
- 工具注册机制
- **基础工具**: Read/Write/Edit/Bash（这些太常用，内置避免重复安装）

**扩展机制:**
```typescript
// Core 提供接口
interface Tool { name: string; handler: Function; }
interface Provider { chat(messages): AsyncIterable<Chunk>; }

// 扩展包实现并注册
import { registerTool, registerProvider } from '@open-agent-sdk/core';
```

### @open-agent-sdk/provider-{name}

各 LLM 提供商实现。

```
@open-agent-sdk/provider-openai     # OpenAI/GPT
@open-agent-sdk/provider-anthropic  # Claude
@open-agent-sdk/provider-ollama     # 本地模型
```

### @open-agent-sdk/tools-{name}

扩展工具集。

```
@open-agent-sdk/tools-web        # WebSearch, WebFetch
@open-agent-sdk/tools-advanced   # Glob, Grep
```

### @open-agent-sdk/mcp

MCP 支持（stdio/sse/http）。

## 演进计划

| 版本 | Core 内容 | 扩展包 |
|------|----------|--------|
| **v0.1.0** | 单包发布，包含所有功能 | 无 |
| **v0.2.0** | 保留核心 + 基础工具 | 拆分 providers |
| **v0.3.0** | 不变 | 添加 tools-web, mcp |

### v0.1.0 策略

MVP 阶段采用**单包发布**，内部按模块组织：

```
packages/core/
├── src/
│   ├── types/      # 类型定义（独立模块）
│   ├── tools/      # 工具实现（独立模块）
│   ├── providers/  # Provider 实现（独立模块）
│   └── agent/      # ReAct 循环
```

这样：
- 用户使用简单：`npm install @open-agent-sdk/core`
- 代码结构清晰，为 v0.2.0 分包做准备
- 所有模块通过 index.ts 统一导出

## 后果

### 正面

1. **v0.1.0 简单**: 用户装一个包就能用
2. **未来可扩展**: 内部模块已隔离，拆分容易
3. **接口稳定**: Core 的扩展机制在 v0.1.0 就确定

### 负面

1. **v0.1.0 体积较大**: 包含所有功能，但这是可接受的权衡
2. **需要设计扩展机制**: Core 需要提供注册 API

## 相关决策

- [ADR 002: Provider Interface](./002-provider-interface.md)（待定）
- [ADR 003: Tool Registration](./003-tool-registration.md)（待定）

## 参考

- [Claude Agent SDK TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)
- npm workspaces 最佳实践
