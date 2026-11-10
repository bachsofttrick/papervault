/* The repository owns SQLite queries, schema, and validation. UI code never
   executes SQL. This classic script also exports to Node for integration tests.
   Files are BLOBs, not paths, so the exported database is self-contained. */
(function exposeRepository(root) {
  'use strict';
  const APPLICATION_ID = 1347831636;
  const SCHEMA_VERSION = 1;
  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_DATABASE_SIZE = 100 * 1024 * 1024;
  const CATEGORIES = ['Identity', 'Travel', 'Photos', 'Other'];
  const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

  function getRows(database, sql, parameters = []) {
    const statement = database.prepare(sql);
    try {
      statement.bind(parameters);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  // Tokenize user text before constructing MATCH syntax. Punctuation and SQL
  // never become executable operators. All words must match; prefixes are allowed.
  function getSearchExpression(query) {
    const words = String(query).normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
    return words.slice(0, 24).map(word => `"${word}*"`).join(' AND ');
  }

  function validateDocument(document) {
    if (!String(document.description || '').trim()) throw new Error('Add a short description for every file.');
    if (document.description.trim().length > 240) throw new Error('Keep descriptions to 240 characters.');
    if (!CATEGORIES.includes(document.category)) throw new Error('Choose a valid collection.');
    if (!MIME_TYPES.includes(document.mime)) throw new Error('Choose a JPEG, PNG, WebP, GIF, or PDF file.');
    if (!(document.data instanceof Uint8Array) || !document.data.length) throw new Error('This file is empty.');
    if (document.data.length > MAX_FILE_SIZE) throw new Error('Each file must be 15 MB or smaller.');
  }

  class VaultRepository {
    constructor(SQL, bytes) {
      this.database = new SQL.Database(bytes);
      try {
        if (bytes) this.validate();
        else this.initialize();
      } catch (error) {
        this.database.close();
        throw error;
      }
    }

    initialize() {
      this.database.run(`
        PRAGMA application_id = ${APPLICATION_ID};
        PRAGMA user_version = ${SCHEMA_VERSION};
        CREATE TABLE vault_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO vault_meta VALUES ('sample', 'false');
        CREATE TABLE documents (
          id INTEGER PRIMARY KEY,
          description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 240),
          filename TEXT NOT NULL,
          mime TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN ('Identity', 'Travel', 'Photos', 'Other')),
          data BLOB NOT NULL,
          size INTEGER NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
          created_at TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE document_search USING fts4(description, tokenize=unicode61);
        CREATE TRIGGER document_insert AFTER INSERT ON documents BEGIN
          INSERT INTO document_search(docid, description) VALUES (new.id, new.description);
        END;
        CREATE TRIGGER document_update AFTER UPDATE OF description ON documents BEGIN
          UPDATE document_search SET description = new.description WHERE docid = old.id;
        END;
        CREATE TRIGGER document_delete AFTER DELETE ON documents BEGIN
          DELETE FROM document_search WHERE docid = old.id;
        END;
      `);
    }

    validate() {
      const appId = getRows(this.database, 'PRAGMA application_id')[0].application_id;
      const version = getRows(this.database, 'PRAGMA user_version')[0].user_version;
      if (appId !== APPLICATION_ID || version !== SCHEMA_VERSION) throw new Error('Choose a paperVault database made by this version of the app.');
      const integrity = getRows(this.database, 'PRAGMA integrity_check')[0].integrity_check;
      if (integrity !== 'ok') throw new Error('This database is damaged. Try a backup copy.');
      // Check columns and search availability before replacing the active vault.
      getRows(this.database, 'SELECT id, description, filename, mime, category, size, favorite, created_at, length(data) FROM documents LIMIT 1');
      getRows(this.database, 'SELECT docid FROM document_search LIMIT 1');
      getRows(this.database, 'SELECT key, value FROM vault_meta LIMIT 1');
      const invalid = getRows(this.database, `SELECT id FROM documents WHERE
        typeof(id) != 'integer' OR id < 1 OR typeof(description) != 'text'
        OR length(trim(description)) NOT BETWEEN 1 AND 240
        OR typeof(filename) != 'text' OR typeof(created_at) != 'text'
        OR julianday(created_at) IS NULL OR typeof(data) != 'blob'
        OR category NOT IN ('Identity', 'Travel', 'Photos', 'Other')
        OR mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')
        OR favorite NOT IN (0, 1) OR size != length(data)
        OR size NOT BETWEEN 1 AND ${MAX_FILE_SIZE} LIMIT 1`);
      if (invalid.length) throw new Error('This database contains invalid document metadata. Open a trusted backup copy.');
    }

    list({ query = '', category = 'all', type = 'all', sort = 'newest' } = {}) {
      const conditions = [];
      const parameters = [];
      if (query.trim()) {
        const expression = getSearchExpression(query);
        if (!expression) return [];
        conditions.push('id IN (SELECT docid FROM document_search WHERE document_search MATCH ?)');
        parameters.push(expression);
      }
      if (category === 'favorites') conditions.push('favorite = 1');
      else if (CATEGORIES.includes(category)) { conditions.push('category = ?'); parameters.push(category); }
      if (type === 'image') conditions.push("mime LIKE 'image/%'");
      if (type === 'pdf') conditions.push("mime = 'application/pdf'");
      const order = { newest: 'created_at DESC, id DESC', oldest: 'created_at ASC, id ASC', name: 'description COLLATE NOCASE ASC, id ASC' }[sort] || 'created_at DESC, id DESC';
      return getRows(this.database, `SELECT id, description, filename, mime, category, size, favorite, created_at FROM documents ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${order}`, parameters);
    }

    get(id) {
      return getRows(this.database, 'SELECT * FROM documents WHERE id = ?', [id])[0];
    }

    stats() {
      return getRows(this.database, 'SELECT category, COUNT(*) AS count, SUM(favorite) AS favorites, SUM(size) AS bytes FROM documents GROUP BY category');
    }

    addMany(documents) {
      documents.forEach(validateDocument);
      const incomingSize = documents.reduce((total, document) => total + document.data.length, 0);
      if (this.export().length + incomingSize * 1.1 > MAX_DATABASE_SIZE) throw new Error('This vault is near its 100 MB limit. Create another vault for these files.');
      this.database.run('BEGIN TRANSACTION');
      try {
        for (const document of documents) {
          this.database.run('INSERT INTO documents(description, filename, mime, category, data, size, favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [document.description.trim(), document.filename, document.mime, document.category, document.data, document.data.length, document.favorite ? 1 : 0, document.created_at || new Date().toISOString()]);
        }
        const pageCount = getRows(this.database, 'PRAGMA page_count')[0].page_count;
        const pageSize = getRows(this.database, 'PRAGMA page_size')[0].page_size;
        if (pageCount * pageSize > MAX_DATABASE_SIZE) throw new Error('This batch would exceed the 100 MB database limit. Create a new vault.');
        this.database.run('COMMIT');
      } catch (error) {
        this.database.run('ROLLBACK');
        throw error;
      }
    }

    update(id, description, category) {
      if (!description.trim() || description.trim().length > 240) throw new Error('Enter a description between 1 and 240 characters.');
      if (!CATEGORIES.includes(category)) throw new Error('Choose a valid collection.');
      this.database.run('UPDATE documents SET description = ?, category = ? WHERE id = ?', [description.trim(), category, id]);
    }

    toggleFavorite(id) {
      this.database.run('UPDATE documents SET favorite = 1 - favorite WHERE id = ?', [id]);
    }

    remove(id) {
      this.database.run('DELETE FROM documents WHERE id = ?', [id]);
      // Reclaim deleted BLOB pages so exported copies do not retain those bytes.
      this.database.run('VACUUM');
    }

    isSample() { return getRows(this.database, "SELECT value FROM vault_meta WHERE key = 'sample'")[0]?.value === 'true'; }
    markSample() { this.database.run("UPDATE vault_meta SET value = 'true' WHERE key = 'sample'"); }
    export() { return this.database.export(); }
    close() { this.database.close(); }
  }

  const api = { VaultRepository, getSearchExpression, MAX_FILE_SIZE, MAX_DATABASE_SIZE, MIME_TYPES, CATEGORIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaperVaultDatabase = api;
})(typeof window !== 'undefined' ? window : globalThis);
