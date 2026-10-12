// Game Master sender for .github/workflows/game-master.yml. Built by build.mjs from tools/gm/action-entry.mjs and the game's event code.

// tools/gm/action-entry.mjs
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// src/config.js
var WORLD = Object.freeze({
  sizeX: 128,
  sizeZ: 128,
  height: 48,
  /** Blocks with y below this are under water; the water surface sits just under it. */
  seaLevel: 9,
  /** Columns whose top block reaches this height get a snow cap. */
  snowLine: 27,
  seed: 20261009
});
var PLAYER = Object.freeze({
  walkSpeed: 5.5,
  /** Peak jump height is jumpSpeed^2 / (2 * gravity) = 1.4 blocks: enough to clear one block. */
  jumpSpeed: 8.2,
  gravity: 24,
  maxFallSpeed: 40,
  halfWidth: 0.3,
  height: 1.75,
  maxHealth: 10,
  /** Seconds without being hit before health starts coming back. */
  regenDelay: 3,
  regenPerSecond: 1,
  fireInterval: 0.2,
  boltSpeed: 45,
  boltRange: 60,
  buildReach: 7,
  /** Distance from the ship's centre at which GET IN appears; the wings reach about 4 blocks out. */
  boardDistance: 6.5,
  crystalPickupRadius: 1.6,
  /** Holding JUMP in mid-air fires the jetpack for up to this many seconds; it refills on the ground. */
  jetpackFuel: 1.1,
  jetpackRefill: 1.2,
  jetpackLift: 7,
  crystalMagnetRadius: 3.5,
  /** Sitting dizzy after losing a duel, Charlie sinks this far (render/entity-views.js lowers him; his eyes follow). */
  dazedDrop: 0.45
});
var SHIP = Object.freeze({
  cruiseSpeed: 16,
  boostSpeed: 30,
  /** Radians per second at full stick. */
  turnRate: 1.5,
  maxPitch: 0.9,
  maxBank: 0.75,
  /** The ship is pushed up whenever it gets closer than this to the ground below or ahead. */
  minClearance: 3,
  /** High enough to reach the space station; see SPACE. */
  maxAltitude: 245,
  takeoffHeight: 7,
  takeoffTime: 1.5,
  /** Shortest landing; long drops (from space) take longer, at most landingSpeed blocks per second. */
  landingTime: 2,
  landingSpeed: 30,
  /** Beyond this distance from the island centre the autopilot turns the ship back. */
  flightRadius: 110,
  fireInterval: 0.14,
  boltSpeed: 85,
  boltRange: 120,
  /** Shields recover faster than on foot so dogfights stay forgiving. */
  regenPerSecond: 2,
  /** Height of the fuselage centre above the ground when parked on extended landing gear. */
  parkHeight: 1.05,
  /** Landing this close (blocks, across the ground) to the landing pad's centre counts as "landing on your pad". */
  homeLandingRadius: 12
});
var SPACE = Object.freeze({
  /** The sky starts darkening at this height and is fully black with stars at fullAltitude. */
  startAltitude: 75,
  fullAltitude: 150,
  /** In space the fog thins out so the island stays visible far below. */
  fogNear: 220,
  fogFar: 420,
  stationAltitude: 200,
  /** The station turns slowly so its power cells come round to Charlie. Radians per second. */
  stationSpin: 0.06,
  cellHealth: 4,
  turretHealth: 2,
  turretRange: 85,
  turretFireInterval: 2.6,
  turretBoltSpeed: 38,
  asteroidCount: 36,
  asteroidHealth: 2,
  /** Asteroids drift in a ring around the station between these heights. */
  asteroidLow: 150,
  asteroidHigh: 235,
  asteroidRespawn: 25
});
var ENEMY = Object.freeze({
  trooperHealth: 2,
  trooperSpeed: 2.6,
  trooperSight: 24,
  trooperRange: 16,
  trooperFireInterval: 2.2,
  trooperBoltSpeed: 13,
  /** Radians of random spread on trooper shots; they miss often on purpose (about 1 in 3 hit a still target). */
  trooperSpread: 0.1,
  fighterHealth: 3,
  fighterSpeed: 14,
  fighterTurnRate: 1,
  fighterRange: 45,
  /** Fighters fire a two-bolt volley this often; slow enough that a young pilot can shake them off. */
  fighterFireInterval: 2.6,
  fighterBoltSpeed: 42,
  fighterSpread: 0.08,
  fighterCount: 3,
  respawnDelay: 20,
  /** Troopers never respawn closer than this to the player, so they don't pop in on screen. */
  respawnMinDistance: 30
});
var TROOPER_SHOUT = Object.freeze({
  /** At most one shout this often: a fun surprise each time, never a nag. */
  cooldown: 90,
  /** If the narrator is talking when they spot him, the shout waits this long for it to finish, then is dropped. */
  window: 4
});
var BAD_GUY_MODE = Object.freeze({
  /** Troopers who follow him on foot: the four that roam the island in the hero's game. */
  squadSize: 4,
  /**
   * Where they walk beside him: [angle from where the camera looks (radians), blocks out]. Ahead-left, ahead-right,
   * left and right, so none stands between him and the over-the-shoulder camera 5.2 behind him.
   */
  squadSlots: Object.freeze([[0.9, 3.5], [-0.9, 3.5], [1.8, 4], [-1.8, 4]]),
  /**
   * While a duel is on they step out of the way to watch: [angle from the way to the duelist (radians, positive to
   * Charlie's left), blocks from him]. Beside and a little behind him (105 and 135 degrees round), so none stands where
   * he and the duelist fight, nor in the view over his shoulder (the camera looks at the duelist from 5.2 behind him,
   * about 50 degrees either side): the nearer two are 63 degrees round from it, 7.6 blocks away.
   */
  watchSpots: Object.freeze([[1.83, 7], [-1.83, 7], [2.36, 7], [-2.36, 7]].map(Object.freeze)),
  /**
   * Once a watching trooper is within watchPlant blocks of its place it stays put there for the rest of the duel (so
   * none walks across the picture when the duelist lands or steps about), unless that place comes within watchRing
   * blocks of the line from Charlie to the duelist (where they fight: a little more than the 1.5 a body and a swing
   * need), into the camera's way (viewKeepOut), or further than watchLeash from Charlie (twice the watching distance:
   * he has moved on).
   */
  watchPlant: 1.5,
  watchRing: 2.5,
  watchLeash: 14,
  /**
   * From its watching place a squad trooper fires at the duelist while the sword fight is on (their shots bounce off
   * his blade: the sword decides the duel), but only along a line of fire at least this far (blocks, across the ground)
   * from Charlie and from the camera. Its shots stray up to a block either way at the duelist (entities/trooper.js
   * MIN_MISS) and Charlie stands well along the line, so none flies through him (half a block wide) or the lens.
   */
  duelShotClearance: 1.5,
  /** Each of Charlie's sword hits on the duelist, his squad cheers this long (seconds, both arms up, holding fire). */
  cheerTime: 0.9,
  /** A squad trooper further than this from its place runs, this many times a trooper's walk (2.6 x 1.8 = 4.7, still under Charlie's 5.5). */
  catchUpBeyond: 8,
  catchUpFactor: 1.8,
  /** Further than this from Charlie (he landed across the island), a squad trooper waits at the pad instead. */
  joinRadius: 60,
  /**
   * A squad trooper further than rejoinBeyond blocks from Charlie for rejoinAfter seconds on end (stuck under a tree on
   * the way, or left behind) catches up out of his sight: it steps in from behind the camera and walks up to him.
   */
  rejoinBeyond: 12,
  rejoinAfter: 6,
  /**
   * The camera's way, which no squad trooper stands in (fighting the good guys they go where their foes are, and would
   * walk across his view): the half circle of `radius` blocks in front of the camera (nearer than that a trooper looks
   * bigger than Charlie 5.2 away and hides much of the picture) and `half` blocks either side of its line of sight up to
   * Charlie (a trooper's width and a little more, so none stands over him). One in it steps aside at viewSidestep
   * blocks a second, quicker than a trooper's walk, so it is out of the way in a moment.
   */
  viewKeepOut: Object.freeze({ radius: 3, half: 1.2 }),
  viewSidestep: 5,
  /**
   * Their places round the landing pad ([x, z] blocks from its centre, world axes), on the pad's level ground about 7.6
   * out: two behind the parked ship's tail (its nose points along +x, toward the island's middle) and two round its far
   * side. So they stand guard outside its footprint, 8 to 13 from his spawn (at +5.5 z) and at least 11 from the camera
   * over his shoulder there (5.2 further back), where none can block his first look at his ship; inside the pad's
   * tree-free circle (world-gen plants nothing within 12); and at least 34 from every good-guy outpost on the shared
   * layout, so the soldiers (sight 22, standing up to 2.5 off their point and wandering 5) never see the squad there.
   */
  padSlots: Object.freeze([[-7.3, 2], [-7.3, -2], [-3.8, -6.6], [1.3, -7.5]]),
  /** Fights between his team and the good guys happen only this close to Charlie (on foot, flying), so the island is calm where he isn't. */
  skirmishRange: 40,
  airSkirmishRange: 90,
  /** A trooper or good guy looks again for the nearest foe this often (seconds): light on the tablet, quick enough to feel alive. */
  retargetEvery: 0.3,
  /** Good guys go for Charlie this much more readily than for a trooper at the same distance (multiplies his distance). */
  charliePreference: 0.75
});
var GOOD_GUYS = Object.freeze({
  /** Added to the planet's seed for their own dice: far from every stream in use (+3, +5, +11 and up, +23), so nothing else's rolls move. */
  seedOffset: 1009,
  /** An outpost is a roam point at least this far from the landing pad: the soldiers there (sight 22) never see his squad waiting at the pad. */
  outpostClearance: 32,
  /** Soldiers at each outpost, and where each stands from its point (blocks): a fair fight for Charlie and his squad of four. */
  soldiersPerOutpost: 3,
  outpostSpots: Object.freeze([Object.freeze([0, 0]), Object.freeze([2.5, 1.5]), Object.freeze([-2, 2.5])]),
  /** Gentler than a trooper (who fires every 2.2 s with a spread of 0.1): a team fight, not a storm. */
  soldier: Object.freeze({ health: 2, speed: 2.5, sight: 22, range: 15, fireInterval: 2.6, boltSpeed: 13, spread: 0.12 }),
  /** As the troopers' fighters, a touch slower to fire. */
  fighter: Object.freeze({ count: 3, health: 3, speed: 14, turnRate: 1, range: 45, fireInterval: 2.8, boltSpeed: 42, spread: 0.09 }),
  /** Their starfighters circle this high over the roam point farthest from the troopers' base: the good guys' side of the island. */
  fighterAltitude: 30
});
var BASE_ARRIVAL_RADIUS = 40;
var TOAST = Object.freeze({ seconds: 2.6, tipFactor: 1.6 });
var UNLOCK_POPUP = Object.freeze({
  /** Long enough to see the prize and read its name, short enough never to get in the way of play. */
  show: 2.6,
  /** A breath between two pop-ups that happen together, so each one reads as new. */
  gap: 0.35
});
var RENDER = Object.freeze({
  fov: 70,
  fogNear: 45,
  fogFar: 115,
  maxPixelRatio: 1.5,
  /** Adaptive resolution never drops below this fraction of the device pixel ratio. */
  minResolutionScale: 0.55,
  /** Chunk remeshes allowed per frame; extra edits wait so one big blast never stalls a frame. */
  remeshBudget: 2,
  /**
   * Chunks further than fogFar times this are not drawn. Fog works on view depth, which at the screen edge is
   * about 0.7 of the true distance, so the margin keeps edge chunks from popping out while still fogged.
   */
  cullFactor: 1.4
});
var ROBOTS = Object.freeze({
  /** The first drop ship comes 60 to 90 seconds after free play starts, so Charlie has time to look around first. */
  firstDropDelay: 60,
  firstDropJitter: 30,
  /** After that, one every 2.5 to 4 minutes: often enough to be exciting, rare enough to still build in peace. */
  dropInterval: 150,
  dropJitter: 90,
  /** A drop that can't start (nowhere clear to land, the last drop ship still out) tries again after this long. */
  retryDelay: 8,
  /** No drop ship starts this soon after a knockout. */
  knockoutQuiet: 20,
  squadMin: 4,
  squadMax: 6,
  /** The smallest squad worth sending; with fewer free places a drop waits instead. */
  squadFloor: 2,
  /** Never more than this many robots on their feet at once; a squad is cut short to fit (summons: maxAliveSummoned) */
  maxAlive: 8,
  /** Blocks from Charlie a drop ship may land: close enough to watch, never on top of him. */
  landMin: 18,
  landMax: 30,
  /** With nowhere clear that close (a wood, a small island), a wider ring is tried before the drop waits. */
  landFallbackMin: 12,
  landFallbackMax: 44,
  /** Blaster hits a robot takes: some fall apart after one, the rest after two. One sword swing (2) always does it. */
  healthMin: 1,
  healthMax: 2,
  /** Slower than a trooper (2.6): a stiff little march. */
  speed: 2.2,
  /** Robots stop and shoot from about this far away. */
  holdDistance: 11,
  /** A robot walking home turns back to fight when Charlie comes this close. */
  sight: 22,
  /** Slow and well spaced, like the troopers' (2.2): robots are fodder, not a threat. */
  fireInterval: 3.4,
  /** Seconds a robot holds its glowing blaster up before it fires: time to see the shot coming and step aside. */
  aimTime: 0.9,
  /**
   * A squad fires at most one bolt this often, so even eight robots are a light rain, never a storm. Every scheduled
   * drop's robots count as one squad; each summoned drop ship's robots are a squad of their own.
   */
  squadShotGap: 0.8,
  /**
   * However many squads are about, all their robots together start at most one shot this often (two a second): a
   * summoned fleet is busier than one squad but never a storm. Shorter than squadShotGap, so one squad alone never
   * waits on it. (Soaked with Charlie standing still among summoned fleets back to back, it cut his knockouts from
   * 4 to 1.5 per ten minutes; a lone squad of eight: 0.5.)
   */
  fleetShotGap: 0.5,
  boltSpeed: 10,
  /** Radians of random spread; wider than a trooper's (0.1), so they miss often on purpose. */
  spread: 0.15,
  /** Robots only shoot at the starfighter when it flies this close and this low, and less often than on foot. */
  shipRange: 30,
  shipLowAltitude: 16,
  shipFireFactor: 2,
  /**
   * How long a robot fights before it marches off home, picked for each robot between these (seconds), so a squad
   * never lays siege to a Charlie who is building or walking about; the squad also leaves sooner (core/robot-brain.js,
   * idleLimit) when nobody is fighting it.
   */
  stayMin: 45,
  stayMax: 60,
  /** Hits that blast a drop ship apart for a bonus explosion, once its squad is out (it is shielded until then). */
  dropShipHealth: 5,
  /**
   * Drop ships out at once. Scheduled drops only ever fly one; a summon (RobotDrops.summon, for the Game Master
   * remote) sends more. Three is the most the Fire HD 10 tablet draws smoothly together with their squads.
   */
  fleetMax: 3,
  /** A summoned fleet may bring the robots on their feet up to this many; scheduled drops still stop at maxAlive. */
  maxAliveSummoned: 12,
  /**
   * Seconds a summon waits for drops to be allowed (a boss fight over, Charlie back down from space, a knockout's
   * quiet over) and for somewhere to land or hover, before it quietly gives up on the ships it has not sent.
   */
  summonPatience: 90,
  /**
   * A summoned drop ship with nowhere clear to land hovers instead (core/hover-site.js), this many blocks from
   * Charlie, and its robots jump down: so a summon arrives together even round the wooded landing pads.
   */
  hoverMin: 14,
  hoverMax: 44,
  /** Summoned drop ships set off this many seconds apart, so each one is seen and heard coming in. */
  summonStagger: 0.6,
  /**
   * A summoned drop ship with nowhere clear to land, or no room for its robots, looks again this often (seconds).
   * Each look surveys a few thousand columns, so it is kept well apart on the tablet.
   */
  summonRetry: 3
});
var TOWER_GOAL = 8;
var FREE_ROAM = Object.freeze({
  /**
   * The troopers rebuild their generator this long after its last block was blasted: long enough to enjoy the
   * crater and fly off somewhere else, short enough that it stands again on his next trip to the base.
   */
  generatorRebuild: 150,
  /** A new space station is in orbit this long after the last one blew up: about one trip down to land and back up. */
  stationRebuild: 180,
  /**
   * A picked-up crystal grows back in its own spot after this long. Slow enough that collecting still feels like
   * finding something, fast enough that torpedoes (a crystal each) never run out for good: every one of a planet's
   * 26 crystals is back three minutes after it was picked up.
   */
  crystalRegrow: 180,
  /**
   * Nothing is rebuilt or regrown within this many blocks of Charlie or his parked ship, so a crystal never pops
   * into his hands and generator blocks never appear on top of him.
   */
  rebuildClearance: 10,
  /** The new station only appears while Charlie is further than this from it: beyond its turrets' 85-block range. */
  stationClearance: 100,
  /** The giant walker comes out after this much play on a planet (6 minutes), unless a tall tower calls it sooner. */
  walkerFirstVisit: 360,
  /** After Charlie beats the walker it comes back this long later (10 minutes): a treat now and then, never a pest. */
  walkerReturn: 600,
  /**
   * A walker nobody hits strides off after this much time out (3 minutes; every hit starts the count again), once it
   * is out of Charlie's sight and out of reach of him: it rests, then comes back. Without this an ignored walker
   * stayed all session and held up the drop ships, the Dark Lord and live updates.
   */
  walkerLeaveAfter: 180,
  /**
   * Once it is due to leave it steps away from Charlie and stops shooting (it never strolls on near him), and goes the
   * moment he can't see it. If it is still within reach of him this much longer (a minute and a half) it goes as soon
   * as he can't see it even so: no visit lasts for ever.
   */
  walkerLeaveGrace: 90,
  /** A hit on a walker counts as a fight this long (seconds), even when Charlie is shooting from far away. */
  walkerEngagedFor: 20,
  /**
   * A visiting walker's weak spots take this many times their kind's usual hits (core/walker-types/). At 1 the ship's
   * lasers brought one down in about three seconds; at 3 it is a proper fight that still never drags on.
   */
  walkerToughness: 3,
  /**
   * A tower that beats Charlie's record is cheered again at most this often (a minute), so stacking block after
   * block on a tall tower, or building a tall wall, doesn't repeat "What an awesome tower!" over and over.
   */
  towerCheerCooldown: 60
});
var BOLT_COLORS = Object.freeze({ hero: 16726827, enemy: 4718426, good: 4029951, torpedo: 6281471 });
var TORPEDO = Object.freeze({
  cost: 1,
  speed: 48,
  range: 150,
  damage: 5,
  /** Blocks within this radius break and enemies within it are caught in the explosion. */
  blast: 3,
  cooldown: 0.8
});
var DUEL = Object.freeze({
  // When he comes (core/duel-schedule.js).
  /**
   * Seconds with no announcement, landing, boarding or knockout before he swoops in, so voices never overlap. Only
   * those restart the count: hopping off a ledge or walking past the ship just holds him back for a moment.
   */
  quietNeeded: 8,
  /** Charlie must have stood on the ground this long, so he never arrives mid-jump. */
  groundedFor: 0.5,
  /**
   * He waits until Charlie has walked away from his parked ship: out of its footprint (core/ship-footprint.js) scaled
   * by 1.5 (a value of 1.5 squared), about 8 blocks along it and 7 across. A duel needs room, and GET IN would end it.
   */
  shipRoom: 2.25,
  /** He waits while Charlie has fewer hearts than this (out of 10). */
  minHealth: 6,
  /** With no good spot in front of the camera, try again this often (the camera has usually turned by then). */
  spotRetry: 2,
  /**
   * Free roam: seconds of on-foot play on a planet before his first visit there (unless summoned sooner). They add up
   * across visits: the save keeps the count (`roamed`), so a child who hops between planets still meets him.
   */
  freeRoamFirstDelay: 150,
  /**
   * Free roam: a robot squad alive this close to Charlie makes him wait until it is cleared (the game counts the
   * robots within this radius into the duel context's robotsNearby).
   */
  robotRadius: 40,
  /** Seconds of live play before he returns, by how the last duel ended. */
  returnAfter: Object.freeze({ lost: 120, retreat: 180, won: 600, abort: 30 }),
  /** Free roam: after Charlie wins, the rematch comes this long later (with missions on he never comes back). */
  rematchAfterWin: 720,
  /** Troopers hold their fire from his arrival until this long after he has gone. */
  holdFireAfter: 2,
  // The arrival and leaving timelines (systems/duel-cinematics.js).
  /** The arrival never lasts longer than this: whatever happens, the duel starts. */
  arrivalMax: 16,
  shuttleFlight: 2.4,
  /** A rematch skips the long fly-in and the salute. */
  rematchFlight: 1.6,
  /** The shuttle's fins fold up over the last part of its fly-in. */
  wingFoldTime: 0.8,
  hatchTime: 0.3,
  fallTime: 0.9,
  landTime: 0.6,
  /** Seconds after landing until the saber snaps on, then until he points and speaks. */
  igniteAfter: 0.6,
  lineAfter: 0.4,
  igniteTime: 0.35,
  pointTime: 1.5,
  saluteTime: 0.6,
  /** Beaten, he bows before the shuttle comes for him. */
  bowTime: 0.6,
  /** The shuttle climbs away after dropping him and is gone this long after he lands. */
  shuttleAway: 1.5,
  /** Mechanical breathing, every this many seconds from the moment the saber lights. */
  breathEvery: 3.4,
  /** A spoken line holds the stage this long unless the voice reports its real length (then plus linePad). */
  lineDefault: 4,
  linePad: 0.3,
  lineMin: 2.5,
  lineMax: 7,
  /** Endings: he kneels (won) or raises his saber (lost) for at least this long, plus his line, then bows or waves. */
  wonStage: 3.5,
  lostStage: 3,
  saberOffAt: 0.3,
  saberOffTime: 0.4,
  defeatedLineAt: 0.5,
  victoriousLineAt: 0.3,
  waveTime: 0.8,
  /** Leaving: the shuttle comes back from the side, he leaps up, and it waves its fins goodbye and zooms off. */
  pickupFlight: 1.2,
  leapTime: 0.8,
  departTime: 2,
  pickupDistance: 30,
  departDistance: 60,
  departClimb: 20,
  // The shuttle's route (core/duel-spot.js). The shuttle's position is the middle of its hull.
  shuttleStart: 40,
  /** The shuttle cruises this far above the highest ground on its way in. */
  cruiseClearance: 6,
  /**
   * Its hull hovers this high over his landing spot (so his feet start about 11 above it), and at least
   * hoverClearance above the highest ground under its wings.
   */
  hoverHeight: 14,
  hoverClearance: 4,
  /** The shuttle's straight-line flights keep at least this far above the ground under them (its hull is 2 tall). */
  routeClearance: 3,
  /** Its wings reach about 4.6 blocks to each side in flight: the ground is checked this far round its path. */
  shuttleSpan: 5,
  /**
   * Where he steps off, and leaps back onto, the shuttle's lowered ramp: his feet this far below the middle of its
   * hull and this far ahead along its heading (render/models/dark-shuttle-model.js puts the ramp's tip just behind).
   */
  shuttleDrop: Object.freeze({ below: 3.05, ahead: 1.56 }),
  // Where he lands (core/duel-spot.js): in front of the camera, on open ground Charlie can walk to.
  spotDistances: Object.freeze([9, 8, 10, 7, 11]),
  spotYawOffsets: Object.freeze([0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]),
  /** With nowhere in front (Charlie facing the sea), anywhere round him will do: the camera turns to watch. */
  spotWideOffsets: Object.freeze([1.6, -1.6, 2, -2, 2.4, -2.4, 2.8, -2.8, Math.PI]),
  /**
   * With nowhere at spotDistances in any direction (Charlie stands on a slope or a rise, where everything at the usual
   * distance is too high, too bumpy or treetop), he tries these instead, nearer and further out by turns, and the 3x3
   * patch under him may be spotFallbackFlatness off level. Only well away from the ship: its footprint value
   * (core/ship-footprint.js) at least spotFallbackFromShip, about 11 blocks along the nose and 9 across. The open-sky
   * rule stays as it is: opening it to 10 blocks found no more places.
   */
  spotFallbackDistances: Object.freeze([6, 13, 5, 15]),
  spotFallbackRise: 2,
  spotFallbackFlatness: 2,
  spotFallbackFromShip: 4,
  spotEdgeMargin: 2,
  /**
   * His feet within this many blocks of Charlie's (a slash reaches 1.5 up or down, so a spot one off is in reach from the
   * start; the fallback allows two), and the 3x3 patch under him this level.
   */
  spotMaxRise: 1,
  spotFlatness: 1,
  /** Open sky above his landing spot, so the drop from the shuttle is clear. */
  spotSky: 14,
  /** Footprint value (core/ship-footprint.js) he lands outside of: half again the ship's own ellipse. */
  spotShipClearance: 1.5,
  spotTrooperClearance: 3,
  /** The straight path to Charlie is checked this often: dry, no step over one block, room to walk. */
  pathSample: 0.75,
  // His body (entities/dark-lord.js): about 1.25 times as tall as Charlie.
  halfWidth: 0.4,
  height: 2.4,
  chest: 1.5,
  /** Hit radius around his chest for the sword and for bolts (they bounce off his saber). */
  radius: 0.95,
  // The duel (core/duel-rules.js).
  /** Under half of Charlie's walk (PLAYER.walkSpeed 5.5), so Charlie can always get away. */
  walkSpeed: 2.4,
  /**
   * He walks up to this far from Charlie and stops; a lunge or a leap toward Charlie is stopped here too, so he is
   * never carried onto him.
   */
  stopDistance: 2.6,
  /** Closer than this across the ground their bodies overlap: he walks straight out (his half width plus Charlie's, and a little). */
  bodyGap: 0.9,
  /**
   * Charlie's own walk stops this far (across the ground) from the Dark Lord's middle, so neither camera ends up
   * inside his body: more than the camera's sphere around him (1.2, modes/foot-mode.js) plus the over-the-shoulder
   * camera's sideways shift (0.55, render/camera-rig.js). A sword still reaches him from here (SWORD reach 3.6).
   */
  charlieKeepOut: 1.8,
  /**
   * With Charlie lower than a slash reaches (slashHeight: down a slope, in a ditch), he closes in to this distance
   * instead, to meet him on level ground. After heightMissLimit strikes in a row that missed only because Charlie was
   * too low, he steps back (stepBack) instead of lunging, and tries again.
   */
  closeInDistance: 1.1,
  heightMissLimit: 2,
  stepBack: Object.freeze({ distance: 3, time: 0.5 }),
  turnRate: 6,
  /**
   * His attack timer only counts down while Charlie is this close, or while something (a low branch, the shore)
   * has stopped him walking closer for stuckTime with Charlie within approachBeyond: then he swings from where he
   * is, misses, and is open, so Charlie always gets a prompt.
   */
  attackRange: 3.2,
  /** Extra stalking time before the first attack, so Charlie can find his feet. */
  firstAttackDelay: 0.8,
  /** Wants to move but slower than stuckSpeed for stuckTime: he leaps toward Charlie (if more than 4 away). */
  stuckSpeed: 0.3,
  stuckTime: 1.5,
  stuckLeapDistance: 4,
  leapSpeed: 11,
  /** He never walks into a column this far below sea level, or deeper into the parked ship than this footprint. */
  waterDepth: 1,
  shipKeepOut: 1.1,
  // Tuning bases; core/duel-rules.js duelTuning() scales them by calm (1..2) and late (after lateAfter seconds).
  stalkPause: 1.2,
  windup: 1,
  windupMax: 2.4,
  /** Each lost duel makes the next one's wind-ups this much longer. */
  windupPerLoss: 0.15,
  /** The very first wind-up on a planet is a slow lesson, twice the normal, up to this long; its strike lands short. */
  lessonWindupMax: 4,
  strikeDamage: 1.5,
  pushCharge: 1.4,
  /** Opening lengths by what caused them, before calm scaling. A Bleep zap gives the longest. */
  openings: Object.freeze({ clash: 1.6, whiff: 1.2, guardBreak: 1.2, tired: 1.4, shoved: 1, bleep: 2 }),
  armour: 5,
  minArmour: 3,
  /** At calm this high (Charlie has been struggling) he wears one pip less armour. */
  hardCalm: 1.75,
  /** From this many seconds into a duel he tires: longer wind-ups (lateWindup) and openings (lateOpening). */
  lateAfter: 120,
  lateWindup: 1.3,
  lateOpening: 1.5,
  /** His yaw follows Charlie for this fraction of a wind-up, then locks, so stepping aside makes him miss. */
  windupTrack: 0.6,
  strikeTime: 0.25,
  /** A sword swing this early in his strike still clashes (a late parry). */
  lateParry: 0.15,
  strikeRecover: 0.7,
  hitRecover: 0.8,
  /** The red arc: reach, half-angle (radians) and how far above his feet it still catches Charlie. */
  slashReach: 3.3,
  slashHalfArc: 1.22,
  slashHeight: 1.5,
  whiffLunge: 1.2,
  whiffTime: 0.3,
  hitPushBack: 1.5,
  hitPushTime: 0.25,
  clashPushBack: 0.5,
  clashPushTime: 0.15,
  /** The third sword hit in a row on his guard breaks it. */
  guardBreakBlocks: 3,
  flickTime: 0.25,
  hitFlash: 0.15,
  /**
   * The gold ring under him in an opening, and the violet ring as he charges a push: wide enough to show round
   * Charlie, who stands about stopDistance away, so it never hides behind him.
   */
  openingRing: 1.2,
  pushChargeRing: 3.2,
  /**
   * A blaster bolt bounces off his saber as a harmless hero bolt (damage 0 chips blocks but never breaks one):
   * steeply up and away from Charlie, alternating to either side, gone within a few blocks.
   */
  ricochet: Object.freeze({ speed: 30, range: 10, pitch: Math.PI / 3, side: 35 * Math.PI / 180 }),
  halfwayMin: 1.5,
  halfwayMax: 4,
  halfwayStep: 1,
  /** The push wave's front grows from pushStart to pushReach blocks over pushTime. */
  pushTime: 0.6,
  pushStart: 1,
  pushReach: 9,
  /** SWORD is the advice in a wind-up within clashReach, and in an opening within swordReach; beyond approachBeyond, walk closer. */
  clashReach: 4.4,
  swordReach: 3.4,
  approachBeyond: 6,
  /** JUMP is the advice in the last this many seconds of a push charge. */
  jumpWarning: 0.5,
  /** Knockbacks: initial speed, lift and seconds of sliding with no control. Each slides Charlie 2 to 3 blocks (block: 1). */
  strikeKnock: Object.freeze({ speed: 7, lift: 3, seconds: 0.35 }),
  blockKnock: Object.freeze({ speed: 4, lift: 1, seconds: 0.25 }),
  pushKnock: Object.freeze({ speed: 6, lift: 5, seconds: 0.5 }),
  /**
   * About how far the strongest knockback slides Charlie. One that would land him closer to the parked ship than the
   * duel was allowed to start (shipRoom), where GET IN shows and the Dark Lord cannot follow, is bent aside to keep clear.
   */
  knockReach: 3,
  /** The strike that would leave Charlie with this many hearts or fewer ends the duel instead: no knockout, ever. */
  lossHealth: 1,
  /**
   * This many strikes landing in a row, with Charlie never answering (a clash, a block or a hit with the sword in
   * between), also end the duel as lost, at any difficulty. His hearts come back between slow strikes, so without it a
   * Charlie who never uses the sword could not lose, and an easier rematch would only make his duel longer.
   */
  unansweredStrikes: 6,
  dazeTime: 2.5,
  /** Once per duel, at this many hearts or fewer, Bleep zaps the Dark Lord and gives Charlie an opening. */
  bleepHealth: 3,
  /** Beating him pays this many crystals (game/duel-director.js); the first win anywhere also gives the rainbow sword. */
  winCrystals: 5,
  /** After a lost duel Charlie's hearts refill and he is safe this long, like after a knockout but with no trip home. */
  lostShield: 5,
  // Exits: an encounter always ends.
  leashDistance: 30,
  leashTime: 4,
  unreachableHeight: 2.5,
  unreachableTime: 10,
  contactDistance: 6,
  noContactTime: 15,
  /** Dueling this long with no blow landed, clashed or blocked either way also ends it (they can't reach each other). */
  noExchangeTime: 25,
  timeout: 180,
  /** He is lost (fell in the sea or a hole) below sea level minus sunkDepth for sunkTime, or below voidY. */
  sunkDepth: 2,
  sunkTime: 3,
  voidY: -4,
  /** Walking away within this distance gets his "Leaving already?" line. */
  retreatLineDistance: 20,
  /**
   * He says "Leaving already?" for a stalemate (out of reach, no contact) only if Charlie caused it: his own walking,
   * jetpack or climbing took him this many blocks further from the Dark Lord than his strike (attackRange) reaches.
   * Otherwise (knocked aside, a branch or the shore stopped the Dark Lord) it ends with the neutral "flew away" line.
   */
  walkedAway: 2
});
var REMOTE_EVENTS = Object.freeze({
  /** How often a game on screen and online looks at events.json: quick enough to feel live, light on the site. */
  pollMs: 1e4,
  /**
   * With a surprise server in the build, how often the game asks it for surprises: a tap on Zach's phone shows up
   * within a few seconds, and two tablets polling all day stay far inside the server's free daily allowance.
   */
  endpointPollMs: 5e3,
  /** A server look gives up after this long (under endpointPollMs, so a stuck request never holds up the next). */
  endpointTimeoutMs: 4e3,
  /** While the server answers, events.json is only the backup: it is read this rarely (it rebuilds slowly anyway). */
  backupPollMs: 3e4,
  /** The server counts as answering when its last good reply came at most this long ago (three missed looks). */
  serverQuietMs: 15e3,
  /** The first look waits for loading to settle. */
  firstPollMs: 4e3,
  /** How often queued events are looked at to see whether one may run now. */
  tickMs: 500,
  /**
   * A game no longer takes in an event sent longer ago than this, even before it expires, so a game reopened later
   * never replays old surprises. The site's rebuild (about a minute) plus a pause fits easily.
   */
  maxAgeMs: 15 * 60 * 1e3,
  /** How long an event sent from tools/gm.mjs stays worth taking in (its expiresAt). */
  lifetimeMs: 10 * 60 * 1e3,
  /**
   * Once the game has taken an event in (it was fresh then), it keeps it this long, stale or not, waiting for its
   * moment, so a long Dark Lord duel, a walker fight or a pause for a snack can't make a surprise quietly expire. Half
   * an hour covers those easily, and a surprise still lands while Zach remembers sending it. Twice maxAgeMs, so by
   * then the event is too old to be taken in again (it is also remembered as given up on).
   */
  holdMs: 30 * 60 * 1e3,
  /**
   * events.json keeps only this many of the newest events: more than a busy evening's worth of taps (an older one
   * dropping off the list still plays where it is already waiting), small enough to fetch every 10 seconds.
   */
  keepEvents: 40,
  /** At most this many events run in any minute, and at least minGapMs apart, so a burst of taps can't swamp play. */
  maxPerMinute: 6,
  minGapMs: 3e3,
  /**
   * Event ids remembered as already run on this device: two lists of keepEvents events (the server's and the site's),
   * each a combo of up to GAME_MASTER.combo.maxSteps steps, are never forgotten while still fresh (40 × 8 × 2 = 640).
   */
  rememberIds: 700,
  /** A Message from Dad card stays this long, and holds at most this many characters. */
  messageMs: 8e3,
  messageMaxLength: 120,
  /** The NEW! pop-up's cheer for a prize the Game Master sends. */
  giftCheer: "A present from Dad!"
});
var SURPRISE_SERVER = Object.freeze({
  /**
   * At most this many new surprises a minute, however they are sent: well above a dad's busy tapping (the game plays
   * at most REMOTE_EVENTS.maxPerMinute anyway), low enough that a stuck script can't fill the list in seconds.
   */
  sendsPerMinute: 20,
  /** A send is a few hundred bytes (a message is at most 120 letters): anything bigger is refused unread. */
  maxBodyBytes: 4096,
  /** The public site whose game may read the surprises from its page (CORS); local test builds use localhost. */
  siteOrigin: "https://p51moustache.github.io",
  /** How long the sending tools (and the phone remote) wait for the server before trying again another way (ms). */
  senderTimeoutMs: 1e4,
  /**
   * Charlie's game counts as listening to the server while its last look from the site's page came at most this long
   * ago (ms): twelve of its REMOTE_EVENTS.endpointPollMs looks, so a slow connection or a moment off screen doesn't
   * count it gone. Longer than that (not open, still on a build without the server, or unable to reach it), the Mac's
   * tools send through the site too, under the same id, and the phone remote says so.
   */
  gameHeardMs: 6e4
});
var SURPRISES = Object.freeze({
  rain: Object.freeze({
    count: 12,
    /** Never more than this many rain crystals at once, however many showers are sent. */
    capacity: 30,
    /** They land this far from Charlie: not on his head, close enough to see them all come down. */
    minRadius: 3,
    maxRadius: 10,
    /** Only where he can walk to: ground at most this many blocks above or below his feet. */
    reach: 4,
    /** They start this high above where they land: over the treetops, low enough to be seen most of the way down. */
    dropHeight: 10,
    /** Fall: a gentle gravity up to a slow top speed (about two seconds down), so Charlie can watch them come. */
    gravity: 10,
    fallSpeed: 6,
    /** A landed rain crystal waits this long to be picked up, then shrinks away over its last `fade` seconds. */
    life: 90,
    fade: 2
  }),
  fireworks: Object.freeze({
    rockets: 9,
    /** The bursts spread over this long. */
    seconds: 4.5,
    /** How long each rocket's spark trail climbs before it bursts. */
    rise: 0.6,
    /**
     * Where they burst, from Charlie along where he is looking: ahead, to either side and up. Far and low enough to
     * stay in the top of the view over his shoulder (it looks a little down), high enough to clear the trees.
     */
    ahead: Object.freeze([20, 30]),
    side: 12,
    up: Object.freeze([5, 9])
  }),
  /** Bleep's party: a few seconds of spinning, hopping and beeping. */
  partySeconds: 5
});
var GAME_MASTER = Object.freeze({
  /**
   * This build's Game Master level: 1 = one surprise at a time, the first eight; 2 = combos, timed sends, favourites,
   * the richer choices and the new surprises (builds, weather, treasure, crystal gifts, parades and Dad's challenges),
   * and playing together (the heartbeat, Charlie's waves and Dad's voice messages). The surprise server lists its own
   * level beside the surprises (GET /events); the game's heartbeat names the game's.
   */
  level: 2,
  combo: Object.freeze({
    /** A combo is a short show: 8 steps at the game's pace (6 a minute) take at least about 80 s. */
    maxSteps: 8,
    /** = REMOTE_EVENTS.minGapMs: a shorter wait would be stretched by the game's pace anyway ("right after"). */
    minWaitSeconds: 3,
    /** Longer pauses belong to a timed send. */
    maxWaitSeconds: 120,
    /** A step needs a moment to start before "is it over?" means anything. */
    overSettleSeconds: 2,
    /** A step that never got going in this long (the Dark Lord waiting for a safe moment) counts as over. */
    overStartSeconds: 90,
    /** No step holds the rest for longer than this (a long walker fight). */
    overMaxSeconds: 300,
    /** A step whose turn has come but whose moment doesn't (crystal rain while he flies) is skipped after this. */
    stepPatienceSeconds: 180,
    /** Bosses wait out other bosses: a little longer. */
    bossPatienceSeconds: 300,
    /** Worst-case waits must fit in half of REMOTE_EVENTS.holdMs, so every step is still held when its turn comes. */
    maxSpanSeconds: 900,
    maxBossSteps: 2,
    /** Message cards (8 s each): three in a row is plenty. */
    maxCardSteps: 3,
    nameMaxLength: 24,
    /** The wait choices the remote and panel offer ("right after" = minWaitSeconds). */
    waitChoices: Object.freeze([3, 5, 10, 30, 60, 120, "over"])
  }),
  schedule: Object.freeze({
    /** Under this is "now". */
    minSeconds: 10,
    /** An evening ahead. */
    maxSeconds: 6 * 3600,
    /** A list Zach can read at a glance on the phone. */
    maxPending: 10,
    /** Due while he isn't playing: it plays when he is back within this, else it is dropped. */
    graceMs: 30 * 60 * 1e3,
    /** The remote's "When" picker (seconds; 0 = now). */
    choices: Object.freeze([0, 30, 60, 300, 600, 1800, 3600, 7200])
  }),
  favourites: Object.freeze({
    /** Two screens of one-tap buttons on a phone. */
    max: 24,
    nameMaxLength: 24,
    icons: Object.freeze(["\u{1F389}", "\u{1F319}", "\u{1F916}", "\u{1F5FA}\uFE0F", "\u2744\uFE0F", "\u{1F3F0}", "\u{1F386}", "\u{1F48E}", "\u2764\uFE0F", "\u2B50", "\u{1F680}", "\u{1F411}", "\u{1F308}", "\u{1F381}", "\u{1F3C6}", "\u{1F604}"]),
    /** Saves per minute: Zach taps, a stuck script can't burn storage writes. */
    savesPerMinute: 10
  }),
  /**
   * The server level that takes the game's heartbeat, Charlie's waves and Dad's voice messages: the game sends them,
   * and shows the wave buttons, only to a server that names at least this level (an older one would turn them away).
   */
  togetherLevel: 2,
  /**
   * Which open games are Charlie's (server/surprise-worker/src/game-devices.js): Dad names each install once on his
   * phone ("That's Charlie"); only those then change "Playing now", his feed or a clip.
   */
  devices: Object.freeze({
    /** Games named as Charlie's at once (his tablet, a spare, a new one): naming one more lets the oldest go. */
    maxApproved: 4,
    /** Games not named (yet) kept in mind at once for "A new game is open" (memory only, newest kept). */
    maxPending: 4
  }),
  /** "Playing now" (src/live/status-beacon.js, server/surprise-worker/src/game-status.js). Ms. */
  status: Object.freeze({
    /** The game's heartbeat while it is on screen: fresh enough for "Playing now", about 240 requests an hour. */
    everyMs: 15e3,
    /** A change (planet, ship, look, a boss) goes at once, but never sooner than this after the last beat. */
    minGapMs: 5e3,
    /** How often the game looks at whether a beat is due. */
    tickMs: 1e3,
    /** "Playing now" while the last beat is this recent: two and a half beats, so one lost on the way doesn't matter. */
    liveMs: 4e4,
    /** A beat is a handful of short words: anything bigger is turned away unread. */
    maxBytes: 512,
    /** The server takes at most one beat of a kind this often, so a flood of made-up ones changes nothing more. */
    serverMinGapMs: 3e3,
    /** Robots near Charlie (within ROBOTS.sight) are counted up to this. */
    robotsMax: 9,
    /** The remote asks for /state this often while it is on screen, and stops after this long without a tap. */
    remotePollMs: 1e4,
    remoteIdleMs: 10 * 60 * 1e3
  }),
  /** Charlie's waves to Dad (core/reactions.js, src/ui/wave-buttons.js, server/surprise-worker/src/wave-feed.js). Ms. */
  reactions: Object.freeze({
    /** After a tap every wave button rests this long, so a happy drum roll on the button is one wave. */
    cooldownMs: 4e3,
    /** The server keeps at most one wave this often, this many a minute and this many a day; the rest are dropped. */
    serverMinGapMs: 2500,
    perMinute: 10,
    /**
     * Only there to bound storage writes: 2% of the free plan's 100,000 a day, far more than a day of happy tapping.
     * Dad's Clear starts the day's count afresh.
     */
    perDay: 2e3,
    /** Dad's feed keeps the newest this many, for a day: ones sent while his phone was shut are still there. */
    keep: 20,
    keepMs: 24 * 3600 * 1e3,
    /** A wave is one short word: anything bigger is turned away unread. */
    maxBytes: 128
  }),
  /** Dad's voice messages (remote/src/voice-recorder.js, server/surprise-worker/src/voice-store.js, live/dad-voice.js). */
  voice: Object.freeze({
    /** The phone's recorder stops itself after this many seconds. */
    maxSeconds: 15,
    /** Asked of the phone's recorder (about 60 KB for 15 s); a phone may ignore it, hence the byte cap. */
    bitsPerSecond: 32e3,
    /** 15 s at 200 kbps is 375 KB: room for a recorder that ignores the bitrate, and still small to keep. */
    maxBytes: 384 * 1024,
    /** Kept in pieces this big: under the 128 KiB value limit of KV-backed Durable Objects too (SQLite ones allow 2 MB). */
    chunkBytes: 96 * 1024,
    /** Clips held on the server at once, and uploads an hour: a phone left recording can't fill the storage. */
    maxHeld: 3,
    uploadsPerHour: 20,
    /** A clip is deleted this long after it was recorded (ms), played or not... */
    lifetimeMs: 24 * 3600 * 1e3,
    /** ...and this long after his game played it (ms): a second tab or tablet may still be loading it. */
    keepAfterPlayMs: 6e4,
    /** What the phones record in (Safari: mp4; Chrome: webm; Firefox: ogg); the bytes must say the same. */
    types: Object.freeze(["audio/mp4", "audio/webm", "audio/ogg"]),
    /** The game's "I played it" note is one short id: anything bigger is turned away unread. */
    playedMaxBytes: 128,
    /**
     * The Message from Dad card stays at least this long with a clip and at most this long even if the clip never ends
     * (ms); with the sound asleep, his Listen button waits this long for a tap too.
     */
    cardMinMs: 6e3,
    cardMaxMs: 22e3
  }),
  surprises: Object.freeze({
    /** Rockets in a fireworks show: a few, a show (SURPRISES.fireworks.rockets) or a big show. */
    fireworkCounts: Object.freeze([5, 9, 15]),
    /**
     * "High in the sky": a show higher, further off and twice as wide as the usual one (SURPRISES.fireworks), so it
     * fills the top of the screen. The foot camera sits about 5 blocks behind and 3 up, looking some 17° down with a
     * 70° lens, so its top edge is about 18° up: these bursts rise to about 16° (the usual show reaches 13°), and none
     * goes overhead, where it would be out of sight with its trails climbing past the camera.
     */
    skyFireworks: Object.freeze({ ahead: Object.freeze([32, 44]), side: 26, up: Object.freeze([10, 14]) }),
    /** Crystals in a shower: up to SURPRISES.rain.capacity, the most that can be about at once. */
    rainCounts: Object.freeze([6, 12, 20, 30]),
    /**
     * No rain crystal lands closer than this (blocks, across the ground) to the camera, about 5 behind Charlie: one
     * by the lens would fill a corner of the screen, or a third of it. A big shower of 30 nearly always put one there.
     */
    rainCameraClear: 4,
    /** Crystals Dad can send straight into Charlie's wallet. */
    giftAmounts: Object.freeze([5, 10, 25, 50]),
    /** The "crystals" prize of a treasure or a challenge, and a crystal gift with no amount picked. */
    prizeCrystals: 10,
    /** The small present when a Dad challenge runs out of time unfinished: nothing is ever taken away. */
    consolationCrystals: 3,
    /** Dad's builds (game/build-crew.js): blocks and seconds. */
    build: Object.freeze({
      /** One layer rises this often: a castle grows in about 3 s, a few chunk remeshes a second. */
      layerSeconds: 0.25,
      /**
       * Near Charlie: its front this many blocks in front of him, pushed back as far as it must be to fit in view whole
       * (see heightDistance and wordDistance), and in plain sight of the camera...
       */
      near: Object.freeze([9, 16]),
      /**
       * ...or this far (pushed back the same way), when there is no room close by. Out to 36 rather than 26: on the
       * hilly islands it finds a place he sees whole in front of him about a quarter more often, still short of the fog.
       */
      farther: Object.freeze([16, 36]),
      /** By his landing pad: this far from its centre, facing it... */
      home: Object.freeze([10, 18]),
      /** ...or this far, when Dad's other builds or the hills leave no room close by (a long word often needs it). */
      homeFarther: Object.freeze([18, 30]),
      /** A word wall stands at least this many times its width away, so all of it fits in view (FOV 70). */
      wordDistance: 0.55,
      /**
       * Any build stands at least this many times its height away, so its top fits in view: the camera looks a little
       * down, so its top edge is only about 18° up. At 9 blocks a castle's towers and a heart's top were cut off.
       */
      heightDistance: 2,
      /**
       * Near Charlie, a build goes where he sees it whole (core/build-view.js; shares of the screen, from its left and
       * from its top): the middle of its front inside these edges, above Charlie himself (he stands in the lower middle
       * of the screen and would hide it), its top and both ends on the screen, and most of its front in plain sight.
       */
      inView: Object.freeze({ left: 0.1, right: 0.9, top: 0.06, bottom: 0.45 }),
      /**
       * ...with its top edge (both corners too) and both its ends at least this share of the screen inside every edge.
       * With no room at all, a heart's top lay right along the top of the screen, and the nearer corner of a build at an
       * angle could be cut off by it.
       */
      edgeRoom: 0.04,
      /** The longest word Dad's builders spell: CHARLIE is 7 letters, 41 blocks wide. */
      wordMaxLength: 8,
      /**
       * The ground under a build may rise and fall this much (a stone foundation fills the rest; the flattest spot
       * wins). The islands are hilly: at 4 most castles near Charlie found no room, at 6 about twice as many do.
       */
      maxSlope: 6,
      /** Room left above a build under the world's top (WORLD.height 48). */
      headroom: 2,
      /** Kept clear round the landing pad (beyond the pad itself): the parked ship sticks out past it, and he starts there. */
      padClear: 4,
      /** Kept this far beyond the pad, the enemy base, the parked ship, drop ships and his other Dad builds. */
      margin: 3,
      /** Never closer than this to Charlie, so a build can't close in round him. */
      charlieClear: 2,
      /**
       * None of Charlie's own blocks in a build's footprint or this many blocks round it, from the ground up to its top:
       * a build there would wall his hut in, roof it over or sink it in its stone foundation.
       */
      hisBlocksClear: 1,
      /** The biggest blueprint (a castle is about 460 blocks, CHARLIE about 160): foundations come on top. */
      maxCellsPerBuild: 900,
      /** Per planet; past these the oldest build is taken down quietly. */
      maxBuilds: 12,
      maxCells: 6e3
    }),
    /** Weather and sky (game/sky-weather.js, render/weather-view.js): minutes, seconds and blocks. */
    weather: Object.freeze({
      minuteChoices: Object.freeze([1, 2, 3, 5]),
      defaultMinutes: 3,
      /** A new sky comes in over this long, and goes again over this long at the end. */
      fadeSeconds: 4,
      /**
       * Flakes and drops falling round the camera at once (render/weather-view.js; about half of them on the screen):
       * enough to read as a snow day or a rainy day, and still light on a tablet (each kind is one draw, moved in one
       * loop). 480 flakes and 260 drops looked like a few specks and a few scratches.
       */
      snowFlakes: 900,
      rainDrops: 700,
      /** The falling-weather box round the camera (blocks: across, up, deep). */
      volume: Object.freeze([40, 24, 40]),
      /** Falling speeds (blocks a second): snow drifts down, rain pours. */
      snowFall: 2.5,
      rainFall: 18
    }),
    /** Treasure hunts (game/treasure-hunt.js): blocks and minutes. */
    treasure: Object.freeze({
      /** How far from Charlie the present is hidden: close by, or farther away. */
      near: Object.freeze([20, 35]),
      far: Object.freeze([40, 70]),
      /** Found on foot within this (across, up); flying, within shipRadius across and shipHeight over the ground. */
      footRadius: 1.8,
      footHeight: 2.5,
      shipRadius: 5,
      shipHeight: 14,
      /** Not found after this many minutes of play: Bleep brings it to him (same prize). */
      minutes: 6,
      /** Above the clouds (62), so the beam shows from far away. */
      beamHeight: 90,
      beamWidth: 0.8,
      /**
       * Further than this from the camera (blocks) the beam widens with the distance, keeping the width it has on the
       * screen from here: about 2° across, a clear stripe of light from anywhere on the island.
       */
      beamFrom: 20
    }),
    /** The animal parade (game/animal-parade.js): seconds and blocks. */
    parade: Object.freeze({
      /** It ends after this long at most. */
      seconds: 25,
      /**
       * The animals march across his view this far in front of him, up to halfWidth either side of the middle: close,
       * since a frog or a lizard is small (at 9 blocks, 14 from the camera, they were specks).
       */
      ahead: 7,
      halfWidth: 12,
      /** Blocks between the animals in the line (closer on a short path, so every one has a place on it). */
      spacing: 1.6,
      /** Marching speed (blocks a second): a little brisker than their usual stroll. */
      speed: 1.6,
      /** Once all are in place, the line stands this long (seconds) before they pop back home. */
      hold: 2,
      /** No parade on less than this much dry, walkable ground. */
      minPath: 6
    }),
    /** Dad's challenges (game/dad-challenge.js). */
    challenge: Object.freeze({
      /** Minutes of play to do it in; then it ends gently, with a small present anyway (consolationCrystals). */
      minutes: 10,
      /**
       * A goal he has reached already ("Fly up to space!" while he is up there) shows its words this long (seconds of
       * play) before "You did it!", so he reads what Dad asked.
       */
      glanceSeconds: 2,
      /** The card says "You did it!" or "Good try!" this long (seconds), then goes. */
      cardSeconds: 4
    })
  })
});
var DRESS_UP = Object.freeze({
  /** Option rows per character: two still fit the dress panel at 800x400 with DONE on screen. */
  maxSlots: 2,
  /** Options per row: one row of chips per slot. */
  maxOptions: 3,
  /** The preview turns him this fast (radians per second): about one turn every 10 seconds. */
  spinRate: 0.6,
  /** Dragging the stage turns him this much per CSS pixel: a swipe across the stage turns him about once round. */
  turnPerPixel: 0.02,
  /** After a drag he stays where Charlie left him this many seconds, then turns again. */
  holdSeconds: 2.5,
  /** Every pick makes him hop this high (blocks) over this long (seconds), so each tap shows something happen. */
  hopHeight: 0.3,
  hopSeconds: 0.6,
  /** A narrow lens (degrees) keeps the close-up undistorted. */
  fov: 30,
  /** The frame the camera fits (blocks): the tallest body (1.98) plus the hop and a margin... */
  frameHeight: 2.6,
  /** ...and his arms (0.52 out either side) and pack (0.35 deep) as he turns, plus a margin. */
  frameWidth: 1.4,
  /** The camera looks at this height on him (blocks above his feet): the middle of the frame. */
  lookAtY: 1.15,
  /** The stage's backdrop: a shade lighter than the page ink, so white armour stands out against it. */
  background: 1450570,
  /**
   * The Trooper's own colours must never look like an enemy's (tests/characters.test.mjs checks every paint): bright
   * enough in hue (HSL saturation), neither too dark nor too pale (HSL lightness), and this far in RGB (0-255 a
   * channel) from every colour an enemy trooper wears.
   */
  minAccentSaturation: 0.4,
  accentLightness: Object.freeze([0.35, 0.8]),
  minEnemyDistance: 75,
  /**
   * Two options in one row must look different, so every tap visibly changes him: at least this far apart in RGB.
   * A fixed pick (a gold helmet, an ice visor) that would come closer to the paint's own colour takes its stand-in.
   * The gold squadron's stripe and the gold helmet were 27 apart and looked the same; every other pair is over 110.
   */
  minOptionDistance: 80,
  /** Each paint dresses the Trooper in its own squad colour: no two this close in RGB (Blue and Silver were 55). */
  minSquadDistance: 70
});
var CONTENT = Object.freeze({
  /** 12 of each kind: far more than a family uses, short DRESS UP rows, and an index under 2 KB without pictures. */
  maxPacks: 48,
  /** Every tablet keeps everything: 4 MB in IndexedDB is nothing for Silk, but it is bounded. */
  maxTotalBytes: 4 * 1024 * 1024,
  /** The biggest legal ship (32k voxels, 30% speckle) packs to about 30-60 KB: room to spare, still quick on weak Wi-Fi. */
  maxPackBytes: 192 * 1024,
  /** Stored in chunks under the older 128 KiB per-value limit (in case the 2 MB SQLite figure is wrong): 2 at most. */
  chunkBytes: 96 * 1024,
  /** The biggest .vox file as base64 (a third bigger) plus the rest of the upload. */
  maxUploadBytes: 512 * 1024,
  /** 4 bytes a voxel in a .vox file: about 60k voxels plus scene chunks, above every kind's own voxel cap. */
  maxVoxFileBytes: 256 * 1024,
  /** A 64x64 skin picture is usually under 10 KB. */
  maxPngFileBytes: 64 * 1024,
  /** Uploads plus removes a minute: a dad never sends faster, and a stuck script can't fill the store. */
  changesPerMinute: 6,
  /** An upload of 512 KB on a slow phone link. */
  uploadTimeoutMs: 6e4,
  /** The list matches fresh-json's own wait; a pack is bigger. */
  indexTimeoutMs: 8e3,
  packTimeoutMs: 2e4,
  /** The longest the game's start waits for its saved packs before building the world without them (they come later). */
  bootReadMs: 1500,
  /**
   * Once the game runs, the longest a read or write of the saved packs may take before it counts as failed: a slow
   * tablet's IndexedDB can take seconds, and nothing waits on it then.
   */
  storeTimeoutMs: 1e4,
  /** The first look at the server after start; at most one look a minute from wake-ups; a slow look with polling off. */
  firstCheckMs: 3e3,
  minCheckGapMs: 6e4,
  fallbackCheckMs: 15 * 60 * 1e3,
  /** A fresh tablet with 48 packs downloads them over a few rounds instead of in one burst... */
  fetchPerRound: 8,
  /** ...this far apart (ms), so play stays smooth while they come in. */
  nextRoundMs: 2e3,
  /**
   * A change the surprise server reports (its /events reply's content.rev) is looked at after this little wait (ms), so
   * several sends in a row make one look.
   */
  changeCheckDelayMs: 500,
  /** At most this many NEW! pop-ups in a row, then one "N more" pop-up, so a fresh tablet is not flooded. */
  newPopups: 3,
  /** How many NEW!-seen ids are remembered. */
  rememberIds: 200,
  /** Meshes are kept only for what is worn or on the dress-up stage, so memory stays small on the tablet. */
  meshCacheSize: 4,
  character: Object.freeze({
    maxInstalled: 12,
    /** The character card's width (core/characters/define.js NAME_MAX). */
    nameMax: 10,
    /** The worst skin is 3,264 quads before merging; a full, noisy voxel character merged to 1.1k. About 11% of the island. */
    maxFaces: 4e3,
    /**
     * A voxel character's grid (x across, y up, z deep) at voxelSize blocks a voxel: 2.0 tall, 0.5625 either side and
     * 0.375 deep behind, exactly inside the rig contract (tests/character-models.test.mjs). Its joints sit where the rig's do.
     */
    template: Object.freeze([18, 32, 12]),
    voxelSize: 1 / 16
  }),
  ship: Object.freeze({
    maxInstalled: 12,
    nameMax: 12,
    /** A 96-long speckled ship measured 5.1k faces: 6k is about 17% of the island in one draw call. Speckle costs most. */
    maxFaces: 6e3,
    /** Bounds the mesher's work (368k cells at worst, about 25 ms on the Mac) and memory (a 360 KB grid). */
    maxVoxels: 32e3,
    maxGrid: Object.freeze([96, 40, 96]),
    /** Blocks long: the starfighter is 9.45, so a new ship is as big as his unless Zach says otherwise. */
    defaultLength: 9.5,
    /** Longer than 14 and the chase camera (11 behind the centre) sits in its tail and the title orbit (13) grazes it. */
    minLength: 4,
    maxLength: 14,
    maxWidth: 12,
    /** The flight camera (3.4 above the centre) keeps looking over the hull. */
    maxHeight: 3.5,
    /** Charlie's half width (PLAYER.halfWidth): his body, not just his centre, stays out of the hull. */
    footprintMargin: 0.3,
    /** Clamps that keep every rule a hull feeds inside the range it is tested in; a bigger model is scaled down. */
    minHalf: 2.5,
    maxHalfLength: 8.5,
    maxHalfWidth: 7,
    /** The landing search costs (spots) x (plan points): 6 rectangles over at most 14x12 blocks is about 700 points. */
    maxPlanRects: 6,
    maxCannons: 4,
    maxExhausts: 4,
    /** Hull, glass, Bleep's socket, the pilot's head and up to 4 engine glows (the starfighter has 14). */
    maxMeshes: 8
  }),
  hat: Object.freeze({
    maxInstalled: 12,
    nameMax: 14,
    /** Built twice (on Bleep and on the docked Bleep), and a hat is small: this refuses pathological noise. */
    maxFaces: 800,
    maxGrid: Object.freeze([24, 20, 24]),
    /** Blocks: Bleep's head is 0.44 across; the hat test allows 0.7 wide and a top 0.45 above a 0.03 sink. */
    width: 0.46,
    maxWidth: 0.7,
    maxHeight: 0.48,
    /** At most this share of a hat's voxels may spin (the propeller's blades): the rest is the hat. */
    maxSpinShare: 0.4
  }),
  block: Object.freeze({
    /** Up to 3 tiles each fit the 48 pack slots of the block atlas. */
    maxInstalled: 16,
    nameMax: 12,
    tileSize: 16
  })
});

