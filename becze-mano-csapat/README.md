# Becze Manó-csapat

Közös ügyességi és fejtörő játék pontosan négy játékosnak: a kivetítőn a pálya, a telefon a kontroller (kar és egy gomb). Mindegyik manó mást tud, és minden pálya egy feladat, amit csak együtt lehet megoldani. A pálya kész, ha mind a négy manó a saját kijáratán áll.

**Állapot: v0.1.0, 10 pálya** (2026-11-17). Mind a tíz pályát a próba-robot végigjátszotta (`proba-robot.js`), valódi gyerekekkel még nem próbáltuk.

## A négy manó

| Manó | Mit tud |
|---|---|
| 🗿 **Kavics** | Nehéz: csak ő nyomja le a nagy (💪) gombot, alatta beszakad a repedt kő, csak ő tolja a vasládát, és a Kopter nem bírja el. A NYÍL gomb kötelet lő (a kar irányába): ahol megakad, ott lóg, leng mint egy inga, fel-le mászik rajta, újabb nyíllal továbblendül, ugrással elenged. Ha legalább ketten állnak rajta és ugrik: tűzijáték. |
| 🐭 **Fürge** | Kicsi: csak ő fér át a rácson. A levegőben is ugrik, de öt ugrás után elfárad, amíg le nem ér. |
| 🚁 **Kopter** | Helikopter: nyomva tartott gombbal emelkedik. Egyedül csak a pálya tetejéig, kapaszkodókkal az égig. Aki a levegőben az aljához ér, belekapaszkodik (a kapaszkodóba is lehet); a tetejére állót a propeller ledobja. Fent az égben ha valaki elenged, az egész lánc lezuhan. |
| 🌱 **Indás** | INDA gomb: bárhol indát növeszt, ami falig (az égi pályákon a végtelenségig) nő felfelé; 30 mp után elsorvad, meglévő indán újra megnyomva megújul. A magnál hidat is. |

Mindenkire igaz: egymás fejére lehet állni (a Kopterére nem); a kart elég megérinteni, és úgy marad; a tüske és a leesés csak visszavisz a rajthoz, nincs büntetés.

**Az ég (v0.3):** az égi pályák teteje nyitott. Fent felhők (rá lehet állni), madarak, hőlégballon, sárkány (bele lehet kapaszkodni, felvisz), bagoly, égi csillagok, és magasabban szivárvány, ufó, Hold és a Csillagkapu. A kamera követi, aki felmegy, a lent maradók a kép szélén látszanak.

## A tíz pálya (v0.3)

| # | Név | A feladat |
|---|---|---|
| 1 | Kapaszkodj! | Égi pálya. Magas fal a kijárat előtt: Kopter-lánc vagy inda. |
| 2 | Fürge öt ugrása | A kapu karja rácsos kalitkában, magasan: Fürge felugrál és beér. |
| 3 | Kavics kötele | Tüskés völgy kampókkal: Kavics kötélen átleng és megérinti a kart, a többieket a Kopter-lánc viszi át. |
| 4 | Égig érő inda | Égi pálya. A kijárat egy magas fennsíkon: inda vagy Kopter-lánc. |
| 5 | Gödör és rács | Fürge a rácsos gombra, Kavics a gödörbeli nagy gombra; bent a kar nyitva tartja a kapukat. |
| 6 | Felhő-sziget | Égi pálya. A kijárat egy lebegő szigeten. |
| 7 | Kar a magasban | Két gomb egyszerre (az egyik nehéz), bent fent a kar: a Kopter vagy Fürge érinti meg. |
| 8 | Két párkány | Két magas párkányon egy-egy gomb egyszerre, bent a kar. |
| 9 | Kavics a párkányon | A nehéz gomb és Kavics kijárata fent a párkányon: kötél vagy inda. |
| 10 | Égi nagy kaland | Égi pálya. Mindenki kijárata máshol: magas sziget (Kopter), oszlop teteje (Fürge), sziget (Kavics), a túloldal (Indás). |


A pályák a `levels.js`-ben vannak, szöveges rajzként (30 × 16 jel); a fájl elején a jelek magyarázata. Új pályához elég egy új rajz.

## Játék élesben

1. A laptopon, Chrome-ban: **https://becze-mano-csapat.web.app/screen.html**, ezt húzd a kivetítőre (F: teljes képernyő).
2. Mindenki a telefonjával beolvassa a QR-kódot, és választ egy manót.
3. Laptopon: **R** a pálya újra, **N** a következő, **P** az előző pálya. A kivetítő megjegyzi, hol tartottatok.
4. A telefonon a „Pálya újra” gombot 1,5 mp-ig nyomva kell tartani; a pálya akkor kezdődik újra, ha a játékosok fele kéri.

## Próba internet nélkül

```bash
python -m http.server 8762
```

Ebből a mappából, utána `http://localhost:8762/proba.html`: kivetítő és négy telefon egy lapon (`?helyi=1`). A kivetítő konzoljában: `__mano.go(5)` az 5. pálya, `__mano.join(1,2,3,4)` beléptet mindenkit, és `(await import('./proba-robot.js')).runAll()` végigjátssza mind a tíz pályát.

## Firebase

Ugyanaz a projekt, mint a másik két játéké (`varvedok-jatek`), külön tárhely (`becze-mano-csapat.web.app`) és külön adatbázis-ág (`mano/`), ugyanazokkal a szabályokkal, mint a Csillaghajóé. A kapcsolat (`transport.js`) a Csillaghajóéból jön, csak az útvonal más.

## Fájlok

| Fájl | Mit |
|---|---|
| `rules.js` | verzió, a négy manó adatai, fizika |
| `levels.js` | a tíz pálya |
| `screen.js`, `screen.html` | a kivetítő: játékmotor és rajzolás |
| `phone.js`, `phone.html` | a telefon: manóválasztás, kar, gomb, pálya újra |
| `proba-robot.js` | szkriptelt végigjátszás, a pályák megoldhatóságának próbája |
| `transport.js`, `config.js` | kapcsolat (Firebase vagy helyi) |
