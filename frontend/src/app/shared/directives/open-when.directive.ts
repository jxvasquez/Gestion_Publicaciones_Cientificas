import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Abre un `<details>` cuando su contenido pide atención (spec 005, FR-017): hay filtros
 * aplicados o un error de validación dentro.
 *
 * Solo abre. Un enlace a `[open]` también cerraría el panel al corregir el error, con la
 * persona todavía escribiendo dentro; así, después de abrirlo, manda ella.
 */
@Directive({
  selector: 'details[appOpenWhen]',
})
export class OpenWhenDirective {
  readonly appOpenWhen = input.required<boolean>();

  constructor() {
    const details = inject<ElementRef<HTMLDetailsElement>>(ElementRef).nativeElement;
    effect(() => {
      if (this.appOpenWhen()) {
        details.open = true;
      }
    });
  }
}
