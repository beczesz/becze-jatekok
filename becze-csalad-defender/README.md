
# Becze Család Defender

Közös toronyvédő: a kivetítőn egy vár, minden játékosnak saját sávja és színe (🦊 Piros, 🐳 Kék, 🐸 Zöld, 🐥 Sárga, 🦄 Lila). 3-4 játékosra hangolva, 5 is mehet. Tíz hullám, mindegyiknek saját témája; az 5. és a 10. végén sárkány (4-5 játékosnál a végén kettő).

## Játék élesben

1. A laptopon, Chrome-ban: **https://varvedok-jatek.web.app/screen.html**, ezt húzd a kivetítőre (F: teljes képernyő, egy kattintás: hang be).
2. A nyitóképernyőn QR-kód és négybetűs szobakód. A gyerekek a telefonnal beolvassák a QR-t, színt és nehézséget választanak.
3. Ha kevés a telefon: a laptopon egy másik Chrome-ablakban a QR alatti cím (`phone.html?room=KÓD`), billentyűzettel.
4. Valaki megnyomja az „Indulás!” gombot (vagy szóköz a kivetítőn).

Internet kell hozzá (a telefonok a Firebase-en át beszélnek a kivetítővel). A kivetítő lapjának újratöltése után is ugyanaz a szoba marad.

### Firebase

| Mi | Hol |
|---|---|
| Projekt | `varvedok-jatek` (ingyenes Spark csomag), konzol: https://console.firebase.google.com/project/varvedok-jatek |
| Tárhely | Firebase Hosting, https://varvedok-jatek.web.app |
| Adat | Realtime Database, `europe-west1`; `rooms/{KÓD}/host`, `/state` (a kivetítő írja), `/inputs` (a telefonok írják, a kivetítő törli) |
| Belépés | névtelen (anonymous), mindenkinek |
| Szabályok | a repó gyökerében, `database.rules.json` (közös a Csillaghajóval, az ott a `ship/` ág): csak a szoba gazdája (a kivetítő) írhatja az állapotot és olvashatja a parancsokat; a parancsok mezői és értékei kötöttek. 2026-11-15-én két névtelen felhasználóval kipróbálva: 13 esetből 13 helyes |

Frissítés élesbe, a repó gyökeréből (2026-11-17 óta ott van a `firebase.json`, a két játék két külön tárhely-célpont):

```bash
NO_UPDATE_NOTIFIER=1 npx -y firebase-tools@15 deploy --only hosting:defender,database --project varvedok-jatek
```

A régi szobák az adatbázisban maradnak (pár kilobájt), automatikus takarítás nincs.

## Próba internet nélkül (helyi mód)

```bash
python3 -m http.server 8760
```

Ebből a mappából. Utána a Chrome-ban:

- `http://localhost:8760/proba.html?n=4`: kivetítő és 3-5 telefon egy lapon (`n=3`, `4` vagy `5`), helyi módban.
- `screen.html?helyi=1` és `phone.html?helyi=1`: helyi mód (BroadcastChannel), csak ugyanabban a böngészőben működik.

## Laptopos játékos

Ha nincs elég telefon, valaki a laptopról játszik: ugyanaz a `phone.html` egy másik Chrome-ablakban vagy lapon. Laptopon középre igazodik, és billentyűzettel is megy:

| Billentyű | Mit |
|---|---|
| `1`-`6` | a hely megnyitása |
| `1`-`4` a választóban | torony vétele; `Enter` fejlesztés; `Esc` bezár |
| `W` | varázspálca |
| `Szóköz` | Kész / Villám / Indulás / Újra |
| `L` | másik játékos sávja (segítéshez) |
| `K` | 20 arany a vár kincstárába |

A kivetítő akkor is pontosan megy tovább, ha a lapja háttérbe kerül (a játék a valódi eltelt időt pótolja). A kivetítőt mégis érdemes külön ablakban, a kivetítő képernyőjén tartani, mert a háttérben lévő lap nem rajzol.

## Játékszabályok röviden

