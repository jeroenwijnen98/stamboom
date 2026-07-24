/* =========================================================================
   DATA  —  de versleutelde gegevens ophalen, ontsleutelen en onthouden.

   Volgorde bij het openen:
     1. manifest.json ophalen (klare tekst: zout, iteraties, controleblob)
     2. sleutel afleiden uit de code en meteen tegen het controleblob houden,
        zodat een foute code niet eerst megabytes aan foto's downloadt
     3. stamboom.enc ontsleutelen — daarin zitten alle namen en cirkels
     4. foto's pas ophalen wanneer ze nodig zijn (lui laden)
   ========================================================================= */

const Data = (() => {
  let sleutel = null;
  let manifest = null;
  let gegevens = null;

  const fotoCache = new Map(); // fotoId -> object-URL
  const bezig = new Map(); // fotoId -> Promise, tegen dubbel ophalen

  const map = () => CONFIG.technisch.dataMap;

  async function haal(pad) {
    const res = await fetch(`${map()}/${pad}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${pad} niet gevonden (${res.status})`);
    return res;
  }

  /** Haalt het manifest op. Kan al vóór het invoeren van de code. */
  async function laadManifest() {
    if (manifest) return manifest;
    manifest = await (await haal("manifest.json")).json();
    return manifest;
  }

  /**
   * Probeert de code. Geeft true als hij klopt; de gegevens zijn dan geladen.
   */
  async function openMet(code) {
    await laadManifest();
    const kandidaat = await Krypto.maakSleutel(
      code,
      Krypto.vanBase64(manifest.kdf.zout),
      manifest.kdf.iteraties
    );
    if (!(await Krypto.codeKlopt(kandidaat, manifest.controle))) return false;
    sleutel = kandidaat;
    await laadGegevens();
    return true;
  }

  /** Opent met een sleutel die nog van deze sessie is (na verversen). */
  async function openMetSleutel(sleutelTekst) {
    try {
      await laadManifest();
      const kandidaat = await Krypto.sleutelUitTekst(sleutelTekst);
      if (!(await Krypto.codeKlopt(kandidaat, manifest.controle))) return false;
      sleutel = kandidaat;
      await laadGegevens();
      return true;
    } catch {
      return false;
    }
  }

  async function laadGegevens() {
    const ruw = new Uint8Array(await (await haal("stamboom.enc")).arrayBuffer());
    gegevens = await Krypto.ontsleutelJson(sleutel, ruw);

    // Gezicht-id's werden ooit per foto genummerd, dus "g1" kon in élke foto
    // voorkomen. De quiz zoekt een gezicht op id op; bij dubbele id's vindt hij
    // dan steeds dat van de eerste foto, en zie je overal hetzelfde gezicht.
    // We zetten daarom de foto-id ervoor. Dat maakt ze gegarandeerd uniek en
    // laat ook oudere gepubliceerde gegevens gewoon goed openen.
    for (const f of gegevens.fotos) {
      for (const g of f.gezichten || []) g.id = `${f.id}-${g.id}`;
    }

    // Handige afgeleide lijsten, één keer uitrekenen.
    gegevens.persoonPerId = new Map(gegevens.personen.map((p) => [p.id, p]));
    gegevens.fotoPerId = new Map(gegevens.fotos.map((f) => [f.id, f]));
    gegevens.gezichten = gegevens.fotos.flatMap((f) =>
      f.gezichten
        .filter((g) => g.persoon && gegevens.persoonPerId.has(g.persoon))
        .map((g) => ({ ...g, fotoId: f.id }))
    );
  }

  /**
   * Geeft een object-URL voor een foto en ontsleutelt hem zo nodig.
   * Meerdere gelijktijdige aanvragen delen dezelfde download.
   */
  function fotoUrl(fotoId) {
    if (fotoCache.has(fotoId)) return Promise.resolve(fotoCache.get(fotoId));
    if (bezig.has(fotoId)) return bezig.get(fotoId);

    const werk = (async () => {
      const ruw = new Uint8Array(
        await (await haal(`fotos/${fotoId}.enc`)).arrayBuffer()
      );
      const plat = await Krypto.ontsleutel(sleutel, ruw);
      const url = URL.createObjectURL(new Blob([plat], { type: "image/jpeg" }));
      fotoCache.set(fotoId, url);
      bezig.delete(fotoId);
      return url;
    })();

    bezig.set(fotoId, werk);
    return werk;
  }

  async function sleutelTekst() {
    return sleutel ? Krypto.sleutelNaarTekst(sleutel) : null;
  }

  return {
    laadManifest,
    openMet,
    openMetSleutel,
    fotoUrl,
    sleutelTekst,
    get open() {
      return !!gegevens;
    },
    get personen() {
      return gegevens ? gegevens.personen : [];
    },
    get fotos() {
      return gegevens ? gegevens.fotos : [];
    },
    /** Alle gezichten die aan een bestaande persoon hangen — dit zijn de vragen. */
    get gezichten() {
      return gegevens ? gegevens.gezichten : [];
    },
    persoon: (id) => (gegevens ? gegevens.persoonPerId.get(id) : null),
    foto: (id) => (gegevens ? gegevens.fotoPerId.get(id) : null),
    gezicht(id) {
      return gegevens ? gegevens.gezichten.find((g) => g.id === id) : null;
    },
  };
})();
