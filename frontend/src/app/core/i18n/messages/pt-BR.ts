import { MessageKey } from './keys';

/**
 * Brazilian Portuguese. Typed `Record<MessageKey, string>` on purpose: a key
 * added to `en.ts` and forgotten here is a compile error, not an `undefined`
 * rendered to a user.
 *
 * Wording follows `docs/voice-and-tone.md` (approved product strings) and the
 * verbal territory in `docs/brand-identity.md` §2.3 — warm and direct, never
 * administrative. Prefer *coleção*, *acervo*, *vitrine*, *item*; avoid
 * *ativo*, *patrimônio*, *registro*, *cadastrar*.
 */
export const ptBR: Record<MessageKey, string> = {
  // --- common ------------------------------------------------------------
  'common.collectionNotFound': 'Coleção não encontrada —',
  'common.backToDashboard': 'voltar ao painel',
  'common.active': '● Ativo',
  'common.clickToApply': 'Clique para aplicar',

  // --- value ---------------------------------------------------------------
  'value.fromPaid': '≈ {value}',
  'value.none': '—',
  'value.fromPaidHint': 'Sem valor estimado — exibindo o valor pago.',

  // --- shell / sidebar ---------------------------------------------------
  'shell.loading': 'Carregando seu acervo…',
  'nav.dashboard': 'Painel',
  'nav.store': 'Loja',
  'nav.settings': 'Configurações',
  'nav.collections': 'Coleções',
  'nav.status': '● sincronizado · API mock v0.1',

  // --- login -------------------------------------------------------------
  'login.tagline': 'Entre no acervo da sua coleção.',
  'login.email': 'E-mail',
  'login.emailPlaceholder': 'voce@empresa.com',
  'login.password': 'Senha',
  'login.submit': 'Entrar',
  'login.submitting': 'Entrando…',
  'login.demoHint': 'demo:',
  'login.error.credentials': 'E-mail ou senha inválidos.',
  'login.error.rateLimited': 'Tentativas demais. Espere alguns minutos e tente de novo.',
  'login.error.unreachable':
    'Não foi possível falar com o servidor do Vault. Confira se ele está rodando e tente de novo.',
  'login.error.server':
    'O servidor do Vault deu erro ao te autenticar. Tente de novo em instantes.',
  'login.error.other': 'A entrada falhou (HTTP {status}). Tente de novo ou veja os logs do servidor.',

  // --- dashboard ---------------------------------------------------------
  'dashboard.title': 'Painel',
  'dashboard.sub': '{items} itens em {collections} coleções · bem-vindo de volta, {name}',
  'dashboard.stat.items': 'Itens',
  'dashboard.stat.itemsSub': 'em {collections} coleções',
  'dashboard.stat.value': 'Valor estimado',
  'dashboard.stat.groups': 'Grupos',
  'dashboard.stat.groupsSub': 'em {collections} coleções',
  'dashboard.stat.added': 'Adicionados',
  'dashboard.stat.addedSub': 'esta semana',
  'dashboard.noPurchaseData': 'ainda sem dados de compra',
  'dashboard.appreciation': '{arrow} {pct}% vs. compra',
  'dashboard.collections': 'Coleções',
  'dashboard.collectionMeta': '{owned}/{total} na coleção · {groups} grupos',
  'dashboard.newCollection': '+ Criar coleção',
  'dashboard.newCollectionName': 'Nova coleção',
  'dashboard.recent': 'Adicionados recentemente',
  'dashboard.recentSub': '{collection} · adicionado {when}',

  // --- store -------------------------------------------------------------
  'store.title': 'Loja de coleções',
  'store.sub':
    'Checklists curadas — adicione uma ao seu acervo e acompanhe o quanto falta para completá-la.',
  'store.curated': 'Curada',
  'store.listingMeta': 'por {publisher} · {items} itens · {groups} grupos',
  'store.estimate': 'est. {value}',
  'store.inVault': '✓ Já no seu acervo',
  'store.add': '+ Adicionar ao acervo',

  // --- shared/ui ---------------------------------------------------------
  'ui.imageSlot.hint': 'Clique ou solte uma imagem',
  'ui.imageSlot.reframe': 'Ajustar enquadramento',
  'ui.reorder.earlier': 'Mover {name} para antes',
  'ui.reorder.later': 'Mover {name} para depois',
  'ui.reorder.defaultLabel': 'item',
  'ui.lightbox.title': 'Visualizador de fotos',
  'ui.lightbox.caption': '{subject} — foto {n} de {total}',
  'ui.lightbox.counter': '{n} / {total}',
  'ui.lightbox.previous': 'Foto anterior',
  'ui.lightbox.next': 'Próxima foto',
  'ui.lightbox.original': 'Abrir original',
  'ui.lightbox.close': 'Fechar visualizador',
  'photos.drop': '⇪ solte as fotos aqui',
  'photos.browse': 'ou clique para escolher · faltam {remaining}',
  'photos.full': 'As {max} fotos já foram usadas — remova uma para adicionar outra',
  'photos.cover': 'Capa',
  'photos.makeCover': 'Tornar capa',
  'photos.frame': 'Ajustar enquadramento',
  'photos.remove': 'Remover foto',
  'photos.photoAt': 'Foto {n}',
  'photos.dismiss': 'Dispensar',
  'photos.uploading': 'Enviando {name}',
  'photos.coverHint': 'A primeira foto é a capa. Arraste ou use “Tornar capa” para mudar.',
  'upload.error.notAnImage': 'Não é uma imagem',
  'upload.error.tooLarge': 'Maior que 5 MB',
  'upload.error.tooMany': 'Sem espaço',
  'upload.error.failed': 'Falha no envio',
  'ui.focus.chooseView': 'Escolha o que mostrar',
  'ui.focus.coveredByHeader': 'coberto pelo cabeçalho',
  'ui.focus.reset': 'Redefinir',
  'ui.focus.cancel': 'Cancelar',
  'ui.focus.save': 'Salvar enquadramento',
  'ui.focus.hint':
    'Arraste o alvo até o que importa. Todos os tamanhos recortam em volta dele.',
  'ui.focus.targetLabel':
    'Ponto focal a {x}% da esquerda, {y}% do topo',
  'ui.focus.preset.itemCard': 'Card do item',
  'ui.focus.preset.itemGallery': 'Galeria do item',
  'ui.focus.preset.collectionBanner': 'Capa da coleção',
  'ui.focus.preset.dashboardCard': 'Card do painel',
  'ui.focus.preset.collectionIcon': 'Ícone da coleção',

  // --- topbar ------------------------------------------------------------
  'topbar.search': 'Buscar itens…',
  'topbar.theme': 'Tema',
  'topbar.themeMore': 'Ver detalhes nas configurações →',
  'topbar.language': 'Idioma',
  'topbar.settings': 'Configurações',
  'topbar.account': 'Conta',
  'topbar.signOut': 'Sair',

  // --- settings ----------------------------------------------------------
  'settings.title': 'Configurações',
  'settings.tab.appearance': 'Aparência',
  'settings.tab.plan': 'Plano',
  'settings.tab.access': 'Compartilhamento e acesso',
  'settings.tab.account': 'Conta e dados',

  'settings.theme.heading': 'Tema',
  'settings.theme.sub': 'Escolha um estilo — aplica na hora e fica salvo no seu perfil.',
  'settings.language.heading': 'Idioma',
  'settings.language.sub': 'Aplica na hora. Sua escolha fica guardada neste navegador.',
  'settings.currency.heading': 'Moeda',
  'settings.currency.sub':
    'A moeda em que todo valor do cofre é lido. É rótulo, não conversão — trocar aqui reapresenta os mesmos números com outro símbolo. Uma coleção pode sobrescrever.',

  'settings.plan.heading': 'Plano',
  'settings.plan.onPro': 'Você está no Pro — obrigado por apoiar o Vault.',
  'settings.plan.onFree':
    'Você está no Free — assine o Pro para liberar campos personalizados, fotos e backups.',
  'settings.plan.current': '● Plano atual',
  'settings.plan.upgrade': 'Assinar o Pro',
  'settings.plan.downgrade': 'Voltar para o Free',

  'settings.access.heading': 'Membros do tenant',
  'settings.access.subBefore': 'Todo mundo com acesso ao tenant',
  'settings.access.subAfter':
    '. Coleções individuais também podem ser compartilhadas na própria página.',
  'settings.access.removeMember': 'Remover {name}',
  'settings.access.policyHeading': 'Política de compartilhamento',
  'settings.access.policy.invites.label': 'Membros podem compartilhar coleções',
  'settings.access.policy.invites.description':
    'Editores podem convidar novas pessoas para as coleções que editam',
  'settings.access.policy.link.label': 'Compartilhamento por link',
  'settings.access.policy.link.description':
    'Permitir links somente-leitura para as coleções deste tenant',
  'settings.access.policy.external.label': 'Compartilhamento externo',
  'settings.access.policy.external.description':
    'Permitir compartilhar com pessoas de fora da sua organização',

  'settings.account.data': 'Dados',
  'settings.account.dataSub': '{items} itens em {collections} coleções',
  'settings.account.export': 'Exportar ZIP',
  'settings.account.exporting': 'Preparando…',
  'settings.account.import': 'Importar ZIP',
  'settings.account.importing': 'Importando…',
  'settings.account.importHint':
    'Lê de volta um .zip do export — uma coleção ou o acervo inteiro. Importar só acrescenta: uma coleção que já está no seu acervo chega ao lado dela como cópia, nunca por cima.',

  // --- roles (display labels — the wire values stay Owner/Editor/Viewer) --
  'role.owner': 'Dono',
  'role.editor': 'Pode editar',
  'role.viewer': 'Pode ver',

  // --- theme catalog (names are proper nouns and stay untranslated) -------
  'theme.devlight.description': 'Ferramenta de dev limpa. Neutros discretos, acento índigo.',
  'theme.devdark.description': 'Mesma estrutura, escura. Índigo suave sobre carvão.',
  'theme.terminal.description': 'Terminal CRT verde. Tudo monoespaçado, canto reto.',
  'theme.arcade.description': 'Títulos em pixel 8-bit, ciano + magenta, sombras duras.',
  'theme.hud.description': 'HUD de ficção científica. Azuis frios, bordas brilhantes.',
  'theme.paper.description': 'Impressão brutalista. Tinta no papel, sombras deslocadas.',
  'theme.synth.description': 'Noites de neon. Brilho magenta sobre roxo profundo.',

  // --- plan catalog (names are proper nouns and stay untranslated) --------
  'plan.free.price': '$0',
  'plan.free.feature.collections': '2 coleções',
  'plan.free.feature.items': 'Até 100 itens',
  'plan.free.feature.photos': '1 foto por item',
  'plan.free.feature.fields': 'Só os campos comuns',
  'plan.pro.price': '$6/mês',
  'plan.pro.feature.collections': 'Coleções e itens ilimitados',
  'plan.pro.feature.photos': '8 fotos por item',
  'plan.pro.feature.fields': 'Campos e grupos personalizados',
  'plan.pro.feature.value': 'Acompanhamento de valor e backups',

  // --- enum display labels (wire values never change — see CLAUDE.md) -----
  'condition.mint': 'Perfeito',
  'condition.good': 'Bom',
  'condition.fair': 'Razoável',
  'copyStatus.keep': 'Guardando',
  'copyStatus.forTrade': 'Para troca',
  'copyStatus.forSale': 'À venda',
  'badge.wanted': 'Quero',
  'badge.conditionCount': '{condition} ×{count}',

  // --- sorting -----------------------------------------------------------
  'sort.manual': 'Ordem manual',
  'sort.added.asc': 'Mais antigos primeiro',
  'sort.added.desc': 'Adicionados recentemente',
  'sort.name.asc': 'Nome A–Z',
  'sort.name.desc': 'Nome Z–A',
  'sort.value.asc': 'Valor menor → maior',
  'sort.value.desc': 'Valor maior → menor',
  'sort.year.asc': 'Ano antigo → novo',
  'sort.year.desc': 'Ano novo → antigo',
  'sort.field': '{name} {arrow}',
  'sortBy.manual': 'Manual — arraste para organizar',
  'sortBy.added': 'Data de inclusão',
  'sortBy.name': 'Nome',
  'sortBy.value': 'Valor',
  'sortBy.year': 'Ano',

  // --- progress (shared by the hero, the group cards and the tree) --------
  'progress.owned': '{ratio} na coleção',
  'progress.ofCatalogued': 'do catalogado',
  'progress.missing': 'faltam {n}',
  'progress.listed': '· {n} na wishlist',
  'progress.complete': 'Completo',
  'progress.allOwned': 'Tudo na coleção',
  'progress.overTarget': '· +{n} acima da meta',
  'progress.over': '· +{n} acima',
  'progress.copies': '· {n} exemplares',
  'progress.label': 'progresso de {name}',
  'progress.textNoTarget': '{owned} na coleção de {catalogued} catalogados',
  'progress.textTarget': '{owned} na coleção, {catalogued} catalogados, de {target} no conjunto',

  // --- collection hero ---------------------------------------------------
  'hero.bannerPlaceholder': 'Solte uma imagem de capa para esta coleção',
  'hero.iconPlaceholder': 'Ícone',
  'hero.inCollection': 'em {name}',
  'hero.ofTotal': '· {owned} / {total} no total',
  'hero.estimate': 'est.',
  'hero.manageSharing': 'Gerenciar compartilhamento',
  'hero.manage': '⚙ Gerenciar',
  'hero.manageTitle': 'Configurações da coleção — geral, grupos e compartilhamento',
  'hero.addItem': '+ Adicionar item',

  // --- group card --------------------------------------------------------
  'groupCard.subGroups': '↳ {n} subgrupos',
  'groupCard.emptyWithTarget': '0 / {target} · nada aqui ainda',
  'groupCard.empty': 'Nenhum item ainda',
  'groupCard.badgeTarget': 'Meta {target}',
  'groupCard.aria': '{name} — {ratio} na coleção',
  'groupCard.ariaMissing': 'faltam {n}',
  'groupCard.ariaOver': '{n} acima da meta',
  'groupCard.ariaSubGroups': '{n} subgrupos',

  // --- group dashboard ---------------------------------------------------
  'groupDashboard.filedHere.one': '{n} item aqui',
  'groupDashboard.filedHere.other': '{n} itens aqui',
  'groupDashboard.newGroup': '+ Novo grupo',
  'group.none': 'Sem grupo',
  'collection.noMatches': 'Nenhum item corresponde — limpe a busca ou os filtros.',
  'groupDashboard.empty':
    'Nenhum subgrupo aqui ainda. Crie um para dividir esta parte da coleção, ou mude para as visões de item acima.',

  // --- group tree --------------------------------------------------------
  'groupTree.heading': 'Grupos',
  'groupTree.hidePanel': 'Esconder o painel de grupos',
  'groupTree.aria': 'Grupos da coleção',
  'groupTree.collapseGroup': 'Recolher {name}',
  'groupTree.expandGroup': 'Expandir {name}',
  'groupTree.empty': 'Nenhum grupo ainda.',

  // --- breadcrumb --------------------------------------------------------
  'breadcrumb.pathAria': 'Caminho de grupos',
  'breadcrumb.showPanel': 'Mostrar o painel de grupos',
  'breadcrumb.groupPanel': '⟩ Painel de grupos',
  'breadcrumb.subGroupsAria': 'Subgrupos',
  'breadcrumb.newGroupPlaceholder': 'Nome do novo grupo… (Enter)',
  'breadcrumb.newGroupAria': 'Nome do novo grupo',
  'breadcrumb.new': '+ Novo',
  'breadcrumb.editGroups': '⚙ Editar grupos',
  'breadcrumb.editGroupsTitle': 'Renomear, aninhar, adicionar campos e definir metas para estes grupos',

  // --- toolbar & filters -------------------------------------------------
  'toolbar.searchResults': 'Resultados da busca',
  'toolbar.sort': 'Ordem: {label} ▾',
  'toolbar.groupDefault': 'Padrão do grupo — {label}',
  'toolbar.viewAria': 'Modo de exibição',
  'view.dashboard': 'Painel de grupos',
  'view.grid': 'Grade de itens',
  'view.list': 'Lista de itens',
  'filters.condition': 'Estado',
  'filters.status': 'Situação',
  'filters.owned': 'Na coleção',
  'filters.wanted': 'Wishlist',

  // --- item list & grid --------------------------------------------------
  'itemList.name': 'Nome',
  'itemList.group': 'Grupo',
  'itemList.year': 'Ano',
  'itemList.copies': 'Exemp.',
  'itemList.condition': 'Estado',
  'itemList.value': 'Valor',
  'itemGrid.copies': '· {n} exemplares',
  'itemGrid.addItem': '+ Adicionar item',
  'itemGrid.chipTitle': '{field}: {value}',

  // --- item page ---------------------------------------------------------
  'item.addPhoto': 'Adicionar foto',
  'item.viewLarge': 'Ver grande',
  'item.openViewer': 'Abrir o visualizador de fotos',
  'item.adjustFraming': 'Ajustar enquadramento',
  'item.browse.aria': 'Percorrer o grupo',
  'item.browse.keyboardHint': 'Use ← e → para andar entre os itens',
  'item.browse.previous': 'Anterior: {name}',
  'item.browse.next': 'Próximo: {name}',
  'item.browse.start': 'Início',
  'item.browse.end': 'Fim',
  'item.browse.position': '{i} / {n}',
  'item.browse.positionAria': 'Item {i} de {n}',
  'item.paid': 'pago {value}',
  'item.marketEstimate': 'estimativa de mercado',
  'item.onWantlist': 'Está na sua wishlist — ainda não é seu.',
  'item.markOwned': '✓ Tenho um — adicionar exemplar',
  'item.details': 'Detalhes',
  'item.year': 'Ano',
  'item.group': 'Grupo',
  'item.valuePerCopy': 'Valor est. / exemplar',
  'item.valuePaidPerCopy': 'Valor pago / exemplar',
  'item.copiesHeading': 'Exemplares · {n}',
  'item.copyPaid': 'pago {value}',
  'item.copyTotal.one': '{n} exemplar · pago {paid} · est. {value}',
  'item.copyTotal.other': '{n} exemplares · pago {paid} · est. {value}',
  'item.copyTotalPaid.one': '{n} exemplar · pago {paid} · sem valor estimado',
  'item.copyTotalPaid.other': '{n} exemplares · pago {paid} · sem valor estimado',
  'item.groupFields': 'Campos do grupo · {name}',
  'item.edit': 'Editar item',
  'item.delete': 'Excluir',
  'item.notFound': 'Item não encontrado nesta coleção.',

  // --- item form ---------------------------------------------------------
  'itemForm.editTitle': 'Editar item — {name}',
  'itemForm.newTitle': 'Adicionar item em {collection}',
  'itemForm.name': 'Nome',
  'itemForm.description': 'Descrição',
  'itemForm.group': 'Grupo',
  'itemForm.year': 'Ano',
  'itemForm.value': 'Valor est. (por exemplar)',
  'itemForm.valuePlaceholder': '— usa o valor pago',
  'itemForm.copiesHeading': 'Exemplares · {n}',
  'itemForm.copyTag': 'Exemplar #{n}',
  'itemForm.removeCopy': 'Remover exemplar',
  'itemForm.paid': 'Pago',
  'itemForm.copyValue': 'Valor est.',
  'itemForm.copyValuePlaceholder': '— usa o valor do item ou o pago',
  'itemForm.acquired': 'Adquirido em',
  'itemForm.notes': 'Notas',
  'itemForm.notesPlaceholder': 'lacrado · caixa A prateleira 2 · sem manual…',
  'itemForm.noCopies': 'Nenhum exemplar ainda — este item fica na sua wishlist.',
  'itemForm.addCopy': '+ Adicionar exemplar',
  'itemForm.groupFieldsHeading': 'Campos do grupo · {name}',
  'itemForm.noGroupFields': 'Este grupo ainda não tem campos personalizados.',
  'itemForm.groupFieldsHint': 'Os campos vêm do grupo do item — gerencie em',
  'itemForm.groupFieldsLink': 'Configurações da coleção ▸ Grupos e campos',
  'itemForm.cancel': 'Cancelar',
  'itemForm.save': 'Salvar item',

  // --- collection settings -----------------------------------------------
  'collSettings.title': 'Configurações da coleção',
  'collSettings.tab.general': 'Geral',
  'collSettings.tab.groups': 'Grupos e campos',
  'collSettings.tab.sharing': 'Compartilhamento',

  'collSettings.groups.scopedHeading': '{name} e subgrupos',
  'collSettings.groups.heading': 'Grupos e subgrupos',
  'collSettings.groups.showAll': 'Ver todos os grupos',
  'collSettings.groups.add': '+ Adicionar grupo',
  'collSettings.groups.itemCount': '{n} itens',
  'collSettings.groups.addSub': '+ Sub',
  'collSettings.groups.remove': 'Remover {name}',
  'collSettings.groups.fields': 'Campos',
  'collSettings.groups.removeField': 'Remover o campo {name}',
  'collSettings.groups.fieldPlaceholder': 'Nome do campo… (Enter)',
  'collSettings.groups.fieldAria': 'Nome do novo campo',
  'collSettings.groups.addField': '+ Campo',
  'collSettings.groups.orderBy': 'Ordenar por',
  'collSettings.groups.target': 'Meta',
  'collSettings.groups.targetAria': 'Meta para {name}',
  'collSettings.groups.inherited': 'Herdado — {label}',
  'collSettings.groups.notSet': 'Não definido',
  'collSettings.groups.newPlaceholder': 'Nome do grupo… (Enter para criar, Esc para cancelar)',
  'collSettings.groups.inParent': '↳ em {name}',
  'collSettings.groups.atRoot': '↳ no nível principal',
  'collSettings.groups.finePrint1':
    'Os nomes são salvos enquanto você digita. Campos personalizados valem para todos os itens do grupo e dos subgrupos, e o tipo do campo decide como ele ordena.',
  'collSettings.groups.finePrintOrderBy': 'Ordenar por',
  'collSettings.groups.finePrint2':
    'é a ordem padrão da coleção quando aquele grupo está aberto — os subgrupos herdam, a menos que definam a própria.',
  'collSettings.groups.finePrintTarget': 'Meta',
  'collSettings.groups.finePrint3':
    'é quantos itens o conjunto completo tem, quando você sabe — uma série de 120 edições, um set de 24 cartas — para o progresso ser medido contra a série e não contra o que você já catalogou. Deixe em branco e ele volta ao padrão. Grupos que ainda têm itens não podem ser excluídos — mova os itens primeiro.',

  'collSettings.sharing.emailPlaceholder': 'email@empresa.com',
  'collSettings.sharing.invite': 'Convidar',
  'collSettings.sharing.removeMember': 'Remover {name}',
  'collSettings.sharing.linkShare': 'Compartilhamento por link',
  'collSettings.sharing.linkShareSub': 'Qualquer pessoa com o link pode ver esta coleção',
  'collSettings.sharing.finePrint': 'As regras de acesso de todo o tenant ficam em',
  'collSettings.sharing.finePrintLink': 'Configurações ▸ Compartilhamento e acesso',

  'collSettings.general.name': 'Nome',
  'collSettings.general.description': 'Descrição',
  'collSettings.general.currency': 'Moeda',
  'collSettings.general.currencyInherit': 'Usar a moeda da conta',
  'collSettings.general.currencyHint':
    'Sobrescreve a moeda da conta ({currency}) só nesta coleção. Nenhum valor é convertido.',
  'collSettings.general.delete': 'Excluir coleção',
  'collSettings.done': 'Concluir',

  'direction.asc': '↑ Cresc.',
  'direction.desc': '↓ Decr.',
  'fieldType.text': 'texto',
  'fieldType.number': 'número',
  'fieldType.date': 'data',

  // --- first-run setup wizard --------------------------------------------
  'setup.brandSub': 'Configuração inicial',
  'setup.stepsAria': 'Etapas da configuração',
  'setup.step.token': 'Token',
  'setup.step.database': 'Banco de dados',
  'setup.step.administrator': 'Administrador',
  'setup.step.preferences': 'Preferências',
  'setup.step.review': 'Revisão',

  'setup.token.hint':
    'Um token de configuração de uso único foi impresso no log do contêiner na inicialização ({marker}). Cole-o aqui para continuar.',
  'setup.token.label': 'Token de configuração',
  'setup.token.placeholder': 'cole o token',

  'setup.db.hint':
    'Onde o Vault deve guardar os dados? O login precisa de permissão para criar o banco, caso ele ainda não exista.',
  'setup.db.server': 'Servidor',
  'setup.db.serverPlaceholder': 'host-do-banco',
  'setup.db.port': 'Porta',
  'setup.db.database': 'Banco de dados',
  'setup.db.username': 'Usuário',
  'setup.db.password': 'Senha',
  'setup.db.trustCert': 'Confiar no certificado do servidor',
  'setup.db.test': 'Testar conexão',
  'setup.db.testing': 'Testando…',

  'setup.test.success': 'Conectado a {target}. O banco “{database}” está pronto para uso.',
  'setup.test.willCreate':
    'Conectado a {target}. O banco “{database}” ainda não existe — ele será criado quando você concluir a configuração.',
  'setup.test.cannotCreate':
    'Conectado a {target}, mas o banco “{database}” não existe e este login não tem permissão para criá-lo. Crie o banco primeiro, ou use um login com a função dbcreator.',
  'setup.test.loginRejected':
    '{target} recusou este usuário e senha. Confira as credenciais e verifique se o servidor aceita autenticação do SQL Server (e não só do Windows).',
  'setup.test.unreachable':
    'Não foi possível encontrar um SQL Server em {target}. Confira o host e a porta, se o servidor está rodando e aceitando conexões TCP, e se nenhum firewall está no caminho.',
  'setup.test.unknown':
    'A conexão com {target} falhou por um motivo não reconhecido. Revise os dados e tente de novo.',

  'setup.admin.hint':
    'Dê um nome ao seu espaço de coleções e crie a conta de dono com a qual você vai entrar.',
  'setup.admin.org': 'Nome da organização',
  'setup.admin.orgPlaceholder': 'Minha coleção',
  'setup.admin.ownerName': 'Nome do dono',
  'setup.admin.ownerEmail': 'E-mail do dono',
  'setup.admin.password': 'Senha (mín. 8)',
  'setup.admin.confirm': 'Confirmar senha',
  'setup.admin.passwordTooShort': 'A senha precisa ter pelo menos 8 caracteres.',
  'setup.admin.passwordMismatch': 'As duas senhas não conferem.',

  'setup.prefs.hint': 'Escolha um tema padrão. Você pode trocar quando quiser nas configurações.',
  'setup.prefs.theme': 'Tema padrão',
  'setup.prefs.currency': 'Moeda',
  'setup.prefs.currencyHint':
    'A moeda em que os valores são lidos. Uma coleção pode sobrescrever depois, e nada é convertido.',

  'setup.review.hint':
    'Revise e aplique. O app vai reiniciar e levar você para a tela de entrada.',
  'setup.review.database': 'Banco de dados',
  'setup.review.organization': 'Organização',
  'setup.review.owner': 'Dono',
  'setup.review.theme': 'Tema',
  'setup.review.currency': 'Moeda',

  'setup.back': 'Voltar',
  'setup.next': 'Avançar',
  'setup.finish': 'Aplicar e concluir',
  'setup.applying': 'Aplicando…',

  'setup.error.testFailed':
    'Não foi possível rodar o teste de conexão. Confira o token e os campos acima, depois tente de novo.',
  'setup.error.applyFailed':
    'Não foi possível aplicar a configuração. Confira os dados das etapas anteriores e tente de novo.',
  'setup.error.notBackOnline':
    'A configuração foi aplicada, mas o app ainda não voltou. Aguarde um instante e recarregue a página.',
  'setup.error.badToken':
    'Esse token de configuração não foi aceito. Copie-o de novo da linha do log do contêiner que começa com “SETUP MODE”.',
  'setup.error.rateLimited': 'Tentativas demais. Espere alguns minutos e tente de novo.',
  'setup.error.unreachable':
    'Não foi possível falar com o servidor do Vault. Confira se o contêiner ainda está rodando e tente de novo.',

  // --- toasts ------------------------------------------------------------
  'toast.plan.pro': 'Bem-vindo ao Pro ✓',
  'toast.plan.free': 'Você voltou para o Free',
  'toast.member.roleUpdated': 'Papel atualizado',
  'toast.member.ownerImmutable': 'O dono não pode ser removido',
  'toast.member.removed': 'Acesso removido',
  'toast.export.done': 'vault-export.zip exportado ✓',
  'toast.export.failed': 'A exportação falhou — não deu para montar o arquivo',
  'toast.import.done.one': '1 coleção importada ✓',
  'toast.import.done.other': '{n} coleções importadas ✓',
  'toast.import.failed': 'Falha ao importar — não deu para ler o arquivo',
  'toast.collection.created': 'Coleção criada — dê um nome a ela aqui',
  'toast.collection.added': 'Adicionada ao seu acervo ✓',
  'toast.collection.addFailed': 'Não foi possível adicionar a checklist',
  'toast.image.updated': 'Imagem atualizada ✓',
  'toast.photo.limit': 'Até 8 fotos por item',
  'toast.photo.added': 'Foto adicionada ✓',
  'toast.framing.failed': 'Não foi possível salvar o enquadramento',
  'toast.photo.uploadFailed': 'O envio falhou',
  'toast.copy.added': 'Exemplar adicionado ✓',
  'toast.item.deleted': 'Item excluído',
  'toast.order.saved': 'Ordem salva ✓',
  'toast.order.failed': 'Não foi possível salvar a ordem',
  'toast.group.added': 'Grupo "{name}" adicionado',
  'toast.copy.limit': 'Até {n} exemplares por item',
  'toast.item.needsName': 'Dê um nome ao item',
  'toast.item.saved': 'Item salvo na sua coleção ✓',
  'toast.collection.deleted': 'Coleção excluída',
  'toast.collection.updated': 'Coleção atualizada ✓',
  'toast.currency.saved': 'Moeda atualizada ✓',
  'toast.currency.failed': 'Não foi possível trocar a moeda — só um Owner pode.',
  'toast.group.hasItems': 'O grupo tem itens — mova-os primeiro',
  'toast.group.removed': 'Grupo removido',
  'toast.field.removed': 'Campo removido',
  'toast.field.duplicate': '"{name}" já é um campo aqui',
  'toast.field.added': 'Campo "{name}" adicionado',
  'toast.invite.invalidEmail': 'Informe um e-mail válido',
  'toast.invite.sent': 'Convite enviado ✓',
};
