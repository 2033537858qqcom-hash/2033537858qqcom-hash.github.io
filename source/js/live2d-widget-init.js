/**
 * Live2D 看板娘（桌面端）：
 * - 全站显示（宽屏桌面）；移动端 / 触控 / 省流 / 减少动效关闭
 * - 多 CDN 回退（npmmirror -> unpkg -> jsdelivr）
 * - 自带轻量应景气泡（按昼夜、页面与点击互动），平时不打扰阅读
 * - 鼠标移向右侧工具栏 #rightside 时轻微退让透明度，互不遮挡
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

  const GREET_KEY = 'blog-live2d-greeted'
  let bubbleTimer = 0
  let lastLine = ''

  const LINES = {
    light: [
      '晴空正好，先翻两条随笔吹吹风吧～',
      '点一下页面会有小花瓣散开哦，试试看？',
      '写得出就写，写不出就先去晒会儿太阳！',
      '欢迎来到 Rogue_l 的小天地，今天心情怎么样？'
    ],
    dark: [
      '夜空和银河出来啦，要不要配一首歌慢慢读？',
      '夜深了，逛完这一页记得早点休息呀。',
      '点击星夜里的任何空白处，会有微光飘起哦～',
      '把白天的吵闹放一边，这里很安静。'
    ],
    pages: {
      moments: '这里记着好多雨天、晚风和一时兴起的句子。',
      photography: '点开喜欢的照片，可以用左右键一张张翻看！',
      anime: '有没有哪一部番，你也反复重温过好多遍？',
      timeline: '一年一章，把照片、随笔和歌都串在了一起。',
      music: '戴上耳机吧，歌单里藏着好多单曲循环的歌。',
      message: '留言板一直开着，路过也可以打个招呼呀！'
    },
    clicks: [
      '哎呀，被你发现啦～',
      '风铃好像轻轻响了一声呢。',
      '偷偷告诉你，按 Alt+C 可以开关光圈光标彩蛋！',
      '要不顺便去「人生长廊」逛一圈？',
      '今天也要元气满满地往前走呀！',
      '想和站长联系的话，点一下绿色微信图标就能复制啦。'
    ]
  }

  const pickLine = pool => {
    if (!Array.isArray(pool) || !pool.length) return ''
    const filtered = pool.length > 1 ? pool.filter(l => l !== lastLine) : pool
    const line = filtered[Math.floor(Math.random() * filtered.length)]
    lastLine = line
    return line
  }

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

  const ensureBubble = () => {
    let bubble = document.getElementById('live2d-bubble')
    if (bubble) return bubble
    bubble = document.createElement('div')
    bubble.id = 'live2d-bubble'
    bubble.className = 'live2d-bubble'
    bubble.setAttribute('role', 'status')
    bubble.setAttribute('aria-live', 'polite')
    document.body.appendChild(bubble)
    return bubble
  }

  const hideBubble = () => {
    const bubble = document.getElementById('live2d-bubble')
    if (bubble) bubble.classList.remove('is-visible')
  }

  const showBubble = (text, duration = 4200) => {
    if (!text || !shouldLoadLive2D()) return
    const widget = document.getElementById('live2d-widget') || document.getElementById('live2dcanvas')
    if (!widget) return
    const bubble = ensureBubble()
    bubble.textContent = text
    bubble.classList.add('is-visible')
    window.clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(hideBubble, duration)
  }

  const pageKey = () => {
    const p = window.location.pathname
    if (/\/moments\/?/.test(p)) return 'moments'
    if (/\/photography\/?/.test(p)) return 'photography'
    if (/\/anime\/?/.test(p)) return 'anime'
    if (/\/timeline\/?/.test(p)) return 'timeline'
    if (/\/music\/?/.test(p)) return 'music'
    if (/\/message\/?/.test(p)) return 'message'
    return ''
  }

  const timeGreeting = () => {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay()
    if (hour >= 23 || hour < 5) return '夜已经很深啦，逛完这一页记得早点休息哦～'
    if (hour >= 5 && hour < 9) return '早安！晨光刚落到樱花上，今天也要元气出发～'
    if (hour >= 11 && hour < 14) return '中午好呀，记得好好吃饭、稍微眯一会儿～'
    if (hour >= 17 && hour < 19) return '傍晚的风往往最温柔，看看窗外有没有晚霞吧～'
    if (day === 0 || day === 6) return '周末啦～最适合慢下来听歌、翻随笔或重温老番！'
    return ''
  }

  const greetForContext = () => {
    const k = pageKey()
    if (k && LINES.pages[k]) return LINES.pages[k]
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    const timed = timeGreeting()
    if (timed && (new Date().getHours() >= 23 || Math.random() < 0.5)) return timed
    return pickLine(dark ? LINES.dark : LINES.light)
  }

  const purgeWidget = () => {
    try {
      document.querySelectorAll('#live2d-widget, #live2dcanvas, canvas#live2dcanvas, #live2d-bubble').forEach(el => {
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
      if (window.L2Dwidget) return resolve()
      const existing = document.querySelector('script[data-blog-live2d-src="' + src + '"]')
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('cached fail')), { once: true })
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
        /* try next */
      }
    }
    return MODEL_CANDIDATES[0]
  }

  const bindInteractions = () => {
    if (window.__blogLive2DBound) return
    window.__blogLive2DBound = true

    let lastMusicBubbleAt = 0

    document.addEventListener('click', event => {
      if (event.target && event.target.closest && event.target.closest('#live2d-widget, #live2dcanvas')) {
        showBubble(pickLine(LINES.clicks), 3800)
      }
    })

    document.addEventListener('mouseover', event => {
      const widget = document.getElementById('live2d-widget')
      if (!widget) return
      const overRightside = Boolean(event.target && event.target.closest && event.target.closest('#rightside'))
      widget.classList.toggle('is-yielding', overRightside)
    }, { passive: true })

    window.addEventListener('blog:music-play', event => {
      const now = Date.now()
      if (now - lastMusicBubbleAt < 15000) return
      lastMusicBubbleAt = now
      const title = event && event.detail && event.detail.title
      showBubble(
        title ? '开始放歌啦：《' + title + '》，慢慢逛吧～' : '配乐响起来啦，祝你逛得开心～',
        3800
      )
    })

    new MutationObserver(mutations => {
      if (mutations.some(m => m.attributeName === 'data-theme')) {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark'
        showBubble(dark ? '切到星夜模式啦，祝你今晚好梦～' : '天亮啦，晴空和樱花回来陪你～', 3400)
      }
    }).observe(document.documentElement, { attributes: true })
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
        hOffset: 56,
        vOffset: -12
      },
      mobile: { show: false },
      react: { opacityDefault: 0.9, opacityOnHover: 1 },
      dialog: { enable: false }
    })

    bindInteractions()

    window.setTimeout(() => {
      try {
        if (!sessionStorage.getItem(GREET_KEY)) {
          sessionStorage.setItem(GREET_KEY, '1')
          showBubble(greetForContext(), 4800)
        }
      } catch (e) {
        showBubble(greetForContext(), 4800)
      }
    }, 900)
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

  document.addEventListener('pjax:complete', () => {
    if (!shouldLoadLive2D()) {
      purgeWidget()
      return
    }
    if (document.getElementById('live2d-widget') || document.getElementById('live2dcanvas')) {
      const k = pageKey()
      if (k && LINES.pages[k]) showBubble(LINES.pages[k], 3600)
      return
    }
    window.__blogLive2DLoaded = false
    window.__blogLive2DReady = false
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
