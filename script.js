/* NOVA AI GAME MAKER: prototype planner (v2)
 * A rule-based planner. It matches keywords in your text and fills in
 * templates. It is NOT an AI model, calls no network service and needs no key.
 * Every item in the output is tagged "from prompt" (matched in your text)
 * or "template" (a default from the chosen genre template). */
'use strict';

/* ENGINE START */
const SAMPLE_DINO = "A 2D dinosaur survival game. I play a young raptor in a prehistoric valley. I must find berries and water, avoid a hunting T-Rex, and survive a day/night cycle. Hunger and thirst bars drop over time. Hiding in tall grass makes me harder to spot. Reach the safe nest after surviving 5 nights to win.";

const TEMPLATES = {
  dino: {name: 'Dinosaur survival', dim: 2, prompt: SAMPLE_DINO,
    kw: ['dinosaur', 'dino', 'raptor', 'rex', 'prehistoric', 'jurassic', 'survive', 'survival'],
    player: 'Raptor', enemies: ['T-Rex'], env: ['Valley'], items: ['Berries', 'Water'],
    base: ['survival', 'daynight', 'stealth', 'collect'],
    main: 'Valley', mainDesc: 'Open prehistoric area with a scrolling camera where the player must survive.',
    win: 'Player survives the required nights and reaches the nest', lose: 'Hunger or thirst reaches 0, or an enemy catches the player',
    pb: {2: ['PlatformerObject (or TopDownMovement)'], 3: ['3D character controller (custom)']}, eb: ['Chase player', 'Pathfinding']},
  platformer: {name: 'Platformer', dim: 2,
    prompt: "A 2D platformer where a hero runs and jumps across floating platforms, collects coins, stomps slime enemies, and reaches the flag at the end of each level. The hero has 3 lives and a checkpoint halfway.",
    kw: ['platformer', 'platform', 'jump', 'jumps', 'coin', 'flag', 'side-scroll', 'levels'],
    player: 'Hero', enemies: ['Slime'], env: ['Grassland'], items: ['Coin'], base: ['jump', 'collect', 'lives', 'checkpoint'],
    main: 'Level1', mainDesc: 'Side-scrolling level with platforms, hazards and a goal flag.',
    win: 'Player touches the goal flag', lose: 'Player loses all lives',
    pb: {2: ['PlatformerObject'], 3: ['3D character controller (custom)']}, eb: ['Patrol back and forth', 'Platform obstacle']},
  racing: {name: 'Racing', dim: 2,
    prompt: "A top-down racing game. I drive a car around a track for 3 laps against rival cars. Collecting nitro gives a speed boost. Finish first before the timer runs out to win.",
    kw: ['race', 'racing', 'racer', 'lap', 'laps', 'track', 'drift', 'car', 'speed'],
    player: 'Car', enemies: ['Rival car'], env: ['Track'], items: ['Nitro'], base: ['laps', 'boost', 'timer'],
    main: 'RaceTrack', mainDesc: 'Race circuit with start line, checkpoints and finish line.',
    win: 'Player finishes the final lap in first place', lose: 'Timer reaches 0 or player finishes behind the rivals',
    pb: {2: ['TopDownMovement (rotate + accelerate)'], 3: ['Physics3D vehicle (custom)']}, eb: ['Follow racing line', 'Pathfinding']},
  adventure: {name: 'Adventure', dim: 2,
    prompt: "A top-down adventure game. An explorer wanders a village and a dungeon, talks to villagers, finds a key to open doors, avoids guards and collects treasure to complete the quest.",
    kw: ['adventure', 'explore', 'explorer', 'quest', 'puzzle', 'treasure', 'village', 'dungeon', 'story', 'villager'],
    player: 'Explorer', enemies: ['Guard'], env: ['Village'], items: ['Key', 'Treasure'], base: ['inventory', 'dialogue', 'health'],
