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

const CHARACTERS = [
  ['🦭', 'Marlo'], ['🐧', 'Pip'], ['🦦', 'Otto'], ['🦩', 'Fern'],
  ['🐢', 'Tilly'], ['🦜', 'Rio'], ['🐻', 'Bruno'], ['🦔', 'Hazel'],
];

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
