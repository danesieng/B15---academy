import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  attachStudioEnvironment,
  createAfterDrawPacer,
  createStudioRenderer,
  detectSoftwareWebGL,
  disposeObjectHierarchy,
} from './webglUtils';

export type HighlightMode = 'none' | 'correct' | 'wrong' | 'inspect';

export interface FloatingLabelProjection {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  mode: HighlightMode;
}

export interface InspectorReadout {
  meshName: string;
  cameraPos: [number, number, number];
  targetPos: [number, number, number];
}

interface HighlightRecord {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  overrideMaterial: THREE.MeshStandardMaterial;
}

const _vec3 = new THREE.Vector3();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();

function round3(n: number): number {
  return Math.round(n * 100) / 100;
}

function createFloorGridTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1E2430';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concrete speckles
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.anisotropy = maxAniso;
  return tex;
}

function createSafetyZoneTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#171C26';
  ctx.fillRect(0, 0, 512, 512);

  // Yellow & dark hazard border stripes
  ctx.strokeStyle = '#EAB308';
  ctx.lineWidth = 18;
  ctx.strokeRect(14, 14, 484, 484);

  ctx.save();
  ctx.beginPath();
  ctx.rect(24, 24, 464, 56);
  ctx.clip();
  ctx.fillStyle = '#EAB308';
  for (let x = -512; x < 1024; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x + 24, 24);
    ctx.lineTo(x - 16, 80);
    ctx.lineTo(x - 40, 80);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('NEC 110.26 CLEARANCE', 256, 260);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.font = '24px monospace';
  ctx.fillText('MANTER DESOBSTRUIDO', 256, 310);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createMeterScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#04121D';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 148);
  ctx.fillStyle = '#22D3EE';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('QGBT-01 480V', 18, 44);
  ctx.fillStyle = '#FACC15';
  ctx.font = '22px monospace';
  ctx.fillText('L1: 480V  382A', 18, 86);
  ctx.fillStyle = '#10B981';
  ctx.fillText('STATUS: NORMAL', 18, 126);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ElectricalRoomSceneController {
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

  private activeModelGroup = new THREE.Group();
  private structuralGroup = new THREE.Group();
  private highlightedRecords: HighlightRecord[] = [];
  private currentTargetObject: THREE.Object3D | null = null;
  private currentLabelText = '';
  private currentHighlightMode: HighlightMode = 'none';

  // Camera transition state
  private isTransitioning = false;
  private desiredCamPos = new THREE.Vector3(2.8, 2.35, 3.0);
  private desiredLookAt = new THREE.Vector3(-0.3, 1.55, -0.6);
  private lastTimestamp = 0;

  private inspectorEnabled = false;
  private selectedMeshName = 'Nenhum selecionado';

  private onLabelUpdate?: (label: FloatingLabelProjection) => void;
  private onInspectorUpdate?: (readout: InspectorReadout) => void;
  private onModelSourceChange?: (sourceName: string) => void;

  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    callbacks: {
      onLabelUpdate?: (label: FloatingLabelProjection) => void;
      onInspectorUpdate?: (readout: InspectorReadout) => void;
      onModelSourceChange?: (sourceName: string) => void;
    }
  ) {
    this.container = container;
    this.onLabelUpdate = callbacks.onLabelUpdate;
    this.onInspectorUpdate = callbacks.onInspectorUpdate;
    this.onModelSourceChange = callbacks.onModelSourceChange;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = createStudioRenderer(container, this.isSoftwareGl);
    this.pacer = createAfterDrawPacer(this.renderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0B101B');
    this.scene.fog = new THREE.FogExp2('#0B101B', 0.045);
    this.envTex = attachStudioEnvironment(this.renderer, this.scene);

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.08, 80);
    this.camera.position.copy(this.desiredCamPos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.desiredLookAt);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 18;
    this.controls.maxPolarAngle = Math.PI * 0.56;

    this.controls.addEventListener('start', () => {
      // Stop scripted camera glide if user takes over
      this.isTransitioning = false;
    });

    this.controls.addEventListener('change', () => {
      this.emitLabelProjection();
      if (this.inspectorEnabled) {
        this.emitInspectorReadout();
      }
      this.requestRender();
    });

    this.setupLighting();
    this.scene.add(this.structuralGroup);
    this.scene.add(this.activeModelGroup);

    // Immediately build procedural Electrical Room so 3D viewport is never empty
    this.buildProceduralElectricalRoom();
    this.onModelSourceChange?.('Sala Elétrica BIM (Procedural)');

    // Quietly check if /models/predio.glb exists (validating binary glTF header)
    void this.tryLoadDefaultGlb();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindPointerEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.requestRender();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight('#C7E2FF', '#1E293B', 0.75);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFF7EB', 2.0);
    keyLight.position.set(3.5, 5.2, 4.0);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -4.5;
    keyLight.shadow.camera.right = 4.5;
    keyLight.shadow.camera.top = 4.5;
    keyLight.shadow.camera.bottom = -4.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#38BDF8', 0.65);
    fillLight.position.set(-4.0, 2.5, 3.0);
    this.scene.add(fillLight);

    const roomLight = new THREE.PointLight('#F8FAFC', 1.4, 10);
    roomLight.position.set(0, 3.0, 0.2);
    this.scene.add(roomLight);
  }

  private tagBimGroup(group: THREE.Object3D, bimName: string): void {
    group.name = bimName;
    group.userData.bimName = bimName;
    group.traverse((child) => {
      child.userData.bimName = bimName;
    });
  }

  public buildProceduralElectricalRoom(): void {
    this.clearHighlight();
    disposeObjectHierarchy(this.structuralGroup);
    disposeObjectHierarchy(this.activeModelGroup);
    this.structuralGroup.clear();
    this.activeModelGroup.clear();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Structural room shell (non-interactive walls/floor/ceiling)
    const floorMat = new THREE.MeshStandardMaterial({
      map: createFloorGridTexture(maxAniso),
      roughness: 0.78,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 5.4), floorMat);
    floor.position.set(0, -0.05, 0);
    floor.receiveShadow = true;
    floor.name = 'Piso_Concreto';
    this.structuralGroup.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      color: '#252E3D',
      roughness: 0.88,
      metalness: 0.04,
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.3, 0.16), wallMat);
    backWall.position.set(0, 1.65, -2.15);
    backWall.receiveShadow = true;
    backWall.name = 'Parede_Fundo';
    this.structuralGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.3, 5.4), wallMat);
    leftWall.position.set(-2.95, 1.65, 0.45);
    leftWall.receiveShadow = true;
    leftWall.name = 'Parede_Lateral';
    this.structuralGroup.add(leftWall);

    // Overhead concrete slab beam reference (semi-transparent ceiling grid)
    const ceilingBeam = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.18, 0.35),
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.85, metalness: 0.1 })
    );
    ceilingBeam.position.set(0, 3.22, -0.35);
    ceilingBeam.name = 'Viga_Estrutural';
    this.structuralGroup.add(ceilingBeam);

    // ------------------------------------------------------------
    // 1. Painel_QGBT (Composite 8-part switchboard + NEC pad/mat)
    // ------------------------------------------------------------
    const qgbtGroup = new THREE.Group();
    qgbtGroup.position.set(-1.8, 0, -1.72);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.1, 0.68),
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9, metalness: 0.05 })
    );
    pad.position.set(0, 0.05, 0);
    pad.receiveShadow = true;
    qgbtGroup.add(pad);

    const cabinetMat = new THREE.MeshStandardMaterial({
      color: '#64748B',
      roughness: 0.38,
      metalness: 0.55,
    });
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.92, 0.52), cabinetMat);
    cabinet.position.set(0, 1.06, 0);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    qgbtGroup.add(cabinet);

    const doorMat = new THREE.MeshStandardMaterial({
      color: '#94A3B8',
      roughness: 0.32,
      metalness: 0.62,
    });
    for (const dx of [-0.28, 0.28]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.54, 1.78, 0.03), doorMat);
      door.position.set(dx, 1.06, 0.27);
      door.castShadow = true;
      qgbtGroup.add(door);

      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.18, 0.045),
        new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.3, metalness: 0.8 })
      );
      handle.position.set(dx > 0 ? dx - 0.19 : dx + 0.19, 1.06, 0.295);
      qgbtGroup.add(handle);
    }

    // Digital Power Meter screen on right door
    const meter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.15),
      new THREE.MeshStandardMaterial({
        map: createMeterScreenTexture(),
        roughness: 0.2,
        metalness: 0.1,
        emissive: '#0891B2',
        emissiveIntensity: 0.35,
      })
    );
    meter.position.set(0.28, 1.58, 0.287);
    qgbtGroup.add(meter);

    // Arc flash warning plate on left door
    const placard = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.13, 0.01),
      new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.4, metalness: 0.1 })
    );
    placard.position.set(-0.28, 1.58, 0.287);
    qgbtGroup.add(placard);

    // NEC 110.26 Floor Clearance Zone Mat (offset y = 0.01 to avoid Z-fighting)
    const clearanceMat = new THREE.Mesh(
      new THREE.PlaneGeometry(1.28, 1.25),
      new THREE.MeshStandardMaterial({
        map: createSafetyZoneTexture(maxAniso),
        roughness: 0.72,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    clearanceMat.rotation.x = -Math.PI / 2;
    clearanceMat.position.set(0, 0.012, 0.96);
    qgbtGroup.add(clearanceMat);

    this.tagBimGroup(qgbtGroup, 'Painel_QGBT');
    this.activeModelGroup.add(qgbtGroup);

    // ------------------------------------------------------------
    // 2. Conduit_05_HalfInch (1/2" EMT run exiting QGBT -> Hanger -> Corridor)
    // ------------------------------------------------------------
    const emtMat = new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.24,
      metalness: 0.88,
    });
    const fittingMat = new THREE.MeshStandardMaterial({
      color: '#64748B',
      roughness: 0.35,
      metalness: 0.82,
    });

    const c05Group = new THREE.Group();
    const curve05 = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-1.55, 2.02, -1.72),
        new THREE.Vector3(-1.55, 2.165, -1.72),
        new THREE.Vector3(-1.50, 2.165, -1.12),
        new THREE.Vector3(-0.35, 2.165, -1.12),
        new THREE.Vector3(0.20, 2.165, -0.50),
        new THREE.Vector3(1.85, 2.165, -0.50),
      ],
      false,
      'catmullrom',
      0.12
    );
    const conduit05Mesh = new THREE.Mesh(new THREE.TubeGeometry(curve05, 64, 0.022, 14, false), emtMat);
    conduit05Mesh.castShadow = true;
    c05Group.add(conduit05Mesh);

    // Compression couplings & junction box on 1/2" line
    const coupling05 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 16), fittingMat);
    coupling05.rotation.z = Math.PI / 2;
    coupling05.position.set(0.95, 2.165, -0.50);
    c05Group.add(coupling05);

    const jbox05 = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.08),
      new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.3, metalness: 0.8 })
    );
    jbox05.position.set(1.88, 2.165, -0.50);
    c05Group.add(jbox05);

    this.tagBimGroup(c05Group, 'Conduit_05_HalfInch');
    this.activeModelGroup.add(c05Group);

    // ------------------------------------------------------------
    // 3. Conduit_075_ThreeQuarter (3/4" EMT run parallel on Hanger_01)
    // ------------------------------------------------------------
    const c075Group = new THREE.Group();
    const curve075 = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-1.95, 2.02, -1.68),
        new THREE.Vector3(-1.95, 2.18, -1.68),
        new THREE.Vector3(-1.88, 2.18, -0.82),
        new THREE.Vector3(-0.45, 2.18, -0.82),
        new THREE.Vector3(0.20, 2.18, -0.25),
        new THREE.Vector3(1.85, 2.18, -0.25),
      ],
      false,
      'catmullrom',
      0.12
    );
    const conduit075Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve075, 64, 0.036, 16, false),
      new THREE.MeshStandardMaterial({
        color: '#E2E8F0',
        roughness: 0.2,
        metalness: 0.9,
      })
    );
    conduit075Mesh.castShadow = true;
    c075Group.add(conduit075Mesh);

    const coupling075 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 16), fittingMat);
    coupling075.rotation.z = Math.PI / 2;
    coupling075.position.set(1.05, 2.18, -0.25);
    c075Group.add(coupling075);

    const pullBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.18, 0.14),
      new THREE.MeshStandardMaterial({ color: '#64748B', roughness: 0.35, metalness: 0.78 })
    );
    pullBox.position.set(1.92, 2.18, -0.25);
    c075Group.add(pullBox);

    this.tagBimGroup(c075Group, 'Conduit_075_ThreeQuarter');
    this.activeModelGroup.add(c075Group);

    // ------------------------------------------------------------
    // 4. Hanger_01 (Unistrut Trapeze Hanger + Threaded Rods + Clamps)
    // ------------------------------------------------------------
    const hangerGroup = new THREE.Group();
    hangerGroup.position.set(0.2, 2.115, -0.375);

    const strutMat = new THREE.MeshStandardMaterial({
      color: '#A3A3A3',
      roughness: 0.36,
      metalness: 0.85,
    });
    const strutBar = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.72), strutMat);
    strutBar.castShadow = true;
    hangerGroup.add(strutBar);

    const rodMat = new THREE.MeshStandardMaterial({
      color: '#D4D4D8',
      roughness: 0.28,
      metalness: 0.9,
    });
    for (const rz of [-0.30, 0.30]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.08, 12), rodMat);
      rod.position.set(0, 0.52, rz);
      hangerGroup.add(rod);

      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 6), fittingMat);
      nut.position.set(0, -0.036, rz);
      hangerGroup.add(nut);

      const ceilingAnchor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), fittingMat);
      ceilingAnchor.position.set(0, 1.02, rz);
      hangerGroup.add(ceilingAnchor);
    }

    // Strut clamps over conduits
    for (const cz of [-0.125, 0.125]) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.075), fittingMat);
      clamp.position.set(0, 0.055, cz);
      hangerGroup.add(clamp);
    }

    this.tagBimGroup(hangerGroup, 'Hanger_01');
    this.activeModelGroup.add(hangerGroup);

    // ------------------------------------------------------------
    // 5. Duct_HVAC (Galvanized Sheet-Metal Supply Duct Overhead)
    // ------------------------------------------------------------
    const ductGroup = new THREE.Group();
    ductGroup.position.set(0.35, 2.66, -0.45);

    const ductMat = new THREE.MeshStandardMaterial({
      color: '#9CA3AF',
      roughness: 0.32,
      metalness: 0.86,
    });
    const ductBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.36, 0.68), ductMat);
    ductBody.castShadow = true;
    ductBody.receiveShadow = true;
    ductGroup.add(ductBody);

    // Transverse TDC flange ribs
    const flangeMat = new THREE.MeshStandardMaterial({
      color: '#4B5563',
      roughness: 0.45,
      metalness: 0.78,
    });
    for (const fx of [-1.4, 0, 1.4]) {
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.41, 0.73), flangeMat);
      flange.position.set(fx, 0, 0);
      ductGroup.add(flange);
    }

    this.tagBimGroup(ductGroup, 'Duct_HVAC');
    this.activeModelGroup.add(ductGroup);

    // ------------------------------------------------------------
    // 6. Pipe_Conflito_Frontal (Interfering Fire/Hydronic Pipe in QGBT Clearance!)
    // ------------------------------------------------------------
    const pipeGroup = new THREE.Group();
    const pipeMat = new THREE.MeshStandardMaterial({
      color: '#B91C1C',
      roughness: 0.36,
      metalness: 0.45,
    });

    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.85, 1.60, -0.82),
      new THREE.Vector3(-0.75, 1.60, -0.82),
      new THREE.Vector3(-0.55, 1.60, -0.15),
      new THREE.Vector3(-0.55, 1.60, 1.35),
    ]);
    const pipeMesh = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 48, 0.055, 16, false), pipeMat);
    pipeMesh.castShadow = true;
    pipeGroup.add(pipeMesh);

    // Valve body + handwheel right in front of QGBT
    const valveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 16), pipeMat);
    valveBody.rotation.z = Math.PI / 2;
    valveBody.position.set(-1.62, 1.60, -0.82);
    pipeGroup.add(valveBody);

    const valveStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 10), fittingMat);
    valveStem.position.set(-1.62, 1.71, -0.82);
    pipeGroup.add(valveStem);

    const handwheel = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 24), pipeMat);
    handwheel.rotation.x = Math.PI / 2;
    handwheel.position.set(-1.62, 1.78, -0.82);
    pipeGroup.add(handwheel);

    this.tagBimGroup(pipeGroup, 'Pipe_Conflito_Frontal');
    this.activeModelGroup.add(pipeGroup);

    this.requestRender();
  }

  private async tryLoadDefaultGlb(): Promise<void> {
    try {
      const response = await fetch('/models/predio.glb');
      if (!response.ok) return;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 12) return;

      // Verify binary glTF magic header: "glTF" (0x46546C67)
      const view = new DataView(buffer);
      const magic = view.getUint32(0, true);
      if (magic !== 0x46546c67) {
        // Vite dev server served index.html fallback; keep procedural room cleanly
        return;
      }
      await this.parseAndMountGlb(buffer, 'predio.glb (/models/predio.glb)');
    } catch {
      // Keep procedural room on any fetch failure
    }
  }

  public async loadGlbFromFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    await this.parseAndMountGlb(buffer, file.name);
  }

  private parseAndMountGlb(buffer: ArrayBuffer, labelName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.parse(
        buffer,
        '',
        (gltf) => {
          if (this.disposed) return;
          this.clearHighlight();
          disposeObjectHierarchy(this.structuralGroup);
          disposeObjectHierarchy(this.activeModelGroup);
          this.structuralGroup.clear();
          this.activeModelGroup.clear();

          const root = gltf.scene;
          // Auto-center & scale if absurdly large/tiny
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          if (maxDim > 40 || maxDim < 0.5) {
            const targetScale = 6 / maxDim;
            root.scale.setScalar(targetScale);
            box.setFromObject(root);
            box.getCenter(center);
          }
          root.position.sub(center);
          root.position.y += box.getSize(new THREE.Vector3()).y / 2;

          root.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = !this.isSoftwareGl;
              child.receiveShadow = !this.isSoftwareGl;
            }
          });

          this.activeModelGroup.add(root);
          this.desiredCamPos.set(4.5, 3.2, 4.5);
          this.desiredLookAt.set(0, 1.2, 0);
          this.camera.position.copy(this.desiredCamPos);
          this.controls.target.copy(this.desiredLookAt);
          this.controls.update();

          this.onModelSourceChange?.(labelName);
          this.requestRender();
          resolve();
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  public focusOnTarget(
    cameraPos: [number, number, number],
    lookAtPos: [number, number, number],
    targetName: string,
    mode: HighlightMode,
    labelText: string
  ): void {
    this.desiredCamPos.set(cameraPos[0], cameraPos[1], cameraPos[2]);
    this.desiredLookAt.set(lookAtPos[0], lookAtPos[1], lookAtPos[2]);
    this.isTransitioning = true;
    this.lastTimestamp = performance.now();

    this.highlightObjectByName(targetName, mode, labelText);
    this.requestRender();
  }

  public resetView(): void {
    this.clearHighlight();
    this.desiredCamPos.set(2.8, 2.35, 3.0);
    this.desiredLookAt.set(-0.3, 1.55, -0.6);
    this.isTransitioning = true;
    this.lastTimestamp = performance.now();
    this.requestRender();
  }

  public setInspectorMode(enabled: boolean): void {
    this.inspectorEnabled = enabled;
    if (enabled) {
      this.emitInspectorReadout();
    } else if (this.currentHighlightMode === 'inspect') {
      this.clearHighlight();
    }
    this.requestRender();
  }

  private resolveObjectByName(name: string): THREE.Object3D | null {
    if (!name) return null;
    const direct = this.activeModelGroup.getObjectByName(name);
    if (direct) return direct;

    let fallback: THREE.Object3D | null = null;
    const needle = name.toLowerCase();
    this.activeModelGroup.traverse((obj) => {
      if (fallback) return;
      const bimName = String(obj.userData?.bimName || obj.name || '').toLowerCase();
      if (bimName && (bimName === needle || bimName.includes(needle))) {
        fallback = obj;
      }
    });
    return fallback;
  }

  public clearHighlight(): void {
    for (const rec of this.highlightedRecords) {
      rec.mesh.material = rec.originalMaterial;
      rec.overrideMaterial.dispose();
    }
    this.highlightedRecords = [];
    this.currentTargetObject = null;
    this.currentLabelText = '';
    this.currentHighlightMode = 'none';
    this.emitLabelProjection();
    this.requestRender();
  }

  private highlightObjectByName(
    name: string,
    mode: HighlightMode,
    labelText: string
  ): void {
    this.clearHighlight();
    const target = this.resolveObjectByName(name);
    if (!target || mode === 'none') return;

    this.currentTargetObject = target;
    this.currentLabelText = labelText;
    this.currentHighlightMode = mode;

    const hexColor =
      mode === 'correct' ? '#10B981' : mode === 'wrong' ? '#EF4444' : '#22D3EE';
    const emissiveHex =
      mode === 'correct' ? '#059669' : mode === 'wrong' ? '#DC2626' : '#0891B2';

    target.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const originalMaterial = child.material;
        const overrideMaterial = new THREE.MeshStandardMaterial({
          color: hexColor,
          emissive: emissiveHex,
          emissiveIntensity: 0.55,
          roughness: 0.25,
          metalness: 0.35,
        });
        child.material = overrideMaterial;
        this.highlightedRecords.push({
          mesh: child,
          originalMaterial,
          overrideMaterial,
        });
      }
    });

    this.emitLabelProjection();
  }

  private emitLabelProjection(): void {
    if (!this.onLabelUpdate) return;
    if (!this.currentTargetObject || this.currentHighlightMode === 'none') {
      this.onLabelUpdate({
        visible: false,
        x: 0,
        y: 0,
        text: '',
        mode: 'none',
      });
      return;
    }

    _box.setFromObject(this.currentTargetObject);
    _box.getCenter(_center);
    _center.y = Math.min(_box.max.y + 0.14, _center.y + 0.55);

    _vec3.copy(_center).project(this.camera);
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const visible = _vec3.z < 1 && _vec3.z > -1;
    const x = ((_vec3.x + 1) / 2) * width;
    const y = ((-_vec3.y + 1) / 2) * height;

    this.onLabelUpdate({
      visible,
      x: Math.max(80, Math.min(width - 80, x)),
      y: Math.max(40, Math.min(height - 40, y)),
      text: this.currentLabelText,
      mode: this.currentHighlightMode,
    });
  }

  private emitInspectorReadout(): void {
    if (!this.onInspectorUpdate) return;
    this.onInspectorUpdate({
      meshName: this.selectedMeshName,
      cameraPos: [
        round3(this.camera.position.x),
        round3(this.camera.position.y),
        round3(this.camera.position.z),
      ],
      targetPos: [
        round3(this.controls.target.x),
        round3(this.controls.target.y),
        round3(this.controls.target.z),
      ],
    });
  }

  private bindPointerEvents(): void {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownPos.set(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.inspectorEnabled) return;
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );
      if (dist > 6) return; // User was orbiting, not clicking

      const rect = dom.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const intersects = this.raycaster.intersectObjects(
        this.activeModelGroup.children,
        true
      );

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const resolvedName =
          String(hit.userData?.bimName || hit.name || hit.parent?.name || 'Mesh_Sem_Nome');
        this.selectedMeshName = resolvedName;
        this.highlightObjectByName(resolvedName, 'inspect', resolvedName);
        this.emitInspectorReadout();
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);

    // Store cleanup on instance
    this.cleanupPointer = () => {
      dom.removeEventListener('pointerdown', onPointerDown);
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
    this.emitLabelProjection();
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

      let stillMoving = false;
      if (this.isTransitioning) {
        const lambda = 6.5;
        this.camera.position.x = THREE.MathUtils.damp(
          this.camera.position.x,
          this.desiredCamPos.x,
          lambda,
          dt
        );
        this.camera.position.y = THREE.MathUtils.damp(
          this.camera.position.y,
          this.desiredCamPos.y,
          lambda,
          dt
        );
        this.camera.position.z = THREE.MathUtils.damp(
          this.camera.position.z,
          this.desiredCamPos.z,
          lambda,
          dt
        );

        this.controls.target.x = THREE.MathUtils.damp(
          this.controls.target.x,
          this.desiredLookAt.x,
          lambda,
          dt
        );
        this.controls.target.y = THREE.MathUtils.damp(
          this.controls.target.y,
          this.desiredLookAt.y,
          lambda,
          dt
        );
        this.controls.target.z = THREE.MathUtils.damp(
          this.controls.target.z,
          this.desiredLookAt.z,
          lambda,
          dt
        );

        const posDist = this.camera.position.distanceTo(this.desiredCamPos);
        const tgtDist = this.controls.target.distanceTo(this.desiredLookAt);
        if (posDist < 0.015 && tgtDist < 0.015) {
          this.camera.position.copy(this.desiredCamPos);
          this.controls.target.copy(this.desiredLookAt);
          this.isTransitioning = false;
        } else {
          stillMoving = true;
        }
        this.emitLabelProjection();
      }

      const dampingMore = this.controls.update();
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (!this.disposed && (this.renderDirty || stillMoving || dampingMore)) {
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
    this.clearHighlight();
    this.controls.dispose();
    disposeObjectHierarchy(this.scene);
    this.envTex.dispose();
    this.renderer.dispose();
  }
}
