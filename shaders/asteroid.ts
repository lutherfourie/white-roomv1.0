
// --- NOISE FUNCTIONS ---
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

export const ASTEROID_VERT = `
    ${NOISE_GLSL}
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;
    varying float vRandom;
    
    uniform float uReveal; 

    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
        vUv = uv;
        
        // Stable random ID from instance matrix
        vRandom = rand(vec2(instanceMatrix[3][0], instanceMatrix[3][2]));

        // --- SHAPE DEFORMATION ---
        // Large low-frequency noise for general potato shape
        float deform = snoise(position * 0.8 + vRandom * 100.0) * 0.3;
        // Medium noise for boulders/lumps
        deform += snoise(position * 2.5 + vRandom * 50.0) * 0.1;

        vec3 deformedPos = position + normal * deform;
        vLocalPosition = deformedPos; // Pass deformed local pos to frag for texture mapping

        // Reveal Animation (Scale up from 0)
        float instanceReveal = smoothstep(0.0, 1.0, uReveal * 1.5 - vRandom * 0.5);
        deformedPos *= instanceReveal;

        vec4 worldPos = modelMatrix * instanceMatrix * vec4(deformedPos, 1.0);
        vWorldPosition = worldPos.xyz;
        
        vec4 mvPosition = viewMatrix * worldPos;
        vViewPosition = -mvPosition.xyz;
        
        // Recalculate normal approximation
        mat3 normalMat = mat3(modelMatrix * instanceMatrix);
        vNormal = normalize(normalMat * normal);
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const ASTEROID_FRAG = `
    ${NOISE_GLSL}
    
    uniform vec3 uColor;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;
    varying float vRandom;

    void main() {
        // --- LEVEL OF DETAIL (LOD) ---
        float dist = length(vViewPosition);
        
        // Fix: Increased LOD fade distance significantly (from 800 to 15000)
        // so asteroids at 3000+ units still have surface texture.
        float lodFactor = 1.0 - smoothstep(2000.0, 15000.0, dist);
        
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 pos = vLocalPosition;
        
        // --- PROCEDURAL TEXTURING ---
        
        // 1. Crater / Surface Pitting (Inverted Noise)
        float pits = snoise(pos * 3.0 + vRandom * 10.0);
        pits = smoothstep(0.2, 0.8, pits) * lodFactor; 
        
        // 2. Mineral Veins (Ridged Noise)
        float veins = abs(snoise(pos * 6.0 + vRandom * 20.0));
        veins = 1.0 - veins; 
        veins = pow(veins, 4.0); 
        veins *= lodFactor;

        // 3. Micro-grain (High freq)
        float grain = snoise(pos * 15.0) * 0.1 * lodFactor;

        // --- BUMP MAPPING ---
        float h = (grain - pits * 0.5 + veins * 0.2) * 0.5;
        
        // Fake derivative for bump mapping
        vec3 bumpNormal = normal;
        if (lodFactor > 0.1) {
            float strength = 1.5 * lodFactor; 
            bumpNormal = normalize(normal + vec3(h) * strength); 
        }

        // --- LIGHTING ---
        
        // 1. CORE LIGHT (The Sun)
        vec3 corePos = vec3(0.0, 4.0, 0.0);
        vec3 lightDir = normalize(corePos - vWorldPosition);
        float NdotL = max(0.0, dot(bumpNormal, lightDir));
        
        // Standard Lambert with slight wrap for space feel
        float coreLight = NdotL * 0.9 + 0.1; 
        
        // 2. HEADLAMP (The Player) - Faint fill
        float NdotV = max(0.0, dot(bumpNormal, viewDir));
        float headLight = NdotV * 0.1;

        // 3. FRESNEL (Atmospheric Dust Rim)
        float fresnel = pow(1.0 - NdotV, 3.0);
        
        // --- COLOR MIXING ---
        // Darken the base color to look like rock, not plastic
        vec3 rockColor = uColor * 0.4; 
        
        // Darken craters
        rockColor *= (1.0 - pits * 0.8);
        
        // Brighten veins (Metallic/Ice)
        vec3 veinColor = vec3(0.8, 0.85, 0.9); 
        vec3 albedo = mix(rockColor, veinColor, veins * 0.5);

        // Lighting Composition
        vec3 diffuse = albedo * (coreLight + headLight);
        vec3 rim = vec3(0.1, 0.15, 0.2) * fresnel * 0.5;
        
        // Specular highlight for veins
        vec3 halfVec = normalize(lightDir + viewDir);
        float spec = pow(max(0.0, dot(bumpNormal, halfVec)), 32.0);
        vec3 specular = veinColor * spec * veins * 1.5;

        vec3 finalCol = diffuse + rim + specular;
        
        // Simple distance fade to black
        float fade = 1.0 - smoothstep(18000.0, 30000.0, dist);
        
        gl_FragColor = vec4(finalCol * fade, 1.0);
    }
`;
