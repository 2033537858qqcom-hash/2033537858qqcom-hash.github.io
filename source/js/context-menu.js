(function () {
  const selectorsToSkip = 'input, textarea, select, option, [contenteditable="true"], .aplayer, .aplayer *'
  const menuItems = [
    { key: 'back', label: '返回上一页', icon: 'fa-solid fa-arrow-left' },
    { key: 'top', label: '回到顶部', icon: 'fa-solid fa-arrow-up' },
    { key: 'copy', label: '复制选中文本', icon: 'fa-solid fa-copy', needsSelection: true },
    { key: 'link', label: '复制当前链接', icon: 'fa-solid fa-link' },
    { key: 'theme', label: '切换明暗', icon: 'fa-solid fa-circle-half-stroke' },
    { key: 'refresh', label: '刷新页面', icon: 'fa-solid fa-rotate-right' }
  ]

  let menu
  let contextTarget = {}

  const getSelectionText = () => window.getSelection().toString().trim()

  const writeClipboard = text => {
    if (!text) return
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {})
      return
    }

    const input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }

  const hideMenu = () => {
    if (!menu) return
    menu.classList.remove('is-visible')
    menu.setAttribute('aria-hidden', 'true')
  }

  const runAction = key => {
    hideMenu()

    if (key === 'back') {
      history.length > 1 ? history.back() : window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (key === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (key === 'copy') {
      writeClipboard(getSelectionText())
      return
    }

    if (key === 'link') {
      writeClipboard(contextTarget.link || window.location.href)
      return
    }

    if (key === 'theme') {
      const themeButton = document.getElementById('darkmode')
      if (themeButton) themeButton.click()
      return
    }

    if (key === 'refresh') {
      window.location.reload()
    }
  }

  const createMenu = () => {
    if (menu) return menu

    menu = document.createElement('div')
    menu.id = 'lijiahao-context-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-hidden', 'true')

    menuItems.forEach(item => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.action = item.key
      button.setAttribute('role', 'menuitem')
      const icon = document.createElement('i')
      icon.className = item.icon
      icon.setAttribute('aria-hidden', 'true')
      const span = document.createElement('span')
      span.textContent = item.label
      button.appendChild(icon)
      button.appendChild(span)
      button.addEventListener('click', () => runAction(item.key))
      menu.appendChild(button)
    })

    document.body.appendChild(menu)
    return menu
  }

  const positionMenu = (event, currentMenu) => {
    const padding = 12
    const rect = currentMenu.getBoundingClientRect()
    const left = Math.min(event.clientX, window.innerWidth - rect.width - padding)
    const top = Math.min(event.clientY, window.innerHeight - rect.height - padding)

    currentMenu.style.left = `${Math.max(padding, left)}px`
    currentMenu.style.top = `${Math.max(padding, top)}px`
  }

  const showMenu = event => {
    if (event.target.closest(selectorsToSkip)) return

    event.preventDefault()
    contextTarget = {
      link: event.target.closest('a[href]') ? event.target.closest('a[href]').href : ''
    }

    const currentMenu = createMenu()
    const hasSelection = Boolean(getSelectionText())

    currentMenu.querySelectorAll('button').forEach(button => {
      const item = menuItems.find(menuItem => menuItem.key === button.dataset.action)
      button.hidden = Boolean(item && item.needsSelection && !hasSelection)
      if (button.dataset.action === 'link') {
        button.querySelector('span').textContent = contextTarget.link ? '复制链接地址' : '复制页面地址'
      }
    })

    currentMenu.classList.add('is-visible')
    currentMenu.setAttribute('aria-hidden', 'false')
    positionMenu(event, currentMenu)
  }

  const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 769px)').matches

  const bindEvents = () => {
    // Keep system context menu on touch / compact devices.
    if (!isDesktop()) return

    document.addEventListener('contextmenu', showMenu)
    document.addEventListener('click', hideMenu)
    document.addEventListener('scroll', hideMenu, { passive: true })
    window.addEventListener('resize', () => {
      if (!isDesktop()) hideMenu()
      else hideMenu()
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideMenu()
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents, { once: true })
  } else {
    bindEvents()
  }
})()
