// Boucle de jeu : relie la simulation (src/sim), la 3D et l'interface.

import * as THREE from 'three';
import { World } from './World.js';
import { gfx } from './gfx.js';
import { preloadModels, loadModel, MODELS } from './assets.js';
import { REAL_HORSE_KEY, horseView, realHorseBase } from './models/horseReal.js'; // cheval réaliste : chargé à part
import { REAL_DOG_KEYS, realDogBase } from './models/dogReal.js'; // chiens réalistes : chargés après le cheval
import { REAL_SHEEP_KEY, realSheepBase } from './models/sheepReal.js'; // mouton réaliste : chargé après les chiens
import { REAL_GOAT_KEY, realGoatBase } from './models/goatReal.js'; // chèvre réaliste : chargée après le mouton
import { REAL_COW_KEY, REAL_BULL_KEY, realCowBase } from './models/cowReal.js'; // vache et taureau réalistes : après la chèvre
import { hairTexture } from './models/horseHair.js';
import { renderSetup, PixelBudget, SLOW_KEY } from './pixelBudget.js'; // définition et anticrénelage selon la qualité
import { REAL_CAT_KEYS, realCatBase } from './models/catReal.js'; // chats réalistes : chargés après les chiens
import { REAL_RABBIT_KEYS, realRabbitBase } from './models/rabbitReal.js'; // lapins réalistes : chargés après les chats
import { Weather3D } from './Weather3D.js';
import { Player, CameraRig } from './Player.js';
import { AnimalEntity } from './AnimalEntity.js';
import { Input } from './Input.js';
import { HelperEntity } from './HelperEntity.js';
import { DogTrainer } from './DogTrainer.js'; // métier éducateur canin : clients, séances, livraison
import { Herding } from './Herding.js';
import { TaskQueue } from './TaskQueue.js';
import { Interiors, setStableExt } from './Interiors.js'; // écurie et maison où l'on entre, box, corvées
import { ensureFacilities, stableExt } from '../sim/facilities.js'; // taille de l'écurie
import { Events } from './Events.js'; // événements spéciaux (orage, animal blessé…)
import { Clients } from './Clients.js'; // clients (pension, soins) et métiers
import { EQUIPMENT_MODELS } from './models/equipment.js';
import { disposeModel } from './models/animalModel.js';
import {
  EQUIPMENT, HERD_SPECIES, equipmentAt, buyEquipment, refillEquipment, wantedEquipment, useEquipment,
  passiveEquipment, hireHelper, fireHelper, payHelpers, doHelperTask, tickProduce, collectProduct,
  socialMoment, graze, companionsOf, hasStock, helperTask as helperTaskFn, HELPERS, equipmentShown, helperShown,
} from '../sim/farm.js';
import { SPECIES, isOffered, coreShown } from '../sim/species.js';
import {
  NEEDS, createAnimal, tickAnimal, applyCare, careFull, bondStage, CARE, breedingChecklist, mate, trainTrick, trainSkill, canRide, canBreed, breed, cure, checkup, mood, ageYears,
  namesInUse,
} from '../sim/animal.js';
import { minutesPerSecond, dayOf, hourOf, isNight, seasonOf, DAYS_PER_YEAR } from '../sim/time.js';
import { PLACES, rollWeather, temperature, checkTravel, TRAVEL_MODES, placeSeason } from '../sim/places.js';
import { adoptionPrice, shopPrice, stageAgeDays } from '../sim/adoption.js';
import { checkObjectives, objectiveParams } from '../sim/objectives.js';
import { mainQuest, afterQuestsDone } from '../sim/quests.js'; // l'histoire de la ferme : fin d'un chapitre
import { loadProfile, spend, earn, canAfford, addStat, isSandbox } from '../sim/profile.js';
import { deviceStore, saveGuarded } from '../sim/saveStore.js'; // sauvegarde qui n'écrase rien en silence
import { buildingActions, animalActionAllowed } from '../sim/buildings.js';
import { addHelperXp, tireHelper, restHelper, updateBreak, onBreak, startBreak } from '../sim/helpers.js'; // les aides progressent
import { addXp, isUnlocked, levelOf, UNLOCKS } from '../sim/progress.js';
import { digest, addDropping, dryPuddles, dirtNear, removeDroppings, scoopZone } from '../sim/droppings.js';
import { enclosure } from './nav.js';
import { missingTool, buyTool, TOOLS } from '../sim/tools.js';
import { healthDay, noteHealth, WORMER_COST, WORMER_LOW_AGAIN, HEALTH_PLAN } from '../sim/horseHealth.js'; // le carnet de santé du cheval
import { markHorseDay } from '../sim/horseDay.js'; // la journée de ton cheval
import { galopLevel, nextGalop, canTakeExam } from '../sim/galops.js'; // 🏅 les Galops
import { CALL, answerCall, cameWhenCalled } from '../sim/horseCall.js'; // 📣 appeler ton cheval
import { tapPost, postMilestone } from '../sim/posting.js'; // ⬆️ trot enlevé
import { todayChallenge, challengeJustDone, CHALLENGE_REWARD } from '../sim/horseChallenge.js'; // 🎯 le défi du jour
import {
  GEAR, buyGear, equip, unequip, rideGear, tackUpForRide, starterTack, feltWeather, canLead, canLeash, equipHelmet, riderHelmet, LEASH_LEN,
  unsaddle, saddleUp, unbridle, bridleUp,
} from '../sim/gear.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { Activities } from './Activities.js'; // activités : saut, balade, agility, spectacles, concours
import { FreeJumps } from './FreeJumps.js'; // ⤴️ sauter des troncs en balade libre
import { Halloween } from './Halloween.js'; // 🎃 la fête d'Halloween au poney-club (fin octobre)
import { inShowground } from '../sim/activities.js'; // (la carrière : du sable)
import { WARMUP, WARM_FOR, warmSession, dismountVerdict } from '../sim/warmup.js'; // 🐢 détente et retour au calme
import { remember, anniversaryDue, togetherSince, BOND_MEMORIES } from '../sim/memories.js'; // 📸 les souvenirs de ton cheval
import { collectFact } from '../sim/horseFacts.js'; // 🃏 les cartes « Le savais-tu ? »
import { quirksOf, discoverQuirk, spookCause, noteFear, QUIRK_BOND } from '../sim/horseQuirks.js'; // 🔍 ce que tu sais de lui
import { matchyOf } from '../sim/matchy.js'; // 🎨 tout assorti : tapis, guêtres et bombe
import { Beauty } from './Beauty.js'; // concours de beauté : préparation visible sur l'animal, présentation au juge
import { TrailGuide } from './TrailGuide.js'; // 🧭 métier guide de randonnée : visiteurs, balades guidées
import { t, L, getLang, fmtHour } from '../i18n.js';
// Vue d'ensemble (d'en haut) et constructions du joueur.
import { Structures } from './Structures.js';
import { ManagementView } from './ManagementView.js';
import { openStructure } from '../ui/construction.js';
import { doorOf, equipmentPos, STRUCTURES, structureShown } from '../sim/construction.js';
import { applyCoreLayout } from './coreLayout.js';
import { TripFlow } from './TripFlow.js'; // voyages réalistes (véhicule, trajet, pauses)
import { CompetitionVenue } from './CompetitionVenue.js'; // concours à l'extérieur : site, épreuve, podium
import './Dressage.js'; // séances de dressage (s'enregistrent dans Activities)
import { Marker } from './Marker.js';
import { Arrivals } from './arrivals.js'; // les visiteurs des métiers arrivent chacun leur tour
import { Emitter } from './emitter.js'; // petit système d'événements (on / emit)
import { audio } from './audio.js'; // sons synthétisés : voix, pas, ambiance, interface
import { Groomer } from './Groomer.js'; // métier Toiletteur : salon, clients et leurs animaux

// Animaux qu'on range dans la maison des animaux.
const PET_HOUSED = ['dog', 'cat', 'rabbit'];
// Attente du cheval réaliste au plus (ms après l'ouverture de la page) avant d'ouvrir une partie : un fichier en
// cache arrive avant ; sur un réseau lent, on joue avec le cheval sculpté en attendant (voir onRealHorse).
const HORSE_GRACE_MS = 1500;

const CARE_EMOJI = {
  feed: '🍖', water: '💧', brush: '✨', wash: '🫧', clean: '🧹', nails: '✂️', shoe: '🔨',
  pet: '❤️', treat: '🍪', play: '⚽', lunge: '⭐', liberty: '💛',
};

export const JOBS = [
  { id: 'walk', pay: 25, hours: 1 },
  { id: 'catsit', pay: 30, hours: 1.5, needs: ['cat'] }, // (affiché quand les chats sont proposés : anyAvailable)
  { id: 'stable', pay: 40, hours: 2 },
  { id: 'hay', pay: 35, hours: 2 },
];

export const VET_COST = { clinic: 30, home: 50 };

export class Game {
  constructor(container, ui) {
    this.ui = ui;
    this.quality = readQuality();
    gfx.quality = this.quality;
    // Définition et anticrénelage (src/game/pixelBudget.js) : en qualité basse sur un écran fin, 1,25 pixel par
    // point et MSAA, avec repli à 1 si les premières secondes de jeu sont trop lentes (retenu pour la suite : 1,25
    // sans MSAA aux parties suivantes).
    const setup = renderSetup(this.quality, window.devicePixelRatio, readFlag(SLOW_KEY));
    const renderer = new THREE.WebGLRenderer({ antialias: setup.msaa, powerPreference: 'high-performance' });
    renderer.setPixelRatio(setup.ratio);
    gfx.msaa = setup.msaa && renderer.getContextAttributes?.()?.antialias !== false;
    this.pixelBudget = setup.budget ? new PixelBudget() : null;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = this.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tons filmiques : les hautes lumières (ciel, soleil) restent douces.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.prepend(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    this.world = new World(this.scene, this.quality);
    this.world.setRenderer(renderer);
    this.weather3d = new Weather3D(this.scene, this.quality);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(renderer.domElement, document.getElementById('joystick'));
    this.input.onKey = (code) => this.onKey(code);
    this.input.onTap = (x, y) => this.onTap(x, y);
    this.raycaster = new THREE.Raycaster();
    // Petit cercle blanc là où on a touché le sol (renommé : game.marker est le repère réutilisable).
    this.tapRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.tapRing.visible = false;
    this.scene.add(this.tapRing);
    // Événements du jeu (game.on / game.emit) et repère 3D réutilisable (game.marker.show / hide).
    this.bus = new Emitter(); // (game.events = événements spéciaux)
    this.marker = new Marker(this);
    this.entities = new Map();
    this.helpers = new Map();
    this.equipment = [];
    this.herding = new Herding(this);
    this.tasks = new TaskQueue(this);
    this.interiors = new Interiors(this);
    this.events = new Events(this);
    this.arrivals = new Arrivals({ clock: () => this.profile?.clock ?? 0 }); // (avant les métiers qui l'utilisent)
    this.clients = new Clients(this); // visiteurs, animaux confiés, métiers
    this.activities = new Activities(this);
    this.freeJumps = new FreeJumps(this); // ⤴️ les troncs du chemin de balade
    this.halloween = new Halloween(this); // 🎃 citrouilles-lanternes et chasse aux citrouilles
    this.beauty = new Beauty(this); // concours de beauté (game.beauty)
    this.dogTrainer = new DogTrainer(this);
    this.trailGuide = new TrailGuide(this); // 🧭 guide de randonnée
    this.droppingMeshes = new Map();
    this.timeScale = 1; // 0 = pause
    this.profile = null;
    this.running = false;
    this.simAcc = 0;
    this.checkAcc = 0;
    this.saveAcc = 0;
    this.focus = null;
    this.structures = new Structures(this);
    this.mgmt = new ManagementView(this);
    this.tripFlow = new TripFlow(this);
    // Sons (src/game/audio.js) : l'animal répond quand on s'occupe de lui, petits sons sur ⏩ et ×2/×4.
    this.audio = audio;
    this.on('care', ({ a, action }) => this.entities.get(a.id)?.speak(['pet', 'treat', 'play', 'feed', 'water'].includes(action) ? 'happy' : null));
    // Le personnage fait le geste du soin (verser, brosser, caresser…), tourné vers l'animal.
    this.on('care', ({ a, action }) => this.player?.careGesture?.(action, this.entities.get(a.id)));
    this.on('adopted', (a) => setTimeout(() => this.entities.get(a.id)?.speak('happy'), 350));
    this.on('skip', (hours) => audio.ui(hours > 0 ? 'skip' : 'cancel'));
    this.on('timeFast', () => audio.ui('fast'));
    this.venue = new CompetitionVenue(this); // concours à l'extérieur (site, épreuve, podium)
    this.groomer = new Groomer(this); // salon de toilettage (métier Toiletteur)

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());
    // Modèles 3D (GLB) : chargés pendant l'écran des profils ; start() attend les petits (arbres, rochers…).
    // Le cheval réaliste (≈ 0,75 Mo) n'est attendu qu'un court instant après l'ouverture de la page (assez pour
    // un fichier déjà en cache) : sur un réseau lent, la partie s'ouvre avec le cheval sculpté (horseModel.js)
    // et les chevaux prennent le réaliste dès qu'il arrive (onRealHorse).
    // (le cheval est demandé après les petits : sur un réseau lent, il ne leur prend pas la bande passante)
    this.modelsLoaded = false;
    this.horseSwap = [];
    this.dogSwap = [];
    this.catSwap = [];
    this.rabbitSwap = [];
    this.sheepSwap = [];
    this.goatSwap = [];
    this.cowSwap = [];
    const grace = new Promise((r) => setTimeout(r, HORSE_GRACE_MS));
    const dogKeys = Object.values(REAL_DOG_KEYS);
    const catKeys = Object.values(REAL_CAT_KEYS);
    const rabbitKeys = Object.values(REAL_RABBIT_KEYS);
    const others = preloadModels(Object.keys(MODELS).filter((k) => k !== REAL_HORSE_KEY && k !== REAL_SHEEP_KEY && k !== REAL_GOAT_KEY
      && k !== REAL_COW_KEY && k !== REAL_BULL_KEY
      && !dogKeys.includes(k) && !catKeys.includes(k) && !rabbitKeys.includes(k)));
    const horse = others.then(() => loadModel(REAL_HORSE_KEY));
    // Chiens réalistes (shiba ≈ 0,85 Mo, jack ≈ 0,5 Mo) : demandés après le cheval, jamais attendus à l'ouverture ;
    // les chiens prennent le modèle réaliste dès qu'il arrive (onRealDogs), le procédural en attendant.
    this.realDogsReady = horse.then(() => Promise.all(dogKeys.map((k) => loadModel(k)))).then((list) => {
      if (list.some(Boolean)) this.onRealDogs(list);
      return list.filter(Boolean).length;
    });
    // Chats réalistes (adulte ≈ 0,9 Mo, chaton ≈ 0,75 Mo) : demandés après les chiens, jamais attendus ; les chats
    // prennent le modèle réaliste dès qu'il arrive (onRealCats), le chat procédural (catModel.js) en attendant.
    this.realCatsReady = this.realDogsReady.then(() => Promise.all(catKeys.map((k) => loadModel(k)))).then((list) => {
      if (list.some(Boolean)) this.onRealCats(list);
      return list.filter(Boolean).length;
    });
    // Lapins réalistes (lapin gris ≈ 0,6 Mo, bélier ≈ 0,45 Mo) : demandés après les chats, jamais attendus ; les lapins
    // prennent le modèle réaliste dès qu'il arrive (onRealRabbits), le lapin procédural (animalModel.js) en attendant.
    this.realRabbitsReady = this.realCatsReady.then(() => Promise.all(rabbitKeys.map((k) => loadModel(k)))).then((list) => {
      if (list.some(Boolean)) this.onRealRabbits(list);
      return list.filter(Boolean).length;
    });
    // Mouton réaliste (≈ 0,5 Mo) : demandé après les chiens, jamais attendu ; les moutons prennent le modèle réaliste
    // dès qu'il arrive (onRealSheep), le procédural en attendant.
    this.realSheepReady = this.realDogsReady.then(() => loadModel(REAL_SHEEP_KEY)).then((gltf) => {
      if (gltf) this.onRealSheep(gltf);
      return !!gltf;
    });
    // Chèvre réaliste (≈ 0,53 Mo) : demandée après le mouton, jamais attendue ; les chèvres prennent le modèle réaliste
    // dès qu'il arrive (onRealGoats), la chèvre procédurale en attendant.
    this.realGoatReady = this.realSheepReady.then(() => loadModel(REAL_GOAT_KEY)).then((gltf) => {
      if (gltf) this.onRealGoats(gltf);
      return !!gltf;
    });
    // Vache réaliste (≈ 0,75 Mo) et taureau (≈ 0,6 Mo) : demandés après la chèvre, jamais attendus ; les vaches prennent
    // le modèle réaliste dès qu'il arrive (onRealCows), la vache procédurale en attendant.
    this.realCowReady = this.realGoatReady.then(() => Promise.all([loadModel(REAL_COW_KEY), loadModel(REAL_BULL_KEY)])).then((list) => {
      if (list.some(Boolean)) this.onRealCows(list);
      return list.filter(Boolean).length;
    });
    this.modelsReady = Promise.all([others, Promise.race([horse, grace])])
      .then(([n]) => { this.modelsLoaded = true; return n; });
    this.realHorseReady = horse.then((gltf) => {
      if (gltf) this.onRealHorse(gltf);
      return !!gltf;
    });
  }

