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

async function post(page: Page, path: string, body: unknown): Promise<number> {
  return page.evaluate(
    async ([url, payload]) => {
      const response = await fetch(url as string, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.status;
    },
    [path, body] as const
  );
}

test.describe('relationship graph export', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('the System page links to a filterable Graphviz and Mermaid export', async ({
    page,
  }) => {
    await signIn(page);

    // Fixtures through the API: a person in a group.
    expect(
      await post(page, '/api/kanidm/v1/person', {
        attrs: { name: ['e2e-graph-p'], displayname: ['Graph P'] },
      })
    ).toBeLessThan(300);
    expect(
      await post(page, '/api/kanidm/v1/group', { attrs: { name: ['e2e-graph-g'] } })
    ).toBeLessThan(300);
    expect(
      await post(page, '/api/kanidm/v1/group/e2e-graph-g/_attr/member', [
        'e2e-graph-p',
      ])
    ).toBeLessThan(300);

    await page.getByRole('link', { name: 'Relationship graph' }).click();
    await expect(page).toHaveURL(/\/admin\/system\/graph$/);
    await expect(
      page.getByRole('heading', { name: 'Relationship graph' })
    ).toBeVisible();

    const output = page.locator('pre.graph-output');

    // Default: Graphviz, all types, the new edge is in.
    await expect(output).toContainText('digraph {');
    await expect(output).toContainText(/"e2e-graph-g@[^"]+" -> "e2e-graph-p@[^"]+"/);

    // Unchecking Person drops the person node and the edge.
    const person = page.getByRole('checkbox', { name: 'Person' });
    await expect(person).toBeChecked();
    await person.uncheck();
    await expect(output).not.toContainText('e2e-graph-p');
    await expect(output).toContainText('e2e-graph-g');
    await person.check();
    await expect(output).toContainText('e2e-graph-p');

    // Mermaid.
    await page.getByLabel('Format').selectOption({ label: 'Mermaid' });
    await expect(output).toContainText('graph RL');
    await expect(output).toContainText('-->');
    await expect(output).not.toContainText('digraph');

    // Mermaid with ELK adds the init line.
    await page.getByLabel('Format').selectOption({ label: 'Mermaid (ELK)' });
    await expect(output).toContainText('"defaultRenderer": "elk"');

    // The type checkboxes cover all four object types.
    for (const name of ['Person', 'Service account', 'Group', 'Built-in group']) {
      await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible();
    }
  });
});
