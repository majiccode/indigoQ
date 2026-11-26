// A deliberately small expression language: no JavaScript evaluation or property access.
type Scope = Record<string, number>;
type Expression = (scope: Scope) => number;
const functions: Record<string, (...values: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
  atan: Math.atan, atan2: Math.atan2, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  log: Math.log, ln: Math.log, log10: Math.log10, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, min: Math.min, max: Math.max, pow: Math.pow,
};

export function compileExpression(source: string): Expression {
  const tokens = source.match(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_]\w*|\*\*|[^\s]/gi) ?? [];
  if (tokens.length > 500) throw new Error("Expression is too long");
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (token: string) => { if (take() !== token) throw new Error(`Expected ${token}`); };
  function expression(minimum = 0): Expression {
    const token = take();
    let left: Expression;
    if (token === "+" || token === "-") {
      const operand = expression(3);
      left = (scope) => (token === "-" ? -1 : 1) * operand(scope);
    } else if (token === "(") {
      left = expression(); expect(")");
    } else if (token && /^(?:\d|\.\d)/.test(token)) {
      left = () => Number(token);
    } else if (token && /^[A-Za-z_]\w*$/.test(token)) {
      if (peek() === "(") {
        if (!Object.hasOwn(functions, token)) throw new Error(`Unknown function: ${token}`);
        const fn = functions[token];
        take();
        const args: Expression[] = [];
        if (peek() !== ")") { args.push(expression()); while (peek() === ",") { take(); args.push(expression()); } }
        expect(")");
        left = (scope) => fn(...args.map((arg) => arg(scope)));
      } else {
        left = (scope) => {
          if (token === "pi") return Math.PI;
          if (token === "e") return Math.E;
          if (!Object.hasOwn(scope, token)) throw new Error(`Unknown variable: ${token}`);
          return scope[token];
        };
      }
    } else throw new Error(`Expected a number, variable, or function; found ${token ?? "end of expression"}`);
    while (true) {
      const operator = peek();
      const precedence = operator === "+" || operator === "-" ? 1 : operator === "*" || operator === "/" ? 2 : operator === "^" || operator === "**" ? 4 : -1;
      if (precedence < minimum) break;
      take();
      const right = expression(precedence + (precedence === 4 ? 0 : 1));
      const previous = left;
      left = (scope) => {
        const a = previous(scope), b = right(scope);
        return operator === "+" ? a + b : operator === "-" ? a - b : operator === "*" ? a * b : operator === "/" ? a / b : a ** b;
      };
    }
    return left;
  }
  const result = expression();
  if (position !== tokens.length) throw new Error(`Unexpected token: ${peek()}. Use * for multiplication.`);
  return result;
}

export function parseMath(source: string) {
  const parameters: Record<string, number> = {};
  const curves: { label: string; evaluate: Expression }[] = [];
  const errors: string[] = [];
  source.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\/\/.*|#.*|;\s*$/g, "").trim();
    if (!line || line.startsWith("```")) return;
    try {
      const assignment = line.match(/^(?:const\s+|let\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (assignment && assignment[1] !== "y") {
        const name = assignment[1];
        if (["x", "pi", "e"].includes(name) || Object.hasOwn(functions, name)) throw new Error(`Reserved name: ${name}`);
        const value = compileExpression(assignment[2])(parameters);
        if (!Number.isFinite(value)) throw new Error("Parameter must be finite");
        parameters[name] = value;
      } else {
        const evaluate = compileExpression(assignment ? assignment[2] : line);
        evaluate({ ...parameters, x: 0.123 });
        curves.push({ label: line, evaluate });
      }
    } catch (error) { errors.push(`Line ${index + 1}: ${(error as Error).message}`); }
  });
  return { parameters, curves, errors };
}
