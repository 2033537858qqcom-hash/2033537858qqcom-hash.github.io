/**
 * 桌面端右键菜单：
 * - 按住 Shift + 右键直接呼出浏览器原生菜单（方便检查元素 / 图片另存为）
 * - 动态检测桌面尺寸，支持窗口缩放
 * - 完整 ARIA menu 键盘导航（↑/↓/Home/End/Escape）与焦点恢复
 * - 含「复制反馈提示」与「切换光圈光标」入口
 */
(function () {
  const selectorsToSkip = 'input, textarea, select, option, [contenteditable="true"], .aplayer, .aplayer *'
  const menuItems = [
    { key: 'back', label: '返回上一页', icon: 'fa-solid fa-arrow-left' },
    { key: 'top', label: '回到顶部', icon: 'fa-solid fa-arrow-up' },
    { key: 'openTab', label: '新标签页打开链接', icon: 'fa-solid fa-arrow-up-right-from-square', needsLink: true },
    { key: 'copy', label: '复制选中文本', icon: 'fa-solid fa-copy', needsSelection: true },
    { key: 'link', label: '复制当前链接', icon: 'fa-solid fa-link' },
    { key: 'theme', label: '切换明暗', icon: 'fa-solid fa-circle-half-stroke' },
    { key: 'cursor', label: '切换光圈光标 (Alt+C)', icon: 'fa-regular fa-circle-dot' },
    { key: 'refresh', label: '刷新页面', icon: 'fa-solid fa-rotate-right' }
  ]

  let menu
  let contextTarget = {}
  let lastFocus = null

  const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 769px)').matches
  const getSelectionText = () => window.getSelection().toString().trim()

  const showToast = message => {
    let toast = document.getElementById('wechat-copy-toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = 'wechat-copy-toast'
      toast.className = 'wechat-copy-toast'
      toast.setAttribute('role', 'status')
      toast.setAttribute('aria-live', 'polite')
      document.body.appendChild(toast)
    }
    toast.textContent = message
    toast.classList.add('is-visible')
    window.clearTimeout(toast._timer)
    toast._timer = window.setTimeout(() => {
      toast.classList.remove('is-visible')
    }, 1800)
  }

  const writeClipboard = (text, label) => {
    if (!text) return
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(label || '已复制到剪贴板'))
        .catch(() => {})
      return
    }
    try {
      const input = document.createElement('textarea')
      input.value = text
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
      showToast(label || '已复制到剪贴板')
    } catch (e) {}
  }

  const visibleButtons = () => menu ? [...menu.querySelectorAll('button:not([hidden])')] : []

  const hideMenu = restoreFocus => {
    if (!menu || !menu.classList.contains('is-visible')) return
    if (menu.contains(document.activeElement)) {
      document.activeElement.blur()
      if (restoreFocus && lastFocus && typeof lastFocus.focus === 'function') {
        try { lastFocus.focus() } catch (e) {}
      }
    }
    lastFocus = null
    menu.classList.remove('is-visible')
    menu.setAttribute('aria-hidden', 'true')
  }

  const runAction = key => {
    hideMenu(false)

    if (key === 'back') {
      history.length > 1 ? history.back() : window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (key === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (key === 'openTab' && contextTarget.link) {
      window.open(contextTarget.link, '_blank', 'noopener,noreferrer')
      return
    }
    if (key === 'copy') {
      writeClipboard(getSelectionText(), '已复制选中文本')
      return
    }
    if (key === 'link') {
      writeClipboard(contextTarget.link || window.location.href, contextTarget.link ? '已复制链接地址' : '已复制页面地址')
      return
    }
    if (key === 'theme') {
      const themeButton = document.getElementById('darkmode')
      if (themeButton) themeButton.click()
      return
    }
    if (key === 'cursor' && typeof window.__toggleCursorRing === 'function') {
      const on = window.__toggleCursorRing()
      showToast(on ? '已开启光圈光标' : '已恢复系统光标')
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
    menu.setAttribute('aria-label', '页面快捷菜单')
    menu.setAttribute('aria-hidden', 'true')

    menuItems.forEach(item => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.action = item.key
      button.setAttribute('role', 'menuitem')
      button.tabIndex = -1
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

    menu.addEventListener('keydown', event => {
      const items = visibleButtons()
      if (!items.length) return
      const idx = items.indexOf(document.activeElement)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        items[(idx + 1) % items.length].focus()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        items[(idx - 1 + items.length) % items.length].focus()
      } else if (event.key === 'Home') {
        event.preventDefault()
        items[0].focus()
      } else if (event.key === 'End') {
        event.preventDefault()
        items[items.length - 1].focus()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        hideMenu(true)
      }
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

  const resolveLink = target => {
    const a = target && target.closest ? target.closest('a[href]') : null
    if (!a) return ''
    const raw = (a.getAttribute('href') || '').trim()
    if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return ''
    return a.href
  }

  const showMenu = event => {
    if (!isDesktop() || event.shiftKey) return
    if (event.target.closest && event.target.closest(selectorsToSkip)) return

    event.preventDefault()
    lastFocus = document.activeElement
    contextTarget = {
      link: resolveLink(event.target)
    }

    const currentMenu = createMenu()
    const hasSelection = Boolean(getSelectionText())

    currentMenu.querySelectorAll('button').forEach(button => {
      const item = menuItems.find(menuItem => menuItem.key === button.dataset.action)
      const hideSelection = Boolean(item && item.needsSelection && !hasSelection)
      const hideLink = Boolean(item && item.needsLink && !contextTarget.link)
      button.hidden = hideSelection || hideLink
      if (button.dataset.action === 'link') {
        button.querySelector('span').textContent = contextTarget.link ? '复制链接地址' : '复制页面地址'
      }
    })

    currentMenu.classList.add('is-visible')
    currentMenu.setAttribute('aria-hidden', 'false')
    positionMenu(event, currentMenu)

    const first = visibleButtons()[0]
    if (first) first.focus({ preventScroll: true })
  }

  const bindEvents = () => {
    document.addEventListener('contextmenu', showMenu)
    document.addEventListener('click', event => {
      if (menu && menu.contains(event.target)) return
      hideMenu(false)
    })
    document.addEventListener('scroll', () => hideMenu(false), { passive: true })
    window.addEventListener('resize', () => hideMenu(false))
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideMenu(true)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents, { once: true })
  } else {
    bindEvents()
  }
})()
