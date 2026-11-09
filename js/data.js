// Static game data: item chains, producers, tools, characters and the town.
// All balance numbers live here so they can be tuned without touching game logic.
'use strict';

const BOARD_COLS = 7;
const BOARD_ROWS = 9;

const START = { coins: 50, gems: 20, storage: 2 };

const BUBBLE_CHANCE = 0.08;           // chance a merge also drops a bubble copy
const BUBBLE_LIFETIME_SEC = 60;

// Merge chains. Each item level is [emoji, name].
const CHAINS = {
  shell: {
    name: 'Seashells', unlock: 1, retireAt: 8,
    items: [['🐚', 'Shell'], ['🦀', 'Crab'], ['🐠', 'Fish'], ['🐙', 'Octopus'], ['🐬', 'Dolphin'], ['🐳', 'Whale']],
  },
  food: {
    name: 'Picnic', unlock: 1,
    items: [['🍞', 'Bread'], ['🥐', 'Croissant'], ['🥪', 'Sandwich'], ['🥗', 'Salad'], ['🍱', 'Bento'], ['🎂', 'Cake']],
  },
  flower: {
    name: 'Garden', unlock: 3,
    items: [['🌱', 'Sprout'], ['🌿', 'Herb'], ['🌷', 'Tulip'], ['🌻', 'Sunflower'], ['💐', 'Bouquet'], ['🌳', 'Tree']],
  },
  toy: {
    name: 'Beach Toys', unlock: 6,
    items: [['🎈', 'Balloon'], ['🪀', 'Yo-yo'], ['🪁', 'Kite'], ['🏐', 'Beach Ball'], ['⛱️', 'Parasol'], ['⛵', 'Sailboat']],
  },
};

// Producers spawn level-1 (sometimes level-2) items of their chain.
const PRODUCERS = {
  pail:   { name: 'Beach Pail',    icon: '🪣', makes: 'shell',  price: 150 },
  basket: { name: 'Picnic Basket', icon: '🧺', makes: 'food',   price: 150 },
  pot:    { name: 'Flower Pot',    icon: '🪴', makes: 'flower', price: 250 },
  chest:  { name: 'Toy Chest',     icon: '🧸', makes: 'toy',    price: 400 },
};
// Index = producer level - 1. Producers are unlimited; higher levels roll a
// level-2 item more often.
const PRODUCER_LEVELS = [
  { bonus: 0.10 },
  { bonus: 0.25 },
  { bonus: 0.40 },
];

const TOOLS = {
  hammer: { icon: '🔨', name: 'Hammer', weight: 50 },
  screw:  { icon: '🔩', name: 'Screws', weight: 35 },
  brick:  { icon: '🧱', name: 'Bricks', weight: 15 },
};

