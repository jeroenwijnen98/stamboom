/* =========================================================================
   STAMBOOM-LAYOUT  —  rekent uit waar elke persoon in beeld komt te staan.

   Gedeeld door de quiz en de beheer-tool, zodat wat je in de editor ziet
   exact is wat spelers zien.

   In het kort:
     1. GENERATIE   iedereen krijgt een rij: max(rij van de ouders) + 1.
                    Partners worden daarna gelijkgetrokken.
     2. BLOKKEN     een persoon plus zijn/haar partners vormen één blok dat
                    altijd naast elkaar blijft staan.
     3. BOOM        elk blok hangt onder het blok van zijn ouders.
     4. PLAATSEN    recursief: kinderen naast elkaar, ouders erboven
                    gecentreerd (vereenvoudigde Reingold–Tilford).
     5. OPSCHONEN   afwisselend botsingen oplossen en opnieuw centreren,
                    want stap 4 alleen kan bij scheve stambomen (hertrouwen,
                    grote leeftijdsverschillen) nog overlap opleveren.

   Uitvoer: { knopen, lijnen, breedte, hoogte } in pixels, linksboven op 0,0.
   ========================================================================= */

const StamboomLayout = (() => {
  const STANDAARD = {
    knoopBreedte: 116,
    knoopHoogte: 96,
    ruimteHorizontaal: 20,
    ruimteVerticaal: 64,
    ruimteTussenTakken: 40,
  };

  /* =====================================================================
     Index: snelle opzoektabellen over de personenlijst
     ===================================================================== */

  function indexeer(personen) {
    const perId = new Map();
    for (const p of personen) perId.set(p.id, p);

    // Partners symmetrisch maken: als A B noemt maar B niet A, tellen we
    // ze toch als partners. Scheelt gedoe bij handmatig bewerkte gegevens.
    const partners = new Map();
    const voegToe = (a, b) => {
      if (a === b || !perId.has(a) || !perId.has(b)) return;
      if (!partners.has(a)) partners.set(a, []);
      if (!partners.get(a).includes(b)) partners.get(a).push(b);
    };
    for (const p of personen) {
      for (const q of p.partners || []) {
        voegToe(p.id, q);
        voegToe(q, p.id);
      }
    }

    // Alleen ouders die echt in de lijst staan tellen mee.
    const ouders = new Map();
    const kinderen = new Map();
    for (const p of personen) {
      const echt = (p.ouders || []).filter((id) => perId.has(id) && id !== p.id);
      ouders.set(p.id, echt);
      for (const oid of echt) {
        if (!kinderen.has(oid)) kinderen.set(oid, []);
        kinderen.get(oid).push(p.id);
      }
    }

    return {
      perId,
      personen,
      partnersVan: (id) => partners.get(id) || [],
      oudersVan: (id) => ouders.get(id) || [],
      kinderenVan: (id) => kinderen.get(id) || [],
    };
  }

  /* =====================================================================
     Stap 1 — generaties
     ===================================================================== */

  function bepaalGeneraties(idx) {
    const gen = new Map();
    for (const p of idx.personen) gen.set(p.id, 0);

    // Herhalen tot het stabiel is. De teller is een noodrem: bij rare
    // gegevens (iemand die zijn eigen voorouder is) stoppen we gewoon.
    const maxRondes = idx.personen.length + 5;
    for (let ronde = 0; ronde < maxRondes; ronde++) {
      let veranderd = false;

      for (const p of idx.personen) {
        let g = gen.get(p.id);
        for (const oid of idx.oudersVan(p.id)) {
          if (gen.get(oid) + 1 > g) g = gen.get(oid) + 1;
        }
        if (g !== gen.get(p.id)) {
          gen.set(p.id, g);
          veranderd = true;
        }
      }

      // Partners horen op dezelfde rij te staan.
      for (const p of idx.personen) {
        for (const pid of idx.partnersVan(p.id)) {
          const hoogste = Math.max(gen.get(p.id), gen.get(pid));
          if (gen.get(p.id) !== hoogste || gen.get(pid) !== hoogste) {
            gen.set(p.id, hoogste);
            gen.set(pid, hoogste);
            veranderd = true;
          }
        }
      }

      if (!veranderd) break;
    }
    return gen;
  }

  /* =====================================================================
     Stap 2 — blokken (persoon + partners staan altijd naast elkaar)
     ===================================================================== */

  function sorteerSleutel(p, gen) {
    return [
      gen.get(p.id),
      Number.isFinite(p.volgorde) ? p.volgorde : 9999,
      Number.isFinite(p.geboren) ? p.geboren : 9999,
      p.naam || "",
    ];
  }

  function vergelijk(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  /**
   * Zet de leden van één blok op volgorde van links naar rechts.
   *
   * Is iemand hertrouwd (een "spil" met twee of meer partners in dezelfde
   * groep), dan zet die persoon in het MIDDEN, met een partner aan elke kant —
   * eerste huwelijk links, later huwelijk rechts, in de volgorde waarin de
   * partners bij de spil genoteerd staan. Een gewoon echtpaar houdt de gewone,
   * stabiele sorteervolgorde.
   */
  function ordenLeden(leden, idx, gen) {
    if (leden.length <= 1) return leden;
    const inGroep = new Set(leden.map((l) => l.id));
    const graad = (l) => idx.partnersVan(l.id).filter((id) => inGroep.has(id)).length;
    const spil = leden.find((l) => graad(l) >= 2);
    if (spil) {
      const partners = (spil.partners || [])
        .filter((id) => inGroep.has(id))
        .map((id) => idx.perId.get(id));
      const half = Math.floor(partners.length / 2);
      return [...partners.slice(0, half), spil, ...partners.slice(half)];
    }
    return [...leden].sort((a, b) =>
      vergelijk(sorteerSleutel(a, gen), sorteerSleutel(b, gen))
    );
  }

  function maakBlokken(idx, gen) {
    const oplopend = [...idx.personen].sort((a, b) =>
      vergelijk(sorteerSleutel(a, gen), sorteerSleutel(b, gen))
    );

    const blokVan = new Map();
    const blokken = [];

    for (const p of oplopend) {
      if (blokVan.has(p.id)) continue;
      // Hele partnergroep verzamelen (kringloop via partners), niet alleen de
      // directe partners van de seed — anders valt een hertrouwde spil in
      // stukjes uiteen als de eerste partner vóór de spil gesorteerd staat.
      const groep = new Set([p.id]);
      const nogTeDoen = [p.id];
      while (nogTeDoen.length) {
        const cur = nogTeDoen.pop();
        for (const pid of idx.partnersVan(cur)) {
          if (!blokVan.has(pid) && !groep.has(pid)) {
            groep.add(pid);
            nogTeDoen.push(pid);
          }
        }
      }
      const leden = ordenLeden([...groep].map((id) => idx.perId.get(id)), idx, gen);
      const blok = {
        id: "blok" + blokken.length,
        leden,
        generatie: Math.max(...leden.map((l) => gen.get(l.id))),
        kinderen: [],
        ouderBlok: null,
        aanhechtLid: null, // via wie dit blok aan zijn ouders hangt
        x: null,
      };
      blokken.push(blok);
      for (const l of leden) blokVan.set(l.id, blok);
    }

    // Kinderen aan ouderblokken hangen.
    //
    // Een blok hangt via ÉÉN lid onder ÉÉN ouderblok — anders is het geen boom
    // meer en valt er niets te tekenen. Staan de ouders van beide partners in
    // de stamboom (Anne trouwt met Bas, en Bas' ouders staan er ook in), dan
    // moet er dus gekozen worden. Zet `hoofdtak: true` op een persoon om die
    // keuze zelf te maken; anders wint het eerste lid met ouders.
    // De relatie die hierbij niet de structuur bepaalt gaat NIET verloren: die
    // wordt verderop als stippellijn getekend (zie losseOuderbanden).
    const losseOuderbanden = [];
    for (const blok of blokken) {
      const metOuders = blok.leden.filter((l) => idx.oudersVan(l.id).length > 0);
      const lid = metOuders.find((l) => l.hoofdtak) || metOuders[0];

      for (const ander of metOuders) {
        const ouderBlok = blokVan.get(idx.oudersVan(ander.id)[0]);
        if (!ouderBlok || ouderBlok === blok) continue;

        if (ander === lid && !blok.ouderBlok) {
          blok.ouderBlok = ouderBlok;
          blok.aanhechtLid = lid;
          ouderBlok.kinderen.push(blok);
        } else {
          losseOuderbanden.push({ ouderBlok, kind: ander });
        }
      }
    }

    // Ook los: kinderen van wie de tweede ouder in een ánder blok zit
    // (bijvoorbeeld na hertrouwen, waarbij de stiefouder elders staat).
    for (const p of idx.personen) {
      const ouders = idx.oudersVan(p.id);
      if (ouders.length < 2) continue;
      const eigen = blokVan.get(p.id);
      const blokA = blokVan.get(ouders[0]);
      const blokB = blokVan.get(ouders[1]);
      if (blokA !== blokB && blokB && blokB !== eigen) {
        losseOuderbanden.push({ ouderBlok: blokB, kind: p });
      }
    }

    // Broers en zussen in een vaste, logische volgorde.
    for (const blok of blokken) {
      blok.kinderen.sort((a, b) =>
        vergelijk(
          sorteerSleutel(a.aanhechtLid || a.leden[0], gen),
          sorteerSleutel(b.aanhechtLid || b.leden[0], gen)
        )
      );
    }

    return { blokken, blokVan, losseOuderbanden };
  }

  /* =====================================================================
     Stap 3 & 4 — recursief plaatsen
     ===================================================================== */

  function maakPlaatser(o) {
    const breedteVan = (blok) =>
      blok.leden.length * o.knoopBreedte +
      (blok.leden.length - 1) * o.ruimteHorizontaal;

    // Alle nakomelingen van een blok, inclusief het blok zelf.
    function tak(blok, uit = []) {
      uit.push(blok);
      for (const k of blok.kinderen) tak(k, uit);
      return uit;
    }

    function verschuif(blok, delta) {
      if (delta === 0) return;
      for (const b of tak(blok)) b.x += delta;
    }

    return { breedteVan, tak, verschuif };
  }

  function plaatsBlokken(blokken, o) {
    const { breedteVan, verschuif } = maakPlaatser(o);
    const gedaan = new Set();

    function plaats(blok, linkerX) {
      gedaan.add(blok.id);
      const eigen = breedteVan(blok);
      const kinderen = blok.kinderen.filter((k) => !gedaan.has(k.id));

      if (kinderen.length === 0) {
        blok.x = linkerX;
        return eigen;
      }

      let x = linkerX;
      let totaal = 0;
      kinderen.forEach((kind, i) => {
        const b = plaats(kind, x);
        x += b + o.ruimteTussenTakken;
        totaal += b + (i < kinderen.length - 1 ? o.ruimteTussenTakken : 0);
      });

      if (totaal >= eigen) {
        // Kinderen zijn breder: ouders in het midden erboven.
        blok.x = linkerX + (totaal - eigen) / 2;
        return totaal;
      }
      // Ouders zijn breder: kinderen naar het midden schuiven.
      for (const kind of kinderen) verschuif(kind, (eigen - totaal) / 2);
      blok.x = linkerX;
      return eigen;
    }

    // Wortels: blokken zonder ouders. Naast elkaar.
    let cursor = 0;
    for (const blok of blokken) {
      if (blok.ouderBlok || gedaan.has(blok.id)) continue;
      cursor += plaats(blok, cursor) + o.ruimteTussenTakken * 2;
    }
    // Vangnet: bij kringetjes in de gegevens blijft er soms een blok over.
    for (const blok of blokken) {
      if (gedaan.has(blok.id)) continue;
      cursor += plaats(blok, cursor) + o.ruimteTussenTakken * 2;
    }
  }

  /* =====================================================================
     Stap 5 — botsingen oplossen en opnieuw centreren
     ===================================================================== */

  function schoonOp(blokken, o) {
    const { breedteVan, verschuif } = maakPlaatser(o);

    const perGeneratie = new Map();
    for (const blok of blokken) {
      if (!perGeneratie.has(blok.generatie)) perGeneratie.set(blok.generatie, []);
      perGeneratie.get(blok.generatie).push(blok);
    }
    const generaties = [...perGeneratie.keys()].sort((a, b) => a - b);

    // Duwt overlappende blokken op dezelfde rij naar rechts, inclusief hun
    // hele tak, zodat de onderliggende structuur intact blijft.
    function losOpBotsingen() {
      let veranderd = false;
      for (const g of generaties) {
        const rij = perGeneratie.get(g).slice().sort((a, b) => a.x - b.x);
        for (let i = 1; i < rij.length; i++) {
          const vorige = rij[i - 1];
          const nodig = vorige.x + breedteVan(vorige) + o.ruimteTussenTakken;
          if (rij[i].x < nodig - 0.01) {
            verschuif(rij[i], nodig - rij[i].x);
            veranderd = true;
          }
        }
      }
      return veranderd;
    }

    // Zet ouders weer netjes boven het midden van hun kinderen.
    function hercentreer() {
      for (let i = generaties.length - 1; i >= 0; i--) {
        for (const blok of perGeneratie.get(generaties[i])) {
          if (!blok.kinderen.length) continue;
          const links = Math.min(...blok.kinderen.map((k) => k.x));
          const rechts = Math.max(
            ...blok.kinderen.map((k) => k.x + breedteVan(k))
          );
          blok.x = (links + rechts) / 2 - breedteVan(blok) / 2;
        }
      }
    }

    for (let ronde = 0; ronde < 6; ronde++) {
      const botsing = losOpBotsingen();
      hercentreer();
      if (!botsing) break;
    }
    // Laatste woord is aan de botsingen: liever een iets scheve ouder dan
    // twee namen die over elkaar heen vallen.
    losOpBotsingen();
  }

  /* =====================================================================
     Knopen en verbindingslijnen opleveren
     ===================================================================== */

  function maakKnopen(blokken, gen, o) {
    const knopen = [];
    const knoopVan = new Map();
    for (const blok of blokken) {
      blok.leden.forEach((lid, i) => {
        const knoop = {
          id: lid.id,
          persoon: lid,
          generatie: blok.generatie,
          x: blok.x + i * (o.knoopBreedte + o.ruimteHorizontaal),
          y: blok.generatie * (o.knoopHoogte + o.ruimteVerticaal),
          breedte: o.knoopBreedte,
          hoogte: o.knoopHoogte,
        };
        knopen.push(knoop);
        knoopVan.set(lid.id, knoop);
      });
    }
    return { knopen, knoopVan };
  }

  function maakLijnen(blokken, losseOuderbanden, knoopVan, o) {
    const lijnen = [];
    const lijn = (x1, y1, x2, y2, soort) =>
      lijnen.push({ x1, y1, x2, y2, soort });

    // Het punt onder een heel blok (vangnet als de ouders niet te bepalen zijn).
    function vertrekpunt(blok) {
      const eerste = knoopVan.get(blok.leden[0].id);
      const laatste = knoopVan.get(blok.leden[blok.leden.length - 1].id);
      return {
        x:
          blok.leden.length > 1
            ? (eerste.x + eerste.breedte + laatste.x) / 2
            : eerste.x + eerste.breedte / 2,
        y: eerste.y + eerste.hoogte,
      };
    }

    // Het punt onder het júíste ouderpaar. Bij een hertrouwde spil hangen de
    // kinderen van het eerste huwelijk zo onder het linkerpaar en die van het
    // tweede onder het rechterpaar, in plaats van allemaal onder het midden.
    function ouderpunt(blok, kindPersoon) {
      const ouders = new Set(kindPersoon.ouders || []);
      const knopenHier = blok.leden
        .filter((l) => ouders.has(l.id))
        .map((l) => knoopVan.get(l.id));
      if (!knopenHier.length) return vertrekpunt(blok);
      const links = Math.min(...knopenHier.map((k) => k.x));
      const rechts = Math.max(...knopenHier.map((k) => k.x + k.breedte));
      return { x: (links + rechts) / 2, y: knopenHier[0].y + knopenHier[0].hoogte };
    }

    function naarKindVanuit(van, kindKnoop, soort) {
      const busY = van.y + o.ruimteVerticaal / 2;
      const naarX = kindKnoop.x + kindKnoop.breedte / 2;
      lijn(van.x, van.y, van.x, busY, soort);
      lijn(van.x, busY, naarX, busY, soort);
      lijn(naarX, busY, naarX, kindKnoop.y, soort);
    }

    for (const blok of blokken) {
      // Streepje tussen partners. Een later huwelijk (de partner staat op een
      // tweede of latere plek bij de spil) krijgt een eigen stijl.
      for (let i = 1; i < blok.leden.length; i++) {
        const A = blok.leden[i - 1];
        const B = blok.leden[i];
        const a = knoopVan.get(A.id);
        const b = knoopVan.get(B.id);
        const later =
          (A.partners || []).indexOf(B.id) >= 1 ||
          (B.partners || []).indexOf(A.id) >= 1;
        lijn(a.x + a.breedte, a.y + a.hoogte / 2, b.x, b.y + b.hoogte / 2,
          later ? "partner-later" : "partner");
      }
      for (const kind of blok.kinderen) {
        const kindPersoon = kind.aanhechtLid || kind.leden[0];
        naarKindVanuit(ouderpunt(blok, kindPersoon), knoopVan.get(kindPersoon.id), "gezin");
      }
    }

    // Relaties die de boomstructuur niet konden bepalen, alsnog tekenen —
    // gestippeld, zodat zichtbaar is dat deze lijn een eind reist.
    for (const band of losseOuderbanden) {
      const doel = knoopVan.get(band.kind.id);
      if (doel) naarKindVanuit(vertrekpunt(band.ouderBlok), doel, "gezin-los");
    }

    return lijnen;
  }

  /* =====================================================================
     Hoofdingang
     ===================================================================== */

  /**
   * @param {Array} personen  lijst met { id, naam, ouders, partners, ... }
   * @param {Object} opties   overschrijft STANDAARD (zie CONFIG.weergave)
   * @returns {{knopen, lijnen, breedte, hoogte, index}}
   */
  function bereken(personen, opties = {}) {
    const o = { ...STANDAARD, ...opties };
    const idx = indexeer(personen || []);

    if (!idx.personen.length) {
      return { knopen: [], lijnen: [], breedte: 0, hoogte: 0, index: idx };
    }

    const gen = bepaalGeneraties(idx);
    const { blokken, losseOuderbanden } = maakBlokken(idx, gen);
    plaatsBlokken(blokken, o);
    schoonOp(blokken, o);

    const { knopen, knoopVan } = maakKnopen(blokken, gen, o);
    const lijnen = maakLijnen(blokken, losseOuderbanden, knoopVan, o);

    // Alles naar linksboven schuiven zodat de tekening op 0,0 begint.
    const minX = Math.min(...knopen.map((k) => k.x));
    if (minX !== 0) {
      for (const k of knopen) k.x -= minX;
      for (const l of lijnen) {
        l.x1 -= minX;
        l.x2 -= minX;
      }
    }

    return {
      knopen,
      lijnen,
      breedte: Math.max(...knopen.map((k) => k.x + k.breedte)),
      hoogte: Math.max(...knopen.map((k) => k.y + k.hoogte)),
      index: idx,
    };
  }

  return { bereken, indexeer, STANDAARD };
})();
