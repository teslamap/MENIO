# ORDERA shared courier MVP setup

## Pages
- Restaurant manager: `dashboard.html?restaurant=RESTAURANT_SLUG`
- Tableless takeaway QR: `menu.html?restaurant=RESTAURANT_SLUG&orderType=takeaway`
- Tableless delivery QR: `menu.html?restaurant=RESTAURANT_SLUG&orderType=delivery`
- Shared courier panel: `courier.html`

## Activate a courier for testing
1. Create a courier account in Firebase Authentication (Email/Password) and copy its UID.
2. In Firestore, create `courierProfiles/{UID}` with fields:
   - `role` (string): `courier`
   - `active` (boolean): `true`
   - `name` (string): the courier's display name
3. Sign in at `register.html?returnTo=courier#login`.
4. Publish the repository's `firestore.rules` to the `menio-8de8` Firebase project before testing delivery orders.
5. Create the composite index from `firestore.indexes.json` for `orders`: `orderType ASC`, `deliveryStatus ASC`.

## Flow
1. The customer scans the delivery QR, chooses menu items, and enters address and phone.
2. The restaurant receives the order in the existing merchant board and prepares it.
3. Once the order is marked ready, the restaurant presses **კურიერის გამოძახება**.
4. Active shared couriers see the new order live; the first successful claim wins.
5. The assigned courier marks pickup and delivery. Firestore rules restrict the courier to their own assignment and valid next status.

The repository rules file is not automatically published to Firebase unless a deployment workflow is configured.
