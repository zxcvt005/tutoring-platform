/**
 * DSL каталога → LaTeX для KaTeX.
 * В формулах греческие буквы — математические символы; внутренний DSL не меняется.
 * Русские названия остаются только для поясняющего текста.
 */

const GREEK_LATEX: Record<string, string> = {
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  Gamma: "\\Gamma",
  delta: "\\delta",
  Delta: "\\Delta",
  epsilon: "\\varepsilon",
  eta: "\\eta",
  theta: "\\theta",
  lambda: "\\lambda",
  mu: "\\mu",
  nu: "\\nu",
  xi: "\\xi",
  pi: "\\pi",
  rho: "\\rho",
  sigma: "\\sigma",
  tau: "\\tau",
  phi: "\\varphi",
  Phi: "\\Phi",
  chi: "\\chi",
  psi: "\\psi",
  omega: "\\omega",
  Omega: "\\Omega",
};

const GREEK_WORDS: Record<string, string> = {
  alpha: "альфа",
  beta: "бета",
  gamma: "гамма",
  Gamma: "гамма",
  delta: "дельта",
  Delta: "дельта",
  epsilon: "эпсилон",
  eta: "эта",
  theta: "тета",
  lambda: "лямбда",
  mu: "мю",
  nu: "ню",
  xi: "кси",
  pi: "пи",
  rho: "ро",
  sigma: "сигма",
  tau: "тау",
  phi: "фи",
  Phi: "фи",
  chi: "хи",
  psi: "пси",
  omega: "омега",
  Omega: "омега",
};

const SPECIAL_LATEX: Record<string, string> = {
  EMF: "\\mathcal{E}",
  EMF_i: "\\mathcal{E}_{i}",
  EMF_si: "\\mathcal{E}_{si}",
  N_A: "N_{A}",
  t_C: "t_{\\mathrm{C}}",
  epsilon0: "\\varepsilon_{0}",
};

const FUNCTIONS = new Set(["sin", "cos", "tan", "sqrt", "abs", "mean", "log", "ln", "exp"]);

type Ast =
  | { kind: "num"; value: string }
  | { kind: "sym"; name: string }
  | { kind: "fn"; name: string; arg: Ast }
  | { kind: "neg"; arg: Ast }
  | { kind: "percent"; arg: Ast }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Ast; right: Ast };

type Tok = { t: "num" | "id" | "op"; v: string };

function tokenize(src: string): Tok[] {
  const s = src.replace(/\s+/g, "");
  const tokens: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j]!)) j += 1;
      tokens.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j]!)) j += 1;
      tokens.push({ t: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^=()%".includes(c)) {
      tokens.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    i += 1;
  }
  return tokens;
}

