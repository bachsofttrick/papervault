# paperVault

A local, server-free prototype for keeping identity photos, passports, and PDF tickets together. Files live as BLOBs inside a real SQLite database. SQLite FTS4 searches the short descriptions you write.

## Open it

Double-click **`index.html`** in this folder. A current desktop Chrome, Edge, Firefox, or Safari with WebAssembly support is recommended. Every runtime dependency is bundled locally. A server, package install, and internet connection are unnecessary.

1. Choose **Add documents** or drop images and PDFs onto the page.
2. Give each file a description, such as **My ID**.
3. Search **id** to find it. All words are required; word prefixes also match.
4. Choose **Save database**.
5. Next time, choose **Open database** and select your saved file.

The app starts with an empty in-memory vault. Use **Open database** to open a sqlite file. The **sample documents** button creates fictional documents locally, in a separate sample vault. Start a new vault to replace the samples with your own documents.

## Browser file permissions

Browsers require permission to read and write local files. Where the File System Access API is available, opening or saving lets you select the database on disk, and subsequent saves update that file. Elsewhere, opening uses a file input and saving downloads a new database copy. Download completion cannot be confirmed by the app, so it reports **Download requested**.

**Save is explicit.** Changes remain in memory until you save. The page warns before closing with unsaved changes; browser crashes, forced shutdowns, and some mobile browsers can bypass that warning. Mobile operating systems vary in their ability to open a local HTML folder with adjacent scripts. Desktop browsers are the most reliable environment for this prototype.

## Features

- Full-text description search, including case-insensitive word prefixes and Unicode words.
- Identity, Travel, Photos, and Other collections; favorites; image/PDF filters; sorting.
- Multiple uploads with individual descriptions and collection selection.
- Image previews, browser PDF previews with download fallback, original-file download.
- Edit document details, delete documents, open databases, save databases, create a fresh vault.
- Responsive keyboard-accessible interface, native modal dialogs, slash-to-search shortcut.
- JPEG, PNG, WebP, GIF, and PDF files; 15 MB per file; up to 20 uploads per batch; 100 MB vault limit.

Search indexes **descriptions only**. OCR, image contents, PDF text, and filenames are outside the search index. SQLite FTS4 supplies token/prefix matching, rather than arbitrary substrings within a word.

## Privacy and limits

**This is an unencrypted prototype.** Anyone who obtains the SQLite file can read the uploaded files. Use device encryption and protect your backups. The interface does not provide authentication or encryption. Deleted files remain in older saved copies and backups. The current database is vacuumed after deletion to reclaim its pages.

The app makes no network requests and uses no analytics, external fonts, CDN, or remote assets. A content security policy blocks network connections and restricts script execution. Open trusted paperVault databases and documents only. PDFs use the browser's native viewer, whose controls and document links belong to the browser. The whole database is loaded into memory; large files can briefly pause the interface. Splitting large collections into smaller databases is recommended.

## Files and architecture

- `index.html`: semantic page and dialog markup.
- `styles.css`: responsive visual system.
- `app.js`: UI state and interaction controllers.
- `database.js`: SQLite schema, full-text index triggers, parameterized queries, import validation.
- `files.js`: file signatures, picker/save/download helpers.
- `icons.js`: bundled SVG icon markup.
- `samples.js`: locally generated fictional PNG/PDF documents.
- `paperVault.sqlite`: empty SQLite starter database, schema version 1.
- `vendor/sql-wasm-inline.js`: sql.js **1.15.2**, embedded WebAssembly build.

The inline WebAssembly build avoids fetching a separate `.wasm` file and therefore works with local `file://` pages. Upstream: <https://github.com/sql-js/sql.js>. The app's readable source is separate from the unmodified, generated vendor library.

