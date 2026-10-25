# Prime Life Maxing — wdrożenie

## Zanim wgrasz (obowiązkowo)
1. W STARYM Prime: Ustawienia → Eksportuj dane (JSON). Zapisz plik poza telefonem (np. mail do siebie).
2. Wgraj pliki na ten sam adres co dotąd (ten sam hosting, ten sam `start_url` i `scope`). Klucz danych `prime_data_v1` jest ten sam.
   Zostaw swoje `manifest.json` i folder `assets/` bez zmian (nie ma ich w paczce).
3. Otwórz aplikację. Przy pierwszym uruchomieniu dane v1 są zamieniane na v2 **po** zrobieniu surowej, zweryfikowanej kopii
   (Ustawienia → Kopie bezpieczeństwa → „przed migracją”). Jeśli kopii nie da się zapisać, migracja nie rusza i aplikacja jest tylko do odczytu.
4. Na iPhonie: otwórz aplikację, w Ustawieniach kliknij „Sprawdź aktualizację”, potem „Aktualizuj” w pasku u góry.

## Co się zmieniło dla danych
- Wszystkie dotychczasowe pola zostają (dni, zadania, Big 3, notatki, cele, szablony, ustawienia). Nowe pola są dodawane, nic nie jest kasowane.
- Akcent koloru: jeśli miałeś zapisany inny niż limonkowy (np. niebieski), zostaje. Zmień w Ustawienia → Akcent koloru.
- Zdjęcia sylwetki (opcjonalne) są w IndexedDB tej przeglądarki i NIE wchodzą do eksportu JSON.
- XP liczy się od dnia pierwszego uruchomienia nowej wersji (bez nagród wstecz).

## Wycofanie do starej wersji
Wgraj stare pliki. Stara wersja czyta `prime_data_v1`; nowe dane są dodatkowo w kopii lustrzanej (`prime_data_v2_mirror`),
więc po ponownym przejściu na nową wersję aplikacja scala dane (to, co zmieniłeś w starej wersji + nowe moduły).
Najpewniej i tak miej eksport JSON z kroku 1.

## Testy
- `node tests/test-storage.js` — 26 testów migracji/importu/kopii (działają w Node bez przeglądarki).
