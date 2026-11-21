/**
 * Three.js 真实 3D 自然山水生态引擎 · Iteration 4 (Cinematic Living Alpine Lake Sanctuary)
 * - 电影级真实山水精进：
 *   1. 全景视廊构图：将水榭茶亭移至左前突岬 (-23.5, -39.5) 并开辟无遮挡视廊，飞檐挑角、木格障子暖窗与湖面倒影一览无余。
 *   2. 精雕中空木舟与垂坠系缆：告别实心圆柱，以参数化曲肋船体打造真正中空双尖木舟（船舱底板、横凳、船桨与悬链线自然下垂系缆）。
 *   3. 统一大气散射与远山青墨质感：地形、森林、建筑与芦苇共享完全一致的空气透视与低谷晨雾方程，彻底消除远岸树木“浮雾感”；
 *      斜向花岗岩地质层理 + 雨天湿润青墨山脊对比，呈现如画的烟雨空濛与极清阿尔卑斯雪峰。
 *   4. 柔韧弯曲芦苇簇 + 岸畔低矮灌木丛 + 1,600 棵 Alpha-Tested 植物叶片/羽状松针树林，无缝衔接水面、湿石、草丛与森林。
 *   5. 768×768 4x MSAA 实时平面镜面反射 + 3 景深合批丝雨渲染 + 轻量物理法线雨漪，全场景稳定 58–60 FPS。
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
    cloudCover: 0.30,
    targetCloudCover: 0.30,
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
    if (Math.abs(e1 - e0) < 0.00001) return x < e0 ? 0 : 1
    const t = clamp((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
  }

  let rngSeed = 20261121
  const seededRand = () => {
    rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
    return rngSeed / 4294967296
  }

  /* ==========================================================================
     Wide-Vista 3D Alpine Lake Sanctuary Terrain Heightfield (CPU)
     ========================================================================== */
  const hashInt2 = (ix, iy, seed) => {
    let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0
    n = (n ^ (n >>> 13)) * 1274126177
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }

  const noise2D = (x, y, seed) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const a = hashInt2(ix, iy, seed)
    const b = hashInt2(ix + 1, iy, seed)
    const c = hashInt2(ix, iy + 1, seed)
    const d = hashInt2(ix + 1, iy + 1, seed)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
  }

  const fbmCPU = (x, y, octaves, seed) => {
    let v = 0
    let amp = 0.52
    let px = x
    let py = y
    for (let i = 0; i < octaves; i += 1) {
      v += amp * noise2D(px, py, seed + i * 17)
      const nx = (0.8 * px - 0.6 * py) * 2.04 + 11.3
      const ny = (0.6 * px + 0.8 * py) * 2.04 + 27.1
      px = nx
      py = ny
      amp *= 0.48
    }
    return v
  }

  const ridgeFbmCPU = (x, y, octaves, seed) => {
    let v = 0
    let amp = 0.54
    let px = x
    let py = y
    let weight = 1.0
    for (let i = 0; i < octaves; i += 1) {
      const n = 1.0 - Math.abs(noise2D(px, py, seed + i * 23) * 2.0 - 1.0)
      const sq = n * n * weight
      weight = clamp(sq * 1.85, 0.2, 1.0)
      v += amp * sq
      const nx = (0.8 * px - 0.6 * py) * 2.08 + 7.9
      const ny = (0.6 * px + 0.8 * py) * 2.08 + 19.4
      px = nx
      py = ny
      amp *= 0.49
    }
    return v
  }

  const getTerrainHeight = (x, z) => {
    const riverCenter = Math.sin(z * 0.018 + 0.25) * 12.0
    const dxChannel = Math.abs(x - riverCenter)
    const inLakeZ = smoothstep(-115, -78, z) * (1.0 - smoothstep(24, 46, z))
    const lakeHalfWidth = lerp(38.0, 62.0, smoothstep(-95, 10, z))
    const lakeBasinMask = (1.0 - smoothstep(lakeHalfWidth * 0.58, lakeHalfWidth * 1.08, dxChannel)) * inLakeZ
    const frontOpen = (1.0 - smoothstep(18.0, 42.0, Math.abs(x))) * smoothstep(-5.0, 32.0, z)

    const farWeight = smoothstep(-88, -148, z)
    // Hero Majestic Snow Peak (offset nicely left-of-center-right for golden-ratio balance!)
    const heroDist = Math.hypot((x - 16.0) * 0.78, (z + 168.0) * 1.05)
    const heroPeak = Math.pow(Math.max(0, 1.0 - heroDist / 80.0), 1.46) * 54.0

    const leftDist = Math.hypot((x + 62.0) * 0.76, (z + 158.0) * 1.02)
    const leftPeak = Math.pow(Math.max(0, 1.0 - leftDist / 74.0), 1.50) * 41.0

    const rightDist = Math.hypot((x - 94.0) * 0.78, (z + 152.0) * 1.0)
    const rightPeak = Math.pow(Math.max(0, 1.0 - rightDist / 68.0), 1.54) * 36.0

    const farRidges = ridgeFbmCPU(x * 0.015 + 1.9, z * 0.015 - 1.2, 5, 101) * 35.0 * farWeight

    const leftPeninsula =
      Math.exp(-Math.pow((x + 48.0) / 30.0, 2) - Math.pow((z + 58.0) / 28.0, 2)) * 12.6 +
      Math.exp(-Math.pow((x + 27.0) / 14.0, 2) - Math.pow((z + 46.0) / 13.0, 2)) * 4.4

    const rightPeninsula =
      Math.exp(-Math.pow((x - 58.0) / 34.0, 2) - Math.pow((z + 66.0) / 30.0, 2)) * 14.0 +
      Math.exp(-Math.pow((x - 36.0) / 17.0, 2) - Math.pow((z + 44.0) / 15.0, 2)) * 5.2

    const farShoreHills =
      Math.exp(-Math.pow((z + 96.0) / 22.0, 2)) * (5.8 + fbmCPU(x * 0.028, z * 0.028, 3, 181) * 8.5)

    const fgRightBank = Math.exp(-Math.pow((x - 24.0) / 14.0, 2) - Math.pow((z - 21.0) / 12.0, 2)) * 3.6
    const fgLeftBank = Math.exp(-Math.pow((x + 26.0) / 15.0, 2) - Math.pow((z - 15.0) / 14.0, 2)) * 4.2

    const hillNoise = fbmCPU(x * 0.03 + 4.8, z * 0.03 + 3.2, 4, 211)
    const detailRidge = ridgeFbmCPU(x * 0.064 - 2.7, z * 0.064 + 5.9, 3, 307)
    const gentleSides = smoothstep(54.0, 145.0, Math.abs(x)) * 12.5 * (0.45 + 0.65 * hillNoise)

    let h =
      heroPeak * (0.74 + 0.38 * detailRidge) +
      leftPeak * (0.75 + 0.36 * detailRidge) +
      rightPeak * (0.77 + 0.34 * detailRidge) +
      farRidges +
      farShoreHills +
      (leftPeninsula + rightPeninsula) * (0.72 + 0.42 * hillNoise) +
      (fgRightBank + fgLeftBank) * (0.78 + 0.32 * hillNoise) +
      gentleSides

    const carve = clamp(lakeBasinMask * 1.2 + frontOpen * 1.05, 0, 1)
    h = lerp(h, -4.0 + hillNoise * 1.4, carve)

    // Left-center lakeside promontory for the unobstructed sanctuary pavilion (-23.5, -39.5)
    const pavHeadland = Math.exp(-Math.pow((x + 23.5) / 8.8, 2) - Math.pow((z + 39.5) / 7.8, 2))
    h = Math.max(h, -2.5 + pavHeadland * 4.8)
    const pavDist = Math.hypot(x + 23.5, z + 39.5)
    if (pavDist < 4.8) {
      h = lerp(h, 1.95, 1.0 - smoothstep(1.9, 4.8, pavDist))
    }
    // Keep a calm reflective water bay directly in front of the pavilion so its warm shoji window mirrors cleanly
    const bayCarve = Math.exp(-Math.pow((x + 17.5) / 9.5, 2) - Math.pow((z + 25.5) / 11.5, 2))
    if (bayCarve > 0.08 && pavDist > 5.2) {
      h = lerp(h, -2.6, clamp(bayCarve * 1.15, 0, 0.92))
    }

    // Right peninsula headland (35, -44)
    const rightTip = Math.exp(-Math.pow((x - 36.0) / 16.0, 2) - Math.pow((z + 44.0) / 13.0, 2))
    h = Math.max(h, -2.2 + rightTip * 6.8)

    // Foreground shelves
    const fgR = Math.exp(-Math.pow((x - 21.0) / 10.5, 2) - Math.pow((z - 21.0) / 9.5, 2))
    h = Math.max(h, -2.0 + fgR * 4.2)
    const fgL = Math.exp(-Math.pow((x + 23.0) / 11.5, 2) - Math.pow((z - 14.0) / 11.0, 2))
    h = Math.max(h, -2.0 + fgL * 4.5)

    return h
  }

  /* ==========================================================================
     High-Craft Botanical & Procedural Textures (Baked Once on Startup -> < 20ms)
     1. Detail DataTexture (rock strata, canopy variation, water waves, grain)
     2. 512px Sculpted Cumulus Cloud Puff CanvasTexture
     3. 256px Botanical Broadleaf Foliage Cluster Card Texture (hundreds of leaves!)
     4. 256px Feathery Alpine Pine Bough Spray Card Texture (crisp evergreen needles!)
     5. Radial Warm Glow Texture
     ========================================================================== */
  const createDetailDataTexture = THREE => {
    const size = 256
    const data = new Uint8Array(size * size * 4)
    const pHash = (ix, iy, mask, seed) => {
      let n = ((ix & mask) * 374761393 + (iy & mask) * 668265263 + seed * 1442695041) | 0
      n = (n ^ (n >>> 13)) * 1274126177
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296
    }
    const tileN = (u, v, freq, seed) => {
      const m = freq - 1
      const x = u * freq
      const y = v * freq
      const ix = x | 0
      const iy = y | 0
      const fx = x - ix
      const fy = y - iy
      const ux = fx * fx * (3 - 2 * fx)
      const uy = fy * fy * (3 - 2 * fy)
      const a = pHash(ix, iy, m, seed)
      const b = pHash(ix + 1, iy, m, seed)
      const c = pHash(ix, iy + 1, m, seed)
      const d = pHash(ix + 1, iy + 1, m, seed)
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
    }

    for (let y = 0; y < size; y += 1) {
      const v = y / size
      for (let x = 0; x < size; x += 1) {
        const u = x / size
        const rock = tileN(u, v, 8, 17) * 0.45 + tileN(u, v, 16, 31) * 0.35 + tileN(u, v, 32, 47) * 0.2
        const canopy = tileN(u, v, 16, 73) * 0.55 + tileN(u, v, 32, 89) * 0.45
        const wave = tileN(u, v, 8, 131) * 0.6 + tileN(u, v, 16, 151) * 0.4
        const grain = tileN(u, v, 32, 193) * 0.55 + tileN(u, v, 64, 211) * 0.45
        const idx = (y * size + x) << 2
        data[idx] = (clamp(rock, 0, 1) * 255) | 0
        data[idx + 1] = (clamp(canopy, 0, 1) * 255) | 0
        data[idx + 2] = (clamp(wave, 0, 1) * 255) | 0
        data[idx + 3] = (clamp(grain, 0, 1) * 255) | 0
      }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  }

  // Botanical Broadleaf Foliage Cluster Card (180 painted overlapping leaves/petals with airy sky-gaps!)
  const createBroadleafCardTexture = THREE => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const g = c.getContext('2d')
    g.clearRect(0, 0, 256, 256)

    // Paint subtle inner twig network first (so Winter sparse canopies reveal delicate branches!)
    g.strokeStyle = 'rgba(70, 56, 48, 0.92)'
    g.lineCap = 'round'
    g.lineWidth = 4.5
    g.beginPath()
    g.moveTo(128, 224)
    g.quadraticCurveTo(124, 165, 118, 128)
    g.moveTo(124, 178)
    g.quadraticCurveTo(90, 150, 62, 118)
    g.moveTo(122, 162)
    g.quadraticCurveTo(164, 136, 196, 108)
    g.moveTo(118, 128)
    g.quadraticCurveTo(96, 92, 84, 58)
    g.moveTo(118, 128)
    g.quadraticCurveTo(148, 92, 168, 56)
    g.stroke()

    // Paint 195 individual botanical leaves/blossoms with varied brightness (R = leaf lum, G = density core)
    let localSeed = 7731
    const r01 = () => {
      localSeed = (localSeed * 1664525 + 1013904223) >>> 0
      return localSeed / 4294967296
    }

    for (let i = 0; i < 195; i += 1) {
      const ang = r01() * Math.PI * 2
      const rad = Math.pow(r01(), 0.62) * 96
      const lx = 128 + Math.cos(ang) * rad * 1.04
      const ly = 124 + Math.sin(ang) * rad * 0.94
      const rot = ang + (r01() - 0.5) * 1.4
      const lw = 9 + r01() * 11
      const lh = 15 + r01() * 14

      // Outer/upper leaves brighter, inner core slightly deeper for realistic 3D leaf depth!
      const heightBoost = clamp((220 - ly) / 180, 0, 1)
      const lum = Math.round(158 + heightBoost * 72 + r01() * 25)
      // Store "core survival" in green/blue variation so winter alpha-thinning creates airy snow-dusted twigs!
      const coreness = Math.round(clamp(1.0 - rad / 105, 0.15, 1.0) * 255)

      g.save()
      g.translate(lx, ly)
      g.rotate(rot)
      g.fillStyle = `rgba(${lum}, ${Math.round(lum * 0.98)}, ${coreness}, 0.96)`
      g.beginPath()
      g.moveTo(0, -lh * 0.55)
      g.bezierCurveTo(lw * 0.68, -lh * 0.25, lw * 0.62, lh * 0.35, 0, lh * 0.55)
      g.bezierCurveTo(-lw * 0.62, lh * 0.35, -lw * 0.68, -lh * 0.25, 0, -lh * 0.55)
      g.closePath()
      g.fill()
      g.restore()
    }

    const tex = new THREE.CanvasTexture(c)
    tex.needsUpdate = true
    return tex
  }

  // Feathery Alpine Pine Bough Spray Texture (crisp evergreen needle fronds, zero geometric cones!)
  const createPineBoughTexture = THREE => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const g = c.getContext('2d')
    g.clearRect(0, 0, 256, 256)

    let localSeed = 9941
    const r01 = () => {
      localSeed = (localSeed * 1664525 + 1013904223) >>> 0
      return localSeed / 4294967296
    }

    // Draw feathery drooping pine boughs fanning down & out from central stem
    const boughs = 16
    for (let b = 0; b < boughs; b += 1) {
      const t = b / (boughs - 1) // 0=top spire, 1=wide drooping lower boughs
      const y0 = 26 + t * 195
      const span = 18 + Math.pow(t, 0.82) * 104
      for (const side of [-1, 1]) {
        const endX = 128 + side * span * (0.85 + r01() * 0.28)
        const endY = y0 + 16 + t * 24 + (r01() - 0.5) * 10
        const needles = Math.round(14 + t * 22)
        for (let k = 0; k < needles; k += 1) {
          const u = k / needles
          const nx = lerp(128, endX, u)
          const ny = lerp(y0, endY, u) + Math.sin(u * Math.PI) * 5
          const nLen = (11 + (1 - u * 0.5) * 13) * (0.65 + t * 0.55)
          const nAng = (side > 0 ? 0.45 : Math.PI - 0.45) + (r01() - 0.5) * 1.35
          const lum = Math.round(145 + (1 - t * 0.35) * 65 + u * 35 + r01() * 18)
          g.strokeStyle = `rgba(${lum}, ${lum}, ${lum}, 0.96)`
          g.lineWidth = 3.2 + (1 - u) * 2.2
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(nx, ny)
          g.lineTo(nx + Math.cos(nAng) * nLen, ny + Math.sin(nAng) * nLen)
          g.stroke()
        }
      }
    }

    // Fill center core spire needles
    for (let i = 0; i < 65; i += 1) {
      const t = r01()
      const y = 20 + t * 208
      const x = 128 + (r01() - 0.5) * (16 + t * 65)
      const lum = Math.round(135 + (1 - t * 0.4) * 70 + r01() * 25)
      g.fillStyle = `rgba(${lum}, ${lum}, ${lum}, 0.96)`
      g.beginPath()
      g.ellipse(x, y, 8 + t * 10, 5 + t * 7, (r01() - 0.5) * 1.5, 0, Math.PI * 2)
      g.fill()
    }

    const tex = new THREE.CanvasTexture(c)
    tex.needsUpdate = true
    return tex
  }

  const createCloudPuffTexture = THREE => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const g = c.getContext('2d')
    g.clearRect(0, 0, 512, 512)

    const drawLobes = list => {
      for (let i = 0; i < list.length; i += 1) {
        const [lx, ly, lr, alpha, lum] = list[i]
        const grad = g.createRadialGradient(lx, ly - lr * 0.22, lr * 0.1, lx, ly, lr)
        grad.addColorStop(0, `rgba(${lum},${lum},${lum},${alpha})`)
        grad.addColorStop(0.58, `rgba(${Math.max(110, lum - 28)},${Math.max(110, lum - 24)},${Math.max(120, lum - 16)},${alpha * 0.72})`)
        grad.addColorStop(0.86, `rgba(${Math.max(95, lum - 45)},${Math.max(95, lum - 40)},${Math.max(110, lum - 28)},${alpha * 0.22})`)
        grad.addColorStop(1, 'rgba(140,145,160,0)')
        g.fillStyle = grad
        g.beginPath()
        g.arc(lx, ly, lr, 0, Math.PI * 2)
        g.fill()
      }
    }

    drawLobes([
      [256, 300, 155, 0.55, 165], [158, 318, 118, 0.52, 155], [356, 316, 116, 0.50, 155],
      [108, 336, 76, 0.40, 145], [406, 334, 74, 0.38, 145]
    ])
    drawLobes([
      [212, 244, 116, 0.65, 220], [304, 250, 110, 0.62, 218], [156, 268, 86, 0.55, 205],
      [358, 272, 82, 0.52, 205], [256, 214, 102, 0.68, 235]
    ])
    drawLobes([
      [244, 164, 82, 0.72, 255], [296, 184, 72, 0.68, 252], [198, 190, 68, 0.65, 250],
      [266, 134, 56, 0.62, 255], [226, 142, 48, 0.55, 255]
    ])

    const tex = new THREE.CanvasTexture(c)
    tex.needsUpdate = true
    return tex
  }

  const createSoftGlowTexture = THREE => {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 1, 64, 64, 62)
    grad.addColorStop(0, 'rgba(255,252,238,1)')
    grad.addColorStop(0.20, 'rgba(255,222,155,0.78)')
    grad.addColorStop(0.52, 'rgba(255,176,92,0.22)')
    grad.addColorStop(1, 'rgba(255,150,60,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(c)
    tex.needsUpdate = true
    return tex
  }

  /* ==========================================================================
     Luminous Atmospheric Palette Solver (High-Contrast Day / Cozy Dusk / Velvet Night / Ink-Wash Rain)
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
    const sunElev = Math.sin(dayAngle) * 0.78
    const sunAzim = Math.cos(dayAngle) * -0.92
    const ce = Math.cos(sunElev)
    const sx = Math.sin(sunAzim) * ce
    const sy = Math.sin(sunElev)
    const sz = -Math.cos(sunAzim) * ce
    const sLen = Math.hypot(sx, sy, sz) || 1
    const sunDir = [sx / sLen, sy / sLen, sz / sLen]

    const nightAngle = (((h + 12) % 24 - 5.75) / 12.5) * Math.PI
    const moonElev = Math.max(0.24, Math.sin(nightAngle) * 0.62)
    const moonAzim = Math.cos(nightAngle) * 0.68
    const mce = Math.cos(moonElev)
    const mx = Math.sin(moonAzim) * mce
    const my = Math.sin(moonElev)
    const mz = -Math.cos(moonAzim) * mce
    const mLen = Math.hypot(mx, my, mz) || 1
    const moonDir = [mx / mLen, my / mLen, mz / mLen]

    const dayFactor = smoothstep(-0.14, 0.28, sunDir[1])
    const twilightFactor = smoothstep(-0.26, 0.16, sunDir[1]) * (1 - smoothstep(0.08, 0.46, sunDir[1]))
    const nightFactor = 1 - smoothstep(-0.20, 0.05, sunDir[1])
    const rainFactor = clamp(1 - Math.abs(w - 2.0), 0, 1)
    const fogFactor = clamp(1 - Math.abs(w - 4.0), 0, 1)
    const snowFactor = clamp(
      clamp(1 - Math.abs(w - 3.0), 0, 1) * 0.95 +
      smoothstep(4.5, -2.5, tempC) * 0.85 +
      smoothstep(2.4, 3.0, s) * 0.55,
      0, 1
    )
    const tempShift = clamp((tempC - 15) / 18, -1, 1)
    // Lamp turns on softly at golden hour (17.2h -> ~0.62 glow), glowing warmly in rain & full radiance at night!
    const lampGlow = clamp(smoothstep(0.38, 0.02, sunDir[1]) + rainFactor * 0.45, 0, 1)

    const zenithDay = seasonalVec3(
      [0.12, 0.44, 0.88],
      [0.07, 0.42, 0.92],
      [0.13, 0.39, 0.84],
      [0.20, 0.48, 0.86],
      s
    )
    const midDay = seasonalVec3(
      [0.44, 0.74, 0.97],
      [0.32, 0.75, 0.98],
      [0.45, 0.70, 0.95],
      [0.54, 0.78, 0.97],
      s
    )
    const horizonDay = seasonalVec3(
      [0.94, 0.92, 0.98],
      [0.84, 0.96, 1.00],
      [0.98, 0.90, 0.86],
      [0.92, 0.96, 1.00],
      s
    )
    horizonDay[0] = clamp(horizonDay[0] + 0.025 * tempShift, 0, 1)
    horizonDay[2] = clamp(horizonDay[2] - 0.025 * tempShift, 0, 1)

    const zenithTwi = [0.09, 0.15, 0.42]
    const midTwi = [0.54, 0.34, 0.62]
    const horizonTwi = [1.00, 0.58, 0.40]

    // Deep velvety stargazer night sky (makes Milky Way & stars pop!)
    const zenithNight = [0.008, 0.018, 0.058]
    const midNight = [0.022, 0.052, 0.145]
    const horizonNight = [0.055, 0.115, 0.245]

    // Rain: Luminous silver-celadon mist sky so wet dark-slate mountains have crisp atmospheric separation!
    const zenithRain = [0.24, 0.36, 0.45]
    const midRain = [0.46, 0.59, 0.67]
    const horizonRain = [0.74, 0.83, 0.86]

    let zenith = lerpVec3(zenithNight, zenithDay, dayFactor)
    zenith = lerpVec3(zenith, zenithTwi, twilightFactor * 0.92)
    zenith = lerpVec3(zenith, zenithRain, rainFactor * (0.50 + 0.44 * dayFactor))

    let midSky = lerpVec3(midNight, midDay, dayFactor)
    midSky = lerpVec3(midSky, midTwi, twilightFactor * 0.94)
    midSky = lerpVec3(midSky, midRain, rainFactor * (0.50 + 0.44 * dayFactor))

    let horizon = lerpVec3(horizonNight, horizonDay, dayFactor)
    horizon = lerpVec3(horizon, horizonTwi, twilightFactor * 0.92)
    horizon = lerpVec3(horizon, horizonRain, rainFactor * (0.50 + 0.44 * dayFactor))

    const sunColor = lerpVec3([1.0, 0.52, 0.26], [1.0, 0.98, 0.90], clamp(sunDir[1] * 1.8, 0, 1))

    // Deep sculpted contrast: dark velvety night shadows, crisp blue daytime shadows, dark ink-wash wet rain tones!
    let ambientCol = lerpVec3([0.020, 0.046, 0.115], [0.22, 0.38, 0.62], dayFactor)
    ambientCol = lerpVec3(ambientCol, [0.24, 0.20, 0.42], twilightFactor * 0.85)
    ambientCol = lerpVec3(ambientCol, [0.14, 0.22, 0.28], rainFactor * 0.84)

    let directCol = lerpVec3([0.10, 0.18, 0.36], [sunColor[0] * 1.48, sunColor[1] * 1.42, sunColor[2] * 1.32], dayFactor + twilightFactor * 0.88)
    directCol = lerpVec3(directCol, [0.44, 0.56, 0.60], rainFactor * 0.84)

    const waterBase = seasonalVec3(
      [0.06, 0.38, 0.64],
      [0.03, 0.42, 0.68],
      [0.08, 0.32, 0.56],
      [0.10, 0.36, 0.62],
      s
    )
    let waterDeep = lerpVec3([0.008, 0.025, 0.075], waterBase, dayFactor)
    waterDeep = lerpVec3(waterDeep, [0.10, 0.12, 0.28], twilightFactor * 0.78)
    waterDeep = lerpVec3(waterDeep, [0.08, 0.21, 0.27], rainFactor * 0.80)

    return {
      sunDir,
      moonDir,
      dayFactor,
      twilightFactor,
      nightFactor,
      rainFactor,
      fogFactor,
      snowFactor,
      lampGlow,
      zenith,
      midSky,
      horizon,
      sunColor,
      ambientCol,
      directCol,
      waterDeep
    }
  }

  /* ==========================================================================
     3D Shaders (Iteration 3: Botanical Alpha-Tested Foliage, Photographic Granite
     & Snow Contrast, True Rain Normal-Map Ripples, Instanced Rocks, Milky Way)
     ========================================================================== */
  const SKY_DOME_VERT = `
    varying vec3 vWorldDir;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldDir = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const SKY_DOME_FRAG = `
    precision highp float;
    varying vec3 vWorldDir;

    uniform float uTime;
    uniform float uDayFactor;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uSnowFactor;
    uniform vec3 uZenithCol;
    uniform vec3 uMidSkyCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uSunCol;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform sampler2D uDetailTex;

    void main() {
      vec3 rd = normalize(vWorldDir);
      float skyT = clamp(rd.y, 0.0, 1.0);

      vec3 lower = mix(uHorizonCol, uMidSkyCol, smoothstep(0.0, 0.34, skyT));
      vec3 col = mix(lower, uZenithCol, smoothstep(0.24, 0.94, skyT));

      float azAlign = clamp(dot(normalize(rd.xz + vec2(0.0001)), normalize(uSunDir.xz + vec2(0.0001))) * 0.5 + 0.5, 0.0, 1.0);
      float horizonBand = exp(-skyT * 5.0);
      col = mix(col, col + uSunCol * 0.32, pow(azAlign, 1.7) * horizonBand * (uTwilightFactor * 0.95 + uDayFactor * 0.22) * (1.0 - uRainFactor * 0.85));

      float sunCos = max(0.0, dot(rd, uSunDir));
      float sunVis = clamp((uDayFactor + uTwilightFactor * 0.95) * (1.0 - uRainFactor * 0.88), 0.0, 1.0);
      col += uSunCol * (pow(sunCos, 6.0) * 0.24 + pow(sunCos, 46.0) * 0.48 + smoothstep(0.9990, 0.9996, sunCos) * 1.45) * sunVis;

      if (sunVis > 0.05 && skyT > 0.01) {
        float ang = atan(rd.y - uSunDir.y, rd.x - uSunDir.x);
        float rayPattern = texture2D(uDetailTex, vec2(ang * 0.95 + uTime * 0.004, 0.25)).r;
        float rays = pow(sunCos, 5.0) * smoothstep(0.38, 0.86, rayPattern) * (0.14 * uTwilightFactor + 0.055 * uDayFactor);
        col += uSunCol * rays * sunVis;
      }

      if (skyT > 0.04) {
        vec2 cUv = rd.xz / (rd.y + 0.22) * 0.22 + vec2(uTime * 0.0028, -uTime * 0.001);
        float cirrus = texture2D(uDetailTex, cUv).r * texture2D(uDetailTex, cUv * 2.5 + vec2(0.3, 0.7)).g;
        float cMask = smoothstep(0.28, 0.64, cirrus) * smoothstep(0.04, 0.24, skyT) * (1.0 - smoothstep(0.66, 0.94, skyT));
        vec3 cTint = mix(uHorizonCol, vec3(1.0), 0.62 * uDayFactor) + uSunCol * pow(sunCos, 3.0) * 0.24 * sunVis;
        col = mix(col, cTint, cMask * 0.34 * (1.0 - uNightFactor * 0.82));
      }

      // Crisp Luminous Milky Way Galactic Band + Dark Cosmic Dust Rift + Aurora + Crescent Moon
      if (uNightFactor > 0.02 && skyT > 0.0) {
        vec2 mUv = rd.xz / (rd.y + 0.34) * 0.48;
        vec4 nTex1 = texture2D(uDetailTex, mUv);
        vec4 nTex2 = texture2D(uDetailTex, mUv * 2.6 + vec2(0.37, 0.23));
        float galacticCoord = rd.x * 0.68 + (rd.y - 0.34);
        float milkyCore = exp(-pow(galacticCoord * 4.4, 2.0)) * smoothstep(0.02, 0.22, skyT);
        float milkyWide = exp(-pow(galacticCoord * 2.1, 2.0)) * smoothstep(0.02, 0.24, skyT);
        float dustRift = smoothstep(0.36, 0.76, nTex2.r) * exp(-pow(galacticCoord * 11.0, 2.0));

        vec3 outerNebula = vec3(0.16, 0.28, 0.62);
        vec3 innerCore = mix(vec3(0.46, 0.56, 0.88), vec3(0.76, 0.64, 0.88), nTex1.g);
        vec3 milkyCol = outerNebula * milkyWide * (0.45 + 0.65 * nTex1.r) + innerCore * milkyCore * (0.55 + 0.85 * nTex2.a);
        milkyCol *= (1.0 - dustRift * 0.62);
        col += milkyCol * 0.58 * uNightFactor * (1.0 - uRainFactor * 0.92);

        // Northern Aurora Ribbon in winter / cold nights
        float auroraW = uNightFactor * (0.18 + 0.82 * uSnowFactor) * (1.0 - uRainFactor);
        if (auroraW > 0.05) {
          float wave = sin(rd.x * 5.2 + nTex1.b * 3.8 + uTime * 0.16) * 0.5 + 0.5;
          float curtain = exp(-pow((skyT - 0.36 - wave * 0.14) * 7.2, 2.0)) * smoothstep(0.08, 0.28, skyT);
          vec3 aCol = mix(vec3(0.14, 0.86, 0.68), vec3(0.46, 0.38, 0.96), wave);
          col += aCol * curtain * (0.55 + 0.45 * nTex1.a) * 0.32 * auroraW;
        }

        // Crisp Crescent Moon
        float moonCos = max(0.0, dot(rd, uMoonDir));
        vec3 moonShadowDir = normalize(uMoonDir + vec3(0.014, 0.008, 0.0));
        float shadowCos = max(0.0, dot(rd, moonShadowDir));
        float moonDisc = smoothstep(0.99915, 0.99945, moonCos);
        float crescent = moonDisc * (1.0 - smoothstep(0.99925, 0.9995, shadowCos) * 0.86);
        float maria = 0.82 + 0.18 * texture2D(uDetailTex, rd.xy * 18.0).r;
        col += vec3(0.95, 0.97, 1.0) * (pow(moonCos, 24.0) * 0.28 + crescent * maria * 1.55) * uNightFactor * (1.0 - uRainFactor * 0.85);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `

  const CLOUD_VERT = `
    attribute vec3 aOffset;
    attribute vec3 aScale;
    attribute float aPhase;
    attribute float aShade;

    uniform float uTime;
    uniform float uWindSpeed;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying float vShade;

    void main() {
      vUv = uv;
      vShade = aShade;
      float driftedX = mod(aOffset.x + uTime * (0.52 + uWindSpeed * 0.45) * aScale.z + 250.0, 500.0) - 250.0;
      float bobY = sin(uTime * 0.16 + aPhase) * 0.45;
      vec3 center = vec3(driftedX, aOffset.y + bobY, aOffset.z);

      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

      vec3 worldPos = center + camRight * position.x * aScale.x + camUp * position.y * aScale.y;
      vWorldPos = worldPos;
      gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    }
  `

  const CLOUD_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying float vShade;

    uniform sampler2D uCloudTex;
    uniform vec3 uSunDir;
    uniform vec3 uSunCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uMidSkyCol;
    uniform float uDayFactor;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uCloudCover;
    uniform float uClipBelowWater;

    void main() {
      if (uClipBelowWater > 0.5 && vWorldPos.y < -0.1) discard;

      vec4 tex = texture2D(uCloudTex, vUv);
      if (tex.a < 0.025) discard;

      vec3 viewDir = normalize(vWorldPos - cameraPosition);
      float forwardScatter = pow(max(0.0, dot(viewDir, uSunDir)), 5.0);
      float litWeight = clamp(tex.r * 0.72 + vUv.y * 0.24 + vShade * 0.22 - 0.18, 0.0, 1.0);

      vec3 litTop = mix(vec3(0.07, 0.12, 0.24), vec3(1.0, 0.995, 0.99), uDayFactor);
      litTop = mix(litTop, vec3(1.0, 0.74, 0.56), uTwilightFactor * 0.92);
      litTop = mix(litTop, vec3(0.54, 0.64, 0.69), uRainFactor * 0.80);

      vec3 shadeBot = mix(vec3(0.02, 0.05, 0.12), mix(uMidSkyCol, vec3(0.64, 0.76, 0.90), 0.50), uDayFactor);
      shadeBot = mix(shadeBot, vec3(0.34, 0.24, 0.48), uTwilightFactor * 0.90);
      shadeBot = mix(shadeBot, vec3(0.28, 0.37, 0.43), uRainFactor * 0.85);

      vec3 col = mix(shadeBot, litTop, smoothstep(0.12, 0.88, litWeight));
      col += uSunCol * forwardScatter * (1.0 - tex.a * 0.4) * 0.56 * clamp(uDayFactor + uTwilightFactor, 0.0, 1.0) * (1.0 - uRainFactor * 0.85);

      float dist = length(vWorldPos - cameraPosition);
      col = mix(col, uHorizonCol, smoothstep(185.0, 380.0, dist) * 0.38);

      // Keep starry night skies crisp & open for the Milky Way
      float nightThin = 1.0 - uNightFactor * (0.78 - uRainFactor * 0.65);
      float density = clamp((0.52 + uCloudCover * 0.50 + uRainFactor * 0.32) * nightThin, 0.08, 0.94);
      gl_FragColor = vec4(col, tex.a * density);
    }
  `

  // Photographic High-Contrast 3D Alpine Terrain Shader (Dark Stratified Slate Cliffs + Lush Biomes + Crisp Glacier Snow)
  const TERRAIN_VERT = `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;

    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const TERRAIN_FRAG = `
    precision highp float;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;

    uniform sampler2D uDetailTex;
    uniform float uSeason;
    uniform float uDayFactor;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uFogFactor;
    uniform float uSnowFactor;
    uniform float uLampGlow;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uDirectCol;
    uniform vec3 uAmbientCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uSunCol;
    uniform vec3 uLampPos;
    uniform float uClipBelowWater;

    vec3 seasonalMix(vec3 spr, vec3 sum, vec3 aut, vec3 win, float s) {
      float w0 = max(0.0, 1.0 - abs(s - 0.0));
      float w1 = max(0.0, 1.0 - abs(s - 1.0));
      float w2 = max(0.0, 1.0 - abs(s - 2.0));
      float w3 = max(0.0, 1.0 - abs(s - 3.0)) + max(0.0, 1.0 - abs(s + 1.0));
      float tot = max(0.001, w0 + w1 + w2 + w3);
      return (spr * w0 + sum * w1 + aut * w2 + win * w3) / tot;
    }

    void main() {
      if (uClipBelowWater > 0.5 && vWorldPos.y < -0.05) discard;

      vec3 N = normalize(vWorldNormal);
      vec4 detMacro = texture2D(uDetailTex, vWorldPos.xz * 0.015);
      vec4 detMid = texture2D(uDetailTex, vWorldPos.xz * 0.058);
      vec4 detFine = texture2D(uDetailTex, vWorldPos.xz * 0.22);
      // Diagonal alpine fault-plane bedding & fractured granite strata (eliminates artificial horizontal stripes!)
      float strata = texture2D(uDetailTex, vec2(
        vWorldPos.x * 0.024 + vWorldPos.y * 0.046 + detMacro.r * 0.62,
        vWorldPos.y * 0.115 - vWorldPos.x * 0.018 + detMacro.g * 0.50
      )).r;
      float fracture = texture2D(uDetailTex, vec2(
        vWorldPos.x * 0.072 - vWorldPos.y * 0.054 + detMid.r * 0.35,
        vWorldPos.z * 0.068 + detMid.g * 0.35
      )).g;

      vec3 bumpN = normalize(N + vec3(
        (detMid.r - 0.5) * 0.44 + (detFine.a - 0.5) * 0.24 + (fracture - 0.5) * 0.20,
        0.0,
        (detMid.g - 0.5) * 0.44 + (detFine.r - 0.5) * 0.24
      ));

      // 1. Deep High-Contrast Stratified Granite & Wet Alpine Slate (NEVER flat chalk grey!)
      vec3 rockCrevice = vec3(0.055, 0.085, 0.135);
      vec3 rockSlate = vec3(0.18, 0.23, 0.30);
      vec3 rockHighlight = vec3(0.35, 0.38, 0.44);
      vec3 rockCol = mix(rockCrevice, rockSlate, smoothstep(0.24, 0.72, strata * 0.65 + fracture * 0.35));
      rockCol = mix(rockCol, rockHighlight, smoothstep(0.64, 0.90, detFine.a) * 0.52);
      // Steep granite fissure shadow ribs
      float fissureDark = smoothstep(0.54, 0.22, fracture) * smoothstep(0.76, 0.32, bumpN.y);
      rockCol *= (1.0 - fissureDark * 0.42);
      // Wet darkening in rain turns alpine ridges into rich dark ink-wash blue-slate!
      rockCol *= (1.0 - uRainFactor * 0.38);

      // 2. Lush, Saturated Seasonal Hillside Biomes & Forest Floor Undergrowth
      vec3 sprVeg = mix(vec3(0.11, 0.30, 0.16), vec3(0.28, 0.48, 0.24), detMid.g);
      float sakuraMeadow = smoothstep(0.56, 0.76, detMacro.r * 0.65 + detMid.r * 0.35) * smoothstep(13.0, 1.0, vWorldPos.y);
      sprVeg = mix(sprVeg, vec3(0.88, 0.64, 0.75), sakuraMeadow * 0.68);

      vec3 sumVeg = mix(vec3(0.06, 0.25, 0.12), vec3(0.18, 0.42, 0.18), detMid.g * 0.65 + detFine.g * 0.35);

      vec3 autCrimson = mix(vec3(0.56, 0.14, 0.10), vec3(0.76, 0.30, 0.12), detFine.g);
      vec3 autGold = mix(vec3(0.74, 0.48, 0.11), vec3(0.86, 0.66, 0.18), detFine.r);
      vec3 autPatch = mix(autCrimson, autGold, smoothstep(0.32, 0.68, detMacro.g));
      vec3 autVeg = mix(vec3(0.10, 0.22, 0.15), autPatch, smoothstep(0.26, 0.66, detMacro.r * 0.5 + detMid.g * 0.5));

      vec3 winVeg = mix(vec3(0.14, 0.22, 0.28), vec3(0.28, 0.36, 0.44), detMid.g);
      vec3 vegCol = seasonalMix(sprVeg, sumVeg, autVeg, winVeg, uSeason);
      vegCol *= (1.0 - uRainFactor * 0.26);

      // Natural treeline & cliff slope separation
      float treeLine = smoothstep(26.0, 12.5, vWorldPos.y + detMacro.r * 7.5);
      float vegSlope = smoothstep(0.56, 0.80, bumpN.y);
      vec3 albedo = mix(rockCol, vegCol, vegSlope * treeLine * smoothstep(0.2, 1.4, vWorldPos.y));

      // Wet dark shoreline rock/pebble band where land meets lake water (y = -0.3..1.1)
      float shoreRim = smoothstep(1.15, 0.0, vWorldPos.y);
      vec3 wetShore = mix(vec3(0.20, 0.23, 0.26), vec3(0.07, 0.10, 0.13), smoothstep(0.45, -0.15, vWorldPos.y));
      albedo = mix(albedo, wetShore, shoreRim * 0.88);

      // 3. Crisp Glacier Snowfields & Alpine Snow Couloirs (settles on high peaks & gentler ledges, leaves steep rocky ribs dark!)
      // In warm rain (uRainFactor > 0, uSnowFactor == 0), raise snowline so ridges read as dramatic dark ink-wash granite!
      float snowAltStart = mix(22.5, 0.45, uSnowFactor) + uRainFactor * (1.0 - uSnowFactor) * 14.5;
      float snowNoise = (detMacro.r - 0.36) * 9.5 + (strata - 0.5) * 4.5 + (detMid.a - 0.5) * 2.8;
      float snowAltMask = smoothstep(snowAltStart, snowAltStart + 7.5, vWorldPos.y + snowNoise);
      float snowSlopeMask = smoothstep(0.50, 0.80, bumpN.y);
      float snowMask = clamp(snowAltMask * snowSlopeMask, 0.0, 1.0);
      vec3 snowAlbedo = mix(vec3(0.96, 0.98, 1.0), vec3(0.76, 0.82, 0.88), uRainFactor * (1.0 - uSnowFactor));
      albedo = mix(albedo, snowAlbedo, snowMask);

      // 4. Sculpted Directional Lighting + Glacial Blue Snow Shadows + Ridge Contrast + Alpenglow + Wet Cliff Sheen
      vec3 lightDir = uNightFactor > 0.65 ? uMoonDir : uSunDir;
      float diff = max(0.0, dot(bumpN, lightDir));
      float shapedDiff = pow(diff, 1.24);
      float cavityAO = clamp(0.48 + 0.52 * smoothstep(0.0, 18.0, vWorldPos.y) * (0.68 + 0.32 * detMacro.r), 0.36, 1.0);
      float hemi = clamp(0.22 + 0.78 * bumpN.y, 0.0, 1.0);

      // Crisp glacial blue-tinted ambient shadows on snow vs luminous sunlit snow highlights (real alpine photography!)
      vec3 snowAmbientBoost = mix(vec3(1.0), vec3(0.78, 0.96, 1.26), snowMask * (1.0 - shapedDiff * 0.75) * (1.0 - uRainFactor * 0.7));
      vec3 lit = albedo * cavityAO * (uDirectCol * shapedDiff * 1.22 + uAmbientCol * snowAmbientBoost * hemi * 0.82);
      // Subtle specular wet-slate sheen on rain-drenched cliffs for photographic depth!
      if (uRainFactor > 0.08) {
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 skyH = normalize(vec3(0.18, 0.94, 0.28) + V);
        float wetSpec = pow(max(0.0, dot(bumpN, skyH)), 18.0) * (1.0 - snowMask) * smoothstep(0.85, 0.35, bumpN.y);
        lit += vec3(0.32, 0.44, 0.52) * wetSpec * 0.28 * uRainFactor;
      }
      // Warm golden-rose alpenglow kissing sunlit snow peaks at dusk
      lit += uSunCol * snowMask * shapedDiff * uTwilightFactor * 0.48;
      // Cool silver moonlight rim on snow ridges at night
      lit += vec3(0.36, 0.52, 0.82) * snowMask * pow(max(0.0, dot(bumpN, uMoonDir)), 1.5) * uNightFactor * 0.36;

      float dLamp = length(vWorldPos - uLampPos);
      lit += vec3(1.0, 0.68, 0.30) * (1.0 / (1.0 + dLamp * dLamp * 0.055)) * 0.95 * uLampGlow;

      // 5. Unified Atmospheric Perspective (identical across Terrain & Forest — zero floating far trees!)
      // In Rain, peaks retain deep wet ink-wash slate depth while luminous valley mist curls along the far mountain base.
      float dist = length(vWorldPos - cameraPosition);
      float fogDensity = mix(0.0019, 0.0036, uRainFactor * 0.70 + uFogFactor * 0.95);
      float aerialCap = mix(0.62, 0.36, uRainFactor);
      float aerialFog = min(aerialCap, 1.0 - exp(-max(0.0, dist - 34.0) * fogDensity));
      float valleyMist = exp(-max(0.0, vWorldPos.y - 1.2) * 0.16) * smoothstep(72.0, 148.0, dist) * (0.14 + 0.36 * uRainFactor + 0.16 * uTwilightFactor + 0.34 * uFogFactor);
      float totalFog = clamp(aerialFog + valleyMist * (1.0 - aerialFog * 0.65), 0.0, mix(0.68, 0.52, uRainFactor));

      vec3 finalCol = mix(lit, uHorizonCol, totalFog);

      vec3 x = max(vec3(0.0), finalCol * 1.02 - 0.003);
      finalCol = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `

  // AAA Alpha-Tested Botanical 3D Forest Shader (Leafy Sakura/Maple Silhouettes & Feathery Pine Needles!)
  const TREE_VERT = `
    attribute float aPart;     // 0 = wood trunk/branches, 1 = alpha-tested foliage cards
    attribute float aTreeKind; // 0 = pine bough cards, 1 = broadleaf leaf/blossom cards
    attribute float aTone;
    attribute float aPhase;

    uniform float uTime;
    uniform float uWindSpeed;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying float vPart;
    varying float vTreeKind;
    varying float vTone;
    varying float vLocalY;

    void main() {
      vUv = uv;
      vPart = aPart;
      vTreeKind = aTreeKind;
      vTone = aTone;
      vLocalY = position.y;

      vec3 pos = position;
      float swayW = max(0.0, pos.y - 0.45) * 0.055;
      float gust = sin(uTime * (1.2 + uWindSpeed * 0.35) + aPhase) * 0.65 + cos(uTime * 2.2 + aPhase * 1.7) * 0.35;
      pos.x += gust * swayW * uWindSpeed;
      // Subtle individual leaf flutter on foliage cards
      if (aPart > 0.5) {
        pos.y += sin(uTime * 2.8 + aPhase + position.x * 2.0) * 0.035 * uWindSpeed;
      }

      vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const TREE_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying float vPart;
    varying float vTreeKind;
    varying float vTone;
    varying float vLocalY;

    uniform sampler2D uLeafTex;
    uniform sampler2D uPineTex;
    uniform float uSeason;
    uniform float uDayFactor;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uFogFactor;
    uniform float uSnowFactor;
    uniform float uLampGlow;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uDirectCol;
    uniform vec3 uAmbientCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uLampPos;
    uniform float uClipBelowWater;

    vec3 seasonalMix(vec3 spr, vec3 sum, vec3 aut, vec3 win, float s) {
      float w0 = max(0.0, 1.0 - abs(s - 0.0));
      float w1 = max(0.0, 1.0 - abs(s - 1.0));
      float w2 = max(0.0, 1.0 - abs(s - 2.0));
      float w3 = max(0.0, 1.0 - abs(s - 3.0)) + max(0.0, 1.0 - abs(s + 1.0));
      float tot = max(0.001, w0 + w1 + w2 + w3);
      return (spr * w0 + sum * w1 + aut * w2 + win * w3) / tot;
    }

    void main() {
      if (uClipBelowWater > 0.5 && vWorldPos.y < -0.05) discard;

      float leafLum = 1.0;
      float winterSnowMask = 0.0;

      if (vPart > 0.5) {
        vec4 fTex = vTreeKind < 0.5 ? texture2D(uPineTex, vUv) : texture2D(uLeafTex, vUv);
        // In Winter, deciduous broadleaf trees thin out to delicate frosted branches & sparse winter snow tufts (NO white cotton balls!)
        float winterThin = vTreeKind > 0.5 ? smoothstep(2.4, 3.0, uSeason) : 0.0;
        float alphaCut = 0.36 + winterThin * 0.42 * (1.0 - fTex.b);
        if (fTex.a < alphaCut) discard;
        leafLum = 0.72 + 0.42 * fTex.r;
        winterSnowMask = fTex.r;
      }

      vec3 N = normalize(vWorldNormal);
      vec3 lightDir = uNightFactor > 0.65 ? uMoonDir : uSunDir;
      float diff = max(0.0, dot(N, lightDir));
      float hemi = clamp(0.42 + 0.58 * N.y, 0.0, 1.0);

      vec3 albedo;
      if (vPart < 0.5) {
        albedo = mix(vec3(0.16, 0.12, 0.10), vec3(0.26, 0.20, 0.16), vTone);
      } else if (vTreeKind < 0.5) {
        // Deep Evergreen Alpine Pines: rich dark spruce needles peeking crisply beneath snowy upper boughs!
        vec3 pineDeep = mix(vec3(0.06, 0.19, 0.12), vec3(0.13, 0.30, 0.18), vTone);
        vec3 pineWin = mix(vec3(0.05, 0.14, 0.16), vec3(0.10, 0.22, 0.24), vTone);
        albedo = seasonalMix(pineDeep, pineDeep * 1.12, pineDeep * 0.96, pineWin, uSeason) * leafLum;
        float boughSnow = smoothstep(0.42, 0.84, N.y + (winterSnowMask - 0.58) * 0.45) * smoothstep(0.28, 0.78, uSnowFactor);
        albedo = mix(albedo, vec3(0.95, 0.98, 1.0), boughSnow * 0.78);
      } else {
        // Botanical Seasonal Broadleaf Canopies (Spring Sakura, Summer Lush Emerald, Autumn Crimson Maple & Gold Ginkgo, Winter Frosted Twigs)
        vec3 sprBlossom = vTone < 0.22
          ? mix(vec3(0.19, 0.45, 0.21), vec3(0.34, 0.58, 0.26), vTone * 4.5)
          : mix(vec3(0.98, 0.52, 0.72), vec3(1.00, 0.84, 0.91), (vTone - 0.22) * 1.28);
        vec3 sumLeaf = mix(vec3(0.09, 0.37, 0.15), vec3(0.26, 0.55, 0.21), vTone);
        vec3 autLeaf = vTone < 0.50
          ? mix(vec3(0.72, 0.13, 0.10), vec3(0.90, 0.32, 0.12), vTone * 2.0)
          : mix(vec3(0.90, 0.58, 0.10), vec3(0.98, 0.78, 0.18), (vTone - 0.50) * 2.0);
        // Winter: dark frosted bark/twigs with crisp snow frosting on upper clusters
        vec3 winTwig = mix(vec3(0.22, 0.24, 0.30), vec3(0.86, 0.91, 0.97), smoothstep(0.25, 0.75, N.y + (winterSnowMask - 0.45) * 0.5));
        albedo = seasonalMix(sprBlossom, sumLeaf, autLeaf, winTwig, uSeason) * leafLum;
      }

      // Wet saturation darkening in Rain (Garden of Words lush wet emerald & bark!)
      albedo *= (1.0 - uRainFactor * 0.20);

      // Ground contact AO near trunk base + sculpted 3D sunlit-crown vs cool-underside shading + leaf SSS
      float canopyAO = clamp(0.46 + 0.54 * smoothstep(0.35, 4.2, vLocalY), 0.42, 1.0);
      float sss = pow(max(0.0, dot(normalize(cameraPosition - vWorldPos), -lightDir)), 3.0) * 0.38 * vPart * (1.0 - uRainFactor * 0.75);
      vec3 lit = albedo * canopyAO * (uDirectCol * (diff * 1.06 + sss) + uAmbientCol * (0.48 + 0.52 * hemi) * 0.84);
      // Velvety dark midnight silhouettes at night (makes Milky Way, lantern & pavilion glow pop!)
      lit *= (1.0 - uNightFactor * 0.46);

      float dLamp = length(vWorldPos - uLampPos);
      lit += vec3(1.0, 0.68, 0.30) * (1.0 / (1.0 + dLamp * dLamp * 0.055)) * 0.95 * uLampGlow;

      // Exact unified atmospheric fog + valley mist matching TERRAIN_FRAG (eliminates floating trees!)
      float dist = length(vWorldPos - cameraPosition);
      float fogDensity = mix(0.0019, 0.0036, uRainFactor * 0.70 + uFogFactor * 0.95);
      float aerialCap = mix(0.62, 0.36, uRainFactor);
      float aerialFog = min(aerialCap, 1.0 - exp(-max(0.0, dist - 34.0) * fogDensity));
      float valleyMist = exp(-max(0.0, vWorldPos.y - 1.2) * 0.16) * smoothstep(72.0, 148.0, dist) * (0.14 + 0.36 * uRainFactor + 0.16 * uTwilightFactor + 0.34 * uFogFactor);
      float totalFog = clamp(aerialFog + valleyMist * (1.0 - aerialFog * 0.65), 0.0, mix(0.68, 0.52, uRainFactor));
      vec3 finalCol = mix(lit, uHorizonCol, totalFog);

      vec3 x = max(vec3(0.0), finalCol * 1.02 - 0.003);
      finalCol = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `

  // Non-Instanced Architecture Vertex Shader (Pier, Lantern, Boat, Pavilion)
  const ARCHITECT_VERT = `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  // Instanced Shoreline Boulder Vertex Shader (FIXES the center-lake (0,0,0) boulder pile bug!)
  const INSTANCED_ARCHITECT_VERT = `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const ARCHITECT_FRAG = `
    precision mediump float;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;

    uniform vec3 uBaseColor;
    uniform float uAllowSnow;
    uniform sampler2D uDetailTex;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uFogFactor;
    uniform float uSnowFactor;
    uniform float uLampGlow;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uDirectCol;
    uniform vec3 uAmbientCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uLampPos;
    uniform float uClipBelowWater;

    void main() {
      if (uClipBelowWater > 0.5 && vWorldPos.y < -0.05) discard;

      vec3 N = normalize(vWorldNormal);
      float grain = texture2D(uDetailTex, vWorldPos.xz * 0.85 + vec2(vWorldPos.y * 0.4)).a;
      vec3 albedo = uBaseColor * (0.80 + 0.38 * grain);

      float wet = smoothstep(0.45, 0.0, vWorldPos.y);
      albedo *= (1.0 - wet * 0.45 - uRainFactor * 0.18);

      if (uAllowSnow > 0.5 && uSnowFactor > 0.25) {
        float snowCap = smoothstep(0.56, 0.86, N.y) * smoothstep(0.25, 0.72, uSnowFactor) * (0.72 + 0.28 * grain);
        albedo = mix(albedo, vec3(0.94, 0.97, 1.0), snowCap * 0.90);
      }

      vec3 lightDir = uNightFactor > 0.65 ? uMoonDir : uSunDir;
      float diff = max(0.0, dot(N, lightDir));
      float hemi = clamp(0.38 + 0.62 * N.y, 0.0, 1.0);
      vec3 lit = albedo * (uDirectCol * diff * 0.95 + uAmbientCol * hemi * 0.82);

      vec3 toLamp = uLampPos - vWorldPos;
      float dLamp = length(toLamp);
      float lampDot = max(0.18, dot(N, toLamp / max(0.01, dLamp)));
      float lampAtten = 1.0 / (1.0 + dLamp * dLamp * 0.12);
      lit += albedo * vec3(1.55, 0.96, 0.42) * lampDot * lampAtten * 1.55 * uLampGlow;

      float dist = length(vWorldPos - cameraPosition);
      float fogDensity = mix(0.0019, 0.0036, uRainFactor * 0.70 + uFogFactor * 0.95);
      float aerialFog = min(mix(0.62, 0.36, uRainFactor), 1.0 - exp(-max(0.0, dist - 34.0) * fogDensity));
      float valleyMist = exp(-max(0.0, vWorldPos.y - 1.2) * 0.16) * smoothstep(72.0, 148.0, dist) * (0.14 + 0.36 * uRainFactor + 0.16 * uTwilightFactor + 0.34 * uFogFactor);
      float totalFog = clamp(aerialFog + valleyMist * (1.0 - aerialFog * 0.65), 0.0, mix(0.68, 0.52, uRainFactor));
      vec3 finalCol = mix(lit, uHorizonCol, totalFog);

      vec3 x = max(vec3(0.0), finalCol * 1.02 - 0.003);
      finalCol = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `

  // HD MSAA Real-Time Planar Reflection Water Shader (Lightweight Physical Rain Normal-Map Ripples + Dual Warm Lantern Pillars!)
  const WATER_VERT = `
    attribute float aWaterDepth;
    uniform mat4 uReflectMatrix;
    varying vec3 vWorldPos;
    varying vec4 vReflectClip;
    varying float vDepth;

    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vDepth = aWaterDepth;
      vReflectClip = uReflectMatrix * wp;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const WATER_FRAG = `
    precision highp float;
    varying vec3 vWorldPos;
    varying vec4 vReflectClip;
    varying float vDepth;

    uniform sampler2D uReflectionTex;
    uniform sampler2D uDetailTex;
    uniform float uTime;
    uniform float uWindSpeed;
    uniform float uDayFactor;
    uniform float uTwilightFactor;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uFogFactor;
    uniform float uLampGlow;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uSunCol;
    uniform vec3 uWaterCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uLampPos;
    uniform vec3 uPavLampPos;
    uniform vec4 uRipples[6];

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    // Fast physical concentric raindrop normal gradient (shatters reflection organically at 60 FPS, ZERO neon rings!)
    vec3 rainRippleFast(vec2 xz, float scale, float speed, float time) {
      vec2 grid = xz * scale;
      vec2 cell = floor(grid);
      vec2 f = fract(grid) - 0.5;
      float h1 = hash12(cell);
      float h2 = hash12(cell + vec2(19.7, 37.3));
      float life = fract(time * (speed + h1 * 0.42) + h2);
      vec2 delta = f - (vec2(h1, h2) - 0.5) * 0.40;
      float d = length(delta);
      float diff = d - life * 0.44;
      float env = exp(-abs(diff) * 24.0) * (1.0 - life) * min(1.0, life * 14.0);
      float slope = cos(diff * 48.0) * env;
      return vec3((delta / max(0.02, d)) * slope, max(0.0, slope) * env);
    }

    void main() {
      vec3 viewVec = cameraPosition - vWorldPos;
      float dist = length(viewVec);
      vec3 V = viewVec / max(0.001, dist);

      vec2 wShift1 = vec2(uTime * 0.018 * uWindSpeed, uTime * 0.012);
      vec2 wShift2 = vec2(-uTime * 0.014 * uWindSpeed, uTime * 0.022);
      vec4 wTex1 = texture2D(uDetailTex, vWorldPos.xz * 0.048 + wShift1);
      vec4 wTex2 = texture2D(uDetailTex, vWorldPos.xz * 0.145 + wShift2);

      float waveScale = (0.042 + 0.022 * uWindSpeed) / (1.0 + dist * 0.014);
      vec2 grad = vec2(
        (wTex1.b - 0.5) * 0.62 + (wTex2.a - 0.5) * 0.38,
        (wTex1.r - 0.5) * 0.62 + (wTex2.b - 0.5) * 0.38
      ) * waveScale;

      float rippleSheen = 0.0;
      for (int i = 0; i < 6; i++) {
        vec4 rip = uRipples[i];
        float age = uTime - rip.z;
        if (age > 0.0 && age < 6.0) {
          vec2 delta = vWorldPos.xz - rip.xy;
          float r = length(delta);
          float front = r - age * 4.2;
          float env = exp(-abs(front) * 0.95) * exp(-age * 0.55) * exp(-r * 0.04) * rip.w;
          float ring = cos(front * 5.0) * env;
          vec2 dir = delta / max(0.05, r);
          grad += dir * ring * 0.09;
          rippleSheen += max(0.0, sin(front * 5.0)) * env * 0.14;
        }
      }

      // Lightweight physical normal-map raindrop perturbation (60 FPS even in heavy rain!)
      if (uRainFactor > 0.05 && dist < 64.0) {
        float fade = smoothstep(64.0, 10.0, dist) * uRainFactor;
        vec3 r1 = rainRippleFast(vWorldPos.xz, 0.64, 1.05, uTime);
        grad += r1.xy * 0.105 * fade;
        rippleSheen += r1.z * 0.036 * fade;
        if (dist < 38.0) {
          vec3 r2 = rainRippleFast(vWorldPos.xz + vec2(7.3, 13.1), 1.08, 1.38, uTime + 0.45);
          grad += r2.xy * 0.075 * fade * smoothstep(38.0, 12.0, dist);
          rippleSheen += r2.z * 0.026 * fade;
        }
      }

      vec3 waterN = normalize(vec3(-grad.x, 1.0, -grad.y));

      // Project into 768x768 4x MSAA Planar Reflection RenderTarget
      vec2 reflUv = (vReflectClip.xy / max(0.001, vReflectClip.w)) * 0.5 + 0.5;
      vec2 distort = vec2(waterN.x, waterN.z) * clamp((0.15 + 0.14 * uRainFactor) / (1.0 + dist * 0.014), 0.02, 0.22);
      vec2 baseUv = clamp(reflUv + distort, vec2(0.005), vec2(0.995));
      vec2 texel = vec2(0.0013, 0.0013);
      vec3 reflCol = (
        texture2D(uReflectionTex, baseUv).rgb * 0.56 +
        texture2D(uReflectionTex, clamp(baseUv + vec2(texel.x, 0.0), vec2(0.004), vec2(0.996))).rgb * 0.22 +
        texture2D(uReflectionTex, clamp(baseUv - vec2(texel.x, 0.0), vec2(0.004), vec2(0.996))).rgb * 0.22
      );

      float cosTheta = max(0.0, dot(V, waterN));
      float fresnel = 0.08 + 0.92 * pow(1.0 - cosTheta, 3.8);

      vec3 shallowTint = mix(vec3(0.11, 0.34, 0.40), uWaterCol, smoothstep(0.0, 2.4, vDepth));
      vec3 bodyCol = mix(shallowTint, uWaterCol, smoothstep(0.3, 3.2, vDepth));
      vec3 waterCol = mix(bodyCol, reflCol, clamp(fresnel * 0.88 + 0.16, 0.18, 0.94));

      // Sparkling Sun / Moon Glitter Path
      vec3 activeLight = uNightFactor > 0.55 ? uMoonDir : uSunDir;
      vec3 halfVec = normalize(activeLight + V);
      float specDot = max(0.0, dot(waterN, halfVec));
      float sparkleNoise = smoothstep(0.36, 0.84, wTex2.a);
      float spec = pow(specDot, 380.0) * 2.4 * (0.45 + 0.85 * sparkleNoise) + pow(specDot, 76.0) * 0.20 * sparkleNoise;
      vec3 specTint = uNightFactor > 0.55 ? vec3(0.84, 0.92, 1.0) : uSunCol;
      float lightVis = clamp(activeLight.y * 3.8 + 0.18, 0.0, 1.0) * (1.0 - uRainFactor * 0.85);
      waterCol += specTint * spec * lightVis;

      // Shimmering Golden Pier Lantern Reflection Pillar + Soft Distant Pavilion Shoji Shimmer
      if (uLampGlow > 0.02) {
        vec3 toLamp = uLampPos - vWorldPos;
        float lampDist = length(toLamp);
        vec3 L = toLamp / max(0.01, lampDist);
        vec3 lampH = normalize(L + V);
        float lampSpec = pow(max(0.0, dot(waterN, lampH)), 64.0) * (0.55 + 0.65 * wTex2.a);
        float trailX = abs(vWorldPos.x - uLampPos.x + waterN.x * 3.8);
        float lampPillar = exp(-trailX * 0.82) * exp(-lampDist * 0.085) * smoothstep(uLampPos.z - 2.0, uLampPos.z + 12.0, vWorldPos.z + 8.0);
        waterCol += vec3(1.0, 0.66, 0.26) * (lampSpec * 1.15 + lampPillar * 0.45) * uLampGlow;

        float pavTrailX = abs(vWorldPos.x - uPavLampPos.x + waterN.x * 5.2);
        float pavDz = vWorldPos.z - uPavLampPos.z;
        if (pavDz > 0.0 && pavDz < 28.0) {
          float pavShimmer = exp(-pavTrailX * 0.46) * exp(-pavDz * 0.11) * (0.55 + 0.55 * wTex2.a);
          waterCol += vec3(1.0, 0.68, 0.30) * pavShimmer * 0.42 * uLampGlow;
        }
      }

      // Delicate Shoreline Contact Foam along bays & rocks
      float foamWave = sin(vDepth * 14.0 - uTime * 2.2 + wTex1.r * 5.0) * 0.5 + 0.5;
      float foamMask = smoothstep(0.45, 0.04, vDepth) * smoothstep(0.36, 0.82, foamWave) * smoothstep(95.0, 14.0, dist);
      waterCol = mix(waterCol, mix(uHorizonCol, vec3(0.98, 0.99, 1.0), 0.52), foamMask * 0.40);

      waterCol += mix(uHorizonCol, vec3(1.0), 0.45) * rippleSheen;

      float fogDensity = mix(0.0019, 0.0036, uRainFactor * 0.70 + uFogFactor * 0.95);
      float lakeFog = min(mix(0.62, 0.42, uRainFactor), 1.0 - exp(-max(0.0, dist - 34.0) * fogDensity));
      vec3 finalCol = mix(waterCol, uHorizonCol, lakeFog);

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `

  const MIST_VERT = `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const MIST_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    uniform sampler2D uDetailTex;
    uniform float uTime;
    uniform float uWindSpeed;
    uniform float uMistAlpha;
    uniform vec3 uHorizonCol;
    uniform float uClipBelowWater;

    void main() {
      if (uClipBelowWater > 0.5 && vWorldPos.y < 0.0) discard;
      vec2 uv1 = vec2(vUv.x * 2.2 + uTime * 0.007 * uWindSpeed, vUv.y * 1.1);
      vec2 uv2 = vec2(vUv.x * 3.8 - uTime * 0.004 * uWindSpeed, vUv.y * 1.4 + 0.4);
      float m = texture2D(uDetailTex, uv1).r * 0.6 + texture2D(uDetailTex, uv2).g * 0.4;
      float edgeX = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
      float edgeY = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
      float a = smoothstep(0.30, 0.74, m) * edgeX * edgeY * uMistAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(uHorizonCol, a);
    }
  `

  const GRASS_VERT = `
    attribute float aPhase;
    attribute float aTone;
    attribute float aBladeH;
    uniform float uTime;
    uniform float uWindSpeed;
    varying float vHeight;
    varying float vTone;
    varying vec3 vWorldPos;

    void main() {
      vHeight = clamp(aBladeH, 0.0, 1.0);
      vTone = aTone;
      vec3 pos = position;
      float bend = vHeight * vHeight;
      float gust = sin(uTime * (1.45 + uWindSpeed * 0.42) + aPhase) * 0.24 + cos(uTime * 2.5 + aPhase * 1.4) * 0.10;
      pos.x += gust * bend * uWindSpeed;
      pos.z += gust * 0.42 * bend * uWindSpeed;
      vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const GRASS_FRAG = `
    precision mediump float;
    varying float vHeight;
    varying float vTone;
    varying vec3 vWorldPos;
    uniform float uSeason;
    uniform float uNightFactor;
    uniform float uRainFactor;
    uniform float uFogFactor;
    uniform float uLampGlow;
    uniform vec3 uDirectCol;
    uniform vec3 uAmbientCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uLampPos;

    vec3 seasonalMix(vec3 spr, vec3 sum, vec3 aut, vec3 win, float s) {
      float w0 = max(0.0, 1.0 - abs(s - 0.0));
      float w1 = max(0.0, 1.0 - abs(s - 1.0));
      float w2 = max(0.0, 1.0 - abs(s - 2.0));
      float w3 = max(0.0, 1.0 - abs(s - 3.0)) + max(0.0, 1.0 - abs(s + 1.0));
      float tot = max(0.001, w0 + w1 + w2 + w3);
      return (spr * w0 + sum * w1 + aut * w2 + win * w3) / tot;
    }

    void main() {
      // Natural earthy sage / autumn sedge / frosted dry reeds (ZERO garish neon spikes!)
      vec3 baseCol = seasonalMix(
        vec3(0.09, 0.24, 0.12),
        vec3(0.07, 0.22, 0.10),
        vec3(0.28, 0.21, 0.12),
        vec3(0.26, 0.28, 0.32),
        uSeason
      );
      vec3 tipCol = seasonalMix(
        vec3(0.32, 0.54, 0.24),
        vec3(0.22, 0.48, 0.19),
        vec3(0.68, 0.52, 0.24),
        vec3(0.66, 0.70, 0.75),
        uSeason
      );
      vec3 col = mix(baseCol, tipCol, vHeight * (0.72 + 0.28 * vTone));
      col *= (1.0 - uRainFactor * 0.20);
      float rootAO = 0.52 + 0.48 * vHeight;
      vec3 lit = col * rootAO * (uAmbientCol * 1.04 + uDirectCol * (0.34 + 0.60 * vHeight));
      lit *= (1.0 - uNightFactor * 0.45);

      float dLamp = length(vWorldPos - uLampPos);
      lit += vec3(1.0, 0.68, 0.30) * (1.0 / (1.0 + dLamp * dLamp * 0.07)) * 0.9 * uLampGlow;

      float dist = length(vWorldPos - cameraPosition);
      float fogDensity = mix(0.0019, 0.0036, uRainFactor * 0.70 + uFogFactor * 0.95);
      float fog = min(mix(0.62, 0.40, uRainFactor), 1.0 - exp(-max(0.0, dist - 34.0) * fogDensity));
      gl_FragColor = vec4(mix(lit, uHorizonCol, fog), 1.0);
    }
  `

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
      vAlpha = 0.55 + 0.45 * sin(uTime * 1.9 + aPhase);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio * (380.0 / max(40.0, -mvPos.z));
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
      float core = smoothstep(0.28, 0.02, d);
      float halo = smoothstep(0.50, 0.06, d) * 0.52;
      gl_FragColor = vec4(vColor, (core + halo) * vAlpha * uStarVis);
    }
  `

  /* ==========================================================================
     Organic Alpha-Tested 3D Botanical Tree Builders (Zero Plastic Balls/Cones!)
     ========================================================================== */
  const mergeTexturedParts = (THREE, parts) => {
    let totalVerts = 0
    let totalIdx = 0
    for (let i = 0; i < parts.length; i += 1) {
      totalVerts += parts[i].positions.length / 3
      totalIdx += parts[i].indices.length
    }
    const positions = new Float32Array(totalVerts * 3)
    const normals = new Float32Array(totalVerts * 3)
    const uvs = new Float32Array(totalVerts * 2)
    const partAttr = new Float32Array(totalVerts)
    const indices = new Uint16Array(totalIdx)

    let vOff = 0
    let iOff = 0
    for (let p = 0; p < parts.length; p += 1) {
      const part = parts[p]
      const vCount = part.positions.length / 3
      positions.set(part.positions, vOff * 3)
      normals.set(part.normals, vOff * 3)
      uvs.set(part.uvs, vOff * 2)
      partAttr.fill(part.partId, vOff, vOff + vCount)
      for (let k = 0; k < part.indices.length; k += 1) {
        indices[iOff + k] = part.indices[k] + vOff
      }
      vOff += vCount
      iOff += part.indices.length
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    g.setAttribute('aPart', new THREE.BufferAttribute(partAttr, 1))
    g.setIndex(new THREE.BufferAttribute(indices, 1))
    return g
  }

  const extractMeshPart = (geom, partId, normalOriginY) => {
    const pos = new Float32Array(geom.attributes.position.array)
    const nor = new Float32Array(geom.attributes.normal.array)
    const uv = geom.attributes.uv
      ? new Float32Array(geom.attributes.uv.array)
      : new Float32Array((pos.length / 3) * 2)
    const idx = geom.index ? Array.from(geom.index.array) : Array.from({ length: pos.length / 3 }, (_, i) => i)

    // Pixar / Genshin Impact foliage normal-transfer trick: project foliage card normals outward from crown center!
    if (typeof normalOriginY === 'number') {
      for (let i = 0; i < pos.length; i += 3) {
        const dx = pos[i]
        const dy = pos[i + 1] - normalOriginY
        const dz = pos[i + 2]
        const len = Math.hypot(dx, dy, dz) || 1
        nor[i] = dx / len
        nor[i + 1] = clamp(dy / len * 0.85 + 0.35, -0.3, 1.0)
        nor[i + 2] = dz / len
      }
    }
    return { positions: pos, normals: nor, uvs: uv, indices: idx, partId }
  }

  // Organic 3D Alpine Pine Tree: dark tapered cedar trunk + 4 crossed intersecting feathery pine needle planes!
  const buildOrganicPineGeometry = THREE => {
    const parts = []
    const trunk = new THREE.CylinderGeometry(0.08, 0.21, 3.8, 6)
    trunk.translate(0, 1.9, 0)
    parts.push(extractMeshPart(trunk, 0))

    // 4 intersecting vertical feathery pine spray cards (0°, 45°, 90°, 135°) for rich 3D silhouette from every angle!
    const angles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75]
    for (let i = 0; i < angles.length; i += 1) {
      const plane = new THREE.PlaneGeometry(3.4, 5.2)
      plane.rotateY(angles[i])
      plane.translate(0, 3.45, 0)
      parts.push(extractMeshPart(plane, 1, 2.2))
    }
    // 2 tilted horizontal mid-crown pine bough skirts so overhead/lake reflections look lush & volumetric
    for (let j = 0; j < 2; j += 1) {
      const skirt = new THREE.PlaneGeometry(2.7 - j * 0.6, 2.7 - j * 0.6)
      skirt.rotateX(-Math.PI * 0.42)
      skirt.rotateY(j * 1.1)
      skirt.translate(0, 2.3 + j * 1.35, 0)
      parts.push(extractMeshPart(skirt, 1, 1.8))
    }
    return mergeTexturedParts(THREE, parts)
  }

  // Organic 3D Broadleaf Tree (Sakura / Summer Oak / Autumn Maple & Ginkgo):
  // Forking 3D wooden trunk + 4 outward branches + 14 intersecting botanical leaf/blossom cluster cards!
  const buildOrganicBroadleafGeometry = THREE => {
    const parts = []
    const trunk = new THREE.CylinderGeometry(0.11, 0.24, 2.3, 6)
    trunk.translate(0, 1.15, 0)
    parts.push(extractMeshPart(trunk, 0))

    // 4 graceful outward-reaching 3D wooden limbs
    const limbDirs = [[0.55, 0.42, 0.25], [-0.52, 0.46, -0.22], [0.18, 0.48, -0.52], [-0.24, 0.44, 0.48]]
    for (let b = 0; b < limbDirs.length; b += 1) {
      const [bx, by, bz] = limbDirs[b]
      const limb = new THREE.CylinderGeometry(0.045, 0.10, 1.45, 5)
      limb.rotateZ(-bx * 1.05)
      limb.rotateX(bz * 1.05)
      limb.translate(bx * 0.75, 2.1 + by * 0.5, bz * 0.75)
      parts.push(extractMeshPart(limb, 0))
    }

    // 14 intersecting angled botanical leaf cluster cards forming an airy, organic crown
    const clusters = [
      [0.0, 3.15, 0.0, 2.55, 0.0, 0.12],
      [0.0, 3.15, 0.0, 2.55, Math.PI * 0.5, -0.10],
      [0.0, 3.15, 0.0, 2.35, Math.PI * 0.25, 0.15],
      [0.95, 2.75, 0.35, 2.10, 0.35, 0.22],
      [0.95, 2.75, 0.35, 1.95, 1.85, -0.18],
      [-0.92, 2.85, -0.28, 2.15, -0.42, 0.20],
      [-0.92, 2.85, -0.28, 1.95, 1.12, -0.22],
      [0.25, 2.82, -0.88, 2.05, 0.78, 0.18],
      [0.25, 2.82, -0.88, 1.85, 2.32, -0.15],
      [-0.32, 2.72, 0.86, 2.00, 0.22, -0.20],
      [-0.32, 2.72, 0.86, 1.85, 1.78, 0.18],
      [0.15, 3.72, -0.12, 1.95, 0.62, 0.35],
      [-0.18, 3.68, 0.14, 1.85, 2.18, -0.32],
      [0.0, 3.35, 0.0, 2.40, 0.0, Math.PI * 0.42]
    ]
    for (let i = 0; i < clusters.length; i += 1) {
      const [cx, cy, cz, sc, ry, rx] = clusters[i]
      const card = new THREE.PlaneGeometry(sc, sc)
      card.rotateX(rx)
      card.rotateY(ry)
      card.translate(cx, cy, cz)
      parts.push(extractMeshPart(card, 1, 2.65))
    }

    return mergeTexturedParts(THREE, parts)
  }

  // Organic Lakeside Low Shrub / Flowering Bank Undergrowth (bridges wet shore, boulders & tall trees!)
  const buildOrganicShrubGeometry = THREE => {
    const parts = []
    const cards = [
      [0.0, 0.58, 0.0, 1.55, 0.0, 0.14],
      [0.0, 0.58, 0.0, 1.55, Math.PI * 0.5, -0.14],
      [0.42, 0.48, 0.22, 1.25, 0.45, 0.22],
      [-0.44, 0.46, -0.18, 1.25, 1.95, -0.18],
      [0.0, 0.72, 0.0, 1.40, 0.78, Math.PI * 0.38]
    ]
    for (let i = 0; i < cards.length; i += 1) {
      const [cx, cy, cz, sc, ry, rx] = cards[i]
      const card = new THREE.PlaneGeometry(sc, sc)
      card.rotateX(rx)
      card.rotateY(ry)
      card.translate(cx, cy, cz)
      parts.push(extractMeshPart(card, 1, 0.35))
    }
    return mergeTexturedParts(THREE, parts)
  }

  // Graceful Multi-Blade Curved Grass / Shoreline Reed Tuft (5 slender naturally arching blades per tuft!)
  const buildCurvedGrassTuftGeometry = THREE => {
    const positions = []
    const bladeHs = []
    const indices = []
    const blades = [
      [0.0, 0.0, 0.0, 1.15, 0.060, 0.28],
      [0.14, 0.06, 1.18, 0.96, 0.052, 0.34],
      [-0.12, 0.09, 2.38, 1.05, 0.055, 0.32],
      [0.07, -0.13, 3.72, 0.86, 0.048, 0.30],
      [-0.10, -0.08, 5.10, 0.92, 0.050, 0.36]
    ]
    let vOff = 0
    for (let b = 0; b < blades.length; b += 1) {
      const [ox, oz, ang, h, w0, droop] = blades[b]
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const segs = 3
      for (let s = 0; s <= segs; s += 1) {
        const t = s / segs
        const y = t * h * (1.0 - 0.14 * t * t)
        const out = droop * t * t * h
        const cx = ox + ca * out
        const cz = oz + sa * out
        const halfW = w0 * (1.0 - t * 0.86)
        if (s < segs) {
          positions.push(cx - sa * halfW, y, cz + ca * halfW)
          positions.push(cx + sa * halfW, y, cz - ca * halfW)
          bladeHs.push(t, t)
        } else {
          positions.push(cx, y, cz)
          bladeHs.push(1.0)
        }
      }
      for (let s = 0; s < segs - 1; s += 1) {
        const a = vOff + s * 2
        const b1 = a + 1
        const c = a + 2
        const d = a + 3
        indices.push(a, b1, c, b1, d, c)
      }
      const lastPair = vOff + (segs - 1) * 2
      const tip = lastPair + 2
      indices.push(lastPair, lastPair + 1, tip)
      vOff += segs * 2 + 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('aBladeH', new THREE.Float32BufferAttribute(bladeHs, 1))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }

  // Sculpted Open Hollow Double-Ended Wooden Rowboat Hull (outer planks + inner cavity + gunwale rim!)
  const buildOpenRowboatGeometry = THREE => {
    const stations = 14
    const length = 3.55
    const maxHalfBeam = 0.68
    const positions = []
    const indices = []

    // Profile cross-section (5 points): port gunwale -> port chine -> keel -> starboard chine -> starboard gunwale
    const buildShell = (scaleX, yShift, flipWinding) => {
      const baseV = positions.length / 3
      for (let i = 0; i <= stations; i += 1) {
        const u = i / stations
        const z = (u - 0.5) * length
        const taper = Math.pow(Math.sin(u * Math.PI), 0.66)
        const w = maxHalfBeam * taper * scaleX
        const sheer = Math.pow(2 * u - 1, 2)
        const yBot = 0.02 + 0.16 * sheer + yShift
        const yTop = 0.45 + 0.18 * sheer + yShift * 0.4
        const yChine = lerp(yBot, yTop, 0.28)
        const pts = [
          [-w, yTop, z],
          [-w * 0.68, yChine, z],
          [0, yBot, z],
          [w * 0.68, yChine, z],
          [w, yTop, z]
        ]
        for (let k = 0; k < 5; k += 1) positions.push(pts[k][0], pts[k][1], pts[k][2])
      }
      for (let i = 0; i < stations; i += 1) {
        for (let k = 0; k < 4; k += 1) {
          const a = baseV + i * 5 + k
          const b = a + 1
          const c = a + 5
          const d = c + 1
          if (flipWinding) {
            indices.push(a, c, b, b, c, d)
          } else {
            indices.push(a, b, c, b, d, c)
          }
        }
      }
      return baseV
    }

    const outerBase = buildShell(1.0, 0.0, false)
    const innerBase = buildShell(0.89, 0.045, true)

    // Connect outer gunwale rim to inner gunwale rim on both port (k=0) and starboard (k=4)
    for (let i = 0; i < stations; i += 1) {
      const oP0 = outerBase + i * 5
      const oP1 = oP0 + 5
      const iP0 = innerBase + i * 5
      const iP1 = iP0 + 5
      indices.push(oP0, oP1, iP0, oP1, iP1, iP0)

      const oS0 = outerBase + i * 5 + 4
      const oS1 = oS0 + 5
      const iS0 = innerBase + i * 5 + 4
      const iS1 = iS0 + 5
      indices.push(oS0, iS0, oS1, oS1, iS0, iS1)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }

  // Swept Upturned East-Asian Pavilion Roof (curved hipped eaves flaring gracefully upward at the 4 corners!)
  const buildCurvedEaveRoofGeometry = (THREE, halfW, halfD, height, cornerFlare) => {
    const rings = 5
    const segsPerSide = 4
    const perRing = segsPerSide * 4
    const positions = []
    const indices = []

    // Apex vertex
    positions.push(0, height, 0)

    for (let r = 1; r <= rings; r += 1) {
      const t = r / rings // 0 = apex, 1 = outer eave
      // Concave swooping roof slope + lifted corner flare!
      const baseSag = Math.pow(t, 1.32)
      for (let side = 0; side < 4; side += 1) {
        for (let s = 0; s < segsPerSide; s += 1) {
          const f = (s / segsPerSide) * 2 - 1 // -1..+1 along side
          let sx = 0, sz = 0
          if (side === 0) { sx = f; sz = 1 }
          else if (side === 1) { sx = 1; sz = -f }
          else if (side === 2) { sx = -f; sz = -1 }
          else { sx = -1; sz = f }
          const cornerness = Math.pow(Math.max(Math.abs(sx), Math.abs(sz)) * Math.min(Math.abs(sx), Math.abs(sz)), 0.7)
          const flareLift = cornerFlare * Math.pow(t, 2.6) * (0.28 + 0.72 * cornerness)
          const x = sx * halfW * t * (1 + 0.08 * cornerness * t)
          const z = sz * halfD * t * (1 + 0.08 * cornerness * t)
          const y = height * (1 - baseSag) + flareLift
          positions.push(x, y, z)
        }
      }
    }

    // Top fan
    for (let k = 0; k < perRing; k += 1) {
      const next = (k + 1) % perRing
      indices.push(0, 1 + next, 1 + k)
    }
    // Side rings
    for (let r = 0; r < rings - 1; r += 1) {
      const rowA = 1 + r * perRing
      const rowB = 1 + (r + 1) * perRing
      for (let k = 0; k < perRing; k += 1) {
        const next = (k + 1) % perRing
        indices.push(rowA + k, rowA + next, rowB + k)
        indices.push(rowA + next, rowB + next, rowB + k)
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }

  const buildTerrainGeometry = THREE => {
    const geom = new THREE.PlaneGeometry(440, 270, 190, 135)
    geom.rotateX(-Math.PI / 2)
    geom.translate(0, 0, -90)
    const pos = geom.attributes.position
    for (let i = 0; i < pos.count; i += 1) {
      pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)))
    }
    geom.computeVertexNormals()
    return geom
  }

  const buildWaterGeometry = THREE => {
    const geom = new THREE.PlaneGeometry(380, 240, 120, 85)
    geom.rotateX(-Math.PI / 2)
    geom.translate(0, 0, -72)
    const pos = geom.attributes.position
    const depths = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i += 1) {
      depths[i] = Math.max(0, -getTerrainHeight(pos.getX(i), pos.getZ(i)))
    }
    geom.setAttribute('aWaterDepth', new THREE.BufferAttribute(depths, 1))
    return geom
  }

  const makeArchitectMat = (THREE, baseUniforms, rgb, allowSnow, isInstanced, doubleSide) => new THREE.ShaderMaterial({
    vertexShader: isInstanced ? INSTANCED_ARCHITECT_VERT : ARCHITECT_VERT,
    fragmentShader: ARCHITECT_FRAG,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: Object.assign({}, baseUniforms, {
      uBaseColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
      uAllowSnow: { value: allowSnow ? 1.0 : 0.0 }
    })
  })

  // Refined Wooden Lakeside Pier + Lantern + Sculpted Open Hollow Rowboat + Catenary Sagging Mooring Rope!
  const buildPierLanternAndBoat = (THREE, baseUniforms, glowTex) => {
    const group = new THREE.Group()
    group.position.set(12.2, 0, 20.0)
    group.rotation.y = 0.56

    const woodLightMat = makeArchitectMat(THREE, baseUniforms, [0.42, 0.31, 0.23], true, false, false)
    const woodDarkMat = makeArchitectMat(THREE, baseUniforms, [0.24, 0.17, 0.13], true, false, true)
    const woodDeepMat = makeArchitectMat(THREE, baseUniforms, [0.14, 0.10, 0.08], false, false, false)
    const ironDarkMat = makeArchitectMat(THREE, baseUniforms, [0.14, 0.16, 0.19], true, false, true)

    const plankGeom = new THREE.BoxGeometry(2.38, 0.11, 0.42)
    for (let i = 0; i < 25; i += 1) {
      const plank = new THREE.Mesh(plankGeom, i % 3 === 0 ? woodDarkMat : woodLightMat)
      plank.position.set((seededRand() - 0.5) * 0.035, 0.56 + (seededRand() - 0.5) * 0.01, 2.0 - i * 0.51)
      group.add(plank)
    }

    const beamGeom = new THREE.BoxGeometry(0.14, 0.16, 13.0)
    for (const side of [-0.95, 0.95]) {
      const beam = new THREE.Mesh(beamGeom, woodDarkMat)
      beam.position.set(side, 0.44, -4.2)
      group.add(beam)
    }

    const postGeom = new THREE.CylinderGeometry(0.11, 0.125, 3.0, 10)
    const capGeom = new THREE.CylinderGeometry(0.13, 0.13, 0.07, 10)
    for (let z = 1.6; z >= -10.4; z -= 2.4) {
      for (const side of [-1.06, 1.06]) {
        const topH = z < -9.5 ? 1.18 : 1.02
        const post = new THREE.Mesh(postGeom, woodDarkMat)
        post.position.set(side, topH - 1.5, z)
        group.add(post)

        const cap = new THREE.Mesh(capGeom, ironDarkMat)
        cap.position.set(side, topH + 0.03, z)
        group.add(cap)
      }
    }

    const ropeGeom = new THREE.CylinderGeometry(0.025, 0.025, 2.42, 6)
    ropeGeom.rotateX(Math.PI / 2)
    for (let z = 0.4; z >= -9.2; z -= 2.4) {
      const rope = new THREE.Mesh(ropeGeom, woodLightMat)
      rope.position.set(1.06, 0.92, z)
      group.add(rope)
    }

    // Traditional Lakeside Lantern Post (行灯)
    const lampGroup = new THREE.Group()
    lampGroup.position.set(-1.02, 0.56, -10.2)

    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.78, 8), ironDarkMat)
    stand.position.y = 0.89
    lampGroup.add(stand)

    const baseCollar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), ironDarkMat)
    baseCollar.position.y = 1.54
    lampGroup.add(baseCollar)

    const roof = new THREE.Mesh(buildCurvedEaveRoofGeometry(THREE, 0.36, 0.36, 0.24, 0.05), ironDarkMat)
    roof.position.y = 1.92
    lampGroup.add(roof)

    const lampCoreMat = new THREE.MeshBasicMaterial({ color: 0xffd594 })
    const lampCore = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.36, 0.27), lampCoreMat)
    lampCore.position.y = 1.74
    lampGroup.add(lampCore)

    const haloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb454,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const lampHalo = new THREE.Sprite(haloMat)
    lampHalo.scale.set(4.6, 4.6, 1)
    lampHalo.position.y = 1.74
    lampGroup.add(lampHalo)

    group.add(lampGroup)

    // Authentic Open Hollow Wooden Rowboat moored beside the tip of the pier!
    const boatGroup = new THREE.Group()
    boatGroup.position.set(-3.05, 0.02, -9.4)
    boatGroup.rotation.y = -0.26

    // True hollow curved plank hull with thick wooden gunwale rim
    const openHull = new THREE.Mesh(buildOpenRowboatGeometry(THREE), woodDarkMat)
    boatGroup.add(openHull)

    // Darkened wet wooden floorboards lining the open bilge cavity
    for (const fx of [-0.22, 0.0, 0.22]) {
      const floorPlank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 2.05), woodDeepMat)
      floorPlank.position.set(fx, 0.11, 0.0)
      boatGroup.add(floorPlank)
    }

    // Two weathered cedar thwart benches spanning across the open hollow interior
    const midBench = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.055, 0.28), woodLightMat)
    midBench.position.set(0, 0.36, 0.05)
    boatGroup.add(midBench)

    const sternBench = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.26), woodLightMat)
    sternBench.position.set(0, 0.38, -0.86)
    boatGroup.add(sternBench)

    const bowSeat = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.055, 0.28), woodLightMat)
    bowSeat.position.set(0, 0.42, 0.98)
    boatGroup.add(bowSeat)

    // Sculpted 2-piece wooden oar (slender shaft + flat paddle blade) resting diagonally inside the open boat!
    const oarGroup = new THREE.Group()
    oarGroup.position.set(0.24, 0.43, -0.05)
    oarGroup.rotation.y = 0.20
    oarGroup.rotation.z = -0.04
    const oarShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 2.15, 6), woodLightMat)
    oarShaft.rotation.x = Math.PI / 2
    oarGroup.add(oarShaft)
    const oarBlade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.62), woodLightMat)
    oarBlade.position.set(0, 0, -1.24)
    oarGroup.add(oarBlade)
    boatGroup.add(oarGroup)

    group.add(boatGroup)

    // Natural gravity-sagging catenary mooring rope connecting pier piling (-1.06, 0.92, -8.0) to boat bow!
    const bowWorldInPier = new THREE.Vector3(
      -3.05 + Math.sin(-0.26) * 1.68,
      0.56,
      -9.4 + Math.cos(-0.26) * 1.68
    )
    const ropeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.06, 0.90, -8.0),
      new THREE.Vector3(-1.72, 0.48, -7.92),
      new THREE.Vector3(-2.52, 0.34, -7.84),
      bowWorldInPier
    ])
    const catenaryRope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 16, 0.017, 5, false), woodLightMat)
    group.add(catenaryRope)

    group.updateMatrixWorld(true)
    const lampWorldPos = new THREE.Vector3(0, 1.74, 0)
    lampGroup.localToWorld(lampWorldPos)

    return { group, boatGroup, lampCoreMat, haloMat, lampWorldPos }
  }

  // Graceful Traditional Lakeside Sanctuary Pavilion (水榭茶亭) on unobstructed left-bay promontory (-23.5, -39.5)!
  const buildDistantPavilion = (THREE, baseUniforms, glowTex) => {
    const group = new THREE.Group()
    const baseY = getTerrainHeight(-23.5, -39.5)
    group.position.set(-23.5, baseY - 0.12, -39.5)
    group.rotation.y = 0.48

    const darkRoofMat = makeArchitectMat(THREE, baseUniforms, [0.15, 0.17, 0.21], true, false, true)
    const stoneMat = makeArchitectMat(THREE, baseUniforms, [0.24, 0.26, 0.30], true, false, false)
    const timberMat = makeArchitectMat(THREE, baseUniforms, [0.26, 0.18, 0.13], true, false, false)
    const plasterMat = makeArchitectMat(THREE, baseUniforms, [0.64, 0.60, 0.54], false, false, false)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xdfd4c0, side: THREE.DoubleSide })

    // Stone plinth foundation anchoring into the rocky headland
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.3, 4.6), stoneMat)
    plinth.position.y = 0.15
    group.add(plinth)

    // Timber veranda deck overhanging the stone base + low lakeside railing
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.24, 5.2), timberMat)
    deck.position.y = 0.90
    group.add(deck)

    // Front & side veranda balustrade railings
    const railFront = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.09, 0.10), timberMat)
    railFront.position.set(0, 1.56, 2.48)
    group.add(railFront)
    for (const rx of [-2.95, -1.5, 0.0, 1.5, 2.95]) {
      const baluster = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.68, 0.11), timberMat)
      baluster.position.set(rx, 1.24, 2.48)
      group.add(baluster)
    }

    // 4 slender outer veranda pillars supporting the sweeping lower eave
    for (const px of [-2.8, 2.8]) {
      for (const pz of [-2.2, 2.2]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 2.45, 8), timberMat)
        col.position.set(px, 2.15, pz)
        group.add(col)
      }
    }

    // Main timber & warm plaster tea-house body
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.35, 3.4), plasterMat)
    body.position.y = 2.18
    group.add(body)

    // Warm Shoji Paper Window + Dark Wooden Kumiko Lattice Mullion Bars!
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 1.28), winMat)
    windowPane.position.set(0, 2.15, 1.72)
    group.add(windowPane)

    for (const mx of [-0.9, 0.0, 0.9]) {
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.32, 0.06), timberMat)
      vBar.position.set(mx, 2.15, 1.74)
      group.add(vBar)
    }
    for (const my of [1.78, 2.15, 2.52]) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(2.82, 0.065, 0.06), timberMat)
      hBar.position.set(0, my, 1.74)
      group.add(hBar)
    }

    // Swept Double-Eave Curved East-Asian Slate Roof (upturned corner finials!)
    const lowerRoof = new THREE.Mesh(buildCurvedEaveRoofGeometry(THREE, 4.15, 3.45, 1.48, 0.36), darkRoofMat)
    lowerRoof.position.y = 3.22
    group.add(lowerRoof)

    const upperWall = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.65, 1.95), timberMat)
    upperWall.position.y = 4.38
    group.add(upperWall)

    const upperRoof = new THREE.Mesh(buildCurvedEaveRoofGeometry(THREE, 2.65, 2.15, 1.18, 0.28), darkRoofMat)
    upperRoof.position.y = 4.58
    group.add(upperRoof)

    // Roof ridge beam + finial spire
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 0.16), darkRoofMat)
    ridgeBeam.position.y = 5.76
    group.add(ridgeBeam)

    // Tiny warm eaves lantern hanging from front right porch corner
    const eaveLamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), winMat)
    eaveLamp.position.set(2.35, 2.75, 2.18)
    group.add(eaveLamp)

    const pavGlowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb454,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const pavGlow = new THREE.Sprite(pavGlowMat)
    pavGlow.scale.set(9.2, 5.8, 1)
    pavGlow.position.set(0.4, 2.18, 2.1)
    group.add(pavGlow)

    group.updateMatrixWorld(true)
    const pavLampWorldPos = new THREE.Vector3(0, 2.15, 1.8)
    group.localToWorld(pavLampWorldPos)

    return { group, winMat, pavGlowMat, pavLampWorldPos }
  }

  /* ==========================================================================
     Lightweight Instant Fallback WebGL
     ========================================================================== */
  const RAW_FALLBACK_VERT = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `
  const RAW_FALLBACK_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform vec3 uZenithCol;
    uniform vec3 uMidSkyCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uWaterCol;
    void main() {
      float hY = 0.34;
      if (vUv.y < hY) {
        float d = (hY - vUv.y) / hY;
        gl_FragColor = vec4(mix(uHorizonCol, uWaterCol, pow(d, 0.65)), 1.0);
      } else {
        float t = (vUv.y - hY) / (1.0 - hY);
        vec3 lo = mix(uHorizonCol, uMidSkyCol, smoothstep(0.0, 0.4, t));
        gl_FragColor = vec4(mix(lo, uZenithCol, smoothstep(0.3, 1.0, t)), 1.0);
      }
    }
  `

  let rawGl = null
  let rawProg = null
  let rawLocs = null

  const initRawFallback = () => {
    try {
      const gl = bgCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false })
      if (!gl) return false
      const compile = (type, src) => {
        const sh = gl.createShader(type)
        gl.shaderSource(sh, src)
        gl.compileShader(sh)
        return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null
      }
      const vs = compile(gl.VERTEX_SHADER, RAW_FALLBACK_VERT)
      const fs = compile(gl.FRAGMENT_SHADER, RAW_FALLBACK_FRAG)
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
      const loc = gl.getAttribLocation(prog, 'position')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      rawGl = gl
      rawProg = prog
      rawLocs = {
        uZenithCol: gl.getUniformLocation(prog, 'uZenithCol'),
        uMidSkyCol: gl.getUniformLocation(prog, 'uMidSkyCol'),
        uHorizonCol: gl.getUniformLocation(prog, 'uHorizonCol'),
        uWaterCol: gl.getUniformLocation(prog, 'uWaterCol')
      }
      return true
    } catch (e) {
      return false
    }
  }

  /* ==========================================================================
     Main Three.js 3D Scene Assembly & HD MSAA Planar Reflection Loop
     ========================================================================== */
  let threeRenderer = null
  let threeScene = null
  let threeCamera = null
  let reflectionCamera = null
  let reflectionRT = null
  let waterMesh = null
  let grassMesh = null
  let starPoints = null
  let pierRig = null
  let pavilionRig = null
  let sharedUniforms = null
  let waterUniforms = null
  let starUniforms = null
  let mistUniforms = null
  let threeLoading = false
  let raycaster = null
  let waterPlane3D = null

  const initThreeScene = () => {
    if (!window.THREE || threeRenderer) return false
    try {
      const THREE = window.THREE
      const threeCanvas = document.createElement('canvas')
      threeCanvas.id = 'theme-sanctuary-webgl'
      threeCanvas.className = 'theme-sanctuary-webgl'
      threeCanvas.setAttribute('aria-hidden', 'true')
      threeCanvas.setAttribute('data-engine', 'three.js r' + THREE.REVISION)

      const renderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance'
      })
      renderer.setPixelRatio(bgDpr)
      renderer.setSize(width || window.innerWidth, height || window.innerHeight, false)
      renderer.autoClear = true

      const scene = new THREE.Scene()
      const aspect = (width || 1) / Math.max(1, height || 1)
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 720)
      camera.position.set(0, 5.4, 34.0)
      camera.lookAt(0, 4.6, -75.0)

      reflectionCamera = new THREE.PerspectiveCamera(45, aspect, 0.5, 720)
      const isWebGL2 = Boolean(renderer.capabilities && renderer.capabilities.isWebGL2)
      // 768x768 4x MSAA planar reflection: crisp mirrored landscape while restoring locked 60 FPS in Rain & Night!
      reflectionRT = new THREE.WebGLRenderTarget(768, 768, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        samples: isWebGL2 ? 4 : 0
      })

      raycaster = new THREE.Raycaster()
      waterPlane3D = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

      const detailTex = createDetailDataTexture(THREE)
      const cloudTex = createCloudPuffTexture(THREE)
      const leafTex = createBroadleafCardTexture(THREE)
      const pineTex = createPineBoughTexture(THREE)
      const glowTex = createSoftGlowTexture(THREE)

      const pal = computeFramePalette()
      sharedUniforms = {
        uTime: { value: 0 },
        uSeason: { value: worldState.season },
        uWindSpeed: { value: worldState.windSpeed },
        uCloudCover: { value: worldState.cloudCover },
        uDayFactor: { value: pal.dayFactor },
        uTwilightFactor: { value: pal.twilightFactor },
        uNightFactor: { value: pal.nightFactor },
        uRainFactor: { value: pal.rainFactor },
        uFogFactor: { value: pal.fogFactor },
        uSnowFactor: { value: pal.snowFactor },
        uLampGlow: { value: pal.lampGlow },
        uClipBelowWater: { value: 0.0 },
        uDetailTex: { value: detailTex },
        uLeafTex: { value: leafTex },
        uPineTex: { value: pineTex },
        uZenithCol: { value: new THREE.Vector3(...pal.zenith) },
        uMidSkyCol: { value: new THREE.Vector3(...pal.midSky) },
        uHorizonCol: { value: new THREE.Vector3(...pal.horizon) },
        uSunCol: { value: new THREE.Vector3(...pal.sunColor) },
        uDirectCol: { value: new THREE.Vector3(...pal.directCol) },
        uAmbientCol: { value: new THREE.Vector3(...pal.ambientCol) },
        uWaterCol: { value: new THREE.Vector3(...pal.waterDeep) },
        uSunDir: { value: new THREE.Vector3(...pal.sunDir) },
        uMoonDir: { value: new THREE.Vector3(...pal.moonDir) },
        uLampPos: { value: new THREE.Vector3(6.5, 2.3, 11.2) },
        uPavLampPos: { value: new THREE.Vector3(-23.5, 3.8, -39.5) }
      }

      // Pier, Lantern, Open Rowboat & Unobstructed Lakeside Pavilion
      pierRig = buildPierLanternAndBoat(THREE, sharedUniforms, glowTex)
      sharedUniforms.uLampPos.value.copy(pierRig.lampWorldPos)
      scene.add(pierRig.group)

      pavilionRig = buildDistantPavilion(THREE, sharedUniforms, glowTex)
      sharedUniforms.uPavLampPos.value.copy(pavilionRig.pavLampWorldPos)
      scene.add(pavilionRig.group)

      // 1. 3D Physical Sky Dome
      const skyDome = new THREE.Mesh(
        new THREE.SphereGeometry(480, 48, 32),
        new THREE.ShaderMaterial({
          vertexShader: SKY_DOME_VERT,
          fragmentShader: SKY_DOME_FRAG,
          uniforms: sharedUniforms,
          side: THREE.BackSide,
          depthWrite: false
        })
      )
      skyDome.renderOrder = 0
      scene.add(skyDome)

      // 2. 3,200 3D Celestial Stars with Dense Diagonal Milky Way Concentration!
      const starCount = 3200
      const sPos = new Float32Array(starCount * 3)
      const sSize = new Float32Array(starCount)
      const sPhase = new Float32Array(starCount)
      const sCol = new Float32Array(starCount * 3)
      const sTints = [[0.76, 0.88, 1.0], [1.0, 0.98, 0.94], [0.68, 0.82, 1.0], [1.0, 0.88, 0.72]]
      for (let i = 0; i < starCount; i += 1) {
        let dirX, dirY, dirZ
        if (i < 1650) {
          // Concentrate 52% of stars naturally along the tilted Milky Way galactic band across the northern sky!
          const bandT = (seededRand() - 0.5) * 2.1
          const scatter = (seededRand() + seededRand() - 1.0) * 0.24
          dirX = bandT
          dirY = clamp(0.34 - bandT * 0.68 + scatter, 0.04, 0.96)
          dirZ = -Math.sqrt(Math.max(0.08, 1.0 - Math.min(0.92, dirX * dirX * 0.45 + dirY * dirY * 0.65)))
          const len = Math.hypot(dirX, dirY, dirZ) || 1
          dirX /= len; dirY /= len; dirZ /= len
        } else {
          const theta = seededRand() * Math.PI * 2
          const phi = Math.acos(0.04 + seededRand() * 0.95)
          dirX = Math.sin(phi) * Math.cos(theta)
          dirY = Math.cos(phi)
          dirZ = Math.sin(phi) * Math.sin(theta)
        }
        const r = 415
        sPos[i * 3] = dirX * r
        sPos[i * 3 + 1] = dirY * r
        sPos[i * 3 + 2] = dirZ * r
        sSize[i] = 1.2 + Math.pow(seededRand(), 2.8) * 4.4
        sPhase[i] = seededRand() * Math.PI * 2
        const tint = sTints[(seededRand() * sTints.length) | 0]
        sCol[i * 3] = tint[0]
        sCol[i * 3 + 1] = tint[1]
        sCol[i * 3 + 2] = tint[2]
      }
      const starGeom = new THREE.BufferGeometry()
      starGeom.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
      starGeom.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1))
      starGeom.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1))
      starGeom.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3))
      starUniforms = {
        uTime: sharedUniforms.uTime,
        uPixelRatio: { value: bgDpr },
        uStarVis: { value: 0 }
      }
      starPoints = new THREE.Points(
        starGeom,
        new THREE.ShaderMaterial({
          vertexShader: STAR_VERT,
          fragmentShader: STAR_FRAG,
          uniforms: starUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      )
      starPoints.renderOrder = 1
      scene.add(starPoints)

      // 3. Elevated 3D Volumetric Cumulus Cloud Deck (soaring ABOVE & BEHIND the alpine peaks!)
      const puffCount = 132
      const puffOffsets = new Float32Array(puffCount * 3)
      const puffScales = new Float32Array(puffCount * 3)
      const puffPhases = new Float32Array(puffCount)
      const puffShades = new Float32Array(puffCount)
      const clusterCenters = [
        [-155, 58, -238, 1.32],
        [-84, 64, -228, 1.22],
        [-16, 68, -252, 1.38],
        [52, 62, -234, 1.24],
        [124, 58, -224, 1.18],
        [-125, 48, -172, 0.92],
        [105, 50, -176, 0.95],
        [-28, 56, -205, 1.02],
        [176, 60, -242, 1.20],
        [-192, 56, -210, 1.12]
      ]
      let pIdx = 0
      for (let c = 0; c < clusterCenters.length; c += 1) {
        const [cx, cy, cz, cs] = clusterCenters[c]
        const puffsInCluster = c < 2 ? 14 : 13
        for (let k = 0; k < puffsInCluster && pIdx < puffCount; k += 1) {
          const spreadX = (seededRand() - 0.5) * 52 * cs
          const domeRise = Math.max(0, 1 - Math.abs(spreadX) / (30 * cs)) * seededRand() * 18 * cs
          puffOffsets[pIdx * 3] = cx + spreadX
          puffOffsets[pIdx * 3 + 1] = cy + domeRise
          puffOffsets[pIdx * 3 + 2] = cz + (seededRand() - 0.5) * 22
          const wScale = (24 + seededRand() * 28) * cs
          const hScale = wScale * (0.64 + seededRand() * 0.24)
          puffScales[pIdx * 3] = wScale
          puffScales[pIdx * 3 + 1] = hScale
          puffScales[pIdx * 3 + 2] = 0.65 + seededRand() * 0.65
          puffPhases[pIdx] = seededRand() * Math.PI * 2
          puffShades[pIdx] = clamp(0.28 + (domeRise / (18 * cs)) * 0.72, 0.15, 1.0)
          pIdx += 1
        }
      }
      const cloudQuad = new THREE.PlaneGeometry(1, 1)
      cloudQuad.setAttribute('aOffset', new THREE.InstancedBufferAttribute(puffOffsets, 3))
      cloudQuad.setAttribute('aScale', new THREE.InstancedBufferAttribute(puffScales, 3))
      cloudQuad.setAttribute('aPhase', new THREE.InstancedBufferAttribute(puffPhases, 1))
      cloudQuad.setAttribute('aShade', new THREE.InstancedBufferAttribute(puffShades, 1))

      const cloudMat = new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: Object.assign({}, sharedUniforms, { uCloudTex: { value: cloudTex } }),
        transparent: true,
        depthWrite: false
      })
      const cloudInstanced = new THREE.InstancedMesh(cloudQuad, cloudMat, puffCount)
      cloudInstanced.frustumCulled = false
      cloudInstanced.renderOrder = 2
      scene.add(cloudInstanced)

      // 4. 3D Sculpted Alpine Terrain Basin Mesh
      const terrainMesh = new THREE.Mesh(
        buildTerrainGeometry(THREE),
        new THREE.ShaderMaterial({
          vertexShader: TERRAIN_VERT,
          fragmentShader: TERRAIN_FRAG,
          uniforms: sharedUniforms
        })
      )
      terrainMesh.renderOrder = 3
      scene.add(terrainMesh)

      // 5. 1,820+ Organic Botanical 3D Trees & Lakeside Shrubs (with guaranteed unobstructed Pavilion sightline!)
      const treeMat = new THREE.ShaderMaterial({
        vertexShader: TREE_VERT,
        fragmentShader: TREE_FRAG,
        uniforms: sharedUniforms,
        side: THREE.DoubleSide
      })

      // Distance from point (x,z) to camera(0,34)->pavilion(-23.5,-39.5) sightline corridor
      const isBlockingPavilionSightline = (x, z) => {
        if (Math.hypot(x + 23.5, z + 39.5) < 6.4) return true
        if (z < -41.0 || z > 32.0) return false
        const t = clamp((34.0 - z) / 73.5, 0, 1)
        const rayX = -23.5 * t
        return Math.abs(x - rayX) < (7.6 + (1.0 - t) * 2.2)
      }

      const populateForest = (geom, maxCount, kindId, yMin, yMax, zMin, zMax, heroSpots, scaleRange) => {
        const matrices = []
        const tones = []
        const phases = []
        const dummy = new THREE.Object3D()

        if (Array.isArray(heroSpots)) {
          for (let h = 0; h < heroSpots.length; h += 1) {
            const [hx, hz, hs, hTone] = heroSpots[h]
            const hy = getTerrainHeight(hx, hz)
            dummy.position.set(hx, hy - 0.32, hz)
            dummy.rotation.set(0, seededRand() * Math.PI * 2, 0)
            dummy.scale.set(hs, hs * 1.04, hs)
            dummy.updateMatrix()
            matrices.push(dummy.matrix.clone())
            tones.push(hTone)
            phases.push(seededRand() * Math.PI * 2)
          }
        }

        let attempts = 0
        while (matrices.length < maxCount && attempts < maxCount * 22) {
          attempts += 1
          const x = (seededRand() - 0.5) * 240
          const z = zMin + seededRand() * (zMax - zMin)
          if (z > 14 && Math.abs(x) < 16) continue
          if (Math.hypot(x - 11.5, z - 17.0) < 5.5) continue
          if (isBlockingPavilionSightline(x, z)) continue

          const y = getTerrainHeight(x, z)
          if (y < yMin || y > yMax) continue
          const hX = getTerrainHeight(x + 1.2, z)
          const hZ = getTerrainHeight(x, z + 1.2)
          if (Math.hypot(hX - y, hZ - y) > 1.35) continue

          const sMin = scaleRange ? scaleRange[0] : (kindId === 0 ? 0.88 : 0.96)
          const sSpan = scaleRange ? scaleRange[1] : (kindId === 0 ? 1.18 : 1.06)
          const sBase = sMin + seededRand() * sSpan
          // Ground distant trees slightly deeper into slope so trunks never appear floating on hillsides!
          const embedY = z < -55 ? 0.46 : 0.30
          dummy.position.set(x, y - embedY, z)
          dummy.rotation.set((seededRand() - 0.5) * 0.08, seededRand() * Math.PI * 2, (seededRand() - 0.5) * 0.08)
          dummy.scale.set(sBase, sBase * (0.88 + seededRand() * 0.36), sBase)
          dummy.updateMatrix()
          matrices.push(dummy.matrix.clone())
          tones.push(seededRand())
          phases.push(seededRand() * Math.PI * 2)
        }

        const count = matrices.length
        geom.setAttribute('aTreeKind', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(kindId), 1))
        geom.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(tones), 1))
        geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1))

        const mesh = new THREE.InstancedMesh(geom, treeMat, count)
        for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, matrices[i])
        mesh.instanceMatrix.needsUpdate = true
        mesh.renderOrder = 4
        scene.add(mesh)
        return mesh
      }

      const heroBroadleafSpots = [
        // Left foreground edge frame (shifted outward so sightline to lakeside pavilion stays 100% open!)
        [-25.2, 13.8, 1.92, 0.76],
        [-28.8, 9.8, 1.68, 0.36],
        [-22.2, 18.8, 1.48, 0.88],
        // Right foreground pier framing
        [18.2, 17.5, 1.72, 0.65],
        [22.5, 14.2, 1.88, 0.28],
        // Framing the lakeside sanctuary pavilion (-23.5, -39.5) on dry island earth on both left & right!
        [-28.6, -40.2, 1.85, 0.84],
        [-27.2, -43.2, 1.78, 0.40],
        [-19.3, -41.8, 1.56, 0.72],
        // Right peninsula lush colorful grove
        [33.0, -42.0, 2.15, 0.78],
        [38.5, -46.0, 1.98, 0.32],
        [29.5, -47.0, 1.75, 0.62],
        [43.0, -39.0, 1.92, 0.88]
      ]

      populateForest(buildOrganicPineGeometry(THREE), 900, 0, 0.88, 22.5, -118, 22, null)
      populateForest(buildOrganicBroadleafGeometry(THREE), 700, 1, 0.72, 14.5, -104, 23, heroBroadleafSpots)
      // 220 low shoreline mossy/flowering shrubs bridging wet shoreline banks, boulders & tree trunks
      populateForest(buildOrganicShrubGeometry(THREE), 220, 1, 0.35, 3.2, -92, 23, null, [0.75, 0.75])

      // 6. Instanced Angular Shoreline Boulders (scattered naturally along real wet lake shores!)
      const rockGeom = new THREE.DodecahedronGeometry(0.9, 0)
      const rPos = rockGeom.attributes.position
      for (let i = 0; i < rPos.count; i += 1) {
        const vx = rPos.getX(i), vy = rPos.getY(i), vz = rPos.getZ(i)
        const n = 0.78 + hashInt2(Math.round(vx * 10), Math.round(vz * 10), 401) * 0.44
        rPos.setXYZ(i, vx * n, vy * (0.72 + n * 0.25), vz * n)
      }
      rockGeom.computeVertexNormals()
      const rockMat = makeArchitectMat(THREE, sharedUniforms, [0.24, 0.27, 0.32], true, true, false)
      const rockDummy = new THREE.Object3D()
      const rockMatrices = []
      for (let i = 0; i < 720 && rockMatrices.length < 62; i += 1) {
        const x = (seededRand() - 0.5) * 140
        const z = -92.0 + seededRand() * 116.0
        if (Math.hypot(x - 11.0, z - 17.0) < 5.0) continue
        const y = getTerrainHeight(x, z)
        // Place strictly right along the natural wet shoreline (-0.25m to +0.85m)!
        if (y < -0.25 || y > 0.85) continue
        rockDummy.position.set(x, y - 0.14, z)
        rockDummy.rotation.set(seededRand() * 3, seededRand() * 3, seededRand() * 3)
        rockDummy.scale.set(0.65 + seededRand() * 1.4, 0.40 + seededRand() * 0.65, 0.65 + seededRand() * 1.35)
        rockDummy.updateMatrix()
        rockMatrices.push(rockDummy.matrix.clone())
      }
      if (rockMatrices.length > 0) {
        const rockMesh = new THREE.InstancedMesh(rockGeom, rockMat, rockMatrices.length)
        for (let i = 0; i < rockMatrices.length; i += 1) rockMesh.setMatrixAt(i, rockMatrices[i])
        rockMesh.instanceMatrix.needsUpdate = true
        scene.add(rockMesh)
      }

      // 7. Graceful Curved Multi-Blade Shoreline Reeds & Meadow Grass Tufts (680 tufts = 3,400 arched blades!)
      const bladeGeom = buildCurvedGrassTuftGeometry(THREE)
      const grassMatrices = []
      const grassPhases = []
      const grassTones = []
      const gDummy = new THREE.Object3D()
      for (let i = 0; i < 3400 && grassMatrices.length < 680; i += 1) {
        const x = (seededRand() - 0.5) * 135
        const z = -72.0 + seededRand() * 98.0
        if (z > 14 && Math.abs(x) < 14) continue
        if (Math.hypot(x + 23.5, z + 39.5) < 4.5) continue
        const y = getTerrainHeight(x, z)
        if (y < 0.02 || y > 2.2) continue
        gDummy.position.set(x, y - 0.08, z)
        gDummy.rotation.set((seededRand() - 0.5) * 0.14, seededRand() * Math.PI * 2, (seededRand() - 0.5) * 0.14)
        const sc = 0.54 + seededRand() * 0.72
        gDummy.scale.set(sc, sc * (0.70 + seededRand() * 0.55), sc)
        gDummy.updateMatrix()
        grassMatrices.push(gDummy.matrix.clone())
        grassPhases.push(seededRand() * Math.PI * 2)
        grassTones.push(seededRand())
      }
      bladeGeom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(grassPhases), 1))
      bladeGeom.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(grassTones), 1))
      grassMesh = new THREE.InstancedMesh(
        bladeGeom,
        new THREE.ShaderMaterial({
          vertexShader: GRASS_VERT,
          fragmentShader: GRASS_FRAG,
          uniforms: sharedUniforms,
          side: THREE.DoubleSide
        }),
        grassMatrices.length
      )
      for (let i = 0; i < grassMatrices.length; i += 1) grassMesh.setMatrixAt(i, grassMatrices[i])
      grassMesh.instanceMatrix.needsUpdate = true
      scene.add(grassMesh)

      // 8. Drifting Alpine Mountain-Waist Mist Ribbon curling gently between the far forest & high peaks!
      mistUniforms = Object.assign({}, sharedUniforms, {
        uMistAlpha: { value: 0.16 }
      })
      const mistMat = new THREE.ShaderMaterial({
        vertexShader: MIST_VERT,
        fragmentShader: MIST_FRAG,
        uniforms: mistUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
      const mistPlane1 = new THREE.Mesh(new THREE.PlaneGeometry(330, 26), mistMat)
      mistPlane1.position.set(0, 14.5, -128)
      mistPlane1.renderOrder = 5
      scene.add(mistPlane1)

      // 9. 768x768 4x MSAA Real-Time Planar-Reflection 3D Mirror Lake (y = 0)
      const rippleVecs = []
      for (let i = 0; i < MAX_RIPPLES; i += 1) rippleVecs.push(new THREE.Vector4(0, 0, -999, 0))

      waterUniforms = Object.assign({}, sharedUniforms, {
        uReflectionTex: { value: reflectionRT.texture },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uRipples: { value: rippleVecs }
      })

      waterMesh = new THREE.Mesh(
        buildWaterGeometry(THREE),
        new THREE.ShaderMaterial({
          vertexShader: WATER_VERT,
          fragmentShader: WATER_FRAG,
          uniforms: waterUniforms
        })
      )
      waterMesh.position.y = 0
      waterMesh.renderOrder = 6
      scene.add(waterMesh)

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
    const totalPitch = clamp(camPitch + userLookPitch, -0.18, 0.24)
    const pal = computeFramePalette()

    if (threeRenderer && sharedUniforms && threeCamera) {
      sharedUniforms.uTime.value = elapsedSec
      sharedUniforms.uSeason.value = worldState.season
      sharedUniforms.uWindSpeed.value = worldState.windSpeed
      sharedUniforms.uCloudCover.value = worldState.cloudCover
      sharedUniforms.uDayFactor.value = pal.dayFactor
      sharedUniforms.uTwilightFactor.value = pal.twilightFactor
      sharedUniforms.uNightFactor.value = pal.nightFactor
      sharedUniforms.uRainFactor.value = pal.rainFactor
      sharedUniforms.uFogFactor.value = pal.fogFactor
      sharedUniforms.uSnowFactor.value = pal.snowFactor
      sharedUniforms.uLampGlow.value = pal.lampGlow
      sharedUniforms.uZenithCol.value.set(...pal.zenith)
      sharedUniforms.uMidSkyCol.value.set(...pal.midSky)
      sharedUniforms.uHorizonCol.value.set(...pal.horizon)
      sharedUniforms.uSunCol.value.set(...pal.sunColor)
      sharedUniforms.uDirectCol.value.set(...pal.directCol)
      sharedUniforms.uAmbientCol.value.set(...pal.ambientCol)
      sharedUniforms.uWaterCol.value.set(...pal.waterDeep)
      sharedUniforms.uSunDir.value.set(...pal.sunDir)
      sharedUniforms.uMoonDir.value.set(...pal.moonDir)

      if (pierRig) {
        const flicker = 0.94 + 0.06 * Math.sin(elapsedSec * 7.2 + Math.cos(elapsedSec * 12.4))
        pierRig.haloMat.opacity = pal.lampGlow * 0.92 * flicker
        const rC = lerp(0.76, 1.0, pal.lampGlow)
        const gC = lerp(0.74, 0.84, pal.lampGlow)
        const bC = lerp(0.68, 0.48, pal.lampGlow)
        pierRig.lampCoreMat.color.setRGB(rC, gC, bC)
        if (pierRig.boatGroup) {
          pierRig.boatGroup.position.y = 0.04 + Math.sin(elapsedSec * 1.45) * 0.045
          pierRig.boatGroup.rotation.z = Math.sin(elapsedSec * 1.15 + 0.8) * 0.038
          pierRig.boatGroup.rotation.x = Math.cos(elapsedSec * 1.32) * 0.025
        }
      }

      if (pavilionRig) {
        pavilionRig.pavGlowMat.opacity = pal.lampGlow * 0.82
        // Warm cream rice-paper shoji in daylight -> rich glowing golden amber at dusk, rain & night!
        const wR = lerp(0.84, 1.0, pal.lampGlow)
        const wG = lerp(0.80, 0.80, pal.lampGlow)
        const wB = lerp(0.70, 0.42, pal.lampGlow)
        pavilionRig.winMat.color.setRGB(wR, wG, wB)
      }

      if (starUniforms && starPoints) {
        starUniforms.uStarVis.value = pal.nightFactor * (1 - pal.rainFactor * 0.88)
        starPoints.rotation.y = (worldState.hour / 24) * Math.PI * 0.35
      }
      if (mistUniforms) {
        mistUniforms.uMistAlpha.value = clamp(0.10 + pal.rainFactor * 0.44 + pal.fogFactor * 0.45 + pal.twilightFactor * 0.12, 0.08, 0.62)
      }

      for (let i = 0; i < MAX_RIPPLES; i += 1) {
        const idx = i * 4
        waterUniforms.uRipples.value[i].set(
          rippleBuffer[idx],
          rippleBuffer[idx + 1],
          rippleBuffer[idx + 2],
          rippleBuffer[idx + 3]
        )
      }

      const camXPos = totalYaw * 14.0
      const camYPos = clamp(5.4 - camZoom * 1.4 + totalPitch * 3.5, 2.6, 8.8)
      const camZPos = 34.0 - camZoom * 11.5
      const lookX = totalYaw * -28.0
      const lookY = 4.6 + totalPitch * 22.0
      const lookZ = -75.0

      threeCamera.position.set(camXPos, camYPos, camZPos)
      threeCamera.lookAt(lookX, lookY, lookZ)
      threeCamera.updateMatrixWorld()

      // Pass 1: HD 1024x1024 MSAA Planar Reflection Pass
      reflectionCamera.aspect = threeCamera.aspect
      reflectionCamera.fov = threeCamera.fov
      reflectionCamera.updateProjectionMatrix()
      reflectionCamera.position.set(camXPos, -camYPos, camZPos)
      reflectionCamera.lookAt(lookX, -lookY, lookZ)
      reflectionCamera.updateMatrixWorld()

      waterUniforms.uReflectMatrix.value.multiplyMatrices(
        reflectionCamera.projectionMatrix,
        reflectionCamera.matrixWorldInverse
      )

      waterMesh.visible = false
      if (grassMesh) grassMesh.visible = false
      sharedUniforms.uClipBelowWater.value = 1.0

      threeRenderer.setRenderTarget(reflectionRT)
      threeRenderer.clear()
      threeRenderer.render(threeScene, reflectionCamera)
      threeRenderer.setRenderTarget(null)

      // Pass 2: Main 3D Scene Pass
      waterMesh.visible = true
      if (grassMesh) grassMesh.visible = true
      sharedUniforms.uClipBelowWater.value = 0.0

      threeRenderer.render(threeScene, threeCamera)
    } else if (rawGl && rawProg) {
      rawGl.viewport(0, 0, bgCanvas.width, bgCanvas.height)
      rawGl.useProgram(rawProg)
      rawGl.uniform3f(rawLocs.uZenithCol, pal.zenith[0], pal.zenith[1], pal.zenith[2])
      rawGl.uniform3f(rawLocs.uMidSkyCol, pal.midSky[0], pal.midSky[1], pal.midSky[2])
      rawGl.uniform3f(rawLocs.uHorizonCol, pal.horizon[0], pal.horizon[1], pal.horizon[2])
      rawGl.uniform3f(rawLocs.uWaterCol, pal.waterDeep[0], pal.waterDeep[1], pal.waterDeep[2])
      rawGl.drawArrays(rawGl.TRIANGLES, 0, 6)
    }
  }

  /* ==========================================================================
     True 3D Raycasting for Interactive Water Ripples & Draggable Sun / Moon
     ========================================================================== */
  const spawnWaterRippleAtScreen = (clientX, clientY, strength) => {
    if (!threeCamera || !raycaster || !waterPlane3D || !window.THREE) return false
    const w = width || window.innerWidth || 1
    const h = height || window.innerHeight || 1
    const ndcX = (clientX / w) * 2 - 1
    const ndcY = -(clientY / h) * 2 + 1
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, threeCamera)
    const hit = new window.THREE.Vector3()
    if (!raycaster.ray.intersectPlane(waterPlane3D, hit)) return false
    if (hit.z > 28 || hit.z < -120 || Math.abs(hit.x) > 135) return false
    if (getTerrainHeight(hit.x, hit.z) > 0.05) return false

    const nowSec = (performance.now() - startTime) * 0.001
    const idx = rippleCursor * 4
    rippleBuffer[idx] = hit.x
    rippleBuffer[idx + 1] = hit.z
    rippleBuffer[idx + 2] = nowSec
    rippleBuffer[idx + 3] = strength
    rippleCursor = (rippleCursor + 1) % MAX_RIPPLES
    return true
  }

  const isPointerNearCelestial = (clientX, clientY) => {
    if (!threeCamera || !raycaster) return false
    const w = width || window.innerWidth || 1
    const h = height || window.innerHeight || 1
    const ndcX = (clientX / w) * 2 - 1
    const ndcY = -(clientY / h) * 2 + 1
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, threeCamera)
    const rd = raycaster.ray.direction
    if (rd.y < 0.0) return false

    const pal = computeFramePalette()
    const dotSun = rd.x * pal.sunDir[0] + rd.y * pal.sunDir[1] + rd.z * pal.sunDir[2]
    const dotMoon = rd.x * pal.moonDir[0] + rd.y * pal.moonDir[1] + rd.z * pal.moonDir[2]
    if (pal.sunDir[1] > -0.10 && dotSun > 0.985) return true
    if (pal.nightFactor > 0.2 && dotMoon > 0.985) return true
    return false
  }

  /* ==========================================================================
     Soaring Distant Alpine Birds (Mild Clear Days Only) & Shooting Stars (Night)
     ========================================================================== */
  const initBirds = () => {
    birds.length = 0
    for (let i = 0; i < 5; i += 1) {
      birds.push({
        x: rand(0.14, 0.84),
        y: rand(0.18, 0.36),
        vx: rand(0.00016, 0.00028),
        vy: rand(-0.00003, 0.00003),
        span: rand(4.2, 7.0),
        phase: rand(0, Math.PI * 2),
        freq: rand(0.055, 0.085)
      })
    }
  }

  const updateAndDrawBirdsAndMeteors = () => {
    if (!ctx) return
    const isNight = worldState.hour < 5.6 || worldState.hour > 19.3
    const isRain = Math.abs(worldState.weather - 2.0) < 0.6
    const isColdWinter = worldState.season > 2.5 || worldState.tempC <= 4

    if (!isNight && !isRain && !isColdWinter) {
      if (birds.length === 0) initBirds()
      const shiftX = -(camYaw + userLookYaw) * width * 0.22
      const shiftY = (camPitch + userLookPitch) * height * 0.16
      ctx.save()
      ctx.fillStyle = worldState.hour > 16.5 ? 'rgba(42, 34, 66, 0.45)' : 'rgba(42, 72, 112, 0.36)'
      for (let i = 0; i < birds.length; i += 1) {
        const b = birds[i]
        b.phase += b.freq
        b.x += b.vx * (0.7 + worldState.windSpeed * 0.3)
        b.y += b.vy + Math.sin(b.phase * 0.5) * 0.00004
        if (b.x > 1.12) {
          b.x = -0.12
          b.y = rand(0.18, 0.36)
        }
        const bx = b.x * width + shiftX
        const by = b.y * height + shiftY
        const wingY = Math.sin(b.phase) * (b.span * 0.38)
        const s = b.span
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.quadraticCurveTo(bx - s * 0.45, by - wingY - 1.2, bx - s, by - wingY * 0.65)
        ctx.quadraticCurveTo(bx - s * 0.45, by - wingY * 0.55 + 0.9, bx, by + 1.1)
        ctx.quadraticCurveTo(bx + s * 0.45, by - wingY * 0.55 + 0.9, bx + s, by - wingY * 0.65)
        ctx.quadraticCurveTo(bx + s * 0.45, by - wingY - 1.2, bx, by)
        ctx.fill()
      }
      ctx.restore()
    }

    if (isNight && !isRain) {
      if (meteors.length < 1 && Math.random() < 0.0055) {
        meteors.push({
          x: rand(width * 0.2, width * 0.85),
          y: rand(height * 0.06, height * 0.30),
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
        const alpha = Math.sin((m.life / m.maxLife) * Math.PI) * 0.88
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
     3D Depth Seasonal Flora & Weather Particles
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

  const buildSnowCrystalSprite = () => {
    const off = document.createElement('canvas')
    off.width = 64
    off.height = 64
    const oc = off.getContext('2d')
    if (!oc) return off
    oc.translate(32, 32)
    const g = oc.createRadialGradient(0, 0, 1, 0, 0, 26)
    g.addColorStop(0, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.45, 'rgba(232,244,255,0.34)')
    g.addColorStop(1, 'rgba(205,228,255,0)')
    oc.fillStyle = g
    oc.beginPath()
    oc.arc(0, 0, 26, 0, Math.PI * 2)
    oc.fill()

    oc.strokeStyle = 'rgba(255,255,255,0.92)'
    oc.lineCap = 'round'
    for (let i = 0; i < 6; i += 1) {
      oc.save()
      oc.rotate((Math.PI / 3) * i)
      oc.lineWidth = 1.8
      oc.beginPath()
      oc.moveTo(0, 0)
      oc.lineTo(0, -18)
      oc.stroke()
      oc.lineWidth = 1.2
      oc.beginPath()
      oc.moveTo(0, -8)
      oc.lineTo(-4.5, -12.5)
      oc.moveTo(0, -8)
      oc.lineTo(4.5, -12.5)
      oc.moveTo(0, -13)
      oc.lineTo(-3.2, -16)
      oc.moveTo(0, -13)
      oc.lineTo(3.2, -16)
      oc.stroke()
      oc.restore()
    }
    return off
  }

  const buildSoftSnowSprite = () => {
    const off = document.createElement('canvas')
    off.width = 48
    off.height = 48
    const oc = off.getContext('2d')
    if (!oc) return off
    oc.translate(24, 24)
    const g = oc.createRadialGradient(0, 0, 1, 0, 0, 20)
    g.addColorStop(0, 'rgba(255,255,255,0.94)')
    g.addColorStop(0.55, 'rgba(230,242,255,0.48)')
    g.addColorStop(1, 'rgba(205,228,255,0)')
    oc.fillStyle = g
    oc.beginPath()
    oc.arc(0, 0, 20, 0, Math.PI * 2)
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

  const snowCrystalSprite = buildSnowCrystalSprite()
  const snowSoftSprite = buildSoftSnowSprite()
  const fireflySprite = buildGlowSprite([255, 226, 136], 0.94)
  const summerBreezeSprite = buildGlowSprite([210, 248, 232], 0.82)

  const syncWorldWithAtmosphere = detail => {
    const atm = detail || window.__blogAtmosphere || {}
    const hour = typeof atm.hourFloat === 'number' ? atm.hourFloat : 15.5
    const seasonStr = atm.season || root.getAttribute('data-season') || 'autumn'
    const sceneStr = atm.activeScene || root.getAttribute('data-sanctuary-scene') || 'autumn'
    const weatherStr = atm.effectiveWeather || root.getAttribute('data-weather') || 'clear'
    const tempC = typeof atm.tempC === 'number' ? atm.tempC : 15
    const cloud = typeof atm.cloudCover === 'number' ? atm.cloudCover : 0.30
    const windKmh = typeof atm.windKmh === 'number' ? atm.windKmh : 10

    worldState.targetHour = hour
    const seasonMap = { spring: 0.0, summer: 1.0, autumn: 2.0, winter: 3.0 }
    worldState.targetSeason = typeof seasonMap[seasonStr] === 'number' ? seasonMap[seasonStr] : 2.0

    const weatherMap = { clear: 0.0, cloudy: 1.0, rain: 2.0, snow: 3.0, fog: 4.0 }
    worldState.targetWeather = typeof weatherMap[weatherStr] === 'number' ? weatherMap[weatherStr] : 0.0
    worldState.targetTempC = tempC
    worldState.targetCloudCover = sceneStr === 'rain' ? 0.90 : cloud
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
    if (kind === 'rain') {
      return Math.round(clamp(area / 6200, 120, 195) * restBoost)
    }
    if (kind === 'snow') {
      return Math.round(clamp(area / 11500, 56, 98) * restBoost)
    }
    const cap = width < 768 ? 16 : 32
    return Math.round(clamp(area / 48000, 14, cap) * restBoost)
  }

  const createParticle = (kind, initial) => {
    if (kind === 'rain') {
      const z = rand(0.28, 1.0)
      return {
        kind: 'rain',
        x: rand(-60, width + 180),
        y: initial ? rand(-height * 0.2, height) : rand(-110, -10),
        vx: -1.6 - z * 1.8 * worldState.windSpeed,
        vy: 14.0 + z * 11.5,
        len: 22 + z * 34,
        alpha: 0.16 + z * 0.28,
        depth: z
      }
    }

    if (kind === 'snow') {
      const z = Math.pow(Math.random(), 1.25)
      const isCrystal = z > 0.56
      return {
        kind: 'snow',
        x: rand(-30, width + 30),
        y: initial ? rand(-30, height + 20) : rand(-40, -10),
        vx: rand(-0.26, 0.38),
        vy: 0.45 + z * 0.95,
        size: isCrystal ? (5.5 + z * 6.5) : (2.6 + z * 4.5),
        alpha: 0.34 + z * 0.54,
        phase: rand(0, Math.PI * 2),
        spin: rand(0.01, 0.024),
        rot: rand(0, Math.PI * 2),
        rotSpeed: rand(-0.018, 0.018),
        sprite: isCrystal ? snowCrystalSprite : snowSoftSprite,
        depth: 0.3 + z * 0.7
      }
    }

    if (kind === 'star' || kind === 'summer') {
      const isSummer = kind === 'summer'
      return {
        kind,
        x: rand(20, width - 20),
        y: initial ? rand(height * 0.38, height * 0.94) : rand(height * 0.5, height * 0.96),
        vx: rand(-0.18, 0.18),
        vy: rand(-0.22, 0.10),
        size: rand(3.2, 7.6),
        alpha: rand(0.32, 0.80),
        phase: rand(0, Math.PI * 2),
        pulse: rand(0.015, 0.030),
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
      size: (isGinkgo ? 7.8 : 7.0) + z * 8.6,
      alpha: 0.32 + z * 0.52,
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

    // Ultra-fast 3-depth-bucket batched rain rendering (3 strokes total instead of 195 save/stroke/restore calls!)
    if (targetKind === 'rain') {
      const buckets = [[], [], []]
      for (let i = 0; i < particles.length; i += 1) {
        let p = particles[i]
        if (p.kind !== 'rain') {
          p = createParticle('rain', true)
          particles[i] = p
        }
        p.x += p.vx + wind * 2.4 + scrollBreezeX * 0.35
        p.y += p.vy + scrollBreezeY * 0.25
        if (p.y > height + 30 || p.x < -120) {
          particles[i] = createParticle('rain', false)
          continue
        }
        const bIdx = p.depth < 0.52 ? 0 : (p.depth < 0.78 ? 1 : 2)
        buckets[bIdx].push(p)
      }
      const widths = [0.58, 0.80, 1.04]
      const alphas = [0.14, 0.22, 0.30]
      ctx.save()
      ctx.strokeStyle = 'rgba(220, 236, 246, 0.82)'
      ctx.lineCap = 'round'
      for (let b = 0; b < 3; b += 1) {
        const list = buckets[b]
        if (list.length === 0) continue
        ctx.globalAlpha = alphas[b] * layerAlpha
        ctx.lineWidth = widths[b]
        ctx.beginPath()
        for (let k = 0; k < list.length; k += 1) {
          const p = list[k]
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + p.vx * 1.65, p.y + p.len)
        }
        ctx.stroke()
      }
      ctx.restore()
      return
    }

    if (targetKind === 'star' || targetKind === 'summer') {
      ctx.save()
      for (let i = 0; i < particles.length; i += 1) {
        let p = particles[i]
        if (p.kind !== targetKind) {
          p = createParticle(targetKind, true)
          particles[i] = p
        }
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
        ctx.globalAlpha = pulseA
        ctx.drawImage(p.sprite, p.x - r, p.y - r, r * 2, r * 2)
      }
      ctx.restore()
      return
    }

    for (let i = 0; i < particles.length; i += 1) {
      let p = particles[i]
      if (p.kind !== targetKind) {
        p = createParticle(targetKind, true)
        particles[i] = p
      }

      if (p.kind === 'snow') {
        p.phase += p.spin
        p.rot += p.rotSpeed
        p.x += p.vx + (wind + scrollBreezeX * 0.4) * p.depth + Math.sin(p.phase) * 0.45
        p.y += p.vy + scrollBreezeY * 0.25 * p.depth
        applyCursorRepulsion(p)
        if (p.y > height + 24) {
          particles[i] = createParticle('snow', false)
          continue
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = p.alpha * layerAlpha
        ctx.drawImage(p.sprite, -p.size, -p.size, p.size * 2, p.size * 2)
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
        const d = p.size * 2.0
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
    bgDpr = Math.min(window.devicePixelRatio || 1, 1.5)

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
    if (starUniforms) {
      starUniforms.uPixelRatio.value = bgDpr
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
    initRawFallback()
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

    spawnWaterRippleAtScreen(event.clientX, event.clientY, 1.35)

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
      userLookYaw = clamp(dragStartYaw - ((x - dragStartX) / w) * 0.72, -0.45, 0.45)
      userLookPitch = clamp(dragStartPitch + ((y - dragStartY) / h) * 0.34, -0.18, 0.24)
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
        camPitchTarget = (0.5 - (y / height)) * 0.10
      }

      const nowMs = performance.now()
      if (nowMs - lastRippleSpawnAt > 180) {
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

  window.addEventListener('wheel', event => {
    if (!root.classList.contains('is-sanctuary-rest')) return
    camZoomTarget = clamp(camZoomTarget - event.deltaY * 0.001, -0.6, 1.15)
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
