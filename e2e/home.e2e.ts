import { expect, test } from '@playwright/test';

test.describe('home page', () => {
  test('renders the PHANTOMS stack without console errors', async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    await page.goto('/');

    await expect(page).toHaveTitle(/PHANTOMS/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Build with a clear stack.',
      }),
    ).toBeVisible();
    const stack = page.getByRole('region', { name: 'PHANTOMS stack' });
    await expect(stack.getByRole('article')).toHaveCount(8);
    await expect(
      stack.getByRole('heading', { level: 2, name: 'AI', exact: true }),
    ).toBeVisible();
    expect(problems).toEqual([]);
  });
});

// The starter's web app has no task screen yet, so the task journey drives the
// API from the page, the way a future task screen would: same origin, with
// the request ID the API sets on every response.
test.describe('tasks through the built app', () => {
  test('creates a task and lists it', async ({ page }) => {
    await page.goto('/');
    const title = `e2e task ${Date.now()}`;

    const created = await page.evaluate(async (taskTitle) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: taskTitle }),
      });
      return {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        body: await response.json(),
      };
    }, title);
    expect(created.status).toBe(201);
    expect(created.requestId).toBeTruthy();
    expect(created.body.item.title).toBe(title);

    const listed = await page.evaluate(async () => {
      const response = await fetch('/api/tasks');
      return response.json();
    });
    expect(listed.items.map((item: { title: string }) => item.title)).toContain(
      title,
    );
  });

  test('rejects an empty title and still reports a request ID', async ({
    request,
  }) => {
    const response = await request.post('/api/tasks', {
      data: { title: '  ' },
    });

    expect(response.status()).toBe(400);
    expect(response.headers()['x-request-id']).toBeTruthy();
  });

  test('reports health and sets security headers', async ({ request }) => {
    const response = await request.get('/healthz');

    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });
});
