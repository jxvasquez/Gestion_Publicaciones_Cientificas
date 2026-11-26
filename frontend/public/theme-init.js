/* Tema antes del primer pintado (spec 005, FR-005). La clave y la regla se repiten en
   THEME_STORAGE_KEY y resolveTheme() de src/app/core/theme/theme.service.ts. */
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('gpc-theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = 'light';
    try {
      if (matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    } catch (e) {}
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
