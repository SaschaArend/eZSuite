let currentSession = { steps: [] };
let currentStepIndex = -1;
let currentMode = 'view';
let isDragging = false;
let startX = 0, startY = 0;
let tempImage = null;
let activeObjectUrl = null;
let selectedStepsForMerge = new Set();

let undoStack = [];
let redoStack = [];

function getUndoRedoProtectedImageIds() {
    const ids = new Set();
    const collectFromStack = (stack) => {
        if (!Array.isArray(stack)) return;
        stack.forEach(item => {
            if (!item) return;
            if (item.prevImageId) ids.add(item.prevImageId);
            if (item.step && item.step.imageId) ids.add(item.step.imageId);
            if (Array.isArray(item.prevSteps)) {
                item.prevSteps.forEach(s => {
                    if (s && s.imageId) ids.add(s.imageId);
                });
            }
        });
    };
    collectFromStack(undoStack);
    collectFromStack(redoStack);
    return Array.from(ids);
}

function revokeActiveObjectUrl() {
    if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
    }
}

window.addEventListener('beforeunload', revokeActiveObjectUrl);

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const data = await chrome.storage.local.get('activeSession');
        if (data.activeSession && data.activeSession.steps) {
            currentSession = data.activeSession;

            if (!currentSession.id) currentSession.id = Date.now().toString();
            if (!currentSession.version) currentSession.version = "1.0";
            if (!currentSession.title) currentSession.title = "Dokumentation";

            delete currentSession.undoStack;
            delete currentSession.redoStack;

            const offloaded = await EzImageStore.offloadSessionImages(currentSession);
            if (offloaded) {
                await saveSession(true);
            }

            document.getElementById('documentTitleInput').value = currentSession.title;
            document.getElementById('sessionVersionInput').value = currentSession.version;
            document.getElementById('sessionTagsInput').value = (currentSession.tags || []).join(', ');

            const exportTitle = document.getElementById('exportTitleInput');
            if (exportTitle) exportTitle.value = currentSession.title;

            renderSidebar();
            if (currentSession.steps.length > 0) {
                await selectStep(0);
            }
        }

        EzImageStore.cleanupOrphanedImages();

        setupEventListeners();

        checkForUpdates();

        chrome.storage.onChanged.addListener(async (changes, area) => {
            if (area === 'local' && changes.activeSession) {

                const activeElement = document.activeElement;
                if (activeElement && activeElement.id === 'richEditor') {
                    console.log("Skipping session sync while editing textblock");
                    return;
                }

                const newSession = changes.activeSession.newValue;
                if (newSession && newSession.steps) {
                    const oldStepCount = currentSession.steps ? currentSession.steps.length : 0;

                    if (newSession.steps.length !== oldStepCount) {
                        currentSession = newSession;
                        renderSidebar();

                        if (newSession.steps.length > oldStepCount) {
                            if (currentStepIndex === -1 || currentStepIndex === oldStepCount - 1) {
                                await selectStep(newSession.steps.length - 1);
                            }
                        }
                    }
                }
            }
        });

        const rpaContainer = document.getElementById('selectorContainer');
        if (rpaContainer) {
            chrome.storage.sync.get(['showRPA'], (result) => {
                rpaContainer.style.display = !!result.showRPA ? 'block' : 'none';
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'sync' && changes.showRPA) {
                    rpaContainer.style.display = !!changes.showRPA.newValue ? 'block' : 'none';
                }
            });
        }
    } catch (e) {
        console.error("Error loading session:", e);
    }
});

function setupEventListeners() {

    const btnDup = document.getElementById('btnDuplicateStep');
    if (btnDup) btnDup.addEventListener('click', duplicateCurrentStep);
    document.getElementById('btnRemoveStep').addEventListener('click', deleteCurrentStep);

    const exportModal = document.getElementById('exportModal');
    document.getElementById('btnExport').addEventListener('click', () => exportModal.style.display = 'flex');
    document.getElementById('btnCancelExport').addEventListener('click', () => exportModal.style.display = 'none');

    document.getElementById('btnAddChapter').addEventListener('click', addChapterStep);

    document.getElementById('exportPDF').addEventListener('click', () => exportSession('html'));
    const btnDirectPdf = document.getElementById('exportDirectPDF');
    if (btnDirectPdf) {
        btnDirectPdf.addEventListener('click', (e) => {
            e.stopPropagation();
            exportSession('pdf_direct');
        });
    }
    const btnExportWord = document.getElementById('exportWord');
    if (btnExportWord) {
        btnExportWord.addEventListener('click', () => exportSession('word'));
    }
    document.getElementById('exportTour').addEventListener('click', () => exportSession('tour'));
    document.getElementById('exportLive').addEventListener('click', startOverlayGuide);
    document.getElementById('exportYouTrack').addEventListener('click', () => {
        copyYouTrackMarkdown();
        document.getElementById('exportModal').style.display = 'none';
    });
    document.getElementById('downloadTour').addEventListener('click', (e) => {
        e.stopPropagation();
        exportSession('standalone');
    });

    document.getElementById('btnAddTextBlock').addEventListener('click', addTextBlockStep);
    document.getElementById('btnMerge').addEventListener('click', mergeSelectedSteps);

    document.getElementById('stepTitleInput').addEventListener('input', (e) => updateStepMeta('title', e.target.value));
    document.getElementById('stepDescInput').addEventListener('input', (e) => updateStepMeta('description', e.target.value));
    document.getElementById('stepSessionInput').addEventListener('input', (e) => updateStepMeta('session', e.target.value));
    document.getElementById('stepFieldInput').addEventListener('input', (e) => updateStepMeta('field', e.target.value));
    document.getElementById('stepValueInput').addEventListener('input', (e) => updateStepMeta('value', e.target.value));
    document.getElementById('stepDelayInput').addEventListener('input', (e) => updateStepMeta('rpaDelay', parseFloat(e.target.value) || 0));

    setupToolButton('btnSelect', 'view');
    setupToolButton('btnBlur', 'blur');
    setupToolButton('btnCrop', 'crop');
    setupToolButton('btnArrow', 'arrow');
    setupToolButton('btnRect', 'rect');
    setupToolButton('btnSpotlight', 'spotlight');
    setupToolButton('btnText', 'text');
    document.getElementById('btnResetMarker').addEventListener('click', resetCurrentMarkers);
    document.getElementById('btnUndo').addEventListener('click', undoAction);
    document.getElementById('btnRedo').addEventListener('click', redoAction);

    document.getElementById('btnPlayStep').addEventListener('click', playStepOnSite);
    document.getElementById('btnPlayAll').addEventListener('click', playAllSteps);

    const container = document.getElementById('canvasWrapper');
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('dblclick', handleCanvasDoubleClick);

    const clearCacheBtn = document.getElementById('btnClearCache');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', clearCacheAndFreeRam);
    }
    document.getElementById('btnBackup').addEventListener('click', backupSession);
    document.getElementById('btnRestore').addEventListener('click', () => document.getElementById('restoreFile').click());
    document.getElementById('restoreFile').addEventListener('change', restoreSession);

    document.getElementById('btnAddStep').addEventListener('click', () => {
        if (confirm('Möchtest du eine Bilddatei importieren? \n(Alternativ kannst du Bilder auch einfach mit Strg+V einfügen)')) {
            document.getElementById('importImage').click();
        }
    });
    document.getElementById('importImage').addEventListener('change', handleImageImport);

    window.addEventListener('paste', handlePaste);

    document.getElementById('btnQuickCopy').addEventListener('click', quickCopyImage);

    window.addEventListener('keydown', handleKeyDown);

    document.getElementById('btnLibrary').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('ui/library.html') });
    });

    document.getElementById('btnSaveLibrary').addEventListener('click', () => {
        saveToLibrary();
    });

    document.getElementById('documentTitleInput').addEventListener('input', (e) => {
        currentSession.title = e.target.value;
        const exportTitle = document.getElementById('exportTitleInput');
        if (exportTitle) exportTitle.value = e.target.value;
        saveSession();
    });

    document.getElementById('sessionVersionInput').addEventListener('input', (e) => {
        currentSession.version = e.target.value;
        saveSession();
    });

    document.getElementById('sessionTagsInput').addEventListener('input', (e) => {
        const val = e.target.value;
        currentSession.tags = val.split(',').map(t => t.trim().startsWith('#') ? t.trim() : '#' + t.trim()).filter(t => t.length > 1);
        saveSession();
    });

    const brandingModal = document.getElementById('brandingModal');
    if (brandingModal) {
        document.getElementById('btnBranding').addEventListener('click', () => {
            brandingModal.style.display = 'flex';
            loadBrandingIntoModal();
        });
        document.getElementById('btnCancelBrandingModal').addEventListener('click', () => {
            brandingModal.style.display = 'none';
        });
        document.getElementById('btnSaveBranding').addEventListener('click', () => {
            saveBrandingFromModal();
            brandingModal.style.display = 'none';
        });

        document.getElementById('btnUploadLogo').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('logoUploadInput').click();
        });
        document.getElementById('logoUploadInput').addEventListener('change', handleBrandingLogoUpload);
        document.getElementById('btnResetLogo').addEventListener('click', (e) => {
            e.preventDefault();
            resetBrandingLogo();
        });

        document.querySelectorAll('.color-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                const color = preset.dataset.color;
                document.getElementById('brandingPrimaryColor').value = color;
                updatePresetSelection(color);
            });
        });

        document.getElementById('brandingPrimaryColor').addEventListener('input', (e) => {
            updatePresetSelection(e.target.value);
        });

        const radiusSlider = document.getElementById('brandingFrameRadius');
        const shadowSlider = document.getElementById('brandingFrameShadow');
        const paddingSlider = document.getElementById('brandingFramePadding');

        if (radiusSlider) radiusSlider.addEventListener('input', (e) => document.getElementById('valRadius').innerText = e.target.value + 'px');
        if (shadowSlider) shadowSlider.addEventListener('input', (e) => document.getElementById('valShadow').innerText = e.target.value + '%');
        if (paddingSlider) paddingSlider.addEventListener('input', (e) => document.getElementById('valPadding').innerText = e.target.value + 'px');
    }
}

function handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoAction();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoAction();
        return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (currentStepIndex > 0) selectStep(currentStepIndex - 1);
        e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (currentStepIndex < currentSession.steps.length - 1) selectStep(currentStepIndex + 1);
        e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedMarkerIndices.length > 0) {
            pushUndoState('marker_change', 'Marker gelöscht');
            const step = currentSession.steps[currentStepIndex];
            selectedMarkerIndices.sort((a, b) => b - a).forEach(idx => {
                step.markers.splice(idx, 1);
            });
            selectedMarkerIndices = [];
            pushHistory('Aktion: Marker gelöscht');
            saveSession();
            renderCanvas();
        } else {
            deleteCurrentStep();
        }
        e.preventDefault();
    }
}

function setupToolButton(id, mode) {
    const btn = document.getElementById(id);
    btn.addEventListener('click', () => {
        if (currentMode === mode) {
            currentMode = 'view';
            updateToolUI();
            return;
        }

        currentMode = mode;
        updateToolUI();
    });
}

function updateToolUI() {
    ['btnSelect', 'btnBlur', 'btnCrop', 'btnArrow', 'btnRect', 'btnSpotlight', 'btnText'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const mode = id === 'btnSelect' ? 'view' : id.replace('btn', '').toLowerCase();
        const isActive = currentMode === mode;

        btn.style.background = isActive ? '#eef2ff' : 'white';
        btn.style.borderColor = isActive ? '#4f46e5' : '#d1d5db';
        btn.style.color = isActive ? '#4f46e5' : '#111827';
    });

    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.style.cursor = currentMode === 'view' ? 'default' : (currentMode === 'text' ? 'text' : 'crosshair');
    }
}

function getTextMarkerBounds(ctx, m, dpr) {
    const fontSize = Math.round(16 * dpr);
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    const lines = String(m.text || 'Text').split('\n');
    const padX = 12 * dpr;
    const padY = 8 * dpr;
    const lineHeight = fontSize * 1.3;
    let maxW = 0;
    lines.forEach(line => {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
    });
    const boxW = Math.max(40 * dpr, maxW + padX * 2);
    const boxH = (lines.length * lineHeight) + padY * 2;
    const rx = m.x * dpr;
    const ry = m.y * dpr;
    return { rx, ry, boxW, boxH, fontSize, padX, padY, lineHeight, lines };
}

