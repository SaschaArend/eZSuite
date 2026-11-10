@echo off
setlocal enabledelayedexpansion
color 0F
echo ===============================================================
echo eZSuite - Installation ^& Automatisches Update (GitHub)
echo ===============================================================
echo.

set "REPO_URL=https://github.com/SaschaArend/eZSuite/archive/refs/heads/main.zip"
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "TARGET_DIR=%USERPROFILE%\eZSuite"
if exist "%SCRIPT_DIR%\manifest.json" (
    set "TARGET_DIR=%SCRIPT_DIR%"
) else if exist "%USERPROFILE%\eZSuite\manifest.json" (
    set "TARGET_DIR=%USERPROFILE%\eZSuite"
) else if exist "%USERPROFILE%\eZNotes\manifest.json" (
    set "TARGET_DIR=%USERPROFILE%\eZNotes"
)

set "TEMP_ZIP=%TEMP%\ezsuite_update.zip"
set "EXTRACT_DIR=%TEMP%\ezsuite_extract"
set "CFG_BACKUP=%TEMP%\ezsuite_config_backup.json"

set "FIRST_INSTALL=0"
if not exist "%TARGET_DIR%\manifest.json" (
    set "FIRST_INSTALL=1"
    echo INFO: Erstinstallation erkannt. Zielordner: %TARGET_DIR%
) else (
    echo INFO: Vorhandene Installation gefunden in: %TARGET_DIR%
)

set "HAS_PRECONFIG=0"
if exist "%CFG_BACKUP%" del /q "%CFG_BACKUP%"

if "%FIRST_INSTALL%"=="0" (
    if exist "%TARGET_DIR%\config.json" (
        copy /y "%TARGET_DIR%\config.json" "%CFG_BACKUP%" >nul
    )
) else (
    if exist "%SCRIPT_DIR%\config.json" (
        copy /y "%SCRIPT_DIR%\config.json" "%CFG_BACKUP%" >nul
        set "HAS_PRECONFIG=1"
    ) else if exist "%TARGET_DIR%\config.json" (
        copy /y "%TARGET_DIR%\config.json" "%CFG_BACKUP%" >nul
        set "HAS_PRECONFIG=1"
    )
)

echo.
if not defined REPO_URL (
    color 0E
    echo HINWEIS: REPO_URL ist aktuell auskommentiert - GitHub-Download wird uebersprungen,
    echo          damit deine aktuellen lokalen Dateien nicht ueberschrieben werden!
    echo.
    if exist "%CFG_BACKUP%" del /q "%CFG_BACKUP%"
    goto :AFTER_DOWNLOAD
)

echo 1. Lade neueste Version von GitHub herunter...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%REPO_URL%' -OutFile '%TEMP_ZIP%'"

if not exist "%TEMP_ZIP%" (
    echo.
    color 0C
    echo FEHLER: Download fehlgeschlagen! Bitte Internetverbindung pruefen.
    pause
    exit /b
)

echo 2. Entpacke Dateien...
if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%"
mkdir "%EXTRACT_DIR%"
powershell -Command "Expand-Archive -LiteralPath '%TEMP_ZIP%' -DestinationPath '%EXTRACT_DIR%' -Force"

set "SOURCE_SUBDIR="
for /d %%i in ("%EXTRACT_DIR%\*") do set "SOURCE_SUBDIR=%%i"

if not defined SOURCE_SUBDIR (
    echo.
    color 0C
    echo FEHLER: Entpacken fehlgeschlagen oder Quellordner nicht gefunden!
    del /q "%TEMP_ZIP%"
    rmdir /s /q "%EXTRACT_DIR%"
    pause
    exit /b
)

if "%FIRST_INSTALL%"=="0" (
    set "LOCAL_VERSION=0.0"
    if exist "%TARGET_DIR%\manifest.json" (
        for /f "delims=" %%v in ('powershell -Command "(Get-Content '%TARGET_DIR%\manifest.json' | ConvertFrom-Json).version"') do set "LOCAL_VERSION=%%v"
    )

    set "NEW_VERSION=0.0"
    if exist "%SOURCE_SUBDIR%\manifest.json" (
        for /f "delims=" %%v in ('powershell -Command "(Get-Content '%SOURCE_SUBDIR%\manifest.json' | ConvertFrom-Json).version"') do set "NEW_VERSION=%%v"
    )

    echo.
    echo ===============================================================
    echo Lokale Version:  v!LOCAL_VERSION!
    echo GitHub Version:  v!NEW_VERSION!
    echo ===============================================================
    echo.

    if "!LOCAL_VERSION!"=="!NEW_VERSION!" (
        color 0A
        echo Deine Version (v!LOCAL_VERSION!) ist bereits aktuell!
        set /p "CHOICE=Moechtest du sie trotzdem neu installieren? (J/N): "
        if /i "!CHOICE!" neq "J" (
            echo.
            echo Update abgebrochen.
            del /q "%TEMP_ZIP%"
            rmdir /s /q "%EXTRACT_DIR%"
            if exist "%CFG_BACKUP%" del /q "%CFG_BACKUP%"
            timeout /t 3 >nul
            exit /b
        )
    ) else (
        echo Ein neues Update ist verfuegbar (v!LOCAL_VERSION! -^> v!NEW_VERSION!)!
    )
)

