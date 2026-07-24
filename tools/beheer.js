/* =========================================================================
   BEHEER  —  stamboom invoeren, gezichten omcirkelen, publiceren.

   Draait lokaal (python3 -m http.server). Alles wat je hier doet gaat direct
   naar IndexedDB; publiceren maakt er een versleutelde ZIP van.
   ========================================================================= */

(() => {
  "use strict";

  /* =====================================================================
     Toestand
     ===================================================================== */

  let personen = [];
  let fotos = []; // { id, jaar, bijschrift, breedte, hoogte, blob, gezichten }
  let gekozenPersoonId = null;
  let gekozenFotoId = null;
  let gekozenGezichtId = null;

  const fotoUrls = new Map(); // fotoId -> object-URL
  let boom = null;

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();

  /* =====================================================================
     Kleine hulpjes
     ===================================================================== */

  function nieuwId(voorvoegsel, bestaand) {
    let n = 1;
    const gebruikt = new Set(bestaand);
    while (gebruikt.has(voorvoegsel + n)) n++;
    return voorvoegsel + n;
  }

  function persoon(id) {
    return personen.find((p) => p.id === id) || null;
  }

  function toonNaam(p) {
    if (!p) return "onbekend";
    return p.roepnaam || p.naam || "naamloos";
  }

  function status(tekst, soort = "") {
    const el = $("status");
    el.textContent = tekst;
    el.className = "beheer-status " + soort;
    if (tekst) setTimeout(() => {
      if (el.textContent === tekst) el.textContent = "";
    }, 4000);
  }

  function melding(id, tekst, soort = "") {
    const el = $(id);
    el.textContent = tekst;
    el.className = "melding " + soort;
  }

  function fotoUrl(f) {
    if (!fotoUrls.has(f.id)) fotoUrls.set(f.id, URL.createObjectURL(f.blob));
    return fotoUrls.get(f.id);
  }

  function vergeetFotoUrl(id) {
    if (fotoUrls.has(id)) {
      URL.revokeObjectURL(fotoUrls.get(id));
      fotoUrls.delete(id);
    }
  }

  /** Alle gezichten van alle foto's, plat. */
  function alleGezichten() {
    return fotos.flatMap((f) => f.gezichten.map((g) => ({ ...g, foto: f })));
  }

  /* =====================================================================
     Bewaren
     ===================================================================== */

  async function bewaarPersonen() {
    await Opslag.personen.vervang(personen);
  }

  async function bewaarFoto(f) {
    await Opslag.fotos.zet(f);
  }

  /* =====================================================================
     Opstarten
     ===================================================================== */

  async function start() {
    try {
      personen = await Opslag.personen.alles();
      fotos = await Opslag.fotos.alles();
    } catch (e) {
      status("Opslag gaat niet open: " + e.message, "mis");
    }
    for (const f of fotos) if (!f.gezichten) f.gezichten = [];

    boom = BoomView.maak($("editor-boom"), CONFIG.weergave);
    boom.zetModus("bewerken");
    boom.opKnoop = (id) => kiesPersoon(id);

    knoopEvents();
    tekenBoom();
    tekenFotostrook();
    tekenNaamlijst();
    tekenOntbreekt();
    controleer();
    window.addEventListener("beforeunload", () => {
      for (const id of [...fotoUrls.keys()]) vergeetFotoUrl(id);
    });
  }

  /* =====================================================================
     Tabs
     ===================================================================== */

  function kiesTab(naam) {
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("actief", t.dataset.tab === naam)
    );
    document.querySelectorAll(".paneel").forEach((p) =>
      p.classList.toggle("actief", p.id === "tab-" + naam)
    );
    if (naam === "stamboom") {
      requestAnimationFrame(() => boom.beginstand());
    }
    if (naam === "gezichten") {
      tekenNaamlijst();
      tekenOntbreekt();
    }
    if (naam === "publiceren") controleer();
  }

  /* =====================================================================
     TAB 1 — STAMBOOM
     ===================================================================== */

  function tekenBoom() {
    boom.zet(personen);
    const metGezicht = new Set(alleGezichten().map((g) => g.persoon).filter(Boolean));
    for (const [id, el] of boom.alleKnopen()) {
      el.classList.toggle("gekozen", id === gekozenPersoonId);
      el.classList.toggle("heeft-foto", metGezicht.has(id));
    }
    $("boom-info").textContent =
      `${personen.length} personen · ${fotos.length} foto's · ` +
      `${alleGezichten().filter((g) => g.persoon).length} gezichten`;
  }

  function kiesPersoon(id) {
    gekozenPersoonId = id;
    sluitKoppel();
    for (const [pid, el] of boom.alleKnopen()) {
      el.classList.toggle("gekozen", pid === id);
    }
    tekenPersoonPaneel();
  }

  function tekenPersoonPaneel() {
    const p = persoon(gekozenPersoonId);
    $("persoon-leeg").hidden = !!p;
    $("persoon-formulier").hidden = !p;
    if (!p) return;

    $("veld-naam").value = p.naam || "";
    $("veld-roepnaam").value = p.roepnaam || "";
    $("veld-geboren").value = p.geboren || "";
    $("veld-overleden").value = p.overleden || "";
    $("veld-hoofdtak").checked = !!p.hoofdtak;

    // De hoofdtak-keuze is alleen zinnig als beide partners ouders hebben.
    const partnerMetOuders = (p.partners || []).some(
      (id) => (persoon(id)?.ouders || []).length > 0
    );
    $("hoofdtak-regel").hidden = !((p.ouders || []).length && partnerMetOuders);

    const lijst = $("relaties");
    lijst.innerHTML = "";
    const rij = (rol, ander, weghaler) => {
      const el = document.createElement("div");
      el.className = "relatie";
      el.innerHTML =
        `<span class="relatie-rol">${rol}</span>` +
        `<span class="relatie-naam"></span>` +
        `<button class="relatie-weg" title="Relatie weghalen">✕</button>`;
      el.querySelector(".relatie-naam").textContent = toonNaam(ander);
      el.querySelector(".relatie-weg").addEventListener("click", weghaler);
      lijst.append(el);
    };

    for (const oid of p.ouders || []) {
      const o = persoon(oid);
      if (o) rij("ouder", o, () => haalRelatieWeg("ouder", p.id, oid));
    }
    for (const pid of p.partners || []) {
      const q = persoon(pid);
      if (q) rij("partner", q, () => haalRelatieWeg("partner", p.id, pid));
    }
    for (const k of personen.filter((k) => (k.ouders || []).includes(p.id))) {
      rij("kind", k, () => haalRelatieWeg("kind", p.id, k.id));
    }
  }

  async function haalRelatieWeg(soort, aId, bId) {
    const a = persoon(aId);
    if (soort === "ouder") {
      a.ouders = a.ouders.filter((id) => id !== bId);
    } else if (soort === "partner") {
      a.partners = (a.partners || []).filter((id) => id !== bId);
      const b = persoon(bId);
      if (b) b.partners = (b.partners || []).filter((id) => id !== aId);
    } else if (soort === "kind") {
      const k = persoon(bId);
      if (k) k.ouders = (k.ouders || []).filter((id) => id !== aId);
    }
    await bewaarPersonen();
    tekenBoom();
    tekenPersoonPaneel();
  }

  function maakPersoon(gegevens = {}) {
    const p = {
      id: nieuwId("p", personen.map((x) => x.id)),
      naam: "",
      roepnaam: "",
      geboren: null,
      overleden: null,
      ouders: [],
      partners: [],
      volgorde: null,
      hoofdtak: false,
      ...gegevens,
    };
    personen.push(p);
    return p;
  }

  /* ---------------------------------------------------------------------
     Relaties leggen

     De knoppen + Partner / + Kind / + Ouder openen een kiezer: je maakt óf
     een nieuw persoon, óf je koppelt aan iemand die al in de boom staat.
     Dat laatste is nodig zodra twee takken samenkomen — bijvoorbeeld een
     nieuw kind onder een opa die er al staat.
     --------------------------------------------------------------------- */

  let koppelSoort = null; // 'partner' | 'kind' | 'ouder'

  const KOPPEL_KOP = {
    partner: (naam) => `Wie wordt de partner van ${naam}?`,
    kind: (naam) => `Wie wordt een kind van ${naam}?`,
    ouder: (naam) => `Wie wordt een ouder van ${naam}?`,
  };

  function openKoppel(soort) {
    const p = persoon(gekozenPersoonId);
    if (!p) return;
    koppelSoort = soort;
    $("koppel-kop").textContent = KOPPEL_KOP[soort](toonNaam(p));
    $("koppel-zoek").value = "";
    melding("koppel-melding", "", "");
    $("koppel-paneel").hidden = false;
    tekenKoppelLijst();
    $("koppel-zoek").focus();
  }

  function sluitKoppel() {
    koppelSoort = null;
    $("koppel-paneel").hidden = true;
  }

  /** Loopt omhoog vanaf `persoon` en kijkt of `voorouder` erboven zit. */
  function isVoorouderVan(voorouder, kind) {
    const gezien = new Set();
    const nogTeDoen = [...(kind.ouders || [])];
    while (nogTeDoen.length) {
      const id = nogTeDoen.pop();
      if (id === voorouder.id) return true;
      if (gezien.has(id)) continue;
      gezien.add(id);
      const o = persoon(id);
      if (o) nogTeDoen.push(...(o.ouders || []));
    }
    return false;
  }

  /**
   * Waarom deze koppeling niet kan — of null als het wél mag.
   * Voorkomt vooral kringetjes (iemand zijn eigen opa maken).
   */
  function relatieProbleem(soort, p, k) {
    if (p.id === k.id) return "dezelfde persoon";

    if (soort === "partner") {
      if ((p.partners || []).includes(k.id)) return "is al partner";
      if ((p.ouders || []).includes(k.id)) return "is een ouder";
      if ((k.ouders || []).includes(p.id)) return "is een kind";
      return null;
    }
    if (soort === "ouder") {
      if ((p.ouders || []).includes(k.id)) return "is al ouder";
      if (isVoorouderVan(p, k)) return "staat al onder deze persoon";
      return null;
    }
    if (soort === "kind") {
      if ((k.ouders || []).includes(p.id)) return "is al kind";
      if ((k.ouders || []).length >= 2) return "heeft al twee ouders";
      if (isVoorouderVan(k, p)) return "staat al boven deze persoon";
      return null;
    }
    return null;
  }

  function tekenKoppelLijst() {
    const p = persoon(gekozenPersoonId);
    const lijst = $("koppel-lijst");
    lijst.innerHTML = "";
    if (!p || !koppelSoort) return;

    // Bij ouders is er maar plek voor twee; dan heeft zoeken geen zin.
    if (koppelSoort === "ouder" && (p.ouders || []).length >= 2) {
      lijst.innerHTML =
        `<span class="hint" style="padding:8px">` +
        `Deze persoon heeft al twee ouders. Haal er eerst een weg in de lijst hieronder.` +
        `</span>`;
      $("koppel-nieuw").disabled = true;
      return;
    }
    $("koppel-nieuw").disabled = false;

    const zoek = ($("koppel-zoek").value || "").toLowerCase().trim();
    const kandidaten = personen
      .filter((k) => k.id !== p.id)
      .filter((k) => !zoek || `${k.naam} ${k.roepnaam}`.toLowerCase().includes(zoek))
      .map((k) => ({ k, probleem: relatieProbleem(koppelSoort, p, k) }))
      // Wie je wél kunt kiezen eerst; anders scrol je langs grijze regels.
      .sort(
        (a, b) =>
          (a.probleem ? 1 : 0) - (b.probleem ? 1 : 0) ||
          (a.k.naam || "").localeCompare(b.k.naam || "")
      );

    if (!kandidaten.length) {
      lijst.innerHTML = `<span class="hint" style="padding:8px">Niemand gevonden.</span>`;
      return;
    }

    for (const { k, probleem } of kandidaten) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "naamknop";
      b.disabled = !!probleem;
      b.textContent = k.roepnaam ? `${k.roepnaam} (${k.naam})` : k.naam || "naamloos";
      const extra = document.createElement("small");
      extra.textContent = probleem || (k.geboren ? String(k.geboren) : "");
      b.append(extra);
      if (!probleem) b.addEventListener("click", () => koppelAan(k.id));
      lijst.append(b);
    }
  }

  /** Twee ouders van hetzelfde kind zijn ook partners van elkaar. */
  function partnersVanElkaar(kind) {
    if ((kind.ouders || []).length !== 2) return false;
    const [a, b] = kind.ouders.map(persoon);
    if (!a || !b) return false;
    const nieuw = !(a.partners || []).includes(b.id);
    a.partners = [...new Set([...(a.partners || []), b.id])];
    b.partners = [...new Set([...(b.partners || []), a.id])];
    return nieuw;
  }

  async function koppelAan(kandidaatId) {
    const p = persoon(gekozenPersoonId);
    const k = persoon(kandidaatId);
    if (!p || !k) return;

    const probleem = relatieProbleem(koppelSoort, p, k);
    if (probleem) {
      melding("koppel-melding", `Kan niet: ${probleem}.`, "mis");
      return;
    }

    // Wat er buiten de gevraagde koppeling om nog is bijgewerkt; dat vertellen
    // we, want stilzwijgend familie aanmaken is verwarrend.
    const erbij = [];

    if (koppelSoort === "partner") {
      p.partners = [...new Set([...(p.partners || []), k.id])];
      k.partners = [...new Set([...(k.partners || []), p.id])];
    } else if (koppelSoort === "ouder") {
      const meegenomen = zetOuder(p, k);
      if (meegenomen) erbij.push(`${toonNaam(meegenomen)} is als tweede ouder meegenomen`);
    } else if (koppelSoort === "kind") {
      const meegenomen = zetOuder(k, p);
      if (meegenomen) erbij.push(`${toonNaam(meegenomen)} is als tweede ouder meegenomen`);
    }
    if (koppelSoort !== "partner" && partnersVanElkaar(koppelSoort === "kind" ? k : p)) {
      erbij.push("de twee ouders staan nu ook als partners");
    }

    await bewaarPersonen();
    sluitKoppel();
    tekenBoom();
    tekenPersoonPaneel();
    boom.naarKnoop(p.id);
    status("Gekoppeld" + (erbij.length ? " — " + erbij.join(", ") : ""), "gelukt");
  }

  /**
   * Hangt `ouder` boven `kind`. Had het kind nog geen enkele ouder en heeft de
   * nieuwe ouder een partner, dan komt die er als tweede ouder bij — anders zou
   * dezelfde handeling via "+ Kind" en via "+ Ouder" verschillend uitpakken.
   * Geeft de meegenomen partner terug, of null.
   */
  function zetOuder(kind, ouder) {
    const hadGeenOuders = (kind.ouders || []).length === 0;
    const ouders = [...(kind.ouders || []), ouder.id];
    let meegenomen = null;

    if (hadGeenOuders && (ouder.partners || []).length) {
      meegenomen = persoon(ouder.partners[0]);
      if (meegenomen) ouders.push(meegenomen.id);
    }
    kind.ouders = ouders.slice(0, 2);
    return meegenomen;
  }

  async function voegToe(soort) {
    const p = persoon(gekozenPersoonId);
    if (!soort || (soort !== "los" && !p)) return;
    sluitKoppel();
    let nieuw;

    if (soort === "los") {
      nieuw = maakPersoon({ naam: "Nieuwe persoon" });
    } else if (soort === "partner") {
      nieuw = maakPersoon({ naam: "Nieuwe partner", partners: [p.id] });
      p.partners = [...(p.partners || []), nieuw.id];
    } else if (soort === "kind") {
      nieuw = maakPersoon({ naam: "Nieuw kind" });
      zetOuder(nieuw, p); // neemt de partner als tweede ouder mee
    } else if (soort === "ouder") {
      if ((p.ouders || []).length >= 2) {
        status("Deze persoon heeft al twee ouders", "mis");
        return;
      }
      nieuw = maakPersoon({ naam: "Nieuwe ouder" });
      p.ouders = [...(p.ouders || []), nieuw.id];
      // Twee ouders horen ook partners van elkaar te zijn.
      if (p.ouders.length === 2) {
        const [a, b] = p.ouders.map(persoon);
        if (a && b) {
          a.partners = [...new Set([...(a.partners || []), b.id])];
          b.partners = [...new Set([...(b.partners || []), a.id])];
        }
      }
    }

    await bewaarPersonen();
    tekenBoom();
    kiesPersoon(nieuw.id);
    boom.naarKnoop(nieuw.id);
    $("veld-naam").focus();
    $("veld-naam").select();
  }

  /** Broers en zussen: iedereen met precies dezelfde ouders. */
  function broersEnZussen(p) {
    const sleutel = [...(p.ouders || [])].sort().join("|");
    if (!sleutel) return [];
    return personen
      .filter((q) => [...(q.ouders || [])].sort().join("|") === sleutel)
      .sort(
        (a, b) =>
          (a.volgorde ?? 9999) - (b.volgorde ?? 9999) ||
          (a.geboren ?? 9999) - (b.geboren ?? 9999) ||
          (a.naam || "").localeCompare(b.naam || "")
      );
  }

  async function verschuif(richting) {
    const p = persoon(gekozenPersoonId);
    if (!p) return;
    const rij = broersEnZussen(p);
    const i = rij.indexOf(p);
    const j = i + richting;
    if (i < 0 || j < 0 || j >= rij.length) {
      status("Deze staat al helemaal aan die kant", "");
      return;
    }
    rij.splice(i, 1);
    rij.splice(j, 0, p);
    rij.forEach((q, n) => (q.volgorde = n)); // volgorde vastleggen
    await bewaarPersonen();
    tekenBoom();
    boom.naarKnoop(p.id);
  }

  async function verwijderPersoon() {
    const p = persoon(gekozenPersoonId);
    if (!p) return;
    if (!confirm(`"${toonNaam(p)}" verwijderen uit de stamboom?`)) return;

    personen = personen.filter((q) => q.id !== p.id);
    for (const q of personen) {
      q.ouders = (q.ouders || []).filter((id) => id !== p.id);
      q.partners = (q.partners || []).filter((id) => id !== p.id);
    }
    // Ook de gezichten die naar deze persoon wezen losmaken.
    let geraakt = 0;
    for (const f of fotos) {
      for (const g of f.gezichten) {
        if (g.persoon === p.id) {
          g.persoon = null;
          geraakt++;
        }
      }
      if (geraakt) await bewaarFoto(f);
    }

    gekozenPersoonId = null;
    await bewaarPersonen();
    tekenBoom();
    tekenPersoonPaneel();
    tekenNaamlijst();
    tekenOntbreekt();
    status(
      geraakt
        ? `Verwijderd — ${geraakt} gezicht(en) staan nu op "onbekend"`
        : "Verwijderd",
      "gelukt"
    );
  }

  async function veldGewijzigd() {
    const p = persoon(gekozenPersoonId);
    if (!p) return;
    p.naam = $("veld-naam").value.trim();
    p.roepnaam = $("veld-roepnaam").value.trim();
    p.geboren = parseInt($("veld-geboren").value, 10) || null;
    p.overleden = parseInt($("veld-overleden").value, 10) || null;
    p.hoofdtak = $("veld-hoofdtak").checked;
    await bewaarPersonen();
    tekenBoom();
    tekenNaamlijst();
    tekenOntbreekt();
  }

  /* =====================================================================
     Snel invoeren
     ===================================================================== */

  /**
   * Leest een ingesprongen lijst en maakt daar personen van.
   *   Jan Wijnen "Opa Jan" (1930-2010) x Marie de Vries (1932)
   *     Piet Wijnen (1955)
   */
  function ontleedSnel(tekst) {
    const regels = tekst
      .split("\n")
      .map((r) => r.replace(/\t/g, "  "))
      .filter((r) => r.trim().length);
    if (!regels.length) return { fout: "Er staat nog niets in het vak." };

    const nieuw = [];
    const stapel = []; // per niveau: de ouders (ids) op dat niveau
    const idsInGebruik = personen.map((p) => p.id);

    const maak = (gegevens) => {
      const p = {
        id: nieuwId("p", [...idsInGebruik, ...nieuw.map((n) => n.id)]),
        naam: "",
        roepnaam: "",
        geboren: null,
        overleden: null,
        ouders: [],
        partners: [],
        volgorde: null,
        hoofdtak: false,
        ...gegevens,
      };
      nieuw.push(p);
      return p;
    };

    for (const regel of regels) {
      const inspringing = regel.length - regel.trimStart().length;
      const niveau = Math.floor(inspringing / 2);
      const inhoud = regel.trim();

      if (niveau > stapel.length) {
        return {
          fout: `Deze regel springt te ver in: "${inhoud.slice(0, 40)}"`,
        };
      }

      const ouders = niveau > 0 ? stapel[niveau - 1] : [];
      const stukken = inhoud.split(/\s+x\s+/i);
      const gemaakt = [];

      for (const stuk of stukken) {
        // "Jan Wijnen "Opa Jan" (1930-2010)"
        let rest = stuk.trim();
        let geboren = null;
        let overleden = null;
        let roepnaam = "";

        const jaren = rest.match(/\((\d{3,4})\s*(?:[-–]\s*(\d{3,4}))?\)\s*$/);
        if (jaren) {
          geboren = parseInt(jaren[1], 10);
          overleden = jaren[2] ? parseInt(jaren[2], 10) : null;
          rest = rest.slice(0, jaren.index).trim();
        }
        const roep = rest.match(/["'“](.+?)["'”]/);
        if (roep) {
          roepnaam = roep[1].trim();
          rest = (rest.slice(0, roep.index) + rest.slice(roep.index + roep[0].length)).trim();
        }
        if (!rest) return { fout: `Geen naam gevonden in: "${stuk}"` };

        gemaakt.push(
          maak({
            naam: rest,
            roepnaam,
            geboren,
            overleden,
            // Alleen de eerste van een paar is het kind van de regel erboven;
            // de partner is ingetrouwd en heeft hier geen ouders.
            ouders: gemaakt.length === 0 ? [...ouders] : [],
          })
        );
      }

      // Partners onderling koppelen.
      for (const a of gemaakt) {
        a.partners = gemaakt.filter((b) => b !== a).map((b) => b.id);
      }

      stapel[niveau] = gemaakt.map((g) => g.id);
      stapel.length = niveau + 1;
    }

    return { personen: nieuw };
  }

  async function snelToevoegen() {
    const uitkomst = ontleedSnel($("snel-tekst").value);
    if (uitkomst.fout) {
      melding("snel-melding", uitkomst.fout, "mis");
      return;
    }
    personen.push(...uitkomst.personen);
    await bewaarPersonen();
    tekenBoom();
    tekenNaamlijst();
    tekenOntbreekt();
    $("dialoog-snel").classList.remove("actief");
    $("snel-tekst").value = "";
    melding("snel-melding", "", "");
    requestAnimationFrame(() => boom.beginstand());
    status(`${uitkomst.personen.length} personen toegevoegd`, "gelukt");
  }

  /* =====================================================================
     TAB 2 — GEZICHTEN
     ===================================================================== */

  async function importeerBestanden(bestanden) {
    const plaatjes = [...bestanden].filter((f) => f.type.startsWith("image/"));
    if (!plaatjes.length) return;
    status(`${plaatjes.length} foto('s) verwerken…`);

    for (const bestand of plaatjes) {
      try {
        fotos.push(await verkleinFoto(bestand));
      } catch (e) {
        status(`"${bestand.name}" lukt niet: ${e.message}`, "mis");
      }
    }
    for (const f of fotos) await bewaarFoto(f);
    tekenFotostrook();
    if (!gekozenFotoId && fotos.length) kiesFoto(fotos[0].id);
    tekenOntbreekt();
    controleer();
    status(`${plaatjes.length} foto('s) toegevoegd`, "gelukt");
  }

  const MAX_ZIJDE = 1600;

  async function verkleinFoto(bestand) {
    // imageOrientation 'from-image' is hier essentieel: zonder dat staan
    // foto's die rechtstreeks van een telefoon komen gekanteld.
    let bitmap;
    try {
      bitmap = await createImageBitmap(bestand, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(bestand);
    }

    const schaal = Math.min(1, MAX_ZIJDE / Math.max(bitmap.width, bitmap.height));
    const b = Math.max(1, Math.round(bitmap.width * schaal));
    const h = Math.max(1, Math.round(bitmap.height * schaal));

    const doek = document.createElement("canvas");
    doek.width = b;
    doek.height = h;
    doek.getContext("2d").drawImage(bitmap, 0, 0, b, h);
    bitmap.close?.();

    const blob = await new Promise((r) => doek.toBlob(r, "image/jpeg", 0.8));
    if (!blob) throw new Error("kon de foto niet omzetten");

    return {
      id: nieuwId("f", fotos.map((f) => f.id)),
      jaar: null,
      bijschrift: "",
      breedte: b,
      hoogte: h,
      blob,
      gezichten: [],
    };
  }

  function foto(id) {
    return fotos.find((f) => f.id === id) || null;
  }

  function tekenFotostrook() {
    const strook = $("fotostrook");
    strook.innerHTML = "";
    if (!fotos.length) {
      strook.innerHTML = `<span class="hint">Nog geen foto's.</span>`;
      return;
    }
    for (const f of fotos) {
      const knop = document.createElement("button");
      knop.className = "duim" + (f.id === gekozenFotoId ? " actief" : "");
      knop.style.backgroundImage = `url("${fotoUrl(f)}")`;
      knop.title = f.bijschrift || f.id;
      const n = f.gezichten.filter((g) => g.persoon).length;
      knop.innerHTML = `<span class="duim-teller${n ? "" : " geen"}">${n}</span>`;
      knop.addEventListener("click", () => kiesFoto(f.id));
      strook.append(knop);
    }
  }

  function kiesFoto(id) {
    gekozenFotoId = id;
    gekozenGezichtId = null;
    const f = foto(id);
    $("knop-foto-weg").disabled = !f;
    $("foto-leeg").hidden = !!f;
    $("foto-doek").hidden = !f;
    $("foto-gegevens").hidden = !f;
    if (!f) return;

    $("foto-afbeelding").src = fotoUrl(f);
    $("veld-jaar").value = f.jaar || "";
    $("veld-bijschrift").value = f.bijschrift || "";
    $("foto-info").textContent = `${f.breedte}×${f.hoogte} · ${Math.round(
      f.blob.size / 1024
    )} kB`;
    tekenFotostrook();
    tekenCirkels();
    tekenGezichtPaneel();
  }

  function tekenCirkels() {
    const f = foto(gekozenFotoId);
    const laag = $("cirkels");
    laag.innerHTML = "";
    if (!f) return;

    for (const g of f.gezichten) {
      const el = document.createElement("div");
      const p = g.persoon ? persoon(g.persoon) : null;
      el.className =
        "cirkel" +
        (g.id === gekozenGezichtId ? " actief" : "") +
        (p ? "" : " naamloos");
      Object.assign(el.style, Gezicht.cirkelStijl(g, f));
      el.dataset.id = g.id;
      el.innerHTML =
        `<span class="cirkel-naam"></span>` +
        (g.id === gekozenGezichtId ? `<span class="cirkel-greep"></span>` : "");
      el.querySelector(".cirkel-naam").textContent = p ? toonNaam(p) : "wie?";
      laag.append(el);
    }
  }

  /* ---------- Cirkels tekenen, verplaatsen en vergroten ---------- */

  function doekMaten() {
    const img = $("foto-afbeelding");
    return img.getBoundingClientRect();
  }

  function normaliseer(e) {
    const r = doekMaten();
    return {
      cx: (e.clientX - r.left) / r.width,
      cy: (e.clientY - r.top) / r.height,
      r,
    };
  }

  let bezig = null; // { soort: 'nieuw'|'sleep'|'maat', gezicht, ... }

  function begintTekenen(e) {
    const f = foto(gekozenFotoId);
    if (!f || e.button === 2) return;
    const pos = normaliseer(e);
    const greep = e.target.closest(".cirkel-greep");
    const cirkel = e.target.closest(".cirkel");

    if (greep && gekozenGezichtId) {
      const g = f.gezichten.find((x) => x.id === gekozenGezichtId);
      bezig = { soort: "maat", g };
    } else if (cirkel) {
      const g = f.gezichten.find((x) => x.id === cirkel.dataset.id);
      gekozenGezichtId = g.id;
      bezig = { soort: "sleep", g, vanX: pos.cx - g.cx, vanY: pos.cy - g.cy };
      tekenCirkels();
      tekenGezichtPaneel();
    } else {
      const g = {
        // Uniek over ALLE foto's, niet alleen binnen deze ene. Anders bestaat
        // "g1" in elke foto en weet de quiz niet meer welke uitsnede erbij
        // hoort — dan krijgt iedereen het gezicht uit de eerste foto.
        id: nieuwId(
          "g",
          fotos.flatMap((x) => (x.gezichten || []).map((y) => y.id))
        ),
        persoon: null,
        cx: pos.cx,
        cy: pos.cy,
        r: 0.02,
      };
      f.gezichten.push(g);
      gekozenGezichtId = g.id;
      bezig = { soort: "nieuw", g };
      tekenCirkels();
    }
    try {
      $("foto-doek").setPointerCapture(e.pointerId);
    } catch {
      /* niet elke aanwijzer laat zich vangen; slepen werkt dan ook nog */
    }
    e.preventDefault();
  }

  function tekentDoor(e) {
    if (!bezig) return;
    const f = foto(gekozenFotoId);
    const pos = normaliseer(e);
    const g = bezig.g;

    if (bezig.soort === "nieuw" || bezig.soort === "maat") {
      // Straal is genormaliseerd op de BREEDTE, zodat de cirkel rond blijft.
      const dx = (pos.cx - g.cx) * pos.r.width;
      const dy = (pos.cy - g.cy) * pos.r.height;
      g.r = Math.max(0.01, Math.hypot(dx, dy) / pos.r.width);
    } else if (bezig.soort === "sleep") {
      g.cx = pos.cx - bezig.vanX;
      g.cy = pos.cy - bezig.vanY;
    }
    g.cx = Math.min(1, Math.max(0, g.cx));
    g.cy = Math.min(1, Math.max(0, g.cy));
    tekenCirkels();
  }

  async function stoptTekenen() {
    if (!bezig) return;
    const f = foto(gekozenFotoId);
    const g = bezig.g;
    const wasNieuw = bezig.soort === "nieuw";
    bezig = null;

    // Een piepklein cirkeltje is een misklik, geen gezicht.
    if (g.r < 0.015 && wasNieuw) {
      f.gezichten = f.gezichten.filter((x) => x.id !== g.id);
      gekozenGezichtId = null;
      tekenCirkels();
      tekenGezichtPaneel();
      return;
    }
    await bewaarFoto(f);
    tekenCirkels();
    tekenGezichtPaneel();
    tekenFotostrook();
    if (wasNieuw) $("veld-zoek").focus();
  }

  /* ---------- Wie is dit? ---------- */

  function tekenGezichtPaneel() {
    const f = foto(gekozenFotoId);
    const g = f && f.gezichten.find((x) => x.id === gekozenGezichtId);
    $("gezicht-gegevens").hidden = !g;
    if (g) tekenNaamlijst();
  }

  function tekenNaamlijst() {
    const lijst = $("naamlijst");
    if (!lijst) return;
    const zoek = ($("veld-zoek").value || "").toLowerCase().trim();
    const f = foto(gekozenFotoId);
    const g = f && f.gezichten.find((x) => x.id === gekozenGezichtId);

    const metGezicht = new Set(alleGezichten().map((x) => x.persoon).filter(Boolean));
    lijst.innerHTML = "";

    const knop = (id, tekst, extra) => {
      const b = document.createElement("button");
      b.className = "naamknop" + (g && g.persoon === id ? " gekozen" : "");
      b.type = "button";
      b.textContent = tekst;
      if (extra) {
        const s = document.createElement("small");
        s.textContent = extra;
        b.append(s);
      }
      b.addEventListener("click", () => wijsToe(id));
      lijst.append(b);
    };

    knop(null, "— onbekend / geen familielid —");
    const gevonden = personen
      .filter((p) => {
        const t = `${p.naam} ${p.roepnaam}`.toLowerCase();
        return !zoek || t.includes(zoek);
      })
      .sort((a, b) => (a.naam || "").localeCompare(b.naam || ""));

    for (const p of gevonden) {
      knop(
        p.id,
        p.roepnaam ? `${p.roepnaam} (${p.naam})` : p.naam || "naamloos",
        metGezicht.has(p.id) ? "●" : ""
      );
    }
    if (!gevonden.length) {
      lijst.insertAdjacentHTML(
        "beforeend",
        `<span class="hint" style="padding:8px">Niemand gevonden.</span>`
      );
    }
  }

  async function wijsToe(persoonId) {
    const f = foto(gekozenFotoId);
    const g = f && f.gezichten.find((x) => x.id === gekozenGezichtId);
    if (!g) return;
    g.persoon = persoonId;
    await bewaarFoto(f);
    tekenCirkels();
    tekenNaamlijst();
    tekenFotostrook();
    tekenBoom();
    tekenOntbreekt();
    controleer();
  }

  async function verwijderGezicht() {
    const f = foto(gekozenFotoId);
    if (!f || !gekozenGezichtId) return;
    f.gezichten = f.gezichten.filter((x) => x.id !== gekozenGezichtId);
    gekozenGezichtId = null;
    await bewaarFoto(f);
    tekenCirkels();
    tekenGezichtPaneel();
    tekenFotostrook();
    tekenBoom();
    tekenOntbreekt();
  }

  async function verwijderFoto() {
    const f = foto(gekozenFotoId);
    if (!f) return;
    if (!confirm("Deze foto en alle cirkels erop verwijderen?")) return;
    await Opslag.fotos.verwijder(f.id);
    vergeetFotoUrl(f.id);
    fotos = fotos.filter((x) => x.id !== f.id);
    gekozenFotoId = null;
    kiesFoto(fotos.length ? fotos[0].id : null);
    tekenFotostrook();
    tekenBoom();
    tekenOntbreekt();
    controleer();
  }

  function tekenOntbreekt() {
    const el = $("ontbreekt-lijst");
    if (!el) return;
    const metGezicht = new Set(alleGezichten().map((g) => g.persoon).filter(Boolean));
    const zonder = personen.filter((p) => !metGezicht.has(p.id));
    el.textContent = zonder.length
      ? zonder.map(toonNaam).join(", ")
      : "Iedereen heeft minstens één gezicht. ✓";
  }

  /* =====================================================================
     TAB 3 — PUBLICEREN
     ===================================================================== */

  function controleer() {
    const ul = $("controle");
    if (!ul) return;
    const gezichten = alleGezichten();
    const metPersoon = gezichten.filter((g) => g.persoon);
    const zonderPersoon = gezichten.length - metPersoon.length;
    const metGezicht = new Set(metPersoon.map((g) => g.persoon));
    const zonderFoto = personen.filter((p) => !metGezicht.has(p.id));
    const bytes = fotos.reduce((n, f) => n + f.blob.size, 0);

    const regels = [
      [personen.length ? "ok" : "mis", `${personen.length} personen in de stamboom`],
      [
        metPersoon.length ? "ok" : "mis",
        `${metPersoon.length} gezichten met een naam — dit worden de vragen`,
      ],
      [
        zonderPersoon ? "let-op" : "ok",
        zonderPersoon
          ? `${zonderPersoon} cirkel(s) zonder naam — die doen niet mee in de quiz`
          : "Alle cirkels hebben een naam",
      ],
      [
        zonderFoto.length ? "let-op" : "ok",
        zonderFoto.length
          ? `${zonderFoto.length} personen zonder foto — die staan wel in de boom als afleider`
          : "Iedereen heeft een foto",
      ],
      [
        bytes > 12e6 ? "let-op" : "ok",
        `${fotos.length} foto's, samen ${(bytes / 1e6).toFixed(1)} MB` +
          (bytes > 12e6 ? " — dat is veel voor een telefoon op 4G" : ""),
      ],
    ];

    ul.innerHTML = "";
    for (const [soort, tekst] of regels) {
      const li = document.createElement("li");
      li.className = soort;
      li.textContent = tekst;
      ul.append(li);
    }
    $("knop-publiceer").disabled = !personen.length || !metPersoon.length;
  }

  /** Wat er versleuteld de repo in gaat — zonder blobs, zonder rommel. */
  function bouwGegevens() {
    return {
      versie: 1,
      personen: personen.map((p) => ({
        id: p.id,
        naam: p.naam || "",
        roepnaam: p.roepnaam || "",
        geboren: p.geboren || null,
        overleden: p.overleden || null,
        ouders: p.ouders || [],
        partners: p.partners || [],
        volgorde: p.volgorde ?? null,
        hoofdtak: !!p.hoofdtak,
      })),
      fotos: fotos.map((f) => ({
        id: f.id,
        jaar: f.jaar || null,
        bijschrift: f.bijschrift || "",
        breedte: f.breedte,
        hoogte: f.hoogte,
        gezichten: f.gezichten.map((g) => ({
          id: g.id,
          persoon: g.persoon || null,
          cx: +g.cx.toFixed(5),
          cy: +g.cy.toFixed(5),
          r: +g.r.toFixed(5),
        })),
      })),
    };
  }

  async function publiceer() {
    const code = $("veld-code").value;
    if (code.length < 8) {
      melding("publiceer-melding", "Kies een code van minstens 8 tekens.", "mis");
      return;
    }
    if (code !== $("veld-code2").value) {
      melding("publiceer-melding", "De twee codes zijn niet gelijk.", "mis");
      return;
    }

    melding("publiceer-melding", "Versleutelen…", "bezig");
    try {
      const zout = Krypto.willekeurigZout();
      const sleutel = await Krypto.maakSleutel(code, zout);

      const manifest = {
        versie: 1,
        kdf: {
          zout: Krypto.naarBase64(zout),
          iteraties: Krypto.ITERATIES,
        },
        controle: await Krypto.maakControle(sleutel),
        fotos: fotos.map((f) => f.id),
        gemaakt: new Date().toISOString().slice(0, 10),
      };

      const bestanden = [
        { naam: "data/manifest.json", inhoud: enc.encode(JSON.stringify(manifest, null, 2)) },
        { naam: "data/stamboom.enc", inhoud: await Krypto.versleutelJson(sleutel, bouwGegevens()) },
      ];
      for (const f of fotos) {
        bestanden.push({
          naam: `data/fotos/${f.id}.enc`,
          inhoud: await Krypto.versleutel(sleutel, await f.blob.arrayBuffer()),
        });
      }

      const blob = Zip.maak(bestanden);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stamboom-data.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);

      $("publiceer-melding").className = "melding gelukt";
      $("publiceer-melding").innerHTML =
        `Klaar — ${(blob.size / 1e6).toFixed(1)} MB. Pak het uit over de repo, ` +
        `zodat oude foto's ook echt weggaan:<br>` +
        `<code>cd &lt;repo&gt; &amp;&amp; rm -rf data &amp;&amp; ` +
        `unzip -q ~/Downloads/stamboom-data.zip</code>`;
    } catch (e) {
      melding("publiceer-melding", "Er ging iets mis: " + e.message, "mis");
    }
  }

  /* ---------- Bestaande data/ weer inlezen ---------- */

  async function leesIn() {
    const bestanden = [...$("veld-map").files];
    const code = $("veld-code-in").value;
    if (!bestanden.length) {
      melding("inlees-melding", "Kies eerst de map data/.", "mis");
      return;
    }
    if (!code) {
      melding("inlees-melding", "Voer de familiecode in.", "mis");
      return;
    }

    const zoek = (eind) => bestanden.find((b) => b.name === eind);
    const manifestBestand = zoek("manifest.json");
    const stamboomBestand = zoek("stamboom.enc");
    if (!manifestBestand || !stamboomBestand) {
      melding(
        "inlees-melding",
        "In deze map zitten geen manifest.json en stamboom.enc.",
        "mis"
      );
      return;
    }

    melding("inlees-melding", "Ontsleutelen…", "bezig");
    try {
      const manifest = JSON.parse(await manifestBestand.text());
      const sleutel = await Krypto.maakSleutel(
        code,
        Krypto.vanBase64(manifest.kdf.zout),
        manifest.kdf.iteraties
      );
      if (!(await Krypto.codeKlopt(sleutel, manifest.controle))) {
        melding("inlees-melding", "Die code klopt niet.", "mis");
        return;
      }

      const gegevens = await Krypto.ontsleutelJson(
        sleutel,
        new Uint8Array(await stamboomBestand.arrayBuffer())
      );

      const nieuweFotos = [];
      for (const beschrijving of gegevens.fotos || []) {
        const bestand = bestanden.find((b) => b.name === beschrijving.id + ".enc");
        if (!bestand) continue;
        const ruw = await Krypto.ontsleutel(
          sleutel,
          new Uint8Array(await bestand.arrayBuffer())
        );
        nieuweFotos.push({
          ...beschrijving,
          blob: new Blob([ruw], { type: "image/jpeg" }),
          gezichten: beschrijving.gezichten || [],
        });
      }

      for (const id of [...fotoUrls.keys()]) vergeetFotoUrl(id);
      personen = gegevens.personen || [];
      fotos = nieuweFotos;
      gekozenPersoonId = null;
      gekozenFotoId = null;
      gekozenGezichtId = null;

      await Opslag.personen.vervang(personen);
      await Opslag.fotos.vervang(fotos);

      tekenBoom();
      tekenPersoonPaneel();
      tekenFotostrook();
      kiesFoto(fotos.length ? fotos[0].id : null);
      tekenNaamlijst();
      tekenOntbreekt();
      controleer();
      melding(
        "inlees-melding",
        `Ingelezen: ${personen.length} personen en ${fotos.length} foto's.`,
        "gelukt"
      );
    } catch (e) {
      melding("inlees-melding", "Lukt niet: " + e.message, "mis");
    }
  }

  async function wisAlles() {
    if (!confirm("Alles in de beheer-tool wissen? Dit kan niet ongedaan gemaakt worden.")) {
      return;
    }
    await Opslag.personen.leeg();
    await Opslag.fotos.leeg();
    for (const id of [...fotoUrls.keys()]) vergeetFotoUrl(id);
    personen = [];
    fotos = [];
    gekozenPersoonId = gekozenFotoId = gekozenGezichtId = null;
    tekenBoom();
    tekenPersoonPaneel();
    tekenFotostrook();
    kiesFoto(null);
    tekenOntbreekt();
    controleer();
    status("Alles gewist", "gelukt");
  }

  /* =====================================================================
     Alles aan elkaar knopen
     ===================================================================== */

  function knoopEvents() {
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => kiesTab(t.dataset.tab))
    );

    // Stamboom
    $("knop-nieuw").addEventListener("click", () => voegToe("los"));
    $("knop-partner").addEventListener("click", () => openKoppel("partner"));
    $("knop-kind").addEventListener("click", () => openKoppel("kind"));
    $("knop-ouder").addEventListener("click", () => openKoppel("ouder"));
    $("koppel-nieuw").addEventListener("click", () => voegToe(koppelSoort));
    $("koppel-annuleer").addEventListener("click", sluitKoppel);
    $("koppel-zoek").addEventListener("input", tekenKoppelLijst);
    $("knop-links").addEventListener("click", () => verschuif(-1));
    $("knop-rechts").addEventListener("click", () => verschuif(1));
    $("knop-verwijder").addEventListener("click", verwijderPersoon);
    $("knop-passend").addEventListener("click", () => boom.passend());
    for (const id of ["veld-naam", "veld-roepnaam", "veld-geboren", "veld-overleden"]) {
      $(id).addEventListener("input", veldGewijzigd);
    }
    $("veld-hoofdtak").addEventListener("change", veldGewijzigd);

    // Snel invoeren
    $("knop-snel").addEventListener("click", () => {
      melding("snel-melding", "", "");
      $("dialoog-snel").classList.add("actief");
      $("snel-tekst").focus();
    });
    $("snel-annuleer").addEventListener("click", () =>
      $("dialoog-snel").classList.remove("actief")
    );
    $("snel-voegtoe").addEventListener("click", snelToevoegen);

    // Gezichten
    $("veld-fotos").addEventListener("change", (e) => {
      importeerBestanden(e.target.files);
      e.target.value = "";
    });
    $("knop-foto-weg").addEventListener("click", verwijderFoto);
    $("knop-gezicht-weg").addEventListener("click", verwijderGezicht);
    $("veld-zoek").addEventListener("input", tekenNaamlijst);
    $("veld-jaar").addEventListener("input", async () => {
      const f = foto(gekozenFotoId);
      if (!f) return;
      f.jaar = parseInt($("veld-jaar").value, 10) || null;
      await bewaarFoto(f);
    });
    $("veld-bijschrift").addEventListener("input", async () => {
      const f = foto(gekozenFotoId);
      if (!f) return;
      f.bijschrift = $("veld-bijschrift").value;
      await bewaarFoto(f);
      tekenFotostrook();
    });

    const doek = $("foto-doek");
    doek.addEventListener("pointerdown", begintTekenen);
    doek.addEventListener("pointermove", tekentDoor);
    doek.addEventListener("pointerup", stoptTekenen);
    doek.addEventListener("pointercancel", stoptTekenen);
    doek.addEventListener("contextmenu", (e) => e.preventDefault());

    const vlak = $("foto-werkvlak");
    vlak.addEventListener("dragover", (e) => {
      e.preventDefault();
      vlak.classList.add("sleep-over");
    });
    vlak.addEventListener("dragleave", () => vlak.classList.remove("sleep-over"));
    vlak.addEventListener("drop", (e) => {
      e.preventDefault();
      vlak.classList.remove("sleep-over");
      importeerBestanden(e.dataTransfer.files);
    });

    // Publiceren
    $("knop-publiceer").addEventListener("click", publiceer);
    $("knop-inlezen").addEventListener("click", leesIn);
    $("knop-wis").addEventListener("click", wisAlles);

    window.addEventListener("resize", () => {
      if ($("tab-stamboom").classList.contains("actief")) boom.passend();
    });
  }

  start();
})();
