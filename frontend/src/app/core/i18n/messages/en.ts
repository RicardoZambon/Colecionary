/**
 * The source dictionary. Every key in the app is declared here first — the
 * `MessageKey` union is derived from this object, so a key that does not exist
 * here cannot be used in a template, and `pt-BR.ts` is typed
 * `Record<MessageKey, string>` and fails the build if it drifts.
 *
 * Keys read `<area>.<context>.<thing>`. Placeholders are `{name}`.
 *
 * Copy is written in sentence case. Micro-headings that render uppercase get
 * that from `text-transform` in SCSS, never from the string
 * (see `docs/frontend-standards.md` §2.8).
 */
export const en = {
  // --- common ------------------------------------------------------------
  'common.collectionNotFound': 'Collection not found —',
  'common.backToDashboard': 'back to Dashboard',
  'common.active': '● Active',
  'common.clickToApply': 'Click to apply',

  // --- value ---------------------------------------------------------------
  // How an amount is qualified, not the amount itself: `MoneyPipe` still owns
  // the digits. `≈` is the whole visual difference between "I estimated this"
  // and "this is what I paid", so it travels with the number everywhere.
  'value.fromPaid': '≈ {value}',
  'value.none': '—',
  'value.fromPaidHint': 'No estimate yet — showing what you paid for it.',

  // --- shell / sidebar ---------------------------------------------------
  'shell.loading': 'Loading your vault…',
  'nav.dashboard': 'Dashboard',
  'nav.store': 'Store',
  'nav.settings': 'Settings',
  'nav.collections': 'Collections',
  'nav.status': '● synced · v0.1 mock API',

  // --- login -------------------------------------------------------------
  'login.tagline': 'Sign in to your collection vault.',
  'login.email': 'Email',
  'login.emailPlaceholder': 'you@company.com',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.demoHint': 'demo:',
  'login.error.credentials': 'Invalid email or password.',
  'login.error.rateLimited': 'Too many sign-in attempts. Wait a few minutes, then try again.',
  'login.error.unreachable': 'Can’t reach the Vault server. Check that it’s running, then try again.',
  'login.error.server': 'The Vault server hit an error while signing you in. Try again in a moment.',
  'login.error.other': 'Sign-in failed (HTTP {status}). Try again, or check the server logs.',

  // --- dashboard ---------------------------------------------------------
  'dashboard.title': 'Dashboard',
  'dashboard.sub': '{items} items across {collections} collections · welcome back, {name}',
  'dashboard.stat.items': 'Items',
  'dashboard.stat.itemsSub': 'across {collections} collections',
  'dashboard.stat.value': 'Est. value',
  'dashboard.stat.groups': 'Groups',
  'dashboard.stat.groupsSub': 'in {collections} collections',
  'dashboard.stat.added': 'Added',
  'dashboard.stat.addedSub': 'this week',
  'dashboard.noPurchaseData': 'no purchase data yet',
  'dashboard.appreciation': '{arrow} {pct}% vs purchase',
  'dashboard.collections': 'Collections',
  'dashboard.collectionMeta': '{owned}/{total} owned · {groups} groups',
  'dashboard.newCollection': '+ New collection',
  'dashboard.newCollectionName': 'New collection',
  'dashboard.recent': 'Recent additions',
  'dashboard.recentSub': '{collection} · added {when}',

  // --- store -------------------------------------------------------------
  'store.title': 'Collection Store',
  'store.sub':
    'Curated checklists — add one to your vault, then track how close you are to completing it.',
  'store.curated': 'Curated',
  'store.listingMeta': 'by {publisher} · {items} items · {groups} groups',
  'store.estimate': 'est {value}',
  'store.inVault': '✓ In your vault',
  'store.add': '+ Add to vault',

  // --- shared/ui ---------------------------------------------------------
  'ui.imageSlot.hint': 'Click or drop an image',
  'ui.imageSlot.reframe': 'Adjust framing',
  'ui.reorder.earlier': 'Move {name} earlier',
  'ui.reorder.later': 'Move {name} later',
  'ui.reorder.defaultLabel': 'item',
  'ui.lightbox.title': 'Photo viewer',
  'ui.lightbox.caption': '{subject} — photo {n} of {total}',
  'ui.lightbox.counter': '{n} / {total}',
  'ui.lightbox.previous': 'Previous photo',
  'ui.lightbox.next': 'Next photo',
  'ui.lightbox.original': 'Open original',
  'ui.lightbox.close': 'Close viewer',
  'photos.drop': '⇪ drop photos here',
  'photos.browse': 'or click to browse · {remaining} left',
  'photos.full': 'All {max} photos used — remove one to add another',
  'photos.cover': 'Cover',
  'photos.makeCover': 'Make cover',
  'photos.frame': 'Adjust framing',
  'photos.remove': 'Remove photo',
  'photos.photoAt': 'Photo {n}',
  'photos.dismiss': 'Dismiss',
  'photos.uploading': 'Uploading {name}',
  'photos.coverHint': 'The first photo is the cover. Drag or use “Make cover” to change it.',
  'upload.error.notAnImage': 'Not an image',
  'upload.error.tooLarge': 'Larger than 5 MB',
  'upload.error.tooMany': 'No room left',
  'upload.error.failed': 'Upload failed',
  'ui.focus.chooseView': 'Choose what to show',
  'ui.focus.coveredByHeader': 'covered by header',
  'ui.focus.reset': 'Reset',
  'ui.focus.cancel': 'Cancel',
  'ui.focus.save': 'Save framing',
  'ui.focus.hint':
    'Drag the target onto what matters. Every size crops around it.',
  'ui.focus.targetLabel':
    'Focal point {x}% across, {y}% down',
  'ui.focus.preset.itemCard': 'Item card',
  'ui.focus.preset.itemGallery': 'Item gallery',
  'ui.focus.preset.collectionBanner': 'Collection banner',
  'ui.focus.preset.dashboardCard': 'Dashboard card',
  'ui.focus.preset.collectionIcon': 'Collection icon',

  // --- topbar ------------------------------------------------------------
  'topbar.search': 'Search items…',
  'topbar.theme': 'Theme',
  'topbar.themeMore': 'Browse details in Settings →',
  'topbar.language': 'Language',
  'topbar.settings': 'Settings',
  'topbar.account': 'Account',
  'topbar.signOut': 'Sign out',

  // --- settings ----------------------------------------------------------
  'settings.title': 'Settings',
  'settings.tab.appearance': 'Appearance',
  'settings.tab.plan': 'Plan',
  'settings.tab.access': 'Sharing & access',
  'settings.tab.account': 'Account & data',

  'settings.theme.heading': 'Theme',
  'settings.theme.sub': 'Pick a style — applies instantly and is saved to your profile.',
  'settings.language.heading': 'Language',
  'settings.language.sub': 'Applies instantly. Your choice is remembered in this browser.',
  'settings.currency.heading': 'Currency',
  'settings.currency.sub':
    'What every amount in the vault is read in. This is a label, not a conversion — changing it restates the same figures under a new symbol. A collection can override it.',

  'settings.plan.heading': 'Plan',
  'settings.plan.onPro': 'You are on Pro — thanks for supporting Vault.',
  'settings.plan.onFree': 'You are on Free — upgrade to unlock custom fields, photos and backups.',
  'settings.plan.current': '● Current plan',
  'settings.plan.upgrade': 'Upgrade to Pro',
  'settings.plan.downgrade': 'Switch to Free',

  'settings.access.heading': 'Tenant members',
  'settings.access.subBefore': 'Everyone with access to the',
  'settings.access.subAfter':
    'tenant. Individual collections can also be shared from their own page.',
  'settings.access.removeMember': 'Remove {name}',
  'settings.access.policyHeading': 'Sharing policy',
  'settings.access.policy.invites.label': 'Members can share collections',
  'settings.access.policy.invites.description':
    'Editors may invite new people to collections they can edit',
  'settings.access.policy.link.label': 'Link sharing',
  'settings.access.policy.link.description':
    'Allow view-only links for collections in this tenant',
  'settings.access.policy.external.label': 'External sharing',
  'settings.access.policy.external.description':
    'Allow sharing with people outside your organisation',

  'settings.account.data': 'Data',
  'settings.account.dataSub': '{items} items across {collections} collections',
  'settings.account.export': 'Export ZIP',
  'settings.account.exporting': 'Preparing…',
  'settings.account.import': 'Import ZIP',
  'settings.account.perCollection': 'One collection at a time',
  'settings.account.perCollectionHint':
    'A .zip of a single collection and the photos it uses — a copy to hand to someone, or to restore on its own. You can also export the one you are looking at from its own settings.',
  'settings.account.collectionMeta': '{items} items',
  'settings.account.noCollections': 'No collections yet.',
  'settings.account.importing': 'Importing…',
  'settings.account.importHint':
    'Reads back a .zip from the export — one collection or a whole vault. An import only ever adds: a collection already in your vault arrives beside it as a copy, never over it.',

  // --- roles (display labels — the wire values stay Owner/Editor/Viewer) --
  'role.owner': 'Owner',
  'role.editor': 'Can edit',
  'role.viewer': 'Can view',

  // --- theme catalog (names are proper nouns and stay untranslated) -------
  'theme.devlight.description': 'Clean dev-tool. Quiet neutrals, indigo accent.',
  'theme.devdark.description': 'Same bones, dark. Soft indigo on charcoal.',
  'theme.terminal.description': 'Green CRT terminal. All monospace, zero radius.',
  'theme.arcade.description': '8-bit pixel headings, cyan + magenta, hard shadows.',
  'theme.hud.description': 'Sci-fi HUD. Cold blues, glowing edges.',
  'theme.paper.description': 'Brutalist print. Ink on paper, hard offset shadows.',
  'theme.synth.description': 'Neon nights. Magenta glow on deep purple.',

  // --- plan catalog (names are proper nouns and stay untranslated) --------
  'plan.free.price': '$0',
  'plan.free.feature.collections': '2 collections',
  'plan.free.feature.items': 'Up to 100 items',
  'plan.free.feature.photos': '1 photo per item',
  'plan.free.feature.fields': 'Common fields only',
  'plan.pro.price': '$6/mo',
  'plan.pro.feature.collections': 'Unlimited collections & items',
  'plan.pro.feature.photos': '8 photos per item',
  'plan.pro.feature.fields': 'Custom fields & groups',
  'plan.pro.feature.value': 'Value tracking & backups',

  // --- enum display labels (wire values never change — see CLAUDE.md) -----
  'condition.mint': 'Mint',
  'condition.good': 'Good',
  'condition.fair': 'Fair',
  'copyStatus.keep': 'Keeping',
  'copyStatus.forTrade': 'For trade',
  'copyStatus.forSale': 'For sale',
  'badge.wanted': 'Wanted',
  'badge.conditionCount': '{condition} ×{count}',

  // --- sorting -----------------------------------------------------------
  'sort.manual': 'Manual order',
  'sort.added.asc': 'Oldest first',
  'sort.added.desc': 'Recently added',
  'sort.name.asc': 'Name A–Z',
  'sort.name.desc': 'Name Z–A',
  'sort.value.asc': 'Value low → high',
  'sort.value.desc': 'Value high → low',
  'sort.year.asc': 'Year old → new',
  'sort.year.desc': 'Year new → old',
  'sort.field': '{name} {arrow}',
  'sortBy.manual': 'Manual — drag to arrange',
  'sortBy.added': 'Date added',
  'sortBy.name': 'Name',
  'sortBy.value': 'Value',
  'sortBy.year': 'Year',

  // --- progress (shared by the hero, the group cards and the tree) --------
  'progress.owned': '{ratio} owned',
  'progress.ofCatalogued': 'of catalogued',
  'progress.missing': '{n} missing',
  'progress.listed': '· {n} listed',
  'progress.complete': 'Complete',
  'progress.allOwned': 'All owned',
  'progress.overTarget': '· +{n} over target',
  'progress.over': '· +{n} over',
  'progress.copies': '· {n} copies',
  'progress.label': '{name} progress',
  'progress.textNoTarget': '{owned} owned of {catalogued} catalogued',
  'progress.textTarget': '{owned} owned, {catalogued} catalogued, of {target} in the set',

  // --- collection hero ---------------------------------------------------
  'hero.bannerPlaceholder': 'Drop a banner image for this collection',
  'hero.iconPlaceholder': 'Icon',
  'hero.inCollection': 'in {name}',
  'hero.ofTotal': '· {owned} / {total} in all',
  'hero.estimate': 'est',
  'hero.manageSharing': 'Manage sharing',
  'hero.manage': '⚙ Manage',
  'hero.manageTitle': 'Collection settings — general, groups & sharing',
  'hero.addItem': '+ Add item',

  // --- group card --------------------------------------------------------
  'groupCard.subGroups': '↳ {n} sub-groups',
  'groupCard.emptyWithTarget': '0 / {target} · nothing here yet',
  'groupCard.empty': 'No items yet',
  'groupCard.badgeTarget': 'Target {target}',
  'groupCard.aria': '{name} — {ratio} owned',
  'groupCard.ariaMissing': '{n} missing',
  'groupCard.ariaOver': '{n} over target',
  'groupCard.ariaSubGroups': '{n} sub-groups',

  // --- group dashboard ---------------------------------------------------
  'groupDashboard.filedHere.one': '{n} item filed here',
  'groupDashboard.filedHere.other': '{n} items filed here',
  'groupDashboard.newGroup': '+ New group',
  'group.none': 'No group',
  'collection.noMatches': 'No items match — clear search or filters.',
  'groupDashboard.empty':
    'No sub-groups here yet. Create one to break this part of the collection down, or switch to the item views above.',

  // --- group tree --------------------------------------------------------
  'groupTree.heading': 'Groups',
  'groupTree.hidePanel': 'Hide the group panel',
  'groupTree.aria': 'Collection groups',
  'groupTree.collapseGroup': 'Collapse {name}',
  'groupTree.expandGroup': 'Expand {name}',
  'groupTree.empty': 'No groups yet.',

  // --- breadcrumb --------------------------------------------------------
  'breadcrumb.pathAria': 'Group path',
  'breadcrumb.showPanel': 'Show the group panel',
  'breadcrumb.groupPanel': '⟩ Group panel',
  'breadcrumb.subGroupsAria': 'Sub-groups',
  'breadcrumb.newGroupPlaceholder': 'New group name… (Enter)',
  'breadcrumb.newGroupAria': 'New group name',
  'breadcrumb.new': '+ New',
  'breadcrumb.editGroups': '⚙ Edit groups',
  'breadcrumb.editGroupsTitle': 'Rename, nest, add fields and set targets for these groups',

  // --- toolbar & filters -------------------------------------------------
  'toolbar.searchResults': 'Search results',
  'toolbar.sort': 'Sort: {label} ▾',
  'toolbar.groupDefault': 'Group default — {label}',
  'toolbar.viewAria': 'View mode',
  'view.dashboard': 'Group dashboard',
  'view.grid': 'Item grid',
  'view.list': 'Item list',
  'filters.condition': 'Condition',
  'filters.status': 'Status',
  'filters.owned': 'Owned',
  'filters.wanted': 'Wanted',

  // --- item list & grid --------------------------------------------------
  'itemList.name': 'Name',
  'itemList.group': 'Group',
  'itemList.year': 'Year',
  'itemList.copies': 'Copies',
  'itemList.condition': 'Cond',
  'itemList.value': 'Value',
  'itemGrid.copies': '· {n} copies',
  'itemGrid.addItem': '+ Add item',
  'itemGrid.chipTitle': '{field}: {value}',

  // --- item page ---------------------------------------------------------
  'item.addPhoto': 'Add photo',
  'item.viewLarge': 'View large',
  'item.openViewer': 'Open the photo viewer',
  'item.adjustFraming': 'Adjust framing',
  'item.browse.aria': 'Browse the group',
  'item.browse.keyboardHint': 'Use ← and → to move between items',
  'item.browse.previous': 'Previous: {name}',
  'item.browse.next': 'Next: {name}',
  'item.browse.start': 'Start',
  'item.browse.end': 'End',
  'item.browse.position': '{i} / {n}',
  'item.browse.positionAria': 'Item {i} of {n}',
  'item.paid': 'paid {value}',
  'item.marketEstimate': 'market estimate',
  'item.onWantlist': 'On your wantlist — not in your vault yet.',
  'item.markOwned': '✓ I own one — add a copy',
  'item.details': 'Details',
  'item.year': 'Year',
  'item.group': 'Group',
  'item.valuePerCopy': 'Est. value / copy',
  'item.valuePaidPerCopy': 'Paid / copy',
  'item.copiesHeading': 'Copies · {n}',
  'item.copyPaid': 'paid {value}',
  'item.copyTotal.one': '{n} copy · paid {paid} · est. {value}',
  'item.copyTotal.other': '{n} copies · paid {paid} · est. {value}',
  'item.copyTotalPaid.one': '{n} copy · paid {paid} · not estimated yet',
  'item.copyTotalPaid.other': '{n} copies · paid {paid} · not estimated yet',
  'item.groupFields': 'Group fields · {name}',
  'item.edit': 'Edit item',
  'item.delete': 'Delete',
  'item.notFound': 'Item not found in this collection.',

  // --- item form ---------------------------------------------------------
  'itemForm.editTitle': 'Edit item — {name}',
  'itemForm.newTitle': 'Add item to {collection}',
  'itemForm.name': 'Name',
  'itemForm.description': 'Description',
  'itemForm.group': 'Group',
  'itemForm.year': 'Year',
  'itemForm.value': 'Est. value (per copy)',
  'itemForm.valuePlaceholder': '— uses what you paid',
  'itemForm.copiesHeading': 'Copies · {n}',
  'itemForm.copyTag': 'Copy #{n}',
  'itemForm.removeCopy': 'Remove copy',
  'itemForm.paid': 'Paid',
  'itemForm.copyValue': 'Est. value',
  'itemForm.copyValuePlaceholder': '— uses item value, or what you paid',
  'itemForm.acquired': 'Acquired',
  'itemForm.notes': 'Notes',
  'itemForm.notesPlaceholder': 'sealed · box A shelf 2 · missing manual…',
  'itemForm.noCopies': 'No copies yet — this item stays on your wantlist.',
  'itemForm.addCopy': '+ Add copy',
  'itemForm.groupFieldsHeading': 'Group fields · {name}',
  'itemForm.noGroupFields': 'This group has no custom fields yet.',
  'itemForm.groupFieldsHint': "Fields come from the item's group — manage them in",
  'itemForm.groupFieldsLink': 'Collection settings ▸ Groups & fields',
  'itemForm.cancel': 'Cancel',
  'itemForm.save': 'Save item',

  // --- collection settings -----------------------------------------------
  'collSettings.title': 'Collection settings',
  'collSettings.tab.general': 'General',
  'collSettings.tab.groups': 'Groups & fields',
  'collSettings.tab.sharing': 'Sharing',

  'collSettings.groups.scopedHeading': '{name} & sub-groups',
  'collSettings.groups.heading': 'Groups & sub-groups',
  'collSettings.groups.showAll': 'Show all groups',
  'collSettings.groups.add': '+ Add group',
  'collSettings.groups.itemCount': '{n} items',
  'collSettings.groups.addSub': '+ Sub',
  'collSettings.groups.remove': 'Remove {name}',
  'collSettings.groups.fields': 'Fields',
  'collSettings.groups.removeField': 'Remove field {name}',
  'collSettings.groups.fieldPlaceholder': 'Field name… (Enter)',
  'collSettings.groups.fieldAria': 'New field name',
  'collSettings.groups.addField': '+ Field',
  'collSettings.groups.orderBy': 'Order by',
  'collSettings.groups.target': 'Target',
  'collSettings.groups.targetAria': 'Target for {name}',
  'collSettings.groups.inherited': 'Inherited — {label}',
  'collSettings.groups.notSet': 'Not set',
  'collSettings.groups.newPlaceholder': 'Group name… (Enter to create, Esc to cancel)',
  'collSettings.groups.inParent': '↳ in {name}',
  'collSettings.groups.atRoot': '↳ at the top level',
  'collSettings.groups.finePrint1':
    'Renames apply as you type. Custom fields apply to every item in the group and its sub-groups, and the field type decides how it sorts.',
  'collSettings.groups.finePrintOrderBy': 'Order by',
  'collSettings.groups.finePrint2':
    'is the default the collection uses when that group is open — sub-groups inherit it unless they set their own.',
  'collSettings.groups.finePrintTarget': 'Target',
  'collSettings.groups.finePrint3':
    "is how many items the complete set has, when you know it — a 120-issue run, a 24-card set — so progress is measured against the series instead of against what you've catalogued so far. Leave it blank and it falls back. Groups that still contain items can't be deleted — move the items first.",

  'collSettings.sharing.emailPlaceholder': 'email@company.com',
  'collSettings.sharing.invite': 'Invite',
  'collSettings.sharing.removeMember': 'Remove {name}',
  'collSettings.sharing.linkShare': 'Link sharing',
  'collSettings.sharing.linkShareSub': 'Anyone with the link can view this collection',
  'collSettings.sharing.finePrint': 'Tenant-wide access rules live in',
  'collSettings.sharing.finePrintLink': 'Settings ▸ Sharing & access',

  'collSettings.general.name': 'Name',
  'collSettings.general.description': 'Description',
  'collSettings.general.currency': 'Currency',
  'collSettings.general.currencyInherit': 'Use the account currency',
  'collSettings.general.currencyHint':
    'Overrides the account currency ({currency}) for this collection only. No amount is converted.',
  'collSettings.general.backup': 'Backup',
  'collSettings.general.backupHint':
    'A .zip of this collection and the photos it uses. Read it back from Settings → Account & data.',
  'collSettings.general.export': 'Export this collection',
  'collSettings.general.exporting': 'Preparing…',
  'collSettings.general.delete': 'Delete collection',
  'collSettings.done': 'Done',

  'direction.asc': '↑ Asc',
  'direction.desc': '↓ Desc',
  'fieldType.text': 'text',
  'fieldType.number': 'number',
  'fieldType.date': 'date',

  // --- first-run setup wizard --------------------------------------------
  'setup.brandSub': 'First-run setup',
  'setup.stepsAria': 'Setup steps',
  'setup.step.token': 'Token',
  'setup.step.database': 'Database',
  'setup.step.administrator': 'Administrator',
  'setup.step.preferences': 'Preferences',
  'setup.step.review': 'Review',

  'setup.token.hint':
    'A one-time setup token was printed to the container log at startup ({marker}). Paste it here to continue.',
  'setup.token.label': 'Setup token',
  'setup.token.placeholder': 'paste the token',

  'setup.db.hint':
    "Where should Vault store its data? The login needs rights to create the database if it doesn't exist.",
  'setup.db.server': 'Server',
  'setup.db.serverPlaceholder': 'db-host',
  'setup.db.port': 'Port',
  'setup.db.database': 'Database',
  'setup.db.username': 'Username',
  'setup.db.password': 'Password',
  'setup.db.trustCert': 'Trust server certificate',
  'setup.db.test': 'Test connection',
  'setup.db.testing': 'Testing…',

  'setup.test.success': 'Connected to {target}. The database “{database}” is ready to use.',
  'setup.test.willCreate':
    'Connected to {target}. The database “{database}” doesn\'t exist yet — it will be created for you when you finish setup.',
  'setup.test.cannotCreate':
    'Connected to {target}, but the database “{database}” doesn\'t exist and this login isn\'t allowed to create it. Create the database first, or use a login with the dbcreator role.',
  'setup.test.loginRejected':
    '{target} refused this username and password. Check the credentials, and make sure the server allows SQL Server authentication (not Windows-only).',
  'setup.test.unreachable':
    "Couldn't reach a SQL Server at {target}. Check the host name and port, that the server is running and accepting TCP connections, and that no firewall is in the way.",
  'setup.test.unknown':
    'The connection to {target} failed for an unrecognized reason. Double-check the details and try again.',

  'setup.admin.hint':
    "Name your collection space and create the owner account you'll sign in with.",
  'setup.admin.org': 'Organization name',
  'setup.admin.orgPlaceholder': 'My Collection',
  'setup.admin.ownerName': 'Owner name',
  'setup.admin.ownerEmail': 'Owner email',
  'setup.admin.password': 'Password (min 8)',
  'setup.admin.confirm': 'Confirm password',
  'setup.admin.passwordTooShort': 'The password needs at least 8 characters.',
  'setup.admin.passwordMismatch': "The two passwords don't match.",

  'setup.prefs.hint': 'Pick a default theme. You can change it any time in settings.',
  'setup.prefs.theme': 'Default theme',
  'setup.prefs.currency': 'Currency',
  'setup.prefs.currencyHint':
    'What amounts are read in. A collection can override it later, and nothing is ever converted.',

  'setup.review.hint':
    'Review, then apply. The app will restart and take you to the sign-in screen.',
  'setup.review.database': 'Database',
  'setup.review.organization': 'Organization',
  'setup.review.owner': 'Owner',
  'setup.review.theme': 'Theme',
  'setup.review.currency': 'Currency',

  'setup.back': 'Back',
  'setup.next': 'Next',
  'setup.finish': 'Apply & finish',
  'setup.applying': 'Applying…',

  'setup.error.testFailed':
    'The connection test couldn’t run. Check the token and the fields above, then try again.',
  'setup.error.applyFailed':
    'Setup couldn’t be applied. Check the details on the previous steps and try again.',
  'setup.error.notBackOnline':
    'Setup was applied, but the app hasn’t come back online yet. Give it a moment and reload the page.',
  'setup.error.badToken':
    'That setup token wasn’t accepted. Copy it again from the container log line that starts with “SETUP MODE”.',
  'setup.error.rateLimited': 'Too many attempts. Wait a few minutes, then try again.',
  'setup.error.unreachable':
    'Couldn’t reach the Vault server. Check that the container is still running, then try again.',

  // --- toasts ------------------------------------------------------------
  'toast.plan.pro': 'Welcome to Pro ✓',
  'toast.plan.free': 'Switched to Free',
  'toast.member.roleUpdated': 'Role updated',
  'toast.member.ownerImmutable': "The owner can't be removed",
  'toast.member.removed': 'Access removed',
  'toast.export.done': 'Exported vault-export.zip ✓',
  'toast.export.failed': "Export failed — couldn't build the archive",
  'toast.export.collectionDone': 'Collection exported ✓',
  // Not pluralised in code: the count is spelled into the sentence, and one
  // collection restoring is the common case worth reading naturally.
  'toast.import.done.one': 'Imported 1 collection ✓',
  'toast.import.done.other': 'Imported {n} collections ✓',
  'toast.import.failed': 'Import failed — the archive could not be read',

  // --- import dialog -------------------------------------------------------
  'import.title': 'Import backup',
  // Counted sentences are spelled out per case rather than assembled: the `t`
  // pipe substitutes placeholders and does not do plural rules, and "1
  // collections" is exactly the seam where that shows.
  'import.lede.one':
    'One collection in this file is already in your vault under the same name. Say what should happen to it.',
  'import.lede.other':
    '{n} collections in this file are already in your vault under the same name. Say what should happen to each.',
  'import.choiceFor': 'What to do with {name}',
  'import.createNew': 'Create a new one',
  'import.overwrite': 'Overwrite the existing one',
  'import.willBeCreated': 'new · will be created',
  'import.overwriteWarning.one':
    'Overwriting replaces that collection entirely — anything the backup does not have will be gone. Nothing is merged.',
  'import.overwriteWarning.other':
    'Overwriting replaces those {n} collections entirely — anything the backup does not have will be gone. Nothing is merged.',
  'import.cancel': 'Cancel',
  'import.confirm': 'Import',
  'import.importing': 'Importing…',
  'toast.collection.created': 'Collection created — name it here',
  'toast.collection.added': 'Added to your vault ✓',
  'toast.collection.addFailed': 'Could not add checklist',
  'toast.image.updated': 'Image updated ✓',
  'toast.photo.limit': 'Up to 8 photos per item',
  'toast.photo.added': 'Photo added ✓',
  'toast.framing.failed': "Couldn't save the framing",
  'toast.photo.uploadFailed': 'Upload failed',
  'toast.copy.added': 'Copy added ✓',
  'toast.item.deleted': 'Item deleted',
  'toast.order.saved': 'Order saved ✓',
  'toast.order.failed': 'Could not save the order',
  'toast.group.added': 'Group "{name}" added',
  'toast.copy.limit': 'Up to {n} copies per item',
  'toast.item.needsName': 'Give the item a name',
  'toast.item.saved': 'Saved ✓',
  'toast.collection.deleted': 'Collection deleted',
  'toast.collection.updated': 'Collection updated ✓',
  'toast.currency.saved': 'Currency updated ✓',
  'toast.currency.failed': "Couldn't change the currency — only an Owner can.",
  'toast.group.hasItems': 'Group has items — move them first',
  'toast.group.removed': 'Group removed',
  'toast.field.removed': 'Field removed',
  'toast.field.duplicate': '"{name}" is already a field here',
  'toast.field.added': 'Field "{name}" added',
  'toast.invite.invalidEmail': 'Enter a valid email',
  'toast.invite.sent': 'Invite sent ✓',
} as const;