// src/core/events-file.js
var EVENTS_FILE_VERSION = 1;
var EVENTS_FILE_NAME = "events.json";
var ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
var ID_RANDOM_DIGITS = 12;
var DIGITS_PER_DRAW = 6;
function readClearedAt(json) {
  return isPlainObject(json) && Number.isFinite(json.clearedAt) ? json.clearedAt : null;
}
var fileWith = (json, events) => {
  const clearedAt = readClearedAt(json);
  return clearedAt === null ? { version: EVENTS_FILE_VERSION, events } : { version: EVENTS_FILE_VERSION, clearedAt, events };
};
var isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function normaliseEvent(raw) {
  if (!isPlainObject(raw)) return null;
  const { id, type, at, expiresAt, params } = raw;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
  if (typeof type !== "string" || !TYPE_PATTERN.test(type)) return null;
  if (!Number.isFinite(at)) return null;
  return Object.freeze({
    id,
    type,
    at,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : at + REMOTE_EVENTS.lifetimeMs,
    params: Object.freeze(isPlainObject(params) ? { ...params } : {})
  });
}
function isEventsFile(json) {
  return isPlainObject(json) && json.version === EVENTS_FILE_VERSION && Array.isArray(json.events);
}
function readEvents(json) {
  if (!isEventsFile(json)) return [];
  const seen = /* @__PURE__ */ new Set();
  const events = [];
  for (const raw of json.events) {
    const event = normaliseEvent(raw);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  return events.sort((a, b) => a.at - b.at);
}
var isEventId = (id) => typeof id === "string" && ID_PATTERN.test(id);
function randomDigits(random) {
  let digits = "";
  while (digits.length < ID_RANDOM_DIGITS) {
    digits += Math.floor(random() * 36 ** DIGITS_PER_DRAW).toString(36).padStart(DIGITS_PER_DRAW, "0");
  }
  return digits.slice(0, ID_RANDOM_DIGITS);
}
function createEvent({ type, params = {}, now, id = null, lifetimeMs = REMOTE_EVENTS.lifetimeMs, random = Math.random }) {
  if (id !== null && !isEventId(id)) throw new Error(`"${id}" is not a usable event id.`);
  return { id: id ?? randomDigits(random), type, at: now, expiresAt: now + lifetimeMs, params: { ...params } };
}
function withEvent(json, event, keep = REMOTE_EVENTS.keepEvents) {
  const events = readEvents(json).filter((e) => e.id !== event.id);
  events.push(event);
  events.sort((a, b) => a.at - b.at);
  return fileWith(json, events.slice(-keep));
}
function eventsFileText(file) {
  return `${JSON.stringify(file, null, 2)}
`;
}

// src/core/combo-names.js
var COMBO_TYPE = "combo";
var WAIT_OVER = "over";

// src/core/combo-span.js
function comboSpanSeconds(steps, limits) {
  return steps.slice(1).reduce((total, step) => total + (step.wait === WAIT_OVER ? limits.overMaxSeconds : step.wait), 0);
}

// src/core/message-text.js
var BREAKS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
var INVISIBLE = /(?!\u200d)[\p{Cf}\p{Co}\p{Cs}]/gu;
var LINKS = /(?:https?:\/\/|www\.)\S*/giu;
var TAGS = /<\/?[a-z][^<>]*>/gi;
var BRACKETS = /[<>]/g;
var SPACES = /\s+/gu;
var WORD_CUT_SHARE = 0.6;
var ELLIPSIS = "\u2026";
function cleanMessage(raw, maxLength) {
  if (typeof raw !== "string") return null;
  const text = raw.normalize("NFC").replace(BREAKS, " ").replace(INVISIBLE, "").replace(LINKS, "").replace(TAGS, "").replace(BRACKETS, "").replace(SPACES, " ").trim();
  if (!text) return null;
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  let cut = chars.slice(0, maxLength - 1).join("");
  const space = cut.lastIndexOf(" ");
  if (space >= cut.length * WORD_CUT_SHARE) cut = cut.slice(0, space);
  return `${cut.trimEnd().replace(/[\s.,;:!?-]+$/u, "")}${ELLIPSIS}`;
}

// src/core/remote-event-queue.js
var VERDICT = Object.freeze({ RUN: "run", WAIT: "wait", DROP: "drop" });

// src/core/combo.js
var isPlainObject2 = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
var COMBO_FIELDS = Object.freeze(["name", "steps"]);
var STEP_FIELDS = Object.freeze(["type", "params", "wait"]);
function waitWords(wait, limits = GAME_MASTER.combo) {
  if (wait === WAIT_OVER) return "when it's over";
  if (wait <= limits.minWaitSeconds) return "right after";
  return wait % 60 === 0 ? `${wait / 60} min later` : `${wait} s later`;
}
var comboSpanSeconds2 = (steps, limits = GAME_MASTER.combo) => comboSpanSeconds(steps, limits);
function strictWait(wait, index, limits) {
  if (index === 0) {
    if (wait !== void 0 && wait !== 0) throw new Error("Step 1 starts the combo, so it has no wait.");
    return 0;
  }
  if (wait === void 0) return limits.minWaitSeconds;
  if (wait === WAIT_OVER) return WAIT_OVER;
  if (Number.isInteger(wait) && wait >= limits.minWaitSeconds && wait <= limits.maxWaitSeconds) return wait;
  throw new Error(`Step ${index + 1}: wait ${JSON.stringify(wait)} doesn't work: pick ${limits.minWaitSeconds} to ${limits.maxWaitSeconds} seconds, or "${WAIT_OVER}" (when the one before is over).`);
}
function checkCombo(raw, { lookup, checkStep, limits = GAME_MASTER.combo, fleetMax = ROBOTS.fleetMax, forFavourite = false }) {
  if (!isPlainObject2(raw)) throw new Error('A combo is { "name": ..., "steps": [...] }.');
  const stray = Object.keys(raw).find((key) => !COMBO_FIELDS.includes(key));
  if (stray !== void 0) throw new Error(`A combo takes a name and its steps, not "${stray}".`);
  const { steps } = raw;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > limits.maxSteps) throw new Error(`A combo needs 1 to ${limits.maxSteps} surprises.`);
  const checked = steps.map((step, index) => {
    if (!isPlainObject2(step)) throw new Error(`Step ${index + 1} is not a surprise ({ "type": ..., "params": ..., "wait": ... }).`);
    const odd = Object.keys(step).find((key) => !STEP_FIELDS.includes(key));
    if (odd !== void 0) throw new Error(`Step ${index + 1} takes a type, params and a wait, not "${odd}".`);
    const kind = typeof step.type === "string" ? lookup(step.type) : null;
    if (!kind) throw new Error(`Step ${index + 1}: there is no "${step.type}" event.`);
    if (kind.type === COMBO_TYPE || kind.inCombo === false) throw new Error(`Step ${index + 1}: ${kind.label} can't go in a combo.`);
    if (forFavourite && kind.inFavourite === false) throw new Error(`Step ${index + 1}: ${kind.label} can't be saved in a favourite.`);
    if (step.params !== void 0 && !isPlainObject2(step.params)) throw new Error(`Step ${index + 1}: "params" must be an object.`);
    let params;
    try {
      ({ params } = checkStep(kind.type, step.params ?? {}));
    } catch (error) {
      throw new Error(`Step ${index + 1}: ${error.message}`);
    }
    return { type: kind.type, params, wait: strictWait(step.wait, index, limits), kind };
  });
  const bosses = checked.filter((step) => step.kind.boss).length;
  if (bosses > limits.maxBossSteps) throw new Error(`A combo can bring at most ${limits.maxBossSteps} bosses (it has ${bosses}).`);
  const cards = checked.filter((step) => step.kind.card).length;
  if (cards > limits.maxCardSteps) throw new Error(`A combo can show at most ${limits.maxCardSteps} message cards (it has ${cards}).`);
  const ships = checked.reduce((total, step) => total + (step.kind.dropShips?.(step.params) ?? 0), 0);
  if (ships > fleetMax) throw new Error(`A combo can send at most ${fleetMax} robot drop ships in all (it has ${ships}).`);
  const span = comboSpanSeconds2(checked, limits);
  if (span > limits.maxSpanSeconds) {
    throw new Error(`That combo could take up to ${Math.ceil(span / 60)} minutes: keep it within ${limits.maxSpanSeconds / 60} (each "${WAIT_OVER}" counts ${limits.overMaxSeconds / 60} minutes).`);
  }
  const name = raw.name === void 0 || raw.name === null || raw.name === "" ? null : cleanMessage(raw.name, limits.nameMaxLength);
  if (raw.name !== void 0 && raw.name !== null && raw.name !== "" && !name) throw new Error("That combo name has nothing in it that can show: type some words, or leave it out.");
  const out = checked.map(({ type, params, wait }) => ({ type, params, wait }));
  return name ? { name, steps: out } : { steps: out };
}
function tolerantWait(wait, index, limits) {
  if (index === 0) return 0;
  if (wait === WAIT_OVER) return WAIT_OVER;
  if (!Number.isFinite(wait)) return limits.minWaitSeconds;
  return Math.min(limits.maxWaitSeconds, Math.max(limits.minWaitSeconds, Math.round(wait)));
}
function readCombo(raw, { lookup, known = {}, limits = GAME_MASTER.combo }) {
  if (!isPlainObject2(raw) || !Array.isArray(raw.steps)) return null;
  const steps = [];
  for (const step of raw.steps) {
    if (steps.length >= limits.maxSteps) break;
    if (!isPlainObject2(step) || typeof step.type !== "string") continue;
    const kind = lookup(step.type);
    if (!kind || kind.type === COMBO_TYPE || kind.inCombo === false) continue;
    let params = null;
    try {
      params = kind.params(isPlainObject2(step.params) ? step.params : {}, known);
    } catch {
      params = null;
    }
    if (!params) continue;
    steps.push({ type: kind.type, params: Object.freeze(params), wait: tolerantWait(step.wait, steps.length, limits) });
  }
  if (steps.length === 0) return null;
  const name = cleanMessage(raw.name, limits.nameMaxLength);
  return name ? { name, steps } : { steps };
}

