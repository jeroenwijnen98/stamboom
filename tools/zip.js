/* =========================================================================
   ZIP  —  een ZIP-bestand maken en lezen, zonder externe bibliotheek.

   Alleen "store" (geen compressie). Dat is hier precies goed: wat wij
   inpakken is al versleuteld, en versleutelde gegevens laten zich niet
   comprimeren. Zonder deflate blijft dit een klein, overzichtelijk bestand.

   Genoeg voor onze doeleinden; geen ZIP64, geen wachtwoorden, geen mappen
   als aparte ingangen (die ontstaan vanzelf uit de bestandsnamen).
   ========================================================================= */

const Zip = (() => {
  /* ---------- CRC32 ---------- */

  const CRC_TABEL = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABEL[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------- Datum in MS-DOS-formaat ---------- */

  function dosTijd(d = new Date()) {
    return {
      tijd: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      datum:
        ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  /* ---------- Schrijven ---------- */

  /**
   * @param {Array<{naam:string, inhoud:Uint8Array}>} bestanden
   * @returns {Blob}
   */
  function maak(bestanden) {
    const enc = new TextEncoder();
    const { tijd, datum } = dosTijd();
    const stukken = [];
    const centraal = [];
    let offset = 0;

    for (const b of bestanden) {
      const naam = enc.encode(b.naam);
      const inhoud =
        b.inhoud instanceof Uint8Array ? b.inhoud : new Uint8Array(b.inhoud);
      const crc = crc32(inhoud);

      // Lokale kop
      const kop = new DataView(new ArrayBuffer(30));
      kop.setUint32(0, 0x04034b50, true); // handtekening
      kop.setUint16(4, 20, true); // benodigde versie
      kop.setUint16(6, 0x0800, true); // vlag: naam is UTF-8
      kop.setUint16(8, 0, true); // methode 0 = opslaan
      kop.setUint16(10, tijd, true);
      kop.setUint16(12, datum, true);
      kop.setUint32(14, crc, true);
      kop.setUint32(18, inhoud.length, true);
      kop.setUint32(22, inhoud.length, true);
      kop.setUint16(26, naam.length, true);
      kop.setUint16(28, 0, true); // extra veld
      stukken.push(new Uint8Array(kop.buffer), naam, inhoud);

      // Ingang voor de centrale map
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true); // gemaakt door versie
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, tijd, true);
      cd.setUint16(14, datum, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, inhoud.length, true);
      cd.setUint32(24, inhoud.length, true);
      cd.setUint16(28, naam.length, true);
      cd.setUint32(42, offset, true); // waar de lokale kop staat
      centraal.push(new Uint8Array(cd.buffer), naam);

      offset += 30 + naam.length + inhoud.length;
    }

    const cdStart = offset;
    const cdLengte = centraal.reduce((n, s) => n + s.length, 0);

    const eind = new DataView(new ArrayBuffer(22));
    eind.setUint32(0, 0x06054b50, true);
    eind.setUint16(8, bestanden.length, true);
    eind.setUint16(10, bestanden.length, true);
    eind.setUint32(12, cdLengte, true);
    eind.setUint32(16, cdStart, true);

    return new Blob([...stukken, ...centraal, new Uint8Array(eind.buffer)], {
      type: "application/zip",
    });
  }

  /* ---------- Lezen ---------- */

  /**
   * @param {ArrayBuffer} buffer
   * @returns {Array<{naam:string, inhoud:Uint8Array}>}
   */
  function lees(buffer) {
    const bytes = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    const dec = new TextDecoder();

    // De centrale map vinden: van achteren zoeken naar de eindhandtekening.
    let eind = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eind = i;
        break;
      }
    }
    if (eind < 0) throw new Error("Dit is geen ZIP-bestand");

    const aantal = dv.getUint16(eind + 10, true);
    let p = dv.getUint32(eind + 16, true);
    const uit = [];

    for (let i = 0; i < aantal; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) {
        throw new Error("ZIP-bestand is beschadigd");
      }
      const methode = dv.getUint16(p + 10, true);
      const grootte = dv.getUint32(p + 24, true);
      const naamLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const lokaal = dv.getUint32(p + 42, true);
      const naam = dec.decode(bytes.subarray(p + 46, p + 46 + naamLen));

      if (methode !== 0) {
        throw new Error(`"${naam}" is gecomprimeerd; dat kan deze lezer niet`);
      }

      // De lokale kop heeft zijn eigen lengtes voor naam en extra veld.
      const lNaamLen = dv.getUint16(lokaal + 26, true);
      const lExtraLen = dv.getUint16(lokaal + 28, true);
      const start = lokaal + 30 + lNaamLen + lExtraLen;

      if (!naam.endsWith("/")) {
        uit.push({ naam, inhoud: bytes.slice(start, start + grootte) });
      }
      p += 46 + naamLen + extraLen + commentLen;
    }
    return uit;
  }

  return { maak, lees, crc32 };
})();

// Zodat dit bestand ook in Node te testen is.
if (typeof module !== "undefined") module.exports = Zip;