function drawTextCallout(ctx, m, dpr, isSelected = false) {
    const { rx, ry, boxW, boxH, fontSize, padX, padY, lineHeight, lines } = getTextMarkerBounds(ctx, m, dpr);
    ctx.save();
    if (isSelected) {
        ctx.shadowColor = 'rgba(79, 70, 229, 0.85)';
        ctx.shadowBlur = 16;
    } else {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
        ctx.shadowBlur = 10 * dpr;
        ctx.shadowOffsetY = 3 * dpr;
    }

    const bgColor = m.color || '#bc0003';
    ctx.fillStyle = bgColor;
    bakeRoundRect(ctx, rx, ry, boxW, boxH, 8 * dpr);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = (isSelected ? 3 : 2) * dpr;
    ctx.strokeStyle = isSelected ? '#4f46e5' : '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    lines.forEach((line, idx) => {
        ctx.fillText(line, rx + padX, ry + padY + idx * lineHeight);
    });
    ctx.restore();
}

function drawSpotlightOverlay(ctx, markers, dpr) {
    if (!Array.isArray(markers)) return;
    const spotlights = markers.filter(m => m && m.type === 'spotlight');
    if (spotlights.length === 0) return;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    spotlights.forEach(m => {
        const rx = m.x * dpr;
        const ry = m.y * dpr;
        const rw = m.width * dpr;
        const rh = m.height * dpr;
        ctx.rect(rx, ry, rw, rh);
    });
    ctx.fill('evenodd');
    ctx.restore();
}

let selectedMarkerIndices = [];
let isDraggingMarker = false;
let dragStartX = 0;
let dragStartY = 0;
let dragInitialMarkers = [];

function getCanvasCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function handleMouseDown(e) {
    if (currentStepIndex === -1) return;
    const canvas = document.querySelector('canvas');
    if (!canvas || (e.target !== canvas && !canvas.contains(e.target))) return;

    const coords = getCanvasCoords(e, canvas);
    const step = currentSession.steps[currentStepIndex];
    if (!step.markers) step.markers = [];
    const dpr = step.meta?.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');

    if (currentMode === 'text') {
        const textVal = prompt('Text für die Anmerkung eingeben:');
        if (textVal && textVal.trim()) {
            pushUndoState('marker_change', 'Text-Anmerkung hinzugefügt');
            step.markers.push({
                type: 'text',
                x: coords.x / dpr,
                y: coords.y / dpr,
                text: textVal.trim(),
                color: '#bc0003'
            });
            pushHistory(`Werkzeug: Text hinzugefügt ("${textVal.trim()}")`);
            currentMode = 'view';
            updateToolUI();
            saveSession();
            renderCanvas();
        }
        return;
    }

    if (currentMode === 'view') {
        const pxX = coords.x;
        const pxY = coords.y;

        let clickedIndex = -1;
        for (let i = step.markers.length - 1; i >= 0; i--) {
            const m = step.markers[i];
            if (m.type === 'rect' || m.type === 'blur' || m.type === 'spotlight') {
                const rx = m.x * dpr;
                const ry = m.y * dpr;
                const rw = m.width * dpr;
                const rh = m.height * dpr;
                if (pxX >= rx && pxX <= rx + rw && pxY >= ry && pxY <= ry + rh) {
                    clickedIndex = i;
                    break;
                }
            } else if (m.type === 'text') {
                const b = getTextMarkerBounds(ctx, m, dpr);
                if (pxX >= b.rx && pxX <= b.rx + b.boxW && pxY >= b.ry && pxY <= b.ry + b.boxH) {
                    clickedIndex = i;
                    break;
                }
            } else if (m.type === 'arrow') {
                const x1 = m.x1 * dpr, y1 = m.y1 * dpr, x2 = m.x2 * dpr, y2 = m.y2 * dpr;
                const dist1 = Math.sqrt((pxX - x1) ** 2 + (pxY - y1) ** 2);
                const dist2 = Math.sqrt((pxX - x2) ** 2 + (pxY - y2) ** 2);
                if (dist1 < 20 || dist2 < 20) {
                    clickedIndex = i;
                    break;
                }
            }
        }

        if (clickedIndex !== -1) {
            if (e.ctrlKey || e.metaKey) {
                const idx = selectedMarkerIndices.indexOf(clickedIndex);
                if (idx === -1) selectedMarkerIndices.push(clickedIndex);
                else selectedMarkerIndices.splice(idx, 1);
            } else {
                if (!selectedMarkerIndices.includes(clickedIndex)) {
                    selectedMarkerIndices = [clickedIndex];
                }
            }

            isDraggingMarker = true;
            dragStartX = coords.x;
            dragStartY = coords.y;

            pushUndoState('marker_change', 'Marker verschoben');

            dragInitialMarkers = selectedMarkerIndices.map(idx => ({
                index: idx,
                marker: JSON.parse(JSON.stringify(step.markers[idx]))
            }));
            renderCanvas();
        } else {
            selectedMarkerIndices = [];
            renderCanvas();
        }
        return;
    }

    isDragging = true;
    startX = coords.x;
    startY = coords.y;
}

function handleMouseMove(e) {
    if (currentStepIndex === -1) return;
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const coords = getCanvasCoords(e, canvas);

    if (isDraggingMarker && selectedMarkerIndices.length > 0) {
        const step = currentSession.steps[currentStepIndex];
        const dpr = step.meta?.devicePixelRatio || 1;
        const dx = (coords.x - dragStartX) / dpr;
        const dy = (coords.y - dragStartY) / dpr;

        dragInitialMarkers.forEach(({ index, marker: initial }) => {
            const m = step.markers[index];
            if (m.type === 'rect' || m.type === 'blur' || m.type === 'spotlight' || m.type === 'text') {
                m.x = initial.x + dx;
                m.y = initial.y + dy;
            } else if (m.type === 'arrow') {
                m.x1 = initial.x1 + dx;
                m.y1 = initial.y1 + dy;
                m.x2 = initial.x2 + dx;
                m.y2 = initial.y2 + dy;
            }
        });
        renderCanvas();
        return;
    }

    if (!isDragging) return;
    const ctx = canvas.getContext('2d');

    redrawCanvas(ctx);

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;

    if (currentMode === 'crop') {
        ctx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
        ctx.fillStyle = 'rgba(79, 70, 229, 0.1)';
        ctx.fillRect(startX, startY, coords.x - startX, coords.y - startY);
    } else if (currentMode === 'arrow') {
        drawArrow(ctx, startX, startY, coords.x, coords.y);
    } else if (currentMode === 'blur' || currentMode === 'rect' || currentMode === 'spotlight') {
        ctx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
        if (currentMode === 'rect') {
            ctx.fillStyle = 'rgba(188, 0, 3, 0.1)';
            ctx.fillRect(startX, startY, coords.x - startX, coords.y - startY);
        } else if (currentMode === 'spotlight') {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.15)';
            ctx.fillRect(startX, startY, coords.x - startX, coords.y - startY);
        }
    }
}

function handleCanvasDoubleClick(e) {
    if (currentStepIndex === -1) return;
    const canvas = document.querySelector('canvas');
    if (!canvas || (e.target !== canvas && !canvas.contains(e.target))) return;

    const coords = getCanvasCoords(e, canvas);
    const step = currentSession.steps[currentStepIndex];
    if (!step.markers) return;
    const dpr = step.meta?.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');

    for (let i = step.markers.length - 1; i >= 0; i--) {
        const m = step.markers[i];
        if (m.type === 'text') {
            const b = getTextMarkerBounds(ctx, m, dpr);
            if (coords.x >= b.rx && coords.x <= b.rx + b.boxW && coords.y >= b.ry && coords.y <= b.ry + b.boxH) {
                const updated = prompt('Text bearbeiten:', m.text || '');
                if (updated !== null && updated.trim() !== '') {
                    pushUndoState('marker_change', 'Text geändert');
                    m.text = updated.trim();
                    saveSession();
                    renderCanvas();
                }
                return;
            }
        }
    }
}

function handleMouseUp(e) {
    if (isDraggingMarker) {
        isDraggingMarker = false;
        saveSession();
        return;
    }

    if (!isDragging || currentStepIndex === -1) return;
    isDragging = false;

    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const coords = getCanvasCoords(e, canvas);
    const ctx = canvas.getContext('2d');
    const step = currentSession.steps[currentStepIndex];
    if (!step.markers) step.markers = [];
    const dpr = step.meta?.devicePixelRatio || 1;

    if (currentMode === 'crop') {
        const w = coords.x - startX;
        const h = coords.y - startY;
        if (Math.abs(w) > 10 && Math.abs(h) > 10) {
            if (confirm('Auf diesen Bereich zuschneiden?')) {
                pushHistory('Werkzeug: Zuschneiden (Crop)');
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = Math.abs(w);
                tempCanvas.height = Math.abs(h);
                const tCtx = tempCanvas.getContext('2d');
                tCtx.drawImage(canvas,
                    Math.min(startX, coords.x), Math.min(startY, coords.y), Math.abs(w), Math.abs(h),
                    0, 0, Math.abs(w), Math.abs(h)
                );
                tempCanvas.toBlob((blob) => {
                    if (blob) saveStepImageBlob(blob);
                }, 'image/jpeg', 0.85);
            } else {
                redrawCanvas(ctx);
            }
        }
    } else if (currentMode === 'arrow') {
        pushUndoState('marker_change', 'Pfeil hinzugefügt');
        step.markers.push({
            type: 'arrow',
            x1: startX / dpr,
            y1: startY / dpr,
            x2: coords.x / dpr,
            y2: coords.y / dpr
        });
        pushHistory('Werkzeug: Pfeil hinzugefügt');
        saveSession();
        renderCanvas();
    } else if (currentMode === 'rect') {
        const w = coords.x - startX;
        const h = coords.y - startY;
        if (Math.abs(w) > 5 && Math.abs(h) > 5) {
            pushUndoState('marker_change', 'Viereck hinzugefügt');
            step.markers.push({
                type: 'rect',
                x: Math.min(startX, coords.x) / dpr,
                y: Math.min(startY, coords.y) / dpr,
                width: Math.abs(w) / dpr,
                height: Math.abs(h) / dpr
            });
            pushHistory('Werkzeug: Bereich markiert (Viereck)');
            saveSession();
            renderCanvas();
        }
    } else if (currentMode === 'spotlight') {
        const w = coords.x - startX;
        const h = coords.y - startY;
        if (Math.abs(w) > 5 && Math.abs(h) > 5) {
            pushUndoState('marker_change', 'Spotlight hinzugefügt');
            step.markers.push({
                type: 'spotlight',
                x: Math.min(startX, coords.x) / dpr,
                y: Math.min(startY, coords.y) / dpr,
                width: Math.abs(w) / dpr,
                height: Math.abs(h) / dpr
            });
            pushHistory('Werkzeug: Fokus-Spotlight hinzugefügt');
            saveSession();
            renderCanvas();
        }
    } else if (currentMode === 'blur') {
        const w = coords.x - startX;
        const h = coords.y - startY;

        let blurX, blurY, blurW, blurH;

        if (Math.abs(w) < 5 && Math.abs(h) < 5) {
            const size = 60;
            blurW = size;
            blurH = size;
            blurX = (startX - size / 2) / dpr;
            blurY = (startY - size / 2) / dpr;
            blurW /= dpr;
            blurH /= dpr;
        } else {
            blurX = Math.min(startX, coords.x) / dpr;
            blurY = Math.min(startY, coords.y) / dpr;
            blurW = Math.abs(w) / dpr;
            blurH = Math.abs(h) / dpr;
        }

        pushUndoState('marker_change', 'Verpixelung hinzugefügt');
        step.markers.push({
            type: 'blur',
            x: blurX,
            y: blurY,
            width: blurW,
            height: blurH
        });
        pushHistory('Werkzeug: Verpixelt (Blur)');
        saveSession();
        renderCanvas();
    }
}

function drawArrow(ctx, fromX, fromY, toX, toY) {
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.fill();
}

function redrawCanvas(ctx) {
    if (tempImage) {
        ctx.drawImage(tempImage, 0, 0);

        const step = currentSession.steps[currentStepIndex];
        const dpr = step.meta?.devicePixelRatio || 1;

        if (step.markers) {
            drawSpotlightOverlay(ctx, step.markers, dpr);
            step.markers.forEach((m, i) => drawMarker(ctx, m, i + 1, dpr, selectedMarkerIndices.includes(i)));
        }

        if ((!step.markers || step.markers.length === 0) && step.rect) {
            drawMarker(ctx, { type: 'rect', ...step.rect }, null, dpr, false);
        }
    }
}