// src/live/events/field-kinds.js
var FIELD_KIND = Object.freeze({ CHOICE: "choice", TEXT: "text", WORD: "word", VOICE: "voice" });
function isShown(field, values) {
  return Object.entries(field.showWhen ?? {}).every(([option, value]) => values[option] === value);
}

// src/live/events/define.js
var EVENT_OPTION = Object.freeze({
  TEXT: "text",
  CLIP: "clip",
  TYPE: "type",
  UNLOCK: "unlock",
  COUNT: "count",
  COLOUR: "colour",
  WHERE: "where",
  WHAT: "what",
  WORD: "word",
  MOOD: "mood",
  MINUTES: "minutes",
  AMOUNT: "amount",
  PRIZE: "prize",
  GOAL: "goal",
  VOICE: "voice"
});
var RESERVED_OPTIONS = Object.freeze(["id", "params", "in", "steps", "favourite", "name", "wait"]);
var DEFAULT_LASTS_SECONDS = 3;
function defineField({ choices, showWhen, ...field }) {
  return Object.freeze({
    required: false,
    ...field,
    ...choices ? { choices: Object.freeze(choices.map((choice2) => Object.freeze({ ...choice2, value: String(choice2.value) }))) } : {},
    ...showWhen ? { showWhen: Object.freeze({ ...showWhen }) } : {}
  });
}
function defineRemoteEvent(spec) {
  const fields = Object.freeze((spec.fields ?? []).map(defineField));
  return Object.freeze({
    boss: false,
    params: () => ({}),
    ready: () => VERDICT.RUN,
    since: 1,
    serverOnly: false,
    busy: null,
    lasts: DEFAULT_LASTS_SECONDS,
    startsAtOnce: false,
    card: false,
    dropShips: null,
    check: null,
    describe: null,
    inCombo: true,
    inFavourite: true,
    ...spec,
    fields,
    options: Object.freeze(spec.options ?? fields.map((field) => field.option)),
    needs: Object.freeze(spec.needs ?? fields.filter((field) => field.required && !field.showWhen).map((field) => field.option))
  });
}
function chosen(field, raw) {
  const value = raw[field.option];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  return text !== "" && (field.choices ?? []).some((choice2) => String(choice2.value) === text) ? text : null;
}
var runWhen = (condition) => condition ? VERDICT.RUN : VERDICT.WAIT;
var afterBossFights = (game) => runWhen(!game.bossFightActive);
var inSpace = (game) => game.inShip && game.ship.pos.y > SPACE.startAltitude;
var freePlayMoment = (game) => game.inFreePlay && !game.bossFightActive;

// src/live/events/bleep-party.js
var BLEEP_PARTY_EVENT = defineRemoteEvent({
  type: "bleepParty",
  label: "Bleep party",
  about: "Bleep spins, hops, beeps and sparkles.",
  ready: (game) => runWhen(game.buddy.out && !game.duel.busy),
  run(game) {
    game.surprises.bleepParty();
  },
  busy: (game) => game.buddy.partying
});

// src/live/events/crystal-rain.js
var COUNT_WORDS = Object.freeze({ 6: "A few (6)", 12: "Lots (12)", 20: "Loads (20)", 30: "A huge shower (30)" });
var COUNT = defineField({
  option: EVENT_OPTION.COUNT,
  label: "How many",
  kind: FIELD_KIND.CHOICE,
  choices: GAME_MASTER.surprises.rainCounts.map((n) => ({ value: n, text: COUNT_WORDS[n] ?? String(n) })),
  default: String(SURPRISES.rain.count)
});
var CRYSTAL_RAIN_EVENT = defineRemoteEvent({
  type: "crystalRain",
  label: "Crystal rain",
  about: "Crystals fall from the sky all around Charlie.",
  fields: [COUNT],
  params(raw) {
    const count2 = chosen(COUNT, raw);
    return count2 ? { count: Number(count2) } : {};
  },
  ready: (game) => runWhen(!game.inShip && game.player.alive && !game.duel.busy),
  run(game, params) {
    game.surprises.rainCrystals(params.count ?? SURPRISES.rain.count);
  },
  busy: (game) => game.surprises.raining
});

// src/live/events/dark-lord.js
var DARK_LORD_EVENT = defineRemoteEvent({
  type: "darkLord",
  label: "Dark Lord duel",
  about: "The Dark Lord flies in for a sword duel when the moment is safe.",
  boss: true,
  ready(game) {
    if (game.settings.darkLord === false || !game.duel.enabled) return VERDICT.DROP;
    if ((game.duel.cast?.id ?? "darkLord") !== "darkLord") return VERDICT.DROP;
    return runWhen(game.inFreePlay);
  },
  run(game) {
    game.duel.summon();
  },
  busy: (game) => game.duel.busy
});

// src/core/fireworks.js
var FIREWORK_COLORS = Object.freeze([16731486, 16763955, 6550271, 8257418, 16742970, 13073919, 16777215]);
var LIFTS = Object.freeze([0, 3, 6]);
var PULLS = Object.freeze([1, 0.65, 0.4]);

// src/core/has-own.js
var hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// src/core/firework-palettes.js
var palette = (id, label, colors) => Object.freeze({ id, label, colors: Object.freeze(colors) });
var FIREWORK_PALETTES = Object.freeze(
  Object.fromEntries(
    [
      palette("mixed", "All the colours", FIREWORK_COLORS),
      palette("rainbow", "Rainbow", [16731486, 16751162, 16765503, 8257418, 6550271, 5999871, 13073919]),
      palette("gold", "Gold", [16763955, 16773280, 16777215]),
      palette("red", "Red", [16731486, 16747146, 16777215]),
      palette("blue", "Blue", [6550271, 5999871, 16777215]),
      palette("green", "Green", [8257418, 13172602, 16777215]),
      palette("purple", "Purple", [13073919, 16743129, 16777215])
    ].map((p) => [p.id, p])
  )
);

// src/live/events/fireworks.js
var COUNT_WORDS2 = Object.freeze({ 5: "A few (5)", 9: "A show (9)", 15: "A big show (15)" });
var COUNT2 = defineField({
  option: EVENT_OPTION.COUNT,
  label: "How many",
  kind: FIELD_KIND.CHOICE,
  choices: GAME_MASTER.surprises.fireworkCounts.map((n) => ({ value: n, text: COUNT_WORDS2[n] ?? String(n) })),
  default: "9"
});
var COLOUR = defineField({
  option: EVENT_OPTION.COLOUR,
  label: "Colours",
  kind: FIELD_KIND.CHOICE,
  choices: Object.values(FIREWORK_PALETTES).map((palette2) => ({ value: palette2.id, text: palette2.label })),
  default: "mixed"
});
var WHERE = defineField({
  option: EVENT_OPTION.WHERE,
  label: "Where",
  kind: FIELD_KIND.CHOICE,
  choices: [
    { value: "near", text: "In front of him" },
    { value: "sky", text: "High in the sky" }
  ],
  default: "near"
});
var FIREWORKS_EVENT = defineRemoteEvent({
  type: "fireworks",
  label: "Fireworks",
  about: "Fireworks burst in the sky in front of Charlie.",
  fields: [COUNT2, COLOUR, WHERE],
  /** Each choice given and known is kept (the count as a number); an unknown one is left out: the usual show. */
  params(raw) {
    const count2 = chosen(COUNT2, raw);
    const colour = chosen(COLOUR, raw);
    const where = chosen(WHERE, raw);
    return { ...count2 ? { count: Number(count2) } : {}, ...colour ? { colour } : {}, ...where ? { where } : {} };
  },
  ready: afterBossFights,
  run(game, params) {
    game.surprises.fireworks({ rockets: params.count, palette: params.colour, where: params.where });
  },
  busy: (game) => game.surprises.fireworksOn
});

// src/live/events/knight.js
var KNIGHT_EVENT = defineRemoteEvent({
  type: "knight",
  label: "Knight duel",
  about: "The Knight flies in for a sword duel (only when Charlie plays a bad guy).",
  boss: true,
  ready(game) {
    if (game.settings.darkLord === false || !game.duel.enabled) return VERDICT.DROP;
    if ((game.duel.cast?.id ?? "darkLord") !== "knight") return VERDICT.DROP;
    return runWhen(game.inFreePlay);
  },
  run(game) {
    game.duel.summon();
  },
  /** A combo step "when it's over" waits for the duel to end. */
  busy: (game) => game.duel.busy
});

// src/live/events/message.js
var CLIP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
function knownClip(raw, clips) {
  if (typeof raw !== "string" || !CLIP_ID.test(raw)) return null;
  return !clips || clips.has(raw) ? raw : null;
}
var MESSAGE_EVENT = defineRemoteEvent({
  type: "message",
  label: "Message from Dad",
  about: "A big card with your words on Charlie's screen for a few seconds.",
  fields: [
    {
      option: EVENT_OPTION.TEXT,
      label: "Your words",
      kind: FIELD_KIND.TEXT,
      required: true,
      maxLength: REMOTE_EVENTS.messageMaxLength,
      placeholder: "Great flying, Charlie! Love, Dad"
    },
    { option: EVENT_OPTION.CLIP, label: "Sound (optional)", kind: FIELD_KIND.CHOICE, choicesFrom: "clips", none: "No sound" }
  ],
  card: true,
  params(raw, known = {}) {
    const text = cleanMessage(raw.text, REMOTE_EVENTS.messageMaxLength);
    if (!text) return null;
    const clip = knownClip(raw.clip, known.clips);
    return clip ? { text, clip } : { text };
  },
  ready: afterBossFights,
  run(game, params, stage) {
    stage.showMessage(params);
  },
  busy: (game, params, stage) => stage?.messageShowing?.() === true
});

// src/live/events/robot-drop.js
var DROP_SHIP_COUNTS = Object.freeze(Array.from({ length: ROBOTS.fleetMax }, (_, i) => i + 1));
var ROBOT_DROP_EVENT = defineRemoteEvent({
  type: "robotDrop",
  label: "Robot drop ships",
  about: "Drop ships fly in (pick how many) and squads of robots hop out.",
  boss: true,
  params(raw) {
    const count2 = Number.parseInt(raw.count ?? 1, 10);
    return { count: DROP_SHIP_COUNTS.includes(count2) ? count2 : 1 };
  },
  ready(game) {
    if (game.side?.robotDrops === false) return VERDICT.DROP;
    const drops = game.robotDrops;
    return runWhen(game.robotDropsAllowed && drops.shipsOut + drops.summonsQueued < ROBOTS.fleetMax);
  },
  run(game, params) {
    game.robotDrops.summon(params.count);
  },
  fields: [
    { option: EVENT_OPTION.COUNT, label: "How many ships", kind: FIELD_KIND.CHOICE, choices: DROP_SHIP_COUNTS.map((n) => ({ value: n, text: n === 1 ? "1 ship" : `${n} ships` })) }
  ],
  /** Over once every ship has gone and no robot is left near Charlie. */
  busy(game) {
    const drops = game.robotDrops;
    return drops.shipsOut + drops.summonsQueued > 0 || game.robots.countNear(game.activePosition, ROBOTS.sight) > 0;
  },
  dropShips: (params) => params.count
});

// src/core/blocks.js
var BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  PLANKS: 7,
  METAL: 8,
  METAL_DARK: 9,
  PAD: 10,
  STRIPE: 11,
  BEDROCK: 12,
  SNOW: 13,
  LIGHT: 14,
  REACTOR: 15,
  BRICK: 16,
  ICE: 17,
  PINE: 18,
  CACTUS: 19,
  SANDSTONE: 20,
  RED_SAND: 21,
  GLASS: 22,
  GOLD: 23,
  GLOW: 24
});
var FACE = Object.freeze({ EAST: 0, WEST: 1, TOP: 2, BOTTOM: 3, SOUTH: 4, NORTH: 5 });
var UNBREAKABLE = Infinity;
var all = (tile) => ({ top: tile, side: tile, bottom: tile });
var tiles = (top, side, bottom) => ({ top, side, bottom });
var DEFINITIONS = [
  { id: BLOCK.GRASS, name: "Grass", tiles: tiles("grassTop", "grassSide", "dirt"), hardness: 1, color: 6270522 },
  { id: BLOCK.DIRT, name: "Dirt", tiles: all("dirt"), hardness: 1, color: 9067061, buildable: true },
  { id: BLOCK.STONE, name: "Stone", tiles: all("stone"), hardness: 1, color: 9211020, buildable: true },
  { id: BLOCK.SAND, name: "Sand", tiles: all("sand"), hardness: 1, color: 14929803 },
  { id: BLOCK.LOG, name: "Log", tiles: tiles("logTop", "logSide", "logTop"), hardness: 1, color: 7031339 },
  { id: BLOCK.LEAVES, name: "Leaves", tiles: all("leaves"), hardness: 1, color: 3967534 },
  { id: BLOCK.PLANKS, name: "Wood", tiles: all("planks"), hardness: 1, color: 12093261, buildable: true },
  { id: BLOCK.METAL, name: "Metal", tiles: all("metal"), hardness: 2, color: 13225169, buildable: true },
  { id: BLOCK.METAL_DARK, name: "Dark metal", tiles: all("metalDark"), hardness: 3, color: 4869975 },
  { id: BLOCK.PAD, name: "Landing pad", tiles: tiles("pad", "metal", "metal"), hardness: UNBREAKABLE, color: 10462118 },
  { id: BLOCK.STRIPE, name: "Pad edge", tiles: tiles("stripe", "metal", "metal"), hardness: UNBREAKABLE, color: 15909424 },
  { id: BLOCK.BEDROCK, name: "Bedrock", tiles: all("bedrock"), hardness: UNBREAKABLE, color: 3355443 },
  { id: BLOCK.SNOW, name: "Snow", tiles: tiles("snow", "snowSide", "dirt"), hardness: 1, color: 15922938 },
  { id: BLOCK.LIGHT, name: "Light", tiles: all("light"), hardness: 1, color: 10482687, glow: true, buildable: true },
  { id: BLOCK.REACTOR, name: "Generator", tiles: all("reactor"), hardness: 1, color: 16734762, glow: true },
  { id: BLOCK.BRICK, name: "Brick", tiles: all("brick"), hardness: 1, color: 11883067, buildable: true },
  { id: BLOCK.ICE, name: "Ice", tiles: all("ice"), hardness: 1, color: 11133685, buildable: true },
  { id: BLOCK.PINE, name: "Pine needles", tiles: tiles("pineTop", "pineSide", "pineSide"), hardness: 1, color: 3107642 },
  { id: BLOCK.CACTUS, name: "Cactus", tiles: tiles("cactusTop", "cactusSide", "cactusTop"), hardness: 1, color: 5216826 },
  { id: BLOCK.SANDSTONE, name: "Sandstone", tiles: tiles("sandstoneTop", "sandstoneSide", "sandstoneTop"), hardness: 1, color: 14267002 },
  { id: BLOCK.RED_SAND, name: "Red sand", tiles: all("redSand"), hardness: 1, color: 14254666 },
  { id: BLOCK.GLASS, name: "Glass", tiles: all("glass"), hardness: 1, color: 12577279, buildable: true },
  { id: BLOCK.GOLD, name: "Gold", tiles: all("gold"), hardness: 2, color: 15909424, buildable: true },
  { id: BLOCK.GLOW, name: "Glow", tiles: all("glow"), hardness: 1, color: 16743129, glow: true, buildable: true }
];
var BY_ID = new Map(DEFINITIONS.map((def) => [def.id, Object.freeze(def)]));
function blockDef(id) {
  return BY_ID.get(id) ?? (isPackBlockId(id) ? packBlocks.get(id) ?? PACK_STAND_INS[id - BLOCK_ID_RANGES.packs[0]] : void 0);
}
var BUILD_PALETTE = Object.freeze([BLOCK.PLANKS, BLOCK.BRICK, BLOCK.STONE, BLOCK.METAL, BLOCK.LIGHT, BLOCK.DIRT]);
var UNLOCKABLE_BLOCKS = Object.freeze({ glass: BLOCK.GLASS, gold: BLOCK.GOLD, glow: BLOCK.GLOW });
var BLOCK_ID_RANGES = Object.freeze({
  builtIn: Object.freeze([0, 31]),
  dyes: Object.freeze([32, 127]),
  packs: Object.freeze([128, 223])
});
var isPackBlockId = (id) => Number.isInteger(id) && id >= BLOCK_ID_RANGES.packs[0] && id <= BLOCK_ID_RANGES.packs[1];
var STAND_IN = Object.freeze({ name: "Block", tiles: Object.freeze(all("packBlank")), hardness: 1, color: 12169928, buildable: true });
var PACK_STAND_INS = Object.freeze(
  Array.from({ length: BLOCK_ID_RANGES.packs[1] - BLOCK_ID_RANGES.packs[0] + 1 }, (_, i) => Object.freeze({ id: BLOCK_ID_RANGES.packs[0] + i, ...STAND_IN }))
);
var packBlocks = /* @__PURE__ */ new Map();

// src/core/content/shelf.js
var packs = /* @__PURE__ */ new Map();
var setAside = /* @__PURE__ */ new WeakSet();
var usable = (pack) => Boolean(pack) && !setAside.has(pack);
function shelfPack(kind, id) {
  const pack = typeof id === "string" ? packs.get(id) : void 0;
  return usable(pack) && pack.kind === kind ? pack : null;
}

// src/core/hats.js
var HATS = Object.freeze({
  beanie: { name: "Bobble hat" },
  explorer: { name: "Explorer hat" },
  cowboy: { name: "Cowboy hat" },
  propeller: { name: "Propeller cap" },
  party: { name: "Party hat" },
  wizard: { name: "Wizard hat" },
  tophat: { name: "Top hat" },
  crown: { name: "Crown" },
  helmet: { name: "Trooper helmet" }
});

// src/core/color-math.js
var cssColor = (hex) => `#${hex.toString(16).padStart(6, "0")}`;

// src/core/paints.js
var SQUADRONS = Object.freeze({
  red: { label: "Red", suit: 15234604, helmet: 15921904, stripe: 14168623, droid: 14168623, blade: 5224703 },
  blue: { label: "Blue", suit: 4161504, helmet: 15921904, stripe: 3107800, droid: 3107800, blade: 5224703 },
  green: { label: "Green", suit: 4171862, helmet: 15921904, stripe: 3123274, droid: 3123274, blade: 6094698 },
  gold: { label: "Gold", suit: 14723372, helmet: 15921904, stripe: 15774500, droid: 15774500, blade: 16765773 }
});
var UNLOCKABLE_PAINTS = Object.freeze({
  silver: {
    label: "Silver",
    suit: 10134704,
    helmet: 15922422,
    stripe: 8226708,
    droid: 10989755,
    blade: 15135999,
    hull: 14147044,
    hullShade: 10397360,
    /**
     * The silver stripe is almost grey (saturation 0.10): an enemy's grey on white armour. A bright teal instead (a
     * sky blue sat too near the Blue squadron's and the midnight ice blue); the dress-up chip shows it.
     */
    trooperAccent: 2078888
  },
  midnight: {
    label: "Midnight",
    suit: 2898552,
    helmet: 1975890,
    stripe: 7328511,
    droid: 4018074,
    blade: 11111423,
    hull: 3292262,
    hullShade: 2304845,
    /**
     * The midnight suit is very dark (lightness 0.32): an enemy's black undersuit. The ice-blue stripe instead, so he
     * is ice blue all over, the colour of the midnight chip (violet, like its blade, matched the rainbow's purple).
     */
    trooperUndersuit: 7328511
  },
  sunset: {
    label: "Sunset",
    suit: 16742970,
    helmet: 16769976,
    stripe: 16732027,
    droid: 16751162,
    blade: 16757575,
    hull: 16771538,
    hullShade: 15251855
  },
  rainbow: {
    label: "Rainbow",
    suit: 9067760,
    helmet: 15921904,
    stripe: 9067760,
    droid: 16763955,
    blade: 8257418,
    wingPanels: [16747156, 16768878, 9235612, 9419007],
    wingStripes: [15217215, 15768090, 3124810, 3107800],
    chip: "linear-gradient(135deg, #ff4d5e, #ffcc33, #4fd36a, #3f7fe0, #8a5cf0)"
  }
});

// src/core/content/errors.js
var PackError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PackError";
  }
};
var count = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// src/core/content/palette.js
var MAX_COLORS = 255;
var MAX_RGB = 16777215;
var rgbOf = (color) => [color >> 16 & 255, color >> 8 & 255, color & 255];
var colorOf = (r, g, b) => {
  const clamp3 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return clamp3(r) << 16 | clamp3(g) << 8 | clamp3(b);
};
var scaleColor = (color, factor) => {
  const [r, g, b] = rgbOf(color);
  return colorOf(r * factor, g * factor, b * factor);
};
function colorGap(a, b) {
  const dr = (a >> 16 & 255) - (b >> 16 & 255);
  const dg = (a >> 8 & 255) - (b >> 8 & 255);
  const db = (a & 255) - (b & 255);
  return dr * dr + dg * dg + db * db;
}
var isColor = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_RGB;
function readPalette(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_COLORS || !list.every(isColor)) {
    throw new PackError(`Some of the data is damaged (a palette must be 1 to ${MAX_COLORS} colours).`);
  }
  return Object.freeze(list.slice());
}
function readEntries(list, paletteLength, what) {
  if (!Array.isArray(list) || list.length > MAX_COLORS || !list.every((v) => Number.isInteger(v) && v >= 1 && v <= paletteLength)) {
    throw new PackError(`Some of the data is damaged (its ${what} colours aren't in its palette).`);
  }
  return Object.freeze([...new Set(list)].sort((a, b) => a - b));
}
function commonest(values, none = 0) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = none;
  let bestCount = 0;
  for (const [value, n] of counts) {
    if (n > bestCount || n === bestCount && value < best) {
      best = value;
      bestCount = n;
    }
  }
  return best;
}

// src/core/content/skin-layout.js
var SKIN_WIDTH = 64;
var SKIN_HEIGHT = 64;
var LEGACY_HEIGHT = 32;
var SKIN_PARTS = Object.freeze({
  head: Object.freeze({ pixels: [8, 8, 8], base: [0, 0], overlay: [32, 0], legacy: true }),
  body: Object.freeze({ pixels: [8, 12, 4], base: [16, 16], overlay: [16, 32], legacy: true }),
  rightArm: Object.freeze({ pixels: [4, 12, 4], slimPixels: [3, 12, 4], base: [40, 16], overlay: [40, 32], legacy: true }),
  rightLeg: Object.freeze({ pixels: [4, 12, 4], base: [0, 16], overlay: [0, 32], legacy: true }),
  leftLeg: Object.freeze({ pixels: [4, 12, 4], base: [16, 48], overlay: [0, 48], legacy: false }),
  leftArm: Object.freeze({ pixels: [4, 12, 4], slimPixels: [3, 12, 4], base: [32, 48], overlay: [48, 48], legacy: false })
});
var LEGACY_OVERLAYS = Object.freeze(["head"]);
var SKIN_FACES = Object.freeze(["top", "bottom", "right", "front", "left", "back"]);
function faceRects([w, h, d], [ox, oy]) {
  return {
    top: [ox + d, oy, w, d],
    bottom: [ox + d + w, oy, w, d],
    right: [ox, oy + d, d, h],
    front: [ox + d, oy + d, w, h],
    left: [ox + d + w, oy + d, d, h],
    back: [ox + 2 * d + w, oy + d, w, h]
  };
}
var SKIN_FACE_AXES = Object.freeze({
  front: Object.freeze({ axis: 2, sign: 1, u: [0, 1], v: [1, -1] }),
  back: Object.freeze({ axis: 2, sign: -1, u: [0, -1], v: [1, -1] }),
  right: Object.freeze({ axis: 0, sign: -1, u: [2, 1], v: [1, -1] }),
  left: Object.freeze({ axis: 0, sign: 1, u: [2, -1], v: [1, -1] }),
  top: Object.freeze({ axis: 1, sign: 1, u: [0, 1], v: [2, 1] }),
  bottom: Object.freeze({ axis: 1, sign: -1, u: [0, 1], v: [2, -1] })
});
var SLIM_CLEAR_RECTS = Object.freeze([Object.freeze([50, 16, 2, 4]), Object.freeze([54, 20, 2, 12])]);

