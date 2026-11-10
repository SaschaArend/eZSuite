let savedSessions = [];
let filteredSessions = [];
let selectedTag = null;
let rootDirHandle = null;
let currentHistorySession = null;
let selectedSessionIds = new Set();

const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('eZNotesDB', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

async function setHandle(name, handle) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getHandle(name) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const request = tx.objectStore('handles').get(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSessions();
    setupEventListeners();
});

async function loadSessions() {

    const data = await chrome.storage.local.get(['saved_sessions_meta', 'saved_sessions']);
    let metaList = data.saved_sessions_meta || [];

    if (Array.isArray(data.saved_sessions) && data.saved_sessions.length > 0) {
        console.log(`[Library] Migrating ${data.saved_sessions.length} legacy sessions to IndexedDB...`);
        const metaMap = new Map(metaList.map(m => [m.id, m]));
        for (const legacySession of data.saved_sessions) {
            if (!legacySession.id) legacySession.id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
            const meta = await EzImageStore.saveLibrarySession(legacySession);
            if (meta) metaMap.set(meta.id, meta);
        }
        metaList = Array.from(metaMap.values());
        await chrome.storage.local.set({ saved_sessions_meta: metaList });
        await chrome.storage.local.remove('saved_sessions');
        console.log('[Library] Legacy sessions migration complete.');
    }

    savedSessions = metaList;

    rootDirHandle = await getHandle('rootFolder');
    if (rootDirHandle) {
        const options = { mode: 'readwrite' };
        if (await rootDirHandle.queryPermission(options) === 'granted') {
            await scanRootDirectory();
        } else {
            document.getElementById('directoryStatus').style.display = 'flex';
            document.getElementById('directoryPathText').textContent = '⚠️ Zugriff auf Stammverzeichnis erforderlich';
            document.getElementById('btnSyncDir').textContent = 'Zulassen';
        }
    }

    filteredSessions = [...savedSessions];
    applySorting();
    renderTagCloud();
    renderLibrary();

    EzImageStore.cleanupOrphanedImages();
}

async function scanRootDirectory() {
    if (!rootDirHandle) return;

    try {
        const storageData = await chrome.storage.local.get('saved_sessions_meta');
        const existingMeta = storageData.saved_sessions_meta || [];
        const mergeMap = new Map();
        existingMeta.forEach(m => mergeMap.set(m.id, m));

        let loadedCount = 0;
        for await (const entry of rootDirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                const file = await entry.getFile();
                const text = await file.text();
                try {
                    const json = JSON.parse(text);
                    if (json.steps && Array.isArray(json.steps)) {
                        json.title = json.title || entry.name.replace('.json', '');
                        json.fromFile = entry.name;
                        if (!json.id) json.id = entry.name;

                        const meta = await EzImageStore.saveLibrarySession(json);
                        if (meta) {
                            mergeMap.set(meta.id, meta);
                            loadedCount++;
                        }
                    }
                } catch (e) { }
            }
        }

        savedSessions = Array.from(mergeMap.values());
        await chrome.storage.local.set({ saved_sessions_meta: savedSessions });

        applyFilters();
        renderTagCloud();

        document.getElementById('directoryStatus').style.display = 'flex';
        document.getElementById('directoryPathText').textContent = `Stammverzeichnis: ${rootDirHandle.name}`;
        document.getElementById('btnSyncDir').textContent = 'Aktualisieren';

        await rootDirHandle.getDirectoryHandle('OLD', { create: true });

        await EzImageStore.cleanupOrphanedImages();

        console.log(`Scan abgeschlossen. ${loadedCount} Dokumente aus Ordner geladen.`);
    } catch (err) {
        console.error('Directory Scan Error:', err);
        showToast('Fehler beim Scannen des Ordners');
    }
}

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', () => {
        applyFilters();
    });

    document.getElementById('sortSelect').addEventListener('change', () => {
        applySorting();
        renderLibrary();
    });

    const btnClose = document.getElementById('btnClose');
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            window.close();
        });
    }

    document.getElementById('closeHistory').onclick = () => {
        document.getElementById('historyModal').style.display = 'none';
    };

    window.onclick = (e) => {
        const modal = document.getElementById('historyModal');
        if (e.target === modal) modal.style.display = 'none';
    };

    document.getElementById('btnClearHistory').onclick = async () => {
        if (!currentHistorySession) return;

        if (confirm('Möchtest du die gesamte Historie für dieses Dokument löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.')) {
            currentHistorySession.history = [{
                timestamp: Date.now(),
                action: 'Historie manuell geleert',
                version: currentHistorySession.version || '1.0'
            }];

            await updateSessionInStorageAndFilesystem(currentHistorySession);
            showHistory(currentHistorySession);
            showToast('Historie geleert');
        }
    };

    document.getElementById('btnSetRoot').onclick = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await setHandle('rootFolder', handle);
            rootDirHandle = handle;
            await scanRootDirectory();
            showToast('Stammverzeichnis verbunden');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error(err);
                alert('Fehler beim Zugriff auf das Verzeichnis.');
            }
        }
    };

    document.getElementById('btnSyncDir').onclick = async () => {
        if (!rootDirHandle) return;
        const options = { mode: 'readwrite' };
        if (await rootDirHandle.queryPermission(options) !== 'granted') {
            await rootDirHandle.requestPermission(options);
        }
        await scanRootDirectory();
        applyFilters();
        renderTagCloud();
        showToast('Verzeichnis synchronisiert');
    };

    document.getElementById('btnCancelSelection').onclick = () => {
        selectedSessionIds.clear();
        updateSelectionUI();
        renderLibrary();
    };

    document.getElementById('btnBulkMerge').onclick = mergeSelectedSessions;
}

