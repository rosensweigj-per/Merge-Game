# Harbor Merge

A mobile-first **merge-2 puzzle game** that runs in the browser. Combine matching items on a grid, fill orders for the townsfolk, and rebuild a storm-wrecked seaside town.

No build step and no dependencies: open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and open it on your phone.

## Core loop

1. **Produce & merge**: tap a producer (🪣 🧺 🪴 🧸) to spawn a level-1 item (sometimes level 2). Drag two identical items together to make the next level.
2. **Fill orders**: Cooper the beagle 🐶, Izzy the calico cat and Lexi the grey cat each hold one order slot at the top. They ask for specific items (some want two). Tap **Deliver** when you have them for coins 🪙 and XP ⭐. Gold-outlined *tool orders* also pay out 🔨 🔩 🧱.
3. **Rebuild the town**: spend coins + tools in the **Town** tab to repair and upgrade buildings. Finishing an area clears the fog over the next one and rewards gems plus a new producer.

## Players

The game opens on **Who's playing?** Each player (preset: *Me*, *Shelly* and *Livy*) has their own save, avatar and colour. The colour tints the whole game, and the player's name shows top-left, so it's always clear whose game is open. Tap the name chip to switch players. Use ✏️ to rename or change the avatar and colour, and **Add player** for more people.

Saves are stored in the browser, so players who share a device share the list. Different phones keep separate lists.

## Progress tab

- Level, XP, and town / collection / goal completion bars
- **Goals**: milestones (orders, merges, levels, areas, collection) that you claim for tools 🔨🔩🧱 and gems. A red dot on the tab means a goal is ready to claim.
- Stats: orders delivered, merges, items made, coins earned
- **Players** table comparing everyone's level, town %, items found, orders and last played
- Item collection

## Systems

| System | How it works |
| --- | --- |
| Board | 7 × 9 grid. Drag to move/swap/merge; tap to inspect, sell, or store. |
| Item chains | Seashells, Picnic, Garden (level 3), Beach Toys (level 6), 6 levels each. |
| Producers | Unlimited: tap as often as you like. Merge two of the same level to upgrade (higher chance of a level-2 item). |
| Energy | None: producing is free and unlimited. The only limit is free space on the board. |
| Gems 💎 | Pop bubbles, buy storage, daily deal. Earned from level-ups and area rewards. |
| Bubbles | A merge sometimes drops a bubbled copy of the result. Pop it with gems within 60 s or it floats away. |
| Storage | Off-board slots (drag an item onto storage or use 📦). Extra slots cost gems and double in price each time. |
| Retiring | At level 8 the Seashell chain retires: its items and producers leave the board for coins and stay in your Collection. |
| Saving | Progress auto-saves to `localStorage`. Bubbles keep ticking while the game is closed. |

## Files

- `index.html`: page layout
- `style.css`: styles (light/dark mode, phone-first)
- `js/data.js`: **all balance data** (chains, producers, orders, town costs, timers). Tune the game here.
- `js/game.js`: game state, rules, rendering, and pointer/touch input

## Not yet implemented

Time-limited events (albums, leaderboards), real-money purchases, and audio.
