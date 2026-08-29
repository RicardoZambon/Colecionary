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
  // The text alternative behind a skeleton. Said once, by the region that is
  // loading — the skeletons themselves are aria-hidden pictures of a layout.
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',

  // --- value ---------------------------------------------------------------
  // How an amount is qualified, not the amount itself: `MoneyPipe` still owns
  // the digits. `≈` is the whole visual difference between "I estimated this"
  // and "this is what I paid", so it travels with the number everywhere.
  'value.fromPaid': '≈ {value}',
  'value.none': '—',
  'value.fromPaidHint': 'No estimate yet — showing what you paid for it.',

  // --- shell / sidebar ---------------------------------------------------
  'shell.loading': 'Loading your vault…',
  // A failed load is a state now, not an eternal "Loading…".
  'shell.loadFailed.title': 'Couldn’t load your vault',
  'shell.loadFailed.body':
    'Nothing was lost — the app just couldn’t reach the server. Check your connection, then try again.',
  'shell.loadFailed.retry': 'Try again',
  'shell.loadFailed.retrying': 'Trying again…',
  'nav.dashboard': 'Dashboard',
  'nav.store': 'Store',
  'nav.settings': 'Settings',
  'nav.collections': 'Collections',
  // Kept only until the sidebar binds `VaultStore.syncStatusKey()`; the value
  // that used to be here claimed "synced · v0.1 mock API" from a decorative dot
  // that never changed, against a real .NET backend.
  // The four states the status line can actually be in. Words, not a hue — the
  // dot beside them is decoration and never carries the meaning on its own.
  'nav.sync.synced': 'All changes saved',
  'nav.sync.saving': 'Saving…',
  'nav.sync.offline': 'Not connected',
  'nav.sync.conflict': 'Save refused — see the notice',

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
  'photos.drop': 'drop photos here',
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
  // No client-set plan any more: there is no billing behind it and nothing in
  // the app is gated on the plan, so the control says so instead of pretending.
  'settings.plan.unavailable': 'Not available yet',
  'settings.plan.billingNote':
    'Billing isn’t built yet, so plans can’t be changed from here — and nothing in the app is limited by your plan today. This is what the tiers will cover.',

  'settings.access.heading': 'Tenant members',
  'settings.access.subBefore': 'Everyone with access to the',
  'settings.access.subAfter':
    'tenant. Individual collections can also be shared from their own page.',
  'settings.access.removeMember': 'Remove {name}',
  'settings.access.memberRoleAria': 'Role for {name}',
  'settings.access.policyNote':
    'Access is controlled here, per person, and on each collection’s own page for link sharing. There are no tenant-wide sharing switches yet.',
  'settings.access.remove.confirm.title': 'Remove {name}?',
  'settings.access.remove.confirm.body':
    'They lose access to this vault straight away. Their collections and items stay exactly as they are, and you can invite them back later.',
  'settings.access.remove.confirm.ok': 'Remove access',

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
  'hero.manage': 'Manage',
  'hero.manageTitle': 'Collection settings — general, groups & sharing',
  'hero.addItem': 'Add item',
  // Said instead of a 0% bar and an "est. $0.00": at zero items every one of
  // those figures is an artefact of dividing by nothing, not a measurement.
  'hero.noMeasure.title': 'Nothing to measure yet',

  // --- group card --------------------------------------------------------
  'groupCard.subGroups': '{n} sub-groups',
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
  'collection.noMatches': 'No items match',
  'collection.noMatchesBody': 'Nothing here fits the filters and search in force.',
  'collection.clearFilters': 'Clear filters',
  'collection.empty': 'Nothing catalogued here yet',
  'collection.emptyBody': 'Add the first item and it will show up in this list.',
  'groupDashboard.emptyTitle': 'No sub-groups here',
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
  'crumb.new': 'new',
  'crumb.edit': 'edit',
  'crumb.settings': 'settings',
  'breadcrumb.newGroupPlaceholder': 'New group name… (Enter)',
  'breadcrumb.newGroupAria': 'New group name',
  'breadcrumb.new': '+ New',
  'breadcrumb.editGroups': 'Edit groups',
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
  'item.noPhoto': 'No photo yet',

  // --- item list columns, sorting & totals --------------------------------
  'itemList.sortBy': 'Sort by {label}',
  'itemList.sortedAsc': 'Sorted by {label}, ascending — click to reverse',
  'itemList.sortedDesc': 'Sorted by {label}, descending — click to reverse',
  'itemList.rows.one': '{n} row',
  'itemList.rows.other': '{n} rows',
  // Plural-safe in both languages on purpose: this string interpolates two
  // counts and there is no room for a `plural()` call per half.
  'itemList.footHeld': '{owned} owned · {copies} in hand',
  'itemList.footAria': 'List totals',
  'itemList.tableAria': 'Item table',
  'columns.trigger': 'Columns ▾',
  'columns.aria': 'Field columns',
  'columns.showField': 'Show the {name} column',

  // --- selection & bulk editing ------------------------------------------
  'select.item': 'Select {name}',
  'select.all': 'Select every item on screen',
  'select.rangeHint': 'Hold Shift — with a click or the space bar — to select a range',
  'bulk.aria': 'Bulk actions for the selected items',
  'bulk.selected.one': '{n} item selected',
  'bulk.selected.other': '{n} items selected',
  'bulk.clear': 'Clear',
  'bulk.showEdit': 'Edit fields',
  'bulk.hideEdit': 'Close fields',
  'bulk.apply': 'Apply',
  'bulk.delete': 'Delete',
  'bulk.leaveAlone': '— leave alone',
  'bulk.values.none': 'none set',
  'bulk.values.one': '1 value',
  'bulk.values.other': '{n} values',
  'bulk.clearField': 'Clear {label}',
  'bulk.keepAsIs': 'Keep',
  'bulk.keepAsIsAria': 'Leave {label} as it is on each item',
  'bulk.field.group': 'Group',
  'bulk.field.section': 'Section',
  'bulk.field.year': 'Year',
  'bulk.field.value': 'Value',
  'bulk.field.addTag': 'Add tag',
  'bulk.field.removeTag': 'Remove tag',
  'bulk.field.copyStatus': 'Every copy',
  'bulk.tagPlaceholder': 'tag',
  'bulk.sectionOneGroup': 'Available once every selected item sits in the same group.',
  'bulk.yearNoClear': 'Leave blank to keep each year as it is.',
  'bulk.nothingToApply': 'Nothing changed — touch a field first.',
  'bulk.applied.one': '{n} item updated',
  'bulk.applied.other': '{n} items updated',
  'bulk.applyFailed': 'Could not apply those changes.',
  'bulk.deleted.one': '{n} item deleted',
  'bulk.deleted.other': '{n} items deleted',
  'bulk.deleteFailed': 'Could not delete those items.',
  'bulk.confirm.title.one': 'Delete {n} item?',
  'bulk.confirm.title.other': 'Delete {n} items?',
  'bulk.confirm.body':
    'They leave this collection along with their copies, photos and field values. This cannot be undone.',
  'bulk.confirm.cancel': 'Cancel',
  'bulk.confirm.delete.one': 'Delete {n} item',
  'bulk.confirm.delete.other': 'Delete {n} items',

  // --- item page ---------------------------------------------------------
  'item.addPhoto': 'Add photo',
  'item.showPhoto': 'Show photo {n}',
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
  'itemForm.copyConditionAria': 'Condition of copy #{n}',
  'itemForm.copyStatusAria': 'Status of copy #{n}',
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
  'collSettings.groups.heading': 'Groups & sub-groups',
  'collSettings.groups.add': '+ Add group',
  'collSettings.groups.itemCount': '{n} items',
  'collSettings.groups.addSub': '+ Sub',
  'collSettings.groups.remove': 'Remove {name}',
  'collSettings.groups.renameAria': 'Rename {name}',
  'collSettings.groups.fields': 'Fields',
  'collSettings.groups.removeField': 'Remove field {name}',
  'collSettings.groups.fieldTypeAria': 'Type of field {name}',
  'collSettings.groups.fieldPlaceholder': 'Field name… (Enter)',
  'collSettings.groups.fieldAria': 'New field name',
  'collSettings.groups.newFieldTypeAria': 'Type of the new field',
  'collSettings.groups.addField': '+ Field',
  'collSettings.groups.orderBy': 'Order by',
  'collSettings.groups.orderByAria': 'Order the items in {name} by',
  'collSettings.groups.orderDirectionAria': 'Order direction for {name}',
  'collSettings.groups.target': 'Target',
  'collSettings.groups.targetAria': 'Target for {name}',
  'collSettings.groups.inherited': 'Inherited — {label}',
  'collSettings.groups.notSet': 'Not set',
  'collSettings.groups.newPlaceholder': 'Group name… (Enter to create, Esc to cancel)',
  'collSettings.groups.newGroupAria': 'New group name',
  'collSettings.groups.inParent': '↳ in {name}',
  'collSettings.groups.atRoot': '↳ at the top level',

  // Moving a group. A picker rather than a drag: groups list alphabetically and
  // nothing persists a position for one, so a drop *between* rows would mean
  // nothing — and a list can leave out the targets it cannot accept.
  'collSettings.groups.parent': 'Sits under',
  'collSettings.groups.parentAria': 'Parent group of {name}',
  'collSettings.groups.parentRoot': 'The top level',
  'collSettings.groups.moveHeading': 'Before you move it',
  'collSettings.groups.moveTo': 'Moving {name} under {parent}.',
  'collSettings.groups.moveToRoot': 'Moving {name} to the top level.',
  'collSettings.groups.moveGained': 'Fields it starts showing: {names}.',
  'collSettings.groups.moveLost.one':
    '1 item holds a value for «{name}», which this group will no longer display.',
  'collSettings.groups.moveLost.other':
    '{n} items hold a value for «{name}», which this group will no longer display.',
  'collSettings.groups.moveLostNone':
    '«{name}» is no longer declared here. No item in this branch holds a value for it.',
  'collSettings.groups.moveDormant':
    'Nothing is deleted: a value whose field is not declared stays on the item and shows again if you move the group back.',
  'collSettings.groups.moveOrder': 'The items in this branch will follow {label}.',
  'collSettings.groups.moveOrderNone':
    'No group above this one declares an order, so this branch falls back to the default.',
  'collSettings.groups.moveNothing': 'No fields and no ordering change.',
  'collSettings.groups.moveClash': 'Another group here is already called {name}.',
  'collSettings.groups.moveConfirm': 'Move it here',
  'collSettings.groups.moveCancel': 'Leave it where it is',

  // Deleting a group, and what happens to what is inside it.
  'collSettings.groups.delete.title': 'Delete {name}?',
  'collSettings.groups.delete.lede': 'Choose what happens to what is inside it.',
  'collSettings.groups.delete.subGroups.one': '1 sub-group: {names}',
  'collSettings.groups.delete.subGroups.other': '{n} sub-groups: {names}',
  'collSettings.groups.delete.subGroupsMore': '{names} and {n} more',
  'collSettings.groups.delete.items.one': '1 item, filed here or in a sub-group',
  'collSettings.groups.delete.items.other': '{n} items, filed here or in sub-groups',
  'collSettings.groups.delete.noItems': 'No items anywhere in this branch',
  'collSettings.groups.delete.sections.one': '1 section, which goes with its group',
  'collSettings.groups.delete.sections.other': '{n} sections, which go with their groups',
  'collSettings.groups.delete.choiceAria': 'What happens to the contents of {name}',
  'collSettings.groups.delete.reparent': 'Move the contents up',
  'collSettings.groups.delete.reparentSub':
    'Sub-groups and the items filed here move to {parent}. Recommended — it is the only choice that loses nothing.',
  'collSettings.groups.delete.reparentSubRoot':
    'Sub-groups move to the top level and the items filed here become unfiled. Recommended — it is the only choice that loses nothing.',
  'collSettings.groups.delete.unfile': 'Unfile the items',
  'collSettings.groups.delete.unfileSub':
    'The sub-groups go. Every item lands in Unfiled, where you can file it again.',
  'collSettings.groups.delete.deleteItems': 'Delete the items too',
  'collSettings.groups.delete.deleteItemsSub.one': '1 item is destroyed with the group.',
  'collSettings.groups.delete.deleteItemsSub.other': '{n} items are destroyed with the group.',
  'collSettings.groups.delete.noUndo':
    'This cannot be undone — the vault has no undo. Export the collection first if you want a copy to fall back on.',
  'collSettings.groups.delete.exportFirst': 'Export this collection first',
  'collSettings.groups.delete.exporting': 'Preparing the export…',
  'collSettings.groups.delete.cancel': 'Cancel',
  'collSettings.groups.delete.confirm': 'Delete the group',
  'collSettings.groups.delete.confirmReparent': 'Delete the group, keep the contents',
  'collSettings.groups.delete.confirmUnfile.one': 'Delete the group, unfile 1 item',
  'collSettings.groups.delete.confirmUnfile.other': 'Delete the group, unfile {n} items',
  'collSettings.groups.delete.confirmDelete.one': 'Delete the group and 1 item',
  'collSettings.groups.delete.confirmDelete.other': 'Delete the group and {n} items',

  'collSettings.groups.finePrint1':
    'Renames apply as you type. Custom fields apply to every item in the group and its sub-groups, and the field type decides how it sorts.',
  'collSettings.groups.finePrintOrderBy': 'Order by',
  'collSettings.groups.finePrint2':
    'is the default the collection uses when that group is open — sub-groups inherit it unless they set their own.',
  'collSettings.groups.finePrintTarget': 'Target',
  'collSettings.groups.finePrint3':
    "is how many items the complete set has, when you know it — a 120-issue run, a 24-card set — so progress is measured against the series instead of against what you've catalogued so far. Leave it blank and it falls back. Moving a group changes which fields its items show and which order they follow, so the pane says what will change before you commit it; deleting one asks what happens to its contents.",

  'collSettings.sharing.emailPlaceholder': 'email@company.com',
  'collSettings.sharing.inviteRoleAria': 'Role for the invitation',
  'collSettings.sharing.invite': 'Invite',
  'collSettings.sharing.removeMember': 'Remove {name}',
  'collSettings.sharing.memberRoleAria': 'Role for {name}',
  'collSettings.sharing.linkShare': 'Link sharing',
  'collSettings.sharing.linkShareSoon': 'Not available yet — a public collection page has not been built.',
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
  // Not "Done": this page saves on a debounce, so the button never was the
  // thing that saved. It navigates, and now it says so.
  'collSettings.done': 'Back to the collection',
  'collSettings.autosave': 'Every change here is saved as you make it.',

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
  'toast.member.roleUpdated': 'Role updated',
  'toast.member.roleFailed': 'The role was not changed — the row has been put back',
  'toast.member.removeFailed': 'Could not remove that person',
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
  'toast.collection.createFailed': 'Could not create the collection',
  'toast.collection.added': 'Added to your vault ✓',
  'toast.collection.addFailed': 'Could not add checklist',
  'toast.image.updated': 'Image updated ✓',
  'toast.photo.limit': 'Up to 8 photos per item',
  'toast.photo.added': 'Photo added ✓',
  'toast.framing.failed': "Couldn't save the framing",
  'toast.photo.uploadFailed': 'Upload failed',
  'toast.copy.added': 'Copy added ✓',
  'toast.item.deleted': 'Item deleted',
  'toast.item.restored': '“{name}” is back',
  'toast.item.undoFailed':
    'Couldn’t bring “{name}” back — the collection changed in the meantime. Reload and add it again.',
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
  'toast.group.removed': 'Group removed',
  'toast.group.moved': 'Group "{name}" moved',
  'toast.group.removedKeeping': 'Group removed — its contents moved up',
  'toast.group.removedUnfiled.one': 'Group removed — 1 item is now unfiled',
  'toast.group.removedUnfiled.other': 'Group removed — {n} items are now unfiled',
  'toast.group.removedWithItems.one': 'Group and 1 item removed',
  'toast.group.removedWithItems.other': 'Group and {n} items removed',
  'toast.field.removed': 'Field removed',
  'toast.field.duplicate': '"{name}" is already a field here',
  'toast.field.added': 'Field "{name}" added',
  'toast.invite.invalidEmail': 'Enter a valid email',
  'toast.invite.sent': 'Added to this collection',
  // --- save conflicts ------------------------------------------------------
  'conflict.title': 'Saved somewhere else first',
  'conflict.keepsYourWork':
    'What you typed is still on screen and still unsaved. Copy anything you need before reloading.',
  'conflict.reload': 'Reload the latest version',
  'conflict.reloading': 'Reloading…',
  'conflict.keep': 'Keep editing',
  'conflict.reloadFailed': "Couldn't reload — check your connection and try again.",
  'conflict.unknownVersion':
    "This collection hasn't finished loading, so there's no version to save against. Reload and try again.",

  'toast.collection.saveFailed': 'Could not save the collection',
  'toast.item.saveFailed': 'Could not save the item',
  'toast.item.deleteFailed': 'Could not delete the item',
  'toast.group.addFailed': 'Could not add the group',

  // --- sections -------------------------------------------------------------
  'section.none': 'No section',
  'section.only': 'Show only {name}',
  'section.showAll': 'Show every section',
  'section.empty': 'nothing here yet',
  'itemForm.section': 'Section',
  'collSettings.sections.label': 'Sections',
  'collSettings.sections.add': '+ Section',
  'collSettings.sections.convert': 'Turn sub-groups into sections',
  'collSettings.sections.placeholder': 'Section name…',
  'collSettings.sections.newAria': 'New section name',
  'collSettings.sections.renameAria': 'Rename section {name}',
  'collSettings.sections.targetAria': 'Target for section {name}',
  'collSettings.sections.remove': 'Remove section {name}',
  'collSettings.sections.itemCount': '{n} items',
  'collSettings.sections.finePrint': 'A section divides one group\'s items without adding a level: it declares no fields and no order of its own, and you arrange the sections by hand — Bronze, Silver, Gold, not alphabetically.',
  'toast.section.added': 'Section "{name}" added',
  'toast.section.removed': 'Section removed — its items moved to no section',
  'toast.section.converted': '{n} sub-groups are now sections',
  'collSettings.groups.pickerAria': 'Groups in this collection',
  'collSettings.groups.noneYet': 'No groups yet',
  'collSettings.groups.nameLabel': 'Name',
  'collSettings.groups.pickOne': 'Pick a group on the left to edit its name, where it sits, its ordering, its fields and its sections.',
  // --- toast chrome ---------------------------------------------------------
  // The tone markers. Text, because status must never be carried by colour
  // alone (rule 12) — and because a greyscale screenshot of a failure has to
  // still read as a failure.
  'toast.done': 'Done',
  'toast.failed': 'Failed',
  'toast.dismiss': 'Dismiss this message',
  'toast.more': '+{n} more',
  'toast.undo': 'Undo',

  // --- confirmations -------------------------------------------------------
  'item.delete.confirm.title': 'Delete this item?',
  'item.delete.confirm.body':
    '“{name}” leaves this collection, along with its copies, its field values and its photos. You can undo it straight afterwards.',
  'item.delete.confirm.ok': 'Delete item',

  // --- HTTP failures -------------------------------------------------------
  // One sentence per class of failure, used when the server did not explain
  // itself. Every one of them says what happened to the user's data, because
  // that is the only question they are asking.
  'error.network':
    'Can’t reach the Vault server. Nothing was saved — check your connection and try again.',
  'error.forbidden': 'You don’t have permission to do that.',
  'error.notFound': 'That isn’t there any more — it may have been deleted somewhere else.',
  'error.conflict': 'That clashes with something already saved. Nothing was changed.',
  'error.precondition':
    'This screen is out of step with the server, so the save was refused rather than risked. Reload and try again.',
  'error.rateLimited': 'Too many requests. Wait a moment, then try again.',
  'error.server': 'The server hit an error. Your change may not have been saved — try again.',
  'error.unknown': 'Something went wrong (HTTP {status}). Try again in a moment.',

  // --- responsive shell -----------------------------------------------------
  'shell.skipToContent': 'Skip to content',
  'nav.open': 'Open navigation',
  'nav.close': 'Close navigation',
  'nav.primaryAria': 'Main',

  // --- ui-date-input --------------------------------------------------------
  // The letters a date field shows for each part. Copy, not identifiers: a
  // Portuguese year is spelled `aaaa`. `ui-date-input` puts them in the locale's
  // own order, so nothing here says which comes first.
  'ui.dateInput.day': 'dd',
  'ui.dateInput.month': 'mm',
  'ui.dateInput.year': 'yyyy',

  // --- item form: summary and the commit bar --------------------------------
  'itemForm.summaryHeading': 'Summary',
  'itemForm.summaryOwnership': 'Ownership',
  'itemForm.summaryOwned': 'Owned · {n}',
  'itemForm.summaryWanted': 'Wantlist',
  'itemForm.summaryPaid': 'Paid',
  'itemForm.summaryEstimate': 'Est. value',
  'itemForm.summaryPhotos': 'Photos',
  'itemForm.summaryPhotoCount': '{n} of {max}',
  'itemForm.summaryDestination': 'Files under',
  'itemForm.unsaved': 'Unsaved changes',
  'itemForm.leaveConfirm': 'This item has changes you have not saved. Leave anyway?',
  'itemForm.copyAcquiredAria': 'Date copy #{n} was acquired',
} as const;
