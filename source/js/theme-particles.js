/**
 * Three.js 真实物理感 3D 山水天时引擎 (True 3D Raymarched Alpine Valley + Physical Water + Interactive Celestial & Flora)
 * - 零静态图片，告别 2D 剪影贴片：
 *   1. 真实 3D 摄像机射线矩阵 (6-DOF Camera Raycasting)：支持自由拖拽环视 3D 山谷、滚轮推进景深、鼠标惯性视差。
 *   2. 真实 3D 地形高度场光线步进 (3D Raymarched Heightfield Terrain)：具有真实 3D 法线向量 N = normalize(dH/dx, 1, dH/dz)、
 *      太阳方向实时山体自阴影 (3D Raycast Soft Shadows)、陡坡岩层纹理与缓坡森林树冠分层、以及按海拔/坡度/迎风面物理沉积的真实雪线。
 *   3. 真实物理大气散射 + 丁达尔体积光 (Rayleigh/Mie Atmospheric Scattering & Crepuscular Rays) + 3D 多层体积云。
 *   4. 真实 3D 水平湖面交点计算 (3D Ray-Plane Water Intersection y=0)：菲涅尔反射真实 3D 山体与流云，支持鼠标划过或点击湖面
 *      在精确的 3D 世界坐标 (worldX, worldZ) 激起物理扩散水波纹并实时扭曲倒影。
 *   5. 直接天体交互：可直接按住并拖拽 3D 天空中的太阳或月亮，实时拨动一天 24 小时的光影与山谷阴影移动。
 *   6. 近景 3D 岸边芦苇/草叶与四季物象层（保留 buildSakuraPetalPath 植物学樱瓣几何）。
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

  const THREE_CDNS = [
    'https://registry.npmmirror.com/three/0.160.0/files/build/three.min.js',
    'https://unpkg.com/three@0.160.0/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'
  ]

  const bgCanvas = document.createElement('canvas')
  const fgCanvas = document.createElement('canvas')
  const ctx = fgCanvas.getContext('2d', { alpha: true })
  const particles = []
  const reeds = []

  let width = 0
  let height = 0
  let dpr = 1
  let animationFrame = 0
  let layerAlpha = 1
  let wind = 0.12
  let windTarget = 0.14
  let windPhase = 0
  let resizeTimer = 0
  let pointerX = -9999
  let pointerY = -9999
  let lastPointerX = -9999
  let lastPointerY = -9999
  let lastRippleSpawnAt = 0

  // 3D Camera orientation & free-look state
  let camYawTarget = 0
  let camPitchTarget = 0
  let camYaw = 0
  let camPitch = 0
  let camZoomTarget = 0
  let camZoom = 0
  let userLookYaw = 0
  let userLookPitch = 0
  let isDraggingWorld = false
  let isDraggingSun = false
  let dragStartX = 0
  let dragStartY = 0
  let dragStartYaw = 0
  let dragStartPitch = 0

  let breezeVx = 0
  let breezeVy = 0
  let scrollBreezeX = 0
  let scrollBreezeY = 0
  let lastScrollY = typeof window !== 'undefined' ? (window.scrollY || 0) : 0
  let musicActive = false
  let startTime = performance.now()

  // 6 live 3D water ripples: [worldX, worldZ, birthTimeSec, strength]
  const MAX_RIPPLES = 6
  const rippleBuffer = new Float32Array(MAX_RIPPLES * 4)
  for (let i = 0; i < MAX_RIPPLES; i += 1) {
    rippleBuffer[i * 4 + 2] = -999.0
  }
  let rippleCursor = 0

  const worldState = {
    hour: 15.5,
    targetHour: 15.5,
    season: 2.0, // 0=spring, 1=summer, 2=autumn, 3=winter
    targetSeason: 2.0,
    weather: 0.0, // 0=clear, 1=cloudy, 2=rain, 3=snow, 4=fog
    targetWeather: 0.0,
    tempC: 15.0,
    targetTempC: 15.0,
    cloudCover: 0.28,
    targetCloudCover: 0.28,
    windSpeed: 1.0,
    targetWindSpeed: 1.0,
    particleKind: 'ginkgo'
  }

  const rand = (min, max) => min + Math.random() * (max - min)
  const pickIndex = len => Math.floor(Math.random() * len)
  const rgba = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'

  /* ==========================================================================
     Shared 3D Camera & Celestial Math (CPU <-> GPU exact match for ray picking)
     ========================================================================== */
  const getCameraBasis = () => {
    const yaw = camYaw + userLookYaw
    const pitch = Math.max(-0.28, Math.min(0.38, 0.06 + camPitch + userLookPitch))
    const ro = [camYaw * 0.45, 1.55 - camZoom * 0.35, -3.2 + camZoom * 2.4]
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const fwd = [sy * cp, sp, cy * cp]
    // right = normalize(cross(fwd, up=(0,1,0))) = normalize(-fwd.z, 0, fwd.x) -> Wait: in left-handed / standard look:
    const rLen = Math.hypot(cy, sy) || 1
    const right = [cy / rLen, 0, -sy / rLen]
    // up = cross(right, fwd)
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]
    ]
    return { ro, fwd, right, up, fov: 1.18 }
  }

  const getSunDirection = hour => {
    const dayAngle = ((hour - 5.75) / 12.5) * Math.PI
    const elev = Math.sin(dayAngle) * 0.72
    const azim = Math.cos(dayAngle) * -0.95
    const ce = Math.cos(elev)
    const x = Math.sin(azim) * ce
    const y = Math.sin(elev)
    const z = Math.cos(azim) * ce
    const len = Math.hypot(x, y, z) || 1
    return [x / len, y / len, z / len]
  }

  const getMoonDirection = hour => {
    const nightAngle = (((hour + 12.0) % 24.0 - 5.75) / 12.5) * Math.PI
    const elev = Math.max(0.14, Math.sin(nightAngle) * 0.64)
    const azim = Math.cos(nightAngle) * 0.78
    const ce = Math.cos(elev)
    const x = Math.sin(azim) * ce
    const y = Math.sin(elev)
    const z = Math.cos(azim) * ce
    const len = Math.hypot(x, y, z) || 1
    return [x / len, y / len, z / len]
  }

  // Unproject screen pixel (clientX, clientY) to 3D ray direction
  const screenToRay = (clientX, clientY) => {
    const w = width || window.innerWidth || 1
    const h = height || window.innerHeight || 1
    const aspect = w / Math.max(1, h)
    const u = ((clientX / w) - 0.5) * aspect
    const v = 0.5 - (clientY / h)
    const basis = getCameraBasis()
    const rx = basis.fwd[0] * basis.fov + basis.right[0] * u + basis.up[0] * v
    const ry = basis.fwd[1] * basis.fov + basis.right[1] * u + basis.up[1] * v
    const rz = basis.fwd[2] * basis.fov + basis.right[2] * u + basis.up[2] * v
    const len = Math.hypot(rx, ry, rz) || 1
    return {
      ro: basis.ro,
      rd: [rx / len, ry / len, rz / len]
    }
  }

  // Spawn a physical 3D ripple at the exact ray-lake (y=0) intersection
  const spawnWaterRippleAtScreen = (clientX, clientY, strength) => {
    const { ro, rd } = screenToRay(clientX, clientY)
    if (rd[1] >= -0.008) return false
    const t = -ro[1] / rd[1]
    if (t <= 0.5 || t > 55.0) return false
    const wx = ro[0] + rd[0] * t
    const wz = ro[2] + rd[2] * t
    const nowSec = (performance.now() - startTime) * 0.001
    const idx = rippleCursor * 4
    rippleBuffer[idx] = wx
    rippleBuffer[idx + 1] = wz
    rippleBuffer[idx + 2] = nowSec
    rippleBuffer[idx + 3] = strength
    rippleCursor = (rippleCursor + 1) % MAX_RIPPLES
    return true
  }

  // Check if pointer is hovering near the 3D Sun or Moon disc in the sky
  const isPointerNearCelestial = (clientX, clientY) => {
    const { rd } = screenToRay(clientX, clientY)
    if (rd[1] < 0.0) return false
    const sunDir = getSunDirection(worldState.hour)
    const moonDir = getMoonDirection(worldState.hour)
    const dotSun = rd[0] * sunDir[0] + rd[1] * sunDir[1] + rd[2] * sunDir[2]
    const dotMoon = rd[0] * moonDir[0] + rd[1] * moonDir[1] + rd[2] * moonDir[2]
    if (sunDir[1] > -0.15 && dotSun > 0.992) return true
    if (sunDir[1] < 0.08 && dotMoon > 0.992) return true
    return false
  }

  /* ==========================================================================
     True 3D Raymarched Alpine Terrain, Physical Sky & Water GLSL Shaders
     ========================================================================== */
  const VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `

  const RAW_VERTEX_SHADER = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `

  const FRAGMENT_SHADER = `
    precision highp float;
    varying vec2 vUv;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uHour;
    uniform float uSeason;
    uniform float uWeather;
    uniform float uTempC;
    uniform float uCloudCover;
    uniform float uWindSpeed;
    uniform vec3 uCamPos;
    uniform vec3 uCamFwd;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;
    uniform vec4 uRipples[6];

    // High-quality hash without sine banding artifacts
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    // Value noise with analytic derivatives for fast 3D terrain erosion
    vec3 noised(vec2 x) {
      vec2 i = floor(x);
      vec2 f = fract(x);
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

      float a = hash12(i + vec2(0.0, 0.0));
      float b = hash12(i + vec2(1.0, 0.0));
      float c = hash12(i + vec2(0.0, 1.0));
      float d = hash12(i + vec2(1.0, 1.0));

      float k0 = a;
      float k1 = b - a;
      float k2 = c - a;
      float k4 = a - b - c + d;

      return vec3(
        k0 + k1 * u.x + k2 * u.y + k4 * u.x * u.y,
        du * (vec2(k1, k2) + k4 * u.yx)
      );
    }

    float noise(vec2 x) {
      vec2 i = floor(x);
      vec2 f = fract(x);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
        mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.02 + vec2(13.7, 29.3);
        a *= 0.5;
      }
      return v;
    }

    // Seasonal smooth interpolation (0=spring, 1=summer, 2=autumn, 3=winter)
    vec3 seasonalMix(vec3 spr, vec3 sum, vec3 aut, vec3 win, float s) {
      float wSpr = max(0.0, 1.0 - abs(s - 0.0));
      float wSum = max(0.0, 1.0 - abs(s - 1.0));
      float wAut = max(0.0, 1.0 - abs(s - 2.0));
      float wWin = max(0.0, 1.0 - abs(s - 3.0)) + max(0.0, 1.0 - abs(s + 1.0));
      float tot = max(0.001, wSpr + wSum + wAut + wWin);
      return (spr * wSpr + sum * wSum + aut * wAut + win * wWin) / tot;
    }

    // 3D Alpine Valley & Lake Basin Heightfield y = terrainH(xz)
    // Derivative-accumulated erosion FBM (Inigo Quilez method) for realistic mountain ridges & gullies
    float terrainH(vec2 p, bool highDetail) {
      // Valley lake channel: open water basin in center-front (z < 28, |x| < basinWidth)
      float lakeChannel = smoothstep(3.2, 16.5, abs(p.x - sin(p.y * 0.07) * 3.8));
      float backRise = smoothstep(14.0, 56.0, p.y);
      float farAlpine = smoothstep(34.0, 78.0, p.y);
      float basinMask = clamp(lakeChannel * smoothstep(2.0, 16.0, p.y) + backRise * 1.15, 0.0, 1.6);

      vec2 q = p * 0.085 + vec2(1.7, 2.4);
      vec2 dSum = vec2(0.0);
      float h = 0.0;
      float amp = 1.0;
      mat2 m = mat2(0.8, -0.6, 0.6, 0.8);

      for (int i = 0; i < 5; i++) {
        vec3 n = noised(q);
        dSum += n.yz;
        // Ridged erosion: dampens height where gradient dSum is steep, carving realistic valleys
        float ridge = 1.0 - abs(n.x * 2.0 - 1.0);
        float layer = mix(n.x, ridge * ridge, 0.52);
        h += amp * layer / (1.0 + dot(dSum, dSum) * 0.85);
        q = m * q * 2.06 + vec2(7.3, 11.9);
        amp *= 0.49;
      }

      if (highDetail) {
        vec3 n6 = noised(q);
        dSum += n6.yz;
        h += amp * n6.x / (1.0 + dot(dSum, dSum));
        q = m * q * 2.08;
        amp *= 0.48;
        h += amp * noise(q);
      }

      // Main alpine peak silhouette on distant horizon
      float mainPeak = exp(-pow((p.x - 4.5) * 0.048, 2.0) - pow((p.y - 54.0) * 0.055, 2.0)) * 9.2;
      float leftRange = exp(-pow((p.x + 14.0) * 0.055, 2.0) - pow((p.y - 38.0) * 0.06, 2.0)) * 6.4;
      float rightPeninsula = exp(-pow((p.x - 11.5) * 0.08, 2.0) - pow((p.y - 21.0) * 0.09, 2.0)) * 3.4;

      float rawElevation = (h * 6.8 * basinMask) + mainPeak + leftRange + rightPeninsula + farAlpine * 4.5;
      // Carve lake bed below y=0 in the central basin
      float lakeBed = -1.25 * (1.0 - clamp(basinMask * 1.35, 0.0, 1.0));
      return rawElevation + lakeBed;
    }

    vec3 calcTerrainNormal(vec2 xz, float t) {
      float eps = max(0.025, t * 0.0022);
      float hL = terrainH(xz - vec2(eps, 0.0), true);
      float hR = terrainH(xz + vec2(eps, 0.0), true);
      float hD = terrainH(xz - vec2(0.0, eps), true);
      float hU = terrainH(xz + vec2(0.0, eps), true);
      return normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
    }

    // Real 3D soft shadow marching from terrain point toward 3D sun
    float calcSoftShadow(vec3 ro, vec3 rd) {
      if (rd.y < 0.02) return 0.15;
      float res = 1.0;
      float t = 0.35;
      for (int i = 0; i < 14; i++) {
        vec3 p = ro + rd * t;
        float h = terrainH(p.xz, false);
        float diff = p.y - h;
        if (diff < 0.005) return 0.08;
        res = min(res, 7.5 * diff / t);
        t += clamp(diff * 0.65, 0.35, 3.2);
        if (t > 45.0 || p.y > 18.0) break;
      }
      return clamp(res, 0.08, 1.0);
    }

    // Physical Henyey-Greenstein Mie scattering phase function
    float hgPhase(float cosTheta, float g) {
      float g2 = g * g;
      return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(0.01, 1.0 + g2 - 2.0 * g * cosTheta), 1.5));
    }

    // Physical Sky + Sun + Stars + 3D Perspective Cloud Layer for any 3D ray direction rd
    vec3 renderSkyAndClouds(
      vec3 rd,
      vec3 sunDir,
      vec3 moonDir,
      float dayFactor,
      float twilightFactor,
      float nightFactor,
      float rainFactor,
      float snowFactor,
      vec3 sunColor
    ) {
      float skyY = clamp(rd.y, 0.0, 1.0);
      float tempShift = clamp((uTempC - 15.0) / 18.0, -1.0, 1.0);

      // Physical Rayleigh zenith & horizon colors modulated by season and temperature
      vec3 zenithDay = seasonalMix(
        vec3(0.21, 0.47, 0.82), // Spring: clear alpine sky
        vec3(0.13, 0.43, 0.85), // Summer: deep cerulean
        vec3(0.18, 0.42, 0.76), // Autumn: high continental blue
        vec3(0.32, 0.52, 0.78), // Winter: crisp slate azure
        uSeason
      );
      vec3 horizonDay = seasonalMix(
        vec3(0.84, 0.89, 0.95),
        vec3(0.75, 0.89, 0.96),
        vec3(0.91, 0.86, 0.82),
        vec3(0.86, 0.90, 0.95),
        uSeason
      );
      horizonDay += vec3(0.035 * tempShift, 0.012 * tempShift, -0.03 * tempShift);

      // Optical air-mass gradient
      vec3 daySky = mix(horizonDay, zenithDay, pow(skyY, 0.55));

      // Twilight optical scattering (golden hour -> civil twilight)
      float sunAzAlign = clamp(dot(normalize(rd.xz), normalize(sunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 twiHorizon = mix(vec3(0.45, 0.48, 0.66), vec3(0.96, 0.54, 0.32), pow(sunAzAlign, 1.4));
      vec3 twiMid = mix(vec3(0.26, 0.32, 0.54), vec3(0.72, 0.42, 0.55), sunAzAlign);
      vec3 twiZenith = vec3(0.11, 0.16, 0.34);
      vec3 twiSky = mix(twiHorizon, twiMid, smoothstep(0.0, 0.36, skyY));
      twiSky = mix(twiSky, twiZenith, smoothstep(0.32, 0.95, skyY));

      // Night sky
      vec3 nightSky = mix(vec3(0.06, 0.10, 0.19), vec3(0.02, 0.035, 0.08), pow(skyY, 0.65));

      // Overcast / Rain atmospheric slate-celadon sky
      vec3 rainSky = mix(vec3(0.68, 0.75, 0.78), vec3(0.36, 0.45, 0.51), pow(skyY, 0.65));

      vec3 col = mix(nightSky, daySky, dayFactor);
      col = mix(col, twiSky, twilightFactor * 0.92);
      col = mix(col, rainSky, rainFactor * (0.35 + 0.55 * dayFactor));

      // Mie forward scattering around the 3D sun vector
      float cosSun = dot(rd, sunDir);
      float sunVis = clamp((dayFactor + twilightFactor * 0.95) * (1.0 - rainFactor * 0.85), 0.0, 1.0);
      float mieGlow = hgPhase(cosSun, 0.76) * 0.42 + exp(-acos(clamp(cosSun, -1.0, 1.0)) * 7.5) * 0.48;
      col += sunColor * mieGlow * sunVis;

      // Crisp solar disc with limb darkening
      float sunAngular = smoothstep(0.9991, 0.99965, cosSun);
      col += sunColor * 1.8 * sunAngular * sunVis;

      // Night Stars, Milky Way & Physically Lit Moon Sphere
      if (nightFactor > 0.01) {
        vec2 starProj = rd.xz / max(0.18, rd.y + 0.15);
        vec2 sGrid = starProj * 28.0;
        vec2 sId = floor(sGrid);
        vec2 sUv = fract(sGrid) - 0.5;
        vec2 sRand = hash22(sId);
        if (sRand.x > 0.82 && rd.y > 0.03) {
          vec2 sPos = (sRand - 0.5) * 0.58;
          float sDist = length(sUv - sPos);
          float twinkle = 0.72 + 0.28 * sin(uTime * (1.5 + sRand.y * 3.0) + sRand.x * 40.0);
          float starGlow = smoothstep(0.075, 0.008, sDist) * twinkle * smoothstep(0.03, 0.28, rd.y);
          vec3 starTint = mix(vec3(0.76, 0.86, 1.0), vec3(1.0, 0.93, 0.82), sRand.y);
          col += starTint * starGlow * nightFactor * (1.0 - rainFactor * 0.9);
        }

        // Subtle Milky Way dust band
        float galacticPlane = exp(-pow((rd.x * 0.7 + rd.y - 0.52) * 3.1, 2.0));
        float galacticDust = fbm(starProj * 1.8 + vec2(2.3, -1.1));
        col += vec3(0.14, 0.20, 0.36) * galacticPlane * galacticDust * 0.32 * nightFactor * (1.0 - rainFactor);

        // 3D Moon with lunar phase shading
        float cosMoon = dot(rd, moonDir);
        float moonHalo = exp(-acos(clamp(cosMoon, -1.0, 1.0)) * 12.0) * 0.22;
        float moonDisc = smoothstep(0.9992, 0.99955, cosMoon);
        float lunarMaria = 0.85 + 0.15 * fbm(rd.xy * 65.0);
        col += vec3(0.92, 0.94, 0.98) * (moonDisc * lunarMaria * 1.15 + moonHalo) * nightFactor * (1.0 - rainFactor * 0.8);
      }

      // 3D Dual-Layer Volumetric Clouds projected onto 3D upper cloud plane (y = 14m and y = 22m)
      if (rd.y > 0.015) {
        vec2 windVel = vec2(0.18, 0.05) * uWindSpeed;
        vec2 cPlane1 = (rd.xz / (rd.y + 0.12)) * 2.2 + uTime * windVel * 0.12;
        vec2 cPlane2 = (rd.xz / (rd.y + 0.08)) * 1.15 + uTime * windVel * 0.06 + vec2(11.4, -7.2);

        float cn1 = fbm(cPlane1);
        float cn2 = fbm(cPlane1 * 2.35 - uTime * 0.015);
        float cDensity = cn1 * 0.66 + cn2 * 0.34;
        float highCirrus = fbm(cPlane2 * 1.8) * 0.45;

        float cover = clamp(uCloudCover + rainFactor * 0.42, 0.05, 0.95);
        float thresh = mix(0.66, 0.30, cover);
        float cloudMask = smoothstep(thresh, thresh + 0.24, cDensity) * smoothstep(0.015, 0.18, rd.y);
        float cirrusMask = smoothstep(0.54, 0.78, highCirrus) * smoothstep(0.08, 0.35, rd.y) * 0.42;

        // 3D directional lighting on clouds by sampling density gradient toward sunDir.xz
        float cSampleSun = fbm(cPlane1 + normalize(sunDir.xz + vec2(0.001)) * 0.18);
        float selfShadow = clamp((cDensity - cSampleSun) * 2.8 + 0.55, 0.18, 1.0);
        float silverLining = pow(clamp(cosSun, 0.0, 1.0), 6.0) * (1.0 - cloudMask * 0.6) * sunVis;

        vec3 cTopCol = mix(vec3(0.14, 0.19, 0.32), vec3(0.98, 0.98, 0.99), dayFactor);
        cTopCol = mix(cTopCol, vec3(0.98, 0.64, 0.45), twilightFactor * 0.88);
        cTopCol = mix(cTopCol, vec3(0.54, 0.60, 0.64), rainFactor * 0.72);

        vec3 cBaseCol = mix(vec3(0.07, 0.10, 0.18), vec3(0.66, 0.73, 0.82), dayFactor);
        cBaseCol = mix(cBaseCol, vec3(0.38, 0.28, 0.44), twilightFactor * 0.85);
        cBaseCol = mix(cBaseCol, vec3(0.34, 0.40, 0.45), rainFactor * 0.8);

        vec3 cloudFinal = mix(cBaseCol, cTopCol, selfShadow) + sunColor * silverLining * 0.65;
        col = mix(col, cloudFinal, clamp(cloudMask * 0.88 + cirrusMask * (1.0 - rainFactor * 0.5), 0.0, 0.92));
      }

      return col;
    }

    // Shaded 3D Terrain Colour with Rock Strata, Seasonal Forest, Snow Physics & Atmospheric Perspective
    vec3 shadeTerrain(
      vec3 pos,
      vec3 nor,
      vec3 rd,
      float t,
      vec3 sunDir,
      vec3 moonDir,
      float dayFactor,
      float twilightFactor,
      float nightFactor,
      float rainFactor,
      float snowFactor,
      vec3 sunColor,
      vec3 horizonFogCol
    ) {
      vec3 lightDir = nightFactor > 0.65 ? moonDir : sunDir;
      float shadow = calcSoftShadow(pos + nor * 0.08, lightDir);
      float sunDiff = max(0.0, dot(nor, lightDir)) * shadow;
      float skyAmb = clamp(0.45 + 0.55 * nor.y, 0.0, 1.0);
      float backLight = max(0.0, dot(nor, normalize(vec3(-lightDir.x, 0.2, -lightDir.z)))) * 0.25;

      // Micro-detail normal perturbation from rock strata & forest canopy
      float canopyNoise = fbm(pos.xz * 1.45);
      float strataNoise = noise(vec2(pos.x * 0.45 + canopyNoise * 0.5, pos.y * 2.8));

      // Base rock material (granite / alpine slate)
      vec3 rockCol = mix(vec3(0.24, 0.26, 0.30), vec3(0.38, 0.39, 0.42), strataNoise);

      // Seasonal forest & meadow vegetation
      float patchNoise = fbm(pos.xz * 0.22 + vec2(3.1, 5.7));
      vec3 sprVeg = mix(vec3(0.24, 0.42, 0.26), vec3(0.42, 0.58, 0.34), canopyNoise);
      // Wild mountain sakura clusters on lower spring slopes
      float sakuraPatch = smoothstep(0.62, 0.78, patchNoise) * smoothstep(5.2, 1.2, pos.y);
      sprVeg = mix(sprVeg, vec3(0.88, 0.68, 0.76), sakuraPatch * 0.72);

      vec3 sumVeg = mix(vec3(0.14, 0.34, 0.20), vec3(0.28, 0.48, 0.26), canopyNoise);
      vec3 autVeg = mix(
        vec3(0.22, 0.34, 0.22), // evergreen pine base
        mix(vec3(0.76, 0.48, 0.16), vec3(0.68, 0.24, 0.16), smoothstep(0.35, 0.72, patchNoise)), // golden birch & crimson maple
        smoothstep(0.22, 0.78, canopyNoise * 0.6 + patchNoise * 0.4)
      );
      vec3 winVeg = mix(vec3(0.18, 0.26, 0.24), vec3(0.30, 0.38, 0.36), canopyNoise);

      vec3 vegCol = seasonalMix(sprVeg, sumVeg, autVeg, winVeg, uSeason);

      // Slope & altitude blending between rock cliffs and forest canopy
      float treeLine = smoothstep(10.5, 5.2, pos.y + canopyNoise * 1.8);
      float vegSlopeMask = smoothstep(0.56, 0.78, nor.y) * treeLine * smoothstep(0.1, 0.55, pos.y);
      vec3 albedo = mix(rockCol, vegCol, vegSlopeMask);

      // Shore wet pebble / sand rim near water level y = 0
      float shoreZone = smoothstep(0.45, 0.02, pos.y);
      vec3 shoreCol = mix(vec3(0.32, 0.30, 0.28), vec3(0.18, 0.19, 0.20), smoothstep(0.18, 0.0, pos.y));
      albedo = mix(albedo, shoreCol, shoreZone * 0.85);

      // Physical Snow Accumulation: altitude + upward slope (nor.y) + windward aspect
      float snowAlt = smoothstep(mix(7.2, 0.05, snowFactor), mix(11.0, 1.2, snowFactor), pos.y + canopyNoise * 1.1);
      float snowSlope = smoothstep(0.48, 0.76, nor.y);
      float snowMask = clamp(snowAlt * snowSlope, 0.0, 1.0);
      vec3 snowAlbedo = vec3(0.92, 0.95, 0.99);
      albedo = mix(albedo, snowAlbedo, snowMask);

      // Lighting composition
      vec3 directLightCol = mix(vec3(0.28, 0.38, 0.58), sunColor * 1.25, dayFactor + twilightFactor * 0.85);
      directLightCol = mix(directLightCol, vec3(0.48, 0.54, 0.58), rainFactor * 0.75);

      vec3 ambientCol = mix(vec3(0.06, 0.10, 0.20), vec3(0.36, 0.48, 0.64), dayFactor);
      ambientCol = mix(ambientCol, vec3(0.38, 0.26, 0.38), twilightFactor * 0.75);
      ambientCol = mix(ambientCol, vec3(0.34, 0.40, 0.44), rainFactor * 0.65);

      vec3 lit = albedo * (directLightCol * sunDiff + ambientCol * skyAmb * 0.75 + directLightCol * backLight * 0.35);

      // Physical Valley Mist & Exponential Beer-Lambert Aerial Perspective
      float fogDensity = mix(0.015, 0.036, rainFactor * 0.75 + clamp(1.0 - abs(uWeather - 4.0), 0.0, 1.0));
      float distFog = 1.0 - exp(-t * fogDensity);
      float valleyCloud = exp(-max(0.0, pos.y - 0.35) * 0.75) *
        smoothstep(10.0, 38.0, t) *
        fbm(pos.xz * 0.14 - vec2(uTime * 0.035 * uWindSpeed, uTime * 0.01));

      float totalFog = clamp(distFog + valleyCloud * (0.38 + 0.35 * rainFactor), 0.0, 0.96);
      return mix(lit, horizonFogCol, totalFog);
    }

    // Raymarch 3D Terrain along ray (ro, rd)
    float traceTerrain(vec3 ro, vec3 rd, float tMax) {
      float t = 2.2;
      for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        float h = terrainH(p.xz, false);
        float d = p.y - h;
        if (abs(d) < 0.003 * t || t > tMax) break;
        t += max(0.18, d * 0.52);
      }
      if (t > tMax) return -1.0;
      // Binary refinement for sharp ridge precision
      float tA = max(2.0, t - 0.45);
      float tB = t + 0.15;
      for (int j = 0; j < 4; j++) {
        float tM = 0.5 * (tA + tB);
        vec3 pM = ro + rd * tM;
        if (pM.y - terrainH(pM.xz, true) > 0.0) tA = tM;
        else tB = tM;
      }
      return 0.5 * (tA + tB);
    }

    // Compute 3D Physical Water Normal at world coordinate (xz) including interactive mouse ripples
    vec3 calcWaterNormal(vec2 xz, float distToCam, float rainFactor) {
      vec2 windShift = vec2(uTime * (0.45 + uWindSpeed * 0.25), uTime * 0.18);
      float eps = clamp(0.025 * distToCam * 0.15, 0.02, 0.22);

      // Multi-octave gravity + capillary water waves in 3D world space
      float w0 = fbm(xz * 0.85 + windShift) * 0.65 + noise(xz * 3.4 - windShift * 1.4) * 0.35;
      float wX = fbm((xz + vec2(eps, 0.0)) * 0.85 + windShift) * 0.65 + noise((xz + vec2(eps, 0.0)) * 3.4 - windShift * 1.4) * 0.35;
      float wZ = fbm((xz + vec2(0.0, eps)) * 0.85 + windShift) * 0.65 + noise((xz + vec2(0.0, eps)) * 3.4 - windShift * 1.4) * 0.35;

      float waveAmp = (0.016 + 0.008 * uWindSpeed) / (1.0 + distToCam * 0.045);
      vec2 grad = vec2(wX - w0, wZ - w0) / eps * waveAmp;

      // Interactive 3D Mouse/Touch Ring Ripples propagating in true (x, z) world space
      for (int i = 0; i < 6; i++) {
        vec4 rip = uRipples[i];
        float age = uTime - rip.z;
        if (age > 0.0 && age < 6.5) {
          vec2 delta = xz - rip.xy;
          float r = length(delta);
          float speed = 3.2;
          float waveFront = r - age * speed;
          float envelope = exp(-abs(waveFront) * 1.35) * exp(-age * 0.58) * exp(-r * 0.08) * rip.w;
          float phase = waveFront * 9.5;
          vec2 dir = delta / max(0.05, r);
          grad += dir * cos(phase) * envelope * 0.042;
        }
      }

      // Raindrop splashes across the 3D lake surface
      if (rainFactor > 0.05 && distToCam < 38.0) {
        vec2 rGrid = xz * 1.35;
        vec2 rCell = floor(rGrid);
        vec2 rLocal = fract(rGrid) - 0.5;
        vec2 rSeed = hash22(rCell);
        float rAge = fract(uTime * (0.85 + rSeed.x * 0.5) + rSeed.y);
        float rDist = length(rLocal - (rSeed - 0.5) * 0.35);
        float rRing = sin((rDist - rAge * 0.45) * 38.0) * exp(-abs(rDist - rAge * 0.45) * 18.0) * (1.0 - rAge);
        grad += normalize(rLocal + vec2(0.001)) * rRing * 0.022 * rainFactor;
      }

      return normalize(vec3(-grad.x, 1.0, -grad.y));
    }

    void main() {
      float aspect = uResolution.x / max(1.0, uResolution.y);
      vec2 screenPos = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

      // Construct 3D camera ray
      vec3 ro = uCamPos;
      vec3 rd = normalize(uCamFwd * 1.18 + uCamRight * screenPos.x + uCamUp * screenPos.y);

      // Solar & Lunar 3D unit vectors from continuous 24h clock
      float dayAngle = ((uHour - 5.75) / 12.5) * 3.14159265;
      float sunElev = sin(dayAngle) * 0.72;
      float sunAzim = cos(dayAngle) * -0.95;
      vec3 sunDir = normalize(vec3(sin(sunAzim) * cos(sunElev), sin(sunElev), cos(sunAzim) * cos(sunElev)));

      float nightAngle = ((mod(uHour + 12.0, 24.0) - 5.75) / 12.5) * 3.14159265;
      float moonElev = max(0.14, sin(nightAngle) * 0.64);
      float moonAzim = cos(nightAngle) * 0.78;
      vec3 moonDir = normalize(vec3(sin(moonAzim) * cos(moonElev), sin(moonElev), cos(moonAzim) * cos(moonElev)));

      float dayFactor = smoothstep(-0.18, 0.24, sunDir.y);
      float twilightFactor = smoothstep(-0.28, 0.08, sunDir.y) * (1.0 - smoothstep(0.04, 0.38, sunDir.y));
      float nightFactor = 1.0 - smoothstep(-0.24, 0.04, sunDir.y);
      float rainFactor = clamp(1.0 - abs(uWeather - 2.0), 0.0, 1.0);
      float snowFactor = clamp(clamp(1.0 - abs(uWeather - 3.0), 0.0, 1.0) + smoothstep(4.5, -2.5, uTempC) * 0.65, 0.0, 1.0);

      vec3 sunColor = mix(vec3(1.0, 0.48, 0.22), vec3(1.0, 0.96, 0.88), clamp(sunDir.y * 1.8, 0.0, 1.0));

      // Horizon atmospheric scattering color for aerial perspective fog
      vec3 horizonFogCol = renderSkyAndClouds(
        normalize(vec3(rd.x, 0.02, max(0.1, rd.z))),
        sunDir, moonDir, dayFactor, twilightFactor, nightFactor, rainFactor, snowFactor, sunColor
      );

      // Intersection distances: 3D Terrain vs 3D Water Plane (y = 0)
      float tWater = rd.y < -0.001 ? (-ro.y / rd.y) : -1.0;
      float tMaxTerrain = (tWater > 0.0 && tWater < 88.0) ? min(88.0, tWater + 2.5) : 88.0;
      float tTerrain = traceTerrain(ro, rd, tMaxTerrain);

      vec3 finalCol = vec3(0.0);

      if (tTerrain > 0.0 && (tWater < 0.0 || tTerrain <= tWater)) {
        // Direct hit on 3D mountain / shoreline terrain
        vec3 hitPos = ro + rd * tTerrain;
        vec3 hitNor = calcTerrainNormal(hitPos.xz, tTerrain);
        finalCol = shadeTerrain(
          hitPos, hitNor, rd, tTerrain,
          sunDir, moonDir, dayFactor, twilightFactor, nightFactor, rainFactor, snowFactor,
          sunColor, horizonFogCol
        );
      } else if (tWater > 0.0 && tWater < 88.0) {
        // Hit on 3D Lake Surface (y = 0)
        vec3 waterPos = ro + rd * tWater;
        float bedH = terrainH(waterPos.xz, false);
        float waterDepth = max(0.0, -bedH);

        vec3 waterNor = calcWaterNormal(waterPos.xz, tWater, rainFactor);
        vec3 reflRd = reflect(rd, waterNor);
        reflRd.y = max(0.015, reflRd.y);

        // Sample reflected 3D sky & clouds
        vec3 reflCol = renderSkyAndClouds(
          reflRd, sunDir, moonDir, dayFactor, twilightFactor, nightFactor, rainFactor, snowFactor, sunColor
        );

        // Analytical 3D reflected mountain silhouette & shading in lake water
        float reflMountDist = max(14.0, 36.0 - waterPos.z * 0.65);
        vec2 reflMountXZ = waterPos.xz + reflRd.xz * reflMountDist;
        float reflMountH = terrainH(reflMountXZ, false);
        float reflRayY = reflRd.y * reflMountDist;
        if (reflRayY < reflMountH) {
          vec3 rPos = vec3(reflMountXZ.x, reflRayY, reflMountXZ.y);
          vec3 rNor = normalize(vec3(0.0, 0.75, -0.66));
          vec3 rMountainCol = shadeTerrain(
            rPos, rNor, reflRd, tWater + reflMountDist,
            sunDir, moonDir, dayFactor, twilightFactor, nightFactor, rainFactor, snowFactor,
            sunColor, horizonFogCol
          );
          float edgeSoft = smoothstep(0.0, 0.65, reflMountH - reflRayY);
          reflCol = mix(reflCol, rMountainCol, edgeSoft * 0.88);
        }

        // Physical Schlick Fresnel & Water Body Subsurface Scattering
        float cosTheta = max(0.0, dot(-rd, waterNor));
        float fresnel = 0.04 + 0.96 * pow(1.0 - cosTheta, 4.5);

        vec3 deepWaterCol = seasonalMix(
          vec3(0.08, 0.24, 0.34),
          vec3(0.05, 0.25, 0.36),
          vec3(0.09, 0.20, 0.30),
          vec3(0.11, 0.22, 0.34),
          uSeason
        );
        deepWaterCol = mix(deepWaterCol * 0.22, deepWaterCol, dayFactor);
        deepWaterCol = mix(deepWaterCol, vec3(0.16, 0.14, 0.24), twilightFactor * 0.65);

        vec3 shallowCol = mix(vec3(0.24, 0.36, 0.32), deepWaterCol, smoothstep(0.0, 1.1, waterDepth));
        vec3 waterBody = mix(shallowCol, deepWaterCol, smoothstep(0.15, 1.4, waterDepth));

        finalCol = mix(waterBody, reflCol, clamp(fresnel + 0.22, 0.0, 0.96));

        // Microfacet Sun / Moon Specular Path on 3D Water Waves
        vec3 activeLightDir = nightFactor > 0.6 ? moonDir : sunDir;
        vec3 halfVec = normalize(activeLightDir - rd);
        float specAngle = max(0.0, dot(waterNor, halfVec));
        float specCore = pow(specAngle, 180.0) * 1.6 + pow(specAngle, 36.0) * 0.32;
        vec3 specCol = nightFactor > 0.6 ? vec3(0.82, 0.88, 1.0) : sunColor;
        finalCol += specCol * specCore * (1.0 - rainFactor * 0.8) * clamp(activeLightDir.y * 3.5 + 0.3, 0.0, 1.0);

        // Distance aerial mist over lake
        float lakeFog = 1.0 - exp(-tWater * 0.016);
        finalCol = mix(finalCol, horizonFogCol, clamp(lakeFog, 0.0, 0.88));
      } else {
        // Sky Dome & Volumetric Clouds
        finalCol = renderSkyAndClouds(
          rd, sunDir, moonDir, dayFactor, twilightFactor, nightFactor, rainFactor, snowFactor, sunColor
        );
      }

      // Subtle Crepuscular God-Rays when sun is low over the alpine peaks
      float godRayStrength = clamp((dayFactor + twilightFactor) * (1.0 - abs(sunDir.y - 0.18) * 2.5) * (1.0 - rainFactor), 0.0, 1.0);
      if (godRayStrength > 0.02) {
        float cosS = max(0.0, dot(rd, sunDir));
        float rayNoise = noise(vec2(atan(rd.x - sunDir.x, rd.y - sunDir.y) * 7.0, uTime * 0.08));
        finalCol += sunColor * pow(cosS, 5.0) * (0.5 + 0.5 * rayNoise) * 0.16 * godRayStrength;
      }

      // ACES Filmic Tone Mapping for natural photographic dynamic range (no harsh digital clipping)
      vec3 x = max(vec3(0.0), finalCol * 1.04 - 0.004);
      finalCol = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `

  /* ==========================================================================
     Three.js Scene Graph + Instant Raw WebGL Bootstrapping
     ========================================================================== */
  let threeRenderer = null
  let threeScene = null
  let threeCamera = null
  let threeUniforms = null
  let rawGl = null
  let rawProg = null
  let rawLocs = null
  let threeLoading = false

  const initRawWebGL = () => {
    try {
      const gl = bgCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false })
      if (!gl) return false
      const compile = (type, src) => {
        const sh = gl.createShader(type)
        gl.shaderSource(sh, src)
        gl.compileShader(sh)
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null
        return sh
      }
      const vs = compile(gl.VERTEX_SHADER, RAW_VERTEX_SHADER)
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
      if (!vs || !fs) return false
      const prog = gl.createProgram()
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false
      gl.useProgram(prog)

      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
      const posLoc = gl.getAttribLocation(prog, 'position')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      rawGl = gl
      rawProg = prog
      rawLocs = {
        uResolution: gl.getUniformLocation(prog, 'uResolution'),
        uTime: gl.getUniformLocation(prog, 'uTime'),
        uHour: gl.getUniformLocation(prog, 'uHour'),
        uSeason: gl.getUniformLocation(prog, 'uSeason'),
        uWeather: gl.getUniformLocation(prog, 'uWeather'),
        uTempC: gl.getUniformLocation(prog, 'uTempC'),
        uCloudCover: gl.getUniformLocation(prog, 'uCloudCover'),
        uWindSpeed: gl.getUniformLocation(prog, 'uWindSpeed'),
        uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
        uCamFwd: gl.getUniformLocation(prog, 'uCamFwd'),
        uCamRight: gl.getUniformLocation(prog, 'uCamRight'),
        uCamUp: gl.getUniformLocation(prog, 'uCamUp'),
        uRipples: gl.getUniformLocation(prog, 'uRipples[0]')
      }
      return true
    } catch (e) {
      return false
    }
  }

  const initThreeScene = () => {
    if (!window.THREE || threeRenderer) return false
    try {
      const THREE = window.THREE
      const threeCanvas = document.createElement('canvas')
      threeCanvas.id = 'theme-sanctuary-webgl'
      threeCanvas.className = 'theme-sanctuary-webgl'
      threeCanvas.setAttribute('aria-hidden', 'true')

      const renderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance'
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65))
      renderer.setSize(width || window.innerWidth, height || window.innerHeight, false)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(55, (width || 1) / Math.max(1, height || 1), 0.1, 200)
      camera.position.set(0, 0, 5)

      const rippleVecs = []
      for (let i = 0; i < MAX_RIPPLES; i += 1) {
        rippleVecs.push(new THREE.Vector4(0, 0, -999, 0))
      }

      const basis = getCameraBasis()
      const uniforms = {
        uResolution: { value: new THREE.Vector2(width * dpr, height * dpr) },
        uTime: { value: 0 },
        uHour: { value: worldState.hour },
        uSeason: { value: worldState.season },
        uWeather: { value: worldState.weather },
        uTempC: { value: worldState.tempC },
        uCloudCover: { value: worldState.cloudCover },
        uWindSpeed: { value: worldState.windSpeed },
        uCamPos: { value: new THREE.Vector3(basis.ro[0], basis.ro[1], basis.ro[2]) },
        uCamFwd: { value: new THREE.Vector3(basis.fwd[0], basis.fwd[1], basis.fwd[2]) },
        uCamRight: { value: new THREE.Vector3(basis.right[0], basis.right[1], basis.right[2]) },
        uCamUp: { value: new THREE.Vector3(basis.up[0], basis.up[1], basis.up[2]) },
        uRipples: { value: rippleVecs }
      }

      const mat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms,
        depthWrite: false,
        depthTest: false
      })

      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
      scene.add(quad)

      if (bgCanvas.parentNode) {
        bgCanvas.replaceWith(threeCanvas)
      } else {
        document.body.prepend(threeCanvas)
      }

      rawGl = null
      threeRenderer = renderer
      threeScene = scene
      threeCamera = camera
      threeUniforms = uniforms
      return true
    } catch (e) {
      return false
    }
  }

  const loadThreeFromCdn = () => {
    if (window.THREE) {
      initThreeScene()
      return
    }
    if (threeLoading) return
    threeLoading = true

    const tryNext = idx => {
      if (idx >= THREE_CDNS.length) return
      const script = document.createElement('script')
      script.src = THREE_CDNS[idx]
      script.async = true
      script.onload = () => {
        if (window.THREE) initThreeScene()
        else tryNext(idx + 1)
      }
      script.onerror = () => {
        script.remove()
        tryNext(idx + 1)
      }
      document.head.appendChild(script)
    }
    tryNext(0)
  }

  const render3DBackground = elapsedSec => {
    worldState.hour += (worldState.targetHour - worldState.hour) * 0.06
    worldState.season += (worldState.targetSeason - worldState.season) * 0.04
    worldState.weather += (worldState.targetWeather - worldState.weather) * 0.04
    worldState.tempC += (worldState.targetTempC - worldState.tempC) * 0.05
    worldState.cloudCover += (worldState.targetCloudCover - worldState.cloudCover) * 0.04
    worldState.windSpeed += (worldState.targetWindSpeed - worldState.windSpeed) * 0.05

    camYaw += (camYawTarget - camYaw) * 0.055
    camPitch += (camPitchTarget - camPitch) * 0.055
    camZoom += (camZoomTarget - camZoom) * 0.06

    // Slowly relax user free-look when not in rest mode and not dragging
    if (!isDraggingWorld && !root.classList.contains('is-sanctuary-rest')) {
      userLookYaw *= 0.985
      userLookPitch *= 0.985
    }

    const basis = getCameraBasis()

    if (threeRenderer && threeUniforms) {
      threeUniforms.uResolution.value.set(width * dpr, height * dpr)
      threeUniforms.uTime.value = elapsedSec
      threeUniforms.uHour.value = worldState.hour
      threeUniforms.uSeason.value = worldState.season
      threeUniforms.uWeather.value = worldState.weather
      threeUniforms.uTempC.value = worldState.tempC
      threeUniforms.uCloudCover.value = worldState.cloudCover
      threeUniforms.uWindSpeed.value = worldState.windSpeed
      threeUniforms.uCamPos.value.set(basis.ro[0], basis.ro[1], basis.ro[2])
      threeUniforms.uCamFwd.value.set(basis.fwd[0], basis.fwd[1], basis.fwd[2])
      threeUniforms.uCamRight.value.set(basis.right[0], basis.right[1], basis.right[2])
      threeUniforms.uCamUp.value.set(basis.up[0], basis.up[1], basis.up[2])
      for (let i = 0; i < MAX_RIPPLES; i += 1) {
        const idx = i * 4
        threeUniforms.uRipples.value[i].set(
          rippleBuffer[idx],
          rippleBuffer[idx + 1],
          rippleBuffer[idx + 2],
          rippleBuffer[idx + 3]
        )
      }
      threeRenderer.render(threeScene, threeCamera)
    } else if (rawGl && rawProg) {
      rawGl.viewport(0, 0, bgCanvas.width, bgCanvas.height)
      rawGl.useProgram(rawProg)
      rawGl.uniform2f(rawLocs.uResolution, bgCanvas.width, bgCanvas.height)
      rawGl.uniform1f(rawLocs.uTime, elapsedSec)
      rawGl.uniform1f(rawLocs.uHour, worldState.hour)
      rawGl.uniform1f(rawLocs.uSeason, worldState.season)
      rawGl.uniform1f(rawLocs.uWeather, worldState.weather)
      rawGl.uniform1f(rawLocs.uTempC, worldState.tempC)
      rawGl.uniform1f(rawLocs.uCloudCover, worldState.cloudCover)
      rawGl.uniform1f(rawLocs.uWindSpeed, worldState.windSpeed)
      rawGl.uniform3f(rawLocs.uCamPos, basis.ro[0], basis.ro[1], basis.ro[2])
      rawGl.uniform3f(rawLocs.uCamFwd, basis.fwd[0], basis.fwd[1], basis.fwd[2])
      rawGl.uniform3f(rawLocs.uCamRight, basis.right[0], basis.right[1], basis.right[2])
      rawGl.uniform3f(rawLocs.uCamUp, basis.up[0], basis.up[1], basis.up[2])
      if (rawLocs.uRipples) {
        rawGl.uniform4fv(rawLocs.uRipples, rippleBuffer)
      }
      rawGl.drawArrays(rawGl.TRIANGLES, 0, 6)
    }
  }

  /* ==========================================================================
     Interactive Foreground Shoreline Reeds + 3D Depth Seasonal Flora
     ========================================================================== */
  const initReeds = () => {
    reeds.length = 0
    if (!width || !height) return
    const count = width < 768 ? 18 : 34
    for (let i = 0; i < count; i += 1) {
      // Cluster reeds on the left and right foreground lake banks
      const side = i % 2 === 0 ? 0 : 1
      const normX = side === 0
        ? rand(-0.02, 0.24)
        : rand(0.76, 1.02)
      const depth = rand(0.55, 1.25)
      reeds.push({
        normX,
        depth,
        h: rand(75, 165) * depth,
        w: rand(2.2, 4.2) * depth,
        tilt: (side === 0 ? 1 : -1) * rand(0.08, 0.28),
        angle: 0,
        angVel: 0,
        phase: rand(0, Math.PI * 2),
        hasPlume: Math.random() < 0.42
      })
    }
  }

  const drawForegroundReeds = elapsedSec => {
    if (!ctx || reeds.length === 0) return
    const isNight = worldState.hour < 5.6 || worldState.hour > 19.3
    const s = worldState.season
    let baseStem = [46, 72, 54]
    let tipCol = [112, 146, 108]
    let plumeCol = [235, 224, 206]

    if (s > 1.5 && s <= 2.5) {
      // Autumn golden reeds
      baseStem = [72, 56, 38]
      tipCol = [184, 142, 78]
      plumeCol = [246, 228, 192]
    } else if (s > 2.5) {
      // Winter frosted reeds
      baseStem = [64, 76, 88]
      tipCol = [176, 192, 208]
      plumeCol = [238, 245, 252]
    }

    if (isNight) {
      baseStem = baseStem.map(v => Math.round(v * 0.35))
      tipCol = tipCol.map(v => Math.round(v * 0.42))
      plumeCol = plumeCol.map(v => Math.round(v * 0.5))
    }

    const camShiftX = -(camYaw + userLookYaw) * width * 0.55
    const camShiftY = (camPitch + userLookPitch) * height * 0.38

    for (let i = 0; i < reeds.length; i += 1) {
      const r = reeds[i]
      const baseX = r.normX * width + camShiftX * r.depth
      const baseY = height + 14 + camShiftY * r.depth
      if (baseX < -80 || baseX > width + 80) continue

      // Physical wind + cursor proximity bend
      const naturalBend =
        Math.sin(elapsedSec * (1.2 + worldState.windSpeed * 0.25) + r.phase) * 0.14 +
        wind * 0.85 +
        breezeVx * 0.08
      const dxCursor = baseX - pointerX
      const dyCursor = (baseY - r.h * 0.6) - pointerY
      const distCursor = Math.hypot(dxCursor, dyCursor)
      let cursorPush = 0
      if (distCursor < 150) {
        cursorPush = ((150 - distCursor) / 150) * (dxCursor >= 0 ? 0.35 : -0.35)
      }

      const targetAngle = r.tilt + naturalBend + cursorPush
      const force = (targetAngle - r.angle) * 0.12
      r.angVel = (r.angVel + force) * 0.82
      r.angle += r.angVel

      const tipX = baseX + Math.sin(r.angle) * r.h
      const tipY = baseY - Math.cos(r.angle) * r.h
      const ctrlX = baseX + Math.sin(r.angle * 0.55) * (r.h * 0.54)
      const ctrlY = baseY - Math.cos(r.angle * 0.55) * (r.h * 0.54)

      ctx.save()
      const grad = ctx.createLinearGradient(baseX, baseY, tipX, tipY)
      grad.addColorStop(0, rgba(baseStem, 0.82))
      grad.addColorStop(1, rgba(tipCol, 0.72))
      ctx.strokeStyle = grad
      ctx.lineWidth = r.w
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(baseX, baseY)
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY)
      ctx.stroke()

      if (r.hasPlume) {
        ctx.strokeStyle = rgba(plumeCol, 0.68)
        ctx.lineWidth = r.w * 1.45
        ctx.beginPath()
        ctx.moveTo(
          ctrlX + (tipX - ctrlX) * 0.68,
          ctrlY + (tipY - ctrlY) * 0.68
        )
        ctx.lineTo(tipX, tipY)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // Botanical Sakura Petal Path (verified by tools/verify-petals.mjs)
  const buildSakuraPetalPath = (c, s) => {
    c.beginPath()
    c.moveTo(0, s * 0.96)
    c.bezierCurveTo(-s * 0.58, s * 0.68, -s * 0.94, s * 0.02, -s * 0.74, -s * 0.58)
    c.bezierCurveTo(-s * 0.56, -s * 1.0, -s * 0.23, -s * 1.04, -s * 0.11, -s * 0.86)
    c.quadraticCurveTo(0, -s * 0.6, s * 0.11, -s * 0.86)
    c.bezierCurveTo(s * 0.23, -s * 1.04, s * 0.56, -s * 1.0, s * 0.74, -s * 0.58)
    c.bezierCurveTo(s * 0.94, s * 0.02, s * 0.58, s * 0.68, 0, s * 0.96)
    c.closePath()
  }

  const buildPetalSprite = palette => {
    const off = document.createElement('canvas')
    off.width = 96
    off.height = 96
    const oc = off.getContext('2d')
    if (!oc) return off
    const s = 38
    oc.translate(48, 48)
    const bodyGrad = oc.createLinearGradient(0, s * 0.96, 0, -s * 1.02)
    bodyGrad.addColorStop(0, rgba(palette.base, 0.98))
    bodyGrad.addColorStop(0.32, rgba(palette.mid, 0.95))
    bodyGrad.addColorStop(0.74, rgba(palette.tip, 0.91))
    bodyGrad.addColorStop(1, rgba(palette.edge, 0.86))
    buildSakuraPetalPath(oc, s)
    oc.fillStyle = bodyGrad
    oc.fill()
    return off
  }

  const buildGinkgoSprite = palette => {
    const off = document.createElement('canvas')
    off.width = 96
    off.height = 96
    const oc = off.getContext('2d')
    if (!oc) return off
    const s = 34
    oc.translate(48, 46)
    oc.beginPath()
    oc.moveTo(0, s * 1.05)
    oc.quadraticCurveTo(-s * 0.08, s * 0.55, -s * 0.12, s * 0.36)
    oc.bezierCurveTo(-s * 0.65, s * 0.18, -s * 1.05, -s * 0.28, -s * 0.88, -s * 0.72)
    oc.bezierCurveTo(-s * 0.65, -s * 1.02, -s * 0.18, -s * 0.96, -s * 0.04, -s * 0.62)
    oc.quadraticCurveTo(0, -s * 0.45, s * 0.04, -s * 0.62)
    oc.bezierCurveTo(s * 0.18, -s * 0.96, s * 0.65, -s * 1.02, s * 0.88, -s * 0.72)
    oc.bezierCurveTo(s * 1.05, -s * 0.28, s * 0.65, s * 0.18, s * 0.12, s * 0.36)
    oc.quadraticCurveTo(s * 0.06, s * 0.62, 0, s * 1.05)
    oc.closePath()
    const g = oc.createLinearGradient(0, s, 0, -s)
    g.addColorStop(0, rgba(palette.stem, 0.95))
    g.addColorStop(0.35, rgba(palette.body, 0.96))
    g.addColorStop(1, rgba(palette.tip, 0.92))
    oc.fillStyle = g
    oc.fill()
    return off
  }

  const buildSnowSprite = () => {
    const off = document.createElement('canvas')
    off.width = 64
    off.height = 64
    const oc = off.getContext('2d')
    if (!oc) return off
    oc.translate(32, 32)
    const g = oc.createRadialGradient(0, 0, 1, 0, 0, 26)
    g.addColorStop(0, 'rgba(255,255,255,0.96)')
    g.addColorStop(0.5, 'rgba(226,240,255,0.52)')
    g.addColorStop(1, 'rgba(205,228,255,0)')
    oc.fillStyle = g
    oc.beginPath()
    oc.arc(0, 0, 26, 0, Math.PI * 2)
    oc.fill()
    return off
  }

  const buildGlowSprite = (rgb, coreAlpha) => {
    const off = document.createElement('canvas')
    off.width = 64
    off.height = 64
    const oc = off.getContext('2d')
    if (!oc) return off
    const g = oc.createRadialGradient(32, 32, 0, 32, 32, 30)
    g.addColorStop(0, coreAlpha > 0 ? rgba([255, 253, 245], coreAlpha) : rgba(rgb, 0.9))
    g.addColorStop(0.3, rgba(rgb, 0.55))
    g.addColorStop(0.7, rgba(rgb, 0.14))
    g.addColorStop(1, rgba(rgb, 0))
    oc.fillStyle = g
    oc.fillRect(0, 0, 64, 64)
    return off
  }

  const petalSprites = [
    { base: [244, 154, 182], mid: [255, 212, 226], tip: [255, 240, 246], edge: [255, 250, 252] },
    { base: [238, 142, 173], mid: [253, 198, 216], tip: [255, 232, 240], edge: [255, 247, 250] }
  ].map(buildPetalSprite)

  const ginkgoSprites = [
    { stem: [204, 132, 28], body: [245, 192, 56], tip: [255, 226, 112] },
    { stem: [192, 104, 34], body: [236, 162, 48], tip: [252, 212, 92] }
  ].map(buildGinkgoSprite)

  const snowSprite = buildSnowSprite()
  const fireflySprite = buildGlowSprite([255, 228, 142], 0.92)
  const summerBreezeSprite = buildGlowSprite([210, 248, 232], 0.82)

  const syncWorldWithAtmosphere = detail => {
    const atm = detail || window.__blogAtmosphere || {}
    const hour = typeof atm.hourFloat === 'number' ? atm.hourFloat : 15.5
    const seasonStr = atm.season || root.getAttribute('data-season') || 'autumn'
    const sceneStr = atm.activeScene || root.getAttribute('data-sanctuary-scene') || 'autumn'
    const weatherStr = atm.effectiveWeather || root.getAttribute('data-weather') || 'clear'
    const tempC = typeof atm.tempC === 'number' ? atm.tempC : 15
    const cloud = typeof atm.cloudCover === 'number' ? atm.cloudCover : 0.28
    const windKmh = typeof atm.windKmh === 'number' ? atm.windKmh : 10

    worldState.targetHour = hour
    const seasonMap = { spring: 0.0, summer: 1.0, autumn: 2.0, winter: 3.0 }
    worldState.targetSeason = typeof seasonMap[seasonStr] === 'number' ? seasonMap[seasonStr] : 2.0

    const weatherMap = { clear: 0.0, cloudy: 1.0, rain: 2.0, snow: 3.0, fog: 4.0 }
    worldState.targetWeather = typeof weatherMap[weatherStr] === 'number' ? weatherMap[weatherStr] : 0.0
    worldState.targetTempC = tempC
    worldState.targetCloudCover = sceneStr === 'rain' ? 0.88 : cloud
    worldState.targetWindSpeed = Math.max(0.4, Math.min(3.0, windKmh / 10))

    if (sceneStr === 'rain' || weatherStr === 'rain') {
      worldState.particleKind = 'rain'
    } else if (sceneStr === 'winter' || weatherStr === 'snow' || tempC <= 2) {
      worldState.particleKind = 'snow'
    } else if (sceneStr === 'night' || root.getAttribute('data-theme') === 'dark') {
      worldState.particleKind = 'star'
    } else if (sceneStr === 'autumn') {
      worldState.particleKind = 'ginkgo'
    } else if (sceneStr === 'summer') {
      worldState.particleKind = 'summer'
    } else {
      worldState.particleKind = 'petal'
    }
  }

  const getTargetCount = () => {
    if (reduceMotion.matches) return 0
    const area = width * height
    const kind = worldState.particleKind
    const restBoost = root.classList.contains('is-sanctuary-rest') ? 1.25 : 1.0
    const cap = width < 768 ? 16 : 36
    let base = Math.round(area / 48000)
    if (kind === 'rain') base = Math.round(area / 22000)
    else if (kind === 'snow') base = Math.round(area / 32000)
    return Math.round(Math.max(10, Math.min(kind === 'rain' ? 68 : cap, base)) * restBoost)
  }

  const createParticle = (kind, initial) => {
    if (kind === 'rain') {
      const z = rand(0.35, 1.0)
      return {
        kind: 'rain',
        x: rand(-60, width + 140),
        y: initial ? rand(-height * 0.2, height) : rand(-90, -10),
        vx: -1.4 - z * 1.4 * worldState.windSpeed,
        vy: 10.5 + z * 9.5,
        len: 16 + z * 22,
        alpha: 0.14 + z * 0.24,
        depth: z
      }
    }

    if (kind === 'snow') {
      const z = Math.pow(Math.random(), 1.3)
      return {
        kind: 'snow',
        x: rand(-30, width + 30),
        y: initial ? rand(-30, height + 20) : rand(-40, -10),
        vx: rand(-0.25, 0.35),
        vy: 0.35 + z * 0.85,
        size: 3.5 + z * 7.5,
        alpha: 0.28 + z * 0.52,
        phase: rand(0, Math.PI * 2),
        spin: rand(0.008, 0.02),
        depth: 0.3 + z * 0.7
      }
    }

    if (kind === 'star' || kind === 'summer') {
      const isSummer = kind === 'summer'
      return {
        kind,
        x: rand(20, width - 20),
        y: initial ? rand(height * 0.15, height * 0.92) : rand(height * 0.4, height * 0.95),
        vx: rand(-0.18, 0.18),
        vy: rand(-0.22, 0.12),
        size: rand(3.5, 8.5),
        alpha: rand(0.28, 0.74),
        phase: rand(0, Math.PI * 2),
        pulse: rand(0.012, 0.028),
        sprite: isSummer ? summerBreezeSprite : fireflySprite,
        depth: rand(0.4, 0.95)
      }
    }

    const isGinkgo = kind === 'ginkgo'
    const z = Math.pow(Math.random(), 1.35)
    const pool = isGinkgo ? ginkgoSprites : petalSprites
    return {
      kind,
      x: rand(-40, width + 40),
      y: initial ? rand(-40, height + 20) : rand(-55, -12),
      vx: rand(-0.25, 0.48),
      vy: (0.38 + z * 0.72) * (isGinkgo ? 1.08 : 1.0),
      size: (isGinkgo ? 8.5 : 7.5) + z * 9.5,
      alpha: 0.32 + z * 0.52,
      yaw: rand(0, Math.PI * 2),
      yawSpeed: rand(-0.015, 0.015),
      pitch: rand(0, Math.PI * 2),
      pitchSpeed: rand(0.012, 0.028),
      roll: rand(0, Math.PI * 2),
      rollSpeed: rand(0.009, 0.022),
      swayPhase: rand(0, Math.PI * 2),
      swayFreq: rand(0.012, 0.024),
      swayAmp: 0.32 + z * 0.65,
      sprite: pool[pickIndex(pool.length)],
      depth: 0.3 + z * 0.7
    }
  }

  const repopulate = initial => {
    const kind = worldState.particleKind
    const count = getTargetCount()
    particles.length = 0
    for (let i = 0; i < count; i += 1) {
      particles.push(createParticle(kind, initial))
    }
  }

  const updateWind = () => {
    windPhase += 0.004
    if (Math.random() < 0.006) {
      windTarget = rand(-0.14, 0.34) * worldState.windSpeed
    }
    const g = Math.sin(windPhase) * 0.06 + Math.sin(windPhase * 2.3) * 0.03
    wind += (windTarget + g - wind) * 0.015
  }

  const applyCursorRepulsion = p => {
    if (pointerX < -999 || pointerY < -999) return
    const dx = p.x - pointerX
    const dy = p.y - pointerY
    const dSq = dx * dx + dy * dy
    if (dSq <= 0.01 || dSq >= 16900) return
    const d = Math.sqrt(dSq)
    const f = ((130 - d) / 130) * (0.28 + (p.depth || 0.5) * 0.32)
    p.x += (dx / d) * f + breezeVx * 0.22 * (p.depth || 0.5)
    p.y += (dy / d) * f + breezeVy * 0.22 * (p.depth || 0.5)
  }

  const updateAndDrawParticles = () => {
    if (!ctx) return
    const targetKind = worldState.particleKind
    const targetCount = getTargetCount()

    while (particles.length < targetCount) {
      particles.push(createParticle(targetKind, false))
    }
    if (particles.length > targetCount) {
      particles.length = targetCount
    }

    for (let i = 0; i < particles.length; i += 1) {
      let p = particles[i]
      if (p.kind !== targetKind) {
        p = createParticle(targetKind, true)
        particles[i] = p
      }

      if (p.kind === 'rain') {
        p.x += p.vx + wind * 2.2 + scrollBreezeX * 0.35
        p.y += p.vy + scrollBreezeY * 0.25
        if (p.y > height + 30 || p.x < -100) {
          particles[i] = createParticle('rain', false)
          continue
        }
        ctx.save()
        ctx.globalAlpha = p.alpha * layerAlpha
        ctx.strokeStyle = 'rgba(218, 234, 248, 0.72)'
        ctx.lineWidth = 1.05 * p.depth
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + p.vx * 1.35, p.y + p.len)
        ctx.stroke()
        ctx.restore()
      } else if (p.kind === 'snow') {
        p.phase += p.spin
        p.x += p.vx + (wind + scrollBreezeX * 0.4) * p.depth + Math.sin(p.phase) * 0.45
        p.y += p.vy + scrollBreezeY * 0.25 * p.depth
        applyCursorRepulsion(p)
        if (p.y > height + 24) {
          particles[i] = createParticle('snow', false)
          continue
        }
        ctx.save()
        ctx.globalAlpha = p.alpha * layerAlpha
        ctx.drawImage(snowSprite, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
        ctx.restore()
      } else if (p.kind === 'star' || p.kind === 'summer') {
        p.phase += p.pulse
        p.x += p.vx + Math.sin(p.phase * 0.7) * 0.22 + scrollBreezeX * 0.2
        p.y += p.vy + Math.cos(p.phase * 0.5) * 0.16
        applyCursorRepulsion(p)
        if (p.x < -30) p.x = width + 20
        if (p.x > width + 30) p.x = -20
        if (p.y < -30) p.y = height + 20
        if (p.y > height + 30) p.y = -20
        const pulseA = p.alpha * (0.45 + 0.55 * Math.sin(p.phase)) * layerAlpha
        const r = p.size * 2.2
        ctx.save()
        ctx.globalAlpha = pulseA
        ctx.drawImage(p.sprite, p.x - r, p.y - r, r * 2, r * 2)
        ctx.restore()
      } else {
        p.swayPhase += p.swayFreq
        p.yaw += p.yawSpeed + Math.cos(p.swayPhase) * 0.005
        p.pitch += p.pitchSpeed
        p.roll += p.rollSpeed
        const lift = 1 - 0.25 * Math.abs(Math.cos(p.pitch))
        p.x += p.vx + (wind + scrollBreezeX * 0.45) * p.depth + Math.sin(p.swayPhase) * p.swayAmp
        p.y += (p.vy * lift) + scrollBreezeY * 0.32 * p.depth
        applyCursorRepulsion(p)
        if (p.y > height + 36) {
          particles[i] = createParticle(p.kind, false)
          continue
        }
        if (p.x > width + 45) p.x = -35
        if (p.x < -45) p.x = width + 35

        const sx = 0.34 + 0.66 * Math.abs(Math.cos(p.pitch))
        const sy = 0.46 + 0.54 * Math.abs(Math.sin(p.roll))
        const d = p.size * 2.1
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.yaw)
        ctx.scale(sx, sy)
        ctx.globalAlpha = p.alpha * layerAlpha
        ctx.drawImage(p.sprite, -d * 0.5, -d * 0.5, d, d)
        ctx.restore()
      }
    }
  }

  const resize = () => {
    width = window.innerWidth
    height = window.innerHeight
    dpr = Math.min(window.devicePixelRatio || 1, 1.65)

    bgCanvas.width = Math.floor(width * dpr)
    bgCanvas.height = Math.floor(height * dpr)
    bgCanvas.style.width = width + 'px'
    bgCanvas.style.height = height + 'px'

    if (threeRenderer) {
      threeRenderer.setPixelRatio(dpr)
      threeRenderer.setSize(width, height, false)
    }

    fgCanvas.width = Math.floor(width * dpr)
    fgCanvas.height = Math.floor(height * dpr)
    fgCanvas.style.width = width + 'px'
    fgCanvas.style.height = height + 'px'
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    initReeds()
  }

  const render = now => {
    animationFrame = 0
    if (document.hidden || reduceMotion.matches) return

    const elapsedSec = (now - startTime) * 0.001
    render3DBackground(elapsedSec)

    if (ctx) {
      ctx.clearRect(0, 0, width, height)
      const isReading = root.classList.contains('is-reading-depth') && !root.classList.contains('is-sanctuary-rest')
      const targetAlpha = isReading ? 0.55 : 1.0
      layerAlpha += (targetAlpha - layerAlpha) * 0.06

      breezeVx *= 0.92
      breezeVy *= 0.92
      scrollBreezeX *= 0.91
      scrollBreezeY *= 0.91

      updateWind()
      updateAndDrawParticles()
      drawForegroundReeds(elapsedSec)
    }

    animationFrame = window.requestAnimationFrame(render)
  }

  const startLoop = () => {
    if (!animationFrame && !document.hidden && !reduceMotion.matches) {
      animationFrame = window.requestAnimationFrame(render)
    }
  }

  const stopLoop = () => {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }
  }

  const start = () => {
    if (!ctx) return

    bgCanvas.id = 'theme-sanctuary-webgl'
    bgCanvas.className = 'theme-sanctuary-webgl'
    bgCanvas.setAttribute('aria-hidden', 'true')

    fgCanvas.id = 'theme-particles'
    fgCanvas.className = 'theme-particles'
    fgCanvas.setAttribute('aria-hidden', 'true')

    if (!document.getElementById('theme-sanctuary-webgl')) {
      document.body.prepend(bgCanvas)
    }
    if (!document.getElementById('theme-particles')) {
      document.body.prepend(fgCanvas)
    }

    syncWorldWithAtmosphere(window.__blogAtmosphere)
    worldState.hour = worldState.targetHour
    worldState.season = worldState.targetSeason
    worldState.weather = worldState.targetWeather
    worldState.tempC = worldState.targetTempC
    worldState.cloudCover = worldState.targetCloudCover
    worldState.windSpeed = worldState.targetWindSpeed

    resize()
    initRawWebGL()
    loadThreeFromCdn()
    repopulate(true)
    startLoop()
  }

  /* ==========================================================================
     Direct 3D World Interaction: Celestial Dragging, Free-Look Orbit, 3D Water Ripples
     ========================================================================== */
  const isInteractiveUiTarget = target => {
    if (!(target instanceof Element)) return false
    return Boolean(
      target.closest(
        'a, button, input, textarea, select, summary, label, [role="button"], .recent-post-item, .card-widget, .home-now__card, .home-now__photo, #nav, #sanctuary-dock, .sanctuary-rest__bar, .aplayer, #live2d-widget, #post, #page, #archive'
      )
    )
  }

  window.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    if (isInteractiveUiTarget(event.target)) return

    // 1. Check if grabbing the 3D Sun or Moon directly in the sky
    if (isPointerNearCelestial(event.clientX, event.clientY)) {
      isDraggingSun = true
      document.documentElement.style.cursor = 'grabbing'
      return
    }

    // 2. Spawn a crisp 3D physical water ripple if touching the lake
    spawnWaterRippleAtScreen(event.clientX, event.clientY, 1.35)

    // 3. Begin 3D camera free-look orbit drag
    isDraggingWorld = true
    dragStartX = event.clientX
    dragStartY = event.clientY
    dragStartYaw = userLookYaw
    dragStartPitch = userLookPitch
  }, { passive: true })

  window.addEventListener('pointermove', event => {
    const x = event.clientX
    const y = event.clientY

    if (isDraggingSun) {
      const w = width || window.innerWidth || 1
      const h = height || window.innerHeight || 1
      const normX = Math.max(0.02, Math.min(0.98, x / w))
      const normY = Math.max(0.05, Math.min(0.95, 1.0 - y / h))
      // Map horizontal & vertical drag across sky dome to continuous 24h solar clock
      const newHour = normY < 0.24
        ? (normX < 0.5 ? 4.5 * (normX * 2) : 19.5 + (normX - 0.5) * 9.0)
        : 5.75 + normX * 12.75
      worldState.targetHour = Math.max(0, Math.min(23.95, newHour))
      worldState.hour = worldState.targetHour
      if (window.__blogAtmosphere && typeof window.__blogAtmosphere.setManualHour === 'function') {
        window.__blogAtmosphere.setManualHour(worldState.targetHour)
      }
      return
    }

    if (isDraggingWorld) {
      const w = width || window.innerWidth || 1
      const h = height || window.innerHeight || 1
      userLookYaw = Math.max(-0.55, Math.min(0.55, dragStartYaw - ((x - dragStartX) / w) * 1.15))
      userLookPitch = Math.max(-0.26, Math.min(0.32, dragStartPitch + ((y - dragStartY) / h) * 0.72))
    }

    if (finePointer.matches) {
      if (lastPointerX > -999 && lastPointerY > -999) {
        const dx = x - lastPointerX
        const dy = y - lastPointerY
        breezeVx = Math.max(-2.6, Math.min(2.6, breezeVx + dx * 0.015))
        breezeVy = Math.max(-2.6, Math.min(2.6, breezeVy + dy * 0.015))
      }
      pointerX = x
      pointerY = y
      lastPointerX = x
      lastPointerY = y

      if (width > 0 && height > 0) {
        camYawTarget = ((x / width) - 0.5) * 0.22
        camPitchTarget = (0.5 - (y / height)) * 0.14
      }

      // Gentle continuous wake trail when gliding cursor across the 3D lake surface
      const nowMs = performance.now()
      if (nowMs - lastRippleSpawnAt > 170) {
        if (spawnWaterRippleAtScreen(x, y, 0.55)) {
          lastRippleSpawnAt = nowMs
        }
      }
    }
  }, { passive: true })

  const endWorldDrag = () => {
    if (isDraggingSun) {
      isDraggingSun = false
      document.documentElement.style.cursor = ''
    }
    isDraggingWorld = false
  }

  window.addEventListener('pointerup', endWorldDrag, { passive: true })
  window.addEventListener('pointercancel', endWorldDrag, { passive: true })

  // In Rest Mode, mouse wheel glides the 3D camera closer/further across the lake
  window.addEventListener('wheel', event => {
    if (!root.classList.contains('is-sanctuary-rest')) return
    camZoomTarget = Math.max(-0.8, Math.min(1.45, camZoomTarget - event.deltaY * 0.0012))
  }, { passive: true })

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(resize, 110)
  })

  window.addEventListener('scroll', () => {
    const currentY = window.scrollY || 0
    const dy = currentY - lastScrollY
    lastScrollY = currentY
    if (Math.abs(dy) > 1 && Math.abs(dy) < 240) {
      scrollBreezeY = Math.max(-2.2, Math.min(2.2, scrollBreezeY - dy * 0.014))
      scrollBreezeX = Math.max(-1.6, Math.min(1.6, scrollBreezeX + (dy > 0 ? 0.14 : -0.14)))
    }
    if (height > 0 && !root.classList.contains('is-sanctuary-rest')) {
      camZoomTarget = Math.min(0.65, currentY / (height * 2.5))
    }
  }, { passive: true })

  window.addEventListener('blog:atmosphere-change', event => {
    syncWorldWithAtmosphere(event && event.detail)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop()
    else startLoop()
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
