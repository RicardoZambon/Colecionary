import { Collection, GroupNode, Item, StoreListing, ThemeDef, Plan, Member } from '../models';

/**
 * Demo dataset for the mock API, ported from the Collection Control design.
 * Everything here is plain data — no behavior.
 */

type ItemSeed = Omit<Item, 'owned' | 'custom' | 'tags'> &
  Partial<Pick<Item, 'owned' | 'custom' | 'tags'>>;

function item(seed: ItemSeed): Item {
  return { owned: true, custom: [], tags: [], ...seed };
}

function flatGroups(names: string[], fields: Record<string, string[]> = {}): GroupNode[] {
  return names.map(name => ({ id: name, name, parentId: null, fields: fields[name] ?? [] }));
}

export const SEED_OWNER: Member = {
  name: 'Marcus Keller',
  email: 'marcus@airia.com',
  initials: 'MK',
  role: 'Owner',
};

export const SEED_TENANT_MEMBERS: Member[] = [
  SEED_OWNER,
  { name: 'Ana Pereira', email: 'ana@airia.com', initials: 'AP', role: 'Editor' },
  { name: 'Dev Lee', email: 'dev@airia.com', initials: 'DL', role: 'Viewer' },
];

export const SEED_COLLECTIONS: Collection[] = [
  {
    id: 'retro',
    name: 'Retro Consoles',
    description: 'Boxed + loose hardware, NES → GameCube era',
    linkShare: true,
    members: [
      { name: 'Ana Pereira', email: 'ana@airia.com', initials: 'AP', role: 'Editor' },
      { name: 'Dev Lee', email: 'dev@airia.com', initials: 'DL', role: 'Viewer' },
    ],
    groups: flatGroups(['Nintendo', 'Sega', 'Handhelds', 'Atari'], {
      Nintendo: ['Serial no.', 'Region', 'Completeness', 'Edition'],
      Sega: ['Accessories'],
      Handhelds: ['Screen', 'Mods'],
    }),
    items: [
      item({ id: 'nes', name: 'NES Console (boxed)', year: 1985, condition: 'Mint', value: 340, price: 260, groupId: 'Nintendo', tags: ['boxed', 'cib'], img: 'nes_console.jpg', description: 'Complete-in-box NES-001 with original styrofoam, manuals, two controllers and Zapper. Shell has almost no yellowing; tested and working.', custom: [{ key: 'Serial no.', value: 'N8054321' }, { key: 'Region', value: 'NTSC-U' }, { key: 'Completeness', value: 'CIB — console, box, manuals' }] }),
      item({ id: 'snes', name: 'SNES (PAL)', year: 1992, condition: 'Good', value: 120, price: 70, groupId: 'Nintendo', tags: ['loose'], img: 'snes_pal.jpg', description: 'Loose PAL SNES, one controller. Light yellowing on the top shell, ports clean.', custom: [{ key: 'Region', value: 'PAL' }] }),
      item({ id: 'gameboy', name: 'Game Boy DMG-01', year: 1989, condition: 'Fair', value: 85, price: 40, groupId: 'Handhelds', tags: ['loose'], img: 'gameboy_dmg.jpg', description: 'Original DMG with a few dead pixel lines. Candidate for an IPS screen mod.', custom: [{ key: 'Screen', value: '2 dead lines' }, { key: 'Mods', value: 'None (IPS planned)' }] }),
      item({ id: 'n64', name: 'N64 Gold Edition', year: 1998, condition: 'Mint', value: 610, price: 420, groupId: 'Nintendo', tags: ['cib', 'rare'], img: 'n64_gold.jpg', description: 'Toys "R" Us exclusive gold console, complete in box with matching gold controller. The crown of the Nintendo shelf.', custom: [{ key: 'Edition', value: 'Gold — TRU exclusive' }, { key: 'Serial no.', value: 'NS1189223' }] }),
      item({ id: 'famicom', name: 'Famicom (JP)', year: 1983, condition: 'Good', value: 210, price: 140, groupId: 'Nintendo', tags: ['boxed', 'import'], img: 'famicom.jpg', description: 'Japanese import Famicom with hardwired controllers, boxed. Box has shelf wear.', custom: [{ key: 'Region', value: 'NTSC-J' }] }),
      item({ id: 'gamecube', name: 'GameCube (indigo)', year: 2001, condition: 'Mint', value: 95, price: 60, groupId: 'Nintendo', tags: ['loose'], img: 'gamecube.jpg', description: 'Indigo GameCube with one controller and memory card. Near-perfect shell.', custom: [{ key: 'Accessories', value: '1 controller, 59-block card' }] }),
      item({ id: 'virtualboy', name: 'Virtual Boy', year: 1995, condition: 'Good', value: 450, price: 300, groupId: 'Nintendo', tags: ['cib', 'rare'], img: 'virtualboy.jpg', description: 'Complete Virtual Boy with stand and box. Displays tested — no rare solder-joint flicker.', custom: [{ key: 'Displays', value: 'Both OK' }] }),
      item({ id: 'dreamcast', name: 'Sega Dreamcast', year: 1999, condition: 'Good', value: 180, price: 110, groupId: 'Sega', tags: ['loose'], img: 'dreamcast.jpg', description: 'Loose Dreamcast with VMU and controller. GD-ROM drive reads flawlessly.', custom: [{ key: 'Accessories', value: 'VMU, 1 controller' }] }),
      item({ id: 'saturn', name: 'Sega Saturn', year: 1995, condition: 'Good', value: 220, price: 0, groupId: 'Sega', tags: ['wanted'], img: 'sega_saturn.jpg', description: 'On the hunt — looking for a clean model 2 with matching serials.', owned: false }),
      item({ id: 'gamegear', name: 'Sega Game Gear', year: 1991, condition: 'Good', value: 90, price: 0, groupId: 'Handhelds', tags: ['wanted'], img: 'game_gear.jpg', description: 'Wanted — prefer a recapped unit or a fair-priced project.', owned: false }),
    ],
  },
  {
    id: 'pokemon',
    name: 'Pokémon',
    description: 'Cards, games, toys and media — one franchise, many shelves',
    linkShare: true,
    members: [],
    groups: [
      { id: 'pk_cards', name: 'Cards', parentId: null, fields: ['Set no.', 'Language'] },
      { id: 'pk_cards_reg', name: 'Regular cards', parentId: 'pk_cards', fields: [] },
      { id: 'pk_cards_rare', name: 'Rare & holo', parentId: 'pk_cards', fields: ['Grade'] },
      { id: 'pk_games', name: 'Games', parentId: null, fields: ['Completeness'] },
      { id: 'pk_games_n64', name: 'N64', parentId: 'pk_games', fields: [] },
      { id: 'pk_games_gb', name: 'Game Boy', parentId: 'pk_games', fields: ['Battery'] },
      { id: 'pk_toys', name: 'Toys', parentId: null, fields: [] },
      { id: 'pk_dvds', name: 'DVDs', parentId: null, fields: [] },
    ],
    items: [
      item({ id: 'pk_squirtle', name: 'Squirtle (Base Set)', year: 1999, condition: 'Good', value: 8, price: 2, groupId: 'pk_cards_reg', tags: ['raw'], img: 'squirtle_base.jpg', description: 'Base Set Squirtle, lightly played. Binder filler with sentimental value.' }),
      item({ id: 'pk_eevee', name: 'Eevee (Jungle)', year: 1999, condition: 'Mint', value: 6, price: 1, groupId: 'pk_cards_reg', tags: ['raw'], img: 'eevee_jungle.jpg', description: 'Pack-fresh Jungle Eevee, sleeved since the day it was pulled.' }),
      item({ id: 'pk_zard_ex', name: 'Charizard ex (FireRed)', year: 2004, condition: 'Good', value: 380, price: 210, groupId: 'pk_cards_rare', tags: ['holo'], img: 'charizard_ex.jpg', description: 'FireRed & LeafGreen Charizard ex, light edgewear on the back.', custom: [{ key: 'Set no.', value: '105/112' }] }),
      item({ id: 'pk_umbreon', name: 'Umbreon Gold Star', year: 2005, condition: 'Good', value: 1900, price: 0, groupId: 'pk_cards_rare', tags: ['wanted', 'grail'], img: 'umbreon_star.jpg', description: 'POP Series 5 grail — hunting a clean raw copy.', owned: false }),
      item({ id: 'pk_stadium', name: 'Pokémon Stadium (CIB)', year: 2000, condition: 'Good', value: 120, price: 70, groupId: 'pk_games_n64', tags: ['cib'], img: 'pk_stadium.jpg', description: 'Complete in box with Transfer Pak. Box has light shelf wear.' }),
      item({ id: 'pk_snap', name: 'Pokémon Snap', year: 1999, condition: 'Fair', value: 60, price: 30, groupId: 'pk_games_n64', tags: ['loose'], img: 'pk_snap.jpg', description: 'Loose cart, label faded from sunlight.' }),
      item({ id: 'pk_yellow', name: 'Pokémon Yellow', year: 1998, condition: 'Good', value: 110, price: 55, groupId: 'pk_games_gb', tags: ['loose'], img: 'pk_yellow.jpg', description: 'Loose cart with a fresh save battery.', custom: [{ key: 'Battery', value: 'Replaced 2025' }] }),
      item({ id: 'pk_crystal', name: 'Pokémon Crystal', year: 2000, condition: 'Good', value: 260, price: 0, groupId: 'pk_games_gb', tags: ['wanted'], img: 'pk_crystal.jpg', description: 'Wanted — authentic cart only, working RTC preferred.', owned: false }),
      item({ id: 'pk_snorlax', name: 'Snorlax plush (1998 original)', year: 1998, condition: 'Good', value: 90, price: 40, groupId: 'pk_toys', tags: ['vintage'], img: 'snorlax_plush.jpg', description: 'Original Play-By-Play plush with tush tag intact.' }),
      item({ id: 'pk_movie', name: 'Pokémon: The First Movie (DVD)', year: 1999, condition: 'Mint', value: 25, price: 10, groupId: 'pk_dvds', tags: ['sealed'], img: 'pk_movie_dvd.jpg', description: 'Still-sealed first-print DVD.' }),
    ],
  },
  {
    id: 'cards',
    name: 'Trading Cards',
    description: 'Graded + raw, mostly 90s TCG',
    linkShare: true,
    members: [{ name: 'Ana Pereira', email: 'ana@airia.com', initials: 'AP', role: 'Viewer' }],
    groups: flatGroups(['Pokémon', 'Magic', 'Sports'], {
      'Pokémon': ['Grade', 'Cert no.'],
      Magic: ['Set'],
      Sports: ['Card no.'],
    }),
    items: [
      item({ id: 'charizard', name: 'Charizard Holo (Base Set)', year: 1999, condition: 'Mint', value: 4200, price: 3100, groupId: 'Pokémon', tags: ['graded', 'psa8'], img: 'charizard_base.jpg', description: 'Base Set Unlimited Charizard, PSA 8. Strong centering, minor whitening on the back only.', custom: [{ key: 'Grade', value: 'PSA 8' }, { key: 'Cert no.', value: '82736411' }] }),
      item({ id: 'blastoise', name: 'Blastoise Holo (Base Set)', year: 1999, condition: 'Good', value: 380, price: 240, groupId: 'Pokémon', tags: ['raw'], img: 'blastoise_base.jpg', description: 'Raw Base Set Blastoise, light edgewear. Solid candidate for grading.', custom: [{ key: 'Grade', value: 'Raw (est. 6-7)' }] }),
      item({ id: 'shivan', name: 'Shivan Dragon (Revised)', year: 1994, condition: 'Good', value: 45, price: 30, groupId: 'Magic', tags: ['raw'], img: 'shivan_revised.jpg', description: 'Revised edition Shivan Dragon, lightly played. Childhood nostalgia pull.', custom: [{ key: 'Set', value: 'Revised (3ED)' }] }),
      item({ id: 'griffey', name: 'Ken Griffey Jr. RC (Upper Deck)', year: 1989, condition: 'Mint', value: 120, price: 60, groupId: 'Sports', tags: ['rookie'], img: 'griffey_rc.jpg', description: 'The iconic 1989 Upper Deck #1 rookie card. Sharp corners, clean surface.', custom: [{ key: 'Card no.', value: '#1' }] }),
      item({ id: 'venusaur', name: 'Venusaur Holo (Base Set)', year: 1999, condition: 'Good', value: 340, price: 0, groupId: 'Pokémon', tags: ['wanted'], img: 'venusaur_base.jpg', description: 'The missing starter — would complete the Base Set holo trio.', owned: false }),
    ],
  },
  {
    id: 'vinyl',
    name: 'Vinyl',
    description: 'First pressings + soundtracks',
    linkShare: true,
    members: [],
    groups: flatGroups(['OSTs', 'Rock', 'Jazz'], {
      OSTs: ['Variant', 'Obi'],
      Rock: ['Pressing', 'Sleeve'],
      Jazz: ['Label'],
    }),
    items: [
      item({ id: 'okcomputer', name: 'OK Computer — 1st UK press', year: 1997, condition: 'Good', value: 260, price: 180, groupId: 'Rock', tags: ['first-press'], img: 'ok_computer.jpg', description: 'First UK pressing, double LP. Sleeve VG+, vinyl plays clean with faint surface noise on side D.', custom: [{ key: 'Pressing', value: '1st UK, NODATA 02' }, { key: 'Sleeve', value: 'VG+' }] }),
      item({ id: 'akira', name: 'Akira — Symphonic Suite OST', year: 1988, condition: 'Mint', value: 340, price: 220, groupId: 'OSTs', tags: ['import', 'rare'], img: 'akira_ost.jpg', description: 'Original Japanese pressing of the Geinoh Yamashirogumi score. Obi strip intact.', custom: [{ key: 'Obi', value: 'Present' }] }),
      item({ id: 'kindofblue', name: 'Kind of Blue — mono', year: 1959, condition: 'Fair', value: 480, price: 300, groupId: 'Jazz', tags: ['mono', 'rare'], img: 'kind_of_blue.jpg', description: 'Mono six-eye pressing. Sleeve is rough but the record itself grades VG.', custom: [{ key: 'Label', value: 'Columbia six-eye' }] }),
      item({ id: 'doomost', name: 'DOOM (2016) OST — red splatter', year: 2018, condition: 'Mint', value: 95, price: 80, groupId: 'OSTs', tags: ['limited'], img: 'doom_ost.jpg', description: 'Limited red splatter variant, still sealed. Mick Gordon at his heaviest.', custom: [{ key: 'Variant', value: 'Red splatter /3000' }] }),
    ],
  },
  {
    id: 'lego',
    name: 'LEGO Sets',
    description: 'Sealed + built, space + castle',
    linkShare: true,
    members: [],
    groups: flatGroups(['Space', 'Castle', 'Technic'], {
      Space: ['Completeness'],
      Castle: ['Missing'],
      Technic: ['Box'],
    }),
    items: [
      item({ id: 'galaxy', name: 'Galaxy Explorer 497', year: 1979, condition: 'Good', value: 720, price: 450, groupId: 'Space', tags: ['complete'], img: 'galaxy_explorer.jpg', description: 'Complete classic-space Galaxy Explorer with instructions. Two minifig torsos show cracking.', custom: [{ key: 'Completeness', value: '100% parts + instructions' }] }),
      item({ id: 'castle', name: "King's Castle 6080", year: 1984, condition: 'Fair', value: 380, price: 220, groupId: 'Castle', tags: ['near-complete'], img: 'kings_castle.jpg', description: 'Near-complete — missing 4 minor parts and one flag. Instructions included, no box.', custom: [{ key: 'Missing', value: '4 parts, 1 flag' }] }),
      item({ id: 'technic', name: 'Technic Super Car 8880', year: 1994, condition: 'Mint', value: 950, price: 610, groupId: 'Technic', tags: ['boxed', 'rare'], img: 'technic_8880.jpg', description: 'The legendary 8880 with box and instructions. All gearbox functions work perfectly.', custom: [{ key: 'Box', value: 'Present, VG' }] }),
      item({ id: 'monorail', name: 'Futuron Monorail 6990', year: 1987, condition: 'Good', value: 850, price: 0, groupId: 'Space', tags: ['wanted', 'grail'], img: 'monorail_6990.jpg', description: 'Grail set — want it complete with full track and both stations.', owned: false }),
    ],
  },
  {
    id: 'comics',
    name: 'Comics',
    description: 'Silver age + modern keys',
    linkShare: true,
    members: [],
    groups: flatGroups(['Marvel', 'DC', 'Indie'], {
      Marvel: ['Grade', 'Key'],
      DC: ['Print'],
      Indie: ['Print'],
    }),
    items: [
      item({ id: 'xmen101', name: 'X-Men #101', year: 1976, condition: 'Good', value: 850, price: 520, groupId: 'Marvel', tags: ['key', 'graded'], img: 'xmen_101.jpg', description: 'First appearance of Phoenix. CGC 6.5 with off-white pages.', custom: [{ key: 'Grade', value: 'CGC 6.5' }, { key: 'Key', value: '1st Phoenix' }] }),
      item({ id: 'watchmen', name: 'Watchmen #1', year: 1986, condition: 'Mint', value: 240, price: 120, groupId: 'DC', tags: ['key'], img: 'watchmen_1.jpg', description: 'First print, raw but immaculate. Stored bagged and boarded since the 90s.', custom: [{ key: 'Print', value: '1st' }] }),
      item({ id: 'saga', name: 'Saga #1 (1st print)', year: 2012, condition: 'Mint', value: 180, price: 90, groupId: 'Indie', tags: ['key'], img: 'saga_1.jpg', description: 'First print of the Image hit. Modern key that keeps climbing.', custom: [{ key: 'Print', value: '1st' }] }),
    ],
  },
  {
    id: 'coins',
    name: 'Coins & Stamps',
    description: 'World coins and classics, pre-1950',
    linkShare: true,
    members: [],
    groups: flatGroups(['US', 'Europe', 'Asia'], {
      US: ['Mint mark'],
      Europe: ['Cancel'],
    }),
    items: [
      item({ id: 'morgan', name: 'Morgan Dollar 1889-CC', year: 1889, condition: 'Good', value: 1400, price: 950, groupId: 'US', tags: ['key-date'], img: 'morgan_1889cc.jpg', description: 'Carson City key date. VG details with honest wear, no cleaning.', custom: [{ key: 'Mint mark', value: 'CC' }] }),
      item({ id: 'indianhead', name: 'Indian Head Penny', year: 1907, condition: 'Fair', value: 28, price: 15, groupId: 'US', tags: [], img: 'indian_head.jpg', description: 'Common date in circulated condition. Filler until a better example turns up.' }),
      item({ id: 'pennyblack', name: 'Penny Black (used)', year: 1840, condition: 'Good', value: 420, price: 300, groupId: 'Europe', tags: ['rare'], img: 'penny_black.jpg', description: "The world's first postage stamp, red Maltese cross cancel. Four margins, small thin on reverse.", custom: [{ key: 'Cancel', value: 'Red Maltese cross' }] }),
    ],
  },
];

