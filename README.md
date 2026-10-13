# MENIO — restaurant management

A buildless Georgian-language website with Firebase Authentication, Firestore. Firebase Storage is not used.

## Pages
- `index.html`: welcome, company information, offering and pricing (“ფასზე დაგვიკავშირდით”).
- `register.html`: restaurant registration and login. An account whose restaurant registration failed can sign in and finish setup. Accounts with multiple restaurants can choose one after login.
- `dashboard.html?restaurant=SLUG`: owner-only products, categories, tables and QR downloads.
- `business.html`: compatibility redirect preserving older dashboard links.
- `menu.html?restaurant=SLUG&table=N`: public menu with photos, category filters and guest orders.
- `merchant.html?restaurant=SLUG`: live cashier board.

## Features
Products support creation, editing, deletion, description, price, category, photo and visibility. JPEG, PNG and WebP inputs are limited to 5 MB. The browser resizes to at most 720 pixels, reduces JPEG quality/dimensions until the data URL is at most 180,000 characters, and saves it inside the product's Firestore document. Photos and product details save atomically; removing or replacing a photo needs no separate file cleanup. Legacy HTTPS photo URLs remain supported.

Categories support creation, renaming and deletion. A category currently containing products cannot be deleted through the dashboard; reassign those products first. Existing products with the older text category field remain visible and can be edited into the new category system.

Each table has its own guest URL and downloadable PNG QR code. Deletion deactivates the table, preserves order history and never reuses the number for a new table. QR generation happens in the browser using pinned qrcode-generator 1.4.4; restaurant URLs are not sent to a QR image service. The QR library and Firebase SDK require an internet connection.

## Firebase setup required before launch
1. The configuration in `firebase.js` targets `menio-8de8f`. Web configuration is public, not a service-account secret.
2. Enable Email/Password and Anonymous providers in Firebase Authentication.
3. Create the Firestore database on the Spark plan. No Storage bucket, billing upgrade, third-party image account or upload API key is needed.
4. Deploy Firestore rules, the composite order index and the image field index exemption:
   `firebase deploy --only firestore:rules,firestore:indexes --project menio-8de8f`
5. Add the deployed website domain to Authentication's authorized domains.
6. Serve this directory over HTTP, e.g. `python -m http.server 5500`. Deploy all root HTML, JS and CSS files to the existing static host. This PR does not change the live Firebase project or publish the site.

The order index is defined in `firestore.indexes.json`. Wait for it to finish building before verifying Merchant. Existing Firebase records are supported; the next table number is initialized from existing tables when first adding one.

## Validation
Run JavaScript syntax checks and `node --test tests/*.test.mjs` with Node 22 or later. Mocked workflow tests cover product/category CRUD, category deletion protection, visibility, table deactivation and monotonic numbering, guest access rejection, signup recovery and live cart reconciliation.

GitHub Actions also compiles Firestore rules with the emulator and tests photo compression/size limits. Mocked tests do not prove live authentication or deployed indexes. Before release, verify:
- Register a restaurant, sign out, sign in and reach its dashboard.
- Create and rename a category; create a product with a photo, edit it, hide/show it and delete it.
- Confirm category/photo updates appear in the guest menu.
- Add a table, download and scan its QR from a phone using a reachable deployed address.
- Place an order and see it appear in Merchant.
- Delete the table: its QR must reject new orders, and a new table must receive a different number.
- Verify another restaurant owner cannot change this restaurant's menu, categories, tables or photos.

## Remaining prototype limits
Order prices, item shapes and totals still need authoritative server validation before real payments or production ordering. Anonymous ordering also needs abuse protection. This work does not add payments or change that existing order trust model. Category deletion protection is enforced in the dashboard; clients bypassing it can leave products referencing a deleted category. Photo data is included in menu reads, so it consumes Firestore storage and outbound transfer quotas. This is suitable for a small menu, not an unlimited image host.

Pricing intentionally shows “ფასზე დაგვიკავშირდით”. No contact address or commercial terms have been invented.


## Free-plan limits
Spark includes limited free Firestore usage; this is not unlimited storage or traffic. Keep the project on Spark if billing must remain disabled. Firebase documents the free quotas and the 1 MiB document cap at https://firebase.google.com/docs/firestore/quotas. The 180,000-character image cap leaves room for product metadata, and `firestore.indexes.json` excludes image data from indexing. Guest menu reads include the small photos; monitor Firestore Usage as traffic grows. Existing Firebase Storage images are not migrated or deleted automatically; replacing one saves the new photo in Firestore.