// src/core/content/thumbnails.js
var LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var MAX_ART = 16;
var CLEAR = -1;
var SHOULDERS = 20;
var ARM_TRIM = 1;
function shrunk(width, height, colorAt) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / MAX_ART));
  if (step === 1) return { width, height, colorAt };
  const w = Math.ceil(width / step);
  const h = Math.ceil(height / step);
  const colors = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const counts = /* @__PURE__ */ new Map();
      let clear = 0;
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const sx = x * step + dx;
          const sy = y * step + dy;
          if (sx >= width || sy >= height) continue;
          const color = colorAt(sx, sy);
          if (color === CLEAR) clear++;
          else counts.set(color, (counts.get(color) ?? 0) + 1);
        }
      }
      let best = CLEAR;
      let bestCount = 0;
      for (const [color, n] of counts) if (n > bestCount || n === bestCount && color < best) [best, bestCount] = [color, n];
      colors[x + y * w] = bestCount === 0 || clear > [...counts.values()].reduce((a, b) => a + b, 0) ? CLEAR : best;
    }
  }
  return { width: w, height: h, colorAt: (x, y) => colors[x + y * w] };
}
function lettered(picture) {
  const { width, height, colorAt } = shrunk(picture.width, picture.height, picture.colorAt);
  const counts = /* @__PURE__ */ new Map();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = colorAt(x, y);
    if (color !== CLEAR) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([color]) => color);
  const kept = ranked.slice(0, LETTERS.length);
  const letterOf = new Map(kept.map((color, i) => [color, LETTERS[i]]));
  for (const color of ranked.slice(LETTERS.length)) {
    const nearest = kept.reduce((best, c) => colorGap(color, c) < colorGap(color, best) ? c : best);
    letterOf.set(color, letterOf.get(nearest));
  }
  const rows = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const color = colorAt(x, y);
      row += color === CLEAR ? "." : letterOf.get(color);
    }
    rows.push(row);
  }
  return { rows, colors: Object.fromEntries(kept.map((color, i) => [LETTERS[i], cssColor(color)])) };
}
var voxelColor = (pack, value) => value ? pack.data.palette[value - 1] : CLEAR;
function topDownArt(pack, cells) {
  const [sx, sy, sz] = pack.data.size;
  return lettered({
    width: sx,
    height: sz,
    colorAt: (c, r) => {
      const i = sx - 1 - c;
      const k = sz - 1 - r;
      for (let j = sy - 1; j >= 0; j--) {
        const value = cells[i + sx * (k + sz * j)];
        if (value) return voxelColor(pack, value);
      }
      return CLEAR;
    }
  });
}
function voxelFaceArt(pack, cells, { fromFront, fromLayer = 0, trim = 0 }) {
  const [sx, sy, sz] = pack.data.size;
  return lettered({
    width: sx - 2 * trim,
    height: sy - fromLayer,
    colorAt: (column, r) => {
      const c = column + trim;
      const i = fromFront ? c : sx - 1 - c;
      const j = sy - 1 - r;
      for (let n = 0; n < sz; n++) {
        const k = fromFront ? sz - 1 - n : n;
        const value = cells[i + sx * (k + sz * j)];
        if (value) return voxelColor(pack, value);
      }
      return CLEAR;
    }
  });
}
function skinFaceArt(pack, px, { head: head2, headOverlay, body: body3, bodyOverlay }) {
  const legacy = pack.data.h === LEGACY_HEIGHT;
  const at = ([x, y]) => px[y * SKIN_WIDTH + x];
  const layered = (base, overlay) => {
    const top = overlay ? at(overlay) : 0;
    const value = top || at(base);
    return value ? pack.data.palette[value - 1] : 0;
  };
  return lettered({
    width: 8,
    height: 9,
    colorAt: (x, y) => y < 8 ? layered([head2[0] + x, head2[1] + y], [headOverlay[0] + x, headOverlay[1] + y]) : layered([body3[0] + x, body3[1]], legacy ? null : [bodyOverlay[0] + x, bodyOverlay[1]])
  });
}
var SKIN_FRONT = Object.freeze({ head: [8, 8], headOverlay: [40, 8], body: [20, 20], bodyOverlay: [20, 36] });
var SKIN_BACK = Object.freeze({ head: [24, 8], headOverlay: [56, 8], body: [32, 20], bodyOverlay: [32, 36] });
function lookArt(pack, cells, { back = false } = {}) {
  if (pack.meta.source === "skin") return skinFaceArt(pack, cells, back ? SKIN_BACK : SKIN_FRONT);
  return voxelFaceArt(pack, cells, { fromFront: !back, fromLayer: SHOULDERS, trim: ARM_TRIM });
}
function tileArt(pack, cells) {
  const size = CONTENT.block.tileSize;
  return lettered({ width: size, height: size, colorAt: (x, y) => pack.data.palette[cells.side[x + y * size] - 1] });
}

// src/core/content/kinds/define.js
var ID = /^[a-z][a-z0-9]*$/;
var FIND_IN_DRESS_UP = "look in DRESS UP";
var SOURCES = Object.freeze(["vox", "png", "pattern"]);
var NEEDS = Object.freeze(["read", "faces", "art", "describe"]);
function check(ok, message) {
  if (!ok) throw new Error(`defineContentKind: ${message}`);
}
function defineContentKind(spec) {
  const id = spec?.id;
  check(typeof id === "string" && ID.test(id), `id "${id}" must be a short lowercase word`);
  check(typeof spec.label === "string" && spec.label.length > 0, `${id} needs a label`);
  const noun = spec.noun ?? id;
  check(typeof noun === "string" && ID.test(noun), `${id}.noun must be a short lowercase word`);
  const words = [.../* @__PURE__ */ new Set([id, ...spec.words ?? []])];
  check(words.every((word) => ID.test(word)), `${id}.words must be short lowercase words`);
  check(typeof spec.arrival === "string" && spec.arrival.length > 0, `${id} needs an arrival (what the game does with a new one)`);
  check(typeof spec.cheer === "string" && spec.cheer.length > 0, `${id} needs a cheer (its NEW! pop-up's line)`);
  check(typeof spec.dressUp === "boolean", `${id}.dressUp must be true or false`);
  const find = spec.find ?? (spec.dressUp ? FIND_IN_DRESS_UP : void 0);
  check(typeof find === "string" && find.length > 0, `${id} needs find (where Charlie finds one: DRESS UP doesn't show it)`);
  for (const name of ["nameMax", "maxInstalled"]) check(Number.isInteger(spec[name]) && spec[name] > 0, `${id}.${name} must be a whole number above 0`);
  check(Number.isInteger(spec.maxFaces) && spec.maxFaces >= 0, `${id}.maxFaces must be a whole number`);
  const sources = Object.entries(spec.sources ?? {});
  check(sources.length > 0 && sources.every(([type, importer]) => SOURCES.includes(type) && typeof importer === "string"), `${id}.sources must map ${SOURCES.join(", ")} to importer names`);
  const extraFiles = spec.extraFiles ?? [];
  check(Array.isArray(extraFiles) && extraFiles.every((name) => ID.test(name)), `${id}.extraFiles must be short lowercase words`);
  const meta = Object.entries(spec.meta ?? {});
  check(meta.every(([, reader]) => typeof reader === "function"), `${id}.meta must map each key to a reader`);
  for (const name of NEEDS) check(typeof spec[name] === "function", `${id} needs ${name}()`);
  return Object.freeze({
    id,
    label: spec.label,
    noun,
    words: Object.freeze(words),
    arrival: spec.arrival,
    cheer: spec.cheer,
    dressUp: spec.dressUp,
    find,
    nameMax: spec.nameMax,
    maxInstalled: spec.maxInstalled,
    maxFaces: spec.maxFaces,
    sources: Object.freeze(Object.fromEntries(sources)),
    extraFiles: Object.freeze([...extraFiles]),
    meta: Object.freeze(Object.fromEntries(meta)),
    read: spec.read,
    faces: spec.faces,
    art: spec.art,
    describe: spec.describe
  });
}

// src/core/content/block-tiles.js
var SIZE = CONTENT.block.tileSize;
var NAMED_COLORS = Object.freeze({
  red: 14693183,
  orange: 16747050,
  yellow: 16765503,
  green: 5025616,
  blue: 4161504,
  purple: 8019199,
  pink: 16736168,
  brown: 9067056,
  black: 2829619,
  white: 15921902,
  grey: 10132899,
  gold: 15909424
});
var BEVEL = Object.freeze({ light: 1.1, dark: 0.85 });
var SPECKLES = Object.freeze([
  [0.18, 0.86],
  [0.36, 0.93],
  [0.46, 1.07]
]);
var BRICK_SHADES = Object.freeze([0.94, 1, 1.05]);
var BRICK = Object.freeze({ width: 8, height: 4 });
var BAND = 4;
var PATTERNS = Object.freeze({
  plain: (color) => (x, y) => x === 0 || y === 0 ? scaleColor(color, BEVEL.light) : x === SIZE - 1 || y === SIZE - 1 ? scaleColor(color, BEVEL.dark) : color,
  speckle: (color, accent, rng) => () => {
    const roll = rng();
    const step = SPECKLES.find(([chance]) => roll < chance);
    return step ? scaleColor(color, step[1]) : color;
  },
  bricks: (color, accent, rng) => {
    const shades = /* @__PURE__ */ new Map();
    return (x, y) => {
      const row = Math.floor(y / BRICK.height);
      const shifted = x + row % 2 * (BRICK.width / 2);
      if (y % BRICK.height === BRICK.height - 1 || shifted % BRICK.width === BRICK.width - 1) return accent;
      const brick = `${row}:${Math.floor(shifted / BRICK.width)}`;
      if (!shades.has(brick)) shades.set(brick, BRICK_SHADES[Math.floor(rng() * BRICK_SHADES.length)]);
      return scaleColor(color, shades.get(brick));
    };
  },
  stripes: (color, accent) => (x, y) => Math.floor((x + y) / BAND) % 2 ? accent : color,
  dots: (color, accent) => (x, y) => {
    const shifted = x + Math.floor(y / BAND) % 2 * (BAND / 2);
    return shifted % BAND >= 1 && shifted % BAND <= 2 && y % BAND >= 1 && y % BAND <= 2 ? accent : color;
  },
  checker: (color, accent) => (x, y) => (Math.floor(x / BAND) + Math.floor(y / BAND)) % 2 ? accent : color
});
var PATTERN_NAMES = Object.freeze(Object.keys(PATTERNS));

// src/core/content/kinds/fields.js
var NOSES = Object.freeze(["+y", "-y", "+x", "-x"]);
var VOX_SIDE = 256;
var MAX_RGB2 = 16777215;
var DetailError = class extends PackError {
  constructor(key, what) {
    super(`"meta.${key}" must be ${what}.`);
    this.key = key;
    this.what = what;
  }
};
var fail = (key, what) => {
  throw new DetailError(key, what);
};
var isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
var nose = (value, key) => NOSES.includes(value) ? value : fail(key, NOSES.join(", "));
var flag = (value, key) => typeof value === "boolean" ? value : fail(key, "true or false");
var maybeFlag = (value, key) => value === null || typeof value === "boolean" ? value : fail(key, "true, false or null");
var numberFrom = (min, max) => (value, key) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fail(key, `a number from ${min} to ${max}`);
var wholeFrom = (min, max) => (value, key) => isInt(value, min, max) ? value : fail(key, `a whole number from ${min} to ${max}`);
var isVoxelPoint = (point) => Array.isArray(point) && point.length === 3 && point.every((v) => isInt(v, 0, VOX_SIDE - 1));
var voxelPoint = (value, key) => isVoxelPoint(value) ? [...value] : fail(key, "a voxel as [x, y, z], like [16, 30, 8]");
var voxelPoints = (max) => (value, key) => Array.isArray(value) && value.length >= 1 && value.length <= max && value.every(isVoxelPoint) ? value.map((p) => [...p]) : fail(key, `1 to ${max} voxels like [[3, 40, 5]]`);
var paletteNumbers = (value, key) => Array.isArray(value) && value.length <= 255 && value.every((v) => isInt(v, 1, 255)) ? [...new Set(value)].sort((a, b) => a - b) : fail(key, "palette colour numbers from 1 to 255, like [252]");
var isColor2 = (value) => isInt(value, 0, MAX_RGB2);
function pattern(value, key) {
  const plain = value && typeof value === "object" && !Array.isArray(value);
  const stray = plain ? Object.keys(value).find((k) => !["name", "color", "accent"].includes(k)) : void 0;
  if (!plain || stray !== void 0) fail(key, '{ "name", "color", "accent" }');
  if (!PATTERN_NAMES.includes(value.name)) fail(`${key}.name`, `one of ${PATTERN_NAMES.join(", ")}`);
  if (!isColor2(value.color)) fail(`${key}.color`, "a colour number from 0 to 0xFFFFFF");
  if (value.accent !== void 0 && !isColor2(value.accent)) fail(`${key}.accent`, "a colour number from 0 to 0xFFFFFF");
  return value.accent === void 0 ? { name: value.name, color: value.color } : { name: value.name, color: value.color, accent: value.accent };
}

// src/core/content/codec.js
var BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
var MAX_VARINT_BYTES = 3;
var MAX_RUN = 2 ** (7 * MAX_VARINT_BYTES) - 1;
var decodedLength = (text) => text.length / 4 * 3 - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0);
function bytesFromBase64(text, expectBytes = Infinity) {
  if (typeof text !== "string" || text.length % 4 !== 0 || !BASE64.test(text)) throw new PackError("Some of the data is damaged (it isn't base64).");
  if (decodedLength(text) > expectBytes) throw new PackError(`That file is too big (${Math.ceil(decodedLength(text) / 1024)} KB; the most is ${Math.floor(expectBytes / 1024)} KB).`);
  let binary;
  try {
    binary = atob(text);
  } catch {
    throw new PackError("Some of the data is damaged (it isn't base64).");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function decodeGrid(bytes, cellCount, maxValue, maxCells = cellCount) {
  if (!Number.isInteger(cellCount) || cellCount < 1 || cellCount > maxCells) throw new PackError("That grid is bigger than allowed.");
  const damaged2 = () => new PackError("Some of the data is damaged (the grid doesn't add up).");
  const cells = new Uint8Array(cellCount);
  let at = 0;
  let filled = 0;
  while (at < bytes.length) {
    let run = 0;
    let shift = 0;
    let more = true;
    for (let k = 0; more; k++) {
      if (k >= MAX_VARINT_BYTES || at >= bytes.length) throw damaged2();
      const byte = bytes[at++];
      run |= (byte & 127) << shift;
      shift += 7;
      more = (byte & 128) !== 0;
    }
    if (at >= bytes.length || run < 1 || filled + run > cellCount) throw damaged2();
    const value = bytes[at++];
    if (value > maxValue) throw new PackError("Some of the data is damaged (a colour is missing from its palette).");
    if (value) cells.fill(value, filled, filled + run);
    filled += run;
  }
  if (filled !== cellCount) throw damaged2();
  return cells;
}

// src/core/content/kinds/readers.js
var damaged = (what) => new PackError(`That pack is damaged (${what}).`);
function readSize(size, max) {
  if (!Array.isArray(size) || size.length !== 3 || !size.every((v, a) => Number.isInteger(v) && v >= 1 && v <= max[a])) throw damaged("its size is outside what is allowed");
  return Object.freeze([...size]);
}
function readCells(text, cellCount, paletteLength, maxCells = cellCount) {
  return decodeGrid(bytesFromBase64(text, CONTENT.maxPackBytes), cellCount, paletteLength, maxCells);
}
var POINT_SLACK = 1;
function readPoint(point, size) {
  const ok = Array.isArray(point) && point.length === 3 && point.every((v, a) => typeof v === "number" && Number.isFinite(v) && v >= -POINT_SLACK && v <= size[a] + POINT_SLACK);
  if (!ok) throw damaged("a point is outside its model");
  return Object.freeze([...point]);
}
function readPoints(list, size, max) {
  if (list === null || list === void 0) return null;
  if (!Array.isArray(list) || list.length < 1 || list.length > max) throw damaged(`it has more than ${max} points of a kind`);
  return Object.freeze(list.map((point) => readPoint(point, size)));
}
function numberWithin(value, [min, max], fallback) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

// src/core/content/kinds/block.js
var BLOCK2 = CONTENT.block;
var TILE_CELLS = BLOCK2.tileSize * BLOCK2.tileSize;
var HARDNESS = Object.freeze({ min: 1, max: 3, usual: 1 });
function readTile(text, paletteLength, optional) {
  if (optional && (text === null || text === void 0)) return null;
  const cells = readCells(text, TILE_CELLS, paletteLength);
  if (cells.includes(0)) throw damaged("a block tile has see-through pixels");
  return cells;
}
var BLOCK_KIND = defineContentKind({
  id: "block",
  label: "Block",
  arrival: "it goes straight into his hand",
  cheer: "New blocks from Dad!",
  dressUp: false,
  find: "build with the new blocks",
  nameMax: BLOCK2.nameMax,
  maxInstalled: BLOCK2.maxInstalled,
  maxFaces: 0,
  sources: { png: "blockPicture", pattern: "blockPattern" },
  extraFiles: ["top", "bottom"],
  meta: { hardness: wholeFrom(HARDNESS.min, HARDNESS.max), glow: flag, pattern },
  read(meta, data) {
    const blockId = data.blockId === null || data.blockId === void 0 ? null : data.blockId;
    if (blockId !== null && !isPackBlockId(blockId)) throw damaged("its block number is outside the packs' range");
    const palette2 = readPalette(data.palette);
    const tiles2 = { side: readTile(data.side, palette2.length, false), top: readTile(data.top, palette2.length, true), bottom: readTile(data.bottom, palette2.length, true) };
    const hardness = Number.isInteger(meta.hardness) && meta.hardness >= HARDNESS.min && meta.hardness <= HARDNESS.max ? meta.hardness : HARDNESS.usual;
    return {
      meta: { hardness, glow: meta.glow === true },
      data: { blockId, palette: palette2, side: data.side, top: tiles2.top ? data.top : null, bottom: tiles2.bottom ? data.bottom : null },
      cells: Object.freeze(tiles2)
    };
  },
  faces: () => 0,
  art: tileArt,
  describe(pack) {
    const faces = ["sides", pack.data.top ? "top" : null, pack.data.bottom ? "bottom" : null].filter(Boolean).join(", ");
    return `${BLOCK2.tileSize}\xD7${BLOCK2.tileSize} tiles (${faces}), ${pack.meta.hardness === 1 ? "1 hit" : `${pack.meta.hardness} hits`} to break${pack.meta.glow ? ", glows" : ""}${pack.data.blockId === null ? "" : `, block ${pack.data.blockId}`}`;
  }
});

// src/core/humanoid-shape.js
var RIG = Object.freeze({ hipY: 0.78, hipX: 0.15, shoulderY: 1.36, shoulderX: 0.42 });
var shape = (size, at) => Object.freeze({ size: Object.freeze(size), at: Object.freeze(at) });
var SHAPES = Object.freeze({
  torso: shape([0.62, 0.6, 0.34], [0, 1.07, 0]),
  thigh: shape([0.27, 0.62, 0.3], [0, -0.31, 0]),
  upperArm: shape([0.2, 0.5, 0.22], [0, -0.25, 0]),
  hand: shape([0.21, 0.14, 0.23], [0, -0.56, 0])
});
var TORSO_TOP = SHAPES.torso.at[1] + SHAPES.torso.size[1] / 2;
var ARM_REACH = -SHAPES.hand.at[1] + SHAPES.hand.size[1] / 2;
var SKIN_HEAD = 0.5;
var SKIN_ARM_WIDTH = SHAPES.upperArm.size[0];
var SLIM_ARM_WIDTH = 0.15;
var SKIN_LEG_WIDTH = 0.28;
var SKIN_BOXES = Object.freeze({
  head: shape([SKIN_HEAD, SKIN_HEAD, SKIN_HEAD], [0, TORSO_TOP + SKIN_HEAD / 2, 0]),
  torso: SHAPES.torso,
  leg: shape([SKIN_LEG_WIDTH, RIG.hipY, SHAPES.thigh.size[2]], [0, -RIG.hipY / 2, 0]),
  arm: shape([SKIN_ARM_WIDTH, ARM_REACH, SHAPES.upperArm.size[2]], [0, -ARM_REACH / 2, 0]),
  slimArm: shape([SLIM_ARM_WIDTH, ARM_REACH, SHAPES.upperArm.size[2]], [0, -ARM_REACH / 2, 0])
});

// src/core/content/grid.js
var cellIndex = (size, x, y, z) => x + size[0] * (z + size[2] * y);
function filledCount(cells) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i]) n++;
  return n;
}

// src/core/content/mesh-arrays.js
var UINT16_VERTICES = 65536;
var EMPTY_ARRAYS = Object.freeze({ positions: new Float32Array(0), colors: new Float32Array(0), indices: new Uint16Array(0) });
var quadCount = (arrays) => arrays.indices.length / 6;
var indexArray = (vertices, length) => vertices > UINT16_VERTICES ? new Uint32Array(length) : new Uint16Array(length);
function joinArrays(list) {
  const vertices = list.reduce((sum, a) => sum + a.positions.length / 3, 0);
  const positions = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  const indices = indexArray(vertices, list.reduce((sum, a) => sum + a.indices.length, 0));
  let vertex = 0;
  let index = 0;
  for (const arrays of list) {
    positions.set(arrays.positions, vertex * 3);
    colors.set(arrays.colors, vertex * 3);
    for (let i = 0; i < arrays.indices.length; i++) indices[index + i] = arrays.indices[i] + vertex;
    vertex += arrays.positions.length / 3;
    index += arrays.indices.length;
  }
  return { positions, colors, indices };
}
var MIRRORED_CORNER = Object.freeze([0, 3, 2, 1]);
function mirrorArrays({ positions, colors, indices }) {
  const flipped = new Float32Array(positions.length);
  const tinted = new Float32Array(colors.length);
  for (let quad = 0; quad < positions.length / 12; quad++) {
    MIRRORED_CORNER.forEach((from, to) => {
      const source = quad * 12 + from * 3;
      const target = quad * 12 + to * 3;
      flipped.set([-positions[source], positions[source + 1], positions[source + 2]], target);
      tinted.set(colors.subarray(source, source + 3), target);
    });
  }
  return { positions: flipped, colors: tinted, indices: indices.slice() };
}

// src/core/cube-faces.js
var SIDE_UV = [[1, 0], [1, 1], [0, 1], [0, 0]];
var FLAT_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
var CUBE_FACES = Object.freeze([
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: SIDE_UV, shade: 0.82 },
  { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: SIDE_UV, shade: 0.82 },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: FLAT_UV, shade: 1 },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: FLAT_UV, shade: 0.55 },
  { n: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], uv: SIDE_UV, shade: 0.92 },
  { n: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: SIDE_UV, shade: 0.72 }
]);

// src/core/content/rect-merge.js
function mergeRects(mask, width, height, emit) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; ) {
      const key = mask[x + y * width];
      if (!key) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < width && mask[x + w + y * width] === key) w++;
      let h = 1;
      grow: while (y + h < height) {
        const row = (y + h) * width;
        for (let k = 0; k < w; k++) if (mask[x + k + row] !== key) break grow;
        h++;
      }
      for (let j = 0; j < h; j++) mask.fill(0, x + (y + j) * width, x + w + (y + j) * width);
      emit(x, y, w, h, key);
      x += w;
    }
  }
}

// src/core/content/voxel-mesh.js
var QUAD_INTS = 8;
function table(entries) {
  const flags = new Uint8Array(256);
  for (const value of entries) flags[value] = 1;
  return flags;
}
var keepTable = (keep) => Uint8Array.from({ length: 256 }, (_, value) => value && (!keep || keep(value)) ? 1 : 0);
function eachQuad(grid, glass, keep, emit) {
  const { size, cells } = grid;
  const strides = [1, size[0] * size[2], size[0]];
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  CUBE_FACES.forEach((face, f) => {
    const a = face.n.findIndex((v2) => v2 !== 0);
    const sign = face.n[a];
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    const width = size[u];
    const height = size[v];
    const mask = new Int32Array(width * height);
    for (let d = 0; d < size[a]; d++) {
      const beside = d + sign >= 0 && d + sign < size[a];
      let filled = false;
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          const at = d * strides[a] + i * strides[u] + j * strides[v];
          const value = cells[at];
          if (!value || !keep[value]) continue;
          const next = beside ? cells[at + sign * strides[a]] : 0;
          const open = !next || !keep[next] || glass[next] && !glass[value];
          if (open) {
            mask[i + j * width] = value;
            filled = true;
          }
        }
      }
      if (!filled) continue;
      mergeRects(mask, width, height, (i, j, w, h, value) => {
        lo[a] = d;
        hi[a] = d + 1;
        lo[u] = i;
        hi[u] = i + w;
        lo[v] = j;
        hi[v] = j + h;
        emit(f, lo, hi, value);
      });
    }
  });
}
function collectQuads(grid, glass, keep) {
  const lists = { opaque: [], glass: [] };
  eachQuad(grid, glass, keep, (f, lo, hi, value) => lists[glass[value] ? "glass" : "opaque"].push(f, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], value));
  return lists;
}
function buildArrays(quads, { palette: palette2, glow, scale, origin }) {
  const count2 = quads.length / QUAD_INTS;
  const positions = new Float32Array(count2 * 12);
  const colors = new Float32Array(count2 * 12);
  const indices = indexArray(count2 * 4, count2 * 6);
  for (let q = 0; q < count2; q++) {
    const at = q * QUAD_INTS;
    const face = CUBE_FACES[quads[at]];
    const value = quads[at + 7];
    const color = palette2[value - 1];
    const shade = glow[value] ? 1 : face.shade;
    const r = (color >> 16 & 255) / 255 * shade;
    const g = (color >> 8 & 255) / 255 * shade;
    const b = (color & 255) / 255 * shade;
    face.corners.forEach((corner, k) => {
      const p = (q * 4 + k) * 3;
      for (let axis = 0; axis < 3; axis++) {
        const cell = corner[axis] ? quads[at + 4 + axis] : quads[at + 1 + axis];
        positions[p + axis] = origin[axis] + cell * scale;
      }
      colors[p] = r;
      colors[p + 1] = g;
      colors[p + 2] = b;
    });
    const vertex = q * 4;
    const index = q * 6;
    indices[index] = vertex;
    indices[index + 1] = vertex + 1;
    indices[index + 2] = vertex + 2;
    indices[index + 3] = vertex;
    indices[index + 4] = vertex + 2;
    indices[index + 5] = vertex + 3;
  }
  return { positions, colors, indices };
}
function meshGrid(grid, { palette: palette2, glow = [], glass = [], scale = 1, origin = [0, 0, 0], keep = null } = {}) {
  const quads = collectQuads(grid, table(glass), keepTable(keep));
  const options = { palette: palette2, glow: table(glow), scale, origin };
  const faceCount = (quads.opaque.length + quads.glass.length) / QUAD_INTS;
  return { opaque: buildArrays(quads.opaque, options), glass: quads.glass.length ? buildArrays(quads.glass, options) : null, faceCount };
}
function countFaces(grid, { glass = [], keep = null } = {}) {
  let faces = 0;
  eachQuad(grid, table(glass), keepTable(keep), () => faces++);
  return faces;
}

// src/core/content/character-split.js
var [WIDTH, HEIGHT, DEPTH] = CONTENT.character.template;
var VOXEL = CONTENT.character.voxelSize;
var CHARACTER_REGIONS = Object.freeze({
  armColumns: 4,
  legSplit: 9,
  legTop: 11,
  headFrom: 22,
  armLowest: 6,
  /** For the first-person hands: the arm's sleeve is its commonest colour in these layers (the upper arm)... */
  sleeveLayers: Object.freeze([12, 21]),
  /** ...and its glove the commonest in its lowest few occupied layers. */
  gloveLayers: 3
});
var COCKPIT_SCALE = 0.72;
var COCKPIT_AT = Object.freeze([0, 0.78, 0.55]);
var CANOPY = Object.freeze({ x: 0.45, yMin: 0.55, yMax: 1.09, zMin: -0.14, zMax: 1.42 });
var { armColumns, legSplit, legTop, headFrom } = CHARACTER_REGIONS;
function partOf(c, r) {
  if (c < armColumns) return "gunArm";
  if (c >= WIDTH - armColumns) return "swordArm";
  if (r <= legTop) return c < legSplit ? "rightLeg" : "leftLeg";
  return "torsoHead";
}
var PIVOTS = Object.freeze({
  torsoHead: [0, 0, 0],
  rightLeg: [-RIG.hipX, RIG.hipY, 0],
  leftLeg: [RIG.hipX, RIG.hipY, 0],
  gunArm: [-RIG.shoulderX, RIG.shoulderY, 0],
  swordArm: [RIG.shoulderX, RIG.shoulderY, 0]
});
var bodyCorner = (c, r, d) => [(c - WIDTH / 2) * VOXEL, r * VOXEL, (d - DEPTH / 2) * VOXEL];
function cropWhere(cells, take) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-1, -1, -1];
  for (let r = 0; r < HEIGHT; r++) {
    for (let d = 0; d < DEPTH; d++) {
      for (let c = 0; c < WIDTH; c++) {
        if (!cells[cellIndex([WIDTH, HEIGHT, DEPTH], c, r, d)] || !take(c, r, d)) continue;
        [c, r, d].forEach((v, a) => {
          low[a] = Math.min(low[a], v);
          high[a] = Math.max(high[a], v);
        });
      }
    }
  }
  if (high[0] < 0) return null;
  const size = [0, 1, 2].map((a) => high[a] - low[a] + 1);
  const part = new Uint8Array(size[0] * size[1] * size[2]);
  for (let r = low[1]; r <= high[1]; r++) {
    for (let d = low[2]; d <= high[2]; d++) {
      for (let c = low[0]; c <= high[0]; c++) {
        const value = cells[cellIndex([WIDTH, HEIGHT, DEPTH], c, r, d)];
        if (value && take(c, r, d)) part[cellIndex(size, c - low[0], r - low[1], d - low[2])] = value;
      }
    }
  }
  return { size, cells: part, low };
}
function armColors(cells) {
  const arm = [];
  for (let r = 0; r < HEIGHT; r++) {
    for (let d = 0; d < DEPTH; d++) {
      for (let c = 0; c < armColumns; c++) {
        const value = cells[cellIndex([WIDTH, HEIGHT, DEPTH], c, r, d)];
        if (value) arm.push({ r, value });
      }
    }
  }
  const [from, to] = CHARACTER_REGIONS.sleeveLayers;
  const lowest = arm.length ? arm[0].r : 0;
  return {
    sleeve: commonest(arm.filter(({ r }) => r >= from && r <= to).map(({ value }) => value)) || commonest(arm.map(({ value }) => value)),
    glove: commonest(arm.filter(({ r }) => r < lowest + CHARACTER_REGIONS.gloveLayers).map(({ value }) => value))
  };
}
function characterArmColors(cells, palette2) {
  const { sleeve, glove } = armColors(cells);
  return { sleeve: sleeve ? palette2[sleeve - 1] : null, glove: glove ? palette2[glove - 1] : null };
}
function splitCharacter(cells) {
  const parts = {};
  for (const name of Object.keys(PIVOTS)) {
    const part = cropWhere(cells, (c, r) => partOf(c, r) === name);
    if (!part) {
      parts[name] = null;
      continue;
    }
    const corner = bodyCorner(...part.low);
    parts[name] = { size: part.size, cells: part.cells, origin: corner.map((v, a) => v - PIVOTS[name][a]) };
  }
  const head2 = cropWhere(cells, (c, r) => partOf(c, r) === "torsoHead" && r >= headFrom);
  return { parts, head: head2, ...armColors(cells) };
}
function characterFaces(cells) {
  const { parts } = splitCharacter(cells);
  return Object.values(parts).reduce((sum, part) => sum + (part ? countFaces(part) : 0), 0);
}
function armsTooLong(cells) {
  for (let r = 0; r < CHARACTER_REGIONS.armLowest; r++) {
    for (let d = 0; d < DEPTH; d++) {
      for (let c = 0; c < WIDTH; c++) if ((c < armColumns || c >= WIDTH - armColumns) && cells[cellIndex([WIDTH, HEIGHT, DEPTH], c, r, d)]) return true;
    }
  }
  return false;
}
function cockpitPlacement(head2) {
  let scale = VOXEL * COCKPIT_SCALE;
  const half = (a) => head2.size[a] * scale / 2;
  const room = Math.min(1, CANOPY.x / half(0), (COCKPIT_AT[1] - CANOPY.yMin) / half(1), (CANOPY.yMax - COCKPIT_AT[1]) / half(1), (COCKPIT_AT[2] - CANOPY.zMin) / half(2), (CANOPY.zMax - COCKPIT_AT[2]) / half(2));
  scale *= room;
  return { scale, origin: [0, 1, 2].map((a) => COCKPIT_AT[a] - head2.size[a] * scale / 2) };
}
function characterArrays({ cells, palette: palette2, glow = [] }) {
  const { parts, head: head2, sleeve, glove } = splitCharacter(cells);
  let faceCount = 0;
  const mesh = (part) => {
    if (!part) return EMPTY_ARRAYS;
    const built = meshGrid(part, { palette: palette2, glow, scale: VOXEL, origin: part.origin });
    faceCount += built.faceCount;
    return built.opaque;
  };
  const arrays = {
    torsoHead: mesh(parts.torsoHead),
    legs: [mesh(parts.rightLeg), mesh(parts.leftLeg)],
    gunArm: mesh(parts.gunArm),
    swordArm: mesh(parts.swordArm)
  };
  let cockpitHead = EMPTY_ARRAYS;
  if (head2) {
    const { scale, origin } = cockpitPlacement(head2);
    cockpitHead = meshGrid(head2, { palette: palette2, glow, scale, origin }).opaque;
  }
  return { ...arrays, cockpitHead, faceCount, sleeve: sleeve ? palette2[sleeve - 1] : null, glove: glove ? palette2[glove - 1] : null };
}

