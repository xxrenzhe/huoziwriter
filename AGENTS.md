# Beads Issue Tracking

本项目使用 [Beads (bd)](https://github.com/steveyegge/beads) 进行 issue 跟踪。

## Core Rules

- 所有工作都必须记录在 `bd` 中，禁止使用 markdown TODO 或注释任务清单替代
- 开始工作前先执行 `bd ready`
- 如无合适的 open bead，立即创建新 bead
- 修改前必须先 claim：`bd update <id> --claim`
- 完成后必须关闭：`bd close <id> "<result>"`
- 本仓库当前 **不需要执行** `bd dolt push`

## Quick Reference

```bash
bd prime
bd ready
bd list --status=open
bd create "title" -t task -p 2
bd update <id> --claim
bd close <id> "result"
```

## Workflow

1. 先检查可做工作：`bd ready`
2. 没有合适 bead 就创建：`bd create ...`
3. 开始前 claim：`bd update <id> --claim`
4. 完成工作
5. 关闭 bead：`bd close <id> "<result>"`

## Auto Lifecycle Policy

对每个需要实际执行的用户请求：

1. 如果没有合适的 open bead，立即创建
2. 在编辑文件前 claim bead
3. 执行过程中保持 bead 状态准确
4. 完成后关闭 bead，并写明简短结果
5. 未完成则保持 open，不要关闭

## Current Repo Exception

- `bd dolt push` 当前不是必需步骤，不要执行
- 原因：本仓库当前未配置 Dolt remote，执行会稳定失败
