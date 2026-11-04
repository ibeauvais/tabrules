export interface HostnameRegex {
  test(hostname: string): boolean;
}

export type RegexCompileResult =
  { ok: true; regex: HostnameRegex } | { ok: false; error: string };

export const REGEX_LIMITS = {
  maxRepeatCount: 63,
  maxStates: 2_000,
} as const;

type CodeRange = readonly [number, number];

interface CharSet {
  negated: boolean;
  ranges: readonly CodeRange[];
  literal?: number;
}

type Anchor = "start" | "end";

type Node =
  | { kind: "char"; set: CharSet }
  | { kind: "anchor"; anchor: Anchor }
  | { kind: "concat"; items: Node[] }
  | { kind: "alternation"; options: Node[] }
  | { kind: "repeat"; node: Node; min: number; max: number | null };

interface CharState {
  kind: "char";
  set: CharSet;
  next: State;
  mark: number;
}

interface AnchorState {
  kind: "anchor";
  anchor: Anchor;
  next: State;
  mark: number;
}

interface SplitState {
  kind: "split";
  first: State;
  second: State;
  mark: number;
}

interface MatchState {
  kind: "match";
  mark: number;
}

type State = CharState | AnchorState | SplitState | MatchState;

class RegexSyntaxError extends Error {}

const code = (character: string): number => character.charCodeAt(0);
const single = (character: string): CharSet => ({
  negated: false,
  ranges: [[code(character), code(character)]],
  literal: code(character),
});

const ANY: CharSet = { negated: true, ranges: [] };
const DIGIT_RANGES: readonly CodeRange[] = [[code("0"), code("9")]];
const WORD_RANGES: readonly CodeRange[] = [
  [code("0"), code("9")],
  [code("A"), code("Z")],
  [code("_"), code("_")],
  [code("a"), code("z")],
];
const ESCAPABLE = new Set("\\^$.|?*+()[]{}-/");
const UPPERCASE = /[A-Z]/;
const BRACES = /\{(\d+)(,(\d*))?\}/y;

const matchesSet = (set: CharSet, charCode: number): boolean =>
  set.ranges.some(([low, high]) => charCode >= low && charCode <= high) !==
  set.negated;

class Parser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): Node {
    const node = this.parseAlternation();
    if (this.position < this.source.length) {
      throw this.error(`unmatched "${this.peek()}"`);
    }
    return node;
  }

  private peek(): string {
    return this.source.charAt(this.position);
  }

  private error(message: string): RegexSyntaxError {
    return new RegexSyntaxError(
      `${message} at position ${String(this.position + 1)}`,
    );
  }

  private parseAlternation(): Node {
    const first = this.parseConcat();
    const options = [first];
    while (this.peek() === "|") {
      this.position++;
      options.push(this.parseConcat());
    }
    return options.length === 1 ? first : { kind: "alternation", options };
  }

  private parseConcat(): Node {
    const items: Node[] = [];
    while (
      this.position < this.source.length &&
      this.peek() !== "|" &&
      this.peek() !== ")"
    ) {
      items.push(this.parseRepeat());
    }
    return { kind: "concat", items };
  }

  private parseRepeat(): Node {
    const node = this.parseAtom();
    if (node.kind === "anchor" && this.isQuantifierNext()) {
      throw this.error("nothing to repeat");
    }
    const bounds = this.parseQuantifier();
    if (bounds === null) {
      return node;
    }
    if (this.peek() === "?") {
      this.position++;
    }
    if (this.isQuantifierNext()) {
      throw this.error("nested quantifier");
    }
    return { kind: "repeat", node, ...bounds };
  }

  private isQuantifierNext(): boolean {
    return this.peek() !== "" && "*+?{".includes(this.peek());
  }

  private parseQuantifier(): { min: number; max: number | null } | null {
    switch (this.peek()) {
      case "*":
        this.position++;
        return { min: 0, max: null };
      case "+":
        this.position++;
        return { min: 1, max: null };
      case "?":
        this.position++;
        return { min: 0, max: 1 };
      case "{":
        return this.parseBraces();
      default:
        return null;
    }
  }

  private parseBraces(): { min: number; max: number | null } {
    BRACES.lastIndex = this.position;
    const match = BRACES.exec(this.source);
    if (match === null) {
      throw this.error('invalid quantifier, use "\\{" for a literal brace');
    }
    const min = Number(match[1]);
    const max =
      match[2] === undefined ? min : match[3] === "" ? null : Number(match[3]);
    if (
      min > REGEX_LIMITS.maxRepeatCount ||
      (max !== null && (max > REGEX_LIMITS.maxRepeatCount || max < min))
    ) {
      throw this.error(
        `repeat counts must be ordered and at most ${String(REGEX_LIMITS.maxRepeatCount)}`,
      );
    }
    this.position = BRACES.lastIndex;
    return { min, max };
  }

  private parseAtom(): Node {
    const character = this.peek();
    switch (character) {
      case "(":
        return this.parseGroup();
      case "[":
        return { kind: "char", set: this.parseClass() };
      case ".":
        this.position++;
        return { kind: "char", set: ANY };
      case "\\":
        return { kind: "char", set: this.parseEscape() };
      case "^":
        this.position++;
        return { kind: "anchor", anchor: "start" };
      case "$":
        this.position++;
        return { kind: "anchor", anchor: "end" };
      case "*":
      case "+":
      case "?":
      case "{":
        throw this.error("nothing to repeat");
      case "]":
      case "}":
        throw this.error(`use "\\${character}" for a literal "${character}"`);
      default:
        return { kind: "char", set: this.parseLiteral() };
    }
  }

  private parseGroup(): Node {
    this.position++;
    if (this.source.startsWith("?:", this.position)) {
      this.position += 2;
    } else if (this.peek() === "?") {
      throw this.error("lookarounds and named groups are not supported");
    }
    const node = this.parseAlternation();
    if (this.peek() !== ")") {
      throw this.error('missing ")"');
    }
    this.position++;
    return node;
  }

  private parseLiteral(): CharSet {
    const character = this.peek();
    if (UPPERCASE.test(character)) {
      throw this.error("use lowercase letters, hostnames are lowercase");
    }
    this.position++;
    return single(character);
  }

  private parseEscape(): CharSet {
    const escaped = this.source.charAt(this.position + 1);
    if (escaped === "") {
      throw this.error("pattern ends with a backslash");
    }
    let set: CharSet;
    if (escaped === "d") {
      set = { negated: false, ranges: DIGIT_RANGES };
    } else if (escaped === "w") {
      set = { negated: false, ranges: WORD_RANGES };
    } else if (ESCAPABLE.has(escaped)) {
      set = single(escaped);
    } else {
      throw this.error(`unsupported escape "\\${escaped}"`);
    }
    this.position += 2;
    return set;
  }

  private parseClass(): CharSet {
    this.position++;
    const negated = this.peek() === "^";
    if (negated) {
      this.position++;
    }
    const ranges: CodeRange[] = [];
    while (this.peek() !== "]") {
      if (this.peek() === "") {
        throw this.error('missing "]"');
      }
      const low = this.parseClassMember();
      const isRange =
        this.peek() === "-" &&
        this.source.charAt(this.position + 1) !== "]" &&
        this.source.charAt(this.position + 1) !== "";
      if (!isRange) {
        ranges.push(...low.ranges);
        continue;
      }
      this.position++;
      const high = this.parseClassMember();
      if (
        low.literal === undefined ||
        high.literal === undefined ||
        low.literal > high.literal
      ) {
        throw this.error("invalid range in character class");
      }
      ranges.push([low.literal, high.literal]);
    }
    if (ranges.length === 0) {
      throw this.error("empty character class");
    }
    this.position++;
    return { negated, ranges };
  }

  private parseClassMember(): CharSet {
    return this.peek() === "\\" ? this.parseEscape() : this.parseLiteral();
  }
}

