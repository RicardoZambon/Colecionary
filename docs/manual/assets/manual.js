/* ==========================================================================
   Colecionary — Manual técnico
   Navegação, tema e âncoras. Sem dependências e sem fetch: o manual precisa
   funcionar aberto direto do disco (file://), onde qualquer requisição falha.

   Uma nova página do manual entra em UMA lista, aqui. A barra lateral, a
   numeração e os links anterior/próxima saem daqui em todas as páginas.
   ========================================================================== */
(function () {
  'use strict';

  var PAGES = [
    { section: 'Comece aqui' },
    { id: 'index', file: 'index.html', title: 'Visão geral' },
    { id: 'architecture', file: 'architecture.html', title: 'Arquitetura' },
    { id: 'flows', file: 'flows.html', title: 'Fluxos ponta a ponta' },

    { section: 'Backend' },
    { id: 'domain-model', file: 'domain-model.html', title: 'Modelo e banco' },
    { id: 'api-reference', file: 'api-reference.html', title: 'Contrato HTTP' },
    { id: 'security', file: 'security.html', title: 'Tenancy e segurança' },
    { id: 'images', file: 'images.html', title: 'Imagens e coletor' },

    { section: 'Frontend' },
    { id: 'frontend', file: 'frontend.html', title: 'App Angular' },

    { section: 'Operação' },
    { id: 'operations', file: 'operations.html', title: 'Deploy e suporte' },
    { id: 'testing', file: 'testing.html', title: 'Testes e garantias' },

    { section: 'Referência' },
    { id: 'decisions', file: 'decisions.html', title: 'Decisões técnicas' },
    { id: 'maintaining', file: 'maintaining.html', title: 'Manter este manual' }
  ];

  var current = document.body.getAttribute('data-page') || 'index';

  /* ---------- barra lateral ---------- */

  var sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    var html = [
      '<a class="brand" href="index.html">',
      '<span class="mark" aria-hidden="true">C</span>',
      '<span><strong>Colecionary</strong><span>Manual técnico</span></span>',
      '</a>',
      '<input class="nav-search" type="search" placeholder="Filtrar páginas…" ',
      'aria-label="Filtrar páginas do manual">',
      '<nav class="toc" aria-label="Páginas do manual">'
    ];
    var n = 0;
    PAGES.forEach(function (page) {
      if (page.section) {
        html.push('<h4>' + page.section + '</h4>');
        return;
      }
      n += 1;
      var num = n < 10 ? '0' + n : String(n);
      html.push(
        '<a href="' + page.file + '"' + (page.id === current ? ' aria-current="page"' : '') + '>' +
        '<span class="n">' + num + '</span>' + page.title + '</a>'
      );
    });
    html.push('</nav>');
    html.push(
      '<div class="sidebar-foot">' +
      '<a href="../../README.md">README do repositório</a><br>' +
      '<a href="../../CLAUDE.md">CLAUDE.md</a><br>' +
      '<a href="../frontend-standards.md">frontend-standards.md</a><br>' +
      '<a href="../../backend/README.md">backend/README.md</a>' +
      '<br><button class="theme-toggle" type="button">Tema</button>' +
      '</div>'
    );
    sidebar.innerHTML = html.join('');
  }

  /* ---------- filtro da barra lateral ---------- */

  var search = document.querySelector('.nav-search');
  if (search) {
    search.addEventListener('input', function () {
      var term = search.value.trim().toLowerCase();
      var links = document.querySelectorAll('nav.toc a');
      Array.prototype.forEach.call(links, function (link) {
        link.hidden = term !== '' && link.textContent.toLowerCase().indexOf(term) === -1;
      });
      // Um cabeçalho de seção sem nenhum link visível abaixo dele não diz nada.
      var headings = document.querySelectorAll('nav.toc h4');
      Array.prototype.forEach.call(headings, function (heading) {
        var visible = false;
        var node = heading.nextElementSibling;
        while (node && node.tagName === 'A') {
          if (!node.hidden) { visible = true; break; }
          node = node.nextElementSibling;
        }
        heading.hidden = !visible;
      });
    });
  }

  /* ---------- tema ---------- */

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var root = document.documentElement;
      var dark = root.getAttribute('data-theme') === 'dark'
        || (!root.hasAttribute('data-theme')
            && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('colecionary.manual.theme', next); } catch (e) { /* modo privado */ }
    });
  }

  /* ---------- âncoras nos títulos ---------- */

  Array.prototype.forEach.call(document.querySelectorAll('.content h2[id], .content h3[id]'), function (h) {
    var a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + h.id;
    a.textContent = '#';
    a.setAttribute('aria-label', 'Link para esta seção');
    h.appendChild(a);
  });

  /* ---------- anterior / próxima ---------- */

  var slot = document.querySelector('.pagenav');
  if (slot) {
    var ordered = PAGES.filter(function (p) { return p.id; });
    var index = -1;
    ordered.forEach(function (p, i) { if (p.id === current) { index = i; } });
    var parts = [];
    if (index > 0) {
      parts.push('<a href="' + ordered[index - 1].file + '">' +
        '<span class="dir">← Anterior</span>' + ordered[index - 1].title + '</a>');
    } else {
      parts.push('<span></span>');
    }
    if (index > -1 && index < ordered.length - 1) {
      parts.push('<a href="' + ordered[index + 1].file + '" style="text-align:right">' +
        '<span class="dir">Próxima →</span>' + ordered[index + 1].title + '</a>');
    }
    slot.innerHTML = parts.join('');
  }
}());
