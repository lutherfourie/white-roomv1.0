
// --- SHARED NOISE UTILS ---
const NOISE_GLSL = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    
    float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ; vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) ); vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy ); vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857; vec3  ns = n_ * D.wyz - D.xzx; vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_ ); vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y); vec4 b0 = vec4( x.xy, y.xy ); vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m; return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
`;

export const OBELISK_VERT = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vLocalPosition = position;
        
        vec4 mvPosition = viewMatrix * worldPos;
        vViewPosition = -mvPosition.xyz;
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

// --- BODY: REALISTIC SHINY GRANITE ---
export const OBELISK_BODY_FRAG = `
    ${NOISE_GLSL}
    
    uniform float uTime;
    uniform vec3 uColor;       // The portal/energy color
    uniform float uActivation; // 0.0 to 1.0 (Opening state)
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vLocalPosition;
    varying vec3 vWorldPosition;

    // Cellular noise for the runes
    float cellNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        float min_dist = 1.0;
        for(int z=-1; z<=1; z++) {
            for(int y=-1; y<=1; y++) {
                for(int x=-1; x<=1; x++) {
                    vec3 neighbor = vec3(float(x), float(y), float(z));
                    vec3 point = fract(sin(vec3(dot(i + neighbor, vec3(127.1, 311.7, 74.7)),
                                                dot(i + neighbor, vec3(269.5, 183.3, 246.1)),
                                                dot(i + neighbor, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
                    // Animate points slightly
                    point = 0.5 + 0.5 * sin(uTime * 0.2 + 6.2831 * point);
                    vec3 diff = neighbor + point - f;
                    float dist = length(diff);
                    min_dist = min(min_dist, dist);
                }
            }
        }
        return min_dist;
    }

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 lightPos = vec3(0.0, 15.0, 0.0); // Slightly elevated core light
        vec3 lightDir = normalize(lightPos - vWorldPosition);
        vec3 halfVec = normalize(lightDir + viewDir);

        // --- PROCEDURAL GRANITE TEXTURE ---
        vec3 p = vLocalPosition * 10.0; 

        // 1. Base Noise (Large mineral flow)
        float nBase = snoise(p * 0.2);
        
        // 2. Grain Noise (Medium detailed stone grain)
        float nGrain = snoise(p * 3.0 + 100.0);
        
        // 3. Mica Noise (High frequency sparkles)
        // Jitter lookup by view direction to simulate iridescence/angle-dependence
        float nMica = snoise(p * 12.0 + viewDir * 2.0);
        
        // Palette (Black Galaxy Granite)
        vec3 cBase = vec3(0.002, 0.002, 0.004); // Deepest obsidian
        vec3 cMid = vec3(0.02, 0.02, 0.025);    // Dark grey
        vec3 cFlecks = vec3(0.15, 0.15, 0.18);  // Mineral inclusions
        vec3 cGold = vec3(0.8, 0.7, 0.5);       // Gold/Bronze mica
        
        // Albedo Mix
        vec3 albedo = mix(cBase, cMid, smoothstep(-0.5, 0.5, nBase));
        albedo = mix(albedo, cFlecks, smoothstep(0.4, 0.8, nGrain));

        // Mica Mask
        float micaStrength = smoothstep(0.7, 1.0, nMica);
        
        // --- LIGHTING ---
        
        // Attenuation
        float dist = length(lightPos - vWorldPosition);
        float atten = 1.0 / (1.0 + dist * 0.005 + dist*dist*0.0002);
        
        // Diffuse
        float NdotL = max(0.0, dot(normal, lightDir));
        vec3 diffuse = albedo * NdotL * atten;
        
        // Specular (Dual layer: Base polish + Mica glint)
        
        // Layer 1: Base Polish (Sharp, plastic-like on stone)
        float specBase = pow(max(0.0, dot(normal, halfVec)), 128.0);
        vec3 specular = vec3(0.8) * specBase * atten;
        
        // Layer 2: Mica Glints (Very bright, scattered)
        if (micaStrength > 0.01) {
            float specMica = pow(max(0.0, dot(normal, halfVec)), 64.0);
            specular += cGold * specMica * micaStrength * 3.0 * atten;
        }

        // --- REFLECTION (Fake Environment) ---
        vec3 refDir = reflect(-viewDir, normal);
        
        // Horizon Gradient
        float horizon = smoothstep(-0.2, 0.3, refDir.y);
        
        // Sky Color (Deep blue/purple space)
        vec3 skyColor = mix(vec3(0.0), vec3(0.02, 0.04, 0.1), horizon);
        
        // Fake Stars in reflection
        float stars = pow(max(0.0, snoise(refDir * 30.0)), 30.0);
        skyColor += vec3(stars);
        
        // Ground Reflection (Floor grid hint)
        if (refDir.y < 0.0) {
             float grid = smoothstep(0.95, 1.0, sin(refDir.x * 50.0) * sin(refDir.z * 50.0));
             skyColor += vec3(0.0, 0.05, 0.1) * grid * 0.2;
        }
        
        // Add Portal Tint
        skyColor += uColor * 0.05 * uActivation;
        
        // Fresnel
        float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 4.0);
        fresnel = mix(0.04, 0.9, fresnel); // Granite is dielectric, F0 ~ 0.04, but polish is reflective at angle
        
        vec3 reflection = skyColor * fresnel;

        // --- EMISSIVE RUNES ---
        // Etched into the stone
        vec3 runeP = vLocalPosition * 1.5;
        float runeNoise = cellNoise(runeP);
        float runeMask = 1.0 - runeNoise;
        runeMask = smoothstep(0.92, 0.98, runeMask); // Very thin sharp lines
        
        float pulse = sin(uTime * 3.0 - vWorldPosition.y * 0.1) * 0.5 + 0.5;
        float activeGlow = uActivation * 5.0 + pulse * 2.0; // Brighter when active
        float idleGlow = 0.2 + pulse * 0.2; // Dim breath when idle
        
        float totalGlow = mix(idleGlow, activeGlow, uActivation);
        
        vec3 emission = uColor * runeMask * totalGlow;

        gl_FragColor = vec4(diffuse + specular + reflection + emission, 1.0);
    }
`;

// --- VEIN: PURE MANA/PLASMA ---
export const OBELISK_GLOW_FRAG = `
    ${NOISE_GLSL}
    
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uActivation;
    
    varying vec2 vUv;
    varying vec3 vLocalPosition;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    void main() {
        // Vertical flow
        vec3 p = vLocalPosition;
        float flow = uTime * (1.0 + uActivation * 3.0);
        
        // Liquid noise layers
        float n1 = snoise(vec3(p.x * 2.0, p.y * 0.5 + flow, p.z * 2.0));
        float n2 = snoise(vec3(p.x * 4.0, p.y * 1.0 - flow * 0.5, p.z * 4.0));
        
        float plasma = n1 * 0.5 + 0.5;
        plasma += n2 * 0.25;
        
        // Intensity core
        float core = smoothstep(0.4, 0.8, plasma);
        
        // Color mapping
        vec3 cDark = uColor * 0.2;
        vec3 cMid = uColor;
        vec3 cBright = vec3(1.0);
        
        vec3 col = mix(cDark, cMid, plasma);
        col = mix(col, cBright, core);
        
        // Opacity/Glow strength
        // Always glowing a bit, bursts when active
        float alpha = 0.6 + 0.4 * uActivation;
        
        // Scanline interference
        float scan = sin(p.y * 20.0 - uTime * 10.0);
        col += uColor * scan * 0.1 * uActivation;
        
        // Fresnel boost
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);
        col += uColor * fresnel;

        gl_FragColor = vec4(col, alpha);
    }
`;
