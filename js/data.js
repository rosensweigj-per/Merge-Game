// Static game data: item chains, producers, tools, characters and the town.
// All balance numbers live here so they can be tuned without touching game logic.
'use strict';

const BOARD_COLS = 7;
const BOARD_ROWS = 9;

const ENERGY_MAX = 100;
const ENERGY_REGEN_SEC = 60;          // 1 energy per minute
const START = { energy: 100, coins: 50, gems: 20, storage: 2 };

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
// Index = producer level - 1. Higher levels hold more charges, cool down faster
// and roll a level-2 item more often.
const PRODUCER_LEVELS = [
  { charges: 8,  cooldown: 90, bonus: 0.10 },
  { charges: 12, cooldown: 60, bonus: 0.25 },
  { charges: 16, cooldown: 40, bonus: 0.40 },
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
