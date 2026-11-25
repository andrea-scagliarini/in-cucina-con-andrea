// Applica il tema prima del primo paint per evitare il flash bianco.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = dark ? '#150f0b' : '#fbf3e4';
  } catch (e) { /* storage non disponibile */ }
})();
