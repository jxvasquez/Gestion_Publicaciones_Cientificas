import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OpenWhenDirective } from './open-when.directive';

@Component({
  imports: [OpenWhenDirective],
  template: `<details [appOpenWhen]="needed()"><summary>Filtros</summary></details>`,
})
class HostComponent {
  readonly needed = signal(false);
}

describe('OpenWhenDirective', () => {
  const render = async (needed: boolean) => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.needed.set(needed);
    await fixture.whenStable();
    const details = (fixture.nativeElement as HTMLElement).querySelector('details')!;
    const need = async (value: boolean) => {
      fixture.componentInstance.needed.set(value);
      await fixture.whenStable();
    };
    return { details, need };
  };

  it.each([true, false])('con la condición en %s arranca abierto=%s', async (needed) => {
    const { details } = await render(needed);

    expect(details.open).toBe(needed);
  });

  it('se abre cuando la condición pasa a cumplirse', async () => {
    const { details, need } = await render(false);

    await need(true);

    expect(details.open).toBe(true);
  });

  it('nunca cierra: al dejar de cumplirse, la persona conserva el panel como estaba', async () => {
    const { details, need } = await render(true);

    await need(false);

    expect(details.open).toBe(true);
  });

  it('respeta que la persona lo cierre y lo reabre si la condición vuelve a darse', async () => {
    const { details, need } = await render(true);
    details.open = false;
    await need(true);
    expect(details.open).toBe(false);

    await need(false);
    await need(true);

    expect(details.open).toBe(true);
  });
});
