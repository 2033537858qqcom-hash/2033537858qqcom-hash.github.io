'use strict'

/**
 * 把 李 自己的网易云评论（source/_data/shuoshuo-comments.yml）并进随笔页的 #shuoshuo-data：
 *  - 父动态在随笔里的 → 挂到该随笔的 comments 字段（前端按 kind 渲染）
 *  - 父动态不在随笔里的 → 按父动态合并成一条「评论组」（standalone+group），带父动态摘要/歌名，链回原动态
 * 只含 李 自己写的话。
 */

const UID = '3988339491'
const DATA_RE = /(<script type="application\/json" id="shuoshuo-data">)([\s\S]*?)(<\/script>)/

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const safeJSON = value => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029')

function loadComments () {
  const data = hexo.locals.get('data') || {}
  const list = data['shuoshuo-comments']
  return Array.isArray(list) ? list : []
}

hexo.extend.filter.register('after_render:html', (str, data) => {
  if (typeof str !== 'string' || !str.includes('id="shuoshuo-data"')) return str
  const match = str.match(DATA_RE)
  if (!match) return str

  let items
  try {
    items = JSON.parse(match[2])
  } catch (e) {
    return str
  }
  if (!Array.isArray(items)) return str

  const comments = loadComments()
  if (!comments.length) return str

  const byEvent = new Map()
  items.forEach(item => {
    if (item && item.id) byEvent.set(String(item.id), item)
  })

  const groups = new Map()
  comments.forEach(c => {
    const event = String(c.event)
    const comment = {
      cid: String(c.cid),
      date: String(c.date || ''),
      content: String(c.content || ''),
      kind: c.kind === 'continue' ? 'continue' : 'note',
      likes: Number(c.likes) || 0
    }
    if (c.reply_to) comment.reply_to = String(c.reply_to)
    const parent = byEvent.get(event)
    if (parent) {
      if (!parent.comments) parent.comments = []
      parent.comments.push(comment)
    } else {
      // 父动态不在随笔里：同一父动态的评论合并成一条「评论组」
      if (!groups.has(event)) {
        groups.set(event, {
          standalone: true,
          group: true,
          event,
          parent_excerpt: String(c.parent_excerpt || ''),
          parent_title: String(c.parent_title || ''),
          parent_date: String(c.parent_date || ''),
          link: `https://music.163.com/#/event?id=${encodeURIComponent(event)}&uid=${UID}`,
          tags: [],
          comments: []
        })
      }
      groups.get(event).comments.push(comment)
    }
  })
  const standalone = [...groups.values()]
  standalone.forEach(g => {
    g.comments.sort((a, b) => String(a.date).localeCompare(String(b.date)))
    g.date = g.comments[g.comments.length - 1].date // 以最新一条评论定位
  })

  items.forEach(item => {
    if (item && item.comments) {
      item.comments.sort((a, b) => String(a.date).localeCompare(String(b.date)))
    }
  })

  const merged = items.concat(standalone)
  return str.replace(DATA_RE, (all, open, body, close) => open + safeJSON(merged) + close)
})
