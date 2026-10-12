# MENIO — restaurant platform prototype

## Main files
- `index.html` — MENIO landing page
- `register.html` — restaurant signup and login
- `business.html` — restaurant dashboard, dishes and table QR links
- `menu.html` — table-specific guest menu and order placement
- `merchant.html` — cashier order board with live updates
- `firebase.js` — Firebase SDK setup
- `app.js` — registration, owner checks and real-time order listener
- `firestore.rules` — Firestore access rules
- `firebase.json` — Firestore Emulator configuration
- `.github/workflows/validate.yml` — automatic syntax, asset-reference and Firestore-rules validation

## Firebase setup
1. The web configuration in `firebase.js` points to the MENIO Firebase project. Firebase web config is not a service-account secret; never commit service-account keys or private server credentials.
2. In Firebase Authentication, enable **Email/Password** and **Anonymous** sign-in.
3. Create the Cloud Firestore database.
4. Publish the complete `firestore.rules` file from this repository in Firestore → Rules.
5. In Authentication → Settings → Authorized domains, add the deployed domain if it is not already listed.
6. Run locally over HTTP, e.g. `python -m http.server 5500`.
7. Open `http://localhost:5500/register.html`, register a test restaurant, add dishes, and open Merchant.
8. Open a table QR URL (`menu.html?restaurant=your-slug&table=1`) in a separate browser session, place an order, and verify it appears in Merchant without refreshing.

## Data and access notes
- Public restaurant profiles are stored in `restaurants/{slug}`.
- Owner IDs are stored separately in `restaurantOwners/{slug}`, which is restricted to the matching signed-in owner.
- Each table has a document at `restaurants/{slug}/tables/{number}`.
- Menu items are stored under `restaurants/{slug}/menu`.
- Orders are stored in `orders`; the merchant view listens with Firestore `onSnapshot`.

## Validation and limitations
- GitHub Actions checks JavaScript module syntax, local HTML asset references, and parses the Firestore rules using the Firestore Emulator.
- A successful static/Emulator check does not prove the live Firebase project is configured correctly; end-to-end signup and ordering must still be tested against the actual Firebase project.
- This is a prototype, not production-ready. Order prices and item IDs must be validated server-side before accepting real customer orders or payments. Add abuse protection/rate limiting and stricter operational controls before public launch.
- QR images currently use an external QR service. QR codes generated on localhost will point to localhost; for phone tests use a reachable deployed URL or computer LAN address.
