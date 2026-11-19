/**
 * 微信社交图标 & 留言板微信按钮：点击复制微信号，并弹出可访问轻提示
 */
(function () {
  const WECHAT_ID = ['ljh', '187', '3613', '4699'].join('')

  const writeClipboard = text => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
    }
    return new Promise((resolve, reject) => {
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
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  }

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
    }, 2200)
  }

  const isWechatTrigger = el => {
    if (!el) return false
    if (el.hasAttribute('data-wechat-copy')) return true
    if (el.tagName !== 'A') return false
    if (el.closest && el.closest('.social-share, .post-share, .social-share-icon')) return false
    const href = (el.getAttribute('href') || '').trim()
    if (href === '#wechat' || href.endsWith('#wechat')) return true
    if (el.closest && el.closest('.card-info-social-icons, #site_social_icons')) {
      if (el.querySelector && el.querySelector('.fa-weixin, .fab.fa-weixin')) return true
    }
    return false
  }

  const enhanceLabels = () => {
    document.querySelectorAll('.card-info-social-icons a, #site_social_icons a').forEach(link => {
      if (isWechatTrigger(link)) {
        link.setAttribute('aria-label', '点击复制微信号')
        link.setAttribute('title', '点击复制微信号')
      }
    })
  }

  const onClick = event => {
    const trigger = event.target.closest && event.target.closest('a, [data-wechat-copy]')
    if (!isWechatTrigger(trigger)) return

    event.preventDefault()
    event.stopPropagation()

    writeClipboard(WECHAT_ID)
      .then(() => {
        showToast('微信号已复制：' + WECHAT_ID)
      })
      .catch(() => {
        showToast('微信号：' + WECHAT_ID + '（请手动复制）')
        window.prompt('请复制微信号', WECHAT_ID)
      })
  }

  document.addEventListener('click', onClick, true)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceLabels, { once: true })
  } else {
    enhanceLabels()
  }
  document.addEventListener('pjax:complete', enhanceLabels)
})()
