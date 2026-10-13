from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
errors = []
for page in root.glob("*.html"):
    text = page.read_text(encoding="utf-8")
    for reference in re.findall(r'<(?:script|link)\b[^>]+(?:src|href)=["\x27]([^"\x27]+)', text, re.I):
        if reference.startswith(("http:", "https:", "#", "mailto:")):
            continue
        local = reference.split("?", 1)[0].split("#", 1)[0]
        if local and not (root / local).is_file():
            errors.append(f"{page.name}: missing asset {reference}")
for module in root.glob("*.js"):
    source = module.read_text(encoding="utf-8")
    for imported, reference in re.findall(r'import\s*\{([^}]+)\}\s*from\s*["\x27](\./[^"\x27]+)', source, re.S):
        target = root / reference
        if not target.is_file():
            errors.append(f"{module.name}: missing module {reference}")
            continue
        target_source = target.read_text(encoding="utf-8")
        exported = set(re.findall(r'export\s+(?:const|let|function|async\s+function)\s+(\w+)', target_source))
        for names in re.findall(r'export\s*\{([^}]+)\}', target_source, re.S):
            exported.update(n.strip().split(" as ")[-1] for n in names.split(",") if n.strip())
        for name in imported.split(","):
            name = name.strip().split(" as ")[0]
            if name and name not in exported:
                errors.append(f"{module.name}: {reference} does not export {name}")
if errors:
    raise SystemExit("\n".join(errors))
print("Local HTML assets and JavaScript module exports are valid.")

