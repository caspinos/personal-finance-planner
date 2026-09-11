# Przegląd ergonomii i funkcjonalności — Personal Finance Planner

Data przeglądu: 2026-09-11
Zakres: kod źródłowy aplikacji (Angular + Supabase), migracje, testy e2e, dokumentacja.
Metoda: analiza statyczna kodu (bez uruchamiania aplikacji w przeglądarce — patrz sekcja "Zastrzeżenia").

Legenda priorytetów:
- **P1** — poważnie utrudnia codzienne użycie lub prowadzi do błędnych danych
- **P2** — istotna niedogodność, warto poprawić w najbliższych iteracjach
- **P3** — drobiazg / szlif


## Streszczenie — 10 najważniejszych wniosków

1. **Dashboard jest pusty** — pierwszy ekran nie pokazuje żadnej liczby; brak wskaźników z planu (MVP pkt 11).
2. **Wpisywanie wydatku jest za długie** — 3 kliknięcia do formularza, brak „zapisz i dodaj kolejny”, brak przycisku „Anuluj”, po edycji powrót w złe miejsce.
3. **Karty kopert pokazują tylko saldo narastające** — brak „wydano X z Y w tym miesiącu”, brak celów/limitów kopert, brak sumy wszystkich kopert.
4. **Konta majątkowe i holdingi nie mają edycji ani usuwania** — literówka = nowe konto i utrata historii.
5. **Wartość rynkowa holdingu = cena ostatniej transakcji** — „niezrealizowany zysk” jest bezużyteczny; ceny surowców nigdzie nie są używane; holdingi nie zasilają wyceny konta.
6. **Suma majątku miesza waluty** przy braku kursu, zamiast pominąć konto lub oznaczyć sumę jako niepełną.
7. **Role nie są egzekwowane w UI** — `viewer` widzi przyciski zapisu i dostaje surowy błąd RLS po wysłaniu formularza.
8. **Brak resetu hasła i przełącznika gospodarstw** (oba możliwe małym kosztem, Supabase Auth i `selectHousehold` już istnieją).
9. **Liczby i daty są formatowane po angielsku w polskim UI** — brak `registerLocaleData(pl)`.
10. **Brak wyszukiwania/filtrów w historii i brak eksportu** danych (MVP pkt 12).

Szczegóły i pozostałe uwagi (łącznie 18 × P1, ~60 × P2) w sekcjach poniżej; lista brakujących funkcji z proponowaną kolejnością w sekcji 7.

---

## 1. Nawigacja i powłoka aplikacji (shell, dashboard, routing)

Źródła: `src/app/layout/shell/shell.ts`, `src/app/features/dashboard/dashboard.ts`, `src/app/app.routes.ts`

### Co działa dobrze
- Prosta, płaska nawigacja (5 pozycji), wersja mobilna z hamburgerem, przełącznik języka PL/EN, e-mail zalogowanego użytkownika i wylogowanie w nagłówku.
- Wszystkie trasy są lazy-loadowane, guardy `authGuard` + `householdGuard` prowadzą nowego użytkownika przez tworzenie gospodarstwa.

### Problemy ergonomiczne
- **P1 — Dashboard jest atrapą.** Strona startowa po zalogowaniu to karta powitalna z dwoma przyciskami. Użytkownik nie widzi ani jednej liczby (saldo kopert, ile wydano w miesiącu, majątek netto, najbliższe reguły cykliczne). Każde wejście do aplikacji wymaga dodatkowego kliknięcia, a pierwszy ekran nie daje żadnej informacji.
- **P2 — Brak wskazania aktywnej pozycji menu.** Linki w `shell.ts` nie używają `routerLinkActive`; użytkownik nie wie, w której sekcji się znajduje (szczególnie na podstronach typu `/budget/history`).
- **P2 — Brak wskaźnika/przełącznika gospodarstwa.** Nazwa bieżącego gospodarstwa pojawia się tylko w nagłówku dashboardu. Użytkownik należący do kilku gospodarstw (możliwe przez zaproszenia) nie ma jak przełączyć kontekstu — potwierdzone w `docs/feature-map.md` jako niezrobione. Ryzyko wpisania operacji do niewłaściwego gospodarstwa bez świadomości.
- **P2 — Brak globalnego przycisku „szybko dodaj wydatek”.** Najczęstsza czynność (zapis wydatku) wymaga: Dashboard → Budżet → „Zapisz transakcję”. Na telefonie: hamburger → Budżet → przewinięcie → przycisk. Dobrą praktyką jest stały przycisk akcji (FAB / pozycja w nagłówku) dostępny z każdego ekranu.
- **P3 — Selektor języka to natywny `<select>`** ze stylem ręcznym, niespójny z resztą (spartan). Podpisy „PL/EN” zamiast „Polski/English”. `aria-label="Language"` i `aria-label="Menu"` nie są tłumaczone.
- **P3 — Brak breadcrumbów/tytułów stron.** `document.title` nie jest ustawiany per trasa (brak `title:` w definicjach tras) — wszystkie zakładki przeglądarki mają tę samą nazwę, historia przeglądarki jest bezużyteczna.
- **P3 — Trasa `**` (404) nie istnieje.** Błędny adres pokazuje pustą powłokę zamiast komunikatu i linku do dashboardu.
- **P3 — Brak trybu ciemnego.** Paleta `:root.dark` jest zdefiniowana w `styles.scss`, ale nic jej nie włącza (brak przełącznika i reakcji na `prefers-color-scheme`).

## 2. Budżet kopertowy

Źródła: `src/app/features/budget/**`, `src/app/core/budget/budget.service.ts`

