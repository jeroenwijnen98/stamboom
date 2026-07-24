/* =========================================================================
   OPSLAG  —  het werkbestand van de beheer-tool, in IndexedDB.

   Waarom IndexedDB en niet gewoon bestanden op schijf? Omdat een webpagina
   niet zomaar in een map mag schrijven. Door alles in de browser te bewaren
   kun je tussendoor stoppen en later verder, zonder mappen heen en weer te
   slepen. Foto's staan er als Blob in, dus zonder base64-opblazing.

   Kwijtraken kan alleen als je de browsergegevens wist. Dat is niet erg: de
   gepubliceerde data/-map is met de familiecode weer in te lezen (tab
   Publiceren), en is daarmee tegelijk je back-up.
   ========================================================================= */

const Opslag = (() => {
  const NAAM = "stamboomquiz";
  const VERSIE = 1;
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((klaar, mis) => {
      const verzoek = indexedDB.open(NAAM, VERSIE);
      verzoek.onupgradeneeded = () => {
        const d = verzoek.result;
        if (!d.objectStoreNames.contains("personen")) {
          d.createObjectStore("personen", { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains("fotos")) {
          d.createObjectStore("fotos", { keyPath: "id" });
        }
      };
      verzoek.onsuccess = () => {
        db = verzoek.result;
        klaar(db);
      };
      verzoek.onerror = () =>
        mis(verzoek.error || new Error("IndexedDB gaat niet open"));
    });
  }

  function doe(winkel, modus, werk) {
    return open().then(
      (d) =>
        new Promise((klaar, mis) => {
          const t = d.transaction(winkel, modus);
          const w = t.objectStore(winkel);
          let uitkomst;
          try {
            uitkomst = werk(w);
          } catch (e) {
            mis(e);
            return;
          }
          t.oncomplete = () =>
            klaar(uitkomst && uitkomst.result !== undefined ? uitkomst.result : uitkomst);
          t.onerror = () => mis(t.error);
          t.onabort = () => mis(t.error || new Error("Opslag afgebroken"));
        })
    );
  }

  function winkel(naam) {
    return {
      alles: () => doe(naam, "readonly", (w) => w.getAll()),
      zet: (item) => doe(naam, "readwrite", (w) => w.put(item)),
      zetVeel: (items) =>
        doe(naam, "readwrite", (w) => {
          for (const i of items) w.put(i);
        }),
      verwijder: (id) => doe(naam, "readwrite", (w) => w.delete(id)),
      leeg: () => doe(naam, "readwrite", (w) => w.clear()),
      /** Vervangt de hele inhoud in één transactie. */
      vervang: (items) =>
        doe(naam, "readwrite", (w) => {
          w.clear();
          for (const i of items) w.put(i);
        }),
    };
  }

  return {
    open,
    personen: winkel("personen"),
    fotos: winkel("fotos"),
  };
})();
