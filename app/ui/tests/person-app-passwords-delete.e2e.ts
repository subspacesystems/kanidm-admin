import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const kanidmUrl = process.env.KANIDM_URL;
const passwordFile = process.env.KANIDM_IDM_ADMIN_PASSWORD_FILE;

const appId = '11111111-1111-4111-8111-111111111111';
const passwordId = '44444444-4444-4444-8444-444444444444';

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
        attrs: { name: [personName], displayname: ['App Password Delete E2E'] },
      }),
    });
    return response.status;
  }, name);
  expect(status).toBeLessThan(300);
}

// Kanidm only lets the account itself read and write its application
// passwords: answer the SCIM calls with the shapes Kanidm uses. The person
// has one password until the DELETE succeeds.
async function mockScim(
  page: Page,
  name: string,
  deletes: string[],
  deleteStatus = 200
): Promise<void> {
  let present = true;
  await page.route(
    (url) => url.pathname === `/api/kanidm/scim/v1/Person/${name}`,
    (route) =>
      route.fulfill({
        json: {
          schemas: ['urn:ietf:params:scim:schemas:kanidm:1.0:person'],
          id: '33333333-3333-4333-8333-333333333333',
          name,
          ...(present
            ? {
                application_password: [
                  {
                    uuid: passwordId,
                    applicationUuid: appId,
                    label: 'laptop-mail',
                  },
                ],
              }
            : {}),
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
      `/api/kanidm/scim/v1/Person/${name}/Application/${passwordId}`,
    (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deletes.push(route.request().url());
      if (deleteStatus !== 200) {
        return route.fulfill({
          status: deleteStatus,
          json: { error: { code: 'forbidden', message: 'denied' } },
        });
      }
      present = false;
      return route.fulfill({ json: null });
    }
  );
}

async function openCredentials(page: Page, name: string): Promise<void> {
  await page.goto(`/admin/persons/${name}`);
  await page.getByRole('tab', { name: 'Credentials' }).click();
  await expect(
    page.getByRole('heading', { name: 'Application passwords' })
  ).toBeVisible();
  await expect(page.getByText('laptop-mail')).toBeVisible();
}

test.describe('person application password delete', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('confirming deletes the password and the row disappears', async ({
    page,
  }) => {
    const name = 'e2e-apppwd-delete';
    const deletes: string[] = [];
    await signIn(page);
    await createPerson(page, name);
    await mockScim(page, name, deletes);
    await openCredentials(page, name);

    // Cancelling the confirmation sends nothing.
    await page
      .getByRole('button', { name: 'Delete application password laptop-mail' })
      .click();
    await expect(page.getByText(/Delete the application password/)).toBeVisible();
    await expect(
      page.getByText(/Delete the application password.*laptop-mail/)
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Delete the application password/)).toHaveCount(0);
    expect(deletes).toHaveLength(0);
    await expect(page.getByText('laptop-mail')).toBeVisible();

    // Confirming sends one bodyless DELETE for that password id.
    await page
      .getByRole('button', { name: 'Delete application password laptop-mail' })
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Application password deleted.')).toBeVisible();
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain(
      `/api/kanidm/scim/v1/Person/${name}/Application/${passwordId}`
    );
    await expect(page.getByText('laptop-mail')).toHaveCount(0);
    await expect(page.getByText('No application passwords.')).toBeVisible();
  });

  test('shows an error and keeps the row when Kanidm refuses', async ({
    page,
  }) => {
    const name = 'e2e-apppwd-delete-denied';
    const deletes: string[] = [];
    await signIn(page);
    await createPerson(page, name);
    await mockScim(page, name, deletes, 403);
    await openCredentials(page, name);

    await page
      .getByRole('button', { name: 'Delete application password laptop-mail' })
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(
      page.getByText('Failed to delete the application password.')
    ).toBeVisible();
    expect(deletes).toHaveLength(1);
    await expect(page.getByText('laptop-mail')).toBeVisible();
  });
});