### Co działa dobrze
- Model „zdarzeniowy” (transakcje + transfery, saldo liczone w SQL) — salda przenoszą się między miesiącami automatycznie.
- Amortyzacja dużych wydatków (rozłożenie w czasie) z podglądem raty w formularzu — funkcja rzadko spotykana w prostych narzędziach, dobrze przemyślana (edycja nagłówka przelicza raty).
- Podpowiedzi nazw transakcji z automatycznym wyborem koperty — duże ułatwienie przy powtarzalnych wydatkach.
- Zbiorcze zasilanie kopert (`bulk-funding-form`) z „szybką kwotą” i zaznacz wszystko/wyczyść.
- Usuwanie koperty z przeniesieniem historii (atomowo w SQL) — bezpieczne.
- Reguły cykliczne z pauzą/wznowieniem.

### Problemy ergonomiczne — ekran główny budżetu (`budget.ts`)
- **P1 — Karty kopert pokazują wyłącznie saldo narastające.** Brakuje kluczowych informacji miesięcznych: ile wpłynęło, ile wydano w tym miesiącu, jaki procent zasilenia zużyto (pasek postępu). Bez tego nie da się ocenić „jak mi idzie w tym miesiącu” — trzeba wchodzić w historię każdej koperty osobno.
- **P1 — Brak sumy / podsumowania na górze ekranu budżetu.** Nie ma łącznej kwoty we wszystkich kopertach, sumy wydatków i wpływów w miesiącu, liczby kopert na minusie. Użytkownik z 10+ kopertami nie ma widoku całości.
- **P1 — Brak koncepcji „środki nieprzydzielone” / „do rozdysponowania”.** W metodzie kopertowej (YNAB, Goodbudget) dochód wpływa najpierw do puli, a potem jest dzielony na koperty. Tutaj „dochód” jest wpisywany bezpośrednio do koperty (typ `income` w `budget_transactions`), więc nic nie pilnuje, czy suma zasileń nie przekracza realnego dochodu gospodarstwa. Nie ma też miejsca na dochód, który jeszcze nie został podzielony.
- **P2 — Przeładowany pasek akcji.** Sześć przycisków w jednym rzędzie (Historia, Transfer, Zapisz transakcję, Zasil koperty, Nowa koperta, Nowa reguła), trzy z nich w tym samym wariancie `secondary`. Na wąskim ekranie zawijają się do 2–3 rzędów. Rekomendacja: jeden główny przycisk (Zapisz wydatek), pozostałe w menu „Więcej” / w sekcji ustawień budżetu.
- **P2 — Przełącznik miesiąca bez „Dziś”/wyboru miesiąca.** Aby wrócić do bieżącego miesiąca po przejrzeniu kilku wstecz trzeba klikać strzałką. Nie ma `<input type="month">` ani skoku do dowolnego miesiąca. Ten sam komponent jest skopiowany w 3 miejscach (`budget.ts`, `history.ts`, `envelope-history.ts`) — warto wydzielić wspólny `MonthSwitcher`.
- **P2 — Wybrany miesiąc nie jest w URL.** Po wejściu w historię koperty i powrocie widok resetuje się do bieżącego miesiąca; odświeżenie strony też gubi kontekst. Miesiąc powinien być parametrem zapytania (`?month=2026-08`).
- **P2 — Kolejność kopert tylko wg daty utworzenia.** Brak ręcznego sortowania (drag&drop / kolejność), grupowania (np. „Stałe”, „Zmienne”, „Oszczędności”), ani sortowania po saldzie. Przy większej liczbie kopert lista staje się chaotyczna.
- **P2 — Reguły cykliczne są uruchamiane przy wejściu na stronę budżetu** (`processDueRecurringRules()` w `loadAll()`). Jeśli nikt nie otworzy zakładki Budżet przez kilka dni, zasilenia/obciążenia zapisują się z opóźnieniem (weryfikacja daty w SQL — patrz migracje). Użytkownik nie dostaje żadnej informacji, że „właśnie zaksięgowano 3 reguły”. Lepiej: `pg_cron`/edge function + toast po wykonaniu.
- **P2 — Reguły cykliczne wyświetlane na dole strony głównej budżetu** w pełnej liście z przyciskami Edytuj/Pauza/Usuń. To konfiguracja, nie codzienna praca — zajmuje miejsce pod kopertami. Lepsze miejsce: osobna podstrona/ zakładka „Reguły” lub zwijana sekcja.
- **P2 — Waluta „PLN” wpisana na sztywno w szablonach** (`{{ ... }} PLN`), choć tabela `budget_transactions` ma kolumnę `currency`, a gospodarstwo ma `base_currency`. Jeśli ktoś ustawi walutę bazową na EUR, budżet i tak jest w PLN (a wartość „≈ w walucie bazowej” pokazuje przeliczenie). To mylące dla użytkownika spoza Polski i niespójne z założeniami projektu (multi-currency).
- **P3 — Potwierdzanie usunięcia przez `window.confirm`** (reguły, transakcje, transfery) zamiast dialogu spartan; nie da się ostylować, wygląda obco na tle reszty UI, blokuje cały tab.
- **P3 — `aria-label="Previous month"` / `"Next month"` nie tłumaczone.**
- **P3 — Pusty stan (brak kopert)** informuje tylko tekstem; nie ma przycisku „Utwórz pierwszą kopertę” ani szablonów startowych (np. Jedzenie, Mieszkanie, Transport, Rozrywka, Oszczędności).