  /**
   * Le cheval réaliste est chargé. La texture des crins puis ses données de repos (≈ 0,3 s de calcul, une fois)
   * sont faites juste après, hors de l'image en cours ; puis les chevaux déjà là avec le modèle de repli prennent le
   * réaliste, un par image (Game.frame : swapRealHorses), et les vignettes de chevaux sont refaites.
   */
  onRealHorse(gltf) {
    // (texture des crins, faite en code une fois : ≈ 30 ms, dans sa propre tâche plutôt qu'au premier cheval)
    setTimeout(() => hairTexture(), 0);
    setTimeout(() => {
      try {
        realHorseBase(gltf);
      } catch (err) {
        console.warn('Cheval réaliste : préparation impossible', err);
        return;
      }
      for (const e of this.allEntities()) if (e.data.species === 'horse' && !e.model?.real) this.horseSwap.push(e);
      this.thumbs?.modelsChanged?.();
    }, 30);
  }

  /**
   * Les chiens réalistes sont chargés (l'un, l'autre ou les deux). Leurs données de repos sont tirées des GLB juste
   * après, hors de l'image en cours ; puis les chiens au modèle de repli prennent le réaliste, un par image
   * (swapRealDogs), et les vignettes d'animaux et d'équipement sont refaites.
   */
  onRealDogs(list) {
    setTimeout(() => {
      const kinds = Object.keys(REAL_DOG_KEYS);
      list.forEach((gltf, i) => {
        if (!gltf) return;
        try {
          realDogBase(gltf, kinds[i]);
        } catch (err) {
          console.warn('Chien réaliste : préparation impossible', kinds[i], err);
        }
      });
      for (const e of this.allEntities()) if (e.data.species === 'dog' && !e.model?.realDog) this.dogSwap.push(e);
      this.thumbs?.modelsChanged?.();
    }, 60);
  }

  /**
   * Les chats réalistes sont chargés (l'adulte, le chaton ou les deux). Leurs données de repos sont tirées des GLB juste
   * après, hors de l'image en cours ; puis les chats au modèle de repli prennent le réaliste, un par image
   * (swapRealCats), et les vignettes d'animaux et d'équipement sont refaites.
   */
  onRealCats(list) {
    setTimeout(() => {
      const kinds = Object.keys(REAL_CAT_KEYS);
      list.forEach((gltf, i) => {
        if (!gltf) return;
        try {
          realCatBase(gltf, kinds[i]);
        } catch (err) {
          console.warn('Chat réaliste : préparation impossible', kinds[i], err);
        }
      });
      for (const e of this.allEntities()) if (e.data.species === 'cat' && !e.model?.realCat) this.catSwap.push(e);
      this.thumbs?.modelsChanged?.();
    }, 90);
  }

  /**
   * Les lapins réalistes sont chargés (le gris, le bélier ou les deux). Leurs données de repos sont tirées des GLB juste
   * après, hors de l'image en cours ; puis les lapins au modèle de repli prennent le réaliste, un par image
   * (swapRealRabbits), et les vignettes d'animaux sont refaites.
   */
  onRealRabbits(list) {
    setTimeout(() => {
      const kinds = Object.keys(REAL_RABBIT_KEYS);
      list.forEach((gltf, i) => {
        if (!gltf) return;
        try {
          realRabbitBase(gltf, kinds[i]);
        } catch (err) {
          console.warn('Lapin réaliste : préparation impossible', kinds[i], err);
        }
      });
      for (const e of this.allEntities()) if (e.data.species === 'rabbit' && !e.model?.realRabbit) this.rabbitSwap.push(e);
      this.thumbs?.modelsChanged?.();
    }, 120);
  }