function pushUndoState(type, actionName) {
    if (currentStepIndex === -1) return;
    const step = currentSession.steps[currentStepIndex];

    redoStack = [];

    undoStack.push({
        type: type,
        stepId: step.id,
        prevImageId: type === 'edit' ? step.imageId : null,
        prevMarkers: JSON.parse(JSON.stringify(step.markers || []))
    });

    if (undoStack.length > 30) undoStack.shift();
}

async function saveStepImageBlob(newBlob) {
    const step = currentSession.steps[currentStepIndex];
    pushUndoState('edit', 'Bild geändert');

    const newImageId = `img_${currentSession.id || 'session'}_${step.id}_${Date.now()}`;
    await EzImageStore.putBlob(newImageId, newBlob);

    step.imageId = newImageId;
    delete step.dataUrl;

    await loadStepImageOntoCanvas(step);
    saveSession();
}

async function loadStepImageOntoCanvas(step) {
    revokeActiveObjectUrl();
    tempImage = null;

    if (!step || step.type === 'chapter' || step.type === 'textblock') {
        renderCanvas();
        return;
    }

    const blob = await EzImageStore.resolveStepBlob(step);
    if (!blob) {
        renderCanvas();
        return;
    }

    const objUrl = URL.createObjectURL(blob);
    activeObjectUrl = objUrl;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (activeObjectUrl === objUrl) {
                tempImage = img;
                renderCanvas();
            }
            resolve();
        };
        img.onerror = () => {
            resolve();
        };
        img.src = objUrl;
    });
}

async function undoAction() {
    if (!undoStack || undoStack.length === 0) {
        console.log("No more undo steps.");
        return;
    }

    const action = undoStack.pop();
    let redoActionObj;

    if (action.type === 'edit' || action.type === 'marker_change') {
        const step = currentSession.steps.find(s => s.id === action.stepId);
        if (!step) return;

        redoActionObj = {
            type: action.type,
            stepId: action.stepId,
            prevImageId: action.type === 'edit' ? step.imageId : null,
            prevMarkers: JSON.parse(JSON.stringify(step.markers || []))
        };

        if (action.prevImageId) {
            step.imageId = action.prevImageId;
            delete step.dataUrl;
        }
        step.markers = action.prevMarkers;

        const stepIdx = currentSession.steps.indexOf(step);
        if (stepIdx === currentStepIndex) {
            if (action.prevImageId) {
                await loadStepImageOntoCanvas(step);
            } else {
                renderCanvas();
            }
        }
    } else if (action.type === 'delete') {
        redoActionObj = {
            type: 'delete',
            index: action.index,
            step: action.step
        };
        currentSession.steps.splice(action.index, 0, action.step);
        renderSidebar();
        await selectStep(action.index);
    } else if (action.type === 'duplicate') {
        redoActionObj = {
            type: 'duplicate',
            index: action.index,
            step: action.step
        };
        currentSession.steps.splice(action.index, 1);
        renderSidebar();
        if (currentSession.steps.length > 0) await selectStep(Math.max(0, action.index - 1));
    } else if (action.type === 'reorder') {
        redoActionObj = {
            type: 'reorder',
            prevSteps: [...currentSession.steps]
        };
        currentSession.steps = action.prevSteps;
        renderSidebar();
        if (currentStepIndex >= currentSession.steps.length) {
            currentStepIndex = currentSession.steps.length - 1;
        }
        if (currentStepIndex !== -1) await selectStep(currentStepIndex);
    } else if (action.type === 'merge') {
        redoActionObj = {
            type: 'merge',
            prevSteps: JSON.parse(JSON.stringify(currentSession.steps))
        };
        currentSession.steps = action.prevSteps;
        renderSidebar();
        if (currentStepIndex >= currentSession.steps.length) {
            currentStepIndex = currentSession.steps.length - 1;
        }
        if (currentStepIndex !== -1) await selectStep(currentStepIndex);
    }

    if (redoActionObj) {
        redoStack.push(redoActionObj);
        if (redoStack.length > 30) redoStack.shift();
    }

    saveSession();
    renderSidebar();
    pushHistory('Aktion: Rückgängig (Undo)');
}

async function redoAction() {
    if (!redoStack || redoStack.length === 0) {
        console.log("No more redo steps.");
        return;
    }

    const action = redoStack.pop();
    let undoActionObj;

    if (action.type === 'edit' || action.type === 'marker_change') {
        const step = currentSession.steps.find(s => s.id === action.stepId);
        if (!step) return;

        undoActionObj = {
            type: action.type,
            stepId: action.stepId,
            prevImageId: action.type === 'edit' ? step.imageId : null,
            prevMarkers: JSON.parse(JSON.stringify(step.markers || []))
        };
        if (action.prevImageId) {
            step.imageId = action.prevImageId;
            delete step.dataUrl;
        }
        step.markers = action.prevMarkers;

        if (currentSession.steps.indexOf(step) === currentStepIndex) {
            if (action.prevImageId) {
                await loadStepImageOntoCanvas(step);
            } else {
                renderCanvas();
            }
        }
    } else if (action.type === 'delete') {
        undoActionObj = {
            type: 'delete',
            index: action.index,
            step: currentSession.steps[action.index]
        };
        currentSession.steps.splice(action.index, 1);
        renderSidebar();
        if (currentSession.steps.length > 0) await selectStep(Math.max(0, action.index - 1));
    } else if (action.type === 'duplicate') {
        undoActionObj = {
            type: 'duplicate',
            index: action.index,
            step: action.step
        };
        currentSession.steps.splice(action.index, 0, action.step);
        renderSidebar();
        await selectStep(action.index);
    } else if (action.type === 'reorder') {
        undoActionObj = {
            type: 'reorder',
            prevSteps: [...currentSession.steps]
        };
        currentSession.steps = action.prevSteps;
        renderSidebar();
        if (currentStepIndex !== -1) await selectStep(currentStepIndex);
    } else if (action.type === 'merge') {
        undoActionObj = {
            type: 'merge',
            prevSteps: JSON.parse(JSON.stringify(currentSession.steps))
        };
        currentSession.steps = action.prevSteps;
        renderSidebar();
        if (currentStepIndex !== -1) await selectStep(currentStepIndex);
    }

    if (undoActionObj) {
        undoStack.push(undoActionObj);
    }
    saveSession();
    renderSidebar();
    pushHistory('Aktion: Wiederholen (Redo)');
}

let draggedItemIndex = null;

function handleDragStart(e) {
    draggedItemIndex = parseInt(this.dataset.index);
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    const targetIndex = parseInt(this.dataset.index);
    if (draggedItemIndex !== targetIndex) {
        undoStack.push({
            type: 'reorder',
            prevSteps: [...currentSession.steps]
        });
        if (undoStack.length > 30) undoStack.shift();
        redoStack = [];

        const removed = currentSession.steps.splice(draggedItemIndex, 1)[0];
        currentSession.steps.splice(targetIndex, 0, removed);

        if (currentStepIndex === draggedItemIndex) {
            currentStepIndex = targetIndex;
        } else if (draggedItemIndex < currentStepIndex && targetIndex >= currentStepIndex) {
            currentStepIndex--;
        } else if (draggedItemIndex > currentStepIndex && targetIndex <= currentStepIndex) {
            currentStepIndex++;
        }

        saveSession();
        renderSidebar();
        selectStep(currentStepIndex);
        pushHistory('Aktion: Schritte neu anordnen');
    }
    return false;
}

function handleDragEnd() {
    this.style.opacity = '1';
    const items = document.querySelectorAll('.step-item');
    items.forEach(item => item.classList.remove('over'));
}

async function selectStep(index) {
    if (index < 0 || index >= currentSession.steps.length) return;

    currentStepIndex = index;
    selectedMarkerIndices = [];
    const step = currentSession.steps[index];

    if (step.rect && (!step.markers || step.markers.length === 0)) {
        step.markers = [{ type: 'rect', ...step.rect }];
        delete step.rect;
        saveSession();
    }

    const items = document.querySelectorAll('.step-item');
    items.forEach((item, i) => {
        if (i === index) item.classList.add('active');
        else item.classList.remove('active');
    });

    document.getElementById('stepTitleInput').value = step.title || '';
    document.getElementById('stepDescInput').value = step.description || '';
    document.getElementById('stepSessionInput').value = step.session || '';
    document.getElementById('stepFieldInput').value = step.field || '';

    const selectorInput = document.getElementById('stepSelectorInput');
    const valueInput = document.getElementById('stepValueInput');
    const delayInput = document.getElementById('stepDelayInput');
    if (selectorInput) selectorInput.value = step.selector || '';
    if (valueInput) valueInput.value = step.value || '';
    if (delayInput) delayInput.value = step.rpaDelay !== undefined ? step.rpaDelay : 3.5;

    const selectorContainer = document.getElementById('selectorContainer');
    if (selectorContainer) selectorContainer.style.display = (step.type === 'chapter' || step.type === 'textblock') ? 'none' : 'block';

    const isChapter = step.type === 'chapter';
    const isTextBlock = step.type === 'textblock';
    document.getElementById('titleLabel').textContent = isChapter ? 'Kapitel Name' : (isTextBlock ? 'Block Titel' : 'Titel des Schritts');

    const descGroup = document.getElementById('stepDescInput').closest('.form-group');
    const sessionGroup = document.getElementById('stepSessionInput').closest('.form-group');
    const fieldGroup = document.getElementById('stepFieldInput').closest('.form-group');

    if (isChapter || isTextBlock) {
        if (descGroup) descGroup.style.display = 'none';
        if (sessionGroup) sessionGroup.style.display = 'none';
        if (fieldGroup) fieldGroup.style.display = 'none';
        revokeActiveObjectUrl();
        tempImage = null;
        renderCanvas();
    } else {
        if (descGroup) descGroup.style.display = 'block';
        if (sessionGroup) sessionGroup.style.display = 'block';
        if (fieldGroup) fieldGroup.style.display = 'block';

        if ((!step.session || !step.field) && step.title) {
            updateStepMeta('title', step.title);
        }

        await loadStepImageOntoCanvas(step);
    }
}

function renderSidebar() {
    const list = document.getElementById('stepList');
    list.innerHTML = '';

    currentSession.steps.forEach((step, index) => {
        const li = document.createElement('li');
        let typeClass = '';
        if (step.type === 'chapter') typeClass = 'chapter';
        else if (step.type === 'textblock') typeClass = 'textblock';

        const isSelectedForMerge = selectedStepsForMerge.has(index);
        li.className = `step-item ${index === currentStepIndex ? 'active' : ''} ${typeClass} ${isSelectedForMerge ? 'selected-for-merge' : ''}`;
        li.draggable = true;
        li.dataset.index = index;

        li.onclick = (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (selectedStepsForMerge.has(index)) {
                    selectedStepsForMerge.delete(index);
                } else {
                    selectedStepsForMerge.add(index);
                }
                renderSidebar();
            } else if (e.shiftKey && currentStepIndex !== -1) {
                const start = Math.min(currentStepIndex, index);
                const end = Math.max(currentStepIndex, index);

                const shouldSelect = !selectedStepsForMerge.has(index);
                for (let i = start; i <= end; i++) {
                    if (shouldSelect) selectedStepsForMerge.add(i);
                    else selectedStepsForMerge.delete(i);
                }
                renderSidebar();
            } else {
                const editor = document.getElementById('richEditor');
                if (editor) {
                    const prevStep = currentSession.steps[currentStepIndex];
                    if (prevStep && prevStep.type === 'textblock') {
                        prevStep.content = editor.innerHTML;
                        saveSession(true);
                    }
                }
                selectStep(index);
            }
        };

        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);

        if (step.type === 'chapter') {
            li.innerHTML = `
                <div class="step-number">🔖</div>
                <div class="step-info">
                    <div class="step-title" style="font-weight: bold; color: #4b5563;">${escapeHtml(step.title || 'Neues Kapitel')}</div>
                    <div class="step-desc">Kapitel-Abschnitt</div>
                </div>
            `;
        } else if (step.type === 'textblock') {
            li.innerHTML = `
                <div class="step-number">📝</div>
                <div class="step-info">
                    <div class="step-title" style="font-weight: bold; color: var(--primary);">${escapeHtml(step.title || 'Textblock')}</div>
                    <div class="step-desc">Freitext / Formatierung</div>
                </div>
            `;
        } else {
            li.innerHTML = `
                <div class="step-number">${index + 1}</div>
                <div class="step-info">
                    <div class="step-title">${escapeHtml(step.title || 'Schritt ' + (index + 1))}</div>
                    <div class="step-desc">${escapeHtml(step.description || 'Keine Beschreibung')}</div>
                </div>
            `;
        }
        list.appendChild(li);
    });
}

