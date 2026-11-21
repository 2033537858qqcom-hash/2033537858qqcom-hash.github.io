/**
 * 栖居评论区体验增强引擎 (Sanctuary Comment & Engagement Enhancer)
 * - Utterances 实时昼夜主题同步（响应 data-theme 切换、星夜预设与 3D 拖拽日落）
 * - 评论区骨架加载态 + 国内弱网/受限网络优雅回退（一键重试 / 直达 GitHub Issues / 复制微信）
 * - 轻量交互工具条：「留印共鸣」（免登录本地轻互动）、「复制链接」、「一键复制友链申请格式」
 * - 随笔直达回应：支持从 /moments/ 携带 ?ref= 跳转至 /message/#post-comment 并一键复制引用语
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__blogCommentEnhanceInit) return
  window.__blogCommentEnhanceInit = true

  const REPO = '2033537858qqcom-hash/2033537858qqcom-hash.github.io'
  const RESONATE_KEY = 'blog_sanctuary_resonates_v1'
  const FLINK_TEMPLATE = [
    '名称: 你的站点名',
    '简介: 一句话介绍',
    '链接: https://your-site.example',
    '头像: https://your-site.example/avatar.jpg'
  ].join('\n')

  const root = document.documentElement

  const isDarkTheme = () => root.getAttribute('data-theme') === 'dark'

  const getUtterancesTheme = () => (isDarkTheme() ? 'photon-dark' : 'github-light')

  const syncUtterancesTheme = () => {
    const iframe = document.querySelector('#post-comment iframe.utterances-frame')
    if (!iframe || !iframe.contentWindow) return false
    try {
      iframe.contentWindow.postMessage(
        { type: 'set-theme', theme: getUtterancesTheme() },
        'https://utteranc.es'
      )
      return true
    } catch (e) {
      return false
    }
  }

  const readResonates = () => {
    try {
      const obj = JSON.parse(localStorage.getItem(RESONATE_KEY) || '{}')
      return obj && typeof obj === 'object' ? obj : {}
    } catch (e) {
      return {}
    }
  }

  const saveResonates = obj => {
    try {
      localStorage.setItem(RESONATE_KEY, JSON.stringify(obj))
    } catch (e) {}
  }

  const copyText = text => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    }
    return Promise.resolve(fallbackCopy(text))
  }

  const fallbackCopy = text => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    ta.remove()
  }

  const showToast = msg => {
    let el = document.getElementById('sanctuary-comment-toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'sanctuary-comment-toast'
      el.className = 'sanctuary-toast'
      el.setAttribute('role', 'status')
      el.setAttribute('aria-live', 'polite')
      document.body.appendChild(el)
    }
    el.textContent = msg
    el.classList.add('is-visible')
    window.clearTimeout(el._timer)
    el._timer = window.setTimeout(() => {
      el.classList.remove('is-visible')
    }, 2600)
  }

  const buildIssueNewUrl = () => {
    const pathname = window.location.pathname || '/'
    const title = encodeURIComponent(pathname)
    return 'https://github.com/' + REPO + '/issues/new?title=' + title
  }

  const remountUtterances = commentEl => {
    const wrap = commentEl.querySelector('#utterances-wrap') || commentEl.querySelector('.comment-wrap')
    if (!wrap) return
    wrap.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://utteranc.es/client.js'
    script.async = true
    script.setAttribute('repo', REPO)
    script.setAttribute('issue-term', 'pathname')
    script.setAttribute('theme', getUtterancesTheme())
    script.setAttribute('crossorigin', 'anonymous')
    wrap.appendChild(script)
  }

  let checkTimer = 0

  const enhanceCommentSection = () => {
    window.clearInterval(checkTimer)
    const commentEl = document.getElementById('post-comment')
    if (!commentEl) return

    const pathKey = window.location.pathname || '/'
    const resonates = readResonates()
    const resonated = Boolean(resonates[pathKey])

    // 1. Inject refined editorial header & engagement bar once per mount
    if (!commentEl.querySelector('.comment-sanctuary-head')) {
      const head = document.createElement('div')
      head.className = 'comment-sanctuary-head'
      head.innerHTML =
        '<div class="comment-sanctuary-head__left">' +
          '<h3 class="comment-sanctuary-head__title">留下一句话</h3>' +
          '<span class="comment-sanctuary-head__sub">GitHub 登录 · 支持 Markdown</span>' +
        '</div>' +
        '<div class="comment-sanctuary-head__actions">' +
          '<button type="button" class="comment-action-btn' + (resonated ? ' is-active' : '') + '" data-comment-resonate aria-pressed="' + (resonated ? 'true' : 'false') + '">' +
            '<svg viewBox="0 0 16 16" width="13" height="13" fill="' + (resonated ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.4"><path d="M8 13.4s-5-3.1-5-7A2.8 2.8 0 0 1 8 4.6a2.8 2.8 0 0 1 5 1.8c0 3.9-5 7-5 7Z" stroke-linejoin="round"/></svg>' +
            '<span data-resonate-label>' + (resonated ? '已留共鸣' : '留个共鸣') + '</span>' +
          '</button>' +
          '<button type="button" class="comment-action-btn" data-comment-share>' +
            '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.4 9.6l3.2-3.2M5.2 7.2L3.8 8.6a2.4 2.4 0 0 0 3.4 3.4l1.4-1.4M10.8 8.8l1.4-1.4a2.4 2.4 0 0 0-3.4-3.4L7.4 5.4"/></svg>' +
            '<span>复制链接</span>' +
          '</button>' +
        '</div>'

      commentEl.prepend(head)
    }

    // 2. If arriving from /moments/ with ?ref=..., show gentle context card for quoting!
    try {
      const params = new URLSearchParams(window.location.search)
      const refText = (params.get('ref') || '').trim().slice(0, 140)
      if (refText && !commentEl.querySelector('.comment-ref-banner')) {
        const banner = document.createElement('div')
        banner.className = 'comment-ref-banner'
        const quoteLine = '> 回应随笔：「' + refText + '」\n\n'
        const p = document.createElement('p')
        p.textContent = '正在回应随笔：「' + refText + '」'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'comment-action-btn'
        btn.textContent = '复制引用开头'
        btn.addEventListener('click', () => {
          copyText(quoteLine).then(() => showToast('已复制引用语，粘贴到评论框即可'))
        })
        banner.appendChild(p)
        banner.appendChild(btn)
        const head = commentEl.querySelector('.comment-sanctuary-head')
        if (head && head.nextSibling) commentEl.insertBefore(banner, head.nextSibling)
        else commentEl.appendChild(banner)
      }
    } catch (e) {}

    // 3. Loading shimmer + graceful network fallback if Utterances takes >7.5s
    let statusBox = commentEl.querySelector('.comment-sanctuary-status')
    if (!statusBox) {
      statusBox = document.createElement('div')
      statusBox.className = 'comment-sanctuary-status'
      statusBox.innerHTML =
        '<div class="comment-skeleton" id="comment-skeleton">' +
          '<span class="comment-skeleton__dot"></span>' +
          '<span>正在连线 GitHub 评论区…</span>' +
        '</div>' +
        '<div class="comment-fallback" id="comment-fallback" hidden>' +
          '<p>评论组件加载较慢（可能是当前网络访问 GitHub 受限）。你可以：</p>' +
          '<div class="comment-fallback__btns">' +
            '<button type="button" class="comment-action-btn" data-comment-retry>重新加载评论</button>' +
            '<a class="comment-action-btn" href="' + buildIssueNewUrl() + '" target="_blank" rel="noopener noreferrer">前往 GitHub 留言</a>' +
            '<button type="button" class="comment-action-btn" data-wechat-copy>复制微信号联系</button>' +
          '</div>' +
        '</div>'
      commentEl.appendChild(statusBox)
    }

    let waitedMs = 0
    const checkReady = () => {
      const iframe = commentEl.querySelector('iframe.utterances-frame')
      const skel = commentEl.querySelector('#comment-skeleton')
      const fb = commentEl.querySelector('#comment-fallback')
      if (iframe) {
        if (!iframe.dataset.themeBound) {
          iframe.dataset.themeBound = '1'
          iframe.addEventListener('load', () => {
            syncUtterancesTheme()
            window.setTimeout(syncUtterancesTheme, 350)
          })
          syncUtterancesTheme()
        }
        const rect = iframe.getBoundingClientRect()
        if (rect.height > 60) {
          if (skel) skel.hidden = true
          if (fb) fb.hidden = true
          statusBox.hidden = true
          syncUtterancesTheme()
          window.clearInterval(checkTimer)
          return
        }
      }
      waitedMs += 400
      if (waitedMs >= 7600) {
        if (skel) skel.hidden = true
        if (fb) fb.hidden = false
        window.clearInterval(checkTimer)
      }
    }

    checkReady()
    checkTimer = window.setInterval(checkReady, 400)
  }

  /* ==========================================================================
     Click Handlers (Resonate / Copy Link / Copy Friend Link / Retry Comments)
     ========================================================================== */
  document.addEventListener('click', event => {
    const target = event.target
    if (!target || !target.closest) return

    const resBtn = target.closest('[data-comment-resonate]')
    if (resBtn) {
      const pathKey = window.location.pathname || '/'
      const map = readResonates()
      const next = !map[pathKey]
      if (next) map[pathKey] = Date.now()
      else delete map[pathKey]
      saveResonates(map)
      resBtn.classList.toggle('is-active', next)
      resBtn.setAttribute('aria-pressed', next ? 'true' : 'false')
      const svg = resBtn.querySelector('svg')
      if (svg) svg.setAttribute('fill', next ? 'currentColor' : 'none')
      const lbl = resBtn.querySelector('[data-resonate-label]')
      if (lbl) lbl.textContent = next ? '已留共鸣' : '留个共鸣'
      showToast(next ? '已把这份共鸣悄悄留在这里' : '已轻轻松开共鸣')
      return
    }

    if (target.closest('[data-comment-share]')) {
      const cleanUrl = window.location.origin + window.location.pathname
      copyText(cleanUrl).then(() => showToast('已复制当前页面链接'))
      return
    }

    if (target.closest('[data-copy-flink]')) {
      copyText(FLINK_TEMPLATE).then(() => showToast('已复制友链申请格式，可直接粘贴到下方评论'))
      return
    }

    if (target.closest('[data-comment-retry]')) {
      const commentEl = document.getElementById('post-comment')
      if (commentEl) {
        const skel = commentEl.querySelector('#comment-skeleton')
        const fb = commentEl.querySelector('#comment-fallback')
        const statusBox = commentEl.querySelector('.comment-sanctuary-status')
        if (statusBox) statusBox.hidden = false
        if (skel) skel.hidden = false
        if (fb) fb.hidden = true
        remountUtterances(commentEl)
        enhanceCommentSection()
      }
    }
  })

  /* ==========================================================================
     Theme & PJAX Observers
     ========================================================================== */
  new MutationObserver(mutations => {
    if (mutations.some(m => m.attributeName === 'data-theme')) {
      syncUtterancesTheme()
      window.setTimeout(syncUtterancesTheme, 300)
    }
  }).observe(root, { attributes: true })

  window.addEventListener('blog:atmosphere-change', () => {
    syncUtterancesTheme()
  })

  const boot = () => {
    enhanceCommentSection()
    syncUtterancesTheme()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
  document.addEventListener('pjax:complete', () => {
    window.setTimeout(boot, 120)
  })
})()
