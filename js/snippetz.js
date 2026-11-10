let snippets = [];
let globalVars = {
  Name: 'Sascha Arend',
  Abteilung: 'IT / Infor LN'
};
let discoveredFolders = new Map();
let directoryHandle = null;
let activeFilter = 'all';
let activeFolder = null;
let editingId = null;
let activeDrawerId = null;
let itemsToShow = 30;
const PAGE_SIZE = 30;
let paletteIndex = 0;

const INFOR_TABLES = {
  tccom100: {
    name: 'Geschäftspartner (Business Partners)',
    fields: [
      { name: 'tccom100.bpid', label: 'Geschäftspartner-ID' },
      { name: 'tccom100.nama', label: 'Name' },
      { name: 'tccom100.cadr', label: 'Adresscode' },
      { name: 'tccom100.prst', label: 'Status' }
    ]
  },
  tcibd001: {
    name: 'Allgemeine Artikeldaten (Items)',
    fields: [
      { name: 'tcibd001.item', label: 'Artikelnummer' },
      { name: 'tcibd001.dsca', label: 'Bezeichnung' },
      { name: 'tcibd001.citg', label: 'Artikelgruppe' },
      { name: 'tcibd001.cuni', label: 'Basiseinheit' },
      { name: 'tcibd001.kitm', label: 'Artikelart' }
    ]
  },
  tdsls400: {
    name: 'VK-Auftragsköpfe (Sales Orders)',
    fields: [
      { name: 'tdsls400.orno', label: 'VK-Auftragsnummer' },
      { name: 'tdsls400.ofbp', label: 'Kunde (Auftraggeber)' },
      { name: 'tdsls400.odat', label: 'Auftragsdatum' },
      { name: 'tdsls400.hdst', label: 'Kopfstatus' }
    ]
  },
  tdsls401: {
    name: 'VK-Auftragspositionen (Sales Order Lines)',
    fields: [
      { name: 'tdsls401.orno', label: 'VK-Auftragsnummer' },
      { name: 'tdsls401.pono', label: 'Positionsnummer' },
      { name: 'tdsls401.item', label: 'Artikel' },
      { name: 'tdsls401.qoor', label: 'Bestellmenge' },
      { name: 'tdsls401.pric', label: 'Preis' }
    ]
  },
  tdpur400: {
    name: 'EK-Bestellköpfe (Purchase Orders)',
    fields: [
      { name: 'tdpur400.orno', label: 'Bestellnummer' },
      { name: 'tdpur400.otbp', label: 'Lieferant' },
      { name: 'tdpur400.odat', label: 'Bestelldatum' }
    ]
  },
  whinh200: {
    name: 'Lageraufträge (Warehousing Orders)',
    fields: [
      { name: 'whinh200.oorg', label: 'Auftragsherkunft' },
      { name: 'whinh200.orno', label: 'Auftragsnummer' },
      { name: 'whinh200.oset', label: 'Satznummer' }
    ]
  }
};

const DEFAULT_SNIPPETS = [
  {
    id: 1710000001,
    title: 'Select Record mit Retry (Infor LN)',
    description: 'Standard-Abfrage mit db.retry.point() und dynamischem Tabellen-Platzhalter.',
    tags: ['Infor LN', 'SQL', '4GL'],
    favorite: true,
    copyCount: 5,
    createdAt: new Date().toISOString(),
    _path: 'Infor LN/Database',
    blocks: [
      {
        name: 'Select Loop',
        language: 'baanc',
        content: `| Select \${TABLE:tcibd001} record\ndb.retry.point()\nselect\t\${TABLE:tcibd001}.*\nfrom\t\${TABLE:tcibd001}\nwhere\t\${TABLE:tcibd001}._index1 = {:\${KEY_VAR:i.item}}\nselectdo\n\t| Logik hier\nselectempty\n\t| Nicht gefunden\nendselect`
      }
    ]
  },
  {
    id: 1710000002,
    title: 'DAL Update mit Fehlerprüfung',
    description: 'Aktualisiert einen Datensatz sauber über das Data Access Layer (DAL) inkl. dal.get.error.message().',
    tags: ['Infor LN', 'DAL', 'Extension'],
    favorite: true,
    copyCount: 3,
    createdAt: new Date().toISOString(),
    _path: 'Infor LN/DAL',
    blocks: [
      {
        name: 'DAL Update',
        language: 'baanc',
        content: `long\tret\nstring\terr.msg(256)\n\ndb.retry.point()\nselect\t\${TABLE:tdsls400}.*\nfrom\t\${TABLE:tdsls400} for update\nwhere\t\${TABLE:tdsls400}._index1 = {:\${ORNO:i.orno}}\nselectdo\n\tdal.change.object("\${TABLE:tdsls400}")\n\tdal.set.field("\${FIELD:tdsls400.refa}", \${VAL:"Referenz"})\n\tret = dal.save.object("\${TABLE:tdsls400}")\n\tif ret = 0 then\n\t\tcommit.transaction()\n\telse\n\t\tabort.transaction()\n\t\tdal.get.error.message(err.msg)\n\tendif\nendselect`
      }
    ]
  },
  {
    id: 1710000003,
    title: 'Extension before.save.object Hook',
    description: 'Grundgerüst für eine Infor LN Tabellen-Erweiterung im Extension Modeler.',
    tags: ['Infor LN', 'Extension', 'Hook'],
    favorite: false,
    copyCount: 1,
    createdAt: new Date().toISOString(),
    _path: 'Infor LN/Extensions',
    blocks: [
      {
        name: 'Hook Code',
        language: 'baanc',
        content: `function extern long before.save.object(long i.mode)\n{\n\tif i.mode = DAL_NEW or i.mode = DAL_UPDATE then\n\t\t| Prüfung vor dem Speichern\n\t\tif isspace(\${FIELD:tcibd001.dsca}) then\n\t\t\tdal.set.error.message("@Bezeichnung darf nicht leer sein!")\n\t\t\treturn(DALHOOKERROR)\n\t\tendif\n\tendif\n\treturn(0)\n}`
      }
    ]
  }
];

