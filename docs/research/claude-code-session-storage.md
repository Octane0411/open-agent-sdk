# Claude Code 会话存储机制研究

## 概述

Claude Code 采用了一套完善的会话存储系统，将会话数据按项目组织，支持实时写入、延迟索引、以及跨会话的记忆系统。本文档详细描述其存储结构、数据格式和工作机制。

---

## 目录结构

```
~/.claude/
└── projects/                          # 按项目路径组织的会话存储
    └── {encoded-project-path}/        # 项目目录（路径编码后）
        ├── {session-id}.jsonl         # 会话记录文件（JSONL 格式）
        ├── sessions-index.json        # 会话索引文件
        └── memory/                    # 项目级别的记忆系统
            ├── MEMORY.md              # 主记忆文件（前200行加载到上下文）
            ├── debugging.md           # 按主题组织的记忆
            └── patterns.md
```

### 项目路径编码规则

项目路径中的特殊字符会被编码为目录名：
- `/` → `-`
- 示例：`/Users/wangruobing/Personal/coworkProject/open-agent-sdk`
  - 编码为：`-Users-wangruobing-Personal-coworkProject-open-agent-sdk`

---

## 数据格式

### 1. sessions-index.json

会话索引文件，用于快速检索和展示会话列表。

#### 结构

```
{
  "version": 1,
  "entries": [
    {
      "sessionId": "uuid",
      "fullPath": "绝对路径",
      "fileMtime": 文件修改时间戳（毫秒）,
      "firstPrompt": "用户的第一条消息",
      "customTitle": "自定义标题（可选）",
      "summary": "会话摘要（AI 生成）",
      "messageCount": 消息总数,
      "created": "ISO 8601 时间戳",
      "modified": "ISO 8601 时间戳",
      "gitBranch": "Git 分支名",
      "projectPath": "项目绝对路径",
      "isSidechain": false
    }
  ]
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | number | 索引格式版本号 |
| `sessionId` | string | 会话唯一标识符（UUID） |
| `fullPath` | string | JSONL 文件的完整路径 |
| `fileMtime` | number | 文件最后修改时间（Unix 时间戳毫秒） |
| `firstPrompt` | string | 用户的第一条消息内容 |
| `customTitle` | string | 用户自定义的会话标题（可选） |
| `summary` | string | AI 生成的会话摘要 |
| `messageCount` | number | 会话中的消息总数 |
| `created` | string | 会话创建时间（ISO 8601） |
| `modified` | string | 会话最后修改时间（ISO 8601） |
| `gitBranch` | string | 会话所在的 Git 分支 |
| `projectPath` | string | 项目的绝对路径 |
| `isSidechain` | boolean | 是否为侧链会话（子会话） |

#### 特点

- **延迟更新**：只在会话关闭后才更新索引
- **快速检索**：包含摘要、时间戳等元信息，无需读取完整 JSONL
- **排序支持**：可按创建时间、修改时间、消息数等排序

---

### 2. {session-id}.jsonl

会话记录文件，使用 JSONL（JSON Lines）格式，每行一个 JSON 对象。

#### JSONL 格式特点

- 每行一个完整的 JSON 对象
- 支持流式追加写入
- 易于解析和增量读取
- 文件损坏时只影响部分数据

#### 消息类型统计

实际会话中的消息类型分布：

```
  83  assistant              # AI 助手的回复
  74  user                   # 用户消息（包括工具调用结果）
  12  file-history-snapshot  # 文件历史快照
   8  progress               # 进度更新
   4  system                 # 系统消息
