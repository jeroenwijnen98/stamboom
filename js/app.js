/* =========================================================================
   APP  —  schermen, slot, dialogen, fotocontext en de gedeelde gezichtstegel.

   Quiz (quiz.js) en bladermodus (bladeren.js) bouwen hierop voort. Er is één
   boomweergave die door alle drie de standen wordt hergebruikt; alleen de
   opmaak van de knopen verschilt.
   ========================================================================= */

const App = (() => {
  const $ = (id) => document.getElementById(id);
  let boom = null;

  /* =====================================================================
     Schermen
     ===================================================================== */

  function toonScherm(naam) {
    document.querySelectorAll(".scherm").forEach((s) =>
      s.classList.toggle("actief", s.id === "scherm-" + naam)
    );
    if (naam === "spel") requestAnimationFrame(() => boom && boom.beginstand());
  }

  /* =====================================================================
     Dialoog — geeft een belofte terug die true/false oplevert
     ===================================================================== */

  function vraag({ kop, tekst, ja, nee }) {
    return new Promise((klaar) => {
      $("dialoog-kop").textContent = kop;
      $("dialoog-tekst").textContent = tekst;
      $("dialoog-ja").textContent = ja;
      $("dialoog-nee").textContent = nee;
      $("dialoog").classList.add("actief");

      const sluit = (antwoord) => {
        $("dialoog").classList.remove("actief");
        $("dialoog-ja").onclick = null;
        $("dialoog-nee").onclick = null;
        klaar(antwoord);
      };
      $("dialoog-ja").onclick = () => sluit(true);
      $("dialoog-nee").onclick = () => sluit(false);
    });
  }

  /* =====================================================================
     Gezichtstegels

     Een foto wordt pas ontsleuteld als een tegel in beeld komt. Bij 60 foto's
     scheelt dat een halve minuut wachten aan het begin.
     ===================================================================== */

  const waarnemer = new IntersectionObserver(
    (ingangen) => {
      for (const ingang of ingangen) {
        if (!ingang.isIntersecting) continue;
        waarnemer.unobserve(ingang.target);
        vulNu(ingang.target);
      }
    },
    { root: null, rootMargin: "200px" }
  );

  async function vulNu(el) {
    const gezichtId = el.dataset.gezicht;
    const gezicht = Data.gezicht(gezichtId);
    if (!gezicht || el.dataset.gevuld) return;
    el.dataset.gevuld = "1";
    try {
      const foto = Data.foto(gezicht.fotoId);
      Gezicht.vul(el, gezicht, foto, await Data.fotoUrl(gezicht.fotoId),
        CONFIG.weergave.gezichtPadding);
    } catch (e) {
      delete el.dataset.gevuld;
      console.warn("Foto laden lukt niet:", e.message);
    }
  }

  /**
   * Maakt een tegel voor één gezicht.
   * @param {object} gezicht
   * @param {{klasse?:string, meteen?:boolean}} opties
   */
  function gezichtTegel(gezicht, opties = {}) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "gezicht " + (opties.klasse || "");
    el.dataset.gezicht = gezicht.id;
    el.setAttribute("aria-label", "gezicht");

    if (opties.meteen) vulNu(el);
    else waarnemer.observe(el);
    return el;
  }

  /** Een ronde foto in een boomknoop (geen eigen knop, want de knoop is er al). */
  function knoopFoto(gezicht, { animatie = false } = {}) {
    const el = document.createElement("span");
    el.className = "knoop-foto" + (animatie ? " komt-binnen" : "");
    el.dataset.gezicht = gezicht.id;
    waarnemer.observe(el);
    return el;
  }

  /* =====================================================================
     Fotocontext — de hele foto met alle gezichten omcirkeld
     ===================================================================== */

  async function toonFoto(gezichtId) {
    const gezicht = Data.gezicht(gezichtId);
    if (!gezicht) return;
    const foto = Data.foto(gezicht.fotoId);

    $("foto-titel").textContent = foto.bijschrift || "";
    $("foto-onder").textContent = foto.jaar ? String(foto.jaar) : CONFIG.foto.zonderJaar;
    $("overlay-foto").classList.add("actief");

    const frame = $("foto-frame");
    frame.querySelectorAll(".foto-cirkel").forEach((c) => c.remove());
    const img = $("overlay-afbeelding");
    img.removeAttribute("src");

    try {
      img.src = await Data.fotoUrl(foto.id);
    } catch {
      return;
    }

    // Alle cirkels tonen — ook die zonder naam. Wie ernaast staat is
    // vaak juist de aanwijzing.
    for (const g of foto.gezichten) {
      const cirkel = document.createElement("div");
      cirkel.className = "foto-cirkel" + (g.id === gezichtId ? " dit" : "");
      Object.assign(cirkel.style, Gezicht.cirkelStijl(g, foto));
      frame.append(cirkel);
    }
  }

  function sluitFoto() {
    $("overlay-foto").classList.remove("actief");
  }

  /* =====================================================================
     Opstarten
     ===================================================================== */

  function maakBoom() {
    boom = BoomView.maak($("boom"), CONFIG.weergave);

    // Knop om het hele overzicht te zien; de boom opent bewust leesbaar.
    const gereedschap = document.createElement("div");
    gereedschap.className = "boom-gereedschap";
    const passend = document.createElement("button");
    passend.className = "icoonknop";
    passend.textContent = "⤢";
    passend.title = "Hele stamboom in beeld";
    passend.addEventListener("click", () => boom.passend());
    gereedschap.append(passend);
    $("boom").append(gereedschap);

    return boom;
  }

  return {
    toonScherm,
    vraag,
    gezichtTegel,
    knoopFoto,
    vulNu,
    toonFoto,
    sluitFoto,
    maakBoom,
    get boom() {
      return boom;
    },
  };
})();
