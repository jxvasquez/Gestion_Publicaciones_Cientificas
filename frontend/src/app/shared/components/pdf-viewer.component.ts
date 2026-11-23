import { Component, effect, input, signal } from '@angular/core';

import { SafeUrlPipe } from '../pipes/safe-url.pipe';

/**
 * Visor embebido de PDF (plan §3.9).
 *
 * Recibe el documento como `Blob` (PDF interno con autorización del
 * backend o PDF sanitizado del Revisor) y lo renderiza en un `iframe`
 * con `sandbox`; no usa `innerHTML`. Las URLs de objeto se revocan al
 * cambiar de documento o al destruir el componente.
 */
@Component({
  selector: 'app-pdf-viewer',
  imports: [SafeUrlPipe],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss',
})
export class PdfViewerComponent {
  /** Documento interno; nunca se guarda en `localStorage`. */
  readonly blob = input<Blob | null>(null);

  /** Nombre sugerido para la descarga. */
  readonly filename = input('documento.pdf');

  /** Título accesible del `iframe`. */
  readonly frameTitle = input('Visor de documento PDF');

  /** Mensaje cuando no hay documento disponible. */
  readonly emptyLabel = input('No hay documento disponible.');

  protected readonly objectUrl = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const blob = this.blob();
      const url = blob ? URL.createObjectURL(blob) : null;
      this.objectUrl.set(url);
      onCleanup(() => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    });
  }

  protected download(url: string): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.filename();
    anchor.rel = 'noopener';
    anchor.click();
  }

  protected openInNewTab(url: string): void {
    window.open(url, '_blank', 'noopener');
  }
}
