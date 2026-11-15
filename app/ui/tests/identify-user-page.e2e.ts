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

// Two real people cannot be driven in one test, so every answer of
// POST /v1/person/{other}/_identify_user comes from `answers`, in order.
// The request bodies are recorded.
async function mockIdentify(
  page: Page,
  answers: unknown[]
): Promise<{ url: string; body: unknown }[]> {
  const seen: { url: string; body: unknown }[] = [];
  await page.route('**/api/kanidm/v1/person/*/_identify_user', async (route) => {
    const request = route.request();
    seen.push({
      url: new URL(request.url()).pathname,
      body: JSON.parse(request.postData() ?? 'null'),
    });
    const answer = answers.shift();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(answer),
    });
  });
  return seen;
}

test.describe('identify user page', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('the session menu links to the page and it shows the own id', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Session menu' }).click();
    await page.getByRole('menuitem', { name: 'Verify identity' }).click();
    await expect(page).toHaveURL(/\/admin\/self\/identify$/);
    await expect(
      page.getByRole('heading', { name: 'Verify identity' })
    ).toBeVisible();
    // The signed-in account's id (idm_admin@<domain>) to read out.
    await expect(page.getByTestId('own-id')).toContainText('idm_admin');
    await expect(
      page.getByRole('textbox', { name: "Other person's ID" })
    ).toBeVisible();
  });

  test('unavailable: a clear message, and the flow stays on the id step', async ({
    page,
  }) => {
    await signIn(page);
    const seen = await mockIdentify(page, ['IdentityVerificationUnavailable']);
    await page.goto('/admin/self/identify');
    await page
      .getByRole('textbox', { name: "Other person's ID" })
      .fill('bob@example.com');
    await page.getByRole('button', { name: 'Start verification' }).click();
    await expect(page.getByTestId('result')).toContainText('not available');
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(
      '/api/kanidm/v1/person/bob%40example.com/_identify_user'
    );
    expect(seen[0].body).toBe('Start');
    // Still on the id step: a new try is possible.
    await expect(
      page.getByRole('button', { name: 'Start verification' })
    ).toBeVisible();
  });

  test('wait first: enter their code, then show and confirm ours', async ({
    page,
  }) => {
    await signIn(page);
    const seen = await mockIdentify(page, [
      'WaitForCode',
      { ProvideCode: { step: 300, totp: 424242 } },
    ]);
    await page.goto('/admin/self/identify');
    await page.getByRole('textbox', { name: "Other person's ID" }).fill('bob');
    await page.getByRole('button', { name: 'Start verification' }).click();

    // We wait for their code: only the code input is offered.
    const codeBox = page.getByRole('textbox', { name: 'Their code' });
    await expect(codeBox).toBeVisible();
    const submit = page.getByRole('button', { name: 'Submit code' });

    // Only 5 or 6 digits pass; nothing is sent for anything else.
    for (const bad of ['123', '1234567', '12a456', '12 345']) {
      await codeBox.fill(bad);
      await expect(submit).toBeDisabled();
    }
    expect(seen).toHaveLength(1);
    await codeBox.fill('123456');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Their code was right: our code is shown with a countdown, to read out.
    await expect(page.getByTestId('own-code')).toHaveText('424242');
    await expect(page.getByTestId('countdown')).toContainText(
      /\d+ seconds left/
    );
    await expect(
      page.getByText("you won't be able to go back", { exact: false })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Yes, they verified my code' })
      .click();

    await expect(page.getByTestId('result')).toContainText(
      'Identity verification succeeded'
    );
    // The confirm step sends nothing.
    expect(seen.map((s) => s.body)).toEqual([
      'Start',
      { SubmitCode: { other_totp: 123456 } },
    ]);
  });

  test('code first: show ours, confirm, enter theirs; success', async ({
    page,
  }) => {
    await signIn(page);
    const seen = await mockIdentify(page, [
      { ProvideCode: { step: 300, totp: 111222 } },
      'Success',
    ]);
    await page.goto('/admin/self/identify');
    await page.getByRole('textbox', { name: "Other person's ID" }).fill('bob');
    await page.getByRole('button', { name: 'Start verification' }).click();

    await expect(page.getByTestId('own-code')).toHaveText('111222');
    await page
      .getByRole('button', { name: 'Yes, they verified my code' })
      .click();

    const codeBox = page.getByRole('textbox', { name: 'Their code' });
    await codeBox.fill('98765');
    await page.getByRole('button', { name: 'Submit code' }).click();
    await expect(page.getByTestId('result')).toContainText(
      'Identity verification succeeded'
    );
    expect(seen.map((s) => s.body)).toEqual([
      'Start',
      { SubmitCode: { other_totp: 98765 } },
    ]);
  });

  test('a wrong code shows the failure message and ends the flow', async ({
    page,
  }) => {
    await signIn(page);
    await mockIdentify(page, ['WaitForCode', 'CodeFailure']);
    await page.goto('/admin/self/identify');
    await page.getByRole('textbox', { name: "Other person's ID" }).fill('bob');
    await page.getByRole('button', { name: 'Start verification' }).click();
    await page.getByRole('textbox', { name: 'Their code' }).fill('654321');
    await page.getByRole('button', { name: 'Submit code' }).click();
    await expect(page.getByTestId('result')).toContainText(
      'verification code is invalid'
    );
    await expect(page.getByTestId('own-code')).toHaveCount(0);
    // A new attempt starts again from the id step.
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(
      page.getByRole('textbox', { name: "Other person's ID" })
    ).toBeVisible();
  });

  test('declining the confirm step ends the flow without a request', async ({
    page,
  }) => {
    await signIn(page);
    const seen = await mockIdentify(page, [
      { ProvideCode: { step: 300, totp: 333444 } },
    ]);
    await page.goto('/admin/self/identify');
    await page.getByRole('textbox', { name: "Other person's ID" }).fill('bob');
    await page.getByRole('button', { name: 'Start verification' }).click();
    await expect(page.getByTestId('own-code')).toHaveText('333444');
    await page
      .getByRole('button', { name: 'No, they did not verify it' })
      .click();
    await expect(page.getByTestId('result')).toContainText(
      'Identity verification was cancelled'
    );
    await expect(page.getByTestId('own-code')).toHaveCount(0);
    expect(seen).toHaveLength(1);
  });
});