export const SEED_STORE: StoreListing[] = [
  {
    id: 'store_ps1', name: 'PlayStation Classics', publisher: 'Vault Curators',
    description: 'The essential PS1 library — five discs every collector chases.',
    groups: ['RPG', 'Action', 'Racing'],
    items: [
      { id: 'ff7', name: 'Final Fantasy VII (black label)', year: 1997, value: 180, group: 'RPG', img: 'ff7_blacklabel.jpg' },
      { id: 'mgs', name: 'Metal Gear Solid', year: 1998, value: 90, group: 'Action', img: 'mgs_ps1.jpg' },
      { id: 'sotn', name: 'Castlevania: SotN', year: 1997, value: 260, group: 'Action', img: 'sotn_ps1.jpg' },
      { id: 'gt2', name: 'Gran Turismo 2', year: 1999, value: 35, group: 'Racing', img: 'gt2_ps1.jpg' },
      { id: 'chronocross', name: 'Chrono Cross', year: 1999, value: 85, group: 'RPG', img: 'chrono_cross.jpg' },
    ],
  },
  {
    id: 'store_gb', name: 'Game Boy Essentials', publisher: 'RetroDB',
    description: 'Five carts that defined the brick — the classic starter checklist.',
    groups: ['Launch era', 'Classics'],
    items: [
      { id: 'tetris', name: 'Tetris', year: 1989, value: 25, group: 'Launch era', img: 'tetris_gb.jpg' },
      { id: 'sml', name: 'Super Mario Land', year: 1989, value: 40, group: 'Launch era', img: 'sml_gb.jpg' },
      { id: 'pkmred', name: 'Pokémon Red', year: 1996, value: 90, group: 'Classics', img: 'pokemon_red.jpg' },
      { id: 'zelda_la', name: "Link's Awakening", year: 1993, value: 70, group: 'Classics', img: 'links_awakening.jpg' },
      { id: 'kirby', name: "Kirby's Dream Land", year: 1992, value: 45, group: 'Classics', img: 'kirby_gb.jpg' },
    ],
  },
  {
    id: 'store_beatles', name: 'Beatles Studio Albums', publisher: 'WaxWorks',
    description: 'UK studio pressings — the core five to start a serious shelf.',
    groups: ['60s'],
    items: [
      { id: 'rubbersoul', name: 'Rubber Soul', year: 1965, value: 110, group: '60s', img: 'rubber_soul.jpg' },
      { id: 'revolver', name: 'Revolver', year: 1966, value: 150, group: '60s', img: 'revolver.jpg' },
      { id: 'sgtpepper', name: "Sgt. Pepper's Lonely Hearts Club Band", year: 1967, value: 140, group: '60s', img: 'sgt_pepper.jpg' },
      { id: 'whitealbum', name: 'The White Album', year: 1968, value: 180, group: '60s', img: 'white_album.jpg' },
      { id: 'abbeyroad', name: 'Abbey Road', year: 1969, value: 120, group: '60s', img: 'abbey_road.jpg' },
    ],
  },
  {
    id: 'store_bronze', name: 'Bronze Age Marvel Keys', publisher: 'KeyIssues',
    description: 'Four grails from the 70s — first appearances that anchor a comic vault.',
    groups: ['Marvel'],
    items: [
      { id: 'hulk181', name: 'Incredible Hulk #181', year: 1974, value: 3200, group: 'Marvel', img: 'hulk_181.jpg' },
      { id: 'asm129', name: 'Amazing Spider-Man #129', year: 1974, value: 1100, group: 'Marvel', img: 'asm_129.jpg' },
      { id: 'gsxm1', name: 'Giant-Size X-Men #1', year: 1975, value: 2400, group: 'Marvel', img: 'gsxm_1.jpg' },
      { id: 'im55', name: 'Iron Man #55', year: 1973, value: 480, group: 'Marvel', img: 'ironman_55.jpg' },
    ],
  },
  {
    id: 'store_space', name: 'Classic Space Fleet', publisher: 'BrickIndex',
    description: 'The grey-and-blue LEGO fleet, 1978–83. Benny would approve.',
    groups: ['Space'],
    items: [
      { id: 'cruiser924', name: 'Space Cruiser 924', year: 1978, value: 260, group: 'Space', img: 'cruiser_924.jpg' },
      { id: 'beta6970', name: 'Beta-1 Command Base 6970', year: 1980, value: 340, group: 'Space', img: 'beta1_6970.jpg' },
      { id: 'commander6980', name: 'Galaxy Commander 6980', year: 1983, value: 520, group: 'Space', img: 'commander_6980.jpg' },
      { id: 'voyager6929', name: 'Starfleet Voyager 6929', year: 1981, value: 290, group: 'Space', img: 'voyager_6929.jpg' },
    ],
  },
];

