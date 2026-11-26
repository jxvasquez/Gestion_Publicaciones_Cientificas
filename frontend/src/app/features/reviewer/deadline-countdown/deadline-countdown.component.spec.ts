import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  DeadlineCountdownComponent,
  formatRemaining,
  remainingFraction,
} from './deadline-countdown.component';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRemaining', () => {
  it.each([
    [12 * DAY + 4 * HOUR + 59 * MINUTE, '12 d 4 h'],
    [DAY, '1 d 0 h'],
    [3 * HOUR + 5 * MINUTE, '3 h 05 min'],
    [HOUR, '1 h 00 min'],
    [42 * MINUTE + 7_000, '42:07'],
    [9_000, '00:09'],
    [0, '00:00'],
  ])('%i ms se muestra como «%s»', (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });

  it('nunca muestra un valor negativo', () => {
    expect(formatRemaining(-5_000)).toBe('00:00');
  });
});

describe('remainingFraction', () => {
  const ASSIGNED = '2026-10-17T12:00:00Z';
  const DUE = '2026-11-06T12:00:00Z';
  const at = (iso: string) => Date.parse(iso);

  it.each([
    ['al asignarse', ASSIGNED, 1],
    ['a la mitad', '2026-10-27T12:00:00Z', 0.5],
    ['a un cuarto del final', '2026-11-01T12:00:00Z', 0.25],
    ['al vencer', DUE, 0],
    ['después de vencer', '2026-12-01T00:00:00Z', 0],
    ['antes de asignarse', '2026-10-01T00:00:00Z', 1],
  ])('%s queda %s', (_, now, expected) => {
    expect(remainingFraction(ASSIGNED, DUE, at(now))).toBe(expected);
  });

  it.each([
    ['la fecha límite es igual a la de asignación', ASSIGNED, ASSIGNED],
    ['la fecha límite es anterior', DUE, ASSIGNED],
    ['la fecha de asignación no es válida', 'ayer', DUE],
    ['la fecha límite no es válida', ASSIGNED, ''],
  ])('sin plazo calculable (%s) es null', (_, assigned, due) => {
    expect(remainingFraction(assigned, due, at(ASSIGNED))).toBeNull();
  });
});

