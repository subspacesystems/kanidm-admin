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
  await page.getByRole('button', { name: 'Create person' }).click();
  await page.locator('#person-create-id').fill(name);
  await page.locator('#person-create-display').fill('Softlock E2E');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(`Created person ${name}`)).toBeVisible();
}

/** account_softlock_expire as Kanidm stores it, read through the proxy
 * with the page's session cookie. */
async function softlockExpire(page: Page, name: string): Promise<string | null> {
  const response = await page.request.get(`/api/kanidm/v1/person/${name}`);
  expect(response.ok()).toBe(true);
  const entry = await response.json();
  return entry?.attrs?.account_softlock_expire?.[0] ?? null;
}

test.describe('person softlock reset', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('clear softlock from the credentials tab', async ({ page }) => {
    const name = 'e2e-softlock-person';

    await signIn(page);
    await createPerson(page, name);
    expect(await softlockExpire(page, name)).toBeNull();

    await page.goto(`/admin/persons/${name}`);
    await page.getByRole('tab', { name: 'Credentials' }).click();

    const before = Date.now();
    await page.getByRole('button', { name: 'Clear softlock' }).click();
    await expect(page.getByText('Softlock cleared.')).toBeVisible();

    // The reset time is "now": the browser's clock at the click.
    const value = await softlockExpire(page, name);
    expect(value).not.toBeNull();
    const at = Date.parse(value as string);
    expect(Number.isNaN(at)).toBe(false);
    expect(Math.abs(at - before)).toBeLessThan(5 * 60 * 1000);
  });
});
