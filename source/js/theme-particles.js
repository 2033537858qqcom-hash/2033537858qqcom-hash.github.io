/**
 * 物象化粒子，贴合昼夜风景背景
 * - 白天：写实向樱花瓣（贝塞尔轮廓 + 渐变 + 翻面/风摆）+ 极淡阳光尘
 * - 夜晚：慢闪星屑 / 萤火
 * - 仅首页 full_page；尊重 reduced-motion / 省流
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const particles = []

  let width = 0
  let height = 0
  let dpr = 1
  let mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  let animationFrame = 0
  let layerAlpha = 1
  let wind = 0
  let windTarget = 0
  let time = 0

  const themes = {
    light: {
      kind: 'petal',
      // 宁少勿多：少而清楚的真花瓣，比密密麻麻的椭圆更自然
      density: 0.000028,
      min: 18,
      max: 42,
      size: [9, 18],
      fall: [0.28, 0.72],
      sway: [0.45, 1.15],
      spin: [0.004, 0.018],
      // 偏真实樱：外缘粉白、心部略深粉，避免荧光粉
      colors: [
        { tip: [255, 248, 250], mid: [255, 214, 226], base: [244, 170, 190] },
        { tip: [255, 252, 252], mid: [255, 224, 232], base: [248, 186, 200] },
        { tip: [255, 250, 246], mid: [255, 220, 218], base: [240, 176, 182] },
        { tip: [255, 246, 248], mid: [252, 206, 220], base: [230, 158, 178] },
        { tip: [255, 250, 252], mid: [255, 230, 236], base: [250, 196, 210] }
      ],
      alpha: [0.55, 0.88],
      dustRatio: 0.18,
      dustSize: [0.9, 1.8],
      dustAlpha: [0.12, 0.28],
      skyBias: 0.4
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

  const particleCount = theme => {
    const isCompact = width < 768
    const density = isCompact ? theme.density * 0.5 : theme.density
    const min = isCompact ? Math.max(10, Math.round(theme.min * 0.5)) : theme.min
    const max = isCompact ? Math.max(22, Math.round(theme.max * 0.55)) : theme.max
    return Math.max(min, Math.min(max, Math.round(width * height * density)))
  }

  const skyY = bias => {
    const t = Math.pow(Math.random(), 1 + bias)
    return t * height * 0.92
  }

  /** 樱花单瓣轮廓：顶端微凹、两侧弧、底尖（本地坐标系） */
  const buildPetalPath = (c, s) => {
    c.beginPath()
    // 顶端缺口（樱瓣特征）
    c.moveTo(0, -s * 0.08)
    c.bezierCurveTo(s * 0.12, -s * 0.22, s * 0.22, -s * 0.35, s * 0.08, -s * 0.42)
    // 右上瓣缘
    c.bezierCurveTo(s * 0.72, -s * 0.78, s * 1.02, -s * 0.12, s * 0.62, s * 0.38)
    // 右下到瓣尖
    c.bezierCurveTo(s * 0.38, s * 0.72, s * 0.12, s * 0.92, 0, s * 1.02)
    // 对称左半
    c.bezierCurveTo(-s * 0.12, s * 0.92, -s * 0.38, s * 0.72, -s * 0.62, s * 0.38)
    c.bezierCurveTo(-s * 1.02, -s * 0.12, -s * 0.72, -s * 0.78, -s * 0.08, -s * 0.42)
    c.bezierCurveTo(-s * 0.22, -s * 0.35, -s * 0.12, -s * 0.22, 0, -s * 0.08)
    c.closePath()
  }

  const createPetal = theme => {
    const isDust = Math.random() < theme.dustRatio
    if (isDust) {
      const dustTone = pick([
        [255, 248, 236],
        [255, 236, 220],
        [255, 242, 230]
      ])
      return {
        type: 'dust',
        x: rand(0, width),
        y: skyY(theme.skyBias),
        vx: rand(-0.08, 0.08),
        vy: rand(0.05, 0.18),
        size: rand(theme.dustSize[0], theme.dustSize[1]),
        color: dustTone,
        alpha: rand(theme.dustAlpha[0], theme.dustAlpha[1]),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.006, 0.014)
      }
    }

    const depth = Math.pow(Math.random(), 1.35) // 0 远 1 近
    const size = rand(theme.size[0], theme.size[1]) * (0.55 + depth * 0.55)
    const palette = pick(theme.colors)
    const fallScale = 0.55 + depth * 0.55

    return {
      type: 'petal',
      x: rand(-30, width + 30),
      y: rand(-height * 0.25, height * 0.7),
      // 基础风速 + 个体漂移
      vx: rand(-0.15, 0.35),
      vy: rand(theme.fall[0], theme.fall[1]) * fallScale,
      swayAmp: rand(theme.sway[0], theme.sway[1]) * (0.7 + depth * 0.5),
      swaySpeed: rand(0.006, 0.014),
      size,
      depth,
      // 三维翻面：绕纵轴翻转感
      flip: rand(0, Math.PI * 2),
      flipSpeed: rand(0.012, 0.028) * (Math.random() < 0.5 ? -1 : 1),
      rotation: rand(0, Math.PI * 2),
      spin: rand(theme.spin[0], theme.spin[1]) * (Math.random() < 0.5 ? -1 : 1),
      // 自旋会随翻面略变
      spinBase: 0,
      palette,
      alpha: rand(theme.alpha[0], theme.alpha[1]) * (0.5 + depth * 0.55),
      phase: rand(0, Math.PI * 2),
      flutter: rand(0.8, 1.25),
      // 轻微个体色差
      warmth: rand(-6, 8)
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

  const createParticle = theme => {
    return theme.kind === 'petal' ? createPetal(theme) : createStar(theme)
  }

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
    if (p.y > height + 40) {
      p.y = rand(-50, -12)
      p.x = rand(-30, width + 30)
      p.flip = rand(0, Math.PI * 2)
    } else if (p.x < -50) {
      p.x = width + 30
    } else if (p.x > width + 50) {
      p.x = -30
    }
  }

  const recycleStar = p => {
    const m = 8
    if (p.x < -m) p.x = width + m
    if (p.x > width + m) p.x = -m
    if (p.y < -m) p.y = height * 0.75
    if (p.y > height * 0.85) p.y = rand(0, height * 0.5)
  }

  const tint = (rgb, d) => [
    Math.max(0, Math.min(255, rgb[0] + d)),
    Math.max(0, Math.min(255, rgb[1] + d * 0.6)),
    Math.max(0, Math.min(255, rgb[2] + d * 0.4))
  ]

  const rgba = (rgb, a) =>
    'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',' + a + ')'

  const drawPetal = p => {
    p.phase += 0.012 * p.flutter
    p.flip += p.flipSpeed
    p.rotation += p.spin * (0.65 + Math.abs(Math.sin(p.flip)) * 0.55)

    // 风 + 个体左右摆：下落时略有「飘」
    const sway = Math.sin(p.phase) * p.swayAmp
    const flutterX = Math.sin(p.phase * 1.7 + p.flip) * p.swayAmp * 0.22
    p.x += p.vx + sway * 0.28 + flutterX * 0.15 + wind * (0.35 + p.depth * 0.4)
    // 翻面时迎风阻力略变，速度微起伏
    const flipFactor = 0.82 + Math.abs(Math.cos(p.flip)) * 0.28
    p.y += p.vy * flipFactor
    recyclePetal(p)

    // 透视压扁：cos 接近 0 时看到侧面
    let scaleX = Math.cos(p.flip)
    const edgeOn = Math.abs(scaleX) < 0.12
    if (Math.abs(scaleX) < 0.08) scaleX = scaleX < 0 ? -0.08 : 0.08

    const s = p.size
    const depthFade = 0.55 + p.depth * 0.45
    const alpha = p.alpha * layerAlpha * depthFade

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.scale(scaleX, 1)

    // 极淡阴影（近处更明显）
    if (p.depth > 0.35 && !edgeOn) {
      ctx.save()
      ctx.translate(s * 0.08, s * 0.12)
      ctx.globalAlpha = alpha * 0.12 * p.depth
      buildPetalPath(ctx, s * 1.02)
      ctx.fillStyle = 'rgba(120, 80, 90, 0.35)'
      ctx.fill()
      ctx.restore()
    }

    buildPetalPath(ctx, s)

    const tip = tint(p.palette.tip, p.warmth)
    const mid = tint(p.palette.mid, p.warmth)
    const base = tint(p.palette.base, p.warmth * 0.7)

    // 纵向渐变：瓣尖偏白 → 中部粉 → 根部略深
    const grad = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.95)
    grad.addColorStop(0, rgba(tip, alpha * 0.95))
    grad.addColorStop(0.45, rgba(mid, alpha))
    grad.addColorStop(1, rgba(base, alpha * 0.92))
    ctx.fillStyle = grad
    ctx.fill()

    // 边缘柔光（替代死白描边）
    ctx.globalAlpha = alpha * 0.35
    ctx.strokeStyle = rgba(tip, 0.55)
    ctx.lineWidth = Math.max(0.6, s * 0.04)
    ctx.lineJoin = 'round'
    ctx.stroke()

    // 中脉：很淡的曲线，不是生硬白线
    if (!edgeOn && Math.abs(scaleX) > 0.35) {
      ctx.globalAlpha = alpha * 0.22
      ctx.strokeStyle = rgba(base, 0.55)
      ctx.lineWidth = Math.max(0.45, s * 0.035)
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.15)
      ctx.quadraticCurveTo(s * 0.04 * Math.sign(scaleX), s * 0.2, 0, s * 0.85)
      ctx.stroke()

      // 两侧细脉
      ctx.globalAlpha = alpha * 0.12
      ctx.lineWidth = Math.max(0.35, s * 0.025)
      ctx.beginPath()
      ctx.moveTo(-s * 0.05, -s * 0.05)
      ctx.quadraticCurveTo(-s * 0.22, s * 0.25, -s * 0.12, s * 0.7)
      ctx.moveTo(s * 0.05, -s * 0.05)
      ctx.quadraticCurveTo(s * 0.22, s * 0.25, s * 0.12, s * 0.7)
      ctx.stroke()
    }

    // 高光斑：瓣面一侧一点反光
    if (Math.abs(scaleX) > 0.45) {
      const hx = -s * 0.18 * Math.sign(scaleX)
      const hy = -s * 0.05
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, s * 0.45)
      hg.addColorStop(0, 'rgba(255,255,255,' + alpha * 0.35 + ')')
      hg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.globalAlpha = 1
      ctx.fillStyle = hg
      ctx.beginPath()
      ctx.ellipse(hx, hy, s * 0.28, s * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  const drawDust = p => {
    p.phase += p.twinkle
    p.x += p.vx + wind * 0.15
    p.y += p.vy
    if (p.y > height * 0.85) {
      p.y = rand(0, height * 0.35)
      p.x = rand(0, width)
    }

    const pulse = 0.7 + Math.sin(p.phase) * 0.3
    const [r, g, b] = p.color
    const a = p.alpha * pulse * layerAlpha
    const rad = p.size * 2.6
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
    // 缓慢变化的微风，避免全体同速平移的假感
    if (Math.random() < 0.004) windTarget = rand(-0.35, 0.55)
    wind += (windTarget - wind) * 0.01
  }

  const tick = () => {
    time += 1
    ctx.clearRect(0, 0, width, height)
    layerAlpha += (1 - layerAlpha) * 0.06

    if (mode === 'light') updateWind()

    // 远处先画、近处后画，增加层次
    if (mode === 'light') {
      particles.sort((a, b) => (a.depth || 0) - (b.depth || 0))
    }

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
    windTarget = 0
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
    if (navigator.connection && (navigator.connection.saveData || /2g|slow-2g/.test(navigator.connection.effectiveType || ''))) {
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
})()
