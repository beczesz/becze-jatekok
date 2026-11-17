# Becze játékok

Családi játékok, amiket a gyerekekkel együtt játszunk: a kivetítőn fut a játék, a telefonok a kontrollerek. Böngészőben megy, telepíteni nem kell semmit.

## Játékok

| Játék | Mi ez | Játék élesben |
|---|---|---|
| [Becze Család Defender](becze-csalad-defender/) | Közös toronyvédő 3-5 játékosnak: egy vár, sávonként egy játékos, átlövés a testvér sávjába, szerepek, 8 fejlesztési szint, atombomba | https://varvedok-jatek.web.app/screen.html |
| [Becze Csillaghajó](becze-csillaghajo/TERV.md) | Közös űrhajó 3-5 játékosnak: 6 állomás (kormány, pajzs, ágyúk, szerelő), mindig kevesebb kéz, mint feladat, csillagbébik mentése. **Tervezés alatt** | még nincs |

Új játék új mappába kerül, a saját README-jével.

## Hogyan működnek

Egy főképernyő (kivetítő) futtatja a játékot, a telefonok csak parancsot küldenek. A kapcsolat Firebase Realtime Database-en megy négybetűs szobakóddal és QR-kóddal, vagy helyben, internet nélkül (`?helyi=1`).

A Firebase webes beállítása (`config.js`) nem titok: a védelmet az adatbázis szabályai adják.
