/* WEACRYPT: Pwned Passwords dengan k-anonymity.
   Yang dikirim ke api.pwnedpasswords.com hanya 5 karakter pertama SHA-1 (hex). */
(function () {
  "use strict";
  var EW = window.EW;

  async function sha1Upper(password) {
    return (await EW.crypto.shaHex("SHA-1", password)).toUpperCase();
  }

  async function lookup(hash) {
    var prefix = hash.slice(0, 5);
    var suffix = hash.slice(5);
    var res;
    try {
      res = await fetch(EW.config.HIBP_RANGE + prefix, {
        headers: { "Add-Padding": "true" }, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store"
      });
    } catch (e) {
      var err = new Error("NETWORK");
      err.code = "NETWORK";
      throw err;
    }
    if (!res.ok) {
      var err2 = new Error("HTTP_" + res.status);
      err2.code = "HTTP";
      throw err2;
    }
    var text = await res.text();
    var count = 0;
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var idx = line.indexOf(":");
      if (idx !== 35) continue;
      var c = parseInt(line.slice(idx + 1), 10);
      if (!c) continue; // baris padding (count 0) diabaikan
      if (line.slice(0, 35).toUpperCase() === suffix) { count = c; break; }
    }
    return { found: count > 0, count: count, prefix: prefix };
  }

  EW.hibp = {
    sha1Upper: sha1Upper,
    lookup: lookup,
    // -> { found, count, prefix }
    check: async function (password) {
      var hash = await sha1Upper(password);
      var r = await lookup(hash);
      r.hash = hash;
      return r;
    }
  };
})();
