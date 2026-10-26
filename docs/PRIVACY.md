# Privacy

KokoMovie is fully local: it needs no KokoMovie account, sends no application telemetry, and synchronizes no library to a KokoMovie server.

It may store a TMDB credential in the OS keychain and preferences, watchlist, likes, playback history, download metadata, logs, and downloads in local storage. Uninstalling may not remove every keychain entry or user-selected download directory.

Personal suggestions are ranked on-device using likes, meaningful playback and saved titles. At most six seed title IDs are used for ordinary TMDB related-title requests per recommendation refresh. The full library and viewing history are not uploaded as a recommendation profile. Removing a Like removes that explicit signal; watch history or My List can still supply interest in the same title. Likes are included in manual library exports.

Features contact TMDB for catalog data; providers and CDNs for playback; torrent services and peers when used; GitHub for Help Center feedback and updates; and Discord only when Rich Presence is enabled. These third parties receive ordinary network information and apply their own policies.

Users can remove the TMDB credential in Settings and delete library entries and downloads through application controls. Complete erasure may also require removing the application data directory and keychain entry. This is not legal advice.

macOS v2.1.0 uses manual updates: opening the Downloads link contacts GitHub through the system
browser. It does not automatically download or install replacement app bundles. The TMDB
credential uses macOS Keychain and library state remains in the local application-data folder.
Replacing the app in Applications does not itself remove that folder or the keychain entry.
