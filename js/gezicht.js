/* =========================================================================
   GEZICHT  —  een cirkel op een foto tonen als vierkante/ronde tegel.

   We knippen geen aparte bestanden uit. In plaats daarvan krijgt een <div>
   de hele foto als achtergrond, en rekenen we background-size en
   background-position zo uit dat precies het gezicht in beeld valt.

   Alles in PROCENTEN, zodat dezelfde stijl werkt bij elke tegelgrootte —
   van een tegeltje van 64px tot een grote ronde foto in de stamboom. Er is
   dus nooit een hermeting nodig als het scherm draait of de zoom verandert.

   Een gezicht is opgeslagen als { cx, cy, r }:
     cx, cy  midden van de cirkel, 0..1 t.o.v. breedte en hoogte
     r       straal, 0..1 t.o.v. de BREEDTE (zo blijft de cirkel rond)
   ========================================================================= */

const Gezicht = (() => {
  /**
   * Rekent de achtergrondstijl uit voor één gezichtstegel.
   * @param {{cx:number, cy:number, r:number}} gezicht
   * @param {{breedte:number, hoogte:number}} foto  afmetingen in pixels
   * @param {number} padding  1.0 = precies de cirkel, 1.35 = ruimer kader
   * @returns {{backgroundSize:string, backgroundPosition:string}}
   */
  function stijl(gezicht, foto, padding = 1.35) {
    const W = foto.breedte;
    const H = foto.hoogte;

    // De vierkante uitsnede, in fotopixels.
    const zijde = Math.max(1, gezicht.r * W * padding * 2);
    const links = gezicht.cx * W - zijde / 2;
    const boven = gezicht.cy * H - zijde / 2;

    // background-position in procenten verschuift de foto zó dat het punt
    // px% van de foto samenvalt met px% van de tegel. Omgerekend naar de
    // uitsnede die we willen zien levert dat onderstaande formule op.
    const px = W === zijde ? 50 : (100 * links) / (W - zijde);
    const py = H === zijde ? 50 : (100 * boven) / (H - zijde);

    return {
      backgroundSize: `${(W / zijde) * 100}% ${(H / zijde) * 100}%`,
      backgroundPosition: `${px}% ${py}%`,
    };
  }

  /**
   * Zet een foto-uitsnede als achtergrond op een element.
   * Het element bepaalt zelf zijn grootte (CSS); die hoeven we niet te weten.
   */
  function vul(el, gezicht, foto, url, padding) {
    const s = stijl(gezicht, foto, padding);
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = s.backgroundSize;
    el.style.backgroundPosition = s.backgroundPosition;
    el.style.backgroundRepeat = "no-repeat";
  }

  /**
   * Plaats en formaat van een cirkel bóven op de hele foto, in procenten.
   * Gebruikt door de fotocontext-weergave en door de beheer-tool.
   *
   * De hoogte wordt met de beeldverhouding omgerekend, zodat de cirkel op
   * elk scherm precies rond blijft.
   */
  function cirkelStijl(gezicht, foto) {
    const verhouding = foto.breedte / foto.hoogte;
    return {
      left: (gezicht.cx - gezicht.r) * 100 + "%",
      width: gezicht.r * 2 * 100 + "%",
      top: (gezicht.cy - gezicht.r * verhouding) * 100 + "%",
      height: gezicht.r * verhouding * 2 * 100 + "%",
    };
  }

  /** Haalt de achtergrond weer weg (bijv. als een gezicht wordt losgemaakt). */
  function leeg(el) {
    el.style.backgroundImage = "";
    el.style.backgroundSize = "";
    el.style.backgroundPosition = "";
  }

  return { stijl, vul, leeg, cirkelStijl };
})();
