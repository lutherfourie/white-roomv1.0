
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Reflector } from 'three/examples/jsm/objects/Reflector';
import gsap from 'gsap';
import { SKY_VERT, NEBULA_FRAG } from '../shaders/skybox';
import { CORE_VERTEX_SHADER, CORE_FRAGMENT_SHADER, FLARE_VERTEX_SHADER, FLARE_FRAGMENT_SHADER } from '../shaders/artifact';
import { PORTAL_VERT, PORTAL_FRAG } from '../shaders/portal';
import { CINEMATIC_SHADER, VOLUMETRIC_BEAM_SHADER } from '../shaders/effects';
import { CLOUD_VERT, CLOUD_FRAG, STRUCTURE_VERT, STRUCTURE_FRAG, TRAFFIC_FRAG } from '../shaders/environment';
import { PLANET_VERT, PLANET_FRAG, RING_FRAG, ATMOSPHERE_VERT, ATMOSPHERE_FRAG } from '../shaders/planet';
import { ASTEROID_VERT, ASTEROID_FRAG } from '../shaders/asteroid';
import { OBELISK_VERT, OBELISK_BODY_FRAG, OBELISK_GLOW_FRAG } from '../shaders/obelisk';
import { PortalConfig } from '../types';

interface WorldProps {
    isLocked: boolean;
    portalConfig: PortalConfig;
    onLockChange: (isLocked: boolean) => void;
    onGazeChange: (pressure: number) => void;
}

// Global Audio Context for UI sounds (Lazy Loaded)
let uiAudioContext: AudioContext | null = null;

const initAudioContext = () => {
    if (!uiAudioContext) {
        try {
            uiAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            console.warn("AudioContext not supported");
        }
    }
    if (uiAudioContext && uiAudioContext.state === 'suspended') {
        uiAudioContext.resume();
    }
};

