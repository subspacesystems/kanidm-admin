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

test.describe('schema attribute types', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('the System page links to a filterable attribute list', async ({
    page,
  }) => {
    await signIn(page);

    // Reachable from the System page.
    await page.getByRole('link', { name: 'Schema attributes' }).click();
    await expect(page).toHaveURL(/\/admin\/system\/attributes$/);
    await expect(
      page.getByRole('heading', { name: 'Schema attributes' })
    ).toBeVisible();

    // Column headers.
    for (const header of [
      'Name',
      'Syntax',
      'Multivalue',
      'Unique',
      'Description',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: header })
      ).toBeVisible();
    }

    // A known attribute is listed, and the filter box narrows the table.
    const row = (name: string) =>
      page.getByRole('row').filter({
        has: page.getByRole('cell', { name, exact: true }),
      });
    await expect(row('name')).toBeVisible();
    await expect(row('displayname')).toBeVisible();

    await page.getByRole('textbox', { name: 'Filter attributes...' }).fill('displayname');
    await expect(row('displayname')).toBeVisible();
    await expect(row('name')).toHaveCount(0);
  });
});
