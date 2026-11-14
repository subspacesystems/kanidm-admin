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
  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { name: 'System', exact: true }))
    .toBeVisible();
}

test.describe('schema classes', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('the class list opens a detail view linking to the attributes page', async ({
    page,
  }) => {
    await signIn(page);

    // Reachable from the System page.
    await page.getByRole('link', { name: 'Schema classes' }).click();
    await expect(page).toHaveURL(/\/admin\/system\/classes$/);
    await expect(
      page.getByRole('heading', { name: 'Schema classes' })
    ).toBeVisible();

    for (const header of [
      'Name',
      'Description',
      'May',
      'Must',
      'Supplements',
      'Excludes',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: header })
      ).toBeVisible();
    }

    const row = (name: string) =>
      page.getByRole('row').filter({
        has: page.getByRole('cell', { name, exact: true }),
      });
    await expect(row('person')).toBeVisible();
    await expect(row('group')).toBeVisible();

    // The filter box narrows the table.
    await page.getByRole('textbox', { name: 'Filter classes...' }).fill('person');
    await expect(row('person')).toBeVisible();
    await expect(row('group')).toHaveCount(0);

    // A row opens the detail view.
    await row('person').click();
    await expect(page).toHaveURL(/\/admin\/system\/classes\/person$/);
    await expect(
      page.getByRole('heading', { name: 'person', exact: true })
    ).toBeVisible();
    for (const section of ['May', 'Must', 'Supplements', 'Excludes']) {
      await expect(
        page.getByRole('heading', { name: section, exact: true })
      ).toBeVisible();
    }
    // person excludes service_account; the Must/May lists link to attributes.
    await expect(page.getByText('service_account')).toBeVisible();
    await page.getByRole('link', { name: 'mail', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/system\/attributes/);
    await expect(
      page.getByRole('heading', { name: 'Schema attributes' })
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Filter attributes...' })
    ).toHaveValue('mail');
    await expect(
      page.getByRole('row').filter({
        has: page.getByRole('cell', { name: 'mail', exact: true }),
      })
    ).toBeVisible();
  });
});