// src/core/content/pack-cells.js
var CELLS = /* @__PURE__ */ new WeakMap();
function packCells(pack) {
  const cells = CELLS.get(pack);
  if (!cells) throw new Error(`Content pack ${pack?.id}: read it with readPack first.`);
  return cells;
}
var packGrid = (pack) => ({ size: pack.data.size, cells: packCells(pack) });

// src/core/content/skin-faces.js
var HEAD_OVERLAY = 0.03;
var LIMB_OVERLAY = 0.015;
var COCKPIT_HEAD = 0.36;
var COCKPIT_OVERLAY = 0.04;
var COCKPIT_AT2 = Object.freeze([0, 0.78, 0.55]);
var BLACK_KEY = 256;
var cubeFace = (axis, sign) => CUBE_FACES[axis * 2 + (sign > 0 ? 0 : 1)];
function quadSink() {
  const positions = [];
  const colors = [];
  let quads = 0;
  return {
    get quads() {
      return quads;
    },
    /** `corners`: 4 points, counter-clockwise seen from outside; `color` 0xRRGGBB lit by `shade`. */
    add(corners, color, shade) {
      for (const corner of corners) {
        positions.push(corner[0], corner[1], corner[2]);
        colors.push((color >> 16 & 255) / 255 * shade, (color >> 8 & 255) / 255 * shade, (color & 255) / 255 * shade);
      }
      quads++;
    },
    arrays() {
      const indices = new Uint16Array(quads * 6);
      for (let q = 0; q < quads; q++) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
      return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), indices };
    }
  };
}
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function boxBounds({ size, at }, grow = [[0, 0], [0, 0], [0, 0]]) {
  return {
    min: [0, 1, 2].map((a) => at[a] - size[a] / 2 - grow[a][0]),
    max: [0, 1, 2].map((a) => at[a] + size[a] / 2 + grow[a][1])
  };
}
var evenly = (g) => [[g, g], [g, g], [g, g]];
function addBox(sink, skin, { pixels, texture, bounds, overlay, skip = [] }) {
  const rects = faceRects(pixels, texture);
  const { min, max } = bounds;
  for (const name of SKIN_FACES) {
    if (skip.includes(name)) continue;
    const [rx, ry, fw, fh] = rects[name];
    const { axis, sign, u, v } = SKIN_FACE_AXES[name];
    const mask = new Int32Array(fw * fh);
    for (let py = 0; py < fh; py++) {
      for (let px = 0; px < fw; px++) {
        const value = skin.px[(ry + py) * SKIN_WIDTH + rx + px];
        mask[px + py * fw] = value || (overlay ? 0 : BLACK_KEY);
      }
    }
    const along = ([a, dir], t) => dir > 0 ? min[a] + t * (max[a] - min[a]) : max[a] - t * (max[a] - min[a]);
    const point = (pu, pv) => {
      const p = [0, 0, 0];
      p[axis] = sign > 0 ? max[axis] : min[axis];
      p[u[0]] = along(u, pu / fw);
      p[v[0]] = along(v, pv / fh);
      return p;
    };
    const lit = cubeFace(axis, sign);
    mergeRects(mask, fw, fh, (x, y, w, h, key) => {
      const corners = [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)];
      const normal = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
      if (normal[axis] * sign < 0) corners.reverse();
      sink.add(corners, key === BLACK_KEY ? 0 : skin.palette[key - 1], lit.shade);
    });
  }
}
function partArrays(skin, name, box, { grow, skip = [], overlaySkip = skip, overlayGrow = evenly(grow) } = {}) {
  const part = SKIN_PARTS[name];
  const pixels = skin.slim && part.slimPixels ? part.slimPixels : part.pixels;
  const sink = quadSink();
  addBox(sink, skin, { pixels, texture: part.base, bounds: boxBounds(box), overlay: false, skip });
  const legacy = skin.height === LEGACY_HEIGHT;
  if (!legacy || LEGACY_OVERLAYS.includes(name)) addBox(sink, skin, { pixels, texture: part.overlay, bounds: boxBounds(box, overlayGrow), overlay: true, skip: overlaySkip });
  return sink;
}
var SLEEVE_ROWS = 8;
var GLOVE_ROWS = 3;
function skinArmColors(skin) {
  const part = SKIN_PARTS.rightArm;
  const pixels = skin.slim ? part.slimPixels : part.pixels;
  const [bx, by, width, height] = faceRects(pixels, part.base).front;
  const overlay = skin.height === LEGACY_HEIGHT ? null : faceRects(pixels, part.overlay).front;
  const colorAt = (x, y) => {
    const top = overlay ? skin.px[(overlay[1] + y) * SKIN_WIDTH + overlay[0] + x] : 0;
    const value = top || skin.px[(by + y) * SKIN_WIDTH + bx + x];
    return value ? skin.palette[value - 1] : 0;
  };
  const rows = (from, to) => {
    const colors = [];
    for (let y = from; y < to; y++) for (let x = 0; x < width; x++) colors.push(colorAt(x, y));
    return colors;
  };
  return { sleeve: commonest(rows(0, SLEEVE_ROWS)), glove: commonest(rows(height - GLOVE_ROWS, height)) };
}
function skinFaces(skin) {
  const legacy = skin.height === LEGACY_HEIGHT;
  const arm = skin.slim ? SKIN_BOXES.slimArm : SKIN_BOXES.arm;
  const torsoHead = joinArrays([
    partArrays(skin, "head", SKIN_BOXES.head, { grow: HEAD_OVERLAY }).arrays(),
    partArrays(skin, "body", SKIN_BOXES.torso, { grow: LIMB_OVERLAY }).arrays()
  ]);
  const legOptions = { grow: LIMB_OVERLAY, skip: ["top"], overlaySkip: ["top", "bottom"], overlayGrow: [[LIMB_OVERLAY, LIMB_OVERLAY], [0, LIMB_OVERLAY], [LIMB_OVERLAY, LIMB_OVERLAY]] };
  const rightLeg = partArrays(skin, "rightLeg", SKIN_BOXES.leg, legOptions).arrays();
  const leftLeg = legacy ? mirrorArrays(rightLeg) : partArrays(skin, "leftLeg", SKIN_BOXES.leg, legOptions).arrays();
  const gunArm = partArrays(skin, "rightArm", arm, { grow: LIMB_OVERLAY }).arrays();
  const swordArm = legacy ? mirrorArrays(gunArm) : partArrays(skin, "leftArm", arm, { grow: LIMB_OVERLAY }).arrays();
  const cockpitBox = { size: [COCKPIT_HEAD, COCKPIT_HEAD, COCKPIT_HEAD], at: COCKPIT_AT2 };
  const cockpitHead = partArrays(skin, "head", cockpitBox, { grow: COCKPIT_OVERLAY / 2 }).arrays();
  return {
    torsoHead,
    legs: [rightLeg, leftLeg],
    gunArm,
    swordArm,
    cockpitHead,
    faceCount: [torsoHead, rightLeg, leftLeg, gunArm, swordArm].reduce((sum, arrays) => sum + quadCount(arrays), 0)
  };
}

// src/core/content/kinds/character.js
var CHARACTER = CONTENT.character;
var TEMPLATE = CHARACTER.template;
var skinOf = (pack, cells) => ({ width: pack.data.w, height: pack.data.h, palette: pack.data.palette, px: cells, slim: pack.meta.slim });
var SOURCES2 = Object.freeze({
  skin: Object.freeze({
    read(meta, data) {
      if (data.w !== SKIN_WIDTH || data.h !== SKIN_HEIGHT && data.h !== LEGACY_HEIGHT) throw damaged("a skin is 64\xD764 or 64\xD732");
      const palette2 = readPalette(data.palette);
      const cells = readCells(data.px, data.w * data.h, palette2.length);
      const slim = data.h === SKIN_HEIGHT && meta.slim === true;
      return { meta: { source: "skin", slim }, data: { w: data.w, h: data.h, palette: palette2, px: data.px }, cells };
    },
    faces: (pack, cells) => skinFaces(skinOf(pack, cells)).faceCount,
    describe: (pack) => `a ${pack.data.w}\xD7${pack.data.h} skin with ${pack.meta.slim ? "thin" : "wide"} arms`,
    arrays: (pack, cells) => skinFaces(skinOf(pack, cells)),
    armColors: (pack, cells) => skinArmColors(skinOf(pack, cells))
  }),
  voxel: Object.freeze({
    read(meta, data) {
      if (!Array.isArray(data.size) || data.size.join() !== TEMPLATE.join()) throw damaged(`a voxel look is ${TEMPLATE.join(" \xD7 ")}`);
      const palette2 = readPalette(data.palette);
      const cells = readCells(data.grid, TEMPLATE[0] * TEMPLATE[1] * TEMPLATE[2], palette2.length);
      if (!filledCount(cells)) throw damaged("a look needs some voxels");
      if (armsTooLong(cells)) throw damaged("its arms reach below the knees");
      return { meta: { source: "voxel" }, data: { size: Object.freeze([...TEMPLATE]), palette: palette2, glow: readEntries(data.glow ?? [], palette2.length, "glowing"), grid: data.grid }, cells };
    },
    faces: (pack, cells) => characterFaces(cells),
    describe: (pack, cells) => `a voxel look, ${count(filledCount(cells))} voxels`,
    arrays: (pack, cells) => characterArrays({ cells, palette: pack.data.palette, glow: pack.data.glow }),
    armColors: (pack, cells) => characterArmColors(cells, pack.data.palette)
  })
});
var sourceOf = (pack) => SOURCES2[pack.meta.source];
var CHARACTER_KIND = defineContentKind({
  id: "character",
  label: "Look",
  noun: "look",
  words: ["look", "skin"],
  arrival: "find it in DRESS UP",
  cheer: "A new look from Dad! Find it in DRESS UP.",
  dressUp: true,
  nameMax: CHARACTER.nameMax,
  maxInstalled: CHARACTER.maxInstalled,
  maxFaces: CHARACTER.maxFaces,
  sources: { png: "skin", vox: "voxelCharacter" },
  meta: { nose, slim: maybeFlag },
  read(meta, data) {
    const source = Object.keys(SOURCES2).includes(meta.source) ? SOURCES2[meta.source] : null;
    if (!source) throw new PackError("That look was made by a newer version of the tools: update the game to wear it.");
    return source.read(meta, data);
  },
  faces: (pack, cells) => sourceOf(pack).faces(pack, cells),
  art: (pack, cells) => lookArt(pack, cells),
  describe: (pack, cells) => sourceOf(pack).describe(pack, cells)
});

// src/core/content/hat-layout.js
var HAT = CONTENT.hat;
function hatLayoutFor(grid, spin) {
  const [sx, sy, sz] = grid.size;
  const scale = Math.min(HAT.width / sx, HAT.maxWidth / sz, HAT.maxHeight / sy);
  const origin = [-sx / 2 * scale, 0, -sz / 2 * scale];
  let spinAxis = null;
  if (spin.length) {
    let x = 0;
    let z = 0;
    let n = 0;
    const turns = new Set(spin);
    for (let j = 0; j < sy; j++) {
      for (let k = 0; k < sz; k++) {
        for (let i = 0; i < sx; i++) {
          if (!turns.has(grid.cells[i + sx * (k + sz * j)])) continue;
          x += i + 0.5;
          z += k + 0.5;
          n++;
        }
      }
    }
    if (n) spinAxis = [origin[0] + x / n * scale, origin[2] + z / n * scale];
  }
  return { scale, origin, size: [sx * scale, sy * scale, sz * scale], spinAxis };
}
function hatFaces(grid, spin) {
  const turns = new Set(spin);
  return countFaces(grid, { keep: (value) => !turns.has(value) }) + (turns.size ? countFaces(grid, { keep: (value) => turns.has(value) }) : 0);
}

// src/core/content/kinds/hat.js
var HAT2 = CONTENT.hat;
var two = (value) => value.toFixed(2);
function spinning(cells, spin) {
  const turns = new Set(spin);
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (turns.has(cells[i])) n++;
  return n;
}
var HAT_KIND = defineContentKind({
  id: "hat",
  label: "Bleep's hat",
  arrival: "it goes straight on Bleep",
  cheer: "A hat for Bleep from Dad!",
  dressUp: true,
  nameMax: HAT2.nameMax,
  maxInstalled: HAT2.maxInstalled,
  maxFaces: HAT2.maxFaces,
  sources: { vox: "voxelHat" },
  meta: { nose, markers: flag, spin: paletteNumbers },
  read(meta, data) {
    const size = readSize(data.size, HAT2.maxGrid);
    const palette2 = readPalette(data.palette);
    const cells = readCells(data.grid, size[0] * size[1] * size[2], palette2.length);
    const voxels = filledCount(cells);
    if (!voxels) throw damaged("a hat needs some voxels");
    const spin = readEntries(meta.spin ?? [], palette2.length, "spinning");
    if (spinning(cells, spin) > voxels * HAT2.maxSpinShare) throw damaged("too much of it spins");
    return { meta: { spin }, data: { size, palette: palette2, glow: readEntries(data.glow ?? [], palette2.length, "glowing"), grid: data.grid }, cells };
  },
  faces: (pack, cells) => hatFaces({ size: pack.data.size, cells }, pack.meta.spin),
  art: (pack, cells) => voxelFaceArt(pack, cells, { fromFront: true }),
  describe(pack, cells) {
    const { size } = hatLayoutFor({ size: pack.data.size, cells }, pack.meta.spin);
    const turns = spinning(cells, pack.meta.spin);
    return `${count(filledCount(cells))} voxels, ${two(size[0])} wide and ${two(size[1])} tall${turns ? `; ${count(turns)} of them spin` : ""}`;
  }
});

// src/core/letter-count.js
var letterCount = (text) => Array.from(text).length;

