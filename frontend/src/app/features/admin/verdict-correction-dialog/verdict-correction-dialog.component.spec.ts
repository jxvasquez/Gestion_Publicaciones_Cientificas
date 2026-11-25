import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuditVerdict } from '../../../core/models/audit.model';
import {
  CorrectionChoice,
  VerdictCorrectionDialogComponent,
  correctionReasonError,
} from './verdict-correction-dialog.component';

const VERDICT: AuditVerdict = {
  id: 'vd-1',
  manuscript_code: 'GPC-2026-000001',
  decision: 'ACCEPTED',
  decided_at: '2026-10-22T15:00:00Z',
};

@Component({
  imports: [VerdictCorrectionDialogComponent],
  template: `<app-verdict-correction-dialog
    [open]="open()"
    [verdict]="verdict()"
    [busy]="busy()"
    [error]="error()"
    (confirmed)="confirmed.push($event)"
    (cancelled)="cancelled = cancelled + 1"
  />`,
})
class HostComponent {
  readonly open = signal(true);
  readonly verdict = signal<AuditVerdict | null>(VERDICT);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly confirmed: CorrectionChoice[] = [];
  cancelled = 0;
}

describe('VerdictCorrectionDialogComponent', () => {
  beforeAll(() => {
    // jsdom no implementa el ciclo abierto/cerrado del diálogo nativo.
    if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    if (typeof HTMLDialogElement.prototype.close !== 'function') {
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    }
  });

  const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const setup = () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = () => element.querySelector('dialog') as HTMLDialogElement;
    const button = (label: string) =>
      Array.from(dialog().querySelectorAll('button')).find((b) =>
        text(b).startsWith(label),
      ) as HTMLButtonElement;
    const write = (value: string) => {
      const area = dialog().querySelector('textarea') as HTMLTextAreaElement;
      area.value = value;
      area.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const choose = (decision: string) => {
      const radio = dialog().querySelector<HTMLInputElement>(`input[type="radio"][value="${decision}"]`)!;
      radio.click();
      radio.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, dialog, button, write, choose };
  };

  it('muestra el veredicto y aclara que la decisión anterior se conserva', () => {
    const { dialog } = setup();

    expect(dialog().open).toBe(true);
    const content = text(dialog());
    expect(content).toContain('GPC-2026-000001');
    expect(content).toContain('Aceptado');
    // 15:00 UTC en la zona institucional (UTC-5) son las 10:00.
    expect(content).toContain('22/10/2026 10:00');
    expect(content).toContain('La decisión anterior se conserva y no se modifica');
  });

  it('no muestra autores, evaluaciones ni PDF', () => {
    const { dialog } = setup();

    expect(text(dialog())).not.toMatch(/@|autor(es)?:|evaluaci|pdf/i);
  });

  it('la nueva decisión es obligatoria: sin elegirla no emite y lo explica', () => {
    const { host, fixture, dialog, button, write } = setup();
    write('Un motivo suficientemente largo.');

    button('Corregir veredicto').click();
    fixture.detectChanges();

    expect(host.confirmed).toEqual([]);
    expect(text(dialog().querySelector('[role="alert"]'))).toBe('Seleccione la nueva decisión.');
  });

  it('ofrece las tres decisiones y las observaciones solo con «Cambios solicitados»', () => {
    const { dialog, choose } = setup();

    expect(
      Array.from(dialog().querySelectorAll('input[type="radio"]'), (r) => (r as HTMLInputElement).value),
    ).toEqual(['ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED']);
    expect(dialog().querySelectorAll('textarea')).toHaveLength(1);

    choose('CHANGES_REQUESTED');

    expect(dialog().querySelectorAll('textarea')).toHaveLength(2);
  });

  it('con «Cambios solicitados» las observaciones son obligatorias y viajan recortadas', () => {
    const { host, fixture, dialog, button, choose } = setup();
    choose('CHANGES_REQUESTED');
    const [observations, reason] = Array.from(dialog().querySelectorAll('textarea'));
    reason.value = 'Un motivo suficientemente largo.';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button('Corregir veredicto').click();
    fixture.detectChanges();
    expect(host.confirmed).toEqual([]);
    expect(text(dialog())).toContain('Indique las observaciones para el Autor.');

    observations.value = '  Ampliar la metodología.  ';
    observations.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Corregir veredicto').click();

    expect(host.confirmed).toEqual([
      {
        decision: 'CHANGES_REQUESTED',
        reason: 'Un motivo suficientemente largo.',
        observations: 'Ampliar la metodología.',
      },
    ]);
  });

  it('el motivo es obligatorio: vacío no emite y lo explica', () => {
    const { host, fixture, dialog, button, choose } = setup();
    choose('ACCEPTED');

    button('Corregir veredicto').click();
    fixture.detectChanges();

    expect(host.confirmed).toEqual([]);
    expect(text(dialog().querySelector('[role="alert"]'))).toBe(
      'Indique el motivo de la corrección.',
    );
    expect(dialog().querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('un motivo de menos de 10 caracteres (sin contar espacios) no se emite', () => {
    const { host, fixture, dialog, button, write, choose } = setup();
    choose('REJECTED');

    write('  corto   ');
    button('Corregir veredicto').click();
    fixture.detectChanges();

    expect(host.confirmed).toEqual([]);
    expect(text(dialog().querySelector('[role="alert"]'))).toContain('al menos 10 caracteres');
  });

  it('con una decisión y un motivo válidos emite ambos, el texto recortado', () => {
    const { host, button, write, choose } = setup();
    choose('ACCEPTED');

    write('   El veredicto contiene un error de captura.  ');
    button('Corregir veredicto').click();

    expect(host.confirmed).toEqual([
      { decision: 'ACCEPTED', reason: 'El veredicto contiene un error de captura.' },
    ]);
  });

  it('el campo no admite más de 1000 caracteres', () => {
    const { dialog } = setup();

    expect(dialog().querySelector('textarea')!.getAttribute('maxlength')).toBe('1000');
  });

  it('mientras habilita bloquea los controles y no repite el envío', async () => {
    const { host, fixture, dialog, button, write } = setup();
    write('Motivo suficientemente largo.');
    host.busy.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(button('Corrigiendo').disabled).toBe(true);
    expect(button('Cancelar').disabled).toBe(true);
    expect(dialog().querySelector('textarea')!.disabled).toBe(true);
    button('Corrigiendo').click();
    expect(host.confirmed).toEqual([]);
  });

  it('muestra el error del servidor y conserva lo escrito', () => {
    const { host, fixture, dialog, write } = setup();
    write('Motivo suficientemente largo.');

    host.error.set('El veredicto está desactualizado: ya existe una decisión más reciente.');
    fixture.detectChanges();

    expect(text(dialog())).toContain('ya existe una decisión más reciente');
    expect((dialog().querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'Motivo suficientemente largo.',
    );
  });

  it('cancelar emite el aviso, también con Esc', () => {
    const { host, dialog, button } = setup();

    button('Cancelar').click();
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(host.cancelled).toBe(2);
    expect(host.confirmed).toEqual([]);
  });

  it('cada apertura empieza con el motivo vacío', async () => {
    const { host, fixture, dialog, write } = setup();
    write('Motivo suficientemente largo.');

    host.open.set(false);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect((dialog().querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('correctionReasonError', () => {
  it.each([
    ['', 'Indique el motivo de la corrección.'],
    ['   ', 'Indique el motivo de la corrección.'],
    ['123456789', 'El motivo debe tener al menos 10 caracteres.'],
    ['x'.repeat(1001), 'El motivo no puede superar 1000 caracteres.'],
  ])('%j → %s', (reason, expected) => {
    expect(correctionReasonError(reason)).toBe(expected);
  });

  it.each(['1234567890', ' 1234567890 ', 'x'.repeat(1000)])('%j es válido', (reason) => {
    expect(correctionReasonError(reason)).toBeNull();
  });
});
