const origin = 'http://127.0.0.1:4000';
const deadline = Date.now() + 30_000;

const server = Bun.spawn(['bun', 'run', 'apps/api/dist/server.js'], {
  cwd: '/app',
  env: {
    ...Bun.env,
    API_BEARER_TOKEN: 'ci-smoke',
    DATABASE_URL: 'postgres://phantoms:ci-only@127.0.0.1:5432/phantoms',
  },
  stdout: 'pipe',
  stderr: 'pipe',
});

const stdout = new Response(server.stdout).text();
const stderr = new Response(server.stderr).text();
let smokePassed = false;
let lastFailure = 'server did not become ready before timeout';

try {
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      lastFailure = `server exited with status ${server.exitCode}`;
      break;
    }

    try {
      const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
      const pageResponse = await fetch(`${origin}/`, { signal });
      const healthResponse = await fetch(`${origin}/healthz`, { signal });
      const unauthorizedResponse = await fetch(`${origin}/api/tasks`, {
        signal,
      });
      const page = await pageResponse.text();

      if (
        pageResponse.ok &&
        page.includes('PHANTOMS') &&
        healthResponse.ok &&
        unauthorizedResponse.status === 401
      ) {
        smokePassed = true;
        break;
      }

      lastFailure = `unexpected responses: page=${pageResponse.status}, health=${healthResponse.status}, api=${unauthorizedResponse.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await Bun.sleep(500);
  }
} finally {
  if (server.exitCode === null) server.kill();
  await server.exited;
}

const [serverOutput, serverErrors] = await Promise.all([stdout, stderr]);

if (!smokePassed) {
  throw new Error(
    `container smoke failed: ${lastFailure}\n${serverOutput}\n${serverErrors}`,
  );
}

console.info(
  'container smoke passed: static page, health route, and auth boundary',
);
