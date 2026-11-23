import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Página 404 visual para rutas desconocidas. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {}
