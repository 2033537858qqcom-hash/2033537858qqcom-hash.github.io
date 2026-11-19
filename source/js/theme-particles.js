/**
 * 物象化粒子
 * 白天：写实樱瓣（植物学特征：瓣尖凹缺 emarginate + 基端收窄）
 * 夜晚：星屑 / 萤火
 * 性能优化：预渲染离屏精灵（canvas sprite），标签页不可见自动暂停 rAF，防抖 resize
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
  let resizeTimer = 0

  const themes = {
    light: {
      kind: 'petal',
      density: 0.000022,
      min: 14,
      max: 34,
      size: [11, 20],
      fall: [0.22, 0.58],
      sway: [0.55, 1.35],
      spin: [0.003, 0.014],
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
  const pickIndex = len => Math.floor(Math.random() * len)
  const currentTheme = () => themes[mode]
  const rgba = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'

  /** 真实樱瓣轮廓（基部在原点，-y 为凹缺瓣尖） */
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

    const glow = oc.createRadialGradient(0, -h * 0.45, s * 0.05, 0, -h * 0.45, s * 0.85)
    glow.addColorStop(0, 'rgba(255,255,255,0.28)')
    glow.addColorStop(0.55, 'rgba(255,240,245,0.08)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    oc.fillStyle = glow
    buildSakuraPetalPath(oc, s)
    oc.fill()

    oc.globalAlpha = 0.42
    oc.strokeStyle = rgba(palette.tip, 0.65)
    oc.lineWidth = Math.max(0.5, s * 0.035)
    oc.lineJoin = 'round'
    oc.lineCap = 'round'
    buildSakuraPetalPath(oc, s)
    oc.stroke()

    oc.globalAlpha = 0.22
    oc.strokeStyle = rgba(palette.vein, 0.7)
    oc.lineWidth = Math.max(0.4, s * 0.03)
    oc.beginPath()
    oc.moveTo(0, -s * 0.05)
    oc.quadraticCurveTo(s * 0.02, -h * 0.4, 0, -h * 0.72)
    oc.stroke()

    oc.globalAlpha = 0.13
    oc.lineWidth = Math.max(0.3, s * 0.022)
    oc.beginPath()
    oc.moveTo(-s * 0.04, -s * 0.12)
    oc.quadraticCurveTo(-s * 0.28, -h * 0.4, -s * 0.18, -h * 0.7)
    oc.moveTo(s * 0.04, -s * 0.12)
    oc.quadraticCurveTo(s * 0.28, -h * 0.4, s * 0.18, -h * 0.7)
    oc.stroke()

    return { canvas: off, w, h: ch, ox, oy, refSize: s }
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

  const petalSprites = themes.light.colors.map(buildPetalSprite)
  const dustSprites = [
    [255, 248, 240],
    [255, 240, 228],
    [255, 244, 236]
  ].map(c => buildGlowSprite(c, 0))
  const starSprites = themes.dark.colors.map(c => buildGlowSprite(c, 0.9))
  const fireflySprite = buildGlowSprite(themes.dark.fireflyColor, 0.95)

  const particleCount = theme => {
    const isCompact = width < 768
    const density = isCompact ? theme.density * 0.48 : theme.density
    const min = isCompact ? Math.max(8, Math.round(theme.min * 0.48)) : theme.min
    const max = isCompact ? Math.max(18, Math.round(theme.max * 0.52)) : theme.max
    return Math.max(min, Math.min(max, Math.round(width * height * density)))
  }

  const skyY = bias => Math.pow(Math.random(), 1 + bias) * height * 0.92

  const createPetal = theme => {
    if (Math.random() < theme.dustRatio) {
      return {
        type: 'dust',
        x: rand(0, width),
        y: skyY(theme.skyBias),
        vx: rand(-0.06, 0.06),
        vy: rand(0.04, 0.14),
        size: rand(theme.dustSize[0], theme.dustSize[1]),
        sprite: dustSprites[pickIndex(dustSprites.length)],
        alpha: rand(theme.dustAlpha[0], theme.dustAlpha[1]),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.005, 0.012)
      }
    }

    const depth = Math.pow(Math.random(), 1.4)
    const size = rand(theme.size[0], theme.size[1]) * (0.52 + depth * 0.58)
    return {
      type: 'petal',
      x: rand(-40, width + 40),
      y: rand(-height * 0.3, height * 0.65),
      vx: rand(-0.12, 0.28),
      vy: rand(theme.fall[0], theme.fall[1]) * (0.5 + depth * 0.55),
      swayAmp: rand(theme.sway[0], theme.sway[1]) * (0.75 + depth * 0.4),
      swayFreq: rand(0.007, 0.016),
      rotation: rand(0, Math.PI * 2),
      spin: rand(theme.spin[0], theme.spin[1]) * (Math.random() < 0.5 ? -1 : 1),
      roll: rand(0, Math.PI * 2),
      rollSpeed: rand(0.01, 0.028) * (Math.random() < 0.5 ? -1 : 1),
      pitch: rand(-0.35, 0.35),
      size,
      depth,
      sprite: petalSprites[pickIndex(petalSprites.length)],
      alpha: rand(theme.alpha[0], theme.alpha[1]) * (0.45 + depth * 0.55),
      phase: rand(0, Math.PI * 2),
      flutter: rand(0.85, 1.2),
      asymmetry: rand(0.92, 1.08)
    }
  }

  const createStar = theme => {
    const isFirefly = Math.random() < theme.fireflyChance
    return {
      type: isFirefly ? 'firefly' : 'star',
      x: rand(0, width),
      y: skyY(theme.skyBias),
      vx: rand(-theme.drift[1], theme.drift[1]),
      vy: rand(-theme.drift[0], theme.drift[0]),
      size: isFirefly ? rand(1.4, 2.6) : rand(theme.size[0], theme.size[1]),
      sprite: isFirefly ? fireflySprite : starSprites[pickIndex(starSprites.length)],
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

  const drawPetal = p => {
    p.phase += p.swayFreq * p.flutter
    p.roll += p.rollSpeed
    p.pitch = Math.sin(p.phase * 0.65) * 0.28
    p.rotation += p.spin * (0.7 + Math.abs(Math.sin(p.roll)) * 0.7)

    const sway = Math.sin(p.phase) * p.swayAmp
    const lateral = Math.sin(p.phase * 0.53 + p.roll) * p.swayAmp * 0.35
    const gust = wind * (0.4 + p.depth * 0.45)
    p.x += p.vx + sway * 0.22 + lateral * 0.12 + gust

    const face = Math.abs(Math.cos(p.roll))
    const drag = 0.72 + face * 0.38
    p.y += p.vy * drag * (1 + Math.sin(p.phase * 1.1) * 0.06)
    recyclePetal(p)

    let scaleX = Math.cos(p.roll) * p.asymmetry
    if (Math.abs(scaleX) < 0.1) scaleX = scaleX < 0 ? -0.1 : 0.1
    const scaleY = 1 + Math.sin(p.pitch) * 0.08
    const sp = p.sprite
    const k = p.size / sp.refSize
    const depthFade = 0.5 + p.depth * 0.5

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.scale(scaleX * k, scaleY * k)
    ctx.globalAlpha = p.alpha * layerAlpha * depthFade
    ctx.drawImage(sp.canvas, -sp.ox, -sp.oy, sp.w, sp.h)
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
    const rad = p.size * 2.4
    ctx.globalAlpha = p.alpha * pulse * layerAlpha
    ctx.drawImage(p.sprite, p.x - rad, p.y - rad, rad * 2, rad * 2)
  }

  const drawStar = p => {
    p.phase += p.twinkle
    p.x += p.vx
    p.y += p.vy
    recycleStar(p)

    const pulse = 1 - p.twinkleDepth + Math.sin(p.phase) * p.twinkleDepth
    const glow = p.type === 'firefly' ? p.size * 7.5 : p.size * 5.5
    ctx.globalAlpha = Math.min(1, p.alpha * pulse * layerAlpha)
    ctx.drawImage(p.sprite, p.x - glow, p.y - glow, glow * 2, glow * 2)
  }

  const updateWind = () => {
    windPhase += 0.004
    if (Math.random() < 0.0035) windTarget = rand(-0.28, 0.48)
    wind += (windTarget + Math.sin(windPhase) * 0.08 - wind) * 0.012
  }

  const tick = () => {
    if (document.hidden) {
      animationFrame = 0
      return
    }
    ctx.clearRect(0, 0, width, height)
    ctx.globalAlpha = 1
    layerAlpha += (1 - layerAlpha) * 0.06

    if (mode === 'light') updateWind()

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]
      if (p.type === 'petal') drawPetal(p)
      else if (p.type === 'dust') drawDust(p)
      else drawStar(p)
    }
    ctx.globalAlpha = 1

    animationFrame = window.requestAnimationFrame(tick)
  }

  const start = () => {
    if (reduceMotion.matches || animationFrame || document.hidden) return
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
    if (!animationFrame) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(resize, 150)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
    } else if (canRunParticles() && !animationFrame) {
      start()
    }
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
})()
