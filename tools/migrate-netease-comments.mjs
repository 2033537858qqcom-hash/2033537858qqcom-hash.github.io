/**
 * 把 tools/netease-comments.json（李 自己的网易云评论）整理成 source/_data/shuoshuo-comments.yml。
 *
 * 字段：cid / event / date / content / reply_to / likes / kind / source
 *  - kind: continue = 动态发出后 24 小时内、顺着正文继续写的（非回复）
 *          note     = 隔了更久回头补的，或是对别人的回复（页面里折起，标「我后来写的」）
 *  - 只保留 李 自己的话；回复只记被回复者昵称（可选展示），不存别人的评论原文
 *  - 按 cid 去重；DENY_IDS（含 10/1 姥姥动态）与姥姥拦截的动态下的评论一律跳过
 *  - 网易云表情 [吃瓜] 之类映射为 emoji，认不得的直接删掉
 *  - 父动态不在博客里的评论，渲染时作为独立「评论」小条，链接回原动态
 * 用法：node tools/migrate-netease-comments.mjs（moments:sync 里已串联）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const commentsPath = path.join(root, 'tools/netease-comments.json')
const eventsPath = path.join(root, 'tools/netease-events.json')
const shuoshuoPath = path.join(root, 'source/_data/shuoshuo.yml')
const outPath = path.join(root, 'source/_data/shuoshuo-comments.yml')
const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate-netease-shuoshuo.mjs'), 'utf8')

// 与 migrate-netease-shuoshuo.mjs 共用同一份 DENY_IDS
const denyBlock = migrateSrc.match(/const DENY_IDS = new Set\(\[([\s\S]*?)\]\)/)
if (!denyBlock) {
  console.error('[comments] 读不到 DENY_IDS，拒绝写入')
  process.exit(1)
}
const DENY_IDS = new Set((denyBlock[1].match(/\d{6,}/g) || []).map(String))

const EMOJI = {
  吃瓜: '🍉', 生气: '😠', 发怒: '😡', 汗: '😅', 庆祝: '🎉', 搞怪: '🤪', 一路顺风: '🛫',
  多多大笑: '😄', 多多无语: '😑', 西西晕了: '😵', 西西疑问: '🤔', 西西再见: '👋', 皱眉: '😣'
}

function cleanContent (text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\[([^\[\]\n]{1,8})\]/g, (all, name) => (name in EMOJI ? EMOJI[name] : ''))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

const comments = JSON.parse(fs.readFileSync(commentsPath, 'utf8'))
const events = fs.existsSync(eventsPath) ? JSON.parse(fs.readFileSync(eventsPath, 'utf8')) : []
const eventById = new Map(events.map(e => [String(e.id), e]))
const eventByDate = new Map(events.map(e => [e.date, e]))

// 博客里已有的动态 id（没写 id 的老条目按日期对回动态）
const shuoText = fs.readFileSync(shuoshuoPath, 'utf8').replace(/\r\n/g, '\n')
const blogIds = new Set()
for (const m of shuoText.matchAll(/^- (?:id: (\d+)\n  )?content: \|\n[\s\S]*?\n  date: ([^\n]+)/gm)) {
  if (m[1]) blogIds.add(m[1])
  else {
    const ev = eventByDate.get(m[2].trim())
    if (ev) blogIds.add(String(ev.id))
  }
}

function isGrandmaHeld (eventId) {
  const ev = eventById.get(String(eventId))
  if (!ev) return false
  return String(ev.date || '').startsWith('2026-10-01') && /姥姥|外婆/.test(ev.msg || '')
}

// 父动态摘要：父动态都是 李 自己发的动态，只取 李 自己的话（前 60 字）或歌名
function parentInfo (eventId) {
  const ev = eventById.get(String(eventId))
  if (!ev) return { excerpt: '', title: '', date: '' }
  const msg = String(ev.msg || '').replace(/\r\n?/g, '\n').replace(/\[([^\[\]\n]{1,8})\]/g, (all, name) => (name in EMOJI ? EMOJI[name] : ''))
  const flat = msg.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  const excerpt = chars.length > 60 ? chars.slice(0, 60).join('') + '…' : flat
  const title = ev.song && ev.song.name ? ev.song.name + (ev.song.artists ? ' - ' + ev.song.artists : '') : ''
  return { excerpt, title, date: ev.date || '' }
}

const seen = new Set()
const out = []
const skipped = { deny: 0, grandma: 0, empty: 0, dup: 0 }
for (const c of comments) {
  const eid = String(c.event)
  if (seen.has(String(c.cid))) { skipped.dup++; continue }
  if (DENY_IDS.has(eid)) { skipped.deny++; continue }
  if (isGrandmaHeld(eid)) { skipped.grandma++; continue }
  const content = cleanContent(c.content)
  if (!content) { skipped.empty++; continue }
  seen.add(String(c.cid))
  const evTime = c.eventDate ? Date.parse(c.eventDate.replace(' ', 'T') + '+08:00') : NaN
  const within = Number.isFinite(evTime) && c.time - evTime <= 24 * 3600 * 1000
  out.push({
    cid: c.cid,
    event: eid,
    date: c.date,
    content,
    reply_to: c.isReply ? (c.replyTo || '') : '',
    likes: c.likes || 0,
    kind: !c.isReply && within ? 'continue' : 'note',
    source: 'netease',
    inBlog: blogIds.has(eid),
    parent: parentInfo(eid)
  })
}
out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

const q = s => JSON.stringify(String(s))
let yml = '# 李 自己的网易云评论（uid 3988339491），一次性手动同步，不含别人的评论内容\n'
yml += '# 生成：tools/migrate-netease-comments.mjs；kind: 随笔下合并为「作者的评论」组，continue 标「接着写」，note 标「后来补的」\n'
yml += '# event 不在 shuoshuo.yml 里的，页面上按父动态合并成一条「评论组」（带 parent_excerpt / parent_title / parent_date），并链回原动态\n'
yml += `# 条数: ${out.length}（随笔下 ${out.filter(c => c.inBlog).length}，独立 ${out.filter(c => !c.inBlog).length}）\n\n`
for (const c of out) {
  yml += `- cid: ${c.cid}\n  event: ${q(c.event)}\n  date: ${q(c.date)}\n  content: ${q(c.content)}\n`
  yml += `  reply_to: ${q(c.reply_to)}\n  likes: ${c.likes}\n  kind: ${c.kind}\n  source: ${c.source}\n`
  if (!c.inBlog) {
    yml += `  parent_excerpt: ${q(c.parent.excerpt)}\n  parent_title: ${q(c.parent.title)}\n  parent_date: ${q(c.parent.date)}\n`
  }
}
fs.writeFileSync(outPath, yml, 'utf8')
console.log(JSON.stringify({
  input: comments.length,
  written: out.length,
  attachedToBlogEssays: out.filter(c => c.inBlog).length,
  standalone: out.filter(c => !c.inBlog).length,
  continue: out.filter(c => c.kind === 'continue').length,
  note: out.filter(c => c.kind === 'note').length,
  skipped
}, null, 2))
