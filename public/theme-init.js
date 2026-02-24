// Apply theme class synchronously before first paint to prevent light→dark flash.
// This script MUST be loaded synchronously (no type="module") to block rendering.
(function () {
  var theme = localStorage.getItem('untask-theme');
  var resolved =
    theme === 'light'
      ? 'light'
      : theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : 'dark';
  document.documentElement.classList.add(resolved);
})();
