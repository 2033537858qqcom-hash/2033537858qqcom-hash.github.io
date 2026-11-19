/**
 * 桌面端「仅光圈」光标：
 * - 外层负责定位（translate3d），内层 .cursor-ring__shape 仅用 transform: scale(...) 过渡，不触发布局重算
 * - 鼠标静止时自动停止 rAF 空转，移动时恢复
 * - 悬停跨域 iframe 时自动隐退并恢复原生光标，避免卡在边框
 * - Alt+C 或右键菜单可随时开关（localStorage: blog-cursor-ring）
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
  let raf = 0
  let enabled = false
  let hovering = false
  let hasMoved = false
  let overIframe = false
  const mouse = { x: 0, y: 0 }
  const pos = { x: 0, y: 0 }

  const removeEl = el => {
    if (el && el.parentNode) el.parentNode.removeChild(el)
  }

  const purgeOrphans = () => {
    try {
      document.querySelectorAll('#cursor-ring, #cursor-dot, .cursor-ring, .cursor-dot').forEach(removeEl)
    } catch (e) {
      /* ignore */
    }
    ring = null
  }

  const inDom = el => el && document.body && document.body.contains(el)

  const ensureNodes = () => {
    if (inDom(ring)) return
    purgeOrphans()

    ring = document.createElement('div')
    ring.id = 'cursor-ring'
    ring.className = 'cursor-ring'
    ring.setAttribute('aria-hidden', 'true')

    const shape = document.createElement('span')
    shape.className = 'cursor-ring__shape'
    ring.appendChild(shape)

    document.body.appendChild(ring)
  }

  const stopLoop = () => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const startLoop = () => {
    if (!raf && enabled && hasMoved && !overIframe) {
      raf = requestAnimationFrame(tick)
    }
  }

  const hideVisual = () => {
    if (ring) ring.classList.remove('is-visible', 'is-hover', 'is-click')
  }

  const tick = () => {
    if (!enabled || !ring || overIframe) {
      raf = 0
      return
    }

    const dx = mouse.x - pos.x
    const dy = mouse.y - pos.y

    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
      pos.x = mouse.x
      pos.y = mouse.y
      ring.style.transform =
        'translate3d(' + pos.x + 'px,' + pos.y + 'px,0) translate(-50%,-50%)'
      raf = 0
      return
    }

    pos.x += dx * 0.35
    pos.y += dy * 0.35
    ring.style.transform =
      'translate3d(' + pos.x + 'px,' + pos.y + 'px,0) translate(-50%,-50%)'

    raf = requestAnimationFrame(tick)
  }

  const setEnabled = on => {
    enabled = Boolean(on)
    document.documentElement.classList.toggle('cursor-enhance', enabled)
    document.documentElement.classList.remove('cursor-hover-interactive')
    hovering = false
    overIframe = false

    if (!enabled) {
      hideVisual()
      stopLoop()
      purgeOrphans()
      return
    }

    ensureNodes()
    if (hasMoved) {
      ring.style.transform =
        'translate3d(' + pos.x + 'px,' + pos.y + 'px,0) translate(-50%,-50%)'
      ring.classList.add('is-visible')
      startLoop()
    } else {
      hideVisual()
    }
  }

  const toggleEnabled = () => {
    const next = localStorage.getItem(STORAGE_KEY) === 'off' ? 'on' : 'off'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch (e) {}
    setEnabled(next !== 'off' && canEnhance())
    return next !== 'off'
  }

  window.__toggleCursorRing = toggleEnabled

  const onMove = e => {
    mouse.x = e.clientX
    mouse.y = e.clientY

    if (!hasMoved) {
      hasMoved = true
      pos.x = mouse.x
      pos.y = mouse.y
    }

    if (enabled && !overIframe) {
      ensureNodes()
      ring.classList.add('is-visible')
      startLoop()
    }
  }

  const onOver = e => {
    if (!enabled) return
    const target = e.target
    const inIframe = Boolean(target && target.tagName === 'IFRAME')
    if (inIframe !== overIframe) {
      overIframe = inIframe
      if (overIframe) {
        hideVisual()
        stopLoop()
        document.documentElement.classList.remove('cursor-enhance')
      } else {
        document.documentElement.classList.add('cursor-enhance')
        if (hasMoved && ring) {
          ring.classList.add('is-visible')
          startLoop()
        }
      }
    }
    if (overIframe) return

    const el = target && target.closest && target.closest(INTERACTIVE)
    const next = Boolean(el)
    if (next === hovering) return
    hovering = next
    document.documentElement.classList.toggle('cursor-hover-interactive', next)
    if (ring) ring.classList.toggle('is-hover', next)
  }

  const onDown = () => {
    if (!enabled || !ring || overIframe) return
    ring.classList.add('is-click')
  }

  const onUp = () => {
    if (ring) ring.classList.remove('is-click')
  }

  const onLeave = () => {
    hideVisual()
    stopLoop()
    hovering = false
    document.documentElement.classList.remove('cursor-hover-interactive')
  }

  const boot = () => {
    setEnabled(canEnhance())
  }

  const onKey = e => {
    if (!(e.altKey && (e.key === 'c' || e.key === 'C'))) return
    e.preventDefault()
    toggleEnabled()
  }

  const onPjax = () => {
    stopLoop()
    purgeOrphans()
    hovering = false
    overIframe = false
    document.documentElement.classList.remove('cursor-hover-interactive')
    boot()
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

  document.addEventListener('pjax:complete', onPjax)
  document.addEventListener('pjax:send', () => {
    hideVisual()
    stopLoop()
  })
})()
