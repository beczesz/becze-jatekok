# Becze játékok

Családi játékok, amiket a gyerekekkel együtt játszunk: a kivetítőn fut a játék, a telefonok a kontrollerek. Böngészőben megy, telepíteni nem kell semmit.

## Játékok

| Játék | Mi ez | Játék élesben |
|---|---|---|
| [Becze Család Defender](becze-csalad-defender/) | Közös toronyvédő 3-5 játékosnak: egy vár, sávonként egy játékos, átlövés a testvér sávjába, szerepek, 8 fejlesztési szint, atombomba | https://varvedok-jatek.web.app/screen.html |
| [Becze Csillaghajó](becze-csillaghajo/) | Közös űrhajó 3-5 játékosnak: 6 állomás (kormány, pajzs, ágyúk, szerelő), mindig kevesebb kéz, mint feladat, csillagbébik mentése ([terv](becze-csillaghajo/TERV.md)). **Most: v0.2.0, 20 gonosz, a hajó fejlődik** | https://becze-csillaghajo.web.app/screen.html |

Új játék új mappába kerül, a saját README-jével.

## Hogyan működnek

Egy főképernyő (kivetítő) futtatja a játékot, a telefonok csak parancsot küldenek. A kapcsolat Firebase Realtime Database-en megy négybetűs szobakóddal és QR-kóddal, vagy helyben, internet nélkül (`?helyi=1`).

A Firebase webes beállítása (`config.js`) nem titok: a védelmet az adatbázis szabályai adják.

## Élesítés

Egy Firebase-projekt (`varvedok-jatek`) szolgálja ki mindet: közös adatbázis-szabályok a gyökérben (`database.rules.json`, játékonként külön ág), és játékonként külön tárhely-célpont (`firebase.json`, `.firebaserc`). A repó gyökeréből:

```bash
NO_UPDATE_NOTIFIER=1 npx -y firebase-tools@15 deploy --only hosting:<cél>,database --project varvedok-jatek
```

Célpontok: `defender` (varvedok-jatek.web.app), `csillaghajo` (becze-csillaghajo.web.app).
