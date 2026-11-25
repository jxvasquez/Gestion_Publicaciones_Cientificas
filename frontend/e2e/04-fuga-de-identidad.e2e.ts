import { expect, test } from '@playwright/test';

import {
  Api,
  activeRow,
  loginAll,
  reviewersOf,
  Scenario,
  submitManuscript,
} from './support/api';
import { ACCOUNTS, AUTHOR_TOKENS, LAW, LAW_POOL, REVIEWER_TOKENS, RUN, Who } from './support/env';
import { loginUi, visibleText } from './support/ui';

/**
 * Flujo 10: aislamiento del doble ciego con varios revisores y una cuenta Autor–Revisor.
 * Un manuscrito de Derecho tiene exactamente dos candidatos (el revisor de Derecho y la cuenta
 * Autor–Revisor), así que ambos lo reciben. Uno reporta una posible fuga de identidad; el
 * reporte llega solo al Administrador, que pide una versión anonimizada. El Autor nunca llega a
 * conocer a ningún revisor (ni que existió un reporte), en pantalla, árbol accesible ni respuestas.
 */
test.describe('Flujo 10 — fuga de identidad y aislamiento del doble ciego', () => {
  let scenario: Scenario;
  let author: Api;

  test.beforeAll(async () => {
    author = await Api.login('author');
    scenario = await submitManuscript(author, `Anonimización de manuscritos ${RUN}`, LAW);
  });

  test.afterAll(async () => {
    await author.dispose();
  });

  test('la cuenta Autor–Revisor revisa lo ajeno y no ve la identidad del Autor', async ({
    page,
  }) => {
    const pool = await loginAll(LAW_POOL);
    const reviewers = await reviewersOf(pool, scenario.code);
    expect(reviewers.map((r) => r.who).sort()).toEqual([...LAW_POOL].sort());

    // El documento que recibe el Revisor no lleva la identidad del Autor.
    for (const reviewer of reviewers) {
      const row = await activeRow(reviewer, scenario.code);
      const pdf = await reviewer.get(`reviewer/assignments/${row.id}/document/`);
      expect(pdf.status()).toBe(200);
      const bytes = (await pdf.body()).toString('latin1');
      for (const token of AUTHOR_TOKENS) {
        expect(bytes).not.toContain(token);
      }
      // Ni la ficha ni la lista del Revisor traen al Autor, a otros revisores ni sus correos.
      const detail = await (await reviewer.get(`reviewer/assignments/${row.id}/`)).text();
      for (const token of [...AUTHOR_TOKENS, ...REVIEWER_TOKENS]) {
        expect(detail, `la ficha no debe contener «${token}»`).not.toContain(token);
      }
    }
    await Promise.all(pool.map((api) => api.dispose()));

    // Como Revisora (rol dual) ve el manuscrito ajeno, sin autores, en pantalla y árbol accesible.
    await loginUi(page, 'authorReviewer');
    await page.goto('/app/reviewer/assignments');
    await page.getByRole('link', { name: scenario.code, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible();
    await expect(page.locator('.data')).toContainText(LAW.name);
    const seen = await visibleText(page);
    const tree = await page.locator('body').ariaSnapshot();
    for (const token of AUTHOR_TOKENS) {
      expect(seen).not.toContain(token);
      expect(tree).not.toContain(token);
    }
    // Tampoco ve al otro revisor de la misma versión.
    expect(seen).not.toContain(ACCOUNTS.reviewerLaw.name);
  });

  test('el reporte llega solo al Administrador y el Autor recibe una nueva ronda sin saber del Revisor', async ({
    browser,
  }) => {
    // 1. El revisor de Derecho reporta una posible fuga de identidad.
    const reviewerPage = await (await browser.newContext()).newPage();
    await loginUi(reviewerPage, 'reviewerLaw');
    await reviewerPage.goto('/app/reviewer/assignments');
    await reviewerPage.getByRole('link', { name: scenario.code, exact: true }).click();
    await reviewerPage
      .getByRole('button', { name: 'Reportar posible fuga de identidad' })
      .click();
    const dialog = reviewerPage.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Posible fuga de identidad/ }).check();
    await dialog
      .getByLabel(/Descripción/)
      .fill('El texto del PDF menciona la afiliación de los autores.');
    await dialog.getByRole('button', { name: 'Enviar reporte confidencial' }).click();
    await expect(
      reviewerPage.getByText(/reporte.*(enviado|registrado)|enviado.*reporte/i).first(),
    ).toBeVisible();

    // 2. El Administrador lo ve, con quién reportó, y solicita una versión anonimizada.
    const adminPage = await (await browser.newContext()).newPage();
    await loginUi(adminPage, 'admin');
    await adminPage.goto('/app/admin/incidents');
    const incident = adminPage.locator('li.incident').filter({ hasText: scenario.code });
    await expect(incident).toContainText(ACCOUNTS.reviewerLaw.name);
    await incident
      .getByRole('button', {
        name: new RegExp(`Solicitar versión anonimizada del reporte de ${scenario.code}`),
      })
      .click();
    await adminPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Solicitar versión anonimizada' })
      .click();
    await expect(adminPage.getByText(/Versión anonimizada solicitada|ronda/i).first()).toBeVisible();
    // El reporte resuelto queda en «Resueltos» con quién lo resolvió.
    await adminPage.getByRole('link', { name: 'Resueltos' }).click();
    await expect(
      adminPage.locator('li.incident').filter({ hasText: scenario.code }),
    ).toContainText(ACCOUNTS.admin.name);

    // 3. El Autor ve una nueva ronda de cambios y nada que identifique a ningún revisor.
    const authorPage = await (await browser.newContext()).newPage();
    await loginUi(authorPage, 'author');
    await authorPage.goto(`/app/author/manuscripts/${scenario.id}`);
    await expect(authorPage.getByText('Cambios solicitados').first()).toBeVisible();
    for (const path of [
      `/app/author/manuscripts/${scenario.id}`,
      `/app/author/manuscripts/${scenario.id}/history`,
      '/app/notifications',
    ]) {
      await authorPage.goto(path);
      await authorPage.waitForLoadState('networkidle');
      await authorPage.locator('summary').filter({ hasText: 'Mi cuenta' }).click();
      const seen = await visibleText(authorPage);
      const tree = await authorPage.locator('body').ariaSnapshot();
      // Control positivo: la página sí cargó (muestra al propio Autor), así que la ausencia es real.
      expect(seen).toContain('Marcela');
      for (const token of REVIEWER_TOKENS) {
        expect(seen, `${path} no debe contener «${token}»`).not.toContain(token);
        expect(tree, `${path} (árbol accesible) no debe contener «${token}»`).not.toContain(token);
      }
    }
    // Las respuestas de la API que usa el Autor tampoco traen identidades.
    for (const path of [
      `manuscripts/${scenario.id}/`,
      `manuscripts/${scenario.id}/history/`,
      'notifications/',
    ]) {
      const body = await (await author.get(path)).text();
      for (const token of REVIEWER_TOKENS) {
        expect(body, `GET ${path} no debe contener «${token}»`).not.toContain(token);
      }
    }
    // La cuenta del Autor es compartida: se revisan solo los avisos de ESTE manuscrito.
    const notices = authorPage.locator('app-notification-item').filter({ hasText: scenario.code });
    await authorPage.goto('/app/notifications');
    await expect(notices.first()).toBeVisible();
    for (const text of await notices.allInnerTexts()) {
      expect(text.toLowerCase()).not.toMatch(/fuga|reporte|incidente/);
    }
    await authorPage.goto(`/app/author/manuscripts/${scenario.id}`);
    expect((await visibleText(authorPage)).toLowerCase()).not.toMatch(/fuga|reporte|incidente/);

    for (const page of [reviewerPage, adminPage, authorPage]) {
      await page.context().close();
    }
  });

  test('ningún revisor ve las evaluaciones ni la identidad de otro', async () => {
    const who: Who[] = ['reviewerLaw', 'authorReviewer'];
    for (const account of who) {
      const reviewer = await Api.login(account);
      const body = await (await reviewer.get('reviewer/assignments/?page_size=100')).text();
      for (const other of who.filter((w) => w !== account)) {
        expect(body).not.toContain(ACCOUNTS[other].name);
      }
      await reviewer.dispose();
    }
  });
});
