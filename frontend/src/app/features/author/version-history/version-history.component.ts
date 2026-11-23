import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../core/models/api-error.model';
import {
  HistoryEntry,
  Manuscript,
  VersionHistoryEntry,
} from '../../../core/models/manuscript.model';
import { ManuscriptService } from '../../../core/services/manuscript.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { RoundCounterComponent } from '../../../shared/components/round-counter.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { saveBlob } from '../../../shared/utils/save-blob';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Línea de tiempo inmutable de un manuscrito (plan sección 3.5, HU-23).
 *
 * * Cada iteración formal muestra su versión, ronda, fecha, el **sello
 *   de integridad** (SHA-256 del PDF exacto) y el sello de los metadatos
 *   enviados con ella, y permite descargar el PDF exacto.
 * * Todo se presenta en solo lectura: las versiones anteriores no
 *   ofrecen ninguna acción de edición ni de reemplazo.
 * * Incluye creación, rondas, cambios de estado y la baja lógica, en
 *   orden cronológico. No muestra actores ni rutas internas.
 * * La descarga usa `Blob`; el archivo no se guarda en el navegador.
 */
@Component({
  selector: 'app-version-history',
  imports: [
    DatePipe,
    RouterLink,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    StatusBadgeComponent,
    RoundCounterComponent,
    FileSizePipe,
  ],
  templateUrl: './version-history.component.html',
  styleUrl: './version-history.component.scss',
})
export class VersionHistoryComponent {
  private readonly service = inject(ManuscriptService);
  private readonly route = inject(ActivatedRoute);

  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly manuscript = signal<Manuscript | null>(null);
  protected readonly entries = signal<HistoryEntry[]>([]);
  protected readonly hasMore = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly downloading = signal<string | null>(null);
  protected readonly downloadError = signal('');

  private page = 1;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.downloadError.set('');
    this.page = 1;
    forkJoin({
      snapshot: this.service.get(this.id),
      history: this.service.getHistory(this.id),
    }).subscribe({
      next: ({ snapshot, history }) => {
        this.manuscript.set(snapshot.manuscript);
        this.entries.set(history.results);
        this.hasMore.set(history.next !== null);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }

  protected loadMore(): void {
    if (this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.service.getHistory(this.id, this.page + 1).subscribe({
      next: (history) => {
        this.page += 1;
        this.entries.update((current) => [...current, ...history.results]);
        this.hasMore.set(history.next !== null);
        this.loadingMore.set(false);
      },
      error: (error: ApiError) => {
        this.downloadError.set(error.userMessage);
        this.loadingMore.set(false);
      },
    });
  }

  /** Descarga el PDF exacto de la versión; el servidor audita cada descarga. */
  protected download(entry: VersionHistoryEntry): void {
    if (this.downloading() !== null) {
      return;
    }
    this.downloading.set(entry.version_id);
    this.downloadError.set('');
    const code = this.manuscript()?.code ?? 'manuscrito';
    this.service
      .downloadVersion(this.id, entry.version_id, `${code}-v${entry.version_number}.pdf`)
      .subscribe({
        next: ({ blob, filename }) => {
          saveBlob(blob, filename);
          this.downloading.set(null);
        },
        error: (error: ApiError) => {
          this.downloadError.set(error.userMessage);
          this.downloading.set(null);
        },
      });
  }
}
