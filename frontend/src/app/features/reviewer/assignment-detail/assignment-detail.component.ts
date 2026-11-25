import { areaNames } from '../../../core/models/area.model';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiError } from '../../../core/models/api-error.model';
import { ReviewerAssignmentDetail } from '../../../core/models/reviewer.model';
import { ReviewerDocument, ReviewerService } from '../../../core/services/reviewer.service';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PdfViewerComponent } from '../../../shared/components/pdf-viewer.component';
import { RoundCounterComponent } from '../../../shared/components/round-counter.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { saveBlob } from '../../../shared/utils/save-blob';
import { DeadlineCountdownComponent } from '../deadline-countdown/deadline-countdown.component';
import { IdentityLeakDialogComponent } from '../identity-leak-dialog/identity-leak-dialog.component';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Detalle anonimizado de una asignación (plan sección 3.5, HU-14 y HU-16).
 *
 * * Muestra código, título, resumen, palabras clave, área, idioma, ronda,
 *   versión, plazo y el PDF sanitizado.
 * * **Doble ciego:** no renderiza autores, filiaciones, contacto, nombre
 *   original del archivo ni enlace alguno al PDF original. El tipo
 *   `ReviewerAssignmentDetail` no los declara, y el único documento que se
 *   pide es el del endpoint sanitizado de la propia asignación.
 * * El PDF no se pide al abrir el detalle: cada lectura queda auditada, así
 *   que solo se descarga cuando el Revisor lo solicita, y se conserva en
 *   memoria mientras la vista siga abierta. Se guarda con un nombre
 *   genérico derivado del código del manuscrito.
 * * El contador cuenta contra la fecha límite del backend. Al vencer se
 *   deshabilita el acceso a la evaluación; el corte definitivo lo aplica
 *   el servidor al recibir el envío.
 */
@Component({
  selector: 'app-assignment-detail',
  imports: [
    DatePipe,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    StatusBadgeComponent,
    RoundCounterComponent,
    PdfViewerComponent,
    DeadlineCountdownComponent,
    IdentityLeakDialogComponent,
  ],
  templateUrl: './assignment-detail.component.html',
  styleUrl: './assignment-detail.component.scss',
})
export class AssignmentDetailComponent {
  protected readonly areaNames = areaNames;
  private readonly service = inject(ReviewerService);
  private readonly route = inject(ActivatedRoute);

  protected readonly offset = INSTITUTIONAL_OFFSET;
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly assignment = signal<ReviewerAssignmentDetail | null>(null);
  protected readonly serverOffsetMs = signal(0);

  /** El contador llegó a cero mientras la vista estaba abierta. */
  protected readonly deadlinePassed = signal(false);

  /** Sin plazo no hay evaluación: lo dice el servidor al cargar o lo dice el contador al vencer. */
  protected readonly blocked = computed(
    () => this.deadlinePassed() || this.assignment()?.is_overdue === true,
  );

  /** PDF sanitizado ya descargado; se conserva para no auditar cada vista. */
  private readonly fetched = signal<ReviewerDocument | null>(null);
  protected readonly shown = signal(false);
  protected readonly fetching = signal(false);
  protected readonly documentError = signal('');

  /** El documento que se renderiza en el visor. */
  protected readonly document = computed(() => (this.shown() ? this.fetched() : null));

  protected readonly leakOpen = signal(false);
  protected readonly leakNotice = signal('');

  constructor() {
    this.load();
  }

  protected onLeakReported(): void {
    this.leakOpen.set(false);
    this.leakNotice.set(
      'Reporte confidencial enviado. Solo el Administrador lo verá y su evaluación no cambió.',
    );
  }

  protected load(): void {
    this.loading.set(true);
    this.fetchAssignment();
  }

  /** Muestra u oculta el visor; la primera vez descarga el PDF sanitizado. */
  protected toggleViewer(assignment: ReviewerAssignmentDetail): void {
    if (this.shown()) {
      this.shown.set(false);
      return;
    }
    this.withDocument(assignment, () => this.shown.set(true));
  }

  protected download(assignment: ReviewerAssignmentDetail): void {
    this.withDocument(assignment, (doc) => saveBlob(doc.blob, doc.filename));
  }

  private fetchAssignment(): void {
    this.error.set(null);
    this.service.getAssignment(this.id).subscribe({
      next: ({ assignment, serverOffsetMs }) => {
        this.assignment.set(assignment);
        this.serverOffsetMs.set(serverOffsetMs);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }

  private withDocument(
    assignment: ReviewerAssignmentDetail,
    done: (document: ReviewerDocument) => void,
  ): void {
    const cached = this.fetched();
    if (cached !== null) {
      done(cached);
      return;
    }
    if (this.fetching()) {
      return;
    }
    this.fetching.set(true);
    this.documentError.set('');
    this.service
      .downloadDocument(
        assignment.id,
        assignment.manuscript.code,
        assignment.version.version_number,
      )
      .subscribe({
        next: (doc) => {
          this.fetching.set(false);
          this.fetched.set(doc);
          done(doc);
        },
        error: (error: ApiError) => {
          this.fetching.set(false);
          this.documentError.set(error.userMessage);
          // Con 410 la asignación cambió de estado: se vuelve a leer sin parpadeo.
          if (error.status === 410) {
            this.fetchAssignment();
          }
        },
      });
  }
}
