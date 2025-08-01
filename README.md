Interface for browsing, downloading and to a limited extent managing torrent using the [qBittorrent WebUI API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)).

Assuming you have qBittorrent running on a machine and a web server such as nginx serving the torrent files, push this repo's `public` to a folder in the remote download folder.

```sh
rsync public/ user@host:/path/to/qbittorrent/downloads/ui
```