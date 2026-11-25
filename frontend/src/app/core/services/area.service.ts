import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

import { API_BASE_URL } from '../http/api-base-url.token';
import { toApiError } from '../models/api-error.model';
import { AcademicArea } from '../models/area.model';

/**
 * Carreras activas del catálogo (`GET /api/v1/areas/`, público).
 *
 * La lista se pide una sola vez y se comparte entre el formulario del Autor y el
 * filtro del catálogo; si la petición falla se descarta, así que el siguiente
 * intento vuelve a pedirla.
 */
@Injectable({ providedIn: 'root' })
export class AreaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private cached: Observable<AcademicArea[]> | null = null;

  list(): Observable<AcademicArea[]> {
    if (this.cached === null) {
      this.cached = this.http.get<AcademicArea[]>(`${this.baseUrl}areas/`).pipe(
        catchError((error) => {
          this.cached = null;
          return throwError(() => toApiError(error));
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.cached;
  }
}
