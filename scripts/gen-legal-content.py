from pathlib import Path
import json


def esc(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


root = Path(__file__).resolve().parents[1]
src = root / "src" / "lib" / "legal"
src.mkdir(parents=True, exist_ok=True)
extracted = root / "docs" / "legal" / "extracted"

sections = json.loads(
    (extracted / "privacy-policy.sections.json").read_text(encoding="utf-8")
)
out = [
    "/** Auto-derived from docs/legal/source/privacy-policy.pdf extraction. Do not invent content. */",
    "export type LegalSection = { title: string; blocks: string[] };",
    "export const privacyPolicySections: LegalSection[] = [",
]
for s in sections:
    out.append(f"  {{ title: {esc(s['title'])}, blocks: [")
    for b in s["blocks"]:
        out.append(f"    {esc(b)},")
    out.append("  ] },")
out.append("];")
(src / "privacy-policy-content.ts").write_text("\n".join(out) + "\n", encoding="utf-8")

pd = json.loads(
    (extracted / "personal-data-consent.paras.json").read_text(encoding="utf-8")
)
out = [
    "/** Auto-derived from docs/legal/source/personal-data-consent.pdf. */",
    "export const personalDataConsentParagraphs: string[] = [",
]
for p in pd:
    out.append(f"  {esc(p)},")
out.append("];")
(src / "personal-data-consent-content.ts").write_text(
    "\n".join(out) + "\n", encoding="utf-8"
)

mk = json.loads((extracted / "marketing-consent.paras.json").read_text(encoding="utf-8"))
out = [
    "/** Auto-derived from docs/legal/source/marketing-consent.pdf. */",
    "export const marketingConsentParagraphs: string[] = [",
]
for p in mk:
    out.append(f"  {esc(p)},")
out.append("];")
(src / "marketing-consent-content.ts").write_text(
    "\n".join(out) + "\n", encoding="utf-8"
)

print("ok")
