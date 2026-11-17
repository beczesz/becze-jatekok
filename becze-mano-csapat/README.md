# Becze Manó-csapat

Közös ügyességi és fejtörő játék pontosan négy játékosnak: a kivetítőn a pálya, a telefon a kontroller (kar és egy gomb). Mindegyik manó mást tud, és minden pálya egy feladat, amit csak együtt lehet megoldani. A pálya kész, ha mind a négy manó a saját kijáratán áll.

**Állapot: v0.1.0, 10 pálya** (2026-11-17). Mind a tíz pályát a próba-robot végigjátszotta (`proba-robot.js`), valódi gyerekekkel még nem próbáltuk.

## A négy manó

| Manó | Mit tud |
|---|---|
| 🗿 **Kavics** | Nehéz: csak ő nyomja le a nagy (💪) gombot, alatta beszakad a repedt kő, és csak ő tolja a vasládát. Ha valaki a fején áll és ő ugrik, magasra röpíti; ha mindenki rajta áll, tűzijáték: mindenki szétrepül. |
| 🐭 **Fürge** | Kicsi: csak ő fér át a rácson. A levegőben is ugrik, újra és újra, így bármilyen magasra feljut. |
| 🚁 **Kopter** (v0.1-ben Lufi) | Helikopter: nyomva tartott gombbal emelkedik, bármeddig; elengedve lassan ereszkedik. Aki a levegőben az aljához ér, belekapaszkodik (a kapaszkodóba is lehet kapaszkodni), a Kopter viszi; ugrással le lehet ugrani, kar lefelé elenged. |
| 🌱 **Indás** | Külön INDA gombja van: bárhol indát növeszt egészen fel a plafonig (azon mindenki fel-le mászik); 30 mp után elsorvad, egyszerre legfeljebb 3 él. A magnál a magot növeszti (híd a tüskék fölé). |

Mindenkire igaz: egymás fejére lehet állni; a kar lefelé húzása a karnál átbillenti a kart; a tüske és a leesés csak visszavisz a rajthoz, nincs büntetés.

## A tíz pálya

| # | Név | A feladat |
|---|---|---|
| 1 | Kapunyitó | Valaki a gombon áll, a többiek átmennek; a túloldali gombon álló engedi át az utolsót. |
| 2 | Kavics ereje | Kavics beszakítja a repedt követ, lent a nagy gombot csak ő nyomja le. |
| 3 | A rács titka | A kaput nyitó gomb rács mögött van: Fürge megy be. |
| 4 | Fent a kar | A kar magasan van: a Kopter felrepül vagy Fürge felugrál, és lehúzza. |
| 5 | Indás kertje | Inda a magas falra, híd a tüskék fölé. |
| 6 | Kopter-lift | A fal túl magas: a Kopter felviszi a többieket (kapaszkodva vagy a tetején), vagy Kavics felröpíti őket; aki utoljára marad a gombon, egyedül is feljut. |
| 7 | Ládatologatás | A ládát a gödörbe kell tolni, a gombra; a vasládát csak Kavics bírja. |
| 8 | Két gomb egyszerre | A kapu csak két egyszerre lenyomott gombtól nyílik, az egyik rács mögött. |
| 9 | Tüskés völgy | Híd a völgy fölé, a Kopter lehúzza a kart, inda a magasba. |
| 10 | A nagy kaland | Mindegyik képesség kell, sorban: nehéz gomb, inda, híd, magas kar, rács alatti gomb. |

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
