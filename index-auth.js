import { auth, db, onAuthStateChanged, collection, query, where, getDocs, getDoc, doc } from "./firebase.js";

const accountLink = document.getElementById("accountLink");
if (accountLink) {
  onAuthStateChanged(auth, async user => {
    if (!user || user.isAnonymous) {
      accountLink.textContent = "შესვლა";
      accountLink.href = "register.html#login";
      return;
    }

    accountLink.textContent = "იტვირთება…";
    accountLink.setAttribute("aria-busy", "true");
    try {
      const owners = await getDocs(query(
        collection(db, "restaurantOwners"),
        where("ownerUid", "==", user.uid)
      ));

      if (owners.size === 1) {
        const slug = owners.docs[0].id;
        const restaurant = await getDoc(doc(db, "restaurants", slug));
        accountLink.textContent = "მართვის პანელი ↗";
        accountLink.href = "dashboard.html?restaurant=" + encodeURIComponent(slug);
        accountLink.title = restaurant.exists()
          ? "გახსენი " + (restaurant.data().name || "რესტორნის") + " მართვის პანელი"
          : "რესტორნის მართვის პანელი";
      } else if (owners.size > 1) {
        accountLink.textContent = "ჩემი რესტორნები ↗";
        accountLink.href = "register.html#login";
        accountLink.title = "აირჩიე რესტორანი";
      } else {
        accountLink.textContent = "დაასრულე რეგისტრაცია ↗";
        accountLink.href = "register.html";
        accountLink.title = "ანგარიში შესულია, მაგრამ რესტორანი ჯერ არ არის დაკავშირებული";
      }
    } catch (error) {
      console.error("MENIO account status:", error);
      accountLink.textContent = "მართვის პანელი";
      accountLink.href = "register.html#login";
      accountLink.title = "ანგარიშის სტატუსის ჩატვირთვა ვერ მოხერხდა — დააჭირე ხელახლა შესასვლელად";
    } finally {
      accountLink.removeAttribute("aria-busy");
    }
  });
}