- **Egy közös vár:** a bal oldalon egyetlen vár, közös élettel; minden sáv ide vezet.
- **Átlövés:** az íjász, a jég és az ágyú a saját sávja mellett a szomszéd sávba is lő (a középső játékos mindkét testvérét védi). A lövedék a lövő színét viseli, és a legyőzött szörny aranya a lövőé.
- **Kereszttűz 🤝:** ha egy szörnyet két különböző játékos tornya is eltalált, 30%-kal többet sebződik, és legyőzésekor minden segítő +2 aranyat kap. A szörnyön a segítők színe forog.
- **Segélykérés 🆘:** hullám közben a telefonon egy gomb; 8 mp-ig mindenki tornya a bajba jutott sávot célozza, és eggyel messzebbre is ellő. Játékosonként 20 mp-enként egyszer.
- **Vándorló sárkány:** a sárkány 6-9 mp-enként átúszik egy szomszéd sávba, ezért csak közösen lehet legyőzni.
- **Erősségek (szerepek):** mindenki mást választ a telefonon.
  - 🏹 Vadász: íjász és ágyú +30% sebzés.
  - 🛡️ Csapdamester: háló és jég 30%-kal olcsóbb, 50%-kal tovább tart.
  - 🧙 Varázsló: kristály és bánya erősebb (+50%) és olcsóbb.
- **Tornyok:** Íjász (20), Jégtorony (30, lassít), Ágyú (50, egyszerre többet talál, páncélt is tör), 🕸️ Hálódobó (35, egy pillanatra megállítja a szörnyet), 💎 Varázskristály (45, nem lő, a körülötte lévő tornyokat erősíti, a szomszéd sávban is), Aranybánya (30).
- **Kombók:** lelassított szörnyre az íjász 1,5-szörös, hálóban lévőre az ágyú dupla erővel üt. A csapdamester előkészít, a vadász lecsap, a varázsló mindkettőt erősíti.
- **Nyolc szint:** Alap, Bronz, Ezüst, Arany, Smaragd, Zafír, Rubin, Csoda. Minden szint erősebb és drágább (a fejlesztés az alapár 0,8; 1,4; 2,2; 3,5; 5,5; 8,5; 13-szorosa). A szint a talapzat színén látszik, a torony nagyobb lesz. Az 5. szinttől két sávnyira is átlő, a 8. szinten (szivárványos) egyszerre két szörnyre lő.
- **A szörnyek dühe 🔥 (alkalmazkodó nehézség):** két hibátlan hullám után a düh eggyel nő: +15% élet és sávonként +1 szörny dühszintenként, 2-es dühtől aranyló elit szörnyek (2,2-szeres élet, dupla arany). Ha egy hullámban a vár életének legalább 15%-a elveszett, vagy betörtek, a düh eggyel csökken.
- **Végtelen mód ♾️:** a 10. hullám után a „Tovább a végtelenbe” gombbal folytatható, keveredő témákkal, egyre nehezebben (15. hullámtól három sárkány). A kivetítő böngészője megjegyzi a családi rekordot.
- **Atombomba ☢️ (mentőöv):** 300 aranyért bárki vehet a saját pénzéből, legfeljebb 3-at tartalékolhat. Hullám közben ledobható arra a sávra, amelyiket a telefon épp mutatja (a sajátra vagy egy testvérére): ott minden szörny elpusztul, a sárkány az élete felét veszíti el. Az így elpusztult szörnyekért nincs arany. A ledobás kétlépcsős ("Biztos? Nyomd meg újra!"), hogy véletlenül ne menjen el. Laptopon `V` vétel, `A` ledobás (kétszer).
- **Villám:** minden szörny életének 35%-át viszi el (várszintenként +3%, legfeljebb 50%), a sárkányét harmannyit.
- **Háló:** a hálóból kiszabadult szörny 2,5 mp-ig nem fogható újra.
- **Kincstár:** minden várszint drágább (300, 600, 900 … arany 3 játékosnál).
- **Szörnyek:** 🐛 hernyó, 🦇 denevér (gyors), 🐌 csiga (szívós), 🐞 páncélos (az íjász és a jég alig sebzi), 👻 szellem (a jég nem lassítja), 🐷 malacpersely (nem bánt, de sok aranyat ér, ha elkapod), 🐲 sárkány.
- **Előrejelzés:** építés közben a kivetítőn és a telefonon is látszik, mi jön az egyes sávokba, és hova jön a sárkány.
- **Segítés:** bárki fejlesztheti a többiek tornyait a saját aranyából (a telefonon felül a sávváltó). Ajándék: 20 arany egy játékosnak.
- **Vár-kincstár:** a fölös arany a közös kincstárba mehet; ha megtelik, a vár szintet lép: +3 szív, erősebb villám, zászló a váron.
- **Villám:** a legyőzött szörnyek töltik; akkor sújt le, ha 10 mp-en belül minden csatlakozott játékos megnyomja.
- **Varázspálca 🪄:** egy gombnyomásra a következő jó lépés (épít vagy fejleszt). A legkisebbnek olvasás nélkül is megy.
- **Nehézség játékosonként:** 🐣 könnyű, 🙂 normál, 🦁 nehéz; a saját sávba jövő szörnyek erejét állítja.
- **Nincs kiesés:** közös a vár élete. Ha elfogy, „Újra!”: a hullám elölről indul, és minden torony meg arany megmarad.
- **Hibátlan hullám** (szívvesztés nélkül): +10 arany mindenkinek. **Győzelemkor** mindenki kap egy érmet, más-más kategóriában (szörnyvadász, legnagylelkűbb, legjobb segítő, várépítő, aranyásó).
- Ha egy telefon lecsatlakozik, a játék megy tovább; játék közben is lehet csatlakozni (+7 szív a várnak).