### Problemy ergonomiczne — formularze (transakcja, transfer, koperta, reguła)
- **P1 — Formularze nie mają przycisku „Anuluj”/„Wróć”.** Jedyna droga wyjścia to przycisk „Wstecz” przeglądarki lub menu. Dotyczy: `transaction-form`, `transfer-form`, `envelope-form`, `recurring-rule-form`, `bulk-funding-form`. (Wyjątek: `envelope-delete` ma „Anuluj”).
- **P1 — Brak szybkiego wielokrotnego wpisywania.** Po zapisaniu transakcji aplikacja zawsze wraca na `/budget`. Wpisanie 10 paragonów = 10 × (przycisk → formularz → zapis → powrót). Potrzebne „Zapisz i dodaj kolejną” (z zachowaniem daty i koperty) lub formularz w dialogu/panelu bocznym nad listą.
- **P1 — Po edycji z widoku „Historia wszystkich operacji” użytkownik trafia do historii koperty**, nie tam, skąd przyszedł (`navigateByUrl('/budget/envelopes/${id}')`). Brak `returnUrl`. To samo po edycji z historii koperty w innym miesiącu — wraca do bieżącego miesiąca.
- **P2 — Kolejność pól w formularzu transakcji jest nieoptymalna.** „Nazwa” (która automatycznie ustawia kopertę na podstawie historii) jest ostatnim polem. Naturalny przepływ: Nazwa → (auto)Koperta → Kwota → Data. Pole kwoty ma domyślną wartość `0` — użytkownik musi ją skasować przed wpisaniem; lepiej puste pole z placeholderem `0,00`.
- **P2 — Typ „Wydatek/Dochód” to toggle-group poza formularzem reaktywnym** — OK, ale w formularzu transferu i wielu innych walidacja selectów pojawia się dopiero po `submit`; komunikat o brakującej kopercie nie jest powiązany `aria-describedby` z kontrolką.
- **P2 — Formularze są wyśrodkowane w pionie w kontenerze `min-h-svh`** *wewnątrz* powłoki, która ma już nagłówek. Efekt: strona jest wyższa niż okno (nagłówek + 100svh), pojawia się zbędny scroll, a formularz na desktopie „wisi” w środku pustego ekranu daleko od menu. Kontener powinien być zwykłym blokiem u góry strony (jak listy).
- **P2 — Podpowiedzi nazw korzystają z natywnego `<datalist>`.** Działa nierówno między przeglądarkami (Safari iOS ignoruje, Firefox pokazuje dopiero po wpisaniu), nie pokazuje koperty/kwoty obok podpowiedzi, a ograniczenie do 200 ostatnich rekordów bez deduplikacji po kopercie jest arbitralne. Lepszy: własny combobox (spartan `command`/`combobox`) z ostatnią kwotą i kopertą w podpowiedzi.
- **P2 — Brak kategorii/tagów i notatki na transakcji.** Jest tylko `name`. Nie da się zapisać np. „Biedronka — zakupy na grilla” z tagiem, ani załączyć paragonu. Raporty per kategoria (plan Etap 4) nie mają na czym pracować, bo kategoria = koperta.
- **P2 — Brak wskazania, kto zapisał operację** (`created_by` jest w bazie, nie jest pokazywane) — przy współdzieleniu przez domowników to istotna informacja („kto wydał 300 zł w kopercie Rozrywka?”).
- **P2 — Reguły cykliczne tylko miesięczne (dzień 1–28).** Brak tygodniowych, kwartalnych, rocznych (ubezpieczenie, podatek), brak daty końcowej ani daty startu (rusza od „następnego wystąpienia”). Brak podglądu „w tym miesiącu wykona się X reguł na sumę Y”.
- **P2 — Zbiorcze zasilanie nie pamięta poprzednich kwot.** Co miesiąc trzeba wpisywać kwoty od nowa; brak „powtórz zasilenie z zeszłego miesiąca” ani domyślnej kwoty per koperta (cel/limit koperty).
- **P2 — Zbiorcze zasilanie zapisuje wpisy sekwencyjnie, nieatomowo** (pętla `recordTransaction` w `bulk-funding-form`). Przy błędzie w środku część kopert jest zasilona, część nie; komunikat informuje tylko o liczbie zapisanych. Powinno iść jednym RPC/transakcją jak `recordValuations` w majątku.
- **P3 — Niespójne parsowanie daty:** `transaction-form` używa bezpiecznego `fromDateInputValue`, a `transfer-form` i `bulk-funding-form` `new Date(occurredOn)` (UTC). W strefach ujemnych data przesunie się o dzień. W Polsce nie zaboli, ale to bomba z opóźnionym zapłonem dla multi-currency/zagranicznych domowników.
- **P3 — Kwota `type="number"`** bez `inputmode="decimal"` i bez obsługi przecinka dziesiętnego w polskiej klawiaturze (na Androidzie klawiatura numeryczna czasem nie ma kropki). Warto rozważyć własne pole kwoty akceptujące „12,50”.

### Problemy ergonomiczne — historia (`history.ts`, `envelope-history.ts`)
- **P1 — Brak wyszukiwania i filtrów** (po nazwie, kopercie, typie, zakresie kwot). Historia globalna to lista wyłącznie jednego miesiąca; znalezienie „kiedy ostatnio płaciłem za OC” wymaga klikania miesiąc po miesiącu.
- **P2 — Brak podsumowań w historii:** suma wpływów, wydatków i bilans miesiąca nad listą; brak grupowania po dniach.
- **P2 — Historia globalna nie pokazuje rat amortyzacji** (`loadAllEvents` nie pobiera `get_amortized_charges`), więc suma pozycji na liście nie zgadza się ze zmianą sald kopert.
- **P2 — Lista to karty z ramką i dwoma przyciskami na każdym wierszu** (Edytuj, Usuń). Przy 100 operacjach w miesiącu jest to ciężkie wizualnie i długie; tabela/lista zwarta z akcjami w menu kontekstowym lub po najechaniu byłaby czytelniejsza. Brak paginacji/wirtualizacji.
- **P2 — Komunikat potwierdzenia usunięcia dostaje surowy `kind`** (`transaction`/`transfer`) jako parametr — do sprawdzenia w plikach tłumaczeń, czy nie wyświetla angielskiego słowa w polskim komunikacie.
- **P3 — Brak eksportu (CSV)** listy operacji.

