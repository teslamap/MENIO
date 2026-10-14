import {
  auth, db, doc, getDoc, collection, setDoc, updateDoc, deleteDoc, writeBatch,
  onSnapshot, runTransaction, serverTimestamp, onAuthStateChanged, signOut
} from "./firebase.js";
import { requireOwner } from "./app.js";
import { safeProductImage as safeImage, encodeProductPhoto } from "./image-utils.js";
import { confirmDialog, promptDialog } from "./ui.js?v=20261014-ui-1";

const $ = id => document.getElementById(id);
const slug = new URLSearchParams(location.search).get("restaurant");
const products = new Map(), categories = new Map(), tables = new Map();
const unsubscribers = [];
let imageObjectURL, stopped = false, productsLoaded = false, categoriesLoaded = false, pendingMenuImport = [];
const DEFAULT_THEME_COLOR = "#f97316";
const MENU_IMPORT_CATEGORIES = new Set(["ბურგერი","ქათმის ხორცი","საქონლის ხორცი","ღორის ხორცი","კრევეტები","ზღვის პროდუქტები","ვეგეტარიანული","ხაჭაპური","პიცა","პასტა","სუში","სალათი","წვნინანები","სენდვიჩი","სნექი","გამაგრილებელი სასმელი","იაპონური ლიმონათი","ყავა","ლუდი","საკე","კორეული არაყი","ვისკი","დანამატი"]);
function parseMenuImport(text) {
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim());
  const products = []; let category = "", block = [];
  for (const line of lines) {
    if (line === "დამატება") { block = []; continue; }
    const price = line.match(/^(\d+(?:[.,]\d+)?)\s*GEL$/i);
    if (!price) { if (line) block.push(line); continue; }
    const lastCategory = block.findLastIndex(value => MENU_IMPORT_CATEGORIES.has(value));
    const details = block.slice(lastCategory + 1).filter(value => !MENU_IMPORT_CATEGORIES.has(value));
    if (lastCategory >= 0) category = block[lastCategory];
    const name = details[0] || "", description = details.slice(1).join(" ").replace(/\s+/g, " ").trim();
    const amount = Number(price[1].replace(",", "."));
    if (!category || !name || name.length > 120 || description.length > 2000 || !Number.isFinite(amount) || amount <= 0 || amount > 100000)
      throw Error("მენიუს ტექსტში პროდუქტის სახელი, კატეგორია ან ფასი ვერ ამოვიცანი. შეამოწმე წყარო.");
    products.push({ name, description, price: Math.round(amount * 100) / 100, category });
    block = [];
  }
  if (!products.length) throw Error("ფასიანი კერძები ვერ ვიპოვე. ატვირთე მენიუს ტექსტის .txt ფაილი.");
  if (products.length > 450) throw Error("ერთ ჯერზე მაქსიმუმ 450 კერძის იმპორტია შესაძლებელი.");
  return products;
}
const say = message => { $("businessMessage").textContent = message; };
function renderTheme(color = DEFAULT_THEME_COLOR) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_THEME_COLOR;
  const hex=safeColor.slice(1), channels=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  const linear=value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;};
  const luminance=.2126*linear(channels[0])+.7152*linear(channels[1])+.0722*linear(channels[2]);
  $("themeColor").value = safeColor;
  $("themeColorValue").textContent = safeColor.toUpperCase();
  $("themePreview").style?.setProperty?.("--accent-color", "#ed683d");
  $("themePreview").style?.setProperty?.("--menu-background-color", safeColor);
  $("themePreview").style?.setProperty?.("--menu-foreground-color", luminance>.42?"#171920":"#f5f5f7");
}
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const menuRef = collection(db, "restaurants", slug || "_", "menu");
const categoryRef = collection(db, "restaurants", slug || "_", "categories");
const tableRef = collection(db, "restaurants", slug || "_", "tables");
function action(label, callback, className = "secondary small-button") {
  const button = element("button", label, className);
  button.type = "button";
  button.onclick = async () => {
    button.disabled = true;
    try { await callback(); } catch (error) { say("შეცდომა: " + error.message); }
    finally { button.disabled = false; }
  };
  return button;
}
function listen(reference, target, render, markLoaded = () => {}) {
  unsubscribers.push(onSnapshot(reference, snapshot => {
    target.clear();
    snapshot.forEach(record => target.set(record.id, { ...record.data(), id: record.id }));
    render(); markLoaded();
  }, error => say("მონაცემების წაკითხვა ვერ მოხერხდა: " + error.message)));
}
function resetProduct() {
  $("dishForm").reset();
  $("dishId").value = "";
  if (imageObjectURL) URL.revokeObjectURL(imageObjectURL);
  imageObjectURL = undefined;
  $("imagePreview").hidden = true;
  $("imagePreview").removeAttribute("src");
  $("saveDish").textContent = "პროდუქტის დამატება";
  $("cancelEdit").hidden = true;
}
function fillProduct(product) {
  resetProduct();
  $("dishId").value = product.id;
  $("dishName").value = product.name;
  $("dishPrice").value = product.price;
  $("dishDescription").value = product.description || "";
  $("dishCategory").value = product.categoryId || "";
  $("dishActive").checked = product.active !== false;
  if (safeImage(product.imageUrl)) {
    $("imagePreview").src = safeImage(product.imageUrl);
    $("imagePreview").hidden = false;
  }
  $("saveDish").textContent = "ცვლილებების შენახვა";
  $("cancelEdit").hidden = false;
  $("dishForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("dishName").focus({ preventScroll: true });
}
function renderProducts() {
  $("productCount").textContent = products.size;
  const filter = $("productFilter").value;
  const visible = [...products.values()].filter(p =>
    filter === "all" || (filter === "none" ? !p.categoryId : p.categoryId === filter)
  ).sort((a,b) => a.name.localeCompare(b.name, "ka"));
  $("dishes").replaceChildren();
  if (!visible.length) $("dishes").append(element("p", products.size ? "ამ კატეგორიაში პროდუქტი არ არის." : "დაამატე შენი პირველი პროდუქტი.", "muted"));
  for (const product of visible) {
    const card = element("article", undefined, "dish-card");
    const url = safeImage(product.imageUrl);
    if (url) {
      const img = element("img", undefined, "dish-photo");
      img.src = url; img.alt = product.name; img.loading = "lazy";
      img.onerror = () => img.hidden = true;
      card.append(img);
    }
    card.append(element("span", categories.get(product.categoryId)?.name || product.category || "კატეგორიის გარეშე", "muted"),
      element("h3", product.name), element("p", product.description || ""),
      element("b", Number(product.price).toFixed(2) + " ₾"),
      element("p", product.active === false ? "მენიუში დამალულია" : "მენიუში გამოჩნდება", "muted"));
    const actions = element("div", undefined, "actions compact");
    actions.append(action("რედაქტირება", () => fillProduct(product)),
      action(product.active === false ? "გამოჩენა" : "დამალვა", () =>
        updateDoc(doc(menuRef, product.id), { active: product.active === false, updatedAt: serverTimestamp() })),
      action("წაშლა", async () => {
        if (!(await confirmDialog("წაიშალოს „" + product.name + "“?", {title:"პროდუქტის წაშლა",danger:true,confirmText:"წაშლა"}))) return;
        await deleteDoc(doc(menuRef, product.id));
        if ($("dishId").value === product.id) resetProduct();
        say("პროდუქტი წაიშალა.");
      }, "danger small-button"));
    card.append(actions); $("dishes").append(card);
  }
}
function categoryOptions() {
  const selected = $("dishCategory").value, filter = $("productFilter").value;
  $("dishCategory").replaceChildren(new Option("კატეგორიის გარეშე", ""));
  $("productFilter").replaceChildren(new Option("ყველა პროდუქტი", "all"), new Option("კატეგორიის გარეშე", "none"));
  for (const category of [...categories.values()].sort((a,b) => a.name.localeCompare(b.name,"ka"))) {
    $("dishCategory").add(new Option(category.name, category.id));
    $("productFilter").add(new Option(category.name, category.id));
  }
  $("dishCategory").value = categories.has(selected) ? selected : "";
  $("productFilter").value = categories.has(filter) || ["all","none"].includes(filter) ? filter : "all";
}
function resetCategory() {
  $("categoryForm").reset(); $("categoryId").value = "";
  $("saveCategory").textContent = "დამატება"; $("cancelCategory").hidden = true;
}
function renderCategories() {
  $("categoryCount").textContent = categories.size;
  categoryOptions(); renderProducts();
  $("categoryList").replaceChildren();
  if (!categories.size) $("categoryList").append(element("p", "შექმენი კატეგორიები მენიუს დასალაგებლად.", "muted"));
  for (const category of [...categories.values()].sort((a,b) => a.name.localeCompare(b.name, "ka"))) {
    const count = [...products.values()].filter(p => p.categoryId === category.id).length;
    const row = element("div", undefined, "category-row");
    row.append(element("span", category.name + " · " + count + " პროდუქტი"));
    const actions = element("div", undefined, "actions compact");
    actions.append(action("რედაქტირება", () => {
      $("categoryId").value = category.id; $("categoryName").value = category.name;
      $("saveCategory").textContent = "შენახვა"; $("cancelCategory").hidden = false;
      $("categoryName").focus();
    }), action("წაშლა", async () => {
      if (count) throw Error("ჯერ გადაიტანე ამ კატეგორიის პროდუქტები სხვა კატეგორიაში.");
      if (!(await confirmDialog("წაიშალოს კატეგორია „" + category.name + "“?", {title:"კატეგორიის წაშლა",danger:true,confirmText:"წაშლა"}))) return;
      await deleteDoc(doc(categoryRef, category.id));
      if ($("categoryId").value === category.id) resetCategory();
      say("კატეგორია წაიშალა.");
    }, "danger small-button"));
    row.append(actions); $("categoryList").append(row);
  }
}
function qrData(url) {
  if (typeof globalThis.qrcode !== "function") throw Error("QR ბიბლიოთეკა ვერ ჩაიტვირთა. განაახლე გვერდი.");
  const qr = globalThis.qrcode(0, "M"); qr.addData(url); qr.make();
  const count = qr.getModuleCount(), scale = 8, margin = 4;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = (count + margin * 2) * scale;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff"; context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle = "#000";
  for (let row=0;row<count;row++) for (let col=0;col<count;col++) {
    if (qr.isDark(row,col)) context.fillRect((col+margin)*scale,(row+margin)*scale,scale,scale);
  }
  return canvas.toDataURL("image/png");
}
function renderTables() {
  const active = [...tables.values()].filter(t => t.active).sort((a,b) => a.number-b.number);
  $("tableCount").textContent = active.length; $("tableList").replaceChildren();
  if (!active.length) $("tableList").append(element("p", "დაამატე პირველი მაგიდა.", "muted"));
  for (const table of active) {
    const card = element("article", undefined, "table-card");
    card.append(element("h3", "მაგიდა №" + table.number), element("p", table.label || ""));
    const url = new URL("menu.html", location.href);
    url.searchParams.set("restaurant", slug); url.searchParams.set("table", table.number);
    let data;
    try {
      data = qrData(url.href);
      const image = element("img", undefined, "qr"); image.src=data; image.alt="QR — მაგიდა №"+table.number;
      card.append(image);
    } catch(error) { card.append(element("p", error.message)); }
    const open = element("a", "მენიუს გახსნა ↗"); open.href=url.href; open.target="_blank"; open.rel="noopener";
    const actions = element("div", undefined, "actions compact");
    actions.append(action("ბმულის კოპირება", async () => {
      try { await navigator.clipboard.writeText(url.href); say("ბმული კოპირებულია."); }
      catch { await promptDialog("ბმული მზადაა დასაკოპირებლად:", url.href); }
    }));
    if (data) {
      const download = element("a", "QR ჩამოტვირთვა", "btn secondary small-button");
      download.href = data; download.download = slug + "-table-" + table.number + ".png";
      actions.append(download);
    }
    actions.append(action("მაგიდის წაშლა", async () => {
      if (!(await confirmDialog("წაიშალოს მაგიდა №" + table.number + "? მისი QR კოდი აღარ იმუშავებს. არსებული შეკვეთები შენარჩუნდება.", {title:"მაგიდის წაშლა",danger:true,confirmText:"წაშლა"}))) return;
      await runTransaction(db, async tx => {
        const restaurantRef = doc(db,"restaurants",slug), tableDoc = doc(tableRef,table.id);
        const restaurant = await tx.get(restaurantRef), current = await tx.get(tableDoc);
        if (!current.exists() || !current.data().active) return;
        tx.update(tableDoc,{ active:false });
        tx.update(restaurantRef,{ tableCount:Math.max(0,(restaurant.data().tableCount || 0)-1) });
      });
      say("მაგიდა წაიშალა. მისი ძველი QR კოდი გაუქმებულია.");
    }, "danger small-button"));
    card.append(open,actions); $("tableList").append(card);
  }
}
$("dishImage").onchange = () => {
  if (imageObjectURL) URL.revokeObjectURL(imageObjectURL);
  const file = $("dishImage").files[0];
  if (!file) { $("imagePreview").hidden=true; return; }
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024) {
    $("dishImage").value=""; say("ფოტო უნდა იყოს JPEG, PNG ან WebP და მაქსიმუმ 5 MB."); return;
  }
  imageObjectURL = URL.createObjectURL(file); $("imagePreview").src=imageObjectURL;
  $("imagePreview").hidden=false; $("removeImage").checked=false;
};
$("cancelEdit").onclick = resetProduct;
$("cancelCategory").onclick = resetCategory;
$("productFilter").onchange = renderProducts;
$("appearanceNavLink").onclick = event => { event.preventDefault(); $("appearanceDialog").showModal(); };
$("closeAppearanceDialog").onclick = () => $("appearanceDialog").close();
$("tablesNavLink").onclick = event => { event.preventDefault(); $("tableDialog").showModal(); };
$("closeTableDialog").onclick = () => $("tableDialog").close();
$("menuImportFile").onchange = async event => {
  pendingMenuImport = [];
  try {
    const file = event.target.files[0];
    if (!file) throw Error("აირჩიე მენიუს .txt ფაილი.");
    if (file.size > 5 * 1024 * 1024) throw Error("მენიუს ტექსტის ფაილი 5 MB-ზე ნაკლები უნდა იყოს.");
    pendingMenuImport = parseMenuImport(await file.text());
    const groupCount = new Set(pendingMenuImport.map(product => product.category)).size;
    $("menuImportSummary").textContent = `${pendingMenuImport.length} კერძი · ${groupCount} კატეგორია · ფოტოები არ არის საჭირო`;
    $("menuImportPreview").replaceChildren(...pendingMenuImport.slice(0, 5).map(product =>
      element("p", `${product.category} · ${product.name} · ${product.price.toFixed(2)} ₾`, "muted")));
    if (pendingMenuImport.length > 5) $("menuImportPreview").append(element("p", `და კიდევ ${pendingMenuImport.length - 5} კერძი`, "muted"));
    $("importMenuSubmit").disabled = false;
    say("გადაამოწმე იმპორტის რაოდენობა და შემდეგ დააჭირე დამატებას.");
  } catch(error) {
    $("menuImportSummary").textContent = ""; $("menuImportPreview").replaceChildren();
    $("importMenuSubmit").disabled = true; say(error.message);
  }
};
$("importMenuSubmit").onclick = async () => {
  const button = $("importMenuSubmit");
  if (!productsLoaded || !categoriesLoaded) { say("რესტორნის მენიუ იტვირთება. სცადე რამდენიმე წამში."); return; }
  if (!pendingMenuImport.length) return;
  const proceed = await confirmDialog(`დაემატოს ${pendingMenuImport.length} კერძი ფოტოების გარეშე? უკვე არსებული კერძები გამოტოვდება.`, {title:"მენიუს იმპორტი",confirmText:"დამატება"});
  if (!proceed) return;
  button.disabled = true;
  try {
    const categoryIds = new Map([...categories.values()].map(item => [item.name.trim().toLocaleLowerCase("ka"), item.id]));
    const categoryBatch = writeBatch(db), newCategories = [];
    for (const name of new Set(pendingMenuImport.map(item => item.category))) {
      const key = name.toLocaleLowerCase("ka");
      if (categoryIds.has(key)) continue;
      const ref = doc(categoryRef); categoryIds.set(key, ref.id); newCategories.push({ ref, name });
      categoryBatch.set(ref, { name, createdAt: serverTimestamp() });
    }
    if (newCategories.length) {
      await categoryBatch.commit();
      for (const item of newCategories) categories.set(item.ref.id, { id:item.ref.id, name:item.name });
    }
    const existing = new Set(), productsByCategory = new Map();
    const productKey = (name, categoryId) => `${categoryId}\u0000${name.trim().toLocaleLowerCase("ka")}`;
    for (const item of products.values()) {
      const categoryName = categories.get(item.categoryId)?.name || item.category || "";
      existing.add(productKey(item.name, item.categoryId || categoryName));
      if (categoryName) existing.add(productKey(item.name, categoryName));
    }
    let added = 0, skipped = 0;
    for (const item of pendingMenuImport) {
      const categoryId = categoryIds.get(item.category.toLocaleLowerCase("ka"));
      const key = productKey(item.name, categoryId);
      if (existing.has(key) || existing.has(productKey(item.name, item.category))) { skipped++; continue; }
      existing.add(key);
      if (!productsByCategory.has(categoryId)) productsByCategory.set(categoryId, []);
      productsByCategory.get(categoryId).push({ ref:doc(menuRef), data:{ name:item.name, price:item.price, description:item.description,
        category:"", categoryId, imageUrl:"", imagePath:"", active:true,
        createdAt:serverTimestamp(), updatedAt:serverTimestamp() } });
      added++;
    }
    const categoryGroups = [...productsByCategory.values()];
    for (let start=0; start<categoryGroups.length; start+=10) {
      const productBatch = writeBatch(db);
      const groupChunk = categoryGroups.slice(start,start+10);
      for (const group of groupChunk)
        for (const product of group) productBatch.set(product.ref,product.data);
      await productBatch.commit();
      for (const group of groupChunk) for (const product of group) products.set(product.ref.id,{...product.data,id:product.ref.id});
    }
    renderProducts();
    say(`იმპორტი დასრულდა: დაემატა ${added} კერძი, გამოტოვებულია ${skipped} არსებული კერძი.`);
    pendingMenuImport = []; $("menuImportSummary").textContent = ""; $("menuImportPreview").replaceChildren();
    $("menuImportFile").value = ""; $("importMenuSubmit").disabled = true;
  } catch(error) { say("იმპორტი ვერ დასრულდა: " + error.message); }
  finally { button.disabled = !pendingMenuImport.length; }
};
$("themeColor").oninput = event => renderTheme(event.target.value);
$("saveTheme").onclick = async () => {
  const button = $("saveTheme"); button.disabled = true;
  try {
    const color = $("themeColor").value;
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error("აირჩიე სწორი ფერი.");
    await updateDoc(doc(db, "restaurants", slug), { themeColor: color });
    renderTheme(color); say("მენიუს ფერი შენახულია.");
  } catch(error) { say("ფერის შენახვა ვერ მოხერხდა: " + error.message); }
  finally { button.disabled = false; }
};
$("dishForm").onsubmit = async event => {
  event.preventDefault(); const button=$("saveDish"); button.disabled=true;
  try {
    const id=$("dishId").value, existing=id ? products.get(id) : null;
    if (id && !existing) throw Error("პროდუქტი უკვე წაშლილია.");
    const name=$("dishName").value.trim(), price=Number($("dishPrice").value), categoryId=$("dishCategory").value;
    if (!name || !Number.isFinite(price) || price<=0 || price>100000) throw Error("შეამოწმე პროდუქტის სახელი და ფასი.");
    if (categoryId && !categories.has(categoryId)) throw Error("აირჩიე არსებული კატეგორია.");
    const productDoc=id ? doc(menuRef,id) : doc(menuRef);
    let imageUrl=existing?.imageUrl || "";
    if ($("removeImage").checked) imageUrl="";
    const file=$("dishImage").files[0];
    if (file) imageUrl=await encodeProductPhoto(file);
    const data={ name,price:Math.round(price*100)/100,description:$("dishDescription").value.trim(),category:"",
      categoryId,imageUrl,imagePath:"",active:$("dishActive").checked,updatedAt:serverTimestamp() };
    if (existing) await updateDoc(productDoc,data);
    else await setDoc(productDoc,{...data,createdAt:serverTimestamp()});
    resetProduct(); say(existing ? "პროდუქტი განახლდა." : "პროდუქტი დაემატა.");
  } catch(error) {
    say("შეცდომა: "+error.message);
  } finally { button.disabled=false; }
};
$("categoryForm").onsubmit = async event => {
  event.preventDefault(); const button=$("saveCategory"); button.disabled=true;
  try {
    const name=$("categoryName").value.trim(),id=$("categoryId").value;
    if(!name) throw Error("შეიყვანე კატეგორიის სახელი.");
    if([...categories.values()].some(c=>c.id!==id && c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))
      throw Error("ეს კატეგორია უკვე არსებობს.");
    if(id) await updateDoc(doc(categoryRef,id),{name,updatedAt:serverTimestamp()});
    else await setDoc(doc(categoryRef),{name,createdAt:serverTimestamp()});
    resetCategory(); say("კატეგორია შენახულია.");
  } catch(error) { say("შეცდომა: "+error.message); }
  finally { button.disabled=false; }
};
$("tableForm").onsubmit = async event => {
  event.preventDefault(); const button=$("addTable"); button.disabled=true;
  const label=$("tableLabel").value.trim();
  try {
    await runTransaction(db, async tx => {
      const restaurantRef=doc(db,"restaurants",slug), restaurant=await tx.get(restaurantRef), data=restaurant.data();
      if(data.tableCount>=200) throw Error("მაქსიმუმ 200 აქტიური მაგიდის დამატებაა შესაძლებელი.");
      const maxKnown=Math.max(0,...[...tables.values()].map(t=>Number(t.number)||0));
      const number=Math.max(data.nextTableNumber || 1,maxKnown+1,(data.tableCount || 0)+1);
      const next=doc(tableRef,String(number)), existing=await tx.get(next);
      if(existing.exists()) throw Error("მაგიდების სია განახლდა. სცადე ხელახლა.");
      tx.set(next,{number,active:true,label:label || "მაგიდა "+number});
      tx.update(restaurantRef,{tableCount:(data.tableCount || 0)+1,nextTableNumber:number+1});
    });
    $("tableForm").reset(); say("მაგიდა დაემატა.");
  } catch(error) { say("შეცდომა: "+error.message); }
  finally { button.disabled=false; }
};
$("logout").onclick = async () => {
  $("logout").disabled=true;
  try { await signOut(auth); location.href="register.html#login"; }
  catch(error) { say(error.message); $("logout").disabled=false; }
};
let initialized=false;
onAuthStateChanged(auth,async user => {
  if (!user || user.isAnonymous) { location.replace("register.html#login"); return; }
  if (initialized || stopped) return; initialized=true;
  try {
    if (!slug) throw Error("რესტორანი არ არის არჩეული. შედი ანგარიშში ხელახლა.");
    const restaurant=await requireOwner(slug);
    $("restaurantInfo").textContent=restaurant.name;
    renderTheme(restaurant.themeColor || DEFAULT_THEME_COLOR);
    $("merchantLink").href="merchant.html?restaurant="+encodeURIComponent(slug);
    $("reportLink").href="report.html?restaurant="+encodeURIComponent(slug);
    $("dashboardContent").hidden=false;
    listen(menuRef,products,() => { renderProducts(); renderCategories(); },() => { productsLoaded = true; });
    listen(categoryRef,categories,renderCategories,() => { categoriesLoaded = true; });
    listen(tableRef,tables,renderTables);
  } catch(error) { say(error.message); }
});
window.addEventListener("pagehide",() => {
  stopped=true; unsubscribers.forEach(unsubscribe => unsubscribe());
  if(imageObjectURL) URL.revokeObjectURL(imageObjectURL);
});