  /**
   * Un lapin au modèle de repli prend le lapin réaliste (un par image). Pas pendant une séance qui le guide (jeux du
   * clapier, lapin-hop, agility, spectacle, concours), porté dans les bras ni sur la table du salon : il attend son tour.
   */
  swapRealRabbits() {
    const list = this.rabbitSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.realRabbit) {
        list.splice(i--, 1);
        continue;
      }
      if (e.scripted || e.herdCtrl || e.posing || e.onTable || e.carried) continue;
      list.splice(i, 1);
      e.rebuildModel();
      if (e.model?.realRabbit) return;
    }
  }

  /**
   * Un chat au modèle de repli prend le chat réaliste (un par image). Pas pendant une séance qui le guide (spectacle,
   * concours), porté dans les bras, sur la table du salon ni perché sur une barrière : il attend son tour.
   */
  swapRealCats() {
    const list = this.catSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.realCat) {
        list.splice(i--, 1);
        continue;
      }
      if (e.scripted || e.herdCtrl || e.posing || e.onTable || e.carried || e.perch) continue;
      list.splice(i, 1);
      e.rebuildModel();
      if (e.model?.realCat) return;
    }
  }

  /**
   * Le mouton réaliste est chargé. Ses données de repos sont tirées du GLB juste après, hors de l'image en cours ; puis
   * les moutons au modèle de repli prennent le réaliste, un par image (swapRealSheep), et les vignettes sont refaites.
   */
  onRealSheep(gltf) {
    setTimeout(() => {
      try {
        realSheepBase(gltf);
      } catch (err) {
        console.warn('Mouton réaliste : préparation impossible', err);
        return;
      }
      for (const e of this.allEntities()) if (e.data.species === 'sheep' && !e.model?.realSheep) this.sheepSwap.push(e);
      this.thumbs?.modelsChanged?.();
    }, 90);
  }

  /**
   * La chèvre réaliste est chargée : données de repos tirées du GLB juste après, hors de l'image en cours ; puis les
   * chèvres au modèle de repli prennent la réaliste, une par image (swapRealGoats), et les vignettes sont refaites.
   */
  onRealGoats(gltf) {
    setTimeout(() => {
      try {
        realGoatBase(gltf);
      } catch (err) {
        console.warn('Chèvre réaliste : préparation impossible', err);
        return;
      }
      for (const e of this.allEntities()) if (e.data.species === 'goat' && !e.model?.realGoat) this.goatSwap.push(e);
      this.thumbs?.modelsChanged?.();
    }, 90);
  }

  /**
   * La vache (ou le taureau) réaliste est chargée : données de repos tirées des GLB juste après, hors de l'image en cours
   * (l'un après l'autre : ≈ 0,1 à 0,3 s chacun) ; puis les vaches au modèle de repli prennent la réaliste, une par image
   * (swapRealCows), et les vignettes sont refaites.
   */
  onRealCows(list) {
    const todo = list.filter(Boolean);
    const next = () => {
      const gltf = todo.shift();
      if (gltf) {
        try {
          realCowBase(gltf);
        } catch (err) {
          console.warn('Vache réaliste : préparation impossible', err);
        }
        if (todo.length) {
          setTimeout(next, 60);
          return;
        }
      }
      for (const e of this.allEntities()) if (e.data.species === 'cow' && !e.model?.realCow) this.cowSwap.push(e);
      this.thumbs?.modelsChanged?.();
    };
    setTimeout(next, 90);
  }

  /**
   * Une vache au modèle de repli prend la vache réaliste (une par image). Pas quand elle est menée (troupeau), guidée par
   * une activité (van, concours, spectacle), en pose ni sur la table : elle attend son tour. (Un taureau dont le GLB
   * manque garde la vache procédurale : on passe à la suivante.)
   */
  swapRealCows() {
    const list = this.cowSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.realCow) {
        list.splice(i--, 1);
        continue;
      }
      if (e.scripted || e.herdCtrl || e.posing || e.onTable) continue;
      list.splice(i--, 1);
      e.rebuildModel();
      if (e.model?.realCow) return;
    }
  }

  /**
   * Une chèvre au modèle de repli prend la chèvre réaliste (une par image). Pas quand elle est menée (troupeau), guidée
   * par une activité (van, concours, spectacle, agility), en pose, sur la table du salon ni en train de monter dans le
   * van : elle attend son tour.
   */
  swapRealGoats() {
    const list = this.goatSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.realGoat) {
        list.splice(i--, 1);
        continue;
      }
      if (e.scripted || e.herdCtrl || e.posing || e.onTable) continue;
      list.splice(i, 1);
      e.rebuildModel();
      if (e.model?.realGoat) return;
    }
  }

  /**
   * Un mouton au modèle de repli prend le mouton réaliste (un par image). Pas quand il est mené (troupeau), guidé par
   * une activité (van, concours, spectacle), en pose ni sur la table du salon : il attend son tour.
   */
  swapRealSheep() {
    const list = this.sheepSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.realSheep) {
        list.splice(i--, 1);
        continue;
      }
      if (e.scripted || e.herdCtrl || e.posing || e.onTable) continue;
      list.splice(i, 1);
      e.rebuildModel();
      if (e.model?.realSheep) return;
    }
  }

  /**
   * Un chien au modèle de repli prend le chien réaliste (un par image). Pas pendant une séance qui le guide, une
   * démonstration de l'éducateur, sur la table du salon ni quand il conduit le troupeau : il attend son tour.
   */
  swapRealDogs() {
    const list = this.dogSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.realDog) {
        list.splice(i--, 1);
        continue;
      }
      if (e.scripted || e.herdCtrl || e.posing || e.onTable) continue;
      list.splice(i, 1);
      e.rebuildModel();
      if (e.model?.realDog) return;
    }
  }

  /**
   * Tous les animaux de la scène : ceux de la partie, ceux en visite au salon de toilettage, l'animal du client
   * qui attend (vétérinaire, pension : src/game/Clients.js) ou qui repart, le chien du maître en visite.
   */
  allEntities() {
    const out = [...this.entities.values()];
    for (const v of this.groomer?.visitors?.values() ?? []) if (v.e) out.push(v.e);
    for (const v of this.groomer?.leaving ?? []) if (v.e) out.push(v.e);
    if (this.clients?.visitor?.e) out.push(this.clients.visitor.e);
    for (const l of this.clients?.leaving ?? []) if (l.e) out.push(l.e);
    if (this.dogTrainer?.visitor?.e) out.push(this.dogTrainer.visitor.e);
    return [...new Set(out)];
  }

  /**
   * Un cheval au modèle de repli prend le cheval réaliste (un par image : la première construction d'une race
   * coûte quelques dizaines de ms). Pas pendant qu'on le monte, qu'une séance le guide ou qu'on le mène :
   * il attend son tour.
   */
  swapRealHorses() {
    const list = this.horseSwap;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const here = e.root?.parent && !e.disposed;
      if (!here || e.model?.real) {
        list.splice(i--, 1);
        continue;
      }
      if (e.ridden || e.scripted || e.herdCtrl || e.posing || this.player?.mount === e) continue;
      list.splice(i, 1);
      e.rebuildModel();
      return;
    }
  }

  // ---------------------------------------------------------------- partie

  /**
   * Ouvre la partie. Renvoie false si elle est déjà ouverte dans un autre onglet ou une autre fenêtre (registre
   * des parties ouvertes, branché par src/main.js sur this.openElsewhere) : deux onglets sur la même partie se
   * remplaceraient l'un l'autre à chaque sauvegarde.
   */
  start(profile) {
    if (this.openElsewhere?.(profile.id)) {
      this.ui.toast(t('cloud_openElsewhere'), 8000);
      return false;
    }
    if (!this.modelsLoaded) {
      // Partie « en train de s'ouvrir » (comptée comme ouverte par la synchro, src/main.js). Quand elle démarre
      // vraiment, on la relit sur l'appareil : une synchro a pu la mettre à jour pendant le chargement des modèles.
      this.opening = profile;
      this.emit('opening', profile);
      this.modelsReady.then(() => {
        if (this.opening !== profile) return; // une autre partie a été choisie entre-temps
        this.opening = null;
        this.start(loadProfile(profile.id) ?? profile);
      });
      return;
    }
    this.opening = null;
    this.profile = profile;
    // Version de départ sur l'appareil : Game.save ne l'écrasera pas en silence si quelqu'un d'autre l'a changée.
    this.savedAt = profile.updatedAt;
    this.savedKey = null;
    this.otherCopy = null; // la copie de secours faite pendant cette partie (une seule, mise à jour ensuite)
    this.rig.mode = profile.settings.camera ?? 'third';
    this.player = this.player ?? new Player(this.scene, this.world, profile.avatar);
    this.player.setAvatar(profile.avatar);
    // Bruit des pas selon le sol (herbe, terre, plancher, pierre…), sabots à cheval.
    this.player.onStep = (running, hoof) => audio.step(hoof ? 'hoof' : this.surfaceAt(), running);
    // Balade libre à cheval : le cheval trop fatigué pour galoper, ou qui fait un écart (src/sim/riding.js).
    this.player.onGait = (gait, why) => {
      const m = this.player.mount?.data;
      if (!m) return;
      if (why === 'tired' || why === 'exhausted') this.ui.toast(t(`ride_${why}`, { name: m.name, g: m.sex }), 4500);
      else if (why === 'graze') this.ui.toast(t('ride_graze', { name: m.name, g: m.sex }), 6000);
      else if (why === 'sitTrot') this.ui.toast(t('ride_sitTrot', { name: m.name, g: m.sex }), 6000);
      // 🐢 la détente (src/sim/warmup.js) : dit les premières fois seulement
      else if (why === 'cold' || why === 'warm') {
        const k = why === 'cold' ? 'warmTipCold' : 'warmTipOk';
        const n = this.profile[k] ?? 0;
        if (n < 3) {
          this.profile[k] = n + 1;
          this.ui.toast(t(`ride_${why}`, { name: m.name, g: m.sex }), why === 'cold' ? 6500 : 3500);
        }
      }
      else if (why === 'spook') {
        // 🔍 Le plus souvent, sa peur à lui (src/sim/horseQuirks.js) : la deuxième fois, tu as compris ; ensuite, le jeu
        // te rappelle de lui parler doucement.
        const cause = spookCause(m);
        const seen = noteFear(m, cause);
        if (seen === 'again') this.ui.toast(t('ride_spookAgain', { name: m.name, g: m.sex, what: t(`qk_fear${cause}`) }), 5000);
        else this.ui.toast(t('ride_spook', { name: m.name, g: m.sex, what: t(`ride_spookWhat${cause}`) }), 5000);
        audio.animal('horse', 'sad', m.id); // (il s'ébroue)
        if (seen === 'discovered') this.quirkFound(m, 'fear');
      }
      this.ui.updateGaitPad?.();
    };
    // Le cheval gourmand ne s'arrête pour brouter que sur l'herbe (pas dans la carrière, ni sur le chemin).
    this.player.onGrass = () => this.surfaceAt() === 'grass';
    // Trois secondes de galop d'affilée (une fois par balade) : le chapitre « au trot, puis au galop ».
    this.player.onCanter = () => {
      addStat(this.profile, 'rideCanter');
      this.remember(this.player.mount?.data, 'firstCanter');
    };
    audio.configure(profile.settings.sound);
    audio.setActive(true);
    // Anciennes sauvegardes : un cheval dessellé gardait son filet au box et au pré. On le range (en silence).
    for (const a of profile.animals) {
      if (a.species === 'horse' && !a.client && !a.guest && a.location === profile.place && a.gear?.bridle && !a.gear.saddle) unbridle(profile, a, { home: this.isHome });
    }
    this.loadPlace(profile.place);
    this.running = true;
    this.clock.getDelta();
    this.ui.onStart(this);
    // Pendant le tutoriel guidé, c'est le guide qui explique quoi faire.
    if (profile.animals.length === 0 && profile.tutorial?.done !== false) this.ui.toast(t('welcome', { name: profile.name }), 7000);
    this.emit('start', profile);
  }

  /** Événements : game.on('adopted', fn), game.emit('adopted', a). */
  on(name, fn) {
    return this.bus.on(name, fn);
  }

  emit(name, data) {
    this.bus.emit(name, data);
  }

  stop() {
    this.freeJumps?.cancel(); // (cross en cours : arrêté, sa flèche retirée)
    this.tasks.clear();
    this.mgmt.stop();
    this.activities.abort();
    const saved = this.save(); // avant d'annuler un trajet en cours : on ne sauvegarde pas un voyage à moitié fait
    this.tripFlow.reset();
    this.groomer?.clear(); // salon de toilettage : clients et animaux en visite repartent
    audio.setActive(false); // écran des profils : silence
    this.marker.hide();
    this.venue?.dispose(); // le site du concours (tribunes, podium) est retiré de la scène
    this.dogTrainer?.reset(); // éducateur canin : maîtres en visite, promenade-séance
    if (this.player?.mount) this.player.dismount();
    this.herding.stop(false);
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    for (const h of this.helpers.values()) h.dispose();
    this.helpers.clear();
    this.running = false;
    this.profile = null;
    // Prévenu seulement maintenant : la partie est vraiment arrêtée (la synchro du retour au menu ne doit plus
    // pouvoir sauvegarder un voyage à moitié fait, ni voir la partie comme ouverte).
    this.emit('stop');
    return saved;
  }

  /** Sauvegarde le profil. Renvoie false si rien n'a été écrit (pas de profil, voyage en cours, stockage plein). */
  save() {
    if (!this.profile) return false;
    // Pendant un trajet suivi, le profil est entre deux lieux (billet payé, animaux en route) :
    // on garde la sauvegarde d'avant le départ plutôt qu'un voyage à moitié fait.
    if (this.tripFlow?.journey && !this.tripFlow.journey.report) return false;
    for (const e of this.entities.values()) {
      e.data.pos = [e.position.x, e.position.z];
    }
    // Rien n'est écrit si rien n'a changé ; si la partie a été changée ailleurs sur l'appareil (autre onglet,
    // synchro), cette autre version est d'abord gardée en copie de secours (une seule par partie jouée : mise à
    // jour ensuite, pour ne pas remplir l'appareil si un autre onglet continue d'y jouer).
    const r = saveGuarded(deviceStore(), this.profile, {
      lastAt: this.savedAt,
      lastKey: this.savedKey,
      reuse: this.otherCopy,
      backupName: (p) => t('cloud_backupName', { name: p.name, date: new Date().toLocaleDateString(getLang() === 'fr' ? 'fr-CH' : 'en-GB', { day: '2-digit', month: '2-digit' }) }),
    });
    if (r.ok) {
      this.savedAt = r.at;
      this.savedKey = r.key;
    }
    if (r.backup) {
      this.otherCopy = r.backup.id;
      this.emit('backupKept', r.backup);
    }
    return r.ok;
  }

  get day() {
    return dayOf(this.profile.clock);
  }

  get hour() {
    return hourOf(this.profile.clock);
  }

  get season() {
    return placeSeason(this.profile?.place ?? 'maison', seasonOf(new Date()));
  }

  get isHome() {
    return this.profile.place === this.profile.home;
  }

  /** Sol sous les pieds du joueur, pour le bruit des pas : grass / dirt / wood / stone / snow / sand. */
  surfaceAt() {
    const inside = this.interiors.inside;
    if (inside) return inside === 'house' || inside === 'tackroom' ? 'wood' : 'stone'; // sellerie : plancher
    const w = this.world;
    const p = this.player.position;
    if (w.snowy) return 'snow';
    if (w.waterLevel !== null && w.waterLevel !== undefined && w.heightAt(p.x, p.z) < w.waterLevel + 0.9) return 'sand';
    if (inShowground(p.x, p.z)) return 'sand'; // (la carrière : le cheval n'y broute pas, les pas sonnent sur le sable)
    return (w.dirtAt?.(p.x, p.z) ?? 0) > 0.5 ? 'dirt' : 'grass';
  }

  get placeDef() {
    return PLACES[this.profile.place];
  }

  loadPlace(placeId, opts = {}) {
    this.activities.abort();
    if (this.player?.mount) this.player.dismount();
    this.herding.stop(false);
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    for (const h of this.helpers.values()) h.dispose();
    this.helpers.clear();
    this.dogTrainer.onPlaceLoaded(); // éducateur canin : les maîtres en visite repartent
    applyCoreLayout(this.profile.coreLayout?.[placeId]); // bergerie, paddock… déplacés ou agrandis par le joueur
    setStableExt(stableExt(ensureFacilities(this.profile))); // écurie rallongée (8, 12 ou 16 box)
    this.world.build(placeId, this.season, placeId === this.profile.home);
    this.interiors.onPlaceLoaded(); // coins de corvées, box des chevaux
    this.equipment = [];
    for (const eq of equipmentAt(this.profile, placeId)) this.spawnEquipment(eq);
    if (!opts.keepView) this.mgmt.stop();
    this.structures.rebuild(placeId); // constructions du joueur (avant les animaux : leur maison)
    // Anciennes sauvegardes : paddock, bergerie ou clapier qui attendent d'être agrandis (si la place le permet).
    if (this.structures.growPending()) this.save();
    this.groomer.onPlaceLoaded(placeId); // clients qui attendent au salon de toilettage
    this.droppingMeshes.clear();
    for (const d of this.profile.droppings ?? []) if (d.place === placeId) this.spawnDropping(d);
    for (const h of this.profile.helpers) {
      if (h.place === placeId) this.helpers.set(h.id, new HelperEntity(h, this.world, this.scene));
    }
    this.weatherKey = null;
    this.updateWeather();
    this.player.spawn(0, -6);
    this.rig.yaw = Math.PI;
    this.rig.reset();
    for (const a of this.profile.animals) {
      if (a.location === placeId) this.spawnEntity(a);
    }
    this.venue.onPlaceLoaded(); // un concours ici aujourd'hui ? on installe le site
  }

  spawnEquipment(eq) {
    const def = EQUIPMENT[eq.type];
    const mesh = EQUIPMENT_MODELS[eq.type]();
    // Position choisie dans la vue d'ensemble (eq.pos), sinon l'emplacement prévu.
    const { x, z } = equipmentPos(this.profile.coreLayout?.[eq.place], eq);
    mesh.position.set(x, this.world.heightAt(x, z), z);
    this.world.group.add(mesh);
    const col = { x, z, hw: 0.5, hd: 0.4, equip: true };
    this.world.colliders.push(col);
    const entry = { eq, def, mesh, col, pos: new THREE.Vector3(x, 0, z) };
    this.equipment.push(entry);
    return entry;
  }

  /** Crottin (petits tas bruns) ou flaque de pipi. */
  spawnDropping(d) {
    const g = new THREE.Group();
    if (d.kind === 'poop') {
      const big = d.species === 'horse' || d.species === 'cow' ? 1 : 0.45;
      const mat = new THREE.MeshStandardMaterial({ color: d.species === 'cow' ? 0x4a3a22 : 0x5a4126, roughness: 0.9 });
      const n = d.species === 'cow' ? 1 : 4;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * big * (d.species === 'cow' ? 2.2 : 1), 8, 6), mat);
        m.position.set((Math.random() - 0.5) * 0.18 * big, 0.05 * big, (Math.random() - 0.5) * 0.18 * big);
        m.scale.y = d.species === 'cow' ? 0.35 : 0.8;
        m.castShadow = true;
        g.add(m);
      }
    } else {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x3a3320, roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }));
      m.position.y = 0.02;
      g.add(m);
    }
    g.position.set(d.x, this.world.heightAt(d.x, d.z), d.z);
    g.userData.dropping = d;
    this.world.group.add(g);
    this.droppingMeshes.set(d.id, g);
  }

  removeDroppingMeshes(ids) {
    for (const id of ids) {
      const m = this.droppingMeshes.get(id);
      if (!m) continue;
      m.parent?.remove(m);
      m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      this.droppingMeshes.delete(id);
    }
  }

  scoop(ids) {
    removeDroppings(this.profile, ids);
    this.removeDroppingMeshes(ids);
    if (ids.length) {
      addStat(this.profile, 'scoop', ids.length);
      this.xp('care', Math.min(2, ids.length));
    }
  }

  spawnEntity(a, near = null) {
    const e = new AnimalEntity(a, this.world, this.scene);
    if (near) {
      e.position.set(near.x + (Math.random() - 0.5) * 3, 0, near.z + (Math.random() - 0.5) * 3);
      this.world.resolveCollisions(e.position);
      e.snap();
    } else if (a.pos) {
      e.position.set(a.pos[0], 0, a.pos[1]);
      e.snap();
    }
    this.entities.set(a.id, e);
    return e;
  }

  animalsHere() {
    return this.profile.animals.filter((a) => a.location === this.profile.place);
  }

  // ---------------------------------------------------------------- météo

  updateWeather() {
    // Un événement (orage, canicule, neige) peut imposer sa météo : voir Events.weatherOverride.
    const forced = this.events?.weatherOverride();
    const key = `${this.day}-${Math.floor(this.hour / 6)}${forced ? `-${forced.weather}` : ''}`;
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    this.weather = forced?.weather ?? rollWeather(this.profile.place, this.season, key);
    this.weather3d.set(this.weather);
  }

  get temperature() {
    return temperature(this.profile.place, this.season, this.hour, this.weather) + (this.events?.weatherOverride()?.tempDelta ?? 0);
  }

  simWeather() {
    if (this.weather === 'clear' && this.temperature >= 28) return 'heat';
    return this.weather;
  }

  // ---------------------------------------------------------------- temps

  /** Fait passer du temps d'un coup (sommeil, voyage, petit boulot). */
  advanceTime(hours, ctx = {}, decayFactor = 1) {
    this.profile.clock += hours * 60;
    const here = this.animalsHere();
    for (const a of here) {
      const events = tickAnimal(a, hours * decayFactor, { ...ctx, weather: this.simWeather(), ...this.socialCtx(a, here) });
      a.ageDays += (hours * (1 - decayFactor)) / 24;
      tickProduce(a, hours);
      this.handleEvents(a, events);
    }
    this.farmTick(here, hours, true);
    this.clients.onTimeSkipped(); // les journées des animaux confiés sont notées (src/game/Clients.js)
    this.updateWeather();
  }

  /** Le carnet de santé des chevaux (src/sim/horseHealth.js) : rappels, et effets des retards, une fois par jour. */
  horseHealthDay(here) {
    const day = this.day;
    for (const a of here) {
      if (a.species === 'horse') this.anniversary(a); // 🎂
      if (a.species !== 'horse' || a.healthDay === day) continue;
      for (const ev of healthDay(a, day)) {
        if (ev.startsWith('remind:')) this.ui.toast(t(`remind_${ev.slice(7)}`, { name: a.name, g: a.sex }), 7000);
        else if (ev === 'lostShoe') this.ui.toast(t('lostShoe', { name: a.name, g: a.sex }), 7000);
        else if (ev === 'sick') this.handleEvents(a, ['sick']);
      }
    }
  }

  /**
   * La journée de ton cheval (src/sim/horseDay.js) : un soin coche sa case ; tout coché, une journée parfaite
   * (récompense, petit mot, statistique perfectDays).
   */
  markHorseDay(a, kind) {
    if (['lunge', 'liberty', 'activity'].includes(kind)) a.warmAt = this.profile.clock ?? 0; // 🐢 (il a travaillé : chaud ; monté : à la descente)
    if (a.species === 'horse' && !a.client && !a.guest) this.lastHorseId = a.id; // (le défi du jour : src/sim/horseChallenge.js)
    const stage0 = bondStage(a);
    const r = markHorseDay(a, kind, this.hour, this.day);
    this.bondNews(a, stage0);
    if (!r.perfect) return r;
    addStat(this.profile, 'perfectDays');
    this.remember(a, 'firstPerfect');
    this.xp('quest');
    this.entities.get(a.id)?.emit('💕', 4);
    this.ui.toast(t('perfectDay', { name: a.name, g: a.sex }), 7000);
    return r;
  }

  /** 🏅 Toute la pratique du prochain Galop est faite : on le dit une fois (src/sim/galops.js). */
  galopNews() {
    const p = this.profile;
    const next = nextGalop(p);
    if (!next || p.galopReady === next.id || !canTakeExam(p, next.id).ok) return;
    p.galopReady = next.id;
    this.ui.toast(t('galop_ready', { n: next.id }), 8000);
  }

  /** 🎯 Le défi du jour (src/sim/horseChallenge.js) : annoncé le matin, fêté quand il est réussi. */
  /** Ce qui rend un défi possible aujourd'hui, ici (src/sim/horseChallenge.js CHALLENGES.when). */
  challengeCtx() {
    const p = this.profile;
    const here = p.animals.filter((a) => a.species === 'horse' && !a.client && !a.guest && a.location === p.place);
    return { hour: this.hour, home: this.isHome, canRide: here.some((a) => canRide(a).ok) };
  }

  challengeTick() {
    const p = this.profile;
    const mine = p.animals.filter((a) => a.species === 'horse' && !a.client && !a.guest);
    if (!mine.length) return;
    const here = mine.filter((a) => a.location === p.place);
    const c = todayChallenge(p, this.day, true, this.challengeCtx());
    if (!c) return;
    // (le lien gagné va au cheval monté, sinon au dernier dont tu t'es occupé)
    const mounted = this.player?.mount?.data;
    const horse = (mounted && mine.includes(mounted) ? mounted : null)
      ?? mine.find((a) => a.id === this.lastHorseId) ?? here[0] ?? mine[0];
    if (c.fresh && p.tutorial?.done !== false) this.ui.toast(t('ch_new', { what: t(`ch_${c.def.id}`) }), 7000);
    if (!challengeJustDone(p, this.day)) return;
    earn(p, CHALLENGE_REWARD.coins);
    const s0 = bondStage(horse);
    horse.bond = Math.min(100, (horse.bond ?? 0) + CHALLENGE_REWARD.bond);
    this.bondNews(horse, s0);
    addStat(p, 'challenges');
    this.entities.get(horse.id)?.emit('🎯', 2);
    audio.ui('coin');
    const coins = isSandbox(p) ? '' : ` +${CHALLENGE_REWARD.coins} 🪙`;
    this.ui.toast(`${t('ch_done', { what: t(`ch_${c.def.id}`), name: horse.name, g: horse.sex })}${coins}`, 7000);
  }

  /** 📸 Un souvenir pour ce cheval (une première fois : src/sim/memories.js). Le tout premier : un petit mot. */
  remember(a, id, day = this.day) {
    if (!a || !remember(a, id, day)) return false;
    if (!this.profile.memoryTip) {
      this.profile.memoryTip = true;
      this.ui.toast(t('memTip', { name: a.name, g: a.sex }), 6000);
    }
    return true;
  }

  /**
   * 🃏 La carte « Le savais-tu ? » id, lue à la fin d'un mini-jeu (src/sim/horseFacts.js). Nouvelle : comptée dans le
   * carnet, et à la 9e et à la 18e, des pièces (en gestion ; sinon coins vaut 0). Renvoie { isNew, n, total, coins, all }.
   */
  collectFact(id) {
    const p = this.profile;
    const r = collectFact(p, id);
    if (r.isNew) {
      addStat(p, 'factCards');
      if (r.coins && !isSandbox(p)) {
        earn(p, r.coins);
        audio.ui('coin');
      } else r.coins = 0;
    }
    return r;
  }

  /**
   * 🎂 Un an de plus avec ton cheval (src/sim/memories.js anniversaryDue) : 🎂 au-dessus de lui, un petit mot, un peu
   * de lien ; ce jour-là, sa première friandise lui fait encore plus plaisir (care). La première année : un souvenir.
   */
  anniversary(a) {
    const k = anniversaryDue(a, this.day);
    if (!k) return;
    const s0 = bondStage(a);
    a.bond = Math.min(100, (a.bond ?? 0) + 2);
    this.bondNews(a, s0);
    a.annivDay = this.day;
    this.entities.get(a.id)?.emit('🎂', 4);
    this.ui.toast(t('anniv', { name: a.name, g: a.sex, n: k }), 8000);
    // (une seule fois, à son vrai jour : même fêté en retard, s'il était loin ce jour-là ou dans une vieille partie)
    this.remember(a, 'year1', togetherSince(a) + DAYS_PER_YEAR);
  }

  /** 🔍 Tu viens de découvrir un de ses goûts (src/sim/horseQuirks.js) : un petit mot, un souvenir, le lien grandit. */
  quirkFound(a, key) {
    const s0 = bondStage(a);
    a.bond = Math.min(100, (a.bond ?? 0) + QUIRK_BOND);
    this.bondNews(a, s0);
    this.remember(a, { spot: 'quirkSpot', treat: 'quirkTreat', fear: 'quirkFear' }[key]);
    this.entities.get(a.id)?.emit('🔍', 3);
    const q = quirksOf(a);
    const what = t(key === 'spot' ? `qk_where_${q.spot}` : key === 'treat' ? `qk_${q.treat}` : `qk_fear${q.fear}`);
    this.ui.toast(t(`qk_found_${key}`, { name: a.name, g: a.sex, what }), 6000);
  }

  /** Ton cheval du moment : celui que tu montes, sinon le dernier dont tu t'es occupé, sinon le plus proche de toi. */
  mainHorse() {
    const mine = this.profile.animals.filter((a) => a.species === 'horse' && !a.client && !a.guest);
    const m = this.player?.mount?.data;
    if (m && mine.includes(m)) return m;
    return mine.find((a) => a.id === this.lastHorseId) ?? [...mine].sort((x, y) => (y.bond ?? 0) - (x.bond ?? 0))[0] ?? null;
  }

  /** Le lien vient de passer une étape (src/sim/animal.js BOND_STAGES) : un petit mot et des cœurs. */
  bondNews(a, before) {
    const now = bondStage(a);
    // 📸 🤝 💖 🦮 (aussi une étape passée sans petit mot : un tour, une balade guidée, un concours de beauté…)
    this.remember(a, BOND_MEMORIES[now]);
    if (now === before || a.client || a.guest) return;
    const order = ['new', 'trust', 'love', 'best'];
    if (order.indexOf(now) < order.indexOf(before)) return;
    // (un soin qui finit aussi la journée parfaite le dirait deux fois : une seule)
    this.bondShown = this.bondShown ?? new Map();
    if (this.bondShown.get(a.id) === now) return;
    this.bondShown.set(a.id, now);
    this.entities.get(a.id)?.emit('💞', 5);
    // (un cheval : ce que l'étape débloque, src/sim/animal.js BOND_PERKS)
    const key = a.species === 'horse' && (now === 'love' || now === 'best') ? `bondUp_${now}Horse` : `bondUp_${now}`;
    this.ui.toast(t(key, { name: a.name, g: a.sex }), 7000);
  }

  /**
   * Le vermifuge (carnet de santé, dans la fiche du cheval). dose : ce que dit le mini-jeu ('low' | 'just' | 'high').
   * Sous-dosé : noté, mais à refaire bientôt (dans WORMER_LOW_AGAIN jours), et pas compté pour le Galop 3.
   */
  deworm(a, dose = 'just') {
    if (!canAfford(this.profile, WORMER_COST)) return this.ui.toast(t('r_money'));
    spend(this.profile, WORMER_COST);
    if (dose === 'low') {
      noteHealth(a, 'worm', this.day);
      a.healthLog.worm -= HEALTH_PLAN.worm.every - WORMER_LOW_AGAIN; // (le prochain revient plus tôt)
      this.entities.get(a.id)?.emit('😝', 2);
      this.ui.toast(t('wormedLow', { name: a.name, g: a.sex, n: WORMER_LOW_AGAIN }), 6000);
      this.save();
      return true;
    }
    noteHealth(a, 'worm', this.day);
    addStat(this.profile, 'horse_deworm'); // (Galop 3)
    this.remember(a, 'firstDeworm'); // (pas sous-dosé)
    this.entities.get(a.id)?.emit('😝', 2);
    this.ui.toast(t('wormed', { name: a.name, g: a.sex }), 5000);
    this.save();
    return true;
  }

  socialCtx(a, here) {
    const companions = companionsOf(a, here);
    return { companions, alone: HERD_SPECIES.includes(a.species) && companions === 0 };
  }

  /** Effets de la ferme pendant `hours` heures : litière, pâturage, aides (si temps sauté), salaires. */
  farmTick(here, hours, skipped = false) {
    const p = this.profile;
    passiveEquipment(p, here, p.place, hours);
    this.horseHealthDay(here);
    this.interiors.farmTick(here, hours); // propreté et usure des bâtiments
    this.structures.tick(here, hours, skipped); // confort de la maison pendant le sommeil
    for (const a of here) {
      if (a.zone === 'field') graze(a, hours, this.world.snowy);
    }
    // Quand on saute du temps (nuit, voyage…), les aides travaillent quand même.
    if (skipped) {
      for (const h of p.helpers.filter((x) => x.place === p.place)) {
        for (let i = 0; i < Math.min(12, Math.ceil(hours)); i++) {
          const task = this.helperTaskFor(h);
          if (!task) break;
          if (doHelperTask(p, task, here, h).ok) addHelperXp(h, 3);
        }
        restHelper(h, hours * 0.5); // la nuit, on se repose aussi
      }
    }
    // Pauses des aides : fin de la pause, ou pause d'office quand elles sont épuisées.
    for (const h of p.helpers.filter((x) => x.place === p.place)) {
      if (updateBreak(h, p.clock)) this.ui.toast(t('helperBack', { name: h.name, g: h.sex }), 4000);
      else if (!onBreak(h, p.clock) && (h.mood ?? 80) < 12) {
        startBreak(h, p.clock);
        this.ui.toast(t('helperTiredBreak', { name: h.name, g: h.sex }), 5000);
      }
    }
    const day = this.day;
    if (p.lastPayDay === undefined) p.lastPayDay = day;
    if (day > p.lastPayDay) {
      const left = payHelpers(p, day - p.lastPayDay);
      p.lastPayDay = day;
      for (const h of left) {
        this.helpers.get(h.id)?.dispose();
        this.helpers.delete(h.id);
        this.ui.toast(t('helperLeft', { name: h.name, g: h.sex }), 6000);
      }
    }
    this.autoHerd();
  }

  helperTaskFor(h) {
    return helperTaskFn(this.profile, h, this.animalsHere());
  }

  handleEvents(a, events) {
    if (events.includes('sick')) this.ui.toast(t(a.lame?.cause === 'abscess' ? 'gotAbscess' : 'gotSick', { name: a.name, g: a.sex }), 6000);
    if (events.includes('lame')) this.ui.toast(t('gotLame', { name: a.name, g: a.sex }), 7000);
    if (events.includes('died')) this.animalDied(a);
  }

  animalDied(a) {
    const p = this.profile;
    p.animals = p.animals.filter((x) => x.id !== a.id);
    const y = Math.floor(ageYears(a));
    p.memorial.push({ name: a.name, g: a.sex, species: a.species, breed: a.breed, years: y, day: this.day });
    const e = this.entities.get(a.id);
    if (e) {
      if (this.player.mount === e) this.player.dismount();
      e.dispose();
      this.entities.delete(a.id);
    }
    this.ui.closePanelFor(a.id);
    this.ui.alert(t('died', { name: a.name, g: a.sex, age: t('years', { n: y }) }));
  }

  // ---------------------------------------------------------------- boucle

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    horseView.frame++; // (une image : les chevaux dessinés à la précédente sont vus pour tous ses pas)
    if (!this.running) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Premières secondes de jeu en qualité basse : trop lentes avec l'anticrénelage, on redescend.
    if (this.pixelBudget) {
      const r = this.pixelBudget.frame(dt, this.renderer.getPixelRatio());
      if (r) {
        this.renderer.setPixelRatio(r);
        // (retenu : aux parties suivantes, l'ancien réglage, 1,25 sans anticrénelage)
        try {
          localStorage.setItem(SLOW_KEY, '1');
        } catch {
          /* rien */
        }
      }
      if (this.pixelBudget.done) this.pixelBudget = null;
    }
    // Pendant le trajet (écran du voyage), la ferme est en pause : TripFlow fait avancer le voyage et dessine la 3D.
    if (this.tripFlow.frame(dt)) return;
    const p = this.profile;
    // Vitesse : réglage de la durée d'une journée × boutons pause / ×1 / ×2 / ×4.
    const mps = minutesPerSecond(p.settings.timeSpeed) * this.timeScale;
    p.clock += dt * mps;
    const night = isNight(p.clock);

    const ctrl = this.input.poll();
    if (ctrl.look.dx || ctrl.look.dy || ctrl.zoom) this.ui.hideHelp?.();
    // En pause, personne ne bouge (on peut seulement tourner la vue et ouvrir les menus).
    // En ×2 / ×4, le monde est simulé en plusieurs petits pas : tout le monde va plus vite.
    const steps = this.paused ? 1 : Math.max(1, Math.round(this.timeScale));
    const wdt = this.paused ? 0 : dt;
    if (this.paused) ctrl.move = { x: 0, y: 0 };
    // Vue d'ensemble : le joueur ne bouge pas, la caméra est au-dessus de la ferme.
    const mgmt = this.mgmt.active;
    // Vue dans le véhicule de voyage (cabine, compartiment, coffre) : on ne marche pas (src/game/TripFlow.js).
    const pctrl = mgmt || this.tripFlow.view ? { ...ctrl, move: { x: 0, y: 0 }, run: false } : ctrl;
    // Cheval réaliste arrivé en cours de partie : un cheval de plus prend le vrai modèle.
    if (this.horseSwap.length) this.swapRealHorses();
    // Chiens réalistes arrivés en cours de partie : un chien de plus prend le vrai modèle.
    if (this.dogSwap.length) this.swapRealDogs();
    // Chats réalistes arrivés en cours de partie : un chat de plus prend le vrai modèle.
    if (this.catSwap.length) this.swapRealCats();
    // Lapins réalistes arrivés en cours de partie : un lapin de plus prend le vrai modèle.
    if (this.rabbitSwap.length) this.swapRealRabbits();
    // Mouton réaliste arrivé en cours de partie : un mouton de plus prend le vrai modèle.
    if (this.sheepSwap.length) this.swapRealSheep();
    // Chèvre réaliste arrivée en cours de partie : une chèvre de plus prend le vrai modèle.
    if (this.goatSwap.length) this.swapRealGoats();
    // Vache réaliste arrivée en cours de partie : une vache de plus prend le vrai modèle.
    if (this.cowSwap.length) this.swapRealCows();
    // Point de vue pour la version réduite des chevaux au loin (horseReal.js) : la caméra de l'image d'avant.
    horseView.eye.setFromMatrixPosition(this.camera.matrixWorld);
    horseView.on = true;
    const entities = [...this.entities.values()];
    const ctx = { playerPos: this.player.position, night, entities, game: this };
    for (let i = 0; i < steps; i++) {
      this.player.gaitEnabled = !this.activities.active; // (pendant une activité, c'est elle qui mène le cheval)
      this.player.postAuto = !!this.tripFlow?.active; // (voyage à cheval : trot enlevé sans le bouton)
      this.player.update(mgmt ? 0 : wdt, pctrl, this.rig.yaw, this.rig.mode === 'first');
      for (const e of entities) e.update(wdt, ctx);
      this.player.lateUpdate?.(mgmt ? 0 : wdt); // le cavalier suit le cheval qu'on vient d'animer
      if (i === 0) this.ui.updatePostBtn?.(); // ⬆️ le cercle du trot enlevé, au rythme des foulées
      if (i === 0) this.ui.updateGaitPad?.(); // (boutons d'allure : montrés ou cachés, allure allumée — très léger)
      for (const h of this.helpers.values()) h.update(wdt, this);
      this.dogTrainer.update(wdt); // maîtres en visite, promenade-séance, démonstration
      this.herding.update(wdt);
      this.tasks?.update();
      this.activities.update(wdt); // après les animaux : l'activité ajuste leur pose (sauts, tours)
      this.freeJumps.update(wdt); // ⤴️ en balade libre, le saut d'un tronc (même pose)
      this.halloween.update(wdt); // 🎃 (pendant la fête)
    }
    this.player.afterSessions?.(); // rênes : à la place finale du cheval et du cavalier (saut soulevé)
    if (mgmt) this.mgmt.update(dt, ctrl);
    else if (!this.tripFlow.viewCamera(dt, ctrl)) { // (vue dans le véhicule : TripFlow place la caméra)
      // (chien en laisse : la caméra cadre la joueuse et le chien ensemble — le teckel sortait de l'écran en courant)
      if (!this.rig.focus) {
        for (const e of entities) {
          if (e.data.following && e.data.leashed && canLeash(e.data) && !e.inside) {
            this.rig.focus = { pair: e.position };
            break;
          }
        }
      }
      this.rig.update(dt, ctrl, this.player, this.world);
      this.fadeOccluders();
    }
    this.ui.updateLabels(entities, this.camera, this.player.position);
    this.updateLeashes(entities);
    this.interiors.update(dt);
    this.groomer.update(wdt); // salon de toilettage : arrivée et départ des clients
    for (const q of this.equipment) {
      if (q.mesh.userData.spin) q.mesh.userData.spin.rotation.y += dt * 2;
    }

    const { day } = this.world.updateSky(this.hour, this.weather, this.mgmt.active ? this.mgmt.focus : this.player.position);
    this.dayLight = day; // 0 la nuit, 1 le jour (ambiance sonore)
    if (this.mgmt.active) this.mgmt.liftFog(); // vue d'en haut : le brouillard commence plus loin
    this.world.updateClouds(dt);
    this.player.torch.intensity = (1 - day) * 6;
    const flash = this.weather3d.update(dt, this.camera.position);
    if (flash) this.world.hemi.intensity += flash * 3;
    // Le tonnerre suit l'éclair, un peu après.
    if (flash > (this.lastFlash ?? 0) + 0.4) audio.thunder(0.3 + Math.random() * 1.2);
    this.lastFlash = flash;

    // Simulation des besoins 2 fois par seconde.
    this.simAcc += dt;
    if (this.simAcc >= 0.5) {
      const hours = (this.simAcc * mps) / 60;
      this.simAcc = 0;
      this.updateWeather();
      // Nappe sonore : oiseaux le jour, grillons la nuit, vent, pluie ; assourdie dans un bâtiment.
      audio.ambience({ weather: this.weather, night: (this.dayLight ?? 1) < 0.35, biome: this.placeDef.biome, indoors: !!this.interiors.inside });
      const weather = this.simWeather();
      // En pause, rien ne change (on peut quand même se promener).
      const here = hours > 0 ? this.animalsHere() : [];
      if (hours > 0) this.farmTick(here, hours);
      if (hours > 0) this.checkBirths();
      this.removeDroppingMeshes(dryPuddles(this.profile, this.profile.clock));
      for (const a of here) {
        const e = this.entities.get(a.id);
        const before = mood(a);
        if (e) {
          const kind = digest(a, hours);
          if (kind && e.inside) {
            // Dans la maison des animaux : ça salit les paniers (à nettoyer).
            this.profile.petHouse = { ...(this.profile.petHouse ?? {}), dirt: Math.min(9, (this.profile.petHouse?.dirt ?? 0) + (kind === 'poop' ? 1 : 0.5)) };
          } else if (kind) {
            const back = 0.5 * (a.look.bodyLen * e.scale);
            const d = addDropping(this.profile, this.profile.place, e.position.x - Math.sin(e.heading) * back, e.position.z - Math.cos(e.heading) * back, kind, this.profile.clock, a.species);
            this.spawnDropping(d);
            this.removeDroppingMeshes(d.removed);
            delete d.removed;
            if (kind === 'poop' && a.species === 'dog' && a.following) this.ui.toast(t('dogPoop', { name: a.name, g: a.sex }), 4000);
          }
        }
        // + la saleté de son box / de la maison (src/game/Interiors.js)
        const dirt = e?.inside ? Math.floor(this.profile.petHouse?.dirt ?? 0)
          : (e ? dirtNear(this.profile, this.profile.place, e.position.x, e.position.z) : 0) + this.interiors.dirtFor(a);
        const events = tickAnimal(a, hours, {
          dirt,
          weather: e?.inside ? 'clear' : this.interiors.feltWeather(a, feltWeather(a, weather, this.temperature, this.season)), sleeping: e?.sleeping, ridden: e?.ridden, moving: e && e.speed > 0.3, ...this.socialCtx(a, here),
        });
        tickProduce(a, hours);
        // Chaque promenade fait progresser le chien (obéissance et « Au pied »).
        if (a.species === 'dog' && a.following && e && e.speed > 0.5) {
          a.skills.obedience = Math.min(100, a.skills.obedience + 1.2 * hours * (a.leashed ? 1 : 0.5));
          a.tricks.heel = Math.min(100, (a.tricks.heel ?? 0) + 2.5 * hours * (a.leashed ? 1 : 0.4));
        }
        if (before !== 'sad' && mood(a) === 'sad') this.ui.toast(t('sad', { name: a.name, g: a.sex }), 4000);
        this.handleEvents(a, events);
        if (e && e.stage !== undefined) {
          const oldScale = e.scale;
          e.applyScale();
          if (Math.abs(e.scale - oldScale) > 0.01) e.placeLabels();
        }
      }
      this.ui.refresh();
    }

    this.checkAcc += dt;
    if (this.checkAcc > 2) {
      this.checkAcc = 0;
      this.galopNews();
      this.challengeTick();
      // Toute quête finie est récompensée, rejointe ou non ; une quête rejointe et finie quitte « Mes quêtes », et
      // la fin du chapitre en cours de l'histoire est fêtée par le guide, qui annonce le suivant (src/sim/quests.js).
      const chapterBefore = mainQuest(p);
      const done = checkObjectives(p);
      const story = done.length ? afterQuestsDone(p, done, chapterBefore) : null;
      for (const o of done) {
        this.xp(o.kind === 'quest' ? 'quest' : 'achievement');
        const name = t(`o_${o.id}`, objectiveParams(p, o));
        const reward = o.reward && p.mode === 'manage' ? t('reward', { n: o.reward }) : '';
        if (o.id === story?.chapter && this.ui.tutorial?.chapterDone) {
          this.ui.tutorial.chapterDone(o.id, story, reward); // (bravo, et la suite : chapitre suivant, fin, chapitres passés)
          continue;
        }
        const msg = o.kind === 'quest' ? t('questDone', { name }) : t('achievementDone', { name });
        this.ui.toast(reward ? `${msg} ${reward}` : msg, 5000);
      }
    }
    this.saveAcc += dt;
    if (this.saveAcc > 15) {
      this.saveAcc = 0;
      this.save();
    }

    if (this.tapRing.visible) {
      this.tapRing.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.12);
      if (!this.player.auto) this.tapRing.visible = false;
    }
    this.marker.update(dt);
    this.updateFocus();
    this.events.update(dt); // événements spéciaux
    this.venue.update(dt); // concours à l'extérieur
    this.clients.update(dt); // clients et métiers
    this.trailGuide.update(dt); // 🧭 visiteurs qui demandent une balade
    // Examen ou école vétérinaire en plein écran (téléphone, src/ui/vetExam.js) : la 3D est cachée, on ne la dessine pas.
    if (!this.ui.vxCover) this.renderer.render(this.scene, this.camera);
  }

  /** Les murs et toits qui cachent le personnage deviennent transparents. */
  fadeOccluders() {
    if (this.rig.mode !== 'third') {
      // 1re personne : on rend aux murs leur aspect normal.
      for (const o of this.faded ?? []) {
        o.material = o.userData.solidMat;
        o.castShadow = true;
      }
      this.faded?.clear();
      return;
    }
    if (this.occluderGroup !== this.world.group) {
      // Liste des objets qui peuvent cacher la vue (bâtiments), calculée une fois par lieu.
      this.occluderGroup = this.world.group;
      this.occluders = [];
      this.world.group.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.noOccluder || o.geometry.type === 'PlaneGeometry') return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 0.8) this.occluders.push(o);
      });
      this.faded = new Set();
    }
    const head = this.player.position.clone();
    head.y += this.player.eyeHeight * 0.8;
    const dir = head.clone().sub(this.camera.position);
    const len = dir.length();
    this.raycaster.set(this.camera.position, dir.normalize());
    this.raycaster.far = len - 0.3;
    const hits = new Set(this.raycaster.intersectObjects(this.occluders, false).map((h) => h.object));
    this.raycaster.far = Infinity;
    for (const o of hits) {
      if (this.faded.has(o)) continue;
      if (!o.userData.fadeMat) {
        o.userData.solidMat = o.material;
        o.userData.fadeMat = o.material.clone();
        o.userData.fadeMat.transparent = true;
        o.userData.fadeMat.opacity = 0.18;
        o.userData.fadeMat.depthWrite = false;
      }
      o.material = o.userData.fadeMat;
      o.castShadow = false;
      this.faded.add(o);
    }
    for (const o of this.faded) {
      if (hits.has(o)) continue;
      o.material = o.userData.solidMat;
      o.castShadow = true;
      this.faded.delete(o);
    }
  }

  // ---------------------------------------------------------------- toucher l'écran

  /** Toucher le sol : on y va. Toucher un animal ou un bâtiment : on y va puis on choisit quoi faire. */
  onTap(sx, sy) {
    if (!this.running || this.ui.isBlocking()) return;
    if (this.mgmt.active) {
      this.mgmt.onTap(sx, sy);
      return;
    }
    if (this.activities.onTap(sx, sy)) return;
    const paused = this.paused;
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.tripFlow.onTap(this.raycaster)) return; // chargement du véhicule de voyage
    if (this.trailGuide.onTap(this.raycaster)) return; // 🧭 des visiteurs : on va leur parler
    // Une aide : on va la voir et on discute (src/ui/helperChat.js).
    const hitH = this.raycaster.intersectObjects([...this.helpers.values()].map((x) => x.root), true)[0];
    if (hitH) {
      const helper = [...this.helpers.values()].find((x) => { let o = hitH.object; while (o && o !== x.root) o = o.parent; return !!o; });
      if (helper) {
        if (paused) this.ui.openHelper(helper.data);
        else this.walkTo(helper.position, 1.8, () => this.ui.openHelper(helper.data), true);
        return;
      }
    }
    if (this.dogTrainer.onTap(this.raycaster, paused)) return; // un maître en visite (éducateur canin)
    if (this.clients.onTap(this.raycaster)) return; // un visiteur (client) : on va lui parler
    const roots = [...this.entities.values()].filter((e) => !e.ridden && !e.inside).map((e) => e.root);
    const hitA = this.raycaster.intersectObjects(roots, true).find((h) => !h.object.isSprite || h.object === h.object.parent?.userData?.entity?.label);
    if (hitA) {
      let o = hitA.object;
      while (o && !o.userData.entity) o = o.parent;
      const e = o?.userData.entity;
      if (e) {
        if (paused) this.ui.openAnimalActions(e.data);
        else this.walkTo(e.position, e.radius + 1.2, () => this.ui.openAnimalActions(e.data), true);
        return;
      }
    }
    if (this.groomer.onTap(this.raycaster)) return; // un client du salon de toilettage et son animal
    const poops = [...this.droppingMeshes.values()].filter((m) => m.userData.dropping.kind === 'poop');
    const hitP = this.raycaster.intersectObjects(poops, true)[0];
    if (hitP && !this.player.mount) {
      let o = hitP.object;
      while (o && !o.userData.dropping) o = o.parent;
      if (o) {
        const id = o.userData.dropping.id;
        this.walkTo(o.position.clone(), 1, () => {
          this.scoop([id]);
          this.ui.toast(t('scooped'));
        });
        return;
      }
    }
    if (this.player.mount) {
      const hitG = this.raycaster.intersectObject(this.world.group, true)[0];
      if (hitG) this.walkTo(hitG.point, 1);
      return;
    }
    const hit = this.raycaster.intersectObject(this.world.group, true)[0];
    if (!hit) return;
    if (this.interiors.onTap(hit)) return; // dans l'écurie ou la maison
    // Une construction du joueur : on va devant son entrée, puis on choisit quoi faire.
    const built = this.structures.pick(this.raycaster, hit.point);
    if (built) {
      const door = doorOf(built);
      this.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.2, () => openStructure(this.ui, built));
      return;
    }
    const kind = this.world.kindAt(hit.point.x, hit.point.z);
    if (paused) {
      if (kind) this.ui.openBuilding(kind);
      else this.ui.toast(t('pausedNoMove'));
      return;
    }
    // Un enclos : on va à l'endroit touché (en passant par la porte), puis on choisit quoi faire.
    if (['paddock', 'pen', 'hutch'].includes(kind)) {
      this.walkTo(hit.point, 0.8, () => this.ui.openBuilding(kind));
      return;
    }
    if (kind) {
      const door = this.world.interactables.find((i) => i.kind === kind);
      if (door) {
        this.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.2, () => this.ui.openBuilding(kind));
        return;
      }
    }
    if (this.world.isWater(hit.point.x, hit.point.z)) return;
    this.walkTo(hit.point, 0.5);
  }

  walkTo(point, radius, onArrive = null, follow = false) {
    const target = point.clone ? point : new THREE.Vector3(point.x, 0, point.z);
    this.tapRing.position.set(target.x, this.world.heightAt(target.x, target.z) + 0.05, target.z);
    this.tapRing.visible = !follow;
    // Si on vise un animal qui bouge, on vise sa position actuelle.
    this.player.goTo(follow ? target.clone() : target, radius, onArrive);
  }

  buildingContext() {
    const here = this.animalsHere();
    const sp = (a) => SPECIES[a.species];
    return {
      hour: this.hour,
      season: this.season,
      home: this.isHome,
      count: {
        horse: here.filter((a) => a.species === 'horse').length,
        livestock: here.filter((a) => sp(a).livestock).length,
        pets: here.filter((a) => ['dog', 'cat', 'rabbit'].includes(a.species)).length,
        dog: here.filter((a) => a.species === 'dog').length,
        rabbit: here.filter((a) => a.species === 'rabbit').length,
        sick: here.filter((a) => a.sick).length,
        milkable: here.filter((a) => a.produceReady && sp(a).product?.action === 'milk').length,
        shearable: here.filter((a) => a.produceReady && sp(a).product?.action === 'shear').length,
        paddockDroppings: this.zoneDroppings('paddock'),
        // Maison des animaux et sellerie
        petsOut: here.filter((a) => PET_HOUSED.includes(a.species) && !a.housed).length,
        housed: here.filter((a) => a.housed).length,
        petHouseDirt: Math.floor(this.profile.petHouse?.dirt ?? 0),
        tackDirty: this.day - (this.profile.tackCleanedDay ?? -99) >= 2 ? 1 : 0,
        penDroppings: this.zoneDroppings('pen'),
      },
      // Le clapier et la bergerie de la ferme ne servent que si leurs espèces comptent pour la partie
      // (proposées ou déjà là : src/sim/species.js) ; sinon ils restent au décor, sans leurs menus.
      shown: { hutch: coreShown(this.profile, 'hutch'), pen: coreShown(this.profile, 'pen') },
    };
  }

  zoneDroppings(id) {
    const z = enclosure(id);
    return (this.profile.droppings ?? []).filter((d) => d.place === this.profile.place && d.kind === 'poop'
      && Math.abs(d.x - z.x) < z.hw + 1 && Math.abs(d.z - z.z) < z.hd + 1).length;
  }

  /** Curer : ramasse tous les crottins d'un enclos. */
  cleanZone(id) {
    const ids = scoopZone(this.profile, this.profile.place, enclosure(id));
    this.removeDroppingMeshes(ids);
    this.interiors.zoneCleaned(id);
    if (ids.length) {
      addStat(this.profile, 'scoop', ids.length);
      this.xp('care', Math.min(3, ids.length));
    }
    return ids.length;
  }

  buildingActions(kind) {
    return buildingActions(kind, this.buildingContext());
  }

  animalActionAllowed(a, action) {
    return animalActionAllowed(action, { sleeping: this.entities.get(a.id)?.sleeping });
  }

  /** Un soin pour tout un groupe d'animaux (ex. foin pour tous les chevaux). */
  groupCare(filter, action, quality = 1) {
    let n = 0;
    const reasons = new Set();
    const group = this.animalsHere().filter(filter).filter((a) => SPECIES[a.species].actions.includes(action));
    for (const a of group) {
      if (!canAfford(this.profile, CARE[action].cost)) {
        reasons.add('money');
        break;
      }
      const before = { ...a.needs };
      const stage0 = bondStage(a);
      const res = applyCare(a, action, quality);
      if (res.ok) {
        if (n === 0) this.ui.showDeltas(a, before);
        spend(this.profile, CARE[action].cost);
        addStat(this.profile, action);
        if (res.unlame) this.ui.toast(t('unlame', { name: a.name, g: a.sex }), 6000); // (pieds curés : le caillou est parti)
        this.bondNews(a, stage0);
        // (l'histoire de ton premier cheval, sa journée : tes chevaux, pas ceux qu'on te confie)
        if (a.species === 'horse' && !a.client && !a.guest) {
          addStat(this.profile, `horse_${action}`);
          this.markHorseDay(a, action);
        }
        this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️', 2);
        n++;
      } else reasons.add(res.reason);
    }
    if (n) {
      this.xp('care', Math.min(n, 3));
      this.ui.toast(t('doneAll', { n }));
    } else if (!group.length) this.ui.toast(t('nobody'));
    else if (reasons.has('money')) this.ui.toast(t('r_money'));
    else if (reasons.has('full')) this.ui.toast(t(`allFull_${CARE[action].full ?? 'x'}`));
    else this.ui.toast(t(`r_${[...reasons][0]}`, { name: group[0].name, g: group[0].sex }));
    this.ui.refresh();
    return n;
  }

  groupCollect(action) {
    let n = 0;
    for (const a of this.animalsHere()) {
      if (a.produceReady && SPECIES[a.species].product?.action === action && collectProduct(this.profile, a).ok) {
        this.entities.get(a.id)?.emit(action === 'shear' ? '🧶' : '🥛', 2);
        n++;
      }
    }
    this.ui.toast(n ? t('doneAll', { n }) : t('nobody'));
    return n;
  }

  /** Les chevaux rentrent au paddock (ou en sortent pour aller au pré). */
  sendHorses(where) {
    // Au box : chaque cheval rentre dans son box de l'écurie.
    if (where === 'box') return this.interiors.stallAll();
    const target = where === 'field' ? FIELD : enclosure('paddock'); // (le paddock peut être déplacé)
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.data.species !== 'horse' || e.ridden) continue;
      e.data.following = false;
      e.data.stalled = false; // il sort de son box
      this.unbridle(e.data, where); // (au pré et au paddock, jamais de filet)
      e.data.zone = where === 'field' ? 'field' : undefined;
      e.state = 'walk';
      e.target.set(target.x + (Math.random() - 0.5) * 6, 0, target.z + (Math.random() - 0.5) * 6);
      e.timer = 30;
      n++;
    }
    this.ui.toast(n ? t(where === 'field' ? 'horsesOut' : 'storedHorses') : t('nobody'));
  }

  /** Chiens, chats et lapins vont dormir dans la maison des animaux (in = true) ou en sortent. */
  housePets(inside = true) {
    if (inside && !this.world.petHouse) return this.ui.toast(t('noPetHouse'));
    let n = 0;
    for (const e of this.entities.values()) {
      const a = e.data;
      if (!PET_HOUSED.includes(a.species) || !!a.housed === inside) continue;
      if (inside && a.following) {
        a.following = false;
        a.leashed = false;
      }
      a.housed = inside;
      if (!inside) e.leaveHouse();
      n++;
    }
    this.ui.toast(n ? t(inside ? 'petsHoused' : 'petsOutside', { n }) : t('nobody'));
    if (n) this.xp('care');
    return n;
  }

  /** Nettoyer les paniers et les coins de la maison des animaux. */
  cleanPetHouse() {
    const p = this.profile;
    const n = Math.floor(p.petHouse?.dirt ?? 0);
    p.petHouse = { ...(p.petHouse ?? {}), dirt: 0 };
    if (n) {
      addStat(p, 'scoop', n);
      this.xp('care', Math.min(3, n));
    }
    this.ui.toast(n ? t('petHouseCleaned', { n }) : t('why_alreadyClean'));
  }

  /** Entretenir le cuir (selles, filets, licols) : nettoyer puis graisser. */
  cleanTack() {
    this.profile.tackCleanedDay = this.day;
    addStat(this.profile, 'tackClean');
    this.xp('care', 2);
    this.ui.toast(t('tackCleaned'));
  }

  /** Ce qui demande l'attention du joueur maintenant (pour le bouton ⏩). */
  needsAttention() {
    const out = [];
    for (const a of this.animalsHere()) {
      if (a.sick) out.push({ a, what: 'sick' });
      else if (a.lame) out.push({ a, what: 'lame' });
      else {
        const low = NEEDS.filter((n) => a.needs[n] < 40).sort((x, y) => a.needs[x] - a.needs[y])[0];
        if (low) out.push({ a, what: low });
        else if (a.produceReady) out.push({ a, what: SPECIES[a.species].product.id });
      }
    }
    return out;
  }

  /**
   * ⏩ Avance jusqu'au prochain moment intéressant : un animal qui a besoin de toi,
   * ou un rendez-vous de la journée (traite, sortie au pré, ouverture du refuge…). 12 h au plus.
   */
  setTimeScale(x) {
    const was = this.timeScale;
    this.timeScale = x;
    if (x === 0) this.player.cancelGoTo();
    this.ui.refresh();
    if (x > 1 && was !== x) this.emit('timeFast', x); // tutoriel : « ⏩ fait avancer le temps »
  }

  get paused() {
    return this.timeScale === 0;
  }

  /** Les actions sont bloquées pendant la pause. Renvoie vrai si c'est bloqué. */
  blockedByPause() {
    if (!this.paused) return false;
    this.ui.toast(t('pausedNoAction'));
    return true;
  }

  /** Avance jusqu'à une heure précise (aujourd'hui ou demain). Les aides travaillent pendant ce temps. */
  skipTo(hour) {
    const now = this.hour;
    let hours = hour - now;
    if (hours <= 0.05) hours += 24;
    let done = 0;
    while (done < hours) {
      const step = Math.min(0.5, hours - done);
      this.advanceTime(step);
      done += step;
    }
    this.ui.toast(t('skippedTo', { h: fmtHour(hour) }), 3500);
    this.ui.refresh();
    return done;
  }

  skipAhead(force = false) {
    const now = this.needsAttention();
    if (now.length && !force) {
      const { a, what } = now[0];
      this.ui.toast(t('skipBusy', { name: a.name, g: a.sex, what: t(`attn_${what}`, { g: a.sex }) }), 5000);
      this.emit('skip', 0);
      return 0;
    }
    const RDV = [6, 8, 9, 17, 20];
    let hours = 0;
    while (hours < 12) {
      const step = 0.25;
      const before = this.hour;
      this.advanceTime(step);
      hours += step;
      const after = this.hour;
      const crossed = RDV.find((r) => (before < r && after >= r) || (before > after && after >= r));
      if (this.needsAttention().length || crossed !== undefined) break;
    }
    this.ui.toast(t('skipped', { h: Math.round(hours * 10) / 10 }), 4000);
    this.ui.refresh();
    this.emit('skip', hours);
    return hours;
  }

  /** Gagne de l'expérience ; annonce le nouveau niveau et ce qu'il débloque. */
  xp(kind, times = 1) {
    const up = addXp(this.profile, kind, times);
    // Les quêtes et succès sont vérifiés dès l'image suivante (pas jusqu'à 2 s plus tard) : « Adopte ton
    // premier animal » et son passage de niveau arrivent avec l'achat, et non plus quand on est déjà
    // retourné à l'animalerie.
    this.checkAcc = Infinity;
    if (!up) return;
    // (pas d'annonce pour ce qui est caché : clapier, litière, berger… tant que leurs espèces ne sont pas proposées)
    const names = up.unlocked.filter((k) => this.unlockShown(k)).map((k) => this.unlockName(k)).join(', ');
    this.ui.levelUp(up.level, names);
  }

  /** Ce qu'un niveau débloque est-il montré ? (équipement, aide ou construction pour une espèce proposée) */
  unlockShown(key) {
    if (EQUIPMENT[key]) return equipmentShown(this.profile, key);
    if (HELPERS[key]) return helperShown(this.profile, key);
    return !STRUCTURES[key] || structureShown(this.profile, key);
  }

  unlockName(key) {
    if (EQUIPMENT[key]) return t(`eq_${key}`);
    if (['petsitter', 'groom', 'shepherd', 'farmhand', 'vet'].includes(key)) return t(`helper_${key}`);
    return t(`st_${key}`);
  }

  get level() {
    return levelOf(this.profile.xp ?? 0);
  }

  isUnlocked(key) {
    return isUnlocked(this.profile, key);
  }

  unlockLevel(key) {
    return UNLOCKS[key] ?? 1;
  }

  buyGear(item, size) {
    const r = buyGear(this.profile, item, size ?? undefined); // taille poney / cheval / trait (src/sim/gear.js)
    if (!r.ok) return this.ui.toast(t('r_money'));
    this.ui.toast(t('gearBought', { name: t(`gear_${item}`) }));
    this.audio?.ui?.('coin');
    return r;
  }

  /** Bombe du cavalier : on la choisit à la sellerie, on la porte quand on monte. horse : le cheval de l'ensemble (🎨). */
  equipHelmet(item, color, horse = this.mainHorse()) {
    const lv0 = horse ? matchyOf(horse, riderHelmet(this.profile)).level : 0;
    const r = equipHelmet(this.profile, item, color);
    if (!r.ok) return this.ui.toast(t(`gear_${r.reason}`, { item: t(`gear_${item}`) }), 4500);
    this.ui.toast(t('tk_helmetOn', { item: t(`gear_${item}`) }));
    if (this.player.mount) this.player.setHelmet(riderHelmet(this.profile));
    if (horse) this.matchyNews(horse, lv0);
    return r;
  }

  equip(a, item, color, opts = {}) {
    const mine = a.species === 'horse' && !a.client && !a.guest;
    const lv0 = mine ? matchyOf(a, riderHelmet(this.profile)).level : 0; // (🎨 son ensemble avant)
    // À la maison, la sellière échange gratuitement la taille si besoin (src/sim/gear.js).
    // opts.exact : CE modèle (boutons des fiches de la sellerie), jamais un autre du même type.
    const r = equip(this.profile, a, item, color, { autoSwap: this.isHome, exact: !!opts.exact });
    // (en voyage : resté à la maison, ou pas la bonne taille dans le coffre — on nomme l'objet et la taille)
    if (!r.ok) return this.ui.toast(t(`gear_${r.reason}`, { item: t(`gear_${r.item ?? item}`), size: r.need ? t(`tk_size_${r.need}`) : '' }), 4500);
    if (r.swapped) this.ui.toast(t('tk_swappedAuto', { item: t(`gear_${r.item}`), size: t(`tk_size_${r.swapped}`) }), 4000);
    this.entities.get(a.id)?.applyGear();
    if (this.player.mount?.data === a) this.player.seat();
    if (mine) this.matchyNews(a, lv0);
    return r;
  }

  /**
   * 🎨 Son ensemble vient de monter d'un cran (src/sim/matchy.js) : tapis et jambes de la même couleur, puis ta
   * bombe aussi. Des étincelles, un petit mot, et la première fois, un souvenir.
   */
  matchyNews(a, lv0) {
    const m = matchyOf(a, riderHelmet(this.profile));
    if (m.level <= lv0) return;
    this.entities.get(a.id)?.emit('✨', 6);
    this.ui.toast(t(m.level === 2 ? 'mx_lvl2' : 'mx_lvl1', { color: t(`col_${m.color}`) }), 5000);
    this.remember(a, 'firstMatchy');
  }

  unequip(a, slot) {
    unequip(a, slot);
    this.entities.get(a.id)?.applyGear();
  }

  /** Desseller (menu du cheval) : la selle, le tapis et le filet retournent à la sellerie ; il pourra se rouler au pré. */
  unsaddle(a) {
    if (this.player.mount?.data === a) return null;
    const saddled = unsaddle(a);
    const bridled = unbridle(this.profile, a, { home: this.isHome });
    if (!saddled && !bridled) return null;
    this.entities.get(a.id)?.applyGear();
    // (sellé sans filet, après ✕ dans « Brider » : la selle seule)
    this.ui.toast(t(saddled && bridled ? 'unsaddled' : saddled ? 'unsaddledOnly' : 'unbridled', { name: a.name, g: a.sex }), 4000);
    this.save();
    return true;
  }

  /** Débrider en le rentrant au box ou en le lâchant au pré (src/game/Interiors.js) ; la première fois, on dit pourquoi. */
  unbridle(a, why = null) {
    if (!unbridle(this.profile, a, { home: this.isHome })) return false;
    this.entities.get(a.id)?.applyGear();
    if (why && !this.profile.bridleTip) {
      this.profile.bridleTip = true;
      this.ui.toast(t('bridleOff'), 5000);
    }
    return true;
  }

  /** Brider (après le mini-jeu « Brider », src/ui/minigames/bridle.js). */
  bridle(a) {
    const r = bridleUp(this.profile, a, { home: this.isHome });
    if (!r.ok) {
      this.ui.toast(t(`gear_${r.reason}`, { item: t('gear_bridle'), size: r.need ? t(`tk_size_${r.need}`) : '' }), 4500);
      return null;
    }
    this.entities.get(a.id)?.applyGear();
    if (a.species === 'horse' && !a.client && !a.guest) addStat(this.profile, 'horse_bridle'); // (« ⏩ Brider vite » après 3)
    this.save();
    return r;
  }

  /** Seller (après le mini-jeu « Seller », src/ui/minigames/seller.js). */
  saddle(a) {
    const r = saddleUp(this.profile, a, { home: this.isHome });
    if (!r.ok) {
      this.ui.toast(t(`gear_${r.reason}`, { item: t('gear_saddle'), size: r.need ? t(`tk_size_${r.need}`) : '' }), 4500);
      return null;
    }
    this.entities.get(a.id)?.applyGear();
    if (a.species === 'horse' && !a.client && !a.guest) addStat(this.profile, 'horse_saddle'); // (Galop 2 : tes chevaux)
    this.save();
    return r;
  }

  /**
   * Mode Auto : les tâches simples les plus urgentes (nourrir, abreuver, brosser,
   * nettoyer, câliner, ramasser les crottins). keys : tâches déjà prévues, à ne pas doubler.
   */
  planAutoTasks(max, keys = new Set()) {
    if (max <= 0) return [];
    const ICON = { feed: '🍖', water: '💧', brush: '🪮', clean: '🧹', pet: '🤚', play: '⚽' };
    const NEED_ACTION = { hunger: 'feed', thirst: 'water', grooming: 'brush', hygiene: 'clean', affection: 'pet', exercise: 'play' };
    const out = [];
    for (const a of this.animalsHere()) {
      const e = this.entities.get(a.id);
      if (!e || e.ridden) continue;
      for (const [need, action] of Object.entries(NEED_ACTION)) {
        if (a.needs[need] >= 55) continue;
        if (!SPECIES[a.species].actions.includes(action) || !this.canCare(a, action).ok) continue;
        if (e.sleeping && !['feed', 'water', 'pet'].includes(action)) continue;
        const key = `${a.id}:${action}`;
        if (keys.has(key)) continue;
        out.push({
          key,
          urgency: a.needs[need],
          label: `${action === 'clean' ? t(`act_${a.species}_clean`) : t(`act_${action}`)} · ${a.name}`,
          icon: ICON[action],
          target: () => this.entities.get(a.id)?.position ?? null,
          radius: 1.8,
          auto: () => this.autoCare(a, action),
          manual: () => this.ui.careWithGame(a, action),
        });
      }
    }
    for (const d of (this.profile.droppings ?? []).filter((x) => x.place === this.profile.place && x.kind === 'poop').slice(0, 3)) {
      const key = `poop:${d.id}`;
      if (keys.has(key)) continue;
      out.push({
        key,
        urgency: 50,
        label: t('autoScoop'),
        icon: '💩',
        target: () => this.droppingMeshes.get(d.id)?.position ?? null,
        radius: 1,
        auto: () => this.scoop([d.id]),
        manual: () => this.scoop([d.id]),
      });
    }
    return out.sort((x, y) => x.urgency - y.urgency).slice(0, max);
  }

  /** Endroit où aller pour un bâtiment ou un enclos (sa porte). */
  buildingSpot(kind) {
    const it = this.world.interactables.find((i) => i.kind === kind);
    return it ? new THREE.Vector3(it.x, 0, it.z) : null;
  }

  /** Soin fait automatiquement (liste de tâches) : un peu moins bien qu'à la main. */
  autoCare(a, action) {
    const check = this.canCare(a, action);
    if (!check.ok) return this.ui.toast(t(check.reason === 'money' ? 'r_money' : `r_${check.reason}`, { name: a.name, g: a.sex }));
    return this.care(a, action, 0.75);
  }

  moodOf(a) {
    return mood(a);
  }

  /** Emmène le troupeau : avec le chien ou le berger s'il y en a un, sinon les animaux y vont seuls. */
  moveFlock(dest) {
    if (this.herder()) return this.startHerding(dest);
    let n = 0;
    for (const e of this.entities.values()) {
      if (!e.sp.livestock) continue;
      e.data.zone = dest;
      e.data.following = false;
      e.state = 'walk';
      e.pickWanderTarget();
      e.timer = 40;
      n++;
    }
    this.ui.toast(n ? t('flockMoving') : t('noFlock'), 5000);
    return n > 0;
  }

  /** Diriger le troupeau soi-même, à pied ou à cheval : les animaux s'écartent devant le joueur. */
  leadFlock(dest) {
    const me = { isPlayer: true, position: this.player.position, data: { name: this.profile.name } };
    if (!this.herding.start(dest, me)) return this.ui.toast(t('noFlock'));
    this.ui.toast(t(this.player.mount ? 'leadFlockRiding' : 'leadFlockFoot'), 6000);
    return true;
  }

  checkHorses() {
    const horses = this.animalsHere().filter((a) => a.species === 'horse');
    const sick = horses.filter((a) => a.sick || mood(a) === 'sad');
    this.ui.toast(sick.length ? t('checkBad', { names: sick.map((a) => a.name).join(', '), n: sick.length }) : t('checkGood', { n: horses.length }), 5000);
  }

  /** Cherche ce qui est à portée de main (animal, porte…) pour le bouton d'action. */
  updateFocus() {
    let best = null;
    const pp = this.player.position;
    if (this.tripFlow.view) {
      best = null; // dans le véhicule de voyage : le panneau du bas remplace le bouton d'action
    } else if (this.player.mount) {
      best = { kind: 'dismount' };
    } else {
      best = this.tripFlow.focusNear(pp) ?? this.clients.focusNear(pp) ?? this.trailGuide.focusNear(pp); // véhicule de voyage, visiteur (client) ou 🧭 visiteurs
      let bestD = best ? -1 : Infinity;
      for (const e of this.entities.values()) {
        if (e.inside) continue; // rangé dans la maison des animaux
        const d = Math.hypot(e.position.x - pp.x, e.position.z - pp.z) - e.radius;
        if (d < 1.6 && d < bestD) {
          bestD = d;
          best = { kind: 'animal', entity: e };
        }
      }
      for (const hp of this.helpers.values()) {
        const d = Math.hypot(hp.position.x - pp.x, hp.position.z - pp.z) - 0.4;
        if (d < 1.4 && d < bestD) {
          bestD = d;
          best = { kind: 'helper', helper: hp, id: hp.data.id };
        }
      }
      const visitor = this.dogTrainer.focusNear(pp); // maître en visite (éducateur canin)
      if (visitor && visitor.d < bestD) {
        bestD = visitor.d;
        best = visitor.focus;
      }
      if (!best) {
        for (const it of this.world.interactables) {
          const d = Math.hypot(it.x - pp.x, it.z - pp.z);
          if (d < 3 && d < bestD) {
            bestD = d;
            best = it;
          }
        }
      }
    }
    const key = best ? `${best.kind}-${best.entity?.data.id ?? best.id ?? best.key ?? ''}` : '';
    if (key !== this.focusKey) {
      this.focusKey = key;
      this.focus = best;
      this.ui.setFocus(best);
    }
  }

  onKey(code) {
    if (!this.running || this.ui.isBlocking()) return;
    if (code === 'Escape' && this.tripFlow.view && this.tripFlow.view !== 'ramp') this.tripFlow.setView(null); // sortir du véhicule
    if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') {
      const before = this.ui.panel;
      this.interact();
      // Panneau ouvert au clavier : le focus va sur son premier bouton (Tab parcourt le panneau, Entrée
      // l'active) au lieu de rester derrière, dans la barre du haut.
      if (this.ui.panel && this.ui.panel !== before) this.ui.focusPanel();
    }
    if (code === 'KeyC') this.toggleCamera();
    if (code === 'KeyN') this.ui.tutorial?.cycleQuest(1); // ⇄ la quête suivante dans le suivi à l'écran
    // À cheval, en balade libre : 0 arrêt, 1 pas, 2 trot, 3 galop.
    const gaitKey = { Digit0: 'halt', Numpad0: 'halt', Digit1: 'walk', Digit2: 'trot', Digit3: 'canter' }[code];
    if (gaitKey && this.player.mount && !this.activities.active) this.setRideGait(gaitKey);
    if (code === 'Space' && this.freeJumps.canJump()) this.freeJumps.want(); // ⤴️ sauter le tronc
    else if (code === 'Space' && this.canPostTrot()) this.postTrot(); // ⬆️ trot enlevé
  }

  interact() {
    if (this.activities.onInteract()) return;
    const f = this.focus;
    if (!f) return;
    switch (f.kind) {
      case 'animal': this.ui.openAnimalActions(f.entity.data); break;
      case 'helper': this.ui.openHelper(f.helper.data); break;
      case 'refuge':
      case 'petshop':
      case 'tackroom':
      case 'pethouse':
      case 'vet':
      case 'house':
      case 'lodge':
      case 'jobs':
      case 'stable':
      case 'paddock':
      case 'kennel':
      case 'hutch':
      case 'showground':
      case 'pen': this.ui.openBuilding(f.kind); break;
      case 'dismount': this.dismount(); break;
      case 'spot': f.run(); break; // un coin de l'écurie ou de la maison
      case 'vehicle': this.tripFlow.interact(); break;
      case 'salon': this.groomer.open(); break; // salon de toilettage
      case 'client': this.clients.talk(); break; // parler au visiteur (src/game/Clients.js)
      case 'trailVisitor': this.trailGuide.talk(); break; // 🧭 parler aux visiteurs (src/game/TrailGuide.js)
      default:
    }
  }

  toggleCamera() {
    this.rig.mode = this.rig.mode === 'third' ? 'first' : 'third';
    this.profile.settings.camera = this.rig.mode;
  }

  setQuality(q) {
    try {
      localStorage.setItem('animaleana.quality', q);
    } catch {
      /* rien */
    }
  }

  // ---------------------------------------------------------------- actions

  /** Vérifie qu'un soin est possible avant de lancer son mini-jeu. */
  canCare(a, action) {
    const care = CARE[action];
    const tool = missingTool(this.profile, action);
    if (tool) return { ok: false, reason: 'needTool', tool };
    if (!canAfford(this.profile, care.cost)) return { ok: false, reason: 'money' };
    if (careFull(a, action)) return { ok: false, reason: 'full' };
    if (care.tiring && a.needs.energy < 15) return { ok: false, reason: 'tired' };
    if (care.tiring && a.sick) return { ok: false, reason: 'sick' };
    if (care.tiring && a.lame) return { ok: false, reason: 'lameWork' };
    return { ok: true };
  }

  /** opts : ce que dit le mini-jeu (le pansage : opts.hooves, les pieds curés et le caillou ; voir applyCare). */
  care(a, action, quality = 1, opts = {}) {
    const care = CARE[action];
    const tool = missingTool(this.profile, action);
    if (tool) return this.ui.toast(t('r_needTool', { tool: `${TOOLS[tool].emoji} ${t(`tool_${tool}`)}` }), 5000);
    if (!canAfford(this.profile, care.cost)) return this.ui.toast(t('r_money'));
    const before = { ...a.needs };
    const stage0 = bondStage(a);
    const res = applyCare(a, action, quality, opts);
    // 🎂 Le jour de votre anniversaire, sa première friandise lui fait encore plus plaisir (une seule : pas plus de sucre).
    if (res.ok && action === 'treat' && a.annivDay === this.day && a.annivTreat !== this.day) {
      a.annivTreat = this.day;
      a.needs.affection = Math.min(100, (a.needs.affection ?? 50) + 15);
      this.entities.get(a.id)?.emit('🎂', 3);
    }
    if (res.ok) this.ui.showDeltas(a, before);
    if (!res.ok) return this.ui.toast(t(`r_${res.reason}`, { name: a.name, g: a.sex }));
    if (res.unlame) this.ui.toast(t('unlame', { name: a.name, g: a.sex }), 6000);
    // Beaucoup trop de granulés (la ration, src/ui/minigames/ration.js) : une fois sur deux, les coliques.
    if (action === 'feed' && opts.colic && a.species === 'horse' && !a.sick && Math.random() < 0.5) {
      a.sick = 'belly';
      this.entities.get(a.id)?.emit('🤢', 3);
      this.ui.toast(t('colicSick', { name: a.name, g: a.sex }), 7000);
    }
    // Ferrer : les fers neufs (carnet de santé) ; il avait perdu un fer : il ne boite plus.
    if (action === 'shoe' && a.species === 'horse') {
      const lostShoe = a.lame?.cause === 'shoe';
      noteHealth(a, 'farrier', this.day);
      if (lostShoe) this.ui.toast(t('shoeFixed', { name: a.name, g: a.sex }), 5000);
    }
    spend(this.profile, care.cost);
    addStat(this.profile, action);
    // (l'histoire de ton premier cheval, sa journée, les Galops : tes chevaux, pas ceux qu'on te confie)
    if (a.species === 'horse' && !a.client && !a.guest) {
      addStat(this.profile, `horse_${action}`);
      this.markHorseDay(a, action);
    }
    this.bondNews(a, stage0);
    // 🔍 Le mini-jeu a trouvé son coin préféré ou sa friandise préférée (opts.quirk) : la première fois, on le note.
    if (opts.quirk && discoverQuirk(a, opts.quirk)) this.quirkFound(a, opts.quirk);
    this.xp('care');
    this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️');
    this.ui.refresh();
    this.emit('care', { a, action, quality });
    return { ...res, quality }; // (la qualité du mini-jeu : le bain du concours en a besoin, src/ui/beauty.js)
  }

  trick(a, trickId) {
    if (a.client) return this.ui.toast(t('cl_notYours', { name: a.name, g: a.sex })); // animal confié (src/sim/clients.js)
    const r = trainTrick(a, trickId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex, n: r.need }));
    const e = this.entities.get(a.id);
    this.xp(r.learned ? 'trickLearned' : 'trick');
    if (r.learned) {
      addStat(this.profile, 'tricksLearned');
      e?.emit('🎉', 5);
      this.ui.toast(t('trickLearned', { name: a.name, g: a.sex, trick: t(`trick_${trickId}`) }));
    } else if (r.success) {
      e?.emit('⭐', 2);
      this.ui.toast(t('trickSuccess', { name: a.name, g: a.sex, p: r.progress }));
    } else {
      this.ui.toast(t('trickFail', { name: a.name, g: a.sex }));
    }
    this.ui.refresh();
    return r;
  }

  buyTool(tool) {
    const r = buyTool(this.profile, tool);
    if (!r.ok) return this.ui.toast(t({ money: 'r_money', soon: 'moreSoon' }[r.reason] ?? 'alreadyOwned'));
    this.ui.toast(t('gearBought', { name: t(`tool_${tool}`) }));
    return r;
  }

  train(a, trainingId) {
    if (a.client) return this.ui.toast(t('cl_notYours', { name: a.name, g: a.sex })); // animal confié
    const tool = missingTool(this.profile, trainingId);
    if (tool) return this.ui.toast(t('r_needTool', { tool: `${TOOLS[tool].emoji} ${t(`tool_${tool}`)}` }), 5000);
    const r = trainSkill(a, trainingId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex, n: r.need }));
    addStat(this.profile, 'trainings');
    this.entities.get(a.id)?.emit('💪', 2);
    this.ui.toast(t('skillGain', { name: a.name, g: a.sex, skill: t(`skill_${r.skill}`), n: r.gain }));
    this.ui.refresh();
    return r;
  }

  ride(a, bareback = false) {
    const r = canRide(a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    let gear = rideGear(a, bareback);
    // Pas de filet (même avec son licol, ou sellé sans filet) : on lui met celui qui reste à la sellerie, puis on
    // monte (src/sim/gear.js). Sans filet libre, on monte avec le licol.
    const tack = tackUpForRide(this.profile, a, { home: this.isHome });
    if (tack.ok && tack.item) {
      this.entities.get(a.id)?.applyGear();
      this.ui.toast(t(GEAR[tack.item]?.type === 'halter' ? 'r_putHalterFirst' : 'actv_putBridleFirst', { name: a.name, g: a.sex }), 3000);
      gear = rideGear(a, bareback);
    }
    if (!gear.ok) return this.ui.toast(t('r_needBridle', { name: a.name, g: a.sex }), 5000);
    this.bareback = gear.bareback;
    this.player.bareback = gear.bareback;
    const e = this.entities.get(a.id);
    if (!e) return null;
    // Pas de laisse à cheval (elle traversait les barrières) : le chien promené suit librement, comme un animal
    // qu'on emmène (il vient aussi en balade : Activities, walkers).
    for (const d of this.profile.animals) {
      if (!d.following || !d.leashed || d.location !== this.profile.place) continue;
      d.leashed = false;
      this.ui.toast(t('leashRide', { name: d.name, g: d.sex }), 5000);
    }
    e.stopRoll?.(); // (il se roulait : debout d'abord, avant de mesurer la selle)
    // On monte toujours avec sa bombe, mise avant de monter : setHelmet refait l'avatar (mèches rentrées), qui
    // n'est ainsi posé en selle (et ajusté au cheval, riderFit) qu'une fois.
    this.player.setHelmet(riderHelmet(this.profile));
    this.player.riderLevel = galopLevel(this.profile); // (Galops obtenus : il s'effraie moins)
    this.player.ride(e);
    // 🐢 il vient de travailler (une leçon, une balade…) : déjà chaud, pas besoin de le réchauffer (src/sim/warmup.js)
    if ((this.profile.clock ?? 0) - (a.warmAt ?? -1e9) < WARM_FOR) this.player.session = warmSession();
    this.ui.updateGaitPad?.();
    addStat(this.profile, 'rides');
    this.markHorseDay(a, 'ride');
    this.remember(a, 'firstRide');
    const w = this.simWeather();
    if (w === 'rain' || w === 'storm') this.remember(a, 'firstRain');
    else if (w === 'snow') this.remember(a, 'firstSnow');
    // 🎨 en selle avec un ensemble assorti (src/sim/matchy.js) : quelques étincelles (et le défi du jour le compte)
    if (matchyOf(a, riderHelmet(this.profile)).level >= 1) {
      addStat(this.profile, 'rideMatchy');
      e.emit('✨', 2);
    }
    this.xp('ride');
    this.ui.toast(t(gear.bareback ? 'ridingBareback' : 'ridingHint', { name: a.name, g: a.sex }));
    return r;
  }

  dismount() {
    this.freeJumps?.cancel(); // (en plein saut : droit d'abord)
    const e = this.player.mount;
    const worked = !!this.player.cantered; // (il a galopé : de retour au pré, il ira se rouler)
    // 🐢 Le retour au calme (src/sim/warmup.js) : il a galopé, puis marché un moment au pas avant qu'on descende ?
    const calm = e && this.player.gaitEnabled !== false && !this.tripFlow?.active ? dismountVerdict(this.player.session) : null;
    if (e && this.player.session?.started) e.data.warmAt = this.profile.clock ?? 0; // (encore chaud un moment)
    this.player.dismount();
    if (calm && e.data.species === 'horse') {
      const a = e.data;
      if (calm === 'cooled') {
        const s0 = bondStage(a);
        a.bond = Math.min(100, (a.bond ?? 0) + WARMUP.coolBond);
        a.needs.affection = Math.min(100, (a.needs.affection ?? 50) + WARMUP.coolAffection);
        a.sweat = (a.sweat ?? 0) * 0.5; // (il a séché un peu en marchant)
        if (!a.client && !a.guest) addStat(this.profile, 'cooldowns');
        this.remember(a, 'firstCool');
        e.emit('😌', 2);
        this.bondNews(a, s0);
      }
      this.ui.toast(t(`ride_${calm}`, { name: a.name, g: a.sex }), 6000);
    }
    if (e && worked) {
      e.rollSoon = true;
      // (sellé, il attend qu'on lui enlève sa selle pour aller se rouler : on le dit une fois)
      if (e.data.gear?.saddle) this.ui.toast(t('ride_unsaddle', { name: e.data.name, g: e.data.sex }), 5000);
    }
    this.ui.updateGaitPad?.();
  }

  /** Choisir l'allure du cheval qu'on monte (boutons à l'écran, touches 0 1 2 3). */
  setRideGait(g) {
    const pl = this.player;
    if (!pl.mount) return;
    pl.setGait(g);
    this.ui.updateGaitPad?.();
  }

  /** Laisses : un trait entre la main du joueur et le collier ; le chien qui tire entraîne le joueur. */
  updateLeashes(entities) {
    this.leashLines = this.leashLines ?? new Map();
    let pull = null;
    const seen = new Set();
    for (const e of entities) {
      if (!(e.data.following && e.data.leashed && canLeash(e.data))) continue;
      seen.add(e.data.id);
      let line = this.leashLines.get(e.data.id);
      if (!line) {
        const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3()));
        line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc0392b }));
        line.frustumCulled = false;
        this.scene.add(line);
        this.leashLines.set(e.data.id, line);
      }
      const pl = this.player.position;
      const h = this.player.heading;
      const hand = new THREE.Vector3(pl.x + Math.cos(h) * 0.3, pl.y + 0.85, pl.z - Math.sin(h) * 0.3);
      const neck = e.position.clone();
      // (chien réaliste : l'anneau de son collier, qui suit l'encolure)
      if (e.model.leashPoint) e.model.leashPoint.getWorldPosition(neck);
      else neck.y += (e.model.y0 + e.data.look.bodyR) * e.scale;
      const dist = hand.distanceTo(neck);
      // (mou d'après la longueur réelle de la laisse : tendue quand le chien tire au bout — calculé pour 2,8 m, elle
      // pendait en U jusqu'au sol)
      const slack = Math.max(0, LEASH_LEN + 0.2 - dist) * 0.35;
      const pos = line.geometry.attributes.position;
      for (let i = 0; i < 10; i++) {
        const tt = i / 9;
        pos.setXYZ(i, hand.x + (neck.x - hand.x) * tt, hand.y + (neck.y - hand.y) * tt - Math.sin(tt * Math.PI) * slack, hand.z + (neck.z - hand.z) * tt);
      }
      pos.needsUpdate = true;
      if (e.leashPull > 0) pull = { x: e.leashDir.x * e.leashPull, z: e.leashDir.z * e.leashPull };
    }
    for (const [id, line] of this.leashLines) {
      if (!seen.has(id)) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        this.leashLines.delete(id);
      }
    }
    this.player.pull = pull;
  }

  /**
   * Une activité commence (parcours, dressage, agility…) : les animaux qui nous suivent (sauf ceux de l'activité,
   * keep : leurs identifiants) restent là où ils sont. Le chien promené restait au bout de sa laisse, dehors,
   * la laisse à travers la barrière de la carrière.
   */
  stopFollowers(keep = []) {
    const list = this.profile.animals.filter((a) => !keep.includes(a.id) && a.following && a.location === this.profile.place);
    if (list.length === 1) {
      const a = list[0];
      this.ui.toast(t(a.leashed ? 'leashDropped' : 'staying', { name: a.name, g: a.sex }), 5000);
    } else if (list.length) this.ui.toast(t('followersWait', { names: list.map((a) => a.name).join(', ') }), 5000);
    for (const a of list) {
      a.following = false;
      a.leashed = false;
    }
  }

  /** Promener un chien en laisse (collier + laisse). */
  toggleLeash(a) {
    if (!a.following || !a.leashed) {
      if (!canLeash(a)) return this.ui.toast(t('r_needLeash', { name: a.name, g: a.sex }), 5000);
      a.following = true;
      // Déjà à cheval : pas de laisse non plus (comme en montant, ride) ; le chien suit librement.
      if (this.player.mount) {
        a.leashed = false;
        return this.ui.toast(t('leashRide', { name: a.name, g: a.sex }), 5000);
      }
      a.leashed = true;
      this.ui.toast(t('leashOn', { name: a.name, g: a.sex }));
    } else {
      a.following = false;
      a.leashed = false;
      this.ui.toast(t('leashOff', { name: a.name, g: a.sex }));
    }
  }

  toggleFollow(a) {
    a.leashed = false;
    if (!a.following) {
      const lead = canLead(a);
      if (!lead.ok) return this.ui.toast(t('r_needHalter', { name: a.name, g: a.sex }), 5000);
    }
    a.following = !a.following;
    this.ui.toast(t(a.following ? 'following' : 'staying', { name: a.name, g: a.sex }));
    if (a.following) addStat(this.profile, 'walks');
  }

  /** ⬆️ Le bouton du trot enlevé est là : en balade libre, en selle (étriers), au trot. */
  canPostTrot() {
    const pl = this.player;
    return !!pl.mount && pl.gaitEnabled !== false && !pl.auto && !this.activities.active && !this.tripFlow?.active
      && !!pl.canPost && pl.gaitNow === 'trot' && pl.speed > 0.3;
  }

  /** ⬆️ Tu te lèves (bouton ou Espace) : au temps fort, la série monte ; trop tôt ou trop tard, elle repart à zéro. */
  postTrot() {
    const pl = this.player;
    if (!pl.posting || !pl.mount) return null;
    const r = tapPost(pl.posting, pl.stride ?? 0);
    this.ui.postFeedback?.(r);
    audio.ui(r.ok ? 'tap' : 'cancel'); // (un « toc » au bon temps)
    if (r.ok && postMilestone(pl.posting)) {
      addStat(this.profile, 'risingTrot'); // (Galop 2)
      this.ui.toast(t('post_great', { name: pl.mount.data.name, g: pl.mount.data.sex }), 5000);
    }
    return r;
  }

  /**
   * 📣 Appeler ton cheval (src/sim/horseCall.js) : il lève la tête et hennit ; s'il te fait assez confiance, il
   * vient vers toi au trot (le lien grandit un peu), sinon il te regarde et reste là.
   */
  callHorse(a) {
    if (this.blockedByPause()) return null;
    const e = this.entities.get(a.id);
    if (!e || a.location !== this.profile.place || this.player.mount === e) return null;
    const pp = this.player.position;
    const dist = Math.hypot(e.position.x - pp.x, e.position.z - pp.z);
    const p0 = { name: a.name, g: a.sex };
    // (il te suit déjà : il faut d'abord lui dire de rester, puis s'éloigner)
    if (a.following) {
      this.ui.toast(t('call_following', p0), 5000);
      return 'following';
    }
    // (il arrive déjà : rappeler ne compte pas une deuxième fois)
    if (e.comeTrot && e.state === 'walk' && dist >= CALL.near) {
      this.ui.toast(t('call_coming', p0), 4000);
      return 'coming';
    }
    const busy = e.ridden || e.scripted || e.herdCtrl || e.posing || a.following;
    const answer = busy ? 'near' : answerCall(a, { dist, sleeping: e.sleeping });
    const p = { name: a.name, g: a.sex };
    addStat(this.profile, 'horse_call');
    if (answer === 'come' && e.comeTo(pp, dist, true)) {
      e.speak('happy', dist);
      e.emit('❗', 1.5);
      const s0 = bondStage(a);
      const grew = cameWhenCalled(a, this.day);
      this.bondNews(a, s0);
      this.remember(a, 'firstCall');
      this.ui.toast(t(grew ? 'call_comeBond' : 'call_come', p), 5000);
      addStat(this.profile, 'horse_came');
      return 'come';
    }
    if (answer === 'look' || answer === 'box') {
      e.speak(null, dist);
      e.lookAtPlayer(6);
      e.emit('👀', 2);
    } else if (answer === 'pain') e.speak('sad', dist);
    this.ui.toast(t(`call_${answer}`, p), 5000);
    return answer;
  }

  callHere(a) {
    const e = this.entities.get(a.id);
    if (!e) return;
    const p = this.player.position;
    e.position.set(p.x + Math.sin(this.player.heading) * 2, 0, p.z + Math.cos(this.player.heading) * 2);
    this.world.resolveCollisions(e.position);
    e.snap();
  }

  rename(a, name) {
    a.name = name.trim().slice(0, 20) || a.name;
    this.entities.get(a.id)?.rename();
  }

  adopt(candidate, name, price = adoptionPrice(candidate), from = 'refuge') {
    if (!spend(this.profile, price)) return this.ui.toast(t('r_money'));
    const a = { ...candidate, name: name?.trim() || candidate.name, location: this.profile.place };
    if (candidate.adoptKey) this.profile.adoptedKeys.push(candidate.adoptKey);
    delete a.adoptKey;
    this.profile.animals.push(a);
    addStat(this.profile, 'adopted');
    this.remember(a, 'arrived');
    this.xp('adopt');
    // Le premier cheval reçoit tout de suite le licol, le filet et la selle offerts (à sa taille : un poney ou un
    // cheval de trait aussi), le premier chien son collier et sa laisse (src/sim/gear.js).
    starterTack(this.profile, a, { home: this.isHome });
    const door = this.world.interactables.find((i) => i.kind === from) ?? this.world.interactables.find((i) => i.kind === 'refuge');
    const e = this.spawnEntity(a, door);
    e.emit('❤️', 5);
    this.ui.toast(t('adopted', { name: a.name, g: a.sex }));
    this.save();
    this.emit('adopted', a);
    return a;
  }

  /** Acheter un animal choisi à l'animalerie (ou à l'élevage en voyage). */
  buyAnimal(cfg, name) {
    // (une espèce pas encore proposée ne s'achète pas, même depuis une vieille fenêtre restée ouverte)
    if (!isOffered(cfg.species)) {
      this.ui.toast(t('moreSoon'));
      return null;
    }
    const price = shopPrice(cfg.species, cfg.breed, cfg.stage);
    const a = createAnimal({
      species: cfg.species, breed: cfg.breed, colorIndex: cfg.colorIndex, sex: cfg.sex,
      ageDays: stageAgeDays(cfg.species, cfg.stage), name: name?.trim() || undefined, location: this.profile.place, day: this.day,
      seed: cfg.seed, // (la graine de l'aperçu de l'animalerie : mêmes marques blanches)
    });
    return this.adopt(a, name, price, this.isHome ? 'petshop' : 'refuge');
  }

  breedingPartners(a) {
    if (a.client) return []; // animal confié : pas de bébés
    return this.animalsHere().filter((b) => b.id !== a.id && !b.client && b.species === a.species && b.sex !== a.sex);
  }

  canBreed(a, b) {
    return canBreed(a, b, this.day, this.level);
  }

  breedingChecklist(a, b) {
    return breedingChecklist(a, b, { day: this.day, level: this.level });
  }

  /** Les deux animaux se rencontrent ; les petits naîtront à la fin de la gestation. */
  breed(a, b) {
    const r = canBreed(a, b, this.day, this.level);
    if (!r.ok) return this.ui.toast(t('breedNotReady'));
    const mother = mate(a, b, this.day);
    this.entities.get(a.id)?.emit('💕', 3);
    this.entities.get(b.id)?.emit('💕', 3);
    this.ui.toast(t('pregnant', { name: mother.name, n: mother.pregnant.due - this.day }), 6000);
    this.save();
    return mother;
  }

  /** Naissances quand la gestation est terminée. */
  checkBirths() {
    for (const mother of [...this.profile.animals]) {
      if (!mother.pregnant || this.day < mother.pregnant.due) continue;
      const father = this.profile.animals.find((x) => x.id === mother.pregnant.father) ?? mother;
      // (prénoms : pas un de ceux déjà portés à la ferme, en pension, au salon…, ni deux fois dans la portée)
      const babies = breed(mother, father, this.day, Math.random, namesInUse(this.profile));
      for (const baby of babies) {
        baby.location = mother.location;
        this.profile.animals.push(baby);
        if (mother.location === this.profile.place) this.spawnEntity(baby, this.entities.get(mother.id)?.position).emit('🍼', 3);
      }
      addStat(this.profile, 'births', babies.length);
      this.xp('birth');
      this.ui.alert(t('born', { n: babies.length, names: babies.map((x) => x.name).join(', ') }));
      this.save();
    }
  }

  /** Soins faits soi-même avec la trousse (sans vétérinaire, gratuit). */
  selfCare(a) {
    const wasSick = !!a.sick;
    if (wasSick) cure(a, this.day);
    else checkup(a, this.day);
    addStat(this.profile, 'vet');
    this.xp('vet');
    this.entities.get(a.id)?.emit('💚', 4);
    this.ui.refresh();
  }

  vetCost(atClinic) {
    return atClinic ? VET_COST.clinic : VET_COST.home;
  }

  vetDone(a, atClinic) {
    spend(this.profile, this.vetCost(atClinic));
    const wasSick = !!a.sick;
    if (wasSick) cure(a, this.day);
    else checkup(a, this.day);
    addStat(this.profile, 'vet');
    this.xp('vet');
    this.entities.get(a.id)?.emit('💚', 4);
    this.ui.toast(t(wasSick ? 'vetCured' : 'vetCheckupDone', { name: a.name, g: a.sex }));
    this.remember(a, 'firstVet');
    // Le cheval : vaccins et dents contrôlés à chaque visite (carnet de santé).
    if (a.species === 'horse' && noteHealth(a, 'vaccine', this.day) && noteHealth(a, 'teeth', this.day)) {
      this.ui.toast(t('vetHorsePlan', { name: a.name, g: a.sex }), 5000);
    }
    this.ui.refresh();
  }

  sleep() {
    const h = this.hour;
    if (h >= 7 && h < 19) return this.ui.toast(t('why_notTired', { h: fmtHour(19) })); // on dort de 19 h à 7 h
    const hours = h < 7 ? 7 - h : 31 - h;
    this.advanceTime(hours, { sleeping: true });
    for (const a of this.animalsHere()) a.needs.energy = Math.max(a.needs.energy, 90);
    this.ui.toast(t('sleepDone'), 4000);
    this.save();
  }

  doJob(job) {
    this.advanceTime(job.hours);
    earn(this.profile, job.pay);
    audio.ui('coin');
    addStat(this.profile, 'jobs');
    this.ui.toast(t('jobDone', { n: job.pay }));
  }

  // ---------------------------------------------------------------- ferme

  wantedEquipment(a) {
    if (a.stalled && this.interiors.stallOf(a)) return null; // au box, on ne va pas au paddock boire
    const eq = wantedEquipment(this.profile, a, this.profile.place);
    return eq ? this.equipment.find((q) => q.eq.id === eq.id) ?? null : null;
  }

  animalUsedEquipment(entity, entry) {
    if (!entry) return;
    const r = useEquipment(this.profile, entity.data, entry.eq);
    if (r.ok) entity.emit({ hunger: '🍖', thirst: '💧', grooming: '✨' }[r.need] ?? '❤️', 2);
  }

  socialMoment(entity, kind) {
    socialMoment(entity.data, kind);
    entity.emit({ play: '⚽', groom: '💕', nurse: '🍼' }[kind], 1);
  }

  buyEquipment(type) {
    if (!this.isUnlocked(type)) return this.ui.toast(t('lockedLevel', { n: this.unlockLevel(type) }));
    const r = buyEquipment(this.profile, type, this.profile.place);
    if (!r.ok) return this.ui.toast(t({ money: 'r_money', soon: 'moreSoon' }[r.reason] ?? 'alreadyOwned'));
    this.spawnEquipment(r.equipment);
    addStat(this.profile, 'equipment');
    this.ui.toast(t('equipmentBought', { name: t(`eq_${type}`) }));
    this.save();
    return r;
  }

  refillEquipment(eq) {
    const r = refillEquipment(this.profile, eq);
    if (!r.ok) return this.ui.toast(t(r.reason === 'money' ? 'r_money' : 'alreadyFull'));
    this.ui.toast(t('refilled', { name: t(`eq_${eq.type}`) }));
    return r;
  }

  hire(type) {
    if (!this.isUnlocked(type)) return this.ui.toast(t('lockedLevel', { n: this.unlockLevel(type) }));
    const r = hireHelper(this.profile, type, this.profile.place);
    if (!r.ok) return this.ui.toast(t(r.reason === 'soon' ? 'moreSoon' : 'alreadyHired'));
    this.helpers.set(r.helper.id, new HelperEntity(r.helper, this.world, this.scene));
    addStat(this.profile, 'hired');
    this.ui.toast(t('hired', { name: r.helper.name, g: r.helper.sex, job: t(`helper_${type}`, { g: r.helper.sex }) }));
    this.save();
    return r;
  }

  fire(helperId) {
    this.helpers.get(helperId)?.dispose();
    this.helpers.delete(helperId);
    fireHelper(this.profile, helperId);
    this.save();
  }

  taskPosition(task) {
    if (task.droppingId) {
      const m = this.droppingMeshes.get(task.droppingId);
      return m ? m.position : null;
    }
    if (task.animalId) {
      const e = this.entities.get(task.animalId);
      return e ? e.position : null;
    }
    if (task.equipmentId) return this.equipment.find((q) => q.eq.id === task.equipmentId)?.pos ?? null;
    return null;
  }

  helperDone(helper, task) {
    if (!task) return;
    const r = doHelperTask(this.profile, task, this.animalsHere(), helper.data);
    if (!r.ok) return;
    // L'aide gagne de l'expérience (et se fatigue un peu).
    tireHelper(helper.data);
    const up = addHelperXp(helper.data, 5);
    if (up.levelUp) {
      helper.refreshTag();
      this.ui.toast(t('helperLevelUp', { name: helper.data.name, g: helper.data.sex, n: up.level }), 5000);
    }
    if (r.scooped) {
      this.removeDroppingMeshes([r.scooped]);
      return;
    }
    const e = task.animalId && this.entities.get(task.animalId);
    if (e) e.emit(task.kind === 'cure' ? '💚' : task.kind === 'product' ? '🪣' : '❤️', 2);
    if (task.kind === 'product') this.ui.toast(t(`collected_${r.product}`, { name: helper.data.name, g: helper.data.sex, n: r.earned }));
  }

  collect(a) {
    const r = collectProduct(this.profile, a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    const e = this.entities.get(a.id);
    e?.emit(r.product === 'wool' ? '🧶' : '🥛', 3);
    // La joueuse fait le geste : la main aux trayons pour traire (vache, chèvre : Player.milkAtUdder), la tonte au flanc
    // (rien ne l'appelait : elle restait les bras ballants pendant que la mamelle se vidait).
    this.player?.careGesture?.(SPECIES[a.species]?.product?.action ?? (r.product === 'wool' ? 'shear' : 'milk'), e);
    audio.ui('coin');
    this.xp('collect');
    this.ui.toast(t(`got_${r.product}`, { name: a.name, g: a.sex, n: r.earned }));
    this.ui.refresh();
    return r;
  }

  /** Qui peut conduire le troupeau ici : un chien de troupeau, sinon le berger. */
  herder() {
    const dogs = [...this.entities.values()].filter((e) => e.data.role === 'herder' && !e.ridden);
    const dog = dogs.find((e) => !e.data.housed) ?? dogs[0]; // de préférence un chien qui n'est pas rangé pour la nuit
    if (dog) return dog;
    return [...this.helpers.values()].find((h) => h.def.herds) ?? null;
  }

  startHerding(dest, pusher = this.herder()) {
    if (!pusher) return this.ui.toast(t('noHerder'));
    if (!this.herding.start(dest, pusher)) return this.ui.toast(t('noFlock'));
    this.ui.toast(t(dest === 'pen' ? 'herdingIn' : 'herdingOut', { name: pusher.data.name, g: pusher.data.sex }));
    return true;
  }

  herdingDone(dest, pusher) {
    addStat(this.profile, 'herds');
    this.xp('herd');
    if (pusher.data.skills) {
      pusher.data.skills.herding = Math.min(100, (pusher.data.skills.herding ?? 0) + 2);
      socialMoment(pusher.data, 'play');
      pusher.emit('⭐', 2);
    }
    this.ui.toast(t(dest === 'pen' ? 'herdedIn' : 'herdedOut'), 4000);
  }

  autoHerd() {
    const p = this.profile;
    if (!p.farm?.autoHerd || this.herding.active) return;
    const h = this.hour;
    const slot = h >= 20 || h < 8 ? 'pen' : 'field';
    const key = `${this.day}-${slot}`;
    if (p.farm.lastHerd === key) return;
    if (h < 8 && slot === 'pen' && p.farm.lastHerd === `${this.day - 1}-pen`) return;
    const flock = [...this.entities.values()].filter((e) => e.sp.livestock && !e.customHome);
    if (!flock.length) return;
    const pusher = this.herder();
    if (!pusher) return;
    if (flock.every((e) => (e.data.zone ?? 'pen') === slot)) {
      p.farm.lastHerd = key;
      return;
    }
    p.farm.lastHerd = key;
    this.startHerding(slot, pusher);
  }

  setHerder(a, on) {
    for (const x of this.profile.animals) if (x.role === 'herder' && x.location === a.location) delete x.role;
    if (on) a.role = 'herder';
    this.ui.toast(t(on ? 'herderOn' : 'herderOff', { name: a.name, g: a.sex }));
  }

  equipmentHere() {
    return this.equipment;
  }

  equipmentStock(eq) {
    return hasStock(this.profile, eq);
  }

  travelOptions(destId, travelers) {
    const horseOk = travelers.some((a) => a.species === 'horse' && canRide(a).ok);
    return Object.keys(TRAVEL_MODES).map((mode) => ({
      mode, ...checkTravel(this.profile.place, destId, mode, travelers, horseOk),
    }));
  }

  /**
   * Change de lieu. opts.trip : voyage réaliste déjà fait par TripFlow (sim/trip.js) :
   * le coût, le temps qui passe et les besoins pendant le trajet ont déjà été comptés.
   */
  travel(destId, mode, travelerIds, opts = {}) {
    const p = this.profile;
    const done = !!opts.trip;
    const travelers = this.animalsHere().filter((a) => travelerIds.includes(a.id));
    const horse = travelers.find((a) => a.species === 'horse' && canRide(a).ok);
    const check = checkTravel(p.place, destId, mode, travelers, done || !!horse);
    if (!check.ok) return this.ui.toast(t(`tr_${check.reason}`));
    if (!done && !spend(p, check.cost)) return this.ui.toast(t('r_money'));

    // Pendant le voyage on fait des pauses : les besoins baissent moins vite.
    const hours = check.hours;
    if (!done) p.clock += hours * 60;
    for (const a of travelers) {
      const events = done ? [] : tickAnimal(a, hours * 0.25, { moving: true, ridden: mode === 'horse' && a === horse });
      if (!done) a.ageDays += (hours * 0.75) / 24;
      a.location = destId;
      a.following = true;
      delete a.pos;
      if (events.includes('died')) this.animalDied(a);
      else if (events.includes('sick')) this.ui.toast(t('gotSick', { name: a.name, g: a.sex }), 6000);
    }
    for (const a of travelers) if (a.species === 'horse') this.remember(a, 'firstTrip'); // 📸 (à cheval, en van…)
    p.place = destId;
    if (!p.visited.includes(destId)) p.visited.push(destId);
    addStat(p, 'travels');
    this.xp('travel');
    if (mode === 'horse') addStat(p, 'horseTravels');
    this.loadPlace(destId);
    if (mode === 'horse' && horse && this.entities.get(horse.id)) this.player.ride(this.entities.get(horse.id));
    const def = PLACES[destId];
    this.ui.toast(t('arrived', { flag: def.flag, place: L(def.name) }), 5000);
    this.save();
    return check;
  }

  hud() {
    const p = this.profile;
    return {
      name: p.name,
      money: p.mode === 'sandbox' ? null : p.money,
      day: this.day,
      clock: p.clock,
      place: this.placeDef,
      isHome: this.isHome,
      weather: this.weather,
      temperature: this.temperature,
      season: this.season,
      level: this.level,
      levelProgress: (() => {
        const xp = p.xp ?? 0;
        const lv = levelOf(xp);
        const a = 25 * lv * (lv - 1);
        const b = 25 * (lv + 1) * lv;
        return (xp - a) / (b - a);
      })(),
    };
  }
}

/** Drapeau du stockage local ('1'), faux si le stockage est indisponible. */
function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function readQuality() {
  try {
    const q = localStorage.getItem('animaleana.quality');
    if (q) return q;
  } catch {
    /* rien */
  }
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
  return phone ? 'low' : 'high';
}

export { SPECIES };