export const THEMES: ThemeDef[] = [
  { id: 'devlight', name: 'Paperwhite', description: 'Clean dev-tool. Quiet neutrals, indigo accent.', swatches: ['#FAFAF8', '#FFFFFF', '#5453C4', '#1B1B1F', '#1F8A5B'] },
  { id: 'devdark', name: 'Graphite', description: 'Same bones, dark. Soft indigo on charcoal.', swatches: ['#141417', '#1C1C21', '#7B7AE8', '#ECECF1', '#34B37A'] },
  { id: 'terminal', name: 'Phosphor', description: 'Green CRT terminal. All monospace, zero radius.', swatches: ['#0B0E0B', '#0F140F', '#4ADE80', '#C9E5C9', '#FBBF24'] },
  { id: 'arcade', name: 'Arcade', description: '8-bit pixel headings, cyan + magenta, hard shadows.', swatches: ['#131022', '#1A1633', '#22D3EE', '#E8E6F5', '#F472B6'] },
  { id: 'hud', name: 'Starship', description: 'Sci-fi HUD. Cold blues, glowing edges.', swatches: ['#060B14', '#0B1322', '#38BDF8', '#D8EAFF', '#FBBF24'] },
  { id: 'paper', name: 'Zine', description: 'Brutalist print. Ink on paper, hard offset shadows.', swatches: ['#F2EFE6', '#FBFAF4', '#D2481F', '#1B1A16', '#2A6E4E'] },
  { id: 'synth', name: 'Synthwave', description: 'Neon nights. Magenta glow on deep purple.', swatches: ['#150A20', '#1E0F2E', '#E879F9', '#F5EBFF', '#22D3EE'] },
];

export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', price: '$0', features: ['2 collections', 'Up to 100 items', '1 photo per item', 'Common fields only'] },
  { id: 'pro', name: 'Pro', price: '$6/mo', features: ['Unlimited collections & items', '8 photos per item', 'Custom fields & groups', 'Value tracking & backups'] },
];
