# Play-1

Emulator PlayStation 1 yang jalan langsung di browser, desktop maupun HP.

- **BIOS dan game di-upload dari perangkatmu sendiri.** File dibaca di browser dan tidak dikirim ke server mana pun. BIOS disimpan di IndexedDB browser, jadi cukup upload sekali.
- **Kontrol sentuh untuk mobile**: D-pad dengan diagonal, △ ○ ✕ □, L1/L2/R1/R2, Select/Start, multi-touch, dan jari bisa digeser antar tombol. Layout menyesuaikan mode portrait dan landscape.
- **Gamepad fisik** (USB/Bluetooth) lewat Gamepad API, termasuk di Chrome Android.
- **Simpan/muat state** per game dan **memory card** yang tersimpan otomatis tiap 60 detik serta saat tab ditutup.
- Layar tetap menyala saat bermain (Wake Lock) dan bisa di-install sebagai PWA ("Add to Home Screen").

Emulator yang dipakai: [Nostalgist.js](https://nostalgist.js.org) dengan core libretro **PCSX ReARMed** (WebAssembly), dimuat dari CDN jsDelivr. Tidak ada build step, cukup file statis.

## Cara pakai

1. Buka halamannya (lihat bagian *Menjalankan* di bawah).
2. **Upload BIOS**: file 512 KB hasil dump dari konsol PS1-mu sendiri, misalnya `scph5501.bin` (USA), `scph1001.bin`, atau `scph7001.bin`. Nama lain tetap diterima dan otomatis dipakai sebagai `scph5501.bin`. Tanpa BIOS, emulator memakai HLE BIOS bawaan (kompatibilitas lebih rendah).
3. **Pilih game**: `.chd`, `.pbp`, `.iso`, atau `.cue` beserta semua `.bin`-nya (pilih bersamaan). Game multi-disc bisa pakai `.m3u` plus semua disc-nya.
4. Tekan **Mulai main**. Menu ☰ di kanan atas berisi simpan/muat state, pause, reset, layar penuh, tampil/sembunyikan kontrol, dan keluar.

> Tips mobile: pakai `.chd` atau `.pbp`. File `.bin`/`.iso` 700 MB dimuat utuh ke memori dan bisa membuat browser HP kehabisan RAM.

## Kontrol keyboard

| PS1 | Keyboard |
| --- | --- |
| D-pad | Tombol panah |
| ✕ / ○ / □ / △ | `Z` / `X` / `A` / `S` |
| L1 / R1 | `Q` / `W` |
| L2 / R2 | `E` / `R` |
| Start / Select | `Enter` / `Shift kanan` |

## Menjalankan

Semua file statis, tapi harus dibuka lewat HTTP (bukan `file://`) karena memakai ES module:

```bash
python -m http.server 8775
```

Lalu buka `http://localhost:8775`. Untuk main di HP, host di GitHub Pages (Settings → Pages → Deploy from branch → `main` / root) atau hosting statis lain.

## Struktur

| File | Isi |
| --- | --- |
| `index.html` | Layar setup dan layar main + markup kontrol sentuh |
| `style.css` | Tampilan, layout portrait/landscape |
| `app.js` | Logika emulator, upload BIOS/game, kontrol sentuh, menu |
| `store.js` | Helper IndexedDB untuk BIOS, memory card, dan save state |

## Legal

Repo ini **tidak menyertakan BIOS atau game apa pun**. BIOS PS1 adalah hak cipta Sony. Pakai hanya BIOS dan game yang kamu dump sendiri dari konsol dan disc milikmu.
