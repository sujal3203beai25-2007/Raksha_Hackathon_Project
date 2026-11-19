import * as THREE from 'three';

export interface CorridorNodeMeta {
  id: string;
  name: string;
  tier: 'PHC' | 'SDH' | 'DH' | 'ALS';
  subtitle: string;
  capabilitySummary: string;
  position: THREE.Vector3;
  cameraOffset: THREE.Vector3;
}

export const CORRIDOR_CONTROL_POINTS = [
  new THREE.Vector3(-42, 0, 26),
  new THREE.Vector3(-24, 0, 15),
  new THREE.Vector3(-6, 0, 12),
  new THREE.Vector3(10, 0, 2),
  new THREE.Vector3(24, 0, -10),
  new THREE.Vector3(42, 0, -24),
];

/**
 * Deterministic heightfield for the Western Ghats / rural Pune-Satara plateau.
 * River bed dips cleanly near x = -4..4; facilities sit on stable elevated pads.
 */
export function groundHeightAt(x: number, z: number): number {
  const ridgeWest = Math.max(0, -x - 16) * 0.085;
  const ridgeNorth = Math.max(0, -z - 18) * 0.07;
  const gentleRoll =
    Math.sin(x * 0.055) * 0.75 +
    Math.cos(z * 0.065) * 0.65 +
    Math.sin((x + z) * 0.03) * 0.45;
  // River trench cutting roughly along x = 2 + 4 * sin(z * 0.04)
  const riverCenterX = 2 + Math.sin(z * 0.045) * 5;
  const distToRiver = Math.abs(x - riverCenterX);
  const riverDip = distToRiver < 7 ? -1.85 * Math.cos((distToRiver / 7) * (Math.PI * 0.5)) : 0;

  let h = 0.8 + ridgeWest + ridgeNorth + gentleRoll + riverDip;

  // Flatten local construction pads around PHC (-38, 22), SDH (-10, 14), and DH (38, -22)
  const pads: Array<[number, number, number, number]> = [
    [-38, 22, 9, 2.2],
    [-10, 14, 10, 1.5],
    [38, -22, 13, 2.6],
  ];
  for (const [px, pz, radius, padH] of pads) {
    const d = Math.hypot(x - px, z - pz);
    if (d < radius) {
      const blend = 1 - THREE.MathUtils.smoothstep(d, radius * 0.5, radius);
      h = THREE.MathUtils.lerp(h, padH, blend);
    }
  }
  return h;
}

