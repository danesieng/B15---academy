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
  baseColor: string;
  topColor: string;
  cliffColor: string;
  maxElevation: number;
}

const ISLAND_LAYOUTS: IslandLayoutSpec[] = [
  {
    id: 'ilha-0',
    center: [-14.5, 3.2],
    radius: 2.8,
    baseColor: '#2B101D',
    topColor: '#3B7A57',
    cliffColor: '#521B32',
    maxElevation: 0.75,
  },
  {
    id: 'ilha-1',
    center: [-6.5, -2.4],
    radius: 4.8,
    baseColor: '#2D101E',
    topColor: '#92400E',
    cliffColor: '#581C34',
    maxElevation: 1.35,
  },
  {
    id: 'ilha-2',
    center: [2.2, 3.4],
    radius: 4.2,
    baseColor: '#231024',
    topColor: '#1E4E68',
    cliffColor: '#4C172D',
    maxElevation: 1.25,
  },
  {
    id: 'ilha-3',
    center: [10.4, -2.1],
    radius: 4.0,
    baseColor: '#2B0E1A',
    topColor: '#7C2D12',
    cliffColor: '#6B1835',
    maxElevation: 1.45,
  },
  {
    id: 'ilha-4',
    center: [17.2, 2.2],
    radius: 3.3,
    baseColor: '#2A0B18',
    topColor: '#881337',
    cliffColor: '#4A0E24',
    maxElevation: 1.75,
  },
];

const _vec3 = new THREE.Vector3();

function createOceanPixelTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0D060D';
  ctx.fillRect(0, 0, 512, 512);

  // HI-bit retro grid + subtle wave pixels
  ctx.strokeStyle = 'rgba(159, 18, 57, 0.22)';
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

  ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
  for (let y = 16; y < 512; y += 64) {
    for (let x = 8; x < 512; x += 64) {
      ctx.fillRect(x, y, 12, 4);
      ctx.fillRect(x + 28, y + 32, 8, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
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
  private stagePadMeshes = new Map<string, THREE.Mesh>();
  private selectionRing: THREE.Mesh;

  // Avatar miniature on the map
  private avatarGroup = new THREE.Group();
  private avatarHelmetMat!: THREE.MeshStandardMaterial;
  private avatarSkinMat!: THREE.MeshStandardMaterial;
  private avatarVestMat!: THREE.MeshStandardMaterial;
  private avatarGlassesMesh!: THREE.Mesh;
  private avatarGlassesMat!: THREE.MeshStandardMaterial;

  // Avatar hop animation
  private avatarStartPos = new THREE.Vector3();
  private avatarTargetPos = new THREE.Vector3();
  private avatarHopProgress = 1;

  // Camera transition
  private isCamTransitioning = false;
  private desiredCamPos = new THREE.Vector3(0, 16.5, 22.5);
  private desiredLookAt = new THREE.Vector3(1.2, 0.8, 0.4);
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
    this.scene.background = new THREE.Color('#0B060B');
    this.scene.fog = new THREE.FogExp2('#0B060B', 0.017);
    this.envTex = attachStudioEnvironment(this.renderer, this.scene);

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.2, 120);
    this.camera.position.copy(this.desiredCamPos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.desiredLookAt);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 36;
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

    // Selection ring around active stage
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.54, 16),
      new THREE.MeshBasicMaterial({
        color: '#FACC15',
        side: THREE.DoubleSide,
      })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.selectionRing);

    this.scene.add(this.worldGroup);
    this.buildOverworld(params.episodes);
    this.buildMiniAvatar(params.avatarConfig);
    this.scene.add(this.avatarGroup);

    // Position avatar on initial active stage
    const startPos = this.stagePositions.get(this.activeEpisodeId);
    if (startPos) {
      this.avatarGroup.position.copy(startPos);
      this.avatarStartPos.copy(startPos);
      this.avatarTargetPos.copy(startPos);
      this.selectionRing.position.set(startPos.x, startPos.y + 0.03, startPos.z);
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
    const hemi = new THREE.HemisphereLight('#FBCFE8', '#1F0A14', 0.8);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFF3D6', 2.0);
    keyLight.position.set(10, 20, 14);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 55;
    keyLight.shadow.camera.left = -24;
    keyLight.shadow.camera.right = 24;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    keyLight.shadow.bias = -0.0006;
    this.scene.add(keyLight);

    const rimWine = new THREE.DirectionalLight('#FB7185', 0.85);
    rimWine.position.set(-14, 8, -12);
    this.scene.add(rimWine);
  }

  private buildOverworld(episodes: EpisodeData[]): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Twilight Wine Pixel Ocean Floor
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 80),
      new THREE.MeshStandardMaterial({
        map: createOceanPixelTexture(maxAniso),
        roughness: 0.72,
        metalness: 0.22,
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.05;
    ocean.receiveShadow = true;
    this.worldGroup.add(ocean);

    const orderedStagePoints: { id: string; pos: THREE.Vector3; completed: boolean }[] = [];

    // Build 5 Mario World 2 HI-bit Islands
    ISLANDS.forEach((islandDef, islandIdx) => {
      const spec = ISLAND_LAYOUTS[islandIdx];
      const islandGroup = new THREE.Group();
      islandGroup.position.set(spec.center[0], 0, spec.center[1]);

      // Tier 1 Base (Stepped Octagonal HI-bit Island Cliff)
      const baseMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.radius, spec.radius * 1.12, 0.55, 8),
        new THREE.MeshStandardMaterial({
          color: spec.cliffColor,
          roughness: 0.75,
          metalness: 0.08,
          flatShading: true,
        })
      );
      baseMesh.position.y = 0.25;
      baseMesh.receiveShadow = true;
      baseMesh.castShadow = true;
      islandGroup.add(baseMesh);

      // Tier 1 Top Deck
      const topDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.radius * 0.96, spec.radius * 0.98, 0.14, 8),
        new THREE.MeshStandardMaterial({
          color: spec.topColor,
          roughness: 0.62,
          metalness: 0.06,
          flatShading: true,
        })
      );
      topDeck.position.y = 0.56;
      topDeck.receiveShadow = true;
      islandGroup.add(topDeck);

      // Tier 2 Raised Hill / Plateau inside island
      const innerRadius = spec.radius * 0.56;
      const innerHeight = spec.maxElevation - 0.55;
      const upperCliff = new THREE.Mesh(
        new THREE.CylinderGeometry(innerRadius, innerRadius * 1.1, innerHeight, 8),
        new THREE.MeshStandardMaterial({
          color: spec.baseColor,
          roughness: 0.78,
          metalness: 0.1,
          flatShading: true,
        })
      );
      upperCliff.position.y = 0.58 + innerHeight / 2;
      upperCliff.castShadow = true;
      upperCliff.receiveShadow = true;
      islandGroup.add(upperCliff);

      const upperDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(innerRadius * 0.94, innerRadius * 0.98, 0.12, 8),
        new THREE.MeshStandardMaterial({
          color: spec.topColor,
          roughness: 0.58,
          metalness: 0.08,
          flatShading: true,
        })
      );
      upperDeck.position.y = 0.58 + innerHeight + 0.05;
      upperDeck.receiveShadow = true;
      islandGroup.add(upperDeck);

      // Decorative HI-bit landmark prop on summit of each island
      this.addIslandLandmark(islandGroup, islandIdx, 0.58 + innerHeight + 0.11, islandDef.corAcento);

      this.worldGroup.add(islandGroup);

      // Distribute stages along a terraced Mario World 2 path on this island
      const count = islandDef.episodioIds.length;
      islandDef.episodioIds.forEach((epId, stageIdx) => {
        const t = count === 1 ? 0.5 : stageIdx / (count - 1);
        const angle = -Math.PI * 0.85 + t * Math.PI * 1.7;
        const r = count === 1 ? 0.85 : THREE.MathUtils.lerp(spec.radius * 0.78, innerRadius * 0.68, t);
        const lx = Math.cos(angle) * r;
        const lz = Math.sin(angle) * r;

        // Determine terrace height (outer tier vs upper tier)
        const onUpperTier = count > 1 && r <= innerRadius * 0.98;
        const worldY = onUpperTier ? 0.58 + innerHeight + 0.12 : 0.63;
        const worldPos = new THREE.Vector3(spec.center[0] + lx, worldY, spec.center[1] + lz);

        const prog = this.lessonsProgress[epId];
        const isCompleted = Boolean(prog?.videoConcluido && prog?.quizConcluido);

        this.createStageNode(epId, worldPos, isCompleted, islandDef.corAcento);
        this.stagePositions.set(epId, worldPos);
        orderedStagePoints.push({ id: epId, pos: worldPos, completed: isCompleted });
      });
    });

    // Build Mario World 2 Dotted Paths (Pontilhados) connecting every stage sequentially
    this.buildDottedPaths(orderedStagePoints);
  }

  private addIslandLandmark(
    group: THREE.Group,
    islandIdx: number,
    baseY: number,
    accentHex: string
  ): void {
    const landmark = new THREE.Group();
    landmark.position.set(0, baseY, 0);

    const postMat = new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      roughness: 0.35,
      metalness: 0.7,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.4,
    });

    if (islandIdx === 0) {
      // Base Camp Flagpole + Voxel Tent
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), postMat);
      pole.position.set(-0.4, 0.65, -0.3);
      landmark.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.06), accentMat);
      flag.position.set(-0.1, 1.1, -0.3);
      landmark.add(flag);
    } else if (islandIdx === 1) {
      // Electrical Transformer Pylon Cube
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.75, 0.65), postMat);
      box.position.set(0, 0.375, 0);
      landmark.add(box);
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 8), accentMat);
      coil.position.set(0, 0.9, 0);
      landmark.add(coil);
    } else if (islandIdx === 2) {
      // Revit Blueprint Crystal Spire
      const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), accentMat);
      spire.position.set(0, 0.85, 0);
      landmark.add(spire);
    } else if (islandIdx === 3) {
      // Mini Gantry Frame
      for (const sx of [-0.45, 0.45]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), postMat);
        col.position.set(sx, 0.55, 0);
        landmark.add(col);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 0.18), accentMat);
      beam.position.set(0, 1.12, 0);
      landmark.add(beam);
    } else {
      // Summit Coordination Beacon Castle
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 1.0, 0.75),
        new THREE.MeshStandardMaterial({ color: '#4C172D', roughness: 0.6, metalness: 0.2 })
      );
      tower.position.set(0, 0.5, 0);
      landmark.add(tower);
      const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), accentMat);
      crown.position.set(0, 1.35, 0);
      landmark.add(crown);
    }

    group.add(landmark);
  }

  private createStageNode(
    episodeId: string,
    pos: THREE.Vector3,
    completed: boolean,
    islandAccent: string
  ): void {
    const padColor = completed ? '#10B981' : '#881337';
    const rimColor = completed ? '#FACC15' : '#F43F5E';

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.36, 0.12, 8),
      new THREE.MeshStandardMaterial({
        color: rimColor,
        roughness: 0.35,
        metalness: 0.45,
        flatShading: true,
      })
    );
    base.position.set(pos.x, pos.y + 0.04, pos.z);
    base.castShadow = true;
    base.receiveShadow = true;
    base.userData.episodeId = episodeId;
    this.worldGroup.add(base);

    const topTile = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.06, 8),
      new THREE.MeshStandardMaterial({
        color: padColor,
        emissive: completed ? '#059669' : '#4C0519',
        emissiveIntensity: completed ? 0.45 : 0.25,
        roughness: 0.3,
        metalness: 0.25,
      })
    );
    topTile.position.set(pos.x, pos.y + 0.09, pos.z);
    topTile.userData.episodeId = episodeId;
    this.worldGroup.add(topTile);

    // Mini HI-bit Avatar Crest / Helmet emblem on every stage node (Mario World 2 level marker)
    const crestColor = completed ? '#FACC15' : islandAccent;
    const miniCrest = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshStandardMaterial({
        color: crestColor,
        emissive: completed ? '#CA8A04' : '#000000',
        emissiveIntensity: completed ? 0.35 : 0,
        roughness: 0.28,
        metalness: 0.35,
      })
    );
    miniCrest.position.set(pos.x + 0.24, pos.y + 0.18, pos.z - 0.18);
    miniCrest.userData.episodeId = episodeId;
    this.worldGroup.add(miniCrest);

    // Invisible slightly larger pickable cylinder for effortless click/tap in 3D
    const pickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.45, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickMesh.position.set(pos.x, pos.y + 0.2, pos.z);
    pickMesh.userData.episodeId = episodeId;
    this.worldGroup.add(pickMesh);

    this.stagePickables.push(pickMesh);
    this.stagePadMeshes.set(episodeId, topTile);
  }

  private buildDottedPaths(
    stages: { id: string; pos: THREE.Vector3; completed: boolean }[]
  ): void {
    const dotPoints: { pos: THREE.Vector3; active: boolean }[] = [];

    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i];
      const b = stages[i + 1];
      const dist = a.pos.distanceTo(b.pos);

      const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
      // Higher arch when bridging across water between islands
      const isIslandBridge = dist > 3.2;
      mid.y = Math.max(a.pos.y, b.pos.y) + (isIslandBridge ? 1.15 : 0.22);

      const curve = new THREE.QuadraticBezierCurve3(a.pos, mid, b.pos);
      const numDots = Math.max(3, Math.floor(dist / 0.42));

      for (let d = 1; d < numDots; d++) {
        const pt = curve.getPoint(d / numDots);
        pt.y += 0.09;
        dotPoints.push({
          pos: pt,
          active: a.completed,
        });
      }
    }

    if (dotPoints.length === 0) return;

    const dotGeom = new THREE.BoxGeometry(0.14, 0.08, 0.14);
    const dotMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.3,
      metalness: 0.25,
    });

    const instancedDots = new THREE.InstancedMesh(dotGeom, dotMat, dotPoints.length);
    const dummy = new THREE.Object3D();
    const goldColor = new THREE.Color('#FACC15');
    const wineDotColor = new THREE.Color('#FB7185');

    dotPoints.forEach((dot, idx) => {
      dummy.position.copy(dot.pos);
      dummy.rotation.y = Math.PI / 4;
      dummy.updateMatrix();
      instancedDots.setMatrixAt(idx, dummy.matrix);
      instancedDots.setColorAt(idx, dot.active ? goldColor : wineDotColor);
    });

    instancedDots.instanceMatrix.needsUpdate = true;
    if (instancedDots.instanceColor) {
      instancedDots.instanceColor.needsUpdate = true;
    }
    instancedDots.computeBoundingSphere();
    this.worldGroup.add(instancedDots);
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

    const scale = 0.78;
    const body = new THREE.Group();
    body.scale.setScalar(scale);

    // Legs
    const pantsMat = new THREE.MeshStandardMaterial({ color: '#1E1B2E', roughness: 0.7 });
    for (const lx of [-0.11, 0.11]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), pantsMat);
      leg.position.set(lx, 0.24, 0);
      leg.castShadow = true;
      body.add(leg);
    }

    // Torso / Vest
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.24), this.avatarVestMat);
    torso.position.set(0, 0.62, 0);
    torso.castShadow = true;
    body.add(torso);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.06, 0.255),
      new THREE.MeshStandardMaterial({ color: '#F1F5F9', roughness: 0.2, metalness: 0.8 })
    );
    stripe.position.set(0, 0.54, 0);
    body.add(stripe);

    // Arms
    for (const ax of [-0.30, 0.30]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.14), this.avatarSkinMat);
      arm.position.set(ax, 0.62, 0);
      arm.castShadow = true;
      body.add(arm);
    }

    // Smooth Rounded Head (zero top studs)
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.28, 16), this.avatarSkinMat);
    head.position.set(0, 0.99, 0);
    head.castShadow = true;
    body.add(head);

    // Safety Glasses visor
    this.avatarGlassesMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, 0.08),
      this.avatarGlassesMat
    );
    this.avatarGlassesMesh.position.set(0, 1.0, 0.17);
    body.add(this.avatarGlassesMesh);

    // Authorial Hard Hat Helmet
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.avatarHelmetMat
    );
    helmet.position.set(0, 1.08, 0);
    helmet.castShadow = true;
    body.add(helmet);

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.25, 0.03, 16, 1, false, -Math.PI * 0.4, Math.PI * 0.8),
      this.avatarHelmetMat
    );
    brim.position.set(0, 1.08, 0.06);
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
      this.desiredCamPos.set(0, 16.5, 22.5);
      this.desiredLookAt.set(1.2, 0.8, 0.4);
      this.isCamTransitioning = true;
      this.lastTimestamp = performance.now();
      this.requestRender();
      return;
    }

    const spec = ISLAND_LAYOUTS.find((l) => l.id === islandId);
    if (!spec) return;
    this.desiredLookAt.set(spec.center[0], 0.9, spec.center[1]);
    this.desiredCamPos.set(spec.center[0] + 1.5, 7.6, spec.center[1] + 9.2);
    this.isCamTransitioning = true;
    this.lastTimestamp = performance.now();
    this.requestRender();
  }

  public moveAvatarToStage(episodeId: string, focusCam = true): void {
    const target = this.stagePositions.get(episodeId);
    if (!target) return;

    this.activeEpisodeId = episodeId;
    this.avatarStartPos.copy(this.avatarGroup.position);
    this.avatarTargetPos.copy(target);
    this.avatarHopProgress = 0;
    this.selectionRing.position.set(target.x, target.y + 0.03, target.z);

    // Orient avatar toward travel direction
    const dx = target.x - this.avatarStartPos.x;
    const dz = target.z - this.avatarStartPos.z;
    if (Math.hypot(dx, dz) > 0.05) {
      this.avatarGroup.rotation.y = Math.atan2(dx, dz);
    }

    if (focusCam) {
      this.desiredLookAt.set(target.x, target.y + 0.6, target.z);
      this.desiredCamPos.set(target.x + 2.2, target.y + 6.4, target.z + 8.0);
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

    _vec3.set(pos.x, pos.y + (epId === this.activeEpisodeId ? 1.45 : 0.65), pos.z);
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

      // Avatar hop animation along parabolic arc
      if (this.avatarHopProgress < 1) {
        this.avatarHopProgress = Math.min(1, this.avatarHopProgress + dt * 2.2);
        const t = this.avatarHopProgress;
        this.avatarGroup.position.lerpVectors(this.avatarStartPos, this.avatarTargetPos, t);
        this.avatarGroup.position.y += Math.sin(t * Math.PI) * 0.85;
        stillAnimating = true;
        this.emitProjection();
      }

      // Smooth camera transition
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

      const dampingMore = this.controls.update();
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (!this.disposed && (this.renderDirty || stillAnimating || dampingMore)) {
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
