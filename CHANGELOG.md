# Change Log

All notable changes to the "celebi" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.2] - 2026-09-07

### Added
- Local and remote ROOT viewer with byte-range requests and bundled ZSTD/LZMA decoders.
- Editable README.md and celebi.yaml in the detail preview.

### Changed
- ROOT viewer always uses a white background.
- Result images load only when clicked.
- Hide README.md and celebi.yaml in the sidebar; hide YAML sections for directories.

### Fixed
- DITE connection status handling and stale result updates when switching tasks.
- Missing relationship colors and silent ROOT file loading errors.

## [0.0.1] - 2026-08-16

### Added
- Dynamic Celebi project tree in the Activity Bar (projects, algorithms, tasks, data, and workspace files)
- Interactive JSROOT viewer for local and DITE-hosted `.root` files
- Byte-range proxy for remote ROOT results, preventing eager full-file downloads
- Detail webview panel showing object metadata, README, parameters, commands, predecessors, and successors
- Automatic fetch of job status and result files from DITE for submitted tasks
- Impression selector for switching between historical task impressions
- Lightbox for viewing result images
- File watcher that auto-refreshes the tree on project changes
- Refresh command and view title action

### Changed
- Simplified extension to a lean viewer (tree + detail webview)
- Result discovery no longer calls `/collect`; files still on a runner are streamed through `/remote-export`

### Fixed
- Moved detail webview script to an external file to avoid VS Code webview inline-script serialization issues
- Fixed lightbox overlay always covering the detail panel due to `display: flex` overriding the `hidden` attribute
- Automatically load results for the default task impression on selection
- Added error handling for DITE fetch failures
