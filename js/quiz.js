/* =========================================================================
   QUIZ  —  gezichten bij de juiste persoon zetten.

   De belangrijkste regel van dit bestand: TIJDENS HET INVULLEN WEET DE APP
   NIET OF IETS KLOPT. In fase 1 wordt `plaatsingen` alleen bijgehouden, niet
   getoetst. Pas bij "Nakijken" leggen we die naast `gezicht.persoon` en
   ontstaat er een uitslag.

   Wie hier iets toevoegt: geen kleur, geen geluid, geen teller die verraadt
   of een zet goed was. Ook geen subtiele verschillen in animatieduur.
   ========================================================================= */

const Quiz = (() => {
  const $ = (id) => document.getElementById(id);

  let inSpel = []; // gezicht-ids die meedoen in deze ronde
  let plaatsingen = new Map(); // gezichtId -> persoonId
  let actiefGezicht = null;
  let actievePersoon = null;
  let startTijd = 0;
  let uitslag = null;

  // Van wie bestaat er ergens een foto? Alleen zij kunnen een antwoord zijn;
  // de rest staat gedimd en vangt geen tikken. Bewust op ALLE gegevens
  // gebaseerd en niet op de huidige ronde — anders zou een herkansing met
  // "alleen de fouten" verklappen wie de goede antwoorden waren.
  let metFoto = new Set();

  function telMee(persoonId) {
    return metFoto.has(persoonId);
  }

  /* =====================================================================
     Volgorde van de gezichten in de strip
     ===================================================================== */

  function husselen(rij) {
    for (let i = rij.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rij[i], rij[j]] = [rij[j], rij[i]];
    }
    return rij;
  }

  /**
   * Zet de gezichten in willekeurige volgorde én houdt gezichten uit dezelfde
   * foto uit elkaar.
   *
   * Zonder dit staan de mensen van één kiekje netjes naast elkaar, en dat
   * verklapt dat ze bij elkaar horen — een echtpaar, of broers en zussen.
   * Alleen husselen is niet genoeg: dan belanden ze soms alsnog naast elkaar.
   * Daarom pakken we steeds uit de foto met de meeste gezichten over, maar
   * nooit twee keer achter elkaar uit dezelfde. Zo staan ze gegarandeerd
   * verspreid, zolang geen enkele foto meer dan de helft levert.
   */
  function doorElkaar(ids) {
    const perFoto = new Map();
    for (const id of husselen([...ids])) {
      const gezicht = Data.gezicht(id);
      const sleutel = gezicht ? gezicht.fotoId : "?";
      if (!perFoto.has(sleutel)) perFoto.set(sleutel, []);
      perFoto.get(sleutel).push(id);
    }

    const uit = [];
    let vorige = null;
    while (uit.length < ids.length) {
      // Husselen vóór het sorteren, zodat foto's met evenveel gezichten over
      // elkaar niet altijd in dezelfde volgorde aan de beurt komen.
      const over = husselen([...perFoto.entries()].filter(([, v]) => v.length));
      if (!over.length) break;
      over.sort((a, b) => b[1].length - a[1].length);
      const keuze = over.find(([k]) => k !== vorige) || over[0];
      uit.push(keuze[1].pop());
      vorige = keuze[0];
    }
    return uit;
  }

  function begin(gezichtIds = null) {
    inSpel = doorElkaar(gezichtIds || Data.gezichten.map((g) => g.id));
    plaatsingen = new Map();
    actiefGezicht = null;
    actievePersoon = null;
    startTijd = Date.now();
    uitslag = null;
    bewaar();
    naarInvullen();
  }

  /* =====================================================================
     Beginnen, bewaren, herstellen
     ===================================================================== */

  function bewaar() {
    try {
      localStorage.setItem(
        CONFIG.technisch.opslagSleutel,
        JSON.stringify({
          inSpel,
          plaatsingen: [...plaatsingen],
          startTijd,
        })
      );
    } catch {
      /* privémodus of volle opslag: dan maar zonder bewaren */
    }
  }

  /** Geeft true als er een half afgemaakt potje terug is gezet. */
  function herstel() {
    let bewaard;
    try {
      bewaard = JSON.parse(localStorage.getItem(CONFIG.technisch.opslagSleutel));
    } catch {
      return false;
    }
    if (!bewaard || !Array.isArray(bewaard.inSpel) || !bewaard.inSpel.length) {
      return false;
    }
    // Alleen herstellen wat nog bestaat; de gegevens kunnen vernieuwd zijn.
    const bestaat = new Set(Data.gezichten.map((g) => g.id));
    inSpel = bewaard.inSpel.filter((id) => bestaat.has(id));
    if (!inSpel.length) return false;

    plaatsingen = new Map(
      (bewaard.plaatsingen || []).filter(
        ([g, p]) => bestaat.has(g) && Data.persoon(p)
      )
    );
    startTijd = bewaard.startTijd || Date.now();
    actiefGezicht = null;
    actievePersoon = null;
    uitslag = null;
    naarInvullen();
    return true;
  }

  function vergeet() {
    try {
      localStorage.removeItem(CONFIG.technisch.opslagSleutel);
    } catch {}
  }

  /* =====================================================================
     FASE 1 — invullen
     ===================================================================== */

  function naarInvullen() {
    metFoto = new Set(Data.gezichten.map((g) => g.persoon));
    App.boom.zetModus("invullen");
    App.boom.opKnoop = opKnoop;
    App.boom.zet(Data.personen);
    $("strip").hidden = false;
    $("knop-nakijken").hidden = false;
    $("knop-terug-lijst").hidden = true;
    $("spel-titel").textContent = CONFIG.titel;
    $("knop-opnieuw").hidden = false;
    teken();
    App.toonScherm("spel");
  }

  function teken() {
    tekenStrip();
    tekenKnopen();
    tekenVoet();
  }

  function tekenStrip() {
    const strip = $("strip");
    strip.innerHTML = "";
    const open = inSpel.filter((id) => !plaatsingen.has(id));

    if (!open.length) {
      const p = document.createElement("span");
      p.className = "strip-leeg";
      p.textContent = CONFIG.spel.legeStrip;
      strip.append(p);
      return;
    }

    for (const id of open) {
      const gezicht = Data.gezicht(id);
      if (!gezicht) continue;
      // Geen ⓘ: de hele foto zien is in de quiz een te grote aanwijzing.
      const tegel = App.gezichtTegel(gezicht, {
        klasse: id === actiefGezicht ? "actief" : "",
      });
      tegel.addEventListener("click", () => kiesGezicht(id));
      strip.append(tegel);
    }
  }

  function tekenKnopen(nieuwGeplaatst = null) {
    for (const [persoonId, el] of App.boom.alleKnopen()) {
      const vak = el.querySelector(".knoop-fotos");
      vak.innerHTML = "";
      el.classList.remove("was-goed", "was-fout", "gekozen", "wenkt");
      el.querySelectorAll(".knoop-vlag").forEach((v) => v.remove());

      const hier = inSpel.filter((g) => plaatsingen.get(g) === persoonId);
      for (const gezichtId of hier) {
        const gezicht = Data.gezicht(gezichtId);
        if (gezicht) {
          vak.append(App.knoopFoto(gezicht, { animatie: gezichtId === nieuwGeplaatst }));
        }
      }

      // Van deze persoon bestaat geen enkele foto: hij kan dus nooit een
      // antwoord zijn. Gedimd, en niet aan te tikken.
      const meedoen = telMee(persoonId);
      el.classList.toggle("zonder-foto", !meedoen);
      el.tabIndex = meedoen ? 0 : -1;
      el.setAttribute("aria-disabled", meedoen ? "false" : "true");

      if (persoonId === actievePersoon) el.classList.add("gekozen");
      // Wenken alleen als er een gezicht klaarstaat én de knoop nog leeg is.
      if (actiefGezicht && meedoen && !hier.length) el.classList.add("wenkt");
    }
  }

  function tekenVoet() {
    const gedaan = inSpel.filter((id) => plaatsingen.has(id)).length;
    const totaal = inSpel.length;
    $("voortgang").style.width = totaal ? (gedaan / totaal) * 100 + "%" : "0";
    $("voortgang-tekst").textContent = `${gedaan}/${totaal}`;

    const knop = $("knop-nakijken");
    knop.textContent = CONFIG.spel.nakijkenKnop;
    knop.disabled = gedaan === 0;

    $("aanwijzing").textContent = actiefGezicht
      ? CONFIG.spel.kiesPersoon
      : gedaan === totaal
        ? CONFIG.spel.allemaalGeplaatst
        : CONFIG.spel.nogTePlaatsen(totaal - gedaan);
  }

  /* ---------- Aantikken ---------- */

  function kiesGezicht(gezichtId) {
    if (actievePersoon) {
      plaats(gezichtId, actievePersoon);
      return;
    }
    actiefGezicht = actiefGezicht === gezichtId ? null : gezichtId;
    actievePersoon = null;
    teken();
  }

  function opKnoop(persoonId, el, e) {
    // Op een geplaatst gezicht tikken = weer oppakken.
    const foto = e && e.target.closest(".knoop-foto");
    if (foto) {
      pakOp(foto.dataset.gezicht);
      return;
    }
    // Vangnet naast de CSS, bijvoorbeeld voor het toetsenbord.
    if (!telMee(persoonId)) return;
    if (actiefGezicht) {
      plaats(actiefGezicht, persoonId);
      return;
    }
    actievePersoon = actievePersoon === persoonId ? null : persoonId;
    actiefGezicht = null;
    teken();
  }

  function plaats(gezichtId, persoonId) {
    plaatsingen.set(gezichtId, persoonId);
    actiefGezicht = null;
    actievePersoon = null;
    bewaar();
    tekenStrip();
    tekenKnopen(gezichtId);
    tekenVoet();
  }

  function pakOp(gezichtId) {
    plaatsingen.delete(gezichtId);
    actiefGezicht = gezichtId;
    actievePersoon = null;
    bewaar();
    teken();
  }

  /* =====================================================================
     FASE 2 — nakijken
     ===================================================================== */

  async function nakijken() {
    const open = inSpel.filter((id) => !plaatsingen.has(id)).length;
    if (open > 0) {
      const door = await App.vraag({
        kop: CONFIG.spel.bevestigKop,
        tekst: CONFIG.spel.bevestigTekst(open),
        ja: CONFIG.spel.bevestigJa,
        nee: CONFIG.spel.bevestigNee,
      });
      if (!door) return;
    }

    // Hier — en nergens eerder — wordt er vergeleken.
    const regels = inSpel.map((id) => {
      const gezicht = Data.gezicht(id);
      const gekozen = plaatsingen.get(id) || null;
      return {
        gezichtId: id,
        gekozen,
        juist: gezicht.persoon,
        goed: gekozen === gezicht.persoon,
      };
    });

    uitslag = {
      regels,
      goed: regels.filter((r) => r.goed).length,
      totaal: regels.length,
      seconden: Math.round((Date.now() - startTijd) / 1000),
    };
    vergeet();
    toonUitslag();
  }

  function tijdTekst(seconden) {
    const m = Math.floor(seconden / 60);
    const s = seconden % 60;
    if (!m) return `${s} seconden`;
    return `${m} min ${String(s).padStart(2, "0")} s`;
  }

  function toonUitslag() {
    if (!uitslag) return;
    const T = CONFIG.uitslag;
    $("score-groot").textContent = T.kop(uitslag.goed, uitslag.totaal);
    $("score-onder").textContent =
      uitslag.goed === uitslag.totaal ? T.perfect : T.onderkop;
    $("score-tijd").textContent = T.tijd(tijdTekst(uitslag.seconden));

    const fout = uitslag.regels.filter((r) => !r.goed);
    const goed = uitslag.regels.filter((r) => r.goed);

    $("kop-fout").textContent = T.foutKop(fout.length);
    $("kop-goed").textContent = T.goedKop(goed.length);
    $("groep-fout").hidden = !fout.length;
    $("groep-goed").hidden = !goed.length;
    $("groep-fout").open = true;
    $("groep-goed").open = false;

    vulLijst($("lijst-fout"), fout);
    vulLijst($("lijst-goed"), goed);

    $("knop-in-boom").textContent = T.bekijkInBoom;
    $("knop-opnieuw-alles").textContent = T.opnieuw;
    $("knop-alleen-fout").textContent = T.alleenFouten;
    $("knop-alleen-fout").hidden = !fout.length;
    $("knop-naar-bladeren").textContent = T.naarBladeren;

    App.toonScherm("uitslag");
    const rol = document.querySelector("#scherm-uitslag .uitslag-rol");
    if (rol) rol.scrollTop = 0;
  }

  function vulLijst(houder, regels) {
    const T = CONFIG.uitslag;
    houder.innerHTML = "";
    for (const r of regels) {
      const gezicht = Data.gezicht(r.gezichtId);
      const rij = document.createElement("div");
      rij.className = "regel";

      const tegel = App.gezichtTegel(gezicht, {});

      const tekst = document.createElement("div");
      tekst.className = "regel-tekst";
      const juisteNaam = naamVan(r.juist);

      if (r.goed) {
        tekst.innerHTML = `<span class="regel-goed"></span>`;
        tekst.querySelector(".regel-goed").textContent = juisteNaam;
      } else {
        tekst.innerHTML =
          `<span class="regel-label"></span><br>` +
          `<span class="regel-jouw"></span><br>` +
          `<span class="regel-label"></span> <span class="regel-goed"></span>`;
        const stukken = tekst.querySelectorAll("span");
        stukken[0].textContent = r.gekozen ? T.jouwAntwoord : T.nietGeplaatst;
        stukken[1].textContent = r.gekozen ? naamVan(r.gekozen) : "—";
        stukken[2].textContent = T.wasEigenlijk;
        stukken[3].textContent = juisteNaam;
      }

      rij.append(tegel, tekst);
      houder.append(rij);
    }
  }

  function naamVan(persoonId) {
    const p = Data.persoon(persoonId);
    if (!p) return CONFIG.foto.onbekendPersoon;
    return p.roepnaam ? `${p.roepnaam} (${p.naam})` : p.naam;
  }

  /* ---------- De uitslag over de stamboom heen ---------- */

  function toonUitslagInBoom() {
    if (!uitslag) return;
    App.boom.zetModus("uitslag");
    App.boom.opKnoop = null;
    App.boom.zet(Data.personen);

    $("strip").hidden = true;
    $("knop-nakijken").hidden = true;
    $("knop-terug-lijst").hidden = false;
    $("knop-terug-lijst").textContent = CONFIG.uitslag.terugNaarLijst;
    $("knop-opnieuw").hidden = true;
    $("spel-titel").textContent = CONFIG.uitslag.kop(uitslag.goed, uitslag.totaal);
    $("aanwijzing").textContent = "";
    $("voortgang").style.width = (uitslag.goed / uitslag.totaal) * 100 + "%";
    $("voortgang-tekst").textContent = `${uitslag.goed}/${uitslag.totaal}`;

    const perPersoon = new Map();
    for (const r of uitslag.regels) {
      if (!perPersoon.has(r.juist)) perPersoon.set(r.juist, []);
      perPersoon.get(r.juist).push(r);
      // Verkeerd geplaatste gezichten markeren ook de persoon waar ze bij
      // gezet zijn — anders zie je niet wáár je ze naartoe hebt gedaan.
      if (r.gekozen && r.gekozen !== r.juist) {
        if (!perPersoon.has(r.gekozen)) perPersoon.set(r.gekozen, []);
      }
    }

    for (const [persoonId, el] of App.boom.alleKnopen()) {
      const vak = el.querySelector(".knoop-fotos");
      vak.innerHTML = "";
      el.classList.remove("gekozen", "wenkt", "was-goed", "was-fout");

      const eigen = (perPersoon.get(persoonId) || []).filter(
        (r) => r.juist === persoonId
      );
      const foutHierheen = uitslag.regels.filter(
        (r) => r.gekozen === persoonId && r.juist !== persoonId
      );
      // Wie geen eigen foto had en waar je ook niets neerzette, deed niet mee.
      const meedoen = eigen.length > 0 || foutHierheen.length > 0;
      el.classList.toggle("zonder-foto", !meedoen);
      el.tabIndex = meedoen ? 0 : -1;
      if (!meedoen) continue;

      for (const r of eigen) {
        const gezicht = Data.gezicht(r.gezichtId);
        const tegel = App.knoopFoto(gezicht);
        tegel.classList.add(r.goed ? "rand-goed" : "rand-fout");
        vak.append(tegel);
      }

      const allesGoed = eigen.every((r) => r.goed) && !foutHierheen.length;
      el.classList.add(allesGoed ? "was-goed" : "was-fout");

      const vlag = document.createElement("span");
      vlag.className = "knoop-vlag " + (allesGoed ? "goed" : "fout");
      vlag.textContent = allesGoed ? "✓" : "✕";
      el.append(vlag);
    }

    App.toonScherm("spel");
  }

  /* =====================================================================
     Openbare API
     ===================================================================== */

  return {
    begin,
    herstel,
    vergeet,
    nakijken,
    toonUitslag,
    toonUitslagInBoom,
    naarInvullen,
    get bezig() {
      return inSpel.length > 0 && !uitslag;
    },
    get foutieveGezichten() {
      return uitslag ? uitslag.regels.filter((r) => !r.goed).map((r) => r.gezichtId) : [];
    },
  };
})();
