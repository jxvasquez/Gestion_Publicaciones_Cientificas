/** Cuentas que siembra `scripts/e2e/seed_e2e.py` (misma lista, misma contraseña de la corrida). */
export type Who =
  | 'authorReviewer'
  | 'author'
  | 'reviewer1'
  | 'reviewer2'
  | 'reviewer3'
  | 'reviewer4'
  | 'reviewer5'
  | 'reviewer6'
  | 'reviewerLaw'
  | 'admin';

export const PASSWORD = process.env['E2E_PASSWORD'] ?? '';

export const ACCOUNTS: Record<Who, { id: string; name: string }> = {
  authorReviewer: { id: 'e2e-dual', name: 'Elena Cabrera Rojas' },
  author: { id: 'e2e-autor', name: 'Marcela Quizhpe Ordóñez' },
  reviewer1: { id: 'e2e-rev-1', name: 'Rodrigo Valarezo Cueva' },
  reviewer2: { id: 'e2e-rev-2', name: 'Patricia Jaramillo Soto' },
  reviewer3: { id: 'e2e-rev-3', name: 'Gonzalo Armijos Pineda' },
  reviewer4: { id: 'e2e-rev-4', name: 'Lucía Ochoa Berrezueta' },
  reviewer5: { id: 'e2e-rev-5', name: 'Fabián Granda Loaiza' },
  reviewer6: { id: 'e2e-rev-6', name: 'Verónica Tapia Ludeña' },
  reviewerLaw: { id: 'e2e-rev-derecho', name: 'Julián Espinosa Vivanco' },
  admin: { id: 'e2e-admin', name: 'Adriana Paredes León' },
};

/** Los seis revisores de Ingeniería en Computación: cada manuscrito de esa carrera recibe a dos. */
export const COMPUTING_POOL = [
  'reviewer1',
  'reviewer2',
  'reviewer3',
  'reviewer4',
  'reviewer5',
  'reviewer6',
] as const satisfies readonly Who[];

/** Quienes pueden revisar un manuscrito de Derecho: exactamente estas dos cuentas. */
export const LAW_POOL = ['reviewerLaw', 'authorReviewer'] as const satisfies readonly Who[];

/** Fragmentos de identidad que jamás deben cruzar de un lado al otro del doble ciego. */
export const AUTHOR_TOKENS = ['Marcela', 'Quizhpe', 'Ordóñez', 'e2e-autor'];
export const REVIEWER_TOKENS = [
  'Rodrigo',
  'Valarezo',
  'Patricia',
  'Jaramillo',
  'Gonzalo',
  'Armijos',
  'Lucía',
  'Ochoa',
  'Fabián',
  'Granda',
  'Verónica',
  'Tapia',
  'Julián',
  'Espinosa',
  'Elena',
  'Cabrera',
  'e2e-rev-',
  'e2e-dual',
];

/** Carreras del catálogo sembrado (código y nombre visible). */
export const COMPUTING = { code: 'ingenieria-en-computacion', name: 'Ingeniería en Computación' };
export const LAW = { code: 'derecho', name: 'Derecho' };

if (!PASSWORD) {
  throw new Error('Falta E2E_PASSWORD: ejecute las pruebas con scripts/e2e.sh.');
}

/** Sufijo único por corrida para que los títulos no choquen con datos previos. */
export const RUN = Date.now().toString(36);
