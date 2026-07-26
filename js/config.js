/* =========================================================================
   CONFIG  —  Dit is het ENIGE bestand dat je hoeft aan te passen als je
   teksten, kleuren of afmetingen wilt wijzigen.

   De stamboom en de foto's zelf voeg je NIET hier toe, maar via de
   beheer-tool: open tools/beheer.html (zie README).
   ========================================================================= */

const CONFIG = {
  /* ---------- Algemene teksten ---------- */
  titel: "Stamboomquiz",
  ondertitel: "Wie is wie in de familie?",

  /* ---------- Slotscherm (toegangscode) ---------- */
  slot: {
    uitleg: "Voer de familiecode in om de quiz te openen.",
    plaatshouder: "familiecode",
    knop: "Openen",
    bezig: "Even geduld…",
    fout: "Die code klopt niet. Probeer het nog eens.",
  },

  /* ---------- Modus kiezen ---------- */
  modus: {
    kop: "Wat wil je doen?",
    quizTitel: "Quiz spelen",
    quizUitleg:
      "Tik een gezicht aan en daarna de persoon bij wie het hoort. " +
      "Je ziet pas aan het eind hoeveel je er goed had.",
    bladerenTitel: "Rondkijken",
    bladerenUitleg:
      "Bekijk de stamboom met alle foto's erbij. Handig om te leren — " +
      "of om te zien hoe het zat.",
  },

  /* ---------- Fase 1: invullen ---------- */
  spel: {
    nogTePlaatsen: (n) =>
      n === 1 ? "nog 1 gezicht te plaatsen" : `nog ${n} gezichten te plaatsen`,
    allemaalGeplaatst: "Alle gezichten geplaatst",
    kiesPersoon: "Tik nu de persoon aan wie dit gezicht hoort.",
    nakijkenKnop: "Nakijken",
    legeStrip: "Alle gezichten staan in de boom. Klaar om na te kijken?",

    // Bevestiging als er nog gezichten open staan
    bevestigKop: "Toch nakijken?",
    bevestigTekst: (n) =>
      n === 1
        ? "Er staat nog 1 gezicht open. Die telt dan als fout."
        : `Er staan nog ${n} gezichten open. Die tellen dan als fout.`,
    bevestigJa: "Ja, nakijken",
    bevestigNee: "Nog even door",

    opnieuwBeginnenKop: "Opnieuw beginnen?",
    opnieuwBeginnenTekst: "Alles wat je hebt ingevuld gaat verloren.",
    opnieuwBeginnenJa: "Ja, opnieuw",
    opnieuwBeginnenNee: "Annuleren",
  },

  /* ---------- Fase 2: uitslag ---------- */
  uitslag: {
    kop: (goed, totaal) => `${goed} van de ${totaal}`,
    onderkop: "goed geraden",
    perfect: "Alles goed! Jij kent de familie.",
    tijd: (t) => `Je deed er ${t} over.`,
    bekijkInBoom: "Bekijk in de boom",
    terugNaarLijst: "Terug naar de lijst",
    foutKop: (n) => `Fout (${n})`,
    goedKop: (n) => `Goed (${n})`,
    jouwAntwoord: "jouw antwoord",
    nietGeplaatst: "niet geplaatst",
    wasEigenlijk: "was",
    opnieuw: "Opnieuw",
    alleenFouten: "Alleen de fouten",
    naarBladeren: "Rondkijken",
  },

  /* ---------- Fotocontext ---------- */
  foto: {
    zonderJaar: "jaar onbekend",
    onbekendPersoon: "onbekend",
  },

  /* ---------- Bladermodus ---------- */
  bladeren: {
    kop: "Rondkijken",
    geenFotos: "Van deze persoon is geen foto.",
    aantalFotos: (n) => (n === 1 ? "1 foto" : `${n} foto's`),
  },

  /* ---------- Weergave-instellingen ---------- */
  weergave: {
    // Hoeveel ruimte er rond de getekende cirkel meeloopt in een gezichtstegel.
    // 1.0 = precies de cirkel, 1.35 = ruim genoeg voor haar en kin.
    gezichtPadding: 1.35,

    // Afmetingen van een boomknoop in px (voor het layout-algoritme).
    knoopBreedte: 116,
    knoopHoogte: 96,

    // Ruimte tussen knopen.
    ruimteHorizontaal: 20,
    ruimteVerticaal: 64,

    // Extra ruimte tussen twee losse families op dezelfde generatie.
    ruimteTussenTakken: 40,

    // Zoomgrenzen van de stamboom.
    zoomMin: 0.25,
    zoomMax: 2.5,

    // Onder deze zoom zijn de namen niet meer te lezen. De boom opent dus
    // nooit verder uitgezoomd dan dit — ook niet als hij dan niet past.
    // Met de ⤢-knop of een dubbeltik kun je alsnog het hele overzicht krijgen.
    minLeesbaar: 0.55,
  },

  /* ---------- Technisch ---------- */
  technisch: {
    // Waar de versleutelde gegevens staan, relatief aan index.html.
    dataMap: "data",

    // Sleutel waaronder de voortgang in localStorage wordt bewaard.
    opslagSleutel: "stamboomquiz-voortgang",

    // Sleutel waaronder de afgeleide sleutel in sessionStorage staat.
    sessieSleutel: "stamboomquiz-sleutel",
  },
};