// src/core/hulls/define.js
var RANGES = Object.freeze({
  parkHeight: [0.5, 3],
  halfLength: [1, 8.5],
  halfWidth: [1, 7],
  top: [0.3, 4],
  cameraRadius: [1, 6],
  cameraLift: [0, 3],
  boardDistance: [3, 9.6],
  shadowSize: [1, 9]
});
var MAX_PLAN_RECTS = 6;
var MAX_EXITS = 12;
var MAX_POINTS = 4;
var ID2 = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
var NAME_MAX = 16;
function check2(ok, message) {
  if (!ok) throw new Error(`defineHull: ${message}`);
}
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var isPoint = (point, size) => Array.isArray(point) && point.length === size && point.every(finite);
function checkRange(id, name, value) {
  const [min, max] = RANGES[name];
  check2(finite(value) && value >= min && value <= max, `${id}.${name} must be a number from ${min} to ${max}`);
}
function checkPoints(id, name, points) {
  if (points === null) return;
  check2(
    Array.isArray(points) && points.length >= 1 && points.length <= MAX_POINTS && points.every((point) => isPoint(point, 3)),
    `${id}.${name} must be null or 1 to ${MAX_POINTS} [x, y, z] points`
  );
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
var copyPoints = (points) => points === null ? null : points.map((point) => [...point]);
function defineHull(spec) {
  const id = spec?.id;
  check2(typeof id === "string" && ID2.test(id), `id "${id}" must be a short lowercase word`);
  check2(typeof spec.name === "string" && spec.name.length > 0 && letterCount(spec.name) <= NAME_MAX, `${id} needs a name of 1 to ${NAME_MAX} letters`);
  for (const name of ["parkHeight", "top", "cameraRadius", "boardDistance", "shadowSize"]) checkRange(id, name, spec[name]);
  const cameraLift = spec.cameraLift ?? 0;
  checkRange(id, "cameraLift", cameraLift);
  checkRange(id, "halfLength", spec.footprint?.halfLength);
  checkRange(id, "halfWidth", spec.footprint?.halfWidth);
  check2(
    Array.isArray(spec.plan) && spec.plan.length >= 1 && spec.plan.length <= MAX_PLAN_RECTS && spec.plan.every((rect) => finite(rect?.halfWidth) && rect.halfWidth > 0 && finite(rect.back) && finite(rect.front) && rect.back < rect.front),
    `${id}.plan must be 1 to ${MAX_PLAN_RECTS} { halfWidth, back, front } rectangles`
  );
  check2(
    Array.isArray(spec.exits) && spec.exits.length >= 1 && spec.exits.length <= MAX_EXITS && spec.exits.every((spot) => isPoint(spot, 2)),
    `${id}.exits must be 1 to ${MAX_EXITS} [side, forward] spots`
  );
  const cannons = spec.cannons ?? null;
  const exhausts = spec.exhausts ?? null;
  const droidSocket = spec.droidSocket ?? null;
  checkPoints(id, "cannons", cannons);
  checkPoints(id, "exhausts", exhausts);
  check2(droidSocket === null || isPoint(droidSocket, 3), `${id}.droidSocket must be null or an [x, y, z] point`);
  return deepFreeze({
    id,
    name: spec.name,
    parkHeight: spec.parkHeight,
    footprint: { halfLength: spec.footprint.halfLength, halfWidth: spec.footprint.halfWidth },
    top: spec.top,
    plan: spec.plan.map(({ halfWidth, back, front }) => ({ halfWidth, back, front })),
    cameraRadius: spec.cameraRadius,
    cameraLift,
    boardDistance: spec.boardDistance,
    exits: spec.exits.map(([side, forward]) => [side, forward]),
    shadowSize: spec.shadowSize,
    cannons: copyPoints(cannons),
    exhausts: copyPoints(exhausts),
    droidSocket: droidSocket === null ? null : [...droidSocket]
  });
}

// src/core/hulls/starfighter.js
var STARFIGHTER_HULL = defineHull({
  id: "starfighter",
  name: "Starfighter",
  parkHeight: SHIP.parkHeight,
  /** Half-length along the nose and half-width across the wings, in blocks (the wings reach about 4 out). */
  footprint: { halfLength: 5.4, halfWidth: 4.4 },
  /** The open canopy and the tail fin reach this far above the parked ship's centre. */
  top: 1.5,
  /**
   * The parked ship seen from above, in blocks from the fuselage centre (`halfWidth` across the wings, `back` and
   * `front` along the nose; see render/models/ship-model.js): the wings with their cannons, the engines, and the
   * fuselage from tail to nose.
   */
  plan: [
    { halfWidth: 4, back: -2.2, front: 2.5 },
    { halfWidth: 1.4, back: -2.5, front: 0 },
    { halfWidth: 0.6, back: -3.8, front: 5.7 }
  ],
  /** The on-foot camera stays out of this sphere round the parked ship's centre. */
  cameraRadius: 3.6,
  cameraLift: 0,
  boardDistance: PLAYER.boardDistance,
  /** Where Charlie hops out, as [sideways, forward] blocks from the centre: outside the wings and nose. */
  exits: [[5, 0], [-5, 0], [0, 7], [0, -6], [6, 5], [-6, 5]],
  shadowSize: 6.5,
  cannons: null,
  exhausts: null,
  droidSocket: null
});

// src/core/hulls/trooper-fighter.js
var TROOPER_FIGHTER_HULL = defineHull({
  ...STARFIGHTER_HULL,
  id: "trooper-fighter",
  name: "Trooper fighter",
  top: 3.65,
  cameraLift: 1.3,
  cannons: [[0.3, -0.5, 0.75], [-0.3, -0.5, 0.75]],
  exhausts: [[0.35, 0, -0.75], [-0.35, 0, -0.75]],
  droidSocket: [0, 2.07, -0.35]
});

// src/core/hulls/index.js
var BUILT_IN_HULLS = Object.freeze({
  [STARFIGHTER_HULL.id]: STARFIGHTER_HULL,
  [TROOPER_FIGHTER_HULL.id]: TROOPER_FIGHTER_HULL
});

// src/core/content/ship-layout.js
var SHIP2 = CONTENT.ship;
var PARK_HEIGHT = STARFIGHTER_HULL.parkHeight;
var STOCK = STARFIGHTER_HULL;
var PLAN_MARGIN = 0.25;
var PLAN_JOIN = 0.75;
var BOARD_REACH = 1.1;
var CAMERA_RANGE = Object.freeze([2.4, 6]);
var BOARD_MAX = 9.6;
var SHADOW_RANGE = Object.freeze([2.5, 9]);
var SEAT_ALONG = 0.6;
var SEAT_LIFT = 0.1;
var CANNON_AHEAD = 0.3;
var NARROW = 1.2;
var EXHAUST_BACK = 0.02;
var POINT_SLACK2 = 0.5;
var SOCKET_BEHIND = 1.3;
var SOCKET_LIFT = 0.17;
var SOCKET_FALLBACK = Object.freeze({ below: 0.16, behind: 0.6 });
var clamp = (value, [min, max]) => Math.max(min, Math.min(max, value));
var round1 = (value) => Math.round(value * 10) / 10;
function noteSmaller(notes, before, after, said) {
  if (round1(after) < round1(before)) notes.push(said(round1(before), round1(after)));
}
function silhouette({ size, cells }, skip = null) {
  const [sx, sy, sz] = size;
  const top = new Int16Array(sx * sz).fill(-1);
  for (let j = 0; j < sy; j++) {
    for (let k = 0; k < sz; k++) {
      for (let i = 0; i < sx; i++) {
        const cell = cells[i + sx * (k + sz * j)];
        if (cell && !skip?.has(cell)) top[i + sx * k] = j;
      }
    }
  }
  return top;
}
function hullTops(grid, glass, top) {
  if (!glass.length) return top;
  const solid = silhouette(grid, new Set(glass));
  return solid.some((layer) => layer >= 0) ? solid : top;
}
function ellipseReach([sx, , sz], top) {
  let reach2 = 0;
  for (let k = 0; k < sz; k++) {
    for (let i = 0; i < sx; i++) {
      if (top[i + sx * k] < 0) continue;
      for (const x of [i - sx / 2, i + 1 - sx / 2]) {
        for (const z of [k - sz / 2, k + 1 - sz / 2]) reach2 = Math.max(reach2, Math.hypot(z / (sz / 2), x / (sx / 2)));
      }
    }
  }
  return reach2;
}
function planOf([sx, , sz], top, scale) {
  const runs = [];
  let run = null;
  for (let k = 0; k < sz; k++) {
    let reach2 = -1;
    for (let i = 0; i < sx; i++) if (top[i + sx * k] >= 0) reach2 = Math.max(reach2, Math.abs(i - sx / 2), Math.abs(i + 1 - sx / 2));
    if (reach2 < 0) {
      run = null;
      continue;
    }
    const halfWidth = reach2 * scale + PLAN_MARGIN;
    const back = (k - sz / 2) * scale;
    const front = (k + 1 - sz / 2) * scale;
    if (run && Math.max(run.widest, halfWidth) - Math.min(run.narrowest, halfWidth) < PLAN_JOIN) {
      run.widest = Math.max(run.widest, halfWidth);
      run.narrowest = Math.min(run.narrowest, halfWidth);
      run.front = front;
    } else {
      run = { widest: halfWidth, narrowest: halfWidth, back, front };
      runs.push(run);
    }
  }
  const rects = runs.map(({ widest, back, front }) => ({ halfWidth: widest, back, front }));
  while (rects.length > SHIP2.maxPlanRects) {
    let best = 0;
    for (let n = 1; n < rects.length - 1; n++) {
      if (Math.abs(rects[n].halfWidth - rects[n + 1].halfWidth) < Math.abs(rects[best].halfWidth - rects[best + 1].halfWidth)) best = n;
    }
    const [a, b] = rects.splice(best, 2);
    rects.splice(best, 0, { halfWidth: Math.max(a.halfWidth, b.halfWidth), back: a.back, front: b.front });
  }
  return rects;
}
var centreColumns = (sx) => sx % 2 ? [(sx - 1) / 2] : [sx / 2 - 1, sx / 2];
function centreTop([sx, , sz], top, k) {
  if (k < 0 || k >= sz) return -1;
  return Math.max(...centreColumns(sx).map((i) => top[i + sx * k]));
}
function defaultSeat(size, top) {
  const [sx, , sz] = size;
  const start = Math.min(sz - 1, Math.round(SEAT_ALONG * sz));
  for (let step = 0; step < sz; step++) {
    for (const k of [start - step, start + step]) {
      const layer = centreTop(size, top, k);
      if (layer >= 0) return { x: sx / 2, surface: layer + 1, z: k + 0.5 };
    }
  }
  let best = null;
  for (let k = 0; k < sz; k++) {
    for (let i = 0; i < sx; i++) {
      if (top[i + sx * k] < 0) continue;
      const gap = Math.hypot(i + 0.5 - sx / 2, k - start);
      if (!best || gap < best.gap) best = { gap, x: i + 0.5, surface: top[i + sx * k] + 1, z: k + 0.5 };
    }
  }
  return best;
}
function bestCell({ size, cells }, pick, better) {
  const [sx, sy, sz] = size;
  let best = null;
  for (let j = 0; j < sy; j++) {
    for (let k = 0; k < sz; k++) {
      for (let i = 0; i < sx; i++) {
        if (!cells[i + sx * (k + sz * j)] || !pick(i, k)) continue;
        const cell = [i, j, k];
        if (!best || better(cell, best)) best = cell;
      }
    }
  }
  return best;
}
function defaultCannons(grid, scale) {
  const [sx, , sz] = grid.size;
  const ahead = CANNON_AHEAD / scale;
  const at = ([i, j, k]) => [i + 0.5, j + 0.5, k + 0.5 + ahead];
  const inFront = (i, k) => k + 0.5 >= sz / 2;
  const outer = (side) => (c, best) => c[0] * side > best[0] * side || c[0] === best[0] && c[2] > best[2];
  const left = bestCell(grid, inFront, outer(1));
  const right = bestCell(grid, inFront, outer(-1));
  if (sx * scale < NARROW || !left || left[0] === right[0]) {
    const nose2 = bestCell(grid, () => true, (c, best) => c[2] > best[2] || c[2] === best[2] && Math.abs(c[0] + 0.5 - sx / 2) < Math.abs(best[0] + 0.5 - sx / 2));
    return [at(nose2)];
  }
  return [at(left), at(right)];
}
function defaultExhausts({ size, cells }, scale) {
  const [sx, sy, sz] = size;
  const groups = { left: [], right: [], all: [] };
  let tail = -1;
  for (let k = 0; k < sz && tail < 0; k++) {
    for (let j = 0; j < sy; j++) {
      for (let i = 0; i < sx; i++) {
        if (!cells[i + sx * (k + sz * j)]) continue;
        tail = k;
        const centre = [i + 0.5, j + 0.5];
        groups.all.push(centre);
        if (centre[0] > sx / 2) groups.left.push(centre);
        else if (centre[0] < sx / 2) groups.right.push(centre);
      }
    }
  }
  const back = tail - EXHAUST_BACK / scale;
  const middle = (group) => [group.reduce((s, c) => s + c[0], 0) / group.length, group.reduce((s, c) => s + c[1], 0) / group.length, back];
  let low = Infinity;
  let high = -Infinity;
  for (const [x] of groups.all) {
    low = Math.min(low, x);
    high = Math.max(high, x);
  }
  if ((high - low + 1) * scale < NARROW || !groups.left.length || !groups.right.length) return [middle(groups.all)];
  return [middle(groups.left), middle(groups.right)];
}
function layoutFor(grid, meta, { id, name, glass = [] }) {
  const [sx, sy, sz] = grid.size;
  const top = silhouette(grid);
  const seatTops = hullTops(grid, glass, top);
  const notes = [];
  const asked = clamp(meta.length ?? SHIP2.defaultLength, [SHIP2.minLength, SHIP2.maxLength]);
  const along = Math.max(sx, sz);
  let scale = asked / along;
  const capped = Math.min(scale, SHIP2.maxHeight / sy, SHIP2.maxWidth / sx, SHIP2.maxLength / sz);
  noteSmaller(notes, asked, capped * along, (from, to) => `Made it smaller to fit (at most ${SHIP2.maxLength} long, ${SHIP2.maxWidth} wide and ${SHIP2.maxHeight} tall): ${from} \u2192 ${to} blocks at its longest.`);
  scale = capped;
  const reach2 = ellipseReach(grid.size, top);
  const margin = SHIP2.footprintMargin;
  const fitted = Math.min(scale, (SHIP2.maxHalfLength - margin) / (reach2 * sz / 2), (SHIP2.maxHalfWidth - margin) / (reach2 * sx / 2));
  noteSmaller(notes, scale * along, fitted * along, (from, to) => `Made it a bit smaller so Charlie can walk around it (${from} \u2192 ${to} blocks at its longest).`);
  scale = fitted;
  const halfLength = clamp(reach2 * sz * scale / 2 + margin, [SHIP2.minHalf, SHIP2.maxHalfLength]);
  const halfWidth = clamp(reach2 * sx * scale / 2 + margin, [SHIP2.minHalf, SHIP2.maxHalfWidth]);
  const origin = [-sx / 2 * scale, -PARK_HEIGHT, -sz / 2 * scale];
  const local = ([x, y, z]) => [origin[0] + x * scale, origin[1] + y * scale, origin[2] + z * scale];
  const bounds = [
    [origin[0] - POINT_SLACK2, -origin[0] + POINT_SLACK2],
    [origin[1] - POINT_SLACK2, origin[1] + sy * scale + POINT_SLACK2],
    [origin[2] - POINT_SLACK2, -origin[2] + POINT_SLACK2]
  ];
  const inside = (point) => point.map((v, a) => clamp(v, bounds[a]));
  const seatVoxels = meta.seat ?? (() => {
    const found = defaultSeat(grid.size, seatTops);
    return [found.x, found.surface + SEAT_LIFT / scale, found.z];
  })();
  const seat = inside(local(seatVoxels));
  const cannons = (meta.cannons ?? defaultCannons(grid, scale)).map((p) => inside(local(p)));
  const exhausts = (meta.exhausts ?? defaultExhausts(grid, scale)).map((p) => inside(local(p)));
  const socketZ = seat[2] - SOCKET_BEHIND;
  const socketRow = Math.floor((socketZ - origin[2]) / scale);
  const socketTop = centreTop(grid.size, seatTops, socketRow);
  const droidSocket = socketTop >= 0 ? [0, origin[1] + (socketTop + 1) * scale + SOCKET_LIFT, socketZ] : [0, seat[1] - SOCKET_FALLBACK.below, seat[2] - SOCKET_FALLBACK.behind];
  const growth = Math.max(halfLength / STOCK.footprint.halfLength, halfWidth / STOCK.footprint.halfWidth);
  const hull = defineHull({
    id,
    name,
    parkHeight: PARK_HEIGHT,
    footprint: { halfLength, halfWidth },
    top: Math.max(0.5, sy * scale - PARK_HEIGHT),
    plan: planOf(grid.size, top, scale),
    cameraRadius: clamp(STOCK.cameraRadius * growth, CAMERA_RANGE),
    cameraLift: 0,
    boardDistance: clamp(Math.max(STOCK.boardDistance, Math.max(halfLength, halfWidth) + BOARD_REACH), [STOCK.boardDistance, BOARD_MAX]),
    exits: STOCK.exits.map(([side, forward]) => [side * halfWidth / STOCK.footprint.halfWidth, forward * halfLength / STOCK.footprint.halfLength]),
    shadowSize: clamp(STOCK.shadowSize * growth, SHADOW_RANGE),
    cannons,
    exhausts,
    droidSocket: inside(droidSocket)
  });
  return { scale, origin, size: [sx * scale, sy * scale, sz * scale], hull, notes, seat };
}
var LAYOUTS = /* @__PURE__ */ new WeakMap();
function shipLayout(pack) {
  let layout = LAYOUTS.get(pack);
  if (!layout) {
    layout = Object.freeze(layoutFor(packGrid(pack), pack.meta, { id: pack.id, name: pack.name, glass: pack.data.glass }));
    LAYOUTS.set(pack, layout);
  }
  return layout;
}

// src/core/content/kinds/ship.js
var SHIP3 = CONTENT.ship;
var MAX_CELLS = SHIP3.maxGrid[0] * SHIP3.maxGrid[1] * SHIP3.maxGrid[2];
var one = (value) => value.toFixed(1);
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
var SHIP_KIND = defineContentKind({
  id: "ship",
  label: "Ship",
  arrival: "find it in DRESS UP",
  cheer: "A new ship from Dad! Find it in DRESS UP.",
  dressUp: true,
  nameMax: SHIP3.nameMax,
  maxInstalled: SHIP3.maxInstalled,
  maxFaces: SHIP3.maxFaces,
  sources: { vox: "voxelShip" },
  meta: {
    nose,
    length: numberFrom(SHIP3.minLength, SHIP3.maxLength),
    markers: flag,
    seat: voxelPoint,
    cannons: voxelPoints(SHIP3.maxCannons),
    exhausts: voxelPoints(SHIP3.maxExhausts)
  },
  read(meta, data) {
    const size = readSize(data.size, SHIP3.maxGrid);
    const palette2 = readPalette(data.palette);
    const cells = readCells(data.grid, size[0] * size[1] * size[2], palette2.length, MAX_CELLS);
    const voxels = filledCount(cells);
    if (voxels < 1 || voxels > SHIP3.maxVoxels) throw damaged(`a ship needs 1 to ${count(SHIP3.maxVoxels)} voxels`);
    return {
      meta: {
        length: numberWithin(meta.length, [SHIP3.minLength, SHIP3.maxLength], SHIP3.defaultLength),
        seat: meta.seat === null || meta.seat === void 0 ? null : readPoint(meta.seat, size),
        cannons: readPoints(meta.cannons, size, SHIP3.maxCannons),
        exhausts: readPoints(meta.exhausts, size, SHIP3.maxExhausts)
      },
      data: {
        size,
        palette: palette2,
        glow: readEntries(data.glow ?? [], palette2.length, "glowing"),
        glass: readEntries(data.glass ?? [], palette2.length, "glass"),
        grid: data.grid
      },
      cells
    };
  },
  faces: (pack, cells) => countFaces({ size: pack.data.size, cells }, { glass: pack.data.glass }),
  art: topDownArt,
  describe(pack, cells) {
    const { size, hull } = shipLayout(pack);
    const { halfLength, halfWidth } = hull.footprint;
    return [
      `${count(filledCount(cells))} voxels, ${one(size[2])} long, ${one(size[0])} wide, ${one(size[1])} tall`,
      `footprint ${one(halfLength * 2)} \xD7 ${one(halfWidth * 2)} blocks; ${plural(hull.cannons.length, "cannon")}, ${plural(hull.exhausts.length, "exhaust")}`
    ].join("; ");
  }
});

// src/core/content/index.js
var CONTENT_KINDS = Object.freeze({
  [SHIP_KIND.id]: SHIP_KIND,
  [CHARACTER_KIND.id]: CHARACTER_KIND,
  [HAT_KIND.id]: HAT_KIND,
  [BLOCK_KIND.id]: BLOCK_KIND
});
var contentKind = (id) => typeof id === "string" && hasOwn(CONTENT_KINDS, id) ? CONTENT_KINDS[id] : null;
var packArt = (pack) => contentKind(pack.kind).art(pack, packCells(pack));

// src/core/content/pack-rewards.js
var REWARDS = /* @__PURE__ */ new WeakMap();
var SAYS_BLOCK = /\bblocks?$/i;
var rewardName = (pack) => pack.kind === "block" && !SAYS_BLOCK.test(pack.name) ? `${pack.name} blocks` : pack.name;
function rewardForPack(kind, key) {
  const pack = shelfPack(kind, key);
  if (!pack) return null;
  let reward2 = REWARDS.get(pack);
  if (!reward2) {
    const block = pack.kind === "block" ? { block: pack.data.blockId } : {};
    reward2 = Object.freeze({ id: `${pack.kind}:${pack.id}`, kind: pack.kind, key: pack.id, name: rewardName(pack), art: packArt(pack), pack: true, ...block });
    REWARDS.set(pack, reward2);
  }
  return reward2;
}
function packReward(id) {
  if (typeof id !== "string") return null;
  const at = id.indexOf(":");
  return at > 0 ? rewardForPack(id.slice(0, at), id.slice(at + 1)) : null;
}

// src/core/rewards.js
var REWARD_KIND = Object.freeze({ PAINT: "paint", BLOCK: "block", HAT: "hat", CHARACTER: "character", SHIP: "ship" });
var reward = (kind, key, name, extra = {}) => Object.freeze({ id: `${kind}:${key}`, kind, key, name, ...extra });
var ALL = [
  ...Object.entries(UNLOCKABLE_PAINTS).map(([key, paint]) => reward(REWARD_KIND.PAINT, key, `${paint.label} paint`)),
  ...Object.entries(UNLOCKABLE_BLOCKS).map(([key, block]) => reward(REWARD_KIND.BLOCK, key, `${blockDef(block).name} blocks`, { block })),
  ...Object.entries(HATS).map(([key, hat]) => reward(REWARD_KIND.HAT, key, hat.name))
];
var REWARDS2 = Object.freeze(Object.fromEntries(ALL.map((r) => [r.id, r])));
function rewardById(id) {
  return typeof id === "string" && hasOwn(REWARDS2, id) ? REWARDS2[id] : packReward(id);
}

// src/live/events/unlock.js
var UNLOCK_CHOICES = Object.freeze(Object.values(REWARDS2).map((reward2) => Object.freeze({ id: reward2.id, name: reward2.name, kind: reward2.kind })));
var PRIZE_GROUPS = Object.freeze({ paint: "Ship paints", block: "Blocks", hat: "Hats for Bleep" });
var OTHER_PRIZES = "More prizes";
function unlockChoices(unlocks) {
  const choice2 = (unlock, group) => ({ value: unlock.id, text: unlock.name, group });
  const named = Object.entries(PRIZE_GROUPS).flatMap(([kind, group]) => unlocks.filter((unlock) => unlock.kind === kind).map((unlock) => choice2(unlock, group)));
  const others = unlocks.filter((unlock) => !hasOwn(PRIZE_GROUPS, unlock.kind)).map((unlock) => choice2(unlock, OTHER_PRIZES));
  return [...named, ...others];
}
var UNLOCK_EVENT = defineRemoteEvent({
  type: "unlock",
  label: "Present",
  about: "A prize (ship paint, block or hat for Bleep) with its NEW! pop-up.",
  fields: [{ option: EVENT_OPTION.UNLOCK, label: "Which present", kind: FIELD_KIND.CHOICE, required: true, choices: unlockChoices(UNLOCK_CHOICES) }],
  params: (raw) => typeof raw.unlock === "string" && rewardById(raw.unlock) ? { unlock: raw.unlock } : null,
  ready: afterBossFights,
  run(game, { unlock }) {
    if (game.discoveries.grant(unlock, REMOTE_EVENTS.giftCheer) === "owned") game.loadout.wear(rewardById(unlock));
  }
});

// src/core/missions.js
var MISSIONS = Object.freeze([
  {
    id: "crystals",
    text: "Find 5 glowing crystals",
    tip: "Drag on the left to walk. Follow the gold arrow!",
    icon: "crystal",
    event: "crystal",
    goal: 5,
    cumulative: true,
    target: "crystal"
  },
  {
    id: "board",
    text: "Climb into your starfighter",
    tip: "Walk up to your ship and tap GET IN.",
    icon: "ship",
    check: (s) => s.inShip,
    target: "ship"
  },
  {
    id: "fighters",
    text: "Blast 3 enemy fighters",
    tip: "Steer with the stick and hold FIRE. A TORPEDO costs a crystal but always finds its target!",
    icon: "fighter",
    event: "fighterDown",
    goal: 3,
    target: "fighter"
  },
  {
    id: "base",
    text: "Fly to the enemy base",
    tip: "Follow the arrow to the sandy desert.",
    icon: "base",
    check: (s) => s.distanceToBase < BASE_ARRIVAL_RADIUS,
    target: "base"
  },
  {
    id: "troopers",
    text: "Knock out 5 troopers",
    tip: "Tap LAND and hop out. Blast them, or get close and use your SWORD!",
    icon: "trooper",
    event: "trooperDown",
    goal: 5,
    target: "trooper"
  },
  {
    id: "generator",
    text: "Blast the red generator",
    doneText: "BOOM! The generator is down!",
    tip: "Blast every red block. Your ship can blast it too!",
    icon: "generator",
    event: "reactorBlock",
    goal: "reactor",
    cumulative: true,
    target: "reactor"
  },
  {
    id: "space",
    text: "Fly up into space!",
    tip: "The generator powered a space station. Push the stick up and climb!",
    icon: "station",
    check: (s) => s.inSpace,
    target: "station"
  },
  {
    id: "cells",
    text: "Blast the station's 4 power cells",
    doneText: "KABOOM! The space station is gone!",
    tip: "Shoot the glowing orange cubes on its arms. Watch out for its guns!",
    icon: "generator",
    event: "stationCell",
    goal: 4,
    cumulative: true,
    target: "cell"
  },
  {
    id: "home",
    text: "Fly home and land on your pad",
    tip: "Tap LAND over the yellow and black pad.",
    icon: "home",
    event: "landedHome",
    goal: 1,
    target: "pad"
  }
]);
var ICE_MISSIONS = Object.freeze([
  {
    id: "ice-crystals",
    text: "Find 5 ice crystals",
    tip: "They sparkle in the snow. Follow the gold arrow!",
    icon: "crystal",
    event: "crystal",
    goal: 5,
    cumulative: true,
    target: "crystal"
  },
  {
    id: "ice-troopers",
    text: "Knock out 5 snow troopers",
    tip: "Their base is past the frozen hills.",
    icon: "trooper",
    event: "trooperDown",
    goal: 5,
    target: "trooper"
  },
  {
    id: "ice-generator",
    text: "Blast the frozen generator",
    doneText: "BOOM! The generator is down!",
    tip: "Every red block has to go!",
    icon: "generator",
    event: "reactorBlock",
    goal: "reactor",
    cumulative: true,
    target: "reactor"
  }
]);
var DESERT_MISSIONS = Object.freeze([
  {
    id: "desert-fighters",
    text: "Blast 3 desert fighters",
    tip: "They guard the sky over the red sand.",
    icon: "fighter",
    event: "fighterDown",
    goal: 3,
    target: "fighter"
  },
  {
    id: "desert-crystals",
    text: "Find 5 desert crystals",
    // Fighters end with Charlie in the ship, and crystals are only picked up on foot.
    tip: "Tap LAND and hop out. Look between the cactuses!",
    icon: "crystal",
    event: "crystal",
    goal: 5,
    cumulative: true,
    target: "crystal"
  },
  {
    id: "desert-generator",
    text: "Blast the desert generator",
    doneText: "BOOM! The generator is down!",
    tip: "Land near the base and blast every red block.",
    icon: "generator",
    event: "reactorBlock",
    goal: "reactor",
    cumulative: true,
    target: "reactor"
  }
]);
var JUNGLE_MISSIONS = Object.freeze([
  {
    id: "jungle-crystals",
    text: "Find 5 jungle crystals",
    tip: "They hide under the giant trees. Bleep can help!",
    icon: "crystal",
    event: "crystal",
    goal: 5,
    cumulative: true,
    target: "crystal"
  },
  {
    id: "jungle-troopers",
    text: "Knock out 5 jungle troopers",
    tip: "Their base is in a clearing. Your SWORD works great up close!",
    icon: "trooper",
    event: "trooperDown",
    goal: 5,
    target: "trooper"
  },
  {
    id: "jungle-fighters",
    text: "Blast 3 fighters over the treetops",
    tip: "Hop in your ship and chase them!",
    icon: "fighter",
    event: "fighterDown",
    goal: 3,
    target: "fighter"
  },
  {
    id: "jungle-generator",
    text: "Blast the jungle generator",
    doneText: "BOOM! The generator is down!",
    tip: "Every red block has to go!",
    icon: "generator",
    event: "reactorBlock",
    goal: "reactor",
    cumulative: true,
    target: "reactor"
  }
]);
var MISSION_SETS = Object.freeze({ story: MISSIONS, ice: ICE_MISSIONS, desert: DESERT_MISSIONS, jungle: JUNGLE_MISSIONS });

// src/core/planets.js
var PLANETS = Object.freeze({
  home: {
    id: "home",
    name: "Green Island",
    seed: WORLD.seed,
    terrain: "island",
    sky: "day",
    missions: "story",
    /** The original island keeps the original save slot, so nothing saved before planets existed is lost. */
    saveSuffix: "",
    badge: "#4fbf4a",
    critter: "sheep",
    /** Its giant walker (core/walker-types/). */
    walker: "heavy-strider",
    /** Walkers that sometimes come back in its own walker's place: id -> chance per return visit. */
    walkerStandIns: { "crab-tank": 0.4 }
  },
  ice: {
    id: "ice",
    name: "Ice Planet",
    seed: 777,
    terrain: "ice",
    sky: "ice",
    missions: "ice",
    saveSuffix: ":ice",
    badge: "#8fd8f2",
    critter: "penguin",
    walker: "frost-mammoth"
  },
  jungle: {
    id: "jungle",
    name: "Jungle Planet",
    seed: 9090,
    terrain: "jungle",
    sky: "jungle",
    missions: "jungle",
    saveSuffix: ":jungle",
    badge: "#3fbf7a",
    critter: "frog",
    walker: "scout-hopper"
  },
  desert: {
    id: "desert",
    name: "Desert Planet",
    seed: 4242,
    terrain: "desert",
    sky: "desert",
    missions: "desert",
    saveSuffix: ":desert",
    badge: "#e08a4a",
    critter: "lizard",
    walker: "sand-skitter"
  }
});
var PLANET_ORDER = Object.freeze(["home", "ice", "jungle", "desert"]);

// src/core/lines.js
var LINES = Object.freeze({
  missionComplete: "Mission complete!",
  generatorDown: "BOOM! The generator is down!",
  stationGone: "KABOOM! The space station is gone!",
  towerDone: "What an awesome tower!",
  walkerComing: "Uh oh, a giant walker is coming!",
  walkerTip: "Blast its 3 glowing weak spots!",
  walkerTipTwo: "Blast its 2 glowing weak spots!",
  walkerDown: "KABOOM! You stopped the giant walker!",
  huntDone: "You found every crystal! Amazing!",
  bonusComplete: "Bonus complete!",
  freePlay: "Free play! Explore, build and blast.",
  bonusTower: `Bonus: build a tower ${TOWER_GOAL} blocks tall!`,
  bonusWalker: "Bonus: stop the giant walker! Blast its glowing weak spots.",
  bonusHunt: "Bonus: can you find every crystal?",
  knockedOutFell: "Whoops! Back to your landing pad.",
  knockedOutHit: "Ouch! Back to your landing pad.",
  findDryLand: "Find dry land to park on!",
  warpHint: "Tap WARP to fly to another planet!",
  needCrystals: "Collect crystals to fire torpedoes!",
  nothingToBlast: "Point at something to blast!",
  bleepFoundCrystal: "Bleep found a crystal for you!",
  voiceOn: "Voice on!",
  landToExplore: "Fly down and tap LAND to explore.",
  landFirst: "Fly down and tap LAND.",
  shipInTheWay: "Step back from your ship to build!",
  robotDropShip: "Robot drop ship incoming!",
  dropShipBlasted: "BOOM! You blasted the drop ship!",
  // The Dark Lord duel (game/duel-director.js): what the narrator says around it.
  duelIncoming: "Uh oh! A black ship is coming!",
  duelSwordTip: "Red glow? Tap SWORD!",
  duelWindupLesson: "Red glow! Tap SWORD now!",
  duelOpeningLesson: "He is open! Hit him with your SWORD!",
  duelDeflect: "Blaster shots bounce off! Use your SWORD!",
  duelBlock: "He's guarding. Wait for the red glow!",
  duelPushLesson: "Purple ring! JUMP over it!",
  duelGreatJump: "Great jump!",
  duelBleep: "Bleep zapped him! Hit him now!",
  duelWon: "You beat the Dark Lord!",
  duelWonTip: "+5 crystals!",
  duelRainbowTip: "You won the RAINBOW SWORD!",
  duelLost: "Good try! He will be back for a rematch.",
  duelFlewAway: "The Dark Lord flew away. He'll be back!",
  duelTired: "The Dark Lord got tired and flew home."
});
var PENDING_RECORDINGS = Object.freeze([]);
var CUSTOM_CLIPS = Object.freeze({
  incomingTransmission: Object.freeze({ clip: "incoming-transmission", text: "Incoming transmission!" }),
  /** A trooper's battle cry when the troopers spot Charlie. */
  trooperAlert: Object.freeze({ clip: "trooper-alert", text: "Charlie is here! Quick, get him!" })
});
var DARK_LORD = Object.freeze({
  CHALLENGE: "dark-lord-challenge",
  REMATCH: "dark-lord-rematch",
  HALFWAY: "dark-lord-halfway",
  DEFEATED: "dark-lord-defeated",
  VICTORIOUS: "dark-lord-victorious",
  RETREAT: "dark-lord-retreat"
});
var darkLordLine = (clip, { caption, text, fallbackClip = null }) => Object.freeze({ clip, text, caption, speaker: "Dark Lord", ...fallbackClip ? { fallbackClip } : {} });
var DARK_LORD_LINES = Object.freeze({
  [DARK_LORD.CHALLENGE]: darkLordLine(DARK_LORD.CHALLENGE, {
    caption: "Charlie! I am the Dark Lord. I challenge you to a sword duel!",
    text: "The Dark Lord says: Charlie, I challenge you to a sword duel!"
  }),
  [DARK_LORD.REMATCH]: darkLordLine(DARK_LORD.REMATCH, {
    caption: "We meet again, Charlie! Ready for another duel?",
    text: "The Dark Lord is back! He wants another duel!",
    fallbackClip: DARK_LORD.CHALLENGE
  }),
  [DARK_LORD.HALFWAY]: darkLordLine(DARK_LORD.HALFWAY, {
    caption: "Not bad, young pilot! Now watch out for my push!",
    text: "The Dark Lord is getting cross! Watch out for his push."
  }),
  [DARK_LORD.DEFEATED]: darkLordLine(DARK_LORD.DEFEATED, {
    caption: "You win, Charlie! You are a true sword master.",
    text: "The Dark Lord says: You win, Charlie! You are a true sword master."
  }),
  [DARK_LORD.VICTORIOUS]: darkLordLine(DARK_LORD.VICTORIOUS, {
    caption: "Ha! Good try, Charlie. Practise your sword, and I will return!",
    text: "The Dark Lord says: Good try! Practise your sword, and I will return!"
  }),
  [DARK_LORD.RETREAT]: darkLordLine(DARK_LORD.RETREAT, {
    caption: "Leaving already? Our duel is not over, Charlie!",
    text: "The Dark Lord says: Leaving already? Our duel is not over!"
  })
});
var PENDING_CLIPS = Object.freeze([]);

// src/core/walker-types/define.js
var DEFAULT_ATTACK = Object.freeze({
  /** Seconds between attacks (stretched by the automatic difficulty, plus or minus a fifth). */
  interval: 2.8,
  /** The wind-up before a shot: the walker glows at its cannon and turns to Charlie, so he can see it coming. */
  telegraph: 0.8,
  /** Slow enough to dodge: a quarter of a laser's speed. */
  boltSpeed: 16,
  /** Inside the 45-block range enemy bolts fly before fading out. */
  range: 42,
  /** Shots per attack and the seconds between them. */
  volley: 1,
  volleyGap: 0.3
});
var NO_BODY_MOTION = () => {
};
var FULL_PACE = () => 1;
function turnPoint([x, y, z], angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}
function defineWalkerType(spec) {
  const scale = spec.scale ?? 1;
  const modelYaw = spec.modelYaw ?? 0;
  const tempo = spec.tempo ?? 1;
  const toGame = (at) => Object.freeze(turnPoint(at, modelYaw).map((v) => v * scale));
  const point = ({ at, look: look2 = false, ...rest }) => Object.freeze({ ...rest, at: toGame(at), look: look2 });
  const body3 = spec.body ?? NO_BODY_MOTION;
  return Object.freeze({
    id: spec.id,
    name: spec.name,
    scale,
    modelYaw,
    tempo,
    speed: spec.groundSpeed * scale * tempo,
    pace: spec.pace ?? FULL_PACE,
    /** How the body has moved at gait clock `clock`, in game blocks: writes `out.lift`, `out.yaw`, `out.pitch`, `out.pivot`. */
    body(clock, out) {
      out.lift = 0;
      out.yaw = 0;
      out.pitch = 0;
      out.pivot = 0;
      body3(clock, out);
      out.lift *= scale;
      out.pivot *= scale;
    },
    bodyHeight: spec.bodyHeight * scale,
    turnRate: spec.turnRate,
    footprint: Object.freeze(spec.footprint.map(([x, z]) => toGame([x, 0, z]))),
    spots: Object.freeze(spec.spots.map((spot) => point({ ...spot, radius: spot.radius * scale }))),
    solids: Object.freeze(spec.solids.map((solid) => point({ ...solid, radius: solid.radius * scale }))),
    cannons: Object.freeze(spec.cannons.map(point)),
    look: spec.look ? Object.freeze({ ...spec.look, pivot: toGame(spec.look.pivot) }) : null,
    spotHealth: spec.spotHealth ?? 6,
    /** A rare visitor (see core/walker-visits.js): the chance it comes instead of a planet's own walker. */
    visitChance: spec.visitChance ?? 0,
    attack: Object.freeze({ ...DEFAULT_ATTACK, ...spec.attack }),
    colors: Object.freeze({ spark: 16757594, debris: 5593956, flare: 16757594, ...spec.colors })
  });
}

// src/core/walker-types/crab-tank.js
var LAYOUT = Object.freeze({
  hipX: 6.1,
  hipY: -0.5,
  hipZFront: 2.4,
  hipZBack: -2.2,
  /** Hips this high above the ground, so the shell's middle sits at hipHeight - hipY. */
  hipHeight: 5,
  /** Front legs point a little forward, back legs a little back (radians). */
  splay: 0.32,
  /** How far out from its hip a foot lands in mid stride. */
  footReach: 7.2,
  /** Shoulder joint of the claw on its left (+x), where its glowing pearl sits; the other claw mirrors it. */
  clawPivot: Object.freeze([5.7, 0.2, 4.5]),
  /** The cannon's glowing muzzle, in body space. */
  muzzle: Object.freeze([0, 4.75, 6.1])
});
var BODY_REST_Y = LAYOUT.hipHeight - LAYOUT.hipY;
var GAIT = Object.freeze({
  /** Steps per second. */
  stepRate: 1.1,
  /** Share of a step a foot spends in the air. */
  swingShare: 0.45,
  /** Each foot travels this far either way along the ground. */
  stride: 2
});
var GROUND_SPEED = 2 * GAIT.stride * GAIT.stepRate / (1 - GAIT.swingShare);
var body = (x, y, z) => [x, BODY_REST_Y + y, z];
var pearl = (side) => body(side * LAYOUT.clawPivot[0], LAYOUT.clawPivot[1], LAYOUT.clawPivot[2]);
var foot = (side, fore) => {
  const splay = -side * fore * LAYOUT.splay;
  const z = fore > 0 ? LAYOUT.hipZFront : LAYOUT.hipZBack;
  return [side * (LAYOUT.hipX + LAYOUT.footReach * Math.cos(splay)), z - side * LAYOUT.footReach * Math.sin(splay)];
};
var CRAB_TANK = defineWalkerType({
  id: "crab-tank",
  name: "Crab Tank",
  // Model +x is the way it scuttles; a quarter turn makes that the game's forward.
  modelYaw: -Math.PI / 2,
  groundSpeed: GROUND_SPEED,
  /** Its scuttle at full speed would outrun Charlie on foot. */
  tempo: 0.6,
  bodyHeight: BODY_REST_Y,
  turnRate: 1,
  footprint: [foot(1, 1), foot(1, -1), foot(-1, 1), foot(-1, -1)],
  spots: [
    { id: "pearl-left", at: pearl(1), radius: 2.2 },
    { id: "pearl-right", at: pearl(-1), radius: 2.2 }
  ],
  spotHealth: 8,
  solids: [
    { at: body(3.3, 0.5, 0), radius: 4.3 },
    { at: body(-3.3, 0.5, 0), radius: 4.3 },
    { at: body(9.1, 2.3, 9.2), radius: 3.3 },
    { at: body(-9.1, 2.3, 9.2), radius: 3.3 },
    { at: body(0, 4.7, 2), radius: 2.5 }
  ],
  cannons: [{ at: body(...LAYOUT.muzzle) }],
  attack: { interval: 3.2, telegraph: 0.9, boltSpeed: 14 },
  colors: { spark: 5959935, debris: 14436898, flare: 16769162 }
});

// src/core/walker-types/frost-mammoth.js
var LAYOUT2 = Object.freeze({
  /** Vent bases on the back deck and when in the puff cycle each one starts. */
  vents: Object.freeze([
    Object.freeze({ at: Object.freeze([2.9, 9.6, -2]), phase: 0 }),
    Object.freeze({ at: Object.freeze([-2.9, 9.6, -2]), phase: 0.5 }),
    Object.freeze({ at: Object.freeze([0, 9.6, -5.4]), phase: 0.25 })
  ]),
  /** The glowing core sits this far above its vent's base (on top of its steel stack). */
  ventCoreLift: 3,
  /** The middle of a core's glowing layers, above the core's own centre. */
  ventGlowMiddle: 0.45,
  headPivot: Object.freeze([0, 8, 4.8]),
  /** Where the trunk-cannon's muzzle hangs when the trunk is still (it swings about this, and steadies to fire). */
  muzzle: Object.freeze([0, 4.5, 17.4]),
  legs: Object.freeze([
    Object.freeze({ x: 3.1, z: 3.2, phase: 0 }),
    Object.freeze({ x: 3.1, z: -3.8, phase: Math.PI / 2 }),
    Object.freeze({ x: -3.1, z: 3.2, phase: Math.PI }),
    Object.freeze({ x: -3.1, z: -3.8, phase: Math.PI * 1.5 })
  ])
});
var GAIT2 = Object.freeze({
  strideSeconds: 3.4,
  /** Hips sit this far above the sole, so a planted foot touches y = 0. */
  legLength: 4.8,
  /** Radians the leg swings either side of straight down. */
  legSwing: 0.4
});
var GROUND_SPEED2 = 4 * GAIT2.legLength * Math.sin(GAIT2.legSwing) / GAIT2.strideSeconds;
var vent = ({ at: [x, y, z] }) => [x, y + LAYOUT2.ventCoreLift + LAYOUT2.ventGlowMiddle, z];
var [headX, headY, headZ] = LAYOUT2.headPivot;
var FROST_MAMMOTH = defineWalkerType({
  id: "frost-mammoth",
  name: "Frost Mammoth",
  groundSpeed: GROUND_SPEED2,
  bodyHeight: 8,
  turnRate: 0.6,
  footprint: LAYOUT2.legs.map(({ x, z }) => [x, z]),
  spots: [
    { id: "vent-left", at: vent(LAYOUT2.vents[0]), radius: 2 },
    { id: "vent-right", at: vent(LAYOUT2.vents[1]), radius: 2 },
    { id: "vent-back", at: vent(LAYOUT2.vents[2]), radius: 2 }
  ],
  solids: [
    { at: [0, 8.2, 2.6], radius: 5 },
    { at: [0, 8.2, -4.4], radius: 5 },
    { at: [0, 11.4, 2.6], radius: 3.4 },
    { at: [headX, headY, headZ + 3], radius: 3.6, look: true },
    ...LAYOUT2.legs.map(({ x, z }) => ({ at: [x, 2.4, z], radius: 2 }))
  ],
  cannons: [{ at: LAYOUT2.muzzle, look: true }],
  look: { pivot: LAYOUT2.headPivot, range: 0.5, rate: 1.2 },
  // Big, slow snowballs.
  attack: { interval: 3, telegraph: 0.9, boltSpeed: 13 },
  colors: { spark: 5231359, debris: 9222884, flare: 16757575 }
});

// src/core/walker-types/heavy-strider.js
var TAU = Math.PI * 2;
var LAYOUT3 = Object.freeze({
  /** Hips in body space: sideways, up, forward. All four legs mirror these. */
  hip: Object.freeze({ x: 3.9, y: -3.1, z: 4.9 }),
  /** How high the hips ride when standing; the hull's centre sits hip.y above this. */
  hipRestHeight: 8.3,
  neckPivot: Object.freeze([0, 3.3, 5]),
  /** The neck leans forward by this much (radians from upright) so the head juts out ahead of the front legs. */
  neckTilt: 0.95,
  neckLength: 4.7,
  /** In head space. */
  eyeAt: Object.freeze([0, 2, 6]),
  /** In body space; the other pod mirrors it. */
  podAt: Object.freeze([2.5, 5.7, -4.8]),
  /** Chin cannon pivots in head space; the barrels point along +z and end this far out. */
  cannonPivots: Object.freeze([Object.freeze([1.5, -2, 3.4]), Object.freeze([-1.5, -2, 3.4])]),
  cannonLength: 4.35
});
var BODY_REST_Y2 = LAYOUT3.hipRestHeight - LAYOUT3.hip.y;
var HEAD_PIVOT = Object.freeze([0, LAYOUT3.neckLength * Math.cos(LAYOUT3.neckTilt), LAYOUT3.neckLength * Math.sin(LAYOUT3.neckTilt)]);
var GAIT3 = Object.freeze({
  /** Seconds for every leg to complete one step. Slow on purpose: it is heavy. */
  cycleSeconds: 4,
  /** Fraction of the cycle a foot is on the ground. Over a half, so the pairs briefly overlap, like a heavy trot. */
  duty: 0.6,
  /** Half the distance a planted foot slides back under the body. */
  strideHalf: 2.4
});
var GROUND_SPEED3 = 2 * GAIT3.strideHalf / (GAIT3.duty * GAIT3.cycleSeconds);
var swayYaw = (phase) => 0.045 * Math.sin(TAU * phase + 0.4);
var EYE_NOD = 0.45;
var neck = [LAYOUT3.neckPivot[0], BODY_REST_Y2 + LAYOUT3.neckPivot[1], LAYOUT3.neckPivot[2]];
var head = [neck[0], neck[1] + HEAD_PIVOT[1], neck[2] + HEAD_PIVOT[2]];
var eye = [0, head[1] + LAYOUT3.eyeAt[1] - EYE_NOD, head[2] + LAYOUT3.eyeAt[2]];
var pod = (side) => [side * LAYOUT3.podAt[0], BODY_REST_Y2 + LAYOUT3.podAt[1], LAYOUT3.podAt[2]];
var muzzle = ([x, y, z]) => [x, head[1] + y - 0.5, head[2] + z + LAYOUT3.cannonLength];
var legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => [sx * LAYOUT3.hip.x, sz * LAYOUT3.hip.z]);
var HEAVY_STRIDER = defineWalkerType({
  id: "heavy-strider",
  name: "Heavy Strider",
  groundSpeed: GROUND_SPEED3,
  body(clock, out) {
    out.yaw = swayYaw(clock / GAIT3.cycleSeconds);
  },
  bodyHeight: BODY_REST_Y2,
  turnRate: 0.6,
  footprint: legs,
  spots: [
    { id: "eye", at: eye, radius: 2.4, look: true },
    { id: "pod-left", at: pod(1), radius: 2.2 },
    { id: "pod-right", at: pod(-1), radius: 2.2 }
  ],
  solids: [
    { at: [0, BODY_REST_Y2, 3.6], radius: 5.2 },
    { at: [0, BODY_REST_Y2, -3.6], radius: 5.2 },
    { at: [0, head[1] + 1, head[2] + 2.8], radius: 3.8, look: true },
    ...legs.map(([x, z]) => ({ at: [x, 4.5, z], radius: 2.2 }))
  ],
  cannons: LAYOUT3.cannonPivots.map((pivot) => ({ at: muzzle(pivot), look: true })),
  look: { pivot: neck, range: 0.6, rate: 1.4 },
  colors: { spark: 16757594, debris: 9147809, flare: 16757594 }
});