export function createSurfaceTexture(
  kind: 'concrete' | 'terracotta' | 'asphalt' | 'medical' | 'helipad',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (kind === 'concrete') {
    ctx.fillStyle = '#e8edf2';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 600; i += 1) {
      const shade = 216 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    ctx.strokeStyle = 'rgba(16,36,58,0.08)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  } else if (kind === 'terracotta') {
    ctx.fillStyle = '#c45b3d';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(72,22,12,0.28)';
    ctx.lineWidth = 3;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let x = 0; x < 256; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  } else if (kind === 'asphalt') {
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i += 1) {
      const v = 36 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    ctx.fillStyle = '#f6e05e';
    ctx.fillRect(0, 124, 256, 8);
  } else if (kind === 'helipad') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(78, 66, 20, 124);
    ctx.fillRect(158, 66, 20, 124);
    ctx.fillRect(98, 118, 60, 20);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#c81e1e';
    ctx.fillRect(104, 48, 48, 160);
    ctx.fillRect(48, 104, 160, 48);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

function addContactShadow(parent: THREE.Group, rx: number, rz: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  grad.addColorStop(0, 'rgba(10,18,28,0.42)');
  grad.addColorStop(1, 'rgba(10,18,28,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(rx * 2, rz * 2),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  parent.add(shadow);
}

function markInteractive(group: THREE.Group, id: string) {
  group.traverse((obj) => {
    obj.layers.enable(1);
    obj.userData.nodeId = id;
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

/**
 * Primary Health Centre (PHC): 6-part rural clinic with pitched terracotta roof,
 * shaded verandah, solar rooftop array, and battery cabinet.
 */
export function createPhcGroup(
  concreteTex: THREE.CanvasTexture,
  terracottaTex: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'node-phc';

  const plinthMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.9, metalness: 0.02 });
  const wallMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: '#f8fafc', roughness: 0.84, metalness: 0.04 });
  const roofMat = new THREE.MeshStandardMaterial({ map: terracottaTex, roughness: 0.78, metalness: 0.05 });
  const tealMat = new THREE.MeshStandardMaterial({ color: '#087f8c', roughness: 0.35, metalness: 0.25 });
  const solarMat = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.16, metalness: 0.65 });

  // 1. Plinth base (bottom flush at y=0)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.55, 6.8), plinthMat);
  plinth.position.y = 0.275;
  group.add(plinth);

  // 2. Main clinical block (extruded chamfered footprint)
  const shape = new THREE.Shape();
  shape.moveTo(-4, -2.6);
  shape.lineTo(4, -2.6);
  shape.lineTo(4, 2.2);
  shape.lineTo(-4, 2.2);
  shape.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.1, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  bodyGeo.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, wallMat);
  body.position.y = 0.55;
  group.add(body);

  // 3. Pitched roof ridge prism
  const roofGeo = new THREE.ConeGeometry(5.8, 1.85, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.scale.set(1.06, 1, 0.74);
  roof.position.y = 4.6;
  group.add(roof);

  // 4. Shaded front verandah awning + pillars
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 1.8), tealMat);
  awning.position.set(0, 2.75, 3.0);
  group.add(awning);

  for (const px of [-2.2, 2.2]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.2, 12), wallMat);
    col.position.set(px, 1.65, 3.65);
    group.add(col);
  }

  // 5. Solar PV array
  const solar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.5), solarMat);
  solar.position.set(-1.5, 4.45, -1.1);
  solar.rotation.x = 0.34;
  group.add(solar);

  // 6. Medical signboard fascia
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.18), tealMat);
  sign.position.set(0, 3.25, 2.35);
  group.add(sign);

  addContactShadow(group, 6.2, 5.0);
  markInteractive(group, 'phc-velhe');
  return group;
}

/**
 * Sub-District Hospital (SDH): 7-part referral node with emergency awning,
 * diagnostic wing, and courtyard plinth.
 */
export function createSdhGroup(
  concreteTex: THREE.CanvasTexture,
  medicalTex: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'node-sdh';

  const plinthMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.88 });
  const wallMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: '#f1f5f9', roughness: 0.78 });
  const accentMat = new THREE.MeshStandardMaterial({ color: '#087f8c', roughness: 0.32, metalness: 0.3 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#10243a', roughness: 0.42, metalness: 0.55 });
  const crossMat = new THREE.MeshStandardMaterial({ map: medicalTex, roughness: 0.35 });

  // 1. Stepped plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.65, 9.2), plinthMat);
  plinth.position.y = 0.325;
  group.add(plinth);

  // 2. Main two-storey L-wing (extruded)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-5.2, -3.6);
  wingShape.lineTo(5.2, -3.6);
  wingShape.lineTo(5.2, 0.4);
  wingShape.lineTo(1.1, 0.4);
  wingShape.lineTo(1.1, 3.5);
  wingShape.lineTo(-5.2, 3.5);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 4.8, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 });
  wingGeo.rotateX(-Math.PI / 2);
  const wing = new THREE.Mesh(wingGeo, wallMat);
  wing.position.y = 0.65;
  group.add(wing);

  // 3. Rooftop cornice trim
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.35, 4.4), accentMat);
  cornice.position.set(0, 5.55, -1.6);
  group.add(cornice);

  // 4. Ambulance bay portico
  const portico = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, 3.2), darkMetal);
  portico.position.set(3.2, 3.1, 2.2);
  group.add(portico);

  // 5. Portico structural piers
  for (const px of [1.6, 4.8]) {
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.45, 14), accentMat);
    pier.position.set(px, 1.85, 3.3);
    group.add(pier);
  }

  // 6. Diagnostic rooftop chiller / HVAC
  const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 1.8), darkMetal);
  hvac.position.set(-2.4, 5.9, -1.2);
  group.add(hvac);

  // 7. Emergency emblem panel
  const cross = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.15), crossMat);
  cross.position.set(3.2, 4.2, 0.55);
  group.add(cross);

  addContactShadow(group, 7.8, 6.2);
  markInteractive(group, 'sdh-baramati');
  return group;
}

