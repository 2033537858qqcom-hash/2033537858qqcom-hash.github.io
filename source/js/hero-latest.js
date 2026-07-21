/**
 * 首页全屏头图底部：最新文章入口（与距离胶囊共用底部堆叠容器）
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

  const render = () => {
    const header = document.getElementById('page-header')
    if (!header || !header.classList.contains('full_page')) {
      const old = document.getElementById('hero-latest-link')
      if (old) old.remove()
      return
    }

    const post = document.querySelector('#recent-posts .recent-post-item .article-title')
    let href = ''
    let title = ''
    if (post) {
      href = post.getAttribute('href') || ''
      title = (post.textContent || '').trim()
    }
    if (!href) {
      href = '/moments/'
      title = '随笔'
    }

    const stack = ensureBottomStack(header)
    let box = document.getElementById('hero-latest-link')
    if (!box) {
      box = document.createElement('div')
      box.id = 'hero-latest-link'
      box.className = 'hero-latest-link'
      // 最新放在距离上方
      stack.insertBefore(box, stack.firstChild)
    } else if (box.parentElement !== stack) {
      stack.insertBefore(box, stack.firstChild)
    }

    const maxLen = window.matchMedia('(max-width: 768px)').matches ? 12 : 18
    const label = title.length > maxLen ? title.slice(0, maxLen) + '…' : title
    box.innerHTML = '<a href="' + href + '">最新 · ' + label + '</a>'
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