```

#### 消息类型详解

##### A. user 消息

**用户输入消息**：

```
{
  "type": "user",
  "sessionId": "会话 ID",
  "version": "Claude Code 版本号",
  "gitBranch": "Git 分支",
  "cwd": "当前工作目录",
  "message": {
    "role": "user",
    "content": "用户输入的文本"
  },
  "uuid": "消息唯一 ID",
  "timestamp": "ISO 8601 时间戳",
  "permissionMode": "权限模式（如 bypassPermissions）",
  "parentUuid": "父消息 ID（可选）",
  "isSidechain": false,
  "userType": "external"
}
```

**工具调用结果消息**：

```
{
  "type": "user",
  "sessionId": "会话 ID",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "工具调用 ID",
        "content": "工具执行结果（JSON 字符串）",
        "is_error": false
      }
    ]
  },
  "uuid": "消息唯一 ID",
  "timestamp": "ISO 8601 时间戳",
  "toolUseResult": {
    "stdout": "标准输出",
    "stderr": "标准错误",
    "interrupted": false,
    "isImage": false,
    "noOutputExpected": false
  },
  "sourceToolAssistantUUID": "发起工具调用的助手消息 ID",
  "parentUuid": "父消息 ID"
}
```

##### B. assistant 消息

AI 助手的回复，包含文本和工具调用：

```
{
  "type": "assistant",
  "sessionId": "会话 ID",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "助手回复的文本"
      },
      {
        "type": "tool_use",
        "id": "工具调用 ID",
        "name": "工具名称",
        "input": {
          // 工具参数
        }
      }
    ]
  },
  "uuid": "消息唯一 ID",
  "timestamp": "ISO 8601 时间戳",
  "parentUuid": "父消息 ID",
  "model": "使用的模型名称",
  "stopReason": "停止原因（如 tool_use, end_turn）",
  "usage": {
    "inputTokens": 输入 token 数,
    "outputTokens": 输出 token 数
  }
}
```

##### C. system 消息

系统级别的消息，用于提示、警告等：

```
{
  "type": "system",
  "sessionId": "会话 ID",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "系统消息内容",
        "cache_control": {
          "type": "ephemeral"
        }
      }
    ]
  },
  "uuid": "消息唯一 ID",
  "timestamp": "ISO 8601 时间戳",
  "parentUuid": "父消息 ID"
}
```

##### D. progress 消息

进度更新消息，用于长时间操作的进度反馈：

```
{
  "type": "progress",
  "sessionId": "会话 ID",
  "uuid": "消息唯一 ID",
  "timestamp": "ISO 8601 时间戳",
  "progressData": {
    "message": "进度描述",
    "percentage": 进度百分比（可选）
  }
}
```

##### E. file-history-snapshot 消息

文件历史快照，记录文件编辑的版本信息：

```
{
  "type": "file-history-snapshot",
  "messageId": "消息 ID",
  "snapshot": {
    "messageId": "消息 ID",
    "trackedFileBackups": {
      "文件路径": {
        "hash": "文件内容哈希",
        "version": 版本号
      }
    },
    "timestamp": "ISO 8601 时间戳"
  },
  "isSnapshotUpdate": false
}
```

---

## 工作机制

### 1. 实时写入机制

#### 写入时机

- **用户发送消息时**：立即写入 user 消息
- **AI 回复时**：立即写入 assistant 消息
- **工具调用时**：立即写入工具调用和结果
- **系统事件时**：写入 system、progress 等消息

#### 写入流程

```
用户输入
  ↓
写入 user 消息到 JSONL
  ↓
AI 处理
  ↓
写入 assistant 消息到 JSONL
  ↓
（如有工具调用）
  ↓
写入 tool_result 消息到 JSONL
  ↓
循环直到会话结束
```

#### 特点

- **追加写入**：每条消息追加到文件末尾，不修改已有内容
- **即时持久化**：每次写入后立即刷新到磁盘，防止数据丢失
- **无锁设计**：单会话单线程写入，无需文件锁
- **崩溃恢复**：即使程序崩溃，已写入的消息也不会丢失

### 2. 索引更新机制

#### 更新时机

**仅在会话关闭时更新** `sessions-index.json`：

1. 用户主动结束会话
2. 会话超时自动关闭
3. 程序正常退出

#### 更新流程

```
会话关闭
  ↓
读取 JSONL 文件
  ↓
计算统计信息
  - messageCount（消息总数）
  - created（首条消息时间戳）
  - modified（最后一条消息时间戳）
  ↓
生成会话摘要（调用 AI）
  ↓
更新 sessions-index.json
  - 如果会话 ID 已存在，更新条目
  - 如果会话 ID 不存在，追加新条目
  ↓