export interface DistrictHubHandles {
  group: THREE.Group;
  upperIcuFloor: THREE.Group;
  helipadCrown: THREE.Group;
}

/**
 * District Trauma & Referral Hub (10+ parts) with explodable upper ICU floor & helipad crown.
 */
export function createDistrictHubGroup(
  concreteTex: THREE.CanvasTexture,
  helipadTex: THREE.CanvasTexture,
  medicalTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): DistrictHubHandles {
  const group = new THREE.Group();
  group.name = 'node-dh';

  const plinthMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.88 });
  const wallMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: '#f8fafc', roughness: 0.72 });
  const navyMat = new THREE.MeshStandardMaterial({ color: '#10243a', roughness: 0.38, metalness: 0.5 });
  const tealMat = new THREE.MeshStandardMaterial({ color: '#087f8c', roughness: 0.28, metalness: 0.35 });
  const glassMat = isSoftwareGl
    ? new THREE.MeshStandardMaterial({ color: '#7dd3fc', roughness: 0.14, metalness: 0.25, transparent: true, opacity: 0.65 })
    : new THREE.MeshPhysicalMaterial({ color: '#a5f3fc', roughness: 0.08, transmission: 0.65, thickness: 0.4, ior: 1.5 });
  const oxygenVesselMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.28, metalness: 0.72 });

  // 1. Stepped arrival plinth + ramp
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.85, 13.5), plinthMat);
  plinth.position.y = 0.425;
  group.add(plinth);

  // 2. Ground Emergency & Triage Concourse (extruded rounded silhouette)
  const groundShape = new THREE.Shape();
  groundShape.moveTo(-7.2, -4.6);
  groundShape.lineTo(7.2, -4.6);
  groundShape.lineTo(7.2, 3.6);
  groundShape.lineTo(-7.2, 3.6);
  groundShape.closePath();
  const groundGeo = new THREE.ExtrudeGeometry(groundShape, { depth: 4.0, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 2 });
  groundGeo.rotateX(-Math.PI / 2);
  const groundWing = new THREE.Mesh(groundGeo, wallMat);
  groundWing.position.y = 0.85;
  group.add(groundWing);

  // 3. Curved Glass Atrium Curtain Wall
  const atrium = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.3, 4.2, 24, 1, false, -Math.PI * 0.5, Math.PI), glassMat);
  atrium.position.set(0, 2.95, 3.65);
  group.add(atrium);

  // 4. Ambulance Bay Canopy + Support Columns
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.35, 3.6), navyMat);
  canopy.position.set(-4.6, 3.7, 5.1);
  group.add(canopy);
  for (const cx of [-7.2, -2.2]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.85, 14), tealMat);
    col.position.set(cx, 2.28, 6.2);
    group.add(col);
  }

  // 5. Liquid Medical Oxygen (LMO) Cryo-Vessel (LatheGeometry) + Vaporizer Pipe (TubeGeometry)
  const vesselProfile = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(1.05, 0.05),
    new THREE.Vector2(1.12, 0.5),
    new THREE.Vector2(1.12, 3.4),
    new THREE.Vector2(0.82, 4.05),
    new THREE.Vector2(0.01, 4.25),
  ];
  const vessel = new THREE.Mesh(new THREE.LatheGeometry(vesselProfile, 22), oxygenVesselMat);
  vessel.position.set(6.7, 0.85, -3.5);
  group.add(vessel);

  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(6.7, 2.0, -2.5),
    new THREE.Vector3(6.7, 2.0, -1.2),
    new THREE.Vector3(5.6, 2.4, -0.8),
  ]);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 14, 0.13, 10, false), tealMat);
  group.add(pipe);

  // 6. Medical Cross Beacon Sign
  const medCross = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.7, 0.2),
    new THREE.MeshStandardMaterial({ map: medicalTex, roughness: 0.3 })
  );
  medCross.position.set(-4.6, 4.9, 3.85);
  group.add(medCross);

  // 7. Explodable Upper ICU & Trauma Ward Floor
  const upperIcuFloor = new THREE.Group();
  upperIcuFloor.position.y = 4.9;
  const icuBody = new THREE.Mesh(new THREE.BoxGeometry(13.2, 3.4, 7.6), wallMat);
  icuBody.position.y = 1.7;
  upperIcuFloor.add(icuBody);

  const icuBand = new THREE.Mesh(new THREE.BoxGeometry(13.45, 0.8, 7.85), glassMat);
  icuBand.position.y = 1.9;
  upperIcuFloor.add(icuBand);

  const icuTrim = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.35, 8.0), tealMat);
  icuTrim.position.y = 3.5;
  upperIcuFloor.add(icuTrim);
  group.add(upperIcuFloor);

  // 8. Explodable Rooftop Helipad & Communications Mast
  const helipadCrown = new THREE.Group();
  helipadCrown.position.y = 8.6;
  const helipadDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.6, 0.35, 28),
    new THREE.MeshStandardMaterial({ map: helipadTex, roughness: 0.65 })
  );
  helipadDeck.position.set(-2.2, 0.2, 0);
  helipadCrown.add(helipadDeck);

  const commsMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 3.6, 10), navyMat);
  commsMast.position.set(4.6, 1.8, -1.8);
  helipadCrown.add(commsMast);

  const radarDish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), oxygenVesselMat);
  radarDish.rotation.x = Math.PI * 0.72;
  radarDish.position.set(4.6, 3.1, -1.5);
  helipadCrown.add(radarDish);
  group.add(helipadCrown);

  addContactShadow(group, 10.5, 8.2);
  markInteractive(group, 'dh-pune');
  return { group, upperIcuFloor, helipadCrown };
}

