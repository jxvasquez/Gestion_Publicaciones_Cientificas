import {
  EDITABLE_STATUSES,
  MANUSCRIPT_STATUSES,
  ManuscriptStatus,
  editorialStages,
  isEditable,
  nextAction,
} from './manuscript.model';

describe('manuscript.model', () => {
  describe('isEditable', () => {
    it.each(MANUSCRIPT_STATUSES.map((status) => [status, EDITABLE_STATUSES.includes(status)]))(
      'estado %s activo -> editable: %s',
      (status, expected) => {
        expect(isEditable({ status: status as ManuscriptStatus, is_active: true })).toBe(
          expected as boolean,
        );
      },
    );

    it('solo Borrador y Requiere correcciones son editables', () => {
      expect([...EDITABLE_STATUSES].sort()).toEqual(['CHANGES_REQUESTED', 'DRAFT']);
    });

    it.each(MANUSCRIPT_STATUSES)('un manuscrito dado de baja nunca es editable (%s)', (status) => {
      expect(isEditable({ status, is_active: false })).toBe(false);
    });
  });

  describe('nextAction', () => {
    it.each(MANUSCRIPT_STATUSES)('define una acción breve y una detallada para %s', (status) => {
      const action = nextAction({ status, is_active: true });
      expect(action.short.length).toBeGreaterThan(0);
      expect(action.detail.length).toBeGreaterThan(action.short.length);
    });

    it('pide enviar nueva versión cuando requiere correcciones', () => {
      expect(nextAction({ status: 'CHANGES_REQUESTED', is_active: true }).short).toBe(
        'Enviar nueva versión',
      );
    });

    it('un manuscrito dado de baja está archivado sin importar su estado', () => {
      for (const status of MANUSCRIPT_STATUSES) {
        expect(nextAction({ status, is_active: false }).short).toBe('Archivado');
      }
    });

    it('un aceptado indica que está publicado', () => {
      expect(nextAction({ status: 'ACCEPTED', is_active: true }).short).toBe('Publicado');
    });
  });

  describe('editorialStages (spec 005, tabla de etapas)', () => {
    /** Cada etapa como «rótulo | estado | tono». */
    const stages = (status: ManuscriptStatus, is_active = true) =>
      editorialStages({ status, is_active }).map((s) => `${s.label} | ${s.state} | ${s.tone}`);

    const done = (label: string) => `${label} | done | info`;
    const upcoming = (label: string) => `${label} | upcoming | neutral`;

    const TABLE: Record<ManuscriptStatus, string[]> = {
      DRAFT: [
        'Borrador | current | info',
        upcoming('Enviado'),
        upcoming('En revisión'),
        upcoming('Decisión'),
      ],
      SUBMITTED: [
        done('Borrador'),
        'En espera de revisores | current | info',
        upcoming('En revisión'),
        upcoming('Decisión'),
      ],
      UNDER_REVIEW: [
        done('Borrador'),
        done('Enviado'),
        'En revisión | current | info',
        upcoming('Decisión'),
      ],
      TIE_BREAKER: [
        done('Borrador'),
        done('Enviado'),
        'En desempate | current | info',
        upcoming('Decisión'),
      ],
      CHANGES_REQUESTED: [
        done('Borrador'),
        done('Enviado'),
        done('En revisión'),
        'Cambios solicitados | current | warning',
      ],
      ACCEPTED: [
        done('Borrador'),
        done('Enviado'),
        done('En revisión'),
        'Aceptado | done | success',
      ],
      REJECTED: [
        done('Borrador'),
        done('Enviado'),
        done('En revisión'),
        'Rechazado | done | danger',
      ],
    };

    it.each(MANUSCRIPT_STATUSES)('%s sigue su fila de la tabla', (status) => {
      expect(stages(status)).toEqual(TABLE[status]);
    });

    it('las cuatro etapas tienen claves estables y en orden', () => {
      expect(editorialStages({ status: 'DRAFT', is_active: true }).map((s) => s.key)).toEqual([
        'draft',
        'submitted',
        'review',
        'decision',
      ]);
    });

    it.each([
      ['DRAFT', 0, 'current'],
      ['SUBMITTED', 1, 'current'],
      ['UNDER_REVIEW', 2, 'current'],
      ['TIE_BREAKER', 2, 'current'],
      ['CHANGES_REQUESTED', 3, 'current'],
      ['ACCEPTED', 3, 'done'],
      ['REJECTED', 3, 'done'],
    ] as const)(
      'dado de baja en %s: la etapa alcanzada se rotula «Dado de baja», en neutro',
      (status, reached, state) => {
        const expected = [...TABLE[status]];
        expected[reached] = `Dado de baja | ${state} | neutral`;

        expect(stages(status, false)).toEqual(expected);
      },
    );
  });
});