const playSound = (freq: number, type: OscillatorType = 'sine', dur: number = 0.1) => {
  if (!uiAudioContext) return; // Don't play if not initialized via interaction
  if (uiAudioContext.state === 'suspended') return;

  try {
    const t = uiAudioContext.currentTime;
    const osc = uiAudioContext.createOscillator();
    const gain = uiAudioContext.createGain();
    osc.connect(gain);
    gain.connect(uiAudioContext.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* ignore */ }
};

const World: React.FC<WorldProps> = ({ isLocked, portalConfig, onLockChange, onGazeChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const skyMeshRef = useRef<THREE.Mesh | null>(null);
    const gridMatRef = useRef<THREE.ShaderMaterial | null>(null);

    // References for GSAP
    const coreMatRef = useRef<THREE.ShaderMaterial | null>(null);
    const flareMatRef = useRef<THREE.ShaderMaterial | null>(null);
    const coreLightRef = useRef<THREE.PointLight | null>(null);
    const flareMeshRef = useRef<THREE.Mesh | null>(null);
    const ringsRef = useRef<THREE.Group | null>(null);
    
    // Portal Array Refs
    const obeliskArrayRef = useRef<THREE.Group | null>(null);
    const portalCurtainMeshRef = useRef<THREE.Mesh | null>(null);
    const portalCurtainMatRef = useRef<THREE.ShaderMaterial | null>(null);
    
    // Obelisk Shader Refs (for uniform updates)
    const obeliskUniformsRef = useRef<{ uTime: { value: number }, uColor: { value: THREE.Color }, uActivation: { value: number } } | null>(null);

    // Environment Refs
    const cloudsRef = useRef<THREE.InstancedMesh | null>(null);
    const megastructureRef = useRef<THREE.Group | null>(null);
    const trafficMaterials = useRef<THREE.ShaderMaterial[]>([]);
    const particlesRef = useRef<THREE.Points | null>(null);

    // Solar System Ref
    const solarSystemRef = useRef<THREE.Group | null>(null);
    const planetsRef = useRef<THREE.Mesh[]>([]);
    const asteroidBeltsRef = useRef<THREE.InstancedMesh[]>([]);

    // Post Proc
    const cinematicPassRef = useRef<ShaderPass | null>(null);
    const bloomPassRef = useRef<UnrealBloomPass | null>(null);

    // Camera Shake
    const shakeIntensity = useRef(0);
    const particleSpeedRef = useRef(1.0);

    // WORLD CONFIG
    const WORLD_RADIUS = 120;
    const PLACE_RADIUS = 112; 

    useEffect(() => {
        if (!containerRef.current) return;

        // --- SEEDED RANDOM (LCG) ---
        let seed = 8675309;
        const seededRandom = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        const randomRange = (min: number, max: number) => seededRandom() * (max - min) + min;
        const randomColor = () => new THREE.Color(seededRandom(), seededRandom(), seededRandom());

        // --- SETUP ---
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.fog = new THREE.FogExp2(0x050510, 0.003); 

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300000);
        camera.position.set(0, 1.7, 40); 

        const renderer = new THREE.WebGLRenderer({ 
            antialias: false, 
            powerPreference: "high-performance", 
            stencil: false,
            logarithmicDepthBuffer: true 
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9; 
        containerRef.current.appendChild(renderer.domElement);

        // --- POST PROCESSING ---
        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        // Bloom set to 0.0 as requested
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.0, 0.4, 0.85);
        bloomPassRef.current = bloomPass;
        composer.addPass(bloomPass);

        const cinematicPass = new ShaderPass(new THREE.ShaderMaterial(CINEMATIC_SHADER));
        cinematicPassRef.current = cinematicPass;
        composer.addPass(cinematicPass);
        
        const controls = new PointerLockControls(camera, document.body);
        
        // --- INPUTS & CONTROLS FIX ---
        const moveState = { fwd: false, bwd: false, left: false, right: false };
        const velocity = new THREE.Vector3();
        const direction = new THREE.Vector3();

        let isLockPending = false;
        let lockCooldown = false;

        const onLock = () => { 
            isLockPending = false; 
            onLockChange(true); 
        };
        const onUnlock = () => { 
            isLockPending = false; 
            onLockChange(false); 
            lockCooldown = true;
            setTimeout(() => { lockCooldown = false; }, 1200);
        };

        controls.addEventListener('lock', onLock);
        controls.addEventListener('unlock', onUnlock);
        
        const handleClick = (e: MouseEvent) => {
            // Fix: Initialize audio context on first user interaction
            initAudioContext();

            if ((e.target as HTMLElement).closest('button')) return;
            if (controls.isLocked || isLockPending || lockCooldown) return;
            isLockPending = true;
            try {
                controls.lock();
            } catch (err) {
                console.warn("Pointer lock failed:", err);
                isLockPending = false;
            }
            setTimeout(() => {
                if (isLockPending && !controls.isLocked) {
                    isLockPending = false;
                }
            }, 1000);
        };
        document.addEventListener('click', handleClick);

        const onKeyDown = (e: KeyboardEvent) => {
            switch(e.code) { 
                case 'KeyW': moveState.fwd = true; break; 
                case 'KeyS': moveState.bwd = true; break; 
                case 'KeyA': moveState.left = true; break; 
                case 'KeyD': moveState.right = true; break; 
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            switch(e.code) { 
                case 'KeyW': moveState.fwd = false; break; 
                case 'KeyS': moveState.bwd = false; break; 
                case 'KeyA': moveState.left = false; break; 
                case 'KeyD': moveState.right = false; break; 
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // --- ENTITY CREATION ---
        
        const floorGroup = new THREE.Group();
        const geometry = new THREE.CircleGeometry(WORLD_RADIUS, 128); 
        
        const mirror = new Reflector(geometry, {
            clipBias: 0.003,
            textureWidth: window.innerWidth * window.devicePixelRatio * 0.5,
            textureHeight: window.innerHeight * window.devicePixelRatio * 0.5,
            color: 0x444444
        });
        mirror.rotateX(-Math.PI / 2);
        // @ts-ignore
        mirror.material.uniforms.color.value = new THREE.Color(0x0a0a0a); 
        floorGroup.add(mirror);

        const gridGeo = new THREE.CircleGeometry(WORLD_RADIUS, 128);
        gridGeo.rotateX(-Math.PI / 2);
        
        const gridMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: { 
                uTime: { value: 0 },
                uBaseColor: { value: new THREE.Color(0x0088ff) },
                uPulseColor: { value: new THREE.Color(0xffffff) },
                uRadius: { value: WORLD_RADIUS }
            },
            vertexShader: `
                varying vec3 vPos; 
                void main() { 
                    vPos = (modelMatrix * vec4(position, 1.0)).xyz; 
                    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); 
                }
            `,
            fragmentShader: `
                varying vec3 vPos; 
                uniform float uTime;
                uniform vec3 uBaseColor;
                uniform vec3 uPulseColor;
                uniform float uRadius;

                float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
                void main() {
                    float dist = length(vPos.xz);
                    float angle = atan(vPos.z, vPos.x);
                    
                    float ringPattern = fract(dist * 0.05); 
                    float ringStr = step(0.98, ringPattern);
                    
                    float normalizedAngle = (angle + 3.14159) / 6.28318;
                    float spokePattern = fract(normalizedAngle * 48.0); 
                    float spokeStr = step(0.99, spokePattern);
                    
                    float pulsePhase = fract(dist * 0.01 - uTime * 0.1);
                    float pulseGlow = smoothstep(0.0, 0.3, pulsePhase) * smoothstep(0.6, 0.3, pulsePhase);
                    
                    vec3 color = vec3(0.0);
                    color += uBaseColor * (ringStr + spokeStr) * 0.15;
                    color += uBaseColor * pulseGlow * 0.2;
                    
                    float opacity = 1.0 - smoothstep(uRadius * 0.6, uRadius, dist);
                    gl_FragColor = vec4(color, opacity);
                }
            `
        });
        gridMatRef.current = gridMat;
        const gridMesh = new THREE.Mesh(gridGeo, gridMat);
        gridMesh.position.y = 0.05;
        floorGroup.add(gridMesh);
        scene.add(floorGroup);

        // CORE
        const coreGroup = new THREE.Group();
        const coreTargetPosition = new THREE.Vector3(0, 4.0, 0.0);
        coreGroup.position.copy(coreTargetPosition);

        const coreGeom = new THREE.SphereGeometry(1.5, 128, 128); 
        const coreMat = new THREE.ShaderMaterial({
            uniforms: { 
                uTime: { value: 0 }, 
                uAudioLevel: { value: 0 }, 
                uPulseSpeed: { value: 1.0 },
                uColorA: { value: new THREE.Color(0x00ffff) },
                uColorB: { value: new THREE.Color(0xff00ff) }
            },
            vertexShader: CORE_VERTEX_SHADER,
            fragmentShader: CORE_FRAGMENT_SHADER
        });
        coreMatRef.current = coreMat;
        const coreMesh = new THREE.Mesh(coreGeom, coreMat);
        coreGroup.add(coreMesh);

        const flareGeom = new THREE.SphereGeometry(1.65, 128, 128);
        const flareMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x00ffff) },
                uThreshold: { value: 0.8 } 
            },
            vertexShader: FLARE_VERTEX_SHADER,
            fragmentShader: FLARE_FRAGMENT_SHADER,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        flareMatRef.current = flareMat;
        const flareMesh = new THREE.Mesh(flareGeom, flareMat);
        flareMeshRef.current = flareMesh;
        coreGroup.add(flareMesh);

        const beamGeo = new THREE.CylinderGeometry(2.0, 5.0, 100, 32, 4, true);
        beamGeo.translate(0, 50, 0); 
        const beamMat = new THREE.ShaderMaterial(VOLUMETRIC_BEAM_SHADER);
        const coreBeamMat = beamMat.clone();
        coreBeamMat.uniforms = { ...THREE.UniformsUtils.clone(beamMat.uniforms) };
        coreBeamMat.uniforms.uColor.value.setHex(0x00ffff);
        coreBeamMat.transparent = true;
        coreBeamMat.blending = THREE.AdditiveBlending;
        coreBeamMat.depthWrite = false;
        coreBeamMat.side = THREE.DoubleSide;
        
        const coreBeam = new THREE.Mesh(beamGeo, coreBeamMat);
        coreGroup.add(coreBeam);

        const ringsGroup = new THREE.Group();
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, 
            transparent: true, 
            opacity: 0.1, 
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(8, 0.05, 16, 100), ringMat);
        const r2 = new THREE.Mesh(new THREE.TorusGeometry(12, 0.08, 16, 100), ringMat);
        const r3 = new THREE.Mesh(new THREE.TorusGeometry(15, 0.02, 16, 100), ringMat);
        r1.rotation.x = Math.PI * 0.4;
        r2.rotation.y = Math.PI * 0.2;
        r3.rotation.x = Math.PI * 0.9;
        ringsGroup.add(r1, r2, r3);
        ringsRef.current = ringsGroup;
        coreGroup.add(ringsGroup);

        const coreLight = new THREE.PointLight(0x00ffff, 3, 60);
        coreLightRef.current = coreLight;
        coreGroup.add(coreLight);
        scene.add(coreGroup);

        const arrayGroup = new THREE.Group();
        obeliskArrayRef.current = arrayGroup;
        
        const obeliskCount = 8;
        const obeliskUniforms = {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0x00ffff) },
            uActivation: { value: 0.0 }
        };
        obeliskUniformsRef.current = obeliskUniforms;

        const bodyMat = new THREE.ShaderMaterial({
            uniforms: obeliskUniforms,
            vertexShader: OBELISK_VERT,
            fragmentShader: OBELISK_BODY_FRAG,
        });
        
        const glowMat = new THREE.ShaderMaterial({
            uniforms: obeliskUniforms,
            vertexShader: OBELISK_VERT,
            fragmentShader: OBELISK_GLOW_FRAG,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        for (let i=0; i < obeliskCount; i++) {
            const angle = (i / obeliskCount) * Math.PI * 2;
            const x = Math.cos(angle) * PLACE_RADIUS;
            const z = Math.sin(angle) * PLACE_RADIUS;
            
            const obeliskGroup = new THREE.Group();
            obeliskGroup.position.set(x, 0, z);
            obeliskGroup.lookAt(0, 0, 0); 

            const pedestalGeo = new THREE.CylinderGeometry(5, 7, 4, 6);
            const pedestal = new THREE.Mesh(pedestalGeo, bodyMat);
            pedestal.position.y = 2;
            obeliskGroup.add(pedestal);

            const spireGroup = new THREE.Group();
            spireGroup.position.y = 4;
            
            const coreGeo = new THREE.CylinderGeometry(1.5, 3.5, 85, 4);
            coreGeo.rotateY(Math.PI/4);
            const core = new THREE.Mesh(coreGeo, bodyMat);
            core.position.y = 42.5;
            spireGroup.add(core);

            const veinGeo = new THREE.BoxGeometry(0.5, 80, 0.5);
            const vein = new THREE.Mesh(veinGeo, glowMat);
            vein.position.set(0, 42.5, 2.5); 
            vein.userData = { isVein: true }; 
            spireGroup.add(vein);

            const plateGeo = new THREE.CylinderGeometry(2.5, 4.0, 20, 4);
            plateGeo.rotateY(Math.PI/4);
            const plateLower = new THREE.Mesh(plateGeo, bodyMat);
            plateLower.position.set(0, 15, 0);
            plateLower.scale.set(1.2, 1, 1.2); 
            spireGroup.add(plateLower);

            const plateUpper = new THREE.Mesh(plateGeo, bodyMat);
            plateUpper.position.set(0, 65, 0);
            plateUpper.scale.set(0.9, 1, 0.9);
            plateUpper.rotation.y = Math.PI; 
            spireGroup.add(plateUpper);

            const crownGeo = new THREE.OctahedronGeometry(1.5, 0);
            const crown = new THREE.Mesh(crownGeo, glowMat);
            crown.position.set(0, 92, 0);
            crown.userData = { isVein: true, isFloating: true };
            obeliskGroup.add(crown);

            const ringGeo = new THREE.TorusGeometry(3.5, 0.15, 8, 24);
            ringGeo.rotateX(Math.PI/2);
            const ring1 = new THREE.Mesh(ringGeo, bodyMat);
            ring1.position.y = 40;
            spireGroup.add(ring1);
            const ring2 = new THREE.Mesh(ringGeo, bodyMat);
            ring2.position.y = 50;
            ring2.scale.set(0.85, 0.85, 0.85);
            spireGroup.add(ring2);

            obeliskGroup.add(spireGroup);
            arrayGroup.add(obeliskGroup);
        }
        scene.add(arrayGroup);
        
        const halfAngle = Math.PI / 8;
        const chordWidth = 2 * PLACE_RADIUS * Math.sin(halfAngle);
        const chordDist = PLACE_RADIUS * Math.cos(halfAngle);
        
        // Ensure Square Aspect Ratio for the Portal Mesh
        const portalHeight = chordWidth; 
        const portalGeo = new THREE.PlaneGeometry(chordWidth, portalHeight);
        
        const portalMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff0000) },
                uOpen: { value: 0.0 }
            },
            vertexShader: PORTAL_VERT,
            fragmentShader: PORTAL_FRAG,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        portalCurtainMatRef.current = portalMat;
        const portalMesh = new THREE.Mesh(portalGeo, portalMat);
        
        const portalAngle = 1.625 * Math.PI;
        const pX = Math.cos(portalAngle) * chordDist;
        const pZ = Math.sin(portalAngle) * chordDist;
        
        portalMesh.position.set(pX, 45, pZ);
        portalMesh.lookAt(0, 45, 0);
        
        portalCurtainMeshRef.current = portalMesh;
        scene.add(portalMesh);

        const cloudsCount = 40; 
        const cloudGeo = new THREE.PlaneGeometry(500, 500); 
        const cloudMat = new THREE.ShaderMaterial({
            uniforms: { 
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x221133) }
            },
            vertexShader: CLOUD_VERT,
            fragmentShader: CLOUD_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
            side: THREE.DoubleSide
        });
        
        const cloudsMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudsCount);
        cloudsMesh.frustumCulled = false; 
        const cloudDummy = new THREE.Object3D();
        for(let i=0; i<cloudsCount; i++) {
            const theta = seededRandom() * Math.PI * 2;
            const phi = seededRandom() * Math.PI * 0.4; 
            const r = 800 + seededRandom() * 700;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = (seededRandom() - 0.3) * 300; 
            const z = r * Math.sin(phi) * Math.sin(theta);
            cloudDummy.position.set(x, y, z);
            cloudDummy.lookAt(0, 0, 0); 
            cloudDummy.scale.setScalar(1.5 + seededRandom() * 2.0);
            cloudDummy.updateMatrix();
            cloudsMesh.setMatrixAt(i, cloudDummy.matrix);
        }
        cloudsRef.current = cloudsMesh;
        scene.add(cloudsMesh);

        // PCG
        const solarGroup = new THREE.Group();
        solarGroup.rotation.z = Math.PI * 0.05;
        solarGroup.visible = true;
        solarSystemRef.current = solarGroup;
        
        const createPCGPlanet = (dist: number) => {
            const radius = randomRange(100, 2000);
            const type = Math.floor(seededRandom() * 4); 
            
            let cA = randomColor();
            let cB = randomColor();
            let cC = randomColor();
            
            if (type === 0) {
                cA = new THREE.Color().setHSL(0.6, 0.8, 0.2);
                cB = new THREE.Color().setHSL(0.3, 0.6, 0.3);
                cC = new THREE.Color().setHSL(0.1, 0.5, 0.5);
            } else if (type === 1) {
                cA = new THREE.Color().setHSL(seededRandom(), 0.6, 0.4);
                cB = new THREE.Color().setHSL(seededRandom(), 0.6, 0.4);
            } else if (type === 2) {
                cA = new THREE.Color(0.2, 0.1, 0.1);
                cB = new THREE.Color(1.0, 0.4, 0.0);
                cC = new THREE.Color(1.0, 0.9, 0.5);
            }

            const speed = randomRange(0.005, 0.05);

            const geo = new THREE.SphereGeometry(radius, 64, 64);
            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uType: { value: type },
                    uColorA: { value: cA },
                    uColorB: { value: cB },
                    uColorC: { value: cC }
                },
                vertexShader: PLANET_VERT,
                fragmentShader: PLANET_FRAG
            });
            const mesh = new THREE.Mesh(geo, mat);
            
            const orbitMatrix = new THREE.Matrix4();
            const inclination = (seededRandom() - 0.5) * 1.0; 
            const tiltAxis = new THREE.Vector3(seededRandom()-0.5, 0, seededRandom()-0.5).normalize();
            orbitMatrix.makeRotationAxis(tiltAxis, inclination);

            mesh.userData = { 
                dist, 
                speed, 
                angle: seededRandom() * Math.PI * 2, 
                orbitMatrix 
            };

            if (type !== 2) {
                const atmoGeo = new THREE.SphereGeometry(radius * 1.2, 64, 64);
                const atmoMat = new THREE.ShaderMaterial({
                    uniforms: { uColor: { value: type === 3 ? new THREE.Color(0x88ffff) : new THREE.Color(0x44aaff) } },
                    vertexShader: ATMOSPHERE_VERT,
                    fragmentShader: ATMOSPHERE_FRAG,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    side: THREE.BackSide
                });
                mesh.add(new THREE.Mesh(atmoGeo, atmoMat));
            }
            if (seededRandom() > 0.7) {
                const ringGeo = new THREE.PlaneGeometry(radius * 3.5, radius * 3.5);
                const ringMat = new THREE.ShaderMaterial({
                    uniforms: { uTime: { value: 0 }, uColor: { value: cA } },
                    vertexShader: `varying vec2 vUv; varying vec3 vWorldPosition; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
                    fragmentShader: RING_FRAG,
                    transparent: true,
                    side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = Math.PI * 0.4;
                mesh.add(ring);
            }
            planetsRef.current.push(mesh);
            solarGroup.add(mesh);
        };

        const createPCGAsteroidBelt = (dist: number) => {
            const count = Math.floor(randomRange(500, 2000));
            const width = randomRange(1000, 5000);
            const minR = dist - width/2;
            const maxR = dist + width/2;
            const color = new THREE.Color().setHSL(seededRandom(), 0.1, 0.4);
            const scale = randomRange(100, 400);

            const asteroidGeo = new THREE.DodecahedronGeometry(1, 1); 
            const asteroidMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uColor: { value: color },
                    uReveal: { value: 0.0 }
                },
                vertexShader: ASTEROID_VERT,
                fragmentShader: ASTEROID_FRAG
            });

            gsap.to(asteroidMat.uniforms.uReveal, { value: 1.0, duration: 4.0, ease: "power2.out", delay: 0.5 });

            const mesh = new THREE.InstancedMesh(asteroidGeo, asteroidMat, count);
            const dummy = new THREE.Object3D();
            
            for (let i = 0; i < count; i++) {
                const r = Math.sqrt(seededRandom() * (maxR * maxR - minR * minR) + minR * minR);
                const theta = seededRandom() * Math.PI * 2;
                const spreadY = (maxR - minR) * 0.4; 
                const y = (seededRandom() - 0.5) * spreadY; 
                dummy.position.set(r * Math.cos(theta), y, r * Math.sin(theta));
                dummy.rotation.set(seededRandom() * Math.PI, seededRandom() * Math.PI, seededRandom() * Math.PI);
                const s = scale * (0.5 + seededRandom() * 1.5);
                dummy.scale.set(s, s, s);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
            
            const dur = randomRange(800, 1200);
            const dir = seededRandom() > 0.5 ? 1 : -1;
            gsap.to(mesh.rotation, { y: Math.PI * 2 * dir, duration: dur, repeat: -1, ease: "none" });

            asteroidBeltsRef.current.push(mesh);
            solarGroup.add(mesh);
        };

        const numPlanets = Math.floor(randomRange(3, 7));
        let currentDist = 3000;
        for (let i = 0; i < numPlanets; i++) {
            currentDist += randomRange(3000, 10000);
            if (seededRandom() > 0.7) {
                createPCGAsteroidBelt(currentDist);
                currentDist += 2000;
            } else {
                createPCGPlanet(currentDist);
            }
        }
        scene.add(solarGroup);

        const trafficGroup = new THREE.Group();
        trafficMaterials.current = [];
        const numLanes = Math.floor(randomRange(3, 8));
        for(let i=0; i<numLanes; i++) {
            const numPoints = 5;
            const points = [];
            let angle = seededRandom() * Math.PI * 2;
            let radius = randomRange(2000, 8000);
            let height = randomRange(-1000, 1000);
            for(let j=0; j<numPoints; j++) {
                points.push(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    height + randomRange(-500, 500),
                    Math.sin(angle) * radius
                ));
                angle += randomRange(0.5, 1.5);
                radius += randomRange(-500, 500);
            }
            const color = new THREE.Color().setHSL(seededRandom(), 1.0, 0.5);
            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeo = new THREE.TubeGeometry(curve, 64, 4, 8, false);
            const tubeMat = new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uColor: { value: color } },
                vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: TRAFFIC_FRAG,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            trafficMaterials.current.push(tubeMat);
            trafficGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        }
        scene.add(trafficGroup);

        const structureGroup = new THREE.Group();
        const structMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: STRUCTURE_VERT,
            fragmentShader: STRUCTURE_FRAG
        });
        const numStructRings = Math.floor(randomRange(2, 5));
        for(let i=0; i<numStructRings; i++) {
             const r = randomRange(6000, 15000);
             const tubeR = randomRange(50, 300);
             const ringGeo = new THREE.TorusGeometry(r, tubeR, 16, 128);
             const mesh = new THREE.Mesh(ringGeo, structMat);
             mesh.rotation.x = seededRandom() * Math.PI;
             mesh.rotation.y = seededRandom() * Math.PI;
             structureGroup.add(mesh);
        }
        megastructureRef.current = structureGroup;
        scene.add(structureGroup);

        const particlesCount = 8000;
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(particlesCount * 3);
        const pSizes = new Float32Array(particlesCount);
        const pSpeeds = new Float32Array(particlesCount);
        for(let i=0; i<particlesCount; i++) {
            const r = seededRandom() * 200;
            const theta = seededRandom() * Math.PI * 2;
            pPos[i*3] = r * Math.cos(theta);
            pPos[i*3+1] = seededRandom() * 100;
            pPos[i*3+2] = r * Math.sin(theta);
            pSizes[i] = seededRandom();
            pSpeeds[i] = 0.2 + seededRandom() * 0.8;
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        pGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));
        pGeo.setAttribute('speed', new THREE.BufferAttribute(pSpeeds, 1));
        const pMat = new THREE.PointsMaterial({
            color: 0xaaccff,
            size: 0.2,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });
        const particleSystem = new THREE.Points(pGeo, pMat);
        particlesRef.current = particleSystem;
        scene.add(particleSystem);

        // --- ANIMATION ---
        const clock = new THREE.Clock();
        const raycaster = new THREE.Raycaster();
        let localGazePressure = 0;
        let animationId: number;
        let simulatedAudioLevel = 0;
        const tempV = new THREE.Vector3();

        // --- SKYBOX INIT (NEBULA ONLY) ---
        if (skyMeshRef.current) {
            scene.remove(skyMeshRef.current);
            skyMeshRef.current.geometry.dispose();
            (skyMeshRef.current.material as THREE.Material).dispose();
        }
        const skyGeom = new THREE.SphereGeometry(150000, 64, 64);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: { 
                uTime: { value: 0 },
                iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: SKY_VERT,
            fragmentShader: NEBULA_FRAG
        });
        skyMeshRef.current = new THREE.Mesh(skyGeom, skyMat);
        scene.add(skyMeshRef.current);

        let gridBase = new THREE.Color(0x0088ff);
        let gridPulse = new THREE.Color(0xffffff);
        let cloudColor = new THREE.Color(0x221133);

        if (gridMatRef.current) {
            gsap.to(gridMatRef.current.uniforms.uBaseColor.value, { 
                r: gridBase.r, g: gridBase.g, b: gridBase.b, duration: 1.0 
            });
            gsap.to(gridMatRef.current.uniforms.uPulseColor.value, { 
                r: gridPulse.r, g: gridPulse.g, b: gridPulse.b, duration: 1.0 
            });
        }
        
        if (cloudsRef.current) {
             const mat = cloudsRef.current.material as THREE.ShaderMaterial;
             gsap.to(mat.uniforms.uColor.value, {
                 r: cloudColor.r, g: cloudColor.g, b: cloudColor.b, duration: 2.0
             });
        }

        let fogColor = 0x050510;
        let fogDensity = 0.003;

        if (sceneRef.current.fog instanceof THREE.FogExp2) {
            gsap.to(sceneRef.current.fog.color, { r: new THREE.Color(fogColor).r, g: new THREE.Color(fogColor).g, b: new THREE.Color(fogColor).b, duration: 2.0 });
            gsap.to(sceneRef.current.fog, { density: fogDensity, duration: 2.0 });
        }

        const animate = () => {
            animationId = requestAnimationFrame(animate);
            const dt = clock.getDelta();
            const time = clock.getElapsedTime();

            if (controls.isLocked) {
                velocity.x -= velocity.x * 5.0 * dt;
                velocity.z -= velocity.z * 5.0 * dt;
                direction.z = Number(moveState.fwd) - Number(moveState.bwd);
                direction.x = Number(moveState.right) - Number(moveState.left);
                direction.normalize();

                if (moveState.fwd || moveState.bwd) velocity.z -= direction.z * 40.0 * dt;
                if (moveState.left || moveState.right) velocity.x -= direction.x * 40.0 * dt;

                controls.moveRight(-velocity.x * dt);
                controls.moveForward(-velocity.z * dt);
            }
            
            // --- SCREEN SHAKE & JUICE ---
            if (shakeIntensity.current > 0.001) {
                const shakeAmount = shakeIntensity.current;
                const shakeVec = new THREE.Vector3(
                    (Math.random() - 0.5) * shakeAmount,
                    (Math.random() - 0.5) * shakeAmount,
                    (Math.random() - 0.5) * shakeAmount
                );
                camera.position.add(shakeVec);
                shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, dt * 2.0);
            }

            raycaster.setFromCamera(new THREE.Vector2(), camera);
            const hits = raycaster.intersectObject(coreMesh);
            const isHovered = hits.length > 0;
            
            if(isHovered) {
                localGazePressure = Math.min(localGazePressure + dt * 2.0, 1.0);
            } else {
                localGazePressure = Math.max(localGazePressure - dt, 0.0);
            }
            onGazeChange(localGazePressure);

            const noise = Math.random();
            const targetAudio = localGazePressure > 0.1 
                ? (Math.sin(time * 15.0) * 0.3 + 0.4 + noise * 0.3) 
                : 0.1; 
            simulatedAudioLevel = THREE.MathUtils.lerp(simulatedAudioLevel, targetAudio, 0.1);

            coreMat.uniforms.uTime.value = time;
            coreMat.uniforms.uAudioLevel.value = simulatedAudioLevel;
            
            const isProcessing = localGazePressure > 0.8;
            const targetColorA = new THREE.Color(isProcessing ? 0xffff00 : 0x00ffff);
            
            coreMat.uniforms.uColorA.value.lerp(targetColorA, 0.05);
            if (!controls.isLocked) {
                 coreMat.uniforms.uPulseSpeed.value = THREE.MathUtils.lerp(coreMat.uniforms.uPulseSpeed.value, 1.0, 0.05);
            }

            if (flareMatRef.current && flareMeshRef.current) {
                flareMatRef.current.uniforms.uTime.value = time;
                flareMatRef.current.uniforms.uColor.value.lerp(targetColorA, 0.05);
                const cycle = Math.sin(time * 1.5); 
                const activity = THREE.MathUtils.smoothstep(cycle, 0.2, 0.9); 
                const targetThreshold = 0.6 - (activity * 0.3);
                
                flareMatRef.current.uniforms.uThreshold.value = THREE.MathUtils.lerp(
                    flareMatRef.current.uniforms.uThreshold.value, 
                    targetThreshold, 
                    0.05
                );
                flareMeshRef.current.rotation.y -= dt * 0.2;
                flareMeshRef.current.rotation.z += dt * 0.05;
            }

            coreGroup.position.y = coreTargetPosition.y + Math.sin(time * 0.5) * 0.2;
            
            if(ringsRef.current) {
                ringsRef.current.children[0].rotation.z = time * 0.1;
                ringsRef.current.children[1].rotation.x = time * 0.15;
                ringsRef.current.children[2].rotation.y = time * 0.05;
            }

            if(obeliskArrayRef.current) {
                if (obeliskUniformsRef.current) {
                    obeliskUniformsRef.current.uTime.value = time;
                }

                obeliskArrayRef.current.children.forEach((obelisk, i) => {
                    obelisk.rotation.z = Math.sin(time * 0.5 + i) * 0.005;
                    obelisk.traverse((child) => {
                        if(child.userData.isFloating) {
                            child.rotation.y += dt * 0.5;
                            child.position.y += Math.sin(time * 2.0 + i) * 0.02;
                        }
                    });
                });
            }

            coreLight.intensity = THREE.MathUtils.lerp(coreLight.intensity, controls.isLocked ? 4.0 : 2.0, 0.1);
            coreLight.color.lerp(targetColorA, 0.1);
            coreBeamMat.uniforms.uTime.value = time;
            if (portalCurtainMatRef.current) {
                portalCurtainMatRef.current.uniforms.uTime.value = time;
            }
            
            // --- PARTICLE WARP EFFECT ---
            if (particlesRef.current) {
                const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;
                const speeds = particlesRef.current.geometry.attributes.speed.array as Float32Array;
                const warpSpeed = particleSpeedRef.current; // Controlled by portal state

                for(let i=0; i<particlesCount; i++) {
                    pos[i*3+1] += speeds[i] * 0.05 * warpSpeed;
                    if(pos[i*3+1] > 100) pos[i*3+1] = 0;
                }
                particlesRef.current.geometry.attributes.position.needsUpdate = true;
                particlesRef.current.rotation.y = time * 0.01 * warpSpeed;
            }

            planetsRef.current.forEach((p) => {
                // @ts-ignore
                const { dist, speed, angle, orbitMatrix } = p.userData;
                const theta = angle + time * speed * 0.1;
                tempV.set(Math.cos(theta) * dist, 0, Math.sin(theta) * dist);
                tempV.applyMatrix4(orbitMatrix);
                p.position.copy(tempV);
                p.rotation.y = time * 0.05;
                const mat = p.material as THREE.ShaderMaterial;
                mat.uniforms.uTime.value = time;
                if(p.children.length > 0) {
                     p.children.forEach(c => {
                         const mesh = c as THREE.Mesh;
                         if (mesh.material && (mesh.material as THREE.ShaderMaterial).uniforms?.uTime) {
                             (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
                         }
                     });
                }
            });

            asteroidBeltsRef.current.forEach((belt) => {
                const mat = belt.material as THREE.ShaderMaterial;
                if(mat.uniforms && mat.uniforms.uTime) mat.uniforms.uTime.value = time;
            });

            if(skyMeshRef.current) {
                // @ts-ignore
                skyMeshRef.current.material.uniforms.uTime.value = time;
                // @ts-ignore
                skyMeshRef.current.material.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
                skyMeshRef.current.rotation.y = time * 0.005; 
            }
            gridMat.uniforms.uTime.value = time;
            
            if (cinematicPassRef.current) cinematicPassRef.current.uniforms.uTime.value = time;
            
            if(cloudsRef.current) {
                const mat = cloudsRef.current.material as THREE.ShaderMaterial;
                mat.uniforms.uTime.value = time;
                cloudsRef.current.rotation.y = time * 0.02;
            }
            
            if(megastructureRef.current) {
                megastructureRef.current.children.forEach((child, i) => {
                    child.rotation.z += dt * (0.01 + i * 0.01);
                    const mat = (child as THREE.Mesh).material as THREE.ShaderMaterial;
                    if(mat.uniforms) mat.uniforms.uTime.value = time;
                });
            }
            
            trafficMaterials.current.forEach(mat => {
                mat.uniforms.uTime.value = time;
            });

            if (labelRef.current && coreMesh) {
                if (isHovered && localGazePressure < 0.9) {
                    coreMesh.getWorldPosition(tempV);
                    tempV.y += 2.5; 
                    tempV.project(camera);
                    const x = (tempV.x * .5 + .5) * window.innerWidth;
                    const y = (-(tempV.y * .5) + .5) * window.innerHeight;
                    labelRef.current.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
                    labelRef.current.style.opacity = '1';
                } else {
                    labelRef.current.style.opacity = '0';
                }
            }
            composer.render();
        };

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            composer.setSize(window.innerWidth, window.innerHeight);
            bloomPassRef.current?.setSize(window.innerWidth, window.innerHeight);
            cinematicPassRef.current?.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        const onCoreClick = (e: MouseEvent) => {
            if (!controls.isLocked) return;
            raycaster.setFromCamera(new THREE.Vector2(), camera);
            const hits = raycaster.intersectObject(coreMesh);
            if(hits.length > 0) playSound(1200);
        };
        window.addEventListener('click', onCoreClick);

        animate();

        return () => {
            window.removeEventListener('resize', onResize);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            document.removeEventListener('click', handleClick);
            window.removeEventListener('click', onCoreClick);
            cancelAnimationFrame(animationId);
            controls.unlock();
            controls.dispose();
            renderer.dispose();
            containerRef.current?.removeChild(renderer.domElement);
        };
    }, []); 

    // --- MAIN PORTAL REACTION ---
    useEffect(() => {
        if (!portalCurtainMeshRef.current || !portalCurtainMatRef.current || !coreMatRef.current) return;
        
        if (portalConfig.isOpen) {
            playSound(100, 'sawtooth', 2.0); 
            const tl = gsap.timeline();
            
            // 1. Energize Core
            tl.to(coreMatRef.current.uniforms.uPulseSpeed, { value: 30.0, duration: 1.0, ease: "power3.in" })
              .to(coreMatRef.current.uniforms.uAudioLevel, { value: 2.0, duration: 0.5, yoyo: true, repeat: 3 }, "<");

            // 2. Set Portal Colors
            portalCurtainMatRef.current.uniforms.uColor.value.set(portalConfig.color);
            if(flareMatRef.current) {
                gsap.to(flareMatRef.current.uniforms.uColor.value, { 
                    r: new THREE.Color(portalConfig.color).r, 
                    g: new THREE.Color(portalConfig.color).g, 
                    b: new THREE.Color(portalConfig.color).b, 
                    duration: 0.5 
                });
            }

            // 3. Charge Up The Obelisks
            if (obeliskUniformsRef.current) {
                gsap.to(obeliskUniformsRef.current.uColor.value, {
                    r: new THREE.Color(portalConfig.color).r,
                    g: new THREE.Color(portalConfig.color).g,
                    b: new THREE.Color(portalConfig.color).b,
                    duration: 1.5,
                    ease: "power2.inOut"
                });
                
                gsap.to(obeliskUniformsRef.current.uActivation, {
                    value: 1.0,
                    duration: 2.0,
                    ease: "power3.out",
                    delay: 0.5
                });
                
                if(obeliskArrayRef.current) {
                     obeliskArrayRef.current.children.forEach((obeliskGroup) => {
                        obeliskGroup.traverse((child) => {
                             if (child.userData.isFloating) {
                                 gsap.to(child.scale, { x: 1.8, y: 1.8, z: 1.8, duration: 0.5, yoyo: true, repeat: 3 });
                             }
                        });
                     });
                }
            }
            
            // --- JUICE: Shockwave & Shake ---
            // Trigger Shake at ignition point
            setTimeout(() => { shakeIntensity.current = 1.5; }, 1000);
            
            // Trigger Aberration Shockwave
            if (cinematicPassRef.current) {
                const uAberration = cinematicPassRef.current.uniforms.uAberrationIntensity;
                gsap.to(uAberration, { value: 0.035, duration: 0.2, delay: 1.0, ease: "power2.out" }); // Spike
                gsap.to(uAberration, { value: 0.002, duration: 1.5, delay: 1.2, ease: "elastic.out(1, 0.3)" }); // Settle
            }
            
            // Boost Bloom momentarily - Reduced peak from 1.0 to 0.3, settle to 0.0
            if (bloomPassRef.current) {
                gsap.to(bloomPassRef.current, { strength: 0.3, radius: 0.5, duration: 0.2, delay: 1.0 });
                gsap.to(bloomPassRef.current, { strength: 0.0, radius: 0.1, duration: 2.0, delay: 1.3 });
            }

            // Warp Speed Particles
            gsap.to(particleSpeedRef, { current: 15.0, duration: 2.0, delay: 1.0, ease: "power2.in" });

            // 4. Open Portal Curtain
            tl.to(portalCurtainMatRef.current.uniforms.uOpen, { value: 1.0, duration: 3.0, ease: "power2.inOut", delay: 0.5 });

        } else {
            // Deactivate
            gsap.to(portalCurtainMatRef.current.uniforms.uOpen, { value: 0.0, duration: 1.0, ease: "power2.in" });
            gsap.to(coreMatRef.current.uniforms.uPulseSpeed, { value: 1.0, duration: 1.0 });
            gsap.to(particleSpeedRef, { current: 1.0, duration: 2.0 });

            if (obeliskUniformsRef.current) {
                gsap.to(obeliskUniformsRef.current.uActivation, {
                    value: 0.0,
                    duration: 1.5,
                    ease: "power2.inOut"
                });
            }
        }
    }, [portalConfig]);

    return (
        <div className="w-full h-full bg-black relative">
            <div ref={containerRef} className="w-full h-full block" />
            <div 
                ref={labelRef} 
                className="absolute top-0 left-0 pointer-events-none opacity-0 transition-opacity duration-200"
                style={{ willChange: 'transform, opacity' }}
            >
                <div className="bg-black/60 text-cyan-400 px-4 py-2 rounded border border-cyan-500/30 backdrop-blur-md text-sm font-mono animate-pulse shadow-[0_0_15px_rgba(0,255,255,0.3)]">
                    [ INITIALIZE UPLINK ]
                </div>
            </div>
        </div>
    );
};

export default World;