const buildAutomaton = (root: Node): State => {
  let stateCount = 0;
  const count = <T extends State>(state: T): T => {
    stateCount++;
    if (stateCount > REGEX_LIMITS.maxStates) {
      throw new RegexSyntaxError("pattern is too complex");
    }
    return state;
  };
  const split = (first: State, second: State): SplitState =>
    count({ kind: "split", first, second, mark: -1 });

  const build = (node: Node, next: State): State => {
    switch (node.kind) {
      case "char":
        return count({ kind: "char", set: node.set, next, mark: -1 });
      case "anchor":
        return count({ kind: "anchor", anchor: node.anchor, next, mark: -1 });
      case "concat":
        return node.items.reduceRight((rest, item) => build(item, rest), next);
      case "alternation":
        return node.options
          .map((option) => build(option, next))
          .reduceRight((rest, start) => split(start, rest));
      case "repeat": {
        let start: State = next;
        if (node.max === null) {
          const loop = split(next, next);
          loop.first = build(node.node, loop);
          start = loop;
        } else {
          for (let copy = node.min; copy < node.max; copy++) {
            start = split(build(node.node, start), next);
          }
        }
        for (let copy = 0; copy < node.min; copy++) {
          start = build(node.node, start);
        }
        return start;
      }
    }
  };

  return build(root, count({ kind: "match", mark: -1 }));
};

const createMatcher = (start: State): HostnameRegex => {
  let generation = 0;

  const addState = (
    list: CharState[],
    initial: State,
    position: number,
    length: number,
  ): boolean => {
    let matched = false;
    const pending: State[] = [initial];
    for (let state = pending.pop(); state; state = pending.pop()) {
      if (state.mark === generation) {
        continue;
      }
      state.mark = generation;
      switch (state.kind) {
        case "char":
          list.push(state);
          break;
        case "anchor":
          if (position === (state.anchor === "start" ? 0 : length)) {
            pending.push(state.next);
          }
          break;
        case "split":
          pending.push(state.second, state.first);
          break;
        case "match":
          matched = true;
      }
    }
    return matched;
  };

  return {
    test(hostname) {
      const length = hostname.length;
      generation++;
      let current: CharState[] = [];
      if (addState(current, start, 0, length)) {
        return true;
      }
      for (let index = 0; index < length; index++) {
        generation++;
        const charCode = hostname.charCodeAt(index);
        const next: CharState[] = [];
        let matched = false;
        for (const state of current) {
          if (matchesSet(state.set, charCode)) {
            matched = addState(next, state.next, index + 1, length) || matched;
          }
        }
        matched = addState(next, start, index + 1, length) || matched;
        if (matched) {
          return true;
        }
        current = next;
      }
      return false;
    },
  };
};

export const compileHostnameRegex = (source: string): RegexCompileResult => {
  try {
    return {
      ok: true,
      regex: createMatcher(buildAutomaton(new Parser(source).parse())),
    };
  } catch (error) {
    /* v8 ignore next 3 */
    if (!(error instanceof RegexSyntaxError)) {
      throw error;
    }
    return { ok: false, error: error.message };
  }
};
