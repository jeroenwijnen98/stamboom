/* =========================================================================
   CRYPTO  —  versleutelen en ontsleutelen met een familiecode.

   Gedeeld door de quiz (index.html) en de beheer-tool (tools/beheer.html).

   Hoe het werkt:
     familiecode --PBKDF2--> sleutel --AES-GCM--> versleutelde bestanden

   Elk versleuteld bestand ziet er zo uit:
     [ 12 bytes IV ][ versleutelde inhoud + authenticatietag ]

   Let op de grens hiervan: iedereen die de code kent, kan alles lezen.
   Dit beschermt tegen zoekmachines en toevallige voorbijgangers, niet tegen
   iemand aan wie de code is doorgegeven.
   ========================================================================= */

const Krypto = (() => {
  const ITERATIES = 250000; // PBKDF2-rondes; hoger = trager te kraken én te openen
  const ZOUT_BYTES = 16;
  const IV_BYTES = 12; // voorgeschreven lengte voor AES-GCM

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /* ---------- Hulpjes: bytes <-> base64 ---------- */

  function naarBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binair = "";
    // In stukjes, anders knalt String.fromCharCode op grote bestanden.
    const stap = 0x8000;
    for (let i = 0; i < arr.length; i += stap) {
      binair += String.fromCharCode.apply(null, arr.subarray(i, i + stap));
    }
    return btoa(binair);
  }

  function vanBase64(tekst) {
    const binair = atob(tekst);
    const bytes = new Uint8Array(binair.length);
    for (let i = 0; i < binair.length; i++) bytes[i] = binair.charCodeAt(i);
    return bytes;
  }

  /* ---------- Sleutel afleiden ---------- */

  function willekeurigZout() {
    return crypto.getRandomValues(new Uint8Array(ZOUT_BYTES));
  }

  /**
   * Leidt een AES-GCM-sleutel af uit de familiecode.
   * @param {string} code       de familiecode
   * @param {Uint8Array} zout   16 willekeurige bytes (staat in manifest.json)
   * @param {number} iteraties  aantal PBKDF2-rondes (staat in manifest.json)
   */
  async function maakSleutel(code, zout, iteraties = ITERATIES) {
    const basis = await crypto.subtle.importKey(
      "raw",
      encoder.encode(code.normalize("NFKC")),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: zout, iterations: iteraties, hash: "SHA-256" },
      basis,
      { name: "AES-GCM", length: 256 },
      true, // exporteerbaar, zodat we hem in sessionStorage kunnen bewaren
      ["encrypt", "decrypt"]
    );
  }

  /* ---------- Versleutelen en ontsleutelen ---------- */

  /**
   * @param {CryptoKey} sleutel
   * @param {ArrayBuffer|Uint8Array} inhoud
   * @returns {Promise<Uint8Array>} iv + versleutelde inhoud
   */
  async function versleutel(sleutel, inhoud) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const geheim = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sleutel,
      inhoud
    );
    const uit = new Uint8Array(IV_BYTES + geheim.byteLength);
    uit.set(iv, 0);
    uit.set(new Uint8Array(geheim), IV_BYTES);
    return uit;
  }

  /**
   * @param {CryptoKey} sleutel
   * @param {ArrayBuffer|Uint8Array} pakket  iv + versleutelde inhoud
   * @returns {Promise<ArrayBuffer>}
   * @throws als de code niet klopt of het bestand beschadigd is
   */
  async function ontsleutel(sleutel, pakket) {
    const bytes = pakket instanceof Uint8Array ? pakket : new Uint8Array(pakket);
    if (bytes.length <= IV_BYTES) throw new Error("Bestand is te kort");
    const iv = bytes.subarray(0, IV_BYTES);
    const geheim = bytes.subarray(IV_BYTES);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, sleutel, geheim);
  }

  async function versleutelTekst(sleutel, tekst) {
    return versleutel(sleutel, encoder.encode(tekst));
  }

  async function ontsleutelTekst(sleutel, pakket) {
    return decoder.decode(await ontsleutel(sleutel, pakket));
  }

  async function versleutelJson(sleutel, waarde) {
    return versleutelTekst(sleutel, JSON.stringify(waarde));
  }

  async function ontsleutelJson(sleutel, pakket) {
    return JSON.parse(await ontsleutelTekst(sleutel, pakket));
  }

  /* ---------- Controleblob ----------
     Een klein versleuteld zinnetje in manifest.json. Daarmee weten we meteen
     of de ingevoerde code klopt, zonder eerst megabytes aan foto's te halen. */

  const CONTROLE_TEKST = "stamboomquiz-ok";

  async function maakControle(sleutel) {
    return naarBase64(await versleutelTekst(sleutel, CONTROLE_TEKST));
  }

  async function codeKlopt(sleutel, controleBase64) {
    try {
      const tekst = await ontsleutelTekst(sleutel, vanBase64(controleBase64));
      return tekst === CONTROLE_TEKST;
    } catch {
      return false; // verkeerde code laat AES-GCM struikelen op de auth-tag
    }
  }

  /* ---------- Sleutel bewaren tijdens de sessie ---------- */

  async function sleutelNaarTekst(sleutel) {
    return naarBase64(await crypto.subtle.exportKey("raw", sleutel));
  }

  async function sleutelUitTekst(tekst) {
    return crypto.subtle.importKey(
      "raw",
      vanBase64(tekst),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  return {
    ITERATIES,
    willekeurigZout,
    maakSleutel,
    versleutel,
    ontsleutel,
    versleutelTekst,
    ontsleutelTekst,
    versleutelJson,
    ontsleutelJson,
    maakControle,
    codeKlopt,
    sleutelNaarTekst,
    sleutelUitTekst,
    naarBase64,
    vanBase64,
  };
})();
