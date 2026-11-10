/* Application/controller layer. The repository owns all SQL and the file helper
   owns disk access. State is confined to this closure; markup is escaped at its
   output boundary. Disk saves are always explicit and accurately labeled. */
(async function startPaperVault() {
  'use strict';
  const { VaultRepository, CATEGORIES, MAX_DATABASE_SIZE } = window.PaperVaultDatabase;
  const { icon, hydrate } = window.PaperVaultIcons;
  const files = window.PaperVaultFiles;
  /** @param {string} selector @returns {any} Dynamic page controls have different DOM interfaces. */
  const $ = selector => document.querySelector(selector);
  const state = { repository: null, SQL: null, filter: 'all', type: 'all', dirty: false, busy: false, handle: null, name: 'Untitled vault', status: 'Empty vault · save to create your database', uploads: [], activeId: null, thumbnailUrls: new Map(), detailUrl: null };
  let toastTimer;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function notify(message) {
    window.clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = window.setTimeout(() => { $('#toast').hidden = true; }, 5000);
  }

  function updateStatus() {
    $('#database-name').textContent = state.name;
    $('#save-status').textContent = state.busy ? 'Working locally…' : state.dirty ? 'Unsaved changes · save before closing' : state.status;
    $('#save-status').classList.toggle('unsaved', state.dirty);
    ['#add-button', '#open-button', '#save-button', '#new-button', '#empty-add', '#sample-button', '#dropzone', '#clear-demo'].forEach(selector => { $(selector).disabled = state.busy || !state.repository; });
  }

  async function runAction(action) {
    if (state.busy || !state.repository) return;
    state.busy = true;
    updateStatus();
    try { await action(); }
    catch (error) { if (error.name !== 'AbortError') notify(error.message || 'Something went wrong. Your current vault is still open.'); }
    finally { state.busy = false; updateStatus(); }
  }

  function markChanged(message) {
    state.dirty = true;
    render();
    if (message) notify(message);
  }

  function confirmReplace() {
    return !state.dirty || window.confirm('This vault has unsaved changes. Replace it and discard those changes? Save first if you want to keep them.');
  }

  function replaceRepository(repository, name, handle = null) {
    const oldUrls = Array.from(state.thumbnailUrls.values());
    state.thumbnailUrls.clear();
    state.repository?.close();
    state.repository = repository;
    state.name = name;
    state.handle = handle;
    state.dirty = false;
    resetFilters();
    // Allow pending image loads to finish before releasing the old vault's URLs.
    window.setTimeout(() => oldUrls.forEach(url => URL.revokeObjectURL(url)), 1000);
  }

  function resetFilters() {
    state.filter = 'all'; state.type = 'all';
    $('#search').value = '';
    $('#sort').value = 'newest';
    if (state.repository) render();
  }

  function createCard(document) {
    const categoryClass = document.category.toLowerCase();
    const label = document.mime === 'application/pdf' ? 'PDF' : document.mime.split('/')[1].replace('jpeg', 'jpg').toUpperCase();
    let preview;
    if (document.mime.startsWith('image/')) {
      let url = state.thumbnailUrls.get(document.id);
      if (!url) {
        const fullDocument = state.repository.get(document.id);
        url = URL.createObjectURL(new Blob([fullDocument.data], { type: document.mime }));
        state.thumbnailUrls.set(document.id, url);
      }
      preview = `<img src="${url}" alt="" loading="lazy">`;
    } else {
      preview = `<div class="pdf-sheet" aria-hidden="true"><span>DOCUMENT</span><strong>${escapeHtml(document.description)}</strong><i></i><i></i><i></i><small>PDF</small></div>`;
    }
    const date = new Date(document.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `
      <article class="document-card">
        <button class="card-open" data-open="${document.id}" aria-label="Open ${escapeHtml(document.description)}">
          <div class="card-preview ${categoryClass}">${preview}</div>
          <div class="card-content">
            <h3>${escapeHtml(document.description)}</h3>
            <div class="filename">${escapeHtml(document.filename)} · ${files.formatSize(document.size)}</div>
            <div class="card-bottom">
              <span class="category-tag ${categoryClass}">${escapeHtml(document.category)}</span>
              <span class="card-date">Added ${escapeHtml(date)}</span>
            </div>
          </div>
        </button>
        <span class="file-badge">${escapeHtml(label)}</span>
        <button class="icon-button favorite-button" data-favorite="${document.id}"
          aria-pressed="${Boolean(document.favorite)}"
          aria-label="${document.favorite ? 'Unfavorite' : 'Favorite'} ${escapeHtml(document.description)}">${icon('star')}</button>
      </article>`;
  }

  function render() {
    const statistics = state.repository.stats();
    const total = statistics.reduce((sum, row) => sum + row.count, 0);
    $('#all-count').textContent = total;
    $('#favorite-count').textContent = statistics.reduce((sum, row) => sum + row.favorites, 0);
    CATEGORIES.forEach(category => { $(`#${category.toLowerCase()}-count`).textContent = statistics.find(row => row.category === category)?.count || 0; });
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.getAttribute('data-filter') === state.filter;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-type]').forEach(button => {
      const active = button.getAttribute('data-type') === state.type;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
    const query = $('#search').value;
    const documents = state.repository.list({ query, category: state.filter, type: state.type, sort: $('#sort').value });
    $('#collection-title').textContent = query.trim() ? 'Search results' : state.filter === 'all' ? 'All documents' : state.filter === 'favorites' ? 'Favorites' : state.filter;
    $('#result-count').textContent = documents.length;
    $('#document-grid').innerHTML = documents.map(createCard).join('');
    $('#document-grid').setAttribute('aria-busy', 'false');
    const hasFilter = query.trim() || state.filter !== 'all' || state.type !== 'all';
    $('#empty-state').hidden = total !== 0 || Boolean(hasFilter);
    $('#no-results').hidden = documents.length !== 0 || (total === 0 && !hasFilter);
    $('#dropzone').hidden = total === 0;
    $('#demo-banner').hidden = !state.repository.isSample();
    updateStatus();
  }

  function createUploadEntry(file, index) {
    const description = file.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 240);
    const defaultCategory = file.mime === 'application/pdf' ? 'Travel' : 'Identity';
    const categoryOptions = CATEGORIES.map(category => `<option${category === defaultCategory ? ' selected' : ''}>${category}</option>`).join('');
    return `
      <section class="upload-entry">
        <div class="upload-file-name">
          ${icon(file.mime === 'application/pdf' ? 'file' : 'image')}
          <span>${escapeHtml(file.filename)} · ${files.formatSize(file.data.length)}</span>
        </div>
        <label class="field-label" for="description-${index}">Short description</label>
        <input id="description-${index}" class="text-input" data-description="${index}"
          maxlength="240" required value="${escapeHtml(description)}" placeholder="e.g. My ID">
        <label class="field-label" for="category-${index}">Collection</label>
        <select id="category-${index}" class="text-input" data-category="${index}">${categoryOptions}</select>
      </section>`;
  }

  async function prepareUploads(fileList) {
    const selectedFiles = Array.from(fileList);
    if (!selectedFiles.length) return;
    if (selectedFiles.length > 20) throw new Error('Add up to 20 files at a time.');
    if (selectedFiles.reduce((size, file) => size + file.size, 0) > MAX_DATABASE_SIZE) throw new Error('This batch exceeds the 100 MB vault limit.');
    state.uploads = await Promise.all(selectedFiles.map(files.readUpload));
    $('#upload-error').textContent = '';
    $('#upload-list').innerHTML = state.uploads.map(createUploadEntry).join('');
    $('#upload-summary').textContent = `${state.uploads.length} ${state.uploads.length === 1 ? 'document' : 'documents'} · ${files.formatSize(state.uploads.reduce((sum, file) => sum + file.data.length, 0))}`;
    $('#upload-dialog').showModal();
  }

  function openDetails(id) {
    if (state.busy) return;
    const document = state.repository.get(id);
    if (!document) return;
    state.activeId = id;
    state.detailUrl = URL.createObjectURL(new Blob([document.data], { type: document.mime }));
    // Native PDF viewers are disabled inside sandboxed frames. Only file types
    // validated as PDF reach this viewer; the page never embeds HTML uploads.
    $('#detail-preview').innerHTML = document.mime === 'application/pdf'
      ? `<iframe src="${state.detailUrl}" title="PDF preview"></iframe>`
      : `<img src="${state.detailUrl}" alt="${escapeHtml(document.description)}">`;
    let fallback = $('#pdf-fallback');
    if (!fallback) { fallback = window.document.createElement('p'); fallback.id = 'pdf-fallback'; fallback.className = 'pdf-fallback'; $('#detail-preview').after(fallback); }
    fallback.hidden = document.mime !== 'application/pdf';
    fallback.textContent = 'If your browser cannot preview this PDF, use Download below to open it.';
    $('#detail-description').value = document.description;
    $('#detail-category').value = document.category;
    $('#detail-meta').textContent = `${document.filename} · ${files.formatSize(document.size)} · Added ${new Date(document.created_at).toLocaleString()}`;
    $('#detail-error').textContent = '';
    $('#detail-dialog').showModal();
  }

  async function openDatabase(file, handle = null) {
    const bytes = await files.readDatabase(file);
    const candidate = new VaultRepository(state.SQL, bytes);
    if (!confirmReplace()) { candidate.close(); return; }
    state.status = 'Opened from disk · no unsaved changes';
    replaceRepository(candidate, file.name, handle);
    notify('Vault opened. Your documents are ready.');
  }

  // Explicit wiring keeps every visible control functional without a framework.
  hydrate();
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { $(`#${button.getAttribute('data-close')}`).close(); }));
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  ['#add-button', '#empty-add', '#dropzone'].forEach(selector => $(selector).addEventListener('click', () => { if (!state.busy && state.repository) $('#file-picker').click(); }));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { if (!state.repository) return; state.filter = button.getAttribute('data-filter'); render(); }));
  document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => { if (!state.repository) return; state.type = button.getAttribute('data-type'); render(); }));
  $('#search').addEventListener('input', () => { if (state.repository) render(); });
  $('#sort').addEventListener('change', () => { if (state.repository) render(); });
  $('#reset-filters').addEventListener('click', resetFilters);
  document.addEventListener('keydown', event => {
    const editing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if (event.key === '/' && !editing && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#search').focus(); }
  });
  $('#document-grid').addEventListener('click', event => {
    if (state.busy) return;
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      const id = Number(favorite.dataset.favorite);
      state.repository.toggleFavorite(id); markChanged();
      $(`[data-favorite="${id}"]`)?.focus();
      return;
    }
    const open = event.target.closest('[data-open]');
    if (open) openDetails(Number(open.dataset.open));
  });
  $('#file-picker').addEventListener('change', event => {
    const selected = Array.from(event.target.files); event.target.value = '';
    runAction(() => prepareUploads(selected));
  });
  $('#upload-dialog').addEventListener('close', () => { state.uploads = []; $('#upload-list').innerHTML = ''; });
  $('#upload-form').addEventListener('submit', event => {
    event.preventDefault();
    if (state.busy) return;
    try {
      const documents = state.uploads.map((file, index) => ({ ...file, description: $(`#description-${index}`).value, category: $(`#category-${index}`).value }));
      state.repository.addMany(documents);
      const count = documents.length;
      $('#upload-dialog').close();
      resetFilters();
      markChanged(`${count} ${count === 1 ? 'document added' : 'documents added'}. Save your database to keep them.`);
    } catch (error) { $('#upload-error').textContent = error.message; }
  });
  $('#detail-dialog').addEventListener('close', () => {
    $('#detail-preview').innerHTML = '';
    if (state.detailUrl) URL.revokeObjectURL(state.detailUrl);
    state.detailUrl = null; state.activeId = null;
  });
  $('#detail-form').addEventListener('submit', event => {
    event.preventDefault();
    if (state.busy) return;
    try {
      state.repository.update(state.activeId, $('#detail-description').value, $('#detail-category').value);
      $('#detail-dialog').close(); markChanged('Document details updated.');
    } catch (error) { $('#detail-error').textContent = error.message; }
  });
  $('#download-document').addEventListener('click', () => {
    const document = state.repository.get(state.activeId);
    files.download(document.data, document.mime, document.filename);
  });
  $('#delete-document').addEventListener('click', () => {
    if (state.busy || !window.confirm('Delete this document from the vault? This cannot be undone. Previously saved database copies will still contain it.')) return;
    const thumbnail = state.thumbnailUrls.get(state.activeId);
    state.thumbnailUrls.delete(state.activeId);
    state.repository.remove(state.activeId); $('#detail-dialog').close(); markChanged('Document deleted. Save to update your database file.');
    if (thumbnail) window.setTimeout(() => URL.revokeObjectURL(thumbnail), 1000);
  });
  $('#open-button').addEventListener('click', () => {
    if (!('showOpenFilePicker' in window)) { $('#database-picker').click(); return; }
    runAction(async () => {
      const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'paperVault database', accept: { 'application/x-sqlite3': ['.sqlite', '.db', '.sqlite3'] } }] });
      await openDatabase(await handle.getFile(), handle);
    });
  });
  $('#database-picker').addEventListener('change', event => {
    const [file] = event.target.files; event.target.value = '';
    if (file) runAction(() => openDatabase(file));
  });
  $('#save-button').addEventListener('click', () => runAction(async () => {
    const name = state.name === 'Untitled vault' ? 'paperVault.sqlite' : state.name === 'Sample vault' ? 'paperVault-sample.sqlite' : state.name;
    const saved = await files.saveDatabase(state.repository.export(), state.handle, name);
    state.name = saved.name; state.handle = saved.handle; state.dirty = false;
    state.status = saved.downloaded ? 'Download requested · check your browser’s downloads' : `Saved to disk at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    notify(saved.downloaded ? 'Database download requested. Keep the latest copy beside index.html.' : 'Database saved. Everything is together.');
  }));
  function createNewVault() {
    if (!state.repository || state.busy || !confirmReplace()) return;
    state.status = 'Empty vault · save to create your database';
    replaceRepository(new VaultRepository(state.SQL), 'Untitled vault');
    notify('A fresh vault, ready for your documents.');
  }
  $('#new-button').addEventListener('click', createNewVault);
  $('#clear-demo').addEventListener('click', createNewVault);
  $('#sample-button').addEventListener('click', () => runAction(async () => {
    const documents = await window.PaperVaultSamples.create();
    const repository = new VaultRepository(state.SQL);
    try { repository.addMany(documents); repository.markSample(); }
    catch (error) { repository.close(); throw error; }
    if (!confirmReplace()) { repository.close(); return; }
    replaceRepository(repository, 'Sample vault');
    markChanged('Sample documents loaded. Try searching “id”.');
  }));
  // Accept drops throughout the page, while leaving native file pickers available.
  let dragDepth = 0;
  document.addEventListener('dragenter', event => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault(); dragDepth += 1; document.body.classList.add('dragging');
  });
  document.addEventListener('dragover', event => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault(); });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    if (document.querySelector('dialog[open]')) { notify('Close the current dialog before adding more files.'); return; }
    runAction(() => prepareUploads(event.dataTransfer.files));
  });
  window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  try {
    state.SQL = await window.initSqlJs();
    state.repository = new VaultRepository(state.SQL);
    render();
  } catch (error) {
    $('#fatal-error').hidden = false;
    $('#fatal-error').textContent = `SQLite could not start: ${error.message}. Keep the vendor folder beside index.html and reopen the page in a current browser.`;
    $('#save-status').textContent = 'SQLite unavailable';
    $('#document-grid').setAttribute('aria-busy', 'false');
  }
})();
