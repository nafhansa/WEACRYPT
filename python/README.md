# WEACRYPT CLI

Alat offline untuk memulihkan data WEACRYPT tanpa situsnya. Kompatibel byte per byte dengan versi browser.

## Instalasi

```bash
pip install -r requirements.txt     # hanya butuh paket "cryptography"
```

Butuh Python 3.10 atau lebih baru.

## Perintah

```bash
# File Locker (.ewall): PBKDF2-HMAC-SHA256 600.000 iterasi + AES-256-GCM
python ewall_cli.py decrypt locked-7f3a9c12.ewall      # passphrase diminta lewat getpass
python ewall_cli.py encrypt dokumen.pdf                # hasilnya bisa dibuka di browser

# Secret Splitter (EW-SSS1, Shamir di GF(2^8))
python ewall_cli.py shamir-combine share1.txt share2.txt share3.txt
python ewall_cli.py shamir-split --k 2 --n 3 < rahasia.txt

# Entropy Ledger
python ewall_cli.py verify-ledger weacrypt-ledger-20261005.json

# Sealed Message (link, fragment, atau blok armored; '-' untuk stdin)
python ewall_cli.py open-seal "https://.../open.html#v1.r...."

# Uji mandiri
python ewall_cli.py selftest
```

File share boleh berisi banyak baris (misalnya hasil "Unduh semua" dari browser); baris yang diawali `EW-SSS1` akan dibaca, baris lain diabaikan.

Untuk otomasi, passphrase bisa diberikan lewat environment variable `EWALL_PASSPHRASE`. Hindari ini di komputer bersama.

## Format

**.ewall v1**

| Offset | Ukuran | Isi |
|---|---|---|
| 0 | 4 | Magic `EWAL` |
| 4 | 1 | Versi `0x01` |
| 5 | 1 | KDF `0x01` (PBKDF2-HMAC-SHA256) |
| 6 | 4 | Iterasi (uint32 big endian) |
| 10 | 16 | Salt |
| 26 | 12 | IV |
| 38 | sisa | Ciphertext AES-256-GCM + tag 16 byte |

AAD = 38 byte header. Plaintext = `uint32 BE panjang meta` + `meta JSON (UTF-8)` + `isi file`.

**Share**: `EW-SSS1-{k}of{n}-{x}-{groupId}-{hexData}-{crc}`. Rahasia dibungkus `secret || SHA-256(secret)[0..3]` sebelum dipecah; `crc` = 4 hex pertama SHA-256 dari string sebelum `-crc`.

Format ini milik WEACRYPT, bukan SLIP-39.

## Tes kompatibilitas

```bash
python -m unittest discover tests -v      # atau: python -m pytest tests
```

Fixture di `tests/fixtures/` dibuat oleh kode JavaScript yang sama dengan yang berjalan di browser.
