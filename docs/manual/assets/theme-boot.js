/* Aplica o tema salvo antes da primeira pintura, para não piscar branco em
   quem escolheu escuro. Carregado de forma síncrona no <head>. */
(function () {
  try {
    var saved = localStorage.getItem('colecionary.manual.theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) { /* localStorage indisponível: fica no padrão do sistema */ }
}());
