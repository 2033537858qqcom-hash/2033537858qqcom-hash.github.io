import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'netease-config.json'), 'utf8'))

export const UID = String(cfg.uid || '3988339491')
export const DENY_IDS = new Set((cfg.denyIds || []).map(Number))
export const DENY_ID_STRINGS = new Set((cfg.denyIds || []).map(String))

export function isGrandmaHold (msg, date) {
  return String(date || '').startsWith('2026-10-01') && /姥姥|外婆/.test(msg || '')
}

export function fixEncoding (text) {
  let t = String(text || '')
  const fixups = [
    [/\uFFFD+途一片迷茫/g, '前途一片迷茫'],
    [/结\uFFFD+了/g, '结束了'],
    [/才\uFFFD+年/g, '才两年'],
    [/大\uFFFD+姐/g, '大小姐'],
    [/不得\uFFFD+/g, '不得已']
  ]
  for (const [re, to] of fixups) t = t.replace(re, to)
  return t.replace(/\uFFFD+/g, '…')
}
