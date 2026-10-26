# Friends Trip Manager - HTML / CSS / JavaScript version - FINAL (A-Z)

## Language / ভাষা
Website e ekhon Language select option ache: upore বাংলা / English select korle pura main UI oi language e dekhabe. Default Bangla. Choice browser e save thake, tai porer page eo oi language thakbe.
Email confirmation er note ta auth page theke soriye deya hoyeche - user er nirdesh onujayi ei rokom note rakhar dorkar nei.

Ei folder e pura website ache, shudhu Step 1-2 na. Ami nije GitHub e push korbo na, tumi nije push korbe.

## A-Z ki ki ache
- Signup / Login (Supabase Auth)
- Signup er por Role Choose: Manager / Group Member
- Manager: Create Trip (trip bananor somoy code dekhabe na, trip page e dhukle Manager Join Code dekhte pabe)
- Member: Join Code diye trip e join, sudhu nijer trip dekhte parbe
- Member: nije theke group theke ber hote parbe
- Manager chaile Member ke Manager banate parbe - tokhon purono Manager Group Member hoye jabe, tar Manager option ar dekhabe na
- Ekmatro Manager thakle, age kauke Manager banate hobe, tarpor se Member hoye ber hote parbe
- Manager: Archive Trip
- Contribution: cash, bkash, nagad, bank, other, note, reference
- Expense: transport, food, tickets, accommodation, shopping, other
- Split: equal (remainder prothom member der), custom_amount (jogfol moot er soman hote hobe), custom_percentage (jogfol 100 hote hobe)
- Payment Source: group_fund, personal (payer)
- Balance: protteker contribution, personally paid, allocated share, net balance, group cash, reconciliation check
- Settlement: greedy - ke kake koto dibe, group fund refund
- Share Link: Manager 30 diner read-only link banate parbe, share.html e login chara dekha jabe
- CSV Report: Balance page theke CSV download
- Mobile-first CSS, kono build/npm/Vite lagbe na

## Ja ekhono nai / limitation (sotti kotha)
- Receipt image upload nai - purono React app e Supabase Storage chilo, ei HTML version e receipt field rakha hoy nai, pore add kora jabe.
- Share token ei version e plain text e table e thake, purono app er moto SHA-256 hash + Edge Function na. Link revoke korte chaile Supabase table e revoked_at set koro, ba link expire howa porjonto wait koro.
- Fund Transaction (refund/withdrawal/adjustment) alada table nai - refund settlement e dekhano hoy, kintu alada fund transaction entry nai.
- Email confirmation Supabase settings er upor depend kore.

## Setup - age ei kaj gulo koro
1. Supabase Dashboard > SQL Editor e prothome `sql/01_setup.sql` run koro, tarpor `sql/02_full_tables.sql` run koro. Duitar order thik rakhte hobe. Notun project er jonno ei file gulo. Purono live data thakle run koro na.
2. `js/config.js` khulo. SUPABASE_URL already notun project er ta bosano ache. `PASTE_YOUR_PUBLISHABLE_KEY_HERE` er jaygay tomar publishable key ta bosao. Service_role key kokhono ekhane dibe na.
3. Supabase Auth settings: test er jonno email confirmation OFF rakhle signup er por sathe sathe login kora jay. ON thakle email confirm korte hobe. Auth > URL Configuration e tomar site URL (localhost ba GitHub Pages URL) add koro.

## Run kora
- VS Code Live Server diye folder ta open koro, ba GitHub e push kore GitHub Pages e host koro.
- Direct file double-click kore khulle CDN ar redirect kichu khetre block hote pare, tai Live Server / hosting use kora valo.

## Test kora - A-Z
1. Account 1: Signup > Manager > Create Trip > Trip page e Join Code dekho.
2. Account 2: Signup > Member > Join Trip > oi code dao > trip khulo.
3. Contribution add koro, Expense add koro (equal, custom, percentage - 3 tai try koro).
4. Balance ar Settlement milche kina dekho, CSV download koro.
5. Manager diye Member ke Make Manager koro - purono Manager ekhon Member dekhabe.
6. Manager diye Share Link banao, incognito te share.html link khulo - login chara summary dekhte parbe.
7. Member diye Leave koro, Manager diye Archive koro.

## Files
- index.html, auth.html, role.html, dashboard.html, create-trip.html, join-trip.html, trip.html, share.html
- css/style.css
- js/config.js, js/supabase-client.js, js/common.js, js/calculations.js, js/auth.js, js/role.js, js/dashboard.js, js/create-trip.js, js/join-trip.js, js/trip.js, js/contributions.js, js/expenses.js, js/balances.js, js/share.js, js/share-view.js
- sql/01_setup.sql, sql/02_full_tables.sql
