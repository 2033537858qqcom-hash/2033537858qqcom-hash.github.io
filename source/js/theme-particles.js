/**
 * 方案 B：物象化粒子，贴合昼夜风景背景
 * - 白天：稀疏半透明樱花瓣（椭圆旋转下落）+ 少量阳光尘
 * - 夜晚：慢闪星屑 / 萤火（无连线、几乎不飘）
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

  const themes = {
    light: {
      kind: 'petal',
      // 数量约提到原先克制版的 1.8–2 倍，保证扫一眼能感到「有动静」
      density: 0.000055,
      min: 36,
      max: 78,
      size: [7, 16],
      fall: [0.4, 1.05],
      sway: [0.35, 0.95],
      spin: [0.01, 0.035],
      colors: [
        [255, 228, 236],
        [255, 198, 218],
        [255, 240, 244],
        [255, 210, 200],
        [255, 184, 204]
      ],
      alpha: [0.42, 0.78],
      dustRatio: 0.28,
      dustSize: [1.2, 2.6],
      dustAlpha: [0.28, 0.55],
      skyBias: 0.45
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
    // 移动端仍减半，但比上一版更可见
    const density = isCompact ? theme.density * 0.55 : theme.density
    const min = isCompact ? Math.max(18, Math.round(theme.min * 0.55)) : theme.min
    const max = isCompact ? Math.max(34, Math.round(theme.max * 0.6)) : theme.max
    return Math.max(min, Math.min(max, Math.round(width * height * density)))
  }

  /** 偏天空：y 更可能落在画面上半 */
  const skyY = bias => {
    // bias 越大越靠上；用幂函数把采样压向上半
    const t = Math.pow(Math.random(), 1 + bias)
    return t * height * 0.92
  }

  const createPetal = theme => {
    const isDust = Math.random() < theme.dustRatio
    const color = pick(theme.colors).slice()
    if (isDust) {
      return {
        type: 'dust',
        x: rand(0, width),
        y: skyY(theme.skyBias),
        vx: rand(-0.12, 0.12),
        vy: rand(0.08, 0.28),
        size: rand(theme.dustSize[0], theme.dustSize[1]),
        color,
        alpha: rand(theme.dustAlpha[0], theme.dustAlpha[1]),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.01, 0.02)
      }
    }

    const size = rand(theme.size[0], theme.size[1])
    return {
      type: 'petal',
      x: rand(-20, width + 20),
      y: rand(-height * 0.2, height * 0.75),
      vx: rand(-theme.sway[1], theme.sway[1]) * 0.35,
      vy: rand(theme.fall[0], theme.fall[1]),
      swayAmp: rand(theme.sway[0], theme.sway[1]),
      swaySpeed: rand(0.008, 0.02),
      size,
      // 花瓣扁度
      aspect: rand(0.35, 0.55),
      rotation: rand(0, Math.PI * 2),
      spin: rand(theme.spin[0], theme.spin[1]) * (Math.random() < 0.5 ? -1 : 1),
      color,
      alpha: rand(theme.alpha[0], theme.alpha[1]),
      phase: rand(0, Math.PI * 2)
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
      // 萤火闪得更慢、更柔
      twinkleDepth: isFirefly ? 0.55 : 0.35
    }
  }

  const createParticle = theme => {
    return theme.kind === 'petal' ? createPetal(theme) : createStar(theme)
  }

  const syncParticles = rebuild => {
    const theme = currentTheme()
    const count = particleCount(theme)

    if (rebuild) {
      particles.length = 0
    }

    while (particles.length < count) particles.push(createParticle(theme))
    while (particles.length > count) particles.pop()

    // 模式切换时类型不对则重建该粒子
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

  const recyclePetal = (p, theme) => {
    if (p.y > height + 30) {
      p.y = rand(-40, -10)
      p.x = rand(-20, width + 20)
    } else if (p.x < -40) {
      p.x = width + 20
    } else if (p.x > width + 40) {
      p.x = -20
    }
  }

  const recycleStar = p => {
    const m = 8
    if (p.x < -m) p.x = width + m
    if (p.x > width + m) p.x = -m
    if (p.y < -m) p.y = height * 0.75
    if (p.y > height * 0.85) p.y = rand(0, height * 0.5)
  }

  const drawPetal = p => {
    p.phase += 0.018
    p.rotation += p.spin
    p.x += p.vx + Math.sin(p.phase) * p.swayAmp * 0.42
    p.y += p.vy
    recyclePetal(p)

    const [r, g, b] = p.color
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.globalAlpha = p.alpha * layerAlpha

    const rx = p.size
    const ry = p.size * p.aspect

    // 实体花瓣（更易看见）+ 外缘柔光
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.92)'
    ctx.fill()

    ctx.globalAlpha = p.alpha * 0.55 * layerAlpha
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.35)
    glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.5)')
    glow.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.ellipse(0, 0, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = p.alpha * 0.45 * layerAlpha
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(0, -ry * 0.75)
    ctx.quadraticCurveTo(rx * 0.18, 0, 0, ry * 0.75)
    ctx.stroke()

    ctx.restore()
  }

  const drawDust = p => {
    p.phase += p.twinkle
    p.x += p.vx
    p.y += p.vy
    if (p.y > height * 0.85) {
      p.y = rand(0, height * 0.35)
      p.x = rand(0, width)
    }

    const pulse = 0.75 + Math.sin(p.phase) * 0.25
    const [r, g, b] = p.color
    const a = p.alpha * pulse * layerAlpha
    const rad = p.size * 3
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

  const tick = () => {
    const theme = currentTheme()
    ctx.clearRect(0, 0, width, height)

    // 层透明度缓动（主题切换时更柔）
    layerAlpha += ((1) - layerAlpha) * 0.06

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
