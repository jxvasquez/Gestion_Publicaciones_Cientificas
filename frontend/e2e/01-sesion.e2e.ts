import { expect, test } from '@playwright/test';

import { ACCOUNTS, PASSWORD } from './support/env';
import { loginUi, logoutUi } from './support/ui';

/** Flujo 1: login de una persona con dos roles; el panel muestra ambas secciones a la vez. */
test.describe('Flujo 1 — sesión y panel multirrol', () => {
  test('una persona Autor y Revisor ve las dos secciones sin elegir rol', async ({ page }) => {
    await loginUi(page, 'authorReviewer');

    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Mis manuscritos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Mis asignaciones' })).toBeVisible();
    // Sin rol de Administrador esos módulos no aparecen, y el rol Editor ya no existe.
    for (const hidden of ['Incidentes', 'Revisores', 'Carreras', 'Auditoría', 'Nuevos envíos']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    const dashboard = page.getByRole('region', { name: 'Panel unificado' });
    await expect(dashboard.getByRole('heading', { name: 'Autor' })).toBeVisible();
    await expect(dashboard.getByRole('heading', { name: 'Revisor' })).toBeVisible();
    await expect(dashboard.getByRole('heading', { name: 'Editor' })).toHaveCount(0);
    await expect(dashboard.getByRole('heading', { name: 'Administrador' })).toHaveCount(0);

    // No existe selector ni conmutador de rol.
    await expect(page.getByRole('button', { name: /cambiar de rol|seleccionar rol/i })).toHaveCount(
      0,
    );

    await logoutUi(page);
  });

  test('el Administrador ve incidentes, revisores, carreras y auditoría, y ningún módulo del Editor', async ({
    page,
  }) => {
    await loginUi(page, 'admin');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    for (const link of ['Incidentes', 'Revisores', 'Carreras', 'Auditoría']) {
      await expect(nav.getByRole('link', { name: link })).toBeVisible();
    }
    await expect(nav.getByText('Editor')).toHaveCount(0);
    for (const gone of ['/app/editor/submissions', '/app/editor/incidents']) {
      await page.goto(gone);
      await expect(page.getByRole('heading', { name: /Acceso denegado|no encontrada|No encontrado/i }).first()).toBeVisible();
    }
  });

  test('una contraseña errónea da un mensaje genérico que no revela si la cuenta existe', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Identificador institucional').fill(ACCOUNTS.author.id);
    await page.getByLabel('Contraseña').fill(`${PASSWORD}-mal`);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const wrong = await page.getByRole('alert').filter({ hasText: /./ }).first().innerText();

    await page.getByLabel('Identificador institucional').fill('no-existe-e2e');
    const secondLogin = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/login/') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Ingresar' }).click();
    expect((await secondLogin).status()).toBe(401);
    await expect(page.getByRole('alert').filter({ hasText: wrong })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('una ruta de otro módulo da acceso denegado y sin sesión se pide iniciar sesión', async ({
    page,
  }) => {
    await page.goto('/app/admin/audit');
    await expect(page).toHaveURL(/\/login/);

    await loginUi(page, 'author');
    await page.goto('/app/admin/audit');
    await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
  });

  test('el Django Admin no existe: responde 404 y no cae en la aplicación', async ({
    page,
    request,
  }) => {
    for (const path of ['/admin', '/admin/', '/admin/login/', '/static/admin/css/base.css']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect(await response.text(), path).not.toContain('<app-root');
    }
    // En el navegador tampoco aparece: ni formulario de Django ni la SPA en esa ruta.
    const navigation = await page.goto('/admin/');
    expect(navigation?.status()).toBe(404);
  });
});
