// Compatibility for older pages importing the previous dashboard module.
const target = new URL("dashboard.html", location.href);
target.search = location.search;
location.replace(target.href);
