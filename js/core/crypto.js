/* WEACRYPT: wrapper Web Crypto (SHA, HKDF, PBKDF2, AES-GCM) + format Sealed Message dan .ewall.
   Tidak ada library kripto pihak ketiga. Error kripto tidak membocorkan detail. */
(function () {
  "use strict";
  var EW = window.EW;
  var U = EW.util;
  var subtle = window.crypto && window.crypto.subtle;

  function bytes(data) { return typeof data === "string" ? U.utf8Encode(data) : data; }

  function fail(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  async function sha(alg, data) {
    return new Uint8Array(await subtle.digest(alg, bytes(data)));
  }

  async function shaHex(alg, data) { return U.toHex(await sha(alg, data)); }

  async function hkdf(ikm, salt, info, len) {
    var key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    var bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt, info: bytes(info) }, key, len * 8);
    return new Uint8Array(bits);
  }

  function normPass(pass) { return U.utf8Encode(String(pass).normalize("NFC")); }

  async function pbkdf2Bits(pass, salt, iters, len) {
    var pw = normPass(pass);
    var base = await subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
    U.wipe(pw);
    var bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iters }, base, (len || 32) * 8);
    return new Uint8Array(bits);
  }

  async function pbkdf2Key(pass, salt, iters) {
    var pw = normPass(pass);
    var base = await subtle.importKey("raw", pw, "PBKDF2", false, ["deriveKey"]);
    U.wipe(pw);
    return subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iters },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  function importRawKey(u8, extractable) {
    return subtle.importKey("raw", u8, { name: "AES-GCM" }, !!extractable, ["encrypt", "decrypt"]);
  }

  async function exportRawKey(key) { return new Uint8Array(await subtle.exportKey("raw", key)); }

  async function aesGcmEncrypt(key, iv, pt, aad) {
    var p = { name: "AES-GCM", iv: iv, tagLength: 128 };
    if (aad) p.additionalData = bytes(aad);
    return new Uint8Array(await subtle.encrypt(p, key, pt));
  }

  async function aesGcmDecrypt(key, iv, ct, aad) {
    var p = { name: "AES-GCM", iv: iv, tagLength: 128 };
    if (aad) p.additionalData = bytes(aad);
    try {
      return new Uint8Array(await subtle.decrypt(p, key, ct));
    } catch (e) {
      throw fail("DECRYPT_FAILED");
    }
  }

  /* ================= Sealed Message ================= */
  var SEAL_MAX_CHARS = 4000;
  var ARMOR_BEGIN = "-----BEGIN WEACRYPT SEALED MESSAGE-----";
  var ARMOR_END = "-----END WEACRYPT SEALED MESSAGE-----";
  // Header lama (sebelum ganti nama) tetap diterima.
  var ARMORS = [[ARMOR_BEGIN, ARMOR_END], ["-----BEGIN ENTROPY WALL SEALED MESSAGE-----", "-----END ENTROPY WALL SEALED MESSAGE-----"]];

  function sealAad(mode) { return "EW-SEAL-v1|" + mode; }

  /* opts: { msg, mode: "r"|"p", passphrase?, rawKey? (32 byte, mode r), stamp?, hint?, iters? } */
  async function sealMessage(opts) {
    var mode = opts.mode;
    if (mode !== "r" && mode !== "p") throw fail("BAD_MODE");
    if (Array.from(opts.msg).length > SEAL_MAX_CHARS) throw fail("TOO_LONG");
    var payload = { v: 1, msg: opts.msg, sealedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") };
    if (opts.stamp) payload.stamp = opts.stamp;
    if (opts.hint) payload.hint = opts.hint;
    var pt = U.utf8Encode(JSON.stringify(payload));
    var iv = U.randomBytes(12);
    var salt, key;
    if (mode === "r") {
      if (!opts.rawKey || opts.rawKey.length !== 32) throw fail("BAD_KEY");
      salt = new Uint8Array(0);
      key = await importRawKey(opts.rawKey, false);
    } else {
      salt = U.randomBytes(16);
      key = await pbkdf2Key(opts.passphrase, salt, opts.iters || EW.config.PBKDF2_ITERS);
    }
    var ct = await aesGcmEncrypt(key, iv, pt, sealAad(mode));
    U.wipe(pt);
    var token = ["v1", mode, U.b64urlEncode(salt), U.b64urlEncode(iv), U.b64urlEncode(ct)];
    if (mode === "r") token.push(U.b64urlEncode(opts.rawKey));
    return token.join(".");
  }

  function armor(token) { return ARMOR_BEGIN + "\n" + token + "\n" + ARMOR_END; }

  /* Menerima link penuh, fragment saja, blok armored, atau token mentah. */
  function parseSealInput(input) {
    var s = String(input || "").trim();
    if (!s) throw fail("EMPTY");
    var armor = ARMORS.filter(function (a) { return s.indexOf(a[0]) !== -1; })[0];
    if (armor) {
      var b = s.indexOf(armor[0]);
      var e = s.indexOf(armor[1], b);
      if (e === -1) throw fail("FORMAT");
      s = s.slice(b + armor[0].length, e);
    } else if (s.indexOf("#") !== -1) {
      s = s.slice(s.indexOf("#") + 1);
    }
    s = s.replace(/\s+/g, "");
    var parts = s.split(".");
    if (parts[0] !== "v1") throw fail("FORMAT");
    var mode = parts[1];
    if (mode === "r" && parts.length !== 6) throw fail("FORMAT");
    if (mode === "p" && parts.length !== 5) throw fail("FORMAT");
    if (mode !== "r" && mode !== "p") throw fail("FORMAT");
    try {
      var out = {
        mode: mode,
        salt: U.b64urlDecode(parts[2]),
        iv: U.b64urlDecode(parts[3]),
        ct: U.b64urlDecode(parts[4]),
        key: mode === "r" ? U.b64urlDecode(parts[5]) : null
      };
    } catch (err) { throw fail("FORMAT"); }
    if (out.iv.length !== 12 || out.ct.length < 17) throw fail("FORMAT");
    if (mode === "r" && out.key.length !== 32) throw fail("FORMAT");
    if (mode === "p" && out.salt.length !== 16) throw fail("FORMAT");
    return out;
  }

  async function openSealed(parsed, passphrase, iters) {
    var key = parsed.mode === "r"
      ? await importRawKey(parsed.key, false)
      : await pbkdf2Key(passphrase, parsed.salt, iters || EW.config.PBKDF2_ITERS);
    var pt = await aesGcmDecrypt(key, parsed.iv, parsed.ct, sealAad(parsed.mode));
    var payload;
    try { payload = JSON.parse(U.utf8Decode(pt)); } catch (e) { throw fail("DECRYPT_FAILED"); }
    finally { U.wipe(pt); }
    if (!payload || payload.v !== 1 || typeof payload.msg !== "string") throw fail("DECRYPT_FAILED");
    return payload;
  }

  /* ================= File .ewall v1 ================= */
  var MAGIC = [0x45, 0x57, 0x41, 0x4c]; // "EWAL"
  var HEADER_LEN = 38;

  function buildHeader(iters, salt, iv) {
    var h = new Uint8Array(HEADER_LEN);
    h.set(MAGIC, 0);
    h[4] = 0x01;      // versi
    h[5] = 0x01;      // KDF: PBKDF2-HMAC-SHA256
    new DataView(h.buffer).setUint32(6, iters, false);
    h.set(salt, 10);
    h.set(iv, 26);
    return h;
  }

  function parseHeader(buf) {
    if (!buf || buf.length < HEADER_LEN + 16) return { ok: false, reason: "TOO_SHORT" };
    for (var i = 0; i < 4; i++) if (buf[i] !== MAGIC[i]) return { ok: false, reason: "MAGIC" };
    if (buf[4] !== 0x01) return { ok: false, reason: "VERSION" };
    if (buf[5] !== 0x01) return { ok: false, reason: "KDF" };
    var iters = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(6, false);
    if (iters < 100000 || iters > 10000000) return { ok: false, reason: "ITERS" };
    return {
      ok: true, iters: iters,
      salt: buf.slice(10, 26), iv: buf.slice(26, 38),
      header: buf.subarray(0, HEADER_LEN), ct: buf.subarray(HEADER_LEN)
    };
  }

  /* fileBytes: Uint8Array, meta: objek JSON. Hasil: Uint8Array berformat .ewall */
  async function ewallEncrypt(fileBytes, meta, passphrase, iters, onStage) {
    iters = iters || EW.config.PBKDF2_ITERS;
    if (onStage) onStage("kdf");
    var salt = U.randomBytes(16);
    var iv = U.randomBytes(12);
    var header = buildHeader(iters, salt, iv);
    var key = await pbkdf2Key(passphrase, salt, iters);
    if (onStage) onStage("encrypt");
    var metaBytes = U.utf8Encode(JSON.stringify(meta));
    var pt = new Uint8Array(4 + metaBytes.length + fileBytes.length);
    new DataView(pt.buffer).setUint32(0, metaBytes.length, false);
    pt.set(metaBytes, 4);
    pt.set(fileBytes, 4 + metaBytes.length);
    var ct = await aesGcmEncrypt(key, iv, pt, header);
    U.wipe(pt);
    var out = new Uint8Array(HEADER_LEN + ct.length);
    out.set(header, 0);
    out.set(ct, HEADER_LEN);
    return out;
  }

  async function ewallDecrypt(buf, passphrase, onStage) {
    var h = parseHeader(buf);
    if (!h.ok) throw fail("NOT_EWALL");
    if (onStage) onStage("kdf");
    var key = await pbkdf2Key(passphrase, h.salt, h.iters);
    if (onStage) onStage("decrypt");
    var pt = await aesGcmDecrypt(key, h.iv, h.ct, h.header);
    var dv = new DataView(pt.buffer, pt.byteOffset, pt.byteLength);
    if (pt.length < 4) throw fail("DECRYPT_FAILED");
    var mlen = dv.getUint32(0, false);
    if (4 + mlen > pt.length) throw fail("DECRYPT_FAILED");
    var meta;
    try { meta = JSON.parse(U.utf8Decode(pt.subarray(4, 4 + mlen))); } catch (e) { throw fail("DECRYPT_FAILED"); }
    return { meta: meta, data: pt.subarray(4 + mlen), iters: h.iters };
  }

  EW.crypto = {
    sha: sha, shaHex: shaHex, hkdf: hkdf,
    pbkdf2Bits: pbkdf2Bits, pbkdf2Key: pbkdf2Key,
    aesGcmEncrypt: aesGcmEncrypt, aesGcmDecrypt: aesGcmDecrypt,
    importRawKey: importRawKey, exportRawKey: exportRawKey,
    seal: {
      MAX_CHARS: SEAL_MAX_CHARS, ARMOR_BEGIN: ARMOR_BEGIN, ARMOR_END: ARMOR_END,
      aad: sealAad, encrypt: sealMessage, armor: armor, parse: parseSealInput, open: openSealed
    },
    ewall: {
      HEADER_LEN: HEADER_LEN, buildHeader: buildHeader, parseHeader: parseHeader,
      encrypt: ewallEncrypt, decrypt: ewallDecrypt
    }
  };
})();
