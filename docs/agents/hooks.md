# Enforce the rules: permissions and hooks

`AGENTS.md` tells an agent what to do. It cannot make the agent obey. Claude Code's own documentation says instructions are context, not enforcement, and that to block an action whatever the model decides you use a `PreToolUse` hook ([memory docs](https://code.claude.com/docs/en/memory), [hooks reference](https://code.claude.com/docs/en/hooks)).

The files in `docs/agents/examples/` are **examples, off by default**. Nothing here runs unless you copy it into your own `.claude/` folder. Read each one first: a hook is code that runs on your machine.

## What the examples do

| Rule | Where | Kind |
| --- | --- | --- |
| Never read `.env` files (only `.env.example` is allowed) | `claude-settings.json` | permission rule |
| Never run `rm -rf` | `claude-settings.json` | permission rule |
| Never run `git push --force` | `claude-settings.json` | permission rule |
| Never edit `bun.lock` by hand (use `bun install`) | `hooks/protect-files.ts` | `PreToolUse` hook |
| Never overwrite `docs/decisions.md` in one go (add an entry instead) | `hooks/protect-files.ts` | `PreToolUse` hook |
| Run `biome check` on the file after each edit | `claude-settings.json` | `PostToolUse` hook |

## Use them with Claude Code

```sh
mkdir -p .claude/hooks
cp docs/agents/examples/claude-settings.json .claude/settings.json
cp docs/agents/examples/hooks/protect-files.ts .claude/hooks/protect-files.ts
```

Then start Claude Code in the repository and check the rules with `/hooks` and `/permissions`. Try to break a rule on purpose (ask the agent to read `.env`) and confirm it is refused.

How the hook works: Claude Code sends the tool call to the hook as JSON on standard input. The hook exits with code 2 and writes the reason to standard error to block the call; the agent sees the reason. Any other exit code lets the call go on.

## Other agents

Each agent has its own switch. The idea is the same: the rule lives in configuration the agent cannot talk its way past, not in prose.

| Agent | Where to look |
| --- | --- |
| Codex, Cursor, Copilot, Gemini CLI, Windsurf and others | They read `AGENTS.md` ([agents.md](https://agents.md)). Use each tool's own permission or approval settings for enforcement. |
| Any agent, any tool | Protect `main` and require the CI checks. A branch rule and a required pipeline stop a bad change even when an agent ignores every file in this repository. |

The last row is the strongest rule of all. Local hooks help an agent stay on track; the merge gate is what keeps the repository safe.

## Keep it honest

- Do not widen these rules to "allow everything" to make a task pass. Ask the person you work for.
- A hook that blocks too much trains people to switch hooks off. Keep the list short and each rule explained.
- Hooks and permission rules do not replace review. Read the diff.
