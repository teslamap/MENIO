import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pages={
  "index.html":["index-auth.js","accountLink"],
  "register.html":["app.js"],
  "dashboard.html":["dashboard.js","dashboardContent"],
  "menu.html":["menu.js","menu","cartSummary"],
  "merchant.html":["merchant.js"],
  "report.html":["report.js"]
};

test("all published MENIO pages and their main modules exist",()=>{
  for(const [page,markers] of Object.entries(pages)){
    const file=path.join(root,page);
    assert.ok(fs.existsSync(file),`Missing published page: ${page}`);
    const html=fs.readFileSync(file,"utf8");
    assert.match(html,/<link[^>]+href=["']style\.css(?:\?[^"']*)?["']/i,`${page} must load the site stylesheet`);
    const script=markers.find(x=>x.endsWith(".js"));
    assert.ok(html.includes(script),`${page} must reference ${script}`);
    for(const marker of markers.filter(x=>!x.endsWith(".js"))){
      assert.ok(html.includes(`id="${marker}"`),`${page} is missing required element #${marker}`);
    }
  }
});

test("main landing page uses project-relative routes",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.match(html,/<script[^>]+src=["']index-auth\.js/i);
  assert.match(html,/<a[^>]+href=["']register\.html(?:#[^"']*)?["']/i);
});
