/**
 * Live2D 看板娘（桌面端）
 * - 全站显示（宽屏桌面）；移动端 / 触控 / 省流 / 减少动效关闭
 * - 多 CDN 回退（jsDelivr 在国内常失败）
 * - Pjax 切页时清理残留 canvas，避免叠层或「消失」
 */
(function () {
  const SCRIPT_CANDIDATES = [
    'https://registry.npmmirror.com/live2d-widget/3.1.4/files/lib/L2Dwidget.min.js',
    'https://unpkg.com/live2d-widget@3.1.4/lib/L2Dwidget.min.js',
    'https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js'
  ]

  const MODEL_CANDIDATES = [
    'https://registry.npmmirror.com/live2d-widget-model-haruto/1.0.5/files/assets/haruto.model.json',
    'https://unpkg.com/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json',
    'https://cdn.jsdelivr.net/npm/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json'
  ]

  const shouldLoadLive2D = () => {
    try {
      if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return false
      if (window.matchMedia('(max-width: 900px)').matches) return false
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
      if (navigator.connection) {
        const c = navigator.connection
        if (c.saveData || /2g|slow-2g/.test(c.effectiveType || '')) return false
      }
      return true
    } catch (e) {
      return false
    }
  }

  const purgeWidget = () => {
    try {
      document.querySelectorAll('#live2d-widget, #live2dcanvas, canvas#live2dcanvas').forEach(el => {
        if (el && el.parentNode) el.parentNode.removeChild(el)
      })
    } catch (e) {
      /* ignore */
    }
    window.__blogLive2DLoaded = false
    window.__blogLive2DReady = false
  }

  const loadScript = src =>
    new Promise((resolve, reject) => {
      // 已加载成功过
      if (window.L2Dwidget) return resolve()
      const existing = document.querySelector('script[data-blog-live2d-src="' + src + '"]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('cached fail')))
        return
      }
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.dataset.blogLive2dSrc = src
      script.onload = () => resolve()
      script.onerror = () => {
        script.remove()
        reject(new Error('load fail ' + src))
      }
      document.body.appendChild(script)
    })

  const loadScriptWithFallback = async () => {
    if (window.L2Dwidget) return true
    for (let i = 0; i < SCRIPT_CANDIDATES.length; i++) {
      try {
        await loadScript(SCRIPT_CANDIDATES[i])
        if (window.L2Dwidget) return true
      } catch (e) {
        /* try next */
      }
    }
    return false
  }

  const pickModelPath = async () => {
    for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
      const url = MODEL_CANDIDATES[i]
      try {
        const res = await fetch(url, { method: 'HEAD', mode: 'cors', cache: 'force-cache' })
        if (res.ok) return url
      } catch (e) {
        /* HEAD 可能被 CORS 拦，继续用 GET 探测或直接采用 */
      }
    }
    // HEAD 常失败：直接返回首选（npmmirror）
    return MODEL_CANDIDATES[0]
  }

  const initWidget = modelPath => {
    if (!window.L2Dwidget || window.__blogLive2DReady) return
    window.__blogLive2DReady = true

    window.L2Dwidget.init({
      model: {
        jsonPath: modelPath,
        scale: 1
      },
      display: {
        position: 'right',
        width: 150,
        height: 300,
        hOffset: 24,
        vOffset: -12
      },
      mobile: { show: false },
      react: { opacityDefault: 0.88, opacityOnHover: 1 },
      dialog: { enable: false }
    })
  }

  const start = async () => {
    if (!shouldLoadLive2D()) {
      purgeWidget()
      return
    }
    if (window.__blogLive2DLoaded) return
    window.__blogLive2DLoaded = true

    const ok = await loadScriptWithFallback()
    if (!ok || !shouldLoadLive2D()) {
      window.__blogLive2DLoaded = false
      return
    }

    const modelPath = await pickModelPath()
    // 稍等一帧，避免与 Pjax DOM 替换抢跑
    window.requestAnimationFrame(() => {
      if (!shouldLoadLive2D()) return
      try {
        initWidget(modelPath)
      } catch (e) {
        window.__blogLive2DLoaded = false
        window.__blogLive2DReady = false
        console.warn('[live2d] init failed', e)
      }
    })
  }

  const schedule = () => {
    if (!shouldLoadLive2D()) {
      purgeWidget()
      return
    }
    const run = () => window.setTimeout(start, 600)
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2500 })
    else run()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true })
  } else {
    schedule()
  }

  document.addEventListener('pjax:send', () => {
    // 切页前清掉旧节点，防止残留或「假死」
    window.__blogLive2DReady = false
  })

  document.addEventListener('pjax:complete', () => {
    purgeWidget()
    schedule()
  })

  window.addEventListener('resize', () => {
    window.clearTimeout(window.__blogLive2DResizeTimer)
    window.__blogLive2DResizeTimer = window.setTimeout(() => {
      if (!shouldLoadLive2D()) purgeWidget()
      else if (!document.getElementById('live2d-widget') && !document.getElementById('live2dcanvas')) {
        window.__blogLive2DLoaded = false
        window.__blogLive2DReady = false
        schedule()
      }
    }, 250)
  })
})()
