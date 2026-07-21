/**
 * 桌面端「仅光圈」光标：
 * - 隐藏系统箭头，只显示一个跟随细环（中心点用 ::after，避免双元素漂移）
 * - 悬停可点放大，点击轻缩
 * - 移动端 / 触控 / 减少动效自动关闭
 * - Alt+C 开关（localStorage: blog-cursor-ring）
 * - Pjax 导航时清理残留节点，避免叠出多个光圈
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
  const mouse = { x: 0, y: 0 }
  const pos = { x: 0, y: 0 }

  const removeEl = el => {
    if (el && el.parentNode) el.parentNode.removeChild(el)
  }

  /** 清掉 body 上所有历史光标节点（含 Pjax 残留） */
  const purgeOrphans = () => {
    try {
      document.querySelectorAll('#cursor-ring, #cursor-dot, .cursor-ring, .cursor-dot').forEach(el => {
        removeEl(el)
      })
    } catch (e) {
      /* ignore */
    }
    ring = null
  }

  const inDom = el => el && document.body && document.body.contains(el)

  const ensureNodes = () => {
    if (inDom(ring)) return

    // 引用丢失或节点被 Pjax 换掉时，先清孤儿再重建
    purgeOrphans()

    ring = document.createElement('div')
    ring.id = 'cursor-ring'
    ring.className = 'cursor-ring'
    ring.setAttribute('aria-hidden', 'true')
    document.body.appendChild(ring)
  }

  const stopLoop = () => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const hideVisual = () => {
    if (ring) ring.classList.remove('is-visible', 'is-hover', 'is-click')
  }

  const tick = () => {
    if (!enabled || !ring) {
      raf = 0
      return
    }

    // 轻微惯性，单节点跟随，不会出现双圈
    pos.x += (mouse.x - pos.x) * 0.32
    pos.y += (mouse.y - pos.y) * 0.32

    ring.style.transform =
      'translate3d(' + pos.x + 'px,' + pos.y + 'px,0) translate(-50%,-50%)'

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
      purgeOrphans()
      return
    }

    ensureNodes()
    if (hasMoved) {
      ring.classList.add('is-visible')
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
  }

  const onDown = () => {
    if (!enabled || !ring) return
    ring.classList.add('is-click')
  }

  const onUp = () => {
    if (ring) ring.classList.remove('is-click')
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

  const onPjax = () => {
    stopLoop()
    purgeOrphans()
    hovering = false
    document.documentElement.classList.remove('cursor-hover-interactive')
    // 保留 hasMoved / mouse，导航后立刻能显示
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
    // 切页瞬间先藏起，避免旧环留在原地
    hideVisual()
  })
})()