echo 3. Speichere Dateien in %TARGET_DIR%...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
xcopy "%SOURCE_SUBDIR%\*" "%TARGET_DIR%\" /s /e /y /q >nul

if exist "%CFG_BACKUP%" (
    copy /y "%CFG_BACKUP%" "%TARGET_DIR%\config.json" >nul
    del /q "%CFG_BACKUP%"
)

echo 4. Bereinige temporaere Dateien...
del /q "%TEMP_ZIP%"
rmdir /s /q "%EXTRACT_DIR%"

:AFTER_DOWNLOAD
if "%FIRST_INSTALL%"=="1" (
    if "%HAS_PRECONFIG%"=="1" (
        echo.
        echo INFO: Mitgelieferte config.json wurde erkannt und uebernommen!
    ) else (
        cls
        color 0E
        echo ===============================================================
        echo MODUL-AUSWAHL FUER DEINE eZSuite INSTALLATION
        echo ===============================================================
        echo.
        echo Bitte waehle aus, welche der 4 Tools du in der eZSuite nutzen
        echo moechtest (J = Aktivieren, N = Ausblenden, Enter = J):
        echo.

        set "USE_NOTES=true"
        set "USE_TRACKER=true"
        set "USE_CLIP=true"
        set "USE_SNIPPETZ=true"

        set "ANS_1=J"
        set /p "ANS_1=1. eZNotes (Dokumentation & Screenshots) nutzen?  [J/N]: "
        if /i "!ANS_1!"=="N" set "USE_NOTES=false"

        set "ANS_2=J"
        set /p "ANS_2=2. eZTimeTracker (Zeiterfassung) nutzen?          [J/N]: "
        if /i "!ANS_2!"=="N" set "USE_TRACKER=false"

        set "ANS_3=J"
        set /p "ANS_3=3. eZClip (Text & Clipboard Studio) nutzen?       [J/N]: "
        if /i "!ANS_3!"=="N" set "USE_CLIP=false"

        set "ANS_4=J"
        set /p "ANS_4=4. eZSnippetZ (Code & Text Snippet Vault) nutzen? [J/N]: "
        if /i "!ANS_4!"=="N" set "USE_SNIPPETZ=false"

        if "!USE_NOTES!"=="false" if "!USE_TRACKER!"=="false" if "!USE_CLIP!"=="false" if "!USE_SNIPPETZ!"=="false" (
            echo.
            echo HINWEIS: Mindestens ein Tool muss aktiv sein - eZNotes wurde aktiviert.
            set "USE_NOTES=true"
        )

        (
            echo {
            echo   "eZNotes": !USE_NOTES!,
            echo   "eZTimeTracker": !USE_TRACKER!,
            echo   "eZClip": !USE_CLIP!,
            echo   "eZSnippetZ": !USE_SNIPPETZ!
            echo }
        ) > "%TARGET_DIR%\config.json"

        echo.
        echo Konfiguration wurde in "%TARGET_DIR%\config.json" gespeichert!
        timeout /t 2 >nul
    )
)

echo.
echo ===============================================================
if "%FIRST_INSTALL%"=="1" (
    cls
    color 0B
    echo ===============================================================
    echo INSTALLATION FAST ABGESCHLOSSEN!
    echo ===============================================================
    echo.
    echo 1. Druecken Sie eine Taste, um Google Chrome zu oeffnen...
    pause >nul
    
    echo    Chrome wird geoeffnet...
    start chrome chrome://extensions
    echo.
    echo Bitte fuehren Sie nun die restlichen Schritte in Chrome aus:
    echo.
    echo 2. Falls die Seite 'chrome://extensions' nicht automatisch laedt:
    echo    Geben Sie 'chrome://extensions' manuell in die Adresszeile ein.
    echo.
    echo 3. Aktivieren Sie den Schalter 'Entwicklermodus' ^(oben rechts^).
    echo 4. Klicken Sie oben auf 'Entpackte Erweiterung laden'.
    echo 5. Waehlen Sie diesen Ordner aus:
    echo    %TARGET_DIR%
    echo 6. Klicken Sie auf 'Ordner auswaehlen'.
    echo.
    echo ===============================================================
    echo Druecken Sie eine Taste, wenn Sie fertig sind...
    pause >nul
) else (
    color 0A
    echo UPDATE ERFOLGREICH ABGESCHLOSSEN!
    echo ===============================================================
    echo.
    echo Die Erweiterung wurde aktualisiert (bestehende config.json blieb erhalten).
    echo.
    echo Das Fenster schliesst sich automatisch in 5 Sekunden...
    timeout /t 5 >nul
)
exit /b