## 3. Majątek netto i inwestycje

Źródła: `src/app/features/net-worth/**`, `src/app/core/net-worth/net-worth.service.ts`, migracje `*net_worth*`, `*asset_holdings*`, `*signed_valuation_values*`

### Co działa dobrze
- Zbiorczy formularz wycen (`bulk-valuation-form`) — tabela z poprzednią wartością, prefill dla już wycenionej daty, zapis jednym upsertem, ochrona przed wyścigiem przy zmianie daty. To najlepiej zaprojektowany ekran w aplikacji.
- Oś czasu 12 miesięcy (`net-worth-timeline`) z sumą i zmianą m/m, przemyślana obsługa kont zarchiwizowanych.
- Grupowanie kont po typie z sumami częściowymi, filtr płynności, ostrzeżenie o brakującym kursie zamiast błędnej liczby.
- Znak wartości zgodny z wkładem do majątku (zobowiązania ujemne), ostrzeżenie o nadpłaconym zobowiązaniu bez blokowania.

### Problemy ergonomiczne — ekran główny (`net-worth.ts`)
- **P1 — Brak podziału Aktywa / Zobowiązania / Netto.** Jest tylko jedna liczba „majątek netto”. Standardowy widok to trzy wskaźniki (suma aktywów, suma zobowiązań, netto) plus zmiana od poprzedniego miesiąca — bez tego trzeba wchodzić w oś czasu.
- **P1 — Suma i sumy grup mieszają waluty przy braku kursu.** `totalNetWorth` i `group.subtotal` liczą `value_in_base ?? value` — konto w USD bez kursu jest dodawane do sumy w PLN jako liczba nominalna. Jest ostrzeżenie tekstowe, ale sama liczba jest błędna. Lepiej: pominąć takie konto w sumie i pokazać „suma niekompletna” lub zablokować sumę.
- **P2 — Brak wyboru daty „stan na dzień”.** `asOf` to zawsze dziś; nie da się zobaczyć stanu na koniec zeszłego roku bez czytania osi czasu.
- **P2 — Brak wykresu.** Oś czasu to wyłącznie tabela liczb; wykres liniowy majątku netto i skumulowany słupkowy per typ aktywów to podstawowa potrzeba (plan Etap 4).
- **P2 — Brak informacji o „przeterminowanych” wycenach.** Karta pokazuje datę wyceny, ale nie wyróżnia kont niewycenianych od >30/60 dni; nie ma listy „do aktualizacji”.
- **P2 — Brak struktury/alokacji.** Nie ma udziału procentowego każdej grupy w majątku, ani podziału wg płynności czy właściciela (pole `owner_name` istnieje, ale nigdzie nie jest prezentowane ani nie da się po nim filtrować).
- **P2 — Konta zarchiwizowane są niewidoczne** na liście głównej i nie ma przełącznika „pokaż zarchiwizowane” — jedyny sposób dotarcia to oś czasu (jeśli konto miało wartość w oknie) lub bezpośredni URL.
- **P3 — Karty per konto powtarzają ten sam układ co koperty**; przy 15+ kontach lista kart jest długa. Widok tabelaryczny (nazwa, typ, waluta, wartość, data wyceny, zmiana) byłby czytelniejszy — analogicznie do zbiorczego formularza wycen.

### Problemy ergonomiczne — konto, wyceny
- **P1 — Konta nie da się edytować.** `NetWorthService` nie ma `updateAccount`, a `account-form` obsługuje tylko tworzenie. Literówka w nazwie, zmiana instytucji, kategorii, płynności lub typu wymaga założenia nowego konta i utraty historii. Nie ma też usuwania konta (nawet pustego).
- **P2 — Waluta konta to pole tekstowe 3-literowe** bez listy/walidacji ISO (można wpisać „ZLO”). Rekomendacja: select z popularnymi walutami + możliwość wpisania własnej.
- **P2 — Pola „Kategoria” i „Właściciel” to wolny tekst** bez podpowiedzi z istniejących wartości, co prowadzi do rozjazdu („Ja”, „ja”, „Dariusz”).
- **P2 — Formularz pojedynczej wyceny wymaga wpisania pełnej wartości.** Brak trybu „zmiana o kwotę” (+500 / −200) i brak podpowiedzi poprzedniej wartości obok pola (jest w formularzu zbiorczym, nie ma tu).
- **P2 — Pole „Wpłaty/wypłaty (contribution)” jest niewyjaśnione w formularzu** — użytkownik nie wie, po co je wypełniać i jak wpływa na raporty (obecnie w UI nie jest nigdzie użyte poza wyświetleniem w historii). Zebrane dane nie dają wartości, dopóki nie ma raportu „przyrost z wpłat vs. z rynku”.
- **P2 — Historia wycen nie pokazuje zmiany między wycenami** (delta, %), jest surowa lista.
- **P3 — Po zapisaniu wyceny z poziomu ekranu głównego użytkownik trafia do historii konta**, a nie tam, skąd przyszedł (ten sam problem `returnUrl` co w budżecie).

