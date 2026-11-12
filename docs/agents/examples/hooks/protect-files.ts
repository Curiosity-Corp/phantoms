// EXAMPLE PreToolUse hook. Off by default: copy it to .claude/hooks/ to use it.
// Claude Code sends the tool call as JSON on standard input. Exit code 2 blocks
// the call and shows standard error to the agent. Any other exit code allows it.

type HookInput = {
  tool_name?: string;
  tool_input?: { file_path?: string };
};

const input = (await Bun.stdin.json()) as HookInput;
const path = (input.tool_input?.file_path ?? '').replaceAll('\\', '/');

function block(reason: string): never {
  console.error(reason);
  process.exit(2);
}

if (path.endsWith('/bun.lock') || path === 'bun.lock') {
  block('bun.lock is generated. Change package.json and run `bun install`.');
}

// Appending a decision with Edit is fine. Replacing the whole file is not.
if (
  input.tool_name === 'Write' &&
  (path.endsWith('/docs/decisions.md') || path === 'docs/decisions.md')
) {
  block(
    'Do not rewrite docs/decisions.md. Add a new numbered entry with Edit instead.',
  );
}

process.exit(0);