写入磁盘
```

#### 摘要生成策略

- 基于 `firstPrompt`（用户第一条消息）
- 结合会话中的关键操作（如文件编辑、命令执行）
- 生成简洁的描述性标题（如 "TypeScript Bun Agent SDK V2 API Design"）

#### 特点

- **延迟更新**：避免频繁 I/O，提高性能
- **原子操作**：使用临时文件 + 重命名保证原子性
- **增量更新**：只更新变化的会话条目

### 3. 会话生命周期

#### 阶段 1：会话创建

```
用户启动 Claude Code
  ↓
检测项目路径
  ↓
生成会话 ID（UUID）
  ↓
创建 JSONL 文件：
  ~/.claude/projects/{encoded-path}/{session-id}.jsonl
```

#### 阶段 2：会话活跃

```
实时写入 JSONL
  ↓
sessions-index.json 不变（延迟更新）
```

#### 阶段 3：会话关闭

```
用户结束会话
  ↓
停止写入 JSONL
  ↓
更新 sessions-index.json
  ↓
会话归档完成
```

### 4. 项目级别记忆系统

#### memory/ 目录结构

```
~/.claude/projects/{encoded-path}/memory/
├── MEMORY.md              # 主记忆文件（前200行加载）
├── debugging.md           # 调试相关记忆
├── patterns.md            # 代码模式记忆
└── ...                    # 其他主题记忆
```

#### MEMORY.md 格式

```markdown
# Project Memory

## Key Patterns
- Pattern 1
- Pattern 2

## Important Decisions
- Decision 1
- Decision 2

## Common Issues
- Issue 1: Solution
- Issue 2: Solution

## Links
- [Debugging Notes](debugging.md)
- [Code Patterns](patterns.md)
```

#### 记忆加载机制

1. **会话启动时**：自动加载 `MEMORY.md` 的前 200 行到上下文
2. **按需加载**：通过链接引用其他主题文件
3. **增量更新**：AI 可以在会话中更新记忆文件

#### 记忆更新策略

- **稳定模式**：只记录经过多次验证的信息
- **语义组织**：按主题而非时间组织
- **去重机制**：避免重复记录相同信息
- **过期清理**：删除过时或错误的记忆

---

## 存储优化

### 1. 文件大小控制

- **JSONL 文件**：无大小限制，支持长会话
- **索引文件**：仅包含元信息，体积小
- **记忆文件**：限制 MEMORY.md 为 200 行，详细内容放入主题文件

### 2. 读取性能优化

- **索引优先**：先读取索引，按需加载完整会话
- **流式解析**：JSONL 支持逐行解析，无需加载全部内容
- **缓存机制**：最近访问的会话缓存在内存中

### 3. 写入性能优化

- **批量刷新**：多条消息可以批量写入
- **异步 I/O**：写入操作异步执行，不阻塞主线程
- **延迟索引**：索引更新延迟到会话关闭，减少 I/O

---

## 与 Open Agent SDK 的对比

| 功能 | Claude Code | Open Agent SDK |
|------|-------------|----------------|
| **按项目组织** | ✅ 自动按项目路径分组 | ❌ 只有单一 sessions 目录 |
| **会话索引** | ✅ sessions-index.json | ❌ 无索引 |
| **实时写入** | ✅ 每条消息立即写入 | ✅ 有 |
| **记忆系统** | ✅ 项目级别 memory/ | ❌ 无 |
| **文件历史** | ✅ 版本快照 | ❌ 无 |
| **摘要生成** | ✅ AI 生成摘要 | ❌ 无 |
| **元信息** | ✅ Git 分支、项目路径等 | ⚠️ 部分支持 |
| **JSONL 格式** | ✅ 多种消息类型 | ✅ 基础支持 |

---

## 总结

Claude Code 的会话存储系统设计精良，具有以下核心优势：

1. **按项目组织**：自动按项目路径分组，便于管理
2. **实时持久化**：每条消息立即写入，防止数据丢失
3. **延迟索引**：索引更新延迟到会话关闭，提高性能
4. **记忆系统**：项目级别的持久化记忆，增强上下文理解
5. **JSONL 格式**：支持流式追加、易于解析、部分损坏不影响全局

这些设计思想值得 Open Agent SDK 借鉴和实现。
