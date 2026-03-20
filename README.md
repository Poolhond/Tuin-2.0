🌿 TUINLOG v2 – Ontwikkelaarsmanifest & Projectvisie
📍 Huidige Status: Feature-Complete (Finetune Fase)
Versie 2.0 is functioneel klaar. Alle benodigde features (Logboek, Geld/Afrekeningen, Inzichten, Klanten, Producten, Fixed-Quarterly afrekeningen en PWA-backups) zijn gebouwd.
De huidige en enige focus is FINETUNING:
 * Geen nieuwe features (tenzij expliciet vermeld door de gebruiker).
 * UI/UX perfectioneren: Animaties soepeler maken, spacing finetunen, visuele hiërarchie optimaliseren.
 * Code refactoring: Logica robuuster maken, edge-cases opvangen, dubbele code elimineren.
 * Stabiliteit & Performance: Frictieloos werken, state-management waterdicht maken.
🧠 1. De Kernfilosofie
Tuinlog is een visueel rustige, intuïtieve werk- én administratieapp voor een zelfstandige tuinman.
 * Work-first, Admin-goal: Tijdens fysiek werk mag niets de timer (start/stop/groen toevoegen) in de weg zitten. Maar het échte doel is de administratie die volgt: werklogs moeiteloos omzetten in facturen en inzicht krijgen in omzet en werkritme.
 * Visueel boven Textueel: De gebruiker denkt visueel. Gebruik kleuren en symbolen in plaats van woorden. (bvb: 💳 = factuur, 🪙 = cash, groen = betaald, oranje = berekend, geel = open, paars = vaste klant).
 * Rust & Duidelijkheid: De app moet "stil" aanvoelen. Geen visuele ruis, geen overbodige pop-ups, geen uitleg nodig. Begrijpbaar in een oogopslag.
📱 2. Design & UX Principes
Dit is géén responsieve webapp. Het is een portrait-first tool strikt ontworpen voor de iPhone 16 Pro Max.
 * Vormgeving: Flat design. Geen kaarten-in-kaarten, geen dubbele borders. Subtiele lijnen (var(--border)) en kleuraccenten (var(--accent)).
 * Navigatie: Native iOS-gevoel. Push/pop view stack (ui.navStack). Swipe/back logica. Geen onverwachte modals of dead-ends. Bottom-tabbar voor hoofdnavigatie.
 * Typografie: System fonts (system-ui). Tabular nums (font-variant-numeric: tabular-nums) voor alle bedragen en tijden zodat deze niet verspringen.
 * Theming: Volledige ondersteuning voor Day/Night mode via CSS variables op de :root en de <body> tag (data-theme="day" of night).
🏗 3. Technische Architectuur
De tech-stack is bewust puur en afhankelijkheidsvrij gehouden om maximale offline-betrouwbaarheid te garanderen in het veld.
 * Stack: 100% Vanilla HTML, CSS, JavaScript (ES6+). Geen frameworks (geen React/Vue), geen bundlers, geen externe libraries (zelfs grafieken zijn custom SVG).
 * PWA: Volledig offline-capable via sw.js (Service Worker) en manifest.webmanifest.
 * State Management: Een gecentraliseerd state object (JSON) in het geheugen, gepersisteerd naar localStorage.
 * Rendering: Een custom, gecentraliseerde render() loop (gebaseerd op innerHTML vervanging) die wordt aangeroepen via de commit() functie na elke state-mutatie.
🗂 4. Datamodel (De Domeinen)
Het domein bestaat uit 4 kern-entiteiten:
 * Klanten (Customers): Bevat ook de logica voor fixedSettlementTemplate (vaste kwartaalafrekeningen).
 * Producten (Products): Met "Werk" (uurloon) en "Groen" (vaste eenheid) als beschermde core-producten.
 * Werklogs (Logs): Bestaan uit tijdssegmenten (work / break) en gekoppelde product-items.
 * Afrekeningen (Settlements): Bundelt logs of werkt via "manual override" (vooral bij vaste kwartaalafrekeningen). Beheert de factuur- en cash-splitsing via allocations. Statusverloop: Draft (Linked) → Calculated → Paid. (Of status "Fixed" voor kwartaalcontracten).
🤖 5. Regels voor AI-Assistenten
Wanneer je aanpassingen doet aan deze codebase, houd je strikt aan de volgende regels:
 * Stop / Think / Refine: Voeg geen nieuwe knoppen, velden of features toe. Als de gebruiker vraagt om "iets mooier te maken", verbeter dan de CSS (padding, border-radius, kleuren, transities) of versimpel de DOM-structuur.
 * Houd het Vanilla: Voer geen externe dependencies in. Geen Tailwind, geen Chart.js, geen moment.js. Behoud de Vanilla JS architectuur.
 * Respecteer de State Loop: Mutaties op data mogen alleen gebeuren in de actions map/functies, gevolgd door een commit(). Pas de DOM nooit rechtstreeks aan voor data-updates (gebruik altijd het render() patroon), behalve bij vluchtige UI states (zoals een dropdown openen of een swipe-animatie).
 * CSS Variabelen: Gebruik uitsluitend de bestaande CSS-variabelen voor kleuren (var(--surface), var(--text), var(--muted), etc.) zodat Day/Night mode niet breekt.
 * Behoud de iPhone 16 Pro Max focus: Gebruik iOS safe-area insets (env(safe-area-inset-top/bottom)). Optimaliseer touch-targets (minimaal 44x44px voor knoppen). Geen hover-states (:active in plaats van :hover).

