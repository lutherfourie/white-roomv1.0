
import * as THREE from 'three';

export const CINEMATIC_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uGrainStrength: { value: 0.0 }, // Set to 0.0 to remove all static noise
        uVignetteStrength: { value: 0.4 },
        uAberrationIntensity: { value: 0.0015 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uGrainStrength;
        uniform float uVignetteStrength;
        uniform float uAberrationIntensity;
        
        varying vec2 vUv;

        // Stable Gold Noise
        float PHI = 1.61803398874989484820459; 
        float gold_noise(in vec2 xy, in float seed){
            return fract(tan(distance(xy*PHI, xy)*seed)*xy.x);
        }

        void main() {
            vec2 uv = vUv;
            
            // 1. CHROMATIC ABERRATION (Dynamic)
            float distToCenter = length(uv - 0.5);
            // Non-linear offset for "lens" feel
            vec2 offset = (uv - 0.5) * distToCenter * uAberrationIntensity; 
            
            float r = texture2D(tDiffuse, uv + offset).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - offset).b;
            vec3 color = vec3(r, g, b);
            
            // 2. WARM ATMOSPHERIC GRADING
            vec3 warmFilter = vec3(1.02, 1.0, 0.98); 
            color *= warmFilter;

            // Lift shadows slightly
            vec3 dustShadow = vec3(0.01, 0.008, 0.005); 
            color = max(color, dustShadow);

            // 3. GRAIN
            // Disabled (0.0) to ensure clean image
            float grain = gold_noise(uv * uResolution, fract(uTime)) - 0.5;
            color += grain * uGrainStrength;

            // 4. VIGNETTE
            float len = length(uv - 0.5);
            float vignette = smoothstep(0.9, 0.25, len * uVignetteStrength + 0.1);
            color *= vignette;
            
            // 5. GAMMA CORRECTION
            color = pow(color, vec3(1.0 / 1.1));

            gl_FragColor = vec4(color, 1.0);
        }
    `
};

export const VOLUMETRIC_BEAM_SHADER = {
    uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uAlpha: { value: 0.5 },
        uFade: { value: 1.0 }
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uAlpha;
        
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;

        // Simple noise
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
            vec3 viewDir = normalize(vViewPosition);
            
            // Fresnel effect (edges are brighter)
            float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);
            
            // Vertical fade
            float vFade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.0, vUv.y);
            
            // Dusty particulates in the light beam
            float dust = random(vUv * 20.0 + uTime * 0.1);
            float beamNoise = smoothstep(0.3, 0.7, dust);
            
            float alpha = uAlpha * fresnel * vFade * (0.8 + 0.2 * beamNoise);
            
            gl_FragColor = vec4(uColor, alpha);
        }
    `
};
