import { expect, test } from '@playwright/test';

import { Api, loginAll, reviewersOf, evaluate } from './support/api';
import {
  AUTHOR_TOKENS,
  COMPUTING,
  COMPUTING_POOL,
  REVIEWER_TOKENS,
  RUN,
  Who,
} from './support/env';
import { makePdf } from './support/pdf';
import {
  activeSlots,
  fillRubric,
  filterAudit,
  loginUi,
  sendEvaluation,
  standingMetric,
  visibleText,
} from './support/ui';

/**
 * Flujos 2 a 8 como UNA historia, de punta a punta por las pantallas reales, sin Editor:
 * el Autor envía y el sistema asigna a dos revisores de su carrera; un Revisor evalúa por la
 * pantalla (rúbrica de cinco criterios) y el otro por la API; con dos «Aceptar» el consenso
 * decide Aceptado y publica; el público lo encuentra y descarga, el Autor lo retira y el
 * Administrador ve la huella en la auditoría.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Flujos 2 a 8 — del envío al retiro', () => {
  const title = `Glaciares tropicales del Chimborazo ${RUN}`;
  let code = '';
  let manuscriptUrl = '';
  let manuscriptId = '';
  let assigned: Who[] = [];
  let scoreBefore = 0;

  test('2. El Autor crea el borrador, elige su carrera, adjunta el PDF y lo envía', async ({
    page,
  }) => {
    await loginUi(page, 'author');
    await page.goto('/app/author/manuscripts/new');

    await page.getByLabel('Título').fill(title);
    await page
      .getByLabel('Resumen')
      .fill('Estudio del retroceso glaciar en el volcán durante dos décadas.');
    await page.getByLabel('Palabras clave').fill('glaciares, clima');
    // La carrera se elige de un catálogo cerrado (casillas), con un máximo de tres.
    const areas = page.getByRole('group', { name: /Carreras o áreas/ });
    await areas.getByLabel(COMPUTING.name).check();
    await expect(page.locator('#areas-count')).toContainText('1 de 3');
    await page.getByLabel('Idioma (código de dos letras)').fill('es');
    await page.getByLabel('Filiación').first().fill('Universidad Nacional de Loja');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();

    await expect(page).toHaveURL(/\/app\/author\/manuscripts\/[0-9a-f-]{36}$/);
    manuscriptUrl = new URL(page.url()).pathname;
    manuscriptId = manuscriptUrl.split('/').pop() ?? '';
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(COMPUTING.name).first()).toBeVisible();

    await page.locator('#pdf-file').setInputFiles({
      name: 'mi-articulo.pdf',
      mimeType: 'application/pdf',
      buffer: makePdf(`ciclo-${RUN}`),
    });
    await page.locator('.uploader__actions .btn--success').click();
    await expect(page.getByText('mi-articulo.pdf').first()).toBeVisible();

    await page.getByRole('button', { name: 'Enviar manuscrito' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar manuscrito' }).click();

    const confirmation = page.getByRole('status').filter({ hasText: 'Código de seguimiento' });
    await expect(confirmation).toBeVisible();
    code = (
      await confirmation.locator('dt:has-text("Código de seguimiento") + dd').innerText()
    ).trim();
    expect(code).toMatch(/^GPC-\d{4}-\d{6}$/);
    await expect(confirmation).toContainText('v1');
  });

  test('3. El sistema asigna solo a dos revisores de la carrera y el Autor lo ve «En revisión»', async ({
    page,
  }) => {
    const pool = await loginAll(COMPUTING_POOL);
    const reviewers = await reviewersOf(pool, code);
    // Exactamente dos, sin ninguna intervención: no hay Editor que pase a revisión ni asigne.
    expect(reviewers).toHaveLength(2);
    assigned = reviewers.map((reviewer) => reviewer.who);
    await Promise.all(pool.map((api) => api.dispose()));

    await loginUi(page, 'author');
    await page.goto(manuscriptUrl);
    await expect(page.getByText('En revisión').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Pasar a revisión|Asignar Revisor/ })).toHaveCount(0);
  });

  test('4. El primer Revisor ve su cupo X/5 y el manuscrito anonimizado, y envía la rúbrica', async ({
    page,
  }) => {
    await loginUi(page, assigned[0]);
    await page.goto('/app/reviewer/assignments');
    await expect(page.getByRole('heading', { name: 'Mi desempeño' })).toBeVisible();
    expect(await activeSlots(page)).toMatch(/^[1-5]\/5$/);
    scoreBefore = Number(await standingMetric(page, 'Puntaje de ranking'));
    expect(scoreBefore).toBeGreaterThanOrEqual(100);

    await page.getByRole('link', { name: code, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('.data')).toContainText(COMPUTING.name);
    const pdf = page.waitForResponse((r) =>
      /\/reviewer\/assignments\/.+\/document\//.test(r.url()),
    );
    await page.getByRole('button', { name: 'Descargar PDF' }).click();
    const response = await pdf;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');

    // Doble ciego: ni el Autor ni su correo aparecen en lo que ve el Revisor.
    const seen = await visibleText(page);
    for (const token of AUTHOR_TOKENS) {
      expect(seen).not.toContain(token);
    }

    await page.getByRole('link', { name: 'Evaluar manuscrito' }).click();
    // No existe el campo de comentarios confidenciales para el Editor.
    await expect(page.getByLabel(/confidenciales/i)).toHaveCount(0);
    await fillRubric(page, [4, 4, 5, 4, 5], 'Aceptar', 'Trabajo sólido, con matices menores.');
    await sendEvaluation(page);
  });

  test('5. Su ranking sube 10 puntos por entregar a tiempo y el cupo baja', async ({ page }) => {
    await loginUi(page, assigned[0]);
    await page.goto('/app/reviewer/assignments');
    await expect(page.getByRole('heading', { name: 'Mi desempeño' })).toBeVisible();
    expect(Number(await standingMetric(page, 'Puntaje de ranking'))).toBe(scoreBefore + 10);
    await expect(page.getByText('+10 a tiempo').first()).toBeVisible();
  });

  test('6. Con la segunda evaluación «Aceptar» el consenso decide Aceptado y publica', async ({
    page,
    browser,
  }) => {
    const second = await Api.login(assigned[1]);
    await evaluate(second, code);
    await second.dispose();

    await loginUi(page, 'author');
    await page.goto(manuscriptUrl);
    await expect(page.getByRole('heading', { name: 'Resultado de la evaluación' })).toBeVisible();
    await expect(page.getByText('Decisión:')).toBeVisible();
    await expect(page.getByText('Aceptado').first()).toBeVisible();
    // El Autor lee las reseñas como «Revisor N», sin identidad alguna.
    await expect(page.getByRole('heading', { name: 'Revisor 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisor 2' })).toBeVisible();
    const seen = await visibleText(page);
    for (const token of REVIEWER_TOKENS) {
      expect(seen, `no debe contener «${token}»`).not.toContain(token);
    }

    // Y el artículo aparece en el catálogo público sin que nadie lo registre a mano.
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const visitor = await context.newPage();
    await visitor.goto(`/catalog/${code}`);
    await expect(visitor.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(visitor.getByText(COMPUTING.name).first()).toBeVisible();
    await context.close();
  });

  test('7. El público busca, abre la ficha y descarga el PDF sin iniciar sesión', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto('/catalog');
    await page.getByRole('searchbox', { name: 'Buscar' }).fill('Chimborazo');
    await page.getByRole('searchbox', { name: 'Buscar' }).press('Enter');
    await page.getByRole('link', { name: title }).click();

    await expect(page).toHaveURL(new RegExp(`/catalog/${code}$`));
    const pdf = page.waitForResponse((r) => r.url().includes(`/api/v1/catalog/${code}/document/`));
    await page.getByRole('button', { name: 'Ver el documento (PDF)' }).click();
    const response = await pdf;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    await expect(page.getByRole('link', { name: 'Mis manuscritos' })).toHaveCount(0);
    await context.close();
  });

  test('8. El Autor da de baja el manuscrito y desaparece del catálogo', async ({
    page,
    browser,
  }) => {
    await loginUi(page, 'author');
    await page.goto(manuscriptUrl);
    await page.getByRole('button', { name: 'Dar de baja' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Motivo de la baja/).fill('Retiro voluntario de los autores.');
    await dialog.getByRole('button', { name: 'Confirmar baja' }).click();
    await expect(page.getByText(/dado de baja|dada de baja/i).first()).toBeVisible();

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const visitor = await context.newPage();
    await visitor.goto(`/catalog/${code}`);
    await expect(visitor.getByRole('heading', { name: 'Artículo no disponible' })).toBeVisible();
    await context.close();

    await page.goto(`${manuscriptUrl}/history`);
    await expect(page.getByText('v1').first()).toBeVisible();
  });

  test('9. El Administrador ve en la auditoría la asignación automática, el veredicto y la baja', async ({
    page,
  }) => {
    await loginUi(page, 'admin');
    await page.goto('/app/admin/audit');
    const trail: [string, string, number][] = [
      ['AUTO_ASSIGNMENT_CREATED', 'Revisor asignado por el sistema', 2],
      ['VERDICT_REGISTERED', 'Veredicto registrado', 1],
      ['CATALOG_DOCUMENT_DOWNLOADED', 'PDF del catálogo descargado', 1],
      ['MANUSCRIPT_WITHDRAWN', 'Manuscrito retirado', 1],
    ];
    for (const [action, label, count] of trail) {
      await filterAudit(page, action, manuscriptId);
      const rows = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: new RegExp(`^${label}`) }) });
      await expect(rows.first()).toContainText(code);
      await expect(rows).toHaveCount(count);
    }
    // El Administrador no tiene acceso a manuscritos: ni menú ni pantalla.
    await page.goto('/app/author/manuscripts');
    await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
  });
});
