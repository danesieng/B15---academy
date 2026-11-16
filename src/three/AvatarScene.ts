import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AvatarConfig, GlassesStyle } from '../types/course';
import {
  attachStudioEnvironment,
  createAfterDrawPacer,
  createStudioRenderer,
  detectSoftwareWebGL,
  disposeObjectHierarchy,
} from './webglUtils';

function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number
): THREE.ExtrudeGeometry {
  const w = width - radius * 2;
  const h = height - radius * 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2 - radius);
  shape.lineTo(w / 2, -h / 2 - radius);
  shape.quadraticCurveTo(w / 2 + radius, -h / 2 - radius, w / 2 + radius, -h / 2);
  shape.lineTo(w / 2 + radius, h / 2);
  shape.quadraticCurveTo(w / 2 + radius, h / 2 + radius, w / 2, h / 2 + radius);
  shape.lineTo(-w / 2, h / 2 + radius);
  shape.quadraticCurveTo(-w / 2 - radius, h / 2 + radius, -w / 2 - radius, h / 2);
  shape.lineTo(-w / 2 - radius, -h / 2);
  shape.quadraticCurveTo(-w / 2 - radius, -h / 2 - radius, -w / 2, -h / 2 - radius);

  const bevel = Math.min(radius, 0.045);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geom.center();
  return geom;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTurntableGridTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
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

  ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 210, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export class AvatarSceneController {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envTex: THREE.Texture;
  private pacer: ReturnType<typeof createAfterDrawPacer>;

  private characterGroup = new THREE.Group();
  private skinMat: THREE.MeshStandardMaterial;
  private helmetMat: THREE.MeshStandardMaterial;
  private vestMat: THREE.MeshStandardMaterial;
  private shirtMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private bootMat: THREE.MeshStandardMaterial;
  private reflectiveMat: THREE.MeshStandardMaterial;
  private lensMat: THREE.MeshPhysicalMaterial;
  private frameMat: THREE.MeshStandardMaterial;

  private glassesGroups: Record<GlassesStyle, THREE.Group> = {
    none: new THREE.Group(),
    clear: new THREE.Group(),
    amber: new THREE.Group(),
    tinted: new THREE.Group(),
    cyan_visor: new THREE.Group(),
  };

  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, initialConfig: AvatarConfig) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = createStudioRenderer(container, this.isSoftwareGl);
    this.pacer = createAfterDrawPacer(this.renderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0B111E');
    this.scene.fog = new THREE.FogExp2('#0B111E', 0.065);

    this.envTex = attachStudioEnvironment(this.renderer, this.scene);

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 40);
    this.camera.position.set(1.65, 1.48, 2.75);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 4.5;
    this.controls.minPolarAngle = Math.PI * 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.54;
    this.controls.addEventListener('change', () => this.requestRender());

    // Studio 3-point lighting
    const hemi = new THREE.HemisphereLight('#B8DCFF', '#1E293B', 0.65);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFF5E4', 2.1);
    keyLight.position.set(3.2, 4.5, 3.5);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -2;
    keyLight.shadow.camera.right = 2;
    keyLight.shadow.camera.top = 2.5;
    keyLight.shadow.camera.bottom = -1;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#22D3EE', 1.25);
    rimLight.position.set(-2.8, 2.5, -2.5);
    this.scene.add(rimLight);

    // Materials
    this.skinMat = new THREE.MeshStandardMaterial({
      color: initialConfig.skinColor,
      roughness: 0.58,
      metalness: 0.02,
    });
    this.helmetMat = new THREE.MeshStandardMaterial({
      color: initialConfig.helmetColor,
      roughness: 0.24,
      metalness: 0.12,
    });
    this.vestMat = new THREE.MeshStandardMaterial({
      color: initialConfig.vestColor,
      roughness: 0.65,
      metalness: 0.05,
    });
    this.shirtMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.72,
      metalness: 0.04,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({
      color: '#0F172A',
      roughness: 0.78,
      metalness: 0.04,
    });
    this.bootMat = new THREE.MeshStandardMaterial({
      color: '#18181B',
      roughness: 0.42,
      metalness: 0.18,
    });
    this.reflectiveMat = new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      roughness: 0.22,
      metalness: 0.85,
    });
    this.lensMat = new THREE.MeshPhysicalMaterial({
      color: '#BAE6FD',
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.52,
      clearcoat: 1.0,
    });
    this.frameMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.35,
      metalness: 0.4,
    });

    this.buildStage();
    this.buildCharacter();
    this.applyConfig(initialConfig);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.requestRender();
  }

  private buildStage(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const discTex = createTurntableGridTexture(maxAniso);

    const plinthTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.22, 0.08, 48),
      new THREE.MeshStandardMaterial({
        map: discTex,
        roughness: 0.55,
        metalness: 0.25,
      })
    );
    plinthTop.position.y = -0.04;
    plinthTop.receiveShadow = true;
    this.scene.add(plinthTop);

    const plinthRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.015, 12, 64),
      new THREE.MeshStandardMaterial({
        color: '#22D3EE',
        roughness: 0.25,
        metalness: 0.75,
        emissive: '#0891B2',
        emissiveIntensity: 0.35,
      })
    );
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = 0.002;
    this.scene.add(plinthRing);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({
        map: createContactShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.004;
    this.scene.add(shadowPlane);
  }

  private buildCharacter(): void {
    this.characterGroup.position.set(0, 0, 0);

    // 1. Boots & Legs (grounded at y = 0)
    const makeLeg = (xOffset: number) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(xOffset, 0, 0);

      const boot = new THREE.Mesh(
        createRoundedBoxGeometry(0.24, 0.14, 0.32, 0.03),
        this.bootMat
      );
      boot.position.set(0, 0.07, 0.035);
      boot.castShadow = true;
      legGroup.add(boot);

      const leg = new THREE.Mesh(
        createRoundedBoxGeometry(0.22, 0.44, 0.22, 0.035),
        this.pantsMat
      );
      leg.position.set(0, 0.36, 0);
      leg.castShadow = true;
      legGroup.add(leg);

      return legGroup;
    };

    this.characterGroup.add(makeLeg(-0.14));
    this.characterGroup.add(makeLeg(0.14));

    // Pelvis / Belt
    const pelvis = new THREE.Mesh(
      createRoundedBoxGeometry(0.52, 0.14, 0.28, 0.03),
      this.pantsMat
    );
    pelvis.position.set(0, 0.62, 0);
    pelvis.castShadow = true;
    this.characterGroup.add(pelvis);

    const beltBuckle = new THREE.Mesh(
      createRoundedBoxGeometry(0.12, 0.07, 0.3, 0.015),
      new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.85, roughness: 0.2 })
    );
    beltBuckle.position.set(0, 0.63, 0.005);
    this.characterGroup.add(beltBuckle);

    // 2. Torso + Reflective Safety Vest (smooth block silhouette, zero brand studs)
    const torso = new THREE.Mesh(
      createRoundedBoxGeometry(0.56, 0.56, 0.3, 0.045),
      this.shirtMat
    );
    torso.position.set(0, 0.96, 0);
    torso.castShadow = true;
    this.characterGroup.add(torso);

    // Vest front & back shell
    const vestBody = new THREE.Mesh(
      createRoundedBoxGeometry(0.585, 0.50, 0.325, 0.045),
      this.vestMat
    );
    vestBody.position.set(0, 0.95, 0);
    vestBody.castShadow = true;
    this.characterGroup.add(vestBody);

    // Reflective high-visibility stripes (horizontal + shoulder straps)
    const horizStripe = new THREE.Mesh(
      createRoundedBoxGeometry(0.60, 0.065, 0.34, 0.01),
      this.reflectiveMat
    );
    horizStripe.position.set(0, 0.84, 0);
    this.characterGroup.add(horizStripe);

    for (const sx of [-0.17, 0.17]) {
      const shoulderStripe = new THREE.Mesh(
        createRoundedBoxGeometry(0.065, 0.44, 0.338, 0.01),
        this.reflectiveMat
      );
      shoulderStripe.position.set(sx, 0.98, 0);
      this.characterGroup.add(shoulderStripe);
    }

    // Center dark zipper line
    const zipper = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.49, 0.332),
      this.bootMat
    );
    zipper.position.set(0, 0.95, 0.003);
    this.characterGroup.add(zipper);

    // 3. Arms & Block Hands (smooth rounded cylinders/boxes)
    const makeArm = (side: -1 | 1) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.37, 1.15, 0);
      armPivot.rotation.z = side * 0.08;

      const sleeve = new THREE.Mesh(
        createRoundedBoxGeometry(0.17, 0.42, 0.18, 0.035),
        this.shirtMat
      );
      sleeve.position.set(0, -0.17, 0);
      sleeve.castShadow = true;
      armPivot.add(sleeve);

      const wrist = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.06, 16),
        this.skinMat
      );
      wrist.position.set(0, -0.40, 0);
      armPivot.add(wrist);

      // Stylized C-grip toy hand
      const hand = new THREE.Mesh(
        new THREE.TorusGeometry(0.065, 0.028, 12, 20, Math.PI * 1.45),
        this.skinMat
      );
      hand.position.set(0, -0.47, 0.01);
      hand.rotation.y = Math.PI / 2;
      hand.rotation.z = -Math.PI * 0.22;
      hand.castShadow = true;
      armPivot.add(hand);

      return armPivot;
    };

    this.characterGroup.add(makeArm(-1));
    this.characterGroup.add(makeArm(1));

    // 4. Neck & Smooth Rounded Head (NO top stud!)
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.12, 0.10, 24),
      this.skinMat
    );
    neck.position.set(0, 1.27, 0);
    this.characterGroup.add(neck);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.34, 32),
      this.skinMat
    );
    head.position.set(0, 1.48, 0);
    head.castShadow = true;
    this.characterGroup.add(head);

    // Smooth dome cap on head so silhouette is clean and rounded
    const headCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      this.skinMat
    );
    headCap.scale.set(1, 0.35, 1);
    headCap.position.set(0, 1.64, 0);
    this.characterGroup.add(headCap);

    // Eyes & Smile
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.2 });
    for (const ex of [-0.075, 0.075]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), eyeMat);
      eye.position.set(ex, 1.50, 0.21);
      this.characterGroup.add(eye);
    }

    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.011, 8, 18, Math.PI * 0.72),
      eyeMat
    );
    smile.position.set(0, 1.425, 0.212);
    smile.rotation.z = Math.PI * 1.14;
    this.characterGroup.add(smile);

    // 5. Authorial Smooth Safety Helmet (Hard Hat — NO studs, NO logos)
    const helmetGroup = new THREE.Group();
    helmetGroup.position.set(0, 1.58, 0);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.255, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.54),
      this.helmetMat
    );
    dome.scale.set(1, 0.92, 1.05);
    dome.castShadow = true;
    helmetGroup.add(dome);

    // Top structural rib of safety helmet
    const rib = new THREE.Mesh(
      createRoundedBoxGeometry(0.065, 0.055, 0.38, 0.02),
      this.helmetMat
    );
    rib.position.set(0, 0.215, 0);
    helmetGroup.add(rib);

    // Front brim visor
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.285, 0.024, 32, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
      this.helmetMat
    );
    brim.position.set(0, -0.01, 0.085);
    brim.rotation.x = 0.08;
    brim.castShadow = true;
    helmetGroup.add(brim);

    this.characterGroup.add(helmetGroup);

    // 6. Safety Glasses Variations
    this.buildGlassesStyles();
    this.scene.add(this.characterGroup);
  }

  private buildGlassesStyles(): void {
    const baseY = 1.50;
    const baseZ = 0.228;

    const addTemples = (group: THREE.Group, mat: THREE.Material) => {
      for (const sx of [-1, 1]) {
        const temple = new THREE.Mesh(
          new THREE.BoxGeometry(0.016, 0.02, 0.22),
          mat
        );
        temple.position.set(sx * 0.215, baseY + 0.005, baseZ - 0.11);
        group.add(temple);
      }
    };

    // Clear safety glasses
    const clearGrp = this.glassesGroups.clear;
    addTemples(clearGrp, this.frameMat);
    const clearBridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.016), this.frameMat);
    clearBridge.position.set(0, baseY + 0.015, baseZ + 0.008);
    clearGrp.add(clearBridge);
    for (const ex of [-0.082, 0.082]) {
      const rim = new THREE.Mesh(
        createRoundedBoxGeometry(0.11, 0.072, 0.018, 0.015),
        this.frameMat
      );
      rim.position.set(ex, baseY, baseZ);
      clearGrp.add(rim);
      const glass = new THREE.Mesh(
        createRoundedBoxGeometry(0.095, 0.058, 0.022, 0.01),
        this.lensMat
      );
      glass.position.set(ex, baseY, baseZ + 0.002);
      clearGrp.add(glass);
    }

    // Amber sport visor
    const amberGrp = this.glassesGroups.amber;
    const amberMat = new THREE.MeshPhysicalMaterial({
      color: '#F59E0B',
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
      clearcoat: 1.0,
    });
    addTemples(amberGrp, this.frameMat);
    const amberVisor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.242, 0.242, 0.072, 24, 1, true, -Math.PI * 0.28, Math.PI * 0.56),
      amberMat
    );
    amberVisor.position.set(0, baseY, 0.01);
    amberGrp.add(amberVisor);
    const amberTopBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.244, 0.244, 0.014, 24, 1, true, -Math.PI * 0.28, Math.PI * 0.56),
      this.frameMat
    );
    amberTopBar.position.set(0, baseY + 0.038, 0.01);
    amberGrp.add(amberTopBar);

    // Tinted dark shades
    const tintedGrp = this.glassesGroups.tinted;
    const darkLens = new THREE.MeshPhysicalMaterial({
      color: '#090D16',
      roughness: 0.08,
      metalness: 0.35,
      transparent: true,
      opacity: 0.88,
      clearcoat: 1.0,
    });
    addTemples(tintedGrp, this.bootMat);
    const tintedBridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.018), this.bootMat);
    tintedBridge.position.set(0, baseY + 0.018, baseZ + 0.008);
    tintedGrp.add(tintedBridge);
    for (const ex of [-0.082, 0.082]) {
      const frame = new THREE.Mesh(
        createRoundedBoxGeometry(0.115, 0.072, 0.02, 0.014),
        this.bootMat
      );
      frame.position.set(ex, baseY, baseZ);
      tintedGrp.add(frame);
      const lens = new THREE.Mesh(
        createRoundedBoxGeometry(0.098, 0.056, 0.024, 0.01),
        darkLens
      );
      lens.position.set(ex, baseY, baseZ + 0.002);
      tintedGrp.add(lens);
    }

    // Cyan VDC laser visor
    const cyanGrp = this.glassesGroups.cyan_visor;
    const cyanMat = new THREE.MeshPhysicalMaterial({
      color: '#22D3EE',
      emissive: '#0891B2',
      emissiveIntensity: 0.35,
      roughness: 0.08,
      metalness: 0.2,
      transparent: true,
      opacity: 0.78,
      clearcoat: 1.0,
    });
    addTemples(cyanGrp, this.frameMat);
    const cyanVisor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.244, 0.244, 0.078, 28, 1, true, -Math.PI * 0.3, Math.PI * 0.6),
      cyanMat
    );
    cyanVisor.position.set(0, baseY, 0.01);
    cyanGrp.add(cyanVisor);

    Object.values(this.glassesGroups).forEach((grp) => {
      grp.visible = false;
      this.characterGroup.add(grp);
    });
  }

  public applyConfig(config: AvatarConfig): void {
    if (this.disposed) return;
    this.helmetMat.color.set(config.helmetColor);
    this.skinMat.color.set(config.skinColor);
    this.vestMat.color.set(config.vestColor);

    (Object.keys(this.glassesGroups) as GlassesStyle[]).forEach((style) => {
      this.glassesGroups[style].visible = style === config.glassesStyle;
    });
    this.requestRender();
  }

  public resetCamera(): void {
    this.camera.position.set(1.65, 1.48, 2.75);
    this.controls.target.set(0, 0.95, 0);
    this.controls.update();
    this.requestRender();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  private requestRender(): void {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      const needsMore = this.controls.update();
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (!this.disposed && (this.renderDirty || needsMore)) {
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
    this.resizeObserver.disconnect();
    this.controls.dispose();
    disposeObjectHierarchy(this.scene);
    this.envTex.dispose();
    this.renderer.dispose();
  }
}
