# MENIO — Version 2

Version 2 is a separate copy of the MENIO site in `/v2/`. The original pages at the repository root are unchanged. It uses the supplied Desktop design as the visual reference while retaining MENIO's Firebase login, restaurant dashboard, product/category management, QR tables, guest ordering and cashier board.

- Live preview: https://teslamap.github.io/MENIO/v2/
- Guest menu keeps each restaurant's full-page background color setting.
- Pricing stays “ფასზე დაგვიკავშირდით”.
- The site uses Firestore for menu photos; it does not upload photos to Firebase Storage.

Validate from the MENIO repository root with `node --test v2/tests/*.test.mjs` and `python v2/tests/check-assets.py`.

