import { expect, Page } from '@playwright/test';

import { ACCOUNTS, PASSWORD, Who } from './env';

/** Inicia sesión por la pantalla real y espera el panel. */
export async function loginUi(page: Page, who: Who): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Identificador institucional').fill(ACCOUNTS[who].id);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Panel unificado' })).toBeVisible();
}

export async function logoutUi(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Texto completo visible de la página (para comprobar que no hay identidades). */
export async function visibleText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

/** Abre un panel plegable por su resumen, si está cerrado. */
async function openPanel(page: Page, name: 'Filtros' | 'Más acciones'): Promise<void> {
  const panel = page
    .locator('details.disclosure')
    .filter({ has: page.locator('summary', { hasText: name }) });
  if (!(await panel.evaluate((details: HTMLDetailsElement) => details.open))) {
    await panel.locator('summary').click();
  }
  await expect(panel).toHaveAttribute('open', '');
}

/** Panel «Filtros» de los listados y del catálogo. */
export async function openFilters(page: Page): Promise<void> {
  await openPanel(page, 'Filtros');
}

/** Panel «Más acciones» de un detalle: ahí está «Dar de baja». */
export async function openMoreActions(page: Page): Promise<void> {
  await openPanel(page, 'Más acciones');
}

/**
 * Filtra la auditoría por acción (código) y manuscrito SIN recargar la página:
 * cada recarga completa de la SPA rota la cookie de sesión y encadenarlas es frágil.
 */
export async function filterAudit(page: Page, action: string, manuscriptId: string): Promise<void> {
  await openFilters(page);
  await page.getByLabel('Acción').fill(action);
  await page.getByLabel('Manuscrito (id)').fill(manuscriptId);
  await page.getByRole('button', { name: 'Filtrar' }).click();
}

/** Los cinco criterios de la rúbrica, con el nombre que ve el Revisor. */
export const CRITERIA = [
  'Pertinencia y Contribución Científica',
  'Rigor Metodológico y Reproducibilidad',
  'Estado del Arte y Sustento Bibliográfico',
  'Validez de Resultados y Conclusiones',
  'Redacción Académica y Estructura Formal',
] as const;

/** Elige un nivel (1 a 5) de un criterio en el formulario de evaluación. */
export async function scoreCriterion(page: Page, criterion: string, score: number): Promise<void> {
  await page
    .getByRole('group', { name: new RegExp(`^${criterion}`) })
    .locator('label')
    .filter({ hasText: new RegExp(`^\\s*${score} · `) })
    .click();
}

/** Llena la rúbrica completa, el dictamen y los comentarios; no envía. */
export async function fillRubric(
  page: Page,
  scores: readonly number[],
  verdict: 'Aceptar' | 'Revisión menor' | 'Revisión mayor' | 'Rechazar',
  comments: string,
): Promise<void> {
  for (const [index, criterion] of CRITERIA.entries()) {
    await scoreCriterion(page, criterion, scores[index]);
  }
  await page.getByRole('radio', { name: new RegExp(`^${verdict}`) }).check();
  await page.getByLabel('Comentarios para el Autor').fill(comments);
}

/** Declara la ausencia de conflicto y confirma el envío definitivo. */
export async function sendEvaluation(page: Page): Promise<void> {
  await page
    .getByLabel('Declaro que no tengo ningún conflicto de interés con este manuscrito.')
    .check();
  await page.getByRole('button', { name: 'Enviar evaluación' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar evaluación' }).click();
  await expect(page.getByRole('heading', { name: 'Evaluación enviada' })).toBeVisible();
}

/** Número que muestra una métrica de «Mi desempeño» (por ejemplo, el puntaje de ranking). */
export async function standingMetric(page: Page, label: string): Promise<string> {
  const metric = page.locator('.kpi-card__metric').filter({ hasText: label });
  return (await metric.locator('dd').first().innerText()).trim();
}

/** «3/5»: asignaciones activas sobre el tope, tal como se ven en «Mi desempeño». */
export async function activeSlots(page: Page): Promise<string> {
  const metric = page.locator('.kpi-card__metric').filter({ hasText: 'Asignaciones activas' });
  return (await metric.locator('dd [aria-hidden="true"]').first().innerText()).trim();
}