function renderCanvas() {
    const container = document.getElementById('canvasWrapper');
    container.innerHTML = '';

    const step = currentSession.steps[currentStepIndex];
    if (!step) return;

    if (step.type === 'chapter') {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #4b5563;">
                <div style="font-size: 64px; margin-bottom: 20px;">🔖</div>
                <h3>Kapitel: ${escapeHtml(step.title || 'Unbenanntes Kapitel')}</h3>
                <p>Dieser Trenner wird im Export als Inhaltsverzeichnis-Eintrag verwendet.</p>
            </div>
        `;
        return;
    }

    if (step.type === 'textblock') {
        container.innerHTML = `
            <div class="rich-editor-container">
                <div class="rich-editor-toolbar">
                    <button class="format-btn" data-command="bold" title="Fett"><b>B</b></button>
                    <button class="format-btn" data-command="italic" title="Kursiv"><i>I</i></button>
                    <button class="format-btn" data-command="underline" title="Unterstrichen"><u>U</u></button>
                    <div style="flex: 1"></div>
                    <span style="font-size: 11px; color: var(--text-muted); align-self: center;">Wird automatisch gespeichert</span>
                </div>
                <div class="rich-editor-content" contenteditable="true" id="richEditor">
                    ${step.content || '<p>Hier Text eingeben...</p>'}
                </div>
            </div>
        `;
        const editor = document.getElementById('richEditor');

        const format = (cmd) => {
            document.execCommand(cmd, false, null);
            editor.focus();
            step.content = editor.innerHTML;
            saveSession();
        };

        container.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                format(btn.dataset.command);
            });
        });

        const syncContent = () => {
            if (step.content !== editor.innerHTML) {
                step.content = editor.innerHTML;
                saveSession();
            }
        };

        editor.addEventListener('input', syncContent);
        editor.addEventListener('blur', syncContent);

        setTimeout(() => editor.focus(), 100);
        return;
    }

    if (!tempImage) return;

    const canvas = document.createElement('canvas');
    canvas.width = tempImage.naturalWidth;
    canvas.height = tempImage.naturalHeight;
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '70vh';

    if (currentMode !== 'view') canvas.style.cursor = 'crosshair';

    const ctx = canvas.getContext('2d');
    ctx.drawImage(tempImage, 0, 0);

    const dpr = step.meta?.devicePixelRatio || 1;

    if (step.markers) {
        drawSpotlightOverlay(ctx, step.markers, dpr);
        step.markers.forEach((m, i) => drawMarker(ctx, m, i + 1, dpr, selectedMarkerIndices.includes(i)));
    } else if (step.rect) {
        drawMarker(ctx, { type: 'rect', ...step.rect }, null, dpr, false);
    }

    container.appendChild(canvas);
}

function drawMarker(ctx, m, number, dpr, isSelected) {
    ctx.save();
    if (isSelected && m.type !== 'text') {
        ctx.shadowColor = 'rgba(79, 70, 229, 0.8)';
        ctx.shadowBlur = 15;
    }

    if (m.type === 'rect') {
        const offset = 5;
        const rx = (m.x - offset) * dpr;
        const ry = (m.y - offset) * dpr;
        const rw = (m.width + (offset * 2)) * dpr;
        const rh = (m.height + (offset * 2)) * dpr;

        ctx.strokeStyle = isSelected ? '#4f46e5' : '#bc0003';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        roundRect(ctx, rx, ry, rw, rh, 8, false, true);

        if (number) {
            drawMarkerNumber(ctx, rx, ry, number, dpr);
        }
    } else if (m.type === 'spotlight') {
        const rx = m.x * dpr;
        const ry = m.y * dpr;
        const rw = m.width * dpr;
        const rh = m.height * dpr;

        ctx.strokeStyle = isSelected ? '#4f46e5' : '#f59e0b';
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        roundRect(ctx, rx, ry, rw, rh, 8 * dpr, false, true);
    } else if (m.type === 'text') {
        drawTextCallout(ctx, m, dpr, isSelected);
    } else if (m.type === 'arrow') {
        ctx.strokeStyle = isSelected ? '#4f46e5' : 'red';
        ctx.fillStyle = isSelected ? '#4f46e5' : 'red';
        ctx.lineWidth = 4;
        drawArrow(ctx, m.x1 * dpr, m.y1 * dpr, m.x2 * dpr, m.y2 * dpr);
    } else if (m.type === 'blur') {
        const rx = m.x * dpr;
        const ry = m.y * dpr;
        const rw = m.width * dpr;
        const rh = m.height * dpr;

        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        ctx.filter = 'blur(8px)';
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.filter = 'none';
        ctx.restore();

        ctx.strokeStyle = isSelected ? 'rgba(79, 70, 229, 0.5)' : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.strokeRect(rx, ry, rw, rh);
    }
    ctx.restore();
}

function drawMarkerNumber(ctx, rx, ry, number, dpr) {
    const fontSize = 16 * dpr;
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    const text = number.toString();
    const metrics = ctx.measureText(text);
    const padding = 6 * dpr;
    const bgW = metrics.width + padding * 2;
    const bgH = fontSize + padding;

    ctx.fillStyle = '#bc0003';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx, ry - bgH - 2, bgW, bgH, 4 * dpr);
    else ctx.rect(rx, ry - bgH - 2, bgW, bgH);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.fillText(text, rx + padding, ry - padding - 2);
}

function updateStepMeta(key, value) {
    if (currentStepIndex === -1) return;
    const step = currentSession.steps[currentStepIndex];
    if (step[key] === value) return;

    step[key] = value;

    if (key === 'title') pushHistory(`Titel geändert: ${value}`);
    if (key === 'description' && value) pushHistory(`Beschreibung aktualisiert`);
    if (key === 'field' && value) pushHistory(`Tabellenfeld gesetzt: ${value}`);

    saveSession();

    if (key === 'title' && step.type !== 'chapter' && step.type !== 'textblock') {
        const sessionRegex = /\b([a-z]{2,6}\d{4,}[a-z]\d{2,})\b/i;
        const fieldRegex = /\b([a-z]{2,6}\d{3,}\.[a-z0-9_.-]{1,})\b/i;

        const sessionMatch = value.match(sessionRegex);
        const fieldMatch = value.match(fieldRegex);

        let updatedAnything = false;

        if (sessionMatch) {
            const session = sessionMatch[0];
            currentSession.steps[currentStepIndex].session = session;
            document.getElementById('stepSessionInput').value = session;
            updatedAnything = true;
        }
        if (fieldMatch) {
            const field = fieldMatch[0];
            currentSession.steps[currentStepIndex].field = field;
            document.getElementById('stepFieldInput').value = field;
            updatedAnything = true;
        }

        if (updatedAnything) {
            const currentStep = currentSession.steps[currentStepIndex];

            if (currentStep.field && currentStep.field.includes('-n')) {
                currentStep.field = currentStep.field.split('-n')[0];
                document.getElementById('stepFieldInput').value = currentStep.field;
            }

            if (currentStep.session && currentStep.field) {
                const newTitle = "Entwicklerunterstützung";
                if (currentStep.title !== newTitle) {
                    currentStep.title = newTitle;
                    document.getElementById('stepTitleInput').value = newTitle;
                    value = newTitle;
                }
            } else {
                let cleanTitle = value;
                cleanTitle = cleanTitle.replace(/^Klick auf ["'](.*)["']$/, '$1');
                if (cleanTitle.includes('(')) {
                    cleanTitle = cleanTitle.split('(')[0].trim();
                }

                if (cleanTitle && cleanTitle !== value) {
                    currentStep.title = cleanTitle;
                    document.getElementById('stepTitleInput').value = cleanTitle;
                    value = cleanTitle;
                }
            }
            saveSession();
        }
    }

    if (key === 'title' || key === 'description') {
        const items = document.querySelectorAll('.step-item');
        if (items[currentStepIndex]) {
            const el = items[currentStepIndex].querySelector(key === 'title' ? '.step-title' : '.step-desc');
            if (el) el.textContent = value || (key === 'title' ? ('Schritt ' + (currentStepIndex + 1)) : 'Keine Beschreibung');
        }
    }
}

function resetCurrentMarkers() {
    if (currentStepIndex === -1) return;
    const step = currentSession.steps[currentStepIndex];

    if (confirm('Möchtest du alle Marker (Punkt, Viereck, Pfeile, Text, Spotlight, Verpixelungen) für diesen Schritt entfernen?')) {
        pushUndoState('marker_change', 'Alle Marker gelöscht');
        delete step.x;
        delete step.y;
        delete step.rect;
        step.markers = [];
        selectedMarkerIndices = [];

        pushHistory('Aktion: Alle Marker gelöscht');
        saveSession();
        renderCanvas();
    }
}

async function duplicateCurrentStep() {
    if (currentStepIndex === -1 || !currentSession.steps[currentStepIndex]) return;

    const sourceStep = currentSession.steps[currentStepIndex];
    const clonedStep = JSON.parse(JSON.stringify(sourceStep));
    const newStepId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    clonedStep.id = newStepId;

    if (clonedStep.title && !clonedStep.title.endsWith(' (Kopie)')) {
        clonedStep.title = `${clonedStep.title} (Kopie)`;
    }

    if (sourceStep.type !== 'chapter' && sourceStep.type !== 'textblock') {
        const blob = await EzImageStore.resolveStepBlob(sourceStep);
        if (blob) {
            const newImageId = `img_${currentSession.id || 'session'}_${newStepId}`;
            await EzImageStore.putBlob(newImageId, blob);
            clonedStep.imageId = newImageId;
            delete clonedStep.dataUrl;
        }
    }

    const insertIndex = currentStepIndex + 1;
    currentSession.steps.splice(insertIndex, 0, clonedStep);

    undoStack.push({
        type: 'duplicate',
        index: insertIndex,
        step: clonedStep
    });
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];

    pushHistory(`Aktion: Schritt dupliziert ("${clonedStep.title || 'Schritt'}")`);
    await saveSession(true);
    renderSidebar();
    await selectStep(insertIndex);
}

function deleteCurrentStep() {
    if (currentStepIndex === -1) return;
    if (!confirm('Diesen Schritt wirklich löschen?')) return;

    const stepToDelete = currentSession.steps[currentStepIndex];

    undoStack.push({
        type: 'delete',
        index: currentStepIndex,
        step: stepToDelete
    });
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];

    currentSession.steps.splice(currentStepIndex, 1);
    pushHistory('Aktion: Schritt gelöscht');
    saveSession();
    renderSidebar();
    if (currentSession.steps.length > 0) selectStep(Math.max(0, currentStepIndex - 1));
    else {
        currentStepIndex = -1;
        revokeActiveObjectUrl();
        tempImage = null;
        document.getElementById('canvasWrapper').innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 48px; box-sizing: border-box;">
                <div style="background: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 48px 64px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: var(--text-main);">Wähle einen Schritt aus der Liste</h3>
                    <p style="margin: 0; font-size: 13px; color: var(--text-muted);">Klicke auf einen Schritt links, um ihn zu bearbeiten</p>
                </div>
            </div>`;
    }
}

let saveTimeout = null;
async function saveSession(immediate = false) {

    delete currentSession.undoStack;
    delete currentSession.redoStack;

    const persist = async () => {
        await EzImageStore.offloadSessionImages(currentSession);
        await chrome.storage.local.set({ activeSession: currentSession });
    };

    if (immediate) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = null;
        await persist();
        return;
    }

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        saveTimeout = null;
        await persist();
    }, 500);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'undefined') radius = 5;
    if (typeof radius === 'number') {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
        var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (var side in defaultRadius) {
            radius[side] = radius[side] || defaultRadius[side];
        }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

async function getBase64Logo() {
    try {
        const response = await fetch(chrome.runtime.getURL('assets/logo.png'));
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Logo Error:', e);
        return null;
    }
}

async function mapInBatches(items, batchSize, asyncMapper) {
    const results = new Array(items.length);
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((item, idx) => asyncMapper(item, i + idx)));
        for (let j = 0; j < batchResults.length; j++) {
            results[i + j] = batchResults[j];
        }
    }
    return results;
}

