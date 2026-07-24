/* =========================================================================
   BOOM-VIEW  —  tekent de stamboom en laat je erin pannen en zoomen.

   Eén weergave voor vier situaties, via `modus`:
     'invullen'  quiz, fase 1 — knopen zijn doelen, géén goed/fout-kleur
     'uitslag'   quiz, fase 2 — groene en rode randen
     'bladeren'  rondkijken   — alle foto's ingevuld
     'bewerken'  beheer-tool  — selecteren, slepen om te herordenen

   De weergave weet niets van gezichten of antwoorden. Wie een knoop wil
   versieren, vraagt het element op met knoopEl(id) en doet dat zelf.
   ========================================================================= */

const BoomView = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function maak(container, opties = {}) {
    const o = {
      ...StamboomLayout.STANDAARD,
      zoomMin: 0.25,
      zoomMax: 2.5,
      minLeesbaar: 0.55,
      ...opties,
    };

    container.classList.add("boom");
    container.innerHTML = "";

    const laag = document.createElement("div");
    laag.className = "boom-laag";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "boom-lijnen");
    const knopenLaag = document.createElement("div");
    knopenLaag.className = "boom-knopen";
    laag.append(svg, knopenLaag);
    container.append(laag);

    const view = {
      layout: null,
      knoopEls: new Map(),
      modus: "bladeren",
      opKnoop: null, // callback(persoonId, element)
      x: 0,
      y: 0,
      schaal: 1,
    };

    /* ---------------- Tekenen ---------------- */

    function zet(personen) {
      view.layout = StamboomLayout.bereken(personen, o);
      const { knopen, lijnen, breedte, hoogte } = view.layout;

      svg.setAttribute("width", breedte);
      svg.setAttribute("height", hoogte);
      svg.setAttribute("viewBox", `0 0 ${breedte} ${hoogte}`);
      svg.innerHTML = "";
      for (const l of lijnen) {
        const el = document.createElementNS(SVG_NS, "line");
        el.setAttribute("x1", l.x1);
        el.setAttribute("y1", l.y1);
        el.setAttribute("x2", l.x2);
        el.setAttribute("y2", l.y2);
        el.setAttribute("class", "lijn lijn-" + l.soort);
        svg.append(el);
      }

      knopenLaag.innerHTML = "";
      view.knoopEls.clear();
      for (const k of knopen) knopenLaag.append(maakKnoop(k));

      laag.style.width = breedte + "px";
      laag.style.height = hoogte + "px";
    }

    function maakKnoop(k) {
      const p = k.persoon;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "knoop";
      el.dataset.id = p.id;
      el.style.left = k.x + "px";
      el.style.top = k.y + "px";
      el.style.width = k.breedte + "px";
      el.style.height = k.hoogte + "px";

      const fotos = document.createElement("span");
      fotos.className = "knoop-fotos";

      const naam = document.createElement("span");
      naam.className = "knoop-naam";
      naam.textContent = p.roepnaam || p.naam || "?";

      const jaren = document.createElement("span");
      jaren.className = "knoop-jaren";
      jaren.textContent = jarenTekst(p);

      el.append(fotos, naam, jaren);
      el.setAttribute("aria-label", `${p.naam || "?"} ${jarenTekst(p)}`.trim());
      view.knoopEls.set(p.id, el);
      return el;
    }

    function jarenTekst(p) {
      if (p.geboren && p.overleden) return `${p.geboren}–${p.overleden}`;
      if (p.geboren) return `${p.geboren}`;
      if (p.overleden) return `† ${p.overleden}`;
      return "";
    }

    /* ---------------- Pannen en zoomen ---------------- */

    function pasToe() {
      laag.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.schaal})`;
    }

    function zoomNaar(nieuweSchaal, puntX, puntY) {
      const s = Math.min(o.zoomMax, Math.max(o.zoomMin, nieuweSchaal));
      if (s === view.schaal) return;
      view.x = puntX - ((puntX - view.x) * s) / view.schaal;
      view.y = puntY - ((puntY - view.y) * s) / view.schaal;
      view.schaal = s;
      pasToe();
    }

    /** Zoomt uit tot de hele boom past en zet hem in het midden. */
    function passend(marge = 24) {
      if (!view.layout || !view.layout.knopen.length) return;
      const b = container.clientWidth - marge * 2;
      const h = container.clientHeight - marge * 2;
      if (b <= 0 || h <= 0) return;
      const s = Math.min(
        o.zoomMax,
        Math.max(
          o.zoomMin,
          Math.min(b / view.layout.breedte, h / view.layout.hoogte)
        )
      );
      view.schaal = s;
      view.x = (container.clientWidth - view.layout.breedte * s) / 2;
      view.y = (container.clientHeight - view.layout.hoogte * s) / 2;
      pasToe();
    }

    /**
     * Beginstand: leesbaar in plaats van volledig.
     *
     * Bij een grote stamboom is "alles passend" zo ver uitgezoomd dat de namen
     * niet meer te lezen zijn — en juist die namen zijn het spel. Daarom starten
     * we op een leesbare zoom, bovenaan de boom, en kan de speler zelf uitzoomen
     * met de knop of een dubbeltik.
     */
    function beginstand(marge = 24) {
      if (!view.layout || !view.layout.knopen.length) return;
      const b = container.clientWidth - marge * 2;
      const h = container.clientHeight - marge * 2;
      if (b <= 0 || h <= 0) return;
      const passendeSchaal = Math.min(b / view.layout.breedte, h / view.layout.hoogte);
      const s = Math.min(o.zoomMax, Math.max(o.minLeesbaar, Math.min(1, passendeSchaal)));
      view.schaal = s;
      view.x = (container.clientWidth - view.layout.breedte * s) / 2;
      // Verticaal centreren als de boom past; anders bovenaan beginnen.
      view.y = Math.max(marge, (container.clientHeight - view.layout.hoogte * s) / 2);
      pasToe();
    }

    /** Schuift een persoon in beeld, zonder de zoom te veranderen. */
    function naarKnoop(id, { gladjes = true } = {}) {
      const k = view.layout && view.layout.knopen.find((n) => n.id === id);
      if (!k) return;
      const doelX = container.clientWidth / 2 - (k.x + k.breedte / 2) * view.schaal;
      const doelY = container.clientHeight / 2 - (k.y + k.hoogte / 2) * view.schaal;
      if (gladjes) laag.style.transition = "transform .35s ease";
      view.x = doelX;
      view.y = doelY;
      pasToe();
      if (gladjes) {
        setTimeout(() => (laag.style.transition = ""), 380);
      }
    }

    /* ---------------- Invoer ---------------- */

    const wijzers = new Map();
    const gevangen = new Set();
    let sleepAfstand = 0;
    let startAfstand = 0; // vingerafstand bij pinch
    let startSchaal = 1;

    const positieIn = (e) => {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    /**
     * De aanwijzer wordt pas gevángen zodra er écht gesleept wordt.
     *
     * Vingen we hem al bij pointerdown, dan stuurt de browser de bijbehorende
     * `click` naar de container in plaats van naar de knoop waarop je drukte —
     * en dan gebeurt er bij een gewone muisklik niets meer. (Met nagemaakte
     * events valt dat niet op, want die laten zich niet vangen.) Zo blijft een
     * tik een gewone tik, en werkt pannen buiten het venster nog steeds.
     */
    function vangAan(pointerId) {
      if (gevangen.has(pointerId)) return;
      try {
        container.setPointerCapture(pointerId);
        gevangen.add(pointerId);
      } catch {
        /* niet elke aanwijzer laat zich vangen; pannen werkt dan ook nog */
      }
    }

    container.addEventListener("pointerdown", (e) => {
      // Een knoop mag zelf zijn tik afhandelen; pannen mag daar ook beginnen.
      wijzers.set(e.pointerId, positieIn(e));
      if (wijzers.size === 1) sleepAfstand = 0;
      if (wijzers.size === 2) {
        const [a, b] = [...wijzers.values()];
        startAfstand = Math.hypot(a.x - b.x, a.y - b.y);
        startSchaal = view.schaal;
        // Knijpen is nooit een tik, dus meteen vangen.
        for (const id of wijzers.keys()) vangAan(id);
      }
    });

    container.addEventListener("pointermove", (e) => {
      if (!wijzers.has(e.pointerId)) return;
      const vorige = wijzers.get(e.pointerId);
      const nu = positieIn(e);
      wijzers.set(e.pointerId, nu);

      if (wijzers.size === 1) {
        const dx = nu.x - vorige.x;
        const dy = nu.y - vorige.y;
        sleepAfstand += Math.abs(dx) + Math.abs(dy);
        // Voorbij de tikdrempel: dit is slepen, dus de aanwijzer vasthouden.
        if (sleepAfstand > 8) vangAan(e.pointerId);
        view.x += dx;
        view.y += dy;
        pasToe();
      } else if (wijzers.size === 2) {
        const [a, b] = [...wijzers.values()];
        const afstand = Math.hypot(a.x - b.x, a.y - b.y);
        sleepAfstand += 10; // pinch telt nooit als tik
        if (startAfstand > 0) {
          zoomNaar(
            (startSchaal * afstand) / startAfstand,
            (a.x + b.x) / 2,
            (a.y + b.y) / 2
          );
        }
      }
    });

    function stop(e) {
      wijzers.delete(e.pointerId);
      gevangen.delete(e.pointerId);
      if (wijzers.size < 2) startAfstand = 0;
    }
    container.addEventListener("pointerup", stop);
    container.addEventListener("pointercancel", stop);

    // Muiswiel en trackpad.
    container.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const pos = positieIn(e);
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        zoomNaar(view.schaal * factor, pos.x, pos.y);
      },
      { passive: false }
    );

    // Tik op een knoop — maar alleen als er niet gepand is.
    knopenLaag.addEventListener("click", (e) => {
      const el = e.target.closest(".knoop");
      if (!el) return;
      if (sleepAfstand > 8) return; // dit was slepen, geen tik
      if (view.opKnoop) view.opKnoop(el.dataset.id, el, e);
    });

    container.addEventListener("dblclick", (e) => {
      if (e.target.closest(".knoop")) return;
      passend();
    });

    /* ---------------- Openbare API ---------------- */

    Object.assign(view, {
      zet,
      passend,
      beginstand,
      naarKnoop,
      knoopEl: (id) => view.knoopEls.get(id),
      alleKnopen: () => view.knoopEls,
      zetModus(m) {
        container.dataset.modus = m;
        view.modus = m;
      },
      element: container,
    });
    view.zetModus(view.modus);
    return view;
  }

  return { maak };
})();