export interface AmbulanceHandles {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  beaconRed: THREE.Mesh;
  beaconBlue: THREE.Mesh;
}

/**
 * Multi-part ALS Ambulance unit (11 parts) with spinning wheels & alternating lightbar.
 */
export function createAmbulanceGroup(
  medicalTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): AmbulanceHandles {
  const group = new THREE.Group();
  group.name = 'node-ambulance';

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.2,
    metalness: 0.1,
    clearcoat: 0.75,
    clearcoatRoughness: 0.15,
  });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#087f8c', roughness: 0.35, metalness: 0.2 });
  const darkTrimMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7, metalness: 0.25 });
  const glassMat = isSoftwareGl
    ? new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.1, transparent: true, opacity: 0.7 })
    : new THREE.MeshPhysicalMaterial({ color: '#7dd3fc', roughness: 0.06, transmission: 0.6, thickness: 0.2 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.88 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.85 });

  // 1. Extruded side-profile ambulance silhouette
  const profile = new THREE.Shape();
  profile.moveTo(-2.1, 0.32);
  profile.lineTo(2.0, 0.32);
  profile.lineTo(2.05, 0.95);
  profile.lineTo(1.45, 1.55);
  profile.lineTo(-2.05, 1.55);
  profile.lineTo(-2.1, 0.32);
  const chassisGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.56,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  chassisGeo.translate(0, 0, -0.78);
  chassisGeo.rotateY(-Math.PI / 2); // Forward along +Z
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  group.add(chassis);

  // 2. Teal high-visibility side rescue stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.24, 3.8), stripeMat);
  stripe.position.set(0, 0.82, -0.1);
  group.add(stripe);

  // 3. Recessed windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.56, 0.14), glassMat);
  windshield.position.set(0, 1.24, 1.68);
  windshield.rotation.x = -0.45;
  group.add(windshield);

  // 4. Front & rear bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.22, 0.26), darkTrimMat);
  frontBumper.position.set(0, 0.36, 2.02);
  group.add(frontBumper);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.22, 0.24), darkTrimMat);
  rearBumper.position.set(0, 0.36, -2.08);
  group.add(rearBumper);

  // 5. Roof climate pod + lightbar housing
  const roofPod = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 1.5), bodyMat);
  roofPod.position.set(0, 1.66, -0.55);
  group.add(roofPod);

  const beaconRed = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#dc2626', emissiveIntensity: 1.4, roughness: 0.15 })
  );
  beaconRed.position.set(-0.32, 1.68, 1.05);
  group.add(beaconRed);

  const beaconBlue = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 1.4, roughness: 0.15 })
  );
  beaconBlue.position.set(0.32, 1.68, 1.05);
  group.add(beaconBlue);

  // 6. Roof cross emblem
  const roofCross = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
    new THREE.MeshStandardMaterial({ map: medicalTex, roughness: 0.35 })
  );
  roofCross.rotation.x = -Math.PI / 2;
  roofCross.position.set(0, 1.76, -0.55);
  group.add(roofCross);

  // 7-10. Four multi-part wheels
  const wheels: THREE.Object3D[] = [];
  const wheelCoords: Array<[number, number]> = [
    [-0.86, 1.25],
    [0.86, 1.25],
    [-0.86, -1.25],
    [0.86, -1.25],
  ];
  for (const [wx, wz] of wheelCoords) {
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(wx, 0.34, wz);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 18), tireMat);
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelPivot.add(tire, rim);
    group.add(wheelPivot);
    wheels.push(wheelPivot);
  }

  addContactShadow(group, 1.4, 2.4);
  markInteractive(group, 'als-ambulance');
  return { group, wheels, beaconRed, beaconBlue };
}

