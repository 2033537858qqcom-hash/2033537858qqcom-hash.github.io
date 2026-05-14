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

  const start = () => {
    if (window.__blogLive2DLoaded) return
    window.__blogLive2DLoaded = true
    const isCompact = window.innerWidth < 768
    const isTiny = window.innerWidth < 480

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
          jsonPath: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json',
          scale: 1
        },
        display: {
          position: 'right',
          width: isTiny ? 86 : isCompact ? 112 : 150,
          height: isTiny ? 172 : isCompact ? 224 : 300,
          hOffset: isTiny ? 44 : isCompact ? 64 : 92,
          vOffset: -24
        },
        mobile: {
          show: true
        },
        react: {
          opacityDefault: isCompact ? 0.72 : 0.82,
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

  onDomReady(() => window.setTimeout(start, 600))
})()
