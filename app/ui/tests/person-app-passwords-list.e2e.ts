import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const kanidmUrl = process.env.KANIDM_URL;
const passwordFile = process.env.KANIDM_IDM_ADMIN_PASSWORD_FILE;

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
  // Through the API; the signed-in session cookie is sent with the request.
  const status = await page.evaluate(async (personName) => {
    const response = await fetch('/api/kanidm/v1/person', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        attrs: { name: [personName], displayname: ['App Password E2E'] },
      }),
    });
    return response.status;
  }, name);
  expect(status).toBeLessThan(300);
}

test.describe('person application passwords list', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('shows the empty state when the person has none', async ({ page }) => {
    const name = 'e2e-apppwd-empty';
    await signIn(page);
    await createPerson(page, name);

    await page.goto(`/admin/persons/${name}`);
    await page.getByRole('tab', { name: 'Credentials' }).click();
    await expect(
      page.getByRole('heading', { name: 'Application passwords' })
    ).toBeVisible();
    await expect(page.getByText('No application passwords.')).toBeVisible();
  });

  test('lists each password with its label and application', async ({
    page,
  }) => {
    const name = 'e2e-apppwd-list';
    const knownApp = '11111111-1111-4111-8111-111111111111';
    const unknownApp = '22222222-2222-4222-8222-222222222222';
    await signIn(page);
    await createPerson(page, name);

    // Kanidm only shows application passwords to the account itself, so
    // the admin's own request would come back without any: answer the two
    // SCIM reads with the shapes Kanidm uses.
    await page.route(
      (url) => url.pathname === `/api/kanidm/scim/v1/Person/${name}`,
      (route) =>
        route.fulfill({
          json: {
            schemas: ['urn:ietf:params:scim:schemas:kanidm:1.0:person'],
            id: '33333333-3333-4333-8333-333333333333',
            name,
            application_password: [
              {
                uuid: '44444444-4444-4444-8444-444444444444',
                applicationUuid: knownApp,
                label: 'laptop-mail',
              },
              {
                uuid: '55555555-5555-4555-8555-555555555555',
                applicationUuid: unknownApp,
                label: 'phone-calendar',
              },
            ],
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
                id: knownApp,
                name: 'mailapp',
                displayname: 'Mail Application',
                linked_group: [],
              },
            ],
          },
        })
    );

    await page.goto(`/admin/persons/${name}`);
    await page.getByRole('tab', { name: 'Credentials' }).click();
    await expect(
      page.getByRole('heading', { name: 'Application passwords' })
    ).toBeVisible();
    await expect(page.getByText('laptop-mail')).toBeVisible();
    await expect(page.getByText('Mail Application')).toBeVisible();
    await expect(page.getByText('phone-calendar')).toBeVisible();
    // An application that is not in the list shows its id instead.
    await expect(page.getByText(unknownApp)).toBeVisible();
    await expect(page.getByText('No application passwords.')).toHaveCount(0);
    // Read-only: no delete or create action yet.
    await expect(page.getByRole('button', { name: /delete|create application/i }))
      .toHaveCount(0);
  });
});
