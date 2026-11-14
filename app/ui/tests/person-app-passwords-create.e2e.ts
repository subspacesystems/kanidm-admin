import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const kanidmUrl = process.env.KANIDM_URL;
const passwordFile = process.env.KANIDM_IDM_ADMIN_PASSWORD_FILE;

const appId = '11111111-1111-4111-8111-111111111111';
const secret = 'S3cr3t-shown-once-0123456789';

async function signIn(page: Page): Promise<void> {
  const password = readFileSync(passwordFile as string, 'utf8').trim();
  await page.goto('/');
  await page.locator('#login-username').fill('idm_admin');
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.goto('/admin/persons');
  await expect(page.getByRole('heading', { name: 'Persons' })).toBeVisible();
}

async function createPerson(page: Page, name: string): Promise<void> {
  const status = await page.evaluate(async (personName) => {
    const response = await fetch('/api/kanidm/v1/person', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        attrs: { name: [personName], displayname: ['App Password Create E2E'] },
      }),
    });
    return response.status;
  }, name);
  expect(status).toBeLessThan(300);
}

// Kanidm only lets the account itself write and read its application
// passwords, so answer the three SCIM calls with the shapes Kanidm uses.
async function mockScim(
  page: Page,
  name: string,
  posts: { body: unknown }[],
  createStatus = 200
): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/kanidm/scim/v1/Person/${name}`,
    (route) =>
      route.fulfill({
        json: {
          schemas: ['urn:ietf:params:scim:schemas:kanidm:1.0:person'],
          id: '33333333-3333-4333-8333-333333333333',
          name,
        },
      })
  );
  await page.route(
    (url) => url.pathname === '/api/kanidm/scim/v1/Application',
    (route) =>
      route.fulfill({
        json: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
          totalResults: 1,
          resources: [
            {
              schemas: [],
              id: appId,
              name: 'mailapp',
              displayname: 'Mail Application',
              linked_group: [],
            },
          ],
        },
      })
  );
  await page.route(
    (url) =>
      url.pathname ===
      `/api/kanidm/scim/v1/Person/${name}/Application/_create_password`,
    (route) => {
      posts.push({ body: route.request().postDataJSON() });
      if (createStatus !== 200) {
        return route.fulfill({
          status: createStatus,
          json: { error: { code: 'forbidden', message: 'denied' } },
        });
      }
      return route.fulfill({
        json: {
          uuid: '44444444-4444-4444-8444-444444444444',
          label: 'laptop-mail',
          secret,
        },
      });
    }
  );
}

async function openCreateDialog(page: Page, name: string): Promise<void> {
  await page.goto(`/admin/persons/${name}`);
  await page.getByRole('tab', { name: 'Credentials' }).click();
  await expect(
    page.getByRole('heading', { name: 'Application passwords' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create application password' })
    .click();
}

test.describe('person application password create', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('creates a password and shows the secret once', async ({ page }) => {
    const name = 'e2e-apppwd-create';
    const posts: { body: unknown }[] = [];
    await signIn(page);
    await createPerson(page, name);
    await mockScim(page, name, posts);
    await openCreateDialog(page, name);

    // Both fields are required: submitting empty sends nothing.
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    expect(posts).toHaveLength(0);

    await dialog.getByLabel('Label').fill('laptop-mail');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Mail Application' }).click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    expect(posts).toEqual([
      { body: { applicationUuid: appId, label: 'laptop-mail' } },
    ]);
    await expect(page.getByText(secret)).toBeVisible();
    await expect(
      page.getByText(/will not be shown again|shown only once/i)
    ).toBeVisible();

    // Closing the dialog drops the secret from the page.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(secret)).toHaveCount(0);
    expect(await page.content()).not.toContain(secret);
  });

  test('shows an error and no secret when Kanidm refuses', async ({ page }) => {
    const name = 'e2e-apppwd-denied';
    const posts: { body: unknown }[] = [];
    await signIn(page);
    await createPerson(page, name);
    await mockScim(page, name, posts, 403);
    await openCreateDialog(page, name);

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Label').fill('laptop-mail');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Mail Application' }).click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(
      page.getByText('Failed to create the application password.')
    ).toBeVisible();
    await expect(page.getByText(secret)).toHaveCount(0);
  });
});
