import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const kanidmUrl = process.env.KANIDM_URL;
const passwordFile = process.env.KANIDM_ADMIN_PASSWORD_FILE;

// `admin` is a domain admin; `idm_admin` may not change the domain.
async function signInAsAdmin(page: Page): Promise<void> {
  const password = readFileSync(passwordFile as string, 'utf8').trim();
  await page.goto('/');
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.goto('/admin/domain');
  await expect(page.getByRole('heading', { name: 'Domain', exact: true }))
    .toBeVisible();
}

test.describe('domain revoke key', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_ADMIN_PASSWORD_FILE'
  );

  test('revoke is disabled without a key id and asks for confirmation', async ({
    page,
  }) => {
    await signInAsAdmin(page);

    const revoke = page.getByRole('button', { name: 'Revoke key...' });
    await expect(revoke).toBeVisible();
    await expect(revoke).toBeDisabled();

    await page.locator('#domain-revoke-key-id').fill('no-such-key');
    await expect(revoke).toBeEnabled();
    await revoke.click();

    // Cancelling leaves everything as it was: no request was made.
    let revokeRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/_attr/key_action_revoke')) revokeRequests++;
    });
    await expect(page.getByText('Revoke this domain key?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Revoke this domain key?')).toHaveCount(0);
    expect(revokeRequests).toBe(0);
  });

  test('confirming sends the key id to the domain and reports the outcome', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.locator('#domain-revoke-key-id').fill('no-such-key');

    const sent = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        request.url().endsWith('/v1/domain/_attr/key_action_revoke')
    );
    await page.getByRole('button', { name: 'Revoke key...' }).click();
    await page.getByRole('button', { name: 'Revoke key', exact: true }).click();

    // The body is the single key id, as the CLI sends it.
    expect((await sent).postDataJSON()).toEqual(['no-such-key']);

    // Kanidm decides whether an unknown id is an error; the console shows
    // exactly one of the two toasts.
    await expect(
      page.getByText('Domain key revoked.').or(
        page.getByText('Failed to revoke the domain key.')
      )
    ).toBeVisible();
  });
});