// The townsfolk who place orders. Each one owns one of the three order slots
// at the top of the board (slot 0 = Cooper, 1 = Izzy, 2 = Lexi).
const WHISKERS = (c) => `<path d="M9 40l12 1.5M9 45.5l12-1.5M55 40l-12 1.5M55 45.5l-12-1.5" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>`;
const CHARACTERS = [
  {
    id: 'cooper', name: 'Cooper', kind: 'Beagle',
    svg: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="13" cy="37" rx="8" ry="15.5" fill="#5a3418" transform="rotate(14 13 37)"/>
      <ellipse cx="51" cy="37" rx="8" ry="15.5" fill="#5a3418" transform="rotate(-14 51 37)"/>
      <ellipse cx="32" cy="31" rx="18" ry="18.5" fill="#c98b4a"/>
      <path d="M29.5 13h5l2.5 20h-10z" fill="#fff"/>
      <ellipse cx="32" cy="43" rx="11.5" ry="9" fill="#fff"/>
      <circle cx="24.5" cy="29" r="3.2" fill="#2b1a0e"/><circle cx="39.5" cy="29" r="3.2" fill="#2b1a0e"/>
      <circle cx="25.6" cy="27.9" r="1.1" fill="#fff"/><circle cx="40.6" cy="27.9" r="1.1" fill="#fff"/>
      <ellipse cx="32" cy="38.5" rx="4.4" ry="3.1" fill="#1f1f1f"/>
      <path d="M32 41.6v2.6M27.5 44.5q4.5 3.4 9 0" stroke="#1f1f1f" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M30 46.5q2 6 4 0z" fill="#f07a8a"/>
    </svg>`,
  },
  {
    id: 'izzy', name: 'Izzy', kind: 'Calico cat',
    svg: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M11 29L14 5l17 13z" fill="#e8892e"/>
      <path d="M53 29L50 5 33 18z" fill="#2b2b2b"/>
      <path d="M16 22l1-11 8 7z" fill="#f6b8c0"/><path d="M48 22l-1-11-8 7z" fill="#f6b8c0"/>
      <ellipse cx="32" cy="35" rx="20.5" ry="18" fill="#fffaf2"/>
      <path d="M12.5 33Q13 18 30 18q1 10-8 16-6 3-9.5-1z" fill="#e8892e"/>
      <path d="M37 18q13 0 15 13-8 0-12-6z" fill="#2b2b2b"/>
      <ellipse cx="24" cy="33" rx="3.4" ry="4.2" fill="#6dbb3c"/><ellipse cx="40" cy="33" rx="3.4" ry="4.2" fill="#6dbb3c"/>
      <ellipse cx="24" cy="33" rx="1.2" ry="3.4" fill="#1d1d1d"/><ellipse cx="40" cy="33" rx="1.2" ry="3.4" fill="#1d1d1d"/>
      <path d="M29.6 39.5h4.8L32 42.3z" fill="#f08a9a"/>
      <path d="M32 42.3q-2 3.2-5 2M32 42.3q2 3.2 5 2" stroke="#6b4a3a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      ${WHISKERS('#b9a99a')}
    </svg>`,
  },
  {
    id: 'lexi', name: 'Lexi', kind: 'Grey cat',
    svg: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M11 29L14 5l17 13z" fill="#8a939d"/><path d="M53 29L50 5 33 18z" fill="#8a939d"/>
      <path d="M16 22l1-11 8 7z" fill="#f2b6c2"/><path d="M48 22l-1-11-8 7z" fill="#f2b6c2"/>
      <ellipse cx="32" cy="35" rx="20.5" ry="18" fill="#a4adb7"/>
      <path d="M27 18.5q1.2 5 0 8.5M32 18v9M37 18.5q-1.2 5 0 8.5" stroke="#6c7580" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M12.5 36l6 1M12.5 31l6 2M51.5 36l-6 1M51.5 31l-6 2" stroke="#6c7580" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="32" cy="43" rx="9.5" ry="6.5" fill="#dfe4ea"/>
      <ellipse cx="24" cy="33" rx="3.4" ry="4.2" fill="#f2b233"/><ellipse cx="40" cy="33" rx="3.4" ry="4.2" fill="#f2b233"/>
      <ellipse cx="24" cy="33" rx="1.2" ry="3.4" fill="#1d1d1d"/><ellipse cx="40" cy="33" rx="1.2" ry="3.4" fill="#1d1d1d"/>
      <path d="M29.6 39.5h4.8L32 42.3z" fill="#e88a9c"/>
      <path d="M32 42.3q-2 3.2-5 2M32 42.3q2 3.2 5 2" stroke="#4f5660" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      ${WHISKERS('#f4f6f8')}
    </svg>`,
  },
];
const characterFor = (slot) => CHARACTERS[slot % CHARACTERS.length];

const xpForLevel = (lvl) => 20 + lvl * 15;

// Town areas are revealed in order; each one is fogged until the previous is complete.
// Each building has stages; each stage costs coins + tools.
const AREAS = [
  {
    id: 'dock', name: 'Harbor Dock', blurb: 'Where the ferry drops off visitors.',
    reward: { gems: 10, producer: 'basket' },
    buildings: [
      { id: 'pier', name: 'Old Pier', icon: '⚓', stages: [
        { coins: 40, tools: { hammer: 1 } },
        { coins: 100, tools: { hammer: 2, screw: 1 } },
        { coins: 220, tools: { hammer: 2, screw: 2 } },
      ] },
      { id: 'shack', name: 'Fish Shack', icon: '🛖', stages: [
        { coins: 60, tools: { hammer: 1 } },
        { coins: 140, tools: { screw: 2 } },
        { coins: 260, tools: { hammer: 2, brick: 1 } },
      ] },
      { id: 'ferry', name: 'Ferry Boat', icon: '⛴️', stages: [
        { coins: 80, tools: { screw: 1 } },
        { coins: 180, tools: { hammer: 2, screw: 1 } },
        { coins: 320, tools: { screw: 2, brick: 1 } },
      ] },
    ],
  },
  {
    id: 'market', name: 'Market Street', blurb: 'Shops, cafés and gossip.',
    reward: { gems: 15, producer: 'pail' },
    buildings: [
      { id: 'cafe', name: 'Seaside Café', icon: '☕', stages: [
        { coins: 150, tools: { hammer: 2 } },
        { coins: 300, tools: { hammer: 2, screw: 2 } },
        { coins: 500, tools: { screw: 2, brick: 2 } },
      ] },
      { id: 'florist', name: 'Florist', icon: '🏪', stages: [
        { coins: 180, tools: { screw: 2 } },
        { coins: 340, tools: { hammer: 3, brick: 1 } },
        { coins: 560, tools: { hammer: 2, screw: 2, brick: 2 } },
      ] },
      { id: 'bakery', name: 'Bakery', icon: '🥖', stages: [
        { coins: 200, tools: { hammer: 2, screw: 1 } },
        { coins: 380, tools: { screw: 3, brick: 1 } },
        { coins: 620, tools: { hammer: 3, brick: 2 } },
      ] },
    ],
  },
  {
    id: 'hill', name: 'Lighthouse Hill', blurb: 'The view from the top is worth it.',
    reward: { gems: 25, producer: 'chest' },
    buildings: [
      { id: 'lighthouse', name: 'Lighthouse', icon: '🗼', stages: [
        { coins: 400, tools: { hammer: 3, brick: 1 } },
        { coins: 700, tools: { screw: 3, brick: 2 } },
        { coins: 1100, tools: { hammer: 4, screw: 3, brick: 3 } },
      ] },
      { id: 'villa', name: 'Hilltop Villa', icon: '🏡', stages: [
        { coins: 450, tools: { hammer: 3, screw: 2 } },
        { coins: 800, tools: { hammer: 3, brick: 2 } },
        { coins: 1200, tools: { screw: 4, brick: 3 } },
      ] },
      { id: 'garden', name: 'Cliff Garden', icon: '⛲', stages: [
        { coins: 500, tools: { screw: 3, brick: 1 } },
        { coins: 900, tools: { hammer: 4, screw: 2, brick: 2 } },
        { coins: 1400, tools: { hammer: 4, screw: 4, brick: 4 } },
      ] },
    ],
  },
];

// ---------------------------------------------------------------- players
const AVATARS = ['🧑', '👩', '👨', '🧒', '👧', '👦', '🐚', '🐢', '🦭', '🐙', '🌸', '⭐', '🦄', '🐶', '🐱', '🦊'];
const PLAYER_COLORS = ['#1f8fa6', '#d0568f', '#7a5bd6', '#d9822b', '#3c9a4a', '#c0473a'];
const DEFAULT_PLAYERS = [
  { name: 'Me', avatar: '🧑', color: '#1f8fa6' },
  { name: 'Shelly', avatar: '🐚', color: '#d0568f' },
];

// ---------------------------------------------------------------- progression goals
// `get` reads the player's state and returns current progress toward `target`.
const sumValues = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);
const TOTAL_ITEMS = Object.values(CHAINS).reduce((a, c) => a + c.items.length, 0);
const TOTAL_STAGES = AREAS.reduce((a, ar) => a + ar.buildings.reduce((b, bl) => b + bl.stages.length, 0), 0);

const GOALS = [
  { id: 'orders10',  icon: '📦', text: 'Deliver 10 orders',            target: 10,  get: (s) => s.stats.orders,       reward: { tools: { hammer: 2 } } },
  { id: 'merge100',  icon: '✨', text: 'Make 100 merges',              target: 100, get: (s) => s.stats.merges,       reward: { tools: { screw: 2 } } },
  { id: 'level5',    icon: '⭐', text: 'Reach level 5',                target: 5,   get: (s) => s.level,              reward: { tools: { brick: 2 } } },
  { id: 'dock',      icon: '⚓', text: 'Restore Harbor Dock',          target: 1,   get: (s) => s.areasDone.length,   reward: { gems: 5 } },
  { id: 'prod3',     icon: '🪣', text: 'Upgrade a producer to Lv 3',   target: 3,   get: (s) => s.stats.bestProducer, reward: { tools: { hammer: 2, screw: 2 } } },
  { id: 'collect15', icon: '🔍', text: 'Discover 15 items',            target: 15,  get: (s) => sumValues(s.discovered), reward: { tools: { brick: 3 } } },
  { id: 'orders50',  icon: '📦', text: 'Deliver 50 orders',            target: 50,  get: (s) => s.stats.orders,       reward: { gems: 10 } },
  { id: 'market',    icon: '☕', text: 'Restore Market Street',        target: 2,   get: (s) => s.areasDone.length,   reward: { gems: 10 } },
  { id: 'merge500',  icon: '✨', text: 'Make 500 merges',              target: 500, get: (s) => s.stats.merges,       reward: { gems: 15 } },
  { id: 'level10',   icon: '⭐', text: 'Reach level 10',               target: 10,  get: (s) => s.level,              reward: { gems: 20 } },
  { id: 'collectAll',icon: '🏆', text: 'Complete the collection',      target: TOTAL_ITEMS, get: (s) => sumValues(s.discovered), reward: { gems: 30 } },
  { id: 'town',      icon: '🗼', text: 'Rebuild the whole town',       target: TOTAL_STAGES, get: (s) => sumValues(s.town), reward: { gems: 50 } },
];
