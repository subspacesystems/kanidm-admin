import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const kanidmUrl = process.env.KANIDM_URL;
const passwordFile = process.env.KANIDM_ADMIN_PASSWORD_FILE;

// Setting entry_managed_by on a group needs `admin` (idm_admin lacks it).
async function signIn(page: Page): Promise<void> {
  const password = readFileSync(passwordFile as string, 'utf8').trim();
  await page.goto('/');
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.goto('/admin/groups');
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
}

async function createGroup(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.locator('#group-create-id').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(`Created group ${name}`)).toBeVisible();
}

test.describe('group entry manager', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_ADMIN_PASSWORD_FILE'
  );

  test('set and clear the entry manager on the settings tab', async ({ page }) => {
    const manager = 'e2e-emgr-managers';
    const target = 'e2e-emgr-target';

    await signIn(page);
    await createGroup(page, manager);
    await createGroup(page, target);

    await page.goto(`/admin/groups/${target}`);
    await page.getByRole('tab', { name: 'Settings' }).click();

    await expect(page.getByTestId('entry-manager-current')).toHaveText('None');

    // Pick the manager from the combobox, then set it.
    await page.locator('#grp-entry-manager').fill(manager);
    await page.getByRole('option', { name: new RegExp(manager) }).first().click();
    await page.getByRole('button', { name: 'Set entry manager' }).click();
    await expect(page.getByText('Entry manager updated.')).toBeVisible();
    await expect(page.getByTestId('entry-manager-current')).toContainText(manager);

    // The value survives a reload.
    await page.reload();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByTestId('entry-manager-current')).toContainText(manager);

    await page.getByRole('button', { name: 'Clear entry manager' }).click();
    await expect(page.getByText('Entry manager cleared.')).toBeVisible();
    await expect(page.getByTestId('entry-manager-current')).toHaveText('None');
  });
});