function formatBaanC(code) {
  const lines = code.split('\n');
  let indentLevel = 0;
  const indentChar = '\t';

  const keywords = [
    'select', 'from', 'where', 'selectdo', 'selectempty', 'endselect',
    'if', 'else', 'endif', 'while', 'endwhile', 'for', 'endfor',
    'function', 'return', 'extern', 'switch', 'case', 'endswitch'
  ];

  const result = lines.map(line => {
    let trimmed = line.trim();
    if (!trimmed) return '';

    keywords.forEach(kw => {
      const regex = new RegExp(`^${kw}\\b`, 'i');
      trimmed = trimmed.replace(regex, kw.toLowerCase());
    });

    if (
      trimmed.startsWith('endselect') ||
      trimmed.startsWith('else') ||
      trimmed.startsWith('endif') ||
      trimmed.startsWith('endwhile') ||
      trimmed.startsWith('endfor') ||
      trimmed.startsWith('endswitch') ||
      trimmed.startsWith('}')
    ) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const formattedLine = indentChar.repeat(indentLevel) + trimmed;

    if (
      trimmed.endsWith('{') ||
      trimmed.startsWith('selectdo') ||
      trimmed.startsWith('selectempty') ||
      trimmed.startsWith('if ') ||
      trimmed.startsWith('else') ||
      trimmed.startsWith('while ') ||
      trimmed.startsWith('for ')
    ) {
      if (!(trimmed.startsWith('if') && trimmed.includes('then') && !trimmed.endsWith('then'))) {
        indentLevel++;
      }
    }

    return formattedLine;
  });

  return result.join('\n');
}

function lintCodeBlock(code, lang) {
  if (lang === 'baanc') {
    const lines = code.split('\n');
    let hasRetry = false;
    const warnings = [];

    lines.forEach((line, idx) => {
      const t = line.trim().toLowerCase();
      if (t.includes('db.retry.point()')) hasRetry = true;
      if (t.includes('for update') && !hasRetry) {
        warnings.push(`Zeile ${idx + 1}: 'for update' ohne vorheriges 'db.retry.point()'`);
      }
      const dalOps = ['dal.save.object', 'dal.update', 'dal.new', 'dal.destroy'];
      dalOps.forEach(op => {
        if (t.includes(op)) {
          const hasAssign = line.includes('=') && line.indexOf('=') < line.indexOf(op);
          if (!hasAssign && !t.startsWith('if')) {
            warnings.push(`Zeile ${idx + 1}: Rückgabewert von '${op}' wird nicht geprüft`);
          }
        }
      });
      if (t.includes('commit.transaction()') || t.includes('abort.transaction()')) {
        hasRetry = false;
      }
    });

    if (warnings.length > 0) {
      return { type: 'warning', message: '⚠️ ' + warnings.join(' | ') };
    }
  } else if (lang === 'xml') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, 'text/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err) {
      return { type: 'error', message: '❌ XML Fehler: ' + err.textContent.split('\n')[0] };
    }
  }
  return null;
}

const DB_NAME = 'eZSnippetZVaultDB';
const STORE_NAME = 'Handles';
const KEY_NAME = 'snippetDir';

function getDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(handle) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, KEY_NAME);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSavedDirHandle() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('appContainer');
  const snippetsGrid = document.getElementById('snippetsGrid');
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const categoryNav = document.getElementById('categoryNav');
  const folderNav = document.getElementById('folderNav');
  const tagNav = document.getElementById('tagNav');
  const btnConnectFolder = document.getElementById('btnConnectFolder');
  const connectionBadge = document.getElementById('connectionBadge');
  const btnAddFolder = document.getElementById('btnAddFolder');
  const btnToggleCompact = document.getElementById('btnToggleCompact');
  const btnToggleFocus = document.getElementById('btnToggleFocus');
  const btnGlobalVars = document.getElementById('btnGlobalVars');
  const btnSyntaxHelp = document.getElementById('btnSyntaxHelp');
  const btnImportJson = document.getElementById('btnImportJson');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnNewSnippet = document.getElementById('btnNewSnippet');

  const editModalOverlay = document.getElementById('editModalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const btnCloseEditModal = document.getElementById('btnCloseEditModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const snippetForm = document.getElementById('snippetForm');
  const inpTitle = document.getElementById('inpTitle');
  const inpFolder = document.getElementById('inpFolder');
  const inpDesc = document.getElementById('inpDesc');
  const inpTags = document.getElementById('inpTags');
  const blocksContainer = document.getElementById('blocksContainer');
  const btnAddBlock = document.getElementById('btnAddBlock');
  const patternSelector = document.getElementById('patternSelector');
  const dictSearch = document.getElementById('dictSearch');
  const dictResults = document.getElementById('dictResults');

  const varModalOverlay = document.getElementById('varModalOverlay');
  const btnCloseVarModal = document.getElementById('btnCloseVarModal');
  const varForm = document.getElementById('varForm');
  const varInputsContainer = document.getElementById('varInputsContainer');
  const varLivePreview = document.getElementById('varLivePreview');

  const globalVarsModalOverlay = document.getElementById('globalVarsModalOverlay');
  const btnCloseGlobalVarsModal = document.getElementById('btnCloseGlobalVarsModal');
  const btnCancelGlobalVars = document.getElementById('btnCancelGlobalVars');
  const btnSaveGlobalVars = document.getElementById('btnSaveGlobalVars');
  const btnAddGlobalVar = document.getElementById('btnAddGlobalVar');
  const globalVarsList = document.getElementById('globalVarsList');

  const helpModalOverlay = document.getElementById('helpModalOverlay');
  const btnCloseHelpModal = document.getElementById('btnCloseHelpModal');

  const viewDrawerOverlay = document.getElementById('viewDrawerOverlay');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerPath = document.getElementById('drawerPath');
  const drawerDesc = document.getElementById('drawerDesc');
  const drawerTags = document.getElementById('drawerTags');
  const drawerBlocks = document.getElementById('drawerBlocks');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const btnDrawerEdit = document.getElementById('btnDrawerEdit');

  const paletteOverlay = document.getElementById('paletteOverlay');
  const paletteInput = document.getElementById('paletteInput');
  const paletteList = document.getElementById('paletteList');

  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  function highlightPlaceholders(escapedText) {
    return escapedText.replace(/\$\{[^}]+\}|\{[^{}]+\}|\[\[[^\]]+\]\]/g, match => `<span class="placeholder-hl">${match}</span>`);
  }

  function slugify(text) {
    if (!text) return 'snippet';
    return text.toString().toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || 'snippet';
  }

  async function syncToChromeStorage() {

    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    snippets = snippets.filter(s => !(s.isDeleted && s.deletedAt && (now - s.deletedAt > THIRTY_DAYS)));

    const lightweight = snippets.slice(0, 300).map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      tags: s.tags,
      favorite: s.favorite,
      copyCount: s.copyCount || 0,
      createdAt: s.createdAt,
      _path: s._path || 'Root',
      isDeleted: s.isDeleted || false,
      deletedAt: s.deletedAt || null,
      blocks: s.blocks
    }));
    await chrome.storage.local.set({
      ezSnippetzData: lightweight,
      ezSnippetzGlobalVars: globalVars
    });
  }

  async function loadInitialData() {

    const gvData = await chrome.storage.local.get('ezSnippetzGlobalVars');
    if (gvData.ezSnippetzGlobalVars) {
      globalVars = gvData.ezSnippetzGlobalVars;
    }

    try {
      const savedHandle = await loadSavedDirHandle();
      if (savedHandle) {
        const perm = await savedHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          directoryHandle = savedHandle;
          await loadSnippetsFromDirectory();
          return;
        } else {
          connectionBadge.innerHTML = '<span>🔓 Klick zum Reaktivieren des Ordners</span>';
          connectionBadge.style.cursor = 'pointer';
          connectionBadge.onclick = async () => {
            if ((await savedHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
              directoryHandle = savedHandle;
              await loadSnippetsFromDirectory();
            }
          };
        }
      }
    } catch (e) {
      console.warn('Folder handle restore info:', e);
    }

    const data = await chrome.storage.local.get('ezSnippetzData');
    if (data.ezSnippetzData && data.ezSnippetzData.length > 0) {
      snippets = data.ezSnippetzData;
    } else {
      snippets = [...DEFAULT_SNIPPETS];
      await syncToChromeStorage();
    }
    rebuildFolderMapFromSnippets();
    renderAll();
  }

  function rebuildFolderMapFromSnippets() {
    discoveredFolders.clear();
    discoveredFolders.set('Root', null);
    snippets.forEach(s => {
      const p = s._path || 'Root';
      if (p !== 'Root') {
        const parts = p.split('/');
        let curr = '';
        parts.forEach(part => {
          curr = curr ? `${curr}/${part}` : part;
          if (!discoveredFolders.has(curr)) discoveredFolders.set(curr, null);
        });
      }
    });
  }

  async function loadSnippetsFromDirectory() {
    if (!directoryHandle) return;
    snippets = [];
    discoveredFolders.clear();
    discoveredFolders.set('Root', directoryHandle);

    connectionBadge.innerHTML = `<span>✅ Verbunden: <b>${directoryHandle.name}</b></span>`;
    connectionBadge.classList.add('connected');
    btnConnectFolder.textContent = '🔄 Ordner synchronisieren';

    await walkDir(directoryHandle, '');
    await syncToChromeStorage();
    renderAll();
    showToast(`📁 ${snippets.length} Snippets geladen!`);
  }

  async function walkDir(handle, relPath) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json') && entry.name !== 'tables.json') {
        try {
          const file = await entry.getFile();
          const txt = await file.text();
          const parsed = JSON.parse(txt);
          if (parsed && parsed.title && Array.isArray(parsed.blocks)) {
            parsed.id = parsed.id || (Date.now() + Math.floor(Math.random() * 100000));
            parsed._filename = entry.name;
            parsed._path = relPath || 'Root';
            parsed._handle = handle;
            snippets.push(parsed);
          }
        } catch (err) {
          console.warn('Skipping non-snippet JSON:', entry.name);
        }
      } else if (entry.kind === 'directory' && entry.name !== 'prgguide' && !entry.name.startsWith('.')) {
        const nextPath = relPath ? `${relPath}/${entry.name}` : entry.name;
        discoveredFolders.set(nextPath, entry);
        await walkDir(entry, nextPath);
      }
    }
  }

  async function saveSnippetToDisk(snippet) {
    if (!directoryHandle) {
      await syncToChromeStorage();
      return;
    }
    try {
      let targetHandle = directoryHandle;
      const folderPath = snippet._path || 'Root';
      if (folderPath !== 'Root') {
        const parts = folderPath.split('/');
        for (const part of parts) {
          targetHandle = await targetHandle.getDirectoryHandle(part, { create: true });
        }
      }

      const fileName = snippet._filename || `${slugify(snippet.title)}.json`;
      const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      const cleanCopy = { ...snippet };
      delete cleanCopy._filename;
      delete cleanCopy._handle;

      await writable.write(JSON.stringify(cleanCopy, null, 2));
      await writable.close();

      snippet._filename = fileName;
      snippet._handle = targetHandle;
      await syncToChromeStorage();
    } catch (e) {
      console.error('Disk write error:', e);
      showToast('❌ Fehler beim Dateispeichern');
    }
  }

  function renderAll() {
    renderFolders();
    renderTags();
    renderSnippets();
    updateFolderSuggestions();
  }

  function renderFolders() {
    const paths = Array.from(discoveredFolders.keys());
    folderNav.innerHTML = '';

    const rootLi = document.createElement('li');
    rootLi.className = `nav-item ${activeFolder === null ? 'active' : ''}`;
    rootLi.innerHTML = `<span>🏠 Alle Ordner</span>`;
    rootLi.onclick = () => {
      activeFolder = null;
      itemsToShow = PAGE_SIZE;
      renderFolders();
      renderSnippets();
    };
    folderNav.appendChild(rootLi);

    paths.filter(p => p !== 'Root').sort().forEach(path => {
      const depth = path.split('/').length - 1;
      const name = path.split('/').pop();
      const li = document.createElement('li');
      li.className = `nav-item ${activeFolder === path ? 'active' : ''}`;
      li.style.paddingLeft = `${10 + depth * 12}px`;
      li.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📁 ${escapeHTML(name)}</span>`;
      li.title = path;
      li.onclick = () => {
        activeFolder = path;
        itemsToShow = PAGE_SIZE;
        renderFolders();
        renderSnippets();
      };
      folderNav.appendChild(li);
    });
  }

  function renderTags() {
    const tagCounts = new Map();
    snippets.filter(s => !s.isDeleted).forEach(s => {
      (s.tags || []).forEach(t => {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      });
    });

    tagNav.innerHTML = '';
    Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .forEach(([tag, count]) => {
        const li = document.createElement('li');
        li.className = `nav-item ${activeFilter === `tag:${tag}` ? 'active' : ''}`;
        li.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;">🏷️ ${escapeHTML(tag)}</span> <small style="opacity:0.7;">${count}</small>`;
        li.onclick = () => {
          document.querySelectorAll('#categoryNav .nav-item').forEach(n => n.classList.remove('active'));
          activeFilter = `tag:${tag}`;
          itemsToShow = PAGE_SIZE;
          renderTags();
          renderSnippets();
        };
        tagNav.appendChild(li);
      });
  }

  function getFilteredSnippets() {
    const q = (searchInput.value || '').toLowerCase().trim();
    const sortBy = sortSelect.value;

    let list = snippets.filter(s => {
      if (activeFilter === 'trash') {
        if (!s.isDeleted) return false;
      } else {
        if (s.isDeleted) return false;
      }

      const matchQuery = !q ||
        (s.title || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (s.blocks || []).some(b => (b.content || '').toLowerCase().includes(q));

      if (!matchQuery) return false;

      if (activeFilter !== 'trash' && activeFolder !== null) {
        const p = s._path || 'Root';
        if (p !== activeFolder && !p.startsWith(activeFolder + '/')) return false;
      }

      if (activeFilter === 'favorites') return s.favorite === true;
      if (activeFilter === 'recent') {
        const d = new Date(s.createdAt || Date.now());
        const diff = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
        return diff <= 14;
      }
      if (activeFilter.startsWith('tag:')) {
        const targetTag = activeFilter.slice(4);
        return (s.tags || []).includes(targetTag);
      }
      return true;
    });

    list.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      if (sortBy === 'alphabetical') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'most-copied') return (b.copyCount || 0) - (a.copyCount || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return list;
  }

  function renderSnippets() {
    const filtered = getFilteredSnippets();
    const displayed = filtered.slice(0, itemsToShow);

    if (displayed.length === 0) {
      snippetsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 10px;">${activeFilter === 'trash' ? '🗑️' : '🔍'}</div>
          <div style="font-size: 14px; font-weight: 600;">${activeFilter === 'trash' ? 'Der Papierkorb ist leer' : 'Keine passenden Snippets gefunden'}</div>
          <div style="font-size: 12px; margin-top: 4px;">${activeFilter === 'trash' ? 'Gelöschte Snippets werden hier 30 Tage lang aufbewahrt.' : 'Erstelle ein neues Snippet oder verbinde deinen lokalen Snippet-Vault Ordner.'}</div>
        </div>
      `;
      return;
    }

    snippetsGrid.innerHTML = '';
    displayed.forEach(s => {
      const card = document.createElement('div');
      card.className = 'snippet-card';

      const firstCodeBlock = (s.blocks || []).find(b => b.language !== 'plaintext' && b.type !== 'text') || (s.blocks || [])[0];
      const previewCode = firstCodeBlock ? firstCodeBlock.content : '';
      const previewLang = firstCodeBlock ? (firstCodeBlock.language || 'code') : '';

      const isTrashItem = Boolean(s.isDeleted);

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-title">${escapeHTML(s.title)}</span>
            ${s._path && s._path !== 'Root' ? `<span class="card-folder-badge">${escapeHTML(s._path)}</span>` : ''}
          </div>
          <div class="card-actions">
            ${isTrashItem ? `
              <button class="icon-action btn-restore" title="Wiederherstellen">♻️</button>
              <button class="icon-action btn-hard-del" title="Endgültig löschen">❌</button>
            ` : `
              <button class="icon-action btn-fav" title="Favorit umschalten">${s.favorite ? '⭐' : '☆'}</button>
              <button class="icon-action btn-copy" title="Snippet kopieren (inkl. Variablen-Check)">📋</button>
              <button class="icon-action btn-edit" title="Bearbeiten">✏️</button>
              <button class="icon-action btn-del" title="In den Papierkorb verschieben">🗑️</button>
            `}
          </div>
        </div>
        ${(s.tags && s.tags.length) ? `
          <div class="card-tags">
            ${s.tags.map(t => `<span class="tag-pill">${escapeHTML(t)}</span>`).join('')}
          </div>
        ` : ''}
        ${s.description ? `<div class="card-desc">${escapeHTML(s.description)}</div>` : ''}
        ${previewCode ? `
          <div class="code-preview-box">
            <div class="code-preview-header">
              <span>${escapeHTML(firstCodeBlock.name || 'Code')}</span>
              <span style="text-transform:uppercase;">${escapeHTML(previewLang)}</span>
            </div>
            <div class="code-preview-content">${highlightPlaceholders(escapeHTML(previewCode))}</div>
          </div>
        ` : ''}
      `;

      if (isTrashItem) {
        card.querySelector('.btn-restore').onclick = async (e) => {
          e.stopPropagation();
          s.isDeleted = false;
          s.deletedAt = null;
          await saveSnippetToDisk(s);
          renderAll();
          showToast('♻️ Snippet wiederhergestellt!');
        };

        card.querySelector('.btn-hard-del').onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Snippet "${s.title}" wirklich endgültig löschen?`)) return;
          if (directoryHandle && s._handle && s._filename) {
            try { await s._handle.removeEntry(s._filename); } catch (err) {}
          }
          snippets = snippets.filter(item => item.id !== s.id);
          await syncToChromeStorage();
          renderAll();
          showToast('❌ Snippet endgültig gelöscht');
        };
      } else {
        card.querySelector('.btn-fav').onclick = async (e) => {
          e.stopPropagation();
          s.favorite = !s.favorite;
          await saveSnippetToDisk(s);
          renderSnippets();
        };

        card.querySelector('.btn-copy').onclick = (e) => {
          e.stopPropagation();
          triggerSmartCopy(s);
        };

        card.querySelector('.btn-edit').onclick = (e) => {
          e.stopPropagation();
          openEditModal(s);
        };

        card.querySelector('.btn-del').onclick = async (e) => {
          e.stopPropagation();
          s.isDeleted = true;
          s.deletedAt = Date.now();
          await saveSnippetToDisk(s);
          renderAll();
          showToast('🗑️ In den Papierkorb verschoben');
        };
      }

      card.onclick = () => openDrawer(s);

      snippetsGrid.appendChild(card);
    });

    if (filtered.length > itemsToShow) {
      const moreWrap = document.createElement('div');
      moreWrap.style.cssText = 'grid-column: 1/-1; display: flex; justify-content: center; padding: 16px;';
      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn';
      moreBtn.textContent = `Mehr anzeigen (${filtered.length - itemsToShow} weitere)`;
      moreBtn.onclick = () => {
        itemsToShow += PAGE_SIZE;
        renderSnippets();
      };
      moreWrap.appendChild(moreBtn);
      snippetsGrid.appendChild(moreWrap);
    }
  }

  function extractVariablesDetailed(text) {
    const vars = [];
    const seen = new Set();

    const vaultRegex = /\$\{([^}]+)\}/g;
    let m;
    while ((m = vaultRegex.exec(text)) !== null) {
      const inner = m[1].trim();
      const parts = inner.split(':');
      const name = parts[0].trim();
      const defVal = parts.slice(1).join(':').trim();
      if (!seen.has(name)) {
        seen.add(name);
        vars.push({ name, type: 'text', defaultValue: defVal, options: [] });
      }
    }

    const ezRegex = /\{([^{}]+)\}/g;
    while ((m = ezRegex.exec(text)) !== null) {
      if (m.index > 0 && text[m.index - 1] === '$') continue;
      let raw = m[1].trim();

      if (/^Datum([+-]\d+)?$/i.test(raw) || /^Uhrzeit$/i.test(raw) || /^Clipboard$/i.test(raw)) continue;
      if (raw.startsWith('#if ') || raw === '#else' || raw === '/if') continue;
      if (/^Snippet:/i.test(raw)) continue;

      let type = 'text';
      let defaultValue = '';
      let options = [];

      if (raw.toLowerCase().endsWith(':multiline')) {
        type = 'multiline';
        raw = raw.slice(0, -10).trim();
      } else if (raw.toLowerCase().endsWith(':uppercase')) {
        type = 'uppercase';
        raw = raw.slice(0, -10).trim();
      } else if (raw.toLowerCase().endsWith(':lowercase')) {
        type = 'lowercase';
        raw = raw.slice(0, -10).trim();
      }

      const eqIdx = raw.indexOf('=');
      let name = raw;
      if (eqIdx !== -1) {
        name = raw.substring(0, eqIdx).trim();
        const valPart = raw.substring(eqIdx + 1).trim();
        if (valPart.startsWith('[') && valPart.endsWith(']')) {
          type = 'select';
          options = valPart.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
          defaultValue = options[0] || '';
        } else {
          defaultValue = valPart;
        }
      }

      if (globalVars[name] !== undefined) continue;

      if (name && !seen.has(name)) {
        seen.add(name);
        vars.push({ name, type, defaultValue, options });
      }
    }

    return vars;
  }

  function applyAutoVariables(text, clipText = '', customValues = null, depth = 0) {
    if (depth > 3) return text;
    const now = new Date();
    const uhrzeit = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    let result = text.replace(/\[\[([^\]]+)\]\]|\{Snippet:([^{}]+)\}/gi, (match, t1, t2) => {
      const refTitle = (t1 || t2 || '').trim().toLowerCase();
      const found = snippets.find(s => !s.isDeleted && (s.title || '').toLowerCase() === refTitle);
      if (found && found.blocks) {
        const combined = found.blocks.map(b => b.content).join('\n\n');
        return applyAutoVariables(combined, clipText, customValues, depth + 1);
      }
      return match;
    });

    result = result.replace(/\{Datum([+-]\d+)?\}/gi, (match, offsetStr) => {
      const targetDate = new Date(now);
      if (offsetStr) targetDate.setDate(targetDate.getDate() + parseInt(offsetStr, 10));
      return targetDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    });
    result = result.replace(/\{Uhrzeit\}/gi, uhrzeit);
    result = result.replace(/\{Clipboard\}/gi, clipText);

    for (const [k, v] of Object.entries(globalVars)) {
      const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{${escapedKey}(?:=[^\\{\\}]*)?(?::(?:multiline|uppercase|lowercase))?\\}`, 'gi');
      result = result.replace(regex, (m) => {
        if (m.toLowerCase().endsWith(':uppercase}')) return String(v).toUpperCase();
        if (m.toLowerCase().endsWith(':lowercase}')) return String(v).toLowerCase();
        return v;
      });
    }

    if (customValues) {

      const ifRegex = /\{#if\s+([a-zA-Z0-9_äöüÄÖÜß-]+)\}([\s\S]*?)(?:\{#else\}([\s\S]*?))?\{\/if\}/g;
      result = result.replace(ifRegex, (match, condVar, trueBlock, falseBlock) => {
        const val = customValues[condVar] !== undefined ? customValues[condVar] : globalVars[condVar];
        const isTrue = val && val.trim() !== '' && val.toLowerCase() !== 'nein' && val.toLowerCase() !== 'false' && val !== '0';
        return isTrue ? trueBlock : (falseBlock || '');
      });

      for (const [varName, val] of Object.entries(customValues)) {
        const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const vaultVarRegex = new RegExp(`\\$\\{${escapedVar}(?::[^}]*)?\\}`, 'g');
        result = result.replace(vaultVarRegex, val);

        const ezVarRegex = new RegExp(`\\{${escapedVar}(?:=[^\\{\\}]*)?(?::(multiline|uppercase|lowercase))?\\}`, 'g');
        result = result.replace(ezVarRegex, (fullMatch, mod) => {
          if (mod && mod.toLowerCase() === 'uppercase') return val.toUpperCase();
          if (mod && mod.toLowerCase() === 'lowercase') return val.toLowerCase();
          return val;
        });
      }
    }

    return result;
  }

  async function triggerSmartCopy(snippet, singleBlockContent = null) {
    const raw = singleBlockContent !== null
      ? singleBlockContent
      : (snippet.blocks || []).map(b => b.content).join('\n\n');

    let clipText = '';
    if (/\{Clipboard\}/i.test(raw)) {
      try { clipText = await navigator.clipboard.readText(); } catch (e) {}
    }

    const preResolved = applyAutoVariables(raw, clipText, null);
    const vars = extractVariablesDetailed(preResolved);

    if (vars.length > 0) {
      openVariableModal(raw, clipText, vars, snippet);
    } else {
      const finalStr = applyAutoVariables(raw, clipText, {});
      await finalizeCopy(finalStr, snippet);
    }
  }

  async function finalizeCopy(text, snippet) {
    await navigator.clipboard.writeText(text);
    if (snippet) {
      snippet.copyCount = (snippet.copyCount || 0) + 1;
      await saveSnippetToDisk(snippet);
    }
    showToast(`📋 "${snippet ? snippet.title : 'Code'}" kopiert!`);
  }

  function openVariableModal(rawContent, clipText, vars, snippet) {
    varInputsContainer.innerHTML = '';

    const collectValues = () => {
      const vals = {};
      varInputsContainer.querySelectorAll('.var-fill-input').forEach(inp => {
        vals[inp.dataset.var] = inp.value;
      });
      return vals;
    };

    const updateLivePreview = () => {
      if (!varLivePreview) return;
      varLivePreview.value = applyAutoVariables(rawContent, clipText, collectValues());
    };

    vars.forEach(v => {
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = v.name + (v.type === 'uppercase' ? ' (GROSS)' : v.type === 'lowercase' ? ' (klein)' : '');
      group.appendChild(label);

      let inputEl;
      if (v.type === 'select') {
        inputEl = document.createElement('select');
        inputEl.className = 'var-fill-input';
        v.options.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          inputEl.appendChild(o);
        });
      } else if (v.type === 'multiline') {
        inputEl = document.createElement('textarea');
        inputEl.className = 'var-fill-input';
        inputEl.rows = 3;
        inputEl.value = v.defaultValue || '';
      } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'var-fill-input';
        inputEl.value = v.defaultValue || '';
        inputEl.placeholder = `Wert für ${v.name}...`;
      }

      inputEl.dataset.var = v.name;
      inputEl.addEventListener('input', updateLivePreview);
      inputEl.addEventListener('change', updateLivePreview);
      group.appendChild(inputEl);
      varInputsContainer.appendChild(group);
    });

    updateLivePreview();
    varModalOverlay.style.display = 'flex';
    const firstInp = varInputsContainer.querySelector('.var-fill-input');
    if (firstInp) setTimeout(() => { firstInp.focus(); if (firstInp.select) firstInp.select(); }, 50);

    varForm.onsubmit = async (e) => {
      e.preventDefault();
      const finalStr = applyAutoVariables(rawContent, clipText, collectValues());
      varModalOverlay.style.display = 'none';
      await finalizeCopy(finalStr, snippet);
    };
  }

  btnCloseVarModal.onclick = () => { varModalOverlay.style.display = 'none'; };

  function openDrawer(snippet) {
    activeDrawerId = snippet.id;
    drawerTitle.textContent = snippet.title;
    drawerPath.textContent = snippet._path || 'Root';
    drawerDesc.textContent = snippet.description || 'Keine Beschreibung hinterlegt.';
    drawerTags.innerHTML = (snippet.tags || []).map(t => `<span class="tag-pill">${escapeHTML(t)}</span>`).join('');

    drawerBlocks.innerHTML = '';
    (snippet.blocks || []).forEach(b => {
      const box = document.createElement('div');
      box.className = 'code-preview-box';
      box.innerHTML = `
        <div class="code-preview-header">
          <span>${escapeHTML(b.name || 'Block')} (${escapeHTML(b.language || 'code')})</span>
          <button class="btn" style="padding:2px 8px; font-size:10px;">📋 Block kopieren</button>
        </div>
        <div class="code-preview-content" style="max-height: 360px;">${highlightPlaceholders(escapeHTML(b.content))}</div>
      `;
      box.querySelector('button').onclick = () => triggerSmartCopy(snippet, b.content);
      drawerBlocks.appendChild(box);
    });

    viewDrawerOverlay.classList.add('active');
  }

  btnCloseDrawer.onclick = () => viewDrawerOverlay.classList.remove('active');
  viewDrawerOverlay.onclick = (e) => {
    if (e.target === viewDrawerOverlay) viewDrawerOverlay.classList.remove('active');
  };
  btnDrawerEdit.onclick = () => {
    const s = snippets.find(item => item.id === activeDrawerId);
    viewDrawerOverlay.classList.remove('active');
    if (s) openEditModal(s);
  };

  function addBlockEditor(name = 'Syntax', content = '', language = 'baanc') {
    const wrapper = document.createElement('div');
    wrapper.className = 'block-item';

    wrapper.innerHTML = `
      <div class="block-item-top">
        <input type="text" class="blk-name" value="${escapeHTML(name)}" placeholder="Block-Name (z.B. Declaration / Select)" style="flex:1; padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); font-size:12px;">
        <select class="blk-lang select-input" style="padding:6px 10px; font-size:12px;">
          <option value="baanc" ${language === 'baanc' ? 'selected' : ''}>Infor LN (BaanC / 4GL)</option>
          <option value="sql" ${language === 'sql' ? 'selected' : ''}>SQL</option>
          <option value="xml" ${language === 'xml' ? 'selected' : ''}>BOD / XML</option>
          <option value="javascript" ${language === 'javascript' ? 'selected' : ''}>JavaScript / JSON</option>
          <option value="markdown" ${language === 'markdown' ? 'selected' : ''}>Markdown / Doku</option>
          <option value="plaintext" ${language === 'plaintext' ? 'selected' : ''}>Reiner Text</option>
        </select>
        <button type="button" class="btn blk-format" style="padding:5px 9px; font-size:11px;" title="Infor LN 4GL Code automatisch einrücken">✨ Format</button>
        <button type="button" class="btn blk-remove" style="padding:5px 9px; font-size:11px; color:#ef4444;">🗑️</button>
      </div>
      <textarea class="code-textarea blk-code" placeholder="Code oder Text hier eingeben...">${escapeHTML(content)}</textarea>
      <div class="lint-msg"></div>
    `;

    const textarea = wrapper.querySelector('.blk-code');
    const langSel = wrapper.querySelector('.blk-lang');
    const lintBox = wrapper.querySelector('.lint-msg');

    const runLint = () => {
      const res = lintCodeBlock(textarea.value, langSel.value);
      if (res) {
        lintBox.className = `lint-msg ${res.type}`;
        lintBox.textContent = res.message;
      } else {
        lintBox.className = 'lint-msg';
        lintBox.textContent = '';
      }
    };

    textarea.addEventListener('input', runLint);
    langSel.addEventListener('change', runLint);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '\t' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }
    });

    wrapper.querySelector('.blk-format').onclick = () => {
      textarea.value = formatBaanC(textarea.value);
      runLint();
      showToast('✨ Code formatiert!');
    };

    wrapper.querySelector('.blk-remove').onclick = () => {
      if (blocksContainer.children.length > 1) {
        wrapper.remove();
      } else {
        textarea.value = '';
      }
    };

    blocksContainer.appendChild(wrapper);
    runLint();
  }

  function updateFolderSuggestions() {
    const dl = document.getElementById('folderSuggestions');
    if (!dl) return;
    const folders = Array.from(discoveredFolders.keys()).filter(f => f !== 'Root').sort();
    dl.innerHTML = folders.map(f => `<option value="${escapeHTML(f)}">`).join('');
  }

  function openEditModal(snippet = null) {
    editingId = snippet ? snippet.id : null;
    modalTitle.textContent = snippet ? 'Snippet bearbeiten' : 'Neues Snippet erstellen';
    inpTitle.value = snippet ? snippet.title : '';
    inpFolder.value = snippet ? (snippet._path === 'Root' ? '' : snippet._path) : (activeFolder || '');
    inpDesc.value = snippet ? (snippet.description || '') : '';
    inpTags.value = snippet ? (snippet.tags || []).join(', ') : '';

    blocksContainer.innerHTML = '';
    if (snippet && snippet.blocks && snippet.blocks.length > 0) {
      snippet.blocks.forEach(b => addBlockEditor(b.name, b.content, b.language || 'baanc'));
    } else {
      addBlockEditor('Code', '', 'baanc');
    }

    renderDictionary('');
    editModalOverlay.style.display = 'flex';
  }

  btnNewSnippet.onclick = () => openEditModal(null);
  btnCloseEditModal.onclick = () => { editModalOverlay.style.display = 'none'; };
  btnCancelModal.onclick = () => { editModalOverlay.style.display = 'none'; };
  btnAddBlock.onclick = () => addBlockEditor('Weiterer Block', '', 'baanc');

  patternSelector.onchange = () => {
    const val = patternSelector.value;
    if (!val) return;

    if (val === 'select') {
      addBlockEditor('Select Loop', `| Select \${TABLE:tccom100}\ndb.retry.point()\nselect\t\${TABLE:tccom100}.*\nfrom\t\${TABLE:tccom100}\nwhere\t\${TABLE:tccom100}._index1 = {:\${KEY:i.bpid}}\nselectdo\n\t| Logik\nselectempty\n\t| Leer\nendselect`, 'baanc');
    } else if (val === 'update') {
      addBlockEditor('Update Loop', `db.retry.point()\nselect\t\${TABLE:tccom100}.*\nfrom\t\${TABLE:tccom100} for update\nwhere\t\${TABLE:tccom100}._index1 = {:\${KEY:i.bpid}}\nselectdo\n\t\${TABLE:tccom100}.nama = \${VAL:"Neu"}\n\tdb.update(t\${TABLE:tccom100}, db.retry)\n\tcommit.transaction()\nendselect`, 'baanc');
    } else if (val === 'insert') {
      addBlockEditor('Insert Record', `db.retry.point()\ndb.set.to.default(t\${TABLE:tccom100})\n\${TABLE:tccom100}.bpid = \${KEY:i.bpid}\ndb.insert(t\${TABLE:tccom100}, db.retry)\ncommit.transaction()`, 'baanc');
    } else if (val === 'dal-hook') {
      addBlockEditor('DAL Hooks', `function extern long before.save.object(long mode)\n{\n\treturn(0)\n}\n\nfunction extern long after.save.object(long mode)\n{\n\treturn(0)\n}`, 'baanc');
    } else if (val === 'ui-hook') {
      addBlockEditor('UI Choice Hook', `choice.again:\nbefore.choice:\n\t| Prüfung vor Ausführung\non.choice:\n\t| Hauptaktion`, 'baanc');
    } else if (val === 'bod-xml') {
      addBlockEditor('SyncBOD XML', `<?xml version="1.0" encoding="UTF-8"?>\n<SyncBOD>\n  <ApplicationArea>\n    <Sender><LogicalId>lid://infor.ln.erp</LogicalId></Sender>\n  </ApplicationArea>\n  <DataArea>\n    <BOD>\${CONTENT}</BOD>\n  </DataArea>\n</SyncBOD>`, 'xml');
    }

    patternSelector.value = '';
  };

  function renderDictionary(query) {
    const q = (query || '').toLowerCase().trim();
    dictResults.innerHTML = '';

    Object.entries(INFOR_TABLES)
      .filter(([tbl, info]) => tbl.includes(q) || info.name.toLowerCase().includes(q))
      .forEach(([tbl, info]) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#f8fafc; border:1px solid var(--border-color); border-radius:8px; padding:8px 10px; font-size:11.5px;';
        card.innerHTML = `
          <div style="font-weight:700; color:var(--primary); margin-bottom:4px;">${tbl.toUpperCase()} – <span style="color:var(--text-muted); font-weight:500;">${info.name}</span></div>
          <div style="display:flex; flex-direction:column; gap:3px;">
            ${info.fields.map(f => `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <code class="dict-field-code" data-field="${f.name}" style="color:#d97706; cursor:pointer; font-weight:600;" title="Klicken zum Einfügen">${f.name}</code>
                <span style="color:var(--text-muted); font-size:10.5px;">${f.label}</span>
              </div>
            `).join('')}
          </div>
        `;

        card.querySelectorAll('.dict-field-code').forEach(codeEl => {
          codeEl.onclick = () => {
            const fieldName = codeEl.dataset.field;
            const lastTextarea = blocksContainer.querySelector('.block-item:last-child .blk-code');
            if (lastTextarea) {
              const start = lastTextarea.selectionStart;
              const end = lastTextarea.selectionEnd;
              lastTextarea.value = lastTextarea.value.substring(0, start) + fieldName + lastTextarea.value.substring(end);
              lastTextarea.focus();
              showToast(`➕ ${fieldName} eingefügt`);
            }
          };
        });

        dictResults.appendChild(card);
      });
  }

  dictSearch.addEventListener('input', (e) => renderDictionary(e.target.value));

  snippetForm.onsubmit = async (e) => {
    e.preventDefault();
    const blocks = Array.from(blocksContainer.querySelectorAll('.block-item')).map(item => ({
      name: item.querySelector('.blk-name').value.trim() || 'Code',
      language: item.querySelector('.blk-lang').value,
      content: item.querySelector('.blk-code').value
    }));

    const folderVal = inpFolder.value.trim() || 'Root';
    const tagsArr = inpTags.value.split(',').map(t => t.trim()).filter(Boolean);

    if (editingId) {
      const idx = snippets.findIndex(s => s.id === editingId);
      if (idx >= 0) {
        snippets[idx].title = inpTitle.value.trim();
        snippets[idx]._path = folderVal;
        snippets[idx].description = inpDesc.value.trim();
        snippets[idx].tags = tagsArr;
        snippets[idx].blocks = blocks;
        await saveSnippetToDisk(snippets[idx]);
      }
    } else {
      const newSnip = {
        id: Date.now(),
        title: inpTitle.value.trim(),
        description: inpDesc.value.trim(),
        tags: tagsArr,
        favorite: false,
        copyCount: 0,
        createdAt: new Date().toISOString(),
        _path: folderVal,
        blocks
      };
      snippets.unshift(newSnip);
      await saveSnippetToDisk(newSnip);
    }

    if (!discoveredFolders.has(folderVal)) {
      discoveredFolders.set(folderVal, null);
    }

    editModalOverlay.style.display = 'none';
    renderAll();
    showToast('💾 Snippet gespeichert!');
  };

  categoryNav.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => {
      categoryNav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      tagNav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      activeFilter = item.dataset.filter;
      itemsToShow = PAGE_SIZE;
      renderSnippets();
    };
  });

  searchInput.addEventListener('input', () => {
    itemsToShow = PAGE_SIZE;
    renderSnippets();
  });

  sortSelect.addEventListener('change', renderSnippets);

  btnToggleCompact.onclick = () => {
    appContainer.classList.toggle('compact');
  };

  btnToggleFocus.onclick = () => {
    appContainer.classList.toggle('focus-mode');
  };

  btnConnectFolder.onclick = async () => {
    try {
      directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirHandle(directoryHandle);
      await loadSnippetsFromDirectory();
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('❌ Ordnerverbindung abgebrochen');
      }
    }
  };

  btnAddFolder.onclick = async () => {
    const name = prompt('Neuer Ordnername (z.B. DAL oder Projekt/Utils):');
    if (!name || !name.trim()) return;
    const cleanPath = name.trim();
    if (directoryHandle) {
      try {
        let curr = directoryHandle;
        for (const part of cleanPath.split('/')) {
          curr = await curr.getDirectoryHandle(part, { create: true });
        }
        discoveredFolders.set(cleanPath, curr);
      } catch (e) {}
    } else {
      discoveredFolders.set(cleanPath, null);
    }
    activeFolder = cleanPath;
    renderFolders();
    renderSnippets();
    showToast(`📁 Ordner "${cleanPath}" angelegt`);
  };

  function renderGlobalVarsRows() {
    globalVarsList.innerHTML = '';
    const entries = Object.entries(globalVars);
    if (entries.length === 0) {
      addGlobalVarRow('', '');
    } else {
      entries.forEach(([k, v]) => addGlobalVarRow(k, v));
    }
  }

  function addGlobalVarRow(key = '', val = '') {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:8px; align-items:center;';
    row.innerHTML = `
      <input type="text" class="gv-key" value="${escapeHTML(key)}" placeholder="Variablenname (z.B. Name)" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--border-color); font-size:12.5px;">
      <input type="text" class="gv-val" value="${escapeHTML(val)}" placeholder="Wert (z.B. Sascha Arend)" style="flex:1.4; padding:8px 10px; border-radius:8px; border:1px solid var(--border-color); font-size:12.5px;">
      <button type="button" class="btn gv-del" style="padding:7px 10px; color:#ef4444;">🗑️</button>
    `;
    row.querySelector('.gv-del').onclick = () => row.remove();
    globalVarsList.appendChild(row);
  }

  btnGlobalVars.onclick = () => {
    renderGlobalVarsRows();
    globalVarsModalOverlay.style.display = 'flex';
  };

  btnAddGlobalVar.onclick = () => addGlobalVarRow('', '');
  btnCloseGlobalVarsModal.onclick = () => { globalVarsModalOverlay.style.display = 'none'; };
  btnCancelGlobalVars.onclick = () => { globalVarsModalOverlay.style.display = 'none'; };

  btnSaveGlobalVars.onclick = async () => {
    const updated = {};
    globalVarsList.querySelectorAll('div').forEach(row => {
      const k = row.querySelector('.gv-key').value.trim();
      const v = row.querySelector('.gv-val').value;
      if (k) updated[k] = v;
    });
    globalVars = updated;
    await syncToChromeStorage();
    globalVarsModalOverlay.style.display = 'none';
    showToast('⚙️ Globale Variablen gespeichert!');
  };

  btnSyntaxHelp.onclick = () => { helpModalOverlay.style.display = 'flex'; };
  btnCloseHelpModal.onclick = () => { helpModalOverlay.style.display = 'none'; };

  btnImportJson.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (e) => {
      let imported = 0;
      for (const file of e.target.files) {
        try {
          const txt = await file.text();
          const data = JSON.parse(txt);

          if (data && data.globalVars && typeof data.globalVars === 'object') {
            globalVars = { ...globalVars, ...data.globalVars };
          }

          const list = Array.isArray(data)
            ? data
            : (Array.isArray(data.snippets) ? data.snippets : [data]);

          list.forEach(item => {
            if (!item || !item.title) return;

            if (Array.isArray(item.blocks)) {
              item.id = item.id || (Date.now() + Math.floor(Math.random() * 100000));
              item._path = item._path || activeFolder || 'Import';
              snippets.unshift(item);
              imported++;
            } else if (typeof item.content === 'string') {

              snippets.unshift({
                id: item.id || (Date.now() + Math.floor(Math.random() * 100000)),
                title: item.title,
                description: item.description || '',
                tags: Array.isArray(item.tags) ? item.tags : (item.category ? [item.category] : []),
                favorite: Boolean(item.isFavorite || item.favorite),
                copyCount: item.copyCount || 0,
                createdAt: item.createdAt || new Date().toISOString(),
                _path: item.category || activeFolder || 'Import',
                isDeleted: Boolean(item.isDeleted),
                deletedAt: item.deletedAt || null,
                blocks: [
                  {
                    name: 'Text / Code',
                    language: 'plaintext',
                    content: item.content
                  }
                ]
              });
              imported++;
            }
          });
        } catch (err) {}
      }
      if (imported > 0) {
        rebuildFolderMapFromSnippets();
        await syncToChromeStorage();
        renderAll();
        showToast(`📥 ${imported} Snippet(s) importiert!`);
      }
    };
    input.click();
  };

  btnExportJson.onclick = () => {
    const exportPayload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      globalVars,
      snippets: snippets.map(s => {
        const copy = { ...s };
        delete copy._handle;
        delete copy._filename;
        return copy;
      })
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eZSnippetZ_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 Backup exportiert!');
  };

  function openPalette() {
    paletteOverlay.style.display = 'flex';
    paletteInput.value = '';
    paletteIndex = 0;
    renderPaletteResults();
    setTimeout(() => paletteInput.focus(), 30);
  }

  function closePalette() {
    paletteOverlay.style.display = 'none';
  }

  function renderPaletteResults() {
    const q = paletteInput.value.toLowerCase().trim();
    const matches = snippets.filter(s =>
      !s.isDeleted && (
        (s.title || '').toLowerCase().includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q))
      )
    ).slice(0, 12);

    paletteList.innerHTML = '';
    matches.forEach((s, idx) => {
      const div = document.createElement('div');
      div.className = `palette-item ${idx === paletteIndex ? 'selected' : ''}`;
      div.innerHTML = `
        <span>📄 ${escapeHTML(s.title)}</span>
        <small style="color:var(--text-muted);">${escapeHTML(s._path || 'Root')}</small>
      `;
      div.onclick = () => {
        closePalette();
        triggerSmartCopy(s);
      };
      paletteList.appendChild(div);
    });
  }

  paletteInput.addEventListener('input', () => {
    paletteIndex = 0;
    renderPaletteResults();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      closePalette();
      editModalOverlay.style.display = 'none';
      varModalOverlay.style.display = 'none';
      globalVarsModalOverlay.style.display = 'none';
      helpModalOverlay.style.display = 'none';
      viewDrawerOverlay.classList.remove('active');
    }
  });

  paletteOverlay.onclick = (e) => {
    if (e.target === paletteOverlay) closePalette();
  };

  await loadInitialData();
});
