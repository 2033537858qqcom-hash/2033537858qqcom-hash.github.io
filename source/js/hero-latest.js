/**
 * 首页全屏头图：展示最新随笔/文章入口（数据来自页面已有 DOM，无额外请求）
 */
(function () {
  const render = () => {
    const header = document.getElementById('page-header')
    if (!header || !header.classList.contains('full_page')) {
      const old = document.getElementById('hero-latest-link')
      if (old) old.remove()
      return
    }

    // 优先最新文章卡片
    const post = document.querySelector('#recent-posts .recent-post-item .article-title')
    let href = ''
    let title = ''
    if (post) {
      href = post.getAttribute('href') || ''
      title = (post.textContent || '').trim()
    }

    // 若无文章，给随笔入口
    if (!href) {
      href = '/moments/'
      title = '随笔'
    }

    let box = document.getElementById('hero-latest-link')
    if (!box) {
      box = document.createElement('div')
      box.id = 'hero-latest-link'
      box.className = 'hero-latest-link'
      header.appendChild(box)
    }

    const label = title.length > 18 ? title.slice(0, 18) + '…' : title
    box.innerHTML = '<a href="' + href + '">最新 · ' + label + '</a>'
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true })
  } else {
    render()
  }
  document.addEventListener('pjax:complete', render)
})()