function applySorting() {
    const sortBy = document.getElementById('sortSelect').value;
    filteredSessions.sort((a, b) => {
        const countA = a.stepCount !== undefined ? a.stepCount : (a.steps?.length || 0);
        const countB = b.stepCount !== undefined ? b.stepCount : (b.steps?.length || 0);
        if (sortBy === 'date_desc') return (b.timestamp || 0) - (a.timestamp || 0);
        if (sortBy === 'date_asc') return (a.timestamp || 0) - (b.timestamp || 0);
        if (sortBy === 'name_asc') return (a.title || '').localeCompare(b.title || '');
        if (sortBy === 'steps_desc') return countB - countA;
        return 0;
    });
}

function renderTagCloud() {
    const cloud = document.getElementById('tagCloud');
    cloud.innerHTML = '';

    const allTags = new Set();
    savedSessions.forEach(s => {
        if (s.tags) s.tags.forEach(t => allTags.add(t));
    });

    if (allTags.size === 0) return;

    const allChip = document.createElement('div');
    allChip.className = `tag-chip ${selectedTag === null ? 'active' : ''}`;
    allChip.textContent = 'Alle';
    allChip.onclick = () => {
        selectedTag = null;
        applyFilters();
        renderTagCloud();
    };
    cloud.appendChild(allChip);

    Array.from(allTags).sort().forEach(tag => {
        const chip = document.createElement('div');
        chip.className = `tag-chip ${selectedTag === tag ? 'active' : ''}`;
        chip.textContent = tag;
        chip.onclick = () => {
            selectedTag = (selectedTag === tag) ? null : tag;
            applyFilters();
            renderTagCloud();
        };
        cloud.appendChild(chip);
    });
}

function applyFilters() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();

    filteredSessions = savedSessions.filter(s => {
        let matchesQuery = true;
        if (query) {
            if (s.searchIndex) {
                matchesQuery = s.searchIndex.includes(query);
            } else {
                const inTitle = (s.title || '').toLowerCase().includes(query);
                const inDesc = (s.description || '').toLowerCase().includes(query);
                const inTags = (s.tags || []).some(t => t.toLowerCase().includes(query));
                matchesQuery = inTitle || inDesc || inTags;
            }
        }
        const matchesTag = selectedTag === null || (s.tags || []).includes(selectedTag);
        return matchesQuery && matchesTag;
    });

    renderLibrary();
}

