/* Vault — Collection Control
   Working implementation of "Collection Control.dc.html" (claude.ai/design).
   Dependency-free: state → render, delegated events, localStorage persistence. */
(() => {
'use strict';

const $root = document.getElementById('app');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ---------- event-handler registry (rebuilt on every render) ---------- */
let handlers = new Map();
let hid = 0;
const h = fn => { hid += 1; handlers.set(String(hid), fn); return String(hid); };

/* ---------- shared style snippets (verbatim from the design) ---------- */
const CARD = 'background: var(--panel); border: var(--bw) solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow);';
const LBL = 'font-family: var(--fm); font-size: 10px; letter-spacing: 0.1em; color: var(--muted);';
const SLBL = 'font-family: var(--fm); font-size: 10.5px; letter-spacing: 0.13em; color: var(--muted);';
const INP = 'background: var(--panel); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 9px 12px; font-family: var(--fb); font-size: 13px; outline: none; box-sizing: border-box; width: 100%;';
const SEL = 'background: var(--panel); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 9px 10px; font-family: var(--fb); font-size: 13px; outline: none;';
const STRIPES = 'repeating-linear-gradient(45deg, var(--panel2) 0 8px, var(--panel) 8px 16px)';

/* ---------- image slots (drop / click to fill, persisted) ---------- */
const IMG_KEY = 'cc_imgs';
const imgStore = new Map(Object.entries((() => {
  try { return JSON.parse(localStorage.getItem(IMG_KEY) || '{}'); } catch { return {}; }
})()));
function saveImgs() {
  try { localStorage.setItem(IMG_KEY, JSON.stringify(Object.fromEntries(imgStore))); }
  catch { app.flash('Image kept for this session only (storage full)'); }
}
function setSlotImage(id, file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      imgStore.set(id, canvas.toDataURL('image/jpeg', 0.85));
      saveImgs();
      render();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function imageSlot(id, ph, radius) {
  const src = imgStore.get(id);
  const bg = src
    ? `background-image: url('${src}'); background-size: cover; background-position: center;`
    : `background: ${STRIPES};`;
  const label = src ? '' : `<span style="font-family: var(--fm); font-size: 10px; color: var(--muted); padding: 6px 10px; text-align: center;">${esc(ph)}</span>`;
  return `<div class="imgslot" data-slot="${esc(id)}" title="Click or drop an image" style="width: 100%; height: 100%; border-radius: ${radius || '0'}; overflow: hidden; ${bg} display: grid; place-items: center; cursor: pointer;">${label}</div>`;
}

/* ====================================================================== */

const app = {
  state: {
    screen: 'dashboard', collId: null, groupId: null, itemId: null, view: 'grid',
    query: '', cond: null, own: null, theme: null, formItemId: null, toast: null,
    plan: 'free', setTab: 'appearance', shareEmail: '', shareRole: 'Viewer',
    themeMenu: false, sortMenu: false, pendingGroup: null, pendingField: null,
    sort: 'recent', fGroupSel: null, ecTab: 'general',
    policies: { invites: true, link: true, external: false },
  },
  showValues: true,

  tenantDef: [
    { name: 'Marcus Keller', email: 'marcus@airia.com', initials: 'MK', role: 'Owner' },
    { name: 'Ana Pereira', email: 'ana@airia.com', initials: 'AP', role: 'Editor' },
    { name: 'Dev Lee', email: 'dev@airia.com', initials: 'DL', role: 'Viewer' },
  ],

  seedShares: {
    retro: [{ name: 'Ana Pereira', email: 'ana@airia.com', initials: 'AP', role: 'Editor' }, { name: 'Dev Lee', email: 'dev@airia.com', initials: 'DL', role: 'Viewer' }],
    cards: [{ name: 'Ana Pereira', email: 'ana@airia.com', initials: 'AP', role: 'Viewer' }],
  },

  plansDef: [
    { id: 'free', name: 'Free', price: '$0', features: ['2 collections', 'Up to 100 items', '1 photo per item', 'Common fields only'] },
    { id: 'pro', name: 'Pro', price: '$6/mo', features: ['Unlimited collections & items', '8 photos per item', 'Custom fields & groups', 'Value tracking & backups'] },
  ],

  storeDef: [
    { id: 'store_ps1', name: 'PlayStation Classics', by: 'Vault Curators', desc: 'The essential PS1 library — five discs every collector chases.', groups: ['RPG', 'Action', 'Racing'], items: [
      { id: 'ff7', name: 'Final Fantasy VII (black label)', year: 1997, value: 180, group: 'RPG', img: 'ff7_blacklabel.jpg' },
      { id: 'mgs', name: 'Metal Gear Solid', year: 1998, value: 90, group: 'Action', img: 'mgs_ps1.jpg' },
      { id: 'sotn', name: 'Castlevania: SotN', year: 1997, value: 260, group: 'Action', img: 'sotn_ps1.jpg' },
      { id: 'gt2', name: 'Gran Turismo 2', year: 1999, value: 35, group: 'Racing', img: 'gt2_ps1.jpg' },
      { id: 'chronocross', name: 'Chrono Cross', year: 1999, value: 85, group: 'RPG', img: 'chrono_cross.jpg' },
    ] },
    { id: 'store_gb', name: 'Game Boy Essentials', by: 'RetroDB', desc: 'Five carts that defined the brick — the classic starter checklist.', groups: ['Launch era', 'Classics'], items: [
      { id: 'tetris', name: 'Tetris', year: 1989, value: 25, group: 'Launch era', img: 'tetris_gb.jpg' },
      { id: 'sml', name: 'Super Mario Land', year: 1989, value: 40, group: 'Launch era', img: 'sml_gb.jpg' },
      { id: 'pkmred', name: 'Pokémon Red', year: 1996, value: 90, group: 'Classics', img: 'pokemon_red.jpg' },
      { id: 'zelda_la', name: "Link's Awakening", year: 1993, value: 70, group: 'Classics', img: 'links_awakening.jpg' },
      { id: 'kirby', name: "Kirby's Dream Land", year: 1992, value: 45, group: 'Classics', img: 'kirby_gb.jpg' },
    ] },
    { id: 'store_beatles', name: 'Beatles Studio Albums', by: 'WaxWorks', desc: 'UK studio pressings — the core five to start a serious shelf.', groups: ['60s'], items: [
      { id: 'rubbersoul', name: 'Rubber Soul', year: 1965, value: 110, group: '60s', img: 'rubber_soul.jpg' },
      { id: 'revolver', name: 'Revolver', year: 1966, value: 150, group: '60s', img: 'revolver.jpg' },
      { id: 'sgtpepper', name: "Sgt. Pepper's Lonely Hearts Club Band", year: 1967, value: 140, group: '60s', img: 'sgt_pepper.jpg' },
      { id: 'whitealbum', name: 'The White Album', year: 1968, value: 180, group: '60s', img: 'white_album.jpg' },
      { id: 'abbeyroad', name: 'Abbey Road', year: 1969, value: 120, group: '60s', img: 'abbey_road.jpg' },
    ] },
    { id: 'store_bronze', name: 'Bronze Age Marvel Keys', by: 'KeyIssues', desc: 'Four grails from the 70s — first appearances that anchor a comic vault.', groups: ['Marvel'], items: [
      { id: 'hulk181', name: 'Incredible Hulk #181', year: 1974, value: 3200, group: 'Marvel', img: 'hulk_181.jpg' },
      { id: 'asm129', name: 'Amazing Spider-Man #129', year: 1974, value: 1100, group: 'Marvel', img: 'asm_129.jpg' },
      { id: 'gsxm1', name: 'Giant-Size X-Men #1', year: 1975, value: 2400, group: 'Marvel', img: 'gsxm_1.jpg' },
      { id: 'im55', name: 'Iron Man #55', year: 1973, value: 480, group: 'Marvel', img: 'ironman_55.jpg' },
    ] },
    { id: 'store_space', name: 'Classic Space Fleet', by: 'BrickIndex', desc: 'The grey-and-blue LEGO fleet, 1978–83. Benny would approve.', groups: ['Space'], items: [
      { id: 'cruiser924', name: 'Space Cruiser 924', year: 1978, value: 260, group: 'Space', img: 'cruiser_924.jpg' },
      { id: 'beta6970', name: 'Beta-1 Command Base 6970', year: 1980, value: 340, group: 'Space', img: 'beta1_6970.jpg' },
      { id: 'commander6980', name: 'Galaxy Commander 6980', year: 1983, value: 520, group: 'Space', img: 'commander_6980.jpg' },
      { id: 'voyager6929', name: 'Starfleet Voyager 6929', year: 1981, value: 290, group: 'Space', img: 'voyager_6929.jpg' },
    ] },
  ],

  themesDef: [
    { id: 'devlight', name: 'Paperwhite', desc: 'Clean dev-tool. Quiet neutrals, indigo accent.', colors: ['#FAFAF8', '#FFFFFF', '#5453C4', '#1B1B1F', '#1F8A5B'] },
    { id: 'devdark', name: 'Graphite', desc: 'Same bones, dark. Soft indigo on charcoal.', colors: ['#141417', '#1C1C21', '#7B7AE8', '#ECECF1', '#34B37A'] },
    { id: 'terminal', name: 'Phosphor', desc: 'Green CRT terminal. All monospace, zero radius.', colors: ['#0B0E0B', '#0F140F', '#4ADE80', '#C9E5C9', '#FBBF24'] },
    { id: 'arcade', name: 'Arcade', desc: '8-bit pixel headings, cyan + magenta, hard shadows.', colors: ['#131022', '#1A1633', '#22D3EE', '#E8E6F5', '#F472B6'] },
    { id: 'hud', name: 'Starship', desc: 'Sci-fi HUD. Cold blues, glowing edges.', colors: ['#060B14', '#0B1322', '#38BDF8', '#D8EAFF', '#FBBF24'] },
    { id: 'paper', name: 'Zine', desc: 'Brutalist print. Ink on paper, hard offset shadows.', colors: ['#F2EFE6', '#FBFAF4', '#D2481F', '#1B1A16', '#2A6E4E'] },
    { id: 'synth', name: 'Synthwave', desc: 'Neon nights. Magenta glow on deep purple.', colors: ['#150A20', '#1E0F2E', '#E879F9', '#F5EBFF', '#22D3EE'] },
  ],

  data: [
    { id: 'retro', name: 'Retro Consoles', desc: 'Boxed + loose hardware, NES → GameCube era', groups: ['Nintendo', 'Sega', 'Handhelds', 'Atari'], items: [
      { id: 'nes', name: 'NES Console (boxed)', year: 1985, cond: 'Mint', value: 340, price: 260, group: 'Nintendo', tags: ['boxed', 'cib'], img: 'nes_console.jpg', desc: 'Complete-in-box NES-001 with original styrofoam, manuals, two controllers and Zapper. Shell has almost no yellowing; tested and working.', custom: [{ k: 'Serial no.', v: 'N8054321' }, { k: 'Region', v: 'NTSC-U' }, { k: 'Completeness', v: 'CIB — console, box, manuals' }] },
      { id: 'snes', name: 'SNES (PAL)', year: 1992, cond: 'Good', value: 120, price: 70, group: 'Nintendo', tags: ['loose'], img: 'snes_pal.jpg', desc: 'Loose PAL SNES, one controller. Light yellowing on the top shell, ports clean.', custom: [{ k: 'Region', v: 'PAL' }] },
      { id: 'gameboy', name: 'Game Boy DMG-01', year: 1989, cond: 'Fair', value: 85, price: 40, group: 'Handhelds', tags: ['loose'], img: 'gameboy_dmg.jpg', desc: 'Original DMG with a few dead pixel lines. Candidate for an IPS screen mod.', custom: [{ k: 'Screen', v: '2 dead lines' }, { k: 'Mods', v: 'None (IPS planned)' }] },
      { id: 'n64', name: 'N64 Gold Edition', year: 1998, cond: 'Mint', value: 610, price: 420, group: 'Nintendo', tags: ['cib', 'rare'], img: 'n64_gold.jpg', desc: 'Toys "R" Us exclusive gold console, complete in box with matching gold controller. The crown of the Nintendo shelf.', custom: [{ k: 'Edition', v: 'Gold — TRU exclusive' }, { k: 'Serial no.', v: 'NS1189223' }] },
      { id: 'famicom', name: 'Famicom (JP)', year: 1983, cond: 'Good', value: 210, price: 140, group: 'Nintendo', tags: ['boxed', 'import'], img: 'famicom.jpg', desc: 'Japanese import Famicom with hardwired controllers, boxed. Box has shelf wear.', custom: [{ k: 'Region', v: 'NTSC-J' }] },
      { id: 'gamecube', name: 'GameCube (indigo)', year: 2001, cond: 'Mint', value: 95, price: 60, group: 'Nintendo', tags: ['loose'], img: 'gamecube.jpg', desc: 'Indigo GameCube with one controller and memory card. Near-perfect shell.', custom: [{ k: 'Accessories', v: '1 controller, 59-block card' }] },
      { id: 'virtualboy', name: 'Virtual Boy', year: 1995, cond: 'Good', value: 450, price: 300, group: 'Nintendo', tags: ['cib', 'rare'], img: 'virtualboy.jpg', desc: 'Complete Virtual Boy with stand and box. Displays tested — no rare solder-joint flicker.', custom: [{ k: 'Displays', v: 'Both OK' }] },
      { id: 'dreamcast', name: 'Sega Dreamcast', year: 1999, cond: 'Good', value: 180, price: 110, group: 'Sega', tags: ['loose'], img: 'dreamcast.jpg', desc: 'Loose Dreamcast with VMU and controller. GD-ROM drive reads flawlessly.', custom: [{ k: 'Accessories', v: 'VMU, 1 controller' }] },
      { id: 'saturn', name: 'Sega Saturn', year: 1995, cond: 'Good', value: 220, price: 0, group: 'Sega', tags: ['wanted'], img: 'sega_saturn.jpg', desc: 'On the hunt — looking for a clean model 2 with matching serials.', custom: [], owned: false },
      { id: 'gamegear', name: 'Sega Game Gear', year: 1991, cond: 'Good', value: 90, price: 0, group: 'Handhelds', tags: ['wanted'], img: 'game_gear.jpg', desc: 'Wanted — prefer a recapped unit or a fair-priced project.', custom: [], owned: false },
    ] },
    { id: 'pokemon', name: 'Pokémon', desc: 'Cards, games, toys and media — one franchise, many shelves', groups: [
      { id: 'pk_cards', name: 'Cards', parent: null },
      { id: 'pk_cards_reg', name: 'Regular cards', parent: 'pk_cards' },
      { id: 'pk_cards_rare', name: 'Rare & holo', parent: 'pk_cards' },
      { id: 'pk_games', name: 'Games', parent: null },
      { id: 'pk_games_n64', name: 'N64', parent: 'pk_games' },
      { id: 'pk_games_gb', name: 'Game Boy', parent: 'pk_games' },
      { id: 'pk_toys', name: 'Toys', parent: null },
      { id: 'pk_dvds', name: 'DVDs', parent: null },
    ], items: [
      { id: 'pk_squirtle', name: 'Squirtle (Base Set)', year: 1999, cond: 'Good', value: 8, price: 2, group: 'pk_cards_reg', tags: ['raw'], img: 'squirtle_base.jpg', desc: 'Base Set Squirtle, lightly played. Binder filler with sentimental value.', custom: [] },
      { id: 'pk_eevee', name: 'Eevee (Jungle)', year: 1999, cond: 'Mint', value: 6, price: 1, group: 'pk_cards_reg', tags: ['raw'], img: 'eevee_jungle.jpg', desc: 'Pack-fresh Jungle Eevee, sleeved since the day it was pulled.', custom: [] },
      { id: 'pk_zard_ex', name: 'Charizard ex (FireRed)', year: 2004, cond: 'Good', value: 380, price: 210, group: 'pk_cards_rare', tags: ['holo'], img: 'charizard_ex.jpg', desc: 'FireRed & LeafGreen Charizard ex, light edgewear on the back.', custom: [{ k: 'Set no.', v: '105/112' }] },
      { id: 'pk_umbreon', name: 'Umbreon Gold Star', year: 2005, cond: 'Good', value: 1900, price: 0, group: 'pk_cards_rare', tags: ['wanted', 'grail'], img: 'umbreon_star.jpg', desc: 'POP Series 5 grail — hunting a clean raw copy.', custom: [], owned: false },
      { id: 'pk_stadium', name: 'Pokémon Stadium (CIB)', year: 2000, cond: 'Good', value: 120, price: 70, group: 'pk_games_n64', tags: ['cib'], img: 'pk_stadium.jpg', desc: 'Complete in box with Transfer Pak. Box has light shelf wear.', custom: [] },
      { id: 'pk_snap', name: 'Pokémon Snap', year: 1999, cond: 'Fair', value: 60, price: 30, group: 'pk_games_n64', tags: ['loose'], img: 'pk_snap.jpg', desc: 'Loose cart, label faded from sunlight.', custom: [] },
      { id: 'pk_yellow', name: 'Pokémon Yellow', year: 1998, cond: 'Good', value: 110, price: 55, group: 'pk_games_gb', tags: ['loose'], img: 'pk_yellow.jpg', desc: 'Loose cart with a fresh save battery.', custom: [{ k: 'Battery', v: 'Replaced 2025' }] },
      { id: 'pk_crystal', name: 'Pokémon Crystal', year: 2000, cond: 'Good', value: 260, price: 0, group: 'pk_games_gb', tags: ['wanted'], img: 'pk_crystal.jpg', desc: 'Wanted — authentic cart only, working RTC preferred.', custom: [], owned: false },
      { id: 'pk_snorlax', name: 'Snorlax plush (1998 original)', year: 1998, cond: 'Good', value: 90, price: 40, group: 'pk_toys', tags: ['vintage'], img: 'snorlax_plush.jpg', desc: 'Original Play-By-Play plush with tush tag intact.', custom: [] },
      { id: 'pk_movie', name: 'Pokémon: The First Movie (DVD)', year: 1999, cond: 'Mint', value: 25, price: 10, group: 'pk_dvds', tags: ['sealed'], img: 'pk_movie_dvd.jpg', desc: 'Still-sealed first-print DVD.', custom: [] },
    ] },
    { id: 'cards', name: 'Trading Cards', desc: 'Graded + raw, mostly 90s TCG', groups: ['Pokémon', 'Magic', 'Sports'], items: [
      { id: 'charizard', name: 'Charizard Holo (Base Set)', year: 1999, cond: 'Mint', value: 4200, price: 3100, group: 'Pokémon', tags: ['graded', 'psa8'], img: 'charizard_base.jpg', desc: 'Base Set Unlimited Charizard, PSA 8. Strong centering, minor whitening on the back only.', custom: [{ k: 'Grade', v: 'PSA 8' }, { k: 'Cert no.', v: '82736411' }] },
      { id: 'blastoise', name: 'Blastoise Holo (Base Set)', year: 1999, cond: 'Good', value: 380, price: 240, group: 'Pokémon', tags: ['raw'], img: 'blastoise_base.jpg', desc: 'Raw Base Set Blastoise, light edgewear. Solid candidate for grading.', custom: [{ k: 'Grade', v: 'Raw (est. 6-7)' }] },
      { id: 'shivan', name: 'Shivan Dragon (Revised)', year: 1994, cond: 'Good', value: 45, price: 30, group: 'Magic', tags: ['raw'], img: 'shivan_revised.jpg', desc: 'Revised edition Shivan Dragon, lightly played. Childhood nostalgia pull.', custom: [{ k: 'Set', v: 'Revised (3ED)' }] },
      { id: 'griffey', name: 'Ken Griffey Jr. RC (Upper Deck)', year: 1989, cond: 'Mint', value: 120, price: 60, group: 'Sports', tags: ['rookie'], img: 'griffey_rc.jpg', desc: 'The iconic 1989 Upper Deck #1 rookie card. Sharp corners, clean surface.', custom: [{ k: 'Card no.', v: '#1' }] },
      { id: 'venusaur', name: 'Venusaur Holo (Base Set)', year: 1999, cond: 'Good', value: 340, price: 0, group: 'Pokémon', tags: ['wanted'], img: 'venusaur_base.jpg', desc: 'The missing starter — would complete the Base Set holo trio.', custom: [], owned: false },
    ] },
    { id: 'vinyl', name: 'Vinyl', desc: 'First pressings + soundtracks', groups: ['OSTs', 'Rock', 'Jazz'], items: [
      { id: 'okcomputer', name: 'OK Computer — 1st UK press', year: 1997, cond: 'Good', value: 260, price: 180, group: 'Rock', tags: ['first-press'], img: 'ok_computer.jpg', desc: 'First UK pressing, double LP. Sleeve VG+, vinyl plays clean with faint surface noise on side D.', custom: [{ k: 'Pressing', v: '1st UK, NODATA 02' }, { k: 'Sleeve', v: 'VG+' }] },
      { id: 'akira', name: 'Akira — Symphonic Suite OST', year: 1988, cond: 'Mint', value: 340, price: 220, group: 'OSTs', tags: ['import', 'rare'], img: 'akira_ost.jpg', desc: 'Original Japanese pressing of the Geinoh Yamashirogumi score. Obi strip intact.', custom: [{ k: 'Obi', v: 'Present' }] },
      { id: 'kindofblue', name: 'Kind of Blue — mono', year: 1959, cond: 'Fair', value: 480, price: 300, group: 'Jazz', tags: ['mono', 'rare'], img: 'kind_of_blue.jpg', desc: 'Mono six-eye pressing. Sleeve is rough but the record itself grades VG.', custom: [{ k: 'Label', v: 'Columbia six-eye' }] },
      { id: 'doomost', name: 'DOOM (2016) OST — red splatter', year: 2018, cond: 'Mint', value: 95, price: 80, group: 'OSTs', tags: ['limited'], img: 'doom_ost.jpg', desc: 'Limited red splatter variant, still sealed. Mick Gordon at his heaviest.', custom: [{ k: 'Variant', v: 'Red splatter /3000' }] },
    ] },
    { id: 'lego', name: 'LEGO Sets', desc: 'Sealed + built, space + castle', groups: ['Space', 'Castle', 'Technic'], items: [
      { id: 'galaxy', name: 'Galaxy Explorer 497', year: 1979, cond: 'Good', value: 720, price: 450, group: 'Space', tags: ['complete'], img: 'galaxy_explorer.jpg', desc: 'Complete classic-space Galaxy Explorer with instructions. Two minifig torsos show cracking.', custom: [{ k: 'Completeness', v: '100% parts + instructions' }] },
      { id: 'castle', name: "King's Castle 6080", year: 1984, cond: 'Fair', value: 380, price: 220, group: 'Castle', tags: ['near-complete'], img: 'kings_castle.jpg', desc: 'Near-complete — missing 4 minor parts and one flag. Instructions included, no box.', custom: [{ k: 'Missing', v: '4 parts, 1 flag' }] },
      { id: 'technic', name: 'Technic Super Car 8880', year: 1994, cond: 'Mint', value: 950, price: 610, group: 'Technic', tags: ['boxed', 'rare'], img: 'technic_8880.jpg', desc: 'The legendary 8880 with box and instructions. All gearbox functions work perfectly.', custom: [{ k: 'Box', v: 'Present, VG' }] },
      { id: 'monorail', name: 'Futuron Monorail 6990', year: 1987, cond: 'Good', value: 850, price: 0, group: 'Space', tags: ['wanted', 'grail'], img: 'monorail_6990.jpg', desc: 'Grail set — want it complete with full track and both stations.', custom: [], owned: false },
    ] },
    { id: 'comics', name: 'Comics', desc: 'Silver age + modern keys', groups: ['Marvel', 'DC', 'Indie'], items: [
      { id: 'xmen101', name: 'X-Men #101', year: 1976, cond: 'Good', value: 850, price: 520, group: 'Marvel', tags: ['key', 'graded'], img: 'xmen_101.jpg', desc: 'First appearance of Phoenix. CGC 6.5 with off-white pages.', custom: [{ k: 'Grade', v: 'CGC 6.5' }, { k: 'Key', v: '1st Phoenix' }] },
      { id: 'watchmen', name: 'Watchmen #1', year: 1986, cond: 'Mint', value: 240, price: 120, group: 'DC', tags: ['key'], img: 'watchmen_1.jpg', desc: 'First print, raw but immaculate. Stored bagged and boarded since the 90s.', custom: [{ k: 'Print', v: '1st' }] },
      { id: 'saga', name: 'Saga #1 (1st print)', year: 2012, cond: 'Mint', value: 180, price: 90, group: 'Indie', tags: ['key'], img: 'saga_1.jpg', desc: 'First print of the Image hit. Modern key that keeps climbing.', custom: [{ k: 'Print', v: '1st' }] },
    ] },
    { id: 'coins', name: 'Coins & Stamps', desc: 'World coins and classics, pre-1950', groups: ['US', 'Europe', 'Asia'], items: [
      { id: 'morgan', name: 'Morgan Dollar 1889-CC', year: 1889, cond: 'Good', value: 1400, price: 950, group: 'US', tags: ['key-date'], img: 'morgan_1889cc.jpg', desc: 'Carson City key date. VG details with honest wear, no cleaning.', custom: [{ k: 'Mint mark', v: 'CC' }] },
      { id: 'indianhead', name: 'Indian Head Penny', year: 1907, cond: 'Fair', value: 28, price: 15, group: 'US', tags: [], img: 'indian_head.jpg', desc: 'Common date in circulated condition. Filler until a better example turns up.', custom: [] },
      { id: 'pennyblack', name: 'Penny Black (used)', year: 1840, cond: 'Good', value: 420, price: 300, group: 'Europe', tags: ['rare'], img: 'penny_black.jpg', desc: "The world's first postage stamp, red Maltese cross cancel. Four margins, small thin on reverse.", custom: [{ k: 'Cancel', v: 'Red Maltese cross' }] },
    ] },
  ],

  fieldSeeds: {
    retro: { Nintendo: ['Serial no.', 'Region', 'Completeness', 'Edition'], Sega: ['Accessories'], Handhelds: ['Screen', 'Mods'] },
    pokemon: { pk_cards: ['Set no.', 'Language'], pk_cards_rare: ['Grade'], pk_games: ['Completeness'], pk_games_gb: ['Battery'] },
    cards: { 'Pokémon': ['Grade', 'Cert no.'], Magic: ['Set'], Sports: ['Card no.'] },
    vinyl: { OSTs: ['Variant', 'Obi'], Rock: ['Pressing', 'Sleeve'], Jazz: ['Label'] },
    lego: { Space: ['Completeness'], Castle: ['Missing'], Technic: ['Box'] },
    comics: { Marvel: ['Grade', 'Key'], DC: ['Print'], Indie: ['Print'] },
    coins: { US: ['Mint mark'], Europe: ['Cancel'] },
  },

  /* ---------- persistence ---------- */
  save() {
    try { localStorage.setItem('cc_data_v1', JSON.stringify(this.data)); } catch { /* quota */ }
  },
  load() {
    try {
      const raw = localStorage.getItem('cc_data_v1');
      if (raw) { const d = JSON.parse(raw); if (Array.isArray(d) && d.length) this.data = d; }
    } catch { /* keep seeds */ }
    const saved = localStorage.getItem('cc_theme');
    if (saved && this.themesDef.some(t => t.id === saved)) this.state.theme = saved;
    const plan = localStorage.getItem('cc_plan');
    if (plan === 'free' || plan === 'pro') this.state.plan = plan;
  },

  setState(patch) { Object.assign(this.state, patch); render(); },

  setTheme(id) {
    localStorage.setItem('cc_theme', id);
    this.setState({ theme: id });
  },

  flash(msg) {
    this.setState({ toast: msg });
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.setState({ toast: null }), 1800);
  },

  /* ---------- domain helpers ---------- */
  normGroups(coll) {
    if (!coll._norm) {
      const seeds = this.fieldSeeds[coll.id] || {};
      coll.groups = coll.groups.map(g => {
        const o = typeof g === 'string' ? { id: g, name: g, parent: null } : g;
        o.fields = o.fields || seeds[o.id] || [];
        return o;
      });
      coll._norm = true;
    }
    return coll.groups;
  },

  removeGroupNode(coll, gid) {
    const ids = [gid];
    const collect = p => { for (const g of coll.groups) if (g.parent === p) { ids.push(g.id); collect(g.id); } };
    collect(gid);
    if (coll.items.some(i => ids.includes(i.group))) { this.flash("Group has items — move them first"); return; }
    coll.groups = coll.groups.filter(g => !ids.includes(g.id));
    if (ids.includes(this.state.groupId)) this.setState({ groupId: null });
    this.save();
    this.flash('Group removed');
  },

  addGroupNode(coll, parent, name) {
    const n = (name || '').trim();
    if (!n) return;
    coll.groups.push({ id: 'g' + Date.now(), name: n, parent: parent || null, fields: [] });
    this.save();
    this.flash('Group "' + n + '" added');
  },

  addFromStore(sd) {
    if (this.data.some(c => c.id === sd.id)) { this.flash('Already in your vault'); return; }
    this.data.push({ id: sd.id, name: sd.name, desc: sd.desc, groups: [...sd.groups], items: sd.items.map(it => ({ ...it, owned: false, price: 0, cond: 'Good', tags: ['wanted'], custom: [], desc: 'From the "' + sd.name + '" curated checklist — not in your vault yet. Mark it as owned once you find it.' })) });
    this.save();
    this.setState({ screen: 'collection', collId: sd.id, groupId: null, itemId: null, query: '', cond: null, own: null });
    this.flash('Added to your vault ✓');
  },

  newCollection() {
    const c = { id: 'c' + Date.now(), name: 'New collection', desc: '', groups: [], items: [] };
    this.data.push(c);
    this.save();
    this.setState({ screen: 'collEdit', collId: c.id, groupId: null, itemId: null, ecTab: 'general' });
    this.flash('Collection created — name it here');
  },

  openForm(raw) {
    this.setState({ screen: 'form', formItemId: raw ? raw.id : null, fGroupSel: raw ? raw.group : null });
  },

  exportJson() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vault-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this.flash('Exported vault-export.json ✓');
  },

  /* ================================================================== */
  view() {
    const S = this.state;
    const theme = S.theme ?? 'devlight';
    const showValues = this.showValues;
    const money = v => (showValues ? '$' + Number(v || 0).toLocaleString('en-US') : '···');
    const condColor = c => (c === 'Mint' ? 'var(--good)' : c === 'Fair' ? 'var(--warn)' : 'var(--text2)');
    const go = p => this.setState(p);
    const coll = this.data.find(c => c.id === S.collId) || null;
    const inColl = ['collection', 'item', 'form', 'collEdit'].includes(S.screen);

    const openColl = c => go({ screen: 'collection', collId: c.id, groupId: null, itemId: null, query: '', cond: null });
    const openItem = (c, it) => go({ screen: 'item', collId: c.id, itemId: it.id });

    /* --- groups (hierarchical) --- */
    const groupsN = coll ? this.normGroups(coll) : [];
    const childrenOf = pid => groupsN.filter(g => (g.parent || null) === (pid || null));
    const gById = id => groupsN.find(g => g.id === id) || null;
    const subtree = gid => { const out = [gid]; for (const c of groupsN.filter(g => g.parent === gid)) out.push(...subtree(c.id)); return out; };
    const pathOf = gid => { const p = []; let g = gById(gid); let guard = 0; while (g && guard++ < 10) { p.unshift(g); g = g.parent ? gById(g.parent) : null; } return p; };
    const selPath = coll && S.groupId ? pathOf(S.groupId) : [];
    const fieldsFor = gid => pathOf(gid).reduce((a, g) => a.concat(g.fields || []), []);
    const groupSet = coll && S.groupId ? new Set(subtree(S.groupId)) : null;

    const commitNewGroup = el => {
      if (!this.state.pendingGroup) return;
      const parent = this.state.pendingGroup.parent;
      this.setState({ pendingGroup: null });
      this.addGroupNode(coll, parent, el.value);
    };
    const newGroupKey = e => { if (e.key === 'Enter') commitNewGroup(e.target); else if (e.key === 'Escape') { e.target.value = ''; this.setState({ pendingGroup: null }); } };
    const newGroupBlur = e => commitNewGroup(e.target);
    const commitField = (g, el) => {
      if (this.state.pendingField !== g.id) return;
      this.setState({ pendingField: null });
      const n = (el.value || '').trim();
      if (!n) return;
      g.fields = g.fields || [];
      g.fields.push(n);
      this.save();
      this.flash('Field "' + n + '" added');
    };

    /* --- items, filtered + sorted --- */
    let items = [];
    if (coll) {
      items = coll.items.filter(it => (!groupSet || groupSet.has(it.group)) && (!S.cond || it.cond === S.cond) && (!S.own || (S.own === 'owned' ? it.owned !== false : it.owned === false)) && (!S.query || it.name.toLowerCase().includes(S.query.toLowerCase())));
    }
    const sortKey = S.sort || 'recent';
    items = items.slice();
    if (sortKey === 'recent') items.reverse();
    else if (sortKey === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortKey === 'valueDesc') items.sort((a, b) => b.value - a.value);
    else if (sortKey === 'valueAsc') items.sort((a, b) => a.value - b.value);
    else if (sortKey === 'yearAsc') items.sort((a, b) => a.year - b.year);
    else if (sortKey === 'yearDesc') items.sort((a, b) => b.year - a.year);

    const ownedCount = coll ? coll.items.filter(i => i.owned !== false).length : 0;

    /* --- sharing --- */
    if (coll && !coll.members) coll.members = (this.seedShares[coll.id] || []).map(x => ({ ...x }));
    if (coll && coll.linkShare === undefined) coll.linkShare = true;
    const ownerRow = { name: 'Marcus Keller', email: 'marcus@airia.com', initials: 'MK', role: 'Owner' };

    /* --- item detail / form targets --- */
    let raw = null;
    if (coll && S.itemId) raw = coll.items.find(i => i.id === S.itemId) || null;
    const fRaw = coll && S.formItemId ? coll.items.find(i => i.id === S.formItemId) : null;
    const fGroupCur = S.fGroupSel ?? (fRaw ? fRaw.group : (groupsN[0] && groupsN[0].id) || '');

    /* --- breadcrumb --- */
    const crumbParts = ['~'];
    if (S.screen === 'settings') crumbParts.push('settings');
    else if (S.screen === 'store') crumbParts.push('store');
    else if (coll && inColl) {
      crumbParts.push(coll.id);
      if (selPath.length) { const ns = selPath.map(g => g.name.toLowerCase().replace(/\s+/g, '-')); crumbParts.push(...(ns.length > 2 ? ['…'].concat(ns.slice(-2)) : ns)); }
      if (raw && S.screen === 'item') crumbParts.push(raw.id);
      if (S.screen === 'form') crumbParts.push(fRaw ? 'edit' : 'new');
      if (S.screen === 'collEdit') crumbParts.push('edit');
    } else crumbParts.push('dashboard');

    const themesDef = this.themesDef;
    const ti = Math.max(0, themesDef.findIndex(t => t.id === theme));
    const backLabel = coll ? '← ' + coll.name : '← Back';

    /* ============================ TOP BAR ============================ */
    const themeMenu = !S.themeMenu ? '' : `
      <div data-c="${h(() => go({ themeMenu: false }))}" style="position: fixed; inset: 0; z-index: 69;"></div>
      <div style="position: absolute; top: calc(100% + 8px); right: 0; width: 236px; background: var(--panel); border: var(--bw) solid var(--border); border-radius: var(--radius); box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 70; padding: 6px; display: flex; flex-direction: column; gap: 2px;">
        ${themesDef.map(t => `
          <div class="hvb" data-c="${h(() => { this.setTheme(t.id); go({ themeMenu: false }); })}" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius); cursor: pointer; background: ${t.id === theme ? 'var(--panel2)' : 'transparent'};">
            <span style="display: flex; gap: 3px; flex: none;">
              <span style="width: 13px; height: 13px; border-radius: 3px; background: ${t.colors[0]}; border: 1px solid rgba(128,128,128,0.4);"></span>
              <span style="width: 13px; height: 13px; border-radius: 3px; background: ${t.colors[2]}; border: 1px solid rgba(128,128,128,0.4);"></span>
              <span style="width: 13px; height: 13px; border-radius: 3px; background: ${t.colors[4]}; border: 1px solid rgba(128,128,128,0.4);"></span>
            </span>
            <span style="flex: 1; font-size: 12.5px; font-weight: 600; color: var(--text); font-family: var(--fb);">${esc(t.name)}</span>
            <span style="color: var(--accent); font-size: 12px;">${t.id === theme ? '✓' : ''}</span>
          </div>`).join('')}
        <div class="hvacc" data-c="${h(() => go({ themeMenu: false, screen: 'settings', setTab: 'appearance' }))}" style="padding: 8px 10px; font-size: 11.5px; color: var(--muted); cursor: pointer; border-top: 1px solid var(--border); margin-top: 4px;">Browse details in Settings →</div>
      </div>`;

    const topbar = `
      <div style="display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: var(--panel); border-bottom: var(--bw) solid var(--border); flex: none;">
        <div data-c="${h(() => go({ screen: 'dashboard', collId: null, groupId: null, itemId: null, query: '', cond: null }))}" style="cursor: pointer; display: flex; align-items: center; gap: 9px; font-family: var(--fd); font-weight: 700; font-size: 14px; letter-spacing: var(--lsd);">
          <span style="width: 24px; height: 24px; border-radius: var(--radius); background: var(--accent); color: var(--accentC); display: grid; place-items: center; font-size: 12px; box-shadow: var(--btnsh);">◆</span>Vault
        </div>
        <div style="font-family: var(--fm); font-size: 11.5px; color: var(--muted);">${esc(crumbParts.join('/'))}</div>
        <div style="flex: 1;"></div>
        <input value="${esc(S.query)}" data-i="${h(e => go({ query: e.target.value }))}" data-fk="search" placeholder="Search items…" style="background: var(--panel2); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 7px 12px; font-family: var(--fb); font-size: 12.5px; width: 240px; outline: none; box-sizing: border-box;">
        <div style="position: relative;">
          <div class="hva" data-c="${h(() => go({ themeMenu: !S.themeMenu }))}" title="Theme" style="cursor: pointer; display: flex; align-items: center; gap: 7px; border: var(--bw) solid var(--border); border-radius: var(--radius); padding: 6px 11px; font-family: var(--fm); font-size: 11px; color: var(--text2);">◐ ${esc(themesDef[ti].name)} ▾</div>
          ${themeMenu}
        </div>
        <div class="hva" data-c="${h(() => go({ screen: 'settings' }))}" title="Settings" style="cursor: pointer; width: 30px; height: 30px; border: var(--bw) solid var(--border); border-radius: var(--radius); display: grid; place-items: center; font-size: 13px; color: var(--text2);">⚙</div>
        <div style="width: 30px; height: 30px; border-radius: var(--pill); background: var(--panel2); border: var(--bw) solid var(--border); color: var(--accent); display: grid; place-items: center; font-size: 11px; font-weight: 700;">MK</div>
      </div>`;

    /* ============================ SIDEBAR ============================ */
    const sidebar = `
      <div style="width: 226px; flex: none; border-right: var(--bw) solid var(--border); padding: 14px 10px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; background: var(--bg); box-sizing: border-box;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div data-c="${h(() => go({ screen: 'dashboard', collId: null, groupId: null, itemId: null, query: '', cond: null }))}" style="display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; background: ${S.screen === 'dashboard' ? 'var(--accent)' : 'transparent'}; color: ${S.screen === 'dashboard' ? 'var(--accentC)' : 'var(--text2)'};">⌂ Dashboard</div>
          <div data-c="${h(() => go({ screen: 'store', collId: null, groupId: null, itemId: null }))}" style="display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; background: ${S.screen === 'store' ? 'var(--accent)' : 'transparent'}; color: ${S.screen === 'store' ? 'var(--accentC)' : 'var(--text2)'};">⊞ Store</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="font-family: var(--fm); font-size: 10px; letter-spacing: 0.13em; color: var(--muted); padding: 0 10px 7px;">COLLECTIONS</div>
          ${this.data.map(c => {
            const active = inColl && S.collId === c.id;
            return `<div class="${active ? '' : 'hvb'}" data-c="${h(() => openColl(c))}" style="display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border-radius: var(--radius); font-size: 13px; cursor: pointer; background: ${active ? 'var(--accent)' : 'transparent'}; color: ${active ? 'var(--accentC)' : 'var(--text2)'};"><span style="font-weight: 500;">${esc(c.name)}</span><span style="font-size: 11px; opacity: 0.7;">${c.items.length}</span></div>`;
          }).join('')}
        </div>
        <div style="margin-top: auto; display: flex; flex-direction: column; gap: 2px;">
          <div data-c="${h(() => go({ screen: 'settings' }))}" style="display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius); font-size: 13px; cursor: pointer; background: ${S.screen === 'settings' ? 'var(--accent)' : 'transparent'}; color: ${S.screen === 'settings' ? 'var(--accentC)' : 'var(--text2)'};">⚙ Settings</div>
          <div style="padding: 6px 10px; font-family: var(--fm); font-size: 10px; color: var(--muted);">● synced · v0.1 prototype</div>
        </div>
      </div>`;

    /* ============================ SCREENS ============================ */
    let main = '';

    /* ------------------------- dashboard ------------------------- */
    if (S.screen === 'dashboard') {
      const totalItems = this.data.reduce((a, c) => a + c.items.length, 0);
      const totalVal = this.data.reduce((a, c) => a + c.items.filter(i => i.owned !== false).reduce((x, i) => x + i.value, 0), 0);
      const totalGroups = this.data.reduce((a, c) => a + c.groups.length, 0);
      const stats = [
        { label: 'ITEMS', val: String(totalItems), sub: 'across ' + this.data.length + ' collections' },
        { label: 'EST. VALUE', val: money(totalVal), sub: '▲ 4.2% this month' },
        { label: 'GROUPS', val: String(totalGroups), sub: 'in ' + this.data.length + ' collections' },
        { label: 'ADDED', val: '4', sub: 'this week' },
      ];
      const recentDefs = [['retro', 'n64', '2h ago'], ['comics', 'saga', '1d ago'], ['vinyl', 'doomost', '2d ago'], ['cards', 'charizard', '4d ago']];
      const recent = recentDefs.map(([cid, iid, when]) => {
        const c = this.data.find(x => x.id === cid);
        const it = c && c.items.find(x => x.id === iid);
        return it ? { name: it.name, sub: c.name + ' · added ' + when, valStr: money(it.value), open: () => openItem(c, it) } : null;
      }).filter(Boolean);

      main = `
        <div style="padding: 26px 30px; display: flex; flex-direction: column; gap: 22px; max-width: 1080px;">
          <div>
            <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd);">Dashboard</div>
            <div style="font-size: 13px; color: var(--muted); margin-top: 6px;">${totalItems} items across ${this.data.length} collections · welcome back, Marcus</div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;">
            ${stats.map(s => `
              <div style="${CARD} padding: 14px 16px; display: flex; flex-direction: column; gap: 5px;">
                <div style="font-family: var(--fm); font-size: 10px; letter-spacing: 0.13em; color: var(--muted);">${s.label}</div>
                <div style="font-family: var(--fd); font-size: 21px; font-weight: 700; letter-spacing: var(--lsd);">${s.val}</div>
                <div style="font-size: 11.5px; color: var(--text2);">${s.sub}</div>
              </div>`).join('')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="${SLBL}">COLLECTIONS</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
              ${this.data.map(c => {
                const owned = c.items.filter(i => i.owned !== false).length;
                return `
                <div class="hvbd" data-c="${h(() => openColl(c))}" style="${CARD} overflow: hidden; cursor: pointer;">
                  <div style="height: 70px; border-bottom: var(--bw) solid var(--border); position: relative; pointer-events: none;">
                    ${imageSlot('banner-' + c.id, c.name)}
                  </div>
                  <div style="padding: 12px 14px; display: flex; flex-direction: column; gap: 5px;">
                    <div style="font-size: 14px; font-weight: 700;">${esc(c.name)}</div>
                    <div style="font-size: 11.5px; color: var(--muted);">${owned}/${c.items.length} owned · ${c.groups.length} groups</div>
                    <div style="font-size: 12.5px; font-weight: 700; color: var(--accent2);">${money(c.items.filter(i => i.owned !== false).reduce((x, i) => x + i.value, 0))}</div>
                  </div>
                </div>`;
              }).join('')}
              <div class="hva" data-c="${h(() => this.newCollection())}" style="border: var(--bw) dashed var(--border); border-radius: var(--radius); display: grid; place-items: center; font-size: 12.5px; color: var(--muted); min-height: 120px; cursor: pointer;">+ New collection</div>
            </div>
          </div>
          <div style="${CARD} padding: 16px 18px; display: flex; flex-direction: column; gap: 4px;">
            <div style="${SLBL} padding-bottom: 8px;">RECENT ADDITIONS</div>
            ${recent.map(r => `
              <div class="hvb" data-c="${h(r.open)}" style="display: flex; justify-content: space-between; align-items: center; padding: 9px 2px; border-top: 1px solid var(--border); cursor: pointer;">
                <div><div style="font-size: 13px; font-weight: 600;">${esc(r.name)}</div><div style="font-size: 11.5px; color: var(--muted); margin-top: 2px;">${esc(r.sub)}</div></div>
                <div style="font-size: 13px; font-weight: 700; color: var(--accent2);">${r.valStr}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    /* ------------------------- collection ------------------------- */
    if (S.screen === 'collection' && coll) {
      const chip = g => {
        const selected = S.groupId === g.id;
        const onPath = !selected && selPath.some(p => p.id === g.id);
        const set = new Set(subtree(g.id));
        const cnt = coll.items.filter(i => set.has(i.group)).length;
        return `<div class="hvbd" data-c="${h(() => go({ groupId: selected ? (g.parent || null) : g.id }))}" style="border: var(--bw) solid ${selected || onPath ? 'var(--accent)' : 'var(--border)'}; background: ${selected ? 'var(--accent)' : 'transparent'}; color: ${selected ? 'var(--accentC)' : (onPath ? 'var(--accent)' : 'var(--text2)')}; border-radius: var(--pill); padding: 5px 13px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; gap: 6px; align-items: center;"><span>${esc(g.name)}${childrenOf(g.id).length ? ' ▸' : ''}</span><span style="font-size: 10.5px; opacity: 0.65;">${cnt}</span></div>`;
      };
      const addChip = pid => `<div class="hvbd" data-c="${h(() => go({ pendingGroup: { parent: pid } }))}" style="border: var(--bw) dashed var(--border); background: transparent; color: var(--accent); border-radius: var(--pill); padding: 5px 13px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; gap: 6px; align-items: center;"><span>+ New</span></div>`;
      const cur = S.groupId ? gById(S.groupId) : null;
      let chips = '';
      if (!cur) {
        chips += `<div data-c="${h(() => go({ groupId: null }))}" style="border: var(--bw) solid var(--accent); background: var(--accent); color: var(--accentC); border-radius: var(--pill); padding: 5px 13px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; gap: 6px; align-items: center;"><span>All items</span><span style="font-size: 10.5px; opacity: 0.65;">${coll.items.length}</span></div>`;
        chips += childrenOf(null).map(chip).join('');
        if (!S.pendingGroup) chips += addChip(null);
      } else {
        const parent = cur.parent ? gById(cur.parent) : null;
        chips += `<div class="hvbd" data-c="${h(() => go({ groupId: parent ? parent.id : null }))}" style="border: var(--bw) solid var(--border); background: transparent; color: var(--text2); border-radius: var(--pill); padding: 5px 13px; font-size: 12px; font-weight: 600; cursor: pointer;">‹ ${esc(parent ? parent.name : 'All items')}</div>`;
        chips += chip(cur);
        chips += childrenOf(cur.id).map(chip).join('');
        if (!S.pendingGroup) chips += addChip(cur.id);
      }
      const chipNewInput = S.pendingGroup ? `<input data-autofocus data-fk="new-group" placeholder="New group name… (Enter)" data-k="${h(newGroupKey)}" data-b="${h(newGroupBlur)}" style="border: var(--bw) dashed var(--accent); background: var(--panel); color: var(--text); border-radius: var(--pill); padding: 5px 13px; font-size: 12px; font-family: var(--fb); outline: none; width: 180px; box-sizing: border-box;">` : '';

      const condChips = ['Mint', 'Good', 'Fair'].map(c => {
        const active = S.cond === c;
        return `<div data-c="${h(() => go({ cond: active ? null : c }))}" style="border: var(--bw) solid ${active ? 'var(--accent)' : 'var(--border)'}; background: ${active ? 'var(--accent)' : 'transparent'}; color: ${active ? 'var(--accentC)' : 'var(--text2)'}; border-radius: var(--pill); padding: 4px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;">${c}</div>`;
      }).join('');
      const statusChips = [['owned', 'Owned'], ['wanted', 'Wanted']].map(([id, label]) => {
        const active = S.own === id;
        return `<div data-c="${h(() => go({ own: active ? null : id }))}" style="border: var(--bw) solid ${active ? 'var(--accent)' : 'var(--border)'}; background: ${active ? 'var(--accent)' : 'transparent'}; color: ${active ? 'var(--accentC)' : 'var(--text2)'}; border-radius: var(--pill); padding: 4px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;">${label}</div>`;
      }).join('');

      const sortDefs = [['recent', 'Recently added'], ['name', 'Name A–Z'], ['valueDesc', 'Value high → low'], ['valueAsc', 'Value low → high'], ['yearAsc', 'Year old → new'], ['yearDesc', 'Year new → old']];
      const sortLabel = Object.fromEntries(sortDefs)[sortKey];
      const sortMenu = !S.sortMenu ? '' : `
        <div data-c="${h(() => go({ sortMenu: false }))}" style="position: fixed; inset: 0; z-index: 69;"></div>
        <div style="position: absolute; top: calc(100% + 6px); right: 0; width: 190px; background: var(--panel); border: var(--bw) solid var(--border); border-radius: var(--radius); box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 70; padding: 5px; display: flex; flex-direction: column; gap: 1px;">
          ${sortDefs.map(([id, label]) => `<div class="hvb" data-c="${h(() => go({ sort: id, sortMenu: false }))}" style="display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; border-radius: var(--radius); cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text2); background: ${sortKey === id ? 'var(--panel2)' : 'transparent'};"><span>${label}</span><span style="color: var(--accent);">${sortKey === id ? '✓' : ''}</span></div>`).join('')}
        </div>`;

      const eItem = it => {
        const wanted = it.owned === false;
        const gname = (gById(it.group) || { name: it.group }).name;
        return {
          wanted, gname,
          condUp: wanted ? 'WANTED' : it.cond.toUpperCase(),
          condColor: wanted ? 'var(--accent)' : condColor(it.cond),
          cardBd: wanted ? 'var(--bw) dashed var(--accent)' : 'var(--bw) solid var(--border)',
          imgOp: wanted ? '0.55' : '1',
        };
      };

      const grid = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 15px;">
          ${items.map(it => { const e = eItem(it); return `
            <div class="hvbd" data-c="${h(() => openItem(coll, it))}" style="background: var(--panel); border: ${e.cardBd}; border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; cursor: pointer; display: flex; flex-direction: column;">
              <div style="height: 116px; opacity: ${e.imgOp}; background: ${STRIPES}; display: grid; place-items: center; font-family: var(--fm); font-size: 10px; color: var(--muted); border-bottom: var(--bw) solid var(--border);">img: ${esc(it.img)}</div>
              <div style="padding: 11px 13px; display: flex; flex-direction: column; gap: 5px;">
                <div style="font-size: 13.5px; font-weight: 600;">${esc(it.name)}</div>
                <div style="font-size: 11.5px; color: var(--muted);">${esc(it.year + ' · ' + e.gname)}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                  <span style="font-size: 13px; font-weight: 700; color: var(--accent2);">${money(it.value)}</span>
                  <span style="font-family: var(--fm); font-size: 9px; font-weight: 700; letter-spacing: 0.07em; color: ${e.condColor}; border: 1px solid ${e.condColor}; border-radius: var(--pill); padding: 2px 8px;">${e.condUp}</span>
                </div>
              </div>
            </div>`; }).join('')}
          <div class="hva" data-c="${h(() => this.openForm(null))}" style="border: var(--bw) dashed var(--border); border-radius: var(--radius); display: grid; place-items: center; font-size: 12.5px; color: var(--muted); min-height: 180px; cursor: pointer;">+ Add item</div>
        </div>`;

      const list = `
        <div style="${CARD} overflow: hidden;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 70px 90px 90px; gap: 10px; padding: 9px 16px; font-family: var(--fm); font-size: 10px; letter-spacing: 0.1em; color: var(--muted); border-bottom: var(--bw) solid var(--border);"><span>NAME</span><span>GROUP</span><span>YEAR</span><span>COND</span><span style="text-align: right;">VALUE</span></div>
          ${items.map(it => { const e = eItem(it); return `
            <div class="hvb" data-c="${h(() => openItem(coll, it))}" style="display: grid; grid-template-columns: 2fr 1fr 70px 90px 90px; gap: 10px; padding: 11px 16px; font-size: 12.5px; border-bottom: 1px solid var(--border); cursor: pointer; align-items: center;">
              <span style="font-weight: 600;">${esc(it.name)}</span>
              <span style="color: var(--text2);">${esc(e.gname)}</span>
              <span style="color: var(--muted);">${it.year}</span>
              <span style="font-family: var(--fm); font-size: 9.5px; font-weight: 700; color: ${e.condColor};">${e.condUp}</span>
              <span style="text-align: right; font-weight: 700; color: var(--accent2);">${money(it.value)}</span>
            </div>`; }).join('')}
        </div>`;

      const collPct = coll.items.length ? Math.round((ownedCount / coll.items.length) * 100) + '%' : '0%';
      const avatars = [ownerRow, ...coll.members].slice(0, 4).map(m => `<span title="${esc(m.name + ' · ' + m.role)}" style="width: 27px; height: 27px; border-radius: var(--pill); background: var(--panel2); border: var(--bw) solid var(--border); color: var(--accent); display: grid; place-items: center; font-size: 9.5px; font-weight: 700; margin-left: -6px;">${esc(m.initials)}</span>`).join('');

      main = `
        <div style="padding: 24px 30px; display: flex; flex-direction: column; gap: 16px;">
          <div style="height: 150px; position: relative;">
            <div style="position: absolute; inset: 0;">${imageSlot('banner-' + coll.id, 'Drop a banner image for this collection', '10px')}</div>
            <div style="position: absolute; inset: 0; border-radius: var(--radius); background: linear-gradient(180deg, rgba(0,0,0,0) 30%, color-mix(in srgb, var(--bg) 72%, transparent) 74%, var(--bg) 100%); pointer-events: none; z-index: 1;"></div>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-top: -68px; position: relative; z-index: 2; padding: 0 16px;">
            <div style="width: 80px; height: 80px; flex: none; border-radius: var(--radius); overflow: hidden; outline: 3px solid var(--bg); background: var(--panel2); box-shadow: var(--shadow);">
              ${imageSlot('icon-' + coll.id, 'Icon')}
            </div>
            <div style="flex: 1; min-width: 240px;">
              <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd); text-shadow: 0 1px 3px var(--bg), 0 0 12px var(--bg), 0 0 24px var(--bg);">${esc((() => { const names = selPath.map(g => g.name); const shown = names.length > 2 ? ['…'].concat(names.slice(-2)) : names; return shown.length ? coll.name + ' / ' + shown.join(' / ') : coll.name; })())}</div>
              <div style="font-size: 13px; color: var(--text2); margin-top: 6px; text-shadow: 0 1px 3px var(--bg), 0 0 10px var(--bg);">${esc(coll.desc)}</div>
            </div>
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div style="display: flex; flex-direction: column; gap: 6px; justify-content: center; min-width: 170px; height: 50px; box-sizing: border-box; border: var(--bw) solid var(--border); border-radius: var(--radius); padding: 7px 12px; background: var(--bg);">
                <div style="display: flex; justify-content: space-between; gap: 12px; font-family: var(--fm); font-size: 10px; letter-spacing: 0.06em; color: var(--muted);"><span>${ownedCount} / ${coll.items.length} OWNED</span><span style="color: var(--accent); font-weight: 700;">${collPct}</span></div>
                <div style="height: 5px; background: var(--panel2); border-radius: var(--pill); overflow: hidden;"><div style="height: 100%; width: ${collPct}; background: var(--accent);"></div></div>
              </div>
              ${showValues ? `<div style="border: var(--bw) solid var(--border); border-radius: var(--radius); padding: 7px 12px; font-size: 12px; color: var(--text2); height: 50px; box-sizing: border-box; display: flex; align-items: center; gap: 5px; background: var(--bg);">est <span style="color: var(--accent2); font-weight: 700;">${money(coll.items.reduce((x, i) => x + i.value, 0))}</span></div>` : ''}
              <div data-c="${h(() => go({ screen: 'collEdit', ecTab: 'sharing' }))}" title="Manage sharing" style="display: flex; align-items: center; padding-left: 6px; cursor: pointer;">${avatars}</div>
              <div class="hva" data-c="${h(() => go({ screen: 'collEdit', ecTab: 'general' }))}" title="Collection settings — general, groups & sharing" style="border: var(--bw) solid var(--border); color: var(--text2); background: var(--bg); border-radius: var(--radius); padding: 8px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer;">⚙ Manage</div>
              <div data-c="${h(() => this.openForm(null))}" style="background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 8px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--btnsh);">+ Add item</div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; border-bottom: var(--bw) solid var(--border); padding-bottom: 12px;">
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span style="${LBL} min-width: 74px;">GROUPS</span>
              ${chips}
              ${chipNewInput}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span style="${LBL}">CONDITION</span>
            ${condChips}
            <span style="${LBL} margin-left: 10px;">STATUS</span>
            ${statusChips}
            <div style="flex: 1;"></div>
            <div style="position: relative;">
              <span class="hvacc" data-c="${h(() => go({ sortMenu: !S.sortMenu }))}" style="font-size: 11.5px; color: var(--muted); cursor: pointer;">Sort: ${sortLabel} ▾</span>
              ${sortMenu}
            </div>
            <div style="display: flex; border: var(--bw) solid var(--border); border-radius: var(--radius); overflow: hidden;">
              <span data-c="${h(() => go({ view: 'grid' }))}" style="padding: 5px 10px; font-size: 12px; cursor: pointer; background: ${S.view === 'grid' ? 'var(--panel2)' : 'transparent'}; color: ${S.view === 'grid' ? 'var(--text)' : 'var(--muted)'};">▦</span>
              <span data-c="${h(() => go({ view: 'list' }))}" style="padding: 5px 10px; font-size: 12px; cursor: pointer; background: ${S.view === 'list' ? 'var(--panel2)' : 'transparent'}; color: ${S.view === 'list' ? 'var(--text)' : 'var(--muted)'};">☰</span>
            </div>
          </div>
          ${S.view === 'grid' ? grid : list}
          ${items.length === 0 ? `<div style="border: var(--bw) dashed var(--border); border-radius: var(--radius); padding: 40px; text-align: center; color: var(--muted); font-size: 13px;">No items match — clear search or filters.</div>` : ''}
        </div>`;
    }

    /* ------------------------- edit collection ------------------------- */
    if (S.screen === 'collEdit' && coll) {
      const ecTab = S.ecTab || 'general';
      const tabs = [['general', 'General'], ['groups', 'Groups & fields'], ['sharing', 'Sharing']].map(([id, label]) => {
        const active = ecTab === id;
        return `<div class="hvt" data-c="${h(() => go({ ecTab: id }))}" style="padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: ${active ? 'var(--accent)' : 'var(--muted)'}; border-bottom: 2px solid ${active ? 'var(--accent)' : 'transparent'}; margin-bottom: -1px;">${label}</div>`;
      }).join('');

      let body = '';
      if (ecTab === 'general') {
        body = `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">NAME</label><input value="${esc(coll.name)}" data-fk="ec-name" data-i="${h(e => { coll.name = e.target.value; })}" style="${INP}"></div>
            <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">DESCRIPTION</label><textarea rows="2" data-fk="ec-desc" data-i="${h(e => { coll.desc = e.target.value; })}" style="${INP} resize: vertical;">${esc(coll.desc)}</textarea></div>
            <div class="hvwbd" data-c="${h(() => { this.data = this.data.filter(c => c.id !== coll.id); this.save(); go({ screen: 'dashboard', collId: null, groupId: null, itemId: null }); this.flash('Collection deleted'); })}" style="align-self: flex-start; border: var(--bw) solid var(--border); color: var(--warn); border-radius: var(--radius); padding: 9px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer;">Delete collection</div>
          </div>`;
      }
      if (ecTab === 'groups') {
        const rows = [];
        const walkE = (pid, d) => { for (const g of childrenOf(pid)) {
          const set = new Set(subtree(g.id));
          const fields = (g.fields || []).map((fn, fi) => `<span style="display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--pill); padding: 3px 10px; font-size: 11px; color: var(--text2);">${esc(fn)}<span class="hvw" data-c="${h(() => { g.fields.splice(fi, 1); this.save(); this.flash('Field removed'); })}" style="cursor: pointer; color: var(--muted);">✕</span></span>`).join('');
          const fieldInput = S.pendingField === g.id ? `<input data-autofocus data-fk="field-${esc(g.id)}" placeholder="Field name… (Enter)" data-k="${h(e => { if (e.key === 'Enter') commitField(g, e.target); else if (e.key === 'Escape') { e.target.value = ''; go({ pendingField: null }); } })}" data-b="${h(e => commitField(g, e.target))}" style="border: 1px dashed var(--accent); background: var(--panel2); color: var(--text); border-radius: var(--pill); padding: 3px 10px; font-size: 11px; font-family: var(--fb); outline: none; width: 140px; box-sizing: border-box;">` : '';
          rows.push(`
            <div style="border-top: 1px solid var(--border); padding: 7px 0 9px; margin-left: ${d * 22}px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: var(--muted); font-family: var(--fm); font-size: 11px; width: 12px; text-align: center; flex: none;">${d ? '↳' : '●'}</span>
                <input value="${esc(g.name)}" data-fk="rename-${esc(g.id)}" data-i="${h(e => { g.name = e.target.value; })}" style="flex: 1; min-width: 0; background: var(--panel2); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 7px 10px; font-family: var(--fb); font-size: 12.5px; outline: none; box-sizing: border-box;">
                <span style="font-size: 11px; color: var(--muted); width: 56px; text-align: right; flex: none;">${coll.items.filter(i => set.has(i.group)).length} items</span>
                <span data-c="${h(() => go({ pendingGroup: { parent: g.id } }))}" style="font-size: 11.5px; font-weight: 600; color: var(--accent); cursor: pointer; flex: none;">+ Sub</span>
                <span class="hvw" data-c="${h(() => this.removeGroupNode(coll, g.id))}" style="cursor: pointer; color: var(--muted); font-size: 13px; width: 16px; text-align: center; flex: none;">✕</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 0 0 22px;">
                <span style="font-family: var(--fm); font-size: 9px; letter-spacing: 0.1em; color: var(--muted);">FIELDS</span>
                ${fields}
                ${fieldInput}
                <span data-c="${h(() => go({ pendingField: g.id }))}" style="font-size: 11px; color: var(--accent); cursor: pointer; font-weight: 600;">+ Field</span>
              </div>
            </div>`);
          walkE(g.id, d + 1);
        } };
        walkE(null, 0);
        const newRow = S.pendingGroup ? `
          <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border);">
            <span style="font-family: var(--fm); font-size: 10px; color: var(--muted); flex: none;">${esc(S.pendingGroup.parent ? '↳ IN ' + (((gById(S.pendingGroup.parent) || {}).name || '')).toUpperCase() : '● ROOT GROUP')}</span>
            <input data-autofocus data-fk="new-group" placeholder="Group name… (Enter to create, Esc to cancel)" data-k="${h(newGroupKey)}" data-b="${h(newGroupBlur)}" style="flex: 1; min-width: 0; background: var(--panel2); border: var(--bw) dashed var(--accent); color: var(--text); border-radius: var(--radius); padding: 7px 10px; font-family: var(--fb); font-size: 12.5px; outline: none; box-sizing: border-box;">
          </div>` : '';
        body = `
          <div style="${CARD} padding: 14px 16px; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8px;">
              <span style="font-family: var(--fm); font-size: 10px; letter-spacing: 0.13em; color: var(--muted);">GROUPS & SUB-GROUPS</span>
              <span data-c="${h(() => go({ pendingGroup: { parent: null } }))}" style="font-size: 12px; color: var(--accent); cursor: pointer; font-weight: 600;">+ Add group</span>
            </div>
            ${rows.join('')}
            ${newRow}
            <div style="font-size: 11px; color: var(--muted); padding-top: 10px;">Renames apply as you type. Custom fields apply to every item in the group and its sub-groups. Groups that still contain items can't be deleted — move the items first.</div>
          </div>`;
      }
      if (ecTab === 'sharing') {
        const mkRow = (m, idx) => {
          const fixed = idx === 0;
          return `
          <div style="display: flex; align-items: center; gap: 11px; padding: 9px 0; border-top: ${idx ? '1px solid var(--border)' : 'none'};">
            <span style="width: 30px; height: 30px; border-radius: var(--pill); background: var(--panel2); border: var(--bw) solid var(--border); color: var(--accent); display: grid; place-items: center; font-size: 10.5px; font-weight: 700; flex: none;">${esc(m.initials)}</span>
            <div style="flex: 1; min-width: 0;"><div style="font-size: 12.5px; font-weight: 600;">${esc(m.name)}</div><div style="font-size: 11px; color: var(--muted);">${esc(m.email)}</div></div>
            <select data-ch="${h(e => { m.role = e.target.value; this.save(); this.flash('Role updated'); })}" ${fixed ? 'disabled' : ''} style="background: var(--panel); border: var(--bw) solid var(--border); color: var(--text2); border-radius: var(--radius); padding: 6px 8px; font-family: var(--fb); font-size: 11.5px; outline: none;">
              <option value="Owner" ${m.role === 'Owner' ? 'selected' : ''}>Owner</option><option value="Editor" ${m.role === 'Editor' ? 'selected' : ''}>Can edit</option><option value="Viewer" ${m.role === 'Viewer' ? 'selected' : ''}>Can view</option>
            </select>
            <span class="hvw" data-c="${h(() => { if (fixed) { this.flash("The owner can't be removed"); return; } coll.members.splice(idx - 1, 1); this.save(); render(); this.flash('Access removed'); })}" style="cursor: pointer; color: ${fixed ? 'var(--border)' : 'var(--muted)'}; font-size: 13px; width: 16px; text-align: center;">✕</span>
          </div>`;
        };
        const memberRows = [ownerRow, ...coll.members].map((m, idx) => mkRow(m, idx)).join('');
        body = `
          <div style="display: flex; flex-direction: column; gap: 14px; max-width: 560px;">
            <div style="display: flex; gap: 8px;">
              <input value="${esc(S.shareEmail)}" data-fk="share-email" data-i="${h(e => { this.state.shareEmail = e.target.value; })}" placeholder="email@company.com" style="flex: 1; background: var(--panel2); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 8px 11px; font-family: var(--fb); font-size: 12.5px; outline: none; box-sizing: border-box; min-width: 0;">
              <select data-ch="${h(e => { this.state.shareRole = e.target.value; })}" style="background: var(--panel); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 8px 9px; font-family: var(--fb); font-size: 12.5px; outline: none;"><option value="Viewer" ${S.shareRole === 'Viewer' ? 'selected' : ''}>Can view</option><option value="Editor" ${S.shareRole === 'Editor' ? 'selected' : ''}>Can edit</option></select>
              <div data-c="${h(() => {
                const em = (this.state.shareEmail || '').trim();
                if (!em || !em.includes('@')) { this.flash('Enter a valid email'); return; }
                const nm = em.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                coll.members.push({ name: nm, email: em, initials: nm.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(), role: this.state.shareRole });
                this.save();
                go({ shareEmail: '' });
                this.flash('Invite sent ✓');
              })}" style="background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 8px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--btnsh); display: grid; place-items: center;">Invite</div>
            </div>
            <div style="${CARD} padding: 4px 16px; display: flex; flex-direction: column;">${memberRows}</div>
            <div style="${CARD} padding: 12px 16px; display: flex; align-items: center; gap: 12px;">
              <div style="flex: 1;"><div style="font-size: 12.5px; font-weight: 600;">Link sharing</div><div style="font-size: 11px; color: var(--muted); margin-top: 2px;">Anyone with the link can view this collection</div></div>
              <div data-c="${h(() => { coll.linkShare = !coll.linkShare; this.save(); render(); })}" style="width: 36px; height: 20px; border-radius: var(--pill); background: ${coll.linkShare ? 'var(--accent)' : 'var(--panel2)'}; position: relative; cursor: pointer; flex: none; transition: background 0.15s;"><span style="position: absolute; top: 2px; left: ${coll.linkShare ? '19px' : '3px'}; width: 14px; height: 14px; border-radius: var(--pill); background: var(--panel); border: 1px solid var(--border); transition: left 0.15s; box-sizing: border-box;"></span></div>
            </div>
            <div style="font-size: 11px; color: var(--muted);">Tenant-wide access rules live in <span data-c="${h(() => go({ screen: 'settings', setTab: 'access' }))}" style="color: var(--accent); cursor: pointer; font-weight: 600;">Settings ▸ Sharing &amp; access</span>.</div>
          </div>`;
      }

      main = `
        <div style="padding: 24px 30px; display: flex; flex-direction: column; gap: 16px; max-width: 720px;">
          <div data-c="${h(() => go({ screen: 'collection' }))}" style="font-size: 12.5px; color: var(--accent); cursor: pointer; font-weight: 600;">${esc(backLabel)}</div>
          <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd);">Collection settings</div>
          <div style="display: flex; gap: 2px; border-bottom: var(--bw) solid var(--border);">${tabs}</div>
          ${body}
          <div style="display: flex; justify-content: flex-end;">
            <div data-c="${h(() => { this.save(); go({ screen: 'collection' }); this.flash('Collection updated ✓'); })}" style="background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 9px 18px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--btnsh);">Done</div>
          </div>
        </div>`;
    }

    /* ------------------------- item detail ------------------------- */
    if (S.screen === 'item' && raw) {
      const wanted = raw.owned === false;
      const itemFields = [
        { k: 'YEAR', v: String(raw.year) },
        { k: 'GROUP', v: pathOf(raw.group).map(g => g.name).join(' / ') || raw.group },
        { k: 'CONDITION', v: raw.cond },
        { k: 'PURCHASE PRICE', v: money(raw.price) },
        { k: 'EST. VALUE', v: money(raw.value) },
      ];
      const customFields = fieldsFor(raw.group);
      const fieldRow = f => `<div style="display: flex; gap: 12px; padding: 7px 0; border-top: 1px solid var(--border); font-size: 12.5px;"><span style="width: 150px; flex: none; font-family: var(--fm); font-size: 10.5px; letter-spacing: 0.06em; color: var(--muted); padding-top: 1px;">${esc(f.k)}</span><span style="color: var(--text);">${esc(f.v)}</span></div>`;

      main = `
        <div style="padding: 24px 30px; display: flex; flex-direction: column; gap: 18px; max-width: 1020px;">
          <div data-c="${h(() => go({ screen: 'collection' }))}" style="font-size: 12.5px; color: var(--accent); cursor: pointer; font-weight: 600;">${esc(backLabel)}</div>
          <div style="display: flex; gap: 26px; align-items: flex-start; flex-wrap: wrap;">
            <div style="width: 380px; flex: none; display: flex; flex-direction: column; gap: 10px;">
              <div style="height: 300px; background: ${STRIPES}; border: var(--bw) solid var(--border); border-radius: var(--radius); display: grid; place-items: center; font-family: var(--fm); font-size: 11px; color: var(--muted);">img: ${esc(raw.img)}</div>
              <div style="display: flex; gap: 10px;">
                <div style="width: 74px; height: 58px; background: repeating-linear-gradient(45deg, var(--panel2) 0 6px, var(--panel) 6px 12px); border: var(--bw) solid var(--accent); border-radius: var(--radius);"></div>
                <div style="width: 74px; height: 58px; background: repeating-linear-gradient(45deg, var(--panel2) 0 6px, var(--panel) 6px 12px); border: var(--bw) solid var(--border); border-radius: var(--radius);"></div>
                <div style="width: 74px; height: 58px; background: repeating-linear-gradient(45deg, var(--panel2) 0 6px, var(--panel) 6px 12px); border: var(--bw) solid var(--border); border-radius: var(--radius);"></div>
                <div style="width: 74px; height: 58px; border: var(--bw) dashed var(--border); border-radius: var(--radius); display: grid; place-items: center; color: var(--muted); font-size: 15px; cursor: pointer;">+</div>
              </div>
            </div>
            <div style="flex: 1; min-width: 320px; display: flex; flex-direction: column; gap: 14px;">
              <div>
                <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd); line-height: 1.25;">${esc(raw.name)}</div>
                <div style="font-family: var(--fm); font-size: 11px; color: var(--muted); margin-top: 7px;">${esc(raw.tags.map(t => '#' + t).join('  '))}</div>
              </div>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="font-family: var(--fm); font-size: 10px; font-weight: 700; letter-spacing: 0.07em; color: ${wanted ? 'var(--accent)' : condColor(raw.cond)}; border: 1px solid ${wanted ? 'var(--accent)' : condColor(raw.cond)}; border-radius: var(--pill); padding: 3px 10px;">${wanted ? 'WANTED' : raw.cond.toUpperCase()}</span>
                ${showValues ? `<span style="font-size: 20px; font-weight: 700; color: var(--accent2);">${money(raw.value)}</span>` : ''}
                <span style="font-size: 11.5px; color: var(--muted);">${showValues ? (wanted ? 'market estimate' : 'paid ' + money(raw.price)) : ''}</span>
              </div>
              ${wanted ? `
              <div style="border: var(--bw) dashed var(--accent); border-radius: var(--radius); padding: 10px 14px; display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--text2);">
                <span style="flex: 1;">On your wantlist — not in your vault yet.</span>
                <div data-c="${h(() => { raw.owned = true; this.save(); render(); this.flash('Marked as owned ✓'); })}" style="background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 7px 13px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: var(--btnsh);">✓ Mark as owned</div>
              </div>` : ''}
              <div style="font-size: 13.5px; line-height: 1.65; color: var(--text2); text-wrap: pretty;">${esc(raw.desc)}</div>
              <div style="${CARD} padding: 14px 16px;">
                <div style="font-family: var(--fm); font-size: 10px; letter-spacing: 0.13em; color: var(--muted); padding-bottom: 8px;">DETAILS</div>
                ${itemFields.map(fieldRow).join('')}
              </div>
              ${customFields.length ? `
              <div style="${CARD} padding: 14px 16px;">
                <div style="font-family: var(--fm); font-size: 10px; letter-spacing: 0.13em; color: var(--muted); padding-bottom: 8px;">GROUP FIELDS · ${esc((gById(raw.group) || { name: raw.group }).name.toUpperCase())}</div>
                ${customFields.map(n => fieldRow({ k: n, v: (raw.custom.find(c => c.k === n) || {}).v || '—' })).join('')}
              </div>` : ''}
              <div style="display: flex; gap: 10px;">
                <div data-c="${h(() => this.openForm(raw))}" style="background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 8px 16px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--btnsh);">Edit item</div>
                <div class="hvwb" data-c="${h(() => { coll.items = coll.items.filter(i => i.id !== raw.id); this.save(); go({ screen: 'collection', itemId: null }); this.flash('Item deleted'); })}" style="border: var(--bw) solid var(--border); color: var(--text2); border-radius: var(--radius); padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer;">Delete</div>
              </div>
            </div>
          </div>
        </div>`;
    }

    /* ------------------------- add / edit form ------------------------- */
    if (S.screen === 'form' && coll) {
      const fFields = fieldsFor(fGroupCur).map(n => ({ k: n, v: fRaw ? ((fRaw.custom.find(c => c.k === n) || {}).v || '') : '' }));
      const formGroups = (() => { const flat = []; const walk = (pid, d) => { for (const g of childrenOf(pid)) { flat.push({ v: g.id, label: (d ? '   '.repeat(d) + '↳ ' : '') + g.name }); walk(g.id, d + 1); } }; walk(null, 0); return flat; })();
      const readVal = fk => { const el = $root.querySelector(`[data-fk="${fk}"]`); return el ? el.value : ''; };
      const saveForm = () => {
        const name = readVal('f-name').trim();
        if (!name) { this.flash('Give the item a name'); return; }
        const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
        const custom = [];
        $root.querySelectorAll('[data-cfk]').forEach(el => { if (el.value.trim()) custom.push({ k: el.dataset.cfk, v: el.value.trim() }); });
        const vals = {
          name,
          desc: readVal('f-desc').trim(),
          group: fGroupCur,
          cond: readVal('f-cond') || 'Good',
          year: Math.round(num(readVal('f-year'))) || new Date().getFullYear(),
          owned: readVal('f-status') !== 'Wanted',
          price: num(readVal('f-price')),
          value: num(readVal('f-value')),
          custom,
        };
        if (fRaw) {
          Object.assign(fRaw, vals);
          if (!vals.owned && !fRaw.tags.includes('wanted')) fRaw.tags.push('wanted');
          if (vals.owned) fRaw.tags = fRaw.tags.filter(t => t !== 'wanted');
          this.save();
          go({ screen: 'item', itemId: fRaw.id });
        } else {
          const it = { id: 'i' + Date.now(), tags: vals.owned ? [] : ['wanted'], img: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.jpg', ...vals };
          coll.items.push(it);
          this.save();
          go({ screen: 'collection' });
        }
        this.flash('Saved ✓');
      };
      const field = (label, fk, value, keep) => `
        <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">${label}</label><input value="${esc(value)}" data-fk="${fk}" ${keep ? 'data-keep' : ''} style="${INP}"></div>`;

      main = `
        <div style="padding: 24px 30px; display: flex; flex-direction: column; gap: 18px; max-width: 980px;">
          <div data-c="${h(() => go({ screen: fRaw ? 'item' : 'collection' }))}" style="font-size: 12.5px; color: var(--accent); cursor: pointer; font-weight: 600;">${esc(backLabel)}</div>
          <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd);">${esc(fRaw ? 'Edit item — ' + fRaw.name : 'Add item to ' + coll.name)}</div>
          <div style="display: flex; gap: 26px; align-items: flex-start; flex-wrap: wrap;">
            <div style="width: 300px; flex: none; display: flex; flex-direction: column; gap: 10px;">
              <div class="hva" style="height: 220px; border: var(--bw) dashed var(--border); border-radius: var(--radius); display: grid; place-items: center; text-align: center; color: var(--muted); font-family: var(--fm); font-size: 11px; line-height: 2; cursor: pointer;">⇪ drop photos here<br>or click to browse</div>
              <div style="font-size: 11px; color: var(--muted);">Up to 8 photos · first becomes the cover</div>
            </div>
            <div style="flex: 1; min-width: 360px; display: flex; flex-direction: column; gap: 14px;">
              ${field('NAME', 'f-name', fRaw ? fRaw.name : '', true)}
              <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">DESCRIPTION</label><textarea rows="3" data-fk="f-desc" data-keep style="${INP} resize: vertical;">${esc(fRaw ? fRaw.desc : '')}</textarea></div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">GROUP</label><select data-fk="f-group" data-ch="${h(e => go({ fGroupSel: e.target.value }))}" style="${SEL}">${formGroups.map(og => `<option value="${esc(og.v)}" ${og.v === fGroupCur ? 'selected' : ''}>${esc(og.label)}</option>`).join('')}</select></div>
                <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">CONDITION</label><select data-fk="f-cond" data-keep style="${SEL}">${['Mint', 'Good', 'Fair'].map(c => `<option value="${c}" ${(fRaw ? fRaw.cond : 'Good') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
                ${field('YEAR', 'f-year', fRaw ? String(fRaw.year) : '', true)}
                <div style="display: flex; flex-direction: column; gap: 6px;"><label style="${LBL}">STATUS</label><select data-fk="f-status" data-keep style="${SEL}"><option value="Owned" ${!fRaw || fRaw.owned !== false ? 'selected' : ''}>Owned — in my vault</option><option value="Wanted" ${fRaw && fRaw.owned === false ? 'selected' : ''}>Wanted — on the hunt</option></select></div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                ${field('PURCHASE PRICE', 'f-price', fRaw ? String(fRaw.price) : '', true)}
                ${field('EST. VALUE', 'f-value', fRaw ? String(fRaw.value) : '', true)}
              </div>
              <div style="background: var(--panel); border: var(--bw) solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
                <div style="font-family: var(--fm); font-size: 10px; letter-spacing: 0.13em; color: var(--muted);">GROUP FIELDS · ${esc(((gById(fGroupCur) || { name: '' }).name || '').toUpperCase())}</div>
                ${fFields.map(fc => `
                  <div style="display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; align-items: center;">
                    <span style="font-family: var(--fm); font-size: 11px; color: var(--muted);">${esc(fc.k)}</span>
                    <input value="${esc(fc.v)}" data-cfk="${esc(fc.k)}" data-fk="f-cf-${esc(fc.k)}" data-keep placeholder="—" style="background: var(--panel2); border: var(--bw) solid var(--border); color: var(--text); border-radius: var(--radius); padding: 8px 10px; font-family: var(--fb); font-size: 12.5px; outline: none; box-sizing: border-box; width: 100%;">
                  </div>`).join('')}
                ${fFields.length === 0 ? `<div style="font-size: 11.5px; color: var(--muted);">This group has no custom fields yet.</div>` : ''}
                <div style="font-size: 11px; color: var(--muted);">Fields come from the item's group — manage them in <span data-c="${h(() => go({ screen: 'collEdit', ecTab: 'groups' }))}" style="color: var(--accent); cursor: pointer; font-weight: 600;">Collection settings ▸ Groups &amp; fields</span>.</div>
              </div>
              <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 4px;">
                <div data-c="${h(() => go({ screen: fRaw ? 'item' : 'collection' }))}" style="border: var(--bw) solid var(--border); color: var(--text2); border-radius: var(--radius); padding: 9px 18px; font-size: 12.5px; font-weight: 600; cursor: pointer;">Cancel</div>
                <div data-c="${h(saveForm)}" style="background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 9px 18px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--btnsh);">Save item</div>
              </div>
            </div>
          </div>
        </div>`;
    }

    /* ------------------------- store ------------------------- */
    if (S.screen === 'store') {
      main = `
        <div style="padding: 26px 30px; display: flex; flex-direction: column; gap: 20px; max-width: 1080px;">
          <div>
            <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd);">Collection Store</div>
            <div style="font-size: 13px; color: var(--muted); margin-top: 6px;">Curated checklists — add one to your vault, then track how close you are to completing it.</div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
            ${this.storeDef.map(sd => {
              const added = this.data.some(c => c.id === sd.id);
              return `
              <div style="${CARD} overflow: hidden; display: flex; flex-direction: column;">
                <div style="height: 60px; background: ${STRIPES}; border-bottom: var(--bw) solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 16px;">
                  <span style="font-family: var(--fd); font-size: 20px; color: var(--muted);">${esc(sd.name.charAt(0))}</span>
                  <span style="font-family: var(--fm); font-size: 9.5px; letter-spacing: 0.08em; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--pill); padding: 2px 9px;">CURATED</span>
                </div>
                <div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 7px; flex: 1;">
                  <div style="font-size: 14.5px; font-weight: 700;">${esc(sd.name)}</div>
                  <div style="font-family: var(--fm); font-size: 10.5px; color: var(--muted);">by ${esc(sd.by)} · ${sd.items.length} items · ${sd.groups.length} groups</div>
                  <div style="font-size: 12px; color: var(--text2); line-height: 1.5; text-wrap: pretty;">${esc(sd.desc)}</div>
                  <div style="flex: 1;"></div>
                  <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px;">
                    <span style="font-size: 12px; font-weight: 700; color: var(--accent2);">est ${money(sd.items.reduce((x, i) => x + i.value, 0))}</span>
                    <div data-c="${h(() => this.addFromStore(sd))}" style="border: var(--bw) solid ${added ? 'var(--border)' : 'var(--accent)'}; background: ${added ? 'transparent' : 'var(--accent)'}; color: ${added ? 'var(--muted)' : 'var(--accentC)'}; border-radius: var(--radius); padding: 7px 13px; font-size: 12px; font-weight: 700; cursor: ${added ? 'default' : 'pointer'}; box-shadow: ${added ? 'none' : 'var(--btnsh)'};">${added ? '✓ In your vault' : '+ Add to vault'}</div>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    /* ------------------------- settings ------------------------- */
    if (S.screen === 'settings') {
      const tabs = [['appearance', 'Appearance'], ['plan', 'Plan'], ['access', 'Sharing & access'], ['account', 'Account & data']].map(([id, label]) => {
        const active = S.setTab === id;
        return `<div class="hvt" data-c="${h(() => go({ setTab: id }))}" style="padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: ${active ? 'var(--accent)' : 'var(--muted)'}; border-bottom: 2px solid ${active ? 'var(--accent)' : 'transparent'}; margin-bottom: -1px;">${label}</div>`;
      }).join('');

      let body = '';
      if (S.setTab === 'appearance') {
        body = `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div style="${SLBL}">THEME</div>
              <div style="font-size: 12.5px; color: var(--text2); margin-top: 5px;">Pick a style — applies instantly and is saved to your profile.</div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 14px;">
              ${themesDef.map(t => {
                const active = t.id === theme;
                return `
                <div class="hvbd" data-c="${h(() => this.setTheme(t.id))}" style="width: 208px; border: ${active ? '2px solid var(--accent)' : 'var(--bw) solid var(--border)'}; border-radius: var(--radius); background: var(--panel); box-shadow: var(--shadow); padding: 14px; cursor: pointer; display: flex; flex-direction: column; gap: 9px;">
                  <div style="display: flex; gap: 6px;">
                    ${t.colors.map(sw => `<span style="width: 24px; height: 24px; border-radius: 4px; background: ${sw}; border: 1px solid rgba(128,128,128,0.35);"></span>`).join('')}
                  </div>
                  <div style="font-size: 13.5px; font-weight: 700;">${esc(t.name)}</div>
                  <div style="font-size: 11.5px; color: var(--muted); line-height: 1.45;">${esc(t.desc)}</div>
                  <div style="font-family: var(--fm); font-size: 9.5px; letter-spacing: 0.08em; color: ${active ? 'var(--accent)' : 'var(--muted)'};">${active ? '● ACTIVE' : 'CLICK TO APPLY'}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }
      if (S.setTab === 'plan') {
        body = `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div style="${SLBL}">PLAN</div>
              <div style="font-size: 12.5px; color: var(--text2); margin-top: 5px;">${S.plan === 'pro' ? 'You are on Pro — thanks for supporting Vault.' : 'You are on Free — upgrade to unlock custom fields, photos and backups.'}</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 640px;">
              ${this.plansDef.map(p => {
                const active = p.id === S.plan;
                return `
                <div style="border: ${active ? '2px solid var(--accent)' : 'var(--bw) solid var(--border)'}; border-radius: var(--radius); background: var(--panel); box-shadow: var(--shadow); padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;">
                  <div style="display: flex; align-items: baseline; justify-content: space-between;">
                    <span style="font-family: var(--fd); font-size: 16px; font-weight: 700; letter-spacing: var(--lsd);">${p.name}</span>
                    <span style="font-size: 13px; font-weight: 700; color: var(--accent2);">${p.price}</span>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 5px;">
                    ${p.features.map(ft => `<div style="font-size: 12px; color: var(--text2); display: flex; gap: 7px;"><span style="color: var(--accent);">›</span>${ft}</div>`).join('')}
                  </div>
                  <div data-c="${h(() => { if (p.id !== S.plan) { localStorage.setItem('cc_plan', p.id); go({ plan: p.id }); this.flash(p.id === 'pro' ? 'Welcome to Pro ✓' : 'Switched to Free'); } })}" style="margin-top: 4px; text-align: center; border: var(--bw) solid ${active ? 'var(--border)' : (p.id === 'pro' ? 'var(--accent)' : 'var(--border)')}; background: ${active ? 'transparent' : (p.id === 'pro' ? 'var(--accent)' : 'transparent')}; color: ${active ? 'var(--muted)' : (p.id === 'pro' ? 'var(--accentC)' : 'var(--text2)')}; border-radius: var(--radius); padding: 8px 14px; font-size: 12.5px; font-weight: 700; cursor: ${active ? 'default' : 'pointer'}; box-shadow: ${!active && p.id === 'pro' ? 'var(--btnsh)' : 'none'};">${active ? '● Current plan' : (p.id === 'pro' ? 'Upgrade to Pro' : 'Switch to Free')}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }
      if (S.setTab === 'access') {
        const memberRow = (m, i) => `
          <div style="display: flex; align-items: center; gap: 11px; padding: 10px 0; border-top: ${i ? '1px solid var(--border)' : 'none'};">
            <span style="width: 30px; height: 30px; border-radius: var(--pill); background: var(--panel2); border: var(--bw) solid var(--border); color: var(--accent); display: grid; place-items: center; font-size: 10.5px; font-weight: 700; flex: none;">${esc(m.initials)}</span>
            <div style="flex: 1; min-width: 0;"><div style="font-size: 12.5px; font-weight: 600;">${esc(m.name)}</div><div style="font-size: 11px; color: var(--muted);">${esc(m.email)}</div></div>
            <select data-ch="${h(e => { m.role = e.target.value; this.flash('Role updated'); })}" ${m.role === 'Owner' ? 'disabled' : ''} style="background: var(--panel); border: var(--bw) solid var(--border); color: var(--text2); border-radius: var(--radius); padding: 6px 8px; font-family: var(--fb); font-size: 11.5px; outline: none;">
              <option value="Owner" ${m.role === 'Owner' ? 'selected' : ''}>Owner</option><option value="Editor" ${m.role === 'Editor' ? 'selected' : ''}>Can edit</option><option value="Viewer" ${m.role === 'Viewer' ? 'selected' : ''}>Can view</option>
            </select>
            <span class="hvw" data-c="${h(() => { if (m.role === 'Owner') { this.flash("The owner can't be removed"); return; } this.tenantDef.splice(i, 1); render(); this.flash('Access removed'); })}" style="cursor: pointer; color: ${m.role === 'Owner' ? 'var(--border)' : 'var(--muted)'}; font-size: 13px; width: 16px; text-align: center;">✕</span>
          </div>`;
        const policyRow = ([key, label, desc], i) => {
          const on = S.policies[key];
          return `
          <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: ${i ? '1px solid var(--border)' : 'none'};">
            <div style="flex: 1;"><div style="font-size: 12.5px; font-weight: 600;">${label}</div><div style="font-size: 11px; color: var(--muted); margin-top: 2px;">${desc}</div></div>
            <div data-c="${h(() => go({ policies: { ...S.policies, [key]: !on } }))}" style="width: 36px; height: 20px; border-radius: var(--pill); background: ${on ? 'var(--accent)' : 'var(--panel2)'}; position: relative; cursor: pointer; flex: none; transition: background 0.15s;"><span style="position: absolute; top: 2px; left: ${on ? '19px' : '3px'}; width: 14px; height: 14px; border-radius: var(--pill); background: var(--panel); border: 1px solid var(--border); transition: left 0.15s; box-sizing: border-box;"></span></div>
          </div>`;
        };
        body = `
          <div style="display: flex; flex-direction: column; gap: 18px; max-width: 760px;">
            <div>
              <div style="${SLBL}">TENANT MEMBERS</div>
              <div style="font-size: 12.5px; color: var(--text2); margin-top: 5px;">Everyone with access to the <span style="font-family: var(--fm);">acme-vault</span> tenant. Individual collections can also be shared from their own page.</div>
            </div>
            <div style="${CARD} padding: 4px 16px;">${this.tenantDef.map(memberRow).join('')}</div>
            <div style="${SLBL}">SHARING POLICY</div>
            <div style="${CARD} padding: 4px 16px;">${[
              ['invites', 'Members can share collections', 'Editors may invite new people to collections they can edit'],
              ['link', 'Link sharing', 'Allow view-only links for collections in this tenant'],
              ['external', 'External sharing', 'Allow sharing with people outside @airia.com'],
            ].map(policyRow).join('')}</div>
          </div>`;
      }
      if (S.setTab === 'account') {
        const totalItems = this.data.reduce((a, c) => a + c.items.length, 0);
        body = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 760px;">
            <div style="${CARD} padding: 16px 18px; display: flex; align-items: center; gap: 14px;">
              <div style="width: 44px; height: 44px; border-radius: var(--pill); background: var(--panel2); border: var(--bw) solid var(--border); color: var(--accent); display: grid; place-items: center; font-size: 15px; font-weight: 700;">MK</div>
              <div style="flex: 1;"><div style="font-size: 14px; font-weight: 700;">Marcus Keller</div><div style="font-size: 12px; color: var(--muted); margin-top: 2px;">marcus@airia.com</div></div>
              <span style="font-family: var(--fm); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--pill); padding: 3px 10px;">${S.plan.toUpperCase()}</span>
            </div>
            <div style="${CARD} padding: 16px 18px; display: flex; align-items: center; gap: 14px;">
              <div style="flex: 1;"><div style="font-size: 14px; font-weight: 700;">Data</div><div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Last backup 2h ago · ${totalItems} items</div></div>
              <div class="hva" data-c="${h(() => this.exportJson())}" style="border: var(--bw) solid var(--border); color: var(--text2); border-radius: var(--radius); padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">Export JSON</div>
            </div>
          </div>`;
      }

      main = `
        <div style="padding: 26px 30px; display: flex; flex-direction: column; gap: 22px; max-width: 1020px;">
          <div style="font-family: var(--fd); font-size: var(--h1); font-weight: 700; letter-spacing: var(--lsd);">Settings</div>
          <div style="display: flex; gap: 2px; border-bottom: var(--bw) solid var(--border);">${tabs}</div>
          ${body}
        </div>`;
    }

    /* fallback: navigating to a collection screen with no collection */
    if (!main) {
      main = `<div style="padding: 40px; color: var(--muted); font-size: 13px;">Nothing here — <span data-c="${h(() => go({ screen: 'dashboard', collId: null }))}" style="color: var(--accent); cursor: pointer; font-weight: 600;">back to Dashboard</span>.</div>`;
    }

    const toast = S.toast ? `<div style="position: fixed; bottom: 22px; right: 22px; background: var(--accent); color: var(--accentC); border-radius: var(--radius); padding: 10px 18px; font-size: 12.5px; font-weight: 700; box-shadow: var(--btnsh); z-index: 50;">${esc(S.toast)}</div>` : '';

    return `
      <div data-theme="${esc(theme)}" style="display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: var(--text); font-family: var(--fb); font-size: 13px; transition: background 0.25s, color 0.25s;">
        ${topbar}
        <div style="display: flex; flex: 1; min-height: 0;">
          ${sidebar}
          <div style="flex: 1; min-width: 0; overflow-y: auto;">${main}</div>
        </div>
        ${toast}
      </div>`;
  },
};

/* ---------- render loop with focus + scroll + value preservation ---------- */
let scrollEl = null;
function render() {
  const active = document.activeElement;
  const fk = active && active.dataset ? active.dataset.fk : null;
  const sel = fk && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const keep = {};
  $root.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.fk] = el.value; });
  const scrollTops = [];
  $root.querySelectorAll('div').forEach(el => { if (el.scrollTop) scrollTops.push([el.scrollTop, el]); });
  const mainScroll = scrollEl ? scrollEl.scrollTop : 0;

  handlers = new Map();
  hid = 0;
  $root.innerHTML = app.view();

  scrollEl = $root.querySelector('div[data-theme] > div > div:last-child');
  if (scrollEl && mainScroll && app._keepScroll) scrollEl.scrollTop = mainScroll;
  app._keepScroll = true;

  $root.querySelectorAll('[data-keep]').forEach(el => { if (el.dataset.fk in keep) el.value = keep[el.dataset.fk]; });

  if (fk) {
    const el = $root.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (el) {
      el.focus();
      if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* selects */ } }
    }
  } else {
    const af = $root.querySelector('[data-autofocus]');
    if (af) af.focus();
  }
}

/* ---------- delegated events ---------- */
const run = (attr, e) => {
  const t = e.target.closest(`[${attr}]`);
  if (!t || !$root.contains(t)) return;
  const fn = handlers.get(t.getAttribute(attr));
  if (fn) fn(e);
};
$root.addEventListener('click', e => {
  const slot = e.target.closest('.imgslot');
  if (slot) {
    const id = slot.dataset.slot;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => setSlotImage(id, input.files[0]);
    input.click();
    e.stopPropagation();
    return;
  }
  run('data-c', e);
});
$root.addEventListener('input', e => run('data-i', e));
$root.addEventListener('change', e => run('data-ch', e));
$root.addEventListener('keydown', e => run('data-k', e));
$root.addEventListener('focusout', e => run('data-b', e));
$root.addEventListener('dragover', e => { if (e.target.closest('.imgslot')) e.preventDefault(); });
$root.addEventListener('drop', e => {
  const slot = e.target.closest('.imgslot');
  if (!slot) return;
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  setSlotImage(slot.dataset.slot, file);
});
window.addEventListener('beforeunload', () => app.save());

/* ---------- boot ---------- */
app.load();
app._keepScroll = false;
render();
window.vault = app; // console access for tinkering

})();
