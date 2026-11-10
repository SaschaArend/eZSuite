# eZSuite

**eZSuite** ist eine modulare, hochperformante Chrome-Erweiterung, die vier spezialisierte Produktivitäts-Tools unter einer gemeinsamen Oberfläche vereint:
1. **eZNotes** – Automatisierte Prozess-Dokumentation, Screenshots, Editor & RPA-Guides
2. **eZTimeTracker** – Intelligente Zeiterfassung, Ticket-Integration & PDF/CSV/Markdown-Export
3. **eZClip** – Text- & Clipboard-Studio mit Quick-Actions, Formatierung & Verlauf
4. **eZSnippetZ** – Code- & Text-Snippet-Vault inkl. Infor LN 4GL Tools, `//` Live-Web-Expander & dynamischen Variablen

---

## ✨ Die 4 Module im Überblick (v3.0)

### 1. 📝 eZNotes – Dokumentation & Prozess-Aufzeichnung
- **Smart-Capture**: Automatisches Erfassen von Screenshots und Metadaten (Seitentitel, Feldnamen, Session-Details, CSS-Selektoren) bei jedem Mausklick.
- **Editor & Datenschutz**: DSGVO-konformes Verpixelungs-Werkzeug (Blur-Tool), Smart-Cropping, Fokus-Marker (Rechtecke, Pfeile), Kapitel-Trenner sowie Undo/Redo.
- **Auto-Save & Bibliothek**: Rollierender Auto-Save-Verlauf (15 Stände) sowie lokale Ordner-Synchronisation über die File System Access API inkl. Versionshistorie und Bulk-Merge.
- **Vielfältige Exporte**: Druckoptimierter PDF-Export, YouTrack-Markdown, interaktive Browser-Slideshow, Offline-HTML-Tour und Live-Overlay-Guide.

### 2. ⏱️ eZTimeTracker – Zeiterfassung & Auswertung
- **Live- & Manuelle Erfassung**: Schnelles Ein-/Ausstempeln direkt im Popup oder detaillierte Buchung im Dashboard.
- **YouTrack Ticket-Ansicht**: CSV-Import und direkte Buchung auf Tickets inkl. Filterung und Status-Übersicht.
- **Reporting**: Export als gebrandetes PDF, CSV oder Markdown nach Tag, Woche, Monat oder Jahr.

### 3. 📋 eZClip – Text & Clipboard Transformer
- **Quick-Actions im Popup**: Bis zu 4 frei wählbare Schnellaktionen direkt im Popup mit einem Klick auf die Zwischenablage anwenden.
- **eZClip Studio**: Vollwertiger Tab-Editor für Clean/Trim, Case-Konvertierungen (`camelCase`, `snake_case`, `kebab-case`), JSON-Formatter, SQL-IN-Quoter, Sort & Unique, URL/Base64 sowie Suchen & Ersetzen (inkl. RegEx) und Clipboard-Historie.

### 4. 💻 eZSnippetZ – Personal Code & Snippet Vault
- **Live Web-Expander (`//`) & Kontextmenü**: Tippe in jedem beliebigen Textfeld im Browser `//` oder nutze das Rechtsklick-Menü (*„eZSnippetZ einfügen“*), um Snippets direkt einzufügen.
- **Dynamische Variablen & Live-Vorschau**: Unterstützt Platzhalter wie `{Name=Standard}`, Dropdowns `{Prio=[Hoch,Mittel,Tief]}`, `{Notiz:multiline}`, `{Code:uppercase}`, Datumsberechnung `{Datum+14}`, `{Clipboard}`, bedingte Blöcke `{#if Var}...{#else}...{/if}`, verschachtelte Snippets `[[Titel]]` sowie Globale Variablen.
- **Infor LN 4GL & Ordner-Sync**: Integrierter BaanC/4GL-Code-Formatter, Linter, Tabellen-Lexikon (`tccom100`, `tcibd001`, `tdsls400` u.v.m.), 30-Tage-Papierkorb und lokale Ordner-Synchronisation.

---

## ⚙️ Modul-Steuerung über `config.json`

Über die Datei `config.json` im Hauptverzeichnis lässt sich steuern, welche der 4 Tools in der Erweiterung sichtbar und aktiv sind:

```json
{
  "eZNotes": true,
  "eZTimeTracker": true,
  "eZClip": true,
  "eZSnippetZ": true
}
```

Tools mit dem Wert `false` werden im Popup-Karussell sowie in den Hintergrund-Diensten automatisch ausgeblendet.

---

## 🚀 Installation & Update (`update.bat`)

1. Führe die Datei `update.bat` aus:
   - **Erstinstallation**: Lädt das Tool von GitHub herunter, fragt interaktiv ab, welche der 4 Module genutzt werden sollen (sofern keine fertige `config.json` beigelegt wurde) und erstellt die `config.json`.
   - **Update**: Aktualisiert eine bestehende Installation auf die neueste GitHub-Version, wobei deine lokale `config.json` unverändert erhalten bleibt.
2. Öffne Google Chrome und navigiere zu `chrome://extensions/`.
3. Aktiviere oben rechts den **Entwicklermodus**.
4. Klicke auf **Entpackte Erweiterung laden** und wähle den Installationsordner aus.

---
*Copyright © 2026 Sascha Arend.*
