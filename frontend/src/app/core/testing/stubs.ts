import { Component } from '@angular/core';
import { of } from 'rxjs';

import { AcademicArea } from '../models/area.model';
import { AreaService } from '../services/area.service';

/** Carreras de ejemplo del catálogo para las pruebas. */
export const TEST_AREAS: AcademicArea[] = [
  { code: 'agronomia', name: 'Agronomía' },
  { code: 'derecho', name: 'Derecho' },
  { code: 'edafologia', name: 'Edafología' },
];

/** Sustituye a `AreaService` sin pedir nada al servidor. */
export const AREA_SERVICE_STUB = {
  provide: AreaService,
  useValue: { list: () => of(TEST_AREAS) },
};

/** Sustituye a `ReviewerStandingComponent` en las pruebas de la bandeja, que no lo ejercitan. */
@Component({ selector: 'app-reviewer-standing', template: '' })
export class StandingStubComponent {}
