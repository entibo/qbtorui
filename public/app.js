import van from './van-1.5.5.min.js'
import {
  addTorrent,
  deleteTorrent,
  getChanges,
  listFilesInTorrent,
  PRIORITY,
  setPriority,
} from './api.js'
import {
  classes,
  isVideoExtension,
  normalizeTorrentName,
  Poller,
  splitPath,
} from './util.js'

/**
 * @template T
 * @typedef {import('./van-1.5.5.min.js').State<T>} State
 */
/** @typedef {import('./qbittorrent-webapi.js').TorrentInfo} TorrentInfo */
/** @typedef {import('./qbittorrent-webapi.js').File} File */

const { div, span, a, button, input } = van.tags

const UPDATE_INTERVAL = 1650
const DOWNLOAD_FOLDER = '/home/entibo/Videos/'
const LOCAL_STORAGE_KEY = 'qbittorrent_ui'

//

const settings = van.state(
  JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) ?? {},
)
van.derive(() => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings.val))
})

function isArchived(hash) {
  return settings.val.archived?.[hash]
}
function setArchived(hash, value) {
  const { [hash]: found, ...archived } = settings.val.archived ?? {}
  if (value && !found) {
    settings.val = { ...settings.val, archived: { ...archived, [hash]: true } }
  }
  if (!value && found) {
    settings.val = { ...settings.val, archived }
  }
}

//

const filterText = van.state('')
const normalizedFilterText = van.derive(() =>
  normalizeTorrentName(filterText.val),
)
const searchInput = input({
  type: 'text',
  autocomplete: 'off',
  class: 'filter-input',
  value: filterText,
  placeholder: 'all torrents',
  oninput(e) {
    filterText.val = e.target.value
  },
})
const searchInputActive = van.state(false)
searchInput.addEventListener('focus', () => (searchInputActive.val = true))
searchInput.addEventListener('blur', () => (searchInputActive.val = false))

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    filterText.val = ''
    if (searchInputActive.val) {
      searchInput.blur()
    }
    return
  }

  if (e.ctrlKey || e.metaKey) return

  if (e.key.length === 1 && !searchInputActive.val) {
    filterText.val = e.key
    searchInput.focus()
  }
})

van.add(
  document.body,
  div(
    { class: 'top' },
    button(
      {
        onclick() {
          filterText.val = ''
          searchInput.blur()
        },
        disabled: van.derive(() => !filterText.val),
      },
      '🔎',
    ),
    searchInput,
  ),
)

//

const torrentList = div({ class: 'torrents' })
van.add(document.body, torrentList)

/** @type {{[hash:string]: {info: State<TorrentInfo>, removed: State<Boolean>}} */
const torrents = {}

async function updateTorrentList() {
  const changes = await getChanges()

  for (const hash of changes.torrents_removed ?? []) {
    const torrent = torrents[hash]
    if (!torrent) continue
    torrent.removed.val = true
    console.log('Torrent removed:', hash)
  }

  /** @type {(typeof torrents)[string][]} */
  const newTorrents = []
  for (const [hash, info] of Object.entries(changes.torrents ?? {})) {
    if (!torrents[hash]) {
      torrents[hash] = {
        info: van.state({ ...info, hash }),
        removed: van.state(false),
      }
      newTorrents.push(torrents[hash])
    } else {
      // info contains only updated properties
      torrents[hash].info.val = { ...torrents[hash].info.val, ...info }
    }
  }

  for (const torrent of newTorrents.sort(
    (a, b) => a.info.val.added_on - b.info.val.added_on,
  )) {
    const addedDate = van.derive(
      () => new Date(torrent.info.val.added_on * 1000),
    )
    const complete = van.derive(() => torrent.info.val.progress === 1)
    const archived = van.derive(() => isArchived(torrent.info.rawVal.hash))

    const removing = van.state(false)
    const open = van.state(false)

    const normalizedName = van.derive(() =>
      normalizeTorrentName(torrent.info.val.name),
    )
    const hidden = van.derive(() => {
      if (!normalizedFilterText.val) return false
      return !normalizedName.val.includes(normalizedFilterText.val)
    })

    // Using el.prepend instead of van.add
    torrentList.prepend(
      div(
        {
          class: () =>
            classes(
              'torrent',
              !complete.val && 'downloading',
              removing.val && 'removing',
              torrent.removed.val && 'removed',
              open.val && 'open',
              archived.val && 'archived',
              hidden.val && 'hidden',
            ),
        },
        div(
          {
            class: 'torrent-info',
            onmousedown() {
              open.val = !open.val
            },
          },
          div(
            { class: 'buttons' },
            button(
              {
                onmousedown(e) {
                  e.stopPropagation()
                },
                onclick() {
                  console.log('Deleting', torrent.info.val.hash)
                  deleteTorrent({ hash: torrent.info.val.hash })
                  syncPoller.start()
                  removing.val = true
                },
              },
              '❌',
            ),
            button(
              {
                onmousedown(e) {
                  e.stopPropagation()
                },
                onclick() {
                  console.log('Archiving', torrent.info.val.hash)
                  setArchived(torrent.info.val.hash, !archived.val)
                },
              },
              () => (archived.val ? '🔺' : '📥'),
            ),
          ),
          div(
            {
              class: 'date',
              title: () =>
                addedDate.val.toLocaleString(undefined, {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  // hour12: false,
                }),
            },
            () => addedDate.val.toISOString().slice(0, 10),
          ),
          Size(van.derive(() => torrent.info.val.size)),
          div({ class: 'status' }, () =>
            complete.val
              ? Ratio(van.derive(() => torrent.info.val.ratio))
              : Progress(van.derive(() => torrent.info.val.progress)),
          ),
          div(
            { class: 'name' },
            van.derive(() => torrent.info.val.name),
          ),
        ),
        Files(torrent.info.val.hash, open),
      ),
    )
  }
}

