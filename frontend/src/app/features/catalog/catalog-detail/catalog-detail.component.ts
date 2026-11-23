import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, map, of, switchMap, tap } from 'rxjs';

import { ApiError, toApiError } from '../../../core/models/api-error.model';
import { CatalogArticle, languageLabel } from '../../../core/models/catalog.model';
import { CatalogService } from '../../../core/services/catalog.service';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PdfViewerComponent } from '../../../shared/components/pdf-viewer.component';
import { PublicHeaderComponent } from '../../../shared/components/public-header.component';

/** Fechas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

const ARTICLE_UNAVAILABLE =
  'Este artículo no está disponible en el catálogo: no existe, no fue aceptado o fue dado de baja.';
const DOCUMENT_UNAVAILABLE = 'Documento no disponible.';

/**
 * Ficha pública de un artículo aceptado (plan sección 3.5, HU-19).
 *
 * * Muestra autores con su filiación, resumen, palabras clave, área, idioma,
 *   fecha y versión: la lista blanca pública. No hay evaluaciones,
 *   revisores, historial ni auditoría, ni se pide nada de eso.
 * * No envía credenciales. Un artículo que no es público responde `404` (o
 *   `410` si fue retirado) y se muestra un estado controlado, no un error
 *   de red.
 * * El PDF se pide solo al solicitarlo y se muestra en el visor; si ya no
 *   está disponible (`404`/`410`) se dice «Documento no disponible».
 */
@Component({
  selector: 'app-catalog-detail',
  imports: [
    DatePipe,
    RouterLink,
    PublicHeaderComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    PdfViewerComponent,
  ],
  templateUrl: './catalog-detail.component.html',
  styleUrl: './catalog-detail.component.scss',
})
export class CatalogDetailComponent {
  private readonly service = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly unavailableMessage = ARTICLE_UNAVAILABLE;
  protected readonly documentUnavailable = DOCUMENT_UNAVAILABLE;

  protected readonly viewState = signal<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  protected readonly article = signal<CatalogArticle | null>(null);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly documentState = signal<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>(
    'idle',
  );
  protected readonly document = signal<Blob | null>(null);
  protected readonly documentError = signal('');

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('code') ?? ''),
        switchMap((code) =>
          this.retry$.pipe(
            tap(() => {
              this.viewState.set('loading');
              this.documentState.set('idle');
              this.document.set(null);
            }),
            switchMap(() =>
              this.service.get(code).pipe(
                map((article) => ({ article, error: null as ApiError | null })),
                catchError((error: unknown) => of({ article: null, error: toApiError(error) })),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ article, error }) => {
        this.article.set(article);
        this.error.set(error);
        if (article) {
          this.viewState.set('ready');
        } else if (error?.status === 404 || error?.status === 410) {
          this.viewState.set('unavailable');
        } else {
          this.viewState.set('error');
        }
      });
  }

  protected language(article: CatalogArticle): string {
    return languageLabel(article.language);
  }

  protected reload(): void {
    this.retry$.next();
  }

  /** Pide el PDF público (sin credenciales) y lo muestra en el visor. */
  protected loadDocument(code: string): void {
    if (this.documentState() === 'loading') {
      return;
    }
    this.documentState.set('loading');
    this.service.document(code).subscribe({
      next: (blob) => {
        this.document.set(blob);
        this.documentState.set('ready');
      },
      error: (error: ApiError) => {
        if (error.status === 404 || error.status === 410) {
          this.documentState.set('unavailable');
          return;
        }
        this.documentError.set(error.userMessage);
        this.documentState.set('error');
      },
    });
  }
}
