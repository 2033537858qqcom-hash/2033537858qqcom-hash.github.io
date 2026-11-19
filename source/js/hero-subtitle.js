/**
 * 首页头图副标题轮播：
 * - 写入真实 DOM 节点 #hero-subtitle-live（可读屏、可选中、移动端自适应）
 * - 尊重 prefers-reduced-motion，并在标签页不可见时暂停轮播
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const subtitles = {
    light: [
      '先读随笔，再读文章——随便点开就好',
      '在代码、风景与日常之间',
      '写得出就写，写不出就先活着',
      '把今天的一句，留给以后的自己',
      '阳光很好，适合读一段短的',
      '建站手记可以跳过，故事不用'
    ],
    dark: [
      '夜深了，适合读完一条随笔',
      '在星空和终端之间，保存一点安静',
      '把零散的光，整理成可以回看的记录',
      '如果世界安静下来，就继续读吧',
      '月色很轻，适合想远方，也适合翻旧句',
      '夜色里的文字，慢慢读就好'
    ]
  }

  let index = -1
  let timer = null
  let fadeTimer = null
  let observer = null

  const currentMode = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')

  const heroTitle = () => document.querySelector('#page-header.full_page #site-title')

  const ensureSubtitleNode = title => {
    let el = document.getElementById('hero-subtitle-live')
    if (el && el.parentElement === title.parentElement) return el
    if (el) el.remove()
    el = document.createElement('p')
    el.id = 'hero-subtitle-live'
    el.className = 'hero-subtitle-live'
    el.setAttribute('aria-live', 'off')
    title.insertAdjacentElement('afterend', el)
    return el
  }

  const setSubtitle = (title, text, immediate) => {
    const el = ensureSubtitleNode(title)
    if (fadeTimer) {
      window.clearTimeout(fadeTimer)
      fadeTimer = null
    }
    if (immediate || reduceMotion.matches) {
      el.textContent = text
      el.classList.remove('subtitle-changing')
      return
    }
    el.classList.add('subtitle-changing')
    fadeTimer = window.setTimeout(() => {
      fadeTimer = null
      if (!document.body.contains(el)) return
      el.textContent = text
      el.classList.remove('subtitle-changing')
    }, 240)
  }

  const nextSubtitle = (reset, immediate) => {
    const title = heroTitle()
    if (!title) return
    const pool = subtitles[currentMode()]
    index = reset ? 0 : (index + 1) % pool.length
    setSubtitle(title, pool[index], immediate)
  }

  const stop = () => {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }
    if (fadeTimer) {
      window.clearTimeout(fadeTimer)
      fadeTimer = null
    }
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  const startTimer = () => {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }
    if (reduceMotion.matches || document.hidden || !heroTitle()) return
    timer = window.setInterval(() => nextSubtitle(false, false), 4600)
  }

  const start = () => {
    stop()
    const title = heroTitle()
    if (!title) return

    nextSubtitle(true, true)
    startTimer()

    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.attributeName === 'data-theme')) {
        nextSubtitle(true, false)
      }
    })
    observer.observe(root, { attributes: true })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) {
        window.clearInterval(timer)
        timer = null
      }
    } else if (heroTitle()) {
      startTimer()
    }
  })

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      if (timer) {
        window.clearInterval(timer)
        timer = null
      }
    } else if (heroTitle()) {
      startTimer()
    }
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
  document.addEventListener('pjax:complete', start)
})()
