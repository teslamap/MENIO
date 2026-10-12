# MENIO — restaurant platform prototype

## Main files
- `index.html` — MENIO company landing page
- `register.html` — restaurant signup and login
- `business.html` — restaurant dashboard, dishes, table QR links
- `menu.html` — table-specific guest menu and order placement
- `merchant.html` — cashier order board
- `firebase.js` — Firebase SDK setup
- `app.js` — registration, owner checks and real-time order listener
- `style.css` — responsive UI
- `firestore.rules` — initial security rules

## Setup
1. Create a Firebase project and Web App.
2. Replace the placeholder config in `firebase.js`.
3. Enable Email/Password and Anonymous providers in Firebase Authentication.
4. Create Firestore and publish `firestore.rules`.
5. Run locally over HTTP, e.g. `python -m http.server 5500`.
6. Open `http://localhost:5500/register.html`, register a restaurant, then open Business and Merchant.
7. Add dishes, open the QR menu with `?restaurant=your-slug&table=1`, place an order and watch Merchant update without refreshing (Firestore `onSnapshot`).

## Important
This is a prototype, not production-ready. Before real customers/payments, validate prices and item IDs server-side, tighten Firestore rules and abuse protection, and use stable deployed URLs for QR codes. The QR image service is external. For phone testing, localhost on the phone is not the computer; use the computer's LAN address and configure the QR base URL.
