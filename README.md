# Stamboomquiz

**Live: <https://jeroenwijnen98.github.io/stamboom/>** — de QR-code staat in
`qr-stamboom.png`. De familiecode deel je apart; die staat nergens in deze repo.

Een webapp waarin familieleden gezichten uit oude foto's bij de juiste persoon
in de stamboom zetten. Je vult eerst **alles** in en ziet **pas daarna** hoeveel
je er goed had, met een overzicht van je fouten.

Pure HTML, CSS en JavaScript — geen build-stap, geen dependencies. Draait op
GitHub Pages.

> **Er staat nu proefdata in `data/`** (13 personen, 6 verzonnen foto's) met de
> code **`schuur-appel-fiets`**, zodat je meteen kunt zien hoe het werkt. Zodra
> je je eigen gegevens publiceert, verdwijnt die proefdata.

---

## Snel proberen

Audio en gegevens laden niet als je `index.html` dubbelklikt — browsers
blokkeren dat. Start dus een klein serventje in de projectmap:

```bash
python3 -m http.server 8000
```

- De quiz: <http://localhost:8000> (code: `schuur-appel-fiets`)
- De beheer-tool: <http://localhost:8000/tools/beheer.html>

---

## Je eigen stamboom en foto's invoeren

Alles gaat via **`tools/beheer.html`**. Die pagina draait alleen bij jou op de
laptop; bezoekers hebben er niets aan.

### 1. Stamboom

Tab **Stamboom**. Het snelste begin is **Snel invoeren…**: plak een ingesprongen
lijst en de hele tak wordt in één keer aangemaakt.

```
Jan Wijnen "Opa Jan" (1928-2011) x Marie de Vries "Oma Rie" (1931-2018)
  Piet Wijnen (1955) x Ria Jansen (1957)
    Marc Wijnen (1985)
    Anne Wijnen (1988)
  Corrie Wijnen (1958)
```

- Twee spaties inspringen = een niveau dieper (een kind van de regel erboven).
- Partners scheid je met `x`. De **eerste** naam op een regel is het kind van de
  regel erboven; de partner is ingetrouwd en krijgt dus geen ouders.
- Jaartallen tussen haakjes: `(1930)` of `(1930-2010)`.
- Een roepnaam tussen aanhalingstekens. Die komt in de boom te staan; de
  volledige naam zie je in de uitslag.

Daarna kun je in de boom klikken om iemand bij te werken. Met **◀ Naar links** en
**Naar rechts ▶** bepaal je de volgorde van broers en zussen.

### Familie erbij: nieuw of bestaand

**+ Partner**, **+ Kind** en **+ Ouder** openen een kiezer met twee wegen:

- **＋ Nieuwe persoon** — maakt iemand aan die er nog niet was.
- **Zoek iemand die er al staat** — koppelt aan een bestaande persoon. Dit is
  wat je nodig hebt zodra takken samenkomen: een nieuw kleinkind onder een opa
  die er al staat, of twee losse families die door een huwelijk aan elkaar
  vast komen te zitten.

Namen die niet kunnen, staan grijs met de reden erachter — "is al partner",
"heeft al twee ouders", "staat al onder deze persoon". Dat laatste voorkomt
kringetjes: je kunt niemand zijn eigen voorouder maken.

Twee dingen die de tool voor je meeneemt, en die je in de statusregel
rechtsboven terugleest:

- Koppel je een ouder aan iemand die nog géén ouders had, en die ouder heeft een
  partner, dan wordt die partner meteen de tweede ouder. Klopt dat niet (een kind
  uit een eerdere relatie), haal de relatie dan weg met de ✕ in de lijst eronder.
- Twee ouders van hetzelfde kind worden ook als partners van elkaar gezet, want
  daar hangt de gezinslijn in de boom aan.

> Staan de ouders van beide partners in de stamboom, dan moet de app kiezen via
> wie het gezin onder de boom hangt. Met het vinkje **"Hang het gezin via deze
> persoon in de boom"** maak je die keuze zelf. De andere ouder-kindrelatie
> gaat niet verloren: die wordt als stippellijn getekend.

### 2. Gezichten

Tab **Gezichten**. Sleep je foto's erin (of gebruik de knop). Ze worden
automatisch verkleind naar maximaal 1600 pixels en gedraaid volgens de
EXIF-oriëntatie, zodat telefoonfoto's niet op hun kant staan.

Teken vanaf het **midden van een gezicht naar buiten** om er een cirkel omheen
te trekken. Laat los en kies wie het is. Een bestaande cirkel kun je verslepen,
met het oranje handvat groter maken, of verwijderen.

- Cirkels zonder naam doen niet mee in de quiz. Handig voor de buurman.
- Personen zonder foto blijven wél in de boom staan, maar staan tijdens de quiz
  gedimd en zijn niet aan te tikken — ze kunnen immers geen antwoord zijn.
- Rechts zie je van wie je nog géén foto hebt.

### 3. Publiceren

Tab **Publiceren**. Kies een familiecode, klik **Maak data.zip** en pak het
uit over de repo:

```bash
cd ~/Documents/GitHub/_apps/stamboom
rm -rf data && unzip -q ~/Downloads/stamboom-data.zip
git add -A && git commit -m "Nieuwe stamboomgegevens" && git push
```

De `rm -rf data` is belangrijk: zonder dat blijven foto's die je hebt
verwijderd gewoon op de server staan.

---

## Je werk terughalen

De beheer-tool bewaart alles in de browser (IndexedDB). Raak je dat kwijt — of
wil je vanaf een andere computer verder — gebruik dan onderaan tab
**Publiceren** de knop **Inlezen**: kies de map `data/` uit de repo, voer de
familiecode in, en alles staat er weer.

**De gepubliceerde `data/`-map is dus tegelijk je back-up.** Er is nergens een
onversleutelde kopie nodig.

---

## Over de beveiliging

Alles in `data/` is versleuteld met AES-GCM-256. De sleutel wordt met
PBKDF2-SHA256 (250.000 rondes) uit de familiecode afgeleid. Ook de **foto's**
zijn versleuteld, niet alleen de namen — anders zou je ze los kunnen opvragen.

Alleen `manifest.json` staat in klare tekst: daar zitten het zout, het aantal
rondes en een klein versleuteld controlezinnetje in. Daardoor merkt de app
meteen dat een code fout is, zonder eerst megabytes aan foto's te downloaden.

**Wat dit wél doet:** zoekmachines, scrapers en toevallige voorbijgangers zien
niets. `robots.txt` en een `noindex`-tag houden de pagina uit Google.

**Wat dit níét doet:** iedereen die de code heeft, kan alles bekijken en
downloaden. Kies daarom een code die je niet ergens anders gebruikt — drie
willekeurige woorden met streepjes werken goed — en bedenk dat je hem niet kunt
terugvinden als je hem kwijtraakt.

De afgeleide sleutel blijft in `sessionStorage` staan. Ververs je de pagina, dan
hoef je de code niet opnieuw te typen; sluit je het tabblad, dan wel.

---

## Op GitHub Pages zetten

1. Repo aanmaken en pushen.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, map `/`.
3. Klaar. `.nojekyll` staat er al, dus GitHub laat de bestanden met rust.

Deel daarna de URL én de familiecode met de familie.

---

## Teksten en instellingen aanpassen

Alles wat je op het scherm ziet staat in **`js/config.js`**: titels, knoppen,
meldingen, en de weergave-instellingen van de stamboom (knoopgrootte,
tussenruimtes, zoomgrenzen). Dat is het enige bestand dat je hoeft aan te raken
om de app anders te laten klinken of ogen.

Een paar instellingen die je misschien wilt draaien:

| Instelling | Wat het doet |
| --- | --- |
| `weergave.gezichtPadding` | Hoeveel ruimte er rond een omcirkeld gezicht meeloopt. Hoger = meer haar en schouders in beeld. |
| `weergave.minLeesbaar` | Hoe ver de boom maximaal uitzoomt bij het openen. Lager = meer overzicht, kleinere namen. |
| `weergave.ruimteTussenTakken` | Ruimte tussen losse families. Hoger = luchtiger, maar breder. |

---

## Hoe het in elkaar zit

```
index.html            de quiz
css/styles.css        opmaak van de quiz
css/beheer.css        opmaak van de beheer-tool

js/config.js          ← teksten en instellingen
js/crypto.js          PBKDF2 + AES-GCM
js/data.js            ophalen, ontsleutelen, foto's lui laden
js/stamboom-layout.js rekent uit waar iedereen komt te staan
js/gezicht.js         cirkel op een foto → ronde tegel (puur CSS, geen uitsnede)
js/boom-view.js       de boom tekenen, pannen en zoomen
js/quiz.js            invullen (fase 1) en nakijken (fase 2)
js/bladeren.js        rondkijken — de enige plek waar hele foto's te zien zijn
js/app.js             schermen, dialogen, fotocontext
js/start.js           opstarten en knoppen koppelen

tools/beheer.html     de beheer-tool
tools/beheer.js       stamboom bewerken, gezichten omcirkelen, publiceren
tools/opslag.js       IndexedDB
tools/zip.js          ZIP schrijven en lezen, zonder bibliotheek

data/                 ← de versleutelde gegevens (wordt gecommit)
```

Twee dingen die misschien verbazen:

- **Gezichten worden niet uitgeknipt.** Een tegel krijgt de hele foto als
  achtergrond, en `background-size` en `background-position` worden in
  procenten uitgerekend. Eén ontsleutelde foto voedt zo al zijn gezichten, op
  elk schermformaat, zonder canvas-werk tijdens het spelen.
- **Tijdens fase 1 weet de app niet of iets klopt.** `quiz.js` houdt alleen bij
  wat je waar hebt neergezet. Pas bij **Nakijken** wordt dat naast het juiste
  antwoord gelegd. Wie hier iets aan toevoegt: geen kleur, geen geluid en geen
  teller die verraadt of een zet goed was.
- **De boomweergave vangt de aanwijzer pas als je écht sleept.** Vangt hij hem
  al bij het indrukken, dan stuurt de browser de bijbehorende klik naar de
  container in plaats van naar het kaartje, en doet een muisklik niets meer.
  Met nagemaakte events valt dat niet op — die laten zich niet vangen — dus dit
  is alleen te testen met echte muisinvoer.
