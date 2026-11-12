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

## Fun tab 🎡

- **Daily tasks**: three small goals per player each day (merges, orders, orders for a certain pet, fishing...). Each one pays out coins, a tool or gems, and finishing all three opens a bonus gift. New tasks arrive at midnight.
- **Fishing at the pier**: cast (costs 1 🪱 bait), wait for the bite, then tap fast, then tap again when the marker is in the green zone. Rarer catches (Pufferfish, Sunken Chest, Shark) have shorter bite windows and smaller zones. Bait tops up to 5 every day, can drop from orders, comes with the daily bonus, and is sold in the Shop. Your fish log is shown here.
- **Family race**: everyone on this device earns ⭐ each week (merge 1, order 10, pet request +10, fish 5, daily task 15). The leader gets a 👑 on the "Who's playing?" screen, and last week's champion is shown.
- **Team goal**: one shared weekly goal (orders, merges or fish, rotating) that scales with the number of players. When the team reaches it, each player claims 15💎 + 2🧱.

## Handy touches

- **What makes this?** Tap (or hover over) any item an order asks for to see which producer makes it and the merge steps. **Show me** flashes that producer on the board.
- **Haptics**: a light tap when you merge, a stronger one for big merges, producer upgrades and deliveries. Android uses the vibration API; iPhones use a native-switch trick that works on recent iOS versions.
- **App icon**: add the game to your home screen (Share → *Add to Home Screen*) for a beach-pail icon and a full-screen app feel.

## Pet requests

Now and then Cooper, Izzy or Lexi makes an urgent request (orange card with a ⏰ timer). Fill it within 10 minutes for double coins and XP plus 2💎. Otherwise it disappears and a normal order takes its place.

## Online family sync (play on different phones)

Saves are stored in each phone's browser. To see each other's progress on different phones, connect the game to a free **Firebase** project once. After that:

1. On one phone, open the game. On **Who's playing?**, tap **Create family**. A code like `HM-ABCDE-FGHJK` appears.
2. On every other phone, tap **Join with code** and type it in. Players are matched by name, and whichever copy of a player's game has more progress is kept.
3. From then on, each phone uploads progress as you play and downloads everyone else's about every 30 seconds (and whenever you open the picker, Fun or Progress). The family race, team goal and Players table then include everyone.

Any phone can play any player. Before a game opens, its latest copy is downloaded so older progress never overwrites newer progress.

### One-time Firebase setup (about 10 minutes)

1. Go to <https://console.firebase.google.com>, click **Create a project**, name it (for example `harbor-merge`) and finish the wizard. Google Analytics isn't needed.
2. In the left menu, open **Build → Firestore Database** and click **Create database**. Pick a location near you and start in **production mode**.
3. Open the **Rules** tab, replace everything with the rules below, and click **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /families/{family} {
         allow get, create, update: if family.size() >= 14;
       }
       match /families/{family}/saves/{player} {
         allow read, create, update: if family.size() >= 14;
       }
     }
   }
   ```

4. Click the ⚙️ gear → **Project settings**. Under **Your apps**, click the **`</>`** (Web) icon, give it a nickname, and register it (skip Hosting).
5. Copy the `apiKey` and `projectId` values it shows into `js/cloud-config.js`, then commit. These two values are meant to be public. The family code is what keeps your family's data separate, so share it only with your family.

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
| Gems 💎 | Buy storage slots and the daily deal. Earned from level-ups and area rewards. |
| Storage | Off-board slots (drag an item onto storage or use 📦). Extra slots cost gems and double in price each time. |
| Retiring | At level 8 the Seashell chain retires: its items and producers leave the board for coins and stay in your Collection. |
| Saving | Progress auto-saves to `localStorage`. |

## Files

- `index.html`: page layout
- `style.css`: styles (light/dark mode, phone-first)
- `js/data.js`: **all balance data** (chains, producers, orders, town costs, timers). Tune the game here.
- `js/game.js`: game state, rules, rendering, and pointer/touch input

## Not yet implemented

Time-limited events (albums, leaderboards), real-money purchases, and audio.