function parseSide(source: string): Ast | null {
  const tokens = tokenize(source);
  if (tokens.length === 0) return null;
  let i = 0;

  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const at = (v: string) => peek()?.t === "op" && peek()?.v === v;

  function parseAdd(): Ast | null {
    let left = parseMul();
    if (!left) return null;
    while (at("+") || at("-")) {
      const op = take()!.v as "+" | "-";
      const right = parseMul();
      if (!right) return null;
      left = { kind: "bin", op, left, right };
    }
    return left;
  }

  function parseMul(): Ast | null {
    let left = parsePow();
    if (!left) return null;
    while (at("*") || at("/")) {
      const op = take()!.v as "*" | "/";
      const right = parsePow();
      if (!right) return null;
      left = { kind: "bin", op, left, right };
    }
    return left;
  }

  function parsePow(): Ast | null {
    const left = parseUnary();
    if (!left) return null;
    if (at("^")) {
      take();
      const right = parsePow();
      if (!right) return null;
      return { kind: "bin", op: "^", left, right };
    }
    return left;
  }

  function parseUnary(): Ast | null {
    if (at("-")) {
      take();
      const arg = parseUnary();
      if (!arg) return null;
      return { kind: "neg", arg };
    }
    if (at("+")) {
      take();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): Ast | null {
    const tok = peek();
    if (!tok) return null;
    if (tok.t === "num") {
      take();
      let node: Ast = { kind: "num", value: tok.v };
      if (at("%")) {
        take();
        node = { kind: "percent", arg: node };
      }
      return node;
    }
    if (tok.t === "id") {
      take();
      if (FUNCTIONS.has(tok.v) && at("(")) {
        take();
        const arg = parseAdd();
        if (!arg || !at(")")) return null;
        take();
        return { kind: "fn", name: tok.v, arg };
      }
      return { kind: "sym", name: tok.v };
    }
    if (tok.t === "op" && tok.v === "(") {
      take();
      const inner = parseAdd();
      if (!inner || !at(")")) return null;
      take();
      return inner;
    }
    return null;
  }

  const ast = parseAdd();
  if (!ast || i !== tokens.length) return null;
  return ast;
}

function formatNamePart(part: string): string {
  if (SPECIAL_LATEX[part]) return SPECIAL_LATEX[part]!;
  if (GREEK_LATEX[part]) return GREEK_LATEX[part]!;
  const numbered = part.match(/^([A-Za-z]+)(\d+)$/);
  if (numbered) {
    const base = numbered[1]!;
    const n = numbered[2]!;
    if (GREEK_LATEX[base]) return `${GREEK_LATEX[base]!}_{${n}}`;
    return `${base}_{${n}}`;
  }
  return part;
}

/** Идентификатор DSL → LaTeX (несколько индексов, греческие символы). */
export function formatIdentLatex(name: string): string {
  if (SPECIAL_LATEX[name]) return SPECIAL_LATEX[name]!;
  const parts = name.split("_").filter(Boolean);
  if (parts.length === 0) return name;
  if (parts.length >= 2 && parts[parts.length - 1] === "avg") {
    return `\\langle ${formatIdentLatex(parts.slice(0, -1).join("_"))}\\rangle`;
  }
  const base = formatNamePart(parts[0]!);
  if (parts.length === 1) return base;
  const subs = parts.slice(1).map((part) => {
    if (GREEK_LATEX[part]) return GREEK_LATEX[part]!;
    if (SPECIAL_LATEX[part]) return SPECIAL_LATEX[part]!;
    if (/^\d+$/.test(part) || /^[A-Za-z]$/.test(part)) return part;
    return `\\mathrm{${part}}`;
  });
  return `${base}_{${subs.join(",")}}`;
}

/** Идентификатор DSL → читаемый текст (для запасного рендера и пояснений). */
export function formatIdentPlain(name: string): string {
  if (name === "EMF" || name.startsWith("EMF_")) return name.replace(/^EMF/, "ЭДС");
  if (name === "t_C") return "t_C";
  const parts = name.split("_").filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1] === "avg") {
    return `⟨${formatIdentPlain(parts.slice(0, -1).join("_"))}⟩`;
  }
  const mapped = parts.map((part) => {
    if (GREEK_WORDS[part]) return GREEK_WORDS[part]!;
    const numbered = part.match(/^([A-Za-z]+)(\d+)$/);
    if (numbered && GREEK_WORDS[numbered[1]!]) {
      return `${GREEK_WORDS[numbered[1]!]}_${numbered[2]}`;
    }
    return part;
  });
  return mapped.join("_");
}

function wrap(tex: string, need: boolean): string {
  if (!need) return tex;
  if (/^\\[a-zA-Z]+\{[\s\S]*\}$/.test(tex) || /^[A-Za-z0-9]$/.test(tex)) return tex;
  return `{${tex}}`;
}

function astBp(node: Ast): number {
  if (node.kind === "bin") {
    if (node.op === "+" || node.op === "-") return 1;
    if (node.op === "*" || node.op === "/") return 2;
    return 3;
  }
  if (node.kind === "neg") return 4;
  return 5;
}

