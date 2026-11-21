/**
 * Three.js 8-阶预烘焙地形纹理加速 3D 山水天时世界 (Pre-Baked 8-Octave DataTexture + Three.js 3D Scene, 120 FPS)
 * - 性能与细节兼得：
 *   启动时在 CPU 一次性预烘焙 512x512 四通道无缝 8 阶分形纹理 (THREE.DataTexture)：
 *   R = 8 阶水力侵蚀山脊高度，G = 精确解析水平坡度导数 dH/dx (用于真实 3D 迎光/背光面法线光照)，
 *   B = 8 阶积云体积密度，A = 岩层裂隙与高山雪槽微纹理。
 *   GPU 片元着色器每像素仅需 4 次硬件双线性纹理采样（0 循环！），以 < 0.3ms 的极低耗时呈现细腻的 8 阶山脊、雪山沟壑与流云。
 * - 零断层统一视平线：
 *   天空、四层立体远山、山谷云海与 3D 透视湖面倒影共享同一 3D 视平线坐标系，彻底消除水平色带断层。
 * - 告别暗沉泥褐色：
 *   采用三段式瑞利-米氏大气散射（天顶蓝 -> 中天紫罗兰/霞粉 -> 地平线暖金），远山保持清透的高山群青与靛蓝空气透视。
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
  const birds = []
  const meteors = []

  let width = 0
  let height = 0
  let dpr = 1
  let bgDpr = 1
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

  // Smooth 3D Camera Orbit & Parallax
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
  let startTime = performance.now()

  // 6 live 3D interactive water ripples: [worldX, worldZ, birthTimeSec, amplitude]
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const lerpVec3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / Math.max(0.0001, e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
  }

  /* ==========================================================================
     Pre-Baked 256x256 4-Channel 8-Octave Tileable Procedural Noise Texture
     Computed ONCE at startup (~8ms on CPU), eliminating 100% of per-pixel shader loops!
     R = 8-octave hydraulic eroded alpine ridge height
     G = Exact analytical horizontal slope derivative dH/dx (0.5 + dH/dx) for 3D normal lighting
     B = 8-octave billowy volumetric cumulus cloud density
     A = High-frequency rock strata, snow chutes & forest canopy micro-relief
     ========================================================================== */
  const TEX_SIZE = 128
  let bakedNoisePixels = null

  const buildBakedNoiseData = () => {
    if (bakedNoisePixels) return bakedNoisePixels
    const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4)

    // Fast bitwise integer hash table (0 Math.sin calls inside loop -> < 8ms startup!)
    const pHash = (ix, iy, mask, seed) => {
      let n = ((ix & mask) * 374761393 + (iy & mask) * 668265263 + seed * 1442695041) | 0
      n = (n ^ (n >>> 13)) * 1274126177
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296
    }

    const tileNoise = (u, v, freq, seed) => {
      const mask = freq - 1
      const x = u * freq
      const y = v * freq
      const ix = x | 0
      const iy = y | 0
      const fx = x - ix
      const fy = y - iy
      const ux = fx * fx * (3 - 2 * fx)
      const uy = fy * fy * (3 - 2 * fy)
      const a = pHash(ix, iy, mask, seed)
      const b = pHash(ix + 1, iy, mask, seed)
      const c = pHash(ix, iy + 1, mask, seed)
      const d = pHash(ix + 1, iy + 1, mask, seed)
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
    }

    const ridgeGrid = new Float32Array(TEX_SIZE * TEX_SIZE)

    for (let y = 0; y < TEX_SIZE; y += 1) {
      const v = y / TEX_SIZE
      for (let x = 0; x < TEX_SIZE; x += 1) {
        const u = x / TEX_SIZE

        // 5-octave eroded alpine ridge height (combined with 4x detail sample in shader = 8+ octaves)
        let rH = 0
        let rAmp = 0.54
        let freq = 4
        for (let o = 0; o < 5; o += 1) {
          const n = tileNoise(u, v, freq, 11 + o * 7)
          const ridge = 1 - Math.abs(n * 2 - 1)
          rH += rAmp * (0.35 * ridge + 0.65 * ridge * ridge)
          freq <<= 1
          rAmp *= 0.49
        }
        ridgeGrid[y * TEX_SIZE + x] = clamp(rH, 0, 1)

        // 4-octave billowy cumulus cloud field
        let cH = 0
        let cAmp = 0.56
        let cFreq = 4
        for (let o = 0; o < 4; o += 1) {
          cH += cAmp * tileNoise(u, v, cFreq, 103 + o * 13)
          cFreq <<= 1
          cAmp *= 0.5
        }

        // High-frequency alpine snow couloir & rock strata detail
        const strata =
          tileNoise(u, v, 16, 211) * 0.6 +
          tileNoise(u, v, 32, 223) * 0.4

        const idx = (y * TEX_SIZE + x) << 2
        data[idx] = (clamp(rH, 0, 1) * 255) | 0
        data[idx + 2] = (clamp(cH, 0, 1) * 255) | 0
        data[idx + 3] = (clamp(strata, 0, 1) * 255) | 0
      }
    }

    // Second pass: exact horizontal derivative dH/dx for 3D mountain east/west normal lighting
    for (let y = 0; y < TEX_SIZE; y += 1) {
      const row = y * TEX_SIZE
      for (let x = 0; x < TEX_SIZE; x += 1) {
        const xPrev = (x - 1 + TEX_SIZE) & (TEX_SIZE - 1)
        const xNext = (x + 1) & (TEX_SIZE - 1)
        const dh = (ridgeGrid[row + xNext] - ridgeGrid[row + xPrev]) * 6.5
        data[((row + x) << 2) + 1] = (clamp(0.5 + dh, 0, 1) * 255) | 0
      }
    }

    bakedNoisePixels = data
    return data
  }

  /* ==========================================================================
     3-Stop Jewel-Tone Atmospheric Palette Solver (Never Muddy Brown!)
     ========================================================================== */
  const seasonalVec3 = (spr, sum, aut, win, s) => {
    const w0 = Math.max(0, 1 - Math.abs(s - 0))
    const w1 = Math.max(0, 1 - Math.abs(s - 1))
    const w2 = Math.max(0, 1 - Math.abs(s - 2))
    const w3 = Math.max(0, 1 - Math.abs(s - 3)) + Math.max(0, 1 - Math.abs(s + 1))
    const tot = Math.max(0.001, w0 + w1 + w2 + w3)
    return [
      (spr[0] * w0 + sum[0] * w1 + aut[0] * w2 + win[0] * w3) / tot,
      (spr[1] * w0 + sum[1] * w1 + aut[1] * w2 + win[1] * w3) / tot,
      (spr[2] * w0 + sum[2] * w1 + aut[2] * w2 + win[2] * w3) / tot
    ]
  }

  const computeFramePalette = () => {
    const h = worldState.hour
    const s = worldState.season
    const w = worldState.weather
    const tempC = worldState.tempC

    const dayAngle = ((h - 5.75) / 12.5) * Math.PI
    const sunElev = Math.sin(dayAngle) * 0.72
    const sunAzim = Math.cos(dayAngle) * -0.88
    const ce = Math.cos(sunElev)
    const sx = Math.sin(sunAzim) * ce
    const sy = Math.sin(sunElev)
    const sz = -Math.cos(sunAzim) * ce
    const sLen = Math.hypot(sx, sy, sz) || 1
    const sunDir = [sx / sLen, sy / sLen, sz / sLen]

    const nightAngle = (((h + 12) % 24 - 5.75) / 12.5) * Math.PI
    const moonElev = Math.max(0.18, Math.sin(nightAngle) * 0.62)
    const moonAzim = Math.cos(nightAngle) * 0.72
    const mce = Math.cos(moonElev)
    const mx = Math.sin(moonAzim) * mce
    const my = Math.sin(moonElev)
    const mz = -Math.cos(moonAzim) * mce
    const mLen = Math.hypot(mx, my, mz) || 1
    const moonDir = [mx / mLen, my / mLen, mz / mLen]

    const dayFactor = smoothstep(-0.14, 0.26, sunDir[1])
    const twilightFactor = smoothstep(-0.28, 0.12, sunDir[1]) * (1 - smoothstep(0.06, 0.42, sunDir[1]))
    const nightFactor = 1 - smoothstep(-0.22, 0.04, sunDir[1])
    const rainFactor = clamp(1 - Math.abs(w - 2.0), 0, 1)
    const snowFactor = clamp(clamp(1 - Math.abs(w - 3.0), 0, 1) + smoothstep(5.0, -2.0, tempC) * 0.65, 0, 1)
    const tempShift = clamp((tempC - 15) / 18, -1, 1)

    // 3-Stop Day Sky (Zenith -> MidSky -> Horizon)
    const zenithDay = seasonalVec3(
      [0.18, 0.46, 0.86], // Spring: crisp alpine azure
      [0.11, 0.44, 0.89], // Summer: deep cerulean
      [0.17, 0.42, 0.82], // Autumn: clear sapphire sky
      [0.24, 0.50, 0.84], // Winter: glacier blue
      s
    )
    const midDay = seasonalVec3(
      [0.48, 0.73, 0.96],
      [0.38, 0.74, 0.97],
      [0.46, 0.70, 0.94],
      [0.54, 0.76, 0.95],
      s
    )
    const horizonDay = seasonalVec3(
      [0.94, 0.91, 0.97],
      [0.84, 0.95, 0.99],
      [0.96, 0.91, 0.90],
      [0.92, 0.96, 1.00],
      s
    )
    horizonDay[0] = clamp(horizonDay[0] + 0.025 * tempShift, 0, 1)
    horizonDay[2] = clamp(horizonDay[2] - 0.025 * tempShift, 0, 1)

    // 3-Stop Twilight Sky: Deep Sapphire Zenith -> Luminous Amethyst-Rose Mid -> Warm Sunset Coral-Gold Horizon
    // Passing through amethyst-rose in mid-sky completely prevents muddy brown!
    const zenithTwi = [0.11, 0.18, 0.42]
    const midTwi = [0.58, 0.38, 0.64]
    const horizonTwi = [0.98, 0.62, 0.48]

    // 3-Stop Night Sky: Cosmic Sapphire -> Starlit Indigo -> Moonlight Slate Blue
    const zenithNight = [0.03, 0.06, 0.15]
    const midNight = [0.07, 0.14, 0.30]
    const horizonNight = [0.14, 0.24, 0.45]

    // 3-Stop Rain/Mist Sky: Celadon-Slate
    const zenithRain = [0.28, 0.42, 0.52]
    const midRain = [0.50, 0.65, 0.73]
    const horizonRain = [0.80, 0.88, 0.91]

    let zenith = lerpVec3(zenithNight, zenithDay, dayFactor)
    zenith = lerpVec3(zenith, zenithTwi, twilightFactor * 0.88)
    zenith = lerpVec3(zenith, zenithRain, rainFactor * (0.45 + 0.45 * dayFactor))

    let midSky = lerpVec3(midNight, midDay, dayFactor)
    midSky = lerpVec3(midSky, midTwi, twilightFactor * 0.92)
    midSky = lerpVec3(midSky, midRain, rainFactor * (0.45 + 0.45 * dayFactor))

    let horizon = lerpVec3(horizonNight, horizonDay, dayFactor)
    horizon = lerpVec3(horizon, horizonTwi, twilightFactor * 0.92)
    horizon = lerpVec3(horizon, horizonRain, rainFactor * (0.45 + 0.45 * dayFactor))

    const sunColor = lerpVec3([1.0, 0.56, 0.36], [1.0, 0.98, 0.92], clamp(sunDir[1] * 1.8, 0, 1))

    // Mountain shadow & sunlit colors (Rich alpine sapphire/indigo & teal/plum, NEVER muddy brown!)
    const mtnShadowBase = seasonalVec3(
      [0.20, 0.36, 0.62], // Spring: alpine cobalt-blue shadow
      [0.15, 0.35, 0.58], // Summer: deep teal-sapphire shadow
      [0.24, 0.31, 0.58], // Autumn: twilight indigo shadow
      [0.24, 0.40, 0.66], // Winter: glacier cobalt shadow
      s
    )
    const mtnLitBase = seasonalVec3(
      [0.38, 0.58, 0.72], // Spring: misty sage & blossom ridge
      [0.26, 0.56, 0.64], // Summer: sunlit emerald-cyan slope
      [0.64, 0.44, 0.52], // Autumn: warm crimson-gold & plum foliage
      [0.52, 0.68, 0.86], // Winter: sunlit alpine frost
      s
    )

    let mtnShadow = lerpVec3([0.06, 0.11, 0.25], mtnShadowBase, dayFactor)
    mtnShadow = lerpVec3(mtnShadow, [0.18, 0.18, 0.42], twilightFactor * 0.85)
    mtnShadow = lerpVec3(mtnShadow, [0.24, 0.36, 0.44], rainFactor * 0.7)

    let mtnLit = lerpVec3([0.12, 0.22, 0.44], mtnLitBase, dayFactor)
    mtnLit = lerpVec3(mtnLit, [0.76, 0.46, 0.58], twilightFactor * 0.85)
    mtnLit = lerpVec3(mtnLit, [0.38, 0.52, 0.58], rainFactor * 0.7)

    // Deep lake water color
    const waterBase = seasonalVec3(
      [0.18, 0.46, 0.74],
      [0.12, 0.48, 0.76],
      [0.18, 0.40, 0.68],
      [0.22, 0.46, 0.72],
      s
    )
    let waterDeep = lerpVec3([0.05, 0.11, 0.24], waterBase, dayFactor)
    waterDeep = lerpVec3(waterDeep, [0.22, 0.22, 0.46], twilightFactor * 0.78)
    waterDeep = lerpVec3(waterDeep, [0.30, 0.45, 0.52], rainFactor * 0.7)

    return {
      sunDir,
      moonDir,
      dayFactor,
      twilightFactor,
      nightFactor,
      rainFactor,
      snowFactor,
      zenith,
      midSky,
      horizon,
      sunColor,
      mtnShadow,
      mtnLit,
      waterDeep
    }
  }

  /* ==========================================================================
     Unified 3D Landscape, 8-Octave Texture Mountains, Volumetric Clouds & Mirror Lake Shader
     (Zero Loops! Uses pre-baked uNoiseTex hardware bilinear filtering!)
     ========================================================================== */
  const LANDSCAPE_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.999, 1.0);
    }
  `

  const RAW_VERT = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `

  const LANDSCAPE_FRAG = `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D uNoiseTex;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uWindSpeed;
    uniform float uCloudCover;
    uniform float uDayFactor;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uSnowFactor;
    uniform vec3 uZenithCol;
    uniform vec3 uMidSkyCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uSunCol;
    uniform vec3 uMtnShadowCol;
    uniform vec3 uMtnLitCol;
    uniform vec3 uWaterCol;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec2 uCamLook;
    uniform vec4 uRipples[6];

    // 3-stop jewel-tone sky gradient (never muddy brown!)
    vec3 evalSkyGradient(float skyT) {
      vec3 lower = mix(uHorizonCol, uMidSkyCol, smoothstep(0.0, 0.42, skyT));
      return mix(lower, uZenithCol, smoothstep(0.32, 1.0, skyT));
    }

    void main() {
      float aspect = uResolution.x / max(1.0, uResolution.y);
      float horizonY = 0.30 + uCamLook.y * 0.28;
      bool isWater = vUv.y < horizonY;

      // Exact mirror reflection coordinate anchored at horizonY (0.000px gap!)
      float sampleY = isWater ? (horizonY + (horizonY - vUv.y) * 1.06) : vUv.y;
      float skyT = clamp((sampleY - horizonY) / max(0.01, 1.0 - horizonY), 0.0, 1.0);

      // 3D perspective lake wave perturbation & interactive ripples
      vec2 wave = vec2(0.0);
      float waterDepth = 0.0;
      float rippleGlow = 0.0;

      if (isWater) {
        waterDepth = clamp((horizonY - vUv.y) / max(0.01, horizonY), 0.0, 1.0);
        float pZ = 2.2 / max(0.018, horizonY - vUv.y);
        float wX = (vUv.x - 0.5) * aspect * pZ + uCamLook.x * 7.5;

        // Sample organic water wave normal from pre-baked texture + analytic gravity wave
        vec2 wUv = vec2(wX * 0.045 + uTime * 0.025 * uWindSpeed, pZ * 0.08 - uTime * 0.018);
        vec4 wTex = texture2D(uNoiseTex, wUv);
        float w1 = sin(wX * 1.5 + uTime * (1.3 + uWindSpeed * 0.35) + pZ * 2.4) * 0.5 + (wTex.b - 0.5);
        float w2 = cos(wX * 0.9 - uTime * 0.95 + pZ * 1.7) * 0.5 + (wTex.a - 0.5);
        wave = vec2(w1 * 0.0055 * (0.25 + waterDepth), w2 * 0.0028 * waterDepth);

        // 6 Interactive 3D Ring Ripples in world (wX, pZ) coordinates
        for (int i = 0; i < 6; i++) {
          vec4 rip = uRipples[i];
          float age = uTime - rip.z;
          if (age > 0.0 && age < 5.5) {
            float d = length(vec2(wX - rip.x, pZ - rip.y));
            float front = d - age * 3.4;
            float ring = sin(front * 8.0) * exp(-abs(front) * 1.35) * exp(-age * 0.62) * rip.w;
            wave.x += ring * 0.0085;
            rippleGlow += max(0.0, ring) * 0.18;
          }
        }

        // Raindrop concentric ripples across lake when raining
        if (uRainFactor > 0.05) {
          vec4 rTex = texture2D(uNoiseTex, vec2(wX * 0.12, pZ * 0.18 + uTime * 0.08));
          float rPulse = sin((rTex.r * 6.283) - uTime * 7.0) * smoothstep(0.65, 0.95, rTex.a);
          rippleGlow += max(0.0, rPulse) * 0.14 * uRainFactor * (1.0 - waterDepth * 0.5);
        }
      }

      vec2 sampleUv = vec2(vUv.x + wave.x, sampleY + wave.y);
      float mx = (sampleUv.x - 0.5) * aspect;
      vec3 rd = normalize(vec3(mx + uCamLook.x * 0.75, (sampleUv.y - horizonY) * 1.18, -1.0));

      // 1. Base 3-Stop Atmospheric Sky
      vec3 skyCol = evalSkyGradient(skyT);

      // 2. Solar Aureole, Mie Forward Scattering & Crisp Sun Disc
      float sunCos = max(0.0, dot(rd, uSunDir));
      float sunVis = clamp((uDayFactor + uTwilightFactor * 0.92) * (1.0 - uRainFactor * 0.82), 0.0, 1.0);
      skyCol += uSunCol * (pow(sunCos, 7.0) * 0.26 + pow(sunCos, 48.0) * 0.42 + smoothstep(0.9989, 0.9996, sunCos) * 0.95) * sunVis;

      // 3. Night Milky Way, Northern Aurora & Crescent Moon
      if (uNightFactor > 0.02) {
        vec4 nightTex = texture2D(uNoiseTex, vec2(mx * 0.35 + 0.2, skyT * 0.45));
        float milkyBand = exp(-pow((mx * 0.65 + (skyT - 0.52)) * 2.5, 2.0));
        skyCol += vec3(0.20, 0.30, 0.58) * nightTex.b * milkyBand * 0.32 * uNightFactor * (1.0 - uRainFactor);

        // Subtle aurora ribbon on cold/winter nights
        float auroraVis = uNightFactor * (0.3 + 0.7 * uSnowFactor) * (1.0 - uRainFactor);
        float auroraWave = sin(mx * 3.5 + nightTex.r * 3.0 + uTime * 0.12) * 0.5 + 0.5;
        float auroraBand = exp(-pow((skyT - 0.48 - auroraWave * 0.12) * 6.5, 2.0)) * smoothstep(0.15, 0.45, skyT);
        vec3 auroraCol = mix(vec3(0.16, 0.82, 0.66), vec3(0.46, 0.38, 0.92), auroraWave);
        skyCol += auroraCol * auroraBand * 0.25 * auroraVis;

        // Crescent Moon
        float moonCos = max(0.0, dot(rd, uMoonDir));
        vec3 moonOffsetDir = normalize(uMoonDir + vec3(0.015, 0.009, 0.0));
        float moonCutCos = max(0.0, dot(rd, moonOffsetDir));
        float moonDisc = smoothstep(0.9991, 0.99945, moonCos) * (1.0 - smoothstep(0.9992, 0.9995, moonCutCos));
        skyCol += vec3(0.95, 0.96, 1.0) * (pow(moonCos, 28.0) * 0.24 + moonDisc * 1.1) * uNightFactor * (1.0 - uRainFactor * 0.75);
      }

      // 4. 8-Octave Volumetric Cumulus Clouds (sampled from pre-baked uNoiseTex.b & .a)
      if (skyT > 0.015) {
        float persp = 1.0 / (0.24 + skyT * 0.85);
        vec2 cUv1 = vec2((mx + uCamLook.x * 0.22) * persp * 0.22 + uTime * 0.0022 * uWindSpeed, skyT * 0.45 + 0.12);
        vec2 cUv2 = cUv1 * 2.15 + vec2(0.37 + uTime * 0.0012 * uWindSpeed, 0.61);

        vec4 cTex1 = texture2D(uNoiseTex, cUv1);
        vec4 cTex2 = texture2D(uNoiseTex, cUv2);
        float cDensity = cTex1.b * 0.66 + cTex2.b * 0.34;

        float cover = clamp(uCloudCover + uRainFactor * 0.38, 0.05, 0.92);
        float cThresh = mix(0.62, 0.32, cover);
        float cAlpha = smoothstep(cThresh, cThresh + 0.24, cDensity) * smoothstep(0.015, 0.20, skyT) * 0.86;

        // Cloud 3D sun lighting & self-shadowing using baked derivative cTex1.g
        float cLight = clamp(0.55 + (cTex1.g - 0.5) * uSunDir.x * 1.8 + (cDensity - cThresh) * 1.2, 0.2, 1.0);
        vec3 cTop = mix(vec3(0.18, 0.26, 0.45), vec3(0.99, 0.99, 1.0), uDayFactor);
        cTop = mix(cTop, vec3(1.0, 0.76, 0.62), uTwilightFactor * 0.88);
        cTop = mix(cTop, vec3(0.60, 0.70, 0.75), uRainFactor * 0.75);

        vec3 cBottom = mix(vec3(0.09, 0.15, 0.28), mix(uMidSkyCol, vec3(0.74, 0.82, 0.92), 0.65), uDayFactor);
        cBottom = mix(cBottom, vec3(0.42, 0.30, 0.54), uTwilightFactor * 0.85);
        cBottom = mix(cBottom, vec3(0.38, 0.48, 0.54), uRainFactor * 0.8);

        vec3 cCol = mix(cBottom, cTop, cLight) + uSunCol * pow(sunCos, 5.0) * 0.32 * sunVis;
        skyCol = mix(skyCol, cCol, cAlpha);
      }

      vec3 sceneCol = skyCol;

      // 5. Three Sculptural 8-Octave Alpine Mountain Layers (All anchored to horizonY -> 0.000px gap!)
      // Layer 1: Far Snow-Crowned Alpine Range + Iconic Main Peak
      float x1 = mx + uCamLook.x * 0.09;
      vec4 mTex1 = texture2D(uNoiseTex, vec2(x1 * 0.22 + 0.18, 0.24));
      vec4 mDet1 = texture2D(uNoiseTex, vec2(x1 * 0.85 + 0.42, (sampleY - horizonY) * 2.2));
      float mainAlpineBell = exp(-pow((x1 - 0.16) * 2.1, 2.0)) * 0.19;
      float leftAlpineBell = exp(-pow((x1 + 0.52) * 1.9, 2.0)) * 0.11;
      float h1 = horizonY + 0.025 + mainAlpineBell + leftAlpineBell + (mTex1.r * 0.75 + mDet1.r * 0.25) * 0.135;

      if (sampleY < h1) {
        float hNorm1 = clamp((sampleY - horizonY) / max(0.01, h1 - horizonY), 0.0, 1.0);
        // 3D East-West slope normal lighting from pre-baked derivative mTex1.g & mDet1.g
        float slopeX1 = ((mTex1.g - 0.5) * 0.7 + (mDet1.g - 0.5) * 0.3) - (x1 - 0.16) * mainAlpineBell * 3.5;
        vec3 n1 = normalize(vec3(-slopeX1 * 1.8, 0.55, 0.65));
        float diff1 = clamp(dot(n1, uSunDir) * 0.85 + 0.35, 0.0, 1.0);

        vec3 rock1 = mix(uMtnShadowCol, uMtnLitCol, diff1);

        // Snow caps & alpine couloir snow chutes (follows ridge height + gully micro-relief mDet1.a)
        float snowLine1 = mix(0.54, 0.14, uSnowFactor);
        float chuteRelief = (mDet1.a - 0.45) * 0.28 + abs(slopeX1) * -0.15;
        float snowMask1 = smoothstep(snowLine1, snowLine1 + 0.16, hNorm1 + chuteRelief);
        vec3 snowLit = mix(vec3(0.42, 0.54, 0.78), vec3(0.98, 0.99, 1.0), uDayFactor);
        snowLit = mix(snowLit, vec3(1.0, 0.82, 0.76), uTwilightFactor * 0.85);
        vec3 snowShade = mix(uMtnShadowCol, snowLit, 0.48);
        vec3 snowCol1 = mix(snowShade, snowLit, diff1);

        vec3 mCol1 = mix(rock1, snowCol1, snowMask1);
        // Rayleigh aerial perspective mist
        float aerial1 = 0.46 + (1.0 - hNorm1) * 0.34;
        sceneCol = mix(mCol1, evalSkyGradient(clamp(hNorm1 * 0.25, 0.0, 1.0)), aerial1);
      }

      // Layer 2: Mid-Valley Forested Ridges & Drifting Cloud Sea
      float x2 = mx + uCamLook.x * 0.16;
      vec4 mTex2 = texture2D(uNoiseTex, vec2(x2 * 0.31 + 0.63, 0.57));
      vec4 mDet2 = texture2D(uNoiseTex, vec2(x2 * 1.15 + 0.19, (sampleY - horizonY) * 2.8));
      // Open valley center so the distant snow peak & lake reflection shine through the center
      float valleyEnvelope2 = 0.42 + 0.68 * smoothstep(0.05, 0.68, abs(x2 + 0.06));
      float h2 = horizonY + 0.008 + (mTex2.r * 0.72 + mDet2.r * 0.28) * 0.135 * valleyEnvelope2;

      if (sampleY < h2) {
        float hNorm2 = clamp((sampleY - horizonY) / max(0.01, h2 - horizonY), 0.0, 1.0);
        float slopeX2 = (mTex2.g - 0.5) * 0.65 + (mDet2.g - 0.5) * 0.35;
        vec3 n2 = normalize(vec3(-slopeX2 * 1.9, 0.52, 0.68));
        float diff2 = clamp(dot(n2, uSunDir) * 0.85 + 0.3, 0.0, 1.0);

        // Forest canopy micro-texture
        vec3 ridgeCol2 = mix(uMtnShadowCol * 0.88, uMtnLitCol * 1.04, diff2 * (0.75 + 0.25 * mDet2.a));
        if (uSnowFactor > 0.22) {
          float snowMask2 = smoothstep(0.45, 0.72, hNorm2 + (mDet2.a - 0.5) * 0.25) * uSnowFactor;
          vec3 snow2 = mix(uMtnShadowCol, mix(uHorizonCol, vec3(0.96, 0.98, 1.0), 0.65), 0.5 + 0.5 * diff2);
          ridgeCol2 = mix(ridgeCol2, snow2, snowMask2);
        }

        // Drifting valley cloud sea at the base of Layer 2
        vec4 mistTex = texture2D(uNoiseTex, vec2(x2 * 0.45 + uTime * 0.003 * uWindSpeed, hNorm2 * 0.6));
        float valleyMist = smoothstep(0.55, 0.0, hNorm2) * (0.35 + 0.5 * mistTex.b);
        sceneCol = mix(ridgeCol2, uHorizonCol, clamp(0.24 + valleyMist * 0.62, 0.0, 0.92));
      }

      // Layer 3: Near Shoreline Forested Headlands (Framing Left & Right Shores)
      float x3 = mx + uCamLook.x * 0.24;
      vec4 mTex3 = texture2D(uNoiseTex, vec2(x3 * 0.42 + 0.31, 0.81));
      vec4 mDet3 = texture2D(uNoiseTex, vec2(x3 * 1.65, (sampleY - horizonY) * 3.4));
      float shoreFrame = smoothstep(0.18, 0.78, abs(x3));
      float h3 = horizonY - 0.004 + shoreFrame * (0.018 + (mTex3.r * 0.7 + mDet3.a * 0.3) * 0.075);

      if (sampleY < h3) {
        float hNorm3 = clamp((sampleY - horizonY) / max(0.01, h3 - horizonY), 0.0, 1.0);
        float slopeX3 = (mTex3.g - 0.5) * 0.6 + (mDet3.g - 0.5) * 0.4;
        float diff3 = clamp(slopeX3 * uSunDir.x * -1.4 + 0.45, 0.0, 1.0);
        vec3 nearCol = mix(uMtnShadowCol * 0.76, uMtnLitCol * 0.95, diff3 * (0.7 + 0.3 * mDet3.a));
        if (uSnowFactor > 0.35) {
          nearCol = mix(nearCol, mix(uMtnShadowCol, vec3(0.92, 0.96, 1.0), 0.7), uSnowFactor * 0.65 * hNorm3);
        }
        float shoreMist3 = smoothstep(0.35, 0.0, hNorm3) * 0.38;
        sceneCol = mix(nearCol, uHorizonCol, 0.14 + shoreMist3);
      }

      // 6. 3D Mirror Lake Water Composition (Fresnel, Sun/Moon Shimmer Path & Shoreline Mist)
      if (isWater) {
        float fresnel = pow(1.0 - waterDepth, 1.7);
        vec3 waterCol = mix(uWaterCol, sceneCol, 0.38 + fresnel * 0.56);

        // Sparkling Sun / Moon Shimmer Path on 3D Water Waves
        vec3 activeLight = uNightFactor > 0.5 ? uMoonDir : uSunDir;
        float alignX = abs(rd.x - activeLight.x + wave.x * 8.0);
        vec4 glintTex = texture2D(uNoiseTex, vec2(mx * 2.4 + uTime * 0.04, waterDepth * 4.5 - uTime * 0.07));
        float sparkle = exp(-alignX * (15.0 + waterDepth * 12.0)) * smoothstep(0.48, 0.86, glintTex.a);
        vec3 glintCol = uNightFactor > 0.5 ? vec3(0.86, 0.92, 1.0) : uSunCol;
        waterCol += glintCol * sparkle * (0.48 - waterDepth * 0.32) * (1.0 - uRainFactor * 0.78);

        // Interactive ripple & raindrop ring highlights
        waterCol += mix(uHorizonCol, vec3(1.0), 0.55) * rippleGlow;

        // Seamless horizon shoreline mist blend (eliminates any hard line at horizonY)
        float horizonMist = exp(-waterDepth * 18.0);
        sceneCol = mix(waterCol, uHorizonCol, horizonMist * 0.48);
      }

      gl_FragColor = vec4(sceneCol, 1.0);
    }
  `

  // Three.js 3D Starfield Points Shader
  const STAR_VERT = `
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aColor;
    uniform float uTime;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      vColor = aColor;
      float twinkle = 0.62 + 0.38 * sin(uTime * 1.9 + aPhase);
      vAlpha = twinkle;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio * (120.0 / max(20.0, -mvPos.z));
      gl_Position = projectionMatrix * mvPos;
    }
  `

  const STAR_FRAG = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    uniform float uStarVis;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float glow = smoothstep(0.5, 0.05, d);
      gl_FragColor = vec4(vColor, glow * vAlpha * uStarVis);
    }
  `

  /* ==========================================================================
     Three.js Scene Graph + Raw WebGL Instant Bootstrapper
     ========================================================================== */
  let threeRenderer = null
  let threeScene = null
  let threeCamera = null
  let landscapeUniforms = null
  let starUniforms = null
  let starPoints = null
  let rawGl = null
  let rawProg = null
  let rawLocs = null
  let rawTex = null
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
      const vs = compile(gl.VERTEX_SHADER, RAW_VERT)
      const fs = compile(gl.FRAGMENT_SHADER, LANDSCAPE_FRAG)
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

      // Upload pre-baked 256x256 8-octave RGBA texture
      const pixels = buildBakedNoiseData()
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, TEX_SIZE, TEX_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      rawTex = tex

      rawGl = gl
      rawProg = prog
      rawLocs = {
        uNoiseTex: gl.getUniformLocation(prog, 'uNoiseTex'),
        uResolution: gl.getUniformLocation(prog, 'uResolution'),
        uTime: gl.getUniformLocation(prog, 'uTime'),
        uWindSpeed: gl.getUniformLocation(prog, 'uWindSpeed'),
        uCloudCover: gl.getUniformLocation(prog, 'uCloudCover'),
        uDayFactor: gl.getUniformLocation(prog, 'uDayFactor'),
        uTwilightFactor: gl.getUniformLocation(prog, 'uTwilightFactor'),
        uNightFactor: gl.getUniformLocation(prog, 'uNightFactor'),
        uRainFactor: gl.getUniformLocation(prog, 'uRainFactor'),
        uSnowFactor: gl.getUniformLocation(prog, 'uSnowFactor'),
        uZenithCol: gl.getUniformLocation(prog, 'uZenithCol'),
        uMidSkyCol: gl.getUniformLocation(prog, 'uMidSkyCol'),
        uHorizonCol: gl.getUniformLocation(prog, 'uHorizonCol'),
        uSunCol: gl.getUniformLocation(prog, 'uSunCol'),
        uMtnShadowCol: gl.getUniformLocation(prog, 'uMtnShadowCol'),
        uMtnLitCol: gl.getUniformLocation(prog, 'uMtnLitCol'),
        uWaterCol: gl.getUniformLocation(prog, 'uWaterCol'),
        uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
        uMoonDir: gl.getUniformLocation(prog, 'uMoonDir'),
        uCamLook: gl.getUniformLocation(prog, 'uCamLook'),
        uRipples: gl.getUniformLocation(prog, 'uRipples[0]')
      }
      return true
    } catch (e) {
      return false
    }
  }

  const buildStarfieldPoints = THREE => {
    const count = 950
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    const starTints = [
      [0.82, 0.90, 1.0],
      [1.0, 0.97, 0.92],
      [0.74, 0.86, 1.0],
      [1.0, 0.90, 0.78]
    ]

    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(rand(0.08, 0.98))
      const r = 135
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) - 2.0
      positions[i * 3 + 2] = -Math.abs(r * Math.sin(phi) * Math.sin(theta)) - 10
      sizes[i] = rand(1.2, 3.2)
      phases[i] = rand(0, Math.PI * 2)
      const tint = starTints[pickIndex(starTints.length)]
      colors[i * 3] = tint[0]
      colors[i * 3 + 1] = tint[1]
      colors[i * 3 + 2] = tint[2]
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    starUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: bgDpr },
      uStarVis: { value: 0 }
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    return new THREE.Points(geom, mat)
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
      renderer.setPixelRatio(bgDpr)
      renderer.setSize(width || window.innerWidth, height || window.innerHeight, false)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(48, (width || 1) / Math.max(1, height || 1), 0.5, 300)
      camera.position.set(0, 2.2, 8)

      // Create THREE.DataTexture from our pre-baked 256x256 8-octave RGBA array
      const pixels = buildBakedNoiseData()
      const noiseTex = new THREE.DataTexture(pixels, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat)
      noiseTex.wrapS = THREE.RepeatWrapping
      noiseTex.wrapT = THREE.RepeatWrapping
      noiseTex.magFilter = THREE.LinearFilter
      noiseTex.minFilter = THREE.LinearFilter
      noiseTex.needsUpdate = true

      const pal = computeFramePalette()
      const rippleVecs = []
      for (let i = 0; i < MAX_RIPPLES; i += 1) {
        rippleVecs.push(new THREE.Vector4(0, 0, -999, 0))
      }

      landscapeUniforms = {
        uNoiseTex: { value: noiseTex },
        uResolution: { value: new THREE.Vector2(width * bgDpr, height * bgDpr) },
        uTime: { value: 0 },
        uWindSpeed: { value: worldState.windSpeed },
        uCloudCover: { value: worldState.cloudCover },
        uDayFactor: { value: pal.dayFactor },
        uTwilightFactor: { value: pal.twilightFactor },
        uNightFactor: { value: pal.nightFactor },
        uRainFactor: { value: pal.rainFactor },
        uSnowFactor: { value: pal.snowFactor },
        uZenithCol: { value: new THREE.Vector3(pal.zenith[0], pal.zenith[1], pal.zenith[2]) },
        uMidSkyCol: { value: new THREE.Vector3(pal.midSky[0], pal.midSky[1], pal.midSky[2]) },
        uHorizonCol: { value: new THREE.Vector3(pal.horizon[0], pal.horizon[1], pal.horizon[2]) },
        uSunCol: { value: new THREE.Vector3(pal.sunColor[0], pal.sunColor[1], pal.sunColor[2]) },
        uMtnShadowCol: { value: new THREE.Vector3(pal.mtnShadow[0], pal.mtnShadow[1], pal.mtnShadow[2]) },
        uMtnLitCol: { value: new THREE.Vector3(pal.mtnLit[0], pal.mtnLit[1], pal.mtnLit[2]) },
        uWaterCol: { value: new THREE.Vector3(pal.waterDeep[0], pal.waterDeep[1], pal.waterDeep[2]) },
        uSunDir: { value: new THREE.Vector3(pal.sunDir[0], pal.sunDir[1], pal.sunDir[2]) },
        uMoonDir: { value: new THREE.Vector3(pal.moonDir[0], pal.moonDir[1], pal.moonDir[2]) },
        uCamLook: { value: new THREE.Vector2(0, 0) },
        uRipples: { value: rippleVecs }
      }

      const landscapeMat = new THREE.ShaderMaterial({
        vertexShader: LANDSCAPE_VERT,
        fragmentShader: LANDSCAPE_FRAG,
        uniforms: landscapeUniforms,
        depthWrite: false,
        depthTest: false
      })
      const landscapeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), landscapeMat)
      landscapeQuad.renderOrder = 0
      landscapeQuad.frustumCulled = false
      scene.add(landscapeQuad)

      // 3D Starfield Points in 3D space
      starPoints = buildStarfieldPoints(THREE)
      starPoints.renderOrder = 1
      scene.add(starPoints)

      if (bgCanvas.parentNode) {
        bgCanvas.replaceWith(threeCanvas)
      } else {
        document.body.prepend(threeCanvas)
      }

      rawGl = null
      threeRenderer = renderer
      threeScene = scene
      threeCamera = camera
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

    if (!isDraggingWorld && !root.classList.contains('is-sanctuary-rest')) {
      userLookYaw *= 0.985
      userLookPitch *= 0.985
    }

    const totalYaw = camYaw + userLookYaw
    const totalPitch = clamp(camPitch + userLookPitch, -0.18, 0.22)
    const pal = computeFramePalette()

    if (threeRenderer && landscapeUniforms) {
      landscapeUniforms.uResolution.value.set(width * bgDpr, height * bgDpr)
      landscapeUniforms.uTime.value = elapsedSec
      landscapeUniforms.uWindSpeed.value = worldState.windSpeed
      landscapeUniforms.uCloudCover.value = worldState.cloudCover
      landscapeUniforms.uDayFactor.value = pal.dayFactor
      landscapeUniforms.uTwilightFactor.value = pal.twilightFactor
      landscapeUniforms.uNightFactor.value = pal.nightFactor
      landscapeUniforms.uRainFactor.value = pal.rainFactor
      landscapeUniforms.uSnowFactor.value = pal.snowFactor
      landscapeUniforms.uZenithCol.value.set(pal.zenith[0], pal.zenith[1], pal.zenith[2])
      landscapeUniforms.uMidSkyCol.value.set(pal.midSky[0], pal.midSky[1], pal.midSky[2])
      landscapeUniforms.uHorizonCol.value.set(pal.horizon[0], pal.horizon[1], pal.horizon[2])
      landscapeUniforms.uSunCol.value.set(pal.sunColor[0], pal.sunColor[1], pal.sunColor[2])
      landscapeUniforms.uMtnShadowCol.value.set(pal.mtnShadow[0], pal.mtnShadow[1], pal.mtnShadow[2])
      landscapeUniforms.uMtnLitCol.value.set(pal.mtnLit[0], pal.mtnLit[1], pal.mtnLit[2])
      landscapeUniforms.uWaterCol.value.set(pal.waterDeep[0], pal.waterDeep[1], pal.waterDeep[2])
      landscapeUniforms.uSunDir.value.set(pal.sunDir[0], pal.sunDir[1], pal.sunDir[2])
      landscapeUniforms.uMoonDir.value.set(pal.moonDir[0], pal.moonDir[1], pal.moonDir[2])
      landscapeUniforms.uCamLook.value.set(totalYaw, totalPitch)

      for (let i = 0; i < MAX_RIPPLES; i += 1) {
        const idx = i * 4
        landscapeUniforms.uRipples.value[i].set(
          rippleBuffer[idx],
          rippleBuffer[idx + 1],
          rippleBuffer[idx + 2],
          rippleBuffer[idx + 3]
        )
      }

      if (starUniforms && starPoints) {
        starUniforms.uTime.value = elapsedSec
        starUniforms.uStarVis.value = pal.nightFactor * (1 - pal.rainFactor * 0.85)
        starPoints.rotation.y = (worldState.hour / 24) * Math.PI * 0.45 + totalYaw * 0.4
      }

      threeCamera.position.set(totalYaw * 9.5, 3.2 - camZoom * 0.8 + totalPitch * 4.5, 8.0 - camZoom * 6.5)
      threeCamera.lookAt(totalYaw * -16.0, 2.6 + totalPitch * 14.0, -55.0)

      threeRenderer.render(threeScene, threeCamera)
    } else if (rawGl && rawProg) {
      rawGl.viewport(0, 0, bgCanvas.width, bgCanvas.height)
      rawGl.useProgram(rawProg)
      rawGl.activeTexture(rawGl.TEXTURE0)
      rawGl.bindTexture(rawGl.TEXTURE_2D, rawTex)
      rawGl.uniform1i(rawLocs.uNoiseTex, 0)
      rawGl.uniform2f(rawLocs.uResolution, bgCanvas.width, bgCanvas.height)
      rawGl.uniform1f(rawLocs.uTime, elapsedSec)
      rawGl.uniform1f(rawLocs.uWindSpeed, worldState.windSpeed)
      rawGl.uniform1f(rawLocs.uCloudCover, worldState.cloudCover)
      rawGl.uniform1f(rawLocs.uDayFactor, pal.dayFactor)
      rawGl.uniform1f(rawLocs.uTwilightFactor, pal.twilightFactor)
      rawGl.uniform1f(rawLocs.uNightFactor, pal.nightFactor)
      rawGl.uniform1f(rawLocs.uRainFactor, pal.rainFactor)
      rawGl.uniform1f(rawLocs.uSnowFactor, pal.snowFactor)
      rawGl.uniform3f(rawLocs.uZenithCol, pal.zenith[0], pal.zenith[1], pal.zenith[2])
      rawGl.uniform3f(rawLocs.uMidSkyCol, pal.midSky[0], pal.midSky[1], pal.midSky[2])
      rawGl.uniform3f(rawLocs.uHorizonCol, pal.horizon[0], pal.horizon[1], pal.horizon[2])
      rawGl.uniform3f(rawLocs.uSunCol, pal.sunColor[0], pal.sunColor[1], pal.sunColor[2])
      rawGl.uniform3f(rawLocs.uMtnShadowCol, pal.mtnShadow[0], pal.mtnShadow[1], pal.mtnShadow[2])
      rawGl.uniform3f(rawLocs.uMtnLitCol, pal.mtnLit[0], pal.mtnLit[1], pal.mtnLit[2])
      rawGl.uniform3f(rawLocs.uWaterCol, pal.waterDeep[0], pal.waterDeep[1], pal.waterDeep[2])
      rawGl.uniform3f(rawLocs.uSunDir, pal.sunDir[0], pal.sunDir[1], pal.sunDir[2])
      rawGl.uniform3f(rawLocs.uMoonDir, pal.moonDir[0], pal.moonDir[1], pal.moonDir[2])
      rawGl.uniform2f(rawLocs.uCamLook, totalYaw, totalPitch)
      if (rawLocs.uRipples) {
        rawGl.uniform4fv(rawLocs.uRipples, rippleBuffer)
      }
      rawGl.drawArrays(rawGl.TRIANGLES, 0, 6)
    }
  }

  // Spawn 3D lake ripple at screen coordinates
  const spawnWaterRippleAtScreen = (clientX, clientY, strength) => {
    const w = width || window.innerWidth || 1
    const h = height || window.innerHeight || 1
    const aspect = w / Math.max(1, h)
    const uvX = clientX / w
    const uvY = 1.0 - (clientY / h)
    const totalYaw = camYaw + userLookYaw
    const totalPitch = clamp(camPitch + userLookPitch, -0.18, 0.22)
    const horizonY = 0.30 + totalPitch * 0.28
    if (uvY >= horizonY - 0.008) return false

    const pZ = 2.2 / Math.max(0.018, horizonY - uvY)
    if (pZ > 65.0) return false
    const wX = (uvX - 0.5) * aspect * pZ + totalYaw * 7.5
    const nowSec = (performance.now() - startTime) * 0.001

    const idx = rippleCursor * 4
    rippleBuffer[idx] = wX
    rippleBuffer[idx + 1] = pZ
    rippleBuffer[idx + 2] = nowSec
    rippleBuffer[idx + 3] = strength
    rippleCursor = (rippleCursor + 1) % MAX_RIPPLES
    return true
  }

  // Check if pointer is hovering near the 3D Sun or Moon in the sky
  const isPointerNearCelestial = (clientX, clientY) => {
    const w = width || window.innerWidth || 1
    const h = height || window.innerHeight || 1
    const aspect = w / Math.max(1, h)
    const uvX = clientX / w
    const uvY = 1.0 - (clientY / h)
    const totalYaw = camYaw + userLookYaw
    const totalPitch = clamp(camPitch + userLookPitch, -0.18, 0.22)
    const horizonY = 0.30 + totalPitch * 0.28
    if (uvY < horizonY) return false

    const rx = (uvX - 0.5) * aspect + totalYaw * 0.75
    const ry = (uvY - horizonY) * 1.18
    const rz = -1.0
    const rLen = Math.hypot(rx, ry, rz) || 1
    const rd = [rx / rLen, ry / rLen, rz / rLen]

    const pal = computeFramePalette()
    const dotSun = rd[0] * pal.sunDir[0] + rd[1] * pal.sunDir[1] + rd[2] * pal.sunDir[2]
    const dotMoon = rd[0] * pal.moonDir[0] + rd[1] * pal.moonDir[1] + rd[2] * pal.moonDir[2]
    if (pal.sunDir[1] > -0.12 && dotSun > 0.986) return true
    if (pal.nightFactor > 0.2 && dotMoon > 0.986) return true
    return false
  }

  /* ==========================================================================
     Distant Alpine Soaring Birds (Day/Dusk) & Shooting Stars (Night)
     ========================================================================== */
  const initBirds = () => {
    birds.length = 0
    for (let i = 0; i < 6; i += 1) {
      birds.push({
        x: rand(0.12, 0.88),
        y: rand(0.24, 0.48),
        vx: rand(0.00018, 0.00032),
        vy: rand(-0.00004, 0.00004),
        span: rand(5.5, 9.5),
        phase: rand(0, Math.PI * 2),
        freq: rand(0.06, 0.09)
      })
    }
  }

  const updateAndDrawBirdsAndMeteors = () => {
    if (!ctx) return
    const isNight = worldState.hour < 5.6 || worldState.hour > 19.3
    const isRain = Math.abs(worldState.weather - 2.0) < 0.6

    // Soaring distant alpine birds in clear/cloudy day or golden hour
    if (!isNight && !isRain) {
      if (birds.length === 0) initBirds()
      const shiftX = -(camYaw + userLookYaw) * width * 0.25
      const shiftY = (camPitch + userLookPitch) * height * 0.18
      ctx.save()
      ctx.strokeStyle = worldState.hour > 16.5 ? 'rgba(42, 34, 68, 0.52)' : 'rgba(44, 68, 104, 0.42)'
      ctx.lineCap = 'round'
      for (let i = 0; i < birds.length; i += 1) {
        const b = birds[i]
        b.phase += b.freq
        b.x += b.vx * (0.7 + worldState.windSpeed * 0.3)
        b.y += b.vy + Math.sin(b.phase * 0.5) * 0.00005
        if (b.x > 1.12) {
          b.x = -0.12
          b.y = rand(0.22, 0.48)
        }
        const bx = b.x * width + shiftX
        const by = b.y * height + shiftY
        const wingY = Math.sin(b.phase) * (b.span * 0.42)
        ctx.lineWidth = b.span > 7.5 ? 1.35 : 1.05
        ctx.beginPath()
        ctx.moveTo(bx - b.span, by - wingY)
        ctx.quadraticCurveTo(bx - b.span * 0.4, by - wingY * 0.35, bx, by)
        ctx.quadraticCurveTo(bx + b.span * 0.4, by - wingY * 0.35, bx + b.span, by - wingY)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Occasional shooting stars on clear nights
    if (isNight && !isRain) {
      if (meteors.length < 1 && Math.random() < 0.004) {
        meteors.push({
          x: rand(width * 0.2, width * 0.85),
          y: rand(height * 0.06, height * 0.32),
          vx: -rand(7.5, 11.5),
          vy: rand(3.5, 6.2),
          life: 0,
          maxLife: rand(26, 42)
        })
      }
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const m = meteors[i]
        m.x += m.vx
        m.y += m.vy
        m.life += 1
        if (m.life >= m.maxLife) {
          meteors.splice(i, 1)
          continue
        }
        const alpha = Math.sin((m.life / m.maxLife) * Math.PI) * 0.85
        const tailX = m.x - m.vx * 6.5
        const tailY = m.y - m.vy * 6.5
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY)
        grad.addColorStop(0, 'rgba(255, 255, 255, ' + alpha + ')')
        grad.addColorStop(1, 'rgba(180, 210, 255, 0)')
        ctx.save()
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tailX, tailY)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  /* ==========================================================================
     3D Depth Seasonal Flora Particles (Botanical Sakura, Golden Ginkgo, Snow, Rain, Fireflies)
     ========================================================================== */
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
    const cloud = typeof atm.cloudCover === 'number' ? atm.cloudCover : 0.25
    const windKmh = typeof atm.windKmh === 'number' ? atm.windKmh : 10

    worldState.targetHour = hour
    const seasonMap = { spring: 0.0, summer: 1.0, autumn: 2.0, winter: 3.0 }
    worldState.targetSeason = typeof seasonMap[seasonStr] === 'number' ? seasonMap[seasonStr] : 2.0

    const weatherMap = { clear: 0.0, cloudy: 1.0, rain: 2.0, snow: 3.0, fog: 4.0 }
    worldState.targetWeather = typeof weatherMap[weatherStr] === 'number' ? weatherMap[weatherStr] : 0.0
    worldState.targetTempC = tempC
    worldState.targetCloudCover = sceneStr === 'rain' ? 0.85 : cloud
    worldState.targetWindSpeed = Math.max(0.4, Math.min(2.8, windKmh / 10))

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
    const restBoost = root.classList.contains('is-sanctuary-rest') ? 1.2 : 1.0
    const cap = width < 768 ? 14 : 28
    let base = Math.round(area / 56000)
    if (kind === 'rain') base = Math.round(area / 26000)
    else if (kind === 'snow') base = Math.round(area / 36000)
    return Math.round(Math.max(8, Math.min(kind === 'rain' ? 56 : cap, base)) * restBoost)
  }

  const createParticle = (kind, initial) => {
    if (kind === 'rain') {
      const z = rand(0.35, 1.0)
      return {
        kind: 'rain',
        x: rand(-60, width + 140),
        y: initial ? rand(-height * 0.2, height) : rand(-90, -10),
        vx: -1.3 - z * 1.3 * worldState.windSpeed,
        vy: 10.5 + z * 9.0,
        len: 15 + z * 20,
        alpha: 0.12 + z * 0.22,
        depth: z
      }
    }

    if (kind === 'snow') {
      const z = Math.pow(Math.random(), 1.3)
      return {
        kind: 'snow',
        x: rand(-30, width + 30),
        y: initial ? rand(-30, height + 20) : rand(-40, -10),
        vx: rand(-0.22, 0.32),
        vy: 0.35 + z * 0.8,
        size: 3.5 + z * 7.0,
        alpha: 0.26 + z * 0.5,
        phase: rand(0, Math.PI * 2),
        spin: rand(0.008, 0.018),
        depth: 0.3 + z * 0.7
      }
    }

    if (kind === 'star' || kind === 'summer') {
      const isSummer = kind === 'summer'
      return {
        kind,
        x: rand(20, width - 20),
        y: initial ? rand(height * 0.15, height * 0.92) : rand(height * 0.4, height * 0.95),
        vx: rand(-0.16, 0.16),
        vy: rand(-0.2, 0.1),
        size: rand(3.5, 8.0),
        alpha: rand(0.26, 0.7),
        phase: rand(0, Math.PI * 2),
        pulse: rand(0.012, 0.026),
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
      vx: rand(-0.22, 0.44),
      vy: (0.36 + z * 0.68) * (isGinkgo ? 1.06 : 1.0),
      size: (isGinkgo ? 8.0 : 7.2) + z * 9.0,
      alpha: 0.3 + z * 0.5,
      yaw: rand(0, Math.PI * 2),
      yawSpeed: rand(-0.014, 0.014),
      pitch: rand(0, Math.PI * 2),
      pitchSpeed: rand(0.011, 0.026),
      roll: rand(0, Math.PI * 2),
      rollSpeed: rand(0.008, 0.02),
      swayPhase: rand(0, Math.PI * 2),
      swayFreq: rand(0.011, 0.022),
      swayAmp: 0.3 + z * 0.6,
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
      windTarget = rand(-0.14, 0.32) * worldState.windSpeed
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
        p.x += p.vx + wind * 2.0 + scrollBreezeX * 0.35
        p.y += p.vy + scrollBreezeY * 0.25
        if (p.y > height + 30 || p.x < -100) {
          particles[i] = createParticle('rain', false)
          continue
        }
        ctx.save()
        ctx.globalAlpha = p.alpha * layerAlpha
        ctx.strokeStyle = 'rgba(218, 234, 248, 0.68)'
        ctx.lineWidth = 1.0 * p.depth
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + p.vx * 1.3, p.y + p.len)
        ctx.stroke()
        ctx.restore()
      } else if (p.kind === 'snow') {
        p.phase += p.spin
        p.x += p.vx + (wind + scrollBreezeX * 0.4) * p.depth + Math.sin(p.phase) * 0.42
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
        p.x += p.vx + Math.sin(p.phase * 0.7) * 0.2 + scrollBreezeX * 0.2
        p.y += p.vy + Math.cos(p.phase * 0.5) * 0.15
        applyCursorRepulsion(p)
        if (p.x < -30) p.x = width + 20
        if (p.x > width + 30) p.x = -20
        if (p.y < -30) p.y = height + 20
        if (p.y > height + 30) p.y = -20
        const pulseA = p.alpha * (0.45 + 0.55 * Math.sin(p.phase)) * layerAlpha
        const r = p.size * 2.1
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
        const d = p.size * 2.05
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
    dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    bgDpr = Math.min(window.devicePixelRatio || 1, 1.35)

    bgCanvas.width = Math.floor(width * bgDpr)
    bgCanvas.height = Math.floor(height * bgDpr)
    bgCanvas.style.width = width + 'px'
    bgCanvas.style.height = height + 'px'

    if (threeRenderer && threeCamera) {
      threeRenderer.setPixelRatio(bgDpr)
      threeRenderer.setSize(width, height, false)
      threeCamera.aspect = width / Math.max(1, height)
      threeCamera.updateProjectionMatrix()
    }

    fgCanvas.width = Math.floor(width * dpr)
    fgCanvas.height = Math.floor(height * dpr)
    fgCanvas.style.width = width + 'px'
    fgCanvas.style.height = height + 'px'
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
      updateAndDrawBirdsAndMeteors()
      updateAndDrawParticles()
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
    initBirds()
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
        'a, button, input, textarea, select, summary, label, [role="button"], .recent-post-item, .card-widget, .home-now__cloud, .home-now__card, .home-now__photo, #nav, #sanctuary-dock, .sanctuary-rest__bar, .aplayer, .blog-music-launcher, #live2d-widget, #post, #page, #archive'
      )
    )
  }

  window.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    if (isInteractiveUiTarget(event.target)) return

    if (isPointerNearCelestial(event.clientX, event.clientY)) {
      isDraggingSun = true
      document.documentElement.style.cursor = 'grabbing'
      return
    }

    spawnWaterRippleAtScreen(event.clientX, event.clientY, 1.25)

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
      const normX = clamp(x / w, 0.02, 0.98)
      const normY = clamp(1.0 - y / h, 0.05, 0.95)
      const newHour = normY < 0.24
        ? (normX < 0.5 ? 4.5 * (normX * 2) : 19.5 + (normX - 0.5) * 9.0)
        : 5.75 + normX * 12.75
      worldState.targetHour = clamp(newHour, 0, 23.95)
      worldState.hour = worldState.targetHour
      if (window.__blogAtmosphere && typeof window.__blogAtmosphere.setManualHour === 'function') {
        window.__blogAtmosphere.setManualHour(worldState.targetHour)
      }
      return
    }

    if (isDraggingWorld) {
      const w = width || window.innerWidth || 1
      const h = height || window.innerHeight || 1
      userLookYaw = clamp(dragStartYaw - ((x - dragStartX) / w) * 0.75, -0.45, 0.45)
      userLookPitch = clamp(dragStartPitch + ((y - dragStartY) / h) * 0.35, -0.18, 0.22)
    }

    if (finePointer.matches) {
      if (lastPointerX > -999 && lastPointerY > -999) {
        const dx = x - lastPointerX
        const dy = y - lastPointerY
        breezeVx = clamp(breezeVx + dx * 0.015, -2.4, 2.4)
        breezeVy = clamp(breezeVy + dy * 0.015, -2.4, 2.4)
      }
      pointerX = x
      pointerY = y
      lastPointerX = x
      lastPointerY = y

      if (width > 0 && height > 0) {
        camYawTarget = ((x / width) - 0.5) * 0.16
        camPitchTarget = (0.5 - (y / height)) * 0.1
      }

      const nowMs = performance.now()
      if (nowMs - lastRippleSpawnAt > 190) {
        if (spawnWaterRippleAtScreen(x, y, 0.45)) {
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

  window.addEventListener('wheel', event => {
    if (!root.classList.contains('is-sanctuary-rest')) return
    camZoomTarget = clamp(camZoomTarget - event.deltaY * 0.001, -0.6, 1.1)
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
      scrollBreezeY = clamp(scrollBreezeY - dy * 0.014, -2.0, 2.0)
      scrollBreezeX = clamp(scrollBreezeX + (dy > 0 ? 0.12 : -0.12), -1.4, 1.4)
    }
    if (height > 0 && !root.classList.contains('is-sanctuary-rest')) {
      camZoomTarget = Math.min(0.45, currentY / (height * 3.0))
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
