export function Poller(fn, delay) {
  let timeout

  function loop() {
    timeout = setTimeout(loop, delay)
    if (document.hidden) return
    fn()
  }

  function stop() {
    clearTimeout(timeout)
    timeout = undefined
  }

  function start() {
    stop()
    loop()
  }

  return {
    start,
    stop,
  }
}

export function splitPath(/** @type {string} */ filePath) {
  const parts = filePath.split('/')
  const fullName = parts.pop()
  const path = parts.join('/')
  const dotIndex = fullName.lastIndexOf('.')

  return {
    path: path,
    filename: dotIndex !== -1 ? fullName.slice(0, dotIndex) : fullName,
    extension: dotIndex !== -1 ? fullName.slice(dotIndex + 1) : '',
  }
}
export function classes(...values) {
  return values.filter((v) => v).join(' ')
}

export function isVideoExtension(extension) {
  return ['mp4', 'mkv'].includes(extension.toLowerCase())
}
export function normalizeTorrentName(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s.!?,;:&/\-‑–—_(){}'"‚‘’«»“”\[\]]+/g, ' ')
    // TODO accents é -> e etc
}