## Fájlok

| Fájl | Mit |
|---|---|
| `rules.js` | minden szám és szabály (tornyok, szörnyek, hullám-témák, érmek) |
| `screen.js` | a játék agya és rajzolása a kivetítőn |
| `phone.js`, `phone.html` | a vezérlő (telefon és laptop); csak parancsot küld |
| `transport.js` | a kapcsolat: Firebase Realtime Database szobakóddal, vagy helyi mód (`?helyi=1`) |
| `config.js` | a Firebase webes beállítása (nem titok) |
| a repó gyökerében: `database.rules.json`, `firebase.json`, `.firebaserc` | az adatbázis szabályai és a telepítés beállítása, mindkét játéknak |
| `proba-szimulacio.js` | egyensúly-próba a `proba.html` konzoljában: `await import('/proba-szimulacio.js')`, majd pl. `await runSim({ n: 4, gyenge: [3] })` |

## Egyensúly (mért szimulációval, 2026-11-15)

- 4 fő, mind jól játszik: a 10. hullámig nem fogy szív, a 10.-ben 10 (43-ból).
- 4 fő, egyikük csak íjászt rak: az 5. hullámban 5, a 10.-ben 12 szív fogy, nyernek.
- 3 fő, ketten gyengék, senki nem segít: háromszor betörnek (8-10. hullám), de mivel minden megmarad, végül nyernek.
- 3 fő, a kicsi könnyű fokozaton, a többiek segítenek: simán nyernek.

A szimuláció ügyesebb egy gyereknél, ezért a valódi játék nehezebb lesz. Gyerekekkel még nem próbáltuk.

## Előzmények

- 0.7.0: atombomba: 300 arany, játékosonként legfeljebb 3 tartalékban, kétlépcsős ledobás a kiválasztott sávra; a sárkány felét veszi el. Kipróbálva élesben (vásárlás, ledobás a testvér sávjára, sárkány).
- 0.6.1: verziószám a kivetítő jobb felső sarkában és a telefon jobb alsó sarkában (`rules.js` `VERSION`); ha a telefoné eltér a kivetítőétől, a telefon sárga sávban szól, Frissítés gombbal. Minden élesítésnél emelni kell.
- 0.6.0: nyolc szint drágakövekkel, dupla lövés a 8. szinten, alkalmazkodó nehézség (szörnyek dühe, elit szörnyek), végtelen mód családi rekorddal; kiskapuk zárva (örök háló, mindent ölő villám, végtelen kincstár).
- 0.5.0: három erősség (vadász, csapdamester, varázsló), két új fegyver (hálódobó, varázskristály), kombók, öt fejlesztési szint látható szintváltással; erősebb szörnyek.
- 0.4.0: valódi közös várvédés: egy vár, átlövés a szomszéd sávba, kereszttűz, segélykérés, vándorló sárkány; a játékosok aranya a felső sávban; nehezebb késői hullámok.
- 0.3.0: Firebase-bekötés (Realtime Database, névtelen belépés, szabályok), szobakód és QR a kivetítőn, élesítve a varvedok-jatek.web.app címre.
- 0.2.0: 5 játékos (3-4-re hangolva), laptopos játékos billentyűzettel; a Fable-modell játéktervezői átnézése alapján segítés más sávjában, kincstár, varázspálca, nehézség, hullám-témák, új szörnyek, előrejelzés, érmek; vereség után semmi nem vész el.
- 0.1.0: első helyi prototípus, 3 játékos.

## Következő lépések

1. Próbajáték a gyerekekkel valódi telefonokkal, utána hangolás (`rules.js`).
