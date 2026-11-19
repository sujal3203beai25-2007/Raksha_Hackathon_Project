import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CorridorNodeMeta,
  createAmbulanceGroup,
  createCorridorEnvironment,
  createDistrictHubGroup,
  createPhcGroup,
  createSdhGroup,
  createSurfaceTexture,
  groundHeightAt,
} from './proceduralModels.ts';

export type LightingPreset = 'day' | 'dusk' | 'night';
export type CameraPreset = 'overview' | 'phc' | 'sdh' | 'dh' | 'ambulance';

export interface CorridorSceneController {
  setLightingPreset: (preset: LightingPreset) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setCutawayAmount: (amount: number) => void;
  setAmbulancePlaying: (playing: boolean) => void;
  dispose: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    let rendererStr = '';
    if (ext) {
      rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    } else {
      rendererStr = String(gl.getParameter(gl.RENDERER) || '');
    }
    const isSoft = /SwiftShader|llvmpipe|Mesa|Software|Microsoft Basic Render/i.test(rendererStr);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoft;
  } catch {
    return true;
  }
}

// Pre-allocated vectors/matrices outside render loop (zero per-frame GC allocation)
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();

export function mountCorridorScene(
  container: HTMLElement,
  callbacks: {
    onSelectNode: (node: CorridorNodeMeta) => void;
    onTelemetry?: (info: { isSoftwareGl: boolean; ambulanceProgressPct: number }) => void;
  }
): CorridorSceneController {
  const isSoftwareGl = detectSoftwareGl();

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 540;

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const daySky = new THREE.Color('#dbeafe');
  const duskSky = new THREE.Color('#fed7aa');
  const nightSky = new THREE.Color('#0b1523');
  scene.background = daySky.clone();
  const fog = new THREE.FogExp2('#dbeafe', 0.0046);
  scene.fog = fog;

  // Environment IBL via RoomEnvironment on all devices
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 280);
  camera.position.set(14, 34, 62);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 10;
  controls.maxDistance = 115;
  controls.target.set(0, 3, 2);
  controls.update();

  let cameraLerping = false;
  controls.addEventListener('start', () => {
    cameraLerping = false;
  });

  // Outdoor Key + Fill Lighting Rig
  const hemiLight = new THREE.HemisphereLight('#bae6fd', '#5c4f3d', 0.85);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#fff5e4', 2.45);
  sunLight.position.set(36, 52, 28);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 150;
  const d = 62;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.radius = 2.5;
  scene.add(sunLight);

  // Textures & Environment
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const concreteTex = createSurfaceTexture('concrete', maxAniso);
  const terracottaTex = createSurfaceTexture('terracotta', maxAniso);
  const asphaltTex = createSurfaceTexture('asphalt', maxAniso);
  const medicalTex = createSurfaceTexture('medical', maxAniso);
  const helipadTex = createSurfaceTexture('helipad', maxAniso);

  const { envGroup, roadCurve } = createCorridorEnvironment(asphaltTex, isSoftwareGl);
  scene.add(envGroup);

  // Place Facility Structures flush on groundHeightAt(x, z)
  const phcPos = new THREE.Vector3(-38, groundHeightAt(-38, 22), 22);
  const phcGroup = createPhcGroup(concreteTex, terracottaTex);
  phcGroup.position.copy(phcPos);
  phcGroup.rotation.y = 0.45;
  scene.add(phcGroup);

  const sdhPos = new THREE.Vector3(-10, groundHeightAt(-10, 14), 14);
  const sdhGroup = createSdhGroup(concreteTex, medicalTex);
  sdhGroup.position.copy(sdhPos);
  sdhGroup.rotation.y = -0.25;
  scene.add(sdhGroup);

  const dhPos = new THREE.Vector3(38, groundHeightAt(38, -22), -22);
  const dhHandles = createDistrictHubGroup(concreteTex, helipadTex, medicalTex, isSoftwareGl);
  dhHandles.group.position.copy(dhPos);
  dhHandles.group.rotation.y = -0.45;
  scene.add(dhHandles.group);

  // Animated ALS Ambulance
  const ambulance = createAmbulanceGroup(medicalTex, isSoftwareGl);
  scene.add(ambulance.group);

  const nodeCatalog: Record<string, CorridorNodeMeta> = {
    'phc-velhe': {
      id: 'phc-velhe',
      name: 'Velhe Primary Health Centre (PHC)',
      tier: 'PHC',
      subtitle: 'Tier 1 Stabilization & Antenatal Screening',
      capabilitySummary: 'First-contact stabilization, ASHA handover, solar cold-chain vaccine & maternal stabilization.',
      position: phcPos.clone(),
      cameraOffset: new THREE.Vector3(-22, 16, 42),
    },
    'sdh-baramati': {
      id: 'sdh-baramati',
      name: 'Sub-District Hospital Corridor Node',
      tier: 'SDH',
      subtitle: 'Tier 2 Surgical & Obstetric Escalation',
      capabilitySummary: '24x7 emergency maternity stabilization, diagnostics annex, and ALS transfer staging bay.',
      position: sdhPos.clone(),
      cameraOffset: new THREE.Vector3(-2, 18, 36),
    },
    'dh-pune': {
      id: 'dh-pune',
      name: 'District Trauma & Referral Hub',
      tier: 'DH',
      subtitle: 'Tier 3 ICU, Helipad & Liquid Oxygen Centre',
      capabilitySummary: 'Multi-level trauma receiving bay, LMO cryo manifold, rooftop helipad, and explodable ICU floor inspection.',
      position: dhPos.clone(),
      cameraOffset: new THREE.Vector3(20, 22, 6),
    },
    'als-ambulance': {
      id: 'als-ambulance',
      name: 'MH-12 ALS Emergency Unit',
      tier: 'ALS',
      subtitle: 'Consent-Gated En-Route Transfer',
      capabilitySummary: 'Real-time corridor simulation showing PHC -> SDH -> District Trauma escalation pathway.',
      position: new THREE.Vector3(),
      cameraOffset: new THREE.Vector3(),
    },
  };

  // Pre-compile scene shaders before first frame on hardware GPUs
  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Click / Tap Raycaster on Layer 1
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;

  const onPointerDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const nodeId = hit.object.userData?.nodeId as string | undefined;
      if (nodeId && nodeCatalog[nodeId]) {
        const meta = nodeCatalog[nodeId];
        if (nodeId === 'als-ambulance') {
          meta.position.copy(ambulance.group.position);
        }
        callbacks.onSelectNode(meta);
        break;
      }
    }
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  // ResizeObserver
  const onResize = () => {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 540;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  // Animation state
  let cutawayTarget = 0;
  let cutawayCurrent = 0;
  let ambulancePlaying = true;
  let followAmbulance = false;
  let ambulanceProgress = 0.08;
  let beaconTimer = 0;
  let telemetryCooldown = 0;
  let lastTime = performance.now();
  let rafId = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const animate = (now: number) => {
    if (disposed) return;
    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;
    const delta = Math.min(rawDelta, 0.05);

    // 1. Cutaway ICU & Helipad floor lift via MathUtils.damp
    cutawayCurrent = THREE.MathUtils.damp(cutawayCurrent, cutawayTarget, 5.5, delta);
    dhHandles.upperIcuFloor.position.y = 4.9 + cutawayCurrent * 4.2;
    dhHandles.helipadCrown.position.y = 8.6 + cutawayCurrent * 7.8;

    // 2. Ambulance corridor traversal + spinning wheels + lightbar pulse
    if (ambulancePlaying) {
      ambulanceProgress = (ambulanceProgress + delta * 0.045) % 1;
      for (const w of ambulance.wheels) {
        w.rotation.x += delta * 11;
      }
    }
    roadCurve.getPointAt(ambulanceProgress, _pos);
    roadCurve.getTangentAt(ambulanceProgress, _tan);
    ambulance.group.position.copy(_pos);
    _lookTarget.copy(_pos).add(_tan);
    _mat.lookAt(_lookTarget, _pos, _up);
    _quat.setFromRotationMatrix(_mat);
    ambulance.group.quaternion.copy(_quat);

    beaconTimer += delta * 8;
    const flash = Math.sin(beaconTimer) > 0;
    (ambulance.beaconRed.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 2.4 : 0.25;
    (ambulance.beaconBlue.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 0.25 : 2.4;

    // 3. Smooth camera transition
    if (followAmbulance) {
      _camGoalTarget.copy(_pos).add(new THREE.Vector3(0, 1.5, 0));
      _camGoalPos.copy(_pos).add(new THREE.Vector3(-9, 8.5, 13));
      camera.position.lerp(_camGoalPos, 1 - Math.exp(-3.5 * delta));
      controls.target.lerp(_camGoalTarget, 1 - Math.exp(-4.5 * delta));
    } else if (cameraLerping) {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoalPos.x, 4.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoalPos.y, 4.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoalPos.z, 4.5, delta);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, _camGoalTarget.x, 5, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, _camGoalTarget.y, 5, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, _camGoalTarget.z, 5, delta);
      if (camera.position.distanceTo(_camGoalPos) < 0.25) {
        cameraLerping = false;
      }
    }

    telemetryCooldown += delta;
    if (telemetryCooldown >= 0.4) {
      telemetryCooldown = 0;
      callbacks.onTelemetry?.({
        isSoftwareGl,
        ambulanceProgressPct: Math.round(ambulanceProgress * 100),
      });
    }

    controls.update();
    renderer.render(scene, camera);

    if (isSoftwareGl) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) gl.deleteSync(sync);
      }
      timeoutId = setTimeout(() => {
        if (!disposed) rafId = requestAnimationFrame(animate);
      }, 16);
    } else {
      rafId = requestAnimationFrame(animate);
    }
  };

  rafId = requestAnimationFrame(animate);

  return {
    setLightingPreset: (preset: LightingPreset) => {
      if (preset === 'day') {
        scene.background = daySky.clone();
        fog.color.copy(daySky);
        sunLight.color.set('#fff5e4');
        sunLight.intensity = 2.45;
        sunLight.position.set(36, 52, 28);
        hemiLight.color.set('#bae6fd');
        hemiLight.groundColor.set('#5c4f3d');
        hemiLight.intensity = 0.85;
        renderer.toneMappingExposure = 1.1;
      } else if (preset === 'dusk') {
        scene.background = duskSky.clone();
        fog.color.copy(duskSky);
        sunLight.color.set('#fb923c');
        sunLight.intensity = 2.1;
        sunLight.position.set(-48, 18, 22);
        hemiLight.color.set('#fdba74');
        hemiLight.groundColor.set('#3f2e21');
        hemiLight.intensity = 0.65;
        renderer.toneMappingExposure = 1.05;
      } else {
        scene.background = nightSky.clone();
        fog.color.copy(nightSky);
        sunLight.color.set('#93c5fd');
        sunLight.intensity = 0.75;
        sunLight.position.set(-22, 42, -30);
        hemiLight.color.set('#334155');
        hemiLight.groundColor.set('#0f172a');
        hemiLight.intensity = 0.5;
        renderer.toneMappingExposure = 1.2;
      }
    },
    setCameraPreset: (preset: CameraPreset) => {
      if (preset === 'ambulance') {
        followAmbulance = true;
        cameraLerping = false;
        callbacks.onSelectNode(nodeCatalog['als-ambulance']);
        return;
      }
      followAmbulance = false;
      cameraLerping = true;
      if (preset === 'overview') {
        _camGoalPos.set(14, 34, 62);
        _camGoalTarget.set(0, 3, 2);
      } else if (preset === 'phc') {
        const n = nodeCatalog['phc-velhe'];
        _camGoalPos.copy(n.cameraOffset);
        _camGoalTarget.copy(n.position).add(new THREE.Vector3(0, 2.2, 0));
        callbacks.onSelectNode(n);
      } else if (preset === 'sdh') {
        const n = nodeCatalog['sdh-baramati'];
        _camGoalPos.copy(n.cameraOffset);
        _camGoalTarget.copy(n.position).add(new THREE.Vector3(0, 2.6, 0));
        callbacks.onSelectNode(n);
      } else {
        const n = nodeCatalog['dh-pune'];
        _camGoalPos.copy(n.cameraOffset);
        _camGoalTarget.copy(n.position).add(new THREE.Vector3(0, 4.5, 0));
        callbacks.onSelectNode(n);
      }
    },
    setCutawayAmount: (amount: number) => {
      cutawayTarget = THREE.MathUtils.clamp(amount, 0, 1);
    },
    setAmbulancePlaying: (playing: boolean) => {
      ambulancePlaying = playing;
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            m.dispose();
          }
        }
      });
      concreteTex.dispose();
      terracottaTex.dispose();
      asphaltTex.dispose();
      medicalTex.dispose();
      helipadTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