function renderLibrary() {
    const grid = document.getElementById('libraryGrid');
    const stats = document.getElementById('statsLabel');
    grid.innerHTML = '';

    stats.textContent = `Geladen: ${filteredSessions.length} Dokumentationen`;

    if (filteredSessions.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><h2>Keine Treffer</h2></div>`;
        return;
    }

    applySorting();

    filteredSessions.forEach((session) => {
        const isSelected = selectedSessionIds.has(session.id);
        const card = document.createElement('div');
        card.className = `session-card ${isSelected ? 'selected' : ''}`;

        const dateStr = session.timestamp ? new Date(session.timestamp).toLocaleString('de-DE') : 'Unbekannt';
        const stepCount = session.stepCount !== undefined ? session.stepCount : (session.steps ? session.steps.length : 0);
        const firstImg = session.thumbnailDataUrl || session.steps?.find(s => s.dataUrl)?.dataUrl;

        const tagsHtml = (session.tags || []).map(t => `<span style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${escapeHtml(t)}</span>`).join('');

        card.innerHTML = `
            <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
            <div class="session-badge">V ${escapeHtml(session.version || '1.0')}</div>
            <div class="session-title">${escapeHtml(session.title || 'Dokumentation')}</div>
            <div style="margin-bottom: 8px;">${tagsHtml}</div>
            <div class="session-meta">
                <div class="meta-item">📅 ${dateStr}</div>
                <div class="meta-item">📸 ${stepCount} Schritte</div>
            </div>
            <div class="session-preview" style="${firstImg ? `background-image: url(${firstImg})` : 'background: #27272a;'}"></div>
            <div class="card-actions">
                <button class="action-btn primary btn-load">✏️ Öffnen</button>
                <button class="action-btn btn-history">📜 Historie</button>
                <button class="action-btn danger btn-delete">🗑️</button>
            </div>
        `;

        card.querySelector('.card-checkbox').onclick = (e) => {
            e.stopPropagation();
            toggleSelection(session.id);
        };

        card.onclick = (e) => {
            if (e.target.closest('.card-actions') || e.target.closest('.card-checkbox')) return;
            toggleSelection(session.id);
        };

        card.querySelector('.btn-load').onclick = () => loadSession(session.id);
        card.querySelector('.btn-delete').onclick = () => deleteSession(session.id);
        card.querySelector('.btn-history').onclick = () => showHistory(session);

        grid.appendChild(card);
    });
}

function toggleSelection(id) {
    if (selectedSessionIds.has(id)) {
        selectedSessionIds.delete(id);
    } else {
        selectedSessionIds.add(id);
    }
    updateSelectionUI();
    renderLibrary();
}

function updateSelectionUI() {
    const bar = document.getElementById('selectionToolbar');
    const countText = document.getElementById('selectedCountText');
    const count = selectedSessionIds.size;

    if (count > 0) {
        bar.classList.add('show');
        countText.textContent = count;
    } else {
        bar.classList.remove('show');
    }
}

function showHistory(session) {
    currentHistorySession = session;
    const modal = document.getElementById('historyModal');
    const list = document.getElementById('historyList');
    const title = document.getElementById('historyTitle');

    if (!modal || !list) return;

    title.textContent = `Historie: ${session.title || 'Dokumentation'}`;
    list.innerHTML = '';

    let historyToShow = session.history || [];

    if (historyToShow.length === 0) {
        historyToShow.push({
            timestamp: session.timestamp || Date.now(),
            action: 'Dokument erstellt / archiviert',
            version: session.version || '1.0'
        });
    }

    const sortedHistory = [...historyToShow].reverse();

    sortedHistory.forEach(h => {
        const date = new Date(h.timestamp);
        const timeStr = date.toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const item = document.createElement('div');
        item.className = 'history-item';

        const safeAction = escapeHtml(h.action);
        const safeVersion = escapeHtml(h.version || h.newVersion || '1.0');

        item.innerHTML = `
            <div class="history-line"></div>
            <div class="history-dot"></div>
            <div class="history-content">
                <div class="history-time">${timeStr}</div>
                <div class="history-action">
                    ${safeAction}
                    <span class="history-version">v${safeVersion}</span>
                </div>
            </div>
        `;
        list.appendChild(item);
    });

    modal.style.display = 'flex';
}

async function loadSession(id) {
    const meta = savedSessions.find(s => s.id === id);
    if (!meta) return;

    if (confirm(`Möchtest du "${meta.title}" in den Editor laden? \nEine neue Version wird automatisch erstellt.`)) {

        let fullSession = await EzImageStore.getLibrarySession(id);
        if (!fullSession) {
            alert('Fehler: Die vollständigen Sitzungsdaten konnten nicht geladen werden.');
            return;
        }

        const session = JSON.parse(JSON.stringify(fullSession));
        if (!session.history) session.history = [];

        const oldVersion = session.version || "1.0";
        let parts = oldVersion.split('.');
        if (parts.length > 1) {
            parts[1] = parseInt(parts[1]) + 1;
        } else {
            parts.push("1");
        }
        const newVersion = parts.join('.');

        session.history.push({
            timestamp: Date.now(),
            action: 'Geladen aus Bibliothek',
            oldVersion: oldVersion,
            newVersion: newVersion
        });

        session.version = newVersion;
        session.isActive = true;

        const newSessionId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        session.id = newSessionId;

        if (Array.isArray(session.steps)) {
            for (const step of session.steps) {
                if (step.imageId) {
                    const blob = await EzImageStore.getBlob(step.imageId);
                    if (blob) {
                        const newImgId = `img_${newSessionId}_${step.id}_${Math.random().toString(36).slice(2, 6)}`;
                        await EzImageStore.putBlob(newImgId, blob);
                        step.imageId = newImgId;
                    }
                }
            }
        }

        await chrome.storage.local.set({
            activeSession: session,
            sessionRecordingState: {
                isActive: true,
                isPaused: false,
                count: session.steps ? session.steps.length : 0
            }
        });

        await EzImageStore.cleanupOrphanedImages();

        window.location.href = 'editor.html';
    }
}

async function deleteSession(id) {
    const sessionMeta = savedSessions.find(s => s.id === id);
    if (!sessionMeta) return;

    const msg = sessionMeta.fromFile
        ? `Dokumentation "${sessionMeta.title}" in den Ordner "OLD" verschieben?`
        : `Dokumentation "${sessionMeta.title}" wirklich unwiderruflich löschen?`;

    if (confirm(msg)) {
        if (sessionMeta.fromFile && rootDirHandle) {
            try {
                const options = { mode: 'readwrite' };
                if (await rootDirHandle.queryPermission(options) === 'granted') {
                    const oldDir = await rootDirHandle.getDirectoryHandle('OLD', { create: true });
                    const fileHandle = await rootDirHandle.getFileHandle(sessionMeta.fromFile);

                    if (fileHandle.move) {
                        await fileHandle.move(oldDir, sessionMeta.fromFile);
                    } else {
                        const file = await fileHandle.getFile();
                        const newFileHandle = await oldDir.getFileHandle(sessionMeta.fromFile, { create: true });
                        const writable = await newFileHandle.createWritable();
                        await writable.write(await file.arrayBuffer());
                        await writable.close();
                        await rootDirHandle.removeEntry(sessionMeta.fromFile);
                    }
                }
            } catch (err) {
                console.error('Move to OLD failed:', err);
            }
        }

        await EzImageStore.deleteLibrarySession(id, true);

        savedSessions = savedSessions.filter(s => s.id !== id);
        await chrome.storage.local.set({ saved_sessions_meta: savedSessions });

        showToast(sessionMeta.fromFile ? 'In "OLD" verschoben' : 'Dokumentation gelöscht');
        filteredSessions = filteredSessions.filter(s => s.id !== id);
        renderLibrary();
    }
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

async function updateSessionInStorageAndFilesystem(sessionMeta) {

    const idx = savedSessions.findIndex(s => s.id === sessionMeta.id);
    if (idx !== -1) {
        savedSessions[idx] = JSON.parse(JSON.stringify(sessionMeta));
        await chrome.storage.local.set({ saved_sessions_meta: savedSessions });
    }

    const fullSession = await EzImageStore.getLibrarySession(sessionMeta.id);
    if (fullSession) {
        fullSession.history = sessionMeta.history;
        await EzImageStore.saveLibrarySession(fullSession);

        if (sessionMeta.fromFile && rootDirHandle) {
            try {
                const options = { mode: 'readwrite' };
                if (await rootDirHandle.queryPermission(options) === 'granted') {
                    const hydrated = await EzImageStore.hydrateSessionForExport(fullSession);
                    const fileHandle = await rootDirHandle.getFileHandle(sessionMeta.fromFile, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(hydrated, null, 2));
                    await writable.close();
                }
            } catch (err) {
                console.error('Failed to update file after history clear:', err);
            }
        }
    }
}

async function mergeSelectedSessions() {
    const ids = Array.from(selectedSessionIds);
    if (ids.length < 2) {
        alert('Bitte wähle mindestens zwei Dokumente zum Zusammenführen aus.');
        return;
    }

    const metasToMerge = savedSessions.filter(s => ids.includes(s.id));
    const newTitle = prompt('Titel für die neue zusammengeführte Dokumentation:', `Zusammenführung (${metasToMerge.length} Dokumente)`);
    if (!newTitle) return;

    const newSessionId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    let combinedSteps = [];

    for (const meta of metasToMerge) {
        const full = await EzImageStore.getLibrarySession(meta.id);
        if (full && Array.isArray(full.steps)) {
            for (const step of full.steps) {
                const clonedStep = JSON.parse(JSON.stringify(step));
                if (clonedStep.imageId) {
                    const blob = await EzImageStore.getBlob(clonedStep.imageId);
                    if (blob) {
                        const newImgId = `img_${newSessionId}_${clonedStep.id}_${Math.random().toString(36).slice(2, 6)}`;
                        await EzImageStore.putBlob(newImgId, blob);
                        clonedStep.imageId = newImgId;
                    }
                }
                combinedSteps.push(clonedStep);
            }
        }
    }

    const newSession = {
        id: newSessionId,
        title: newTitle,
        version: "1.0",
        timestamp: Date.now(),
        steps: combinedSteps,
        history: [{
            timestamp: Date.now(),
            action: `Zusammengeführt aus: ${metasToMerge.map(s => s.title).join(', ')}`,
            version: "1.0"
        }],
        tags: Array.from(new Set(metasToMerge.flatMap(s => s.tags || [])))
    };

    const newMeta = await EzImageStore.saveLibrarySession(newSession);
    savedSessions.push(newMeta);
    await chrome.storage.local.set({ saved_sessions_meta: savedSessions });

    if (rootDirHandle) {
        const fileName = `${newTitle.replace(/[/\\?%*:|"<>]/g, '_')} (1.0).json`;
        try {
            const hydrated = await EzImageStore.hydrateSessionForExport(newSession);
            const fileHandle = await rootDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(hydrated, null, 2));
            await writable.close();
        } catch (e) { console.error(e); }
    }

    selectedSessionIds.clear();
    updateSelectionUI();
    filteredSessions = [...savedSessions];
    renderLibrary();
    showToast('Dokumente erfolgreich zusammengeführt');
}

function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