// src/core/walker-types/sand-skitter.js
var LAYOUT4 = Object.freeze({
  hipX: 3.8,
  hipY: 4.3,
  /** Knee relative to its hip, and the foot pad's end relative to its knee (for a leg on the +x side). */
  knee: Object.freeze([3.2, 2.5]),
  footPad: 0.3,
  /** Legs from front to back: hip z and the angle the leg points forward from straight out sideways (radians). */
  legSlots: Object.freeze([
    Object.freeze({ z: 3.1, forward: 0.8 }),
    Object.freeze({ z: 0.8, forward: 0 }),
    Object.freeze({ z: -1.5, forward: -0.8 })
  ]),
  eyesAt: Object.freeze([0, 4.95, 5]),
  turretAt: Object.freeze([0, 7.3, 1.2]),
  /** The turret's muzzle, from its pivot. */
  muzzle: Object.freeze([0, 1.2, 4.85]),
  vent: Object.freeze({ x: 1.7, y: 8.9, z: -5.3 }),
  /** A vent's glow (with its hot cap) is centred this far above the vent, and the body bobs up a little over that. */
  ventGlowMiddle: 0.6
});
var FOOT = Object.freeze([2.8, LAYOUT4.footPad - LAYOUT4.hipY - LAYOUT4.knee[1]]);
var GAIT4 = Object.freeze({
  /** Seconds for one full stride of every leg. */
  period: 1.5,
  /** Share of a stride a foot spends on the ground; a little over half, so the two tripods overlap for a moment. */
  stance: 0.58,
  /** Radians a leg swings either way about its resting angle. */
  swingAngle: 0.28
});
var GROUND_SPEED4 = 2 * GAIT4.swingAngle * (LAYOUT4.knee[0] + FOOT[0]) / (GAIT4.stance * GAIT4.period);
var reach = LAYOUT4.knee[0] + FOOT[0];
var feet = LAYOUT4.legSlots.flatMap(
  ({ z, forward }) => [1, -1].map((side) => [side * (LAYOUT4.hipX + reach * Math.cos(forward)), z + reach * Math.sin(forward)])
);
var { eyesAt, turretAt, vent: vent2 } = LAYOUT4;
var SAND_SKITTER = defineWalkerType({
  id: "sand-skitter",
  name: "Sand Skitter",
  scale: 1.2,
  groundSpeed: GROUND_SPEED4,
  /** A little slower than its scuttle at full tilt. */
  tempo: 0.8,
  bodyHeight: 5,
  turnRate: 0.9,
  footprint: feet,
  spots: [
    { id: "eyes", at: [eyesAt[0], eyesAt[1], eyesAt[2] + 0.5], radius: 2.2 },
    { id: "vent-left", at: [vent2.x, vent2.y + LAYOUT4.ventGlowMiddle, vent2.z], radius: 1.7 },
    { id: "vent-right", at: [-vent2.x, vent2.y + LAYOUT4.ventGlowMiddle, vent2.z], radius: 1.7 }
  ],
  solids: [
    { at: [0, 4.8, 1.2], radius: 3.8 },
    { at: [0, 5.2, -5.3], radius: 4.2 },
    { at: [turretAt[0], turretAt[1] + 1.3, turretAt[2]], radius: 2.2 }
  ],
  cannons: [{ at: turretAt.map((v, i) => v + LAYOUT4.muzzle[i]), look: true }],
  // The turret swivels round to find Charlie.
  look: { pivot: turretAt, range: 1.1, rate: 1.6 },
  // Slow, wobbly sand-balls.
  attack: { interval: 2.6, telegraph: 0.7, boltSpeed: 15 },
  colors: { spark: 16734770, debris: 14256442, flare: 16769658 }
});

// src/core/math.js
var clamp2 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var lerp = (a, b, t) => a + (b - a) * t;
var smoothstep = (edge0, edge1, x) => {
  const t = clamp2((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
var smooth01 = (t) => smoothstep(0, 1, t);
var fract = (v) => v - Math.floor(v);

// src/core/walker-types/scout-hopper.js
var LAYOUT5 = Object.freeze({
  /** Standing hip height: legs stay bent, so the hock (reverse knee) sticks out behind. */
  hipHeight: 4.65,
  hipSpread: 1.5,
  /** Standing ankle sits a little behind the hip because the long toes carry the weight forward. */
  ankleZ: -0.3,
  /** In body space (hip-centred). */
  headBase: Object.freeze({ y: 0.9, z: 0.4 }),
  /** In head space. */
  windowAt: Object.freeze({ y: 1.4, z: 2.42 }),
  blasterAt: Object.freeze({ x: 1.95, y: 1, z: 1.5 }),
  blasterLength: 2.65,
  /** In body space; the tank's glow sits tankGlowY above it. */
  tankAt: Object.freeze({ y: 1.2, z: -1.2 }),
  tankGlowY: 1.1
});
var GAIT5 = Object.freeze({
  /** Seconds for one full left+right step cycle: quick, like a nervous bird. */
  period: 0.8,
  /** Fraction of a cycle each foot is down. Over one half, so both feet touch for a beat at each hand-over. */
  stance: 0.6,
  halfStride: 1.6
});
var GROUND_SPEED5 = 2 * GAIT5.halfStride / (GAIT5.stance * GAIT5.period);
var LOOP = Object.freeze({
  cycle: 7,
  settleStart: 3,
  settleEnd: 3.4,
  crouchStart: 4,
  crouchEnd: 4.45,
  pushStart: 4.55,
  airStart: 4.67,
  landStart: 5.4,
  landEnd: 5.5,
  recoverEnd: 5.9,
  resumeEnd: 6.3,
  crouchDepth: 1.4,
  pushExtension: 0.45,
  hopHeight: 3.2,
  landDepth: 1,
  quiver: 0.04,
  quiverCycles: 3
});
var LEAP_PACE = 1.5;
var LEAN_STAND = 0.02;
var LEAN_WALK = 0.05;
var CROUCH_PITCH = 0.2;
var AIR_PITCH = 0.2;
var ramp = (t, a, b) => smooth01((t - a) / (b - a));
var easeOut = (x) => 1 - (1 - clamp2(x, 0, 1)) ** 2;
var loopTime = (clock) => fract(clock / LOOP.cycle) * LOOP.cycle;
function hipOffsetAt(t) {
  const L = LOOP;
  if (t < L.crouchStart) return 0;
  if (t < L.crouchEnd) return -L.crouchDepth * ramp(t, L.crouchStart, L.crouchEnd);
  if (t < L.pushStart) {
    const hold = (t - L.crouchEnd) / (L.pushStart - L.crouchEnd);
    return -L.crouchDepth + L.quiver * Math.sin(Math.PI * 2 * L.quiverCycles * hold);
  }
  if (t < L.airStart) return lerp(-L.crouchDepth, L.pushExtension, easeOut((t - L.pushStart) / (L.airStart - L.pushStart)));
  if (t < L.landStart) {
    const u = (t - L.airStart) / (L.landStart - L.airStart);
    return L.pushExtension + L.hopHeight * 4 * u * (1 - u);
  }
  if (t < L.landEnd) return lerp(L.pushExtension, -L.landDepth, ramp(t, L.landStart, L.landEnd));
  if (t < L.recoverEnd) return -L.landDepth * (1 - easeOut((t - L.landEnd) / (L.recoverEnd - L.landEnd)));
  return 0;
}
var walkAt = (t) => 1 - ramp(t, LOOP.settleStart, LOOP.settleEnd) + ramp(t, LOOP.recoverEnd, LOOP.resumeEnd);
var crouchAt = (t) => clamp2(-hipOffsetAt(t) / LOOP.crouchDepth, 0, 1);
function hopPitchAt(t) {
  const L = LOOP;
  if (t < L.pushStart || t >= L.landEnd + 0.1) return 0;
  if (t < L.airStart) return -AIR_PITCH * ramp(t, L.pushStart, L.airStart);
  if (t < L.landStart) return -AIR_PITCH * Math.cos(Math.PI * (t - L.airStart) / (L.landStart - L.airStart));
  return AIR_PITCH * (1 - ramp(t, L.landStart, L.landEnd + 0.1));
}
var bodyPitchAt = (t) => LEAN_STAND + walkAt(t) * LEAN_WALK + CROUCH_PITCH * crouchAt(t) + hopPitchAt(t);
function pace(clock) {
  const t = loopTime(clock);
  if (t < LOOP.airStart || t >= LOOP.landStart) return walkAt(t);
  return LEAP_PACE * Math.sin(Math.PI * (t - LOOP.airStart) / (LOOP.landStart - LOOP.airStart));
}
var { hipHeight, headBase, windowAt, blasterAt, tankAt } = LAYOUT5;
var headY2 = hipHeight + headBase.y;
var blaster = (side) => [side * blasterAt.x, headY2 + blasterAt.y, headBase.z + blasterAt.z + LAYOUT5.blasterLength];
var SCOUT_HOPPER = defineWalkerType({
  id: "scout-hopper",
  name: "Scout Hopper",
  /** Small for a boss, so it is built a size up. */
  scale: 1.4,
  groundSpeed: GROUND_SPEED5,
  /** A touch slower than the model's nervous strut, so Charlie can keep up on foot now and then. */
  tempo: 0.65,
  pace,
  body(clock, out) {
    const t = loopTime(clock);
    out.lift = hipOffsetAt(t);
    out.pitch = bodyPitchAt(t);
    out.pivot = hipHeight;
  },
  bodyHeight: hipHeight + 0.9,
  turnRate: 1.2,
  footprint: [[LAYOUT5.hipSpread, LAYOUT5.ankleZ], [-LAYOUT5.hipSpread, LAYOUT5.ankleZ]],
  spots: [
    { id: "cockpit", at: [0, headY2 + windowAt.y, headBase.z + windowAt.z], radius: 1.6, look: true },
    { id: "fuel-tank", at: [0, hipHeight + tankAt.y + LAYOUT5.tankGlowY, tankAt.z], radius: 1.6 }
  ],
  spotHealth: 8,
  solids: [
    { at: [0, hipHeight, -0.3], radius: 2.6 },
    { at: [0, headY2 + 1.4, headBase.z + 0.7], radius: 2.4, look: true }
  ],
  cannons: [{ at: blaster(1), look: true }, { at: blaster(-1), look: true }],
  look: { pivot: [0, headY2, headBase.z], range: 0.5, rate: 2 },
  // Both cheek blasters pop one after the other: slow, bouncy bolts.
  attack: { interval: 2.8, telegraph: 0.7, boltSpeed: 15, volley: 2, volleyGap: 0.35, range: 38 },
  colors: { spark: 16756782, debris: 7309871, flare: 16769658 }
});

// src/core/walker-types/sky-stilt.js
var TAU2 = Math.PI * 2;
var LAYOUT6 = Object.freeze({
  /** Hips ride this high, so a hip-to-foot line is about 15 blocks (the legs are bent to fit). */
  hubHeight: 14,
  /** The resting feet stand on a circle this wide, under the hips. */
  footRadius: 10.6,
  hipRadius: 2.6,
  legs: Object.freeze([
    Object.freeze({ azimuth: Math.PI, start: 0 }),
    Object.freeze({ azimuth: -Math.PI / 3, start: 1 / 3 }),
    Object.freeze({ azimuth: Math.PI / 3, start: 2 / 3 })
  ]),
  eyeAt: Object.freeze([0, 4.9, 11.3]),
  /** The left lantern (the right one mirrors it). */
  lanternAt: Object.freeze([2.6, 0.9, 5.2]),
  /** The saucer is held tipped forward this much (radians), so its eye looks down at the ground. */
  restPitch: 0.05,
  /** The eye is tipped down this far at rest; its glowing lens sits lensDistance out from its pivot. */
  eyePitch: 0.75,
  lensDistance: 2
});
var GAIT6 = Object.freeze({
  cycle: 7.5,
  /** Each step takes a third of the cycle (the swing), then the foot slides back for the other two thirds. */
  swingShare: 1 / 3,
  /** How far a foot travels per step, front to back. */
  stride: 6
});
var GROUND_SPEED6 = GAIT6.stride / (GAIT6.cycle * (1 - GAIT6.swingShare));
var swayYaw2 = (cycle) => 0.2 * Math.sin(TAU2 * cycle + 0.6);
var SETTLED = -0.2;
var body2 = ([x, y, z]) => {
  const c = Math.cos(LAYOUT6.restPitch);
  const s = Math.sin(LAYOUT6.restPitch);
  return [x, LAYOUT6.hubHeight + SETTLED + y * c - z * s, y * s + z * c];
};
var eye2 = body2(LAYOUT6.eyeAt);
var gaze = (distance) => {
  const pitch = LAYOUT6.eyePitch + LAYOUT6.restPitch;
  return [eye2[0], eye2[1] - distance * Math.sin(pitch), eye2[2] + distance * Math.cos(pitch)];
};
var [lanternX, lanternY, lanternZ] = LAYOUT6.lanternAt;
var SKY_STILT = defineWalkerType({
  id: "sky-stilt",
  name: "Sky Stilt",
  groundSpeed: GROUND_SPEED6,
  body(clock, out) {
    out.yaw = swayYaw2(fract(clock / GAIT6.cycle));
  },
  bodyHeight: LAYOUT6.hubHeight,
  turnRate: 0.45,
  footprint: LAYOUT6.legs.map(({ azimuth }) => [Math.sin(azimuth) * LAYOUT6.footRadius, Math.cos(azimuth) * LAYOUT6.footRadius]),
  spots: [
    { id: "searchlight", at: gaze(LAYOUT6.lensDistance), radius: 2.6, look: true },
    { id: "lantern-left", at: body2([lanternX, lanternY, lanternZ]), radius: 2 },
    { id: "lantern-right", at: body2([-lanternX, lanternY, lanternZ]), radius: 2 }
  ],
  solids: [
    { at: body2([0, 5.2, 0]), radius: 8.6 },
    { at: body2([0, 1.2, 0]), radius: 3 },
    { at: eye2, radius: 2.8 }
  ],
  // The searchlight finds Charlie first, then the light-balls come from it.
  cannons: [{ at: gaze(LAYOUT6.lensDistance + 0.5), look: true }],
  look: { pivot: eye2, range: 0.9, rate: 1.2 },
  attack: { interval: 3.4, telegraph: 1, boltSpeed: 12 },
  colors: { spark: 16770688, debris: 5594242, flare: 13933567 },
  /** About one walker visit in four (after a planet's first) is the Sky Stilt. */
  visitChance: 0.25
});

// src/core/walker-types/index.js
var WALKER_TYPES = Object.freeze(
  Object.fromEntries([HEAVY_STRIDER, CRAB_TANK, FROST_MAMMOTH, SCOUT_HOPPER, SAND_SKITTER, SKY_STILT].map((type) => [type.id, type]))
);
var DEFAULT_WALKER = HEAVY_STRIDER;
function walkerType(id) {
  return WALKER_TYPES[id] ?? DEFAULT_WALKER;
}

// src/core/walker-visits.js
var VISITORS = Object.freeze(Object.values(WALKER_TYPES).filter((type) => type.visitChance > 0));
function homeWalker(planet) {
  return walkerType(planet.walker);
}
function walkersFor(planet) {
  const ids = [homeWalker(planet).id, ...Object.keys(planet.walkerStandIns ?? {}).map((id) => walkerType(id).id), ...VISITORS.map((type) => type.id)];
  return [...new Set(ids)];
}

// src/live/events/walker.js
var WALKER_CHOICES = Object.freeze(Object.values(WALKER_TYPES).map((type) => Object.freeze({ id: type.id, name: type.name })));
var WALKER_EVENT = defineRemoteEvent({
  type: "walker",
  label: "Giant walker",
  about: "A giant walker strides out (pick the kind, or get the planet's own).",
  boss: true,
  params(raw) {
    const type = typeof raw.type === "string" && Object.prototype.hasOwnProperty.call(WALKER_TYPES, raw.type) ? raw.type : null;
    return type ? { type } : {};
  },
  ready(game) {
    if (game.side?.walkers === false) return VERDICT.DROP;
    const { walker, inShip, ship } = game;
    const inSpace2 = inShip && ship.pos.y > SPACE.startAltitude;
    return runWhen(game.inFreePlay && !(walker.active && !walker.destroyed) && !inSpace2);
  },
  run(game, params) {
    const type = params.type && walkersFor(game.planet).includes(params.type) ? params.type : null;
    game.walkerBoss.visit(LINES.walkerComing, type);
  },
  fields: [
    {
      option: EVENT_OPTION.TYPE,
      label: "Which walker",
      kind: FIELD_KIND.CHOICE,
      none: "The planet's own",
      choices: WALKER_CHOICES.map((walker) => ({ value: walker.id, text: walker.name }))
    }
  ],
  busy: (game) => game.walker.active && !game.walker.destroyed
});

// src/core/blueprint-catalog.js
var WORD_BLUEPRINT = "word";
var blueprint = (id, label, defaultMaterial, size) => Object.freeze({ id, label, defaultMaterial, size: size && Object.freeze(size) });
var BLUEPRINT_CHOICES = Object.freeze({
  castle: blueprint("castle", "Castle", "stone", { w: 13, h: 9, d: 13 }),
  tower: blueprint("tower", "Tower", "brick", { w: 5, h: 14, d: 5 }),
  statue: blueprint("statue", "Bleep statue", "gold", { w: 7, h: 11, d: 5 }),
  heart: blueprint("heart", "Heart", "pink", { w: 9, h: 8, d: 1 }),
  [WORD_BLUEPRINT]: blueprint(WORD_BLUEPRINT, "A word in big letters", "gold", null)
});
var WORD = new RegExp(`^[A-Z0-9]{1,${GAME_MASTER.surprises.build.wordMaxLength}}$`);
function readWord(raw) {
  if (typeof raw !== "string") return null;
  const word = raw.trim().toUpperCase();
  return WORD.test(word) ? word : null;
}

// src/core/build-materials.js
var material = (id, label, block) => Object.freeze({ id, label, block });
var BUILD_MATERIALS = Object.freeze({
  gold: material("gold", "Gold", BLOCK.GOLD),
  stone: material("stone", "Stone", BLOCK.STONE),
  brick: material("brick", "Brick", BLOCK.BRICK),
  wood: material("wood", "Wood", BLOCK.PLANKS),
  metal: material("metal", "Metal", BLOCK.METAL),
  glass: material("glass", "Glass", BLOCK.GLASS),
  pink: material("pink", "Pink glow", BLOCK.GLOW),
  light: material("light", "Blue light", BLOCK.LIGHT),
  ice: material("ice", "Ice", BLOCK.ICE)
});
var TRIM = Object.freeze({ FOUNDATION: BLOCK.STONE, METAL: BLOCK.METAL, LIGHT: BLOCK.LIGHT, GOLD: BLOCK.GOLD });
var DAD_BLOCK_IDS = Object.freeze([.../* @__PURE__ */ new Set([...Object.values(BUILD_MATERIALS).map((one2) => one2.block), ...Object.values(TRIM)])]);

// src/live/events/build.js
var BUILD_WHERE = Object.freeze({ NEAR: "near", HOME: "home" });
var WHAT = defineField({
  option: EVENT_OPTION.WHAT,
  label: "What",
  kind: FIELD_KIND.CHOICE,
  required: true,
  choices: Object.values(BLUEPRINT_CHOICES).map((blueprint2) => ({ value: blueprint2.id, text: blueprint2.label }))
});
var WORD2 = defineField({
  option: EVENT_OPTION.WORD,
  label: "The word (A-Z, 0-9)",
  kind: FIELD_KIND.WORD,
  required: true,
  maxLength: GAME_MASTER.surprises.build.wordMaxLength,
  placeholder: "CHARLIE",
  showWhen: { [EVENT_OPTION.WHAT]: WORD_BLUEPRINT }
});
var COLOUR2 = defineField({
  option: EVENT_OPTION.COLOUR,
  label: "Made of",
  kind: FIELD_KIND.CHOICE,
  none: "The usual",
  choices: Object.values(BUILD_MATERIALS).map((material2) => ({ value: material2.id, text: material2.label }))
});
var WHERE2 = defineField({
  option: EVENT_OPTION.WHERE,
  label: "Where",
  kind: FIELD_KIND.CHOICE,
  choices: [
    { value: BUILD_WHERE.NEAR, text: "Near Charlie" },
    { value: BUILD_WHERE.HOME, text: "By his landing pad" }
  ],
  default: BUILD_WHERE.NEAR
});
var BUILD_EVENT = defineRemoteEvent({
  type: "build",
  label: "Build something",
  about: "A castle, tower, Bleep statue, heart or a word in big blocks, near Charlie or by his landing pad.",
  since: 2,
  fields: [WHAT, WORD2, COLOUR2, WHERE2],
  /** A known blueprint, with a word Dad's builders can spell for the word one (a word for any other is left out). */
  params(raw) {
    const what = chosen(WHAT, raw);
    if (!what) return null;
    const word = what === WORD_BLUEPRINT ? readWord(raw.word) : null;
    if (what === WORD_BLUEPRINT && !word) return null;
    const colour = chosen(COLOUR2, raw);
    const where = chosen(WHERE2, raw);
    return { what, ...word ? { word } : {}, ...colour ? { colour } : {}, ...where ? { where } : {} };
  },
  ready(game, params) {
    const home = params.where === BUILD_WHERE.HOME;
    return runWhen(freePlayMoment(game) && !game.surprises.building && (home || !game.inShip && game.player.alive));
  },
  run(game, params) {
    game.surprises.build(params);
  },
  busy: (game) => game.surprises.building,
  /** It rises from the moment it runs, or there was no room for it at all. */
  startsAtOnce: true
});

// src/core/surprise-events.js
var SURPRISE_EVENTS = Object.freeze({
  /** A rain crystal was picked up: not one of the island's 'crystal's (its own sound; no crystal mission counts it). */
  CRYSTAL: "surpriseCrystal",
  /** Charlie found Dad's hidden present ({ prize }). */
  TREASURE_FOUND: "treasureFound",
  /** Charlie finished a Dad challenge ({ goal }). */
  CHALLENGE_DONE: "challengeDone",
  /** Dad's builders finished a build ({ what, word }). */
  DAD_BUILT: "dadBuilt"
});

// src/core/challenges.js
var FOE_DOWN_EVENTS = Object.freeze(["trooperDown", "robotDown"]);
var CHALLENGE_STATE = Object.freeze({ GOING: "going", DONE: "done", ENDED: "ended" });
var OVER_WORDS = Object.freeze({ [CHALLENGE_STATE.DONE]: "You did it!", [CHALLENGE_STATE.ENDED]: "Good try!" });
var challenge = (id, text, icon, events, goal, extra = {}) => Object.freeze({ id, text, icon, events: Object.freeze(events), goal, brings: null, when: () => true, doneWhen: null, ...extra });
var CHALLENGES = Object.freeze({
  crystals5: challenge("crystals5", "Find 5 crystals!", "crystal", ["crystal", SURPRISE_EVENTS.CRYSTAL], 5),
  crystals10: challenge("crystals10", "Find 10 crystals!", "crystal", ["crystal", SURPRISE_EVENTS.CRYSTAL], 10),
  blocks10: challenge("blocks10", "Build 10 blocks!", "block", ["blockPlaced"], 10),
  jumps10: challenge("jumps10", "Jump 10 times!", "jump", ["jump"], 10),
  // On a side whose troopers are Charlie's own team (bad guy mode), knocking them over is no challenge to set.
  foes3: challenge("foes3", "Knock over 3 bad guys!", "trooper", FOE_DOWN_EVENTS, 3, { when: (game) => game.side?.garrison !== "ally" }),
  // Where robots never come, there are none to blast.
  robots3: challenge("robots3", "Blast 3 robots!", "robot", ["robotDown"], 3, { brings: "robots", when: (game) => game.side?.robotDrops !== false }),
  landings3: challenge("landings3", "Land your ship 3 times!", "ship", ["landed"], 3),
  // Up in space already as it comes (a timed send, a favourite): that counts, so he never waits on a card stuck at 0.
  space1: challenge("space1", "Fly up to space!", "star", ["reachedSpace"], 1, { doneWhen: (game) => game.canWarp })
});
var challengeById = (id) => typeof id === "string" && hasOwn(CHALLENGES, id) ? CHALLENGES[id] : null;

// src/core/prizes.js
var CRYSTALS_PRIZE = "crystals";
function readPrize(raw) {
  if (raw === CRYSTALS_PRIZE) return CRYSTALS_PRIZE;
  return rewardById(raw) ? raw : null;
}

// src/live/events/prize-field.js
var PRIZE_FIELD = defineField({
  option: EVENT_OPTION.PRIZE,
  label: "Present inside",
  kind: FIELD_KIND.CHOICE,
  choices: [{ value: CRYSTALS_PRIZE, text: `${GAME_MASTER.surprises.prizeCrystals} crystals`, group: "Crystals" }, ...unlockChoices(UNLOCK_CHOICES)],
  default: CRYSTALS_PRIZE
});
function prizeParams(raw) {
  const prize = readPrize(raw[PRIZE_FIELD.option]);
  return prize ? { prize } : {};
}

// src/live/events/challenge.js
var GOAL = defineField({
  option: EVENT_OPTION.GOAL,
  label: "The challenge",
  kind: FIELD_KIND.CHOICE,
  required: true,
  choices: Object.values(CHALLENGES).map((challenge2) => ({ value: challenge2.id, text: challenge2.text }))
});
var CHALLENGE_EVENT = defineRemoteEvent({
  type: "challenge",
  label: "Dad's challenge",
  about: 'A little goal card, like "Find 5 crystals!", with a present when he does it.',
  since: 2,
  fields: [GOAL, PRIZE_FIELD],
  params(raw) {
    const goal = chosen(GOAL, raw);
    return goal ? { goal, ...prizeParams(raw) } : null;
  },
  ready(game, params) {
    if (!challengeById(params.goal).when(game)) return VERDICT.DROP;
    return runWhen(freePlayMoment(game) && !game.surprises.challengeOn);
  },
  run(game, params) {
    game.surprises.startChallenge(params);
  },
  busy: (game) => game.surprises.challengeOn,
  startsAtOnce: true
});

// src/live/events/combo.js
function describeCombo(params, describeStep2) {
  const steps = (params.steps ?? []).map((step, index) => index === 0 ? describeStep2(step.type, step.params) : `then ${describeStep2(step.type, step.params)} ${waitWords(step.wait)}`);
  return `Combo${params.name ? ` "${params.name}"` : ""}: ${steps.join(", ")}`;
}
function defineComboEvent(lookup) {
  return defineRemoteEvent({
    type: COMBO_TYPE,
    label: "Combo",
    about: "Several surprises in a row.",
    since: 2,
    inCombo: false,
    check: (raw, known, checkStep) => checkCombo(raw, { lookup, checkStep }),
    params: (raw, known) => readCombo(raw, { lookup, known }),
    describe: describeCombo,
    // Split into its steps before it is ever asked; should one reach the queue whole, it is let go.
    ready: () => VERDICT.DROP,
    run() {
    }
  });
}

// src/live/events/crystal-gift.js
var AMOUNT = defineField({
  option: EVENT_OPTION.AMOUNT,
  label: "How many",
  kind: FIELD_KIND.CHOICE,
  choices: GAME_MASTER.surprises.giftAmounts.map((n) => ({ value: n, text: `${n} crystals` })),
  default: String(GAME_MASTER.surprises.prizeCrystals)
});
var CRYSTAL_GIFT_EVENT = defineRemoteEvent({
  type: "crystalGift",
  label: "Crystal gift",
  about: "Crystals straight into his wallet, with a sparkle.",
  since: 2,
  fields: [AMOUNT],
  params(raw) {
    const amount = chosen(AMOUNT, raw);
    return amount ? { amount: Number(amount) } : {};
  },
  ready: afterBossFights,
  run(game, params) {
    game.surprises.giftCrystals(params.amount ?? GAME_MASTER.surprises.prizeCrystals);
  },
  /** The sparkle and the chimes take a moment. */
  lasts: 2
});

// src/live/events/parade.js
var PARADE_EVENT = defineRemoteEvent({
  type: "parade",
  label: "Animal parade",
  about: "The island's animals march past Charlie.",
  since: 2,
  ready: (game) => runWhen(freePlayMoment(game) && !game.inShip && game.player.alive && !game.surprises.paradeOn),
  run(game) {
    game.surprises.startParade();
  },
  busy: (game) => game.surprises.paradeOn,
  /** It marches from the moment it runs, or there was no room for it. */
  startsAtOnce: true
});

// src/live/events/treasure.js
var TREASURE_WHERE = Object.freeze({ NEAR: "near", FAR: "far" });
var WHERE3 = defineField({
  option: EVENT_OPTION.WHERE,
  label: "Where",
  kind: FIELD_KIND.CHOICE,
  choices: [
    { value: TREASURE_WHERE.NEAR, text: "Close by" },
    { value: TREASURE_WHERE.FAR, text: "Farther away" }
  ],
  default: TREASURE_WHERE.NEAR
});
var TREASURE_EVENT = defineRemoteEvent({
  type: "treasure",
  label: "Treasure hunt",
  about: "A present hidden nearby under a tall beam of light.",
  since: 2,
  fields: [WHERE3, PRIZE_FIELD],
  params(raw) {
    const where = chosen(WHERE3, raw);
    return { ...where ? { where } : {}, ...prizeParams(raw) };
  },
  ready: (game) => runWhen(freePlayMoment(game) && !game.surprises.treasureOut && !inSpace(game)),
  run(game, params) {
    game.surprises.hideTreasure(params);
  },
  busy: (game) => game.surprises.treasureOut,
  /** Hidden the moment it runs, or there was no ground for it. */
  startsAtOnce: true
});

// src/core/voice-clip-id.js
var VOICE_ID = /^v_[A-Za-z0-9_-]{22}$/;
var isVoiceId = (id) => typeof id === "string" && VOICE_ID.test(id);

// src/live/events/voice-message.js
var VOICE_MESSAGE_EVENT = defineRemoteEvent({
  type: "voiceMessage",
  label: "Voice message",
  about: "Your own voice, from your phone, with the Message from Dad card.",
  since: 2,
  serverOnly: true,
  inFavourite: false,
  card: true,
  fields: [
    { option: EVENT_OPTION.VOICE, label: "Your voice", kind: FIELD_KIND.VOICE, required: true },
    {
      option: EVENT_OPTION.TEXT,
      label: "Words on his card (optional)",
      kind: FIELD_KIND.TEXT,
      maxLength: REMOTE_EVENTS.messageMaxLength,
      placeholder: "Love you, Charlie!"
    }
  ],
  params(raw) {
    if (!isVoiceId(raw.voice)) return null;
    const text = cleanMessage(raw.text, REMOTE_EVENTS.messageMaxLength);
    return text ? { voice: raw.voice, text } : { voice: raw.voice };
  },
  ready: (game, params, stage) => runWhen(!game.bossFightActive && stage?.voiceBusy?.() !== true && stage?.messageShowing?.() !== true && stage?.narratorBusy?.() !== true),
  run(game, params, stage) {
    stage?.playVoice?.(params);
  },
  busy: (game, params, stage) => stage?.voiceBusy?.() === true,
  /** Its words, never its clip's id (a log line is for Dad, and the id is the clip's only key). */
  describe: (params) => params.text ? `Voice message: ${params.text}` : "Voice message",
  /** It is busy from the moment it runs (loading, then playing), when it plays at all. */
  startsAtOnce: true
});

// src/core/sky-moods.js
var FALL = Object.freeze({ SNOW: "snow", RAIN: "rain" });
var look = ({ dome = 16777215, horizon = null, clouds = 16777215, water = 16777215, world = 16777215, overcast = null, cover = 0, stars = 0, suns = 1, fall = null, rainbow = false }) => Object.freeze({ dome, horizon, clouds, water, world, overcast, cover, stars, suns, fall, rainbow });
var mood = (id, label, toast, spec) => Object.freeze({ id, label, toast, look: look(spec) });
var SKY_MOODS = Object.freeze({
  night: mood("night", "Night with stars", "Night time! Look at the stars!", { dome: 2502746, horizon: 857136, clouds: 3818598, water: 3820154, world: 8029888, stars: 1, suns: 0 }),
  snow: mood("snow", "Snow", "Snow day!", { dome: 14477042, horizon: 12766683, clouds: 16777215, water: 13162730, world: 14871028, overcast: 12174804, cover: 0.85, suns: 0.6, fall: FALL.SNOW }),
  rain: mood("rain", "Rain", "Rainy day!", { dome: 9082536, horizon: 8226969, clouds: 8423578, water: 7307926, world: 11844808, overcast: 7569038, cover: 0.85, suns: 0, fall: FALL.RAIN }),
  rainbow: mood("rainbow", "Rainbow sky", "A rainbow!", { rainbow: true })
});

// src/live/events/weather.js
var { minuteChoices, defaultMinutes } = GAME_MASTER.surprises.weather;
var MOOD = defineField({
  option: EVENT_OPTION.MOOD,
  label: "Sky",
  kind: FIELD_KIND.CHOICE,
  required: true,
  choices: Object.values(SKY_MOODS).map((mood2) => ({ value: mood2.id, text: mood2.label }))
});
var MINUTES = defineField({
  option: EVENT_OPTION.MINUTES,
  label: "How long",
  kind: FIELD_KIND.CHOICE,
  choices: minuteChoices.map((n) => ({ value: n, text: n === 1 ? "1 minute" : `${n} minutes` })),
  default: String(defaultMinutes)
});
var WEATHER_EVENT = defineRemoteEvent({
  type: "weather",
  label: "Weather and sky",
  about: "Night with stars, snow, rain or a rainbow for a few minutes.",
  since: 2,
  fields: [MOOD, MINUTES],
  params(raw) {
    const mood2 = chosen(MOOD, raw);
    if (!mood2) return null;
    const minutes = chosen(MINUTES, raw);
    return minutes ? { mood: mood2, minutes: Number(minutes) } : { mood: mood2 };
  },
  ready: afterBossFights,
  run(game, params) {
    game.surprises.startWeather(params.mood, (params.minutes ?? defaultMinutes) * 60);
  },
  busy: (game) => game.surprises.weatherOn,
  startsAtOnce: true
});

// src/live/events/v2.js
function v2Events(lookup) {
  return [defineComboEvent(lookup), BUILD_EVENT, WEATHER_EVENT, TREASURE_EVENT, CRYSTAL_GIFT_EVENT, PARADE_EVENT, CHALLENGE_EVENT, VOICE_MESSAGE_EVENT];
}

// src/live/events/index.js
var ALL2 = [
  DARK_LORD_EVENT,
  KNIGHT_EVENT,
  ROBOT_DROP_EVENT,
  WALKER_EVENT,
  CRYSTAL_RAIN_EVENT,
  FIREWORKS_EVENT,
  BLEEP_PARTY_EVENT,
  UNLOCK_EVENT,
  MESSAGE_EVENT,
  ...v2Events((type) => remoteEventType(type))
];
var REMOTE_EVENT_TYPES = Object.freeze(Object.fromEntries(ALL2.map((event) => [event.type, event])));
function remoteEventType(type) {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(REMOTE_EVENT_TYPES, type) ? REMOTE_EVENT_TYPES[type] : null;
}

// tools/gm/durations.mjs
var UNIT_SECONDS = Object.freeze({ s: 1, m: 60, h: 3600 });
var DURATION = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i;
function parseDuration(text) {
  const trimmed = String(text ?? "").trim();
  const match = DURATION.exec(trimmed);
  if (!trimmed || !match || match.slice(1).every((part) => part === void 0)) throw new Error(`"${text}" isn't a time: write it like 90s, 5m, 1h or 1h30m.`);
  const [hours = 0, minutes = 0, seconds = 0] = match.slice(1).map((part) => Number(part ?? 0));
  return hours * UNIT_SECONDS.h + minutes * UNIT_SECONDS.m + seconds * UNIT_SECONDS.s;
}

// tools/gm/fields.mjs
function optionNames(types = Object.values(REMOTE_EVENT_TYPES)) {
  const byOption = /* @__PURE__ */ new Map();
  for (const kind of types) {
    for (const field of kind.fields ?? []) {
      if (!byOption.has(field.option)) byOption.set(field.option, { option: field.option, kind: field.kind, uses: [] });
      byOption.get(field.option).uses.push({ type: kind.type, field });
    }
  }
  return [...byOption.values()].sort((a, b) => a.option.localeCompare(b.option));
}
var PLACEHOLDER = Object.freeze({ [FIELD_KIND.CHOICE]: "<choice>", [FIELD_KIND.TEXT]: '"..."', [FIELD_KIND.WORD]: "<WORD>", [FIELD_KIND.VOICE]: "<clip id>" });

// tools/gm/args.mjs
var COMMANDS = Object.freeze(["list", "clear", "help", "status", "combo", "cancel", "fav"]);
var FAV_ACTIONS = Object.freeze(["save", "delete"]);
var VALUE_OPTIONS = new Set(optionNames().map(({ option }) => option));
var COMMAND_FLAGS = Object.freeze(["in", "name", "icon"]);
function eventTypeFor(word) {
  const plain = (text) => text.toLowerCase().replace(/[-_\s]/g, "");
  return Object.keys(REMOTE_EVENT_TYPES).find((type) => plain(type) === plain(word)) ?? null;
}
function parseOptions(words, { flags = [] } = {}) {
  const params = {};
  const given = {};
  const rest = [];
  let dryRun = false;
  let help = false;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word === "--dry-run") dryRun = true;
    else if (word === "-h" || word === "--help") help = true;
    else if (word.startsWith("--")) {
      const [name, inline] = word.slice(2).split(/=(.*)/s);
      const isFlag = flags.includes(name);
      if (!isFlag && !VALUE_OPTIONS.has(name)) throw new Error(`Unknown option --${name}. Options: ${[...VALUE_OPTIONS, ...flags].map((o) => `--${o}`).join(", ")}.`);
      const value = inline ?? words[++i];
      if (value === void 0) throw new Error(`--${name} needs a value.`);
      if (isFlag) given[name] = value;
      else params[name] = value;
    } else rest.push(word);
  }
  return { params, flags: given, rest, dryRun, help };
}

// tools/gm/presets.mjs
var canonicalStep = ({ type, params = {}, wait = GAME_MASTER.combo.minWaitSeconds }, index) => Object.freeze({ type, params: Object.freeze(params), wait: index === 0 ? 0 : wait });
var preset = (id, name, icon, steps) => Object.freeze({ id, name, icon, steps: Object.freeze(steps.map(canonicalStep)) });
var ALL_PRESETS = Object.freeze([
  preset("party", "Party time", "\u{1F389}", [
    { type: "fireworks", params: { colour: "rainbow" } },
    { type: "bleepParty", wait: "over" },
    { type: "crystalRain", params: { count: 20 }, wait: "over" }
  ]),
  preset("bedtime", "Bedtime", "\u{1F319}", [
    { type: "weather", params: { mood: "night", minutes: 3 } },
    { type: "message", params: { text: "Good night, Charlie! Sleep tight. Love, Dad" }, wait: 5 },
    { type: "fireworks", params: { colour: "gold", count: 5 }, wait: "over" }
  ]),
  preset("robotBattle", "Robot battle", "\u{1F916}", [
    { type: "message", params: { text: "Robots are coming! Get ready, Charlie!" } },
    { type: "robotDrop", params: { count: 2 }, wait: "over" },
    { type: "challenge", params: { goal: "robots3" }, wait: 10 }
  ]),
  preset("treasureTime", "Treasure time", "\u{1F5FA}\uFE0F", [
    { type: "fireworks", params: { where: "sky", count: 5 } },
    { type: "treasure", params: { where: "near" }, wait: "over" }
  ]),
  preset("snowDay", "Snow day", "\u2744\uFE0F", [
    { type: "weather", params: { mood: "snow", minutes: 5 } },
    { type: "build", params: { what: "castle", colour: "ice" }, wait: 10 }
  ]),
  preset("nameInGold", "His name in gold", "\u2728", [
    { type: "build", params: { what: "word", word: "CHARLIE", colour: "gold" } },
    { type: "fireworks", params: { colour: "gold" }, wait: "over" }
  ]),
  preset("animalShow", "Animal show", "\u{1F411}", [{ type: "parade" }, { type: "crystalRain", params: { count: 12 }, wait: "over" }])
]);
var COMBO_PRESETS = Object.freeze(ALL_PRESETS.filter((one2) => one2.steps.every((step) => remoteEventType(step.type) !== null)));
var presetById = (id) => COMBO_PRESETS.find((one2) => one2.id === id) ?? null;

// tools/gm/catalog.mjs
var REACTION_NOTE = "Charlie's game should react within about a minute (GitHub Pages rebuilds the site, then the game looks every 10 seconds).";
var unknownTypeWords = (type) => `There is no "${type}" event.`;
function checkEvent(type, raw = {}, known = {}) {
  const kind = remoteEventType(type);
  if (!kind) throw new Error(`${unknownTypeWords(type)} Events: ${Object.keys(REMOTE_EVENT_TYPES).join(", ")}.`);
  const given = Object.entries(raw).filter(([, value]) => value !== void 0 && value !== null && value !== "");
  if (kind.check) return { type: kind.type, params: kind.check(Object.fromEntries(given), known, (stepType, stepRaw) => checkEvent(stepType, stepRaw, known)) };
  for (const [option] of given) {
    if (!kind.options.includes(option)) throw new Error(`${kind.label} doesn't take --${option}.`);
  }
  for (const option of kind.needs) {
    if (!given.some(([name]) => name === option)) throw new Error(`${kind.label} needs --${option}.`);
  }
  const params = kind.params(Object.fromEntries(given), known);
  if (!params) {
    const missing = kind.fields.find((field) => field.required && isShown(field, Object.fromEntries(given)) && !given.some(([name]) => name === field.option));
    if (missing) throw new Error(`${kind.label} needs --${missing.option}.`);
    throw new Error(`${kind.label}: ${given.map(([name, value]) => `--${name} "${value}"`).join(" ")} isn't something the game can use.`);
  }
  for (const [option, value] of given) {
    if (params[option] === void 0) throw new Error(`${kind.label}: --${option} "${value}" isn't one the game knows.`);
  }
  return { type: kind.type, params };
}
function checkDelay(seconds) {
  if (seconds === void 0 || seconds === null || seconds === 0) return 0;
  const { minSeconds, maxSeconds } = GAME_MASTER.schedule;
  if (!Number.isInteger(seconds) || seconds < minSeconds || seconds > maxSeconds) throw new Error(`Pick a time from ${minSeconds} seconds to ${maxSeconds / 3600} hours.`);
  return seconds;
}
var SEND_ROUTE = Object.freeze({ SERVER: "server", SITE: "site" });
function serverOnlyKind({ type, params = {} }) {
  const kind = remoteEventType(type);
  if (kind?.serverOnly) return kind;
  return (params.steps ?? []).map((step) => remoteEventType(step.type)).find((stepKind) => stepKind?.serverOnly) ?? null;
}
function favouriteCombo(id, favourites, known) {
  const found = favourites.find((one2) => one2.id === id) ?? presetById(id);
  if (!found) throw new Error(`There is no favourite "${id}" (it may have been deleted).`);
  if (!found.steps.every((step) => remoteEventType(step.type))) throw new Error("Edit this favourite: it has a surprise the game no longer knows.");
  try {
    return checkEvent(COMBO_TYPE, { name: found.name, steps: found.steps }, known);
  } catch (error) {
    throw new Error(`Edit this favourite: ${error.message}`);
  }
}
function checkSend({ type, params = {}, in: delay, favourite } = {}, known = {}, { favourites = [], route = SEND_ROUTE.SERVER } = {}) {
  const hasFavourite = favourite !== void 0 && favourite !== null && favourite !== "";
  if (hasFavourite && type !== void 0 && type !== null) throw new Error("Send a surprise or a favourite, not both.");
  if (!hasFavourite && (typeof type !== "string" || type === "")) throw new Error("Name a surprise (or a favourite) to send.");
  const checked = hasFavourite ? favouriteCombo(String(favourite), favourites, known) : checkEvent(type, params, known);
  const delaySeconds = checkDelay(delay);
  if (route === SEND_ROUTE.SITE) {
    if (delaySeconds > 0) throw new Error("A timed surprise needs the surprise server.");
    const server = serverOnlyKind(checked);
    if (server) throw new Error(`${server.label} needs the surprise server.`);
  }
  return { ...checked, delaySeconds };
}
var FAVOURITE_FIELDS = Object.freeze(["id", "name", "icon", "steps"]);
function catalogField({ none, ...field }) {
  if (field.kind !== FIELD_KIND.CHOICE) return field;
  return { ...field, choices: [...none === void 0 ? [] : [{ value: "", text: none }], ...field.choices ?? []] };
}
var catalogType = (kind) => ({
  type: kind.type,
  label: kind.label,
  about: kind.about,
  options: kind.options,
  needs: kind.needs,
  boss: kind.boss,
  since: kind.since,
  inCombo: kind.inCombo,
  inFavourite: kind.inFavourite,
  serverOnly: kind.serverOnly,
  fields: kind.fields.map(catalogField)
});
function gameMasterCatalog() {
  return {
    level: GAME_MASTER.level,
    types: Object.values(REMOTE_EVENT_TYPES).map(catalogType),
    walkers: WALKER_CHOICES,
    dropShipCounts: DROP_SHIP_COUNTS,
    unlocks: UNLOCK_CHOICES,
    maxLength: REMOTE_EVENTS.messageMaxLength,
    presets: COMBO_PRESETS.map(({ id, name, icon, steps }) => ({ id, name, icon, steps, summary: describeEvent({ type: COMBO_TYPE, params: { name, steps } }) })),
    limits: {
      combo: GAME_MASTER.combo,
      schedule: GAME_MASTER.schedule,
      favourites: GAME_MASTER.favourites,
      status: GAME_MASTER.status,
      reactions: GAME_MASTER.reactions,
      voice: GAME_MASTER.voice,
      /** How long a surprise sent now waits for his game (ms): the phone says so while he isn't playing. */
      lifetimeMs: REMOTE_EVENTS.lifetimeMs
    }
  };
}
function describeStep(type, params = {}) {
  const kind = remoteEventType(type);
  if (kind?.describe && type !== COMBO_TYPE) return kind.describe(params, describeStep);
  const details = Object.entries(params).map(([name, value]) => `${name}: ${value}`);
  return `${remoteEventType(type)?.label ?? type}${details.length ? ` (${details.join(", ")})` : ""}`;
}
function describeEvent(event) {
  const kind = remoteEventType(event.type);
  if (kind?.describe) return kind.describe(event.params ?? {}, describeStep);
  const details = Object.entries(event.params ?? {}).map(([name, value]) => `${name}: ${value}`);
  return [kind?.label ?? event.type, ...details].join(" | ");
}

// tools/gm/combo-text.mjs
var WAIT_WORD = "wait";
function splitOutsideQuotes(text, separator) {
  const parts = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === "\\" && i + 1 < text.length) {
      current += char + text[++i];
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === separator && !quoted) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (quoted) throw new Error('A quote (") is never closed.');
  parts.push(current);
  return parts;
}
function wordsOf(segment) {
  const words = [];
  let current = null;
  let quoted = false;
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (quoted && char === "\\" && i + 1 < segment.length) {
      current = (current ?? "") + segment[++i];
    } else if (char === '"') {
      quoted = !quoted;
      current ??= "";
    } else if (/\s/.test(char) && !quoted) {
      if (current !== null) words.push(current);
      current = null;
    } else current = (current ?? "") + char;
  }
  if (current !== null) words.push(current);
  return words;
}
function waitOf(words, index) {
  if (words.length !== 2) throw new Error(`Part ${index + 1}: write a wait as "wait 10s" or "wait over".`);
  return words[1].toLowerCase() === WAIT_OVER ? WAIT_OVER : parseDuration(words[1]);
}
function parseComboText(text) {
  const segments = splitOutsideQuotes(String(text ?? ""), ";").map((segment) => segment.trim()).filter((segment, i, all2) => segment !== "" || i !== all2.length - 1 && i !== 0);
  const steps = [];
  let wait = null;
  for (const [index, segment] of segments.entries()) {
    if (segment === "") throw new Error(`Part ${index + 1} is empty: take out the extra ";".`);
    const words = wordsOf(segment);
    if (words[0].toLowerCase() === WAIT_WORD) {
      if (steps.length === 0) throw new Error("A combo starts with a surprise, not a wait.");
      if (wait !== null) throw new Error(`Part ${index + 1}: two waits in a row (keep one).`);
      wait = waitOf(words, index);
      continue;
    }
    const type = eventTypeFor(words[0]);
    if (!type) throw new Error(`Part ${index + 1}: there is no "${words[0]}" event.`);
    const { params, rest } = parseOptions(words.slice(1));
    if (rest.length) throw new Error(`Part ${index + 1}: unexpected "${rest.join(" ")}" (put words in quotes: --text "Hi Charlie").`);
    steps.push({ type, params, wait: steps.length === 0 ? 0 : wait ?? GAME_MASTER.combo.minWaitSeconds });
    wait = null;
  }
  if (wait !== null) throw new Error("A combo ends with a surprise, not a wait.");
  if (steps.length === 0) throw new Error("Write at least one surprise, like: fireworks ; wait over ; bleepParty");
  return { steps };
}