function astToLatex(node: Ast): string {
  switch (node.kind) {
    case "num":
      return node.value;
    case "sym":
      return formatIdentLatex(node.name);
    case "percent":
      return `${astToLatex(node.arg)}\\%`;
    case "neg": {
      const inner = astToLatex(node.arg);
      return astBp(node.arg) < 4 ? `-(${inner})` : `-${inner}`;
    }
    case "fn": {
      const arg = astToLatex(node.arg);
      if (node.name === "sqrt") return `\\sqrt{${arg}}`;
      if (node.name === "abs") return `\\left|${arg}\\right|`;
      if (node.name === "mean") return `\\langle ${arg}\\rangle`;
      if (node.name === "sin") return `\\sin\\left(${arg}\\right)`;
      if (node.name === "cos") return `\\cos\\left(${arg}\\right)`;
      if (node.name === "tan") return `\\tan\\left(${arg}\\right)`;
      return `\\operatorname{${node.name}}\\left(${arg}\\right)`;
    }
    case "bin": {
      if (node.op === "/") {
        return `\\frac{${astToLatex(node.left)}}{${astToLatex(node.right)}}`;
      }
      if (node.op === "^") {
        const base = wrap(astToLatex(node.left), astBp(node.left) < 3);
        const exp = astToLatex(node.right);
        return `${base}^{${exp}}`;
      }
      if (node.op === "*") {
        return `${astToLatex(node.left)} \\cdot ${astToLatex(node.right)}`;
      }
      const left = astToLatex(node.left);
      const right = astToLatex(node.right);
      return `${left} ${node.op} ${right}`;
    }
  }
}

function astToPlain(node: Ast): string {
  switch (node.kind) {
    case "num":
      return node.value;
    case "sym":
      return formatIdentPlain(node.name);
    case "percent":
      return `${astToPlain(node.arg)}%`;
    case "neg":
      return `-${astToPlain(node.arg)}`;
    case "fn":
      return node.name === "mean"
        ? `⟨${astToPlain(node.arg)}⟩`
        : `${node.name}(${astToPlain(node.arg)})`;
    case "bin": {
      const l = astToPlain(node.left);
      const r = astToPlain(node.right);
      if (node.op === "*") return `${l} · ${r}`;
      if (node.op === "/") return `(${l}) / (${r})`;
      if (node.op === "^") return `${l}^${r}`;
      return `${l} ${node.op} ${r}`;
    }
  }
}

function splitTopEquals(expression: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of expression) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "=" && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function convertSide(side: string, asLatex: boolean): string {
  const ast = parseSide(side);
  if (ast) return asLatex ? astToLatex(ast) : astToPlain(ast);
  return asLatex ? fallbackLatex(side) : fallbackPlain(side);
}

function fallbackLatex(side: string): string {
  return side
    .replace(/100%/g, "100\\%")
    .replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id) =>
      FUNCTIONS.has(id) ? id : formatIdentLatex(id)
    )
    .replace(/\*/g, " \\cdot ");
}

function fallbackPlain(side: string): string {
  return side.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id) =>
    FUNCTIONS.has(id) ? id : formatIdentPlain(id)
  );
}

export function expressionToLatex(expression: string): string {
  const parts = splitTopEquals(expression);
  if (parts.length === 0) return "";
  return parts.map((p) => convertSide(p, true)).join(" = ");
}

export function expressionToPlain(expression: string): string {
  const parts = splitTopEquals(expression);
  if (parts.length === 0) return "";
  return parts.map((p) => convertSide(p, false)).join(" = ");
}

/** Замена греческих имён в свободном тексте пояснений. */
export function greekNamesToWords(text: string): string {
  return text.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id) => {
    if (FUNCTIONS.has(id)) return id;
    if (!id.split("_").some((p) => GREEK_WORDS[p] || GREEK_WORDS[p.replace(/\d+$/, "")])) {
      return id;
    }
    return formatIdentPlain(id);
  });
}
