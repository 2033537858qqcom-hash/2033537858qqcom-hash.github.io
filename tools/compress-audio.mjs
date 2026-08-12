/**
 * 将 source/music-files 下较大的 MP3 转码为约 64kbps，原地覆盖。
 */
import { spawn } from 'node:child_process'
import { readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const dir = 'source/music-files'
const bitrate = '64k'
const minBytes = 0.8 * 1024 * 1024

if (!ffmpegPath) {
  console.error('ffmpeg-static binary not found')
  process.exit(1)
}

const runFfmpeg = (input, output) => new Promise((resolve, reject) => {
  const args = [
    '-y',
    '-i', input,
    '-vn',
    '-codec:a', 'libmp3lame',
    '-b:a', bitrate,
    '-ar', '44100',
    '-ac', '2',
    '-map_metadata', '-1',
    output
  ]
  const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  child.stderr.on('data', chunk => { err += chunk.toString() })
  child.on('error', reject)
  child.on('close', code => {
    if (code === 0) resolve()
    else reject(new Error(err.slice(-500) || `ffmpeg exit ${code}`))
  })
})

const files = (await readdir(dir)).filter(name => name.toLowerCase().endsWith('.mp3') && !name.startsWith('.tmp-'))
if (!files.length) {
  console.log('no mp3 files')
  process.exit(0)
}

for (const name of files) {
  const input = join(dir, name)
  const temp = join(dir, `.tmp-${name}`)
  const before = (await stat(input)).size
  if (before < minBytes) {
    console.log(`${name}: skip (<1.2MB, ${(before / 1024 / 1024).toFixed(2)}MB)`)
    continue
  }
  try {
    await runFfmpeg(input, temp)
    const after = (await stat(temp)).size
    if (after >= before) {
      await unlink(temp)
      console.log(`${name}: skip (re-encode not smaller)`)
      continue
    }
    await unlink(input)
    await rename(temp, input)
    console.log(
      `${name}: ${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024 / 1024).toFixed(2)}MB`
    )
  } catch (error) {
    try { await unlink(temp) } catch {}
    console.error(`${name}: failed`, error.message)
  }
}