async function exportSession(format) {
    const titleInput = document.getElementById('exportTitleInput');
    const docTitle = titleInput && titleInput.value.trim() ? titleInput.value.trim() : 'Dokumentation';
    document.getElementById('exportModal').style.display = 'none';
    const safeTitle = docTitle.replace(/[^a-zA-Z0-9_\- äöüÄÖÜß]/g, '_');

    if (format === 'standalone') {
        await downloadStandaloneTour(docTitle, safeTitle);
        return;
    }

    if (format === 'pdf_direct') {
        await downloadDirectPdf(docTitle, safeTitle);
        return;
    }

    if (format === 'word') {
        await downloadWordDoc(docTitle, safeTitle);
        return;
    }

    await EzImageStore.clearExportBlobs();

    const exportSteps = await mapInBatches(currentSession.steps, 4, async (step, idx) => {
        if (step.type === 'chapter' || step.type === 'textblock') {
            return { ...step };
        }
        const bakedBlob = await prepareImageBlobForExport(step, currentSession.branding, format);
        if (bakedBlob) {
            const exportImgId = `export_img_${idx}`;
            await EzImageStore.putBlob(exportImgId, bakedBlob);
            const copy = { ...step, exportImageId: exportImgId };
            delete copy.dataUrl;
            return copy;
        }
        return { ...step };
    });

    if (format === 'html' || format === 'tour') {
        const logo = currentSession.branding?.logo || await getBase64Logo();
        const exportData = {
            title: docTitle,
            date: new Date().toLocaleString(),
            steps: exportSteps,
            logo: logo,
            branding: currentSession.branding || null
        };

        await chrome.storage.local.set({ exportData: exportData });
        chrome.tabs.create({ url: format === 'tour' ? 'ui/tour.html' : 'ui/viewer.html' });
    }
}

async function downloadStandaloneTour(docTitle, safeTitle) {
    const logo = currentSession.branding?.logo || await getBase64Logo();

    const exportSteps = await mapInBatches(currentSession.steps, 4, async (step) => {
        if (step.type === 'chapter' || step.type === 'textblock') {
            return { ...step };
        }
        const dataUrl = await EzImageStore.resolveStepDataUrl(step);
        return { ...step, dataUrl: dataUrl };
    });

    const exportData = {
        title: docTitle,
        date: new Date().toLocaleString(),
        steps: exportSteps,
        logo: logo,
        branding: currentSession.branding || null
    };

    try {
        const [html, css, js] = await Promise.all([
            fetch(chrome.runtime.getURL('ui/tour.html')).then(r => r.text()),
            fetch(chrome.runtime.getURL('css/tour.css')).then(r => r.text()),
            fetch(chrome.runtime.getURL('js/tour.js')).then(r => r.text())
        ]);

        let fullHtml = html;
        fullHtml = fullHtml.replace('<link rel="stylesheet" href="../css/tour.css">', `<style>${css}</style>`);

        fullHtml = fullHtml.replace('<script src="../js/image_store.js"></script>', '');

        const injectedJs = `
            window.__data = ${JSON.stringify(exportData)};
            ${js}
        `;
        fullHtml = fullHtml.replace('<script src="../js/tour.js"></script>', `<script>${injectedJs}</script>`);

        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: `Klickanleitung-${safeTitle}.html`,
            saveAs: true
        }, () => {
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        });
    } catch (err) {
        console.error('Standalone Export Error:', err);
        alert('Fehler beim Export: ' + err.message);
    }
}

function hexToRgb(hex) {
    const clean = (hex || '#4f46e5').replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
    if (isNaN(num)) return [79, 70, 229];
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getImageDimensionsFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
        if (!dataUrl) return resolve({ width: 800, height: 600 });
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
        img.onerror = () => resolve({ width: 800, height: 600 });
        img.src = dataUrl;
    });
}

