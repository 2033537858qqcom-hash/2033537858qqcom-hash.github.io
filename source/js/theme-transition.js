(function () {
  const root = document.documentElement

  const runThemeHooks = mode => {
    const themeChange = (window.globalFn && window.globalFn.themeChange) || {}
    Object.keys(themeChange).forEach(key => {
      const fn = themeChange[key]
      if (typeof fn === 'function') fn(mode)
    })
  }

  const saveTheme = mode => {
    if (window.btf && btf.saveToLocal) {
      btf.saveToLocal.set('theme', mode, 2)
    } else {
      localStorage.setItem('theme', JSON.stringify({
        value: mode,
        expiry: Date.now() + 2 * 86400000
      }))
    }
  }

  const switchTheme = () => {
    const nextMode = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'

    if (window.btf) {
      nextMode === 'dark' ? btf.activateDarkMode() : btf.activateLightMode()
    } else {
      root.setAttribute('data-theme', nextMode)
    }

    saveTheme(nextMode)
    runThemeHooks(nextMode)
  }

  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('#darkmode')
    if (!button) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    root.classList.add('theme-switching')

    if (document.startViewTransition) {
      const transition = document.startViewTransition(switchTheme)
      transition.finished.finally(() => {
        root.classList.remove('theme-switching')
      })
      return
    }

    switchTheme()
    window.setTimeout(() => {
      root.classList.remove('theme-switching')
    }, 900)
  }, true)
})()
