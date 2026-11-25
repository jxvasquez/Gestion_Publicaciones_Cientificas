import { TestBed } from '@angular/core/testing';

import { RosterChanges } from '../../../core/models/area.model';
import { TEST_AREAS } from '../../../core/testing/stubs';
import { buildRosterReviewer } from '../testing/admin.fixtures';
import { ReviewerEditDialogComponent } from './reviewer-edit-dialog.component';

describe('ReviewerEditDialogComponent', () => {
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

  const render = async (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(ReviewerEditDialogComponent);
    fixture.componentRef.setInput('areas', TEST_AREAS);
    fixture.componentRef.setInput('reviewer', buildRosterReviewer());
    fixture.componentRef.setInput('open', true);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = element.querySelector('dialog') as HTMLDialogElement;
    const emitted: RosterChanges[] = [];
    let cancelled = 0;
    fixture.componentInstance.saved.subscribe((changes) => emitted.push(changes));
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    const box = (code: string) =>
      element.querySelector<HTMLInputElement>(`fieldset input[value="${code}"]`)!;
    const click = async (label: string) => {
      const button = Array.from(element.querySelectorAll('button')).find((b) => text(b) === label)!;
      button.click();
      await fixture.whenStable();
    };
    return { fixture, element, dialog, emitted, cancelled: () => cancelled, box, click };
  };

  it('se abre con el nombre del revisor, las carreras marcadas y la disponibilidad actual', async () => {
    const { dialog, box } = await render();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(text(dialog.querySelector('h2'))).toBe('Editar revisor');
    expect(text(dialog)).toContain('Rosa Revisora');
    expect(box('derecho').checked).toBe(true);
    expect(box('agronomia').checked).toBe(false);
    expect(dialog.querySelector<HTMLInputElement>('input[id^="reviewer-edit-available"]')!.checked).toBe(true);
  });

  it('advierte que no cambia las asignaciones vigentes', async () => {
    const { dialog } = await render();

    expect(text(dialog)).toContain('no modifican las asignaciones vigentes');
  });

  it('emite las carreras elegidas y la disponibilidad al guardar', async () => {
    const { element, emitted, box, click, fixture } = await render();

    box('agronomia').checked = true;
    box('agronomia').dispatchEvent(new Event('change'));
    box('derecho').checked = false;
    box('derecho').dispatchEvent(new Event('change'));
    const available = element.querySelector<HTMLInputElement>('input[id^="reviewer-edit-available"]')!;
    available.checked = false;
    available.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await click('Guardar cambios');

    expect(emitted).toEqual([{ areas: ['agronomia'], is_available: false }]);
  });

  it('avisa de que sin carreras no es elegible, y aun así permite guardar', async () => {
    const { dialog, emitted, box, click, fixture } = await render();

    box('derecho').checked = false;
    box('derecho').dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(dialog.querySelector('[role="note"]'))).toContain('no es elegible');
    await click('Guardar cambios');
    expect(emitted).toEqual([{ areas: [], is_available: true }]);
  });

  it('conserva una carrera inactiva que el revisor ya tiene', async () => {
    const { box } = await render({
      reviewer: buildRosterReviewer({ areas: [{ code: 'medicina', name: 'Medicina' }] }),
    });

    expect(box('medicina').checked).toBe(true);
  });

  it('Cancelar y Esc piden cerrar sin emitir cambios', async () => {
    const { dialog, emitted, click, cancelled } = await render();

    await click('Cancelar');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(cancelled()).toBe(2);
    expect(emitted).toEqual([]);
  });

  it('mientras guarda bloquea todo y no repite la acción', async () => {
    const { element, emitted, cancelled, fixture } = await render({ busy: true });

    const buttons = Array.from(element.querySelectorAll('button'));
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(text(buttons[1])).toBe('Guardando…');
    expect(element.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
    buttons[1].click();
    await fixture.whenStable();
    expect(emitted).toEqual([]);
    expect(cancelled()).toBe(0);
  });

  it('muestra el error del servidor con role="alert"', async () => {
    const { dialog } = await render({ error: 'No se pudo actualizar.' });

    expect(text(dialog.querySelector('[role="alert"]'))).toBe('No se pudo actualizar.');
  });

  it('el diálogo se cierra cuando `open` pasa a falso', async () => {
    const { dialog, fixture } = await render();

    fixture.componentRef.setInput('open', false);
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
