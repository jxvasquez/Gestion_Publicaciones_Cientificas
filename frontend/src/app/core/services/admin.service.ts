import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { API_BASE_URL } from '../http/api-base-url.token';
import { blobErrorToApiError } from '../http/blob-download';
import { toHttpParams } from '../http/query-params';
import { toApiError } from '../models/api-error.model';
import { AdminArea, AreaChanges, RosterChanges, RosterParams, RosterReviewer } from '../models/area.model';
import { CorrectionRequest, CorrectionResult } from '../models/audit.model';
import { Incident, IncidentFilter, IncidentResolution } from '../models/incident.model';
import { Paginated } from '../models/paginated.model';
import { genericDocumentName } from '../models/reviewer.model';

/** PDF sanitizado de la versión reportada, con el nombre genérico del servidor. */
export interface IncidentDocument {
  blob: Blob;
  filename: string;
}

/**
 * Módulo del Administrador (spec 004): incidentes confidenciales, corrección de
 * veredictos, padrón de revisores y catálogo de carreras. La auditoría tiene su
 * propio servicio (`AuditService`).
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private get url(): string {
    return `${this.baseUrl}admin/`;
  }

  // --- Incidentes -----------------------------------------------------------------

  /** Reportes confidenciales, los abiertos primero. `ALL` no envía filtro. */
  listIncidents(
    filter: IncidentFilter = 'OPEN',
    page = 1,
    pageSize = 20,
  ): Observable<Paginated<Incident>> {
    return this.http
      .get<Paginated<Incident>>(`${this.url}incidents/`, {
        params: toHttpParams({
          status: filter === 'ALL' ? undefined : filter,
          page: page > 1 ? page : undefined,
          page_size: pageSize,
        }),
      })
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  /** Resuelve un reporte una sola vez (`POST .../resolve/`); la segunda responde `409`. */
  resolveIncident(id: string, resolution: IncidentResolution): Observable<Incident> {
    return this.http
      .post<Incident>(`${this.url}incidents/${encodeURIComponent(id)}/resolve/`, { resolution })
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  /**
   * PDF sanitizado de la versión reportada (`GET .../document/`); la descarga queda
   * auditada. El nombre lo construye el cliente con el código y la versión: nunca el
   * del archivo original del Autor.
   */
  downloadIncidentDocument(
    incident: Pick<Incident, 'id' | 'manuscript_code' | 'version_number'>,
  ): Observable<IncidentDocument> {
    return this.http
      .get(`${this.url}incidents/${encodeURIComponent(incident.id)}/document/`, {
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          filename: genericDocumentName(incident.manuscript_code, incident.version_number),
        })),
        catchError((error) => blobErrorToApiError(error)),
      );
  }

  // --- Corrección de veredictos ----------------------------------------------------

  /**
   * Reemplaza el último veredicto por una nueva decisión del Administrador
   * (`POST /admin/verdicts/{id}/correct/`). `idempotencyKey` identifica esta
   * intención: un reintento con la misma clave devuelve lo ya registrado.
   */
  correctVerdict(
    verdictId: string,
    request: CorrectionRequest,
    idempotencyKey: string,
  ): Observable<CorrectionResult> {
    return this.http
      .post<CorrectionResult>(
        `${this.url}verdicts/${encodeURIComponent(verdictId)}/correct/`,
        request,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  // --- Padrón de revisores ---------------------------------------------------------

  listReviewers(params: RosterParams = {}): Observable<Paginated<RosterReviewer>> {
    return this.http
      .get<Paginated<RosterReviewer>>(`${this.url}reviewers/`, {
        params: toHttpParams({
          ...params,
          available: params.available === undefined ? undefined : String(params.available),
          page: params.page && params.page > 1 ? params.page : undefined,
        }),
      })
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  updateReviewer(userId: string, changes: RosterChanges): Observable<RosterReviewer> {
    return this.http
      .patch<RosterReviewer>(`${this.url}reviewers/${encodeURIComponent(userId)}/`, changes)
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  // --- Catálogo de carreras --------------------------------------------------------

  listAreas(): Observable<AdminArea[]> {
    return this.http
      .get<AdminArea[]>(`${this.url}areas/`)
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  createArea(name: string): Observable<AdminArea> {
    return this.http
      .post<AdminArea>(`${this.url}areas/`, { name })
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }

  updateArea(code: string, changes: AreaChanges): Observable<AdminArea> {
    return this.http
      .patch<AdminArea>(`${this.url}areas/${encodeURIComponent(code)}/`, changes)
      .pipe(catchError((error) => throwError(() => toApiError(error))));
  }
}