### Problemy ergonomiczne — holdingi (instrumenty inwestycyjne)
- **P1 — Wartość rynkowa holdingu = ostatnia cena transakcyjna.** `get_holding_positions` bierze `latest_price` z ostatniej operacji kupna/sprzedaży; nie da się wprowadzić bieżącego kursu instrumentu bez fikcyjnej transakcji. W efekcie „niezrealizowany zysk” jest prawie zawsze ≈ 0 i wskaźnik jest bezużyteczny. Potrzebna tabela cen instrumentów (data, cena) — analogicznie do `commodity_prices` — i formularz „aktualizuj ceny” podobny do zbiorczych wycen.
- **P1 — Holdingi nie zasilają wyceny konta.** Dokumentacja mówi, że holdingi są „dodatkowe” wobec ręcznej wyceny konta. W praktyce użytkownik wpisuje kupno ETF-u i osobno musi ręcznie zaktualizować wartość konta maklerskiego, inaczej majątek netto nie drgnie. Sugestia: opcja „wartość konta = suma holdingów + gotówka” albo przycisk „zapisz wycenę z pozycji”.
- **P2 — Holdingu nie da się edytować, zarchiwizować ani usunąć** (brak metod w serwisie i UI); literówka w tickerze zostaje na zawsze.
- **P2 — Sprzedaż nie liczy zysku zrealizowanego** ani nie pokazuje historii zrealizowanych zysków (istotne podatkowo, PIT-38).
- **P2 — Holdingi dostępne tylko dla kont typu `investment`**; konta `precious_metals` (uncje złota) czy `currency` (waluta obca w gotówce) nie mogą mieć pozycji ilościowych, mimo że istnieje tabela `commodity_prices`.
- **P3 — Łączna wartość holdingów nie jest pokazywana** na stronie konta (tylko per pozycja), brak też porównania z ręczną wyceną konta.

## 4. Kursy walut i ceny surowców

Źródła: `src/app/features/rates/**`, `src/app/core/rates/**`, migracja `20260705010000_multi_currency_rates.sql`

### Co działa dobrze
- Pobieranie kursów z frankfurter.dev jednym przyciskiem; kursy zapisane z datą i źródłem.
- Waluta bazowa gospodarstwa edytowalna przez właściciela; brak kursu nie prowadzi do błędnej liczby (`null` + ostrzeżenie).
- Uprawnienia (owner/editor/viewer) poprawnie odzwierciedlone w UI tej strony.

### Problemy
- **P1 — Ceny surowców są martwą funkcją.** Tabela `commodity_prices` nie jest używana przez żadną funkcję SQL ani żaden widok poza własną listą. Użytkownik wprowadza cenę złota i nic z tego nie wynika (konto „metale szlachetne” nadal wymaga ręcznej wyceny w PLN). Albo podłączyć ją do wycen (ilość × cena), albo ukryć sekcję, żeby nie budziła fałszywych oczekiwań.
- **P2 — Synchronizacja obejmuje tylko waluty, które już mają ręczny kurs** (`trackedCurrencies` wyliczane z istniejących kursów). Nowy użytkownik z kontem w EUR nie zobaczy przycisku synchronizacji, dopóki nie wpisze pierwszego kursu ręcznie. Lista walut do synchronizacji powinna wynikać z walut kont/holdingów/transakcji.
- **P2 — Drugie kliknięcie „Synchronizuj” tego samego dnia kończy się błędem** (unikalność `household_id, currency, rate_date` + `insert` zamiast `upsert`), a komunikat mówi tylko „nie udało się pobrać kursów dla: EUR, USD”, co jest mylące.
- **P2 — Brak automatycznego, cyklicznego pobierania kursów** (plan: post-MVP). Bez tego wartości w walucie bazowej dryfują między ręcznymi synchronizacjami, a oś czasu używa kursu „najnowszego na dany dzień” — przy rzadkich synchronizacjach historyczne miesiące są przeliczane starym kursem. Rozwiązanie: `pg_cron` + edge function pobierająca kursy dziennie dla walut używanych przez gospodarstwo, plus backfill historii przy dodaniu nowej waluty.
- **P2 — Lista kursów to płaska lista wszystkich wpisów** (każda waluta × każda data). Po kilku miesiącach codziennych synchronizacji będzie miała setki pozycji. Powinna pokazywać jedną kartę per waluta (aktualny kurs, data, źródło) z rozwijaną historią i ewentualnie mini-wykresem.
- **P2 — Wszystko jest „do PLN”, także gdy waluta bazowa to EUR.** Wpis „1 EUR = 4,30 PLN” obok „waluta bazowa: EUR” jest niezrozumiały dla użytkownika; UI powinno tłumaczyć na „1 USD = 0,92 EUR” (pivot przez PLN może zostać w bazie).
- **P3 — Waluta bazowa i waluta kursu to pola tekstowe** bez listy ISO; można zapisać nieistniejący kod, a potem frankfurter zwróci błąd.
- **P3 — Sekcja „Kursy” jest osobną pozycją w menu głównym.** Dla większości domowników to konfiguracja używana raz na jakiś czas; lepiej pod „Ustawienia gospodarstwa” razem z walutą bazową, członkami i (w przyszłości) eksportem.

## 5. Gospodarstwo domowe, logowanie, onboarding

Źródła: `src/app/features/auth/**`, `src/app/features/household/**`, `src/app/core/auth/**`, `src/app/core/household/**`

### Co działa dobrze
- Zaproszenia linkiem z rolą, `returnUrl` przez logowanie/rejestrację, kopiowanie linku, odwoływanie zaproszeń, zmiana ról.
- Guardy prowadzą nowego użytkownika prosto do utworzenia gospodarstwa.

