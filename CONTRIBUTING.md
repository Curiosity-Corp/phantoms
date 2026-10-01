# Contributing

Contributions are welcome. Keep the starter small, runnable with Bun, and clear enough that a new developer or coding agent can understand why each service exists.

## Local workflow

1. Install Bun 1.4.2 and Docker Compose.
2. Follow [Getting started](docs/getting-started.md).
3. Create a focused branch and make the smallest useful change.
4. Add or update deterministic coverage and documentation where behavior changes.
5. Run the checks in `AGENTS.md` and inspect the final diff.

## Contribution principles

- Preserve Bun as the runtime and package manager.
- Keep the default stack provider-neutral and safe for local learning.
- Pin dependencies and services; update them deliberately with release notes and security advisories reviewed.
- Keep credentials out of source, logs, screenshots, and CI artifacts.
- Do not add broad agent permissions or publicly reachable stateful services as convenience defaults.
- Prefer portable GitLab CI examples. The internal Launch Sequence include is only available to authorized projects.

By submitting a contribution, you agree that it may be distributed under the repository's MIT License.
