importScripts('image_store.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  try {
    if (!message) return;

    if (message.type === 'RELAY_TO_TAB') {
      if (sender?.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, message.data).catch(e => console.warn('[BG] Relay failed:', e));
      }
      return;
    }

    if (message.type === 'cleanupOrphanedImages') {
      EzImageStore.cleanupOrphanedImages().then((stats) => {
        if (sendResponse) sendResponse(stats);
      });
      return;
    }

    if (message.type === 'openEditorTab') {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/editor.html') });
      return;
    }

    if (message.type === 'autosave') {
      console.log('[BG] Autosave-Anfrage erhalten:', {
        filename: message.filename,
        hostname: message.hostname,
        title: message.title
      });

      chrome.downloads.download({
        url: message.dataUrl,
        filename: message.filename,
        conflictAction: "uniquify",
        saveAs: false
      }, (id) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('[BG] Autosave-Download-Fehler:', err);
        } else {
          console.info('[BG] Autosave-Download erfolgreich gestartet, id:', id);
        }
      });
      return;
    }

    if (message.type === 'requestCapture') {
      const windowId = sender?.tab?.windowId;
      chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 85 }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('[BG] requestCapture Fehler:', err);
          sendResponse({ error: err.message });
        } else {
          sendResponse({ imageDataUrl: dataUrl });
        }
      });
      return;
    }

    if (message.type !== 'capture') {
      console.log('[BG] Nachricht ignoriert (nicht vom Typ capture):', message.type);
      return;
    }

    console.info('[BG] Capture-Request erhalten:', {
      sender: { tab: sender?.tab?.id, frameId: sender?.frameId }
    });

    const cfg = await chrome.storage.sync.get([
      "recording", "autosave", "copyOnClick", "preset", "markerNumber", "markerText", "lineColor", "lineWidth",
      "arrowAngle", "arrowLength", "doubleArrow", "smartCrop"
    ]);

    const windowId = sender?.tab?.windowId;

    const imageDataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, {
        format: 'jpeg',
        quality: 85
      }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('[BG] captureVisibleTab Fehler:', err);
          return reject(err);
        }
        if (!dataUrl) {
          return reject(new Error('Kein Screenshot erhalten'));
        }
        resolve(dataUrl);
      });
    });

    const meta = {
      devicePixelRatio: message.devicePixelRatio || 1,
      hostname: (() => {
        try { return message.hostname || new URL(sender?.tab?.url || '').hostname || 'unknown'; }
        catch { return message.hostname || 'unknown'; }
      })(),
      title: message.title || sender?.tab?.title || 'Seite',
      timestamp: new Date().toISOString()
    };

    if (cfg.copyOnClick && !message.noCopy && sender?.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'copyToClipboard',
        image: imageDataUrl,
        preset: cfg.preset ?? "red-circle",
        meta,
        style: {
          number: cfg.markerNumber ?? 1,
          text: cfg.markerText ?? "",
          color: cfg.lineColor ?? "#ff0000",
          width: cfg.lineWidth ?? 6
        },
        arrowSettings: {
          angle: cfg.arrowAngle ?? "45",
          length: cfg.arrowLength ?? "medium",
          double: cfg.doubleArrow ?? false
        }
      }).catch(e => console.warn('[BG] Could not send copyToClipboard message:', e));
    }

    const sessionData = await chrome.storage.local.get('activeSession');
    const activeSession = sessionData.activeSession;

    if (activeSession && activeSession.isActive) {
      if (activeSession.isPaused) {
        console.log('[BG] Session is paused, skipping step capture.');
        return;
      }

      let stepImageBlob = null;
      if (cfg.smartCrop && message.clientX !== undefined && message.clientY !== undefined) {
        try {
          stepImageBlob = await cropImageToBlob(imageDataUrl, message.clientX, message.clientY, message.devicePixelRatio || 1);
        } catch (cropErr) {
          console.error('[BG] Smart-Crop failed:', cropErr);
        }
      }
      if (!stepImageBlob) {
        stepImageBlob = await EzImageStore.dataUrlToBlob(imageDataUrl);
      }

      let cleanTitle = message.elementText || message.title || 'Schritt';
      if (cleanTitle.toLowerCase().includes('drill-down')) {
        cleanTitle = 'Details';
      } else if (cleanTitle.includes('#') || cleanTitle.includes('>') || (cleanTitle.includes('-') && cleanTitle.length > 15)) {
        cleanTitle = 'Element';
      }

      const stepId = Date.now();
      const imageId = `img_${activeSession.id || 'session'}_${stepId}_${Math.random().toString(36).slice(2, 7)}`;

      if (stepImageBlob) {
        await EzImageStore.putBlob(imageId, stepImageBlob);
      }

      const step = {
        id: stepId,
        imageId: imageId,
        title: `Klick auf "${cleanTitle}"`,
        description: '',
        session: '',
        field: '',
        timestamp: new Date().toISOString(),
        x: message.clientX,
        y: message.clientY,
        rect: message.targetRect,
        meta: meta,
        isSensitive: message.isSensitive || false,
        markers: [],
        selector: message.selector || ''
      };

      const sessionRegex = /([a-z]{2,6}\d{4,}[a-z]\d{2,})/i;
      const fieldRegex = /([a-z]{2,6}\d{3,}\.[a-z0-9_.-]{1,})/i;
      const combinedRegex = /([a-z]{2,8}\d+[a-z0-9_-]{0,10})-([a-z0-9_.-]{3,})/i;
      let found = false;

      const isTechnicalTerm = (str) => str.toLowerCase().includes('drill') || str.toLowerCase().includes('down');

      const incomingLogs = message.logs;
      if (incomingLogs && incomingLogs.length > 0) {
        for (let i = incomingLogs.length - 1; i >= 0; i--) {
          const log = incomingLogs[i].content;
          if (!log) continue;
          const match = log.match(/Click on\s+([a-z0-9]{5,15})-([a-z0-9_.-]+)/i);
          if (match && !isTechnicalTerm(match[1]) && !isTechnicalTerm(match[2])) {
            step.session = match[1];
            step.field = match[2];
            found = true;
            break;
          }
        }
      }

      if (!found && message.elementText && !isTechnicalTerm(message.elementText)) {
        const match = message.elementText.match(combinedRegex);
        if (match) {
          step.session = match[1];
          step.field = match[2];
          found = true;
        } else {
          const sMatch = message.elementText.match(sessionRegex);
          const fMatch = message.elementText.match(fieldRegex);
          if (sMatch) step.session = sMatch[1];
          if (fMatch) step.field = fMatch[1];
          if (step.session && step.field) found = true;
        }
      }

      if (found || (step.session && step.field)) {
        if (step.field && step.field.includes('-')) {
          step.field = step.field.split('-')[0];
        }
      }

      if (!activeSession.steps) activeSession.steps = [];
      activeSession.steps.push(step);

      await EzImageStore.offloadSessionImages(activeSession);

      try {
        await chrome.storage.local.set({
          activeSession: activeSession,
          sessionRecordingState: {
            isActive: !!activeSession.isActive,
            isPaused: !!activeSession.isPaused,
            count: activeSession.steps.length
          }
        });
        if (sender?.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'sessionSaved',
            count: activeSession.steps.length
          }).catch(e => console.warn('[BG] Could not send sessionSaved message:', e));
        }
      } catch (storageError) {
        console.error('[BG] Storage Error:', storageError);
        if (sender?.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'sessionError',
            message: 'Speicher voll!'
          }).catch(e => console.warn('[BG] Could not send sessionError message:', e));
        }
      }

      if (cfg.copyOnClick) return;
    }

    if (cfg.recording && !cfg.copyOnClick && sender?.tab?.id) {
      const responseData = {
        type: "screenshotReady",
        image: imageDataUrl,
        preset: cfg.preset ?? "red-circle",
        autosave: cfg.autosave ?? false,
        meta,
        style: {
          number: cfg.markerNumber ?? 1,
          text: cfg.markerText ?? "",
          color: cfg.lineColor ?? "#ff0000",
          width: cfg.lineWidth ?? 6
        },
        arrowSettings: {
          angle: cfg.arrowAngle ?? "45",
          length: cfg.arrowLength ?? "medium",
          double: cfg.doubleArrow ?? false
        }
      };

      chrome.tabs.sendMessage(sender.tab.id, responseData).catch(e => console.warn('[BG] Could not send screenshotReady message:', e));
    }

  } catch (e) {
    console.error('[BG] Unerwarteter Fehler im handleMessage:', e);
  }
}

