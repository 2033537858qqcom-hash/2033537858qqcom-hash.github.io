/**
 * Three.js 全程序化 3D 天时世界 + 四季晴雨物象粒子引擎
 * - 零静态背景图片：由 Three.js (THREE.WebGLRenderer / THREE.Scene / THREE.PerspectiveCamera / THREE.ShaderMaterial)
 *   实时渲染 3D 大气散射天空、24 小时太阳/月亮轨迹、星空银河与极光、3D 体积流云、四层视差远山与云海、
 *   以及带实时波纹与雨滴涟漪的 3D 镜面湖泊。
 * - 实时响应 4 大自由维度：时间 (0-24h) × 季节 (春/夏/秋/冬) × 天气 (晴/云/雨/雪/雾) × 气温 (-5°C~35°C) + 真实风速。
 * - 前景物象层：春樱瓣（保留 buildSakuraPetalPath 植物学凹缺轮廓）、夏夜流萤、金秋银杏叶、冬日六角雪晶、斜风细雨丝。
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

  // 3D WebGL Landscape Canvas (back layer) + 3D Depth Flora Canvas (front layer)
  const bgCanvas = document.createElement('canvas')
  const fgCanvas = document.createElement('canvas')
  const ctx = fgCanvas.getContext('2d', { alpha: true })
  const particles = []

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
  let camTargetX = 0
  let camTargetY = 0
  let camX = 0
  let camY = 0
  let breezeVx = 0
  let breezeVy = 0
  let scrollBreezeX = 0
  let scrollBreezeY = 0
  let lastScrollY = typeof window !== 'undefined' ? (window.scrollY || 0) : 0
  let musicActive = false
  let startTime = performance.now()

  // Continuous interpolated 3D world uniforms
  const worldState = {
    hour: 15.5,
    targetHour: 15.5,
    season: 2.0, // 0=spring, 1=summer, 2=autumn, 3=winter
    targetSeason: 2.0,
    weather: 0.0, // 0=clear, 1=cloudy, 2=rain, 3=snow, 4=fog
    targetWeather: 0.0,
    tempC: 15.0,
    targetTempC: 15.0,
    cloudCover: 0.26,
    targetCloudCover: 0.26,
    windSpeed: 1.0,
    targetWindSpeed: 1.0,
    particleKind: 'ginkgo' // petal | summer | ginkgo | snow | rain | star
  }

  const rand = (min, max) => min + Math.random() * (max - min)
  const pickIndex = len => Math.floor(Math.random() * len)
  const rgba = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'

  /* ==========================================================================
     Three.js 3D 程序化天空 · 体积云 · 视差远山 · 镜面湖泊 GLSL Shaders
     ========================================================================== */
  const VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `

  // Fallback raw WebGL vertex shader (attribute position + uv)
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
    uniform vec2 uCamOffset;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.03 + vec2(17.1, 31.4);
        a *= 0.5;
      }
      return v;
    }

    float ridgeFbm(vec2 p) {
      float v = 0.0;
      float a = 0.52;
      mat2 rot = mat2(0.86, 0.5, -0.5, 0.86);
      for (int i = 0; i < 4; i++) {
        float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
        v += a * n * n;
        p = rot * p * 2.12 + vec2(9.2, 13.7);
        a *= 0.48;
      }
      return v;
    }

    // Seasonal palette helper (0=spring, 1=summer, 2=autumn, 3=winter)
    vec3 seasonalMix(vec3 spr, vec3 sum, vec3 aut, vec3 win, float s) {
      float wSpr = max(0.0, 1.0 - abs(s - 0.0));
      float wSum = max(0.0, 1.0 - abs(s - 1.0));
      float wAut = max(0.0, 1.0 - abs(s - 2.0));
      float wWin = max(0.0, 1.0 - abs(s - 3.0)) + max(0.0, 1.0 - abs(s + 1.0));
      float tot = max(0.001, wSpr + wSum + wAut + wWin);
      return (spr * wSpr + sum * wSum + aut * wAut + win * wWin) / tot;
    }

    void main() {
      float aspect = uResolution.x / max(1.0, uResolution.y);
      vec2 uv = vUv;
      vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

      // 3D Camera parallax from mouse & scroll
      vec2 cam = uCamOffset;
      float horizonY = 0.30 + cam.y * 0.035;
      bool isWater = uv.y < horizonY;

      // Mirror coordinate for 3D lake reflection
      float sampleY = isWater ? (horizonY + (horizonY - uv.y) * 1.15) : uv.y;
      float skyT = clamp((sampleY - horizonY) / max(0.01, 1.0 - horizonY), 0.0, 1.0);

      // Solar & Lunar elevation from 24h continuous clock
      float dayAngle = (uHour - 6.0) / 12.5 * 3.14159265;
      float sunElev = sin(dayAngle);
      float dayFactor = smoothstep(-0.22, 0.25, sunElev);
      float twilightFactor = smoothstep(-0.32, 0.08, sunElev) * (1.0 - smoothstep(0.05, 0.42, sunElev));
      float nightFactor = 1.0 - smoothstep(-0.28, 0.05, sunElev);
      float rainFactor = clamp(1.0 - abs(uWeather - 2.0), 0.0, 1.0);
      float snowFactor = clamp(1.0 - abs(uWeather - 3.0), 0.0, 1.0) + smoothstep(5.0, -2.0, uTempC) * 0.6;
      snowFactor = clamp(snowFactor, 0.0, 1.0);

      // Sun & Moon 3D screen-space positions
      vec2 sunPos = vec2(
        0.5 + cos(dayAngle) * -0.34 + cam.x * 0.025,
        horizonY + 0.05 + max(-0.12, sunElev * 0.48)
      );
      vec2 moonPos = vec2(
        0.5 + cos(dayAngle + 3.14159) * 0.28 + cam.x * 0.025,
        horizonY + 0.36 + sin(uHour * 0.26) * 0.08
      );

      // Base Day Sky Colors per Season
      vec3 zenithDay = seasonalMix(
        vec3(0.32, 0.62, 0.94), // Spring: soft sakura azure
        vec3(0.14, 0.54, 0.96), // Summer: vivid ocean cerulean
        vec3(0.26, 0.52, 0.88), // Autumn: crisp high-sky blue
        vec3(0.46, 0.68, 0.92), // Winter: pastel ice sky
        uSeason
      );
      vec3 horizonDay = seasonalMix(
        vec3(0.95, 0.90, 0.96), // Spring: warm blossom mist
        vec3(0.74, 0.93, 0.99), // Summer: luminous sea breeze cyan
        vec3(0.98, 0.88, 0.82), // Autumn: warm golden-apricot horizon
        vec3(0.92, 0.95, 0.99), // Winter: pearl snow mist
        uSeason
      );

      // Temperature thermal shift (-5C cold ice -> +35C warm amber)
      float tempNorm = clamp((uTempC - 14.0) / 18.0, -1.0, 1.0);
      horizonDay += vec3(0.05 * tempNorm, 0.015 * tempNorm, -0.04 * tempNorm);

      // Golden Hour / Dawn / Sunset Scattering Palette
      vec3 zenithTwilight = vec3(0.24, 0.28, 0.54);
      vec3 midTwilight = vec3(0.78, 0.46, 0.62);
      vec3 horizonTwilight = vec3(0.99, 0.68, 0.46);

      // Night Starry Sky Palette
      vec3 zenithNight = vec3(0.04, 0.07, 0.16);
      vec3 horizonNight = vec3(0.11, 0.17, 0.32);

      // Rainy Celadon Sanctuary Palette (Garden of Words mood)
      vec3 zenithRain = vec3(0.36, 0.52, 0.56);
      vec3 horizonRain = vec3(0.72, 0.84, 0.85);

      // Compose multi-band sky gradient
      vec3 daySky = mix(horizonDay, zenithDay, pow(skyT, 0.65));
      vec3 twiSky = mix(horizonTwilight, midTwilight, smoothstep(0.0, 0.45, skyT));
      twiSky = mix(twiSky, zenithTwilight, smoothstep(0.38, 1.0, skyT));
      vec3 nightSky = mix(horizonNight, zenithNight, pow(skyT, 0.7));

      vec3 skyCol = mix(nightSky, daySky, dayFactor);
      skyCol = mix(skyCol, twiSky, twilightFactor * 0.88);
      skyCol = mix(skyCol, mix(horizonRain, zenithRain, pow(skyT, 0.7)), rainFactor * (0.45 + 0.45 * dayFactor));

      // Wave distortion when sampling reflection in water
      vec2 waveOffset = vec2(0.0);
      if (isWater) {
        float waterDepth = clamp((horizonY - uv.y) / max(0.01, horizonY), 0.0, 1.0);
        float wFreq = 28.0 / (0.15 + waterDepth);
        float w1 = sin(p.x * wFreq + uTime * (1.2 + uWindSpeed * 0.35) + waterDepth * 42.0);
        float w2 = cos(p.x * (wFreq * 0.65) - uTime * 0.95 + waterDepth * 28.0);
        waveOffset = vec2((w1 + w2) * 0.0045 * (0.3 + waterDepth), (w1 * 0.5) * 0.003 * waterDepth);
      }

      vec2 skySampleUv = vec2(uv.x + waveOffset.x, sampleY + waveOffset.y);
      vec2 skyPos = vec2((skySampleUv.x - 0.5) * aspect, skySampleUv.y);

      // Sun Disc & Mie Forward-Scattering Glow
      vec2 sunDelta = vec2((skySampleUv.x - sunPos.x) * aspect, skySampleUv.y - sunPos.y);
      float sunDist = length(sunDelta);
      float sunVis = clamp((dayFactor + twilightFactor * 0.9) * (1.0 - rainFactor * 0.8), 0.0, 1.0);
      vec3 sunColor = mix(vec3(1.0, 0.58, 0.32), vec3(1.0, 0.97, 0.88), clamp(sunElev * 1.6, 0.0, 1.0));
      skyCol += sunColor * (exp(-sunDist * 4.2) * 0.42 + exp(-sunDist * 18.0) * 0.55 + smoothstep(0.032, 0.018, sunDist) * 0.85) * sunVis;

      // Night Stars, Milky Way Nebula & Crescent Moon
      if (nightFactor > 0.02) {
        vec2 starUv = skyPos * 26.0 + cam * 0.4;
        vec2 starCell = floor(starUv);
        vec2 starF = fract(starUv) - 0.5;
        float sh = hash(starCell);
        if (sh > 0.78) {
          vec2 starCenter = vec2(fract(sh * 17.3) - 0.5, fract(sh * 43.7) - 0.5) * 0.55;
          float dStar = length(starF - starCenter);
          float twinkle = 0.65 + 0.35 * sin(uTime * (1.8 + fract(sh * 9.1) * 3.0) + sh * 60.0);
          float starBright = smoothstep(0.09, 0.01, dStar) * twinkle * smoothstep(0.05, 0.4, skyT);
          skyCol += mix(vec3(0.75, 0.86, 1.0), vec3(1.0, 0.92, 0.78), fract(sh * 5.7)) * starBright * nightFactor * (1.0 - rainFactor * 0.85);
        }
        // Milky way diagonal soft glow
        float milky = fbm(skyPos * 2.6 + vec2(1.4, -0.8));
        float band = exp(-pow((skyPos.x * 0.65 + (skyT - 0.55)) * 2.6, 2.0));
        skyCol += vec3(0.24, 0.32, 0.58) * milky * band * 0.28 * nightFactor * (1.0 - rainFactor);

        // Northern Aurora ribbon on cool/winter nights
        float auroraWeight = nightFactor * (0.35 + 0.65 * snowFactor) * (1.0 - rainFactor);
        if (auroraWeight > 0.05) {
          float ax = skyPos.x * 2.2 + uTime * 0.035;
          float curtain = sin(ax * 2.5 + fbm(vec2(ax, uTime * 0.04)) * 3.0) * 0.5 + 0.5;
          float aHeight = exp(-pow((skyT - 0.52 - curtain * 0.14) * 5.5, 2.0));
          vec3 auroraCol = mix(vec3(0.18, 0.85, 0.68), vec3(0.48, 0.38, 0.92), curtain);
          skyCol += auroraCol * aHeight * curtain * 0.26 * auroraWeight;
        }

        // Crescent Moon
        vec2 moonDelta = vec2((skySampleUv.x - moonPos.x) * aspect, skySampleUv.y - moonPos.y);
        float mDist = length(moonDelta);
        float mCut = length(moonDelta - vec2(0.011, 0.007));
        float moonDisc = smoothstep(0.026, 0.022, mDist) * (1.0 - smoothstep(0.023, 0.019, mCut));
        skyCol += vec3(0.96, 0.94, 0.84) * (moonDisc * 0.95 + exp(-mDist * 9.0) * 0.24) * nightFactor * (1.0 - rainFactor * 0.75);
      }

      // 3D Volumetric Drifting Clouds (perspective-mapped onto sky dome)
      float cloudPerspective = 1.0 / (0.22 + skyT * 0.88);
      vec2 cloudUv = vec2(
        (skyPos.x + cam.x * 0.12) * cloudPerspective * 0.95 + uTime * 0.012 * uWindSpeed,
        skyT * 2.4 - uTime * 0.003
      );
      float cNoise1 = fbm(cloudUv * 1.45);
      float cNoise2 = fbm(cloudUv * 2.9 + vec2(4.2, -1.7) + uTime * 0.008);
      float cShape = cNoise1 * 0.68 + cNoise2 * 0.32;
      float coverThresh = mix(0.64, 0.32, clamp(uCloudCover + rainFactor * 0.35, 0.0, 0.95));
      float cloudAlpha = smoothstep(coverThresh, coverThresh + 0.26, cShape) * smoothstep(0.02, 0.22, skyT);

      // Cloud 3D sun/moon rim lighting
      float sunProx = exp(-sunDist * 2.4);
      vec3 cloudLit = mix(
        vec3(0.22, 0.28, 0.44),
        vec3(0.99, 0.98, 1.0),
        dayFactor
      );
      cloudLit = mix(cloudLit, vec3(1.0, 0.72, 0.56), twilightFactor * 0.85);
      cloudLit = mix(cloudLit, vec3(0.55, 0.65, 0.68), rainFactor * 0.7);
      vec3 cloudShadow = cloudLit * mix(0.76, 0.58, clamp(uCloudCover + rainFactor * 0.4, 0.0, 1.0));
      vec3 cloudCol = mix(cloudShadow, cloudLit + sunColor * sunProx * 0.32, smoothstep(coverThresh, coverThresh + 0.32, cNoise1));
      skyCol = mix(skyCol, cloudCol, cloudAlpha * 0.88);

      // 3D Layered Parallax Mountain Ridges (4 depth planes)
      vec3 sceneCol = skyCol;
      float mx = (skySampleUv.x - 0.5) * aspect;

      // Layer 1: Far Alpine Peak (Mt. Fuji / distant snow range)
      float farX = mx + cam.x * 0.035;
      float farBell = exp(-pow((farX - 0.12) * 2.1, 2.0)) * 0.22;
      float farRidge = horizonY + 0.04 + farBell + ridgeFbm(vec2(farX * 1.7 + 2.1, 1.3)) * 0.085;
      if (sampleY < farRidge) {
        float hNorm = clamp((sampleY - horizonY) / max(0.01, farRidge - horizonY), 0.0, 1.0);
        vec3 farBase = seasonalMix(
          vec3(0.44, 0.58, 0.78),
          vec3(0.32, 0.56, 0.76),
          vec3(0.52, 0.46, 0.66),
          vec3(0.58, 0.72, 0.88),
          uSeason
        );
        farBase = mix(farBase * 0.32, farBase, dayFactor);
        farBase = mix(farBase, vec3(0.46, 0.34, 0.52), twilightFactor * 0.7);
        // Snow cap on peak
        float snowLine = mix(0.66, 0.18, snowFactor);
        float snowMask = smoothstep(snowLine, snowLine + 0.18, hNorm + noise(vec2(farX * 9.0, hNorm * 6.0)) * 0.08);
        vec3 snowTint = mix(vec3(0.35, 0.45, 0.68), vec3(0.97, 0.98, 1.0), dayFactor);
        snowTint = mix(snowTint, vec3(1.0, 0.82, 0.74), twilightFactor * 0.75);
        vec3 mCol1 = mix(farBase, snowTint, snowMask);
        // Atmospheric perspective haze
        sceneCol = mix(mCol1, skyCol, 0.38 + (1.0 - hNorm) * 0.25);
      }

      // Layer 2: Mid-ground Rolling Mountains + Valley Mist
      float midX = mx + cam.x * 0.065;
      float midRidge = horizonY + 0.015 + ridgeFbm(vec2(midX * 2.3 + 7.4, 3.1)) * 0.115 * (0.65 + 0.45 * abs(sin(midX * 1.2 + 0.8)));
      if (sampleY < midRidge) {
        float hNorm = clamp((sampleY - horizonY) / max(0.01, midRidge - horizonY), 0.0, 1.0);
        vec3 midFoliage = seasonalMix(
          vec3(0.34, 0.56, 0.52), // Spring sage & blossom
          vec3(0.20, 0.48, 0.44), // Summer lush emerald
          vec3(0.68, 0.42, 0.30), // Autumn golden-maple hills
          vec3(0.46, 0.58, 0.72), // Winter frosted pine
          uSeason
        );
        if (snowFactor > 0.2) {
          midFoliage = mix(midFoliage, vec3(0.88, 0.93, 0.98), snowFactor * smoothstep(0.25, 0.75, hNorm));
        }
        midFoliage = mix(midFoliage * 0.24, midFoliage, dayFactor);
        midFoliage = mix(midFoliage, vec3(0.38, 0.25, 0.38), twilightFactor * 0.65);
        midFoliage = mix(midFoliage, vec3(0.32, 0.46, 0.48), rainFactor * 0.55);
        // Drifting valley mist at base of mid mountains
        float mist = smoothstep(0.45, 0.0, hNorm) * (0.45 + 0.35 * fbm(vec2(midX * 3.0 + uTime * 0.02, hNorm * 4.0)));
        sceneCol = mix(midFoliage, skyCol, 0.22 + mist * 0.52);
      }

      // Layer 3: Near Headlands framing Left & Right Shores
      float nearX = mx + cam.x * 0.105;
      float sideFrame = smoothstep(0.12, 0.78, abs(nearX));
      float nearRidge = horizonY - 0.01 + sideFrame * (0.045 + noise(vec2(nearX * 3.4, 5.2)) * 0.065);
      if (sampleY < nearRidge) {
        float hNorm = clamp((sampleY - horizonY) / max(0.01, nearRidge - horizonY), 0.0, 1.0);
        vec3 nearCol = seasonalMix(
          vec3(0.28, 0.50, 0.42),
          vec3(0.16, 0.42, 0.36),
          vec3(0.56, 0.34, 0.24),
          vec3(0.38, 0.48, 0.60),
          uSeason
        );
        if (snowFactor > 0.2) {
          nearCol = mix(nearCol, vec3(0.84, 0.90, 0.96), snowFactor * 0.75);
        }
        nearCol = mix(nearCol * 0.20, nearCol, dayFactor);
        nearCol = mix(nearCol, vec3(0.24, 0.18, 0.28), twilightFactor * 0.6);
        sceneCol = mix(nearCol, skyCol, 0.12 + (1.0 - hNorm) * 0.24);
      }

      // Layer 4: 3D Reflective Lake Water with Fresnel, Sun/Moon Glints & Rain Ripples
      if (isWater) {
        float waterDepth = clamp((horizonY - uv.y) / max(0.01, horizonY), 0.0, 1.0);
        vec3 waterDeep = seasonalMix(
          vec3(0.22, 0.48, 0.68),
          vec3(0.10, 0.46, 0.68),
          vec3(0.24, 0.38, 0.56),
          vec3(0.30, 0.48, 0.66),
          uSeason
        );
        waterDeep = mix(waterDeep * 0.22, waterDeep, dayFactor);
        waterDeep = mix(waterDeep, vec3(0.28, 0.24, 0.42), twilightFactor * 0.6);
        waterDeep = mix(waterDeep, vec3(0.28, 0.44, 0.46), rainFactor * 0.65);

        // Fresnel blend (horizon reflects 92% sky/mountains, foreground mixes water body color)
        float fresnel = pow(1.0 - waterDepth, 1.65);
        vec3 waterCol = mix(waterDeep, sceneCol, 0.38 + fresnel * 0.56);

        // Sparkling Sun / Moon Glitter Path on Water Waves
        float targetX = nightFactor > 0.5 ? moonPos.x : sunPos.x;
        float glintDistX = abs((uv.x - targetX) * aspect + waveOffset.x * 11.0);
        float shimmerNoise = noise(vec2(p.x * 38.0 + uTime * 1.4, waterDepth * 95.0 - uTime * 2.2));
        float glint = exp(-glintDistX * (14.0 + waterDepth * 12.0)) * smoothstep(0.62, 0.92, shimmerNoise) * (1.0 - rainFactor * 0.75);
        vec3 glintCol = nightFactor > 0.5 ? vec3(0.88, 0.92, 1.0) : sunColor;
        waterCol += glintCol * glint * (0.55 - waterDepth * 0.35);

        // Concentric 3D Raindrop Ripples on Water when raining
        if (rainFactor > 0.05) {
          vec2 rUv = vec2(p.x * 7.5, waterDepth * 14.0);
          vec2 rCell = floor(rUv);
          vec2 rF = fract(rUv) - 0.5;
          float rh = hash(rCell);
          float rLife = fract(uTime * (0.75 + fract(rh * 3.7) * 0.4) + rh);
          float rRad = rLife * 0.44;
          float rRing = smoothstep(0.035, 0.0, abs(length(rF) - rRad)) * (1.0 - rLife);
          waterCol += vec3(0.82, 0.92, 0.96) * rRing * 0.32 * rainFactor;
        }

        // Horizon shoreline mist blend
        float shoreMist = exp(-waterDepth * 16.0);
        sceneCol = mix(waterCol, skyCol, shoreMist * 0.45);
      }

      gl_FragColor = vec4(sceneCol, 1.0);
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
        uCamOffset: gl.getUniformLocation(prog, 'uCamOffset')
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      renderer.setSize(width || window.innerWidth, height || window.innerHeight, false)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(55, (width || 1) / Math.max(1, height || 1), 0.1, 200)
      camera.position.set(0, 0, 5)

      const uniforms = {
        uResolution: { value: new THREE.Vector2(width * dpr, height * dpr) },
        uTime: { value: 0 },
        uHour: { value: worldState.hour },
        uSeason: { value: worldState.season },
        uWeather: { value: worldState.weather },
        uTempC: { value: worldState.tempC },
        uCloudCover: { value: worldState.cloudCover },
        uWindSpeed: { value: worldState.windSpeed },
        uCamOffset: { value: new THREE.Vector2(0, 0) }
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
    worldState.hour += (worldState.targetHour - worldState.hour) * 0.05
    worldState.season += (worldState.targetSeason - worldState.season) * 0.04
    worldState.weather += (worldState.targetWeather - worldState.weather) * 0.04
    worldState.tempC += (worldState.targetTempC - worldState.tempC) * 0.05
    worldState.cloudCover += (worldState.targetCloudCover - worldState.cloudCover) * 0.04
    worldState.windSpeed += (worldState.targetWindSpeed - worldState.windSpeed) * 0.05

    camX += (camTargetX - camX) * 0.05
    camY += (camTargetY - camY) * 0.05

    if (threeRenderer && threeUniforms) {
      threeUniforms.uResolution.value.set(width * dpr, height * dpr)
      threeUniforms.uTime.value = elapsedSec
      threeUniforms.uHour.value = worldState.hour
      threeUniforms.uSeason.value = worldState.season
      threeUniforms.uWeather.value = worldState.weather
      threeUniforms.uTempC.value = worldState.tempC
      threeUniforms.uCloudCover.value = worldState.cloudCover
      threeUniforms.uWindSpeed.value = worldState.windSpeed
      threeUniforms.uCamOffset.value.set(camX, camY)
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
      rawGl.uniform2f(rawLocs.uCamOffset, camX, camY)
      rawGl.drawArrays(rawGl.TRIANGLES, 0, 6)
    }
  }

  /* ==========================================================================
     四季晴雨 3D 物象精灵：春樱瓣 / 金秋银杏扇叶 / 冬日六角雪晶 / 流萤 / 细雨丝
     ========================================================================== */

  /** 真实樱瓣轮廓（基部在原点，-y 为凹缺瓣尖，供 tools/verify-petals.mjs 同源校验） */
  const buildSakuraPetalPath = (c, s) => {
    const w = s
    const h = s * 1.55
    c.beginPath()
    c.moveTo(0, 0)
    c.bezierCurveTo(-w * 0.28, -h * 0.12, -w * 1.05, -h * 0.28, -w * 0.92, -h * 0.58)
    c.bezierCurveTo(-w * 0.88, -h * 0.78, -w * 0.55, -h * 0.95, -w * 0.22, -h * 0.98)
    c.quadraticCurveTo(0, -h * 0.78, w * 0.22, -h * 0.98)
    c.bezierCurveTo(w * 0.55, -h * 0.95, w * 0.88, -h * 0.78, w * 0.92, -h * 0.58)
    c.bezierCurveTo(w * 1.05, -h * 0.28, w * 0.28, -h * 0.12, 0, 0)
    c.closePath()
  }

  const buildPetalSprite = palette => {
    const s = 36
    const h = s * 1.55
    const pad = 8
    const w = Math.ceil(s * 2.3 + pad * 2)
    const ch = Math.ceil(h + pad * 2)
    const off = document.createElement('canvas')
    off.width = w * 2
    off.height = ch * 2
    const oc = off.getContext('2d')
    oc.scale(2, 2)
    const ox = w / 2
    const oy = ch - pad
    oc.translate(ox, oy)

    buildSakuraPetalPath(oc, s)
    const grad = oc.createLinearGradient(0, 0, 0, -h)
    grad.addColorStop(0, rgba(palette.base, 0.95))
    grad.addColorStop(0.4, rgba(palette.mid, 1))
    grad.addColorStop(0.82, rgba(palette.tip, 0.95))
    grad.addColorStop(1, rgba(palette.tip, 0.78))
    oc.fillStyle = grad
    oc.fill()

    oc.globalAlpha = 0.42
    oc.strokeStyle = rgba(palette.tip, 0.65)
    oc.lineWidth = Math.max(0.5, s * 0.035)
    buildSakuraPetalPath(oc, s)
    oc.stroke()

    return { canvas: off, w, h: ch, ox, oy, refSize: s }
  }

  /** 金秋银杏扇形叶（带叶柄与二裂扇缘） */
  const buildGinkgoSprite = palette => {
    const s = 36
    const h = s * 1.4
    const pad = 10
    const w = Math.ceil(s * 2.4 + pad * 2)
    const ch = Math.ceil(h + pad * 2)
    const off = document.createElement('canvas')
    off.width = w * 2
    off.height = ch * 2
    const oc = off.getContext('2d')
    oc.scale(2, 2)
    const ox = w / 2
    const oy = ch - pad - 6
    oc.translate(ox, oy)

    // Petiole (stem)
    oc.strokeStyle = rgba(palette.vein, 0.85)
    oc.lineWidth = 1.6
    oc.beginPath()
    oc.moveTo(0, 8)
    oc.quadraticCurveTo(2, 3, 0, 0)
    oc.stroke()

    // Fan blade with central bilobed cleft
    oc.beginPath()
    oc.moveTo(0, 0)
    oc.quadraticCurveTo(-s * 0.55, -h * 0.25, -s * 1.02, -h * 0.68)
    oc.quadraticCurveTo(-s * 0.82, -h * 0.98, -s * 0.14, -h * 0.92)
    oc.quadraticCurveTo(0, -h * 0.68, s * 0.14, -h * 0.92)
    oc.quadraticCurveTo(s * 0.82, -h * 0.98, s * 1.02, -h * 0.68)
    oc.quadraticCurveTo(s * 0.55, -h * 0.25, 0, 0)
    oc.closePath()

    const grad = oc.createLinearGradient(0, 0, 0, -h)
    grad.addColorStop(0, rgba(palette.base, 0.92))
    grad.addColorStop(0.55, rgba(palette.mid, 0.96))
    grad.addColorStop(1, rgba(palette.tip, 0.95))
    oc.fillStyle = grad
    oc.fill()

    return { canvas: off, w, h: ch, ox, oy, refSize: s }
  }

  /** 冬日六角雪晶精灵 */
  const buildSnowSprite = () => {
    const rad = 28
    const off = document.createElement('canvas')
    off.width = rad * 2
    off.height = rad * 2
    const oc = off.getContext('2d')
    oc.translate(rad, rad)

    const grad = oc.createRadialGradient(0, 0, 0, 0, 0, rad)
    grad.addColorStop(0, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.35, 'rgba(225,242,255,0.52)')
    grad.addColorStop(1, 'rgba(205,230,255,0)')
    oc.fillStyle = grad
    oc.beginPath()
    oc.arc(0, 0, rad, 0, Math.PI * 2)
    oc.fill()

    oc.strokeStyle = 'rgba(255,255,255,0.75)'
    oc.lineWidth = 1.4
    oc.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      oc.save()
      oc.rotate((i * Math.PI) / 3)
      oc.beginPath()
      oc.moveTo(0, 0)
      oc.lineTo(0, -rad * 0.62)
      oc.moveTo(0, -rad * 0.36)
      oc.lineTo(-rad * 0.16, -rad * 0.48)
      oc.moveTo(0, -rad * 0.36)
      oc.lineTo(rad * 0.16, -rad * 0.48)
      oc.stroke()
      oc.restore()
    }
    return off
  }

  const buildGlowSprite = (rgb, coreAlpha) => {
    const rad = 32
    const off = document.createElement('canvas')
    off.width = rad * 2
    off.height = rad * 2
    const oc = off.getContext('2d')
    const grad = oc.createRadialGradient(rad, rad, 0, rad, rad, rad)
    grad.addColorStop(0, rgba(rgb, 1))
    grad.addColorStop(0.28, rgba(rgb, 0.42))
    grad.addColorStop(1, rgba(rgb, 0))
    oc.fillStyle = grad
    oc.beginPath()
    oc.arc(rad, rad, rad, 0, Math.PI * 2)
    oc.fill()

    if (coreAlpha > 0) {
      oc.fillStyle = 'rgba(255,255,255,' + coreAlpha + ')'
      oc.beginPath()
      oc.arc(rad, rad, 3.6, 0, Math.PI * 2)
      oc.fill()
    }
    return off
  }

  const petalSprites = [
    { tip: [255, 252, 253], mid: [255, 232, 238], base: [255, 205, 218], vein: [232, 168, 184] },
    { tip: [255, 255, 255], mid: [255, 240, 244], base: [250, 214, 224], vein: [228, 175, 190] },
    { tip: [255, 248, 250], mid: [255, 220, 230], base: [248, 190, 205], vein: [225, 155, 175] }
  ].map(buildPetalSprite)

  const ginkgoSprites = [
    { tip: [255, 236, 128], mid: [252, 198, 72], base: [228, 146, 46], vein: [176, 108, 32] },
    { tip: [255, 215, 105], mid: [246, 168, 62], base: [218, 112, 42], vein: [162, 84, 28] },
    { tip: [255, 182, 112], mid: [238, 118, 68], base: [198, 78, 48], vein: [145, 55, 32] }
  ].map(buildGinkgoSprite)

  const snowSprite = buildSnowSprite()
  const dustSprites = [
    [255, 248, 240],
    [255, 236, 205],
    [220, 246, 255]
  ].map(c => buildGlowSprite(c, 0))
  const fireflySprite = buildGlowSprite([255, 228, 142], 0.95)
  const summerBreezeSprite = buildGlowSprite([198, 255, 228], 0.88)

  const isFullPage = () => {
    const header = document.getElementById('page-header')
    return Boolean(header && header.classList.contains('full_page'))
  }

  const targetCountForKind = kind => {
    const isCompact = width < 768
    const scale = (isCompact ? 0.52 : 1) * (isFullPage() || root.classList.contains('is-sanctuary-rest') ? 1 : 0.76)
    if (kind === 'rain') return Math.round(64 * scale)
    if (kind === 'snow') return Math.round(42 * scale)
    if (kind === 'summer' || kind === 'star') return Math.round(36 * scale)
    return Math.round(24 * scale)
  }

  const createParticle = kind => {
    const depth = Math.pow(Math.random(), 1.35)
    if (kind === 'rain') {
      return {
        type: 'rain',
        x: rand(-80, width + 80),
        y: rand(-height, height),
        len: rand(16, 32) * (0.65 + depth * 0.55),
        vy: rand(8.5, 13.5) * (0.7 + depth * 0.45),
        alpha: rand(0.22, 0.48) * (0.5 + depth * 0.5),
        depth
      }
    }
    if (kind === 'snow') {
      return {
        type: 'snow',
        x: rand(-30, width + 30),
        y: rand(-height * 0.3, height),
        vx: rand(-0.18, 0.18),
        vy: rand(0.32, 0.78) * (0.55 + depth * 0.55),
        size: rand(5, 13) * (0.55 + depth * 0.6),
        alpha: rand(0.45, 0.86) * (0.5 + depth * 0.5),
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.008, 0.008),
        rotation: rand(0, Math.PI * 2),
        depth
      }
    }
    if (kind === 'summer' || kind === 'star') {
      const isEmerald = kind === 'summer' && Math.random() < 0.45
      return {
        type: 'firefly',
        x: rand(0, width),
        y: rand(height * 0.08, height * 0.92),
        vx: rand(-0.16, 0.16),
        vy: rand(-0.22, 0.08),
        size: rand(1.4, 2.8) * (0.65 + depth * 0.5),
        sprite: isEmerald ? summerBreezeSprite : fireflySprite,
        alpha: rand(0.42, 0.88),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.015, 0.032),
        depth
      }
    }
    // Spring petal or Autumn ginkgo leaf
    if (Math.random() < 0.14) {
      return {
        type: 'dust',
        x: rand(0, width),
        y: rand(0, height * 0.85),
        vx: rand(-0.06, 0.06),
        vy: rand(0.04, 0.14),
        size: rand(0.9, 1.7),
        sprite: dustSprites[pickIndex(dustSprites.length)],
        alpha: rand(0.14, 0.28),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.006, 0.014),
        depth
      }
    }
    const isGinkgo = kind === 'ginkgo'
    const pool = isGinkgo ? ginkgoSprites : petalSprites
    return {
      type: isGinkgo ? 'ginkgo' : 'petal',
      x: rand(-40, width + 40),
      y: rand(-height * 0.3, height * 0.8),
      vx: rand(-0.12, 0.28),
      vy: rand(0.24, 0.62) * (0.5 + depth * 0.55),
      swayAmp: rand(0.55, 1.35) * (0.75 + depth * 0.4),
      swayFreq: rand(0.007, 0.016),
      rotation: rand(0, Math.PI * 2),
      spin: rand(0.003, 0.014) * (Math.random() < 0.5 ? -1 : 1),
      roll: rand(0, Math.PI * 2),
      rollSpeed: rand(0.01, 0.026) * (Math.random() < 0.5 ? -1 : 1),
      pitch: rand(-0.35, 0.35),
      size: rand(12, 21) * (0.52 + depth * 0.58),
      depth,
      sprite: pool[pickIndex(pool.length)],
      alpha: rand(0.52, 0.84) * (0.48 + depth * 0.52),
      phase: rand(0, Math.PI * 2),
      flutter: rand(0.85, 1.2),
      asymmetry: rand(0.92, 1.08)
    }
  }

  const syncParticles = rebuild => {
    const kind = worldState.particleKind
    const count = targetCountForKind(kind)
    if (rebuild) particles.length = 0
    while (particles.length < count) particles.push(createParticle(kind))
    while (particles.length > count) particles.pop()
  }

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    width = window.innerWidth
    height = window.innerHeight

    bgCanvas.width = Math.round(width * dpr)
    bgCanvas.height = Math.round(height * dpr)
    bgCanvas.style.width = width + 'px'
    bgCanvas.style.height = height + 'px'

    if (threeRenderer && threeCamera) {
      threeRenderer.setSize(width, height, false)
      threeCamera.aspect = width / Math.max(1, height)
      threeCamera.updateProjectionMatrix()
    }

    fgCanvas.width = Math.round(width * dpr)
    fgCanvas.height = Math.round(height * dpr)
    fgCanvas.style.width = width + 'px'
    fgCanvas.style.height = height + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    syncParticles(false)
  }

  const pointerPush = (p, scale) => {
    if (pointerX < 0 || !finePointer.matches) return
    const dx = p.x - pointerX
    const dy = p.y - pointerY
    const distSq = dx * dx + dy * dy
    if (distSq > 26000) return
    const influence = Math.exp(-distSq / 13000)
    const dist = Math.sqrt(distSq) + 24
    p.x += (breezeVx * 0.22 + (dx / dist) * 0.48) * influence * scale
    p.y += (breezeVy * 0.15 - Math.abs(breezeVx) * 0.08 + (dy / dist) * 0.26) * influence * scale
  }

  const drawFlutterLeaf = p => {
    p.phase += p.swayFreq * p.flutter
    p.roll += p.rollSpeed
    p.pitch = Math.sin(p.phase * 0.65) * 0.28
    p.rotation += p.spin * (0.7 + Math.abs(Math.sin(p.roll)) * 0.7) + breezeVx * 0.0008 + scrollBreezeX * 0.003

    const sway = Math.sin(p.phase) * p.swayAmp
    const lateral = Math.sin(p.phase * 0.53 + p.roll) * p.swayAmp * 0.35
    const gust = (wind * worldState.windSpeed + scrollBreezeX * 0.45 + breezeVx * 0.025) * (0.4 + p.depth * 0.45)
    p.x += p.vx + sway * 0.22 + lateral * 0.12 + gust

    const face = Math.abs(Math.cos(p.roll))
    const drag = 0.72 + face * 0.38
    p.y += p.vy * drag * (1 + Math.sin(p.phase * 1.1) * 0.06) + scrollBreezeY * (0.25 + p.depth * 0.3)
    if (p.y < -70) p.y = -55
    pointerPush(p, 0.55 + p.depth * 0.65)

    if (p.y > height + 50) {
      p.y = rand(-60, -15)
      p.x = rand(-40, width + 40)
    } else if (p.x < -60) p.x = width + 40
    else if (p.x > width + 60) p.x = -40

    let scaleX = Math.cos(p.roll) * p.asymmetry
    if (Math.abs(scaleX) < 0.12) scaleX = scaleX < 0 ? -0.12 : 0.12
    const scaleY = 1 + Math.sin(p.pitch) * 0.08
    const sp = p.sprite
    const k = p.size / sp.refSize
    const depthFade = 0.52 + p.depth * 0.48

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.scale(scaleX * k, scaleY * k)
    ctx.globalAlpha = p.alpha * layerAlpha * depthFade
    ctx.drawImage(sp.canvas, -sp.ox, -sp.oy, sp.w, sp.h)
    ctx.restore()
  }

  const drawSnow = p => {
    p.phase += 0.014
    p.rotation += p.spin
    const gust = (wind * worldState.windSpeed * 0.65 + scrollBreezeX * 0.35 + breezeVx * 0.02) * (0.4 + p.depth * 0.5)
    p.x += p.vx + Math.sin(p.phase) * 0.35 + gust
    p.y += p.vy + scrollBreezeY * 0.2
    pointerPush(p, 0.6)

    if (p.y > height + 30) {
      p.y = rand(-40, -10)
      p.x = rand(-20, width + 20)
    } else if (p.x < -30) p.x = width + 20
    else if (p.x > width + 30) p.x = -20

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.globalAlpha = p.alpha * layerAlpha
    ctx.drawImage(snowSprite, -p.size, -p.size, p.size * 2, p.size * 2)
    ctx.restore()
  }

  const drawRain = p => {
    const slant = (wind * worldState.windSpeed * 1.8 + scrollBreezeX * 0.6 + breezeVx * 0.05)
    p.x += slant
    p.y += p.vy
    if (p.y > height + 40) {
      p.y = rand(-60, -10)
      p.x = rand(-60, width + 60)
    } else if (p.x < -80) p.x = width + 60
    else if (p.x > width + 80) p.x = -60

    const dx = slant * (p.len / p.vy)
    ctx.strokeStyle = 'rgba(210, 232, 250, ' + (p.alpha * layerAlpha) + ')'
    ctx.lineWidth = 1.15
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x - dx, p.y - p.len)
    ctx.stroke()
  }

  const drawFirefly = p => {
    p.phase += p.twinkle * (musicActive ? 1.3 : 1)
    p.x += p.vx + Math.sin(p.phase * 0.7) * 0.18 + (scrollBreezeX + breezeVx * 0.03) * 0.22
    p.y += p.vy + Math.cos(p.phase * 0.5) * 0.12 + scrollBreezeY * 0.2
    pointerPush(p, 0.5)

    if (p.x < -12) p.x = width + 12
    if (p.x > width + 12) p.x = -12
    if (p.y < -12) p.y = height * 0.88
    if (p.y > height + 12) p.y = height * 0.12

    const pulse = 0.45 + 0.55 * (Math.sin(p.phase) * 0.5 + 0.5)
    const glow = p.size * 7.2
    ctx.globalAlpha = Math.min(1, p.alpha * pulse * layerAlpha)
    ctx.drawImage(p.sprite, p.x - glow, p.y - glow, glow * 2, glow * 2)
  }

  const drawDust = p => {
    p.phase += p.twinkle
    p.x += p.vx + wind * 0.14 + scrollBreezeX * 0.14
    p.y += p.vy + scrollBreezeY * 0.12
    if (p.y > height * 0.9) {
      p.y = rand(0, height * 0.35)
      p.x = rand(0, width)
    }
    const pulse = 0.7 + Math.sin(p.phase) * 0.3
    const rad = p.size * 2.4
    ctx.globalAlpha = p.alpha * pulse * layerAlpha
    ctx.drawImage(p.sprite, p.x - rad, p.y - rad, rad * 2, rad * 2)
  }

  const updateWind = () => {
    windPhase += 0.004
    if (Math.random() < 0.0035) {
      windTarget = musicActive ? rand(0.18, 0.56) : rand(-0.22, 0.46)
    }
    wind += (windTarget + Math.sin(windPhase) * 0.08 - wind) * 0.012
  }

  const applyFromAtmosphere = detail => {
    if (!detail) return
    if (typeof detail.hourFloat === 'number') worldState.targetHour = detail.hourFloat
    if (typeof detail.tempC === 'number') worldState.targetTempC = detail.tempC
    if (typeof detail.cloudCover === 'number') worldState.targetCloudCover = detail.cloudCover
    if (typeof detail.windKmh === 'number') {
      worldState.targetWindSpeed = Math.max(0.4, Math.min(3.2, detail.windKmh / 10))
    }

    const sMap = { spring: 0.0, summer: 1.0, autumn: 2.0, winter: 3.0 }
    if (detail.season && sMap[detail.season] != null) {
      worldState.targetSeason = sMap[detail.season]
    }

    const wKind = detail.effectiveWeather || detail.weatherKind || 'clear'
    const wMap = { clear: 0.0, cloudy: 1.0, rain: 2.0, snow: 3.0, fog: 4.0 }
    worldState.targetWeather = wMap[wKind] != null ? wMap[wKind] : 0.0

    const nextParticle = (detail.sceneMeta && detail.sceneMeta.particle) ||
      (wKind === 'rain' ? 'rain' : (wKind === 'snow' ? 'snow' : 'petal'))

    if (nextParticle !== worldState.particleKind) {
      worldState.particleKind = nextParticle
      layerAlpha = 0.25
      syncParticles(true)
    } else {
      syncParticles(false)
    }
  }

  const tick = now => {
    if (document.hidden) {
      animationFrame = 0
      return
    }
    const elapsedSec = (now - startTime) * 0.001
    render3DBackground(elapsedSec)

    ctx.clearRect(0, 0, width, height)
    ctx.globalAlpha = 1
    layerAlpha += (1 - layerAlpha) * 0.06
    updateWind()

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]
      if (p.type === 'petal' || p.type === 'ginkgo') drawFlutterLeaf(p)
      else if (p.type === 'snow') drawSnow(p)
      else if (p.type === 'rain') drawRain(p)
      else if (p.type === 'firefly') drawFirefly(p)
      else drawDust(p)
    }
    ctx.globalAlpha = 1

    breezeVx *= 0.9
    breezeVy *= 0.9
    scrollBreezeX *= 0.91
    scrollBreezeY *= 0.91
    if (Math.abs(breezeVx) < 0.01) breezeVx = 0
    if (Math.abs(breezeVy) < 0.01) breezeVy = 0
    if (Math.abs(scrollBreezeX) < 0.008) scrollBreezeX = 0
    if (Math.abs(scrollBreezeY) < 0.008) scrollBreezeY = 0

    animationFrame = window.requestAnimationFrame(tick)
  }

  const start = () => {
    if (animationFrame || document.hidden) return
    bgCanvas.id = 'theme-sanctuary-webgl'
    bgCanvas.className = 'theme-sanctuary-webgl'
    bgCanvas.setAttribute('aria-hidden', 'true')

    fgCanvas.id = 'theme-particles'
    fgCanvas.className = 'theme-particles'
    fgCanvas.setAttribute('aria-hidden', 'true')

    if (!document.getElementById('theme-sanctuary-webgl')) {
      document.body.prepend(bgCanvas)
    }
    if (!fgCanvas.parentNode) {
      document.body.prepend(fgCanvas)
    }

    if (!threeRenderer && !rawGl) {
      initRawWebGL()
    }
    loadThreeFromCdn()

    if (window.__blogAtmosphere) {
      applyFromAtmosphere(window.__blogAtmosphere)
      worldState.hour = worldState.targetHour
      worldState.season = worldState.targetSeason
      worldState.weather = worldState.targetWeather
      worldState.tempC = worldState.targetTempC
    }

    resize()
    render3DBackground((performance.now() - startTime) * 0.001)
    if (!reduceMotion.matches) {
      animationFrame = window.requestAnimationFrame(tick)
    }
  }

  const stop = () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(resize, 120)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else start()
  })

  window.addEventListener('blog:atmosphere-change', event => {
    applyFromAtmosphere(event && event.detail)
    if (reduceMotion.matches) {
      render3DBackground((performance.now() - startTime) * 0.001)
    }
  })

  window.addEventListener('scroll', () => {
    const nextY = window.scrollY || 0
    const dy = nextY - lastScrollY
    lastScrollY = nextY
    camTargetY = Math.max(-0.45, Math.min(0.45, -nextY / 1400))
    if (!dy || Math.abs(dy) > 360) return
    scrollBreezeY = Math.max(-2.2, Math.min(2.2, scrollBreezeY * 0.65 - dy * 0.016))
    const dir = dy > 0 ? 1 : -1
    scrollBreezeX = Math.max(-1.6, Math.min(1.6, scrollBreezeX * 0.7 + dir * Math.min(Math.abs(dy) * 0.009, 0.75)))
  }, { passive: true })

  window.addEventListener('pointermove', event => {
    if (!finePointer.matches || event.pointerType !== 'mouse') return
    if (width > 0 && height > 0) {
      camTargetX = ((event.clientX / width) - 0.5) * 0.75
      camTargetY = (((event.clientY / height) - 0.5) * -0.35) + Math.max(-0.35, -(window.scrollY || 0) / 1600)
    }
    if (pointerX >= 0) {
      const dx = event.clientX - pointerX
      const dy = event.clientY - pointerY
      breezeVx = Math.max(-14, Math.min(14, breezeVx * 0.5 + dx * 0.28))
      breezeVy = Math.max(-10, Math.min(10, breezeVy * 0.5 + dy * 0.22))
    }
    pointerX = event.clientX
    pointerY = event.clientY
  }, { passive: true })

  window.addEventListener('pointerleave', () => {
    pointerX = -9999
    pointerY = -9999
  })

  window.addEventListener('blog:music-play', () => {
    musicActive = true
    windTarget = Math.max(windTarget, 0.34)
  })

  window.addEventListener('blog:music-pause', () => {
    musicActive = false
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }

  document.addEventListener('pjax:complete', () => {
    if (!animationFrame && !reduceMotion.matches) start()
    else syncParticles(false)
  })
})()
