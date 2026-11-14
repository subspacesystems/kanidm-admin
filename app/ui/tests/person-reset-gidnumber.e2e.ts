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

test.describe('person reset gidnumber', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('reset replaces an explicit gidnumber with a generated one', async ({
    page,
  }) => {
    const name = 'e2e-resetgid-person';
    await signIn(page);
    await page.getByRole('button', { name: 'Create person' }).click();
    await page.locator('#person-create-id').fill(name);
    await page.locator('#person-create-display').fill('Reset GID E2E');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText(`Created person ${name}`)).toBeVisible();

    await page.goto(`/admin/persons/${name}`);
    await page.getByRole('tab', { name: 'POSIX' }).click();

    // Not POSIX yet: no reset action, only the enable form.
    await expect(page.getByText('This account is not POSIX-enabled.'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset GID number' }))
      .toHaveCount(0);
    await page.locator('#posix-gidnumber').fill('2000000');
    await page.getByRole('button', { name: 'Save POSIX attributes' }).click();
    await expect(page.getByText('POSIX attributes saved.')).toBeVisible();
    await expect(page.getByText('GID: 2000000')).toBeVisible();

    // Cancelling the confirmation sends nothing.
    let purges = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'DELETE' &&
        request.url().endsWith(`/v1/person/${name}/_attr/gidnumber`)
      ) {
        purges++;
      }
    });
    await page.getByRole('button', { name: 'Reset GID number' }).click();
    await expect(page.getByText('Reset the GID number?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Reset the GID number?')).toHaveCount(0);
    expect(purges).toBe(0);

    // Confirming purges the attribute; Kanidm generates a new number.
    const sent = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        request.url().endsWith(`/v1/person/${name}/_attr/gidnumber`)
    );
    await page.getByRole('button', { name: 'Reset GID number' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await sent;
    await expect(page.getByText('GID number reset.')).toBeVisible();
    await expect(page.getByText('GID: 2000000')).toHaveCount(0);
    await expect(page.getByText(/GID: \d+/)).toBeVisible();
    await expect(page.locator('#posix-gidnumber')).not.toHaveValue('2000000');
  });
});
