import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('debe crearse', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('debe renderizar el router-outlet', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('activa el tema en todas las rutas, también las públicas', () => {
    document.documentElement.removeAttribute('data-theme');

    TestBed.createComponent(AppComponent);

    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
  });
});
