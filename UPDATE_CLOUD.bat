@echo off
title SCO Daily Report - Auto Sync to Cloud

cd /d "%~dp0"

echo ========================================================
echo   SCO DAILY REPORT - AUTO SYNC KE GITHUB PAGES
echo ========================================================
echo.

:: 1. Inisialisasi Git jika belum
if not exist ".git" (
    echo [*] Inisialisasi Git...
    git init -b main
)

:: 2. Pastikan Remote mengarah ke repository depocell/SCO
git remote remove origin >nul 2>&1
git remote add origin https://github.com/depocell/SCO.git

:: 3. Tambahkan SEMUA perubahan (file baru, edit, maupun file yang dihapus)
echo [*] Memeriksa seluruh file di folder...
git add -A

:: 4. Buat commit otomatis dengan penanda waktu
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set CDATE=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set CTIME=%%a:%%b
git commit -m "Auto-update data: %CDATE% %CTIME%" >nul 2>&1

:: 5. Unggah langsung ke GitHub
echo [*] Mengunggah otomatis ke cloud...
git push -u origin main --force

if errorlevel 1 (
    echo.
    echo [!] Gagal upload. Silakan periksa koneksi internet Anda.
    pause
) else (
    echo.
    echo ========================================================
    echo   SUKSES DISINKRONISASI KE CLOUD!
    echo   Data dan tampilan di HP otomatis ter-update.
    echo   Website: https://depocell.github.io/SCO/
    echo ========================================================
    echo.
    echo Tekan tombol apa saja untuk menutup jendela...
    pause >nul
)