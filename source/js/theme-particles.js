/**
 * 物象化粒子
 * 白天：写实樱瓣（植物学特征：瓣尖凹缺 emarginate + 基端收窄）
 * 夜晚：星屑 / 萤火
 * 仅首页 full_page；尊重 reduced-motion / 省流
 *
 * 形态依据：
 * - 樱花瓣尖有小裂口（与梅花椭圆无裂区分）
 * - 五瓣、淡粉至近白，薄而半透
 * - 飘落时翻滚 + 侧滑，非匀速椭圆
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: true })
  const particles = []

  let width = 0
  let height = 0
  let dpr = 1
  let mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  let animationFrame = 0
  let layerAlpha = 1
  let wind = 0
  let windTarget = 0.12
  let windPhase = 0

  const themes = {
    light: {
      kind: 'petal',
      // 宁少勿多，避免「满屏贴纸感」
      density: 0.000022,
      min: 14,
      max: 34,
      size: [11, 20],
      fall: [0.22, 0.58],
      sway: [0.55, 1.35],
      spin: [0.003, 0.014],
      // 真实樱：近白到浅粉，避免荧光桃
      colors: [
        { tip: [255, 252, 253], mid: [255, 232, 238], base: [255, 205, 218], vein: [232, 168, 184] },
        { tip: [255, 255, 255], mid: [255, 240, 244], base: [250, 214, 224], vein: [228, 175, 190] },
        { tip: [255, 250, 248], mid: [255, 228, 230], base: [245, 198, 205], vein: [220, 160, 170] },
        { tip: [255, 248, 250], mid: [255, 220, 230], base: [248, 190, 205], vein: [225, 155, 175] },
        { tip: [255, 253, 252], mid: [255, 236, 232], base: [252, 210, 212], vein: [230, 172, 176] }
      ],
      alpha: [0.48, 0.78],
      dustRatio: 0.12,
      dustSize: [0.8, 1.5],
      dustAlpha: [0.1, 0.22],
      skyBias: 0.42
    },
    dark: {
      kind: 'star',
      density: 0.00006,
      min: 40,
      max: 88,
      size: [1.1, 2.8],
      drift: [0.03, 0.12],
      twinkle: [0.012, 0.028],
      colors: [
        [235, 242, 255],
        [190, 215, 255],
        [255, 245, 220],
        [210, 200, 255]
      ],
      alpha: [0.45, 0.92],
      fireflyChance: 0.22,
      fireflyColor: [255, 226, 160],
      skyBias: 0.5
    }
  }

  const rand = (min, max) => min + Math.random() * (max - min)
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]
  const currentTheme = () => themes[mode]
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

  const particleCount = theme => {
    const isCompact = width < 768
    const density = isCompact ? theme.density * 0.48 : theme.density
    const min = isCompact ? Math.max(8, Math.round(theme.min * 0.48)) : theme.min
    const max = isCompact ? Math.max(18, Math.round(theme.max * 0.52)) : theme.max
    return Math.max(min, Math.min(max, Math.round(width * height * density)))
  }

  const skyY = bias => {
    const t = Math.pow(Math.random(), 1 + bias)
    return t * height * 0.92
  }

  /**
   * 真实樱瓣轮廓（本地坐标）：
   * - 原点在花瓣基部（连花托的一端，较窄）
   * - 远端（-y）为瓣尖，带植物学特征「凹缺」
   * - 两叶圆润、整体略扁心形，而非椭圆/水滴
   *
   * s = 半宽尺度
   */
  const buildSakuraPetalPath = (c, s) => {
    const w = s
    const h = s * 1.55
    c.beginPath()
    // 基部中点
    c.moveTo(0, 0)
    // 左缘上行至左瓣叶
    c.bezierCurveTo(-w * 0.28, -h * 0.12, -w * 1.05, -h * 0.28, -w * 0.92, -h * 0.58)
    // 左瓣外缘到左尖峰
    c.bezierCurveTo(-w * 0.88, -h * 0.78, -w * 0.55, -h * 0.95, -w * 0.22, -h * 0.98)
    // 凹缺（emarginate cleft）——樱与梅的关键区分
    c.quadraticCurveTo(0, -h * 0.78, w * 0.22, -h * 0.98)
    // 右尖峰到右瓣外缘
    c.bezierCurveTo(w * 0.55, -h * 0.95, w * 0.88, -h * 0.78, w * 0.92, -h * 0.58)
    // 右缘回基部
    c.bezierCurveTo(w * 1.05, -h * 0.28, w * 0.28, -h * 0.12, 0, 0)
    c.closePath()
  }

  const createPetal = theme => {
    const isDust = Math.random() < theme.dustRatio
    if (isDust) {
      return {
        type: 'dust',
        x: rand(0, width),
        y: skyY(theme.skyBias),
        vx: rand(-0.06, 0.06),
        vy: rand(0.04, 0.14),
        size: rand(theme.dustSize[0], theme.dustSize[1]),
        color: pick([
          [255, 248, 240],
          [255, 240, 228],
          [255, 244, 236]
        ]),
        alpha: rand(theme.dustAlpha[0], theme.dustAlpha[1]),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.005, 0.012)
      }
    }

    // depth: 0 远 1 近
    const depth = Math.pow(Math.random(), 1.4)
    const size = rand(theme.size[0], theme.size[1]) * (0.52 + depth * 0.58)
    const palette = pick(theme.colors)

    return {
      type: 'petal',
      x: rand(-40, width + 40),
      y: rand(-height * 0.3, height * 0.65),
      vx: rand(-0.12, 0.28),
      vy: rand(theme.fall[0], theme.fall[1]) * (0.5 + depth * 0.55),
      // 侧滑 / 回旋
      swayAmp: rand(theme.sway[0], theme.sway[1]) * (0.75 + depth * 0.4),
      swayFreq: rand(0.007, 0.016),
      // 平面内旋转
      rotation: rand(0, Math.PI * 2),
      spin: rand(theme.spin[0], theme.spin[1]) * (Math.random() < 0.5 ? -1 : 1),
      // 绕长轴翻滚（看到侧缘）
      roll: rand(0, Math.PI * 2),
      rollSpeed: rand(0.01, 0.028) * (Math.random() < 0.5 ? -1 : 1),
      // 俯仰：轻微点头
      pitch: rand(-0.35, 0.35),
      pitchSpeed: rand(0.008, 0.02),
      size,
      depth,
      palette,
      alpha: rand(theme.alpha[0], theme.alpha[1]) * (0.45 + depth * 0.55),
      phase: rand(0, Math.PI * 2),
      flutter: rand(0.85, 1.2),
      asymmetry: rand(0.92, 1.08), // 左右略不对称更真
      warmth: rand(-5, 6)
    }
  }

  const createStar = theme => {
    const isFirefly = Math.random() < theme.fireflyChance
    const color = isFirefly ? theme.fireflyColor.slice() : pick(theme.colors).slice()
    return {
      type: isFirefly ? 'firefly' : 'star',
      x: rand(0, width),
      y: skyY(theme.skyBias),
      vx: rand(-theme.drift[1], theme.drift[1]),
      vy: rand(-theme.drift[0], theme.drift[0]),
      size: isFirefly ? rand(1.4, 2.6) : rand(theme.size[0], theme.size[1]),
      color,
      alpha: rand(theme.alpha[0], theme.alpha[1]),
      phase: rand(0, Math.PI * 2),
      twinkle: rand(theme.twinkle[0], theme.twinkle[1]),
      twinkleDepth: isFirefly ? 0.55 : 0.35
    }
  }

  const createParticle = theme =>
    theme.kind === 'petal' ? createPetal(theme) : createStar(theme)

  const syncParticles = rebuild => {
    const theme = currentTheme()
    const count = particleCount(theme)
    if (rebuild) particles.length = 0
    while (particles.length < count) particles.push(createParticle(theme))
    while (particles.length > count) particles.pop()
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]
      const ok =
        (theme.kind === 'petal' && (p.type === 'petal' || p.type === 'dust')) ||
        (theme.kind === 'star' && (p.type === 'star' || p.type === 'firefly'))
      if (!ok) particles[i] = createParticle(theme)
    }
    if (theme.kind === 'petal') {
      particles.sort((a, b) => (a.depth || 0) - (b.depth || 0))
    }
  }

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    syncParticles(false)
  }

  const recyclePetal = p => {
    if (p.y > height + 50) {
      p.y = rand(-60, -15)
      p.x = rand(-40, width + 40)
      p.roll = rand(0, Math.PI * 2)
      p.rotation = rand(0, Math.PI * 2)
    } else if (p.x < -60) p.x = width + 40
    else if (p.x > width + 60) p.x = -40
  }

  const recycleStar = p => {
    const m = 8
    if (p.x < -m) p.x = width + m
    if (p.x > width + m) p.x = -m
    if (p.y < -m) p.y = height * 0.75
    if (p.y > height * 0.85) p.y = rand(0, height * 0.5)
  }

  const tint = (rgb, d) => [
    clamp(rgb[0] + d, 0, 255),
    clamp(rgb[1] + d * 0.55, 0, 255),
    clamp(rgb[2] + d * 0.35, 0, 255)
  ]

  const rgba = (rgb, a) =>
    'rgba(' +
    Math.round(rgb[0]) +
    ',' +
    Math.round(rgb[1]) +
    ',' +
    Math.round(rgb[2]) +
    ',' +
    a +
    ')'

  const drawPetal = p => {
    p.phase += p.swayFreq * p.flutter
    p.roll += p.rollSpeed
    p.pitch = Math.sin(p.phase * 0.65) * 0.28
    // 翻滚时自旋略加快（气动力感）
    p.rotation += p.spin * (0.7 + Math.abs(Math.sin(p.roll)) * 0.7)

    const sway = Math.sin(p.phase) * p.swayAmp
    const lateral = Math.sin(p.phase * 0.53 + p.roll) * p.swayAmp * 0.35
    const gust = wind * (0.4 + p.depth * 0.45)
    p.x += p.vx + sway * 0.22 + lateral * 0.12 + gust

    // 侧立时空气阻力小、下落略快；平铺时更飘
    const face = Math.abs(Math.cos(p.roll))
    const drag = 0.72 + face * 0.38
    p.y += p.vy * drag * (1 + Math.sin(p.phase * 1.1) * 0.06)
    recyclePetal(p)

    // 视觉厚度：roll → 水平压扁
    let scaleX = Math.cos(p.roll) * p.asymmetry
    if (Math.abs(scaleX) < 0.1) scaleX = scaleX < 0 ? -0.1 : 0.1
    const scaleY = 1 + Math.sin(p.pitch) * 0.08

    const s = p.size
    const depthFade = 0.5 + p.depth * 0.5
    const alpha = p.alpha * layerAlpha * depthFade
    const edgeOn = Math.abs(scaleX) < 0.28

    const tip = tint(p.palette.tip, p.warmth)
    const mid = tint(p.palette.mid, p.warmth)
    const base = tint(p.palette.base, p.warmth * 0.65)
    const vein = tint(p.palette.vein, p.warmth * 0.4)

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.scale(scaleX, scaleY)

    // 极淡阴影（仅近景）
    if (p.depth > 0.4 && !edgeOn) {
      ctx.save()
      ctx.translate(s * 0.06, s * 0.1)
      ctx.globalAlpha = alpha * 0.1 * p.depth
      buildSakuraPetalPath(ctx, s * 1.02)
      ctx.fillStyle = 'rgba(90, 60, 70, 0.4)'
      ctx.fill()
      ctx.restore()
    }

    buildSakuraPetalPath(ctx, s)

    // 基部(0) → 瓣尖(-y) 渐变：根部略粉，尖端近白
    const h = s * 1.55
    const grad = ctx.createLinearGradient(0, 0, 0, -h)
    grad.addColorStop(0, rgba(base, alpha * 0.95))
    grad.addColorStop(0.4, rgba(mid, alpha))
    grad.addColorStop(0.82, rgba(tip, alpha * 0.95))
    grad.addColorStop(1, rgba(tip, alpha * 0.75))
    ctx.fillStyle = grad
    ctx.fill()

    // 横向柔光：中心略透亮（薄瓣透光）
    if (!edgeOn) {
      const glow = ctx.createRadialGradient(0, -h * 0.45, s * 0.05, 0, -h * 0.45, s * 0.85)
      glow.addColorStop(0, 'rgba(255,255,255,' + alpha * 0.28 + ')')
      glow.addColorStop(0.55, 'rgba(255,240,245,' + alpha * 0.08 + ')')
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glow
      buildSakuraPetalPath(ctx, s)
      ctx.fill()
    }

    // 边缘：极淡粉色描边，不是死白硬线
    ctx.globalAlpha = alpha * 0.4
    ctx.strokeStyle = rgba(tip, 0.65)
    ctx.lineWidth = Math.max(0.5, s * 0.035)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    buildSakuraPetalPath(ctx, s)
    ctx.stroke()

    // 主脉 + 侧脉（仅正面可见）
    if (!edgeOn && Math.abs(scaleX) > 0.4) {
      ctx.globalAlpha = alpha * 0.2
      ctx.strokeStyle = rgba(vein, 0.7)
      ctx.lineWidth = Math.max(0.4, s * 0.03)
      ctx.beginPath()
      // 中脉：基部 → 凹缺底部
      ctx.moveTo(0, -s * 0.05)
      ctx.quadraticCurveTo(s * 0.02 * Math.sign(scaleX), -h * 0.4, 0, -h * 0.72)
      ctx.stroke()

      ctx.globalAlpha = alpha * 0.12
      ctx.lineWidth = Math.max(0.3, s * 0.022)
      ctx.beginPath()
      ctx.moveTo(-s * 0.04, -s * 0.12)
      ctx.quadraticCurveTo(-s * 0.28, -h * 0.4, -s * 0.18, -h * 0.7)
      ctx.moveTo(s * 0.04, -s * 0.12)
      ctx.quadraticCurveTo(s * 0.28, -h * 0.4, s * 0.18, -h * 0.7)
      ctx.stroke()
    }

    ctx.restore()
  }

  const drawDust = p => {
    p.phase += p.twinkle
    p.x += p.vx + wind * 0.12
    p.y += p.vy
    if (p.y > height * 0.85) {
      p.y = rand(0, height * 0.35)
      p.x = rand(0, width)
    }
    const pulse = 0.7 + Math.sin(p.phase) * 0.3
    const [r, g, b] = p.color
    const a = p.alpha * pulse * layerAlpha
    const rad = p.size * 2.4
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad)
    grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')')
    grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawStar = p => {
    p.phase += p.twinkle
    p.x += p.vx
    p.y += p.vy
    recycleStar(p)

    const pulse = 1 - p.twinkleDepth + Math.sin(p.phase) * p.twinkleDepth
    const [r, g, b] = p.color
    const a = p.alpha * pulse * layerAlpha
    const glow = p.type === 'firefly' ? p.size * 7.5 : p.size * 5.5
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow)
    grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + Math.min(1, a * 1.15) + ')')
    grad.addColorStop(0.3, 'rgba(' + r + ',' + g + ',' + b + ',' + a * 0.45 + ')')
    grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(p.x, p.y, glow, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = Math.min(1, a * 1.35)
    ctx.fillStyle = 'rgba(255,255,255,' + (p.type === 'firefly' ? 0.95 : 0.9) + ')'
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(0.9, p.size * 0.7), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  const updateWind = () => {
    windPhase += 0.004
    if (Math.random() < 0.0035) windTarget = rand(-0.28, 0.48)
    // 叠加缓慢正弦，避免整屏齐刷刷
    wind += (windTarget + Math.sin(windPhase) * 0.08 - wind) * 0.012
  }

  const tick = () => {
    ctx.clearRect(0, 0, width, height)
    layerAlpha += (1 - layerAlpha) * 0.06

    if (mode === 'light') updateWind()

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]
      if (p.type === 'petal') drawPetal(p)
      else if (p.type === 'dust') drawDust(p)
      else drawStar(p)
    }

    animationFrame = window.requestAnimationFrame(tick)
  }

  const start = () => {
    if (reduceMotion.matches || animationFrame) return
    canvas.id = 'theme-particles'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.className = 'theme-particles theme-particles--' + mode
    if (!canvas.parentNode) document.body.prepend(canvas)
    resize()
    tick()
  }

  const stop = () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
    if (canvas.parentNode) canvas.remove()
  }

  const setMode = nextMode => {
    const next = nextMode === 'dark' ? 'dark' : 'light'
    if (next === mode) return
    mode = next
    canvas.className = 'theme-particles theme-particles--' + mode
    layerAlpha = 0.15
    wind = 0
    windTarget = 0.12
    syncParticles(true)
  }

  window.addEventListener('resize', () => {
    if (animationFrame) resize()
  })

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) stop()
    else boot()
  })

  new MutationObserver(mutations => {
    if (mutations.some(m => m.attributeName === 'data-theme')) {
      setMode(root.getAttribute('data-theme'))
    }
  }).observe(root, { attributes: true })

  const canRunParticles = () => {
    if (reduceMotion.matches) return false
    if (
      navigator.connection &&
      (navigator.connection.saveData || /2g|slow-2g/.test(navigator.connection.effectiveType || ''))
    ) {
      return false
    }
    const header = document.getElementById('page-header')
    return Boolean(header && header.classList.contains('full_page'))
  }

  const boot = () => {
    if (!canRunParticles()) {
      stop()
      return
    }
    mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    if (!animationFrame) start()
    else {
      canvas.className = 'theme-particles theme-particles--' + mode
      syncParticles(false)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }

  document.addEventListener('pjax:complete', boot)

  // 供本地预览脚本 / 调试：暴露路径构建（仅开发）
  if (typeof window !== 'undefined') {
    window.__blogPetalPath = buildSakuraPetalPath
  }
})()
