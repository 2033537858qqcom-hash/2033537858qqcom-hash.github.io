/**
 * 桌面端光标增强：
 * - 轻量跟随光环（惯性）
 * - 可点击元素放大 / 点击脉冲
 * - 阅读区不抢戏；移动端 / 减少动效 / 可关闭
 * localStorage: blog-cursor-ring = 'off' | 'on'(默认)
 */
(function () {
  const STORAGE_KEY = 'blog-cursor-ring'
  const INTERACTIVE =
    'a, button, summary, label, .site-page, .social-icon, #rightside button, #toggle-menu, #search-button, #card-info-btn, .aplayer, .blog-music-launcher, .cursor-pointer, [role="button"]'

  const canEnhance = () => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return false
    if (window.matchMedia('(max-width: 900px)').matches) return false
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (localStorage.getItem(STORAGE_KEY) === 'off') return false
    return true
  }

  let ring
  let dot
  let raf = 0
  let enabled = false
  let hovering = false
  const mouse = { x: -100, y: -100 }
  const pos = { x: -100, y: -100 }

  const ensureNodes = () => {
    if (ring) return
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

  const setEnabled = on => {
    enabled = on
    document.documentElement.classList.toggle('cursor-enhance', on)
    if (!on) {
      if (ring) ring.classList.remove('is-visible', 'is-hover', 'is-click')
      if (dot) dot.classList.remove('is-visible', 'is-hover')
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      return
    }
    ensureNodes()
    ring.classList.add('is-visible')
    dot.classList.add('is-visible')
    if (!raf) raf = requestAnimationFrame(tick)
  }

  const tick = () => {
    if (!enabled) return
    pos.x += (mouse.x - pos.x) * 0.22
    pos.y += (mouse.y - pos.y) * 0.22
    ring.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)'
    // 实心点更贴近指针，惯性更小
    const dx = mouse.x * 0.55 + pos.x * 0.45
    const dy = mouse.y * 0.55 + pos.y * 0.45
    dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)'
    raf = requestAnimationFrame(tick)
  }

  const onMove = e => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    if (enabled && ring && !ring.classList.contains('is-visible')) {
      ring.classList.add('is-visible')
      dot.classList.add('is-visible')
    }
  }

  const onOver = e => {
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
    dot.classList.add('is-click')
  }

  const onUp = () => {
    if (!ring) return
    ring.classList.remove('is-click')
    if (dot) dot.classList.remove('is-click')
  }

  const onLeave = () => {
    if (ring) ring.classList.remove('is-visible', 'is-hover', 'is-click')
    if (dot) dot.classList.remove('is-visible', 'is-hover', 'is-click')
  }

  const boot = () => {
    setEnabled(canEnhance())
  }

  // 双击右下角空白区域可开关（不增加 UI 噪音）：Alt+C
  const onKey = e => {
    if (!(e.altKey && (e.key === 'c' || e.key === 'C'))) return
    const next = localStorage.getItem(STORAGE_KEY) === 'off' ? 'on' : 'off'
    localStorage.setItem(STORAGE_KEY, next)
    setEnabled(next !== 'off' && canEnhance())
  }

  document.addEventListener('mousemove', onMove, { passive: true })
  document.addEventListener('mouseover', onOver, { passive: true })
  document.addEventListener('mousedown', onDown, { passive: true })
  document.addEventListener('mouseup', onUp, { passive: true })
  document.addEventListener('mouseleave', onLeave, { passive: true })
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', boot)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
  document.addEventListener('pjax:complete', boot)
})()
