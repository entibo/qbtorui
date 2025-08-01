async function qbittorrentRequest(reqFn, attempts = 5) {
  if (attempts <= 0) return
  const res = await reqFn()
  if (!res.ok) {
    return qbittorrentRequest(reqFn, attempts - 1)
  }
  const txt = await res.text()
  try {
    const json = JSON.parse(txt)
    return json
  } catch (e) {
    return txt
  }
}

/** @return {Promise<import("./qbittorrent-webapi").TorrentInfo[]>} */
export function listTorrents() {
  return qbittorrentRequest(() => fetch(`/qbittorrent/api/v2/torrents/info`))
}

let last_rid = 0
/** @return {Promise<import("./qbittorrent-webapi").SyncResponse>} */
export async function getChanges() {
  const r = await fetch(`/qbittorrent/api/v2/sync/maindata?rid=${last_rid}`)
  const j = await r.json()
  last_rid = j.rid
  return j
}

/** @return {Promise<import("./qbittorrent-webapi").File[]>} */
export function listFilesInTorrent({ hash }) {
  return qbittorrentRequest(() =>
    fetch(`/qbittorrent/api/v2/torrents/files?hash=${hash}`),
  )
}

export function deleteTorrent({ hash }) {
  return qbittorrentRequest(() =>
    fetch(
      `/qbittorrent/api/v2/torrents/delete?deleteFiles=true&hashes=${hash}`,
    ),
  )
}

export function addTorrent(url) {
  const formData = new FormData()
  formData.set('urls', url)
  return qbittorrentRequest(() =>
    fetch(`/qbittorrent/api/v2/torrents/add`, {
      method: 'POST',
      body: formData,
    }),
  )
}

export const PRIORITY = {
  DONT_DOWNLOAD: 0,
  NORMAL: 1,
  HIGH: 6,
  MAXIMUM: 7,
}
export async function setPriority({ hash }, fileIndex, priority) {
  const params = `hash=${hash}&id=${fileIndex}&priority=${priority}`
  const r = await fetch(`/qbittorrent/api/v2/torrents/filePrio?${params}`)
  if (r.status === '400') return 'Invalid file index or priority'
  if (r.status === '404') return 'Torrent not found'
  if (r.status === '409') return 'File not found'
}
