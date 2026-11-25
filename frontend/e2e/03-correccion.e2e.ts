import { expect, test } from '@playwright/test';

import {
  Api,
  evaluate,
  LONG_COMMENT,
  loginAll,
  reviewersOf,
  Scenario,
  statusOf,
  submitManuscript,
  waitForStatus,
} from './support/api';
import { COMPUTING_POOL, RUN } from './support/env';
import { makePdf } from './support/pdf';
import { fillRubric, filterAudit, loginUi, sendEvaluation } from './support/ui';

/**
 * Flujo 9: el consenso automático y sus salidas, sin Editor.
 *  A. Dos «Revisión menor» → «Cambios solicitados»; el Autor sube la v2 y el sistema asigna de nuevo.
 *  B. Un «Aceptar» y un «Rechazar» abren el desempate: un tercer revisor se asigna solo y decide por
 *     mayoría. Una justificación de menos de 100 caracteres no se envía.
 *  C. El Administrador corrige el veredicto y el historial conserva ambas decisiones.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Flujo 9 — consenso, desempate y corrección administrativa', () => {
  let author: Api;
  let pool: Api[];

  test.beforeAll(async () => {
    author = await Api.login('author');
    pool = await loginAll(COMPUTING_POOL);
  });

  test.afterAll(async () => {
    await Promise.all([author, ...pool].map((api) => api.dispose()));
  });

  test.describe('A. Revisión menor → Cambios solicitados → versión 2', () => {
    let scenario: Scenario;

    test('dos «Revisión menor» dan «Cambios solicitados» y el Autor lee dos reseñas anónimas', async ({
      page,
    }) => {
      scenario = await submitManuscript(author, `Revisión menor ${RUN}`);
      const reviewers = await reviewersOf(pool, scenario.code);
      expect(reviewers).toHaveLength(2);
      for (const reviewer of reviewers) {
        await evaluate(reviewer, scenario.code, {
          recommendation: 'MINOR_REVISION',
          comments_for_author: 'Ajustar la redacción de la discusión y ampliar las referencias.',
        });
      }
      await waitForStatus(author, scenario.id, 'CHANGES_REQUESTED');

      await loginUi(page, 'author');
      await page.goto(`/app/author/manuscripts/${scenario.id}`);
      await expect(page.getByText('Cambios solicitados').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Revisor 1' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Revisor 2' })).toBeVisible();
    });

    test('el Autor sube la versión 2 y el sistema asigna de nuevo a dos revisores', async ({
      page,
    }) => {
      await loginUi(page, 'author');
      await page.goto(`/app/author/manuscripts/${scenario.id}`);
      await page.locator('#pdf-file').setInputFiles({
        name: 'version-2.pdf',
        mimeType: 'application/pdf',
        buffer: makePdf(`v2-${RUN}`),
      });
      await page.locator('.uploader__actions .btn--success').click();
      await expect(page.getByText('v2').first()).toBeVisible();

      await waitForStatus(author, scenario.id, 'UNDER_REVIEW');
      expect(await reviewersOf(pool, scenario.code)).toHaveLength(2);
    });
  });

  test.describe('B. Contradicción 1 contra 1 → desempate automático', () => {
    let scenario: Scenario;

    test('«Aceptar» contra «Rechazar» abre el desempate y asigna a un tercer revisor', async ({
      page,
    }) => {
      scenario = await submitManuscript(author, `Desempate ${RUN}`);
      const [first, second] = await reviewersOf(pool, scenario.code);
      await evaluate(first, scenario.code);
      await evaluate(second, scenario.code, {
        scientific_contribution: 2,
        methodological_rigor: 2,
        literature_grounding: 3,
        results_conclusions: 2,
        academic_writing: 3,
        recommendation: 'REJECTED',
        comments_for_author: LONG_COMMENT,
      });
      await waitForStatus(author, scenario.id, 'TIE_BREAKER');

      // El tercero se asigna solo, distinto de los dos primeros.
      const tieBreakers = await reviewersOf(pool, scenario.code);
      expect(tieBreakers).toHaveLength(1);
      expect([first.who, second.who]).not.toContain(tieBreakers[0].who);

      await loginUi(page, 'author');
      await page.goto(`/app/author/manuscripts/${scenario.id}`);
      await expect(page.getByText('En desempate').first()).toBeVisible();
      // Todavía no hay resultado que mostrar: un solo dictamen no decide.
      await expect(page.getByRole('heading', { name: 'Resultado de la evaluación' })).toHaveCount(0);
    });

    test('la justificación de menos de 100 caracteres no se envía y con 100 el desempate decide', async ({
      page,
    }) => {
      const [tieBreaker] = await reviewersOf(pool, scenario.code);
      await loginUi(page, tieBreaker.who);
      await page.goto('/app/reviewer/assignments');
      await page.getByRole('link', { name: scenario.code, exact: true }).click();
      await page.getByRole('link', { name: 'Evaluar manuscrito' }).click();

      const short = 'x'.repeat(99);
      await fillRubric(page, [2, 2, 3, 2, 3], 'Rechazar', short);
      await expect(page.locator('.counter')).toContainText('99/100');
      await page
        .getByLabel('Declaro que no tengo ningún conflicto de interés con este manuscrito.')
        .check();
      await page.getByRole('button', { name: 'Enviar evaluación' }).click();
      await expect(page.getByRole('alert').filter({ hasText: /100/ }).first()).toBeVisible();
      await expect(page.getByRole('dialog')).toBeHidden();

      await page.getByLabel('Comentarios para el Autor').fill(LONG_COMMENT);
      await expect(page.locator('.counter')).toContainText(`${LONG_COMMENT.length}/100`);
      await sendEvaluation(page);

      // Dos «Rechazar» contra un «Aceptar»: decide la mayoría.
      await waitForStatus(author, scenario.id, 'REJECTED');
    });
  });

  test.describe('C. El Administrador corrige el veredicto', () => {
    test('corrige Rechazado → Aceptado y el historial conserva las dos decisiones', async ({
      browser,
    }) => {
      const scenario = await submitManuscript(author, `Corrección de veredicto ${RUN}`);
      const reviewers = await reviewersOf(pool, scenario.code);
      for (const reviewer of reviewers) {
        await evaluate(reviewer, scenario.code, {
          scientific_contribution: 2,
          methodological_rigor: 2,
          literature_grounding: 3,
          results_conclusions: 2,
          academic_writing: 2,
          recommendation: 'REJECTED',
          comments_for_author: LONG_COMMENT,
        });
      }
      await waitForStatus(author, scenario.id, 'REJECTED');

      const adminPage = await (await browser.newContext()).newPage();
      await loginUi(adminPage, 'admin');
      await adminPage.goto('/app/admin/audit');
      await filterAudit(adminPage, 'VERDICT_REGISTERED', scenario.id);
      await adminPage.getByRole('link', { name: /Ver detalle/ }).first().click();

      await adminPage.getByRole('button', { name: 'Corregir veredicto' }).click();
      const dialog = adminPage.getByRole('dialog');
      // Sin decisión ni motivo no se envía nada.
      await dialog.getByRole('button', { name: 'Corregir veredicto' }).click();
      await expect(dialog.getByRole('alert').first()).toBeVisible();
      await dialog.getByRole('radio', { name: 'Aceptado' }).check();
      await dialog
        .getByLabel(/Motivo/)
        .fill('El dictamen se registró sobre una evaluación equivocada; se corrige.');
      await dialog.getByRole('button', { name: 'Corregir veredicto' }).click();
      await expect(adminPage.getByText(/Veredicto corregido/).first()).toBeVisible();

      // El Autor ve la decisión vigente y el catálogo la sigue.
      await waitForStatus(author, scenario.id, 'ACCEPTED');
      expect(await statusOf(author, scenario.id)).toBe('ACCEPTED');
      const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
      await visitor.goto(`/catalog/${scenario.code}`);
      await expect(visitor.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible();

      // La auditoría conserva el veredicto original y la corrección: nada se borra.
      await adminPage.goto('/app/admin/audit');
      const trail: [string, string][] = [
        ['VERDICT_REGISTERED', 'Veredicto registrado'],
        ['VERDICT_CORRECTED', 'Veredicto corregido'],
      ];
      for (const [action, label] of trail) {
        await filterAudit(adminPage, action, scenario.id);
        const rows = adminPage
          .getByRole('row')
          .filter({ has: adminPage.getByRole('cell', { name: new RegExp(`^${label}`) }) });
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(scenario.code);
      }
      await adminPage.context().close();
      await visitor.context().close();
    });
  });
});
