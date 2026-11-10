(function () {
  let overlayOpen = false;
  let enabled = false;
  let copyOnClickEnabled = false;
  let devModeEnabled = false;
  let sessionActive = false;

  let capturedLogs = [];

  let logUpdateResolver = null;

  function requestLogsUpdate() {
    return new Promise((resolve) => {
      logUpdateResolver = resolve;
      window.dispatchEvent(new CustomEvent('GET_EZ_LOGS_REQ'));

      setTimeout(() => {
        if (logUpdateResolver === resolve) {
          logUpdateResolver = null;
          resolve();
        }
      }, 200);
    });
  }

  window.addEventListener('EZ_LOGS_RESPONSE_EV', (event) => {
    if (event.detail) {
      capturedLogs = event.detail;
      console.log('[EzNotes] Logs empfangen:', capturedLogs.length);
    }
    if (logUpdateResolver) {
      logUpdateResolver();
      logUpdateResolver = null;
    }
  });

  chrome.storage.sync.get(["recording", "copyOnClick", "devMode"], (cfg) => {
    enabled = cfg.recording ?? false;
    copyOnClickEnabled = cfg.copyOnClick ?? false;
    devModeEnabled = cfg.devMode ?? false;
  });

  chrome.storage.local.get(["sessionRecordingState", "activeSession"], (res) => {
    if (res.sessionRecordingState) {
      sessionActive = !!(res.sessionRecordingState.isActive && !res.sessionRecordingState.isPaused);
    } else {
      sessionActive = !!(res.activeSession?.isActive && !res.activeSession?.isPaused);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.recording) enabled = changes.recording.newValue;
      if (changes.copyOnClick) copyOnClickEnabled = changes.copyOnClick.newValue;
      if (changes.devMode) devModeEnabled = changes.devMode.newValue;
    }
    if (area === 'local') {
      if (changes.sessionRecordingState) {
        const state = changes.sessionRecordingState.newValue;
        sessionActive = !!(state && state.isActive && !state.isPaused);
      } else if (changes.activeSession) {
        const sess = changes.activeSession.newValue;
        sessionActive = !!(sess && sess.isActive && !sess.isPaused);
      }
    }
  });

  let hideWidgetsTimeout = null;

  function hideFloatingUiForCapture(durationMs = 450) {
    if (window === window.top) {
      document.querySelectorAll('.ez-feedback').forEach(el => el.remove());
      const recPill = document.getElementById('ez-rec-pill');
      const timerWidget = document.getElementById('ez-timer-widget');
      if (recPill) recPill.style.visibility = 'hidden';
      if (timerWidget) timerWidget.style.visibility = 'hidden';
      if (hideWidgetsTimeout) clearTimeout(hideWidgetsTimeout);
      hideWidgetsTimeout = setTimeout(() => {
        if (recPill) recPill.style.visibility = '';
        if (timerWidget) timerWidget.style.visibility = '';
        hideWidgetsTimeout = null;
      }, durationMs);
    } else {
      try {
        window.top.postMessage({ type: 'EZ_HIDE_UI_FOR_CAPTURE', durationMs }, '*');
      } catch (e) {}
    }
  }

  function restoreFloatingUiAfterCapture() {
    if (window === window.top) {
      if (hideWidgetsTimeout) {
        clearTimeout(hideWidgetsTimeout);
        hideWidgetsTimeout = null;
      }
      const recPill = document.getElementById('ez-rec-pill');
      const timerWidget = document.getElementById('ez-timer-widget');
      if (recPill) recPill.style.visibility = '';
      if (timerWidget) timerWidget.style.visibility = '';
    }
  }

  window.addEventListener('click', async (ev) => {
    if (!enabled && !copyOnClickEnabled && !devModeEnabled && !sessionActive) return;
    if (overlayOpen) return;
    if (ev.target && ev.target.closest && ev.target.closest('#ez-rec-pill, #ez-timer-widget')) return;

    document.querySelectorAll('.ez-feedback').forEach(el => el.remove());
    hideFloatingUiForCapture(500);

    const target = ev.target.closest('button, a, input, select, [role="button"]') || ev.target;
    const targetRect = target.getBoundingClientRect();

    const click = {
      type: 'capture',
      clientX: ev.clientX,
      clientY: ev.clientY,
      targetRect: {
        x: targetRect.left,
        y: targetRect.top,
        width: targetRect.width,
        height: targetRect.height
      },
      devicePixelRatio: window.devicePixelRatio || 1,
      hostname: location.hostname,
      title: document.title,
      timestamp: Date.now(),
      elementText: extractElementText(target),
      selector: getCssSelector(target)
    };

    window.__lastClickTemp = click;

    setTimeout(async () => {

      const refreshedRect = target.getBoundingClientRect();
      click.targetRect = {
        x: refreshedRect.left,
        y: refreshedRect.top,
        width: refreshedRect.width,
        height: refreshedRect.height
      };

      await requestLogsUpdate();

      click.logs = Array.isArray(capturedLogs) ? capturedLogs.slice(-25) : [];

      if (devModeEnabled) {
        handleDevModePopup(click);
      }

      if (enabled || copyOnClickEnabled || sessionActive) {
        bubbleCoordinateRequest(click);
      }
    }, 150);
  }, true);

  function handleDevModePopup(click) {
    const combinedRegex = /([a-z0-9]{5,15})-([a-z0-9_.-]{3,})/i;
    const sessionRegex = /([a-z]{2,6}\d{4,}[a-z]\d{2,})/i;
    const fieldRegex = /([a-z]{2,6}\d{3,}\.[a-z0-9_.-]{1,})/i;

    let session = "";
    let field = "";
    let found = false;

    if (click.logs && click.logs.length > 0) {
      for (let i = click.logs.length - 1; i >= 0; i--) {
        const log = click.logs[i].content;
        const match = log.match(/Click on\s+([a-z0-9]{5,15})-([a-z0-9_.-]+)/i);
        if (match) {
          session = match[1];
          field = match[2];
          found = true;
          break;
        }
      }
    }

    if (!found && click.elementText) {
      const match = click.elementText.match(combinedRegex);
      if (match) {
        session = match[1];
        field = match[2];
        found = true;
      } else {
        const sMatch = click.elementText.match(sessionRegex);
        const fMatch = click.elementText.match(fieldRegex);
        if (sMatch) session = sMatch[1];
        if (fMatch) field = fMatch[1];
        if (session && field) found = true;
      }
    }

    if (found || (session && field)) {

      if (field.includes('-n')) field = field.split('-n')[0];

      const message = `🛠️ [DEV MODE]\nSession: ${session}\nFeld: ${field}`;
      showHotkeyFeedback(message, false, 5000);
    }
  }

  function bubbleCoordinateRequest(clickData) {
    if (window === window.top) {

      chrome.runtime.sendMessage(clickData);
    } else {
      window.parent.postMessage({
        type: 'EZ_ADD_OFFSET_REQ',
        clickData: clickData
      }, '*');
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'EZ_HIDE_UI_FOR_CAPTURE') {
      if (window === window.top) {
        hideFloatingUiForCapture(event.data.durationMs || 500);
      }
      return;
    }
    if (event.data && event.data.type === 'EZ_ADD_OFFSET_REQ') {
      const clickData = event.data.clickData;

      const frames = document.querySelectorAll('iframe, frame');
      let sourceFrame = null;
      for (let f of frames) {
        if (f.contentWindow === event.source) {
          sourceFrame = f;
          break;
        }
      }

      if (sourceFrame) {
        const rect = sourceFrame.getBoundingClientRect();

        clickData.clientX += rect.left;
        clickData.clientY += rect.top;
        clickData.targetRect.x += rect.left;
        clickData.targetRect.y += rect.top;

        bubbleCoordinateRequest(clickData);
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'screenshotReady') {
      showOverlay(msg.image, msg.preset, msg.meta.devicePixelRatio, msg.style, msg.autosave, msg.arrowSettings);
    } else if (msg.type === 'copyToClipboard') {
      processCopyToClipboard(msg.image, msg.preset, msg.meta.devicePixelRatio, msg.style, msg.arrowSettings);
    } else if (msg.type === 'copyScreenshot') {
      handleCopyScreenshot();
    } else if (msg.type === 'triggerDownload') {
      handleTriggerDownload();
    } else if (msg.type === 'sessionSaved') {

      if (window === window.top) {
        restoreFloatingUiAfterCapture();
        const pill = document.getElementById('ez-rec-pill');
        if (pill) {
          pill.style.borderColor = '#10b981';
          pill.style.boxShadow = '0 0 18px rgba(16, 185, 129, 0.65), 0 10px 30px rgba(0, 0, 0, 0.28)';
          setTimeout(() => {
            if (pill) {
              pill.style.borderColor = 'rgba(255, 255, 255, 0.16)';
              pill.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.28)';
            }
          }, 350);
        }
      }
    } else if (msg.type === 'sessionError') {
      showHotkeyFeedback(`❌ ${msg.message}`, true, 5000);
    } else if (msg.type === 'PLAY_STEP') {
      console.log('[eZNotes] PLAY_STEP erhalten');
      handlePlayStep(msg.selector, msg.elementText, msg.value);
    } else if (msg.type === 'START_LIVE_VIEW') {
      console.log('[eZNotes] START_LIVE_VIEW erhalten');
      startLiveView(msg.steps);
    } else if (msg.type === 'LIVE_VIEW_SYNC') {

      if (Array.isArray(msg.steps)) {
        liveViewSteps = msg.steps;
      }
      currentLiveViewIndex = msg.index || 0;
      updateLiveViewUI(true);
    } else if (msg.type === 'LIVE_VIEW_CLOSE') {
      stopLiveView();
    }
  });

  function relayToAllFrames(type, data) {
    chrome.runtime.sendMessage({
      type: 'RELAY_TO_TAB',
      data: { type, ...data }
    });
  }

  function handlePlayStep(selector, expectedText, value) {
    let el = document.querySelector(selector);

    if (!el && selector.includes(':') && !selector.includes('\\:')) {
      try {
        const escapedSelector = selector.replace(/:/g, '\\:');
        el = document.querySelector(escapedSelector);
      } catch (e) { }
    }

    if (!el) {

      console.log('[eZNotes] Element in diesem Frame nicht gefunden:', selector);
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      flashClick(rect.left + rect.width / 2, rect.top + rect.height / 2);

      if (value && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        simulateRpaClick(el);
        setTimeout(() => {
          if (el.isContentEditable) {
            el.innerText = value;
          } else {
            el.value = value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          showHotkeyFeedback(`✍️ Text eingefügt: "${value}"`, false);
        }, 100);
      } else {
        simulateRpaClick(el);
        showHotkeyFeedback(`▶️ Klick auf "${expectedText || 'Element'}"`, false);
      }
    }, 600);
  }

  function getCssSelector(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {

        selector += '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      } else {
        let sib = current, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() == selector) nth++;
        }
        if (nth != 1) selector += ":nth-of-type(" + nth + ")";
      }
      path.unshift(selector);
      current = current.parentNode;
    }
    return path.join(" > ");
  }

  function simulateRpaClick(el) {
    el.focus();

    const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    eventTypes.forEach(type => {
      const isPointer = type.startsWith('pointer');
      const EventClass = isPointer ? window.PointerEvent : window.MouseEvent;

      const ev = new EventClass(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: 1,
        pointerId: 1,
        isPrimary: true
      });
      el.dispatchEvent(ev);
    });
  }

  function flashClick(x, y) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      left: x + 'px',
      top: y + 'px',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      background: 'rgba(0,150,255,0.6)',
      transform: 'translate(-50%,-50%)',
      zIndex: 2147483646,
      pointerEvents: 'none',
      opacity: '1',
      transition: 'opacity 300ms ease-out'
    });
    document.body.appendChild(el);
    setTimeout(() => (el.style.opacity = '0'), 50);
    setTimeout(() => el.remove(), 350);
  }

  async function handleCopyScreenshot() {
    console.log('[Hotkey] Copy Screenshot gestartet');
    try {

      const cfg = await chrome.storage.sync.get([
        "preset", "lineColor", "lineWidth", "markerNumber", "markerText"
      ]);

      chrome.runtime.sendMessage({ type: 'requestCapture' }, async (response) => {
        if (!response || !response.imageDataUrl) {
          throw new Error('Screenshot-Erfassung fehlgeschlagen');
        }

        const imageDataUrl = response.imageDataUrl;

        const canvas = document.createElement('canvas');
        const img = new Image();

        img.onload = async () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');

          ctx.drawImage(img, 0, 0);

          const pos = window.__lastClickTemp;
          if (pos) {
            const x = Math.round(pos.clientX * (window.devicePixelRatio || 1));
            const y = Math.round(pos.clientY * (window.devicePixelRatio || 1));

            const style = {
              color: cfg.lineColor || '#ff0000',
              width: cfg.lineWidth || 6,
              number: cfg.markerNumber || 1,
              text: cfg.markerText || 'Hinweis'
            };

            window.DrawingUtils.drawPreset(ctx, x, y, cfg.preset || 'yellow-ring', style, {});
          }

          try {
            canvas.toBlob(async (blob) => {
              if (blob) {
                const data = [new ClipboardItem({ 'image/png': blob })];
                await navigator.clipboard.write(data);
                console.log('[Copy] Screenshot erfolgreich in Zwischenablage kopiert');
                showHotkeyFeedback('📋 Screenshot kopiert!', false);
              }
            }, 'image/png', 1.0);
          } catch (clipboardError) {
            console.error('[Copy] Clipboard-Fehler:', clipboardError);
            showHotkeyFeedback('❌ Clipboard-Zugriff verweigert!', true);
          }
        };

        img.onerror = () => {
          console.error('[Copy] Bildladen fehlgeschlagen');
        };

        img.src = imageDataUrl;
      });

    } catch (error) {
      console.error('[Copy] Screenshot kopieren fehlgeschlagen:', error);
      showHotkeyFeedback('❌ Copy fehlgeschlagen!', true);
      throw error;
    }
  }

  async function handleTriggerDownload() {
    console.log('[Hotkey] Trigger Download gestartet');
    try {

      const downloadBtn = document.querySelector('.screenshot-overlay button[title*="Download"]');
      if (downloadBtn) {
        downloadBtn.click();
        console.log('[Hotkey] Download-Button geklickt');
      } else {

        console.log('[Hotkey] Kein Overlay gefunden, erstelle neuen Screenshot');
        showHotkeyFeedback('💾 Erstelle Screenshot...', false, 1500);

        const click = {
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight / 2,
          devicePixelRatio: window.devicePixelRatio || 1,
          type: 'capture',
          hostname: location.hostname,
          title: document.title,
          timestamp: Date.now()
        };

        window.__lastClickTemp = click;
        chrome.runtime.sendMessage(click);
      }

    } catch (error) {
      console.error('[Hotkey] Download trigger fehlgeschlagen:', error);
      showHotkeyFeedback('❌ Download fehlgeschlagen!', true);
      throw error;
    }
  }

  function showHotkeyFeedback(message, isError = false, duration = 800) {

    document.querySelectorAll('.ez-feedback').forEach(el => el.remove());

    const feedback = document.createElement('div');
    feedback.className = 'ez-feedback';
    feedback.textContent = message;
    Object.assign(feedback.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: isError ? '#ef4444' : '#10b981',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '500',
      zIndex: '2147483647',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      transition: 'all 0.3s ease',
      pointerEvents: 'none',
      opacity: '1',
      whiteSpace: 'pre-wrap'
    });

    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.style.opacity = '0';
      feedback.style.transform = 'translateY(-10px)';
      setTimeout(() => feedback.remove(), 200);
    }, duration);
  }

  async function processCopyToClipboard(dataUrl, preset, dpr, style, arrowSettings) {
    console.log('[CopyOnClick] Verarbeite Screenshot für Zwischenablage');

    const canvas = document.createElement('canvas');
    const img = new Image();

    img.onload = async () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const pos = window.__lastClickTemp;
      if (pos) {
        const x = Math.round(pos.clientX * dpr);
        const y = Math.round(pos.clientY * dpr);

        window.DrawingUtils.drawPreset(ctx, x, y, preset, style, arrowSettings);
      }

      try {
        canvas.toBlob(async (blob) => {
          if (blob) {
            const data = [new ClipboardItem({ 'image/png': blob })];
            await navigator.clipboard.write(data);
            console.log('[CopyOnClick] Screenshot erfolgreich kopiert');
            showHotkeyFeedback('📋 Kopiert!', false, 1500);
          }
        }, 'image/png', 1.0);
      } catch (err) {
        console.error('[CopyOnClick] Fehler beim Kopieren:', err);
      }
    };
    img.src = dataUrl;
  }

  function showOverlay(dataUrl, preset, dpr, style, autosave, arrowSettings) {

    if (overlayOpen) {
      const existingOverlay = document.querySelector('.screenshot-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }
      overlayOpen = false;

      setTimeout(() => {
        proceedWithOverlay(dataUrl, preset, dpr, style, autosave, arrowSettings);
      }, 100);
    } else {
      proceedWithOverlay(dataUrl, preset, dpr, style, autosave, arrowSettings);
    }
  }

  function proceedWithOverlay(dataUrl, preset, dpr, style, autosave, arrowSettings) {
    overlayOpen = true;

    if (autosave) {
      processAutosaveScreenshot(dataUrl, preset, dpr, style);
      return;
    }

    const btnClose = document.createElement('button');
    btnClose.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6L18 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    Object.assign(btnClose.style, {
      background: 'transparent',
      border: 'none',
      padding: '4px',
      borderRadius: '50%',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      transition: 'background 0.2s ease'
    });

    btnClose.onmouseover = () => btnClose.style.background = 'rgba(255,255,255,0.2)';
    btnClose.onmouseout = () => btnClose.style.background = 'transparent';

    btnClose.onclick = () => {
      overlay.remove();
      overlayOpen = false;
    };

    const escapeHandler = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        btnClose.click();
      }
    };
    document.addEventListener('keydown', escapeHandler);

    const overlay = document.createElement('div');
    overlay.className = 'screenshot-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: 2147483647,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    });

    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'relative',
      background: '#fff',
      borderRadius: '6px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
    });

    const canvas = document.createElement('canvas');
    const img = new Image();

    img.onload = () => {
      console.log('[Overlay] Bild geladen, Dimensionen:', img.naturalWidth, 'x', img.naturalHeight);

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const pos = window.__lastClickTemp;
      const x = Math.round(pos.clientX * dpr);
      const y = Math.round(pos.clientY * dpr);

      window.DrawingUtils.drawPreset(ctx, x, y, preset, style, arrowSettings);

      container.appendChild(canvas);
    };

    img.onerror = () => {
      console.error('[Overlay] Fehler beim Laden des Screenshot-Bildes');
    };

    img.src = dataUrl;

    const controls = document.createElement('div');
    Object.assign(controls.style, {
      position: 'absolute',
      right: '12px',
      top: '12px',
      display: 'flex',
      gap: '8px',
      background: 'rgba(0,0,0,0.7)',
      padding: '8px',
      borderRadius: '20px',
      backdropFilter: 'blur(10px)'
    });

    const btnDL = document.createElement('button');
    btnDL.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 10L12 15L17 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 15V3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    Object.assign(btnDL.style, {
      background: 'transparent',
      border: 'none',
      padding: '4px',
      borderRadius: '50%',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      transition: 'background 0.2s ease'
    });

    btnDL.onmouseover = () => btnDL.style.background = 'rgba(255,255,255,0.2)';
    btnDL.onmouseout = () => btnDL.style.background = 'transparent';

    btnDL.onclick = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        console.error('[Download] Canvas noch nicht gerendert!');
        return;
      }

      const safeTitle = document.title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').slice(0, 60);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `clickshot-${location.hostname}-${safeTitle}-${timestamp}.png`;

      try {
        const dataURL = canvas.toDataURL('image/png', 1.0);
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = filename;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (error) {
        console.error('[Download] Fehler beim Erstellen des Downloads:', error);
      }
    };

    controls.appendChild(btnDL);
    controls.appendChild(btnClose);
    container.appendChild(controls);
    container.appendChild(canvas);
    overlay.appendChild(container);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        overlayOpen = false;
      }
    });

    document.body.appendChild(overlay);
  }

  async function processAutosaveScreenshot(dataUrl, preset, dpr, style) {
    console.log('[Autosave] Verarbeite Screenshot ohne Overlay-Anzeige');

    overlayOpen = false;

    const canvas = document.createElement('canvas');
    const img = new Image();

    img.onload = async () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const pos = window.__lastClickTemp;
      const x = Math.round(pos.clientX * dpr);
      const y = Math.round(pos.clientY * dpr);

      window.DrawingUtils.drawPreset(ctx, x, y, preset, style, {});

      const screenshotNumber = await getNextScreenshotNumber();
      const filename = `${screenshotNumber}-${location.hostname}.png`;

      try {
        const dataURL = canvas.toDataURL('image/png', 1.0);

        chrome.runtime.sendMessage({
          type: 'autosave',
          dataUrl: dataURL,
          filename: filename,
          hostname: location.hostname,
          title: document.title
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Autosave] Fehler beim Senden an Background:', chrome.runtime.lastError);
          }
        });

      } catch (error) {
        console.error('[Autosave] Fehler beim Erstellen des Screenshots:', error);
      }
    };

    img.onerror = () => {
      console.error('[Autosave] Fehler beim Laden des Screenshot-Bildes');
    };

    img.src = dataUrl;
  }

  function getNextScreenshotNumber() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['screenshotCounter'], (result) => {
        const current = result.screenshotCounter || 0;
        const next = current + 1;

        chrome.storage.sync.set({ screenshotCounter: next });

        resolve(next);
      });
    });
  }

  function extractElementText(el) {
    if (!el) return '';

    let labelText = '';

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) labelText = label.innerText || label.textContent;
    }

    if (!labelText && el.id && el.id.includes('-')) {
      const labelEl = document.getElementById(el.id + '-label');
      if (labelEl) labelText = labelEl.innerText || labelEl.textContent;
    }

    if (!labelText && el.labels && el.labels.length > 0) {
      labelText = el.labels[0].innerText || el.labels[0].textContent;
    }

    if (labelText) {
      labelText = labelText.trim().replace(/:$/, '');
      if (labelText) return labelText;
    }

    if (el.tagName === 'INPUT') {
      if (el.type === 'submit' || el.type === 'button') return el.value;
      if (el.placeholder) return el.placeholder;
      if (el.name && !el.name.includes('#')) return el.name;
    }

    const aria = el.getAttribute('aria-label');
    if (aria) return aria;

    let text = el.innerText || el.textContent || '';
    text = text.trim().split('\n')[0];

    if (text.includes('#') || text.includes('.') || (text.includes('-') && text.length > 20)) {
      return 'Element';
    }

    if (text.length > 50) text = text.substring(0, 47) + '...';
    return text;
  }

  let liveViewSteps = [];
  let currentLiveViewIndex = 0;
  let liveViewOverlayEl = null;
  let liveViewHighlightEl = null;

  let activeScrollListener = null;

  function startLiveView(steps) {
    if (!steps || steps.length === 0) return;

    liveViewSteps = steps.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      selector: s.selector,
      value: s.value
    }));
    currentLiveViewIndex = 0;

    if (window === window.top) {
      renderLiveViewUI();

      relayToAllFrames('LIVE_VIEW_SYNC', {
        index: currentLiveViewIndex,
        steps: liveViewSteps
      });
    }

    updateLiveViewUI();
  }

  function renderLiveViewUI() {
    if (liveViewOverlayEl) liveViewOverlayEl.remove();

    liveViewOverlayEl = document.createElement('div');
    liveViewOverlayEl.className = 'ez-rpa-live-view';
    Object.assign(liveViewOverlayEl.style, {
      position: 'fixed',
      bottom: '30px',
      right: '30px',
      width: '320px',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 10px 40px rgba(15,23,42,0.15)',
      zIndex: '2147483647',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid rgba(15,23,42,0.08)'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      background: '#f8fafc',
      color: '#0f172a',
      padding: '14px 18px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontWeight: '700',
      fontSize: '12px',
      borderBottom: '1px solid #e2e8f0',
      letterSpacing: '0.05em',
      textTransform: 'uppercase'
    });
    header.innerHTML = `
      <span>Live-Vorschau</span>
      <span id="ez-rpa-counter" style="background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;"></span>
    `;

    const body = document.createElement('div');
    Object.assign(body.style, {
      padding: '18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });
    body.innerHTML = `
      <div id="ez-rpa-title" style="font-weight: 700; font-size: 15px; color: #0f172a; line-height: 1.4;"></div>
      <div id="ez-rpa-desc" style="font-size: 13px; color: #64748b; min-height: 40px; margin-top: 4px; line-height: 1.5; white-space: pre-wrap;"></div>
    `;

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      padding: '14px 18px',
      background: '#f8fafc',
      borderTop: '1px solid #e2e8f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    });

    const btnStyle = "padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 12px; cursor: pointer; font-weight: 600; transition: all 0.2s; font-family: inherit;";

    footer.innerHTML = `
      <div style="display: flex; gap: 8px;">
        <button id="ez-rpa-prev" style="${btnStyle} background: white; color: #334155;">Zurück</button>
        <button id="ez-rpa-next" style="${btnStyle} background: #4f46e5; border-color: #4f46e5; color: white;">Weiter</button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button id="ez-rpa-play" style="${btnStyle} background: #10b981; border-color: #10b981; color: white; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;" title="Aktion ausführen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button id="ez-rpa-close" style="${btnStyle} background: transparent; border: none; color: #94a3b8; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 18px;" title="Schließen">✕</button>
      </div>
    `;

    liveViewOverlayEl.appendChild(header);
    liveViewOverlayEl.appendChild(body);
    liveViewOverlayEl.appendChild(footer);

    document.body.appendChild(liveViewOverlayEl);

    document.getElementById('ez-rpa-prev').onclick = () => {
      if (currentLiveViewIndex > 0) {
        currentLiveViewIndex--;
        syncLiveViewAcrossFrames();
      }
    };

    document.getElementById('ez-rpa-next').onclick = () => {
      if (currentLiveViewIndex < liveViewSteps.length - 1) {
        currentLiveViewIndex++;
        syncLiveViewAcrossFrames();
      }
    };

    document.getElementById('ez-rpa-play').onclick = () => {
      const step = liveViewSteps[currentLiveViewIndex];

      relayToAllFrames('PLAY_STEP', {
        selector: step.selector,
        elementText: step.title,
        value: step.value
      });
    };

    document.getElementById('ez-rpa-close').onclick = () => {
      relayToAllFrames('LIVE_VIEW_CLOSE', {});
      stopLiveView();
    };
  }

  function syncLiveViewAcrossFrames() {
    updateLiveViewUI();
    relayToAllFrames('LIVE_VIEW_SYNC', {
      index: currentLiveViewIndex,
      steps: liveViewSteps
    });
  }

  function updateLiveViewUI(silent = false) {
    if (window === window.top && liveViewOverlayEl) {
      const step = liveViewSteps[currentLiveViewIndex];
      document.getElementById('ez-rpa-counter').textContent = `${currentLiveViewIndex + 1} / ${liveViewSteps.length}`;
      document.getElementById('ez-rpa-title').textContent = step.title || 'Schritt';

      document.getElementById('ez-rpa-desc').textContent = step.description || 'Keine Beschreibung vorhanden.';

      document.getElementById('ez-rpa-prev').style.opacity = currentLiveViewIndex === 0 ? '0.4' : '1';
      document.getElementById('ez-rpa-prev').disabled = currentLiveViewIndex === 0;
      document.getElementById('ez-rpa-next').style.opacity = currentLiveViewIndex === liveViewSteps.length - 1 ? '0.4' : '1';
      document.getElementById('ez-rpa-next').disabled = currentLiveViewIndex === liveViewSteps.length - 1;
    }

    const step = liveViewSteps[currentLiveViewIndex];
    if (step) {
      highlightTargetElement(step.selector);
    }
  }

  function highlightTargetElement(selector, retryCount = 0) {

    if (liveViewHighlightEl) {
      liveViewHighlightEl.remove();
      liveViewHighlightEl = null;
    }
    if (activeScrollListener) {
      window.removeEventListener('scroll', activeScrollListener, { capture: true });
      activeScrollListener = null;
    }

    if (!selector) return;

    let el = document.querySelector(selector);
    if (!el && selector.includes(':') && !selector.includes('\\:')) {
      try { el = document.querySelector(selector.replace(/:/g, '\\:')); } catch (e) { }
    }

    if (!el) {
      if (retryCount < 10) {
        setTimeout(() => highlightTargetElement(selector, retryCount + 1), 200);
      }
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const rect = el.getBoundingClientRect();
    liveViewHighlightEl = document.createElement('div');
    Object.assign(liveViewHighlightEl.style, {
      position: 'fixed',
      boxSizing: 'border-box',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      border: '3px solid #4f46e5',
      borderRadius: '6px',
      backgroundColor: 'rgba(79, 70, 229, 0.08)',
      pointerEvents: 'auto',
      cursor: 'pointer',
      zIndex: '2147483646',
      transition: 'all 0.15s ease',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.15)'
    });

    activeScrollListener = () => {
      const currentEl = document.querySelector(selector);
      if (currentEl && liveViewHighlightEl) {
        const currentRect = currentEl.getBoundingClientRect();
        Object.assign(liveViewHighlightEl.style, {
          top: currentRect.top + 'px',
          left: currentRect.left + 'px',
          width: currentRect.width + 'px',
          height: currentRect.height + 'px'
        });
      }
    };
    window.addEventListener('scroll', activeScrollListener, { capture: true, passive: true });

    liveViewHighlightEl.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();

      const currentStepObj = liveViewSteps[currentLiveViewIndex];
      handlePlayStep(currentStepObj.selector, currentStepObj.title, currentStepObj.value);

      setTimeout(() => {
        if (currentLiveViewIndex < liveViewSteps.length - 1) {
          currentLiveViewIndex++;
          syncLiveViewAcrossFrames();
        } else {
          relayToAllFrames('LIVE_VIEW_CLOSE', {});
          stopLiveView();
        }
      }, 500);
    };

    document.body.appendChild(liveViewHighlightEl);
  }

  function stopLiveView() {
    if (liveViewOverlayEl) liveViewOverlayEl.remove();
    if (liveViewHighlightEl) liveViewHighlightEl.remove();
    if (activeScrollListener) {
      window.removeEventListener('scroll', activeScrollListener, { capture: true });
    }
    liveViewOverlayEl = null;
    liveViewHighlightEl = null;
    activeScrollListener = null;
    liveViewSteps = [];
  }

  if (window === window.top) {
    let widgetEl = null;
    let widgetInterval = null;
    let ttActive = false;
    let ttStart = 0;
    let ttSettings = {};
    let ttCurrentData = {};
    let ttWidgetPos = { x: 24, y: 24 };

    function initWidgetState() {
        chrome.storage.local.get(['ttSettings', 'ttActive', 'ttStart', 'ttCurrentData', 'ttWidgetPos'], (data) => {
            ttSettings = data.ttSettings || {};
            ttActive = data.ttActive || false;
            ttStart = data.ttStart || 0;
            ttCurrentData = data.ttCurrentData || {};
            ttWidgetPos = data.ttWidgetPos || { x: 24, y: 24 };
            updateWidgetVisibility();
        });
    }

    function formatDurationWidget(seconds) {
      const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
      const s = Math.floor((seconds % 60)).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    }

    function renderWidget() {
        if (!document.body) return;
        if (!widgetEl) {
            widgetEl = document.createElement('div');
            widgetEl.id = 'ez-timer-widget';

            Object.assign(widgetEl.style, {
                position: 'fixed',
                bottom: ttWidgetPos.y + 'px',
                left: ttWidgetPos.x + 'px',
                zIndex: '2147483647',
                background: 'rgba(15, 23, 42, 0.78)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '50px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#fff',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '14px',
                fontWeight: '500',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                transition: 'all 0.3s ease',
                cursor: 'move',
                userSelect: 'none'
            });

            let isDragging = false;
            let dragStartX, dragStartY;
            let initialLeft, initialBottom;

            widgetEl.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                const rect = widgetEl.getBoundingClientRect();
                initialLeft = rect.left;
                initialBottom = window.innerHeight - rect.bottom;
                widgetEl.style.transition = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;

                let newLeft = initialLeft + dx;
                let newBottom = initialBottom - dy;

                if (newLeft < 0) newLeft = 0;
                if (newBottom < 0) newBottom = 0;
                if (newLeft > window.innerWidth - widgetEl.offsetWidth) newLeft = window.innerWidth - widgetEl.offsetWidth;
                if (newBottom > window.innerHeight - widgetEl.offsetHeight) newBottom = window.innerHeight - widgetEl.offsetHeight;

                widgetEl.style.left = newLeft + 'px';
                widgetEl.style.bottom = newBottom + 'px';
            });

            window.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    widgetEl.style.transition = 'all 0.3s ease';
                    const rect = widgetEl.getBoundingClientRect();
                    ttWidgetPos = { x: rect.left, y: window.innerHeight - rect.bottom };
                    chrome.storage.local.set({ ttWidgetPos });
                }
            });

            const dot = document.createElement('div');
            Object.assign(dot.style, {
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 8px #ef4444'
            });

            try {
                dot.animate([
                    { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)' },
                    { transform: 'scale(1)', boxShadow: '0 0 0 6px rgba(239, 68, 68, 0)' },
                    { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' }
                ], { duration: 1500, iterations: Infinity });
            } catch(e) {}

            const infoWrapper = document.createElement('div');
            Object.assign(infoWrapper.style, {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                lineHeight: '1.2'
            });

            const timeDisp = document.createElement('div');
            timeDisp.id = 'ez-timer-widget-time';
            timeDisp.style.minWidth = '62px';
            timeDisp.style.letterSpacing = '0.5px';
            timeDisp.style.fontWeight = '600';
            timeDisp.style.color = '#ffffff';

            const ticketDisp = document.createElement('div');
            ticketDisp.id = 'ez-timer-widget-ticket';
            ticketDisp.style.color = '#f1f5f9';
            ticketDisp.style.fontSize = '10px';
            ticketDisp.style.maxWidth = '100px';
            ticketDisp.style.overflow = 'hidden';
            ticketDisp.style.textOverflow = 'ellipsis';
            ticketDisp.style.whiteSpace = 'nowrap';

            infoWrapper.appendChild(timeDisp);
            infoWrapper.appendChild(ticketDisp);

            const stopBtn = document.createElement('button');
            stopBtn.innerHTML = '⏹';
            stopBtn.title = 'Timer stoppen';
            Object.assign(stopBtn.style, {
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'color 0.2s',
                marginLeft: '4px'
            });
            stopBtn.onmouseover = () => stopBtn.style.color = '#ef4444';
            stopBtn.onmouseout = () => stopBtn.style.color = '#fff';

            stopBtn.onclick = async (e) => {
                e.stopPropagation();
                chrome.storage.local.get(['ttActive', 'ttStart', 'ttHistory', 'ttCurrentData', 'ttSettings'], (res) => {
                    if (!res.ttActive) return;
                    let elapsed = Math.floor((Date.now() - res.ttStart) / 1000);
                    const rMin = parseInt(res.ttSettings?.rounding || '0', 10);
                    if (rMin > 0 && elapsed > 0) {
                        const rSec = rMin * 60;
                        elapsed = Math.ceil(elapsed / rSec) * rSec;
                    }
                    const curr = res.ttCurrentData || {};
                    const entry = {
                        id: window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(),
                        startTime: res.ttStart,
                        endTime: Date.now(),
                        duration: elapsed,
                        ticket: curr.ticket || '',
                        descShort: curr.descShort || '',
                        tags: curr.tags || '',
                        task: curr.task || '',
                        notes: curr.notes || ''
                    };
                    const hist = res.ttHistory || [];
                    hist.push(entry);
                    hist.sort((a, b) => b.startTime - a.startTime);

                    chrome.storage.local.set({
                        ttActive: false,
                        ttHistory: hist,
                        ttCurrentData: {},
                        ttLastPomodoro: 0
                    });
                });
            };

            widgetEl.appendChild(dot);
            widgetEl.appendChild(infoWrapper);
            widgetEl.appendChild(stopBtn);

            document.body.appendChild(widgetEl);
        }

        const timeEl = document.getElementById('ez-timer-widget-time');
        const ticketEl = document.getElementById('ez-timer-widget-ticket');

        const elapsed = Math.floor((Date.now() - ttStart) / 1000);
        if (timeEl) timeEl.textContent = formatDurationWidget(elapsed);
        if (ticketEl) {
            const tk = (ttCurrentData.ticket || '').trim();
            ticketEl.textContent = tk;
            ticketEl.style.display = tk ? 'block' : 'none';
        }
    }

    function updateWidgetVisibility() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', updateWidgetVisibility, { once: true });
            return;
        }
        if (ttSettings.showWidget && ttActive) {
            if (!widgetInterval) {
                renderWidget();
                widgetInterval = setInterval(renderWidget, 1000);
            }
            if (widgetEl) widgetEl.style.display = 'flex';
        } else {
            if (widgetInterval) {
                clearInterval(widgetInterval);
                widgetInterval = null;
            }
            if (widgetEl) widgetEl.style.display = 'none';
        }
    }

    let recPillEl = null;
    let recState = { isActive: false, isPaused: false, count: 0 };
    let recPillPos = { x: 24, y: 24 };

    function initRecPillState() {
        chrome.storage.local.get(['sessionRecordingState', 'activeSession', 'ezRecPillPos'], (data) => {
            if (data.ezRecPillPos) recPillPos = data.ezRecPillPos;
            if (data.sessionRecordingState) {
                recState = data.sessionRecordingState;
            } else if (data.activeSession) {
                recState = {
                    isActive: !!data.activeSession.isActive,
                    isPaused: !!data.activeSession.isPaused,
                    count: data.activeSession.steps ? data.activeSession.steps.length : 0
                };
            }
            updateRecPillUI();
        });
    }

    function renderRecPill() {
        if (!document.body) return;
        if (!recPillEl) {
            recPillEl = document.createElement('div');
            recPillEl.id = 'ez-rec-pill';

            Object.assign(recPillEl.style, {
                position: 'fixed',
                bottom: recPillPos.y + 'px',
                right: recPillPos.x + 'px',
                zIndex: '2147483647',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(14px)',
                webkitBackdropFilter: 'blur(14px)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: '999px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#ffffff',
                fontFamily: 'system-ui, -apple-system, Inter, sans-serif',
                fontSize: '12px',
                fontWeight: '600',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.28)',
                cursor: 'move',
                userSelect: 'none',
                transition: 'opacity 0.2s ease, transform 0.2s ease'
            });

            let isDragging = false;
            let dragStartX, dragStartY;
            let initialRight, initialBottom;

            recPillEl.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                const rect = recPillEl.getBoundingClientRect();
                initialRight = window.innerWidth - rect.right;
                initialBottom = window.innerHeight - rect.bottom;
                recPillEl.style.transition = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;

                let newRight = initialRight - dx;
                let newBottom = initialBottom - dy;

                newRight = Math.max(8, Math.min(window.innerWidth - recPillEl.offsetWidth - 8, newRight));
                newBottom = Math.max(8, Math.min(window.innerHeight - recPillEl.offsetHeight - 8, newBottom));

                recPillEl.style.right = newRight + 'px';
                recPillEl.style.bottom = newBottom + 'px';
            });

            window.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    recPillEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    const rect = recPillEl.getBoundingClientRect();
                    recPillPos = { x: window.innerWidth - rect.right, y: window.innerHeight - rect.bottom };
                    chrome.storage.local.set({ ezRecPillPos: recPillPos });
                }
            });

            const dot = document.createElement('div');
            dot.id = 'ez-rec-pill-dot';
            Object.assign(dot.style, {
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                flexShrink: '0'
            });

            const label = document.createElement('span');
            label.id = 'ez-rec-pill-label';
            label.style.whiteSpace = 'nowrap';
            label.style.letterSpacing = '0.2px';

            const pauseBtn = document.createElement('button');
            pauseBtn.id = 'ez-rec-pill-pause';
            Object.assign(pauseBtn.style, {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                borderRadius: '999px',
                padding: '3px 9px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'background 0.2s'
            });
            pauseBtn.onmouseover = () => pauseBtn.style.background = 'rgba(255, 255, 255, 0.22)';
            pauseBtn.onmouseout = () => pauseBtn.style.background = 'rgba(255, 255, 255, 0.12)';
            pauseBtn.onclick = async (e) => {
                e.stopPropagation();
                const data = await chrome.storage.local.get('activeSession');
                const sess = data.activeSession;
                if (sess && sess.isActive) {
                    sess.isPaused = !sess.isPaused;
                    await chrome.storage.local.set({
                        activeSession: sess,
                        sessionRecordingState: {
                            isActive: true,
                            isPaused: !!sess.isPaused,
                            count: sess.steps ? sess.steps.length : 0
                        }
                    });
                }
            };

            const stopBtn = document.createElement('button');
            stopBtn.id = 'ez-rec-pill-stop';
            stopBtn.innerHTML = '⏹ Fertig';
            stopBtn.title = 'Aufnahme beenden & Editor öffnen';
            Object.assign(stopBtn.style, {
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                borderRadius: '999px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'background 0.2s'
            });
            stopBtn.onmouseover = () => stopBtn.style.background = '#dc2626';
            stopBtn.onmouseout = () => stopBtn.style.background = '#ef4444';
            stopBtn.onclick = async (e) => {
                e.stopPropagation();
                const data = await chrome.storage.local.get('activeSession');
                const sess = data.activeSession;
                if (sess && sess.isActive) {
                    sess.isActive = false;
                    sess.isPaused = false;
                    await chrome.storage.local.set({
                        activeSession: sess,
                        sessionRecordingState: {
                            isActive: false,
                            isPaused: false,
                            count: sess.steps ? sess.steps.length : 0
                        }
                    });
                    chrome.runtime.sendMessage({ type: 'openEditorTab' });
                }
            };

            recPillEl.appendChild(dot);
            recPillEl.appendChild(label);
            recPillEl.appendChild(pauseBtn);
            recPillEl.appendChild(stopBtn);
            document.body.appendChild(recPillEl);
        }

        const dot = document.getElementById('ez-rec-pill-dot');
        const label = document.getElementById('ez-rec-pill-label');
        const pauseBtn = document.getElementById('ez-rec-pill-pause');

        const stepCount = recState.count || 0;
        if (recState.isPaused) {
            if (dot) {
                dot.style.background = '#f59e0b';
                dot.style.boxShadow = '0 0 8px #f59e0b';
            }
            if (label) label.textContent = `Pausiert (${stepCount})`;
            if (pauseBtn) {
                pauseBtn.innerHTML = '▶ Weiter';
                pauseBtn.title = 'Aufnahme fortsetzen';
            }
        } else {
            if (dot) {
                dot.style.background = '#10b981';
                dot.style.boxShadow = '0 0 8px #10b981';
            }
            if (label) label.textContent = `${stepCount} ${stepCount === 1 ? 'Schritt' : 'Schritte'}`;
            if (pauseBtn) {
                pauseBtn.innerHTML = '⏸ Pause';
                pauseBtn.title = 'Aufnahme kurz pausieren';
            }
        }
    }

    function updateRecPillUI() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', updateRecPillUI, { once: true });
            return;
        }
        if (recState && recState.isActive) {
            renderRecPill();
            if (recPillEl) recPillEl.style.display = 'flex';
        } else {
            if (recPillEl) recPillEl.style.display = 'none';
        }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            let needsUpdate = false;
            if (changes.ttSettings) {
                ttSettings = changes.ttSettings.newValue || {};
                needsUpdate = true;
            }
            if (changes.ttActive) {
                ttActive = changes.ttActive.newValue || false;
                needsUpdate = true;
            }
            if (changes.ttStart) {
                ttStart = changes.ttStart.newValue || 0;
                needsUpdate = true;
            }
            if (changes.ttCurrentData) {
                ttCurrentData = changes.ttCurrentData.newValue || {};
                needsUpdate = true;
            }
            if (needsUpdate) updateWidgetVisibility();

            if (changes.sessionRecordingState) {
                recState = changes.sessionRecordingState.newValue || { isActive: false, isPaused: false, count: 0 };
                updateRecPillUI();
            } else if (changes.activeSession) {
                const s = changes.activeSession.newValue;
                recState = s ? {
                    isActive: !!s.isActive,
                    isPaused: !!s.isPaused,
                    count: s.steps ? s.steps.length : 0
                } : { isActive: false, isPaused: false, count: 0 };
                updateRecPillUI();
            }
        }
    });

    initWidgetState();
    initRecPillState();
  }

})();
