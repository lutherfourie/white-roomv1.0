
export const PLANET_VERT = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vLocalPosition;
    varying vec3 vWorldPosition;
    
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vLocalPosition = position; 
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const PLANET_FRAG = `
    uniform float uTime;
    uniform vec3 uColorA; // Ocean/Base/Crust
    uniform vec3 uColorB; // Land/Band/Lava
    uniform vec3 uColorC; // Mountain/Detail/Hotspots
    uniform float uType;  // 0 = Terrestrial, 1 = Gaseous, 2 = Molten, 3 = Ice

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vLocalPosition;
    varying vec3 vWorldPosition;

    // --- NOISE FUNCTIONS ---
    // Simplex 3D Noise 
    // Description : Array and textureless GLSL 2D/3D/4D simplex noise functions.
    //      Author : Ian McEwan, Ashima Arts.
    //  Maintainer : ijm
    //     Lastmod : 20110822 (ijm)
    //     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
    //               Distributed under the MIT License. See LICENSE file.
    //               https://github.com/ashima/webgl-noise
    // 

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) { 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

        // First corner
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 =   v - i + dot(i, C.xxx) ;

        // Other corners
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );

        //   x0 = x0 - 0.0 + 0.0 * C.xxx;
        //   x1 = x0 - i1  + 1.0 * C.xxx;
        //   x2 = x0 - i2  + 2.0 * C.xxx;
        //   x3 = x0 - 1.0 + 3.0 * C.xxx;
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
        vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

        // Permutations
        i = mod289(i); 
        vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

        // Gradients: 7x7 points over a square, mapped onto an octahedron.
        // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
        float n_ = 0.142857142857; // 1.0/7.0
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,N*N)

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );

        //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
        //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);

        //Normalise gradients
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        // Mix final noise value
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    // --- LOD FBM ---
    // distFactor: 0 (Close) -> 1 (Far)
    float fbm(vec3 p, float distFactor) {
        float value = 0.0;
        float amplitude = 0.5;
        
        // Ensure loops run at least a few times
        // Mix octaves: 5 when close, 2 when far
        float maxOctaves = mix(5.0, 2.0, distFactor);

        for (int i = 0; i < 5; i++) {
            float fi = float(i);
            // Weight fades out the last octave smoothly
            float weight = smoothstep(0.0, 1.0, maxOctaves - fi);
            
            if (weight <= 0.0) break;

            value += amplitude * snoise(p) * weight;
            p *= 2.0; 
            amplitude *= 0.5; 
        }
        return value;
    }

    void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 normal = normalize(vNormal);
        
        float dist = length(vViewPosition);
        // Map distance to a 0-1 factor for LOD
        float distFactor = smoothstep(1500.0, 30000.0, dist);
        
        // Light source at (0,0,0) (The Core)
        // Since planets are around the core, light comes from -vWorldPosition
        vec3 lightDir = normalize(-vWorldPosition); 
        float NdotL = max(0.0, dot(normal, lightDir));
        
        // Ambient fill
        float diffuse = smoothstep(-0.2, 1.0, NdotL);
        diffuse = max(diffuse, 0.1); 

        vec3 color = vec3(0.0);
        
        if (uType < 0.5) { 
            // TERRESTRIAL
            float freqScale = mix(0.03, 0.008, distFactor);
            float timeScale = mix(0.05, 0.01, distFactor);
            
            float n = fbm(vLocalPosition * freqScale + vec3(0.0, 0.0, uTime * timeScale), distFactor); 
            
            // Hard edge for continents
            float shore = smoothstep(0.0, 0.05, n);
            
            vec3 ocean = uColorA;
            vec3 land = mix(uColorB, uColorC, smoothstep(0.2, 0.7, n));
            
            color = mix(ocean, land, shore);
            
            // Specular on ocean
            if (shore < 0.5) {
                vec3 ref = reflect(-lightDir, normal);
                float spec = pow(max(dot(ref, viewDir), 0.0), 30.0);
                color += vec3(0.5) * spec * NdotL;
            }
            
            // Clouds
            float cFreq = freqScale * 1.5;
            float c = fbm(vLocalPosition * cFreq + vec3(uTime * 0.02), distFactor);
            float cloudMask = smoothstep(0.4, 0.6, c);
            color = mix(color, vec3(1.0), cloudMask * 0.7);

        } else if (uType < 1.5) {
            // GAS GIANT
            float freq = mix(0.005, 0.002, distFactor);
            float n = snoise(vLocalPosition * freq + vec3(0.0, uTime * 0.02, 0.0));
            
            float bandCoord = vLocalPosition.y * freq * 5.0 + n * 2.0;
            float band = sin(bandCoord * 3.14);
            
            color = mix(uColorA, uColorB, smoothstep(-0.5, 0.5, band));
            
            float bandDetail = cos(bandCoord * 6.28);
            color = mix(color, uColorC, smoothstep(0.5, 1.0, bandDetail) * (1.0 - distFactor));
            
        } else if (uType < 2.5) {
            // MOLTEN
            float scale = mix(0.015, 0.005, distFactor);
            vec3 q = vLocalPosition * scale;
            vec3 flow = vec3(uTime * 0.05, uTime * 0.1, 0.0);
            
            float n = fbm(q + flow, distFactor);
            float ridges = 1.0 - abs(n);
            float sharp = mix(4.0, 2.0, distFactor); 
            ridges = pow(ridges, sharp);
            
            vec3 crust = uColorA;
            vec3 lava = mix(uColorB, uColorC, ridges);
            
            float lavaIntensity = smoothstep(0.4, 0.9, ridges);
            color = mix(crust * diffuse, lava * 2.0, lavaIntensity);
            diffuse = 1.0; // Emissive doesn't need much shadow
            
        } else {
            // ICE
            float freq = mix(0.01, 0.004, distFactor);
            float n = fbm(vLocalPosition * freq, distFactor);
            color = mix(uColorA, uColorB, n);
            color = mix(color, uColorC, smoothstep(0.6, 0.8, n));
        }

        // --- ATMOSPHERE GLOW (Fresnel) ---
        // Simple approximation
        float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);
        
        vec3 atmColor = vec3(0.3, 0.5, 0.9);
        if (uType > 1.5 && uType < 2.5) atmColor = vec3(1.0, 0.4, 0.1); 
        
        float atmStrength = fresnel * (0.2 + 0.8 * diffuse); 
        
        // Clamp distance fade so it doesn't disappear completely or blow out
        atmStrength *= clamp(1.2 - distFactor * 0.5, 0.0, 1.0); 
        
        if (uType < 1.5 || uType > 2.5) {
             color *= diffuse;
             color += atmColor * atmStrength * 0.5;
        } else {
             // Molten planets glow more
             color += atmColor * fresnel * 0.4;
        }

        gl_FragColor = vec4(color, 1.0);
    }
`;