async function cropImageToBlob(dataUrl, clickX, clickY, dpr) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imgBitmap = await createImageBitmap(blob);

    const cropWidth = Math.min(1000, imgBitmap.width);
    const cropHeight = Math.min(700, imgBitmap.height);

    const canvas = new OffscreenCanvas(cropWidth, cropHeight);
    const ctx = canvas.getContext('2d');

    let sourceX = (clickX * dpr) - (cropWidth / 2);
    let sourceY = (clickY * dpr) - (cropHeight / 2);

    sourceX = Math.max(0, Math.min(imgBitmap.width - cropWidth, sourceX));
    sourceY = Math.max(0, Math.min(imgBitmap.height - cropHeight, sourceY));

    ctx.drawImage(imgBitmap, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    imgBitmap.close();

    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } catch (e) {
    console.error('[BG] Crop Error:', e);
    return null;
  }
}

async function syncSuiteConfigFromFile() {
  const defaultCfg = { notes: true, tracker: true, clip: true, snippetz: true };
  try {
    const resp = await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' });
    if (!resp.ok) return defaultCfg;
    const raw = await resp.json();
    const src = (raw && typeof raw.enabledTools === 'object' && !Array.isArray(raw.enabledTools))
      ? raw.enabledTools
      : raw;
    let resolved = defaultCfg;
    if (raw && Array.isArray(raw.enabledTools)) {
      const lower = raw.enabledTools.map(x => String(x).toLowerCase());
      resolved = {
        notes: lower.includes('eznotes') || lower.includes('notes'),
        tracker: lower.includes('eztimetracker') || lower.includes('tracker'),
        clip: lower.includes('ezclip') || lower.includes('clip'),
        snippetz: lower.includes('ezsnippetz') || lower.includes('snippetz')
      };
    } else if (src) {
      resolved = {
        notes: (src.eZNotes ?? src.notes ?? true) !== false,
        tracker: (src.eZTimeTracker ?? src.tracker ?? true) !== false,
        clip: (src.eZClip ?? src.clip ?? true) !== false,
        snippetz: (src.eZSnippetZ ?? src.snippetz ?? true) !== false
      };
    }
    await chrome.storage.local.set({ ezSuiteConfig: resolved });
    return resolved;
  } catch (e) {
    return defaultCfg;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await syncSuiteConfigFromFile();
  buildSnippetzContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncSuiteConfigFromFile();
  buildSnippetzContextMenu();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.ezSnippetzData || changes.ezSuiteConfig)) {
    buildSnippetzContextMenu();
  }
});

