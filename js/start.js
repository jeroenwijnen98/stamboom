/* =========================================================================
   START  —  teksten invullen, knoppen koppelen, en het slot bedienen.
   ========================================================================= */

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // Mag deze bezoeker al vóór de quiz rondkijken? Aan als de code op het
  // ingestelde achtervoegsel eindigde (bv. "-jw"). Zie CONFIG.technisch.
  let magVrijBladeren = false;

  /* ---------- Teksten uit config.js in de pagina zetten ---------- */

  function zetTeksten() {
    document.title = CONFIG.titel;
    $("slot-titel").textContent = CONFIG.titel;
    $("slot-ondertitel").textContent = CONFIG.ondertitel;
    $("slot-uitleg").textContent = CONFIG.slot.uitleg;
    $("slot-code").placeholder = CONFIG.slot.plaatshouder;
    $("slot-knop").textContent = CONFIG.slot.knop;

    $("keuze-kop").textContent = CONFIG.modus.kop;
    $("kies-quiz-titel").textContent = CONFIG.modus.quizTitel;
    $("kies-quiz-uitleg").textContent = CONFIG.modus.quizUitleg;
    $("kies-bladeren-titel").textContent = CONFIG.modus.bladerenTitel;
    $("kies-bladeren-uitleg").textContent = CONFIG.modus.bladerenUitleg;
  }

  /* ---------- Slot ---------- */

  async function probeerCode(e) {
    e.preventDefault();
    const ingevoerd = $("slot-code").value;
    if (!ingevoerd) return;

    // Eindigt de code op het achtervoegsel, dan halen we dat eraf (de echte
    // code blijft over) en onthouden we dat rondkijken meteen mag.
    const achter = CONFIG.technisch.vrijBladerenAchtervoegsel || "";
    const vrij =
      !!achter && ingevoerd.trim().toLowerCase().endsWith(achter.toLowerCase());
    const code = vrij ? ingevoerd.trim().slice(0, -achter.length) : ingevoerd;

    $("slot-knop").disabled = true;
    $("slot-melding").textContent = CONFIG.slot.bezig;
    $("slot-melding").className = "slot-melding bezig";
    // Even laten tekenen: het afleiden van de sleutel blokkeert de pagina.
    await new Promise((r) => setTimeout(r, 30));

    try {
      const gelukt = await Data.openMet(code);
      if (!gelukt) {
        $("slot-melding").textContent = CONFIG.slot.fout;
        $("slot-melding").className = "slot-melding";
        $("slot-knop").disabled = false;
        $("slot-code").select();
        return;
      }
      magVrijBladeren = vrij;
      try {
        sessionStorage.setItem(
          CONFIG.technisch.sessieSleutel,
          await Data.sleutelTekst()
        );
        sessionStorage.setItem(
          CONFIG.technisch.vrijBladerenSleutel,
          vrij ? "1" : "0"
        );
      } catch {
        /* privémodus: dan vraagt hij het na verversen opnieuw */
      }
      naBinnenkomst();
    } catch (err) {
      $("slot-melding").textContent = err.message;
      $("slot-melding").className = "slot-melding";
      $("slot-knop").disabled = false;
    }
  }

  /** Na verversen niet opnieuw de code hoeven typen. */
  async function probeerSessie() {
    let bewaard = null;
    try {
      bewaard = sessionStorage.getItem(CONFIG.technisch.sessieSleutel);
    } catch {
      return false;
    }
    if (!bewaard) return false;
    if (!(await Data.openMetSleutel(bewaard))) return false;
    try {
      magVrijBladeren =
        sessionStorage.getItem(CONFIG.technisch.vrijBladerenSleutel) === "1";
    } catch {
      /* geen sessionStorage: dan gewoon niet vrij bladeren */
    }
    naBinnenkomst();
    return true;
  }

  function naBinnenkomst() {
    $("slot-code").value = "";
    $("slot-melding").textContent = "";
    // Rondkijken staat aan het begin alleen open voor de -jw-code.
    $("kies-bladeren").hidden = !magVrijBladeren;
    App.maakBoom();
    // Een halfafgemaakt potje pakken we op waar het gebleven was.
    if (!Quiz.herstel()) App.toonScherm("keuze");
  }

  /* ---------- Knoppen ---------- */

  function koppel() {
    $("slot-formulier").addEventListener("submit", probeerCode);

    $("kies-quiz").addEventListener("click", () => Quiz.begin());
    $("kies-bladeren").addEventListener("click", () => Bladeren.begin());

    $("knop-terug").addEventListener("click", () => {
      Bladeren.sluit();
      App.toonScherm("keuze");
    });

    $("knop-opnieuw").addEventListener("click", async () => {
      const zeker = await App.vraag({
        kop: CONFIG.spel.opnieuwBeginnenKop,
        tekst: CONFIG.spel.opnieuwBeginnenTekst,
        ja: CONFIG.spel.opnieuwBeginnenJa,
        nee: CONFIG.spel.opnieuwBeginnenNee,
      });
      if (zeker) Quiz.begin();
    });

    $("knop-nakijken").addEventListener("click", () => Quiz.nakijken());
    $("knop-terug-lijst").addEventListener("click", () => Quiz.toonUitslag());
    $("knop-in-boom").addEventListener("click", () => Quiz.toonUitslagInBoom());
    $("knop-opnieuw-alles").addEventListener("click", () => Quiz.begin());
    $("knop-alleen-fout").addEventListener("click", () =>
      Quiz.begin(Quiz.foutieveGezichten)
    );
    $("knop-naar-bladeren").addEventListener("click", () => Bladeren.begin());

    $("foto-sluit").addEventListener("click", () => App.sluitFoto());
    $("overlay-foto").addEventListener("click", (e) => {
      if (e.target.id === "overlay-foto") App.sluitFoto();
    });

    // Het bladerpaneel sluiten door naast het paneel te tikken.
    document.addEventListener("pointerdown", (e) => {
      const blad = $("blad");
      if (!blad.classList.contains("actief")) return;
      if (blad.contains(e.target)) return;
      if (e.target.closest(".knoop")) return; // andere persoon kiezen mag
      Bladeren.sluit();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("overlay-foto").classList.contains("actief")) App.sluitFoto();
      else if ($("blad").classList.contains("actief")) Bladeren.sluit();
    });
  }

  /* ---------- Opstarten ---------- */

  async function start() {
    zetTeksten();
    koppel();
    try {
      await Data.laadManifest();
    } catch {
      $("slot-melding").textContent =
        "De gegevens ontbreken nog. Publiceer eerst vanuit tools/beheer.html.";
      $("slot-knop").disabled = true;
      return;
    }
    if (!(await probeerSessie())) $("slot-code").focus();
  }

  start();
})();
