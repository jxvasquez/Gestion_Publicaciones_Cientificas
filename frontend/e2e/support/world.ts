import {
  Api,
  COMPUTING_POOL,
  evaluate,
  loginAll,
  payload,
  reviewersOf,
  Scenario,
  submitManuscript,
  waitForStatus,
} from './api';
import { COMPUTING, RUN, Who } from './env';

/** Datos con los que las pruebas de accesibilidad, teclado y responsive recorren cada pantalla. */
export interface World {
  review: Scenario; // en revisión, con dos asignaciones activas
  accepted: Scenario; // aceptado por consenso y publicado
  draftId: string; // borrador editable
  reviewerWho: Who; // el revisor que tiene la asignación activa sobre `review`
  assignmentId: string; // su asignación
  auditEventId: string; // un evento de auditoría cualquiera
}

export async function buildWorld(tag: string): Promise<World> {
  const author = await Api.login('author');
  const pool = await loginAll(COMPUTING_POOL);

  const review = await submitManuscript(author, `${tag} en revisión ${RUN}`);
  const [holder] = await reviewersOf(pool, review.code);
  const rows = await payload(await holder.get('reviewer/assignments/?page_size=100'));
  const assignmentId = rows.results.find(
    (r: { manuscript_code: string }) => r.manuscript_code === review.code,
  ).id;
  // Un reporte abierto para que la pantalla de incidentes del Administrador tenga datos.
  const leak = await holder.post(`reviewer/assignments/${assignmentId}/identity-leak/`, {
    report_type: 'OTHER',
    description: 'Texto de prueba del reporte confidencial para las verificaciones de pantalla.',
  });
  if (leak.status() !== 201) {
    throw new Error(`No se pudo crear el reporte del escenario: ${await leak.text()}`);
  }

  const accepted = await submitManuscript(author, `${tag} aceptado ${RUN}`);
  for (const reviewer of await reviewersOf(pool, accepted.code)) {
    await evaluate(reviewer, accepted.code);
  }
  await waitForStatus(author, accepted.id, 'ACCEPTED');

  const draft = await author.post('manuscripts/', {
    title: `${tag} borrador ${RUN}`,
    abstract: 'Resumen del borrador.',
    keywords: ['accesibilidad'],
    areas: [COMPUTING.code],
    language: 'es',
    authors: [
      {
        full_name: 'Marcela Quizhpe Ordóñez',
        email: 'e2e-autor@e2e.unl.edu.ec',
        affiliation: 'UNL',
        is_corresponding: true,
      },
    ],
  });
  const draftId = (await payload(draft)).id;
  const admin = await Api.login('admin');
  const audit = await payload(await admin.get('admin/audit/?page_size=1'));
  const auditEventId = audit.results[0].id;
  await Promise.all([author, admin, ...pool].map((api) => api.dispose()));
  return {
    review,
    accepted,
    draftId,
    reviewerWho: holder.who,
    assignmentId,
    auditEventId,
  };
}

export type Role = 'author' | 'reviewer' | 'admin';
export type Screen = { role: Role | null; name: string; path: string };

/** Con qué cuenta se entra por cada rol (el revisor es el que recibió la asignación). */
export function accountFor(role: Role, w: World): Who {
  return role === 'reviewer' ? w.reviewerWho : role;
}

/** Todas las pantallas navegables por ruta directa, por rol (`null` = público). */
export function screens(w: World): Screen[] {
  return [
    { role: null, name: 'inicio de sesión', path: '/login' },
    { role: null, name: 'catálogo', path: '/catalog' },
    { role: null, name: 'ficha del catálogo', path: `/catalog/${w.accepted.code}` },
    { role: 'author', name: 'panel', path: '/app/dashboard' },
    { role: 'author', name: 'mis manuscritos', path: '/app/author/manuscripts' },
    { role: 'author', name: 'nuevo manuscrito', path: '/app/author/manuscripts/new' },
    { role: 'author', name: 'detalle en revisión', path: `/app/author/manuscripts/${w.review.id}` },
    { role: 'author', name: 'detalle aceptado', path: `/app/author/manuscripts/${w.accepted.id}` },
    { role: 'author', name: 'detalle borrador', path: `/app/author/manuscripts/${w.draftId}` },
    { role: 'author', name: 'editar borrador', path: `/app/author/manuscripts/${w.draftId}/edit` },
    {
      role: 'author',
      name: 'historial de versiones',
      path: `/app/author/manuscripts/${w.review.id}/history`,
    },
    { role: 'author', name: 'avisos', path: '/app/notifications' },
    { role: 'reviewer', name: 'panel', path: '/app/dashboard' },
    { role: 'reviewer', name: 'mis asignaciones y desempeño', path: '/app/reviewer/assignments' },
    {
      role: 'reviewer',
      name: 'detalle de asignación',
      path: `/app/reviewer/assignments/${w.assignmentId}`,
    },
    {
      role: 'reviewer',
      name: 'formulario de evaluación (rúbrica)',
      path: `/app/reviewer/assignments/${w.assignmentId}/evaluate`,
    },
    { role: 'reviewer', name: 'historial de evaluaciones', path: '/app/reviewer/history' },
    { role: 'admin', name: 'panel', path: '/app/dashboard' },
    { role: 'admin', name: 'incidentes', path: '/app/admin/incidents' },
    { role: 'admin', name: 'revisores', path: '/app/admin/reviewers' },
    { role: 'admin', name: 'carreras', path: '/app/admin/areas' },
    { role: 'admin', name: 'auditoría', path: '/app/admin/audit' },
    { role: 'admin', name: 'detalle del evento', path: `/app/admin/audit/${w.auditEventId}` },
  ];
}