function buildSnippetzContextMenu() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.storage.local.get(['ezSnippetzData', 'ezSuiteConfig'], (result) => {
      if (result.ezSuiteConfig && result.ezSuiteConfig.snippetz === false) return;
      const snippets = (result.ezSnippetzData || []).filter(s => !s.isDeleted);
      if (snippets.length === 0) return;

      chrome.contextMenus.create({
        id: 'ezsnippetz-root',
        title: 'eZSnippetZ einfügen',
        contexts: ['editable']
      });

      const categories = [...new Set(snippets.map(s => s._path && s._path !== 'Root' ? s._path : (s.category || 'Allgemein')))].sort();

      categories.slice(0, 20).forEach((cat, cIdx) => {
        const catId = `ezsnip-cat-${cIdx}`;
        chrome.contextMenus.create({
          id: catId,
          parentId: 'ezsnippetz-root',
          title: cat,
          contexts: ['editable']
        });

        const catSnippets = snippets.filter(s => (s._path && s._path !== 'Root' ? s._path : (s.category || 'Allgemein')) === cat);
        catSnippets.slice(0, 30).forEach(snippet => {
          chrome.contextMenus.create({
            id: `ezsnip-item-${snippet.id}`,
            parentId: catId,
            title: snippet.title,
            contexts: ['editable']
          });
        });
      });
    });
  });
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId && info.menuItemId.startsWith('ezsnip-item-')) {
      const snippetId = info.menuItemId.replace('ezsnip-item-', '');
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'insertEzSnippetById',
          id: snippetId
        }).catch(err => console.warn('[BG] Content script message error:', err));
      }
    }
  });
}
