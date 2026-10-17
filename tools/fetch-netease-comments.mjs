/**
 * 拉取 李 自己在网易云动态下的评论（含别人动态下的）→ tools/netease-comments.json
 * 依赖 tools/netease-events-raw.json（先跑 fetch-netease-events.mjs）。
 * 接口无需登录：/api/v1/resource/comments/{threadId}?limit=100&offset=0
 * 只保留 user.userId === uid 的评论；别人的评论内容一律不落盘，
 * 回复只记录被回复者昵称（可选展示），不保存其原文。每次请求间隔 150ms。
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uid = Number(process.argv[2] || '3988339491')
const rawPath = path.join(__dirname, 'netease-events-raw.json')
const outPath = path.join(__dirname, 'netease-comments.json')
const DELAY = 150
const sleep = ms => new Promise(r => setTimeout(r, ms))

function get (url, attempt = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const retry = err => {
      if (attempt < 2) setTimeout(() => get(url, attempt + 1).then(resolve, reject), 800 * (attempt + 1))
      else reject(err)
    }
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://music.163.com/',
        Accept: '*/*'
      }
    }, res => {
      let d = ''
      res.on('data', c => (d += c))
      res.on('end', () => {
        if (res.statusCode !== 200) return retry(new Error('HTTP ' + res.statusCode))
        try { resolve(JSON.parse(d)) } catch { retry(new Error('JSON parse fail')) }
      })
    })
    req.on('error', retry)
    req.end()
  })
}

function fmt (ts) {
  const t = new Date(ts + 8 * 3600 * 1000)
  const p = n => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`
}

const events = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
const own = []
const seen = new Set()
let requests = 0
let failed = 0

for (const ev of events) {
  const threadId = ev.threadId || (ev.info && ev.info.commentThread && ev.info.commentThread.id)
  if (!threadId) continue
  let offset = 0
  for (let page = 0; page < 20; page++) {
    let data
    try {
      data = await get(`https://music.163.com/api/v1/resource/comments/${threadId}?limit=100&offset=${offset}`)
    } catch (err) {
      failed++
      console.warn('[comments] fail', ev.id, err.message)
      break
    }
    requests++
    await sleep(DELAY)
    const list = (data && data.comments) || []
    for (const c of list) {
      if (!c.user || Number(c.user.userId) !== uid) continue
      if (seen.has(c.commentId)) continue
      seen.add(c.commentId)
      const replied = Array.isArray(c.beReplied) ? c.beReplied[0] : null
      own.push({
        cid: c.commentId,
        event: ev.id,
        eventDate: fmt(ev.eventTime),
        eventTitle: (ev.info && ev.info.commentThread && ev.info.commentThread.resourceTitle) || '',
        time: c.time,
        date: fmt(c.time),
        content: c.content || '',
        likes: c.likedCount || 0,
        replyTo: replied && replied.user ? replied.user.nickname || '' : '',
        isReply: Boolean(c.parentCommentId) || Boolean(replied)
      })
    }
    if (!data.more || !list.length) break
    offset += list.length
  }
}

own.sort((a, b) => a.time - b.time)
fs.writeFileSync(outPath, JSON.stringify(own, null, 2))
console.log(`[comments] events=${events.length} requests=${requests} failed=${failed} own=${own.length} events_with_own=${new Set(own.map(c => c.event)).size}`)
