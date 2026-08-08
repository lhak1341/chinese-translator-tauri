# Issue tracker

This repo uses **GitHub Issues** as its tracker (`gh` CLI, repo `lhak1341/chinese-translator-tauri`).

## Wayfinding operations (wayfinder / to-tickets / to-spec)

- **Sub-issues**: native GitHub sub-issues via the `addSubIssue` GraphQL mutation (`issueId` = parent, `subIssueId` = child).
- **Blocking**: native GitHub issue dependencies via the `addBlockedBy` GraphQL mutation. The field is `blockingIssueId`, **not** `blockedByIssueId` — easy to get backwards, the API rejects the wrong name with a clear error.
- **Existing labels**: `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`, `ready-for-agent`. Create any that are missing with `gh label create` before use — don't assume they exist.