export const RING_FRAG = `
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
        vec2 uv = vUv - 0.5;
        float dist = length(uv);
        
        if (dist > 0.5 || dist < 0.15) discard;
        
        float alpha = smoothstep(0.15, 0.2, dist) * smoothstep(0.5, 0.45, dist);
        
        // Bands
        float bandFreq = 60.0;
        float bandVal = dist * bandFreq;
        float delta = fwidth(bandVal);
        float band = sin(bandVal);
        
        // Soft fade for aliasing
        float bandMix = 1.0 - smoothstep(0.5, 2.0, delta);
        
        alpha *= (0.7 + 0.3 * band * bandMix);
        
        float dust = sin(vWorldPosition.x * 0.05) * sin(vWorldPosition.z * 0.05);
        alpha *= (0.8 + 0.2 * dust);

        gl_FragColor = vec4(uColor, alpha * 0.7);
    }
`;

export const ATMOSPHERE_VERT = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        // Keep offset minimal to avoid depth issues, relies on mesh scaling
        vec3 pos = position + normal * 0.01; 
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

export const ATMOSPHERE_FRAG = `
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        float dotNV = dot(normal, viewDir);
        
        // Smoother falloff
        float intensity = pow(0.6 + dotNV, 4.0);
        float edgeFade = smoothstep(0.0, 0.3, 1.0 + dotNV);
        
        gl_FragColor = vec4(uColor, intensity * edgeFade * 0.5);
    }
`;
