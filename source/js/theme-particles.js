(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const pointer = { x: -9999, y: -9999, active: false }
  const particles = []

  let width = 0
  let height = 0
  let dpr = 1
  let mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  let animationFrame = 0

  const themes = {
    light: {
      density: 0.00007,
      min: 54,
      max: 108,
      speed: 0.28,
      radius: [1.25, 3.2],
      colors: [
        [255, 221, 160],
        [255, 178, 203],
        [142, 194, 255]
      ],
      lineDistance: 0,
      pointerRadius: 150,
      pointerForce: 0.046,
      drift: 0.0018,
      alpha: 0.9
    },
    dark: {
      density: 0.00011,
      min: 76,
      max: 160,
      speed: 0.42,
      radius: [1, 2.8],
      colors: [
        [152, 185, 255],
        [199, 167, 255],
        [255, 215, 161]
      ],
      lineDistance: 155,
      pointerRadius: 180,
      pointerForce: 0.058,
      drift: 0.0024,
      alpha: 0.96
    }
  }

  const rand = (min, max) => min + Math.random() * (max - min)
  const currentTheme = () => themes[mode]

  const pickColor = theme => {
    const color = theme.colors[Math.floor(Math.random() * theme.colors.length)]
    return color.slice()
  }

  const particleCount = theme => {
    const isCompact = width < 768
    const density = isCompact ? theme.density * 0.45 : theme.density
    const min = isCompact ? Math.max(18, Math.round(theme.min * 0.4)) : theme.min
    const max = isCompact ? Math.max(36, Math.round(theme.max * 0.45)) : theme.max
    return Math.max(min, Math.min(max, Math.round(width * height * density)))
  }

  const createParticle = theme => {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(theme.speed * 0.25, theme.speed)
    return {
      x: rand(0, width),
      y: rand(0, height),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      baseVx: Math.cos(angle) * speed,
      baseVy: Math.sin(angle) * speed,
      radius: rand(theme.radius[0], theme.radius[1]),
      color: pickColor(theme),
      phase: rand(0, Math.PI * 2),
      twinkle: rand(0.012, 0.028)
    }
  }

  const syncParticles = () => {
    const theme = currentTheme()
    const count = particleCount(theme)

    while (particles.length < count) particles.push(createParticle(theme))
    while (particles.length > count) particles.pop()

    particles.forEach(particle => {
      particle.color = pickColor(theme)
      particle.radius = Math.min(Math.max(particle.radius, theme.radius[0]), theme.radius[1])
    })
  }

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    syncParticles()
  }

  const wrap = particle => {
    const margin = 24
    if (particle.x < -margin) particle.x = width + margin
    if (particle.x > width + margin) particle.x = -margin
    if (particle.y < -margin) particle.y = height + margin
    if (particle.y > height + margin) particle.y = -margin
  }

  const disturb = (particle, theme) => {
    if (!pointer.active) return

    const dx = particle.x - pointer.x
    const dy = particle.y - pointer.y
    const distanceSq = dx * dx + dy * dy
    const radiusSq = theme.pointerRadius * theme.pointerRadius

    if (distanceSq > radiusSq || distanceSq === 0) return

    const distance = Math.sqrt(distanceSq)
    const strength = (1 - distance / theme.pointerRadius) * theme.pointerForce
    particle.vx += (dx / distance) * strength * theme.pointerRadius
    particle.vy += (dy / distance) * strength * theme.pointerRadius
  }

  const drawParticle = (particle, theme) => {
    particle.phase += particle.twinkle
    const pulse = 0.72 + Math.sin(particle.phase) * 0.28
    const alpha = theme.alpha * pulse
    const [r, g, b] = particle.color

    const gradient = ctx.createRadialGradient(
      particle.x,
      particle.y,
      0,
      particle.x,
      particle.y,
      particle.radius * 5
    )
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`)
    gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${alpha * 0.22})`)
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.radius * 5, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawLines = theme => {
    if (!theme.lineDistance) return

    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const a = particles[i]
        const b = particles[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > theme.lineDistance) continue

        const alpha = (1 - distance / theme.lineDistance) * 0.24
        ctx.strokeStyle = `rgba(170, 198, 255, ${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }

  const tick = () => {
    const theme = currentTheme()
    ctx.clearRect(0, 0, width, height)

    particles.forEach(particle => {
      disturb(particle, theme)
      particle.vx += (particle.baseVx - particle.vx) * 0.018
      particle.vy += (particle.baseVy - particle.vy) * 0.018
      particle.x += particle.vx + Math.sin(particle.phase) * theme.drift
      particle.y += particle.vy + Math.cos(particle.phase) * theme.drift
      wrap(particle)
    })

    drawLines(theme)
    particles.forEach(particle => drawParticle(particle, theme))
    animationFrame = window.requestAnimationFrame(tick)
  }

  const start = () => {
    if (reduceMotion.matches || animationFrame) return
    canvas.id = 'theme-particles'
    canvas.setAttribute('aria-hidden', 'true')
    document.body.prepend(canvas)
    resize()
    tick()
  }

  const stop = () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
    canvas.remove()
  }

  const setMode = nextMode => {
    mode = nextMode === 'dark' ? 'dark' : 'light'
    syncParticles()
  }

  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', event => {
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.active = true
  })
  window.addEventListener('mouseleave', () => {
    pointer.active = false
  })

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      stop()
    } else {
      start()
    }
  })

  new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.attributeName === 'data-theme')) {
      setMode(root.getAttribute('data-theme'))
    }
  }).observe(root, { attributes: true })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