### Problemy
- **P1 — Uprawnienia ról nie są odzwierciedlone w UI poza stroną kursów i usuwaniem koperty.** `viewer` widzi wszystkie przyciski „Zapisz transakcję”, „Nowa koperta”, „Dodaj wycenę”, wypełnia formularz i dopiero po zapisie dostaje surowy błąd RLS z Postgresa („new row violates row-level security policy”). `currentRole()` jest wyliczane dopiero po `loadMembers()`, które wywołują tylko 3 ekrany. Rola powinna być ładowana raz przy starcie (np. w `householdGuard`) i używana do ukrywania/wyłączania akcji zapisu.
- **P1 — Brak resetu hasła** („Nie pamiętam hasła”) ani zmiany hasła/e-maila po zalogowaniu. Dla aplikacji z prawdziwymi danymi finansowymi to blokujące — zapomniane hasło = utrata dostępu.
- **P2 — Brak przełącznika gospodarstw** (patrz sekcja 1). `selectHousehold` istnieje w serwisie, brakuje wyłącznie UI. Osoba zaproszona do drugiego gospodarstwa po akceptacji zostaje w nie przełączona i nie ma jak wrócić do własnego.
- **P2 — Nie da się zmienić nazwy gospodarstwa** ani go usunąć/opuścić. Właściciel nie może przekazać własności; brak zabezpieczenia w UI przed usunięciem/degradacją ostatniego właściciela (możliwe, że pilnuje tego SQL — nie weryfikowałem wszystkich polityk).
- **P2 — Członkowie identyfikowani wyłącznie e-mailem.** Brak nazwy wyświetlanej/awataru; w historii operacji nie widać, kto co wpisał (`created_by` nieużywane w UI).
- **P2 — Rejestracja publiczna jest otwarta** (zapisane w feature-map jako do zrobienia). Dla narzędzia domowego z jawnym adresem produkcyjnym to ryzyko (spam kont). Do rozważenia: rejestracja tylko z linkiem zaproszenia lub lista dozwolonych e-maili.
- **P2 — Ekran logowania/rejestracji nie ma przełącznika języka** i jest po polsku domyślnie (`defaultLang: 'pl'` z localStorage) bez możliwości zmiany przed zalogowaniem; `<html lang="en">` jest sztywne i nie zmienia się z językiem (czytniki ekranu czytają polski tekst angielskim głosem).
- **P2 — Pole hasła bez przycisku „pokaż hasło”** i bez wskaźnika wymagań (min. 6 znaków dowiaduje się z komunikatu błędu).
- **P3 — Po rejestracji z włączonym potwierdzeniem e-mail** użytkownik widzi tylko komunikat „sprawdź skrzynkę”, bez przycisku „wyślij ponownie” ani linku do logowania z zachowanym `returnUrl`.
- **P3 — Zaproszenia bez wysyłki e-mail** (brak SMTP) — udokumentowane. Warto choć dodać przycisk „Udostępnij” (Web Share API) na telefonie.
- **P3 — Onboarding kończy się na nazwie gospodarstwa.** Po utworzeniu użytkownik ląduje na pustym dashboardzie i musi sam odkryć, że ma założyć koperty. Kreator (nazwa → waluta bazowa → startowy zestaw kopert → pierwsze zasilenie) skróciłby czas do pierwszej wartości.

## 6. Spójność UI, dostępność, i18n, jakość techniczna widoczna dla użytkownika

### Formatowanie liczb i dat
- **P1 — Brak rejestracji polskiej lokalizacji Angulara.** W `app.config.ts`/`main.ts` nie ma `registerLocaleData(localePl)` ani `LOCALE_ID`. Wszystkie `| number` i `| date` renderują po angielsku niezależnie od wybranego języka: „1,234.56 PLN” zamiast „1 234,56 zł”, „Sep 11, 2026” zamiast „11 wrz 2026”. Tylko nagłówki miesięcy (`toLocaleDateString` z `localeTag`) są po polsku — efekt jest niespójny na jednym ekranie. Poprawka: dynamiczne `LOCALE_ID` lub własne pipe'y oparte na `Intl` z `language.localeTag()`.
- **P2 — Brak pipe'a walutowego.** Kwoty składane są ręcznie jako `{{ x | number }} {{ currency }}` w ~20 miejscach; brak formatowania w stylu `Intl.NumberFormat(..., { style: 'currency' })`, brak wyrównania tabelarycznego (`tabular-nums` tylko w tabelach), różna precyzja (`1.2-2`, `1.0-0`, `1.2-4`, `1.0-6`) bez uzasadnienia dla użytkownika.
- **P2 — Ujemne kwoty tylko przez kolor (`text-destructive`)** — nie spełnia WCAG 1.4.1 (informacja tylko kolorem); warto dodać znak/ikonę i wyraźne „−”.

### Spójność wzorców
- **P2 — Trzy różne układy stron:** listy (pełna szerokość, nagłówek + karty), formularze (wyśrodkowany `min-h-svh` w wąskiej karcie), zbiorcze wyceny (pełna szerokość z „Wróć”). Formularze wyglądają jak ekrany logowania, choć są wewnątrz aplikacji.
- **P2 — Dublowany kod w każdym komponencie:** `toDateInputValue`, `startOfMonth`, `endOfMonth`, `extractMessage`, przełącznik miesiąca, `LIQUIDITY_CLASSES`, `ACCOUNT_TYPES`. Nie jest to problem użytkownika bezpośrednio, ale zwiększa ryzyko niespójności (już widoczne: różne parsowanie dat).
- **P2 — Brak globalnych powiadomień (toast).** Po zapisie nie ma potwierdzenia „Zapisano transakcję”, po błędzie ładowania listy komunikat jest wyłącznie w miejscu, gdzie akurat jest `hlmAlert`. Sukces sygnalizuje wyłącznie przekierowanie.
- **P2 — Komunikaty błędów z Supabase pokazywane 1:1** (`error.message`), np. „duplicate key value violates unique constraint …”, „JSON object requested, multiple (or no) rows returned”. Powinny być mapowane na zrozumiałe teksty (i tłumaczone).
- **P3 — `window.confirm` w 8 miejscach** zamiast `hlm-alert-dialog` (dostępny w katalogu spartan).
- **P3 — Brak stanów ładowania typu skeleton**; zamiast tego tekst „Ładowanie…”, przez co układ „skacze” po załadowaniu.
- **P3 — Motyw ciemny jest zdefiniowany w `styles.scss` (`:root.dark`), ale nic go nie włącza** — brak przełącznika i brak reakcji na `prefers-color-scheme`.

