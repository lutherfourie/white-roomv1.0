

// Simplex Noise and Math Utils
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

export const CORE_VERTEX_SHADER = `
    ${NOISE_GLSL}
    uniform float uTime;
    uniform float uAudioLevel;
    uniform float uPulseSpeed;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vDisplacement;
    
    void main() {
        vUv = uv;
        vec3 p = position;
        
        // --- LIQUID DISPLACEMENT LOGIC ---
        float time = uTime * uPulseSpeed * 0.2;
        float displacement = 0.0;
        
        // Layer 1: Base shape warping
        displacement += snoise(p * 1.5 + vec3(time)) * 0.4;
        
        // Layer 2: Medium detail ("Bubbles")
        displacement += snoise(p * 3.5 + vec3(time * 1.5)) * 0.2;
        
        // Layer 3: High frequency ("Ripples")
        displacement += snoise(p * 8.0 + vec3(time * 2.0)) * 0.1;
        
        // Audio reaction kicks vertices out
        float audioAmp = smoothstep(0.1, 1.0, uAudioLevel) * 0.4;
        displacement += snoise(p * 10.0 + time * 5.0) * audioAmp;

        vDisplacement = displacement;
        
        // Extrude along normal
        vec3 newPos = position + normal * displacement * 0.4;
        
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const CORE_FRAGMENT_SHADER = `
    uniform float uTime;
    uniform vec3 uColorA; // Cyan/Blue
    uniform vec3 uColorB; // Magenta/Alt
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vDisplacement;

    void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 normal = normalize(vNormal);
        
        // --- MATERIAL DEFINITION ---
        
        // 1. Base Color (Obsidian / Dark Metal)
        vec3 baseColor = vec3(0.01, 0.01, 0.03);
        
        // 2. Map displacement to surface properties
        // We normalize displacement roughly to 0..1
        float d = smoothstep(-0.5, 0.6, vDisplacement);
        
        // "Valleys" (low d) are the molten inner core exposing itself
        // "Peaks" (high d) are the cooled crust
        
        // 3. Internal Glow (Emissive)
        // Mix colors based on time for pulsing effect
        vec3 glowColor = mix(uColorA, uColorB, sin(vDisplacement * 4.0 + uTime) * 0.5 + 0.5);
        
        // The glow intensity is inverted displacement. Deep spots glow hottest.
        float glowIntensity = 1.0 - d;
        glowIntensity = pow(glowIntensity, 4.0); // Make it sharp, only deep cracks glow
        
        vec3 emissive = glowColor * glowIntensity * 3.0;
        
        // 4. Specular / Reflection (Glossy Crust)
        // High peaks are smoother and shinier
        float roughness = mix(0.1, 0.8, glowIntensity); // Cracks are rough/bright, peaks are smooth/dark
        
        // Rim Light (Fresnel) - Gives it volume
        float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
        vec3 rimColor = vec3(0.2, 0.4, 0.8);
        
        // Specular Highlight (Fake Point Light)
        vec3 lightPos = vec3(5.0, 10.0, 5.0);
        vec3 lightDir = normalize(lightPos);
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
        
        // Combine
        vec3 color = baseColor;
        color += emissive;
        color += rimColor * fresnel * 0.5;
        color += vec3(1.0) * spec * d; // Only peaks catch the highlight
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

export const FLARE_VERTEX_SHADER = `
    ${NOISE_GLSL}
    uniform float uTime;
    uniform float uThreshold;
    
    varying vec3 vNormal;
    varying float vNoise;
    varying vec3 vViewPosition;
    
    void main() {
        vNormal = normalize(normalMatrix * normal);
        
        // Animate noise coordinate
        // Higher frequency for more detailed fire tongues
        vec3 p = position * 1.5 + vec3(uTime * 0.5, uTime * 0.8, 0.0);
        
        // Layered noise for complex fire shape
        float n = snoise(p);
        n += snoise(p * 2.0 + uTime) * 0.5;
        n += snoise(p * 4.0 - uTime * 1.5) * 0.25;
        
        vNoise = n;
        
        // Extrude only positive noise peaks (flares)
        // uThreshold controls how "active" the sun is. Lower = more flares.
        float displacement = max(0.0, n - uThreshold); 
        
        // Push outward significantly
        vec3 newPos = position + normal * displacement * 8.0;
        
        vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const FLARE_FRAGMENT_SHADER = `
    uniform float uTime;
    uniform vec3 uColor; // Base core color
    
    varying vec3 vNormal;
    varying float vNoise;
    varying vec3 vViewPosition;
    
    void main() {
        // Opacity based on displacement/noise
        // Only show the hottest parts
        float alpha = smoothstep(0.4, 1.2, vNoise);
        
        // Soft edge fade
        if (alpha < 0.01) discard;
        
        // Energy Palette based on uColor
        // Create a hot, glowing center and darker edges
        vec3 cDark = uColor * 0.5;
        vec3 cMid = uColor * 2.0;
        vec3 cBright = vec3(1.0, 1.0, 1.0);
        
        // Map noise to color gradient
        vec3 color = mix(cDark, cMid, smoothstep(0.4, 0.8, vNoise));
        color = mix(color, cBright, smoothstep(0.8, 1.5, vNoise));
        
        // Fresnel fade to make it look gaseous
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);
        
        // Pulsating heat shimmer
        float pulse = sin(uTime * 20.0 + vNoise * 10.0) * 0.1 + 0.9;
        
        gl_FragColor = vec4(color * pulse, alpha * fresnel * 0.8); 
    }
`;