async function downloadDirectPdf(docTitle, safeTitle) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Fehler: jsPDF Bibliothek konnte nicht geladen werden.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;

    const branding = currentSession.branding || defaultBranding;
    const primaryHex = branding.primaryColor || '#4f46e5';
    const [pr, pg, pb] = hexToRgb(primaryHex);
    const logoDataUrl = branding.logo || await getBase64Logo();

    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageW, 38, 'F');

    if (logoDataUrl) {
        try {
            const logoDims = await getImageDimensionsFromDataUrl(logoDataUrl);
            const maxLogoH = 12;
            const maxLogoW = 45;
            const ratio = Math.min(maxLogoW / logoDims.width, maxLogoH / logoDims.height);
            const lw = Math.max(10, logoDims.width * ratio);
            const lh = Math.max(5, logoDims.height * ratio);
            const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(logoDataUrl, fmt, margin, 12, lw, lh);
        } catch (e) {
            console.warn('[PDF] Logo konnte nicht eingebettet werden:', e);
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(pr, pg, pb);
    doc.text(docTitle, pageW - margin, 19, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const versionStr = currentSession.version ? `v${currentSession.version} • ` : '';
    doc.text(`${versionStr}Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, pageW - margin, 26, { align: 'right' });

    doc.setDrawColor(pr, pg, pb);
    doc.setLineWidth(0.8);
    doc.line(margin, 38, pageW - margin, 38);

    let y = 48;
    let stepNum = 1;

    const ensureSpace = (neededMm) => {
        if (y + neededMm > pageH - 20) {
            doc.addPage();
            y = 20;
        }
    };

    const bakedSteps = await mapInBatches(currentSession.steps, 4, async (step) => {
        if (step.type === 'chapter' || step.type === 'textblock') {
            return { step, dataUrl: null, dims: null };
        }
        const blob = await prepareImageBlobForExport(step, currentSession.branding, 'html', 'image/jpeg');
        if (!blob) return { step, dataUrl: null, dims: null };
        const dataUrl = await EzImageStore.blobToDataUrl(blob);
        const dims = await getImageDimensionsFromDataUrl(dataUrl);
        return { step, dataUrl, dims };
    });

    for (const item of bakedSteps) {
        const { step, dataUrl, dims } = item;

        if (step.type === 'chapter') {
            ensureSpace(24);
            doc.setFillColor(pr, pg, pb);
            doc.rect(margin, y, 3, 10, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(15, 23, 42);
            doc.text(step.title || 'Kapitel', margin + 6, y + 7);
            y += 13;

            if (step.description) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(71, 85, 105);
                const lines = doc.splitTextToSize(step.description, contentW - 6);
                ensureSpace(lines.length * 5 + 4);
                doc.text(lines, margin + 6, y);
                y += lines.length * 5 + 4;
            }
            y += 4;
            continue;
        }

        if (step.type === 'textblock') {
            ensureSpace(22);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(pr, pg, pb);
            doc.text(step.title || 'Hinweis', margin, y + 5);
            y += 9;

            const plainText = (step.content || '')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]*>/g, '')
                .trim();

            if (plainText) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(30, 41, 59);
                const lines = doc.splitTextToSize(plainText, contentW);
                ensureSpace(lines.length * 5 + 6);
                doc.text(lines, margin, y);
                y += lines.length * 5 + 6;
            }
            continue;
        }

        const descLines = step.description ? doc.splitTextToSize(step.description, contentW) : [];
        const hasErpMeta = !!(step.session || step.field);
        const textBlockH = 10 + (descLines.length * 4.8) + (hasErpMeta ? 7 : 0);

        let imgW = contentW;
        let imgH = 0;
        if (dataUrl && dims) {
            const maxImgH = 115;
            const scale = Math.min(contentW / dims.width, maxImgH / dims.height);
            imgW = dims.width * scale;
            imgH = dims.height * scale;
        }

        ensureSpace(textBlockH + imgH + 10);

        doc.setFillColor(pr, pg, pb);
        doc.circle(margin + 3.5, y + 3.5, 3.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(String(stepNum), margin + 3.5, y + 4.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(step.title || `Schritt ${stepNum}`, margin + 10, y + 5);
        y += 9;

        if (hasErpMeta) {
            doc.setFont('courier', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            const metaParts = [];
            if (step.session) metaParts.push(`Session: ${step.session}`);
            if (step.field) metaParts.push(`Feld: ${step.field}`);
            doc.text(metaParts.join('  |  '), margin + 10, y + 3);
            y += 6;
        }

        if (descLines.length > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(51, 65, 85);
            doc.text(descLines, margin + 10, y + 3);
            y += descLines.length * 4.8 + 3;
        }

        if (dataUrl && imgH > 0) {
            try {
                const imgX = margin + (contentW - imgW) / 2;
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.rect(imgX - 0.5, y - 0.5, imgW + 1, imgH + 1);
                doc.addImage(dataUrl, 'JPEG', imgX, y, imgW, imgH);
                y += imgH + 10;
            } catch (e) {
                console.warn('[PDF] Schrittbild Fehler:', e);
                y += 4;
            }
        } else {
            y += 6;
        }

        stepNum++;
    }

    const totalPages = doc.internal.getNumberOfPages();
    const showHeader = branding.showHeader !== false && branding.headerText;
    const showFooter = branding.showFooter !== false;
    const showPageNumbers = branding.showPageNumbers !== false;
    const footerText = branding.footerText || 'Erstellt mit eZSuite / eZNotes';

    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);

        if (showHeader && p > 1) {
            doc.text(branding.headerText, margin, 10);
        }
        if (showFooter) {
            doc.text(footerText, margin, pageH - 8);
        }
        if (showPageNumbers) {
            doc.text(`Seite ${p} von ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
        }
    }

    doc.save(`${safeTitle}.pdf`);
}

async function downloadWordDoc(docTitle, safeTitle) {
    const branding = currentSession.branding || defaultBranding;
    const primaryColor = branding.primaryColor || '#4f46e5';
    const fontFamily = branding.fontFamily || 'Calibri, Arial, sans-serif';
    const logoDataUrl = branding.logo || await getBase64Logo();
    const footerText = branding.showFooter !== false ? (branding.footerText || 'Erstellt mit eZSuite / eZNotes') : '';

    const bakedSteps = await mapInBatches(currentSession.steps, 4, async (step) => {
        if (step.type === 'chapter' || step.type === 'textblock') {
            return { step, dataUrl: null, dims: null };
        }
        const blob = await prepareImageBlobForExport(step, currentSession.branding, 'html', 'image/jpeg');
        if (!blob) return { step, dataUrl: null, dims: null };
        const dataUrl = await EzImageStore.blobToDataUrl(blob);
        const dims = await getImageDimensionsFromDataUrl(dataUrl);
        return { step, dataUrl, dims };
    });

    const mhtmlParts = [];
    const registerMhtmlImage = (dataUrl, filenameBase) => {
        if (!dataUrl || !dataUrl.startsWith('data:')) return null;
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) return null;
        const header = dataUrl.slice(5, commaIdx);
        const mimeMatch = header.match(/^([^;]+)/);
        const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const rawBase64 = dataUrl.slice(commaIdx + 1).replace(/\s+/g, '');

        const wrappedBase64 = rawBase64.match(/.{1,76}/g)?.join('\r\n') || rawBase64;
        const loc = `file:///C:/eZSuiteDoc/${filenameBase}.${ext}`;
        mhtmlParts.push({
            location: loc,
            contentType: contentType,
            base64: wrappedBase64
        });
        return loc;
    };

    let logoSrc = null;
    let logoDims = { width: 120, height: 36 };
    if (logoDataUrl) {
        logoDims = await getImageDimensionsFromDataUrl(logoDataUrl);
        logoSrc = registerMhtmlImage(logoDataUrl, 'company_logo');
    }

    let stepNum = 1;
    let bodyHtml = '';

    for (const { step, dataUrl, dims } of bakedSteps) {
        if (step.type === 'chapter') {
            bodyHtml += `
                <div style="margin-top: 24pt; margin-bottom: 12pt; border-left: 4pt solid ${primaryColor}; padding-left: 10pt;">
                    <h2 style="margin: 0; font-size: 16pt; color: #0f172a;">${escapeHtml(step.title || 'Kapitel')}</h2>
                    ${step.description ? `<p style="margin: 4pt 0 0 0; font-size: 10.5pt; color: #475569;">${escapeHtml(step.description)}</p>` : ''}
                </div>
            `;
            continue;
        }

        if (step.type === 'textblock') {
            bodyHtml += `
                <div style="margin-top: 14pt; margin-bottom: 14pt; padding: 12pt; background-color: #f8fafc; border: 1pt solid #e2e8f0;">
                    <h3 style="margin: 0 0 6pt 0; font-size: 12pt; color: ${primaryColor};">${escapeHtml(step.title || 'Hinweis')}</h3>
                    <div style="font-size: 10.5pt; color: #1e293b;">${step.content || ''}</div>
                </div>
            `;
            continue;
        }

        const metaBadges = [];
        if (step.session) metaBadges.push(`<b>Session:</b> <code>${escapeHtml(step.session)}</code>`);
        if (step.field) metaBadges.push(`<b>Feld:</b> <code>${escapeHtml(step.field)}</code>`);

        let imgHtml = '';
        if (dataUrl) {
            const imgLoc = registerMhtmlImage(dataUrl, `step_image_${stepNum}`);
            if (imgLoc) {
                const targetW = 520;
                const ratio = (dims && dims.width > 0) ? (dims.height / dims.width) : 0.65;
                const targetH = Math.round(targetW * ratio);
                imgHtml = `<p style="margin: 6pt 0 0 0;"><img src="${imgLoc}" width="${targetW}" height="${targetH}" style="width: ${targetW}px; height: ${targetH}px; border: 1pt solid #cbd5e1;" /></p>`;
            }
        }

        bodyHtml += `
            <div style="margin-bottom: 22pt; page-break-inside: avoid;">
                <h3 style="margin: 0 0 4pt 0; font-size: 12.5pt; color: #0f172a;">
                    <span style="color: ${primaryColor}; font-weight: bold;">Schritt ${stepNum}:</span> ${escapeHtml(step.title || `Schritt ${stepNum}`)}
                </h3>
                ${metaBadges.length > 0 ? `<p style="margin: 2pt 0 6pt 0; font-size: 9.5pt; color: #475569; font-family: Consolas, monospace;">${metaBadges.join(' &nbsp;|&nbsp; ')}</p>` : ''}
                ${step.description ? `<p style="margin: 4pt 0 8pt 0; font-size: 10.5pt; color: #334155;">${escapeHtml(step.description).replace(/\n/g, '<br>')}</p>` : ''}
                ${imgHtml}
            </div>
        `;
        stepNum++;
    }

    const logoH = 38;
    const logoW = Math.round(logoH * ((logoDims.width || 120) / (logoDims.height || 38)));

    const wordHtml = `<html xmlns:v="urn:schemas-microsoft-com:vml"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <title>${escapeHtml(docTitle)}</title>
        <!--[if gte mso 9]>
        <xml>
            <w:WordDocument>
                <w:View>Print</w:View>
                <w:Zoom>100</w:Zoom>
                <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
            @page Section1 {
                size: 21cm 29.7cm;
                margin: 2cm 2cm 2cm 2cm;
            }
            div.Section1 {
                page: Section1;
            }
            body {
                font-family: '${fontFamily}', Calibri, Arial, sans-serif;
                color: #0f172a;
                line-height: 1.45;
            }
        </style>
    </head>
    <body>
        <div class="Section1">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom: 2pt solid ${primaryColor}; padding-bottom: 10pt; margin-bottom: 20pt;">
                <tr>
                    <td align="left" valign="middle">
                        ${logoSrc ? `<img src="${logoSrc}" width="${logoW}" height="${logoH}" style="width: ${logoW}px; height: ${logoH}px;" />` : ''}
                    </td>
                    <td align="right" valign="middle">
                        <h1 style="margin: 0; font-size: 20pt; color: ${primaryColor};">${escapeHtml(docTitle)}</h1>
                        <p style="margin: 3pt 0 0 0; font-size: 9pt; color: #64748b;">
                            ${currentSession.version ? `Version ${escapeHtml(currentSession.version)} &bull; ` : ''}Stand: ${new Date().toLocaleDateString('de-DE')}
                        </p>
                    </td>
                </tr>
            </table>

            ${bodyHtml}

            ${footerText ? `<hr style="border: none; border-top: 1pt solid #e2e8f0; margin-top: 24pt;" /><p style="font-size: 8.5pt; color: #94a3b8; text-align: center;">${escapeHtml(footerText)}</p>` : ''}
        </div>
    </body>
    </html>`;

    const boundary = '----=_NextPart_eZSuite_' + Date.now().toString(16);
    const mhtmlLines = [
        'MIME-Version: 1.0',
        `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
        '',
        `--${boundary}`,
        'Content-Location: file:///C:/eZSuiteDoc/document.html',
        'Content-Transfer-Encoding: 8bit',
        'Content-Type: text/html; charset="utf-8"',
        '',
        wordHtml,
        ''
    ];

    for (const part of mhtmlParts) {
        mhtmlLines.push(
            `--${boundary}`,
            `Content-Location: ${part.location}`,
            'Content-Transfer-Encoding: base64',
            `Content-Type: ${part.contentType}`,
            '',
            part.base64,
            ''
        );
    }

    mhtmlLines.push(`--${boundary}--`, '');

    const mhtmlContent = mhtmlLines.join('\r\n');
    const blob = new Blob([mhtmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
        url: url,
        filename: `${safeTitle}.doc`,
        saveAs: true
    }, () => {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
}

function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function backupSession() {
    const hydrated = await EzImageStore.hydrateSessionForExport(currentSession);
    const data = JSON.stringify(hydrated, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eZNotes-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function restoreSession(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const session = JSON.parse(event.target.result);
            if (session.steps && Array.isArray(session.steps)) {
                if (confirm('Aktuelle Session überschreiben?')) {
                    currentSession = session;
                    undoStack = [];
                    redoStack = [];
                    await EzImageStore.offloadSessionImages(currentSession);
                    await saveSession(true);
                    await EzImageStore.cleanupOrphanedImages();
                    renderSidebar();
                    if (currentSession.steps.length > 0) await selectStep(0);
                }
            } else {
                alert('Ungültiges Backup-Format.');
            }
        } catch (err) {
            console.error('Restore Error:', err);
            alert('Fehler beim Laden des Backups.');
        }
    };
    reader.readAsText(file);
}

async function quickCopyImage() {
    if (currentStepIndex === -1) return;
    const step = currentSession.steps[currentStepIndex];

    try {

        const bakedBlob = await prepareImageBlobForExport(step, currentSession.branding, 'html', 'image/png');
        if (!bakedBlob) return;

        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': bakedBlob })
        ]);

        const btn = document.getElementById('btnQuickCopy');
        const oldText = btn.textContent;
        btn.textContent = '\u2705 Bild kopiert!';
        setTimeout(() => btn.textContent = oldText, 2000);
    } catch (err) {
        console.error('QuickCopy Error:', err);
        alert('Fehler beim Kopieren des Bildes.');
    }
}

async function copyYouTrackMarkdown() {
    const titleInput = document.getElementById('exportTitleInput');
    const docTitle = titleInput && titleInput.value.trim() ? titleInput.value.trim() : 'Dokumentation';

    let md = `# ${docTitle}\n\n`;
    md += `*Erstellt am: ${new Date().toLocaleString()}*\n\n---\n\n`;

    let imageCounter = 1;
    for (let step of currentSession.steps) {
        if (step.type === 'chapter') {
            md += `## 🔖 ${step.title}\n\n`;
            if (step.description) md += `${step.description}\n\n`;
        } else if (step.type === 'textblock') {
            md += `### 📝 ${step.title}\n\n`;
            let content = step.content || '';
            let contentText = content.replace(/<br\s*\/?>/gi, '\n');
            contentText = contentText.replace(/<\/p>/gi, '\n\n');
            contentText = contentText.replace(/<[^>]*>/g, '');
            md += `${contentText.trim()}\n\n`;
        } else {
            md += `### Schritt ${imageCounter}: ${step.title || 'Ohne Titel'}\n\n`;
            if (step.description) md += `${step.description}\n\n`;

            if (step.session || step.field) {
                md += `> **System-Info:**\n`;
                if (step.session) md += `> - Session: \`${step.session}\`\n`;
                if (step.field) md += `> - Feld: \`${step.field}\`\n`;
                md += `\n`;
            }

            md += `![Schritt ${imageCounter}](step${imageCounter}.jpg)\n\n`;

            const bakedBlob = await prepareImageBlobForExport(step, currentSession.branding, 'html', 'image/jpeg');
            if (bakedBlob) {
                const objUrl = URL.createObjectURL(bakedBlob);
                const link = document.createElement('a');
                link.href = objUrl;
                link.download = `step${imageCounter}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
            }

            imageCounter++;
        }
    }

    md += `---\n*Exportiert mit eZNotes*`;

    try {
        await navigator.clipboard.writeText(md);
        alert('YouTrack Markdown wurde erfolgreich in die Zwischenablage kopiert!\n\nDie dazugehörigen Bilder wurden automatisch heruntergeladen.\n\nSo fügst du es in YouTrack ein:\n1. Drücke Strg+V im YouTrack-Editor, um den Text einzufügen.\n2. Ziehe die heruntergeladenen Bilder per Drag & Drop direkt in YouTrack.');
    } catch (err) {
        console.error('Clipboard Error:', err);
        const textArea = document.createElement("textarea");
        textArea.value = md;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert('YouTrack Markdown wurde in die Zwischenablage kopiert (Fallback-Methode)!\n\nDie Bilder wurden automatisch heruntergeladen.');
        } catch (e) {
            alert('Fehler beim Kopieren. Die Bilder wurden heruntergeladen, aber der Text konnte nicht kopiert werden.');
        }
        document.body.removeChild(textArea);
    }
}

function addChapterStep() {
    const newChapter = {
        id: Date.now().toString(),
        type: 'chapter',
        title: 'Neues Kapitel',
        description: '',
        meta: {
            timestamp: Date.now()
        }
    };

    if (!currentSession.steps) currentSession.steps = [];
    currentSession.steps.push(newChapter);

    pushHistory('Aktion: Kapitel hinzugefügt');
    saveSession().then(() => {
        renderSidebar();
        selectStep(currentSession.steps.length - 1);
    });
}

function addTextBlockStep() {
    const newBlock = {
        id: Date.now().toString(),
        type: 'textblock',
        title: 'Neuer Textblock',
        content: '<p>Hier Text eingeben...</p>',
        meta: {
            timestamp: Date.now()
        }
    };

    if (!currentSession.steps) currentSession.steps = [];
    currentSession.steps.push(newBlock);

    pushHistory('Aktion: Textblock hinzugefügt');
    saveSession().then(() => {
        renderSidebar();
        selectStep(currentSession.steps.length - 1);
    });
}

function mergeSelectedSteps() {
    if (selectedStepsForMerge.size < 2) {
        alert('Bitte wähle mindestens zwei Schritte mit Strg+Klick aus, um sie zusammenzuführen.');
        return;
    }

    const indices = Array.from(selectedStepsForMerge).sort((a, b) => a - b);
    const baseStepIndex = indices[0];
    const baseStep = currentSession.steps[baseStepIndex];

    if (baseStep.type === 'chapter' || baseStep.type === 'textblock') {
        alert('Der erste markierte Schritt darf kein Kapitel oder Textblock sein.');
        return;
    }

    if (!confirm(`${indices.length} Schritte zusammenführen? Der erste Schritt wird als Basis verwendet.`)) return;

    undoStack.push({
        type: 'merge',
        prevSteps: JSON.parse(JSON.stringify(currentSession.steps))
    });
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];

    if (!baseStep.markers) baseStep.markers = [];

    if (baseStep.rect && baseStep.markers.length === 0) {
        baseStep.markers.push({ ...baseStep.rect });
        delete baseStep.rect;
    }

    for (let i = 1; i < indices.length; i++) {
        const stepToMerge = currentSession.steps[indices[i]];
        if (stepToMerge.markers) {
            baseStep.markers.push(...stepToMerge.markers.map(m => ({ ...m })));
        } else if (stepToMerge.rect) {
            baseStep.markers.push({ type: 'rect', ...stepToMerge.rect });
        }
    }

    const reversedIndices = indices.slice(1).reverse();
    reversedIndices.forEach(idx => {
        currentSession.steps.splice(idx, 1);
    });

    pushHistory(`Aktion: ${indices.length} Schritte zusammengeführt`);

    selectedStepsForMerge.clear();
    saveSession().then(() => {
        renderSidebar();
        selectStep(currentSession.steps.indexOf(baseStep));
        alert('Schritte erfolgreich zusammengeführt!');
    });
}

function handleImageImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Bitte wähle eine Bilddatei aus.');
        return;
    }

    addNewStepFromBlob(file, file.name);
}

function handlePaste(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
                addNewStepFromBlob(blob, 'Eingefügtes Bild');
            }
        }
    }
}

async function addNewStepFromBlob(blob, fileName) {
    let finalBlob = blob;
    if (blob.type === 'image/png') {
        try {
            finalBlob = await convertBlobToJpeg(blob);
        } catch (e) {
            console.error('[Editor] Failed to convert pasted/imported image to JPEG:', e);
        }
    }

    const stepId = Date.now().toString();
    const imageId = `img_${currentSession.id || 'session'}_${stepId}_${Math.random().toString(36).slice(2, 7)}`;
    await EzImageStore.putBlob(imageId, finalBlob);

    const newStep = {
        id: stepId,
        imageId: imageId,
        title: fileName.split('.')[0],
        description: '',
        meta: {
            devicePixelRatio: 1,
            timestamp: Date.now()
        }
    };

    if (!currentSession.steps) currentSession.steps = [];
    currentSession.steps.push(newStep);

    await saveSession(true);
    renderSidebar();
    await selectStep(currentSession.steps.length - 1);
    alert('Neuer Schritt hinzugefügt!');
}

async function convertBlobToJpeg(blob) {
    if (!blob || blob.type === 'image/jpeg') return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

async function prepareImageBlobForExport(step, branding, format, forceMimeType = null) {
    const sourceBlob = await EzImageStore.resolveStepBlob(step);
    if (!sourceBlob) return null;

    const hasMarkers = step.markers && step.markers.length > 0;
    const hasLegacyMarkers = step.x || step.y || step.rect;

    const bgStyle = (format === 'html' && branding && branding.bgStyle) ? branding.bgStyle : 'none';
    const hasBrandingFrame = bgStyle !== 'none' || (branding && branding.deviceFrame === true);

    const targetMime = forceMimeType || 'image/jpeg';

    if (!hasMarkers && !hasLegacyMarkers && (!hasBrandingFrame || format === 'tour') && (!forceMimeType || sourceBlob.type === forceMimeType)) {
        return sourceBlob;
    }

    const objUrl = URL.createObjectURL(sourceBlob);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            URL.revokeObjectURL(objUrl);

            let canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const dpr = step.meta?.devicePixelRatio || 1;

            if (step.markers) {
                drawSpotlightOverlay(ctx, step.markers, dpr);
                step.markers.forEach((m, i) => {
                    ctx.save();
                    if (m.type === 'rect') {
                        const offset = 5;
                        const rx = (m.x - offset) * dpr;
                        const ry = (m.y - offset) * dpr;
                        const rw = (m.width + (offset * 2)) * dpr;
                        const rh = (m.height + (offset * 2)) * dpr;
                        ctx.strokeStyle = '#bc0003';
                        ctx.lineWidth = 4 * dpr;
                        bakeRoundRect(ctx, rx, ry, rw, rh, 8 * dpr);
                        ctx.stroke();
                        bakeMarkerNumber(ctx, rx, ry, i + 1, dpr);
                    } else if (m.type === 'spotlight') {
                        const rx = m.x * dpr;
                        const ry = m.y * dpr;
                        const rw = m.width * dpr;
                        const rh = m.height * dpr;
                        ctx.strokeStyle = '#f59e0b';
                        ctx.lineWidth = 3 * dpr;
                        bakeRoundRect(ctx, rx, ry, rw, rh, 8 * dpr);
                        ctx.stroke();
                    } else if (m.type === 'text') {
                        drawTextCallout(ctx, m, dpr, false);
                    } else if (m.type === 'arrow') {
                        ctx.strokeStyle = 'red';
                        ctx.fillStyle = 'red';
                        ctx.lineWidth = 4 * dpr;
                        drawArrow(ctx, m.x1 * dpr, m.y1 * dpr, m.x2 * dpr, m.y2 * dpr);
                    } else if (m.type === 'blur') {
                        const rx = m.x * dpr;
                        const ry = m.y * dpr;
                        const rw = m.width * dpr;
                        const rh = m.height * dpr;
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(rx, ry, rw, rh);
                        ctx.clip();
                        ctx.filter = 'blur(8px)';
                        ctx.drawImage(canvas, 0, 0);
                        ctx.filter = 'none';
                        ctx.restore();
                        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(rx, ry, rw, rh);
                    }
                    ctx.restore();
                });
            } else if (step.rect) {
                const offset = 5;
                const rx = (step.rect.x - offset) * dpr;
                const ry = (step.rect.y - offset) * dpr;
                const rw = (step.rect.width + (offset * 2)) * dpr;
                const rh = (step.rect.height + (offset * 2)) * dpr;
                ctx.strokeStyle = '#bc0003';
                ctx.lineWidth = 4 * dpr;
                bakeRoundRect(ctx, rx, ry, rw, rh, 8 * dpr);
                ctx.stroke();
            } else if (typeof step.x === 'number') {
                const pxX = step.x * dpr;
                const pxY = step.y * dpr;
                ctx.beginPath();
                ctx.arc(pxX, pxY, 30 * dpr, 0, Math.PI * 2);
                ctx.lineWidth = 6 * dpr;
                ctx.strokeStyle = '#bc0003';
                ctx.stroke();
            }

            let targetCanvas = canvas;

            if (hasBrandingFrame && format === 'html') {
                const scale = Math.max(1, img.width / 1200);
                const bRadius = (branding.frameRadius !== undefined ? branding.frameRadius : 12) * scale * dpr;
                const bShadow = (branding.frameShadow !== undefined ? branding.frameShadow : 20);
                const bPadding = (branding.framePadding !== undefined ? branding.framePadding : 32) * scale * dpr;

                const drawDeviceFrame = branding.deviceFrame === true;
                const headerHeight = drawDeviceFrame ? (40 * scale * dpr) : 0;

                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = canvas.width + (bPadding * 2);
                finalCanvas.height = canvas.height + (bPadding * 2) + headerHeight;
                const fctx = finalCanvas.getContext('2d');

                fctx.fillStyle = '#ffffff';
                fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

                if (bgStyle === 'solid') {
                    fctx.fillStyle = branding.primaryColor || '#4f46e5';
                    fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                } else if (bgStyle.startsWith('gradient')) {
                    const grad = fctx.createLinearGradient(0, 0, finalCanvas.width, finalCanvas.height);
                    if (bgStyle === 'gradient1') { grad.addColorStop(0, '#0284c7'); grad.addColorStop(1, '#38bdf8'); }
                    else if (bgStyle === 'gradient2') { grad.addColorStop(0, '#7e22ce'); grad.addColorStop(1, '#ec4899'); }
                    else if (bgStyle === 'gradient3') { grad.addColorStop(0, '#047857'); grad.addColorStop(1, '#10b981'); }
                    fctx.fillStyle = grad;
                    fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                }

                fctx.save();
                if (bShadow > 0) {
                    fctx.shadowColor = `rgba(0, 0, 0, ${bShadow / 100 * 0.8})`;
                    fctx.shadowBlur = 40 * scale * dpr;
                    fctx.shadowOffsetY = 20 * scale * dpr;
                }

                if (drawDeviceFrame) {
                    fctx.beginPath();
                    bakeRoundRect(fctx, bPadding, bPadding, canvas.width, canvas.height + headerHeight, bRadius);
                    fctx.fillStyle = '#ffffff';
                    fctx.fill();

                    fctx.clip();
                    fctx.shadowColor = 'transparent';

                    fctx.fillStyle = '#e2e8f0';
                    fctx.fillRect(bPadding, bPadding, canvas.width, headerHeight);

                    const btnRadius = 6 * scale * dpr;
                    const btnY = bPadding + (headerHeight / 2);
                    let btnX = bPadding + (16 * scale * dpr) + btnRadius;
                    fctx.beginPath(); fctx.arc(btnX, btnY, btnRadius, 0, Math.PI * 2); fctx.fillStyle = '#ff5f56'; fctx.fill();
                    btnX += (8 * scale * dpr) + (btnRadius * 2);
                    fctx.beginPath(); fctx.arc(btnX, btnY, btnRadius, 0, Math.PI * 2); fctx.fillStyle = '#ffbd2e'; fctx.fill();
                    btnX += (8 * scale * dpr) + (btnRadius * 2);
                    fctx.beginPath(); fctx.arc(btnX, btnY, btnRadius, 0, Math.PI * 2); fctx.fillStyle = '#27c93f'; fctx.fill();

                    if (step.title) {
                        fctx.fillStyle = '#475569';
                        fctx.font = `600 ${13 * scale * dpr}px Inter, sans-serif`;
                        fctx.textAlign = 'center';
                        fctx.textBaseline = 'middle';
                        fctx.fillText(step.title, bPadding + (canvas.width / 2), btnY);
                    }

                    fctx.drawImage(canvas, bPadding, bPadding + headerHeight);
                } else {
                    bakeRoundRect(fctx, bPadding, bPadding, canvas.width, canvas.height, bRadius);
                    fctx.fillStyle = '#ffffff';
                    fctx.fill();
                    fctx.clip();
                    fctx.shadowColor = 'transparent';
                    fctx.drawImage(canvas, bPadding, bPadding);
                }
                fctx.restore();
                targetCanvas = finalCanvas;
            }

            targetCanvas.toBlob((outBlob) => {
                resolve(outBlob || sourceBlob);
            }, targetMime, targetMime === 'image/jpeg' ? 0.90 : 1.0);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            resolve(sourceBlob);
        };
        img.src = objUrl;
    });
}

function bakeRoundRect(ctx, x, y, width, height, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function bakeMarkerNumber(ctx, rx, ry, number, dpr) {
    const fontSize = 16 * dpr;
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    const text = number.toString();
    const metrics = ctx.measureText(text);
    const padding = 6 * dpr;
    const bgW = metrics.width + padding * 2;
    const bgH = fontSize + padding;

    ctx.fillStyle = '#bc0003';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx, ry - bgH - 2, bgW, bgH, 4 * dpr);
    else ctx.rect(rx, ry - bgH - 2, bgW, bgH);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.fillText(text, rx + padding, ry - padding - 2);
}

async function getRootHandle() {
    return new Promise((resolve) => {
        const request = indexedDB.open('eZNotesDB', 1);
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('handles', 'readonly');
                const store = tx.objectStore('handles');
                const getReq = store.get('rootFolder');
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        };
        request.onerror = () => resolve(null);
    });
}

async function saveToLibrary() {
    const titleInput = document.getElementById('documentTitleInput');
    const docTitle = titleInput && titleInput.value.trim() ? titleInput.value.trim() : (currentSession.title || 'Dokumentation');

    currentSession.title = docTitle;
    currentSession.timestamp = Date.now();
    currentSession.version = document.getElementById('sessionVersionInput').value || "1.0";

    pushHistory(`Archiviert in Bibliothek (v${currentSession.version})`);

    try {

        const meta = await EzImageStore.saveLibrarySession(currentSession);
        const data = await chrome.storage.local.get('saved_sessions_meta');
        let metaList = data.saved_sessions_meta || [];
        const index = metaList.findIndex(s => s.id === currentSession.id);
        if (index !== -1) {
            metaList[index] = meta;
        } else {
            metaList.push(meta);
        }
        await chrome.storage.local.set({ saved_sessions_meta: metaList });

        const rootHandle = await getRootHandle();
        const safeTitle = docTitle.replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = `${safeTitle} (${currentSession.version || '1.0'}).json`;

        const hydratedSession = await EzImageStore.hydrateSessionForExport(currentSession);

        if (rootHandle) {
            const options = { mode: 'readwrite' };
            if (await rootHandle.queryPermission(options) === 'granted') {
                const fileHandle = await rootHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(hydratedSession, null, 2));
                await writable.close();
                alert(`Erfolgreich archiviert!\nDie Datei wurde direkt im Stammverzeichnis gespeichert:\n${fileName}`);
                return;
            }
        }

        const dlPath = `library/${fileName}`;
        const blob = new Blob([JSON.stringify(hydratedSession, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: dlPath,
            saveAs: false
        }, () => {
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        });

        alert(`Archiviert!\n(Hinweis: Kein Stammverzeichnis verbunden, Datei liegt in Downloads/library/)`);

    } catch (err) {
        console.error('Library Save Error:', err);
        alert('Fehler beim Archivieren: ' + err.message);
    }
}

function pushHistory(action) {
    if (!currentSession.history) currentSession.history = [];
    currentSession.history.push({
        timestamp: Date.now(),
        action: action,
        version: currentSession.version || "1.0"
    });
    if (currentSession.history.length > 100) currentSession.history.shift();
}

async function playAllSteps() {
    if (!currentSession.steps || currentSession.steps.length === 0) return;

    const automationSteps = currentSession.steps.filter(s => s.selector);

    if (automationSteps.length === 0) {
        alert('Keine automatisierbaren Schritte gefunden.');
        return;
    }

    const indicator = document.createElement('div');
    indicator.innerText = '● Automatisierung läuft...';
    indicator.style = 'position:fixed; top:10px; right:10px; background:red; color:white; padding:5px 10px; z-index:9999; border-radius:4px;';
    document.body.appendChild(indicator);

    for (let i = 0; i < automationSteps.length; i++) {
        const step = automationSteps[i];

        const hostname = step.meta?.hostname || '';
        const domainMatch = hostname.split('.').slice(-2).join('.');
        const tabs = await chrome.tabs.query({});
        let targetTab = tabs.find(t => {
            try {
                if (!t.url) return false;
                const tabUrl = new URL(t.url);
                return tabUrl.hostname === hostname || tabUrl.hostname.includes(hostname) || (domainMatch && tabUrl.hostname.includes(domainMatch));
            } catch (e) { return false; }
        });

        if (targetTab) {
            chrome.tabs.sendMessage(targetTab.id, {
                type: 'PLAY_STEP',
                selector: step.selector,
                elementText: step.title,
                value: step.value
            });
            chrome.tabs.update(targetTab.id, { active: true });
        }

        if (i < automationSteps.length - 1) {
            const delayMs = typeof step.rpaDelay === 'number' ? step.rpaDelay * 1000 : 3500;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    indicator.remove();
}

async function playStepOnSite() {
    if (currentStepIndex === -1) return;
    const step = currentSession.steps[currentStepIndex];
    if (!step.selector) return;

    const tabs = await chrome.tabs.query({});
    const hostname = step.meta?.hostname || '';
    const domainMatch = hostname.split('.').slice(-2).join('.');

    let targetTab = tabs.find(t => {
        try {
            if (!t.url) return false;
            const tabUrl = new URL(t.url);
            return tabUrl.hostname === hostname || tabUrl.hostname.includes(hostname) || (domainMatch && tabUrl.hostname.includes(domainMatch));
        } catch (e) { return false; }
    });

    if (targetTab) {
        chrome.tabs.sendMessage(targetTab.id, {
            type: 'PLAY_STEP',
            selector: step.selector,
            elementText: step.title,
            value: step.value
        });
        chrome.tabs.update(targetTab.id, { active: true });
    }
}

async function startOverlayGuide() {
    document.getElementById('exportModal').style.display = 'none';

    const firstStep = currentSession.steps.find(s => (s.imageId || s.dataUrl) && s.meta?.hostname);
    if (!firstStep) {
        alert('Keine gültigen Schritte für einen Guide gefunden.');
        return;
    }

    const hostname = firstStep.meta.hostname || '';
    const domainMatch = hostname.split('.').slice(-2).join('.');

    const tabs = await chrome.tabs.query({});
    let targetTab = tabs.find(t => {
        try {
            if (!t.url) return false;
            const tabUrl = new URL(t.url);
            return tabUrl.hostname === hostname || tabUrl.hostname.includes(hostname) || (domainMatch && tabUrl.hostname.includes(domainMatch));
        } catch (e) { return false; }
    });

    if (!targetTab) {
        const lastTabs = await chrome.tabs.query({ active: true, currentWindow: false });
        const lastTab = lastTabs[0];
        const confirmMsg = `Die Zielseite "${hostname}" wurde nicht direkt gefunden.\n\nSoll der Guide auf dem aktuell aktiven Tab gestartet werden?`;
        if (lastTab && confirm(confirmMsg)) {
            targetTab = lastTab;
        }
    }

    if (!targetTab) {
        alert(`Bitte öffnen Sie zuerst die Zielseite (${hostname}), um den Guide zu starten.`);
        return;
    }

    const guideSteps = currentSession.steps
        .filter(s => s.type !== 'chapter' && s.type !== 'textblock')
        .map(s => ({
            id: s.id,
            title: s.title,
            description: s.description,
            selector: s.selector,
            value: s.value
        }));

    if (guideSteps.length === 0) {
        alert('Keine ausführbaren Schritte für den RPA Live View gefunden.');
        return;
    }

    chrome.tabs.sendMessage(targetTab.id, {
        type: 'START_LIVE_VIEW',
        steps: guideSteps
    });

    chrome.tabs.update(targetTab.id, { active: true });
}

async function checkForUpdates() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/SaschaArend/eZSuite/main/manifest.json');
        if (!response.ok) return;
        const remoteManifest = await response.json();
        const remoteVersion = remoteManifest.version;
        const localVersion = chrome.runtime.getManifest().version;

        if (remoteVersion && remoteVersion !== localVersion && parseFloat(remoteVersion) > parseFloat(localVersion)) {
            const banner = document.getElementById('editorUpdateBanner');
            const versionSpan = document.getElementById('editorRemoteVersion');
            if (banner && versionSpan) {
                versionSpan.textContent = remoteVersion;
                banner.style.display = 'block';
                banner.onclick = () => {
                    alert(`Ein neues Update für eZSuite ist verfügbar!\n\nLokal installiert: v${localVersion}\nVerfügbar auf GitHub: v${remoteVersion}\n\nBitte schließe Google Chrome komplett und führe die Datei "update.bat" im Projektordner aus, um das Update automatisch durchzuführen.`);
                };
            }
        }
    } catch (e) {
        console.warn('[UpdateCheck] Fehler:', e);
    }
}

async function clearCacheAndFreeRam() {
    if (confirm('Möchtest du den Zwischenspeicher (Undo/Redo-Verlauf) und nicht mehr benötigte Bilder in der Datenbank bereinigen, um Speicherplatz und RAM freizugeben?\n\nDeine aktuellen Schritte und archivierten Dokumentationen bleiben erhalten, aber du kannst danach Aktionen für diese Session nicht mehr rückgängig machen.')) {
        try {
            undoStack = [];
            redoStack = [];
            if (currentSession) {
                delete currentSession.undoStack;
                delete currentSession.redoStack;
                await saveSession(true);
            }

            const gcStats = await EzImageStore.cleanupOrphanedImages([], false);

            revokeActiveObjectUrl();
            tempImage = null;
            if (currentStepIndex !== -1) {
                await selectStep(currentStepIndex);
            } else {
                renderCanvas();
            }

            const gcMsg = gcStats.deletedImages > 0
                ? `\n(${gcStats.deletedImages} verwaiste Bilder aus IndexedDB gelöscht)`
                : '\n(IndexedDB ist bereits sauber)';
            alert(`Zwischenspeicher erfolgreich geleert und RAM freigegeben!${gcMsg}`);
        } catch (e) {
            console.error('Clear cache error:', e);
            alert('Fehler beim Leeren des Caches.');
        }
    }
}

const defaultBranding = {
    primaryColor: '#4f46e5',
    fontFamily: 'Inter',
    logo: null,
    showHeader: true,
    headerText: '',
    showFooter: true,
    footerText: 'Erstellt mit eZNotes',
    showPageNumbers: true,
    bgStyle: 'none',
    frameRadius: 12,
    frameShadow: 20,
    framePadding: 32,
    enableTourAnimations: true,
    deviceFrame: false
};

function loadBrandingIntoModal() {
    const b = currentSession.branding || { ...defaultBranding };

    const color = b.primaryColor || '#4f46e5';
    document.getElementById('brandingPrimaryColor').value = color;
    updatePresetSelection(color);

    document.getElementById('brandingFontFamily').value = b.fontFamily || 'Inter';

    document.getElementById('brandingShowHeader').checked = b.showHeader !== false;
    document.getElementById('brandingHeaderText').value = b.headerText || '';
    document.getElementById('brandingShowFooter').checked = b.showFooter !== false;
    document.getElementById('brandingFooterText').value = b.footerText || 'Erstellt mit eZNotes';
    document.getElementById('brandingShowPageNumbers').checked = b.showPageNumbers !== false;

    const enableTourAnimEl = document.getElementById('brandingEnableTourAnimations');
    if (enableTourAnimEl) enableTourAnimEl.checked = b.enableTourAnimations !== false;

    const deviceFrameEl = document.getElementById('brandingDeviceFrame');
    if (deviceFrameEl) deviceFrameEl.checked = b.deviceFrame === true;

    const bgStyleEl = document.getElementById('brandingBgStyle');
    if (bgStyleEl) bgStyleEl.value = b.bgStyle || 'none';

    const radiusEl = document.getElementById('brandingFrameRadius');
    if (radiusEl) { radiusEl.value = b.frameRadius !== undefined ? b.frameRadius : 12; document.getElementById('valRadius').innerText = radiusEl.value + 'px'; }

    const shadowEl = document.getElementById('brandingFrameShadow');
    if (shadowEl) { shadowEl.value = b.frameShadow !== undefined ? b.frameShadow : 20; document.getElementById('valShadow').innerText = shadowEl.value + '%'; }

    const paddingEl = document.getElementById('brandingFramePadding');
    if (paddingEl) { paddingEl.value = b.framePadding !== undefined ? b.framePadding : 32; document.getElementById('valPadding').innerText = paddingEl.value + 'px'; }

    const preview = document.getElementById('brandingLogoPreview');
    if (b.logo) {
        preview.src = b.logo;
    } else {
        preview.src = '../assets/logo.png';
    }
}

function updatePresetSelection(color) {
    document.querySelectorAll('.color-preset').forEach(preset => {
        if (preset.dataset.color.toLowerCase() === color.toLowerCase()) {
            preset.style.border = '2px solid #000';
            preset.style.transform = 'scale(1.1)';
        } else {
            preset.style.border = '2px solid transparent';
            preset.style.transform = 'scale(1.0)';
        }
    });
}

function handleBrandingLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Bitte wähle eine Bilddatei aus.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        document.getElementById('brandingLogoPreview').src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function resetBrandingLogo() {
    document.getElementById('brandingLogoPreview').src = '../assets/logo.png';
    document.getElementById('logoUploadInput').value = '';
}

function saveBrandingFromModal() {
    if (!currentSession.branding) currentSession.branding = {};

    currentSession.branding.primaryColor = document.getElementById('brandingPrimaryColor').value;
    currentSession.branding.fontFamily = document.getElementById('brandingFontFamily').value;

    const previewSrc = document.getElementById('brandingLogoPreview').src;
    if (previewSrc.startsWith('data:')) {
        currentSession.branding.logo = previewSrc;
    } else {
        currentSession.branding.logo = null;
    }

    currentSession.branding.showHeader = document.getElementById('brandingShowHeader').checked;
    currentSession.branding.headerText = document.getElementById('brandingHeaderText').value;
    currentSession.branding.showFooter = document.getElementById('brandingShowFooter').checked;
    currentSession.branding.footerText = document.getElementById('brandingFooterText').value;
    currentSession.branding.showPageNumbers = document.getElementById('brandingShowPageNumbers').checked;

    const enableTourAnimEl = document.getElementById('brandingEnableTourAnimations');
    if (enableTourAnimEl) currentSession.branding.enableTourAnimations = enableTourAnimEl.checked;

    const deviceFrameEl = document.getElementById('brandingDeviceFrame');
    if (deviceFrameEl) currentSession.branding.deviceFrame = deviceFrameEl.checked;

    const bgStyleEl = document.getElementById('brandingBgStyle');
    if (bgStyleEl) currentSession.branding.bgStyle = bgStyleEl.value;

    const radiusEl = document.getElementById('brandingFrameRadius');
    if (radiusEl) currentSession.branding.frameRadius = parseInt(radiusEl.value, 10);

    const shadowEl = document.getElementById('brandingFrameShadow');
    if (shadowEl) currentSession.branding.frameShadow = parseInt(shadowEl.value, 10);

    const paddingEl = document.getElementById('brandingFramePadding');
    if (paddingEl) currentSession.branding.framePadding = parseInt(paddingEl.value, 10);

    saveSession();
    pushHistory('Branding-Einstellungen aktualisiert');
    alert('Branding-Einstellungen gespeichert!');
}
