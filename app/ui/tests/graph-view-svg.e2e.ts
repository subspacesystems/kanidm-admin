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

test.describe('relationship graph diagram', () => {
  test.skip(
    !kanidmUrl || !passwordFile,
    'needs KANIDM_URL and KANIDM_IDM_ADMIN_PASSWORD_FILE'
  );

  test('draws nested groups and a person as SVG and opens detail pages', async ({
    page,
  }) => {
    await signIn(page);

    // Fixtures: outer group > inner group > person.
    for (const [path, body] of [
      ['/api/kanidm/v1/person', { attrs: { name: ['e2e-svg-p'], displayname: ['Svg P'] } }],
      ['/api/kanidm/v1/group', { attrs: { name: ['e2e-svg-inner'] } }],
      ['/api/kanidm/v1/group', { attrs: { name: ['e2e-svg-outer'] } }],
      ['/api/kanidm/v1/group/e2e-svg-inner/_attr/member', ['e2e-svg-p']],
      ['/api/kanidm/v1/group/e2e-svg-outer/_attr/member', ['e2e-svg-inner']],
    ] as const) {
      expect(await post(page, path, body)).toBeLessThan(300);
    }

    await page.getByRole('link', { name: 'Relationship graph' }).click();
    await expect(page).toHaveURL(/\/admin\/system\/graph$/);

    // The view switch: Text is the default (the export from graph-data-export).
    const text = page.getByRole('radio', { name: 'Text', exact: true });
    const diagram = page.getByRole('radio', { name: 'Diagram', exact: true });
    await expect(text).toBeChecked();
    await expect(page.locator('pre.graph-output')).toBeVisible();
    await expect(page.locator('graph-diagram')).toHaveCount(0);

    await diagram.check();
    await expect(page.locator('pre.graph-output')).toHaveCount(0);
    const svg = page.locator('graph-diagram svg');
    await expect(svg).toBeVisible();

    // Nodes carry their SPN and type.
    const node = (name: string) =>
      page.locator(`graph-diagram g.node[data-spn^="${name}@"]`);
    await expect(node('e2e-svg-p')).toHaveCount(1);
    await expect(node('e2e-svg-inner')).toHaveCount(1);
    await expect(node('e2e-svg-outer')).toHaveCount(1);
    await expect(node('e2e-svg-p')).toHaveAttribute('data-type', 'person');
    await expect(node('e2e-svg-inner')).toHaveAttribute('data-type', 'group');

    // Built-in groups are drawn too, with their own type.
    await expect(
      page.locator('graph-diagram g.node[data-type="builtin_group"]').first()
    ).toBeVisible();

    // Edges: outer -> inner and inner -> person, and they have arrowheads.
    const edge = (from: string, to: string) =>
      page.locator(
        `graph-diagram path.edge[data-from^="${from}@"][data-to^="${to}@"]`
      );
    await expect(edge('e2e-svg-outer', 'e2e-svg-inner')).toHaveCount(1);
    await expect(edge('e2e-svg-inner', 'e2e-svg-p')).toHaveCount(1);
    await expect(edge('e2e-svg-inner', 'e2e-svg-p')).toHaveAttribute(
      'marker-end',
      /url\(#.+\)/
    );

    // Layering: the outer group sits above the inner one, above the person.
    const top = async (name: string) =>
      (await node(name).boundingBox())?.y ?? Number.NaN;
    expect(await top('e2e-svg-outer')).toBeLessThan(await top('e2e-svg-inner'));
    expect(await top('e2e-svg-inner')).toBeLessThan(await top('e2e-svg-p'));

    // A node has a full-name tooltip.
    await expect(node('e2e-svg-p').locator('title')).toHaveText(/^e2e-svg-p@/);

    // The type filter still applies: dropping Person removes its node and edge.
    const person = page.getByRole('checkbox', { name: 'Person', exact: true });
    await person.uncheck();
    await expect(node('e2e-svg-p')).toHaveCount(0);
    await expect(edge('e2e-svg-inner', 'e2e-svg-p')).toHaveCount(0);
    await expect(node('e2e-svg-inner')).toHaveCount(1);
    await person.check();
    await expect(node('e2e-svg-p')).toHaveCount(1);

    // Clicking nodes opens their detail pages.
    await node('e2e-svg-p').click();
    await expect(page).toHaveURL(/\/admin\/persons\/[0-9a-f-]{36}$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/system\/graph$/);
    await page.getByRole('radio', { name: 'Diagram', exact: true }).check();
    await node('e2e-svg-inner').click();
    await expect(page).toHaveURL(/\/admin\/groups\/[0-9a-f-]{36}$/);

    // Back on the page, switching to Text shows the export again.
    await page.goBack();
    await page.getByRole('radio', { name: 'Text', exact: true }).check();
    await expect(page.locator('pre.graph-output')).toContainText('digraph {');
  });
});