### Dostępność
- **P2 — Nietłumaczone `aria-label`** („Previous month”, „Next month”, „Language”, „Menu”, „Previous 12 months”).
- **P2 — Błędy walidacji nie są powiązane z polem** (`aria-describedby`/`aria-invalid`), a selecty spartan sterowane sygnałami nie są w `FormGroup`, więc nie dostają stanu `invalid`. Błąd „Wybierz kopertę” pojawia się tylko wizualnie po submit.
- **P2 — Focus po nawigacji** nie jest przenoszony na nagłówek strony; po przejściu do formularza czytnik ekranu zostaje na przycisku menu.
- **P3 — Przyciski `‹`/`›` (encje HTML)** jako jedyna treść — działa z aria-label, ale ikony lucide byłyby czytelniejsze i spójne z hamburgerem.
- Audyt AXE nie był wykonany (feature-map). Do zrobienia z uruchomioną aplikacją.

### i18n
- Pliki `en.json`/`pl.json` mają identyczny zestaw 485 kluczy, brak brakujących tłumaczeń — dobrze.
- **P2 — Parametr `{{kind}}` w potwierdzeniu usunięcia** dostaje surową wartość `transaction`/`transfer`, więc polski użytkownik czyta „Usunąć tę operację (transaction)?”.
- **P3 — Nazwy typów kont/płynności są tłumaczone, ale wolnotekstowa „kategoria” i „właściciel” nie** — zgodnie z oczekiwaniem, tylko warto to zaznaczyć w formularzu.
- **P3 — Tytuł zakładki „PersonalFinancePlanner”** (CamelCase) i brak `<meta name="description">`.

### Mobile / PWA
- Układ responsywny jest poprawny (grid 1/2/3 kolumny, hamburger), ale:
- **P2 — Brak PWA** (manifest, ikona, service worker) — plan post-MVP; na telefonie nie da się „zainstalować”, a to główny scenariusz wpisywania wydatków na bieżąco.
- **P2 — Brak trybu offline / kolejki zapisu** — w sklepie bez zasięgu zapis się nie powiedzie i użytkownik musi pamiętać o ponownym wpisaniu.
- **P3 — Wysokie karty z przyciskami w stopce** wymagają dużo przewijania na telefonie; lista zwarta (jedna linia = koperta + saldo) sprawdziłaby się lepiej na małym ekranie.

## 7. Brakujące funkcje — propozycje

Podział na: (A) funkcje, których brak najbardziej boli dziś, (B) funkcje znacząco podnoszące użyteczność, (C) dalsze pomysły. W nawiasach odniesienie do planu (`docs/project-assumptions-and-plan.md`) tam, gdzie funkcja jest już przewidziana.

### A. Do zrobienia w pierwszej kolejności (domykają MVP z planu)
1. **Dashboard z realnymi wskaźnikami** (MVP pkt 11): saldo wszystkich kopert, wydatki i wpływy bieżącego miesiąca vs. poprzedni, 3–5 kopert najbliżej zera/na minusie, majątek netto + zmiana m/m, lista kont z przeterminowaną wyceną, reguły cykliczne do wykonania w tym tygodniu, ostatnie 5 operacji, skrót „dodaj wydatek”.
2. **Szybkie dodawanie wydatku** z każdego ekranu (dialog/panel boczny lub stały przycisk), z „zapisz i dodaj kolejny”, domyślną datą = ostatnio użyta, kopertą z podpowiedzi nazwy. Do rozważenia skrót klawiaturowy (`n`).
3. **Eksport danych** (MVP pkt 12): CSV/XLSX per tabela (transakcje, transfery, wyceny, holdingi, kursy) i pełny eksport JSON gospodarstwa; najprościej jako funkcja SQL zwracająca JSON + pobranie w przeglądarce.
4. **Edycja i usuwanie kont majątkowych oraz holdingów** (patrz sekcja 3).
5. **Reset hasła i zmiana hasła** (Supabase Auth ma to gotowe: `resetPasswordForEmail`, `updateUser`).
6. **Wskaźnik i przełącznik gospodarstwa** w nagłówku + zmiana nazwy gospodarstwa.
7. **Egzekwowanie ról w UI** — ukrywanie/wyłączanie akcji zapisu dla `viewer`, rola ładowana przy starcie.
8. **Polska lokalizacja liczb i dat** (`registerLocaleData`) i wspólny pipe kwoty z walutą.