describe('DeadlineCountdownComponent', () => {
  const NOW = new Date('2026-10-27T12:00:00Z');
  let fixture: ComponentFixture<DeadlineCountdownComponent>;
  let expired: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expired = 0;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  const mount = (inputs: {
    dueAt: string;
    assignedAt?: string;
    serverOffsetMs?: number;
    overdue?: boolean;
  }) => {
    fixture = TestBed.createComponent(DeadlineCountdownComponent);
    fixture.componentRef.setInput('dueAt', inputs.dueAt);
    if (inputs.assignedAt !== undefined) {
      fixture.componentRef.setInput('assignedAt', inputs.assignedAt);
    }
    if (inputs.serverOffsetMs !== undefined) {
      fixture.componentRef.setInput('serverOffsetMs', inputs.serverOffsetMs);
    }
    if (inputs.overdue !== undefined) {
      fixture.componentRef.setInput('overdue', inputs.overdue);
    }
    fixture.componentInstance.expired.subscribe(() => expired++);
    fixture.detectChanges();
  };

  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  };

  const root = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) =>
    (root().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('muestra el tiempo restante hasta la fecha límite del backend', () => {
    mount({ dueAt: '2026-11-08T16:00:00Z' });

    expect(text('.countdown__value')).toContain('12 d 4 h');
    expect(root().querySelector('[role="timer"]')).not.toBeNull();
  });

  it('vencido, avisa de que se revoca la asignación y se restan 20 puntos', () => {
    mount({ dueAt: '2026-10-27T11:00:00Z' });

    expect(text('.countdown__penalty')).toContain('se revoca automáticamente');
    expect(text('.countdown__penalty')).toContain('20');
  });

  it('muestra la fecha límite en hora de Ecuador', () => {
    mount({ dueAt: '2026-11-08T16:00:00Z' });

    expect(text('.countdown__due')).toContain('08/11/2026 11:00');
    expect(root().querySelector('time')?.getAttribute('datetime')).toBe('2026-11-08T16:00:00Z');
  });

  it('avanza con el paso del tiempo', () => {
    mount({ dueAt: '2026-10-27T12:30:00Z' });
    expect(text('.countdown__value')).toContain('30:00');

    advance(5_000);

    expect(text('.countdown__value')).toContain('29:55');
  });

  it('resalta como urgente con menos de un día', () => {
    mount({ dueAt: '2026-10-28T11:00:00Z' });

    expect(root().querySelector('.countdown--urgent')).not.toBeNull();
  });

  it('con más de un día no es urgente', () => {
    mount({ dueAt: '2026-10-29T12:00:01Z' });

    expect(root().querySelector('.countdown--urgent')).toBeNull();
  });

  it('corrige el reloj del navegador con la diferencia del servidor', () => {
    // El navegador va 10 minutos atrasado: para el servidor faltan 20, no 30.
    mount({ dueAt: '2026-10-27T12:30:00Z', serverOffsetMs: 10 * MINUTE });

    expect(text('.countdown__value')).toContain('20:00');
  });

  it('al llegar a la fecha límite anuncia el vencimiento y avisa una sola vez', () => {
    mount({ dueAt: '2026-10-27T12:00:03Z' });
    expect(expired).toBe(0);

    advance(3_000);

    expect(text('.countdown__value')).toBe('Plazo vencido');
    expect(root().querySelector('[role="status"]')).not.toBeNull();
    expect(root().querySelector('[role="timer"]')).toBeNull();
    expect(root().querySelector('.countdown--expired')).not.toBeNull();
    expect(expired).toBe(1);

    advance(10_000);
    expect(expired).toBe(1);
  });

  it('un segundo antes del vencimiento todavía no ha vencido', () => {
    mount({ dueAt: '2026-10-27T12:00:03Z' });

    advance(2_000);

    expect(expired).toBe(0);
    expect(text('.countdown__value')).toContain('00:01');
  });

  it('si el servidor ya la dio por vencida, está vencida aunque el reloj local diga lo contrario', () => {
    mount({ dueAt: '2026-12-31T00:00:00Z', overdue: true });

    expect(text('.countdown__value')).toBe('Plazo vencido');
    expect(expired).toBe(1);
  });

  it('una fecha límite ya pasada está vencida al montar', () => {
    mount({ dueAt: '2026-10-27T11:59:59Z' });

    expect(text('.countdown__value')).toBe('Plazo vencido');
    expect(expired).toBe(1);
  });

  it('crea un único temporizador: los tics no reinician la cuenta', () => {
    const create = vi.spyOn(globalThis, 'setInterval');
    mount({ dueAt: '2026-10-27T12:30:00Z' });

    advance(1_000);
    advance(1_000);
    advance(1_000);

    expect(create).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('al destruirse deja de contar', () => {
    mount({ dueAt: '2026-10-27T12:00:03Z' });

    fixture.destroy();
    vi.advanceTimersByTime(10_000);

    expect(expired).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('barra del plazo restante', () => {
    // NOW está a la mitad de un plazo de 20 días.
    const ASSIGNED = '2026-10-17T12:00:00Z';
    const DUE = '2026-11-06T12:00:00Z';
    const meter = () => root().querySelector('[role="meter"]');
    const fill = () => root().querySelector<HTMLElement>('.meter-bar__fill')!;
    const tones = () =>
      ['meter-bar__fill--warning', 'meter-bar__fill--danger'].filter((name) =>
        fill().classList.contains(name),
      );

    it('es un medidor con nombre, valor en texto y la fecha de asignación', () => {
      mount({ assignedAt: ASSIGNED, dueAt: DUE });

      expect(meter()?.getAttribute('aria-label')).toBe('Plazo restante');
      expect(meter()?.getAttribute('aria-valuemin')).toBe('0');
      expect(meter()?.getAttribute('aria-valuemax')).toBe('100');
      expect(meter()?.getAttribute('aria-valuenow')).toBe('50');
      expect(meter()?.getAttribute('aria-valuetext')).toBe('Queda el 50 % del plazo');
      expect(fill().style.getPropertyValue('inline-size')).toBe('50%');
      expect(text('.countdown__assigned')).toContain('Asignada el 17/10/2026 07:00');
    });

    it('usa el tono neutro con más de un día', () => {
      mount({ assignedAt: ASSIGNED, dueAt: DUE });

      expect(tones()).toEqual([]);
    });

    it('con menos de 24 horas pasa a advertencia, junto a «Próximo a vencer»', () => {
      mount({ assignedAt: ASSIGNED, dueAt: '2026-10-28T11:00:00Z' });

      expect(tones()).toEqual(['meter-bar__fill--warning']);
      expect(text('.countdown__warning')).toBe('Próximo a vencer');
    });

    it('al vencer queda vacía en tono de peligro, junto a «Plazo vencido»', () => {
      mount({ assignedAt: ASSIGNED, dueAt: '2026-10-27T12:00:03Z' });

      advance(3_000);

      expect(tones()).toEqual(['meter-bar__fill--danger']);
      expect(meter()?.getAttribute('aria-valuenow')).toBe('0');
      expect(meter()?.getAttribute('aria-valuetext')).toBe('Queda el 0 % del plazo');
      expect(text('.countdown__value')).toBe('Plazo vencido');
    });

    it('si el servidor la dio por vencida queda vacía aunque falte tiempo en el reloj', () => {
      mount({ assignedAt: ASSIGNED, dueAt: DUE, overdue: true });

      expect(meter()?.getAttribute('aria-valuenow')).toBe('0');
      expect(tones()).toEqual(['meter-bar__fill--danger']);
    });

    it('usa la hora del servidor para el valor y el tono', () => {
      // El navegador va 5 días atrasado: para el servidor queda un cuarto, no la mitad.
      mount({ assignedAt: ASSIGNED, dueAt: DUE, serverOffsetMs: 5 * DAY });

      expect(meter()?.getAttribute('aria-valuenow')).toBe('25');
    });

    it('con la corrección del servidor puede ser urgente', () => {
      mount({ assignedAt: ASSIGNED, dueAt: DUE, serverOffsetMs: 9.5 * DAY });

      expect(tones()).toEqual(['meter-bar__fill--warning']);
    });

    it('avanza con el paso del tiempo', () => {
      mount({ assignedAt: '2026-10-27T11:59:00Z', dueAt: '2026-10-27T12:01:00Z' });
      expect(meter()?.getAttribute('aria-valuenow')).toBe('50');

      advance(30_000);

      expect(meter()?.getAttribute('aria-valuenow')).toBe('25');
    });

    it('sin fecha de asignación no hay barra ni línea de asignación', () => {
      mount({ dueAt: DUE });

      expect(meter()).toBeNull();
      expect(root().querySelector('.countdown__assigned')).toBeNull();
    });

    it('con un plazo imposible no hay barra y se conservan el contador y las fechas', () => {
      mount({ assignedAt: '2026-11-07T12:00:00Z', dueAt: DUE });

      expect(meter()).toBeNull();
      expect(text('.countdown__value')).toContain('10 d 0 h');
      expect(text('.countdown__assigned')).toContain('07/11/2026');
      expect(text('.countdown__due')).toContain('06/11/2026');
    });
  });
});
