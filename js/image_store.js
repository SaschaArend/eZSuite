(function (root) {
    const DB_NAME = 'eZNotesMediaDB';
    const DB_VERSION = 1;
    const STORE_IMAGES = 'images';
    const STORE_SESSIONS = 'sessions';

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_IMAGES)) {
                    db.createObjectStore(STORE_IMAGES);
                }
                if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
                    db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                dbPromise = null;
                reject(req.error);
            };
        });
        return dbPromise;
    }

    async function dataUrlToBlob(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        if (dataUrl instanceof Blob) return dataUrl;
        try {
            const res = await fetch(dataUrl);
            return await res.blob();
        } catch (e) {
            console.error('[EzImageStore] dataUrlToBlob failed:', e);
            return null;
        }
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            if (!blob) return resolve(null);
            if (typeof blob === 'string') return resolve(blob);
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    async function putBlob(imageId, blobOrDataUrl) {
        if (!imageId || !blobOrDataUrl) return null;
        const blob = (blobOrDataUrl instanceof Blob) ? blobOrDataUrl : await dataUrlToBlob(blobOrDataUrl);
        if (!blob) return null;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            tx.objectStore(STORE_IMAGES).put(blob, imageId);
            tx.oncomplete = () => resolve(imageId);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getBlob(imageId) {
        if (!imageId) return null;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const req = tx.objectStore(STORE_IMAGES).get(imageId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function getDataUrl(imageId) {
        const blob = await getBlob(imageId);
        if (!blob) return null;
        return await blobToDataUrl(blob);
    }

    async function deleteBlob(imageId) {
        if (!imageId) return;
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            tx.objectStore(STORE_IMAGES).delete(imageId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async function deleteBlobs(imageIds) {
        if (!Array.isArray(imageIds) || imageIds.length === 0) return;
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            const store = tx.objectStore(STORE_IMAGES);
            imageIds.forEach(id => {
                if (id) store.delete(id);
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async function clearExportBlobs() {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            const store = tx.objectStore(STORE_IMAGES);
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
                const keys = keysReq.result || [];
                keys.forEach(k => {
                    if (typeof k === 'string' && k.startsWith('export_img_')) {
                        store.delete(k);
                    }
                });
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async function resolveStepDataUrl(step) {
        if (!step) return null;
        if (step.dataUrl) return step.dataUrl;
        if (step.imageId) {
            return await getDataUrl(step.imageId);
        }
        return null;
    }

    async function resolveStepBlob(step) {
        if (!step) return null;
        if (step.imageId) {
            const blob = await getBlob(step.imageId);
            if (blob) return blob;
        }
        if (step.dataUrl) {
            return await dataUrlToBlob(step.dataUrl);
        }
        return null;
    }

    async function offloadSessionImages(session) {
        if (!session || !Array.isArray(session.steps)) return false;
        let changed = false;
        const sessId = session.id || 'active';

        for (let i = 0; i < session.steps.length; i++) {
            const step = session.steps[i];
            if (step.logs) {
                delete step.logs;
                changed = true;
            }
            if (step.dataUrl && step.type !== 'chapter' && step.type !== 'textblock') {
                if (!step.id) step.id = `${Date.now()}_${i}`;

                const imgId = `img_${sessId}_${step.id}`;
                await putBlob(imgId, step.dataUrl);
                step.imageId = imgId;
                delete step.dataUrl;
                changed = true;
            }
        }
        return changed;
    }

    async function hydrateSessionForExport(session) {
        if (!session) return null;
        const copy = JSON.parse(JSON.stringify(session));
        delete copy.undoStack;
        delete copy.redoStack;

        if (Array.isArray(copy.steps)) {
            await Promise.all(copy.steps.map(async (step) => {
                delete step.logs;
                if (!step.dataUrl && step.imageId) {
                    const dataUrl = await getDataUrl(step.imageId);
                    if (dataUrl) step.dataUrl = dataUrl;
                }
            }));
        }
        return copy;
    }

    async function createThumbnailDataUrl(sourceBlobOrDataUrl, maxWidth = 360) {
        if (!sourceBlobOrDataUrl) return null;
        try {
            const blob = (sourceBlobOrDataUrl instanceof Blob)
                ? sourceBlobOrDataUrl
                : await dataUrlToBlob(sourceBlobOrDataUrl);
            if (!blob) return null;

            if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
                const bitmap = await createImageBitmap(blob);
                const scale = Math.min(1, maxWidth / bitmap.width);
                const w = Math.max(1, Math.round(bitmap.width * scale));
                const h = Math.max(1, Math.round(bitmap.height * scale));
                const canvas = new OffscreenCanvas(w, h);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0, w, h);
                bitmap.close();
                const thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
                return await blobToDataUrl(thumbBlob);
            }
        } catch (e) {
            console.warn('[EzImageStore] Thumbnail generation failed:', e);
        }
        return null;
    }

    async function buildSessionMeta(session, existingThumb = null) {
        const steps = session.steps || [];
        let thumbDataUrl = existingThumb || session.thumbnailDataUrl || null;

        if (!thumbDataUrl) {
            const firstImgStep = steps.find(s => s.imageId || s.dataUrl);
            if (firstImgStep) {
                const blob = await resolveStepBlob(firstImgStep);
                if (blob) {
                    thumbDataUrl = await createThumbnailDataUrl(blob, 360);
                }
            }
        }

        const searchParts = [
            session.title || '',
            session.description || '',
            ...(session.tags || []),
            ...steps.map(s => `${s.title || ''} ${s.description || ''} ${s.session || ''} ${s.field || ''}`)
        ];
        const searchIndex = searchParts.join(' ').toLowerCase();

        return {
            id: session.id,
            title: session.title || 'Dokumentation',
            description: session.description || '',
            version: session.version || '1.0',
            timestamp: session.timestamp || Date.now(),
            tags: session.tags || [],
            history: session.history || [],
            fromFile: session.fromFile || null,
            stepCount: steps.length,
            thumbnailDataUrl: thumbDataUrl,
            searchIndex: searchIndex
        };
    }

    async function saveLibrarySession(session) {
        if (!session || !session.id) return null;
        const sessionCopy = JSON.parse(JSON.stringify(session));
        delete sessionCopy.undoStack;
        delete sessionCopy.redoStack;

        await offloadSessionImages(sessionCopy);
        const meta = await buildSessionMeta(sessionCopy);

        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SESSIONS, 'readwrite');
            tx.objectStore(STORE_SESSIONS).put(sessionCopy);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        return meta;
    }

    async function getLibrarySession(sessionId) {
        if (!sessionId) return null;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SESSIONS, 'readonly');
            const req = tx.objectStore(STORE_SESSIONS).get(sessionId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function getAllLibrarySessions() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SESSIONS, 'readonly');
            const req = tx.objectStore(STORE_SESSIONS).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteLibrarySession(sessionId, deleteStepImages = true) {
        if (!sessionId) return;
        const session = await getLibrarySession(sessionId);
        if (session && deleteStepImages && Array.isArray(session.steps)) {
            const imgIds = session.steps.map(s => s.imageId).filter(Boolean);
            await deleteBlobs(imgIds);
        }
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_SESSIONS, 'readwrite');
            tx.objectStore(STORE_SESSIONS).delete(sessionId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async function cleanupOrphanedImages(extraProtectedImageIds = [], keepExportImages = true) {
        try {
            const storageData = await chrome.storage.local.get(['activeSession', 'saved_sessions_meta', 'exportData']);
            const referencedImageIds = new Set(extraProtectedImageIds.filter(Boolean));

            const activeSession = storageData.activeSession;
            if (activeSession && Array.isArray(activeSession.steps)) {
                activeSession.steps.forEach(s => {
                    if (s && s.imageId) referencedImageIds.add(s.imageId);
                });
            }

            if (keepExportImages && storageData.exportData && Array.isArray(storageData.exportData.steps)) {
                storageData.exportData.steps.forEach(s => {
                    if (s && s.exportImageId) referencedImageIds.add(s.exportImageId);
                    if (s && s.imageId) referencedImageIds.add(s.imageId);
                });
            }

            const validSessionIds = new Set((storageData.saved_sessions_meta || []).map(m => m.id).filter(Boolean));
            const allStoredSessions = await getAllLibrarySessions();
            const orphanSessionIds = [];

            for (const sess of allStoredSessions) {
                if (validSessionIds.size > 0 && !validSessionIds.has(sess.id)) {
                    orphanSessionIds.push(sess.id);
                    continue;
                }
                if (Array.isArray(sess.steps)) {
                    sess.steps.forEach(s => {
                        if (s && s.imageId) referencedImageIds.add(s.imageId);
                    });
                }
            }

            const db = await openDB();

            if (orphanSessionIds.length > 0) {
                await new Promise((resolve) => {
                    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
                    const store = tx.objectStore(STORE_SESSIONS);
                    orphanSessionIds.forEach(id => store.delete(id));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                });
            }

            const allImageKeys = await new Promise((resolve) => {
                const tx = db.transaction(STORE_IMAGES, 'readonly');
                const req = tx.objectStore(STORE_IMAGES).getAllKeys();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });

            const keysToDelete = allImageKeys.filter(key => !referencedImageIds.has(key));

            if (keysToDelete.length > 0) {
                await deleteBlobs(keysToDelete);
                console.info(`[EzImageStore GC] Bereinigt: ${keysToDelete.length} verwaiste Bilder gelöscht.`);
            }

            return {
                deletedImages: keysToDelete.length,
                deletedSessions: orphanSessionIds.length
            };
        } catch (e) {
            console.warn('[EzImageStore GC] Fehler bei Bereinigung:', e);
            return { deletedImages: 0, deletedSessions: 0 };
        }
    }

    root.EzImageStore = {
        openDB,
        dataUrlToBlob,
        blobToDataUrl,
        putBlob,
        getBlob,
        getDataUrl,
        deleteBlob,
        deleteBlobs,
        clearExportBlobs,
        resolveStepDataUrl,
        resolveStepBlob,
        offloadSessionImages,
        hydrateSessionForExport,
        createThumbnailDataUrl,
        buildSessionMeta,
        saveLibrarySession,
        getLibrarySession,
        deleteLibrarySession,
        cleanupOrphanedImages
    };
})(typeof self !== 'undefined' ? self : window);
