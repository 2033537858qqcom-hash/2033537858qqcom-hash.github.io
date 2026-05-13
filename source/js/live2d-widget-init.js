(function () {
  const start = () => {
    if (window.innerWidth < 768 || window.__blogLive2DLoaded) return
    window.__blogLive2DLoaded = true

    const script = document.createElement('script')
    const timer = window.setTimeout(() => {
      script.remove()
    }, 8000)

    script.src = 'https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js'
    script.async = true
    script.onload = () => {
      window.clearTimeout(timer)
      if (!window.L2Dwidget) return
      window.L2Dwidget.init({
        model: {
          jsonPath: 'https://unpkg.com/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json',
          scale: 1
        },
        display: {
          position: 'right',
          width: 150,
          height: 300,
          hOffset: 18,
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

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 2600 })
  } else {
    window.setTimeout(start, 1600)
  }
})()
