
import * as THREE from 'three';

export const CLOUD_VERT = `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying float vDistance;
    
    void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        
        vec4 mvPosition = viewMatrix * worldPos;
        vDistance = -mvPosition.z;
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const CLOUD_FRAG = `
    uniform float uTime;
    uniform vec3 uColor;
    
    varying vec2 vUv;
    varying float vDistance;

    // Fast noise
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float n = p.x + p.y * 57.0 + 113.0 * p.z;
        return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                       mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                   mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                       mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
    }

    float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p *= 2.02;
        f += 0.2500 * noise(p); p *= 2.03;
        f += 0.1250 * noise(p);
        return f;
    }

    void main() {
        // Soft circle mask
        vec2 center = vUv - 0.5;
        float dist = length(center);
        float mask = 1.0 - smoothstep(0.0, 0.5, dist);
        
        // Rolling fog noise
        vec3 p = vec3(vUv * 4.0, uTime * 0.1); 
        float n = fbm(p);
        
        float cloud = smoothstep(0.3, 0.7, n * mask);
        float fade = smoothstep(2500.0, 1500.0, vDistance) * smoothstep(100.0, 500.0, vDistance);
        
        vec3 col = uColor;
        col += vec3(0.1) * n;

        gl_FragColor = vec4(col, cloud * fade * 0.4);
    }
`;

export const STRUCTURE_VERT = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPos;

    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const STRUCTURE_FRAG = `
    uniform float uTime;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
        // Scale UVs for tiling
        vec2 gridUV = vUv * vec2(400.0, 40.0); 
        vec2 cell = floor(gridUV);
        vec2 frac = fract(gridUV);
        
        // Random ID for each panel
        float id = rand(cell);
        
        // --- ANALYTIC ANTI-ALIASING ---
        // Use derivatives to determine how fast UVs are changing per pixel.
        // This makes the edge width dependent on screen space, eliminating flicker at distance.
        vec2 fw = fwidth(gridUV);
        vec2 edge = max(vec2(0.02), fw * 1.5); // Minimum width 0.02, scales with distance
        
        float plate = smoothstep(0.0, edge.x, frac.x) * smoothstep(1.0, 1.0 - edge.x, frac.x) *
                      smoothstep(0.0, edge.y, frac.y) * smoothstep(1.0, 1.0 - edge.y, frac.y);
        
        vec3 hullColor = vec3(0.15, 0.16, 0.18); 
        hullColor *= (0.8 + 0.4 * id);

        // City Lights / Windows
        // Smoothstep the ID check to avoid popping
        float isLit = smoothstep(0.92, 0.93, id); 
        
        float blink = sin(uTime * 0.5 + id * 10.0) * 0.5 + 0.5;
        float lightIntensity = isLit * (0.5 + 0.5 * blink);
        
        // Distance fade for high frequency lights (Prevents Moire/Flicker at distance)
        float dist = length(vWorldPos);
        // Fade out detail earlier to prevent sub-pixel shimmering
        float detailFade = 1.0 - smoothstep(4000.0, 10000.0, dist);
        
        lightIntensity *= detailFade; 

        vec3 lightColor = vec3(1.0, 0.9, 0.7); 
        if (id > 0.98) lightColor = vec3(1.0, 0.2, 0.1); 

        vec3 finalColor = hullColor + lightColor * lightIntensity * 2.0;

        // Rim Light from Core
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(vec3(0.0) - vWorldPos); 
        float NdotL = max(0.0, dot(normal, lightDir));
        
        finalColor += vec3(0.1, 0.3, 0.5) * pow(1.0 - abs(dot(normal, normalize(-vWorldPos))), 4.0); 
        finalColor *= (0.2 + 0.8 * NdotL); 

        // Atmospheric Fog
        float fog = smoothstep(5000.0, 25000.0, dist);
        finalColor = mix(finalColor, vec3(0.0), fog * 0.8);
        
        // Apply panel gap darkening
        finalColor *= (0.5 + 0.5 * plate);

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const TRAFFIC_FRAG = `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    
    void main() {
        // Anti-aliased scrolling dash using fwidth for stability
        float scroll = vUv.x * 20.0 - uTime * 2.0;
        float phase = fract(scroll);
        float fw = fwidth(scroll);
        float soft = max(0.1, fw * 2.0); // Minimum softness
        
        float dash = smoothstep(0.0, soft, phase) * smoothstep(0.6, 0.6 - soft, phase);
        
        // Glow gradient from center (Anti-aliased width)
        float glow = 1.0 - smoothstep(0.0, 0.5, abs(vUv.y - 0.5));
        
        vec3 col = uColor * glow * dash;
        
        // Alpha fade at ends of the tube
        float fade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        
        gl_FragColor = vec4(col, glow * fade * dash);
    }
`;
