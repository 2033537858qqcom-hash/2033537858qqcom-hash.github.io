/**
 * Live2D：仅桌面宽屏、非省电、非弱网、非首页以外可延后加载。
 */
(function () {
  const shouldLoadLive2D = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (window.matchMedia('(max-width: 900px)').matches) return false
    if (navigator.connection) {
      const c = navigator.connection
      if (c.saveData || /2g|slow-2g/.test(c.effectiveType || '')) return false
    }
    return true
  }

  const start = () => {
    if (window.__blogLive2DLoaded || !shouldLoadLive2D()) return
    window.__blogLive2DLoaded = true

    const script = document.createElement('script')
    const timer = window.setTimeout(() => script.remove(), 8000)

    script.src = 'https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js'
    script.async = true
    script.onload = () => {
      window.clearTimeout(timer)
      if (!window.L2Dwidget || !shouldLoadLive2D()) return
      window.L2Dwidget.init({
        model: {
          jsonPath: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json',
          scale: 1
        },
        display: {
          position: 'right',
          width: 140,
          height: 280,
          hOffset: 88,
          vOffset: -20
        },
        mobile: { show: false },
        react: {
          opacityDefault: 0.78,
          opacityOnHover: 1
        },
        dialog: { enable: false }
      })
    }
    script.onerror = () => window.clearTimeout(timer)
    document.body.appendChild(script)
  }

  const schedule = () => {
    if (!shouldLoadLive2D()) return
    const run = () => window.setTimeout(start, 1800)
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 4000 })
    } else {
      run()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true })
  } else {
    schedule()
  }
})()
