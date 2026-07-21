(function () {
  const onDomReady = callback => {
    let called = false
    const run = () => {
      if (called) return
      called = true
      callback()
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true })
    } else {
      run()
    }
  }

  const shouldLoadLive2D = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (window.matchMedia('(max-width: 768px)').matches) return false
    if (navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''))) {
      return false
    }
    return true
  }

  const start = () => {
    if (window.__blogLive2DLoaded || !shouldLoadLive2D()) return
    window.__blogLive2DLoaded = true

    const script = document.createElement('script')
    const timer = window.setTimeout(() => {
      script.remove()
    }, 8000)

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
          width: 150,
          height: 300,
          hOffset: 92,
          vOffset: -24
        },
        mobile: {
          show: false
        },
        react: {
          opacityDefault: 0.82,
          opacityOnHover: 1
        },
        dialog: {
          enable: false
        }
      })
    }
    script.onerror = () => {
      window.clearTimeout(timer)
    }
    document.body.appendChild(script)
  }

  onDomReady(() => window.setTimeout(start, 800))
})()
