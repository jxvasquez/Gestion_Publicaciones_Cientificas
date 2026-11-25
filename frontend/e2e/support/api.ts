import { APIRequestContext, APIResponse, expect, request } from '@playwright/test';

import { ACCOUNTS, COMPUTING, COMPUTING_POOL, PASSWORD, Who } from './env';
import { makePdf } from './pdf';

/**
 * Carga de dominio de una respuesta exitosa de la API. Con el contrato universal
 * `{ success, message, data, errors, meta }` devuelve `data`, o la página
 * `{ count, next, previous, results }` si `meta.pagination` está presente.
 */
export async function payload(res: APIResponse): Promise<any> {
  const body = await res.json();
  if (body?.success !== true || !('data' in body)) {
    return body;
  }
  const { pagination, request_id: _requestId, ...extras } = body.meta ?? {};
  return pagination ? { ...pagination, results: body.data, ...extras } : body.data;
}

/**
 * Cliente de la API para PREPARAR el escenario de un flujo (llegar al punto en que
 * empieza la parte que se prueba por la pantalla). Lo que se prueba va por la UI.
 */
export class Api {
  constructor(
    private readonly ctx: APIRequestContext,
    private readonly bearer: string,
    readonly userId: string,
    readonly who: Who,
  ) {}

  static async login(who: Who): Promise<Api> {
    const ctx = await request.newContext({ ignoreHTTPSErrors: true });
    const base = process.env['E2E_BASE_URL'] ?? 'https://localhost:20443';
    const res = await ctx.post(`${base}/api/v1/auth/login/`, {
      data: { identifier: ACCOUNTS[who].id, password: PASSWORD },
    });
    expect(res.status(), `login de ${who}`).toBe(200);
    const body = await payload(res);
    const me = await ctx.get(`${base}/api/v1/auth/me/`, {
      headers: { Authorization: `Bearer ${body.access}` },
    });
    return new Api(ctx, body.access, (await payload(me)).user.id, who);
  }

  private url(path: string): string {
    return `${process.env['E2E_BASE_URL'] ?? 'https://localhost:20443'}/api/v1/${path}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.bearer}`, ...extra };
  }

  async get(path: string) {
    return this.ctx.get(this.url(path), { headers: this.headers() });
  }

  async post(path: string, data: unknown = {}, headers: Record<string, string> = {}) {
    return this.ctx.post(this.url(path), { data, headers: this.headers(headers) });
  }

  async put(path: string, data: unknown, headers: Record<string, string> = {}) {
    return this.ctx.put(this.url(path), { data, headers: this.headers(headers) });
  }

  async upload(path: string, filename: string, pdf: Buffer) {
    return this.ctx.post(this.url(path), {
      headers: this.headers(),
      multipart: { file: { name: filename, mimeType: 'application/pdf', buffer: pdf } },
    });
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}

export interface Scenario {
  id: string;
  code: string;
  title: string;
}

const key = (): string => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Un manuscrito del Autor, enviado (v1, ronda 0): borrador + PDF + envío. Se asigna solo. */
export async function submitManuscript(
  author: Api,
  title: string,
  area: { code: string } = COMPUTING,
): Promise<Scenario> {
  const me = (await payload(await author.get('auth/me/'))).user;
  const created = await author.post('manuscripts/', {
    title,
    abstract: 'Resumen del estudio de campo sobre cultivos de altura.',
    keywords: ['clima', 'cultivos'],
    areas: [area.code],
    language: 'es',
    authors: [
      {
        full_name: me.full_name ?? ACCOUNTS.author.name,
        email: me.email,
        affiliation: 'Universidad Nacional de Loja',
        is_corresponding: true,
      },
    ],
  });
  expect(created.status(), await created.text()).toBe(201);
  const manuscript = await payload(created);
  await sendVersion(author, manuscript.id, title);
  const detail = await payload(await author.get(`manuscripts/${manuscript.id}/`));
  return { id: manuscript.id, code: detail.code, title };
}

/** Adjunta un PDF único y envía el manuscrito (la primera versión o una nueva ronda). */
export async function sendVersion(author: Api, manuscriptId: string, token: string) {
  const uploaded = await author.upload(
    `manuscripts/${manuscriptId}/draft-file/`,
    'articulo.pdf',
    makePdf(`${token}-${key()}`),
  );
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const sent = await author.post(
    `manuscripts/${manuscriptId}/submit/`,
    {},
    { 'Idempotency-Key': key() },
  );
  expect(sent.status(), await sent.text()).toBe(201);
}

/** Inicia sesión con cada cuenta de un grupo (la asignación es automática: se descubre quién recibió qué). */
export async function loginAll(pool: readonly Who[]): Promise<Api[]> {
  return Promise.all(pool.map((who) => Api.login(who)));
}

/** Filas de asignaciones ACTIVAS del Revisor para un manuscrito (código GPC-…). */
export async function activeRow(reviewer: Api, code: string) {
  const list = await payload(await reviewer.get('reviewer/assignments/?page_size=100'));
  return list.results.find(
    (r: { manuscript_code: string; status: string }) =>
      r.manuscript_code === code && r.status === 'ACTIVE',
  );
}

/** Los revisores del grupo con una asignación activa sobre el manuscrito, en el orden del grupo. */
export async function reviewersOf(pool: Api[], code: string): Promise<Api[]> {
  const found: Api[] = [];
  for (const reviewer of pool) {
    if (await activeRow(reviewer, code)) {
      found.push(reviewer);
    }
  }
  return found;
}

/** Rúbrica de un trabajo sólido: todo alto y dictamen de aceptación (basta un comentario breve). */
export const EVALUATION = {
  scientific_contribution: 4,
  methodological_rigor: 4,
  literature_grounding: 5,
  results_conclusions: 4,
  academic_writing: 5,
  recommendation: 'ACCEPTED',
  comments_for_author: 'Trabajo sólido, con matices menores por resolver.',
};

/** Texto de justificación de al menos 100 caracteres (exigido con puntajes bajos o dictámenes severos). */
export const LONG_COMMENT =
  'La metodología no sostiene las conclusiones: faltan controles, el tamaño de la muestra es insuficiente y no se describe la reproducibilidad.';

/** El Revisor guarda y envía su evaluación final de la asignación activa del manuscrito. */
export async function evaluate(reviewer: Api, code: string, overrides = {}) {
  const row = await activeRow(reviewer, code);
  expect(row, `${reviewer.who} no tiene asignación activa sobre ${code}`).toBeTruthy();
  const base = `reviewer/assignments/${row.id}/evaluation/`;
  const saved = await reviewer.put(base, { ...EVALUATION, ...overrides }, { 'If-Match': '"0"' });
  expect(saved.status(), await saved.text()).toBe(200);
  const sent = await reviewer.post(`${base}submit/`, {}, { 'If-Match': saved.headers()['etag'] });
  expect(sent.status(), await sent.text()).toBe(200);
}

/** Estado del manuscrito visto por el Autor. */
export async function statusOf(author: Api, manuscriptId: string): Promise<string> {
  return (await payload(await author.get(`manuscripts/${manuscriptId}/`))).status;
}

/** Espera (la decisión por consenso se calcula al confirmar la última evaluación) a que el estado cambie. */
export async function waitForStatus(author: Api, manuscriptId: string, expected: string) {
  await expect
    .poll(() => statusOf(author, manuscriptId), { timeout: 20_000, message: `estado ${expected}` })
    .toBe(expected);
}

export { COMPUTING_POOL };
