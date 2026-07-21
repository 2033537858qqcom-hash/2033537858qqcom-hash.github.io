(function () {
  const root = document.documentElement

  const isNormalLeftClick = event => {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  }

  const isSamePageHash = url => {
    return url.origin === location.origin &&
      url.pathname === location.pathname &&
      url.search === location.search &&
      url.hash
  }

  const shouldGuard = event => {
    // PJAX already handles in-site navigation; avoid double transition overlays.
    if (window.pjax || document.documentElement.classList.contains('pjax')) return false
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (!isNormalLeftClick(event)) return false

    const link = event.target.closest && event.target.closest('a[href]')
    if (!link) return false
    if (link.target && link.target !== '_self') return false
    if (link.hasAttribute('download')) return false

    const href = link.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return false
    }

    const url = new URL(link.href, location.href)
    if (url.origin !== location.origin) return false
    if (isSamePageHash(url)) return false

    return true
  }

  const showGuard = () => {
    root.classList.add('page-leaving')

    const loadingBox = document.getElementById('loading-box')
    if (loadingBox) loadingBox.classList.remove('loaded')

    document.body.style.overflow = 'hidden'
  }

  document.addEventListener('click', event => {
    if (!shouldGuard(event)) return
    showGuard()
  }, true)

  window.addEventListener('pageshow', () => {
    root.classList.remove('page-leaving')
    document.body.style.overflow = ''
  })
})()