function Files(torrentHash, shouldUpdate) {
  const filesElement = div({
    class: 'files',
  })

  /** @type {Map<string, State<File>>} */
  let fileStates
  const fileInfoPoller = Poller(async () => {
    const files = await listFilesInTorrent({ hash: torrentHash })
    if (fileStates) {
      for (const file of files) {
        fileStates[file.index].val = file
      }
    } else {
      fileStates = {}

      const commonPathPrefix = files
        .map((file) => splitPath(file.name).path)
        .reduce((prefix, path) => {
          for (let i = 0; i < prefix.length; i++) {
            if (prefix[i] !== path[i]) return prefix.slice(0, i)
          }
          return prefix
        })

      for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
        const fileState = van.state(file)
        fileStates[file.index] = fileState
        van.add(filesElement, File(torrentHash, fileState, commonPathPrefix))
      }
    }

    // Stop checking for updates once the file download is complete
    // Remove this if you want to display peers, activity, etc
    if (files.every((file) => file.progress === 1)) {
      fileInfoPoller.stop()
    }
  }, UPDATE_INTERVAL)

  van.derive(() => {
    if (shouldUpdate.val) fileInfoPoller.start()
    else fileInfoPoller.stop()
  })

  return filesElement
}

/**
 * @param {string} torrentHash
 * @param {State<File>} file */
function File(torrentHash, file, commonPathPrefix) {
  const complete = van.derive(() => file.val.progress === 1)

  // File name is assumed not to change
  const { path, filename, extension } = splitPath(file.val.name)
  const filenameWithExtension = filename + '.' + extension
  const simplifiedPath = path.slice(commonPathPrefix.length)

  // const link = [
  //   'https:/',
  //   location.host,
  //   'qbittorrent.downloads',
  //   file.val.name,
  // ].join('/')
  const link = location.href + '../' + file.val.name

  return div(
    {
      class: () => classes('file-info', !complete.val && 'downloading'),
    },
    Size(van.derive(() => file.val.size)),
    () =>
      complete.val
        ? isVideoExtension(extension)
          ? div(
              { class: 'status', onclick: play },
              button({ class: 'play' }, 'Play ▶️'),
            )
          : div({ class: 'status' })
        : div(
            {
              class: 'status',
              onclick() {
                // Cycle
                const priority = {
                  [PRIORITY.DONT_DOWNLOAD]: PRIORITY.NORMAL,
                  [PRIORITY.NORMAL]: PRIORITY.HIGH,
                  [PRIORITY.HIGH]: PRIORITY.DONT_DOWNLOAD,
                  [PRIORITY.MAXIMUM]: PRIORITY.DONT_DOWNLOAD,
                }[file.val.priority]
                setPriority({ hash: torrentHash }, file.val.index, priority)
                // Update UI/state without awaiting confirmation from the server
                file.val = { ...file.val, priority }
              },
            },
            div(
              { class: 'priority' },
              van.derive(
                () =>
                  ({
                    [PRIORITY.DONT_DOWNLOAD]: '⊘',
                    [PRIORITY.NORMAL]: '⌲',
                    [PRIORITY.HIGH]: '⌯⌲',
                    [PRIORITY.MAXIMUM]: '⌯⌯⌲',
                  }[file.val.priority]),
              ),
            ),
            Progress(van.derive(() => file.val.progress)),
          ),
    () =>
      (complete.val ? a : div)(
        {
          class: 'name',
          href: link,
          onkeydown(e) {
            if (e.key !== ' ') return
            if (!isVideoExtension(extension)) return
            if (e.ctrlKey || e.shiftKey) return
            e.preventDefault()
            play()
          },
        },
        filenameWithExtension,
      ),
    simplifiedPath
      ? div({ class: 'file-path' }, ' (', simplifiedPath, ')')
      : null,
  )

  function play() {
    open(`vlc://${DOWNLOAD_FOLDER}/${filenameWithExtension}`, '_self')
  }
}

function Progress(progress) {
  const percentage = van.derive(() => Math.floor(progress.val * 100))
  return div(
    { class: 'progress' },
    span({ class: 'number' }, percentage),
    span({ class: 'unit' }, '%'),
  )
}

function Ratio(ratio) {
  const ratioStr = van.derive(() => ratio.val.toFixed(2))
  return div(
    { class: 'ratio' },
    NumberWithDimLeadingZeroes(ratioStr),
    span({ class: 'unit' }, '↑'),
  )
}

function Size(size) {
  const sizeGB = van.derive(() => (size.val / 2 ** 30).toFixed(2))
  return div(
    { class: 'size' },
    NumberWithDimLeadingZeroes(sizeGB),
    span({ class: 'unit' }, 'GB'),
  )
}

function NumberWithDimLeadingZeroes(stringState) {
  return () => {
    const [_, leadingZeroesBeforeComma, dot, leadingZeroesAfterComma, rest] =
      stringState.val.match(/^(0*)(\.?)(0*)(.*)$/)
    return span(
      { class: 'number' },
      span({ class: 'leading-zeroes' }, leadingZeroesBeforeComma),
      dot,
      span({ class: 'leading-zeroes' }, leadingZeroesAfterComma),
      rest,
    )
  }
}

// Sync loop

const syncPoller = Poller(updateTorrentList, UPDATE_INTERVAL)
syncPoller.start()

// Paste to add a torrent
document.addEventListener('paste', (event) => {
  const text = event.clipboardData.getData('text').trim()
  if (!text.match(/^(magnet|https?:\/\/)/i)) return
  console.log(`Adding torrent: ${text}`)
  addTorrent(text)
})