/**
 * Generates terrain plateau mesh, river strip, highway corridor ribbon + bridge,
 * and 72 instanced rural Western Ghats trees with per-instance color/scale variation.
 */
export function createCorridorEnvironment(
  asphaltTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): {
  envGroup: THREE.Group;
  roadCurve: THREE.CatmullRomCurve3;
} {
  const envGroup = new THREE.Group();

  // 1. Displaced terrain mesh with vertex color shading
  const size = 140;
  const segs = 76;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color('#6f8f5e');
  const cMid = new THREE.Color('#84a36e');
  const cHigh = new THREE.Color('#9c9b7a');
  const cSand = new THREE.Color('#8d7c65');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeightAt(x, z);
    pos.setY(i, y);

    if (y < 0.35) tmpColor.copy(cSand);
    else if (y < 2.2) tmpColor.copy(cLow).lerp(cMid, THREE.MathUtils.clamp((y - 0.35) / 1.85, 0, 1));
    else tmpColor.copy(cMid).lerp(cHigh, THREE.MathUtils.clamp((y - 2.2) / 3.5, 0, 1));

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  terrainGeo.computeTangents();

  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    })
  );
  terrain.receiveShadow = !isSoftwareGl;
  envGroup.add(terrain);

  // 2. River surface ribbon inside trench
  const riverGeo = new THREE.PlaneGeometry(11, 136, 8, 36);
  riverGeo.rotateX(-Math.PI / 2);
  const rPos = riverGeo.attributes.position;
  for (let i = 0; i < rPos.count; i += 1) {
    const rx = rPos.getX(i);
    const rz = rPos.getZ(i);
    rPos.setX(i, rx + 2 + Math.sin(rz * 0.045) * 5);
    rPos.setY(i, 0.18);
  }
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshStandardMaterial({
      color: '#0e7490',
      roughness: 0.14,
      metalness: 0.35,
    })
  );
  river.receiveShadow = !isSoftwareGl;
  envGroup.add(river);

  // 3. Road CatmullRomCurve3 hugging terrain (with elevated bridge span across river)
  const elevatedPts = CORRIDOR_CONTROL_POINTS.map((p) => {
    const groundY = groundHeightAt(p.x, p.z);
    const bridgeFloor = Math.max(groundY, 1.45);
    return new THREE.Vector3(p.x, bridgeFloor + 0.18, p.z);
  });
  const roadCurve = new THREE.CatmullRomCurve3(elevatedPts, false, 'catmullrom', 0.45);

  const roadTex = asphaltTex.clone();
  roadTex.needsUpdate = true;
  roadTex.repeat.set(22, 1);

  const roadSamples = 96;
  const roadHalfW = 1.65;
  const rVerts: number[] = [];
  const rUvs: number[] = [];
  const rIndices: number[] = [];
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (let i = 0; i <= roadSamples; i += 1) {
    const u = i / roadSamples;
    roadCurve.getPointAt(u, p);
    roadCurve.getTangentAt(u, tan);
    side.set(-tan.z, 0, tan.x).normalize().multiplyScalar(roadHalfW);

    rVerts.push(p.x - side.x, p.y, p.z - side.z);
    rVerts.push(p.x + side.x, p.y, p.z + side.z);
    rUvs.push(u * 16, 0, u * 16, 1);

    if (i < roadSamples) {
      const idx = i * 2;
      rIndices.push(idx, idx + 1, idx + 2, idx + 1, idx + 3, idx + 2);
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rVerts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
  roadGeo.setIndex(rIndices);
  roadGeo.computeVertexNormals();

  const roadMesh = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.85,
      metalness: 0.05,
    })
  );
  roadMesh.receiveShadow = !isSoftwareGl;
  envGroup.add(roadMesh);

  // Bridge piers near x=0..5 along road curve u=0.45..0.58
  const pierMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.86 });
  for (const bu of [0.46, 0.51, 0.56]) {
    const bp = roadCurve.getPointAt(bu);
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.44, 3.2, 10), pierMat);
    pier.position.set(bp.x, bp.y - 1.65, bp.z);
    pier.castShadow = !isSoftwareGl;
    envGroup.add(pier);
  }

  // 4. Instanced Western Ghats Trees (72 instances with per-instance color/scale)
  const treeCount = 72;
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 1.5, 7);
  trunkGeo.translate(0, 0.75, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.92 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);

  const canopyGeo = new THREE.DodecahedronGeometry(1.15, 1);
  canopyGeo.translate(0, 2.25, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);

  const dummy = new THREE.Object3D();
  const cShade = new THREE.Color();
  let placed = 0;
  let attempt = 0;

  // Deterministic pseudo-random helper
  const seeded = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  while (placed < treeCount && attempt < 400) {
    attempt += 1;
    const x = (seeded(attempt * 3 + 1) - 0.5) * 118;
    const z = (seeded(attempt * 3 + 2) - 0.5) * 118;
    const y = groundHeightAt(x, z);
    // Keep away from river bed and hospital pads/road
    if (y < 0.75) continue;
    const nearPad =
      Math.hypot(x - -38, z - 22) < 11 ||
      Math.hypot(x - -10, z - 14) < 12 ||
      Math.hypot(x - 38, z - -22) < 15;
    if (nearPad) continue;

    // Keep clear of road corridor
    let tooCloseToRoad = false;
    for (let s = 0; s <= 12; s += 1) {
      const rp = roadCurve.getPointAt(s / 12);
      if (Math.hypot(x - rp.x, z - rp.z) < 5.2) {
        tooCloseToRoad = true;
        break;
      }
    }
    if (tooCloseToRoad) continue;

    const scale = 0.75 + seeded(attempt * 5 + 3) * 0.75;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, seeded(attempt * 7) * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.9 + seeded(attempt * 11) * 0.35), scale);
    dummy.updateMatrix();

    trunks.setMatrixAt(placed, dummy.matrix);
    canopies.setMatrixAt(placed, dummy.matrix);
    cShade.setHSL(0.28 + (seeded(attempt * 13) - 0.5) * 0.06, 0.42, 0.28 + seeded(attempt * 17) * 0.14);
    canopies.setColorAt(placed, cShade);
    placed += 1;
  }

  trunks.count = placed;
  canopies.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  canopies.computeBoundingSphere();
  trunks.castShadow = !isSoftwareGl;
  canopies.castShadow = !isSoftwareGl;
  canopies.receiveShadow = !isSoftwareGl;
  envGroup.add(trunks, canopies);

  return { envGroup, roadCurve };
}