### B. Znacząco podnoszą użyteczność
9. **Cele/limity kopert (budżet miesięczny per koperta).** Kwota planowana miesięcznie per koperta; karta koperty pokazuje „wydano 430 / 600 zł” z paskiem postępu, a zbiorcze zasilanie ma przycisk „zasil wg planu”. To jedna z najbardziej brakujących rzeczy w stosunku do GoodBudget (inspiracja z planu). Wymaga tylko kolumny `monthly_target` w `envelopes`.
10. **Pula „do rozdysponowania” (dochód niezaalokowany).** Dochód gospodarstwa wpływa do puli, a zasilenie kopert = transfer z puli; suma zasileń > dochód jest widoczna od razu. Można to zrealizować bez zmiany schematu jako specjalna koperta systemowa „Nieprzydzielone” + widok.
11. **Wyszukiwarka i filtry historii** (tekst, koperta, typ, zakres dat, kwota, autor) + sumy wpływów/wydatków nad listą + eksport wyniku. Zakres dat zamiast sztywnego miesiąca.
12. **Raporty i wykresy** (plan 3.5): wydatki per koperta w miesiącu (słupki/donut), trend wydatków 12 mies., wpływy vs. wydatki, majątek netto w czasie (linia), alokacja majątku (donut per typ/płynność), przyrost majątku z wpłat vs. z rynku (`contribution_amount` wreszcie użyte).
13. **Ceny instrumentów (holdingi) i cen surowców podpięte do wycen**: tabela `holding_prices`, zbiorczy formularz „aktualizuj ceny”, automatyczny import kursów ETF/akcji (np. stooq/yahoo) jako post-MVP; wartość konta inwestycyjnego wyliczana z pozycji.
14. **Zysk zrealizowany** przy sprzedaży (FIFO lub średnia) + roczne zestawienie do PIT-38.
15. **Automatyczne kursy walut** (`pg_cron` + edge function frankfurter), backfill historii dla nowej waluty, upsert zamiast insert.
16. **Reguły cykliczne: częstotliwość** (tygodniowa, co N miesięcy, roczna), data startu/końca, podgląd nadchodzących wykonań, uruchamianie serwerowe (`pg_cron`) zamiast przy wejściu na stronę + powiadomienie „zaksięgowano”.
17. **Sortowanie i grupowanie kopert** (ręczna kolejność, grupy „Stałe / Zmienne / Cele”, ikona/kolor koperty), wybór widoku karty/lista.
18. **Notatka, tagi i załącznik (paragon) do transakcji**; kategorie niezależne od kopert do raportowania (np. koperta „Dom”, kategoria „Media”).
19. **Konto źródłowe wydatku** — powiązanie transakcji budżetowej z kontem majątkowym (bank/gotówka/karta), co pozwoli uzgadniać saldo konta bankowego ze stanem kopert (dziś budżet i majątek są dwoma niezależnymi światami).
20. **Import transakcji z CSV banku** (mapowanie kolumn, deduplikacja, podpowiadanie koperty na podstawie historii nazw) — największy skrót w codziennym użyciu.
21. **PWA + tryb offline z kolejką zapisów** (plan post-MVP), skrót na ekranie głównym telefonu.
22. **Toasty i dialogi** (spartan `sonner`/`alert-dialog`), mapowanie błędów Supabase na komunikaty, `returnUrl` po edycji.
23. **Dziennik zmian (audit log)** — plan post-MVP; przy współdzieleniu z domownikami „kto i kiedy zmienił kwotę” jest istotne. Minimalna wersja: `updated_by/updated_at` na tabelach + widok „ostatnie zmiany”.

### C. Dalsze pomysły
24. Cele oszczędnościowe z datą i prognozą („odkładając 500 zł/mies. osiągniesz 20 000 zł w marcu 2028”).
25. Prognoza cash-flow na koniec miesiąca (saldo kopert − nadchodzące reguły).
26. Powiadomienia (e-mail/push) o kopercie na minusie, wycenie do aktualizacji, regule do potwierdzenia.
27. Widget/„skrót” na telefonie (Web Share Target, aby przesłać zdjęcie paragonu do aplikacji).
28. Warstwa API/eksport dla analizy LLM (plan 3.5) — np. widok SQL read-only + klucz per gospodarstwo.
29. Podział wydatku między koperty (split) i wydatki wspólne/zwroty między domownikami.
30. Archiwum lat: roczne podsumowanie (ile wydano per koperta w 2025 vs 2024).

### Proponowana kolejność wdrażania (moja rekomendacja)
1. Lokalizacja liczb/dat + formularze (anuluj, returnUrl, zapisz i dodaj kolejny, kolejność pól) — małe zmiany, duży efekt.
2. Dashboard ze wskaźnikami + cele kopert + pasek postępu na kartach.
3. Edycja kont/holdingów, reset hasła, role w UI, przełącznik gospodarstwa.
4. Filtry/wyszukiwanie historii + eksport CSV.
5. Ceny holdingów i surowców podpięte do wycen; automatyczne kursy.
6. Wykresy i raporty.
7. PWA/offline, import CSV.

## Zastrzeżenia

- Przegląd wykonano wyłącznie na podstawie kodu (szablony Angular, serwisy, migracje SQL, testy e2e). Aplikacja **nie była uruchamiana w przeglądarce** w tej sesji — nie było dostępnego stosu Supabase (Docker). Wnioski dotyczące wyglądu (np. wysokość formularzy `min-h-svh`, zawijanie paska akcji) są wnioskami z klas CSS, nie z obserwacji; warto je potwierdzić wizualnie.
- Nie weryfikowałem wszystkich polityk RLS pod kątem przypadków brzegowych (np. ochrona ostatniego właściciela) — tam, gdzie piszę „możliwe, że pilnuje tego SQL”, to jest przypuszczenie.
- Audyt dostępności (AXE) i test na czytniku ekranu wymagają uruchomionej aplikacji — uwagi w sekcji 6 pochodzą z analizy znaczników.
- Ocena „co boli najbardziej” jest moją interpretacją opartą na typowych scenariuszach użycia budżetu domowego (codzienne wpisywanie wydatków, comiesięczne zasilenie kopert i aktualizacja wycen); rzeczywiste priorytety zależą od tego, jak gospodarstwo faktycznie korzysta z narzędzia.
- Zgodnie z `AGENTS.md` dokumentacja projektu ma być po angielsku; ten plik jest po polsku, bo tak sformułowano zlecenie przeglądu. Jeśli ma zostać w `docs/` na stałe, warto go przetłumaczyć lub przenieść poza katalog dokumentacji projektowej.
