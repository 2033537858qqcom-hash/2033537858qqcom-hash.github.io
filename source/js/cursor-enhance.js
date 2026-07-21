/**
 * 桌面端「仅光圈」光标：
 * - 隐藏系统箭头，只显示跟随细环 + 中心点
 * - 悬停可点放大，点击轻缩
 * - 移动端 / 触控 / 减少动效自动关闭
 * - Alt+C 开关（localStorage: blog-cursor-ring）
 */
(function () {
  const STORAGE_KEY = 'blog-cursor-ring'
  const INTERACTIVE =
    'a[href], button, summary, label, .site-page, .social-icon, #rightside button, #toggle-menu, #search-button, #card-info-btn, .aplayer, .blog-music-launcher, .cursor-pointer, [role="button"]'

  const canEnhance = () => {
    try {
      if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return false
      if (window.matchMedia('(max-width: 900px)').matches) return false
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
      if (localStorage.getItem(STORAGE_KEY) === 'off') return false
      return true
    } catch (e) {
      return false
    }
  }

  let ring = null
  let dot = null
  let raf = 0
  let enabled = false
  let hovering = false
  let hasMoved = false
  const mouse = { x: 0, y: 0 }
  const pos = { x: 0, y: 0 }

  const inDom = el => el && document.body && document.body.contains(el)

  const ensureNodes = () => {
    if (inDom(ring) && inDom(dot)) return

    if (ring && ring.parentNode) ring.parentNode.removeChild(ring)
    if (dot && dot.parentNode) dot.parentNode.removeChild(dot)

    ring = document.createElement('div')
    ring.id = 'cursor-ring'
    ring.className = 'cursor-ring'
    ring.setAttribute('aria-hidden', 'true')

    dot = document.createElement('div')
    dot.id = 'cursor-dot'
    dot.className = 'cursor-dot'
    dot.setAttribute('aria-hidden', 'true')

    document.body.appendChild(ring)
    document.body.appendChild(dot)
  }

  const stopLoop = () => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const hideVisual = () => {
    if (ring) ring.classList.remove('is-visible', 'is-hover', 'is-click')
    if (dot) dot.classList.remove('is-visible', 'is-hover', 'is-click')
  }

  const tick = () => {
    if (!enabled || !ring || !dot) {
      raf = 0
      return
    }

    // 环稍有惯性，点几乎贴合指针
    pos.x += (mouse.x - pos.x) * 0.18
    pos.y += (mouse.y - pos.y) * 0.18

    ring.style.transform =
      'translate3d(' + pos.x + 'px,' + pos.y + 'px,0) translate(-50%,-50%)'

    const dx = mouse.x * 0.72 + pos.x * 0.28
    const dy = mouse.y * 0.72 + pos.y * 0.28
    dot.style.transform =
      'translate3d(' + dx + 'px,' + dy + 'px,0) translate(-50%,-50%)'

    raf = requestAnimationFrame(tick)
  }

  const setEnabled = on => {
    enabled = Boolean(on)
    document.documentElement.classList.toggle('cursor-enhance', enabled)
    document.documentElement.classList.remove('cursor-hover-interactive')
    hovering = false

    if (!enabled) {
      hideVisual()
      stopLoop()
      return
    }

    ensureNodes()
    if (hasMoved) {
      ring.classList.add('is-visible')
      dot.classList.add('is-visible')
    } else {
      hideVisual()
    }
    if (!raf) raf = requestAnimationFrame(tick)
  }

  const onMove = e => {
    mouse.x = e.clientX
    mouse.y = e.clientY

    if (!hasMoved) {
      hasMoved = true
      pos.x = mouse.x
      pos.y = mouse.y
    }

    if (enabled) {
      ensureNodes()
      ring.classList.add('is-visible')
      dot.classList.add('is-visible')
    }
  }

  const onOver = e => {
    if (!enabled) return
    const el = e.target && e.target.closest && e.target.closest(INTERACTIVE)
    const next = Boolean(el)
    if (next === hovering) return
    hovering = next
    document.documentElement.classList.toggle('cursor-hover-interactive', next)
    if (ring) ring.classList.toggle('is-hover', next)
    if (dot) dot.classList.toggle('is-hover', next)
  }

  const onDown = () => {
    if (!enabled || !ring) return
    ring.classList.add('is-click')
    if (dot) dot.classList.add('is-click')
  }

  const onUp = () => {
    if (ring) ring.classList.remove('is-click')
    if (dot) dot.classList.remove('is-click')
  }

  const onLeave = () => {
    hideVisual()
    hovering = false
    document.documentElement.classList.remove('cursor-hover-interactive')
  }

  const boot = () => {
    setEnabled(canEnhance())
  }

  const onKey = e => {
    if (!(e.altKey && (e.key === 'c' || e.key === 'C'))) return
    e.preventDefault()
    const next = localStorage.getItem(STORAGE_KEY) === 'off' ? 'on' : 'off'
    localStorage.setItem(STORAGE_KEY, next)
    hasMoved = false
    setEnabled(next !== 'off' && canEnhance())
  }

  document.addEventListener('mousemove', onMove, { passive: true })
  document.addEventListener('mouseover', onOver, { passive: true })
  document.addEventListener('mousedown', onDown, { passive: true })
  document.addEventListener('mouseup', onUp, { passive: true })
  document.documentElement.addEventListener('mouseleave', onLeave, { passive: true })
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', boot)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }

  document.addEventListener('pjax:complete', () => {
    ring = null
    dot = null
    stopLoop()
    boot()
  })
})()
