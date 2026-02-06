# 贡献指南

感谢你对 Open Agent SDK 的兴趣！本文档将帮助你了解如何参与项目贡献。

[English Version](./CONTRIBUTING.md)

## 开发环境

- **运行环境**: Bun >= 1.0.0
- **语言**: TypeScript 5.x

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/Octane0411/open-agent-sdk.git
cd open-agent-sdk

# 安装依赖
bun install

# 运行测试
bun test

# 运行特定测试
bun test tests/agent/react-loop.test.ts

# 覆盖率测试
bun test --coverage
```

## 项目结构

```
packages/core/
├── src/
│   ├── index.ts      # 公共 API 导出
│   ├── types/        # 类型定义
│   ├── tools/        # 工具实现
│   ├── providers/    # AI 供应商实现
│   ├── agent/        # ReAct 循环、子 Agent
│   ├── session/      # 会话管理
│   ├── permissions/  # 权限系统
│   └── hooks/        # Hooks 框架
└── tests/            # 测试文件
```

## 提交规范

- 使用清晰的提交信息
- 一个 PR 专注于一个功能或修复
- 确保测试通过后再提交
- 测试文件放在 `tests/` 目录下

## 报告问题

如发现 bug 或有功能建议，请在 GitHub Issues 中提交，并尽可能提供：
- 问题描述
- 复现步骤
- 期望行为
- 运行环境信息

## 许可证

通过提交代码，你同意将你的贡献在 MIT 许可证下发布。
