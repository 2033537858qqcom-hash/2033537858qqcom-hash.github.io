/**
 * 桌面端光标增强：惯性光环 + 悬停/点击反馈
 * - 仅在桌面精细指针下启用
 * - 首次 mousemove 后再显示，避免左上角残影
 * - PJAX 后自动重建节点
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

    pos.x += (mouse.x - pos.x) * 0.2
    pos.y += (mouse.y - pos.y) * 0.2

    ring.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0) translate(-50%,-50%)'
    // 点更贴合真实指针
    const dx = mouse.x * 0.65 + pos.x * 0.35
    const dy = mouse.y * 0.65 + pos.y * 0.35
    dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) translate(-50%,-50%)'

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
    // 等鼠标真正移动后再显示，避免左上角闪一下
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
    // 正文链接仍算可点，但纯文本区域不算
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
    const cur = localStorage.getItem(STORAGE_KEY)
    const next = cur === 'off' ? 'on' : 'off'
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
    // PJAX 可能卸掉 body 子节点，强制重建
    ring = null
    dot = null
    stopLoop()
    boot()
  })
})()
