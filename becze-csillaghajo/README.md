# Becze Csillaghajó

Közös űrhajó 3-5 játékosnak: a kivetítőn egy hajó, rajta állomások (kormány, ágyúk, rakéta), mindenki a telefonjával áll be egy állomásra. A teljes terv: [TERV.md](TERV.md).

**Állapot: v0.3.0, 20 gonosz, fejlődés és rakétás** (2026-11-17). Egy hajó, négy állomás: 🧭 kormány (kar: merre repüljünk, gomb: turbó), 🔫 ágyú 1 és 2 (kar: célzás, gomb: lövés), 🚀 rakéta (kar: célzás, gomb: egy nagy, célkövető rakéta, ami robbanáskor mindent sebez a körében; utána kb. 3 mp újratöltés, a fegyver szintjével gyorsul).

## Hogyan megy a játék (v0.2)

- **20 szint, szintenként egy gonosz.** A hajó körül egy nagy nyíl mindig a következő gonosz felé mutat (a képernyő szélén is, ha nem látszik). Messziről a gonosz alszik (Zzz); ahogy közeledünk, kinyitja a szemét, tátja a száját, nő és pirosan izzik, a képernyő széle is pirosra vált.
- **Mindig le lehet győzni.** A gonosz lassú, megáll egy tisztes távolságban, és nincs kiesés: a nyálgolyója és a kis ellenségek csak meglökik a hajót. Az ereje a hajó akkori fegyveréhez igazodik: két ágyússal az 1. szinten kb. 15-20 mp, a 20.-on kb. 40-45 mp (szimulációval mérve, odarepüléssel együtt).
- **Kisebb ellenségek** három méretben (kicsi, közepes, nagy), a gonosz körül; a 6. szinttől a gonosz újakat is szül.
- **Minden legyőzött gonosz után fejlődés**, sorban: fegyver (Kavicsvető, Gyorstüzelő, Dupla ágyú, Lézer, Hármas lézer, Rakéták, Plazmaágyú, Csillagvihar), pajzs (Buborék, Erőtér, Kristály, Csillag; magától véd és tölt vissza), hajtómű (Pöfögő, Kerozinos, Ion, Fúziós, Hiper), hajótest (Bádogteknő, Uszonyos, Nyílhegy, Szárnyas vadász, Csillagcirkáló). Az elején a hajó lassú és a fegyver primitív.
- A 20. gonosz után: „Megmentettétek a csillagködöt!”, utána a kör a legerősebb gonoszokkal folytatódik.
- A sorrend, a nevek és a számok a `rules.js`-ben vannak (`BOSSES`, `WEAPONS`, `SHIELDS`, `ENGINES`, `HULLS`, `bossStats`).
- Próbához a kivetítő konzoljában: `__ship.go(12)` a 12. szintre ugrik, `__ship.near()` a gonosz mellé teszi a hajót, `__ship.win()` legyőzi a mostanit.

## Játék élesben

1. A laptopon, Chrome-ban: **https://becze-csillaghajo.web.app/screen.html**, ezt húzd a kivetítőre (F: teljes képernyő).
2. A telefonnal a QR-kód, utána szín, utána állomás (felül a négy gomb). Egy állomáson egyszerre egy ember lehet.
3. Laptopos játékos: a QR alatti cím egy másik ablakban; nyilak vagy WASD a kar, szóköz a gomb, 1-4 az állomás.

A kar ott születik, ahol a hüvelykujj leér, ezért nem kell pontosan célozni rá.

## Mit mérünk ebben a lépésben

A Defenderben ritka parancsok mentek, itt folyamatos a kar. A telefon a saját vezérlő-rekordját írja felül (`ship/{KÓD}/pads/{szín}`), legfeljebb tízszer másodpercenként, csak változáskor, plusz kétmásodpercenként életjel. A kivetítő visszaküldi, melyik sorszámú rekordot látta utoljára, és a telefon ebből méri az oda-vissza időt.

- A telefon alján: `késés ~X ms (oda-vissza Y ms)`; zöld 250 ms oda-vissza alatt, sárga 500 alatt, piros fölötte.
- A kivetítő alján minden játékosnál: hány jel jön másodpercenként, és a telefon mért késése.
- Az oda-vissza idő tartalmazza a kivetítő 100 ms-os küldési ütemét is, ezért a valódi kar-késés inkább az oda-vissza fele.

Mért értékek:

| Mikor | Hol | Oda-vissza | Megjegyzés |
|---|---|---|---|
| 2026-11-17 | laptop, helyi mód | ~100 ms | a kivetítő küldési üteme adja |
| 2026-11-17 | laptop, élő Firebase | ~140 ms | kivetítő és „telefon” ugyanazon a gépen |
| | valódi telefon, otthoni wifi | | **ezt kell kipróbálni** |

## Firebase

Ugyanaz a projekt, mint a Defenderé (`varvedok-jatek`), de külön tárhely (`becze-csillaghajo.web.app`) és külön adatbázis-ág (`ship/`).

- Szabályok: a repó gyökerében, `database.rules.json`, `ship` ág. Szobát csak üres helyre lehet nyitni; az állapotot csak a kivetítő írja; a vezérlő-rekordokat csak a kivetítő olvassa; egy színt csak a gazdája írhat (vagy bárki, ha 15 mp óta néma); a mezők és az értékek kötöttek (kar -1 és 1 között, idő a szerveré).
- A lap bezárásakor a Firebase magától törli a játékos rekordját (onDisconnect), a kivetítő pedig 8 mp csend után elengedi az állomását.
- 2026-11-17-én élesben, egy második, idegen névtelen felhasználóval kipróbálva: 10 esetből 10 helyes (foglalt szín, rossz érték, idegen mező, olvasás, állapot írása, szoba elfoglalása, 6-os szín, nem létező szoba elutasítva; szabad szín és a saját rekord törlése engedve).

Frissítés élesbe, a repó gyökeréből:

```bash
NO_UPDATE_NOTIFIER=1 npx -y firebase-tools@15 deploy --only hosting:csillaghajo,database --project varvedok-jatek
```

Minden élesítésnél emeld a `rules.js` `VERSION` értékét; a telefon sárga sávban szól, ha eltér a kivetítőétől.

## Próba internet nélkül

```bash
python3 -m http.server 8761
```

Ebből a mappából, utána `http://localhost:8761/proba.html`: kivetítő és két telefon egy lapon, helyi módban (`?helyi=1`, BroadcastChannel). A konzolban `__ship.S` a teljes állapot.

## Fájlok

| Fájl | Mit |
|---|---|
| `rules.js` | verzió, színek, állomások, a küldés ütemei |
| `screen.js`, `screen.html` | a kivetítő: szimuláció és rajzolás |
| `phone.js`, `phone.html` | a vezérlő (telefon és laptop) |
| `transport.js` | a kapcsolat (Firebase vagy helyi mód) |
| `config.js` | a Firebase webes beállítása (nem titok) |
| `TERV.md` | a játékterv |

## Előzmények

- 0.1.0 (2026-11-17): kar-próba. Kormány és két ágyú telefonról, aszteroidák, csillagok, késésmérés, foglalt állomás, verzió-ellenőrzés; külön tárhely és szabályok, élesben kipróbálva.
