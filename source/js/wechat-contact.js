/**
 * 微信社交图标：点击复制微信号，并弹出轻提示
 */
(function () {
  const WECHAT_ID = 'ljh18736134699'

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
      document.body.appendChild(toast)
    }
    toast.textContent = message
    toast.classList.add('is-visible')
    window.clearTimeout(toast._timer)
    toast._timer = window.setTimeout(() => {
      toast.classList.remove('is-visible')
    }, 2200)
  }

  const isWechatLink = link => {
    if (!link) return false
    if (link.closest && link.closest('.social-share, .post-share, .social-share-icon')) return false
    const href = (link.getAttribute('href') || '').trim()
    if (href === '#wechat' || href.endsWith('#wechat')) return true
    if (link.closest && link.closest('.card-info-social-icons, #site_social_icons')) {
      if (link.querySelector && link.querySelector('.fa-weixin, .fab.fa-weixin')) return true
    }
    return false
  }

  const onClick = event => {
    const link = event.target.closest && event.target.closest('a')
    if (!isWechatLink(link)) return

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
  document.addEventListener('pjax:complete', () => {
    // 重新绑定不需要：用的是 document 委托
  })
})()
