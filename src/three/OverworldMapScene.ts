import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AvatarConfig, EpisodeData, LessonProgress } from '../types/course';
import { ISLANDS } from '../utils/gamification';
import {
  attachStudioEnvironment,
  createAfterDrawPacer,
  createStudioRenderer,
  detectSoftwareWebGL,
  disposeObjectHierarchy,
} from './webglUtils';

export interface StageHoverProjection {
  visible: boolean;
  x: number;
  y: number;
  episodeId: string;
  titulo: string;
  ilhaNome: string;
  completed: boolean;
}

interface IslandLayoutSpec {
  id: string;
  center: [number, number];
  radius: number;
  shoreColor: string;
  cliffColor: string;
  cliffAccent: string;
  lowerTurfColor: string;
  upperTurfColor: string;
  maxElevation: number;
  sweepSign: 1 | -1;
  hasSatelliteIslet: boolean;
  isletFrac: number;
}

const ISLAND_LAYOUTS: IslandLayoutSpec[] = [
  {
    id: 'ilha-0',
    center: [-20.5, 3.2],
    radius: 3.6,
    shoreColor: '#C29B61',
    cliffColor: '#521B32',
    cliffAccent: '#3B1123',
    lowerTurfColor: '#2F6F4E',
    upperTurfColor: '#3E8E63',
    maxElevation: 1.15,
    sweepSign: 1,
    hasSatelliteIslet: false,
    isletFrac: 0,
  },
  {
    id: 'ilha-1',
    center: [-9.0, -3.2],
    radius: 7.4,
    shoreColor: '#B48452',
    cliffColor: '#5C1D35',
    cliffAccent: '#3F1123',
    lowerTurfColor: '#9A4A16',
    upperTurfColor: '#B45B1A',
    maxElevation: 1.68,
    sweepSign: 1,
    hasSatelliteIslet: true,
    isletFrac: 0.36,
  },
  {
    id: 'ilha-2',
    center: [3.6, 4.0],
    radius: 6.2,
    shoreColor: '#4A5568',
    cliffColor: '#4A152C',
    cliffAccent: '#310D1D',
    lowerTurfColor: '#164E63',
    upperTurfColor: '#155E75',
    maxElevation: 1.56,
    sweepSign: -1,
    hasSatelliteIslet: true,
    isletFrac: 0.37,
  },
  {
    id: 'ilha-3',
    center: [14.5, -2.8],
    radius: 5.8,
    shoreColor: '#57534E',
    cliffColor: '#5F162E',
    cliffAccent: '#3A0C1B',
    lowerTurfColor: '#6B2818',
    upperTurfColor: '#7C2D12',
    maxElevation: 1.72,
    sweepSign: 1,
    hasSatelliteIslet: true,
    isletFrac: 0.38,
  },
  {
    id: 'ilha-4',
    center: [23.8, 3.0],
    radius: 4.6,
    shoreColor: '#3B1728',
    cliffColor: '#470B21',
    cliffAccent: '#2B0614',
    lowerTurfColor: '#7F1D3A',
    upperTurfColor: '#9F1239',
    maxElevation: 2.15,
    sweepSign: -1,
    hasSatelliteIslet: false,
    isletFrac: 0,
  },
];

interface PathWaypoint {
  pos: THREE.Vector3;
  kind: 'ground' | 'stair' | 'bridge' | 'footbridge';
  completedSoFar: boolean;
  episodeId?: string;
}

const _vec3 = new THREE.Vector3();

function computeSweepAngle(from: number, to: number, sign: 1 | -1): number {
  const twoPi = Math.PI * 2;
  let diff = (to - from) % twoPi;
  if (sign > 0) {
    if (diff <= 0) diff += twoPi;
    if (diff < Math.PI * 0.95) diff += twoPi;
  } else {
    if (diff >= 0) diff -= twoPi;
    if (diff > -Math.PI * 0.95) diff -= twoPi;
  }
  return diff;
}

function createOceanPixelTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0D050D';
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#140813';
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      if (((x + y) / 64) % 2 === 0) {
        ctx.fillRect(x, y, 64, 64);
      }
    }
  }

  ctx.strokeStyle = 'rgba(190, 18, 60, 0.20)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
  for (let y = 14; y < 512; y += 64) {
    for (let x = 10; x < 512; x += 64) {
      ctx.fillRect(x, y, 14, 4);
      ctx.fillRect(x + 28, y + 32, 10, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 12);
  tex.anisotropy = maxAniso;
  return tex;
}

function createBlueprintDeckTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#114459';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createHazardStripeTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#18181B';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#FACC15';
  for (let x = -64; x < 320; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 16, 0);
    ctx.lineTo(x - 16, 64);
    ctx.lineTo(x - 32, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = maxAniso;
  return tex;
}

export class OverworldMapSceneController {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envTex: THREE.Texture;
  private pacer: ReturnType<typeof createAfterDrawPacer>;

  private raycaster = new THREE.Raycaster();
  private pointerDownPos = new THREE.Vector2();
  private pointerNdc = new THREE.Vector2();

  private worldGroup = new THREE.Group();
  private stagePickables: THREE.Mesh[] = [];
  private stagePositions = new Map<string, THREE.Vector3>();
  private selectionRing: THREE.Group;

  private animatedSpinners: THREE.Object3D[] = [];
  private animatedFloaters: { obj: THREE.Object3D; baseY: number; phase: number }[] = [];

  private avatarGroup = new THREE.Group();
  private avatarHelmetMat!: THREE.MeshStandardMaterial;
  private avatarSkinMat!: THREE.MeshStandardMaterial;
  private avatarVestMat!: THREE.MeshStandardMaterial;
  private avatarGlassesMesh!: THREE.Mesh;
  private avatarGlassesMat!: THREE.MeshStandardMaterial;

  private avatarStartPos = new THREE.Vector3();
  private avatarTargetPos = new THREE.Vector3();
  private avatarHopProgress = 1;

  private isCamTransitioning = false;
  private desiredCamPos = new THREE.Vector3(1.5, 22.8, 32.5);
  private desiredLookAt = new THREE.Vector3(1.5, 1.0, 0.4);
  private lastTimestamp = 0;

  private activeEpisodeId: string;
  private hoveredEpisodeId: string | null = null;
  private episodeLookup = new Map<string, EpisodeData>();
  private lessonsProgress: Record<string, LessonProgress> = {};

  private onSelectStage?: (episodeId: string, openDirectly: boolean) => void;
  private onProjectionUpdate?: (proj: StageHoverProjection) => void;

  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    params: {
      episodes: EpisodeData[];
      lessonsProgress: Record<string, LessonProgress>;
      avatarConfig: AvatarConfig;
      initialEpisodeId: string;
      onSelectStage?: (episodeId: string, openDirectly: boolean) => void;
      onProjectionUpdate?: (proj: StageHoverProjection) => void;
    }
  ) {
    this.container = container;
    this.lessonsProgress = params.lessonsProgress;
    this.activeEpisodeId = params.initialEpisodeId;
    this.onSelectStage = params.onSelectStage;
    this.onProjectionUpdate = params.onProjectionUpdate;

    params.episodes.forEach((ep) => this.episodeLookup.set(ep.id, ep));

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = createStudioRenderer(container, this.isSoftwareGl);
    this.pacer = createAfterDrawPacer(this.renderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0B050B');
    this.scene.fog = new THREE.FogExp2('#0B050B', 0.0105);
    this.envTex = attachStudioEnvironment(this.renderer, this.scene);

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.2, 160);
    this.camera.position.copy(this.desiredCamPos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.desiredLookAt);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 56;
    this.controls.minPolarAngle = Math.PI * 0.14;
    this.controls.maxPolarAngle = Math.PI * 0.46;

    this.controls.addEventListener('start', () => {
      this.isCamTransitioning = false;
    });

    this.controls.addEventListener('change', () => {
      this.emitProjection();
      this.requestRender();
    });

    this.setupLighting();

    this.selectionRing = new THREE.Group();
    const outerHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.58, 16),
      new THREE.MeshBasicMaterial({ color: '#FACC15', side: THREE.DoubleSide })
    );
    outerHalo.rotation.x = -Math.PI / 2;
    const innerHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.41, 16),
      new THREE.MeshBasicMaterial({ color: '#22D3EE', side: THREE.DoubleSide })
    );
    innerHalo.rotation.x = -Math.PI / 2;
    this.selectionRing.add(outerHalo, innerHalo);
    this.animatedSpinners.push(this.selectionRing);
    this.scene.add(this.selectionRing);

    this.scene.add(this.worldGroup);
    this.buildOverworld();
    this.buildMiniAvatar(params.avatarConfig);
    this.scene.add(this.avatarGroup);

    const startPos = this.stagePositions.get(this.activeEpisodeId);
    if (startPos) {
      const standPos = new THREE.Vector3(startPos.x, startPos.y + 0.135, startPos.z);
      this.avatarGroup.position.copy(standPos);
      this.avatarStartPos.copy(standPos);
      this.avatarTargetPos.copy(standPos);
      this.selectionRing.position.set(startPos.x, startPos.y + 0.04, startPos.z);
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindPointerEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.emitProjection();
    this.requestRender();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight('#FBCFE8', '#1F0A14', 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFF3D6', 2.05);
    keyLight.position.set(14, 28, 18);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 85;
    keyLight.shadow.camera.left = -36;
    keyLight.shadow.camera.right = 36;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    keyLight.shadow.bias = -0.0006;
    this.scene.add(keyLight);

    const rimWine = new THREE.DirectionalLight('#FB7185', 0.9);
    rimWine.position.set(-20, 12, -16);
    this.scene.add(rimWine);

    const cyanFill = new THREE.DirectionalLight('#22D3EE', 0.45);
    cyanFill.position.set(2, 8, -22);
    this.scene.add(cyanFill);
  }

  private buildOverworld(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Twilight Wine Pixel Ocean Floor
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(165, 120),
      new THREE.MeshStandardMaterial({
        map: createOceanPixelTexture(maxAniso),
        roughness: 0.72,
        metalness: 0.22,
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.06;
    ocean.receiveShadow = true;
    this.worldGroup.add(ocean);

    const trailClearancePoints: THREE.Vector2[] = [];
    const journeyWaypoints: PathWaypoint[] = [];
    const islandBridgeEndpoints: {
      exitGate: THREE.Vector3;
      exitPierHead: THREE.Vector3;
      entryGate: THREE.Vector3;
      entryPierHead: THREE.Vector3;
    }[] = [];

    const pierWoodMat = new THREE.MeshStandardMaterial({ color: '#78350F', roughness: 0.85 });
    const stairStoneMat = new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.72,
      metalness: 0.12,
      flatShading: true,
    });
    const lanternGlowMat = new THREE.MeshStandardMaterial({
      color: '#FDE047',
      emissive: '#FACC15',
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    const islandGateInfo = ISLAND_LAYOUTS.map((spec, idx) => {
      const curr = new THREE.Vector2(spec.center[0], spec.center[1]);
      const prevSpec = idx > 0 ? ISLAND_LAYOUTS[idx - 1] : null;
      const nextSpec = idx < ISLAND_LAYOUTS.length - 1 ? ISLAND_LAYOUTS[idx + 1] : null;

      const entryAngle = prevSpec
        ? Math.atan2(prevSpec.center[1] - curr.y, prevSpec.center[0] - curr.x)
        : Math.PI;

      const exitAngle = nextSpec
        ? Math.atan2(nextSpec.center[1] - curr.y, nextSpec.center[0] - curr.x)
        : Math.PI * 0.44;

      return { entryAngle, exitAngle };
    });

    // Build all 5 spacious Islands + Satellite Islets + Winding Trails
    ISLANDS.forEach((islandDef, islandIdx) => {
      const spec = ISLAND_LAYOUTS[islandIdx];
      const { entryAngle, exitAngle } = islandGateInfo[islandIdx];
      const islandGroup = new THREE.Group();
      islandGroup.position.set(spec.center[0], 0, spec.center[1]);

      // 1. Coastal water shelf, foam ring, sandy beach apron
      const waterShelf = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.radius * 1.22, spec.radius * 1.26, 0.04, 16),
        new THREE.MeshStandardMaterial({
          color: '#1E3A4C',
          emissive: '#0C2536',
          emissiveIntensity: 0.35,
          roughness: 0.35,
          metalness: 0.3,
          transparent: true,
          opacity: 0.75,
        })
      );
      waterShelf.position.y = -0.03;
      islandGroup.add(waterShelf);

      const foamRing = new THREE.Mesh(
        new THREE.RingGeometry(spec.radius * 1.11, spec.radius * 1.18, 20),
        new THREE.MeshBasicMaterial({
          color: '#67E8F9',
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
        })
      );
      foamRing.rotation.x = -Math.PI / 2;
      foamRing.position.y = 0.005;
      islandGroup.add(foamRing);

      const shoreBase = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.radius * 1.05, spec.radius * 1.12, 0.16, 14),
        new THREE.MeshStandardMaterial({
          color: spec.shoreColor,
          roughness: 0.88,
          metalness: 0.04,
          flatShading: true,
        })
      );
      shoreBase.position.y = 0.06;
      shoreBase.receiveShadow = true;
      islandGroup.add(shoreBase);

      // 2. Main Cliff + Rock Buttresses + Lower Deck
      const cliffMain = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.radius * 0.94, spec.radius * 1.02, 0.56, 14),
        new THREE.MeshStandardMaterial({
          color: spec.cliffColor,
          roughness: 0.78,
          metalness: 0.08,
          flatShading: true,
        })
      );
      cliffMain.position.y = 0.40;
      cliffMain.castShadow = true;
      cliffMain.receiveShadow = true;
      islandGroup.add(cliffMain);

      const buttressCount = 10;
      for (let b = 0; b < buttressCount; b++) {
        const ang = (b / buttressCount) * Math.PI * 2 + islandIdx * 0.45;
        const nearEntry = Math.abs(Math.atan2(Math.sin(ang - entryAngle), Math.cos(ang - entryAngle))) < 0.28;
        const nearExit = Math.abs(Math.atan2(Math.sin(ang - exitAngle), Math.cos(ang - exitAngle))) < 0.28;
        if (nearEntry || nearExit) continue;

        const bx = Math.cos(ang) * (spec.radius * 0.95);
        const bz = Math.sin(ang) * (spec.radius * 0.95);
        const bh = 0.42 + ((b * 17) % 10) * 0.025;
        const buttress = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, bh, 0.42),
          new THREE.MeshStandardMaterial({
            color: spec.cliffAccent,
            roughness: 0.85,
            flatShading: true,
          })
        );
        buttress.position.set(bx, bh / 2 + 0.06, bz);
        buttress.rotation.y = -ang;
        buttress.castShadow = true;
        islandGroup.add(buttress);
      }

      const lowerDeckMat =
        islandIdx === 2
          ? new THREE.MeshStandardMaterial({
              map: createBlueprintDeckTexture(maxAniso),
              roughness: 0.55,
              metalness: 0.15,
            })
          : new THREE.MeshStandardMaterial({
              color: spec.lowerTurfColor,
              roughness: 0.68,
              metalness: 0.06,
              flatShading: true,
            });

      const lowerDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.radius * 0.98, spec.radius * 0.95, 0.15, 14),
        lowerDeckMat
      );
      lowerDeck.position.y = 0.72;
      lowerDeck.receiveShadow = true;
      lowerDeck.castShadow = true;
      islandGroup.add(lowerDeck);

      // 3. Upper Raised Hill / Mesa Plateau
      const innerRadius = spec.radius * 0.50;
      const innerHeight = spec.maxElevation - 0.72;
      const upperCliff = new THREE.Mesh(
        new THREE.CylinderGeometry(innerRadius * 0.96, innerRadius * 1.07, innerHeight, 12),
        new THREE.MeshStandardMaterial({
          color: spec.cliffAccent,
          roughness: 0.82,
          metalness: 0.08,
          flatShading: true,
        })
      );
      upperCliff.position.y = 0.76 + innerHeight / 2;
      upperCliff.castShadow = true;
      upperCliff.receiveShadow = true;
      islandGroup.add(upperCliff);

      const upperDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(innerRadius * 1.02, innerRadius * 0.97, 0.14, 12),
        new THREE.MeshStandardMaterial({
          color: spec.upperTurfColor,
          roughness: 0.62,
          metalness: 0.08,
          flatShading: true,
        })
      );
      upperDeck.position.y = 0.76 + innerHeight + 0.05;
      upperDeck.receiveShadow = true;
      upperDeck.castShadow = true;
      islandGroup.add(upperDeck);

      const lowerSurfaceY = 0.795;
      const upperSurfaceY = 0.76 + innerHeight + 0.12;

      const toWorld = (ang: number, r: number, y: number): THREE.Vector3 =>
        new THREE.Vector3(
          spec.center[0] + Math.cos(ang) * r,
          y,
          spec.center[1] + Math.sin(ang) * r
        );

      const isEpDone = (id: string) => {
        const p = this.lessonsProgress[id];
        return Boolean(p?.videoConcluido && p?.quizConcluido);
      };

      const entryShorePoint = toWorld(entryAngle, spec.radius * 0.92, lowerSurfaceY);
      const exitShorePoint = toWorld(exitAngle, spec.radius * 0.92, lowerSurfaceY);

      const entryPierHead = this.buildShorePier(
        spec.center,
        entryAngle,
        spec.radius,
        lowerSurfaceY,
        pierWoodMat,
        lanternGlowMat,
        islandIdx === 0 ? '#FACC15' : '#22D3EE'
      );

      let exitPierHead: THREE.Vector3 | null = null;
      if (islandIdx < ISLAND_LAYOUTS.length - 1) {
        exitPierHead = this.buildShorePier(
          spec.center,
          exitAngle,
          spec.radius,
          lowerSurfaceY,
          pierWoodMat,
          lanternGlowMat,
          '#FACC15'
        );
        islandBridgeEndpoints.push({
          exitGate: exitShorePoint.clone(),
          exitPierHead: exitPierHead.clone(),
          entryGate: new THREE.Vector3(),
          entryPierHead: new THREE.Vector3(),
        });
      }

      if (islandIdx > 0) {
        const prevBridge = islandBridgeEndpoints[islandIdx - 1];
        prevBridge.entryGate.copy(entryShorePoint);
        prevBridge.entryPierHead.copy(entryPierHead);
      }

      // 4. Stage Placement + Meandering Trails + Satellite Islets + Stone Archways
      const epIds = islandDef.episodioIds;
      const count = epIds.length;

      if (count === 1) {
        // ILHA 0 (Base Camp): Welcoming Garden Walk -> Archway & Stairs -> Stage 1.0 Plaza -> Stairs -> East Pier
        const epId = epIds[0];
        const done = isEpDone(epId);

        const lowerWestSpot = toWorld(entryAngle + 0.35, spec.radius * 0.72, lowerSurfaceY);
        const upperStagePos = new THREE.Vector3(
          spec.center[0] + 0.08,
          upperSurfaceY,
          spec.center[1] + 0.95
        );
        const lowerEastSpot = toWorld(exitAngle - 0.18, spec.radius * 0.72, lowerSurfaceY);

        const ascentBase = toWorld(entryAngle + 0.55, innerRadius * 1.18, lowerSurfaceY);
        const ascentTop = toWorld(entryAngle + 0.65, innerRadius * 0.85, upperSurfaceY);
        this.buildAlignedStairway(ascentBase, ascentTop, stairStoneMat, 5);
        this.buildTrailArchway(ascentBase, ascentTop, islandDef.corAcento);

        const descentTop = toWorld(exitAngle - 0.22, innerRadius * 0.85, upperSurfaceY);
        const descentBase = toWorld(exitAngle - 0.10, innerRadius * 1.18, lowerSurfaceY);
        this.buildAlignedStairway(descentTop, descentBase, stairStoneMat, 5);

        this.addTrailLanternPost(lowerWestSpot.x - 0.45, lowerSurfaceY, lowerWestSpot.z + 0.45, lanternGlowMat);
        this.addTrailLanternPost(lowerEastSpot.x + 0.45, lowerSurfaceY, lowerEastSpot.z + 0.45, lanternGlowMat);

        this.createStageNode(epId, upperStagePos, done, islandDef.corAcento);
        this.stagePositions.set(epId, upperStagePos);

        journeyWaypoints.push(
          { pos: entryPierHead, kind: 'bridge', completedSoFar: done },
          { pos: entryShorePoint, kind: 'ground', completedSoFar: done },
          { pos: lowerWestSpot, kind: 'ground', completedSoFar: done },
          { pos: ascentBase, kind: 'stair', completedSoFar: done },
          { pos: ascentTop, kind: 'stair', completedSoFar: done },
          { pos: upperStagePos, kind: 'ground', completedSoFar: done, episodeId: epId },
          { pos: descentTop, kind: 'stair', completedSoFar: done },
          { pos: descentBase, kind: 'stair', completedSoFar: done },
          { pos: lowerEastSpot, kind: 'ground', completedSoFar: done },
          { pos: exitShorePoint, kind: 'ground', completedSoFar: done }
        );
        if (exitPierHead) {
          journeyWaypoints.push({ pos: exitPierHead, kind: 'bridge', completedSoFar: done });
        }

        [
          entryPierHead,
          entryShorePoint,
          lowerWestSpot,
          ascentBase,
          ascentTop,
          upperStagePos,
          descentTop,
          descentBase,
          lowerEastSpot,
          exitShorePoint,
        ].forEach((p) => trailClearancePoints.push(new THREE.Vector2(p.x, p.z)));
      } else {
        const totalSweep = computeSweepAngle(entryAngle, exitAngle, spec.sweepSign);

        journeyWaypoints.push(
          { pos: entryPierHead, kind: 'bridge', completedSoFar: isEpDone(epIds[0]) },
          { pos: entryShorePoint, kind: 'ground', completedSoFar: isEpDone(epIds[0]) }
        );
        trailClearancePoints.push(
          new THREE.Vector2(entryPierHead.x, entryPierHead.z),
          new THREE.Vector2(entryShorePoint.x, entryShorePoint.z)
        );

        let lastLowerAngle = entryAngle;
        let upperStartIndex = Math.ceil(count * 0.56);

        if (spec.hasSatelliteIslet) {
          // Split lower stages into: Pre-Islet Coast -> Satellite Islet (2 stages via 2 footbridges!) -> Post-Islet Coast -> Ascent Stairs -> Upper Terrace
          const isletCount = 2;
          const lowerTotal = Math.ceil(count * 0.60);
          upperStartIndex = lowerTotal;
          const preCount = Math.ceil((lowerTotal - isletCount) * 0.62);
          const postCount = lowerTotal - isletCount - preCount;

          // A. Pre-Islet Winding Coastal Trail
          const preEndFrac = spec.isletFrac - 0.07;
          for (let i = 0; i < preCount; i++) {
            const epId = epIds[i];
            const done = isEpDone(epId);
            const frac = THREE.MathUtils.lerp(0.07, preEndFrac, preCount === 1 ? 0.5 : i / (preCount - 1));
            const ang = entryAngle + totalSweep * frac;
            // Pronounced radial zig-zag weave so the path curves playfully across the coast
            const r = spec.radius * (i % 2 === 0 ? 0.68 : 0.87);
            const pos = toWorld(ang, r, lowerSurfaceY);

            this.createStageNode(epId, pos, done, islandDef.corAcento);
            this.stagePositions.set(epId, pos);
            journeyWaypoints.push({ pos, kind: 'ground', completedSoFar: done, episodeId: epId });
            trailClearancePoints.push(new THREE.Vector2(pos.x, pos.z));
          }

          // B. Satellite Mini-Islet & Double Footbridges!
          const isletAngle = entryAngle + totalSweep * spec.isletFrac;
          const isletDist = spec.radius + 2.95;
          const isletRadius = 1.85;
          const isletCenter = toWorld(isletAngle, isletDist, 0);

          this.buildSatelliteIslet(
            isletCenter,
            isletRadius,
            spec,
            lowerSurfaceY,
            islandIdx,
            islandDef.corAcento
          );

          const shoreOutAngle = isletAngle - 0.13 * spec.sweepSign;
          const shoreInAngle = isletAngle + 0.13 * spec.sweepSign;
          const shoreOutPt = toWorld(shoreOutAngle, spec.radius * 0.90, lowerSurfaceY);
          const shoreInPt = toWorld(shoreInAngle, spec.radius * 0.90, lowerSurfaceY);

          const dirOut = new THREE.Vector3().subVectors(isletCenter, shoreOutPt);
          dirOut.y = 0;
          dirOut.normalize();
          const isletArrivePt = new THREE.Vector3(
            isletCenter.x - dirOut.x * (isletRadius * 0.78),
            lowerSurfaceY,
            isletCenter.z - dirOut.z * (isletRadius * 0.78)
          );

          const dirIn = new THREE.Vector3().subVectors(shoreInPt, isletCenter);
          dirIn.y = 0;
          dirIn.normalize();
          const isletDepartPt = new THREE.Vector3(
            isletCenter.x + dirIn.x * (isletRadius * 0.78),
            lowerSurfaceY,
            isletCenter.z + dirIn.z * (isletRadius * 0.78)
          );

          this.buildFootbridge(shoreOutPt, isletArrivePt, pierWoodMat, lanternGlowMat);
          this.buildFootbridge(isletDepartPt, shoreInPt, pierWoodMat, lanternGlowMat);

          // Place the 2 Satellite Islet stages cleanly spaced across opposite flanks of the islet
          const tangentX = -Math.sin(isletAngle) * spec.sweepSign;
          const tangentZ = Math.cos(isletAngle) * spec.sweepSign;
          const isletEp1 = epIds[preCount];
          const isletEp2 = epIds[preCount + 1];
          const isletPos1 = new THREE.Vector3(
            isletCenter.x - tangentX * 0.88,
            lowerSurfaceY,
            isletCenter.z - tangentZ * 0.88
          );
          const isletPos2 = new THREE.Vector3(
            isletCenter.x + tangentX * 0.88,
            lowerSurfaceY,
            isletCenter.z + tangentZ * 0.88
          );

          const doneIslet1 = isEpDone(isletEp1);
          const doneIslet2 = isEpDone(isletEp2);
          this.createStageNode(isletEp1, isletPos1, doneIslet1, islandDef.corAcento);
          this.createStageNode(isletEp2, isletPos2, doneIslet2, islandDef.corAcento);
          this.stagePositions.set(isletEp1, isletPos1);
          this.stagePositions.set(isletEp2, isletPos2);

          journeyWaypoints.push(
            { pos: shoreOutPt, kind: 'footbridge', completedSoFar: isEpDone(epIds[preCount - 1]) },
            { pos: isletArrivePt, kind: 'footbridge', completedSoFar: isEpDone(epIds[preCount - 1]) },
            { pos: isletPos1, kind: 'ground', completedSoFar: doneIslet1, episodeId: isletEp1 },
            { pos: isletPos2, kind: 'ground', completedSoFar: doneIslet2, episodeId: isletEp2 },
            { pos: isletDepartPt, kind: 'footbridge', completedSoFar: doneIslet2 },
            { pos: shoreInPt, kind: 'footbridge', completedSoFar: doneIslet2 }
          );

          [shoreOutPt, isletArrivePt, isletPos1, isletPos2, isletDepartPt, shoreInPt].forEach((p) =>
            trailClearancePoints.push(new THREE.Vector2(p.x, p.z))
          );

          // C. Post-Islet Lower Coastal Trail
          const postStartFrac = spec.isletFrac + 0.07;
          const postEndFrac = 0.54;
          for (let k = 0; k < postCount; k++) {
            const epId = epIds[preCount + isletCount + k];
            const done = isEpDone(epId);
            const frac = THREE.MathUtils.lerp(
              postStartFrac,
              postEndFrac,
              postCount === 1 ? 0.5 : k / (postCount - 1)
            );
            const ang = entryAngle + totalSweep * frac;
            lastLowerAngle = ang;
            const r = spec.radius * (k % 2 === 0 ? 0.70 : 0.86);
            const pos = toWorld(ang, r, lowerSurfaceY);

            this.createStageNode(epId, pos, done, islandDef.corAcento);
            this.stagePositions.set(epId, pos);
            journeyWaypoints.push({ pos, kind: 'ground', completedSoFar: done, episodeId: epId });
            trailClearancePoints.push(new THREE.Vector2(pos.x, pos.z));
          }
          if (postCount === 0) {
            lastLowerAngle = shoreInAngle;
          }
        } else {
          // Non-islet island (Ilha 4 - Coordenação): Widely spaced lower bastion trail
          const lowerCount = upperStartIndex;
          for (let i = 0; i < lowerCount; i++) {
            const epId = epIds[i];
            const done = isEpDone(epId);
            const frac = THREE.MathUtils.lerp(0.14, 0.48, lowerCount === 1 ? 0.5 : i / (lowerCount - 1));
            const ang = entryAngle + totalSweep * frac;
            lastLowerAngle = ang;
            const r = spec.radius * (i % 2 === 0 ? 0.72 : 0.85);
            const pos = toWorld(ang, r, lowerSurfaceY);

            this.createStageNode(epId, pos, done, islandDef.corAcento);
            this.stagePositions.set(epId, pos);
            journeyWaypoints.push({ pos, kind: 'ground', completedSoFar: done, episodeId: epId });
            trailClearancePoints.push(new THREE.Vector2(pos.x, pos.z));
          }
        }

        // D. Grand Ascent Stairway + Trail Archway connecting Lower Tier -> Upper Terrace
        const firstUpperFrac = 0.61;
        const firstUpperAngle = entryAngle + totalSweep * firstUpperFrac;
        const ascentBaseAngle = THREE.MathUtils.lerp(lastLowerAngle, firstUpperAngle, 0.36);
        const ascentTopAngle = THREE.MathUtils.lerp(lastLowerAngle, firstUpperAngle, 0.68);
        const ascentBase = toWorld(ascentBaseAngle, innerRadius * 1.22, lowerSurfaceY);
        const ascentTop = toWorld(ascentTopAngle, innerRadius * 0.88, upperSurfaceY);
        this.buildAlignedStairway(ascentBase, ascentTop, stairStoneMat, 6);
        this.buildTrailArchway(ascentBase, ascentTop, islandDef.corAcento);

        const climbDone = isEpDone(epIds[upperStartIndex - 1]);
        journeyWaypoints.push(
          { pos: ascentBase, kind: 'stair', completedSoFar: climbDone },
          { pos: ascentTop, kind: 'stair', completedSoFar: climbDone }
        );
        trailClearancePoints.push(
          new THREE.Vector2(ascentBase.x, ascentBase.z),
          new THREE.Vector2(ascentTop.x, ascentTop.z)
        );

        // E. Upper Terrace Winding Stages (generously spaced around central landmark!)
        const upperCount = count - upperStartIndex;
        let lastUpperAngle = firstUpperAngle;
        const upperEndFrac = islandIdx === ISLANDS.length - 1 ? 0.94 : 0.92;
        for (let j = 0; j < upperCount; j++) {
          const epId = epIds[upperStartIndex + j];
          const done = isEpDone(epId);
          const frac = THREE.MathUtils.lerp(
            firstUpperFrac,
            upperEndFrac,
            upperCount === 1 ? 0.5 : j / (upperCount - 1)
          );
          const ang = entryAngle + totalSweep * frac;
          lastUpperAngle = ang;
          // Subtle inner/outer terrace weave while staying comfortably clear of central landmark
          const r = innerRadius * (j % 2 === 0 ? 0.72 : 0.90);
          const pos = toWorld(ang, r, upperSurfaceY);

          this.createStageNode(epId, pos, done, islandDef.corAcento);
          this.stagePositions.set(epId, pos);
          journeyWaypoints.push({ pos, kind: 'ground', completedSoFar: done, episodeId: epId });
          trailClearancePoints.push(new THREE.Vector2(pos.x, pos.z));
        }

        // F. Descent Stairway down to Departure Pier (Islands 1, 2, 3)
        if (exitPierHead) {
          const lastDone = isEpDone(epIds[count - 1]);
          const descentTopAngle = THREE.MathUtils.lerp(lastUpperAngle, entryAngle + totalSweep, 0.34);
          const descentBaseAngle = THREE.MathUtils.lerp(lastUpperAngle, entryAngle + totalSweep, 0.72);
          const descentTop = toWorld(descentTopAngle, innerRadius * 0.88, upperSurfaceY);
          const descentBase = toWorld(descentBaseAngle, innerRadius * 1.22, lowerSurfaceY);
          this.buildAlignedStairway(descentTop, descentBase, stairStoneMat, 6);

          journeyWaypoints.push(
            { pos: descentTop, kind: 'stair', completedSoFar: lastDone },
            { pos: descentBase, kind: 'stair', completedSoFar: lastDone },
            { pos: exitShorePoint, kind: 'ground', completedSoFar: lastDone },
            { pos: exitPierHead, kind: 'bridge', completedSoFar: lastDone }
          );
          trailClearancePoints.push(
            new THREE.Vector2(descentTop.x, descentTop.z),
            new THREE.Vector2(descentBase.x, descentBase.z),
            new THREE.Vector2(exitShorePoint.x, exitShorePoint.z),
            new THREE.Vector2(exitPierHead.x, exitPierHead.z)
          );
        }
      }

      // 5. Biome Landmarks + Clearance-checked Trees & Roadside Lanterns
      this.populateIslandDetails(
        islandGroup,
        islandIdx,
        spec,
        lowerSurfaceY,
        upperSurfaceY,
        islandDef.corAcento,
        maxAniso,
        trailClearancePoints
      );

      this.worldGroup.add(islandGroup);
    });

    // 6. Arched Sea Bridges between the 5 Islands
    islandBridgeEndpoints.forEach((bridge, idx) => {
      this.buildSeaBridge(
        bridge.exitPierHead,
        bridge.entryPierHead,
        pierWoodMat,
        stairStoneMat,
        idx
      );
    });

    // 7. Distant sea stacks & voxel clouds
    this.buildSeaPropsAndClouds(islandBridgeEndpoints);

    // 8. Smooth Catmull-Rom Curved Road Pavers + Instanced Dotted Path (Pontilhados)
    this.buildCurvedPathAndDots(journeyWaypoints);
  }

  private buildSatelliteIslet(
    center: THREE.Vector3,
    radius: number,
    parentSpec: IslandLayoutSpec,
    surfaceY: number,
    islandIdx: number,
    accentHex: string
  ): void {
    const grp = new THREE.Group();
    grp.position.set(center.x, 0, center.z);

    const waterShelf = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.28, radius * 1.32, 0.04, 10),
      new THREE.MeshStandardMaterial({
        color: '#1E3A4C',
        emissive: '#0C2536',
        emissiveIntensity: 0.35,
        roughness: 0.35,
        transparent: true,
        opacity: 0.75,
      })
    );
    waterShelf.position.y = -0.03;
    grp.add(waterShelf);

    const foamRing = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.13, radius * 1.22, 14),
      new THREE.MeshBasicMaterial({
        color: '#67E8F9',
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      })
    );
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.position.y = 0.005;
    grp.add(foamRing);

    const shore = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.06, radius * 1.14, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: parentSpec.shoreColor, roughness: 0.88, flatShading: true })
    );
    shore.position.y = 0.06;
    grp.add(shore);

    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.94, radius * 1.02, 0.56, 8),
      new THREE.MeshStandardMaterial({ color: parentSpec.cliffColor, roughness: 0.8, flatShading: true })
    );
    cliff.position.y = 0.40;
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    grp.add(cliff);

    const turf = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.98, radius * 0.95, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: parentSpec.upperTurfColor, roughness: 0.65, flatShading: true })
    );
    turf.position.y = 0.72;
    turf.receiveShadow = true;
    turf.castShadow = true;
    grp.add(turf);

    // Biome-specific mini-landmark in the center of the Satellite Islet
    const darkMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.55,
      roughness: 0.25,
    });
    const steelMat = new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.3, metalness: 0.75 });

    if (islandIdx === 1) {
      // Capacitor Bank Module
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 0.50), darkMat);
      base.position.y = surfaceY + 0.07;
      grp.add(base);
      for (const cx of [-0.18, 0, 0.18]) {
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), glowMat);
        cell.position.set(cx, surfaceY + 0.34, 0);
        grp.add(cell);
      }
    } else if (islandIdx === 2) {
      // BIM Family Floating Holo-Pylon
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.18, 6), darkMat);
      plinth.position.y = surfaceY + 0.09;
      grp.add(plinth);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), glowMat);
      gem.position.y = surfaceY + 0.65;
      this.animatedSpinners.push(gem);
      this.animatedFloaters.push({ obj: gem, baseY: surfaceY + 0.65, phase: 1.5 });
      grp.add(gem);
    } else {
      // Conduit Pipe-Rack Skid
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.55), darkMat);
      frame.position.y = surfaceY + 0.06;
      grp.add(frame);
      for (let p = -1; p <= 1; p++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 8), steelMat);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(0, surfaceY + 0.20, p * 0.16);
        grp.add(pipe);
      }
    }

    this.worldGroup.add(grp);
  }

  private buildFootbridge(
    start: THREE.Vector3,
    end: THREE.Vector3,
    woodMat: THREE.Material,
    lanternGlowMat: THREE.Material
  ): void {
    const span = start.distanceTo(end);
    const segments = Math.max(4, Math.floor(span / 0.48));
    const yaw = Math.atan2(end.x - start.x, end.z - start.z);
    const plankLen = span / segments;

    for (let i = 0; i < segments; i++) {
      const tm = (i + 0.5) / segments;
      const x = THREE.MathUtils.lerp(start.x, end.x, tm);
      const z = THREE.MathUtils.lerp(start.z, end.z, tm);
      const y = THREE.MathUtils.lerp(start.y, end.y, tm) + Math.sin(tm * Math.PI) * 0.12;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.08, plankLen * 0.88), woodMat);
      plank.position.set(x, y - 0.02, z);
      plank.rotation.y = yaw;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.worldGroup.add(plank);

      if (i === 0 || i === segments - 1) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.75, 6), woodMat);
        post.position.set(x + Math.cos(yaw) * 0.28, y - 0.12, z - Math.sin(yaw) * 0.28);
        this.worldGroup.add(post);

        if (i === 0) {
          const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.11), lanternGlowMat);
          lantern.position.set(x + Math.cos(yaw) * 0.28, y + 0.28, z - Math.sin(yaw) * 0.28);
          this.worldGroup.add(lantern);
        }
      }
    }
  }

  private buildTrailArchway(
    basePos: THREE.Vector3,
    topPos: THREE.Vector3,
    accentHex: string
  ): void {
    const mid = new THREE.Vector3().lerpVectors(basePos, topPos, 0.45);
    const yaw = Math.atan2(topPos.x - basePos.x, topPos.z - basePos.z);

    const arch = new THREE.Group();
    arch.position.copy(mid);
    arch.rotation.y = yaw;

    const stoneMat = new THREE.MeshStandardMaterial({ color: '#3B1728', roughness: 0.75 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.55,
      roughness: 0.25,
    });

    for (const sx of [-0.38, 0.38]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.14), stoneMat);
      pillar.position.set(sx, 0.39, 0);
      pillar.castShadow = true;
      arch.add(pillar);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.14, 0.18), stoneMat);
    lintel.position.set(0, 0.80, 0);
    lintel.castShadow = true;
    arch.add(lintel);

    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.20), glowMat);
    emblem.position.set(0, 0.80, 0);
    arch.add(emblem);

    this.worldGroup.add(arch);
  }

  private addTrailLanternPost(x: number, y: number, z: number, glowMat: THREE.Material): void {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.5 })
    );
    post.position.set(x, y + 0.21, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.11), glowMat);
    lamp.position.set(x, y + 0.45, z);
    this.worldGroup.add(post, lamp);
  }

  private buildShorePier(
    islandCenter: [number, number],
    angle: number,
    islandRadius: number,
    deckY: number,
    woodMat: THREE.Material,
    lanternGlowMat: THREE.Material,
    lanternColor: string
  ): THREE.Vector3 {
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const startR = islandRadius * 0.90;
    const endR = islandRadius + 1.0;
    const midR = (startR + endR) * 0.5;
    const pierLength = endR - startR;

    const pierGroup = new THREE.Group();
    pierGroup.position.set(
      islandCenter[0] + dirX * midR,
      deckY - 0.14,
      islandCenter[1] + dirZ * midR
    );
    pierGroup.rotation.y = -angle + Math.PI / 2;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.11, pierLength), woodMat);
    deck.position.y = -0.10;
    deck.rotation.x = 0.13;
    deck.castShadow = true;
    deck.receiveShadow = true;
    pierGroup.add(deck);

    for (const px of [-0.34, 0.34]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.85, 6), woodMat);
      post.position.set(px, -0.22, pierLength * 0.42);
      post.castShadow = true;
      pierGroup.add(post);
    }

    const lantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.16, 0.14),
      lanternColor === '#FACC15'
        ? lanternGlowMat
        : new THREE.MeshStandardMaterial({
            color: lanternColor,
            emissive: lanternColor,
            emissiveIntensity: 0.8,
            roughness: 0.25,
          })
    );
    lantern.position.set(0.34, 0.24, pierLength * 0.42);
    pierGroup.add(lantern);

    this.worldGroup.add(pierGroup);

    return new THREE.Vector3(
      islandCenter[0] + dirX * endR,
      0.46,
      islandCenter[1] + dirZ * endR
    );
  }

  private buildAlignedStairway(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    stoneMat: THREE.Material,
    steps: number
  ): void {
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    const yaw = Math.atan2(dx, dz);
    const totalLen = Math.hypot(dx, dz);
    const stepDepth = Math.max(0.24, totalLen / steps);

    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const px = THREE.MathUtils.lerp(startPos.x, endPos.x, t);
      const pz = THREE.MathUtils.lerp(startPos.z, endPos.z, t);
      const py = THREE.MathUtils.lerp(startPos.y, endPos.y, t);

      const step = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.16, stepDepth + 0.05),
        stoneMat
      );
      step.position.set(px, py - 0.06, pz);
      step.rotation.y = yaw;
      step.castShadow = true;
      step.receiveShadow = true;
      this.worldGroup.add(step);
    }
  }

  private buildSeaBridge(
    startPier: THREE.Vector3,
    endPier: THREE.Vector3,
    woodMat: THREE.Material,
    stoneMat: THREE.Material,
    bridgeIdx: number
  ): void {
    const span = startPier.distanceTo(endPier);
    const segments = Math.max(5, Math.floor(span / 0.68));
    const yaw = Math.atan2(endPier.x - startPier.x, endPier.z - startPier.z);
    const plankLen = span / segments;

    const railMat = new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.45 });

    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const tm = (t0 + t1) * 0.5;

      const x = THREE.MathUtils.lerp(startPier.x, endPier.x, tm);
      const z = THREE.MathUtils.lerp(startPier.z, endPier.z, tm);
      const archY = 0.46 + Math.sin(tm * Math.PI) * 0.34;

      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.10, plankLen * 0.92),
        i % 2 === 0 ? woodMat : stoneMat
      );
      plank.position.set(x, archY - 0.05, z);
      plank.rotation.y = yaw;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.worldGroup.add(plank);

      if (i % 2 === 1 && i < segments - 1) {
        const piling = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.22, archY + 0.15, 6),
          stoneMat
        );
        piling.position.set(x, (archY - 0.1) * 0.5, z);
        piling.castShadow = true;
        this.worldGroup.add(piling);
      }

      if (i === 1 || i === segments - 2 || (bridgeIdx % 2 === 0 && i === Math.floor(segments / 2))) {
        const perpX = Math.cos(yaw) * 0.36;
        const perpZ = -Math.sin(yaw) * 0.36;
        for (const side of [-1, 1]) {
          const bollard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), railMat);
          bollard.position.set(x + perpX * side, archY + 0.09, z + perpZ * side);
          this.worldGroup.add(bollard);
        }
      }
    }
  }

  private addVoxelTreeIfClear(
    parent: THREE.Group,
    islandCenter: [number, number],
    lx: number,
    y: number,
    lz: number,
    foliageHex: string,
    scale: number,
    clearancePts: THREE.Vector2[]
  ): void {
    const wx = islandCenter[0] + lx;
    const wz = islandCenter[1] + lz;
    for (const pt of clearancePts) {
      if (Math.hypot(wx - pt.x, wz - pt.y) < 1.25) {
        return;
      }
    }

    const tree = new THREE.Group();
    tree.position.set(lx, y, lz);
    tree.scale.setScalar(scale);

    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.45, 0.18),
      new THREE.MeshStandardMaterial({ color: '#5C3A21', roughness: 0.9 })
    );
    trunk.position.y = 0.225;
    trunk.castShadow = true;
    tree.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({
      color: foliageHex,
      roughness: 0.65,
      flatShading: true,
    });
    const tier1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.32, 0.56), leafMat);
    tier1.position.y = 0.54;
    tier1.castShadow = true;
    tree.add(tier1);

    const tier2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.38), leafMat);
    tier2.position.y = 0.78;
    tier2.castShadow = true;
    tree.add(tier2);

    parent.add(tree);
  }

  private populateIslandDetails(
    islandGroup: THREE.Group,
    islandIdx: number,
    spec: IslandLayoutSpec,
    lowY: number,
    highY: number,
    accentHex: string,
    maxAniso: number,
    clearancePts: THREE.Vector2[]
  ): void {
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.32,
      metalness: 0.78,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.45,
      metalness: 0.65,
    });
    const accentGlowMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.35,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#FACC15',
      emissive: '#CA8A04',
      emissiveIntensity: 0.3,
      roughness: 0.25,
      metalness: 0.7,
    });

    if (islandIdx === 0) {
      const woodMat = new THREE.MeshStandardMaterial({ color: '#78350F', roughness: 0.85 });

      const tentGroup = new THREE.Group();
      tentGroup.position.set(-0.45, highY, -0.48);
      const tentBody = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 0.82, 4),
        new THREE.MeshStandardMaterial({ color: '#E11D48', roughness: 0.7, flatShading: true })
      );
      tentBody.position.y = 0.41;
      tentBody.rotation.y = Math.PI / 4;
      tentBody.castShadow = true;
      tentGroup.add(tentBody);

      const tentStripe = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 0.52, 4),
        new THREE.MeshStandardMaterial({ color: '#FEF08A', roughness: 0.65, flatShading: true })
      );
      tentStripe.position.y = 0.58;
      tentStripe.rotation.y = Math.PI / 4;
      tentGroup.add(tentStripe);
      islandGroup.add(tentGroup);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.65, 8), steelMat);
      pole.position.set(0.50, highY + 0.82, -0.55);
      pole.castShadow = true;
      islandGroup.add(pole);

      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.05), goldMat);
      flag.position.set(0.82, highY + 1.42, -0.55);
      islandGroup.add(flag);

      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.32), woodMat);
      crate.position.set(0.65, highY + 0.14, -0.15);
      crate.castShadow = true;
      islandGroup.add(crate);

      this.addVoxelTreeIfClear(islandGroup, spec.center, -2.2, lowY, 1.5, '#10B981', 1.0, clearancePts);
      this.addVoxelTreeIfClear(islandGroup, spec.center, 1.8, lowY, 1.8, '#059669', 0.9, clearancePts);
      this.addVoxelTreeIfClear(islandGroup, spec.center, -1.8, lowY, -1.9, '#34D399', 0.95, clearancePts);
      this.addVoxelTreeIfClear(islandGroup, spec.center, 1.9, lowY, -1.8, '#10B981', 0.92, clearancePts);
    } else if (islandIdx === 1) {
      const substation = new THREE.Group();
      substation.position.set(0, highY, 0);

      const pad = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 1.4), darkMetalMat);
      pad.position.y = 0.07;
      substation.add(pad);

      const txBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.72, 0.65), steelMat);
      txBody.position.set(-0.36, 0.50, 0);
      txBody.castShadow = true;
      substation.add(txBody);

      for (let f = -2; f <= 2; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.56, 0.76), darkMetalMat);
        fin.position.set(-0.36 + f * 0.14, 0.48, 0);
        substation.add(fin);
      }

      for (const bx of [-0.54, -0.36, -0.18]) {
        const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.26, 8), accentGlowMat);
        bushing.position.set(bx, 0.96, 0);
        substation.add(bushing);
      }

      const pylon = new THREE.Group();
      pylon.position.set(0.55, 0.14, 0);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 1.75, 4), steelMat);
      mast.position.y = 0.88;
      mast.castShadow = true;
      pylon.add(mast);
      const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.09, 0.12), steelMat);
      crossArm.position.y = 1.48;
      pylon.add(crossArm);
      for (const ix of [-0.40, 0.40]) {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 8), goldMat);
        ins.position.set(ix, 1.36, 0);
        pylon.add(ins);
      }
      substation.add(pylon);
      islandGroup.add(substation);

      const treeSpots: [number, number, string][] = [
        [-4.5, 2.4, '#F59E0B'],
        [4.2, -2.5, '#D97706'],
        [0.4, 5.2, '#EA580C'],
        [-2.0, -5.2, '#F59E0B'],
        [4.8, 1.8, '#D97706'],
      ];
      treeSpots.forEach(([tx, tz, col]) =>
        this.addVoxelTreeIfClear(islandGroup, spec.center, tx, lowY, tz, col, 1.0, clearancePts)
      );
    } else if (islandIdx === 2) {
      const monument = new THREE.Group();
      monument.position.set(0, highY, 0);

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.24, 8), darkMetalMat);
      pedestal.position.y = 0.12;
      monument.add(pedestal);

      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), accentGlowMat);
      crystal.position.y = 1.22;
      crystal.castShadow = true;
      this.animatedSpinners.push(crystal);
      this.animatedFloaters.push({ obj: crystal, baseY: 1.22, phase: 0.8 });
      monument.add(crystal);

      const gyroRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.045, 8, 24), goldMat);
      gyroRing.position.y = 1.22;
      gyroRing.rotation.x = Math.PI * 0.35;
      this.animatedSpinners.push(gyroRing);
      monument.add(gyroRing);

      for (let m = 0; m < 3; m++) {
        const ang = (m / 3) * Math.PI * 2 + 0.4;
        const obelisk = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.94, 0.24), steelMat);
        obelisk.position.set(Math.cos(ang) * 1.10, 0.47, Math.sin(ang) * 1.10);
        obelisk.castShadow = true;
        monument.add(obelisk);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.28), accentGlowMat);
        cap.position.set(Math.cos(ang) * 1.10, 0.96, Math.sin(ang) * 1.10);
        monument.add(cap);
      }
      islandGroup.add(monument);

      const treeSpots: [number, number, string][] = [
        [-3.8, -2.8, '#38BDF8'],
        [3.7, 2.7, '#22D3EE'],
        [0.4, -4.4, '#0EA5E9'],
        [-4.2, 1.8, '#38BDF8'],
      ];
      treeSpots.forEach(([tx, tz, col]) =>
        this.addVoxelTreeIfClear(islandGroup, spec.center, tx, lowY, tz, col, 0.95, clearancePts)
      );
    } else if (islandIdx === 3) {
      const hazardMat = new THREE.MeshStandardMaterial({
        map: createHazardStripeTexture(maxAniso),
        roughness: 0.45,
        metalness: 0.35,
      });

      const yard = new THREE.Group();
      yard.position.set(0, highY, 0);

      for (const cx of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.52, 0.15), goldMat);
        leg.position.set(cx, 0.76, 0);
        leg.castShadow = true;
        yard.add(leg);
      }
      const girder = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.20, 0.25), hazardMat);
      girder.position.set(0, 1.58, 0);
      girder.castShadow = true;
      yard.add(girder);

      const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.30), darkMetalMat);
      trolley.position.set(0.20, 1.43, 0);
      yard.add(trolley);

      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.54, 6), steelMat);
      cable.position.set(0.20, 1.09, 0);
      yard.add(cable);

      const liftedConduit = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.80, 10), steelMat);
      liftedConduit.rotation.z = Math.PI / 2;
      liftedConduit.position.set(0.20, 0.80, 0);
      yard.add(liftedConduit);

      const roomBox = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.54, 0.68), darkMetalMat);
      roomBox.position.set(-0.40, 0.27, -0.50);
      roomBox.castShadow = true;
      yard.add(roomBox);

      const roomSign = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.04), accentGlowMat);
      roomSign.position.set(-0.40, 0.40, -0.15);
      yard.add(roomSign);

      islandGroup.add(yard);
      this.addVoxelTreeIfClear(islandGroup, spec.center, -3.4, lowY, 2.8, '#F59E0B', 0.95, clearancePts);
      this.addVoxelTreeIfClear(islandGroup, spec.center, 3.2, lowY, 2.5, '#D97706', 0.9, clearancePts);
    } else {
      const citadel = new THREE.Group();
      citadel.position.set(0, highY, 0);

      const keep = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.98, 1.15),
        new THREE.MeshStandardMaterial({ color: '#4C172D', roughness: 0.65, metalness: 0.2 })
      );
      keep.position.y = 0.49;
      keep.castShadow = true;
      citadel.add(keep);

      const gate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.08), goldMat);
      gate.position.set(0, 0.28, 0.58);
      citadel.add(gate);

      for (const tx of [-0.55, 0.55]) {
        for (const tz of [-0.55, 0.55]) {
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.32, 6), darkMetalMat);
          turret.position.set(tx, 0.66, tz);
          turret.castShadow = true;
          citadel.add(turret);

          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.28, 6), goldMat);
          roof.position.set(tx, 1.44, tz);
          citadel.add(roof);
        }
      }

      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), goldMat);
      beacon.position.y = 1.64;
      this.animatedSpinners.push(beacon);
      this.animatedFloaters.push({ obj: beacon, baseY: 1.64, phase: 2.1 });
      citadel.add(beacon);

      const summitHalo = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 8, 24), accentGlowMat);
      summitHalo.rotation.x = Math.PI / 2;
      summitHalo.position.y = 1.64;
      citadel.add(summitHalo);
      islandGroup.add(citadel);

      const cascadeMat = new THREE.MeshStandardMaterial({
        color: '#22D3EE',
        emissive: '#0891B2',
        emissiveIntensity: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.82,
      });
      const wfAngle = -Math.PI * 0.22;
      const cliffFall = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.96, 0.24), cascadeMat);
      cliffFall.position.set(
        Math.cos(wfAngle) * spec.radius * 0.98,
        0.46,
        Math.sin(wfAngle) * spec.radius * 0.98
      );
      cliffFall.rotation.y = -wfAngle + Math.PI / 2;
      islandGroup.add(cliffFall);

      const splashPool = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.06, 12), cascadeMat);
      splashPool.position.set(
        Math.cos(wfAngle) * spec.radius * 1.15,
        0.02,
        Math.sin(wfAngle) * spec.radius * 1.15
      );
      islandGroup.add(splashPool);
    }
  }

  private buildSeaPropsAndClouds(
    bridges: { exitPierHead: THREE.Vector3; entryPierHead: THREE.Vector3 }[]
  ): void {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#F8FAFC',
      emissive: '#3B0764',
      emissiveIntensity: 0.15,
      roughness: 0.85,
    });
    const cloudCoords: [number, number, number, number][] = [
      [-22, 5.2, -5.5, 1.2],
      [-10, 5.9, 6.8, 1.35],
      [3, 5.5, -6.2, 1.15],
      [14, 6.0, 6.8, 1.3],
      [25, 5.6, -4.8, 1.2],
    ];
    cloudCoords.forEach(([cx, cy, cz, s], idx) => {
      const cloud = new THREE.Group();
      cloud.position.set(cx, cy, cz);
      cloud.scale.setScalar(s);

      const main = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 0.95), cloudMat);
      const puffL = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.52, 0.75), cloudMat);
      puffL.position.set(-0.55, 0.24, 0.05);
      const puffR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.7), cloudMat);
      puffR.position.set(0.52, 0.18, -0.05);
      cloud.add(main, puffL, puffR);

      this.animatedFloaters.push({ obj: cloud, baseY: cy, phase: idx * 1.3 });
      this.worldGroup.add(cloud);
    });

    const rockMat = new THREE.MeshStandardMaterial({
      color: '#3F1123',
      roughness: 0.88,
      flatShading: true,
    });
    const stackCoords: [number, number, number][] = [
      [-16.5, -8.5, 0.85],
      [-2.8, 9.8, 0.9],
      [8.8, -9.8, 0.85],
      [19.5, 9.5, 0.95],
      [-25.5, 0.2, 0.9],
    ];
    stackCoords.forEach(([rx, rz, rs]) => {
      const p = new THREE.Vector3(rx, 0.46, rz);
      const nearBridge = bridges.some((b) => {
        const mid = new THREE.Vector3().addVectors(b.exitPierHead, b.entryPierHead).multiplyScalar(0.5);
        return p.distanceTo(mid) < 2.6;
      });
      if (nearBridge) return;

      const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * rs, 0.85 * rs, 0.95 * rs, 6), rockMat);
      rock.position.set(rx, 0.34 * rs, rz);
      rock.castShadow = true;
      this.worldGroup.add(rock);
    });
  }

  private createStageNode(
    episodeId: string,
    pos: THREE.Vector3,
    completed: boolean,
    islandAccent: string
  ): void {
    const padColor = completed ? '#10B981' : '#881337';
    const rimColor = completed ? '#FACC15' : '#FB7185';

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.44, 0.11, 8),
      new THREE.MeshStandardMaterial({
        color: '#2A0F1D',
        roughness: 0.65,
        metalness: 0.25,
        flatShading: true,
      })
    );
    plinth.position.set(pos.x, pos.y + 0.03, pos.z);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.worldGroup.add(plinth);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.35, 0.08, 8),
      new THREE.MeshStandardMaterial({
        color: rimColor,
        roughness: 0.32,
        metalness: 0.55,
        flatShading: true,
      })
    );
    rim.position.set(pos.x, pos.y + 0.08, pos.z);
    this.worldGroup.add(rim);

    const topTile = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8),
      new THREE.MeshStandardMaterial({
        color: padColor,
        emissive: completed ? '#059669' : '#4C0519',
        emissiveIntensity: completed ? 0.5 : 0.28,
        roughness: 0.25,
        metalness: 0.3,
      })
    );
    topTile.position.set(pos.x, pos.y + 0.11, pos.z);
    this.worldGroup.add(topTile);

    const miniCrest = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshStandardMaterial({
        color: completed ? '#FACC15' : islandAccent,
        emissive: completed ? '#CA8A04' : '#000000',
        emissiveIntensity: completed ? 0.4 : 0,
        roughness: 0.28,
        metalness: 0.35,
      })
    );
    miniCrest.position.set(pos.x + 0.25, pos.y + 0.20, pos.z - 0.19);
    this.worldGroup.add(miniCrest);

    if (completed) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        new THREE.MeshStandardMaterial({
          color: '#FACC15',
          emissive: '#EAB308',
          emissiveIntensity: 0.6,
          roughness: 0.2,
          metalness: 0.75,
        })
      );
      star.position.set(pos.x - 0.23, pos.y + 0.44, pos.z - 0.18);
      this.animatedSpinners.push(star);
      this.worldGroup.add(star);
    }

    const pickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.50, 0.50, 0.58, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickMesh.position.set(pos.x, pos.y + 0.25, pos.z);
    pickMesh.userData.episodeId = episodeId;
    this.worldGroup.add(pickMesh);
    this.stagePickables.push(pickMesh);
  }

  private buildCurvedPathAndDots(waypoints: PathWaypoint[]): void {
    const dotSamples: { pos: THREE.Vector3; yaw: number; active: boolean }[] = [];
    const paverSamples: { pos: THREE.Vector3; yaw: number }[] = [];

    // Group consecutive ground segments into smooth CatmullRomCurves for organic meandering roads
    let idx = 0;
    while (idx < waypoints.length - 1) {
      const curr = waypoints[idx];
      const next = waypoints[idx + 1];

      const isBridge = curr.kind === 'bridge' && next.kind === 'bridge';
      const isFootbridge = curr.kind === 'footbridge' && next.kind === 'footbridge';
      const isStair = curr.kind === 'stair' && next.kind === 'stair';
      const touchesWaterCrossing =
        curr.kind === 'bridge' ||
        next.kind === 'bridge' ||
        curr.kind === 'footbridge' ||
        next.kind === 'footbridge';

      if (curr.kind === 'ground' && next.kind === 'ground' && !touchesWaterCrossing) {
        // Collect contiguous same-height ground run
        const runEndIdx = (() => {
          let k = idx + 1;
          while (
            k + 1 < waypoints.length &&
            waypoints[k].kind === 'ground' &&
            waypoints[k + 1].kind === 'ground' &&
            Math.abs(waypoints[k + 1].pos.y - curr.pos.y) < 0.08
          ) {
            k++;
          }
          return k;
        })();

        const runPoints = waypoints.slice(idx, runEndIdx + 1).map((w) => w.pos);
        // If only 2 points, inject a gentle mid-curve lateral offset so even short paths curve naturally
        let curve: THREE.CatmullRomCurve3;
        if (runPoints.length === 2) {
          const mid = new THREE.Vector3().lerpVectors(runPoints[0], runPoints[1], 0.5);
          const d = new THREE.Vector3().subVectors(runPoints[1], runPoints[0]);
          const len = d.length();
          if (len > 0.8) {
            const perp = new THREE.Vector3(-d.z, 0, d.x).normalize();
            mid.addScaledVector(perp, Math.min(0.32, len * 0.14));
          }
          curve = new THREE.CatmullRomCurve3([runPoints[0], mid, runPoints[1]]);
        } else {
          curve = new THREE.CatmullRomCurve3(runPoints, false, 'catmullrom', 0.45);
        }

        const totalLen = curve.getLength();
        const sampleCount = Math.max(4, Math.floor(totalLen / 0.42));
        for (let s = 1; s < sampleCount; s++) {
          const u = s / sampleCount;
          const pt = curve.getPointAt(u);
          const tan = curve.getTangentAt(u);
          const yaw = Math.atan2(tan.x, tan.z);

          // Skip dots/pavers directly inside any stage pedestal in this run
          let insideStage = false;
          for (let r = idx; r <= runEndIdx; r++) {
            if (waypoints[r].episodeId && pt.distanceTo(waypoints[r].pos) < 0.48) {
              insideStage = true;
              break;
            }
          }
          if (insideStage) continue;

          // Determine completion status from nearest preceding waypoint
          const approxSegIdx = Math.min(runEndIdx - 1, idx + Math.floor(u * (runEndIdx - idx)));
          const active = waypoints[approxSegIdx].completedSoFar;

          paverSamples.push({
            pos: new THREE.Vector3(pt.x, pt.y + 0.015, pt.z),
            yaw,
          });
          dotSamples.push({
            pos: new THREE.Vector3(pt.x, pt.y + 0.068, pt.z),
            yaw: yaw + Math.PI / 4,
            active,
          });
        }

        idx = runEndIdx;
        continue;
      }

      // Linear / arched segment (bridges, footbridges, stairs, pier slopes)
      const dist = curr.pos.distanceTo(next.pos);
      if (dist >= 0.08) {
        const yaw = Math.atan2(next.pos.x - curr.pos.x, next.pos.z - curr.pos.z);
        const stepSpacing = isBridge ? 0.56 : isFootbridge ? 0.44 : 0.38;
        const numSamples = Math.max(2, Math.floor(dist / stepSpacing));

        for (let s = 1; s < numSamples; s++) {
          const t = s / numSamples;
          const px = THREE.MathUtils.lerp(curr.pos.x, next.pos.x, t);
          const pz = THREE.MathUtils.lerp(curr.pos.z, next.pos.z, t);
          let py = THREE.MathUtils.lerp(curr.pos.y, next.pos.y, t);

          if (isBridge) {
            py = 0.46 + Math.sin(t * Math.PI) * 0.34;
          } else if (isFootbridge) {
            py += Math.sin(t * Math.PI) * 0.12;
          }

          if (curr.episodeId && t * dist < 0.46) continue;
          if (next.episodeId && (1 - t) * dist < 0.46) continue;

          if (!touchesWaterCrossing && !isStair) {
            paverSamples.push({
              pos: new THREE.Vector3(px, py + 0.015, pz),
              yaw,
            });
          }

          dotSamples.push({
            pos: new THREE.Vector3(px, py + (isStair ? 0.08 : 0.068), pz),
            yaw: yaw + Math.PI / 4,
            active: curr.completedSoFar,
          });
        }
      }

      idx++;
    }

    const dummy = new THREE.Object3D();

    if (paverSamples.length > 0) {
      const paverGeom = new THREE.BoxGeometry(0.32, 0.032, 0.24);
      const paverMat = new THREE.MeshStandardMaterial({
        color: '#2A101E',
        roughness: 0.85,
        metalness: 0.08,
      });
      const pavers = new THREE.InstancedMesh(paverGeom, paverMat, paverSamples.length);
      paverSamples.forEach((pv, pIdx) => {
        dummy.position.copy(pv.pos);
        dummy.rotation.set(0, pv.yaw, 0);
        dummy.updateMatrix();
        pavers.setMatrixAt(pIdx, dummy.matrix);
      });
      pavers.instanceMatrix.needsUpdate = true;
      pavers.receiveShadow = true;
      this.worldGroup.add(pavers);
    }

    if (dotSamples.length > 0) {
      const dotGeom = new THREE.BoxGeometry(0.145, 0.08, 0.145);
      const dotMat = new THREE.MeshStandardMaterial({
        color: '#FFFFFF',
        roughness: 0.26,
        metalness: 0.3,
      });
      const instancedDots = new THREE.InstancedMesh(dotGeom, dotMat, dotSamples.length);
      const goldColor = new THREE.Color('#FACC15');
      const wineDotColor = new THREE.Color('#FB7185');

      dotSamples.forEach((dot, dIdx) => {
        dummy.position.copy(dot.pos);
        dummy.rotation.set(0, dot.yaw, 0);
        dummy.updateMatrix();
        instancedDots.setMatrixAt(dIdx, dummy.matrix);
        instancedDots.setColorAt(dIdx, dot.active ? goldColor : wineDotColor);
      });

      instancedDots.instanceMatrix.needsUpdate = true;
      if (instancedDots.instanceColor) {
        instancedDots.instanceColor.needsUpdate = true;
      }
      instancedDots.computeBoundingSphere();
      this.worldGroup.add(instancedDots);
    }
  }

  private buildMiniAvatar(cfg: AvatarConfig): void {
    this.avatarHelmetMat = new THREE.MeshStandardMaterial({
      color: cfg.helmetColor,
      roughness: 0.26,
      metalness: 0.15,
    });
    this.avatarSkinMat = new THREE.MeshStandardMaterial({
      color: cfg.skinColor,
      roughness: 0.55,
    });
    this.avatarVestMat = new THREE.MeshStandardMaterial({
      color: cfg.vestColor,
      roughness: 0.6,
    });
    this.avatarGlassesMat = new THREE.MeshStandardMaterial({
      color: '#22D3EE',
      roughness: 0.15,
      metalness: 0.3,
      transparent: true,
      opacity: 0.78,
    });

    const scale = 0.85;
    const body = new THREE.Group();
    body.scale.setScalar(scale);

    const pantsMat = new THREE.MeshStandardMaterial({ color: '#1E1B2E', roughness: 0.7 });
    for (const lx of [-0.11, 0.11]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), pantsMat);
      leg.position.set(lx, 0.18, 0);
      leg.castShadow = true;
      body.add(leg);
    }

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.24), this.avatarVestMat);
    torso.position.set(0, 0.56, 0);
    torso.castShadow = true;
    body.add(torso);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.06, 0.255),
      new THREE.MeshStandardMaterial({ color: '#F1F5F9', roughness: 0.2, metalness: 0.8 })
    );
    stripe.position.set(0, 0.48, 0);
    body.add(stripe);

    for (const ax of [-0.30, 0.30]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.14), this.avatarSkinMat);
      arm.position.set(ax, 0.56, 0);
      arm.castShadow = true;
      body.add(arm);
    }

    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.28, 16), this.avatarSkinMat);
    head.position.set(0, 0.93, 0);
    head.castShadow = true;
    body.add(head);

    this.avatarGlassesMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, 0.08),
      this.avatarGlassesMat
    );
    this.avatarGlassesMesh.position.set(0, 0.94, 0.17);
    body.add(this.avatarGlassesMesh);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.avatarHelmetMat
    );
    helmet.position.set(0, 1.02, 0);
    helmet.castShadow = true;
    body.add(helmet);

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.25, 0.03, 16, 1, false, -Math.PI * 0.4, Math.PI * 0.8),
      this.avatarHelmetMat
    );
    brim.position.set(0, 1.02, 0.06);
    body.add(brim);

    this.avatarGroup.add(body);
    this.updateAvatarConfig(cfg);
  }

  public updateAvatarConfig(cfg: AvatarConfig): void {
    if (this.disposed) return;
    this.avatarHelmetMat.color.set(cfg.helmetColor);
    this.avatarSkinMat.color.set(cfg.skinColor);
    this.avatarVestMat.color.set(cfg.vestColor);

    this.avatarGlassesMesh.visible = cfg.glassesStyle !== 'none';
    if (cfg.glassesStyle === 'amber') this.avatarGlassesMat.color.set('#F59E0B');
    else if (cfg.glassesStyle === 'tinted') this.avatarGlassesMat.color.set('#0F172A');
    else if (cfg.glassesStyle === 'clear') this.avatarGlassesMat.color.set('#BAE6FD');
    else this.avatarGlassesMat.color.set('#22D3EE');

    this.requestRender();
  }

  public focusIsland(islandId: string): void {
    if (islandId === 'all') {
      this.desiredCamPos.set(1.5, 22.8, 32.5);
      this.desiredLookAt.set(1.5, 1.0, 0.4);
      this.isCamTransitioning = true;
      this.lastTimestamp = performance.now();
      this.requestRender();
      return;
    }

    const spec = ISLAND_LAYOUTS.find((l) => l.id === islandId);
    if (!spec) return;
    const zoomScale = spec.radius / 4.8;
    this.desiredLookAt.set(spec.center[0], 1.1, spec.center[1]);
    this.desiredCamPos.set(
      spec.center[0] + 1.8 * zoomScale,
      8.2 + 2.4 * zoomScale,
      spec.center[1] + 9.4 * zoomScale
    );
    this.isCamTransitioning = true;
    this.lastTimestamp = performance.now();
    this.requestRender();
  }

  public moveAvatarToStage(episodeId: string, focusCam = true): void {
    const target = this.stagePositions.get(episodeId);
    if (!target) return;

    const standTarget = new THREE.Vector3(target.x, target.y + 0.135, target.z);
    this.activeEpisodeId = episodeId;
    this.avatarStartPos.copy(this.avatarGroup.position);
    this.avatarTargetPos.copy(standTarget);
    this.avatarHopProgress = 0;
    this.selectionRing.position.set(target.x, target.y + 0.04, target.z);

    const dx = standTarget.x - this.avatarStartPos.x;
    const dz = standTarget.z - this.avatarStartPos.z;
    if (Math.hypot(dx, dz) > 0.05) {
      this.avatarGroup.rotation.y = Math.atan2(dx, dz);
    }

    if (focusCam) {
      this.desiredLookAt.set(target.x, target.y + 0.65, target.z);
      this.desiredCamPos.set(target.x + 2.4, target.y + 6.8, target.z + 8.6);
      this.isCamTransitioning = true;
    }

    this.lastTimestamp = performance.now();
    this.emitProjection();
    this.requestRender();
  }

  private emitProjection(): void {
    if (!this.onProjectionUpdate) return;
    const epId = this.hoveredEpisodeId ?? this.activeEpisodeId;
    const ep = this.episodeLookup.get(epId);
    const pos = this.stagePositions.get(epId);
    if (!ep || !pos) return;

    _vec3.set(pos.x, pos.y + (epId === this.activeEpisodeId ? 1.55 : 0.72), pos.z);
    _vec3.project(this.camera);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const visible = _vec3.z < 1 && _vec3.z > -1;
    const x = ((_vec3.x + 1) / 2) * width;
    const y = ((-_vec3.y + 1) / 2) * height;

    const prog = this.lessonsProgress[epId];
    const completed = Boolean(prog?.videoConcluido && prog?.quizConcluido);

    this.onProjectionUpdate({
      visible,
      x: Math.max(95, Math.min(width - 95, x)),
      y: Math.max(40, Math.min(height - 50, y)),
      episodeId: epId,
      titulo: ep.titulo,
      ilhaNome: ep.ilhaNome,
      completed,
    });
  }

  private bindPointerEvents(): void {
    const dom = this.renderer.domElement;
    let lastMoveCheck = 0;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownPos.set(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMoveCheck < 50) return;
      lastMoveCheck = now;

      const rect = dom.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.stagePickables, false);
      const hitId = hits.length > 0 ? String(hits[0].object.userData.episodeId) : null;

      if (hitId !== this.hoveredEpisodeId) {
        this.hoveredEpisodeId = hitId;
        dom.style.cursor = hitId ? 'pointer' : 'grab';
        this.emitProjection();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );
      if (dist > 6) return;

      const rect = dom.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.stagePickables, false);
      if (hits.length > 0) {
        const clickedId = String(hits[0].object.userData.episodeId);
        const alreadyActive = clickedId === this.activeEpisodeId;
        this.moveAvatarToStage(clickedId, true);
        this.onSelectStage?.(clickedId, alreadyActive);
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);

    this.cleanupPointer = () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
    };
  }

  private cleanupPointer: () => void = () => {};

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.emitProjection();
    this.requestRender();
  }

  private requestRender(): void {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame((now) => {
      if (this.disposed) return;
      this.renderDirty = false;

      const dt = this.lastTimestamp
        ? Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000))
        : 0.016;
      this.lastTimestamp = now;

      let stillAnimating = false;

      if (this.avatarHopProgress < 1) {
        this.avatarHopProgress = Math.min(1, this.avatarHopProgress + dt * 2.2);
        const t = this.avatarHopProgress;
        this.avatarGroup.position.lerpVectors(this.avatarStartPos, this.avatarTargetPos, t);
        this.avatarGroup.position.y += Math.sin(t * Math.PI) * 1.05;
        stillAnimating = true;
        this.emitProjection();
      }

      if (this.isCamTransitioning) {
        const lambda = 5.5;
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.desiredCamPos.x, lambda, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.desiredCamPos.y, lambda, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.desiredCamPos.z, lambda, dt);

        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.desiredLookAt.x, lambda, dt);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.desiredLookAt.y, lambda, dt);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.desiredLookAt.z, lambda, dt);

        if (
          this.camera.position.distanceTo(this.desiredCamPos) < 0.04 &&
          this.controls.target.distanceTo(this.desiredLookAt) < 0.04
        ) {
          this.camera.position.copy(this.desiredCamPos);
          this.controls.target.copy(this.desiredLookAt);
          this.isCamTransitioning = false;
        } else {
          stillAnimating = true;
        }
        this.emitProjection();
      }

      if (!this.isSoftwareGl) {
        const sec = now * 0.001;
        for (const s of this.animatedSpinners) {
          s.rotation.y += dt * 0.85;
        }
        for (const f of this.animatedFloaters) {
          f.obj.position.y = f.baseY + Math.sin(sec * 1.4 + f.phase) * 0.12;
        }
      }

      const dampingMore = this.controls.update();
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (
          !this.disposed &&
          (this.renderDirty || stillAnimating || dampingMore || !this.isSoftwareGl)
        ) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this.pacer.afterDraw(done);
      } else {
        done();
      }
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.pacer.cancel();
    this.cleanupPointer();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    disposeObjectHierarchy(this.scene);
    this.envTex.dispose();
    this.renderer.dispose();
  }
}
