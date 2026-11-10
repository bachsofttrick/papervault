/* Browser file permissions belong here, separate from the SQLite repository.
   Network access, a local server, telemetry, and cloud storage are unnecessary. */
window.PaperVaultFiles = (() => {
  'use strict';
  const { MAX_FILE_SIZE, MAX_DATABASE_SIZE } = window.PaperVaultDatabase;

  function getMime(bytes) {
    const text = new TextDecoder('ascii').decode(bytes.slice(0, 12));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
    if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif';
    if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp';
    if (text.startsWith('%PDF-')) return 'application/pdf';
    throw new Error('Choose a JPEG, PNG, WebP, GIF, or PDF. This file’s contents do not match a supported format.');
  }

  async function readUpload(file) {
    if (!file.size) throw new Error(`${file.name} is empty.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} exceeds the 15 MB limit.`);
    const data = new Uint8Array(await file.arrayBuffer());
    return { filename: file.name, mime: getMime(data), data };
  }

  async function readDatabase(file) {
    if (file.size > MAX_DATABASE_SIZE) throw new Error('Choose a database smaller than 100 MB.');
    const data = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(data.slice(0, 16)) !== 'SQLite format 3\0') throw new Error('This file is not a SQLite database.');
    return data;
  }

  function download(bytes, mime, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    // Strip filesystem path separators from imported filenames.
    link.download = filename.replace(/[\\/\u0000-\u001f]/g, '_');
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function saveDatabase(bytes, handle, suggestedName) {
    if ('showSaveFilePicker' in window) {
      const chosenHandle = handle || await window.showSaveFilePicker({ suggestedName, types: [{ description: 'paperVault SQLite database', accept: { 'application/x-sqlite3': ['.sqlite'] } }] });
      const writable = await chosenHandle.createWritable();
      try { await writable.write(bytes); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
      return { handle: chosenHandle, name: chosenHandle.name, downloaded: false };
    }
    download(bytes, 'application/x-sqlite3', suggestedName);
    return { handle: null, name: suggestedName, downloaded: true };
  }

  function formatSize(size) {
    if (size < 1024) return `${size} B`;
    return size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  return { readUpload, readDatabase, download, saveDatabase, formatSize, getMime };
})();
