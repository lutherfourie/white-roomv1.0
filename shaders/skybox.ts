
export const SKY_VERT = `
    varying vec3 vWorldPos;
    void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

// Shared Star Function using Cellular Noise for Stability
const CELLULAR_STAR_FUNC = `
    // 3D Random Hash
    vec3 hash33(vec3 p) {
        p = fract(p * vec3(.1031, .1030, .0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
    }

    // Stable Cellular Stars (Voronoi)
    // Checks neighbors to ensure stars don't pop in/out at cell boundaries
    float getStarField(vec3 p, float density) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        
        float minDist = 1.0;
        
        // Check 3x3x3 neighbors
        for(int z=-1; z<=1; z++) {
            for(int y=-1; y<=1; y++) {
                for(int x=-1; x<=1; x++) {
                    vec3 neighbor = vec3(float(x), float(y), float(z));
                    vec3 point = hash33(i + neighbor);
                    
                    // Jitter position to be random within cell
                    vec3 pos = neighbor + point;
                    
                    float dist = length(f - pos);
                    minDist = min(minDist, dist);
                }
            }
        }
        
        // Create sharp but smooth dots
        // Adjust radius based on density
        float radius = 0.05 + density * 0.01; 
        float star = 1.0 - smoothstep(radius, radius + 0.02, minDist);
        return star;
    }
`;

export const NEBULA_FRAG = `
    uniform float uTime;
    varying vec3 vWorldPos;

    ${CELLULAR_STAR_FUNC}

    // Gradient Noise 3D - Quintic Interpolation for smoothness
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + .1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        
        // Quintic smooth
        vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        
        return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), u.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z);
    }

    const mat3 m = mat3(0.00, 0.80, 0.60,
                      -0.80, 0.36, -0.48,
                      -0.60, -0.48, 0.64);

    float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p = m * p * 2.02;
        f += 0.2500 * noise(p); p = m * p * 2.03;
        f += 0.1250 * noise(p); p = m * p * 2.01;
        f += 0.0625 * noise(p);
        return f;
    }

    float pattern(in vec3 p, out vec3 q, out vec3 r, float t) {
        q.x = fbm(p + vec3(0.0, 0.0, 0.0));
        q.y = fbm(p + vec3(5.2, 1.3, 0.0));
        q.z = fbm(p + vec3(1.2, 3.4, 0.0));

        r.x = fbm(p + 4.0 * q + vec3(1.7, 9.2, 0.5 * t));
        r.y = fbm(p + 4.0 * q + vec3(8.3, 2.8, 0.2 * t));
        r.z = fbm(p + 4.0 * q + vec3(1.2, 5.4, 0.3 * t));

        return fbm(p + 4.0 * r);
    }

    void main() {
        vec3 dir = normalize(vWorldPos);
        float time = uTime * 0.03; 
        
        // Stable stars using cellular noise
        // This removes the "grain" from high-frequency hash
        float stars = getStarField(dir * 200.0, 1.0) * 1.0;
        
        vec3 p = dir * 2.0; 
        vec3 q, r;
        float density = pattern(p, q, r, time);
        
        float regionMap = fbm(p * 0.4 + vec3(time * 0.1));
        float cTime = uTime * 0.1;

        vec3 col1_Deep = vec3(0.0, 0.1 + sin(cTime)*0.05, 0.3 + cos(cTime * 0.8)*0.1);
        vec3 col1_Mid = vec3(0.0 + cos(cTime * 0.5)*0.1, 0.5 + sin(cTime * 0.3)*0.1, 0.6);
        vec3 col1_High = vec3(0.4, 1.0, 0.8 + sin(cTime)*0.1);
        
        vec3 col2_Deep = vec3(0.2 + sin(cTime * 0.7)*0.05, 0.0, 0.1 + cos(cTime)*0.05);
        vec3 col2_Mid = vec3(0.7 + cos(cTime * 0.6)*0.1, 0.1, 0.4 + sin(cTime * 0.6)*0.1);
        vec3 col2_High = vec3(1.0, 0.7 + sin(cTime * 0.4)*0.1, 0.2);
        
        float d = smoothstep(0.0, 1.2, density);
        
        vec3 c1 = mix(col1_Deep, col1_Mid, d);
        c1 = mix(c1, col1_High, pow(d, 2.0));
        
        vec3 c2 = mix(col2_Deep, col2_Mid, d);
        c2 = mix(c2, col2_High, pow(d, 2.0));
        
        float mixVal = smoothstep(0.35, 0.65, regionMap);
        vec3 nebulaColor = mix(c1, c2, mixVal);
        
        vec3 bg = vec3(0.05, 0.05, 0.1); 
        vec3 col = mix(bg, nebulaColor, smoothstep(-0.2, 1.0, density));
        col *= 1.3;
        
        // Composite stars
        // Only show stars where density is low
        col += vec3(stars) * (1.0 - smoothstep(0.0, 0.6, density));
        
        gl_FragColor = vec4(col, 1.0);
    }
`;
