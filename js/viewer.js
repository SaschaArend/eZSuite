const createdObjectUrls = [];

window.addEventListener('beforeunload', () => {
    createdObjectUrls.forEach(url => URL.revokeObjectURL(url));
    createdObjectUrls.length = 0;
});

document.getElementById('btnPrint').addEventListener('click', () => {
    window.print();
});

chrome.storage.local.get('exportData', async (data) => {
    if (!data.exportData) {
        document.getElementById('content').innerHTML = '<p>Keine Daten gefunden.</p>';
        return;
    }

    const { title, date, steps, logo, branding } = data.exportData;

    applyBranding(branding, logo);
    document.title = title;

    const resolvedStepUrls = await Promise.all(steps.map(async (step) => {
        if (step.type === 'chapter' || step.type === 'textblock') return null;
        if (step.dataUrl) return step.dataUrl;
        const imgKey = step.exportImageId || step.imageId;
        if (imgKey && typeof EzImageStore !== 'undefined') {
            const blob = await EzImageStore.getBlob(imgKey);
            if (blob) {
                const objUrl = URL.createObjectURL(blob);
                createdObjectUrls.push(objUrl);
                return objUrl;
            }
        }
        return '';
    }));

    let html = '';

    if (branding && branding.showHeader) {
        html += `
            <div class="print-header">
                <span>${escapeHtml(branding.headerText || title)}</span>
                <span>${escapeHtml(date)}</span>
            </div>
        `;
    }

    html += `
        <div class="viewer-header">
            <div>
                <h1>${escapeHtml(title)}</h1>
                <p class="meta">Dokumentation erstellt am ${escapeHtml(date)}</p>
            </div>
            ${logo ? `<img src="${logo}" class="viewer-logo">` : ''}
        </div>
    `;

    let stepCount = 0;
    steps.forEach((step, i) => {
        if (step.type === 'chapter') {
            html += `
                <div class="step chapter-step">
                    <h2>${escapeHtml(step.title || 'Kapitel')}</h2>
                    <div class="chapter-divider"></div>
                </div>
            `;
        } else if (step.type === 'textblock') {
            html += `
                <div class="step textblock-step">
                    <h2>📝 ${escapeHtml(step.title || 'Information')}</h2>
                    <div class="textblock-content">
                        ${step.content || ''}
                    </div>
                </div>
            `;
        } else {
            stepCount++;
            const imgSrc = resolvedStepUrls[i] || '';
            html += `
                <div class="step">
                    <h2><span class="step-number">${stepCount}</span> ${escapeHtml(step.title || 'Schritt')}</h2>
                    ${(step.session || step.field) ? `
                        <div class="infor-meta-box">
                            ${step.session ? `
                                <div class="meta-item">
                                    <span class="meta-icon">🖥️</span>
                                    <span class="meta-label">Session:</span>
                                    <span class="meta-value">${escapeHtml(step.session)}</span>
                                </div>
                            ` : ''}
                            ${step.field ? `
                                <div class="meta-item">
                                    <span class="meta-icon">📋</span>
                                    <span class="meta-label">Feld:</span>
                                    <span class="meta-value">${escapeHtml(step.field)}</span>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    <img src="${imgSrc}" data-step-idx="${i}" alt="Schritt ${stepCount}">
                    ${step.description ? `<div class="desc">${escapeHtml(step.description)}</div>` : ''}
                </div>
            `;
        }
    });

    if (branding && branding.showFooter) {
        html += `
            <div class="print-footer">
                <span>${escapeHtml(branding.footerText || 'Erstellt mit eZNotes')}</span>
                ${branding.showPageNumbers ? `<span class="page-number-box">Seite <span class="page-number"></span></span>` : ''}
            </div>
        `;
    }

    document.getElementById('content').innerHTML = html;

    document.getElementById('btnDownloadPDF').addEventListener('click', () => {
        const element = document.getElementById('content');
        const cleanTitle = title.replace(/[^\w\s\-_äöüÄÖÜß]/g, '').trim();
        const filename = `${cleanTitle || 'eZNotes-Dokumentation'}.pdf`;

        const opt = {
            margin:       [15, 12, 15, 12],
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.92 },
            html2canvas:  {
                scale: 2,
                useCORS: true,
                logging: false,
                letterRendering: true,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        const btn = document.getElementById('btnDownloadPDF');
        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ PDF wird generiert...';
        btn.disabled = true;

        html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf) => {
            const totalPages = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);

                if (branding && branding.showHeader) {
                    pdf.setFontSize(8);
                    pdf.setTextColor(100);
                    pdf.text(branding.headerText || title, 12, 10);
                    pdf.text(date, 210 - 12 - pdf.getTextWidth(date), 10);

                    pdf.setDrawColor(226, 232, 240);
                    pdf.setLineWidth(0.2);
                    pdf.line(12, 12, 210 - 12, 12);
                }

                if (branding && branding.showFooter) {
                    pdf.setFontSize(8);
                    pdf.setTextColor(100);
                    pdf.text(branding.footerText || 'Erstellt mit eZNotes', 12, 297 - 10);

                    if (branding.showPageNumbers) {
                        const pageStr = `Seite ${i} von ${totalPages}`;
                        pdf.text(pageStr, 210 - 12 - pdf.getTextWidth(pageStr), 297 - 10);
                    }

                    pdf.setDrawColor(226, 232, 240);
                    pdf.setLineWidth(0.2);
                    pdf.line(12, 297 - 12, 210 - 12, 297 - 12);
                }
            }
        }).save().then(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }).catch(err => {
            console.error('PDF Generierungsfehler:', err);
            btn.innerHTML = originalText;
            btn.disabled = false;
            alert('Fehler bei der PDF-Erstellung: ' + err.message);
        });
    });

    document.getElementById('btnDownloadHTML').addEventListener('click', async () => {
        const cleanTitle = title.replace(/[^\w\s\-_äöüÄÖÜß]/g, '').trim();
        const filename = `${cleanTitle || 'eZNotes-Dokumentation'}.html`;

        const styles = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML).join('\n');

        const contentClone = document.getElementById('content').cloneNode(true);
        const imgs = contentClone.querySelectorAll('img[data-step-idx]');
        for (const imgEl of imgs) {
            const idx = parseInt(imgEl.getAttribute('data-step-idx'), 10);
            const step = steps[idx];
            if (step) {
                if (step.dataUrl) {
                    imgEl.src = step.dataUrl;
                } else {
                    const imgKey = step.exportImageId || step.imageId;
                    if (imgKey && typeof EzImageStore !== 'undefined') {
                        const dataUrl = await EzImageStore.getDataUrl(imgKey);
                        if (dataUrl) imgEl.src = dataUrl;
                    }
                }
            }
            imgEl.removeAttribute('data-step-idx');
        }

        const htmlContent = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    <div id="content">
        ${contentClone.innerHTML}
    </div>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
});

function applyBranding(branding, logo) {
    if (!branding) return;

    const primaryColor = branding.primaryColor || '#4f46e5';
    const fontFamily = branding.fontFamily || 'Inter';

    let css = `
        :root {
            --primary: ${primaryColor};
            --primary-grad: linear-gradient(135deg, ${primaryColor} 0%, ${adjustColorBrightness(primaryColor, -20)} 100%);
        }
        body {
            font-family: '${fontFamily}', sans-serif;
        }
    `;

    if (fontFamily !== 'Inter' && fontFamily !== 'system-ui' && fontFamily !== 'Courier New') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@400;500;600;700;800&display=swap`;
        document.head.appendChild(link);
    }

    let brandingStyleTag = document.getElementById('branding-styles');
    if (!brandingStyleTag) {
        brandingStyleTag = document.createElement('style');
        brandingStyleTag.id = 'branding-styles';
        document.head.appendChild(brandingStyleTag);
    }
    brandingStyleTag.innerHTML = css;

    const logoEl = document.querySelector('.viewer-logo');
    if (logoEl && logo) {
        logoEl.src = logo;
    }
}

function adjustColorBrightness(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    R = (R > 0) ? R : 0;
    G = (G > 0) ? G : 0;
    B = (B > 0) ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
