# Open Agent SDK - Claude Code 项目上下文

## 快速导航

| 文档 | 内容 |
|------|------|
| [架构决策记录](docs/adr/) | 技术决策背景 |
| [产品需求](REQUIREMENTS.md) | 功能需求、版本规划 |

## 项目结构

```
open-agent-sdk/
├── CLAUDE.md              # 本文件：项目上下文入口
├── package.json           # Bun workspaces 配置
├── REQUIREMENTS.md        # 产品需求文档
└── packages/
    └── core/              # 核心 SDK
        ├── src/
        │   ├── index.ts      # 公开 API
        │   ├── types/        # 消息、工具类型
        │   ├── tools/        # Read/Write/Edit/Bash
        │   ├── providers/    # OpenAI Provider
        │   └── agent/        # ReAct 循环
        └── tests/
```

## 架构决策

项目采用**内核+扩展**的分包策略。详见 [ADR 001](docs/adr/001-monorepo-structure.md)

## 技术栈

- **语言**: TypeScript 5.x (strict mode)
- **运行时**: Bun
- **测试**: Bun 内置测试框架
- **核心依赖**: `openai`, `zod`

## 常用命令

```bash
bun install          # 安装依赖
bun test             # 运行测试
bun test --coverage  # 带覆盖率
bun run build        # 构建
```

## 编码规范

- **TDD**: 先写测试，再写实现
- **覆盖率**: > 80%
- **类型**: 所有公共 API 必须完整类型
- **结构**: `types/` (类型), `tools/` (工具), `providers/` (提供商), `agent/` (核心逻辑)

## 相关文档

- [产品需求](REQUIREMENTS.md) - 完整功能需求
- [Claude Agent SDK 参考](docs/dev/claude-agent-sdk-ts.md) - 对标产品 API
- [Claude Agent SDK V2 Preview](docs/dev/claude-agent-sdk-ts-v2) - V2 接口设计参考
