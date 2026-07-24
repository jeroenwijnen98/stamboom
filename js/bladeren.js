/* =========================================================================
   BLADEREN  —  rondkijken zonder quiz.

   De stamboom met alle foto's op hun plek. Tik een persoon aan en je ziet
   al zijn of haar foto's door de jaren heen. Dit is meteen het antwoordblad.
   ========================================================================= */

const Bladeren = (() => {
  const $ = (id) => document.getElementById(id);

  function begin() {
    App.boom.zetModus("bladeren");
    App.boom.opKnoop = (id) => toonPersoon(id);
    App.boom.zet(Data.personen);

    $("strip").hidden = true;
    $("knop-nakijken").hidden = true;
    $("knop-terug-lijst").hidden = true;
    $("knop-opnieuw").hidden = true;
    $("spel-titel").textContent = CONFIG.bladeren.kop;
    $("aanwijzing").textContent = "";
    $("voortgang").style.width = "100%";
    $("voortgang-tekst").textContent = CONFIG.bladeren.aantalFotos(Data.fotos.length);

    // Per persoon één gezicht in de boom; de rest zie je in het paneel.
    const perPersoon = groepeer();
    for (const [persoonId, el] of App.boom.alleKnopen()) {
      const vak = el.querySelector(".knoop-fotos");
      vak.innerHTML = "";
      const lijst = perPersoon.get(persoonId);
      if (!lijst || !lijst.length) continue;
      vak.append(App.knoopFoto(lijst[0]));
      if (lijst.length > 1) {
        const teller = document.createElement("span");
        teller.className = "knoop-vlag";
        teller.style.background = "var(--olijf)";
        teller.textContent = lijst.length;
        el.append(teller);
      }
    }

    App.toonScherm("spel");
  }

  /** gezichten per persoon, oudste foto eerst. */
  function groepeer() {
    const uit = new Map();
    for (const g of Data.gezichten) {
      if (!uit.has(g.persoon)) uit.set(g.persoon, []);
      uit.get(g.persoon).push(g);
    }
    for (const lijst of uit.values()) {
      lijst.sort(
        (a, b) =>
          (Data.foto(a.fotoId).jaar || 9999) - (Data.foto(b.fotoId).jaar || 9999)
      );
    }
    return uit;
  }

  function toonPersoon(persoonId) {
    const p = Data.persoon(persoonId);
    if (!p) return;
    const gezichten = groepeer().get(persoonId) || [];

    $("blad-naam").textContent = p.roepnaam ? `${p.roepnaam} — ${p.naam}` : p.naam;
    const jaren = [p.geboren, p.overleden].filter(Boolean).join(" – ");
    $("blad-onder").textContent = [jaren, CONFIG.bladeren.aantalFotos(gezichten.length)]
      .filter(Boolean)
      .join(" · ");

    const rol = $("blad-rol");
    rol.innerHTML = "";
    if (!gezichten.length) {
      rol.innerHTML = `<p class="blad-leeg">${CONFIG.bladeren.geenFotos}</p>`;
    }
    for (const g of gezichten) {
      const foto = Data.foto(g.fotoId);
      const knop = document.createElement("button");
      knop.className = "blad-foto";
      knop.append(App.gezichtTegel(g, {}));
      const bijschrift = document.createElement("span");
      bijschrift.textContent = foto.jaar || CONFIG.foto.zonderJaar;
      knop.append(bijschrift);
      knop.addEventListener("click", () => App.toonFoto(g.id));
      rol.append(knop);
    }

    $("blad").classList.add("actief");
  }

  function sluit() {
    $("blad").classList.remove("actief");
  }

  return { begin, sluit };
})();
