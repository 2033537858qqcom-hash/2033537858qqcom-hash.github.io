(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const detectTimeMood = () => {
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    // 16:45 - 19:30 傍晚橘粉晚霞
    if (minutes >= 16 * 60 + 45 && minutes <= 19 * 60 + 30) return 'dusk'
    // 05:30 - 08:30 清晨朝霞
    if (minutes >= 5 * 60 + 30 && minutes < 8 * 60 + 30) return 'dawn'
    // 08:30 - 16:45 晴昼春风
    if (minutes >= 8 * 60 + 30 && minutes < 16 * 60 + 45) return 'day'
    return 'night'
  }

  const syncTimeMood = () => {
    const mood = detectTimeMood()
    if (root.getAttribute('data-time-mood') !== mood) {
      root.setAttribute('data-time-mood', mood)
    }
  }

  const syncScrollDepth = () => {
    const header = document.getElementById('page-header')
    const isFull = Boolean(header && header.classList.contains('full_page'))
    const threshold = isFull ? 240 : 40
    root.classList.toggle('is-reading-depth', (window.scrollY || 0) > threshold)
  }

  syncTimeMood()
  window.setInterval(syncTimeMood, 60000)
  window.addEventListener('scroll', syncScrollDepth, { passive: true })
  document.addEventListener('DOMContentLoaded', () => {
    syncTimeMood()
    syncScrollDepth()
  })
  document.addEventListener('pjax:complete', () => {
    syncTimeMood()
    syncScrollDepth()
  })

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

    if (reduceMotion.matches) {
      switchTheme()
      return
    }

    root.classList.add('theme-switching')

    if (document.startViewTransition) {
      try {
        const transition = document.startViewTransition(switchTheme)
        transition.finished.finally(() => {
          root.classList.remove('theme-switching')
        })
        return
      } catch (e) {
        /* fallback below */
      }
    }

    switchTheme()
    window.setTimeout(() => {
      root.classList.remove('theme-switching')
    }, 800)
  }, true)
})()