// tools/gm/action-inputs.mjs
var PICK_ONE = "(pick one)";
var PLANETS_OWN = gameMasterCatalog().types.find((type) => type.type === "walker").fields[0].choices[0].text;
var PRESET_MARK = "\u2605";
var INPUT_KIND = Object.freeze({ CHOICE: "choice", TEXT: "text", SWITCH: "switch" });
var INPUT = Object.freeze({ SURPRISE: "surprise", SHIPS: "ships", WALKER: "walker", PRESENT: "present", MESSAGE: "message", DETAILS: "details", COMBO: "combo", PRACTICE: "dry_run" });
var choice = (label, value, extra = {}) => Object.freeze({ label, value, ...extra });
var labelOf = (catalog, type) => catalog.types.find((kind) => kind.type === type)?.label ?? type;
function finished(input, catalog) {
  const labels = (input.choices ?? []).map((option) => option.label);
  const twice = labels.find((label, i) => labels.indexOf(label) !== i);
  if (twice !== void 0) throw new Error(`The form's ${input.title} choices have "${twice}" twice: give one of them another name.`);
  const users = input.type ? labelOf(catalog, input.type) : input.title;
  const { question, ...rest } = input;
  return Object.freeze({ ...rest, description: `${input.title}${users === input.title ? "" : ` (${users})`}: ${question}` });
}
function gameMasterForm(catalog = gameMasterCatalog()) {
  const inputs = [
    {
      name: INPUT.SURPRISE,
      title: "Surprise",
      question: "what happens in Charlie's game",
      kind: INPUT_KIND.CHOICE,
      choices: [
        choice(PICK_ONE, null),
        // The workflow writes events.json on the site: a surprise only the surprise server can carry is not offered.
        ...catalog.types.filter((type) => !type.serverOnly).map((type) => choice(type.label, type.type)),
        ...(catalog.presets ?? []).map((preset2) => choice(`${PRESET_MARK} ${preset2.name}`, null, { preset: preset2.id }))
      ],
      default: PICK_ONE
    },
    {
      name: INPUT.SHIPS,
      title: "Ships",
      option: EVENT_OPTION.COUNT,
      type: "robotDrop",
      question: "how many fly in",
      kind: INPUT_KIND.CHOICE,
      choices: catalog.dropShipCounts.map((count2) => choice(String(count2), String(count2))),
      default: String(catalog.dropShipCounts[0])
    },
    {
      name: INPUT.WALKER,
      title: "Walker",
      option: EVENT_OPTION.TYPE,
      type: "walker",
      question: "which kind comes",
      kind: INPUT_KIND.CHOICE,
      choices: [choice(PLANETS_OWN, null), ...catalog.walkers.map((walker) => choice(walker.name, walker.id))],
      default: PLANETS_OWN
    },
    {
      name: INPUT.PRESENT,
      title: "Present",
      option: EVENT_OPTION.UNLOCK,
      type: "unlock",
      question: "which prize",
      kind: INPUT_KIND.CHOICE,
      choices: [choice(PICK_ONE, null), ...catalog.unlocks.map((unlock) => choice(unlock.name, unlock.id))],
      default: PICK_ONE
    },
    {
      name: INPUT.MESSAGE,
      title: "Message",
      option: EVENT_OPTION.TEXT,
      type: "message",
      question: `your words, up to ${catalog.maxLength} letters`,
      kind: INPUT_KIND.TEXT,
      default: ""
    },
    { name: INPUT.DETAILS, title: "More choices", question: "like --colour rainbow --count 15 (see node tools/gm.mjs help)", kind: INPUT_KIND.TEXT, default: "" },
    { name: INPUT.COMBO, title: "Combo steps", question: "for a Combo, like: fireworks ; wait over ; crystalRain --count 20", kind: INPUT_KIND.TEXT, default: "" },
    { name: INPUT.PRACTICE, title: "Practice run", question: "check it and send nothing", kind: INPUT_KIND.SWITCH, default: false }
  ];
  return Object.freeze(inputs.map((input) => finished(input, catalog)));
}
var envName = (name) => `GM_${name.toUpperCase()}`;
function formValuesFromEnv(env, form = gameMasterForm()) {
  return Object.fromEntries(form.map((input) => [input.name, env[envName(input.name)]]));
}
function answerOf(input, values) {
  const raw = values[input.name];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : String(input.default);
}
function choiceOf(input, label) {
  const found = input.choices.find((option) => option.label === label);
  if (!found) throw new Error(`"${label}" isn't one of the ${input.title} choices (${input.choices.map((option) => option.label).join(", ")}).`);
  return found;
}
function messageWords(text, maxLength) {
  const cleaned = cleanMessage(text, Infinity);
  if (!cleaned) throw new Error("Nothing in that message can go on the card (links and markup are taken out): type some words.");
  const letters = Array.from(cleaned).length;
  if (letters > maxLength) throw new Error(`That message is ${letters} letters long and the card holds ${maxLength}: make it shorter.`);
  return text;
}
function eventFromForm(values, catalog = gameMasterCatalog()) {
  const form = gameMasterForm(catalog);
  const inputNamed = (name) => form.find((input) => input.name === name);
  const surpriseInput = inputNamed(INPUT.SURPRISE);
  const picked = choiceOf(surpriseInput, answerOf(surpriseInput, values));
  if (picked.preset) return presetFromForm(picked, form, values);
  const type = picked.value;
  if (type === null) throw new Error(`Pick a surprise first (in "${surpriseInput.title}").`);
  const kind = catalog.types.find((known) => known.type === type);
  if (type === COMBO_TYPE) return comboFromForm(kind, form, values);
  const comboInput = inputNamed(INPUT.COMBO);
  if (answerOf(comboInput, values) !== "") throw new Error(`${kind.label} doesn't use "${comboInput.title}": clear it, or pick Combo as the surprise.`);
  const params = {};
  for (const input of form.filter((field) => field.option)) {
    const answer = answerOf(input, values);
    if (input.type !== kind.type) {
      if (answer === String(input.default)) continue;
      const undo = input.kind === INPUT_KIND.TEXT ? "clear it" : `set it back to "${input.default}"`;
      throw new Error(`${kind.label} doesn't use "${input.title}": ${undo}, or pick ${labelOf(catalog, input.type)} as the surprise.`);
    }
    const value = input.kind === INPUT_KIND.TEXT ? answer : choiceOf(input, answer).value;
    if (value === null || value === "") {
      if (kind.needs.includes(input.option)) throw new Error(`${kind.label} needs ${input.kind === INPUT_KIND.TEXT ? "your words" : "a choice"} in "${input.title}".`);
      continue;
    }
    params[input.option] = input.option === EVENT_OPTION.TEXT ? messageWords(value, catalog.maxLength) : value;
  }
  return checkEvent(type, { ...params, ...detailsFromForm(inputNamed(INPUT.DETAILS), values, params) });
}
function detailsFromForm(input, values, given) {
  const answer = answerOf(input, values);
  if (answer === "") return {};
  const { params, rest } = parseOptions(wordsOf(answer));
  if (rest.length) throw new Error(`"${input.title}" takes options like --colour rainbow, not "${rest.join(" ")}".`);
  const twice = Object.keys(params).find((option) => Object.hasOwn(given, option));
  if (twice) throw new Error(`--${twice} is set twice ("${input.title}" and another answer): keep one.`);
  return params;
}
function onlyDefaults(form, values, label, except = []) {
  for (const input of form.filter((field) => field.name !== INPUT.SURPRISE && field.name !== INPUT.PRACTICE && !except.includes(field.name))) {
    if (answerOf(input, values) === String(input.default)) continue;
    const undo = input.kind === INPUT_KIND.TEXT ? "clear it" : `set it back to "${input.default}"`;
    throw new Error(`${label} doesn't use "${input.title}": ${undo}.`);
  }
}
function presetFromForm(picked, form, values) {
  onlyDefaults(form, values, picked.label);
  const { type, params } = checkSend({ favourite: picked.preset }, {}, { route: SEND_ROUTE.SITE });
  return { type, params };
}
function comboFromForm(kind, form, values) {
  const stepsInput = form.find((input) => input.name === INPUT.COMBO);
  onlyDefaults(form, values, kind.label, [INPUT.COMBO]);
  const text = answerOf(stepsInput, values);
  if (text === "") throw new Error(`${kind.label} needs its steps in "${stepsInput.title}", like: fireworks ; wait over ; crystalRain --count 20.`);
  return checkEvent(COMBO_TYPE, parseComboText(text));
}
function practiceRunFromForm(values) {
  const raw = values[INPUT.PRACTICE];
  if (raw === void 0 || raw === null || raw === "" || raw === false || raw === "false") return false;
  if (raw === true || raw === "true") return true;
  throw new Error(`Practice run must be true or false, not "${raw}".`);
}
var STAMP_ENV = Object.freeze({ ID: "GM_EVENT_ID", AT: "GM_SENT_AT" });
function eventStampFromEnv(env, now) {
  const id = env[STAMP_ENV.ID] || null;
  if (id !== null && !isEventId(id)) throw new Error(`"${id}" is not a usable event id.`);
  const at = env[STAMP_ENV.AT] ? Number(env[STAMP_ENV.AT]) : now;
  if (!Number.isSafeInteger(at) || at <= 0) throw new Error(`"${env[STAMP_ENV.AT]}" is not a usable time.`);
  return { id, now: at };
}
function formSummary(event, catalog = gameMasterCatalog()) {
  if (event.type === COMBO_TYPE) return describeEvent(event);
  const form = gameMasterForm(catalog);
  const label = catalog.types.find((type) => type.type === event.type)?.label ?? event.type;
  const inForm = form.filter((input) => input.type === event.type && event.params?.[input.option] !== void 0);
  const details = inForm.map((input) => {
    const value = String(event.params[input.option]);
    if (input.kind === INPUT_KIND.TEXT) return `"${value}"`;
    return input.choices.find((option) => option.value === value)?.label ?? value;
  });
  const fields = catalog.types.find((type) => type.type === event.type)?.fields ?? [];
  const more = Object.entries(event.params ?? {}).filter(([option]) => !inForm.some((input) => input.option === option)).map(([option, value]) => fields.find((field) => field.option === option)?.choices?.find((one2) => one2.value === String(value))?.text ?? `${option} ${value}`);
  const all2 = [...details, ...more];
  return all2.length ? `${label}: ${all2.join(", ")}` : label;
}

// tools/gm/action-report.mjs
var STEP = Object.freeze({ SEND: "send", PUBLISH: "publish", REBUILD: "rebuild" });
var SEND_OUTPUT = Object.freeze({ TYPE: "type", ID: "id", AT: "at", SUMMARY: "summary" });
var REPORT_COMMAND = "report";
var SENT_ENV = "GM_SENT";
var outcomeEnv = (step) => `GM_${step.toUpperCase()}_OUTCOME`;
var SUCCESS = "success";
function outputText(outputs) {
  return Object.entries(outputs).map(([name, value]) => {
    const text = String(value);
    let delimiter = "GM_OUTPUT_END";
    while (text.includes(delimiter)) delimiter += "_";
    return `${name}<<${delimiter}
${text}
${delimiter}
`;
  }).join("");
}
function errorAnnotation(message) {
  const escaped = String(message).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return `::error title=Game Master::${escaped}`;
}
function sentLine({ summary, event, practice }) {
  if (practice) return `Practice run: would send ${summary} (nothing is published).`;
  const until = new Date(event.expiresAt).toISOString().slice(11, 16);
  return `Added to events.json: ${summary} (id ${event.id}, good until ${until} UTC).`;
}
var section = (heading, text) => `### ${heading}

${text}
`;
function jobSummary({ practice = false, sent = "", outcomes, problem = null }) {
  if (outcomes[STEP.SEND] !== SUCCESS) return section("Nothing was sent", problem ?? "The sender stopped: open its step to see why, then run Game Master again.");
  if (practice) return section(`Practice run: ${sent}`, 'That works, and nothing was sent. Run Game Master again with "Practice run" off to send it.');
  if (outcomes[STEP.PUBLISH] !== SUCCESS) return section("Nothing was sent", `${sent} couldn't be saved on the site (open "Publish it" to see why). Run Game Master again.`);
  if (outcomes[STEP.REBUILD] !== SUCCESS) {
    return section(
      `Saved, but the site may not update: ${sent}`,
      "GitHub Pages didn't take the rebuild request, so Charlie may not see it until the site rebuilds again (the next surprise or deploy). Sending it again makes it a second surprise."
    );
  }
  return section(`Sent: ${sent}`, `${REACTION_NOTE} It plays at the next safe moment in his game.`);
}

// tools/gm/action-entry.mjs
async function readEventsFile(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
async function appendForGitHub(env, name, text) {
  if (env[name]) await appendFile(env[name], text);
}
async function send(env) {
  const values = formValuesFromEnv(env);
  const { type, params } = eventFromForm(values);
  const practice = practiceRunFromForm(values);
  const stamp = eventStampFromEnv(env, Date.now());
  const event = createEvent({ type, params, now: stamp.now, id: stamp.id });
  const path = join(env.GM_SITE_DIR || process.cwd(), EVENTS_FILE_NAME);
  const file = withEvent(await readEventsFile(path), event);
  const summary = formSummary(event);
  if (practice) console.log(eventsFileText(file).trimEnd());
  else await writeFile(path, eventsFileText(file));
  await appendForGitHub(env, "GITHUB_OUTPUT", outputText({ [SEND_OUTPUT.TYPE]: event.type, [SEND_OUTPUT.ID]: event.id, [SEND_OUTPUT.AT]: event.at, [SEND_OUTPUT.SUMMARY]: summary }));
  console.log(sentLine({ summary, event, practice }));
}
async function report(env) {
  const values = formValuesFromEnv(env);
  const outcomes = Object.fromEntries(Object.values(STEP).map((step) => [step, env[outcomeEnv(step)] ?? ""]));
  let problem = null;
  try {
    eventFromForm(values);
  } catch (error) {
    problem = error.message;
  }
  let practice = false;
  try {
    practice = practiceRunFromForm(values);
  } catch (error) {
    problem ??= error.message;
  }
  const markdown = jobSummary({ practice, sent: env[SENT_ENV] ?? "", outcomes, problem });
  await appendForGitHub(env, "GITHUB_STEP_SUMMARY", markdown);
  console.log(markdown.trimEnd());
}
async function main([command] = []) {
  if (command === REPORT_COMMAND) return report(process.env);
  if (command === void 0) return send(process.env);
  throw new Error(`Unknown command "${command}" (send.mjs, or send.mjs ${REPORT_COMMAND}).`);
}
main(process.argv.slice(2)).catch((error) => {
  console.log(errorAnnotation(error.message));
  process.exitCode = 1;
});
