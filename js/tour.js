let currentSlideIndex = 0;
let slidesData = [];
let tourObjectUrls = [];

window.addEventListener('beforeunload', () => {
    tourObjectUrls.forEach(url => URL.revokeObjectURL(url));
    tourObjectUrls.length = 0;
});

function init() {
    if (window.__data) {
        startTour(window.__data);
    } else {
        chrome.storage.local.get('exportData', (data) => {
            if (data.exportData) {
                startTour(data.exportData);
            } else {
                document.body.innerHTML = '<div class="background"><h1>Keine Daten gefunden.</h1></div>';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();

async function startTour(data) {
    const { title, date, steps, logo, branding } = data;
    window.tourBranding = branding;
    document.title = title;

    if (typeof EzImageStore !== 'undefined' && Array.isArray(steps)) {
        await Promise.all(steps.map(async (step) => {
            if (step.type === 'chapter' || step.type === 'textblock') return;
            if (!step.dataUrl) {
                const imgKey = step.exportImageId || step.imageId;
                if (imgKey) {
                    const blob = await EzImageStore.getBlob(imgKey);
                    if (blob) {
                        const objUrl = URL.createObjectURL(blob);
                        tourObjectUrls.push(objUrl);
                        step.dataUrl = objUrl;
                    }
                }
            }
        }));
    }

    slidesData = [];
    steps.forEach((step, stepIdx) => {
        if (step.type === 'chapter' || step.type === 'textblock') {
            slidesData.push({ ...step, originalStepIdx: stepIdx });
        } else {
            const markers = (step.markers || []).filter(m => m.type !== 'blur');
            if (markers.length === 0) {
                slidesData.push({ ...step, originalStepIdx: stepIdx });
            } else {
                markers.forEach((marker, markerIdx) => {
                    slidesData.push({
                        ...step,
                        activeMarkerIndex: step.markers.indexOf(marker),
                        subLabel: markers.length > 1 ? ` (${markerIdx + 1}/${markers.length})` : '',
                        originalStepIdx: stepIdx
                    });
                });
            }
        }
    });

    const logoImg = document.getElementById('tourLogo');
    if (logo && logoImg) {
        logoImg.src = logo;
        logoImg.style.display = 'block';
    }

    renderSlides(title);
    updateProgress();
    showSlide(0);
}

function renderSlides(docTitle) {
    const container = document.getElementById('slideshow');
    const progressContainer = document.getElementById('progressContainer');

    container.innerHTML = '';
    progressContainer.innerHTML = '';

    const startSlide = document.createElement('div');
    startSlide.className = 'mySlides fade';
    startSlide.innerHTML = `
        <div class="background">
            <div class="title">${escapeHtml(docTitle)}</div>
            <div class="subtitle">Interaktive Klickanleitung</div>
            <div class="subtitle">${new Date().toLocaleDateString()}</div>
            <button class="start-btn" id="startTourBtn">Tour Starten</button>
        </div>
    `;
    container.appendChild(startSlide);
    document.getElementById('startTourBtn').addEventListener('click', nextSlide);

    slidesData.forEach((slideData, i) => {
        const slide = document.createElement('div');
        slide.className = 'mySlides fade';

        if (slideData.type === 'chapter') {
            slide.style.cursor = 'pointer';
            slide.innerHTML = `
                <div class="background" style="background: linear-gradient(135deg, #1e293b 0%, #020617 100%); color: white; cursor: pointer;">
                    <div style="font-size: 42px; margin-bottom: 20px;">🔖</div>
                    <div class="title" style="color: white;">${escapeHtml(slideData.title || 'Kapitel')}</div>
                    <div class="subtitle" style="color: var(--text-muted);">Prozessabschnitt</div>
                </div>
            `;
            slide.onclick = () => {
                nextSlide();
            };
        } else if (slideData.type === 'textblock') {
            slide.style.cursor = 'pointer';
            slide.innerHTML = `
                <div class="background" style="background: var(--bg-dark); padding: 80px 40px; text-align: left; align-items: flex-start; justify-content: flex-start; overflow-y: auto; cursor: pointer;">
                    <div style="max-width: 900px; width: 100%; margin: 60px auto; animation: slideUp 0.8s ease-out;">
                        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 32px;">
                            <span style="background: rgba(79, 70, 229, 0.1); color: var(--primary-light); padding: 8px 18px; border-radius: 20px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Information</span>
                            <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.06);"></div>
                        </div>
                        <h1 style="font-size: 48px; font-weight: 800; color: white; margin-bottom: 40px; line-height: 1.2; letter-spacing: -0.03em;">
                            ${escapeHtml(slideData.title || 'Wichtiger Hinweis')}
                        </h1>
                        <div class="text-content" style="font-size: 22px; line-height: 1.8; color: var(--text-muted);">
                            ${slideData.content || ''}
                        </div>
                    </div>
                </div>
            `;
            slide.onclick = () => {
                nextSlide();
            };
        } else {
            const markers = slideData.markers || [];
            slide.innerHTML = `
                <div class="image-container">
                    <div class="image-wrapper"><img src="${slideData.dataUrl || ''}" class="step-img" id="img-${i}">
                        ${markers.map((m, mi) => {
                if (m.type === 'blur') return '';
                const isActive = slideData.activeMarkerIndex === mi;
                return `
                                <div class="box marker-box ${isActive ? 'pulse' : 'dimmed'}"
                                     id="box-${i}-${mi}"
                                     style="position: absolute; z-index: 100; ${isActive ? 'cursor: pointer; pointer-events: auto;' : 'display: none;'}">
                                </div>
                            `;
            }).join('')}
                        <div class="bubble" id="bubble-${i}">
                            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                                Schritt ${i + 1} von ${slidesData.length} ${slideData.subLabel || ''}
                            </div>
                            <b>${escapeHtml(slideData.title || 'Schritt ' + (i + 1))}</b>
                            ${(slideData.session || slideData.field) ? `
                                <div style="font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--primary-light); margin: 12px 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
                                    ${slideData.session ? `<div>SC: <span class="copy-trigger" data-copy="${slideData.session}" title="Klicken zum Kopieren">${escapeHtml(slideData.session)}</span></div>` : ''}
                                    ${slideData.field ? `<div>TF: <span class="copy-trigger" data-copy="${slideData.field}" title="Klicken zum Kopieren">${escapeHtml(slideData.field)}</span></div>` : ''}
                                </div>
                            ` : ''}
                            ${slideData.description ? `<div style="margin-top:12px; line-height: 1.5; color: #cbd5e1;">${escapeHtml(slideData.description)}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        container.appendChild(slide);

        const segment = document.createElement('div');
        segment.className = 'progress-segment';
        segment.onclick = (e) => {
            e.stopPropagation();
            showSlide(i + 1);
        };
        progressContainer.appendChild(segment);

        if (slideData.type !== 'chapter' && slideData.type !== 'textblock') {
            const img = document.getElementById(`img-${i}`);
            if (img) {
                if (img.complete) {
                    positionOverlays(i, slideData);
                } else {
                    img.onload = () => positionOverlays(i, slideData);
                }
            }
        }
    });

    const endSlide = document.createElement('div');
    endSlide.className = 'mySlides fade';
    endSlide.innerHTML = `
        <div class="background">
            <div class="title">Vielen Dank!</div>
            <div class="subtitle">Die Dokumentations-Tour ist beendet.</div>
            <button class="start-btn" id="restartTourBtn">Tour neu starten</button>
        </div>
    `;
    container.appendChild(endSlide);
    document.getElementById('restartTourBtn').addEventListener('click', () => showSlide(0));
}

function positionOverlays(index, slideData) {
    if (slideData.type === 'chapter' || slideData.type === 'textblock') return;
    const img = document.getElementById(`img-${index}`);
    const bubble = document.getElementById(`bubble-${index}`);

    if (!img || !bubble) return;

    const dpr = slideData.meta?.devicePixelRatio || 1;
    const rect = {
        width: img.offsetWidth,
        height: img.offsetHeight
    };
    if (rect.width === 0) {
        const slides = document.querySelectorAll(".mySlides");
        if (slides[currentSlideIndex] === slides[index + 1]) {
            setTimeout(() => positionOverlays(index, slideData), 100);
        }
        return;
    }

    const setBoxStyle = (box, marker) => {
        const offset = 5;
        const rx = marker.x - offset;
        const ry = marker.y - offset;
        const rw = marker.width + (offset * 2);
        const rh = marker.height + (offset * 2);

        const xRatio = (rx * dpr) / img.naturalWidth;
        const yRatio = (ry * dpr) / img.naturalHeight;
        const bWidth = (rw * dpr) / img.naturalWidth * rect.width;
        const bHeight = (rh * dpr) / img.naturalHeight * rect.height;

        box.style.width = bWidth + 'px';
        box.style.height = bHeight + 'px';
        box.style.left = (xRatio * rect.width) + 'px';
        box.style.top = (yRatio * rect.height) + 'px';

        return {
            xRatio: (marker.x + marker.width / 2) * dpr / img.naturalWidth,
            yRatio: (marker.y + marker.height / 2) * dpr / img.naturalHeight,
            leftRatio: marker.x * dpr / img.naturalWidth,
            rightRatio: (marker.x + marker.width) * dpr / img.naturalWidth,
            topRatio: marker.y * dpr / img.naturalHeight,
            bottomRatio: (marker.y + marker.height) * dpr / img.naturalHeight
        };
    };

    let activePos = null;

    if (slideData.markers && slideData.markers.length > 0) {
        slideData.markers.forEach((m, mi) => {
            if (m.type === 'blur') return;
            const box = document.getElementById(`box-${index}-${mi}`);
            const pos = box ? setBoxStyle(box, m) : null;
            if (mi === slideData.activeMarkerIndex && pos) {
                activePos = pos;

                box.onclick = (e) => {
                    e.stopPropagation();
                    nextSlide();
                };
                box.onmouseover = () => {
                    box.style.boxShadow = '0 0 15px 5px rgba(239, 68, 68, 0.7)';
                };
                box.onmouseout = () => {
                    box.style.boxShadow = '';
                };
            }
        });
        if (!activePos && slideData.markers.length > 0) {
            const first = slideData.markers.find(m => m.type !== 'blur') || slideData.markers[0];
            activePos = {
                xRatio: (first.x + first.width / 2) * dpr / img.naturalWidth,
                yRatio: (first.y + first.height / 2) * dpr / img.naturalHeight,
                leftRatio: first.x * dpr / img.naturalWidth,
                rightRatio: (first.x + first.width) * dpr / img.naturalWidth,
                topRatio: first.y * dpr / img.naturalHeight,
                bottomRatio: (first.y + first.height) * dpr / img.naturalHeight
            };
        }
    } else if (slideData.rect) {
        const box = document.getElementById(`box-${index}`);
        if (box) {
            activePos = setBoxStyle(box, slideData.rect);
        }
    } else if (slideData.x && slideData.y) {
        const targetXRatio = (slideData.x * dpr) / img.naturalWidth;
        const targetYRatio = (slideData.y * dpr) / img.naturalHeight;
        const box = document.getElementById(`box-${index}`);
        const boxSize = 60;
        if (box) {
            box.style.width = boxSize + 'px';
            box.style.height = boxSize + 'px';
            box.style.left = `calc(${targetXRatio * 100}% - ${boxSize / 2}px)`;
            box.style.top = `calc(${targetYRatio * 100}% - ${boxSize / 2}px)`;
        }
        activePos = {
            xRatio: targetXRatio,
            yRatio: targetYRatio,
            leftRatio: targetXRatio - (boxSize / 2) / rect.width,
            rightRatio: targetXRatio + (boxSize / 2) / rect.width,
            topRatio: targetYRatio - (boxSize / 2) / rect.height,
            bottomRatio: targetYRatio + (boxSize / 2) / rect.height
        };
    }

    if (!activePos) {
        bubble.className = "bubble";
        bubble.style.left = "50%";
        bubble.style.top = "50%";
        bubble.style.transform = "translate(-50%, -50%)";
        bubble.style.position = "absolute";
        return;
    }

    let bubbleClass = 'arrow-left';
    let leftPx = activePos.rightRatio * rect.width + 16;
    let topPx = activePos.yRatio * rect.height - 36;

    if (leftPx + 340 > rect.width) {
        const leftSpaceOption = activePos.leftRatio * rect.width - 340 - 16;
        if (leftSpaceOption >= 10) {
            bubbleClass = 'arrow-right';
            leftPx = leftSpaceOption;
        } else {
            const rightSpace = rect.width - (activePos.rightRatio * rect.width);
            const leftSpace = activePos.leftRatio * rect.width;
            if (rightSpace > leftSpace) {
                bubbleClass = 'arrow-left';
                leftPx = Math.max(10, Math.min(rect.width - 350, activePos.rightRatio * rect.width + 16));
            } else {
                bubbleClass = 'arrow-right';
                leftPx = Math.max(10, Math.min(rect.width - 350, activePos.leftRatio * rect.width - 340 - 16));
            }
        }
    } else {
        leftPx = Math.max(10, leftPx);
    }

    const bubbleHeight = bubble.offsetHeight || 220;
    topPx = Math.max(10, Math.min(rect.height - bubbleHeight - 10, topPx));

    let arrowTop = (activePos.yRatio * rect.height) - topPx - 12;
    arrowTop = Math.max(16, Math.min(bubbleHeight - 40, arrowTop));

    bubble.className = `bubble ${bubbleClass}`;
    bubble.style.left = leftPx + 'px';
    bubble.style.top = topPx + 'px';
    bubble.style.transform = '';
    bubble.style.setProperty('--arrow-top', arrowTop + 'px');

    const vCursor = document.getElementById('virtual-cursor');
    const cRipple = document.getElementById('cursor-ripple');
    const animationsEnabled = !window.tourBranding || window.tourBranding.enableTourAnimations !== false;

    if (vCursor) {
        if (!animationsEnabled) {
            vCursor.style.display = 'none';
        } else {
            vCursor.style.display = 'block';
            const imgRect = img.getBoundingClientRect();
            const targetLeft = imgRect.left + (activePos.xRatio * imgRect.width);
            const targetTop = imgRect.top + (activePos.yRatio * imgRect.height);

            vCursor.style.opacity = '1';

            if (!vCursor.dataset.initialized) {
                vCursor.style.transition = 'none';
                vCursor.style.left = targetLeft + 'px';
                vCursor.style.top = targetTop + 'px';
                vCursor.offsetHeight;
                vCursor.style.transition = 'left 0.6s cubic-bezier(0.2, 0, 0, 1), top 0.6s cubic-bezier(0.2, 0, 0, 1)';
                vCursor.dataset.initialized = 'true';
            } else {
                vCursor.style.left = targetLeft + 'px';
                vCursor.style.top = targetTop + 'px';
            }

            setTimeout(() => {
                if (cRipple) {
                    cRipple.style.transition = 'none';
                    cRipple.style.transform = 'scale(0.1)';
                    cRipple.style.opacity = '1';
                    cRipple.offsetHeight;
                    cRipple.style.transition = 'all 0.5s cubic-bezier(0.1, 0.9, 0.2, 1)';
                    cRipple.style.transform = 'scale(2.5)';
                    cRipple.style.opacity = '0';
                }

                const wrapper = img.closest('.image-wrapper');
                if (wrapper) {
                    wrapper.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                    wrapper.style.transformOrigin = `${activePos.xRatio * 100}% ${activePos.yRatio * 100}%`;
                    wrapper.style.transform = 'scale(1.15)';
                }
            }, 600);
        }
    }
}

function showSlide(n) {
    const slides = document.querySelectorAll(".mySlides");
    if (!slides.length) return;

    if (n >= slides.length) n = slides.length - 1;
    if (n < 0) n = 0;

    currentSlideIndex = n;

    slides.forEach(s => {
        s.style.display = "none";
        const wrapper = s.querySelector('.image-wrapper');
        if (wrapper) {
            wrapper.classList.remove('zoom-in');
            wrapper.style.transform = 'scale(1)';
        }
    });

    const activeSlide = slides[currentSlideIndex];
    activeSlide.style.display = "flex";

    const activeWrapper = activeSlide.querySelector('.image-wrapper');
    if (activeWrapper) {
        setTimeout(() => activeWrapper.classList.add('zoom-in'), 50);
    }

    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    if (btnPrev) btnPrev.disabled = (currentSlideIndex === 0);
    if (btnNext) btnNext.disabled = (currentSlideIndex === slides.length - 1);

    const slideDataIndex = currentSlideIndex - 1;
    if (slidesData[slideDataIndex]) {
        const slideData = slidesData[slideDataIndex];
        if (slideData.type !== 'chapter' && slideData.type !== 'textblock') {
            positionOverlays(slideDataIndex, slideData);
        }
    }

    updateProgress();
}

function nextSlide() { showSlide(currentSlideIndex + 1); }
function prevSlide() { showSlide(currentSlideIndex - 1); }

function updateProgress() {
    const segments = document.querySelectorAll('.progress-segment');
    segments.forEach((seg, i) => {
        seg.classList.toggle('active', i < currentSlideIndex);
    });
}

document.getElementById('btnPrev').addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); });
document.getElementById('btnNext').addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
});

window.addEventListener('resize', () => {
    const dataIndex = currentSlideIndex - 1;
    if (slidesData[dataIndex]) {
        const vCursor = document.getElementById('virtual-cursor');
        if (vCursor) vCursor.style.transition = 'none';
        positionOverlays(dataIndex, slidesData[dataIndex]);
        if (vCursor) {
            vCursor.offsetHeight;
            vCursor.style.transition = 'left 0.6s cubic-bezier(0.2, 0, 0, 1), top 0.6s cubic-bezier(0.2, 0, 0, 1)';
        }
    }
});

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.addEventListener('click', (e) => {
    const copyTarget = e.target.closest('[data-copy]');
    if (copyTarget) {
        const text = copyTarget.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
            const originalHtml = copyTarget.innerHTML;
            copyTarget.innerHTML = '<span style="color: #10b981;">Kopiert!</span>';
            copyTarget.style.pointerEvents = 'none';
            setTimeout(() => {
                copyTarget.innerHTML = originalHtml;
                copyTarget.style.pointerEvents = 'auto';
            }, 1000);
        }).catch(err => {
            console.error('Copy failed:', err);
        });
    }
});
