/**
 * 拉取网易云用户公开动态 → tools/netease-events.json
 * 默认 uid: 3988339491 (Rogue_lr)
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uid = process.argv[2] || '3988339491'
const outPath = path.join(__dirname, 'netease-events.json')
const rawPath = path.join(__dirname, 'netease-events-raw.json')

function get (url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://music.163.com/',
          Accept: '*/*'
        }
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(d))
          } catch {
            reject(new Error('JSON parse fail: ' + d.slice(0, 200)))
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function pad (n) {
  return String(n).padStart(2, '0')
}

function fmt (ts) {
  const t = new Date(ts + 8 * 3600 * 1000)
  return (
    t.getUTCFullYear() +
    '-' +
    pad(t.getUTCMonth() + 1) +
    '-' +
    pad(t.getUTCDate()) +
    ' ' +
    pad(t.getUTCHours()) +
    ':' +
    pad(t.getUTCMinutes()) +
    ':00'
  )
}

const typeMap = {
  18: 'share_song',
  19: 'share_album',
  35: 'share_playlist',
  13: 'share_playlist',
  22: 'forward',
  39: 'publish_video',
  57: 'voice',
  56: 'type_56'
}

let lasttime = -1
const all = []
let page = 0

while (page < 50) {
  const url = `https://music.163.com/api/event/get/${uid}?limit=20&time=${lasttime}`
  const data = await get(url)
  if (!data.events || !data.events.length) {
    console.log('stop page', page, 'more', data.more)
    break
  }
  all.push(...data.events)
  console.log('page', page, 'got', data.events.length, 'total', all.length, 'more', data.more)
  if (!data.more) break
  lasttime = data.lasttime
  page++
  await new Promise((r) => setTimeout(r, 300))
}

const simplified = all.map((ev) => {
  let json = {}
  try {
    json = typeof ev.json === 'string' ? JSON.parse(ev.json) : ev.json || {}
  } catch {
    /* ignore */
  }
  const msg = json.msg || json.content || ''
  const pics = (ev.pics || [])
    .map((p) => p.originUrl || p.squareUrl || p.rectangleUrl || p.pcSquareUrl)
    .filter(Boolean)
  return {
    id: ev.id,
    eventTime: ev.eventTime,
    date: fmt(ev.eventTime),
    type: ev.type,
    typeName: typeMap[ev.type] || 'type_' + ev.type,
    msg,
    pics,
    song: json.song
      ? {
          name: json.song.name,
          artists: (json.song.artists || []).map((a) => a.name).join('/')
        }
      : null,
    playlist: json.playlist ? { name: json.playlist.name } : null
  }
})

fs.writeFileSync(rawPath, JSON.stringify(all, null, 2))
fs.writeFileSync(outPath, JSON.stringify(simplified, null, 2))
console.log('saved', simplified.length, 'events →', outPath)
console.log(
  'with text:',
  simplified.filter((e) => e.msg && e.msg.trim()).length
)
