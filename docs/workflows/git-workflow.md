# Git Workflow Guide

## Worktree Usage

**Worktree location**: `.worktrees/<feature-name>`

**In Claude Code**: Use `EnterWorktree` tool for automatic setup.

**Cleanup after PR merge**:
```bash
git worktree remove .worktrees/<feature-name>
git branch -d <branch-name>
```

## Critical Rules

### Never Push to Merged Branches

**Before creating PR, always check:**
```bash
gh pr view <branch-name> --json state,mergedAt,number,title
```

**If PR is already merged** (`"mergedAt": "..."`), create a new branch from main:
```bash
git checkout main
git pull origin main
git worktree add .worktrees/<new-feature> -b <new-branch-name>
```

### Incremental Commits

**❌ Bad**: Complete entire feature → single commit (1000+ lines)

**✅ Good**: Break work into logical steps:
- Step 1: Add types → commit
- Step 2: Implement logic → commit
- Step 3: Add tests → commit
- Step 4: Update docs → commit

Each commit should pass tests.

## PR Requirements

### Language
- **All PR content must be in English** (title, description, comments, commits)

### Scope
- **One logical change per PR**
- Don't add unrelated changes after initial review
- Split large PRs into smaller ones
