import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const kanidmUrl = process.env.KANIDM_URL;
const passwordFile = process.env.KANIDM_IDM_ADMIN_PASSWORD_FILE;

test.describe('console smoke', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('idm_admin signs in and sees the person list', async ({ page }) => {
    // The password is read from the file and typed into the form; it is
    // never logged or put in a test title or assertion message.
    const password = readFileSync(passwordFile as string, 'utf8').trim();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Kanidm' }))
      .toBeVisible();

    await page.locator('#login-username').fill('idm_admin');
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.goto('/admin/persons');
    await expect(page.getByRole('heading', { name: 'Persons' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create person' }))
      .toBeVisible();
    // A fresh Kanidm has no persons, so the table shows its empty state or
    // rows; either way the load must not have raised the error toast.
    await expect(page.getByText('Failed to load persons')).toHaveCount(0);
  });

  test('a wrong password is rejected', async ({ page }) => {
    await page.goto('/');
    await page.locator('#login-username').fill('idm_admin');
    await page.locator('#login-password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
