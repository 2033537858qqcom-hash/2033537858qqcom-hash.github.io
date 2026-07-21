/**
 * 首页全屏头图底部：最新文章入口（与距离胶囊共用底部堆叠容器）
 * 使用 DOM API，避免 innerHTML 拼接 href/title。
 */
(function () {
  const ensureBottomStack = header => {
    let stack = document.getElementById('hero-bottom-stack')
    if (stack) return stack
    stack = document.createElement('div')
    stack.id = 'hero-bottom-stack'
    stack.className = 'hero-bottom-stack'
    header.appendChild(stack)
    return stack
  }

  const safeHref = href => {
    if (!href || typeof href !== 'string') return '/moments/'
    const t = href.trim()
    if (!t || /^javascript:/i.test(t) || /^data:/i.test(t) || /^vbscript:/i.test(t)) {
      return '/moments/'
    }
    // 仅允许站内相对路径或当前站点绝对路径
    if (t.startsWith('/') || t.startsWith('./') || t.startsWith('../')) return t
    try {
      const u = new URL(t, window.location.origin)
      if (u.origin === window.location.origin) return u.pathname + u.search + u.hash
    } catch (e) {
      /* fallthrough */
    }
    return '/moments/'
  }

  const render = () => {
    const header = document.getElementById('page-header')
    if (!header || !header.classList.contains('full_page')) {
      const old = document.getElementById('hero-latest-link')
      if (old) old.remove()
      return
    }

    const post = document.querySelector('#recent-posts .recent-post-item .article-title')
    let href = '/moments/'
    let title = '随笔'
    if (post) {
      href = safeHref(post.getAttribute('href') || '')
      title = (post.textContent || '').trim() || '随笔'
    }

    const stack = ensureBottomStack(header)
    let box = document.getElementById('hero-latest-link')
    if (!box) {
      box = document.createElement('div')
      box.id = 'hero-latest-link'
      box.className = 'hero-latest-link'
      stack.insertBefore(box, stack.firstChild)
    } else if (box.parentElement !== stack) {
      stack.insertBefore(box, stack.firstChild)
    }

    const maxLen = window.matchMedia('(max-width: 768px)').matches ? 12 : 18
    const label = title.length > maxLen ? title.slice(0, maxLen) + '…' : title

    box.replaceChildren()
    const a = document.createElement('a')
    a.href = href
    a.textContent = '最新 · ' + label
    box.appendChild(a)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true })
  } else {
    render()
  }
  document.addEventListener('pjax:complete', render)
  window.addEventListener('resize', () => {
    window.clearTimeout(window.__heroLatestResizeTimer)
    window.__heroLatestResizeTimer = window.setTimeout(render, 150)
  })
})()
