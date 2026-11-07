var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var WHITESPACE_CHARACTERS = [
      "	",
      "\n",
      "\v",
      "\f",
      "\r",
      " ",
      "\xA0",
      "\u1680",
      "\u2000",
      "\u2001",
      "\u2002",
      "\u2003",
      "\u2004",
      "\u2005",
      "\u2006",
      "\u2007",
      "\u2008",
      "\u2009",
      "\u200A",
      "\u2028",
      "\u2029",
      "\u202F",
      "\u205F",
      "\u3000",
      "\uFEFF"
    ];
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      WHITESPACE_CHARACTERS,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name2, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name2, index, value);
      t[name2] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version3, options) {
        options = parseOptions(options);
        if (version3 instanceof _SemVer) {
          if (version3.loose === !!options.loose && version3.includePrerelease === !!options.includePrerelease) {
            return version3;
          } else {
            version3 = version3.version;
          }
        } else if (typeof version3 !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version3}".`);
        }
        if (version3.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version3, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version3.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version3}`);
        }
        this.raw = version3;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id2) => {
            if (/^[0-9]+$/.test(id2)) {
              const num = +id2;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id2;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/parse.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse3 = (version3, options, throwErrors = false) => {
      if (version3 instanceof SemVer) {
        return version3;
      }
      try {
        return new SemVer(version3, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse3;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/valid.js"(exports, module) {
    "use strict";
    var parse3 = require_parse();
    var valid2 = (version3, options) => {
      const v = parse3(version3, options);
      return v ? v.version : null;
    };
    module.exports = valid2;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/clean.js"(exports, module) {
    "use strict";
    var parse3 = require_parse();
    var clean = (version3, options) => {
      const s = parse3(version3.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/inc.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version3, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version3 instanceof SemVer ? version3.version : version3,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/diff.js"(exports, module) {
    "use strict";
    var parse3 = require_parse();
    var diff = (version1, version22) => {
      const v1 = parse3(version1, null, true);
      const v2 = parse3(version22, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/major.js
var require_major = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/major.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module.exports = major;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/minor.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/patch.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/prerelease.js"(exports, module) {
    "use strict";
    var parse3 = require_parse();
    var prerelease = (version3, options) => {
      const parsed = parse3(version3, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare2 = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare2;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/rcompare.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var rcompare = (a, b, loose) => compare2(b, a, loose);
    module.exports = rcompare;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/compare-loose.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var compareLoose = (a, b) => compare2(a, b, true);
    module.exports = compareLoose;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/compare-build.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/sort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/rsort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var gt = (a, b, loose) => compare2(a, b, loose) > 0;
    module.exports = gt;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var lt = (a, b, loose) => compare2(a, b, loose) < 0;
    module.exports = lt;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var eq = (a, b, loose) => compare2(a, b, loose) === 0;
    module.exports = eq;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var neq = (a, b, loose) => compare2(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var gte = (a, b, loose) => compare2(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var lte = (a, b, loose) => compare2(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/coerce.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse3 = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version3, options) => {
      if (version3 instanceof SemVer) {
        return version3;
      }
      if (typeof version3 === "number") {
        version3 = String(version3);
      }
      if (typeof version3 !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version3.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version3)) && (!match || match.index + match[0].length !== version3.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse3(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module.exports = coerce;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/truncate.js"(exports, module) {
    "use strict";
    var parse3 = require_parse();
    var constants = require_constants();
    var SemVer = require_semver();
    var truncate = (version3, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version3, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version3, options) => {
      const versionStringToParse = version3 instanceof SemVer ? version3.version : version3;
      return parse3(versionStringToParse, options);
    };
    var doTruncation = (version3, truncation) => {
      if (isPrerelease(truncation)) {
        return version3.version;
      }
      version3.prerelease = [];
      switch (truncation) {
        case "major":
          version3.minor = 0;
          version3.patch = 0;
          break;
        case "minor":
          version3.patch = 0;
          break;
      }
      return version3.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module.exports = truncate;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/trim-comparator-whitespace.js
var require_trim_comparator_whitespace = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/internal/trim-comparator-whitespace.js"(exports, module) {
    "use strict";
    var {
      MAX_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      WHITESPACE_CHARACTERS
    } = require_constants();
    var whitespace = new Uint8Array(65536);
    for (const char of WHITESPACE_CHARACTERS) {
      whitespace[char.charCodeAt(0)] = 1;
    }
    var isWhitespace = (char) => char !== void 0 && whitespace[char.charCodeAt(0)] === 1;
    var isVersionPrefix = (char) => char === "v" || char === "=" || isWhitespace(char);
    var isDigit = (char) => char !== void 0 && char >= "0" && char <= "9";
    var isLetter = (char) => char !== void 0 && (char >= "a" && char <= "z" || char >= "A" && char <= "Z");
    var isIdentifierCharacter = (char) => isDigit(char) || isLetter(char) || char === "-";
    var isVersionStart = (char) => isDigit(char) || char === "x" || char === "X" || char === "*";
    var findDigitsEndIndex = (range, start, limit, digitRuns) => {
      if (!isDigit(range[start])) {
        return start;
      }
      if (start >= digitRuns.start && start < digitRuns.end) {
        return Math.min(start + limit, digitRuns.end);
      }
      if (start >= digitRuns.previousStart && start < digitRuns.previousEnd) {
        return Math.min(start + limit, digitRuns.previousEnd);
      }
      let end = start + 1;
      while (isDigit(range[end])) {
        end++;
      }
      digitRuns.previousStart = digitRuns.start;
      digitRuns.previousEnd = digitRuns.end;
      digitRuns.start = start;
      digitRuns.end = end;
      return Math.min(start + limit, end);
    };
    var findVersionNumberEndIndex = (range, start, loose, digitRuns) => {
      if (!loose && range[start] === "0") {
        return start + 1;
      }
      return findDigitsEndIndex(range, start, loose ? MAX_LENGTH : MAX_LENGTH + 1, digitRuns);
    };
    var findPrereleaseIdentifierEndIndex = (range, start, loose, digitRuns) => {
      const digitsEnd = findDigitsEndIndex(range, start, MAX_LENGTH, digitRuns);
      if (isLetter(range[digitsEnd]) || range[digitsEnd] === "-") {
        let end = digitsEnd + 1;
        const limit = end + MAX_SAFE_BUILD_LENGTH;
        while (end < limit && isIdentifierCharacter(range[end])) {
          end++;
        }
        return end;
      }
      return findVersionNumberEndIndex(range, start, loose, digitRuns);
    };
    var findPrereleaseEndIndex = (range, start, loose, digitRuns) => {
      const hyphen = range[start] === "-";
      if (!loose && !hyphen) {
        return start;
      }
      const identifierStart = start + (hyphen ? 1 : 0);
      let end = findPrereleaseIdentifierEndIndex(range, identifierStart, loose, digitRuns);
      if (end === identifierStart) {
        if (!loose || !hyphen) {
          return start;
        }
        end = findPrereleaseIdentifierEndIndex(range, start, loose, digitRuns);
      }
      while (range[end] === ".") {
        const next = findPrereleaseIdentifierEndIndex(range, end + 1, loose, digitRuns);
        if (next === end + 1) {
          break;
        }
        end = next;
      }
      return end;
    };
    var findBuildIdentifierEndIndex = (range, start) => {
      let end = start;
      while (end - start < MAX_SAFE_BUILD_LENGTH && isIdentifierCharacter(range[end])) {
        end++;
      }
      return end;
    };
    var findBuildEndIndex = (range, start) => {
      if (range[start] !== "+") {
        return start;
      }
      let end = findBuildIdentifierEndIndex(range, start + 1);
      if (end === start + 1) {
        return start;
      }
      while (range[end] === ".") {
        const next = findBuildIdentifierEndIndex(range, end + 1);
        if (next === end + 1) {
          break;
        }
        end = next;
      }
      return end;
    };
    var findLooseFullVersionEndIndex = (range, start, digitRuns) => {
      let end = start;
      for (let component = 0; component < 3; component++) {
        const next = findVersionNumberEndIndex(range, end, true, digitRuns);
        if (next === end) {
          return start;
        }
        end = next;
        if (component < 2) {
          if (range[end] !== ".") {
            return start;
          }
          end++;
        }
      }
      const prereleaseEnd = findPrereleaseEndIndex(range, end, true, digitRuns);
      return findBuildEndIndex(range, prereleaseEnd);
    };
    var findPartialVersionComponentEndIndex = (range, start, digitRuns) => {
      if (isDigit(range[start])) {
        return findVersionNumberEndIndex(range, start, false, digitRuns);
      }
      return isVersionStart(range[start]) ? start + 1 : start;
    };
    var findPartialVersionEndIndex = (range, start, digitRuns) => {
      let end = findPartialVersionComponentEndIndex(range, start, digitRuns);
      for (let component = 0; component < 2; component++) {
        if (range[end] !== ".") {
          return end;
        }
        const next = findPartialVersionComponentEndIndex(range, end + 1, digitRuns);
        if (next === end + 1) {
          return end;
        }
        end = next;
      }
      const prereleaseEnd = findPrereleaseEndIndex(range, end, false, digitRuns);
      return findBuildEndIndex(range, prereleaseEnd);
    };
    var findVersionEndIndex = (range, start, digitRuns) => {
      const fullVersionEnd = findLooseFullVersionEndIndex(range, start, digitRuns);
      return fullVersionEnd !== start ? fullVersionEnd : findPartialVersionEndIndex(range, start, digitRuns);
    };
    var findRemovableWhitespaceIndex = (range, matchStart) => {
      let position = matchStart;
      if (isWhitespace(range[position])) {
        position++;
      }
      if (range[position] === "<" || range[position] === ">") {
        position++;
      }
      if (range[position] === "=") {
        position++;
      }
      return isWhitespace(range[position]) ? position : -1;
    };
    var trimComparatorWhitespace = (range) => {
      let result = "";
      let copyFrom = 0;
      let cursor2 = 0;
      const digitRuns = { start: -1, end: -1, previousStart: -1, previousEnd: -1 };
      while (cursor2 < range.length) {
        const matchStart = cursor2;
        if (range[cursor2] === "<" || range[cursor2] === ">") {
          cursor2++;
        } else if (!isVersionPrefix(range[cursor2]) && !isVersionStart(range[cursor2])) {
          cursor2++;
          continue;
        }
        while (cursor2 < range.length && isVersionPrefix(range[cursor2])) {
          cursor2++;
        }
        if (!isVersionStart(range[cursor2])) {
          continue;
        }
        const whitespacePosition = findRemovableWhitespaceIndex(range, matchStart);
        if (whitespacePosition !== -1) {
          result += range.slice(copyFrom, whitespacePosition);
          copyFrom = whitespacePosition + 1;
        }
        cursor2 = findVersionEndIndex(range, cursor2, digitRuns);
      }
      return result + range.slice(copyFrom);
    };
    module.exports = trimComparatorWhitespace;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached2 = cache.get(memoKey);
        if (cached2) {
          return cached2;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = trimComparatorWhitespace(range);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version3) {
        if (!version3) {
          return false;
        }
        if (typeof version3 === "string") {
          try {
            version3 = new SemVer(version3, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version3, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var trimComparatorWhitespace = require_trim_comparator_whitespace();
    var {
      safeRe: re,
      src,
      t,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id2) => !id2 || id2.toLowerCase() === "x" || id2 === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version3, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version3)) {
          return false;
        }
      }
      if (version3.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version3.major && allowed.minor === version3.minor && allowed.patch === version3.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version3) {
        debug("Comparator.test", version3, this.options.loose);
        if (this.semver === ANY || version3 === ANY) {
          return true;
        }
        if (typeof version3 === "string") {
          try {
            version3 = new SemVer(version3, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version3, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies = (version3, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version3);
    };
    module.exports = satisfies;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/to-comparators.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/max-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/min-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/min-version.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/outside.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version3, range, hilo, options) => {
      version3 = new SemVer(version3, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version3, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version3, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version3, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/gtr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var gtr = (version3, range, options) => outside(version3, range, ">", options);
    module.exports = gtr;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/ltr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var ltr = (version3, range, options) => outside(version3, range, "<", options);
    module.exports = ltr;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/intersects.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/simplify.js"(exports, module) {
    "use strict";
    var satisfies = require_satisfies();
    var compare2 = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare2(a, b, options));
      for (const version3 of v) {
        const included = satisfies(version3, range, options);
        if (included) {
          prev = version3;
          if (!first) {
            first = version3;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/ranges/subset.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare2 = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare2(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !c.test(gt.semver)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !c.test(lt.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare2(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare2(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// ../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/index.js
var require_semver2 = __commonJS({
  "../../node_modules/.pnpm/semver@7.8.6/node_modules/semver/index.js"(exports, module) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse3 = require_parse();
    var valid2 = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare2 = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse: parse3,
      valid: valid2,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare: compare2,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// ../shared/dist/agent/values.js
var AGENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var AGENT_OPERATION_ERROR_CODES = [
  "invalid_input",
  "unauthenticated",
  "forbidden",
  "app_disabled",
  "execution_disabled",
  "capability_undeclared",
  "target_denied",
  "not_found",
  "active_run_conflict",
  "idempotency_conflict",
  "approval_stale",
  "version_conflict",
  "storage_unavailable",
  "internal_failure",
  "provider_unavailable",
  "provider_in_use",
  "provider_configuration_stale",
  "model_not_found",
  "provider_request_failed",
  "limit_exceeded",
  "operation_unknown",
  "command_failed",
  "remote_unavailable",
  "host_key_untrusted",
  "not_text",
  "mutation_busy",
  "mutation_blocked"
];
var AGENT_HTTP_ERROR_CODES = [
  ...AGENT_OPERATION_ERROR_CODES,
  "invalid_json",
  "body_too_large",
  "unsupported_media_type",
  "invalid_host",
  "csrf_rejected",
  "invalid_path",
  "shutting_down"
];
var AGENT_MAX_JSON_BODY_BYTES = 16 * 1024;
var AGENT_MAX_RESPONSE_BYTES = 32 * 1024;

// ../shared/dist/agent/http-codec.js
var InvalidAgentPayload = class extends Error {
  constructor() {
    super("invalid_agent_payload");
    this.name = "InvalidAgentPayload";
  }
};
function readAgentId(input) {
  if (typeof input !== "string" || !AGENT_ID_PATTERN.test(input)) {
    throw new InvalidAgentPayload();
  }
  return input.toLowerCase();
}
function readAgentErrorResponse(input) {
  const code = agentRecord(input, ["code"]).code;
  for (const item of AGENT_HTTP_ERROR_CODES) {
    if (code === item) {
      return { code: item };
    }
  }
  throw new InvalidAgentPayload();
}
function encodeAgentJson(input, maxBytes) {
  const json = JSON.stringify(input);
  if (json === void 0 || new TextEncoder().encode(json).byteLength > maxBytes) {
    throw new InvalidAgentPayload();
  }
  return json;
}
function agentRecord(input, keys, maxBytes = AGENT_MAX_RESPONSE_BYTES) {
  if (!isAgentRecord(input)) {
    throw new InvalidAgentPayload();
  }
  encodeAgentJson(input, maxBytes);
  const row = input;
  if (Object.keys(row).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(row, key))) {
    throw new InvalidAgentPayload();
  }
  return row;
}
function isAgentRecord(input) {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}
function agentInteger(input, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < min || input > max) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function agentText(input, maxBytes) {
  if (typeof input !== "string" || !input.trim() || new TextEncoder().encode(input).byteLength > maxBytes) {
    throw new InvalidAgentPayload();
  }
  return input;
}

// ../shared/dist/agent/execution/values.js
var AGENT_EXECUTION_MAX_TIMER_SECONDS = Math.floor((2 ** 31 - 1) / 1e3);
var AGENT_EXECUTION_MAX_EXPIRY_MS = 864e13;
var AGENT_EXECUTION_LIMIT_MAXIMA = {
  maxModelRequests: Number.MAX_SAFE_INTEGER,
  maxToolExecutions: Number.MAX_SAFE_INTEGER,
  maxActiveSeconds: AGENT_EXECUTION_MAX_TIMER_SECONDS,
  toolTimeoutSeconds: AGENT_EXECUTION_MAX_TIMER_SECONDS,
  maxToolOutputBytes: Number.MAX_SAFE_INTEGER,
  maxTokenReservations: Number.MAX_SAFE_INTEGER,
  maxConcurrentRuns: Number.MAX_SAFE_INTEGER,
  maxConcurrentModelCalls: Number.MAX_SAFE_INTEGER,
  maxChildren: Number.MAX_SAFE_INTEGER,
  maxMessages: Number.MAX_SAFE_INTEGER,
  maxMessageBytes: Number.MAX_SAFE_INTEGER,
  maxRecallItems: Number.MAX_SAFE_INTEGER,
  maxRecallBytes: Number.MAX_SAFE_INTEGER,
  maxArtifactBytes: Number.MAX_SAFE_INTEGER,
  artifactTtlSeconds: Math.floor(AGENT_EXECUTION_MAX_EXPIRY_MS / 1e3)
};
var AGENT_EXECUTION_SETTINGS_MAX_BYTES = 128 * 1024;

// ../shared/dist/agent/artifacts/values.js
var AGENT_ARTIFACT_STATUSES = ["staging", "ready", "deleting", "deleted", "unavailable"];
var AGENT_ARTIFACT_MAX_BYTES = AGENT_EXECUTION_LIMIT_MAXIMA.maxArtifactBytes;
var AGENT_ARTIFACT_MAX_PAGE = 50;
var AGENT_ARTIFACT_MAX_OFFSET = Number.MAX_SAFE_INTEGER - AGENT_ARTIFACT_MAX_PAGE;
var AGENT_ARTIFACT_MAX_BODY_BYTES = 16 * 1024;
var AGENT_ARTIFACT_MAX_RESPONSE_BYTES = 128 * 1024;
var AGENT_ARTIFACT_CONTENT_TYPES = ["image", "document", "code", "archive", "media", "other"];

// ../shared/dist/agent/artifacts/http-codec.js
function boolean(value) {
  if (typeof value !== "boolean") {
    throw new InvalidAgentPayload();
  }
  return value;
}
function time(value) {
  return value === null ? null : agentInteger(value);
}
function readAgentArtifactBegin(value) {
  const r = agentRecord(value, ["name", "mediaType", "declaredBytes"]);
  const name2 = agentText(r.name, 256);
  const mediaType = agentText(r.mediaType, 128);
  if (!name2.trim() || /[\u0000-\u001f\u007f/\\]/u.test(name2) || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(mediaType)) {
    throw new InvalidAgentPayload();
  }
  return { name: name2, mediaType, declaredBytes: agentInteger(r.declaredBytes, 0, AGENT_ARTIFACT_MAX_BYTES) };
}
function readAgentArtifactVersion(value) {
  return { expectedVersion: agentInteger(agentRecord(value, ["expectedVersion"]).expectedVersion, 1) };
}
function readAgentArtifactRetain(value) {
  const r = agentRecord(value, ["expectedVersion", "retained"]);
  return { expectedVersion: agentInteger(r.expectedVersion, 1), retained: boolean(r.retained) };
}
function readAgentArtifactQuery(query) {
  const keys = ["appId", "retained", "kind", "q", "offset", "limit"];
  if ([...query.keys()].some((k) => !keys.includes(k)) || keys.some((k) => query.getAll(k).length > 1)) {
    throw new InvalidAgentPayload();
  }
  const retained = query.get("retained");
  if (retained !== null && retained !== "true" && retained !== "false") {
    throw new InvalidAgentPayload();
  }
  const kindText = query.get("kind");
  const kind = kindText === null ? null : AGENT_ARTIFACT_CONTENT_TYPES.find((v) => v === kindText);
  if (kind === void 0) {
    throw new InvalidAgentPayload();
  }
  function number3(key, fallback, min, max) {
    const raw = query.get(key);
    if (raw === null) {
      return fallback;
    }
    if (!/^(0|[1-9][0-9]{0,15})$/u.test(raw)) {
      throw new InvalidAgentPayload();
    }
    return agentInteger(Number(raw), min, max);
  }
  const app = query.get("appId");
  return {
    appId: app === null ? null : readAgentId(app),
    retained: retained === null ? null : retained === "true",
    kind,
    q: query.get("q") === null || query.get("q") === "" ? "" : agentText(query.get("q"), 256),
    offset: number3("offset", 0, 0, AGENT_ARTIFACT_MAX_OFFSET),
    limit: number3("limit", 20, 1, AGENT_ARTIFACT_MAX_PAGE)
  };
}
function readAgentArtifactView(value) {
  const r = agentRecord(value, [
    "id",
    "appId",
    "name",
    "mediaType",
    "kind",
    "sizeBytes",
    "sha256",
    "status",
    "retained",
    "version",
    "createdAt",
    "readyAt",
    "expiresAt",
    "deletedAt"
  ]);
  const status = AGENT_ARTIFACT_STATUSES.find((v) => v === r.status);
  const kind = AGENT_ARTIFACT_CONTENT_TYPES.find((v) => v === r.kind);
  if (!status || !kind || r.sha256 !== null && (typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(r.sha256))) {
    throw new InvalidAgentPayload();
  }
  const createdAt = agentInteger(r.createdAt);
  const readyAt = time(r.readyAt);
  const deletedAt = time(r.deletedAt);
  if (readyAt !== null && readyAt < createdAt || deletedAt !== null && deletedAt < createdAt || status === "ready" && (r.sha256 === null || readyAt === null) || status === "deleted" && deletedAt === null || status !== "deleted" && deletedAt !== null || status === "staging" && (r.sha256 !== null || readyAt !== null)) {
    throw new InvalidAgentPayload();
  }
  const sha256 = typeof r.sha256 === "string" ? r.sha256 : null;
  return {
    id: readAgentId(r.id),
    appId: readAgentId(r.appId),
    name: agentText(r.name, 256),
    mediaType: agentText(r.mediaType, 128),
    kind,
    sizeBytes: agentInteger(r.sizeBytes, 0, AGENT_ARTIFACT_MAX_BYTES),
    sha256,
    status,
    retained: boolean(r.retained),
    version: agentInteger(r.version, 1),
    createdAt,
    readyAt,
    expiresAt: time(r.expiresAt),
    deletedAt
  };
}
function readAgentArtifactResponse(value) {
  return { artifact: readAgentArtifactView(agentRecord(value, ["artifact"]).artifact) };
}
function readAgentArtifactListResponse(value) {
  const r = agentRecord(value, ["items", "nextOffset"], AGENT_ARTIFACT_MAX_RESPONSE_BYTES);
  if (!Array.isArray(r.items) || r.items.length > AGENT_ARTIFACT_MAX_PAGE) {
    throw new InvalidAgentPayload();
  }
  const items = r.items.map((v) => readAgentArtifactView(v));
  if (new Set(items.map((v) => v.id)).size !== items.length) {
    throw new InvalidAgentPayload();
  }
  return {
    items,
    nextOffset: r.nextOffset === null ? null : agentInteger(r.nextOffset, 1, AGENT_ARTIFACT_MAX_OFFSET)
  };
}
function readAgentArtifactAttachment(value) {
  const r = agentRecord(value, ["artifact", "sourceAppId", "targetAppId", "threadId", "runId", "role", "crossApp"]);
  const artifact = readAgentArtifactView(r.artifact);
  const sourceAppId = readAgentId(r.sourceAppId);
  const targetAppId = readAgentId(r.targetAppId);
  const crossApp = boolean(r.crossApp);
  if (r.role !== "input" || artifact.appId !== sourceAppId || crossApp !== (sourceAppId !== targetAppId)) {
    throw new InvalidAgentPayload();
  }
  return {
    artifact,
    sourceAppId,
    targetAppId,
    threadId: readAgentId(r.threadId),
    runId: r.runId === null ? null : readAgentId(r.runId),
    role: "input",
    crossApp
  };
}
function readAgentArtifactAttachResponse(value) {
  return { attachment: readAgentArtifactAttachment(agentRecord(value, ["attachment"]).attachment) };
}
function readAgentArtifactDeleteResponse(value) {
  if (agentRecord(value, ["deleted"]).deleted !== true) {
    throw new InvalidAgentPayload();
  }
  return { deleted: true };
}

// ../shared/dist/common/version.js
var import_semver = __toESM(require_semver2(), 1);
function readComparableVersion(value) {
  const parsed = (0, import_semver.parse)(value);
  if (!parsed || parsed.prerelease.some((part) => typeof part === "string" && /^[0-9]+$/u.test(part) && !Number.isSafeInteger(Number(part)))) {
    return null;
  }
  return parsed.version;
}

// ../shared/dist/agent/scope/values.js
var AGENT_SCOPE_MAX_NAME_BYTES = 128;
var AGENT_THREAD_MAX_PAGE = 50;
var AGENT_THREAD_ENTRY_MAX_PAGE = 16;
var AGENT_THREAD_ENTRY_MAX_TEXT_CODE_POINTS = 4096;
var AGENT_THREAD_ENTRY_MAX_TEXT_BYTES = 16 * 1024;
var AGENT_THREAD_ENTRIES_MAX_RESPONSE_BYTES = 512 * 1024;
var AGENT_APP_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
var AGENT_APP_DEFINITION_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u;
var AGENT_APP_MAX_DEFINITION_ID_BYTES = 128;
var AGENT_APP_MAX_DEFINITION_VERSION_BYTES = 64;
var AGENT_WORKSPACE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024 + 1024;

// ../shared/dist/agent/plugins/package-values.js
var AGENT_PLUGIN_MAX_PACKAGE_ID_BYTES = 128;
var AGENT_PLUGIN_MAX_VERSION_BYTES = 64;
var AGENT_PLUGIN_PACKAGE_HASH_LENGTH = 64;

// ../shared/dist/agent/governance/values.js
var AGENT_CAPABILITIES = [
  "file.read",
  "file.write",
  "file.delete",
  "machine.inspect",
  "host.inspect",
  "shell.execute",
  "machine.docker.manage",
  "browser.read",
  "browser.interact",
  "integration.mcp.read",
  "integration.mcp.invoke",
  "integration.acp.invoke",
  "artifacts.read",
  "artifacts.write",
  "context.read",
  "context.compact",
  "memory.read",
  "memory.propose",
  "app.intents.exchange",
  "plugin.invoke",
  "plugin.configure",
  "service.transport.http",
  "service.transport.process"
];
var AGENT_APPROVAL_STATUSES = ["requested", "approved", "denied", "expired", "superseded"];
var AGENT_APPROVAL_RISKS = ["read", "control", "mutate", "destructive", "forbidden"];
var AGENT_APPROVAL_DECISIONS = ["approved", "denied"];
var AGENT_APPROVAL_MAX_PAGE_ITEMS = 64;
var AGENT_GOVERNANCE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
var AGENT_GOVERNANCE_MAX_BODY_BYTES = 16 * 1024;
var AGENT_GOVERNANCE_MAX_GRANT_BODY_BYTES = 512 * 1024;
var AGENT_APPROVAL_MAX_TOOL_NAME_BYTES = 256;
var AGENT_APPROVAL_MAX_TOOL_VERSION_BYTES = AGENT_PLUGIN_MAX_PACKAGE_ID_BYTES + 1 + AGENT_PLUGIN_MAX_VERSION_BYTES + 1 + AGENT_PLUGIN_PACKAGE_HASH_LENGTH;
var AGENT_APPROVAL_MAX_SUMMARY_BYTES = 2048;
var AGENT_APPROVAL_MAX_FEEDBACK_BYTES = 2e3;
var AGENT_APPROVAL_OPERATION_HASH_LENGTH = 64;
var AGENT_APPROVAL_OPERATION_HASH_PATTERN = /^[a-f0-9]{64}$/iu;

// ../shared/dist/agent/plugins/values.js
var AGENT_PLUGIN_MAX_BODY_BYTES = 256 * 1024;
var AGENT_PLUGIN_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
var AGENT_PLUGIN_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
var AGENT_PLUGIN_MAX_MANIFEST_BYTES = 64 * 1024;
var AGENT_PLUGIN_MAX_FILE_LIST_BYTES = 1024 * 1024;
var AGENT_PLUGIN_MAX_PACKAGE_FILE_BYTES = 50 * 1024 * 1024;
var AGENT_PLUGIN_MAX_EXPANDED_BYTES = 200 * 1024 * 1024;
var AGENT_PLUGIN_MAX_ASSET_BYTES = 16 * 1024 * 1024;
var AGENT_PLUGIN_MAX_ENTRY_BYTES = 2048;
var AGENT_PLUGIN_MAX_MESSAGE_BYTES = 512 * 1024;
var AGENT_PLUGIN_HOST_ARGUMENT_MAX_BYTES = AGENT_PLUGIN_MAX_MESSAGE_BYTES;
var AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES = AGENT_PLUGIN_MAX_MESSAGE_BYTES - 1024;
var AGENT_PLUGIN_HOST_OPERATIONS = [
  "discovery.catalog",
  "discovery.activate",
  "targets.list",
  "diagnostics.host",
  "diagnostics.readTarget",
  "skills.catalog",
  "skills.read",
  "images.list",
  "images.generate",
  "context.readResults",
  "artifacts.create",
  "artifacts.read",
  "artifacts.present",
  "artifacts.checkCapacity",
  "memory.propose",
  "memory.retrieve",
  "project.bindingRead",
  "project.bindingWrite",
  "remote.readTextPage",
  "remote.listPage",
  "remote.inspect",
  "remote.search",
  "remote.write",
  "remote.patch",
  "remote.move",
  "remote.delete",
  "remote.deliver",
  "shell.execute",
  "shell.jobs",
  "docker.inspect",
  "docker.control",
  "browser.catalog",
  "browser.open",
  "browser.close",
  "browser.snapshot",
  "browser.screenshot",
  "browser.console",
  "browser.navigate",
  "browser.back",
  "browser.scroll",
  "browser.press",
  "browser.select",
  "browser.wait",
  "browser.click",
  "browser.type",
  "browser.upload",
  "browser.download",
  "collaboration.delegate",
  "collaboration.list",
  "collaboration.readOutput",
  "collaboration.join",
  "collaboration.cancel",
  "collaboration.sendMessage",
  "collaboration.readMessages",
  "collaboration.consumeMessages",
  "collaboration.readFact",
  "collaboration.writeFact"
];
var AGENT_TOOL_HOST_OPERATIONS = [
  ...AGENT_PLUGIN_HOST_OPERATIONS,
  "context.checkpoint",
  "acp.catalog",
  "acp.executeSaved",
  "acp.execute",
  "mcp.catalog",
  "mcp.invokeTool",
  "mcp.readResource",
  "mcp.readPrompt",
  "acp.permission",
  "plugins.invoke",
  "discovery.search",
  "project.bind",
  "project.read",
  "project.clear",
  "skills.search",
  "memory.recall"
];
var AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES = Math.max(AGENT_APP_MAX_RESPONSE_BYTES, AGENT_GOVERNANCE_MAX_RESPONSE_BYTES) + 1024;
var AGENT_PLUGIN_RPC_TIMEOUT_MS = 3e4;
var AGENT_PLUGIN_MAX_MIGRATION_BYTES = 52 * 1024 * 1024;
var AGENT_PLUGIN_INSTALLATION_STATUSES = ["installed", "draining", "removed"];
var AGENT_PLUGIN_MAX_DATA_KEY_BYTES = 128;
var AGENT_PLUGIN_MAX_DATA_VALUE_BYTES = AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES;
function hasAgentPluginDataValueCapacity(valueJson) {
  return new TextEncoder().encode(JSON.stringify(valueJson)).byteLength <= AGENT_PLUGIN_MAX_DATA_VALUE_BYTES;
}
var AGENT_PLUGIN_MAX_CATALOG_BYTES = 8 * 1024 * 1024;
function isAgentPluginVersion(value) {
  return /^[0-9a-z.-]+$/u.test(value) && readComparableVersion(value) === value;
}

// ../shared/dist/agent/collaboration/values.js
var AGENT_COLLABORATION_MESSAGE_MAX_PAGE = 32;
var AGENT_COLLABORATION_MAX_RESPONSE_BYTES = 2064384;
var AGENT_CHILD_PROFILES = ["explore", "review", "worker"];
var AGENT_MESSAGE_METADATA_MAX_BODY_BYTES = AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES;

// ../shared/dist/agent/runs/values.js
var AGENT_APPROVAL_MODES = ["ask", "full_access"];
var AGENT_RUN_STATUSES = [
  "pending",
  "running",
  "suspended",
  "completed",
  "failed",
  "unknown",
  "cancelled"
];
var AGENT_RUN_MAX_JSON_BODY_BYTES = 128 * 1024;
var AGENT_RUN_MAX_PROMPT_BYTES = AGENT_RUN_MAX_JSON_BODY_BYTES;
var AGENT_RUN_EVENT_MAX_LIMIT = 100;
var AGENT_RUN_STEP_MAX_TEXT_BYTES = 2 * 1024 * 1024;
var AGENT_RUN_STEP_MAX_INDEX = AGENT_EXECUTION_LIMIT_MAXIMA.maxModelRequests;
var AGENT_RUN_STREAM_MAX_COMMAND_BYTES = 1024;
var AGENT_RUN_STREAM_MAX_JSON_BYTES = AGENT_GOVERNANCE_MAX_RESPONSE_BYTES + AGENT_THREAD_ENTRIES_MAX_RESPONSE_BYTES + AGENT_COLLABORATION_MAX_RESPONSE_BYTES + AGENT_MAX_RESPONSE_BYTES + 8192;
var AGENT_RUN_FAILURE_CODES = [
  "execution_not_authorized",
  "execution_failed",
  "execution_storage_failed",
  "execution_limit_exceeded",
  "context_limit_exceeded",
  "configuration_changed",
  "tool_capability_missing",
  "tool_target_denied",
  "tool_app_disabled",
  "tool_capability_undeclared",
  "tool_not_authorized",
  "tool_timeout",
  "tool_machine_busy",
  "tool_machine_blocked",
  "tool_invalid_input",
  "tool_target_unavailable",
  "tool_resource_not_found",
  "tool_remote_permission_denied",
  "tool_host_untrusted",
  "tool_command_failed",
  "tool_limit_exceeded",
  "tool_state_changed",
  "tool_approval_expired",
  "tool_failed",
  "tool_result_unconfirmed",
  "model_auth_failed",
  "model_rate_limited",
  "model_request_rejected",
  "model_not_found",
  "model_service_unavailable",
  "model_output_limit",
  "model_content_filtered",
  "model_response_too_large",
  "model_cleanup_failed",
  "model_timeout",
  "model_response_invalid",
  "model_dns_failed",
  "model_tls_failed",
  "model_response_empty",
  "model_stream_truncated",
  "model_network_failed",
  "model_failed"
];
var AGENT_RESOURCE_SESSION_STATES = ["idle", "busy", "closing", "cleanup_failed"];

// ../shared/dist/agent/plugins/ui-events-codec.js
function boolean2(input) {
  if (typeof input !== "boolean") {
    throw new InvalidAgentPayload();
  }
  return input;
}
function text(input) {
  if (input === "") {
    return "";
  }
  return agentText(input, AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
}
function ids(input) {
  if (!Array.isArray(input)) {
    throw new InvalidAgentPayload();
  }
  const result = input.map((id2) => agentInteger(id2, 1));
  if (new Set(result).size !== result.length) {
    throw new InvalidAgentPayload();
  }
  return result;
}
function task(input) {
  if (input === null) {
    return null;
  }
  const row = agentRecord(input, ["runId", "threadTitle", "locallyStarted", "status", "preview", "blocked", "failureMessage", "failureKey"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  const status = AGENT_RUN_STATUSES.find((value) => value === row.status);
  if (status === void 0) {
    throw new InvalidAgentPayload();
  }
  return {
    runId: readAgentId(row.runId),
    threadTitle: text(row.threadTitle),
    locallyStarted: boolean2(row.locallyStarted),
    status,
    preview: text(row.preview),
    blocked: boolean2(row.blocked),
    failureMessage: text(row.failureMessage),
    failureKey: text(row.failureKey)
  };
}
function readAgentPluginUiCheckpoint(input) {
  const row = agentRecord(input, ["version", "valueJson"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  return { version: agentInteger(row.version, 1), valueJson: text(row.valueJson) };
}
function selectionKeys(input) {
  if (!Array.isArray(input)) {
    throw new InvalidAgentPayload();
  }
  const keys = input.map(readAgentId);
  if (new Set(keys).size !== keys.length) {
    throw new InvalidAgentPayload();
  }
  return keys;
}
function anchor(input) {
  const r = agentRecord(input, ["left", "top", "width", "height"]);
  const coordinate = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new InvalidAgentPayload();
    }
    return value;
  };
  const width = coordinate(r.width);
  const height = coordinate(r.height);
  if (width < 0 || height < 0) {
    throw new InvalidAgentPayload();
  }
  return { left: coordinate(r.left), top: coordinate(r.top), width, height };
}
function selection(input) {
  const r = agentRecord(input, ["key", "id", "name", "version", "sha256", "mediaType", "sizeBytes"]);
  if (typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(r.sha256) || typeof r.mediaType !== "string" || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(r.mediaType)) {
    throw new InvalidAgentPayload();
  }
  return {
    key: readAgentId(r.key),
    id: readAgentId(r.id),
    name: text(r.name),
    version: agentInteger(r.version, 1),
    sha256: r.sha256,
    mediaType: r.mediaType,
    sizeBytes: agentInteger(r.sizeBytes)
  };
}
function readAgentPluginUiHostInput(input) {
  const type = agentRecord(input, Object.keys(input !== null && typeof input === "object" ? input : {}), AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES).kind;
  switch (type) {
    case "checkpoint.save": {
      const r = agentRecord(input, ["kind", "checkpoint"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
      return { kind: type, checkpoint: readAgentPluginUiCheckpoint(r.checkpoint) };
    }
    case "targets.remember": {
      const r = agentRecord(input, ["kind", "ids"]);
      return { kind: type, ids: ids(r.ids) };
    }
    case "feedback.notify": {
      const r = agentRecord(input, ["kind", "tone", "message", "duration"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
      if (r.tone !== "success" && r.tone !== "error" && r.tone !== "warning" && r.tone !== "info") {
        throw new InvalidAgentPayload();
      }
      return {
        kind: type,
        tone: r.tone,
        message: text(r.message),
        duration: r.duration === null ? null : agentInteger(r.duration)
      };
    }
    case "feedback.confirm": {
      const r = agentRecord(input, ["kind", "title", "message", "confirmText", "cancelText", "destructive"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
      return {
        kind: type,
        title: text(r.title),
        message: text(r.message),
        confirmText: text(r.confirmText),
        cancelText: text(r.cancelText),
        destructive: boolean2(r.destructive)
      };
    }
    case "resources.close": {
      const r = agentRecord(input, ["kind", "target"]);
      const raw = agentRecord(r.target, Object.keys(r.target !== null && typeof r.target === "object" ? r.target : {}));
      if (raw.kind === "app") {
        agentRecord(raw, ["kind"]);
        return { kind: type, target: { kind: "app" } };
      }
      const target = agentRecord(raw, ["kind", "runId", "sessionId"]);
      if (target.kind !== "session") {
        throw new InvalidAgentPayload();
      }
      return {
        kind: type,
        target: { kind: "session", runId: readAgentId(target.runId), sessionId: readAgentId(target.sessionId) }
      };
    }
    case "task.update": {
      const r = agentRecord(input, ["kind", "task"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
      return { kind: type, task: task(r.task) };
    }
    case "window.open": {
      agentRecord(input, ["kind"]);
      return { kind: type };
    }
    case "artifact.selection.open": {
      const r = agentRecord(input, ["kind", "anchor", "keys"]);
      return { kind: type, anchor: anchor(r.anchor), keys: selectionKeys(r.keys) };
    }
    case "artifact.selection.read": {
      const r = agentRecord(input, ["kind", "keys"]);
      return { kind: type, keys: selectionKeys(r.keys) };
    }
    case "artifact.selection.attach": {
      const r = agentRecord(input, ["kind", "key", "threadId"]);
      return { kind: type, key: readAgentId(r.key), threadId: readAgentId(r.threadId) };
    }
    case "artifact.upload": {
      const r = agentRecord(input, ["kind", "artifactId", "expectedVersion"]);
      return {
        kind: type,
        artifactId: readAgentId(r.artifactId),
        expectedVersion: agentInteger(r.expectedVersion, 1)
      };
    }
    case "artifact.download": {
      const r = agentRecord(input, ["kind", "artifactId"]);
      return { kind: type, artifactId: readAgentId(r.artifactId) };
    }
    default:
      throw new InvalidAgentPayload();
  }
}
function readAgentPluginUiEnvironment(input) {
  const r = agentRecord(input, [
    "appId",
    "appVersion",
    "checkpoint",
    "active",
    "minimized",
    "compact",
    "executionEnabled",
    "resumeRevision",
    "locale",
    "dark",
    "themeVariables",
    "imagePreviewMaxMiB",
    "targets",
    "preferredTargetIds"
  ], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (!Array.isArray(r.themeVariables) || !Array.isArray(r.targets) || typeof r.imagePreviewMaxMiB !== "number" || !Number.isSafeInteger(r.imagePreviewMaxMiB) || r.imagePreviewMaxMiB < 0) {
    throw new InvalidAgentPayload();
  }
  const targetIds = r.targets.map((input2) => agentInteger(agentRecord(input2, ["id", "name", "host", "username"]).id, 1));
  if (new Set(targetIds).size !== targetIds.length) {
    throw new InvalidAgentPayload();
  }
  return {
    appId: readAgentId(r.appId),
    appVersion: agentInteger(r.appVersion, 1),
    checkpoint: r.checkpoint === null ? null : readAgentPluginUiCheckpoint(r.checkpoint),
    active: boolean2(r.active),
    minimized: boolean2(r.minimized),
    compact: boolean2(r.compact),
    executionEnabled: boolean2(r.executionEnabled),
    resumeRevision: agentInteger(r.resumeRevision),
    locale: agentText(r.locale, AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES),
    dark: boolean2(r.dark),
    imagePreviewMaxMiB: r.imagePreviewMaxMiB,
    themeVariables: r.themeVariables.map((input2) => {
      const t = agentRecord(input2, ["name", "value"]);
      if (typeof t.name !== "string" || !/^--[a-zA-Z][a-zA-Z0-9-]*$/u.test(t.name)) {
        throw new InvalidAgentPayload();
      }
      return { name: t.name, value: text(t.value) };
    }),
    targets: r.targets.map((input2) => {
      const t = agentRecord(input2, ["id", "name", "host", "username"]);
      return { id: agentInteger(t.id, 1), name: text(t.name), host: text(t.host), username: text(t.username) };
    }),
    preferredTargetIds: ids(r.preferredTargetIds)
  };
}
function readAgentPluginUiHostResult(input, request, appId) {
  const r = agentRecord(input, Object.keys(input !== null && typeof input === "object" ? input : {}), AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (r.kind !== request.kind) {
    throw new InvalidAgentPayload();
  }
  if (request.kind === "feedback.confirm") {
    agentRecord(r, ["kind", "confirmed"]);
    return { kind: request.kind, confirmed: boolean2(r.confirmed) };
  }
  if (request.kind === "resources.close") {
    agentRecord(r, ["kind", "closed"]);
    return { kind: request.kind, closed: boolean2(r.closed) };
  }
  if (request.kind === "artifact.selection.open" || request.kind === "artifact.selection.read") {
    agentRecord(r, ["kind", "selections"]);
    if (!Array.isArray(r.selections)) {
      throw new InvalidAgentPayload();
    }
    const selections = r.selections.map(selection);
    if (new Set(selections.map((item) => item.key)).size !== selections.length) {
      throw new InvalidAgentPayload();
    }
    if (request.kind === "artifact.selection.read" && (selections.length !== request.keys.length || selections.some((item, index) => item.key !== request.keys[index]))) {
      throw new InvalidAgentPayload();
    }
    return { kind: request.kind, selections };
  }
  if (request.kind === "artifact.selection.attach") {
    agentRecord(r, ["kind", "selection"]);
    const item = selection(r.selection);
    if (item.key !== request.key) {
      throw new InvalidAgentPayload();
    }
    return { kind: request.kind, selection: item };
  }
  if (request.kind === "artifact.upload") {
    agentRecord(r, ["kind", "result"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
    const result = readAgentArtifactResponse(r.result);
    if (result.artifact.id !== request.artifactId || result.artifact.appId !== appId || result.artifact.version <= request.expectedVersion || result.artifact.status !== "ready") {
      throw new InvalidAgentPayload();
    }
    return { kind: request.kind, result };
  }
  agentRecord(r, ["kind", "accepted"]);
  if (r.accepted !== true) {
    throw new InvalidAgentPayload();
  }
  return { kind: request.kind, accepted: true };
}
function readAgentPluginUiHostFailure(input) {
  const r = agentRecord(input, ["code", "outcome"]);
  const code = r.code === "request_failed" || r.code === "protocol_failure" || r.code === "cancelled" ? r.code : AGENT_HTTP_ERROR_CODES.find((value) => value === r.code);
  if (code === void 0 || r.outcome !== "not_dispatched" && r.outcome !== "confirmed" && r.outcome !== "unknown") {
    throw new InvalidAgentPayload();
  }
  return { code, outcome: r.outcome };
}

// ../shared/dist/agent/scope/http-codec.js
function readDefinitionId(input) {
  const id2 = agentText(input, AGENT_APP_MAX_DEFINITION_ID_BYTES);
  if (!AGENT_APP_DEFINITION_ID_PATTERN.test(id2)) {
    throw new InvalidAgentPayload();
  }
  return id2;
}
function readCapabilities(input) {
  if (!Array.isArray(input) || input.length > AGENT_CAPABILITIES.length || new Set(input).size !== input.length) {
    throw new InvalidAgentPayload();
  }
  return input.map((value) => {
    const capability2 = AGENT_CAPABILITIES.find((item) => item === value);
    if (capability2 === void 0) {
      throw new InvalidAgentPayload();
    }
    return capability2;
  });
}
function readAgentAppDefinitionListResponse(input) {
  encodeAgentJson(input, AGENT_APP_MAX_RESPONSE_BYTES);
  if (!Array.isArray(input)) {
    throw new InvalidAgentPayload();
  }
  const result = input.map((value) => {
    const row = agentRecord(value, ["id", "version", "displayName", "capabilities"]);
    return {
      id: readDefinitionId(row.id),
      version: agentText(row.version, AGENT_APP_MAX_DEFINITION_VERSION_BYTES),
      displayName: agentText(row.displayName, AGENT_SCOPE_MAX_NAME_BYTES),
      capabilities: readCapabilities(row.capabilities)
    };
  });
  if (new Set(result.map((definition) => definition.id)).size !== result.length) {
    throw new InvalidAgentPayload();
  }
  return result;
}
function readAgentCreateThreadResponse(input) {
  const row = agentRecord(input, ["id", "appId", "title", "version", "createdAt", "updatedAt"]);
  const createdAt = agentInteger(row.createdAt);
  return {
    id: readAgentId(row.id),
    appId: readAgentId(row.appId),
    title: agentText(row.title, AGENT_SCOPE_MAX_NAME_BYTES),
    version: agentInteger(row.version, 1),
    createdAt,
    updatedAt: agentInteger(row.updatedAt, createdAt)
  };
}
function readAgentThreadEntryCursor(input) {
  const row = agentRecord(input, ["runSequence", "messageOrdinal", "chunkIndex", "textOffset"]);
  const value = {
    runSequence: agentInteger(row.runSequence, 0, Number.MAX_SAFE_INTEGER - 1),
    messageOrdinal: agentInteger(row.messageOrdinal, 0, Number.MAX_SAFE_INTEGER - 1),
    chunkIndex: agentInteger(row.chunkIndex, 0, Number.MAX_SAFE_INTEGER - 1),
    textOffset: agentInteger(row.textOffset, 0, Number.MAX_SAFE_INTEGER - 1)
  };
  if (value.runSequence === 0 && (value.messageOrdinal !== 0 || value.chunkIndex !== 0 || value.textOffset !== 0) || value.messageOrdinal === 0 !== (value.chunkIndex === 0)) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function compareEntry(a, b) {
  return a.runSequence - b.runSequence || a.messageOrdinal - b.messageOrdinal || a.chunkIndex - b.chunkIndex;
}
function readAgentThreadEntries(input, threadId, after, limit) {
  const row = agentRecord(input, ["appId", "threadId", "items", "nextCursor"], AGENT_THREAD_ENTRIES_MAX_RESPONSE_BYTES);
  if (row.threadId !== threadId || !Array.isArray(row.items) || row.items.length > limit || limit > AGENT_THREAD_ENTRY_MAX_PAGE) {
    throw new InvalidAgentPayload();
  }
  let previous = after;
  const items = row.items.map((raw) => {
    const p = agentRecord(raw, ["runId", "operationSequence", "role", "position", "text"], AGENT_THREAD_ENTRIES_MAX_RESPONSE_BYTES);
    const position = readAgentThreadEntryCursor(p.position);
    if (typeof p.text !== "string" || new TextEncoder().encode(p.text).byteLength > AGENT_THREAD_ENTRY_MAX_TEXT_BYTES || /[\uD800-\uDFFF]/u.test(p.text)) {
      throw new InvalidAgentPayload();
    }
    const text4 = p.text;
    const points = Array.from(text4).length;
    const order = compareEntry(position, previous);
    if (p.role !== "user" && p.role !== "assistant" || !points || points > AGENT_THREAD_ENTRY_MAX_TEXT_CODE_POINTS || p.role === "user" !== (position.messageOrdinal === 0) || !position.runSequence || order < 0 || position.textOffset !== (order === 0 ? previous.textOffset : 0) + points) {
      throw new InvalidAgentPayload();
    }
    previous = position;
    return {
      runId: readAgentId(p.runId),
      operationSequence: agentInteger(p.operationSequence),
      role: p.role,
      position,
      text: text4
    };
  });
  const nextCursor = readAgentThreadEntryCursor(row.nextCursor);
  if (compareEntry(nextCursor, previous) !== 0 || nextCursor.textOffset !== previous.textOffset) {
    throw new InvalidAgentPayload();
  }
  return { appId: readAgentId(row.appId), threadId, items, nextCursor };
}
function readAgentThreadEntryHistory(input, threadId, before, limit) {
  const row = agentRecord(input, ["body", "startCursor", "hasEarlier"], AGENT_THREAD_ENTRIES_MAX_RESPONSE_BYTES);
  const startCursor = readAgentThreadEntryCursor(row.startCursor);
  const body = readAgentThreadEntries(row.body, threadId, startCursor, limit);
  if (typeof row.hasEarlier !== "boolean" || !body.items.length && row.hasEarlier || body.items.length > 0 && startCursor.textOffset > 0 && !row.hasEarlier) {
    throw new InvalidAgentPayload();
  }
  const first = body.items[0];
  if (first && (compareEntry(first.position, startCursor) !== 0 || first.position.textOffset - Array.from(first.text).length !== startCursor.textOffset)) {
    throw new InvalidAgentPayload();
  }
  if (before) {
    const order = compareEntry(body.nextCursor, before) || body.nextCursor.textOffset - before.textOffset;
    if (order > 0 || before.textOffset > 0 && order !== 0) {
      throw new InvalidAgentPayload();
    }
  }
  if (!body.items.length) {
    const expected = before ?? { runSequence: 0, messageOrdinal: 0, chunkIndex: 0, textOffset: 0 };
    if (compareEntry(startCursor, expected) !== 0 || startCursor.textOffset !== expected.textOffset) {
      throw new InvalidAgentPayload();
    }
  }
  return { body, startCursor, hasEarlier: row.hasEarlier };
}

// ../shared/dist/remote/files/text-codec.js
function isWellFormedFileText(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) {
        return false;
      }
      index += 1;
      continue;
    }
    if (code >= 56320 && code <= 57343) {
      return false;
    }
  }
  return true;
}

// ../shared/dist/agent/plugins/content.js
var AGENT_PLUGIN_CONTENT_CHUNK_BYTES = 64 * 1024;
function readAgentPluginContentReference(input) {
  const row = agentRecord(input, ["id", "sha256", "sizeBytes", "mediaType"]);
  if (typeof row.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(row.sha256) || typeof row.mediaType !== "string" || !row.mediaType.trim() || row.mediaType.includes("\0")) {
    throw new InvalidAgentPayload();
  }
  return {
    id: readAgentId(row.id),
    sha256: row.sha256,
    sizeBytes: agentInteger(row.sizeBytes),
    mediaType: row.mediaType
  };
}
function readAgentPluginContentPage(input) {
  const row = agentRecord(input, ["reference", "index", "text", "nextIndex"], AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES);
  if (typeof row.text !== "string" || !isWellFormedFileText(row.text) || new TextEncoder().encode(row.text).byteLength > AGENT_PLUGIN_CONTENT_CHUNK_BYTES) {
    throw new InvalidAgentPayload();
  }
  const index = agentInteger(row.index);
  const nextIndex = row.nextIndex === null ? null : agentInteger(row.nextIndex, index + 1, index + 1);
  return { reference: readAgentPluginContentReference(row.reference), index, text: row.text, nextIndex };
}

// ../shared/dist/agent/runs/http-codec.js
function invalidRunInput() {
  throw new InvalidAgentPayload();
}
function readAgentResumeRunRequest(input) {
  const row = agentRecord(input, ["expectedVersion", "inputJson"], AGENT_RUN_MAX_JSON_BODY_BYTES);
  if (typeof row.inputJson !== "string") {
    throw new InvalidAgentPayload();
  }
  try {
    JSON.parse(row.inputJson);
  } catch {
    throw new InvalidAgentPayload();
  }
  return {
    expectedVersion: agentInteger(row.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 2),
    inputJson: row.inputJson
  };
}
function readAgentResumeRunResponse(input) {
  if (!isAgentRecord(input)) {
    throw new InvalidAgentPayload();
  }
  const row = agentRecord(input, input.status === "replayed" ? ["status", "originalStatus", "run"] : ["status", "run"]);
  const run = readAgentRunResponse(row.run);
  if (run.status !== "pending" || run.version < 2) {
    throw new InvalidAgentPayload();
  }
  if (row.status === "resumed") {
    return { status: "resumed", run };
  }
  if (row.status !== "replayed" || row.originalStatus !== "resumed") {
    throw new InvalidAgentPayload();
  }
  return { status: "replayed", originalStatus: "resumed", run };
}
function readAgentRunSuspension(input) {
  const row = agentRecord(input, ["runId", "runVersion", "checkpointVersion", "inputRequest", "suspendedAt"]);
  return {
    runId: readAgentId(row.runId),
    runVersion: agentInteger(row.runVersion, 1),
    checkpointVersion: agentInteger(row.checkpointVersion, 1),
    inputRequest: readAgentPluginContentReference(row.inputRequest),
    suspendedAt: agentInteger(row.suspendedAt)
  };
}
function readAgentCreateRunRequest(input) {
  const fields = agentRecord(input, ["prompt", "inputJson", "connectionIds", "approvalMode"], AGENT_RUN_MAX_JSON_BODY_BYTES);
  if (!Array.isArray(fields.connectionIds)) {
    throw new InvalidAgentPayload();
  }
  const approvalMode = AGENT_APPROVAL_MODES.find((mode) => mode === fields.approvalMode);
  if (!approvalMode) {
    throw new InvalidAgentPayload();
  }
  const connectionIds = fields.connectionIds.map((id2) => agentInteger(id2, 1));
  if (new Set(connectionIds).size !== connectionIds.length) {
    throw new InvalidAgentPayload();
  }
  if (typeof fields.inputJson !== "string") {
    throw new InvalidAgentPayload();
  }
  try {
    JSON.parse(fields.inputJson);
  } catch {
    throw new InvalidAgentPayload();
  }
  return {
    approvalMode,
    prompt: typeof fields.prompt === "string" && new TextEncoder().encode(fields.prompt).byteLength <= AGENT_RUN_MAX_PROMPT_BYTES ? fields.prompt : invalidRunInput(),
    connectionIds,
    inputJson: fields.inputJson
  };
}
function readRunFailure(input) {
  if (input === null) {
    return null;
  }
  const row = agentRecord(input, ["code", "toolName"]);
  const code = AGENT_RUN_FAILURE_CODES.find((value) => value === row.code);
  if (!code) {
    throw new InvalidAgentPayload();
  }
  const toolName = row.toolName === null ? null : agentText(row.toolName, 128);
  if (code.startsWith("tool_") && toolName === null) {
    throw new InvalidAgentPayload();
  }
  return { code, toolName };
}
function readAgentRunResponse(input) {
  const row = agentRecord(input, [
    "id",
    "appId",
    "threadId",
    "status",
    "failure",
    "approvalMode",
    "version",
    "createdAt",
    "updatedAt"
  ]);
  if (row.status !== "pending" && row.status !== "running" && row.status !== "suspended" && row.status !== "completed" && row.status !== "failed" && row.status !== "unknown" && row.status !== "cancelled") {
    throw new InvalidAgentPayload();
  }
  const approvalMode = AGENT_APPROVAL_MODES.find((mode) => mode === row.approvalMode);
  if (!approvalMode) {
    throw new InvalidAgentPayload();
  }
  const failure2 = readRunFailure(row.failure);
  if (failure2 !== null && row.status !== "failed" && row.status !== "unknown") {
    throw new InvalidAgentPayload();
  }
  return {
    id: readAgentId(row.id),
    appId: readAgentId(row.appId),
    threadId: readAgentId(row.threadId),
    approvalMode,
    status: row.status,
    failure: failure2,
    version: agentInteger(row.version, 1),
    createdAt: agentInteger(row.createdAt),
    updatedAt: agentInteger(row.updatedAt)
  };
}
function readAgentRunEvent(input) {
  const row = agentRecord(input, ["runId", "sequence", "type", "runVersion", "createdAt"]);
  if (row.type !== "run.created" && row.type !== "run.started" && row.type !== "run.suspended" && row.type !== "run.resumed" && row.type !== "run.completed" && row.type !== "run.failed" && row.type !== "run.unknown" && row.type !== "run.cancelled") {
    throw new InvalidAgentPayload();
  }
  return {
    runId: readAgentId(row.runId),
    sequence: agentInteger(row.sequence, 1),
    type: row.type,
    runVersion: agentInteger(row.runVersion, 1),
    createdAt: agentInteger(row.createdAt)
  };
}
function commandResult(input) {
  if (input !== null && typeof input === "object" && "status" in input && input.status === "replayed") {
    return agentRecord(input, ["status", "originalStatus", "run"]);
  }
  return agentRecord(input, ["status", "run"]);
}
function readAgentCreateRunResponse(input) {
  const row = commandResult(input);
  const run = readAgentRunResponse(row.run);
  if (row.status === "created") {
    return { status: "created", run };
  }
  if (row.status === "replayed" && row.originalStatus === "created") {
    return { status: "replayed", originalStatus: "created", run };
  }
  throw new InvalidAgentPayload();
}
function readAgentCancelRunResponse(input) {
  const row = commandResult(input);
  const run = readAgentRunResponse(row.run);
  if (row.status === "cancelled" || row.status === "already_cancelled") {
    return { status: row.status, run };
  }
  if (row.status === "replayed" && (row.originalStatus === "cancelled" || row.originalStatus === "already_cancelled")) {
    return { status: "replayed", originalStatus: row.originalStatus, run };
  }
  throw new InvalidAgentPayload();
}
function readAgentRunEventsResponse(input) {
  const row = agentRecord(input, ["items", "nextCursor"]);
  if (!Array.isArray(row.items) || row.items.length > AGENT_RUN_EVENT_MAX_LIMIT) {
    throw new InvalidAgentPayload();
  }
  const items = row.items.map(readAgentRunEvent);
  const nextCursor = agentInteger(row.nextCursor);
  for (let index = 0; index < items.length; index++) {
    if (index > 0 && (items[index].runId !== items[0].runId || items[index].sequence <= items[index - 1].sequence)) {
      throw new InvalidAgentPayload();
    }
  }
  if (items.length > 0 && nextCursor !== items[items.length - 1].sequence) {
    throw new InvalidAgentPayload();
  }
  return { items, nextCursor };
}
function readAgentRunUsageResponse(input) {
  const row = agentRecord(input, [
    "runId",
    "runVersion",
    "inputTokens",
    "outputTokens",
    "reportedModelRequests",
    "modelRequests",
    "toolExecutions"
  ]);
  const modelRequests = agentInteger(row.modelRequests, 0);
  const reportedModelRequests = agentInteger(row.reportedModelRequests, 0, modelRequests);
  const inputTokens = row.inputTokens === null ? null : agentInteger(row.inputTokens, 0);
  const outputTokens = row.outputTokens === null ? null : agentInteger(row.outputTokens, 0);
  if (inputTokens === null !== (outputTokens === null) || reportedModelRequests === 0 !== (inputTokens === null) || inputTokens !== null && outputTokens !== null && !Number.isSafeInteger(inputTokens + outputTokens)) {
    throw new InvalidAgentPayload();
  }
  return {
    runId: readAgentId(row.runId),
    runVersion: agentInteger(row.runVersion, 1),
    inputTokens,
    outputTokens,
    reportedModelRequests,
    modelRequests,
    toolExecutions: agentInteger(row.toolExecutions, 0)
  };
}
function readAgentResourceSession(input) {
  const row = agentRecord(input, [
    "id",
    "runId",
    "state",
    "openedAt",
    "sshConnections",
    "sftpChannels",
    "protocolSessions",
    "browserSessions",
    "activeOperations",
    "backgroundJobs",
    "waitingOutputJobs",
    "targetIds",
    "expiresAt"
  ]);
  const state2 = AGENT_RESOURCE_SESSION_STATES.find((state3) => state3 === row.state);
  if (!state2 || !Array.isArray(row.targetIds)) {
    throw new InvalidAgentPayload();
  }
  const targetIds = row.targetIds.map((id2) => agentInteger(id2, 1));
  if (new Set(targetIds).size !== targetIds.length) {
    throw new InvalidAgentPayload();
  }
  const openedAt = agentInteger(row.openedAt);
  return {
    id: readAgentId(row.id),
    runId: readAgentId(row.runId),
    state: state2,
    openedAt,
    sshConnections: agentInteger(row.sshConnections),
    sftpChannels: agentInteger(row.sftpChannels),
    protocolSessions: agentInteger(row.protocolSessions),
    browserSessions: agentInteger(row.browserSessions),
    activeOperations: agentInteger(row.activeOperations),
    backgroundJobs: agentInteger(row.backgroundJobs),
    waitingOutputJobs: agentInteger(row.waitingOutputJobs),
    targetIds,
    expiresAt: row.expiresAt === null ? null : agentInteger(row.expiresAt, openedAt)
  };
}

// ../shared/dist/agent/governance/http-codec.js
function record(input, keys, required2 = keys) {
  if (!isAgentRecord(input) || Object.keys(input).some((key) => !keys.includes(key)) || required2.some((key) => !Object.hasOwn(input, key))) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function readAgentApprovalResolveRequest(value) {
  encodeAgentJson(value, AGENT_GOVERNANCE_MAX_BODY_BYTES);
  const row = record(value, ["decision", "operationHash", "expectedVersion", "feedback"], ["decision", "operationHash", "expectedVersion"]);
  const decision = AGENT_APPROVAL_DECISIONS.find((item) => item === row.decision);
  if (decision === void 0) {
    throw new InvalidAgentPayload();
  }
  const hash5 = agentText(row.operationHash, AGENT_APPROVAL_OPERATION_HASH_LENGTH);
  if (!AGENT_APPROVAL_OPERATION_HASH_PATTERN.test(hash5)) {
    throw new InvalidAgentPayload();
  }
  const feedback = Object.hasOwn(row, "feedback") ? agentText(row.feedback, AGENT_APPROVAL_MAX_FEEDBACK_BYTES) : void 0;
  const result = {
    decision,
    operationHash: hash5,
    expectedVersion: agentInteger(row.expectedVersion, 1)
  };
  if (feedback !== void 0) {
    result.feedback = feedback;
  }
  return result;
}
function capability(raw) {
  const result = AGENT_CAPABILITIES.find((v) => v === raw);
  if (result === void 0) {
    throw new InvalidAgentPayload();
  }
  return result;
}
function readAgentApprovalView(value) {
  const row = agentRecord(value, [
    "id",
    "sequence",
    "appId",
    "runId",
    "operationId",
    "parentOperationId",
    "operationHash",
    "status",
    "policyRevision",
    "version",
    "capability",
    "operationName",
    "risk",
    "summary",
    "targetId",
    "requestedAt",
    "expiresAt",
    "decidedAt",
    "decidedByUserId",
    "consumedAt"
  ], AGENT_GOVERNANCE_MAX_RESPONSE_BYTES);
  const status = AGENT_APPROVAL_STATUSES.find((item) => item === row.status);
  const risk = AGENT_APPROVAL_RISKS.find((item) => item === row.risk);
  if (!status || !risk || typeof row.operationHash !== "string" || !AGENT_APPROVAL_OPERATION_HASH_PATTERN.test(row.operationHash)) {
    throw new InvalidAgentPayload();
  }
  const result = {
    id: readAgentId(row.id),
    sequence: agentInteger(row.sequence, 1),
    appId: readAgentId(row.appId),
    runId: readAgentId(row.runId),
    operationId: readAgentId(row.operationId),
    parentOperationId: row.parentOperationId === null ? null : readAgentId(row.parentOperationId),
    operationHash: row.operationHash,
    status,
    policyRevision: agentInteger(row.policyRevision, 1),
    version: agentInteger(row.version, 1),
    capability: capability(row.capability),
    operationName: agentText(row.operationName, AGENT_APPROVAL_MAX_TOOL_NAME_BYTES),
    risk,
    summary: agentText(row.summary, AGENT_APPROVAL_MAX_SUMMARY_BYTES),
    targetId: row.targetId === null ? null : agentInteger(row.targetId, 1),
    requestedAt: agentInteger(row.requestedAt),
    expiresAt: agentInteger(row.expiresAt),
    decidedAt: row.decidedAt === null ? null : agentInteger(row.decidedAt),
    decidedByUserId: row.decidedByUserId === null ? null : agentInteger(row.decidedByUserId, 1),
    consumedAt: row.consumedAt === null ? null : agentInteger(row.consumedAt)
  };
  const decided = result.status === "approved" || result.status === "denied";
  if (result.expiresAt <= result.requestedAt || decided && result.decidedAt === null || result.status === "requested" && (result.decidedAt !== null || result.decidedByUserId !== null) || result.decidedByUserId !== null && result.decidedAt === null || result.decidedAt !== null && (result.decidedAt < result.requestedAt || result.decidedAt >= result.expiresAt) || result.consumedAt !== null && (result.status !== "approved" || result.decidedAt === null || result.consumedAt < result.decidedAt || result.consumedAt >= result.expiresAt)) {
    throw new InvalidAgentPayload();
  }
  return result;
}
function readAgentApprovalAfter(value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function readAgentApprovalPage(value, after) {
  const row = agentRecord(value, ["items", "after", "nextCursor", "hasMore"], AGENT_GOVERNANCE_MAX_RESPONSE_BYTES);
  if (!Array.isArray(row.items) || row.items.length > AGENT_APPROVAL_MAX_PAGE_ITEMS || row.after !== after || typeof row.hasMore !== "boolean") {
    throw new InvalidAgentPayload();
  }
  const items = row.items.map(readAgentApprovalView);
  let previous = after === null ? 0 : Number(after);
  for (const item of items) {
    if (item.sequence <= previous) {
      throw new InvalidAgentPayload();
    }
    previous = item.sequence;
  }
  const nextCursor = readAgentApprovalAfter(row.nextCursor);
  if (nextCursor !== (items.length ? String(previous) : after) || row.hasMore && items.length !== AGENT_APPROVAL_MAX_PAGE_ITEMS) {
    throw new InvalidAgentPayload();
  }
  return { items, after, nextCursor, hasMore: row.hasMore };
}

// ../shared/dist/agent/collaboration/http-codec.js
function readAgentChildrenResponse(input) {
  const row = agentRecord(input, ["items"], AGENT_COLLABORATION_MAX_RESPONSE_BYTES);
  if (!Array.isArray(row.items)) {
    throw new InvalidAgentPayload();
  }
  const items = row.items.map((input2) => {
    const child2 = agentRecord(input2, ["id", "parentId", "status", "version", "profile", "deadlineAt"]);
    const profile = AGENT_CHILD_PROFILES.find((value) => value === child2.profile);
    const status = AGENT_RUN_STATUSES.find((value) => value === child2.status);
    if (!status || !profile) {
      throw new InvalidAgentPayload();
    }
    return {
      id: readAgentId(child2.id),
      parentId: readAgentId(child2.parentId),
      status,
      version: agentInteger(child2.version, 1),
      profile,
      deadlineAt: agentInteger(child2.deadlineAt, 1)
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => item.id === item.parentId || item.parentId !== items[0].parentId)) {
    throw new InvalidAgentPayload();
  }
  return { items };
}
function readAgentMessageMetadataResponse(input) {
  const row = agentRecord(input, ["items", "nextCursor"], AGENT_COLLABORATION_MAX_RESPONSE_BYTES);
  if (!Array.isArray(row.items) || row.items.length > AGENT_COLLABORATION_MESSAGE_MAX_PAGE) {
    throw new InvalidAgentPayload();
  }
  const items = row.items.map((input2) => {
    const item = agentRecord(input2, ["sequence", "senderId", "bodyBytes", "expiresAt"]);
    return {
      sequence: agentInteger(item.sequence, 1),
      senderId: readAgentId(item.senderId),
      bodyBytes: agentInteger(item.bodyBytes, 0, AGENT_MESSAGE_METADATA_MAX_BODY_BYTES),
      expiresAt: agentInteger(item.expiresAt, 1)
    };
  });
  const nextCursor = agentInteger(row.nextCursor);
  if (items.some((item, index) => index > 0 && item.sequence <= items[index - 1].sequence) || items.length > 0 && nextCursor !== items[items.length - 1].sequence) {
    throw new InvalidAgentPayload();
  }
  return { items, nextCursor };
}

// ../shared/dist/agent/runs/events.js
function readAgentRunStreamCursor(input) {
  const cursor2 = agentRecord(input, ["threadId", "entries", "events", "approvals"], AGENT_RUN_STREAM_MAX_COMMAND_BYTES);
  return {
    threadId: readAgentId(cursor2.threadId),
    entries: readAgentThreadEntryCursor(cursor2.entries),
    events: agentInteger(cursor2.events),
    approvals: readAgentApprovalAfter(cursor2.approvals)
  };
}
function readAgentRunStreamEvent(input, selected, cursor2) {
  if (input !== null && typeof input === "object" && "type" in input && input.type === "heartbeat") {
    agentRecord(input, ["type"], AGENT_RUN_STREAM_MAX_JSON_BYTES);
    return { type: "heartbeat" };
  }
  const row = agentRecord(input, ["type", "appId", "runId", "revision", "body", "state", "more"], AGENT_RUN_STREAM_MAX_JSON_BYTES);
  if (row.type !== "update" || row.appId !== selected.appId || row.runId !== selected.runId || typeof row.more !== "boolean") {
    throw new InvalidAgentPayload();
  }
  const body = readAgentThreadEntries(row.body, cursor2.threadId, cursor2.entries, AGENT_THREAD_ENTRY_MAX_PAGE);
  if (body.appId !== selected.appId) {
    throw new InvalidAgentPayload();
  }
  let state2 = null;
  if (row.state !== null) {
    const value = agentRecord(row.state, ["thread", "run", "usage", "events", "approvals", "children", "resources"], AGENT_RUN_STREAM_MAX_JSON_BYTES);
    const thread = readAgentCreateThreadResponse(value.thread);
    const run = readAgentRunResponse(value.run);
    const usage = readAgentRunUsageResponse(value.usage);
    const events = readAgentRunEventsResponse(value.events);
    const approvals = readAgentApprovalPage(value.approvals, cursor2.approvals);
    const children = readAgentChildrenResponse(value.children);
    if (thread.id !== cursor2.threadId || thread.appId !== selected.appId || run.id !== selected.runId || run.appId !== selected.appId || run.threadId !== cursor2.threadId || usage.runId !== selected.runId || usage.runVersion < run.version || events.items.length > AGENT_RUN_EVENT_MAX_LIMIT || events.items.some((event) => event.runId !== selected.runId || event.sequence <= cursor2.events || event.runVersion > run.version) || events.items.length === 0 && events.nextCursor !== cursor2.events || approvals.items.some((approval) => approval.appId !== selected.appId || approval.runId !== selected.runId) || children.items.some((child2) => child2.parentId !== selected.runId)) {
      throw new InvalidAgentPayload();
    }
    if (!Array.isArray(value.resources)) {
      throw new InvalidAgentPayload();
    }
    const resources = value.resources.map(readAgentResourceSession);
    if (new Set(resources.map((resource) => resource.id)).size !== resources.length || resources.some((resource) => resource.runId !== selected.runId && !children.items.some((child2) => child2.id === resource.runId))) {
      throw new InvalidAgentPayload();
    }
    state2 = { thread, run, usage, events, approvals, children, resources };
  }
  const more = body.items.length > 0 || state2 !== null && (state2.events.items.length > 0 || state2.approvals.hasMore);
  if (more && !row.more) {
    throw new InvalidAgentPayload();
  }
  return {
    type: "update",
    appId: selected.appId,
    runId: selected.runId,
    revision: agentInteger(row.revision, 1),
    body,
    state: state2,
    more: row.more
  };
}

// ../shared/dist/agent/memory/values.js
var AGENT_MEMORY_STATUSES = ["candidate", "published", "revoked"];
var AGENT_MEMORY_DECISIONS = ["publish", "reject", "revoke"];
var AGENT_MEMORY_MAX_PAGE = 50;
var AGENT_MEMORY_MAX_OFFSET = Number.MAX_SAFE_INTEGER - AGENT_MEMORY_MAX_PAGE;
var AGENT_MEMORY_MAX_BODY_BYTES = 128 * 1024;
var AGENT_MEMORY_MAX_CONTENT_BYTES = AGENT_MEMORY_MAX_BODY_BYTES;
function hasAgentMemoryContentCapacity(content2) {
  return new TextEncoder().encode(JSON.stringify(content2)).byteLength <= AGENT_MEMORY_MAX_BODY_BYTES - 1024;
}
var AGENT_MEMORY_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// ../shared/dist/agent/memory/events.js
function readAgentMemoryInvalidation(input) {
  const row = agentRecord(input, ["type", "epoch", "revision"], AGENT_MEMORY_MAX_RESPONSE_BYTES);
  if (row.type !== "memory-invalidated") {
    throw new InvalidAgentPayload();
  }
  return { type: "memory-invalidated", epoch: readAgentId(row.epoch), revision: agentInteger(row.revision, 1) };
}

// ../shared/dist/agent/plugins/ui-streams-codec.js
function readAgentPluginUiStreamSource(input) {
  const row = agentRecord(input, Object.keys(input !== null && typeof input === "object" ? input : {}));
  if (row.kind === "run") {
    agentRecord(row, ["kind", "runId", "cursor"]);
    return { kind: "run", runId: readAgentId(row.runId), cursor: readAgentRunStreamCursor(row.cursor) };
  }
  if (row.kind !== "memory") {
    throw new InvalidAgentPayload();
  }
  agentRecord(row, ["kind", "threadId"]);
  return { kind: "memory", threadId: row.threadId === null ? null : readAgentId(row.threadId) };
}
function readAgentPluginUiStreamCommand(input) {
  const row = agentRecord(input, Object.keys(input !== null && typeof input === "object" ? input : {}));
  const id2 = readAgentId(row.id);
  if (row.type === "nexus.ui.stream.subscribe") {
    agentRecord(row, ["type", "id", "source"]);
    return { type: row.type, id: id2, source: readAgentPluginUiStreamSource(row.source) };
  }
  if (row.type === "nexus.ui.stream.unsubscribe") {
    agentRecord(row, ["type", "id"]);
    return { type: row.type, id: id2 };
  }
  if (row.type !== "nexus.ui.stream.ack") {
    throw new InvalidAgentPayload();
  }
  agentRecord(row, ["type", "id", "generation", "revision", "delivery"]);
  return {
    type: row.type,
    id: id2,
    generation: agentInteger(row.generation, 1),
    revision: agentInteger(row.revision, 1),
    delivery: agentInteger(row.delivery, 1)
  };
}
function readAgentPluginUiStreamPage(input, source, appId, appVersion) {
  const row = agentRecord(input, ["type", "id", "generation", "revision", "delivery", "value"], AGENT_RUN_STREAM_MAX_JSON_BYTES + 1024);
  if (row.type !== "nexus.ui.stream.page") {
    throw new InvalidAgentPayload();
  }
  const revision = agentInteger(row.revision, 1);
  const value = source.kind === "memory" ? readAgentMemoryInvalidation(row.value) : readAgentRunStreamEvent(row.value, { appId, appVersion, runId: source.runId }, source.cursor);
  if (value.type === "heartbeat" || value.revision !== revision) {
    throw new InvalidAgentPayload();
  }
  return {
    type: row.type,
    id: readAgentId(row.id),
    generation: agentInteger(row.generation, 1),
    revision,
    delivery: agentInteger(row.delivery, 1),
    value
  };
}
function readAgentPluginUiStreamFailure(input) {
  const row = agentRecord(input, ["type", "id", "code"]);
  if (row.type !== "nexus.ui.stream.failure" || row.code !== "forbidden" && row.code !== "resync_required" && row.code !== "unavailable" && row.code !== "protocol_failure") {
    throw new InvalidAgentPayload();
  }
  return { type: row.type, id: readAgentId(row.id), code: row.code };
}

// src/features/agent/plugins/sdk/ui-client.ts
var PluginUiRequestFailure = class extends Error {
  constructor(code, outcome) {
    super(code);
    this.code = code;
    this.outcome = outcome;
    this.name = "PluginUiRequestFailure";
  }
  code;
  outcome;
};
function createPluginUiClient(appId, post) {
  let environment = null;
  let closed = false;
  let readyResolve = () => {
  };
  let readyReject = () => {
  };
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  void ready.catch(() => void 0);
  const pending = /* @__PURE__ */ new Map();
  const streams = /* @__PURE__ */ new Map();
  const environmentListeners = /* @__PURE__ */ new Set();
  const taskListeners = /* @__PURE__ */ new Set();
  const closeListeners = /* @__PURE__ */ new Set();
  const close = () => {
    if (closed) return;
    closed = true;
    const failures = [];
    readyReject(new PluginUiRequestFailure("cancelled", "not_dispatched"));
    for (const owner of pending.values()) {
      owner.release();
      owner.reject(
        new PluginUiRequestFailure(
          "cancelled",
          owner.dispatched ? owner.mutation ? "unknown" : "confirmed" : "not_dispatched"
        )
      );
    }
    pending.clear();
    for (const owner of streams.values()) {
      owner.page = null;
      owner.resolve();
    }
    streams.clear();
    for (const listener of closeListeners) {
      try {
        listener();
      } catch (error) {
        failures.push(error);
      }
    }
    environmentListeners.clear();
    taskListeners.clear();
    closeListeners.clear();
    if (failures.length) throw new AggregateError(failures, "Plugin UI close callbacks failed");
  };
  const apply = (id2, owner) => {
    const page = owner.page;
    if (closed || streams.get(id2) !== owner || !page) return;
    let nextSource = owner.source;
    if (owner.source.kind === "run" && page.value.type === "update") {
      const previous = owner.source.cursor;
      nextSource = {
        kind: "run",
        runId: owner.source.runId,
        cursor: {
          threadId: previous.threadId,
          entries: {
            runSequence: page.value.body.nextCursor.runSequence,
            messageOrdinal: page.value.body.nextCursor.messageOrdinal,
            chunkIndex: page.value.body.nextCursor.chunkIndex,
            textOffset: page.value.body.nextCursor.textOffset
          },
          events: page.value.state?.events.nextCursor ?? previous.events,
          approvals: page.value.state ? page.value.state.approvals.hasMore ? page.value.state.approvals.nextCursor : null : previous.approvals
        }
      };
    }
    if (!owner.consumer.apply(page.value, page.revision)) return;
    if (closed || streams.get(id2) !== owner || owner.page !== page) return;
    owner.source = nextSource;
    owner.page = null;
    post(
      readAgentPluginUiStreamCommand({
        type: "nexus.ui.stream.ack",
        id: id2,
        generation: page.generation,
        revision: page.revision,
        delivery: page.delivery
      })
    );
  };
  const request = (input, signal, file) => {
    if (closed || signal?.aborted) return Promise.reject(new PluginUiRequestFailure("cancelled", "not_dispatched"));
    const normalized = readAgentPluginUiHostInput(input);
    if (file !== void 0 && normalized.kind !== "artifact.upload") throw new InvalidAgentPayload();
    const id2 = crypto.randomUUID();
    encodeAgentJson({ type: "nexus.ui.request", id: id2, input: normalized }, AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
    return new Promise((resolve, reject) => {
      const mutation = normalized.kind !== "artifact.selection.read" && normalized.kind !== "feedback.confirm";
      const abort = () => {
        const owner = pending.get(id2);
        if (!owner) return;
        pending.delete(id2);
        owner.release();
        if (owner.dispatched) {
          try {
            post({ type: "nexus.ui.cancel", id: id2 });
          } catch {
          }
        }
        reject(
          new PluginUiRequestFailure(
            "cancelled",
            owner.dispatched ? owner.mutation ? "unknown" : "confirmed" : "not_dispatched"
          )
        );
      };
      pending.set(id2, {
        input: normalized,
        mutation,
        dispatched: false,
        resolve,
        reject,
        release: () => signal?.removeEventListener("abort", abort)
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      try {
        if (file === void 0) post({ type: "nexus.ui.request", id: id2, input: normalized });
        else post({ type: "nexus.ui.request", id: id2, input: normalized, file });
        const owner = pending.get(id2);
        if (owner) owner.dispatched = true;
      } catch (error) {
        pending.delete(id2);
        signal?.removeEventListener("abort", abort);
        reject(error);
      }
    });
  };
  const subscribe = (consumer) => {
    if (closed || !environment) throw new PluginUiRequestFailure("cancelled", "not_dispatched");
    const source = readAgentPluginUiStreamSource(consumer.source());
    const id2 = crypto.randomUUID();
    let resolve = () => {
    };
    const completed = new Promise((done) => {
      resolve = done;
    });
    const owner = { source, consumer, page: null, generation: 0, revision: 0, delivery: 0, resolve };
    streams.set(id2, owner);
    try {
      post(readAgentPluginUiStreamCommand({ type: "nexus.ui.stream.subscribe", id: id2, source }));
    } catch (error) {
      streams.delete(id2);
      resolve();
      throw error;
    }
    return {
      closed: completed,
      resume() {
        try {
          apply(id2, owner);
        } catch (error) {
          streams.delete(id2);
          owner.page = null;
          try {
            if (!closed) post(readAgentPluginUiStreamCommand({ type: "nexus.ui.stream.unsubscribe", id: id2 }));
          } catch (cleanup) {
            throw new AggregateError([error, cleanup], "Plugin UI application and unsubscribe failed");
          } finally {
            resolve();
          }
          throw error;
        }
      },
      close() {
        if (streams.get(id2) !== owner) return;
        streams.delete(id2);
        owner.page = null;
        try {
          if (!closed) post(readAgentPluginUiStreamCommand({ type: "nexus.ui.stream.unsubscribe", id: id2 }));
        } finally {
          resolve();
        }
      }
    };
  };
  const handle = (input) => {
    if (input === null || typeof input !== "object" || !("type" in input) || typeof input.type !== "string" || !input.type.startsWith("nexus.ui."))
      return false;
    if (closed) return true;
    if (input.type === "nexus.ui.environment") {
      const row = agentRecord(input, ["type", "environment"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
      const next = readAgentPluginUiEnvironment(row.environment);
      if (next.appId !== appId) throw new InvalidAgentPayload();
      environment = next;
      readyResolve(readAgentPluginUiEnvironment(next));
      for (const listener of environmentListeners) listener(readAgentPluginUiEnvironment(next));
    } else if (input.type === "nexus.ui.task.open") {
      const row = agentRecord(input, ["type", "runId"]);
      const runId = readAgentId(row.runId);
      for (const listener of taskListeners) listener(runId);
    } else if (input.type === "nexus.ui.response" || input.type === "nexus.ui.failure") {
      const row = agentRecord(
        input,
        input.type === "nexus.ui.response" ? ["type", "id", "result"] : ["type", "id", "error"],
        AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES
      );
      const id2 = readAgentId(row.id);
      const owner = pending.get(id2);
      if (!owner) return true;
      if (input.type === "nexus.ui.response") {
        const result = readAgentPluginUiHostResult(row.result, owner.input, appId);
        pending.delete(id2);
        owner.release();
        owner.resolve(result);
      } else {
        const failure2 = readAgentPluginUiHostFailure(row.error);
        pending.delete(id2);
        owner.release();
        owner.reject(new PluginUiRequestFailure(failure2.code, failure2.outcome));
      }
    } else if (input.type === "nexus.ui.stream.page") {
      if (!("id" in input)) throw new InvalidAgentPayload();
      const id2 = readAgentId(input.id);
      const owner = streams.get(id2);
      if (!owner) return true;
      if (!environment || owner.page) throw new InvalidAgentPayload();
      const page = readAgentPluginUiStreamPage(input, owner.source, appId, environment.appVersion);
      if (page.delivery !== owner.delivery + 1 || page.generation < owner.generation || (page.generation === owner.generation ? page.revision !== owner.revision + 1 : page.revision !== 1) || page.generation > owner.generation && page.value.type === "update" && page.value.state === null)
        throw new InvalidAgentPayload();
      owner.generation = page.generation;
      owner.revision = page.revision;
      owner.delivery = page.delivery;
      owner.page = page;
      apply(id2, owner);
    } else if (input.type === "nexus.ui.stream.failure") {
      const failure2 = readAgentPluginUiStreamFailure(input);
      const owner = streams.get(failure2.id);
      if (owner) {
        streams.delete(failure2.id);
        owner.page = null;
        owner.resolve();
        owner.consumer.rejected(failure2.code);
      }
    } else if (input.type === "nexus.ui.closed") {
      agentRecord(input, ["type"]);
      close();
    } else throw new InvalidAgentPayload();
    return true;
  };
  return {
    handle,
    close,
    ui: {
      ready,
      get environment() {
        return environment === null ? null : readAgentPluginUiEnvironment(environment);
      },
      onEnvironment(listener) {
        if (!closed) environmentListeners.add(listener);
        return () => {
          environmentListeners.delete(listener);
        };
      },
      onTaskOpen(listener) {
        if (!closed) taskListeners.add(listener);
        return () => {
          taskListeners.delete(listener);
        };
      },
      onClose(listener) {
        if (closed) listener();
        else closeListeners.add(listener);
        return () => {
          closeListeners.delete(listener);
        };
      },
      request,
      streams: { subscribe }
    }
  };
}

// ../shared/dist/agent/operations/values.js
var AGENT_OPERATION_STATES = [
  "accepted",
  "dispatched",
  "completed",
  "failed",
  "cancelled",
  "unknown"
];

// ../shared/dist/agent/plugins/registry-codec.js
var budget = AGENT_PLUGIN_MAX_MESSAGE_BYTES - 1024;
function pluginContractText(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new InvalidAgentPayload();
  }
  return value;
}

// ../shared/dist/agent/plugins/http-codec.js
var import_semver2 = __toESM(require_semver2(), 1);
function keyId(input) {
  const value = agentText(input, 72);
  if (!/^ed25519:[a-f0-9]{64}$/u.test(value)) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function hash(input) {
  const value = agentText(input, AGENT_PLUGIN_PACKAGE_HASH_LENGTH);
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function version(input) {
  const value = agentText(input, AGENT_PLUGIN_MAX_VERSION_BYTES);
  if (!isAgentPluginVersion(value)) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function readAgentPluginPackageId(input) {
  const value = agentText(input, AGENT_PLUGIN_MAX_PACKAGE_ID_BYTES);
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u.test(value)) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function readAgentPluginInstallation(input) {
  const row = agentRecord(input, [
    "appId",
    "definitionId",
    "version",
    "packageHash",
    "publisherKeyId",
    "status",
    "revision",
    "createdAt",
    "updatedAt"
  ]);
  const status = AGENT_PLUGIN_INSTALLATION_STATUSES.find((item) => item === row.status);
  if (!status) {
    throw new InvalidAgentPayload();
  }
  const definitionId = agentText(row.definitionId, 128), createdAt = agentInteger(row.createdAt);
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u.test(definitionId)) {
    throw new InvalidAgentPayload();
  }
  return {
    appId: readAgentId(row.appId),
    definitionId,
    version: version(row.version),
    packageHash: hash(row.packageHash),
    publisherKeyId: keyId(row.publisherKeyId),
    status,
    revision: agentInteger(row.revision, 1),
    createdAt,
    updatedAt: agentInteger(row.updatedAt, createdAt)
  };
}
function readAgentPluginDataKey(input) {
  const key = agentText(input, AGENT_PLUGIN_MAX_DATA_KEY_BYTES);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(key)) {
    throw new InvalidAgentPayload();
  }
  return key;
}
function readAgentPluginDataView(input) {
  const row = agentRecord(input, ["key", "version", "valueJson", "updatedAt"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  const valueJson = row.valueJson === null ? null : readAgentPluginDataValue(row.valueJson);
  return {
    key: readAgentPluginDataKey(row.key),
    version: agentInteger(row.version, 1),
    valueJson,
    updatedAt: agentInteger(row.updatedAt)
  };
}
function readAgentPluginDataValue(input) {
  const value = agentText(input, AGENT_PLUGIN_MAX_DATA_VALUE_BYTES);
  if (!hasAgentPluginDataValueCapacity(value)) {
    throw new InvalidAgentPayload();
  }
  try {
    JSON.parse(value);
  } catch {
    throw new InvalidAgentPayload();
  }
  return value;
}

// ../shared/dist/agent/tools/identity-codec.js
function readAgentToolIdentity(input) {
  const row = agentRecord(input, input !== null && typeof input === "object" && "kind" in input && input.kind === "plugin" ? ["kind", "packageId", "packageVersion", "packageSha256", "name"] : ["kind", "operation"]);
  if (row.kind === "plugin") {
    if (typeof row.packageVersion !== "string" || new TextEncoder().encode(row.packageVersion).byteLength > AGENT_PLUGIN_MAX_VERSION_BYTES || !isAgentPluginVersion(row.packageVersion) || typeof row.packageSha256 !== "string" || row.packageSha256.length !== AGENT_PLUGIN_PACKAGE_HASH_LENGTH || !/^[a-f0-9]+$/u.test(row.packageSha256) || typeof row.name !== "string") {
      throw new InvalidAgentPayload();
    }
    return {
      kind: "plugin",
      packageId: readAgentPluginPackageId(row.packageId),
      packageVersion: row.packageVersion,
      packageSha256: row.packageSha256,
      name: pluginContractText(row.name)
    };
  }
  if (row.kind !== "host") {
    throw new InvalidAgentPayload();
  }
  return { kind: "host", operation: pluginContractText(row.operation) };
}

// ../shared/dist/agent/tools/values.js
var AGENT_TOOL_JOB_STATES = ["queued", "dispatched", "completed", "failed", "unknown"];
var AGENT_TOOL_LIST_DEFAULT_LIMIT = 60;
var AGENT_TOOL_LIST_MAX_LIMIT = 100;
var AGENT_TOOL_ARGUMENT_MAX_BYTES = AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES;
var AGENT_TOOL_MAX_RESPONSE_BYTES = AGENT_TOOL_ARGUMENT_MAX_BYTES * 6 + 128 * 1024;
var AGENT_TOOL_RESULT_MAX_BYTES = 256 * 1024;
var AGENT_TOOL_RESULT_PAGE_MAX_BYTES = AGENT_PLUGIN_CONTENT_CHUNK_BYTES;

// ../shared/dist/agent/tools/http-codec.js
function readAgentToolCallDetails(input, path3) {
  const row = agentRecord(input, ["tool", "argumentsJson", "failureCode"], AGENT_TOOL_MAX_RESPONSE_BYTES);
  const tool = readTool(row.tool);
  if (tool.appId !== path3.appId || tool.runId !== path3.runId || tool.id !== path3.toolId) {
    throw new InvalidAgentPayload();
  }
  const argumentsJson = agentText(row.argumentsJson, AGENT_TOOL_ARGUMENT_MAX_BYTES);
  let parameters;
  try {
    parameters = JSON.parse(argumentsJson);
  } catch {
    throw new InvalidAgentPayload();
  }
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) {
    throw new InvalidAgentPayload();
  }
  const failureCode = row.failureCode === null ? null : AGENT_OPERATION_ERROR_CODES.find((code) => code === row.failureCode);
  if (failureCode === void 0 || failureCode !== null && tool.state !== "failed" && tool.state !== "unknown") {
    throw new InvalidAgentPayload();
  }
  return { tool, argumentsJson, failureCode };
}
function state(input) {
  const result = AGENT_OPERATION_STATES.find((value) => value === input);
  if (result === void 0) {
    throw new InvalidAgentPayload();
  }
  return result;
}
function hash2(input) {
  const result = agentText(input, 64);
  if (!AGENT_APPROVAL_OPERATION_HASH_PATTERN.test(result)) {
    throw new InvalidAgentPayload();
  }
  return result;
}
function parseAgentToolListCursor(input) {
  const value = agentText(input, 64);
  const separator = value.indexOf(":");
  if (separator <= 0 || separator !== value.lastIndexOf(":")) {
    throw new InvalidAgentPayload();
  }
  const createdAt = value.slice(0, separator);
  if (!/^(0|[1-9][0-9]{0,15})$/u.test(createdAt) || !Number.isSafeInteger(Number(createdAt))) {
    throw new InvalidAgentPayload();
  }
  return { createdAt: Number(createdAt), id: readAgentId(value.slice(separator + 1)) };
}
function readToolListCursor(input) {
  const cursor2 = parseAgentToolListCursor(input);
  return encodeAgentToolListCursor(cursor2.createdAt, cursor2.id);
}
function encodeAgentToolListCursor(createdAt, id2) {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new InvalidAgentPayload();
  }
  readAgentId(id2);
  return String(createdAt) + ":" + id2;
}
function readAgentThreadToolsQuery(input) {
  if ([...input.keys()].some((key) => key !== "before" && key !== "limit")) {
    throw new InvalidAgentPayload();
  }
  const before = input.getAll("before");
  const limits = input.getAll("limit");
  if (before.length > 1 || limits.length > 1) {
    throw new InvalidAgentPayload();
  }
  const rawLimit = limits.length === 0 ? String(AGENT_TOOL_LIST_DEFAULT_LIMIT) : limits[0];
  if (!/^(0|[1-9][0-9]{0,15})$/u.test(rawLimit)) {
    throw new InvalidAgentPayload();
  }
  const limit = agentInteger(Number(rawLimit), 1, AGENT_TOOL_LIST_MAX_LIMIT);
  return { before: before.length === 0 ? null : readToolListCursor(before[0]), limit };
}
function readTool(input) {
  const row = agentRecord(input, [
    "id",
    "appId",
    "runId",
    "sequence",
    "parentOperationId",
    "toolName",
    "toolVersion",
    "identity",
    "capability",
    "targetId",
    "targetVersion",
    "risk",
    "mutation",
    "summary",
    "operationHash",
    "effects",
    "revision",
    "state",
    "outputArtifactIds",
    "createdAt",
    "updatedAt"
  ], AGENT_TOOL_MAX_RESPONSE_BYTES);
  const capability2 = AGENT_CAPABILITIES.find((value) => value === row.capability);
  const risk = AGENT_APPROVAL_RISKS.find((value) => value === row.risk);
  if (capability2 === void 0 || risk === void 0 || typeof row.mutation !== "boolean") {
    throw new InvalidAgentPayload();
  }
  const targetId = row.targetId === null ? null : agentInteger(row.targetId, 1);
  const targetVersion = row.targetVersion === null ? null : agentInteger(row.targetVersion, 1);
  if (targetId === null !== (targetVersion === null)) {
    throw new InvalidAgentPayload();
  }
  if (!Array.isArray(row.effects)) {
    throw new InvalidAgentPayload();
  }
  const effects = row.effects.map((value) => {
    const effect = agentRecord(value, ["id", "operationHash"]);
    return { id: readAgentId(effect.id), operationHash: hash2(effect.operationHash) };
  });
  if (new Set(effects.map((effect) => effect.id)).size !== effects.length) {
    throw new InvalidAgentPayload();
  }
  const createdAt = agentInteger(row.createdAt);
  if (!Array.isArray(row.outputArtifactIds)) {
    throw new InvalidAgentPayload();
  }
  const outputArtifactIds = row.outputArtifactIds.map(readAgentId);
  if (new Set(outputArtifactIds).size !== outputArtifactIds.length) {
    throw new InvalidAgentPayload();
  }
  return {
    id: readAgentId(row.id),
    appId: readAgentId(row.appId),
    runId: readAgentId(row.runId),
    sequence: agentInteger(row.sequence, 1),
    parentOperationId: row.parentOperationId === null ? null : readAgentId(row.parentOperationId),
    toolName: agentText(row.toolName, AGENT_APPROVAL_MAX_TOOL_NAME_BYTES),
    toolVersion: agentText(row.toolVersion, AGENT_APPROVAL_MAX_TOOL_VERSION_BYTES),
    identity: readAgentToolIdentity(row.identity),
    capability: capability2,
    targetId,
    targetVersion,
    risk,
    mutation: row.mutation,
    summary: agentText(row.summary, AGENT_APPROVAL_MAX_SUMMARY_BYTES),
    operationHash: hash2(row.operationHash),
    effects,
    revision: agentInteger(row.revision, 1),
    state: state(row.state),
    outputArtifactIds,
    createdAt,
    updatedAt: agentInteger(row.updatedAt, createdAt)
  };
}
function readAgentThreadToolsResponse(input, appId, before, limit) {
  const row = agentRecord(input, ["items", "nextCursor"], AGENT_TOOL_MAX_RESPONSE_BYTES);
  if (!Array.isArray(row.items) || row.items.length > limit) {
    throw new InvalidAgentPayload();
  }
  const items = row.items.map(readTool);
  for (const item of items) {
    if (item.appId !== appId) {
      throw new InvalidAgentPayload();
    }
  }
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1];
    const current = items[index];
    if (current.createdAt < previous.createdAt || current.createdAt === previous.createdAt && current.id <= previous.id) {
      throw new InvalidAgentPayload();
    }
  }
  if (before !== null) {
    const boundary = parseAgentToolListCursor(before);
    if (items.some((item) => item.createdAt > boundary.createdAt || item.createdAt === boundary.createdAt && item.id >= boundary.id)) {
      throw new InvalidAgentPayload();
    }
  }
  const nextCursor = row.nextCursor === null ? null : readToolListCursor(row.nextCursor);
  if (nextCursor !== null && (items.length !== limit || encodeAgentToolListCursor(items[0].createdAt, items[0].id) !== nextCursor)) {
    throw new InvalidAgentPayload();
  }
  return { items, nextCursor };
}

// ../shared/dist/agent/memory/http-codec.js
function content(value) {
  const text4 = agentText(value, AGENT_MEMORY_MAX_CONTENT_BYTES);
  if (!hasAgentMemoryContentCapacity(text4)) {
    throw new InvalidAgentPayload();
  }
  return text4;
}
function confidence(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function readAgentMemoryReview(value) {
  const r = agentRecord(value, ["decision", "expectedVersion", "content"], AGENT_MEMORY_MAX_BODY_BYTES);
  const decision = AGENT_MEMORY_DECISIONS.find((v) => v === r.decision);
  if (!decision) {
    throw new InvalidAgentPayload();
  }
  return {
    expectedVersion: agentInteger(r.expectedVersion, 1),
    decision,
    content: r.content === null ? null : content(r.content)
  };
}
function readAgentMemoryListQuery(query) {
  if ([...query.keys()].some((k) => !["status", "limit", "offset", "threadId"].includes(k)) || ["status", "limit", "offset", "threadId"].some((k) => query.getAll(k).length > 1)) {
    throw new InvalidAgentPayload();
  }
  const status = query.get("status") ?? "all";
  if (status !== "all" && !AGENT_MEMORY_STATUSES.some((v) => v === status)) {
    throw new InvalidAgentPayload();
  }
  const selected = AGENT_MEMORY_STATUSES.find((v) => v === status) ?? "all";
  function number3(k, fallback, min, max) {
    const v = query.get(k);
    if (v === null) {
      return fallback;
    }
    if (!/^(0|[1-9][0-9]{0,15})$/u.test(v)) {
      throw new InvalidAgentPayload();
    }
    return agentInteger(Number(v), min, max);
  }
  const result = {
    status: selected,
    limit: number3("limit", 20, 1, AGENT_MEMORY_MAX_PAGE),
    offset: number3("offset", 0, 0, AGENT_MEMORY_MAX_OFFSET)
  };
  if (query.has("threadId")) {
    result.threadId = readAgentId(query.get("threadId"));
  }
  return result;
}
function readAgentMemoryView(value) {
  const r = agentRecord(value, [
    "id",
    "appId",
    "content",
    "confidence",
    "status",
    "sourceRunId",
    "expiresAt",
    "reviewAction",
    "reviewedAt",
    "version",
    "createdAt",
    "updatedAt"
  ], AGENT_MEMORY_MAX_BODY_BYTES);
  const status = AGENT_MEMORY_STATUSES.find((v) => v === r.status);
  const action = r.reviewAction === null ? null : AGENT_MEMORY_DECISIONS.find((v) => v === r.reviewAction);
  if (!status || action === void 0 || action === null !== (r.reviewedAt === null) || status === "candidate" !== (action === null) || status === "published" && action !== "publish" || status === "revoked" && action !== "revoke" && action !== "reject") {
    throw new InvalidAgentPayload();
  }
  const createdAt = agentInteger(r.createdAt);
  const updatedAt = agentInteger(r.updatedAt, createdAt);
  const expiresAt = r.expiresAt === null ? null : agentInteger(r.expiresAt, createdAt + 1);
  const reviewedAt = r.reviewedAt === null ? null : agentInteger(r.reviewedAt, createdAt);
  if (reviewedAt !== null && reviewedAt > updatedAt || status === "published" && expiresAt !== null && reviewedAt !== null && reviewedAt >= expiresAt) {
    throw new InvalidAgentPayload();
  }
  return {
    id: readAgentId(r.id),
    appId: readAgentId(r.appId),
    content: content(r.content),
    confidence: confidence(r.confidence),
    status,
    sourceRunId: r.sourceRunId === null ? null : readAgentId(r.sourceRunId),
    expiresAt,
    reviewAction: action,
    reviewedAt,
    version: agentInteger(r.version, 1),
    createdAt,
    updatedAt
  };
}
function readAgentMemoryResponse(value) {
  return { memory: readAgentMemoryView(agentRecord(value, ["memory"], AGENT_MEMORY_MAX_BODY_BYTES).memory) };
}
function readAgentMemoryListResponse(value) {
  const r = agentRecord(value, ["items", "nextOffset"], AGENT_MEMORY_MAX_RESPONSE_BYTES);
  if (!Array.isArray(r.items) || r.items.length > AGENT_MEMORY_MAX_PAGE) {
    throw new InvalidAgentPayload();
  }
  const items = r.items.map((v) => readAgentMemoryView(v));
  if (new Set(items.map((v) => v.id)).size !== items.length) {
    throw new InvalidAgentPayload();
  }
  return { items, nextOffset: r.nextOffset === null ? null : agentInteger(r.nextOffset, 1, AGENT_MEMORY_MAX_OFFSET) };
}

// ../shared/dist/agent/plugins/ui-http-codec.js
var methods = /* @__PURE__ */ new Set([
  "agent.runs.usage",
  "agent.tools.list",
  "agent.tools.details",
  "agent.memories.list",
  "agent.memories.get",
  "agent.memories.review",
  "agent.artifacts.list",
  "agent.artifacts.get",
  "agent.artifacts.begin",
  "agent.artifacts.retain",
  "agent.artifacts.delete",
  "agent.artifacts.attach",
  "agent.artifacts.readRange"
]);
function isAgentPluginUiMethod(method) {
  return typeof method === "string" && methods.has(method);
}
function readAgentPluginUiInput(input) {
  const row = agentRecord(input, ["method", "params"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  switch (row.method) {
    case "agent.runs.usage": {
      const p = agentRecord(row.params, ["runId"]);
      return { method: row.method, params: { runId: readAgentId(p.runId) } };
    }
    case "agent.tools.list": {
      const p = agentRecord(row.params, ["threadId", "before", "limit"]);
      const query = new URLSearchParams({ limit: String(agentInteger(p.limit, 1)) });
      if (p.before !== null) {
        if (typeof p.before !== "string") {
          throw new InvalidAgentPayload();
        }
        query.set("before", p.before);
      }
      const value = readAgentThreadToolsQuery(query);
      return {
        method: row.method,
        params: { threadId: readAgentId(p.threadId), before: value.before, limit: value.limit }
      };
    }
    case "agent.tools.details": {
      const p = agentRecord(row.params, ["runId", "toolId"]);
      return { method: row.method, params: { runId: readAgentId(p.runId), toolId: readAgentId(p.toolId) } };
    }
    case "agent.memories.list": {
      const p = agentRecord(row.params, [
        "status",
        "limit",
        "offset",
        ...Object.hasOwn(row.params ?? {}, "threadId") ? ["threadId"] : []
      ]);
      if (typeof p.status !== "string") {
        throw new InvalidAgentPayload();
      }
      const query = new URLSearchParams({
        status: p.status,
        limit: String(agentInteger(p.limit, 1)),
        offset: String(agentInteger(p.offset))
      });
      if (p.threadId !== void 0) {
        query.set("threadId", readAgentId(p.threadId));
      }
      return { method: row.method, params: readAgentMemoryListQuery(query) };
    }
    case "agent.memories.get": {
      const p = agentRecord(row.params, ["memoryId"]);
      return { method: row.method, params: { memoryId: readAgentId(p.memoryId) } };
    }
    case "agent.memories.review": {
      const p = agentRecord(row.params, ["memoryId", "input"]);
      return {
        method: row.method,
        params: { memoryId: readAgentId(p.memoryId), input: readAgentMemoryReview(p.input) }
      };
    }
    case "agent.artifacts.list": {
      const p = agentRecord(row.params, ["retained", "kind", "q", "offset", "limit"]);
      if (p.retained !== null && typeof p.retained !== "boolean" || typeof p.q !== "string" || p.kind !== null && typeof p.kind !== "string") {
        throw new InvalidAgentPayload();
      }
      const query = new URLSearchParams({
        q: p.q,
        offset: String(agentInteger(p.offset)),
        limit: String(agentInteger(p.limit, 1))
      });
      if (p.retained !== null) {
        query.set("retained", String(p.retained));
      }
      if (p.kind !== null) {
        query.set("kind", p.kind);
      }
      const value = readAgentArtifactQuery(query);
      return {
        method: row.method,
        params: {
          retained: value.retained,
          kind: value.kind,
          q: value.q,
          offset: value.offset,
          limit: value.limit
        }
      };
    }
    case "agent.artifacts.get": {
      const p = agentRecord(row.params, ["artifactId"]);
      return { method: row.method, params: { artifactId: readAgentId(p.artifactId) } };
    }
    case "agent.artifacts.begin":
      return { method: row.method, params: readAgentArtifactBegin(row.params) };
    case "agent.artifacts.retain": {
      const p = agentRecord(row.params, ["artifactId", "input"]);
      return {
        method: row.method,
        params: { artifactId: readAgentId(p.artifactId), input: readAgentArtifactRetain(p.input) }
      };
    }
    case "agent.artifacts.delete": {
      const p = agentRecord(row.params, ["artifactId", "input"]);
      return {
        method: row.method,
        params: { artifactId: readAgentId(p.artifactId), input: readAgentArtifactVersion(p.input) }
      };
    }
    case "agent.artifacts.attach": {
      const p = agentRecord(row.params, ["artifactId", "expectedVersion", "threadId", "runId"]);
      return {
        method: row.method,
        params: {
          artifactId: readAgentId(p.artifactId),
          expectedVersion: agentInteger(p.expectedVersion, 1),
          threadId: readAgentId(p.threadId),
          runId: p.runId === null ? null : readAgentId(p.runId)
        }
      };
    }
    case "agent.artifacts.readRange": {
      const p = agentRecord(row.params, ["artifactId", "expectedVersion", "start", "endInclusive"]);
      const start = agentInteger(p.start);
      return {
        method: row.method,
        params: {
          artifactId: readAgentId(p.artifactId),
          expectedVersion: agentInteger(p.expectedVersion, 1),
          start,
          endInclusive: agentInteger(p.endInclusive, start)
        }
      };
    }
    default:
      throw new InvalidAgentPayload();
  }
}
function readAgentPluginUiResult(input, request, expectedAppId) {
  const row = agentRecord(input, ["appId", "method", "value"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  const appId = readAgentId(row.appId);
  if (row.method !== request.method || expectedAppId !== void 0 && appId !== expectedAppId) {
    throw new InvalidAgentPayload();
  }
  switch (request.method) {
    case "agent.runs.usage": {
      const value = readAgentRunUsageResponse(row.value);
      if (value.runId !== request.params.runId) {
        throw new InvalidAgentPayload();
      }
      return { appId, method: request.method, value };
    }
    case "agent.tools.list":
      return {
        appId,
        method: request.method,
        value: readAgentThreadToolsResponse(row.value, appId, request.params.before, request.params.limit)
      };
    case "agent.tools.details": {
      const value = readAgentToolCallDetails(row.value, {
        appId,
        runId: request.params.runId,
        toolId: request.params.toolId
      });
      return { appId, method: request.method, value };
    }
    case "agent.memories.list": {
      const value = readAgentMemoryListResponse(row.value);
      if (value.items.length > request.params.limit || value.items.some((item) => item.appId !== appId || request.params.status !== "all" && item.status !== request.params.status) || value.nextOffset !== null && (value.nextOffset !== request.params.offset + request.params.limit || value.items.length !== request.params.limit)) {
        throw new InvalidAgentPayload();
      }
      return { appId, method: request.method, value };
    }
    case "agent.memories.get":
    case "agent.memories.review": {
      const value = readAgentMemoryResponse(row.value);
      if (value.memory.id !== request.params.memoryId || value.memory.appId !== appId) {
        throw new InvalidAgentPayload();
      }
      if (request.method === "agent.memories.review" && (value.memory.version !== request.params.input.expectedVersion + 1 || value.memory.reviewAction !== request.params.input.decision || value.memory.status !== (request.params.input.decision === "publish" ? "published" : "revoked") || request.params.input.content !== null && value.memory.content !== request.params.input.content)) {
        throw new InvalidAgentPayload();
      }
      return { appId, method: request.method, value };
    }
    case "agent.artifacts.list": {
      const value = readAgentArtifactListResponse(row.value);
      if (value.items.length > request.params.limit || value.items.some((item) => item.appId !== appId || request.params.kind !== null && item.kind !== request.params.kind || request.params.retained !== null && item.retained !== request.params.retained) || value.nextOffset !== null && (value.nextOffset !== request.params.offset + request.params.limit || value.items.length !== request.params.limit)) {
        throw new InvalidAgentPayload();
      }
      return { appId, method: request.method, value };
    }
    case "agent.artifacts.get":
    case "agent.artifacts.begin":
    case "agent.artifacts.retain": {
      const value = readAgentArtifactResponse(row.value);
      if (value.artifact.appId !== appId) {
        throw new InvalidAgentPayload();
      }
      if (request.method === "agent.artifacts.begin") {
        if (value.artifact.name !== request.params.name || value.artifact.mediaType !== request.params.mediaType || value.artifact.sizeBytes !== request.params.declaredBytes || value.artifact.status !== "staging" || value.artifact.version !== 1) {
          throw new InvalidAgentPayload();
        }
      } else if (value.artifact.id !== request.params.artifactId || request.method === "agent.artifacts.retain" && (value.artifact.version !== request.params.input.expectedVersion + 1 || value.artifact.retained !== request.params.input.retained || value.artifact.status !== "ready")) {
        throw new InvalidAgentPayload();
      }
      return { appId, method: request.method, value };
    }
    case "agent.artifacts.delete":
      return { appId, method: request.method, value: readAgentArtifactDeleteResponse(row.value) };
    case "agent.artifacts.attach": {
      const value = readAgentArtifactAttachResponse(row.value);
      const attachment = value.attachment;
      if (attachment.artifact.id !== request.params.artifactId || attachment.artifact.appId !== appId || attachment.artifact.version !== request.params.expectedVersion + 1 || attachment.sourceAppId !== appId || attachment.targetAppId !== appId || attachment.threadId !== request.params.threadId || attachment.runId !== request.params.runId || attachment.crossApp) {
        throw new InvalidAgentPayload();
      }
      return { appId, method: request.method, value };
    }
    case "agent.artifacts.readRange": {
      const p = agentRecord(row.value, ["artifactId", "start", "endInclusive", "dataBase64", "version", "totalBytes"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
      const artifactId = readAgentId(p.artifactId);
      const start = agentInteger(p.start);
      const endInclusive = agentInteger(p.endInclusive, start);
      if (artifactId !== request.params.artifactId || start !== request.params.start || endInclusive !== request.params.endInclusive || p.version !== request.params.expectedVersion || typeof p.dataBase64 !== "string") {
        throw new InvalidAgentPayload();
      }
      const bytes = endInclusive - start + 1;
      if (p.dataBase64.length !== 4 * Math.ceil(bytes / 3)) {
        throw new InvalidAgentPayload();
      }
      try {
        const decoded = atob(p.dataBase64);
        if (decoded.length !== bytes || btoa(decoded) !== p.dataBase64) {
          throw new InvalidAgentPayload();
        }
      } catch {
        throw new InvalidAgentPayload();
      }
      return {
        appId,
        method: request.method,
        value: {
          artifactId,
          start,
          endInclusive,
          dataBase64: p.dataBase64,
          version: agentInteger(p.version, 1),
          totalBytes: agentInteger(p.totalBytes, endInclusive + 1)
        }
      };
    }
  }
}

// ../shared/dist/agent/plugins/intent-values.js
var AGENT_PLUGIN_INTENT_MAX_INPUT_BYTES = 64 * 1024;
var AGENT_PLUGIN_INTENT_MAX_RANGE_BYTES = 128 * 1024;
var AGENT_PLUGIN_INTENT_MAX_PAGE = 100;
var AGENT_PLUGIN_INTENT_MAX_BODY_BYTES = 512 * 1024;
var AGENT_PLUGIN_INTENT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

// ../shared/dist/agent/plugins/intent-http-codec.js
var RESERVED_PAYLOAD_FIELDS = /* @__PURE__ */ new Set([
  "authorization",
  "password",
  "passphrase",
  "secret",
  "secretref",
  "token",
  "accesstoken",
  "refreshtoken",
  "sshhandle",
  "sshsession",
  "sessioncookie",
  "privatehistory",
  "hiddencontext",
  "chainofthought"
]);
function validatePayload(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "number" && !Number.isFinite(current)) {
      throw new InvalidAgentPayload();
    }
    if (Array.isArray(current)) {
      for (const child2 of current) {
        pending.push(child2);
      }
    } else if (current !== null && typeof current === "object") {
      for (const [key, child2] of Object.entries(current)) {
        if (RESERVED_PAYLOAD_FIELDS.has(key.toLowerCase().replace(/[^a-z0-9]/gu, ""))) {
          throw new InvalidAgentPayload();
        }
        pending.push(child2);
      }
    }
  }
}
function readAgentPluginIntentJson(input) {
  if (typeof input !== "string" || new TextEncoder().encode(input).byteLength > AGENT_PLUGIN_INTENT_MAX_INPUT_BYTES) {
    throw new InvalidAgentPayload();
  }
  try {
    const value = JSON.parse(input);
    validatePayload(value);
  } catch {
    throw new InvalidAgentPayload();
  }
  return input;
}
function artifactIds(input) {
  if (!Array.isArray(input)) {
    throw new InvalidAgentPayload();
  }
  const ids2 = input.map(readAgentId);
  if (new Set(ids2).size !== ids2.length) {
    throw new InvalidAgentPayload();
  }
  return ids2;
}
function readAgentPluginIntentCreate(input) {
  const row = agentRecord(input, ["operationId", "receiverAppId", "intentId", "inputJson", "artifactIds", "confirmed"], AGENT_PLUGIN_INTENT_MAX_BODY_BYTES);
  if (row.confirmed !== true) {
    throw new InvalidAgentPayload();
  }
  return {
    operationId: readAgentId(row.operationId),
    receiverAppId: readAgentId(row.receiverAppId),
    intentId: agentText(row.intentId, 128),
    inputJson: readAgentPluginIntentJson(row.inputJson),
    artifactIds: artifactIds(row.artifactIds),
    confirmed: true
  };
}
function readAgentPluginIntentReceipt(input) {
  const row = agentRecord(input, [
    "id",
    "senderAppId",
    "receiverAppId",
    "senderVersion",
    "receiverVersion",
    "senderRevision",
    "receiverRevision",
    "intentId",
    "schemaVersion",
    "inputJson",
    "artifactIds",
    "createdAt",
    "expiresAt",
    "revokedAt"
  ], AGENT_PLUGIN_INTENT_MAX_BODY_BYTES);
  const createdAt = agentInteger(row.createdAt);
  return {
    id: readAgentId(row.id),
    senderAppId: readAgentId(row.senderAppId),
    receiverAppId: readAgentId(row.receiverAppId),
    senderVersion: agentText(row.senderVersion, 128),
    receiverVersion: agentText(row.receiverVersion, 128),
    senderRevision: agentText(row.senderRevision, 128),
    receiverRevision: agentText(row.receiverRevision, 128),
    intentId: agentText(row.intentId, 128),
    schemaVersion: agentInteger(row.schemaVersion, 1),
    inputJson: readAgentPluginIntentJson(row.inputJson),
    artifactIds: artifactIds(row.artifactIds),
    createdAt,
    expiresAt: agentInteger(row.expiresAt, createdAt + 1),
    revokedAt: row.revokedAt === null ? null : agentInteger(row.revokedAt, createdAt)
  };
}

// ../shared/dist/agent/plugins/runtime-codec.js
var budget2 = AGENT_PLUGIN_MAX_MESSAGE_BYTES - 1024;
function agentPluginCapabilityReplyBytes(value) {
  return new TextEncoder().encode(JSON.stringify({ ok: true, valueJson: JSON.stringify(value) })).byteLength;
}

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
var Cached = class {
  constructor(getter) {
    this._getter = getter;
    this._value = void 0;
  }
  get value() {
    const getter = this._getter;
    if (getter !== void 0) {
      this._value = getter();
      this._getter = void 0;
    }
    return this._value;
  }
};
function cached(getter) {
  return new Cached(getter);
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function rawShape(def) {
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  return desc?.get ? desc.get.raw : desc?.value;
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path3, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path3);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function sizeCaps(defChecks) {
  const caps = [];
  for (const ch of defChecks ?? []) {
    const d = ch._zod.def;
    if (!/_(length|size)$|_equals$/.test(d.check))
      break;
    const max = d.maximum ?? d.length ?? d.size;
    if (max >= 0)
      caps.push([max, ch]);
  }
  return caps;
}
function attachSchema(issues, start, inst) {
  var _a2;
  for (let i = start; i < issues.length; i++) {
    (_a2 = issues[i]).schema ?? (_a2.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config2) {
  var _a2;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a2 = iss).schema ?? (_a2.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count2 = units;
  for (let i = 0; i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count2--;
      i++;
    }
  }
  return count2;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return void 0;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = void 0;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: void 0 };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: void 0, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition();
      }
      try {
        return new Definition();
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition();
}
// @__NO_SIDE_EFFECTS__
function $constructor(name2, initializer2, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = /* @__PURE__ */ new Set();
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = void 0;
      }
    } else if (inst._zod.traits.has(name2)) {
      return;
    }
    inst._zod.traits.add(name2);
    initializer2(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name2 });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = void 0;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name2);
    }
  });
  Object.defineProperty(_, "name", { value: name2 });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: void 0, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = void 0;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, void 0, {
  Parent: Error
});

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parse2 = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = void 0;
        ctx = void 0;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = void 0;
      ctx = void 0;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/regexes.js
var anyString = /^[\s\S]{0,}$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean3 = /^(?:true|false)$/i;

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
var _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== void 0;
};
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a2, _b;
  $ZodCheck.init(inst, def);
  if (def.pattern)
    (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/versions.js
var version2 = {
  major: 4,
  minor: 6,
  patch: 7
};

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version2;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {
      }
      return validateAsync(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean3;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function capSize(inst, size) {
  const caps = sizeCaps(inst._zod.def.checks);
  if (!caps.length)
    return;
  const cap = Math.min(...caps.map((c) => c[0]));
  const parse3 = inst._zod.parse;
  inst._zod.parse = (payload, ctx) => {
    const n = size(payload.value);
    if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
      for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
        if (n > max && ch._zod.def.when(payload)) {
          const start = payload.issues.length;
          ch._zod.check(payload);
          payload.issues[start].continue = false;
          attachSchema(payload.issues, start, inst);
          return payload;
        }
      }
    }
    return parse3(payload, ctx);
  };
}
var arraySize = (input) => Array.isArray(input) ? input.length : -1;
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
    const proms = [];
    const abortEarly = ctx?.abortEarly;
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
        if (abortEarly && result.issues.length !== 0 && aborted(result))
          break;
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
  capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key, input, optin, optout) {
  const isPresent = key in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== void 0 && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && optin === void 0) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key in input) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  const sh = desc?.get ? desc.get.raw : def.shape ?? {};
  if (sh) {
    const get = () => {
      const newSh = { ...sh };
      Object.defineProperty(def, "shape", { value: newSh });
      get.raw = newSh;
      return newSh;
    };
    get.raw = sh;
    Object.defineProperty(def, "shape", { get });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
          assignProp(propValues, key, /* @__PURE__ */ new Set());
        }
        for (const v of field.values)
          propValues[key].add(v);
        if (field.optin !== void 0)
          propValues[key].add(void 0);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    const abortEarly = ctx?.abortEarly;
    let seen = payload.issues.length;
    for (const key of value.allKeys) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (key === "__proto__")
        continue;
      const el = shape[key];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
  defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazyInternal(inst, "values", (zod) => {
    if (zod.def.options.every((o) => o._zod.values)) {
      return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    if (zod.def.options.every((o) => o._zod.pattern)) {
      const patterns = zod.def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
function discriminatorMap(def) {
  const map = /* @__PURE__ */ new Map();
  for (const option of def.options) {
    const values = option._zod.propValues?.[def.discriminator];
    if (!values || values.size === 0)
      throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
    for (const value of values) {
      if (map.has(value)) {
        if (value !== void 0)
          throw new Error(`Duplicate discriminator value "${String(value)}"`);
        map.set(value, null);
      } else {
        map.set(value, option);
      }
    }
  }
  return map;
}
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazyInternal(inst, "propValues", (zod) => {
    const propValues = {};
    let undefinedCount = 0;
    for (const option of zod.def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
      if (pv[zod.def.discriminator]?.has(void 0))
        undefinedCount++;
      for (const [k, v] of Object.entries(pv)) {
        if (!Object.prototype.hasOwnProperty.call(propValues, k)) {
          assignProp(propValues, k, /* @__PURE__ */ new Set());
        }
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    if (!zod.def.unionFallback && undefinedCount > 1)
      propValues[zod.def.discriminator]?.delete(void 0);
    return propValues;
  });
  def.options.forEach((option, i) => {
    const propShape = rawShape(option._zod.def);
    if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) {
      throw new Error(`Invalid discriminated union option at index "${i}"`);
    }
  });
  const disc = cached(() => discriminatorMap(def));
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const value = input?.[def.discriminator];
    const opt = disc.value.get(value);
    if (opt && (value !== void 0 || ctx.direction !== "backward")) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()).filter((value2) => disc.value.get(value2) !== null),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  defineLazyInternal(inst, "pattern", (zod) => {
    const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
    return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const values = new Set(def.values);
  inst._zod.values = values;
  defineLazyInternal(inst, "pattern", (zod) => {
    const vals = zod.def.values;
    return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
  return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
  return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}

// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/mini/schemas.js
var ZodMiniType = /* @__PURE__ */ $constructor("ZodMiniType", (inst, def) => {
  if (!inst._zod)
    throw new Error("Uninitialized schema in ZodMiniType.");
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
}, {
  // `with` is an alias for `check`: the same function object, not a wrapper.
  get with() {
    return this.check;
  },
  set with(value) {
    own(this, "with", value);
  },
  parse(data, params) {
    return parse2(this, data, params, { callee: this.parse });
  },
  parseAsync(data, params) {
    return parseAsync(this, data, params, { callee: this.parseAsync });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  check(...checks) {
    const def = this.def;
    return this.clone({
      ...def,
      checks: [
        ...def.checks ?? [],
        ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }, { parent: true });
  },
  clone(_def, params) {
    return clone(this, _def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta2) {
    reg.add(this, meta2);
    return this;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  }
});
var ZodMiniString = /* @__PURE__ */ $constructor("ZodMiniString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function string2(params) {
  return _string(ZodMiniString, params);
}
var ZodMiniNumber = /* @__PURE__ */ $constructor("ZodMiniNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function number2(params) {
  return _number(ZodMiniNumber, params);
}
var ZodMiniNumberFormat = /* @__PURE__ */ $constructor("ZodMiniNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodMiniNumber.init(inst, def);
});
function int(params) {
  return _int(ZodMiniNumberFormat, params);
}
var ZodMiniBoolean = /* @__PURE__ */ $constructor("ZodMiniBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function boolean4(params) {
  return _boolean(ZodMiniBoolean, params);
}
var ZodMiniNever = /* @__PURE__ */ $constructor("ZodMiniNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function never(params) {
  return _never(ZodMiniNever, params);
}
var ZodMiniArray = /* @__PURE__ */ $constructor("ZodMiniArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function array(element, params) {
  return new ZodMiniArray({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
var ZodMiniObject = /* @__PURE__ */ $constructor("ZodMiniObject", (inst, def) => {
  $ZodObject.init(inst, def);
  ZodMiniType.init(inst, def);
  installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
});
// @__NO_SIDE_EFFECTS__
function strictObject(shape, params) {
  return new ZodMiniObject({
    type: "object",
    shape,
    catchall: /* @__PURE__ */ never(),
    ...normalizeParams(params)
  });
}
var ZodMiniUnion = /* @__PURE__ */ $constructor("ZodMiniUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function union(options, params) {
  return new ZodMiniUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
var ZodMiniDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodMiniDiscriminatedUnion", (inst, def) => {
  $ZodDiscriminatedUnion.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function discriminatedUnion(discriminator, options, params) {
  return new ZodMiniDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
var ZodMiniEnum = /* @__PURE__ */ $constructor("ZodMiniEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodMiniType.init(inst, def);
  inst.options = [...inst._zod.values];
});
// @__NO_SIDE_EFFECTS__
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodMiniEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodMiniLiteral = /* @__PURE__ */ $constructor("ZodMiniLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function literal(value, params) {
  return new ZodMiniLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodMiniNullable = /* @__PURE__ */ $constructor("ZodMiniNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function nullable(innerType) {
  return new ZodMiniNullable({
    type: "nullable",
    innerType
  });
}
var ZodMiniCustom = /* @__PURE__ */ $constructor("ZodMiniCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function refine(fn, _params = {}) {
  return _refine(ZodMiniCustom, fn, _params);
}

// ../shared/dist/system/diagnostics/values.js
var HOST_DIAGNOSTIC_MAX_RESPONSE_BYTES = 16 * 1024;
var DIAGNOSTIC_MODULE_IDS = [
  "access",
  "agent",
  "operations",
  "preferences",
  "remote",
  "system",
  "targets",
  "storage"
];
var DIAGNOSTIC_RESOURCE_UNITS = {
  active_http_requests: "count",
  active_workspaces: "count",
  suspended_sessions: "count",
  disconnected_sessions: "count",
  output_buffer_bytes: "bytes",
  input_buffer_bytes: "bytes",
  suspend_queue_bytes: "bytes",
  resume_buffer_bytes: "bytes",
  active_transfers: "count",
  retained_transfers: "count",
  pending_requests: "count",
  pending_operations: "count",
  database_operations: "count",
  database_queue_wait_ms: "milliseconds",
  database_queue_wait_max_ms: "milliseconds",
  database_execution_ms: "milliseconds",
  database_execution_max_ms: "milliseconds",
  database_commits: "count",
  database_commit_ms: "milliseconds",
  database_commit_max_ms: "milliseconds",
  worker_heap_used_bytes: "bytes",
  worker_heap_total_bytes: "bytes",
  worker_external_bytes: "bytes",
  worker_array_buffer_bytes: "bytes",
  active_runs: "count",
  pending_run_writes: "count",
  status_subscriptions: "count"
};
var DIAGNOSTIC_RESOURCE_STATUSES = ["available", "unavailable", "not_instrumented"];

// ../shared/dist/system/diagnostics/model.js
var count = int().check(_gte(0));
var amount = number2().check(_gte(0), _lte(Number.MAX_SAFE_INTEGER));
var names = Object.keys(DIAGNOSTIC_RESOURCE_UNITS).filter((name2) => Object.hasOwn(DIAGNOSTIC_RESOURCE_UNITS, name2));
var metricSchema = strictObject({
  name: _enum(names),
  unit: _enum([...new Set(Object.values(DIAGNOSTIC_RESOURCE_UNITS))]),
  value: count
}).check(refine((value) => value.unit === DIAGNOSTIC_RESOURCE_UNITS[value.name]));
var moduleResourceSchema = strictObject({
  id: _enum(DIAGNOSTIC_MODULE_IDS),
  status: _enum(DIAGNOSTIC_RESOURCE_STATUSES),
  metrics: array(metricSchema).check(_maxLength(names.length))
}).check(refine((value) => (value.status === "available" ? value.metrics.length > 0 : value.metrics.length === 0) && new Set(value.metrics.map((metric) => metric.name)).size === value.metrics.length));
var hostDiagnosticSchema = strictObject({
  collectedAt: count,
  process: strictObject({
    uptimeSeconds: count,
    residentBytes: count,
    heapUsedBytes: count,
    runtimeVersion: string2().check(_minLength(1), _maxLength(64), refine((value) => {
      const bytes = new TextEncoder().encode(value);
      return !!value.trim() && bytes.length <= 64 && new TextDecoder().decode(bytes) === value;
    })),
    heapTotalBytes: count,
    externalBytes: count,
    arrayBufferBytes: count,
    cpuUserSeconds: amount,
    cpuSystemSeconds: amount,
    gcCount: count,
    gcDurationSeconds: amount
  }).check(refine((value) => value.heapUsedBytes <= value.heapTotalBytes)),
  database: strictObject({ available: boolean4(), schemaVersion: nullable(count) }).check(refine((value) => value.available === (value.schemaVersion !== null))),
  modules: array(moduleResourceSchema).check(_length(DIAGNOSTIC_MODULE_IDS.length), refine((values) => new Set(values.map((value) => value.id)).size === values.length))
});

// ../shared/dist/agent/integrations/browser-values.js
var AGENT_BROWSER_MAX_BODY_BYTES = 32 * 1024;
var AGENT_BROWSER_MAX_SETTLE_MS = 2e3;

// ../shared/dist/remote/files/values.js
var REMOTE_FILE_MAX_PATH_BYTES = 4096;
var REMOTE_FILE_TEXT_PAGE_MAX_BYTES = 32 * 1024;
var REMOTE_FILE_TEXT_PAGE_MIN_BYTES = 4;
var REMOTE_FILE_MAX_REQUEST_BYTES = 16 * 1024;
var REMOTE_FILE_MAX_TEXT_BYTES = 16 * 1024 * 1024;
var REMOTE_FILE_MAX_WRITE_REQUEST_BYTES = 2 * REMOTE_FILE_MAX_TEXT_BYTES + 2 * REMOTE_FILE_MAX_PATH_BYTES + 1024;
var REMOTE_FILE_MAX_LIST_ENTRIES = 200;
var REMOTE_FILE_MAX_METADATA_BYTES = 48 * 1024;
var REMOTE_FILE_MAX_RESPONSE_BYTES = 2 * REMOTE_FILE_MAX_TEXT_BYTES + 4096;
var WORKSPACE_FILES_TRANSFER_TIMEOUT_MS = 60 * 60 * 1e3;
var WORKSPACE_FILES_MAX_LIST_RESPONSE_BYTES = 8 * 1024 * 1024;

// ../shared/dist/remote/docker/values.js
var DOCKER_ACTIONS = ["start", "stop", "restart", "remove"];

// ../shared/dist/agent/plugins/host-operations.js
function text2(maxBytes = Number.MAX_SAFE_INTEGER, allowEmpty = false) {
  return string2().check(refine((value) => (allowEmpty || value.length > 0) && !value.includes("\0") && isWellFormedFileText(value) && new TextEncoder().encode(value).byteLength <= maxBytes));
}
function integer2(min = 0, max = Number.MAX_SAFE_INTEGER) {
  return int().check(_gte(min), _lte(max));
}
function path(maxBytes = REMOTE_FILE_MAX_PATH_BYTES) {
  return text2(maxBytes).check(refine((value) => value.startsWith("/") && !value.split("/").includes("..")));
}
var id = string2().check(_regex(AGENT_ID_PATTERN));
var hash3 = string2().check(_regex(/^[a-f0-9]{64}$/u));
var onError = _enum(["stop", "continue"]);
var nodeRef = text2(64).check(_regex(/^[0-9]+$/u));
var settleMs = integer2(0, AGENT_BROWSER_MAX_SETTLE_MS);
var fileWriteItem = strictObject({
  path: path(),
  content: text2(Number.MAX_SAFE_INTEGER, true),
  expectedSha256: union([hash3, literal("absent")])
});
var fileMoveItem = strictObject({ path: path(), destinationPath: path(), expectedFingerprint: hash3 });
var fileDeleteItem = strictObject({ path: path(), expectedFingerprint: hash3, scope: _enum(["entry", "tree"]) });
var dockerControlItem = strictObject({
  containerId: hash3,
  expectedFingerprint: hash3,
  action: _enum(DOCKER_ACTIONS)
});
var resultReadItem = strictObject({
  toolCallId: id,
  sha256: hash3,
  offset: integer2(),
  maxBytes: integer2(8, AGENT_TOOL_RESULT_PAGE_MAX_BYTES)
});
var agentPluginHostOperationRequestSchema = union([
  strictObject({ operation: literal("discovery.catalog"), cursor: integer2(), sha256: nullable(hash3) }),
  strictObject({ operation: literal("discovery.activate"), names: array(text2(64)) }),
  strictObject({ operation: literal("targets.list") }),
  strictObject({ operation: literal("diagnostics.host") }),
  strictObject({ operation: literal("browser.catalog") }),
  strictObject({ operation: literal("images.list") }),
  strictObject({ operation: literal("diagnostics.readTarget"), connectionId: integer2(1) }),
  strictObject({ operation: literal("skills.catalog"), offset: integer2() }),
  strictObject({
    operation: literal("skills.read"),
    name: text2(64).check(_regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)),
    version: text2(64).check(refine(isAgentPluginVersion)),
    sha256: hash3
  }),
  strictObject({
    operation: literal("images.generate"),
    providerId: id,
    configurationVersion: integer2(1),
    modelId: text2(512),
    prompt: text2()
  }),
  strictObject({ operation: literal("context.readResults"), item: resultReadItem }),
  strictObject({
    operation: literal("artifacts.create"),
    name: text2(256),
    mediaType: text2(128),
    base64: text2(4 * Math.ceil(AGENT_ARTIFACT_MAX_BYTES / 3), true)
  }),
  strictObject({
    operation: literal("artifacts.read"),
    artifactId: id,
    offset: integer2(0, AGENT_ARTIFACT_MAX_BYTES),
    maxBytes: integer2(1, AGENT_TOOL_RESULT_PAGE_MAX_BYTES),
    encoding: _enum(["base64", "utf8"])
  }),
  strictObject({ operation: literal("artifacts.present"), artifactId: id }),
  strictObject({
    operation: literal("artifacts.checkCapacity"),
    sizeBytes: integer2(0, AGENT_ARTIFACT_MAX_BYTES)
  }),
  strictObject({
    operation: literal("memory.propose"),
    content: text2(AGENT_MEMORY_MAX_CONTENT_BYTES).check(refine(hasAgentMemoryContentCapacity)),
    confidence: number2().check(_gte(0), _lte(1)),
    expiresAt: nullable(integer2())
  }),
  strictObject({
    operation: literal("memory.retrieve"),
    action: literal("candidates"),
    limit: integer2(1),
    offset: integer2()
  }),
  strictObject({
    operation: literal("memory.retrieve"),
    action: literal("select"),
    limit: integer2(1),
    candidatesSha256: hash3,
    items: array(strictObject({ id, version: integer2(1), score: integer2(1) }))
  }),
  strictObject({ operation: literal("project.bindingRead"), connectionId: integer2(1) }),
  strictObject({
    operation: literal("project.bindingWrite"),
    connectionId: integer2(1),
    directory: nullable(path())
  }),
  strictObject({
    operation: literal("remote.readTextPage"),
    connectionId: integer2(1),
    path: path(),
    offset: integer2(),
    maxBytes: integer2(REMOTE_FILE_TEXT_PAGE_MIN_BYTES, REMOTE_FILE_TEXT_PAGE_MAX_BYTES)
  }),
  strictObject({
    operation: literal("remote.listPage"),
    connectionId: integer2(1),
    path: path(),
    after: text2(REMOTE_FILE_MAX_PATH_BYTES, true).check(refine((value) => !value.includes("/") && value !== "." && value !== ".."))
  }),
  strictObject({ operation: literal("remote.inspect"), connectionId: integer2(1), path: path() }),
  strictObject({
    operation: literal("remote.search"),
    connectionId: integer2(1),
    path: path(),
    queries: array(text2().check(refine((value) => !value.includes("\n") && !value.includes("\r")))).check(_minLength(1)),
    maxResults: integer2(1)
  }),
  strictObject({
    operation: literal("remote.write"),
    connectionId: integer2(1),
    items: array(fileWriteItem).check(_minLength(1)),
    onError
  }),
  strictObject({
    operation: literal("remote.patch"),
    connectionId: integer2(1),
    path: path(),
    expectedSha256: hash3,
    edits: array(strictObject({ oldText: text2(), newText: text2(Number.MAX_SAFE_INTEGER, true) }).check(refine((value) => value.oldText !== value.newText))).check(_minLength(1))
  }),
  strictObject({
    operation: literal("remote.move"),
    connectionId: integer2(1),
    items: array(fileMoveItem).check(_minLength(1)),
    onError
  }),
  strictObject({
    operation: literal("remote.delete"),
    connectionId: integer2(1),
    items: array(fileDeleteItem).check(_minLength(1)),
    onError
  }),
  strictObject({
    operation: literal("remote.deliver"),
    connectionId: integer2(1),
    paths: array(path()).check(_minLength(1))
  }),
  strictObject({
    operation: literal("shell.execute"),
    connectionId: integer2(1),
    commands: array(text2().check(refine((value) => !!value.trim()))).check(_minLength(1)),
    onError,
    cwd: nullable(path()),
    mode: _enum(["foreground", "background"]),
    yieldSeconds: nullable(integer2(0, AGENT_EXECUTION_LIMIT_MAXIMA.toolTimeoutSeconds))
  }),
  strictObject({
    operation: literal("shell.jobs"),
    connectionId: integer2(1),
    action: _enum(["list", "status", "wait", "cancel", "output"]),
    jobIds: array(id),
    waitMode: _enum(["all", "any"]),
    waitSeconds: integer2(0, 30),
    offset: integer2()
  }),
  strictObject({ operation: literal("docker.inspect"), connectionId: integer2(1), containerId: hash3 }),
  strictObject({
    operation: literal("docker.control"),
    connectionId: integer2(1),
    items: array(dockerControlItem).check(_minLength(1)),
    onError
  }),
  strictObject({ operation: literal("browser.open"), targetId: text2(128), expectedVersion: integer2(1) }),
  strictObject({ operation: literal("browser.close"), sessionId: id }),
  strictObject({ operation: literal("browser.screenshot"), sessionId: id }),
  strictObject({ operation: literal("browser.snapshot"), sessionId: id, maxNodes: integer2(1) }),
  strictObject({
    operation: literal("browser.console"),
    sessionId: id,
    after: integer2(),
    limit: integer2(1, 100)
  }),
  strictObject({ operation: literal("browser.navigate"), sessionId: id, settleMs, url: text2(4096) }),
  strictObject({ operation: literal("browser.back"), sessionId: id, settleMs }),
  strictObject({
    operation: literal("browser.scroll"),
    sessionId: id,
    settleMs,
    deltaX: integer2(Number.MIN_SAFE_INTEGER),
    deltaY: integer2(Number.MIN_SAFE_INTEGER)
  }),
  strictObject({
    operation: literal("browser.press"),
    sessionId: id,
    settleMs,
    key: text2(32),
    focus: nullable(strictObject({ snapshotId: id, nodeRef })),
    modifiers: array(_enum(["Alt", "Control", "Meta", "Shift"])).check(_maxLength(4))
  }),
  strictObject({
    operation: literal("browser.select"),
    sessionId: id,
    settleMs,
    snapshotId: id,
    nodeRef,
    values: array(text2(Number.MAX_SAFE_INTEGER, true)).check(_minLength(1))
  }),
  strictObject({
    operation: literal("browser.wait"),
    sessionId: id,
    mode: _enum(["timeout", "networkIdle"]),
    maxMillis: integer2(1)
  }),
  strictObject({ operation: literal("browser.click"), sessionId: id, settleMs, snapshotId: id, nodeRef }),
  strictObject({
    operation: literal("browser.type"),
    sessionId: id,
    settleMs,
    snapshotId: id,
    nodeRef,
    text: text2(Number.MAX_SAFE_INTEGER, true)
  }),
  strictObject({
    operation: literal("browser.upload"),
    sessionId: id,
    settleMs,
    snapshotId: id,
    nodeRef,
    artifactId: id,
    expectedVersion: integer2(1),
    sha256: hash3
  }),
  strictObject({
    operation: literal("browser.download"),
    sessionId: id,
    snapshotId: id,
    nodeRef,
    maxBytes: integer2(1, AGENT_ARTIFACT_MAX_BYTES)
  }),
  strictObject({
    operation: literal("collaboration.delegate"),
    profile: _enum(AGENT_CHILD_PROFILES),
    objective: text2(AGENT_RUN_MAX_PROMPT_BYTES),
    inputJson: string2(),
    targets: array(integer2(1)),
    dependencies: array(id),
    dependencyMode: _enum(["success", "settled"])
  }),
  strictObject({ operation: literal("collaboration.list"), after: nullable(id), limit: integer2(1) }),
  strictObject({
    operation: literal("collaboration.readOutput"),
    childId: id,
    offset: integer2(),
    maxBytes: integer2(8, AGENT_TOOL_RESULT_PAGE_MAX_BYTES)
  }),
  strictObject({
    operation: literal("collaboration.join"),
    childIds: array(id).check(_minLength(1)),
    mode: _enum(["all", "any"]),
    waitSeconds: integer2(1, 30)
  }),
  strictObject({ operation: literal("collaboration.cancel"), childIds: array(id).check(_minLength(1)) }),
  strictObject({
    operation: literal("collaboration.sendMessage"),
    recipientId: id,
    body: text2(),
    ttlSeconds: integer2(1)
  }),
  strictObject({
    operation: literal("collaboration.readMessages"),
    after: integer2(),
    limit: integer2(1)
  }),
  strictObject({
    operation: literal("collaboration.consumeMessages"),
    through: integer2(),
    expectedConsumed: integer2()
  }),
  strictObject({ operation: literal("collaboration.readFact"), key: text2(128) }),
  strictObject({
    operation: literal("collaboration.writeFact"),
    key: text2(128),
    value: text2(),
    expectedVersion: integer2(0, Number.MAX_SAFE_INTEGER - 1)
  })
]);
var outputText = string2().check(refine(isWellFormedFileText));
var nullableCount = nullable(integer2());
var pageResult = strictObject({
  toolCallId: id,
  sha256: hash3,
  originalBytes: integer2(),
  offset: integer2(),
  nextOffset: nullableCount,
  text: outputText
});
var artifactPresented = strictObject({ id, name: outputText, sizeBytes: integer2() });
var artifactCreated = strictObject({
  id,
  version: integer2(1),
  status: _enum(AGENT_ARTIFACT_STATUSES),
  sizeBytes: integer2(),
  sha256: nullable(hash3)
});
var artifactPage = strictObject({
  id,
  sha256: hash3,
  sizeBytes: integer2(),
  offset: integer2(),
  nextOffset: nullableCount,
  encoding: _enum(["base64", "utf8"]),
  base64: nullable(outputText),
  text: nullable(outputText)
});
var bindingResult = strictObject({
  binding: nullable(strictObject({ connectionId: integer2(1), directory: path() }))
});
var textPage = strictObject({
  path: path(),
  text: outputText,
  bytes: integer2(),
  sizeBytes: integer2(),
  offset: integer2(),
  nextOffset: nullableCount,
  sha256: nullable(hash3),
  pageSha256: hash3,
  fingerprint: hash3
});
var fileKind = _enum(["file", "directory", "symlink", "other"]);
var directoryPage = strictObject({
  entries: array(strictObject({ name: outputText, kind: fileKind, size: integer2(), modifiedAt: number2() })),
  nextAfter: nullable(outputText),
  fingerprint: hash3
});
var missing = strictObject({ status: literal("not_found") });
var notText = strictObject({ status: literal("not_text") });
var pathSnapshot = strictObject({
  path: path(),
  kind: _enum(["file", "directory"]),
  fingerprint: hash3,
  fileCount: integer2(),
  directoryCount: integer2(),
  bytes: integer2()
});
var writeValue = strictObject({
  path: path(),
  status: _enum(["created", "replaced"]),
  bytes: integer2(),
  sha256: hash3
});
var moveValue = strictObject({
  path: path(),
  destinationPath: path(),
  kind: _enum(["file", "directory"]),
  fingerprint: hash3
});
var deleteValue = strictObject({
  path: path(),
  kind: _enum(["file", "directory"]),
  fileCount: integer2(),
  directoryCount: integer2()
});
var dockerValue = strictObject({
  containerId: hash3,
  action: _enum(DOCKER_ACTIONS),
  state: nullable(outputText)
});
var batchFailure = strictObject({
  index: integer2(),
  status: literal("failed"),
  failureCode: _enum(["not_found", "not_text", "conflict", "command_failed", "invalid_input", "limit_exceeded"])
});
var batchNotStarted = strictObject({ index: integer2(), status: literal("not_started") });
var batchUnknown = strictObject({ index: integer2(), status: literal("unknown") });
var commandResult2 = union([
  strictObject({ index: integer2(), status: literal("not_started") }),
  strictObject({
    index: integer2(),
    status: _enum(["completed", "nonzero"]),
    exitCode: integer2(0, 255),
    signal: nullable(outputText),
    stdout: outputText,
    stderr: outputText,
    truncated: boolean4()
  })
]);
var jobResult = union([
  strictObject({ status: literal("not_started") }),
  strictObject({ status: _enum(["completed", "nonzero"]), commands: array(commandResult2) })
]);
var jobSummaryFields = {
  jobId: id,
  state: _enum(AGENT_TOOL_JOB_STATES),
  revision: integer2(1),
  waitingForSpace: boolean4(),
  createdAt: integer2(),
  updatedAt: integer2()
};
var jobSummary = strictObject(jobSummaryFields);
var jobSnapshot = strictObject({ ...jobSummaryFields, result: nullable(jobResult) });
var jobOutput = strictObject({
  jobId: id,
  state: _enum(AGENT_TOOL_JOB_STATES),
  offset: integer2(),
  nextOffset: integer2(),
  capturedBytes: integer2(),
  available: boolean4(),
  waitingForSpace: boolean4(),
  output: array(strictObject({ commandIndex: integer2(), stream: _enum(["stdout", "stderr"]), text: outputText })),
  complete: boolean4()
});
var jobExecuteValue = union([strictObject({ jobId: id, accepted: literal(true) }), jobSnapshot]);
var jobControlValue = union([
  strictObject({ jobs: array(jobSummary), nextOffset: nullableCount }),
  strictObject({ jobs: array(jobOutput), nextIndex: nullableCount }),
  strictObject({ jobs: array(jobSnapshot) })
]);
var browserPage = strictObject({ kind: literal("page"), url: outputText, title: outputText });
var browserArtifact = strictObject({
  artifactId: id,
  version: integer2(1),
  sha256: hash3,
  sizeBytes: integer2(),
  mediaType: outputText
});
var skill = strictObject({
  name: outputText,
  description: outputText,
  version: text2(64).check(refine(isAgentPluginVersion)),
  sha256: hash3
});
var child = strictObject({
  id,
  parentId: nullable(id),
  status: _enum(AGENT_RUN_STATUSES),
  profile: _enum(AGENT_CHILD_PROFILES),
  output: nullable(outputText),
  outputBytes: integer2(),
  outputTruncated: boolean4(),
  maxRequests: integer2(1),
  deadline: integer2()
});
var fact = strictObject({ key: outputText, value: outputText, version: integer2(1), authorId: id });
var agentPluginHostOperationResultSchema = discriminatedUnion("operation", [
  strictObject({
    operation: literal("discovery.catalog"),
    value: strictObject({
      definitions: array(strictObject({
        name: text2(64),
        semanticName: outputText,
        description: outputText,
        parameters: array(outputText),
        keywords: array(outputText),
        loader: boolean4()
      })),
      sha256: hash3,
      nextCursor: nullable(integer2())
    })
  }),
  strictObject({ operation: literal("discovery.activate"), value: strictObject({ names: array(text2(64)) }) }),
  strictObject({
    operation: literal("targets.list"),
    value: strictObject({
      connections: array(strictObject({
        id: integer2(1),
        name: outputText,
        host: outputText,
        port: integer2(1, 65535),
        username: outputText
      }))
    })
  }),
  strictObject({ operation: literal("diagnostics.host"), value: hostDiagnosticSchema }),
  strictObject({
    operation: literal("diagnostics.readTarget"),
    value: strictObject({
      generatedAt: integer2(),
      cpuPercent: nullable(number2()),
      memUsedBytes: nullableCount,
      memTotalBytes: nullableCount,
      diskUsedBytes: nullableCount,
      diskTotalBytes: nullableCount,
      loadAverage: array(number2())
    })
  }),
  strictObject({
    operation: literal("skills.catalog"),
    value: strictObject({ items: array(skill), nextOffset: nullable(integer2()), catalogSha256: hash3 })
  }),
  strictObject({
    operation: literal("skills.read"),
    value: strictObject({
      name: outputText,
      description: outputText,
      version: text2(64).check(refine(isAgentPluginVersion)),
      sha256: hash3,
      body: outputText
    })
  }),
  strictObject({
    operation: literal("images.list"),
    value: strictObject({
      models: array(strictObject({ providerId: id, configurationVersion: integer2(1), modelId: outputText }))
    })
  }),
  strictObject({ operation: literal("images.generate"), value: artifactPresented }),
  strictObject({ operation: literal("context.readResults"), value: pageResult }),
  strictObject({ operation: literal("artifacts.create"), value: artifactCreated }),
  strictObject({ operation: literal("artifacts.read"), value: artifactPage }),
  strictObject({ operation: literal("artifacts.present"), value: artifactPresented }),
  strictObject({
    operation: literal("artifacts.checkCapacity"),
    value: strictObject({ availableBytes: integer2() })
  }),
  strictObject({
    operation: literal("memory.propose"),
    value: strictObject({ id, status: _enum(AGENT_MEMORY_STATUSES), version: integer2(1) })
  }),
  strictObject({
    operation: literal("memory.retrieve"),
    value: discriminatedUnion("action", [
      strictObject({
        action: literal("candidates"),
        items: array(strictObject({
          id,
          version: integer2(1),
          content: text2(AGENT_MEMORY_MAX_CONTENT_BYTES).check(refine(hasAgentMemoryContentCapacity)),
          confidence: number2().check(_gte(0), _lte(1))
        })),
        nextOffset: nullable(integer2()),
        candidatesSha256: hash3,
        maxItems: integer2(1),
        maxBytes: integer2(1)
      }),
      strictObject({
        action: literal("select"),
        items: array(strictObject({
          id,
          version: integer2(1),
          content: text2(AGENT_MEMORY_MAX_CONTENT_BYTES).check(refine(hasAgentMemoryContentCapacity)),
          confidence: number2().check(_gte(0), _lte(1)),
          score: integer2(1)
        }))
      })
    ])
  }),
  strictObject({ operation: literal("project.bindingRead"), value: bindingResult }),
  strictObject({ operation: literal("project.bindingWrite"), value: bindingResult }),
  strictObject({
    operation: literal("remote.readTextPage"),
    value: discriminatedUnion("status", [
      strictObject({ status: literal("ok"), value: textPage }),
      missing,
      notText
    ])
  }),
  strictObject({
    operation: literal("remote.listPage"),
    value: discriminatedUnion("status", [
      strictObject({ status: literal("ok"), value: directoryPage }),
      missing
    ])
  }),
  strictObject({
    operation: literal("remote.inspect"),
    value: discriminatedUnion("status", [
      strictObject({ status: literal("ok"), value: pathSnapshot }),
      missing,
      notText
    ])
  }),
  strictObject({
    operation: literal("remote.search"),
    value: strictObject({
      matches: array(strictObject({
        queryIndex: integer2(),
        path: path(),
        line: integer2(1),
        column: integer2(1),
        text: outputText
      })),
      truncated: boolean4()
    })
  }),
  strictObject({
    operation: literal("remote.write"),
    value: strictObject({
      items: array(discriminatedUnion("status", [
        strictObject({ index: integer2(), status: literal("completed"), value: writeValue }),
        batchFailure,
        batchNotStarted,
        batchUnknown
      ]))
    })
  }),
  strictObject({
    operation: literal("remote.move"),
    value: strictObject({
      items: array(discriminatedUnion("status", [
        strictObject({ index: integer2(), status: literal("completed"), value: moveValue }),
        batchFailure,
        batchNotStarted,
        batchUnknown
      ]))
    })
  }),
  strictObject({
    operation: literal("remote.delete"),
    value: strictObject({
      items: array(discriminatedUnion("status", [
        strictObject({ index: integer2(), status: literal("completed"), value: deleteValue }),
        batchFailure,
        batchNotStarted,
        batchUnknown
      ]))
    })
  }),
  strictObject({
    operation: literal("docker.control"),
    value: strictObject({
      items: array(discriminatedUnion("status", [
        strictObject({ index: integer2(), status: literal("completed"), value: dockerValue }),
        batchFailure,
        batchNotStarted,
        batchUnknown
      ]))
    })
  }),
  strictObject({ operation: literal("remote.patch"), value: writeValue }),
  strictObject({
    operation: literal("remote.deliver"),
    value: strictObject({
      items: array(discriminatedUnion("status", [
        strictObject({
          index: integer2(),
          status: literal("completed"),
          value: strictObject({ id, name: outputText, sizeBytes: integer2(), sha256: nullable(hash3) })
        }),
        strictObject({
          index: integer2(),
          status: literal("failed"),
          failureCode: _enum(AGENT_RUN_FAILURE_CODES)
        }),
        strictObject({
          index: integer2(),
          status: literal("unknown"),
          failureCode: _enum(AGENT_RUN_FAILURE_CODES)
        }),
        batchNotStarted
      ]))
    })
  }),
  strictObject({ operation: literal("shell.execute"), value: jobExecuteValue }),
  strictObject({ operation: literal("shell.jobs"), value: jobControlValue }),
  strictObject({
    operation: literal("docker.inspect"),
    value: discriminatedUnion("status", [
      strictObject({
        status: literal("ok"),
        value: strictObject({ containerId: hash3, state: outputText, image: outputText, fingerprint: hash3 })
      }),
      missing
    ])
  }),
  strictObject({
    operation: literal("browser.catalog"),
    value: strictObject({
      targets: array(strictObject({
        targetId: outputText,
        expectedVersion: integer2(1),
        allowedUrlPatterns: array(outputText)
      }))
    })
  }),
  strictObject({
    operation: literal("browser.open"),
    value: strictObject({
      sessionId: id,
      targetId: outputText,
      targetVersion: integer2(1),
      runId: id,
      createdAt: integer2()
    })
  }),
  strictObject({ operation: literal("browser.close"), value: strictObject({ status: literal("closed") }) }),
  strictObject({
    operation: literal("browser.snapshot"),
    value: strictObject({
      snapshotId: id,
      url: outputText,
      title: outputText,
      nodes: array(strictObject({
        ref: outputText,
        parentRef: nullable(outputText),
        tag: outputText,
        text: outputText,
        attributes: array(strictObject({ name: outputText, value: outputText }))
      })),
      truncated: boolean4()
    })
  }),
  strictObject({ operation: literal("browser.screenshot"), value: browserArtifact }),
  strictObject({ operation: literal("browser.download"), value: browserArtifact }),
  strictObject({
    operation: literal("browser.console"),
    value: strictObject({
      entries: array(strictObject({ sequence: integer2(), type: outputText, text: outputText })),
      nextCursor: integer2(),
      truncated: boolean4()
    })
  }),
  strictObject({ operation: literal("browser.navigate"), value: browserPage }),
  strictObject({ operation: literal("browser.back"), value: browserPage }),
  strictObject({ operation: literal("browser.scroll"), value: browserPage }),
  strictObject({ operation: literal("browser.press"), value: browserPage }),
  strictObject({ operation: literal("browser.select"), value: browserPage }),
  strictObject({ operation: literal("browser.wait"), value: browserPage }),
  strictObject({ operation: literal("browser.click"), value: browserPage }),
  strictObject({ operation: literal("browser.type"), value: browserPage }),
  strictObject({ operation: literal("browser.upload"), value: browserPage }),
  strictObject({ operation: literal("collaboration.delegate"), value: child }),
  strictObject({
    operation: literal("collaboration.list"),
    value: strictObject({ children: array(child), nextCursor: nullable(id) })
  }),
  strictObject({
    operation: literal("collaboration.readOutput"),
    value: strictObject({
      childId: id,
      sha256: hash3,
      originalBytes: integer2(),
      offset: integer2(),
      nextOffset: nullableCount,
      text: outputText
    })
  }),
  strictObject({
    operation: literal("collaboration.join"),
    value: strictObject({ ready: boolean4(), children: array(child) })
  }),
  strictObject({
    operation: literal("collaboration.cancel"),
    value: strictObject({ children: array(child) })
  }),
  strictObject({
    operation: literal("collaboration.sendMessage"),
    value: strictObject({ sequence: integer2(1) })
  }),
  strictObject({
    operation: literal("collaboration.readMessages"),
    value: strictObject({
      messages: array(strictObject({ sequence: integer2(1), senderId: id, body: outputText, expiresAt: integer2() })),
      nextCursor: integer2(),
      consumedThrough: integer2()
    })
  }),
  strictObject({
    operation: literal("collaboration.consumeMessages"),
    value: strictObject({ consumedThrough: integer2() })
  }),
  strictObject({
    operation: literal("collaboration.readFact"),
    value: strictObject({ fact: nullable(fact) })
  }),
  strictObject({
    operation: literal("collaboration.writeFact"),
    value: strictObject({ fact: nullable(fact) })
  })
]);

// ../shared/dist/agent/plugins/remote-files-codec.js
function text3(input) {
  if (typeof input !== "string" || !isWellFormedFileText(input) || input.includes("\0")) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function path2(input) {
  const value = text3(input);
  if (!value.startsWith("/") || value.split("/").includes("..") || new TextEncoder().encode(value).byteLength > REMOTE_FILE_MAX_PATH_BYTES) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function cursor(input) {
  const value = text3(input);
  if (value.includes("/") || value === "." || value === ".." || new TextEncoder().encode(value).byteLength > REMOTE_FILE_MAX_PATH_BYTES) {
    throw new InvalidAgentPayload();
  }
  return value;
}
function hash4(input) {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function readAgentPluginRemoteTextPageResult(input, request) {
  const row = agentRecord(input, input !== null && typeof input === "object" && "status" in input && input.status === "ok" ? ["status", "value"] : ["status"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  if (row.status === "not_found" || row.status === "not_text") {
    return { status: row.status };
  }
  if (row.status !== "ok") {
    throw new InvalidAgentPayload();
  }
  const page = agentRecord(row.value, ["path", "text", "bytes", "sizeBytes", "offset", "nextOffset", "sha256", "pageSha256", "fingerprint"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  const resultPath = path2(page.path);
  const valueText = text3(page.text);
  const bytes = agentInteger(page.bytes, 0, request.maxBytes);
  const sizeBytes = agentInteger(page.sizeBytes);
  const offset = agentInteger(page.offset, 0, sizeBytes);
  const nextOffset = page.nextOffset === null ? null : agentInteger(page.nextOffset, offset + 1, sizeBytes);
  const sha256 = page.sha256 === null ? null : hash4(page.sha256);
  const pageSha256 = hash4(page.pageSha256);
  const canonicalPath2 = "/" + request.path.split("/").filter((part) => part && part !== ".").join("/");
  if (resultPath !== canonicalPath2 || offset !== request.offset || new TextEncoder().encode(valueText).byteLength !== bytes || offset + bytes > sizeBytes || (nextOffset === null ? offset + bytes !== sizeBytes : nextOffset !== offset + bytes || nextOffset >= sizeBytes) || (offset === 0 && nextOffset === null ? sha256 !== pageSha256 : sha256 !== null)) {
    throw new InvalidAgentPayload();
  }
  return {
    status: "ok",
    value: {
      path: resultPath,
      text: valueText,
      bytes,
      sizeBytes,
      offset,
      nextOffset,
      sha256,
      pageSha256,
      fingerprint: hash4(page.fingerprint)
    }
  };
}
function readAgentPluginRemoteListPageResult(input, request) {
  const row = agentRecord(input, input !== null && typeof input === "object" && "status" in input && input.status === "ok" ? ["status", "value"] : ["status"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  if (row.status === "not_found") {
    return { status: "not_found" };
  }
  if (row.status !== "ok") {
    throw new InvalidAgentPayload();
  }
  const page = agentRecord(row.value, ["entries", "nextAfter", "fingerprint"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  if (!Array.isArray(page.entries) || page.entries.length > REMOTE_FILE_MAX_LIST_ENTRIES) {
    throw new InvalidAgentPayload();
  }
  const entries = page.entries.map((input2) => {
    const entry = agentRecord(input2, ["name", "kind", "size", "modifiedAt"]);
    const name2 = cursor(entry.name);
    if (!name2 || name2 <= request.after || entry.kind !== "file" && entry.kind !== "directory" && entry.kind !== "symlink" && entry.kind !== "other" || typeof entry.modifiedAt !== "number" || !Number.isFinite(entry.modifiedAt)) {
      throw new InvalidAgentPayload();
    }
    return { name: name2, kind: entry.kind, size: agentInteger(entry.size), modifiedAt: entry.modifiedAt };
  });
  const nextAfter = page.nextAfter === null ? null : cursor(page.nextAfter);
  if (entries.some((entry, index) => index > 0 && entry.name <= entries[index - 1].name) || nextAfter !== null && (!entries.length || nextAfter !== entries[entries.length - 1].name)) {
    throw new InvalidAgentPayload();
  }
  return { status: "ok", value: { entries, nextAfter, fingerprint: hash4(page.fingerprint) } };
}

// ../shared/dist/agent/plugins/host-operations-codec.js
function valid(condition) {
  if (!condition) {
    throw new InvalidAgentPayload();
  }
}
function distinct(values) {
  return new Set(values).size === values.length;
}
function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
function canonicalPath(value) {
  return "/" + value.split("/").filter((part) => part && part !== ".").join("/");
}
function decodedBase64Length(value) {
  try {
    const decoded = atob(value);
    valid(btoa(decoded) === value);
    return decoded.length;
  } catch {
    throw new InvalidAgentPayload();
  }
}
function readJson(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch {
    throw new InvalidAgentPayload();
  }
}
function checkPage(page, sizeBytes, bytes) {
  const end = page.offset + bytes;
  valid(end <= sizeBytes && (page.nextOffset === null ? end === sizeBytes : page.nextOffset === end && end < sizeBytes && bytes > 0));
}
function checkCapturedPage(page, maxBytes) {
  const points = Array.from(page.text).length;
  const bytes = byteLength(page.text);
  valid(page.offset + bytes <= page.originalBytes);
  valid(page.nextOffset === null || points > 0 && page.nextOffset === page.offset + points && page.nextOffset < page.originalBytes);
  if (page.offset === 0 && page.nextOffset === null) {
    valid(bytes === page.originalBytes);
  }
  if (maxBytes !== void 0) {
    valid(byteLength(JSON.stringify(page.text)) <= maxBytes);
  }
}
function checkIndexes(items, length = items.length) {
  valid(items.length === length && items.every((item, index) => item.index === index));
}
function readAgentPluginHostOperationRequest(input) {
  encodeAgentJson(input, AGENT_PLUGIN_HOST_ARGUMENT_MAX_BYTES);
  const parsed = agentPluginHostOperationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidAgentPayload();
  }
  const request = parsed.data;
  if (request.operation === "discovery.catalog") {
    valid(request.cursor === 0 === (request.sha256 === null));
  }
  if (request.operation === "memory.retrieve" && request.action === "select") {
    valid(distinct(request.items.map((item) => item.id)));
  }
  if (request.operation === "collaboration.delegate") {
    readJson(request.inputJson);
  }
  valid(!(request.operation === "artifacts.read" && request.encoding === "utf8" && request.maxBytes < 4 || request.operation === "shell.execute" && request.mode === "background" && request.yieldSeconds !== null || request.operation === "discovery.activate" && !distinct(request.names) || request.operation === "remote.deliver" && !distinct(request.paths.map(canonicalPath)) || request.operation === "remote.search" && !distinct(request.queries) || request.operation === "browser.press" && !distinct(request.modifiers) || request.operation === "collaboration.delegate" && (!distinct(request.targets) || !distinct(request.dependencies)) || (request.operation === "collaboration.join" || request.operation === "collaboration.cancel") && !distinct(request.childIds) || request.operation === "shell.jobs" && !distinct(request.jobIds)));
  if (request.operation === "artifacts.create") {
    decodedBase64Length(request.base64);
  }
  if (request.operation === "shell.jobs") {
    valid(request.action === "list" ? request.jobIds.length === 0 : request.jobIds.length > 0);
    valid(request.action === "wait" || request.waitSeconds === 0 && request.waitMode === "all");
    valid(request.action === "list" || request.action === "output" || request.offset === 0);
  }
  if (request.operation === "remote.write" || request.operation === "remote.delete") {
    valid(distinct(request.items.map((item) => canonicalPath(item.path))));
  }
  if (request.operation === "remote.move") {
    const paths = request.items.flatMap((item) => [canonicalPath(item.path), canonicalPath(item.destinationPath)]);
    valid(distinct(paths));
  }
  if (request.operation === "docker.control") {
    valid(distinct(request.items.map((item) => item.containerId)));
  }
  if (request.operation === "collaboration.consumeMessages") {
    valid(request.through >= request.expectedConsumed);
  }
  return request;
}
function readAgentPluginHostOperationResult(input, request) {
  encodeAgentJson(input, AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  const parsed = agentPluginHostOperationResultSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidAgentPayload();
  }
  const result = parsed.data;
  valid(request === void 0 || result.operation === request.operation);
  if (result.operation === "discovery.catalog") {
    valid(distinct(result.value.definitions.map((item) => item.name)));
    if (request?.operation === result.operation) {
      valid(request.sha256 === null || request.sha256 === result.value.sha256);
      valid(result.value.nextCursor === null || result.value.definitions.length > 0 && result.value.nextCursor === request.cursor + result.value.definitions.length);
    }
  }
  if (result.operation === "discovery.activate") {
    valid(distinct(result.value.names));
    if (request?.operation === result.operation) {
      const positions = result.value.names.map((name2) => request.names.indexOf(name2));
      valid(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
    }
  }
  if (result.operation === "targets.list") {
    valid(distinct(result.value.connections.map((item) => item.id)));
  }
  if (result.operation === "images.list") {
    valid(distinct(result.value.models.map((item) => JSON.stringify([item.providerId, item.configurationVersion, item.modelId]))));
  }
  if (result.operation === "skills.catalog") {
    valid(agentPluginCapabilityReplyBytes(result) <= AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES);
    if (request?.operation === result.operation) {
      valid(result.value.nextOffset === null || result.value.items.length > 0 && result.value.nextOffset === request.offset + result.value.items.length);
    }
  }
  if (result.operation === "memory.retrieve") {
    valid(distinct(result.value.items.map((item) => item.id)));
    if (result.value.action === "candidates") {
      valid(agentPluginCapabilityReplyBytes(result) <= AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES);
    }
    if (request?.operation === result.operation) {
      valid(result.value.action === request.action);
      if (request.action === "candidates" && result.value.action === "candidates") {
        valid(result.value.maxItems <= request.limit && (result.value.nextOffset === null || result.value.items.length > 0 && result.value.nextOffset === request.offset + result.value.items.length));
      }
      if (request.action === "select" && result.value.action === "select") {
        valid(result.value.items.length <= request.items.length && result.value.items.every((item, index) => {
          const selected = request.items[index];
          return selected !== void 0 && item.id === selected.id && item.version === selected.version && item.score === selected.score;
        }));
      }
    }
  }
  if (result.operation === "skills.read" && request?.operation === result.operation) {
    valid(result.value.name === request.name && result.value.version === request.version && result.value.sha256 === request.sha256);
  }
  if (result.operation === "context.readResults") {
    checkCapturedPage(result.value);
    if (request?.operation === result.operation) {
      valid(result.value.toolCallId === request.item.toolCallId && result.value.sha256 === request.item.sha256 && result.value.offset === request.item.offset && byteLength(JSON.stringify(result.value.text)) <= request.item.maxBytes);
    }
  }
  if (result.operation === "artifacts.read") {
    const value = result.value;
    valid(value.encoding === "base64" ? value.base64 !== null && value.text === null : value.text !== null && value.base64 === null);
    const bytes = value.base64 !== null ? decodedBase64Length(value.base64) : value.text !== null ? byteLength(value.text) : 0;
    checkPage(value, value.sizeBytes, bytes);
    if (request?.operation === result.operation) {
      valid(value.id === request.artifactId && value.offset === request.offset && value.encoding === request.encoding && bytes <= request.maxBytes);
    }
  }
  if (result.operation === "artifacts.present" && request?.operation === result.operation) {
    valid(result.value.id === request.artifactId);
  }
  if ((result.operation === "project.bindingRead" || result.operation === "project.bindingWrite") && (request?.operation === "project.bindingRead" || request?.operation === "project.bindingWrite")) {
    valid(result.value.binding === null || result.value.binding.connectionId === request.connectionId);
    if (request.operation === "project.bindingWrite") {
      valid(request.directory === null ? result.value.binding === null : result.value.binding?.directory === canonicalPath(request.directory));
    }
  }
  if (result.operation === "remote.readTextPage" && request?.operation === result.operation) {
    readAgentPluginRemoteTextPageResult(result.value, request);
  }
  if (result.operation === "remote.listPage" && request?.operation === result.operation) {
    readAgentPluginRemoteListPageResult(result.value, request);
  }
  if (result.operation === "remote.inspect" && request?.operation === result.operation && result.value.status === "ok") {
    valid(result.value.value.path === canonicalPath(request.path));
  }
  if (result.operation === "docker.inspect" && request?.operation === result.operation && result.value.status === "ok") {
    valid(result.value.value.containerId === request.containerId);
  }
  if (result.operation === "remote.search" && request?.operation === result.operation) {
    valid(result.value.matches.length <= request.maxResults && result.value.matches.every((item) => item.queryIndex < request.queries.length));
  }
  if (result.operation === "remote.write" || result.operation === "remote.move" || result.operation === "remote.delete" || result.operation === "remote.deliver" || result.operation === "docker.control") {
    checkIndexes(result.value.items);
  }
  if (result.operation === "remote.write" && request?.operation === result.operation) {
    checkIndexes(result.value.items, request.items.length);
    valid(result.value.items.every((item, index) => item.status !== "completed" || item.value.path === canonicalPath(request.items[index].path) && item.value.bytes === byteLength(request.items[index].content)));
  }
  if (result.operation === "remote.move" && request?.operation === result.operation) {
    checkIndexes(result.value.items, request.items.length);
    valid(result.value.items.every((item, index) => item.status !== "completed" || item.value.path === canonicalPath(request.items[index].path) && item.value.destinationPath === canonicalPath(request.items[index].destinationPath)));
  }
  if (result.operation === "remote.delete" && request?.operation === result.operation) {
    checkIndexes(result.value.items, request.items.length);
    valid(result.value.items.every((item, index) => item.status !== "completed" || item.value.path === canonicalPath(request.items[index].path)));
  }
  if (result.operation === "docker.control" && request?.operation === result.operation) {
    checkIndexes(result.value.items, request.items.length);
    valid(result.value.items.every((item, index) => item.status !== "completed" || item.value.containerId === request.items[index].containerId && item.value.action === request.items[index].action));
  }
  if (result.operation === "remote.deliver" && request?.operation === result.operation) {
    checkIndexes(result.value.items, request.paths.length);
  }
  if (result.operation === "remote.patch" && request?.operation === result.operation) {
    valid(result.value.path === canonicalPath(request.path));
  }
  if (result.operation === "shell.execute" || result.operation === "shell.jobs") {
    const value = result.value;
    if ("state" in value) {
      valid(value.updatedAt >= value.createdAt);
      if (value.result !== null && "commands" in value.result) {
        checkIndexes(value.result.commands);
        if (request?.operation === "shell.execute") {
          checkIndexes(value.result.commands, request.commands.length);
        }
      }
    }
    if ("jobs" in value) {
      valid(distinct(value.jobs.map((job) => job.jobId)));
      for (const job of value.jobs) {
        if ("updatedAt" in job) {
          valid(job.updatedAt >= job.createdAt);
        }
        if ("result" in job && job.result !== null && "commands" in job.result) {
          checkIndexes(job.result.commands);
        }
        if ("output" in job) {
          valid(job.nextOffset === job.offset + job.output.reduce((bytes, event) => bytes + byteLength(event.text), 0));
        }
      }
    }
    if (request?.operation === "shell.jobs") {
      if (!("jobs" in value)) {
        throw new InvalidAgentPayload();
      }
      if (request.action === "list") {
        valid("nextOffset" in value && (value.nextOffset === null || value.nextOffset > request.offset));
      } else if (request.action === "output") {
        valid("nextIndex" in value);
        if (!("nextIndex" in value)) {
          throw new InvalidAgentPayload();
        }
        valid(value.jobs.length <= request.jobIds.length && value.jobs.every((job, index) => job.jobId === request.jobIds[index] && job.offset === request.offset));
        valid(value.nextIndex === (value.jobs.length < request.jobIds.length ? value.jobs.length : null));
      } else {
        valid(!("nextOffset" in value) && !("nextIndex" in value) && value.jobs.length === request.jobIds.length && value.jobs.every((job, index) => job.jobId === request.jobIds[index] && "result" in job));
      }
    }
    if (request?.operation === "shell.execute") {
      valid(!("jobs" in value) && (request.mode !== "background" || "accepted" in value));
    }
  }
  if (result.operation === "browser.catalog") {
    valid(distinct(result.value.targets.map((item) => item.targetId)));
  }
  if (result.operation === "browser.open" && request?.operation === result.operation) {
    valid(result.value.targetId === request.targetId && result.value.targetVersion === request.expectedVersion);
  }
  if (result.operation === "browser.snapshot") {
    const nodes = result.value.nodes;
    valid(distinct(nodes.map((node) => node.ref)));
    const preceding = /* @__PURE__ */ new Set();
    for (const node of nodes) {
      valid(node.ref.length > 0 && (node.parentRef === null || preceding.has(node.parentRef)) && distinct(node.attributes.map((attribute) => attribute.name)));
      preceding.add(node.ref);
    }
    if (request?.operation === result.operation) {
      valid(nodes.length <= request.maxNodes);
    }
  }
  if (result.operation === "browser.console") {
    const entries = result.value.entries;
    valid(entries.every((entry, index) => index === 0 || entry.sequence > entries[index - 1].sequence));
    valid(entries.length === 0 || result.value.nextCursor === entries[entries.length - 1].sequence);
    if (request?.operation === result.operation) {
      valid(entries.length <= request.limit && entries.every((entry) => entry.sequence > request.after) && result.value.nextCursor >= request.after);
    }
  }
  if (result.operation === "browser.download" && request?.operation === result.operation) {
    valid(result.value.sizeBytes <= request.maxBytes);
  }
  if (result.operation === "collaboration.list" || result.operation === "collaboration.join" || result.operation === "collaboration.cancel") {
    valid(distinct(result.value.children.map((item) => item.id)));
  }
  if (result.operation === "collaboration.delegate" && request?.operation === result.operation) {
    valid(result.value.profile === request.profile);
  }
  if (result.operation === "collaboration.list" && request?.operation === result.operation) {
    valid(result.value.children.length <= request.limit && result.value.children.every((child2) => child2.id !== request.after) && (result.value.nextCursor === null || result.value.nextCursor === result.value.children[result.value.children.length - 1]?.id));
  }
  if ((result.operation === "collaboration.join" || result.operation === "collaboration.cancel") && (request?.operation === "collaboration.join" || request?.operation === "collaboration.cancel")) {
    valid(result.value.children.length === request.childIds.length && result.value.children.every((child2) => request.childIds.includes(child2.id)));
  }
  if (result.operation === "collaboration.readOutput") {
    checkCapturedPage(result.value);
    if (request?.operation === result.operation) {
      valid(result.value.childId === request.childId && result.value.offset === request.offset && byteLength(JSON.stringify(result.value.text)) <= request.maxBytes);
    }
  }
  if (result.operation === "collaboration.readMessages") {
    const messages = result.value.messages;
    valid(messages.every((message, index) => index === 0 || message.sequence > messages[index - 1].sequence));
    valid(messages.length === 0 || result.value.nextCursor >= messages[messages.length - 1].sequence);
    if (request?.operation === result.operation) {
      valid(messages.length <= request.limit && messages.every((message) => message.sequence > request.after) && result.value.nextCursor >= request.after);
    }
  }
  if (result.operation === "collaboration.consumeMessages" && request?.operation === result.operation) {
    valid(result.value.consumedThrough === request.through);
  }
  if ((result.operation === "collaboration.readFact" || result.operation === "collaboration.writeFact") && (request?.operation === "collaboration.readFact" || request?.operation === "collaboration.writeFact")) {
    valid(result.value.fact === null || result.value.fact.key === request.key);
    if (request.operation === "collaboration.writeFact") {
      valid(result.value.fact !== null && result.value.fact.value === request.value && result.value.fact.version === request.expectedVersion + 1);
    }
  }
  return result;
}

// ../shared/dist/agent/plugins/host-operation-rpc-result.js
function toAgentPluginHostOperationRpcResult(result) {
  switch (result.operation) {
    case "discovery.catalog":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "discovery.activate":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "targets.list":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "diagnostics.host":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "diagnostics.readTarget":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "skills.catalog":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "skills.read":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "images.list":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "images.generate":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "context.readResults":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "artifacts.create":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "artifacts.read":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "artifacts.present":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "artifacts.checkCapacity":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "memory.propose":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "memory.retrieve":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "project.bindingRead":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "project.bindingWrite":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.readTextPage":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.listPage":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.inspect":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.search":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.write":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.patch":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.move":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.delete":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "remote.deliver":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "shell.execute":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "shell.jobs":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "docker.inspect":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "docker.control":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.catalog":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.open":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.close":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.snapshot":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.screenshot":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.console":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.navigate":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.back":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.scroll":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.press":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.select":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.wait":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.click":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.type":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.upload":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "browser.download":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.delegate":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.list":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.readOutput":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.join":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.cancel":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.sendMessage":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.readMessages":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.consumeMessages":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.readFact":
      return { method: "host.perform", operation: result.operation, value: result.value };
    case "collaboration.writeFact":
      return { method: "host.perform", operation: result.operation, value: result.value };
  }
}

// ../shared/dist/agent/plugins/package-entry-codec.js
function readAgentPluginPackageEntry(input, prefix) {
  if (input === null) {
    return null;
  }
  const value = agentText(input, AGENT_PLUGIN_MAX_ENTRY_BYTES);
  if (!value.startsWith(prefix + "/") || value.split("/").some((part) => part.startsWith(".") || !/^[A-Za-z0-9_.-]{1,255}$/u.test(part))) {
    throw new InvalidAgentPayload();
  }
  return value;
}

// ../shared/dist/agent/plugins/settings-codec.js
function documentJson(input) {
  if (typeof input !== "string") {
    throw new InvalidAgentPayload();
  }
  try {
    const value = JSON.parse(input);
    if (!isAgentRecord(value)) {
      throw new InvalidAgentPayload();
    }
    return encodeAgentJson(value, AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  } catch {
    throw new InvalidAgentPayload();
  }
}
function readAgentPluginConfigurationPath(input) {
  if (typeof input !== "string" || input !== "" && !input.startsWith("/") || /~(?:[^01]|$)/u.test(input)) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function readAgentPluginSettingsContribution(input) {
  const row = agentRecord(input, ["frontendEntry", "instructions", "schemaRevision", "schemaJson", "defaultsJson", "agentEditablePaths"], AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES);
  const frontendEntry = readAgentPluginPackageEntry(row.frontendEntry, "frontend");
  const instructions = readAgentPluginPackageEntry(row.instructions, "docs");
  if (instructions === null || !Array.isArray(row.agentEditablePaths)) {
    throw new InvalidAgentPayload();
  }
  const agentEditablePaths = row.agentEditablePaths.map(readAgentPluginConfigurationPath);
  if (new Set(agentEditablePaths).size !== agentEditablePaths.length) {
    throw new InvalidAgentPayload();
  }
  return {
    frontendEntry,
    instructions,
    schemaRevision: agentInteger(row.schemaRevision, 1),
    schemaJson: documentJson(row.schemaJson),
    defaultsJson: documentJson(row.defaultsJson),
    agentEditablePaths
  };
}
function readAgentPluginConfigurationView(input) {
  const row = agentRecord(input, ["instanceId", "packageId", "revision", "schemaRevision", "documentJson"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  return {
    instanceId: readAgentId(row.instanceId),
    packageId: readAgentPluginPackageId(row.packageId),
    revision: agentInteger(row.revision),
    schemaRevision: agentInteger(row.schemaRevision),
    documentJson: documentJson(row.documentJson)
  };
}
function name(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function flag(input) {
  if (typeof input !== "boolean") {
    throw new InvalidAgentPayload();
  }
  return input;
}
function readAgentPluginInstanceView(input) {
  const row = agentRecord(input, ["id", "appId", "packageId", "name", "selected", "enabled", "revision", "createdAt", "updatedAt"], AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES);
  const createdAt = agentInteger(row.createdAt);
  const updatedAt = agentInteger(row.updatedAt, createdAt);
  return {
    id: readAgentId(row.id),
    appId: readAgentId(row.appId),
    packageId: readAgentPluginPackageId(row.packageId),
    name: name(row.name),
    selected: flag(row.selected),
    enabled: flag(row.enabled),
    revision: agentInteger(row.revision, 1),
    createdAt,
    updatedAt
  };
}
function readAgentPluginInstanceSettings(input) {
  const row = agentRecord(input, ["instance", "packageRevision", "configuration", "settings", "connectionKinds"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  if (!Array.isArray(row.connectionKinds)) {
    throw new InvalidAgentPayload();
  }
  const connectionKinds = row.connectionKinds.map((kind) => {
    if (kind !== "http" && kind !== "remoteProcess") {
      throw new InvalidAgentPayload();
    }
    return kind;
  });
  if (new Set(connectionKinds).size !== connectionKinds.length) {
    throw new InvalidAgentPayload();
  }
  const instance = readAgentPluginInstanceView(row.instance);
  const configuration = readAgentPluginConfigurationView(row.configuration);
  const settings = row.settings === null ? null : readAgentPluginSettingsContribution(row.settings);
  if (instance.id !== configuration.instanceId || instance.packageId !== configuration.packageId) {
    throw new InvalidAgentPayload();
  }
  return {
    instance,
    packageRevision: agentInteger(row.packageRevision, 1),
    connectionKinds,
    configuration,
    settings
  };
}
function readAgentPluginConfigurationWrite(input) {
  const row = agentRecord(input, ["operationKey", "expectedPackageRevision", "expectedRevision", "schemaRevision", "documentJson"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  return {
    operationKey: readAgentId(row.operationKey),
    expectedPackageRevision: agentInteger(row.expectedPackageRevision, 1),
    expectedRevision: agentInteger(row.expectedRevision),
    schemaRevision: agentInteger(row.schemaRevision, 1),
    documentJson: documentJson(row.documentJson)
  };
}

// ../shared/dist/agent/plugins/rpc-codec.js
function readAgentPluginRpcInput(input) {
  const row = agentRecord(input, ["method", "params"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  if (row.method === "settings.read") {
    agentRecord(row.params, []);
    return { method: row.method, params: {} };
  }
  if (row.method === "settings.write") {
    return { method: row.method, params: readAgentPluginConfigurationWrite(row.params) };
  }
  if (row.method === "host.perform") {
    return { method: row.method, params: readAgentPluginHostOperationRequest(row.params) };
  }
  if (row.method === "host.appInfo") {
    agentRecord(row.params, []);
    return { method: row.method, params: {} };
  }
  if (row.method === "storage.get") {
    const params = agentRecord(row.params, ["key"]);
    return { method: row.method, params: { key: readAgentPluginDataKey(params.key) } };
  }
  if (row.method === "storage.put") {
    const params = agentRecord(row.params, ["key", "expectedVersion", "operationId", "valueJson"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
    return {
      method: row.method,
      params: {
        key: readAgentPluginDataKey(params.key),
        expectedVersion: agentInteger(params.expectedVersion, 0, Number.MAX_SAFE_INTEGER - 1),
        operationId: readAgentId(params.operationId),
        valueJson: readAgentPluginDataValue(params.valueJson)
      }
    };
  }
  if (row.method === "storage.delete") {
    const params = agentRecord(row.params, ["key", "expectedVersion", "operationId"]);
    return {
      method: row.method,
      params: {
        key: readAgentPluginDataKey(params.key),
        expectedVersion: agentInteger(params.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1),
        operationId: readAgentId(params.operationId)
      }
    };
  }
  if (row.method === "intents.create") {
    return { method: row.method, params: readAgentPluginIntentCreate(row.params) };
  }
  if (row.method === "intents.listReceived") {
    const params = agentRecord(row.params, ["limit"]);
    return { method: row.method, params: { limit: agentInteger(params.limit, 1, AGENT_PLUGIN_INTENT_MAX_PAGE) } };
  }
  if (row.method === "intents.revoke") {
    const params = agentRecord(row.params, ["receiptId"]);
    return { method: row.method, params: { receiptId: readAgentId(params.receiptId) } };
  }
  if (row.method === "intents.artifacts.get") {
    const params = agentRecord(row.params, ["receiptId", "artifactId"]);
    return {
      method: row.method,
      params: { receiptId: readAgentId(params.receiptId), artifactId: readAgentId(params.artifactId) }
    };
  }
  if (row.method === "intents.artifacts.readRange") {
    const params = agentRecord(row.params, ["receiptId", "artifactId", "start", "endInclusive"]);
    const start = agentInteger(params.start, 0, Number.MAX_SAFE_INTEGER - 1);
    const endInclusive = agentInteger(params.endInclusive, start, Number.MAX_SAFE_INTEGER - 1);
    if (endInclusive - start + 1 > AGENT_PLUGIN_INTENT_MAX_RANGE_BYTES) {
      throw new InvalidAgentPayload();
    }
    return {
      method: row.method,
      params: {
        receiptId: readAgentId(params.receiptId),
        artifactId: readAgentId(params.artifactId),
        start,
        endInclusive
      }
    };
  }
  throw new InvalidAgentPayload();
}
function readAgentPluginRpcResult(input, request) {
  const row = agentRecord(input, request.method === "host.perform" ? ["method", "operation", "value"] : ["method", "value"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
  if (row.method !== request.method) {
    throw new InvalidAgentPayload();
  }
  if (request.method === "settings.read") {
    return { method: request.method, value: readAgentPluginInstanceSettings(row.value) };
  }
  if (request.method === "settings.write") {
    const value2 = readAgentPluginConfigurationView(row.value);
    if (value2.schemaRevision !== request.params.schemaRevision || value2.documentJson !== request.params.documentJson || value2.revision < request.params.expectedRevision) {
      throw new InvalidAgentPayload();
    }
    return { method: request.method, value: value2 };
  }
  if (request.method === "host.perform") {
    return toAgentPluginHostOperationRpcResult(readAgentPluginHostOperationResult({ operation: row.operation, value: row.value }, request.params));
  }
  if (request.method === "host.appInfo") {
    return { method: request.method, value: readAgentPluginInstallation(row.value) };
  }
  if (request.method === "intents.create") {
    const value2 = readAgentPluginIntentReceipt(row.value), expected = request.params;
    if (value2.id !== expected.operationId || value2.receiverAppId !== expected.receiverAppId || value2.intentId !== expected.intentId || value2.inputJson !== expected.inputJson || JSON.stringify(value2.artifactIds) !== JSON.stringify(expected.artifactIds) || value2.revokedAt !== null) {
      throw new InvalidAgentPayload();
    }
    return { method: request.method, value: value2 };
  }
  if (request.method === "intents.listReceived") {
    if (!Array.isArray(row.value) || row.value.length > request.params.limit) {
      throw new InvalidAgentPayload();
    }
    const value2 = row.value.map(readAgentPluginIntentReceipt);
    if (new Set(value2.map((item) => item.id)).size !== value2.length) {
      throw new InvalidAgentPayload();
    }
    return { method: request.method, value: value2 };
  }
  if (request.method === "intents.revoke") {
    if (agentRecord(row.value, ["revoked"]).revoked !== true) {
      throw new InvalidAgentPayload();
    }
    return { method: request.method, value: { revoked: true } };
  }
  if (request.method === "intents.artifacts.get") {
    const value2 = readAgentArtifactView(row.value);
    if (value2.id !== request.params.artifactId || value2.status !== "ready") {
      throw new InvalidAgentPayload();
    }
    return { method: request.method, value: value2 };
  }
  if (request.method === "intents.artifacts.readRange") {
    const value2 = agentRecord(row.value, ["receiptId", "artifactId", "start", "endInclusive", "dataBase64"], AGENT_PLUGIN_MAX_MESSAGE_BYTES);
    const expected = request.params;
    const bytes = expected.endInclusive - expected.start + 1;
    if (value2.receiptId !== expected.receiptId || value2.artifactId !== expected.artifactId || value2.start !== expected.start || value2.endInclusive !== expected.endInclusive || typeof value2.dataBase64 !== "string" || value2.dataBase64.length !== 4 * Math.ceil(bytes / 3)) {
      throw new InvalidAgentPayload();
    }
    try {
      const decoded = atob(value2.dataBase64);
      if (decoded.length !== bytes || btoa(decoded) !== value2.dataBase64) {
        throw new InvalidAgentPayload();
      }
    } catch {
      throw new InvalidAgentPayload();
    }
    return {
      method: request.method,
      value: {
        receiptId: expected.receiptId,
        artifactId: expected.artifactId,
        start: expected.start,
        endInclusive: expected.endInclusive,
        dataBase64: value2.dataBase64
      }
    };
  }
  const value = row.value === null ? null : readAgentPluginDataView(row.value);
  if (value !== null && value.key !== request.params.key) {
    throw new InvalidAgentPayload();
  }
  if (request.method === "storage.get") {
    return { method: request.method, value };
  }
  if (value === null || value.version !== request.params.expectedVersion + 1 || (request.method === "storage.delete" ? value.valueJson !== null : value.valueJson !== request.params.valueJson)) {
    throw new InvalidAgentPayload();
  }
  return { method: request.method, value };
}

// ../shared/dist/agent/providers/values.js
var AGENT_PROVIDER_MAX_BODY_BYTES = 128 * 1024;
var AGENT_PROVIDER_MAX_NAME_BYTES = 128;
var AGENT_PROVIDER_MAX_MODEL_ID_BYTES = 512;
var AGENT_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
var AGENT_PROVIDER_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// ../shared/dist/agent/providers/http-codec.js
function readAgentOptionalReasoningEffort(value) {
  if (value === void 0) {
    return void 0;
  }
  for (const effort of AGENT_REASONING_EFFORTS) {
    if (value === effort) {
      return effort;
    }
  }
  throw new InvalidAgentPayload();
}

// ../shared/dist/agent/scope/workspace-http-codec.js
function readAgentWorkspaceInput(input) {
  const row = agentRecord(input, ["method", "params"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
  switch (row.method) {
    case "agent.content.read": {
      const p = agentRecord(row.params, ["runId", "reference", "index"]);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          reference: readAgentPluginContentReference(p.reference),
          index: agentInteger(p.index)
        }
      };
    }
    case "agent.runs.resume": {
      const p = agentRecord(row.params, ["runId", "operationId", "input"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          operationId: readAgentId(p.operationId),
          input: readAgentResumeRunRequest(p.input)
        }
      };
    }
    case "agent.runs.outputs":
    case "agent.runs.suspension": {
      const p = agentRecord(row.params, ["runId"]);
      return { method: row.method, params: { runId: readAgentId(p.runId) } };
    }
    case "agent.runs.appendInput": {
      const p = agentRecord(row.params, ["runId", "expectedVersion", "threadId", "operationId", "input"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          expectedVersion: agentInteger(p.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1),
          threadId: readAgentId(p.threadId),
          operationId: readAgentId(p.operationId),
          input: readAgentCreateRunRequest(p.input)
        }
      };
    }
    case "agent.threads.history": {
      const p = agentRecord(row.params, ["threadId", "before", "limit"]);
      return {
        method: row.method,
        params: {
          threadId: readAgentId(p.threadId),
          before: p.before === null ? null : readAgentThreadEntryCursor(p.before),
          limit: agentInteger(p.limit, 1, AGENT_THREAD_ENTRY_MAX_PAGE)
        }
      };
    }
    case "agent.threads.entries": {
      const p = agentRecord(row.params, ["threadId", "after", "limit"]);
      return {
        method: row.method,
        params: {
          threadId: readAgentId(p.threadId),
          after: readAgentThreadEntryCursor(p.after),
          limit: agentInteger(p.limit, 1, AGENT_THREAD_ENTRY_MAX_PAGE)
        }
      };
    }
    case "agent.runs.create": {
      const p = agentRecord(row.params, ["threadId", "operationId", "input"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
      return {
        method: row.method,
        params: {
          threadId: readAgentId(p.threadId),
          operationId: readAgentId(p.operationId),
          input: readAgentCreateRunRequest(p.input)
        }
      };
    }
    case "agent.runs.cancel": {
      const p = agentRecord(row.params, ["runId", "operationId", "expectedVersion"]);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          operationId: readAgentId(p.operationId),
          expectedVersion: agentInteger(p.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1)
        }
      };
    }
    case "agent.subagents.cancel": {
      const p = agentRecord(row.params, ["runId", "childId", "operationId", "expectedVersion"]);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          childId: readAgentId(p.childId),
          operationId: readAgentId(p.operationId),
          expectedVersion: agentInteger(p.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1)
        }
      };
    }
    case "agent.approvals.resolve": {
      const p = agentRecord(row.params, ["approvalId", "operationId", "input"]);
      return {
        method: row.method,
        params: {
          approvalId: readAgentId(p.approvalId),
          operationId: readAgentId(p.operationId),
          input: readAgentApprovalResolveRequest(p.input)
        }
      };
    }
    case "agent.definitions.list":
    case "agent.providers.list":
      agentRecord(row.params, []);
      return { method: row.method, params: {} };
    case "agent.threads.list": {
      const p = agentRecord(row.params, ["after", "limit"]);
      return {
        method: row.method,
        params: {
          after: p.after === null ? null : readAgentId(p.after),
          limit: agentInteger(p.limit, 1, AGENT_THREAD_MAX_PAGE)
        }
      };
    }
    case "agent.threads.create": {
      const p = agentRecord(row.params, ["title", "operationId", "autoTitle"]);
      if (typeof p.autoTitle !== "boolean") {
        throw new InvalidAgentPayload();
      }
      return {
        method: row.method,
        params: {
          operationId: readAgentId(p.operationId),
          autoTitle: p.autoTitle,
          title: agentText(p.title, AGENT_SCOPE_MAX_NAME_BYTES)
        }
      };
    }
    case "agent.threads.rename": {
      const p = agentRecord(row.params, ["threadId", "expectedVersion", "title", "operationId"]);
      return {
        method: row.method,
        params: {
          threadId: readAgentId(p.threadId),
          expectedVersion: agentInteger(p.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1),
          operationId: readAgentId(p.operationId),
          title: agentText(p.title, AGENT_SCOPE_MAX_NAME_BYTES)
        }
      };
    }
    case "agent.threads.delete": {
      const p = agentRecord(row.params, ["threadId", "expectedVersion"]);
      return {
        method: row.method,
        params: {
          threadId: readAgentId(p.threadId),
          expectedVersion: agentInteger(p.expectedVersion, 1)
        }
      };
    }
    case "agent.runs.list": {
      const p = agentRecord(row.params, ["threadId", "after", "limit"]);
      return {
        method: row.method,
        params: {
          threadId: readAgentId(p.threadId),
          after: agentInteger(p.after, 0, Number.MAX_SAFE_INTEGER - 1),
          limit: agentInteger(p.limit, 1, AGENT_RUN_EVENT_MAX_LIMIT)
        }
      };
    }
    case "agent.approvals.list": {
      const p = agentRecord(row.params, ["runId", "after"]);
      return {
        method: row.method,
        params: { runId: readAgentId(p.runId), after: readAgentApprovalAfter(p.after) }
      };
    }
    case "agent.runs.get":
    case "agent.subagents.list": {
      const p = agentRecord(row.params, ["runId"]);
      return { method: row.method, params: { runId: readAgentId(p.runId) } };
    }
    case "agent.runs.events": {
      const p = agentRecord(row.params, ["runId", "after", "limit"]);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          after: agentInteger(p.after, 0, Number.MAX_SAFE_INTEGER - 1),
          limit: agentInteger(p.limit, 1, AGENT_RUN_EVENT_MAX_LIMIT)
        }
      };
    }
    case "agent.subagents.messages": {
      const p = agentRecord(row.params, ["runId", "childId", "after", "limit"]);
      return {
        method: row.method,
        params: {
          runId: readAgentId(p.runId),
          childId: readAgentId(p.childId),
          after: agentInteger(p.after, 0, Number.MAX_SAFE_INTEGER - 1),
          limit: agentInteger(p.limit, 1, AGENT_COLLABORATION_MESSAGE_MAX_PAGE)
        }
      };
    }
    default:
      throw new InvalidAgentPayload();
  }
}
function requireArray(input, limit = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(input) || input.length > limit) {
    throw new InvalidAgentPayload();
  }
  return input;
}
function uniqueIds(values) {
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    throw new InvalidAgentPayload();
  }
}
function readAgentWorkspaceResult(input, request) {
  const row = agentRecord(input, ["method", "value"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
  if (row.method !== request.method) {
    throw new InvalidAgentPayload();
  }
  switch (request.method) {
    case "agent.runs.outputs": {
      if (row.value === null) {
        return { method: request.method, value: null };
      }
      if (!Array.isArray(row.value)) {
        throw new InvalidAgentPayload();
      }
      const value = row.value.map(readAgentPluginContentReference);
      uniqueIds(value);
      return { method: request.method, value };
    }
    case "agent.content.read": {
      const value = readAgentPluginContentPage(row.value);
      const expected = request.params.reference;
      if (value.index !== request.params.index || value.reference.id !== expected.id || value.reference.sha256 !== expected.sha256 || value.reference.sizeBytes !== expected.sizeBytes || value.reference.mediaType !== expected.mediaType) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.runs.resume": {
      const value = readAgentResumeRunResponse(row.value);
      if (value.run.id !== request.params.runId || value.run.version !== request.params.input.expectedVersion + 1) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.runs.suspension": {
      const value = row.value === null ? null : readAgentRunSuspension(row.value);
      if (value !== null && value.runId !== request.params.runId) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.threads.history":
      return {
        method: request.method,
        value: readAgentThreadEntryHistory(row.value, request.params.threadId, request.params.before, request.params.limit)
      };
    case "agent.threads.entries":
      return {
        method: request.method,
        value: readAgentThreadEntries(row.value, request.params.threadId, request.params.after, request.params.limit)
      };
    case "agent.runs.create":
    case "agent.runs.appendInput": {
      const value = readAgentCreateRunResponse(row.value);
      if (value.run.threadId !== request.params.threadId || value.run.approvalMode !== request.params.input.approvalMode || request.method === "agent.runs.appendInput" && value.run.id === request.params.runId) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.runs.cancel":
    case "agent.subagents.cancel": {
      const value = readAgentCancelRunResponse(row.value);
      if (value.run.id !== (request.method === "agent.runs.cancel" ? request.params.runId : request.params.childId) || value.status !== "replayed" && value.status === "cancelled" && value.run.version !== request.params.expectedVersion + 1) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.approvals.resolve": {
      const value = readAgentApprovalView(row.value);
      if (value.id !== request.params.approvalId || value.operationHash !== request.params.input.operationHash || value.version !== request.params.input.expectedVersion + 1 || value.status !== request.params.input.decision) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.definitions.list":
      return { method: request.method, value: readAgentAppDefinitionListResponse(row.value) };
    case "agent.providers.list": {
      const value = requireArray(row.value).map((raw) => {
        if (!isAgentRecord(raw)) {
          throw new InvalidAgentPayload();
        }
        const optional = Object.hasOwn(raw, "defaultReasoningEffort") ? ["defaultReasoningEffort"] : [];
        const p = agentRecord(raw, [
          "providerId",
          "providerDisplayName",
          "configurationVersion",
          "modelId",
          "protocol",
          "reasoningEfforts",
          "reasoningMandatory",
          ...optional
        ]);
        const protocol = p.protocol === "chat-completions" || p.protocol === "responses" || p.protocol === "images" ? p.protocol : null;
        const reasoningEfforts = requireArray(p.reasoningEfforts, AGENT_REASONING_EFFORTS.length).map((raw2) => {
          const effort = readAgentOptionalReasoningEffort(raw2);
          if (effort === void 0) {
            throw new InvalidAgentPayload();
          }
          return effort;
        });
        const defaultReasoningEffort = readAgentOptionalReasoningEffort(p.defaultReasoningEffort);
        if (new Set(reasoningEfforts).size !== reasoningEfforts.length || defaultReasoningEffort !== void 0 && !reasoningEfforts.includes(defaultReasoningEffort) || typeof p.reasoningMandatory !== "boolean" || p.reasoningMandatory && !reasoningEfforts.length || protocol === "images" && (reasoningEfforts.length > 0 || p.reasoningMandatory)) {
          throw new InvalidAgentPayload();
        }
        if (!protocol) {
          throw new InvalidAgentPayload();
        }
        return {
          providerId: readAgentId(p.providerId),
          providerDisplayName: agentText(p.providerDisplayName, AGENT_PROVIDER_MAX_NAME_BYTES),
          configurationVersion: agentInteger(p.configurationVersion, 1),
          modelId: agentText(p.modelId, AGENT_PROVIDER_MAX_MODEL_ID_BYTES),
          protocol,
          reasoningEfforts,
          reasoningMandatory: p.reasoningMandatory,
          ...defaultReasoningEffort === void 0 ? {} : { defaultReasoningEffort }
        };
      });
      if (new Set(value.map((item) => item.providerId + ":" + item.modelId)).size !== value.length) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.threads.list": {
      const p = agentRecord(row.value, ["items", "nextCursor"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
      const items = requireArray(p.items, request.params.limit).map(readAgentCreateThreadResponse);
      uniqueIds(items);
      const nextCursor = p.nextCursor === null ? null : readAgentId(p.nextCursor);
      if (items.some((item, index) => item.id <= (index ? items[index - 1].id : request.params.after ?? "")) || nextCursor !== null && (!items.length || nextCursor !== items[items.length - 1].id || items.length !== request.params.limit)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value: { items, nextCursor } };
    }
    case "agent.threads.create":
    case "agent.threads.rename": {
      const value = readAgentCreateThreadResponse(row.value);
      if (value.title !== request.params.title.trim() || (request.method === "agent.threads.create" ? value.id !== request.params.operationId || value.version !== 1 : value.id !== request.params.threadId || value.version !== request.params.expectedVersion + 1)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.threads.delete": {
      const p = agentRecord(row.value, ["appId", "threadId"]);
      const value = { appId: readAgentId(p.appId), threadId: readAgentId(p.threadId) };
      if (value.threadId !== request.params.threadId) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.runs.list": {
      const p = agentRecord(row.value, ["threadId", "items", "nextCursor"], AGENT_WORKSPACE_MAX_RESPONSE_BYTES);
      const items = requireArray(p.items, request.params.limit).map(readAgentRunResponse);
      const nextCursor = agentInteger(p.nextCursor, request.params.after);
      uniqueIds(items);
      if (p.threadId !== request.params.threadId || items.some((item) => item.threadId !== request.params.threadId) || (items.length ? nextCursor <= request.params.after : nextCursor !== request.params.after)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value: { threadId: request.params.threadId, items, nextCursor } };
    }
    case "agent.runs.get": {
      const value = row.value === null ? null : readAgentRunResponse(row.value);
      if (value && value.id !== request.params.runId) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.runs.events": {
      const value = readAgentRunEventsResponse(row.value);
      if (value.items.length > request.params.limit || value.items.some((item) => item.runId !== request.params.runId || item.sequence <= request.params.after) || (value.items.length ? value.nextCursor <= request.params.after : value.nextCursor !== request.params.after)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.subagents.list": {
      const value = readAgentChildrenResponse(row.value);
      if (value.items.some((item) => item.parentId !== request.params.runId)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.subagents.messages": {
      const value = readAgentMessageMetadataResponse(row.value);
      if (value.items.length > request.params.limit || value.items.some((item) => item.sequence <= request.params.after) || (value.items.length ? value.nextCursor <= request.params.after : value.nextCursor !== request.params.after)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
    case "agent.approvals.list": {
      const value = readAgentApprovalPage(row.value, request.params.after);
      if (value.items.some((item) => item.runId !== request.params.runId)) {
        throw new InvalidAgentPayload();
      }
      return { method: request.method, value };
    }
  }
}

// ../shared/dist/agent/plugins/frontend-rpc-codec.js
function isAgentPluginAgentInput(value) {
  return value.method.startsWith("agent.") && !isAgentPluginUiMethod(value.method);
}
function isAgentPluginUiInput(value) {
  return isAgentPluginUiMethod(value.method);
}
function readAgentPluginFrontendInput(input) {
  const row = agentRecord(input, ["method", "params"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (isAgentPluginUiMethod(row.method)) {
    return readAgentPluginUiInput(input);
  }
  return typeof row.method === "string" && row.method.startsWith("agent.") ? readAgentWorkspaceInput(input) : readAgentPluginRpcInput(input);
}
function readAgentPluginFrontendResult(input, request) {
  if (isAgentPluginUiInput(request)) {
    return readAgentPluginUiResult(input, request);
  }
  return isAgentPluginAgentInput(request) ? readAgentWorkspaceResult(input, request) : readAgentPluginRpcResult(input, request);
}
function readAgentPluginRpcResponse(input, request) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidAgentPayload();
  }
  const row = agentRecord(input, Object.hasOwn(input, "result") ? ["type", "protocol", "nonce", "id", "seq", "ok", "result"] : ["type", "protocol", "nonce", "id", "seq", "ok", "error"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (row.type !== "nexus.plugin.response" || row.protocol !== 4 || row.nonce !== request.nonce || row.id !== request.id || row.seq !== request.seq) {
    throw new InvalidAgentPayload();
  }
  if (row.ok === true) {
    return {
      type: "nexus.plugin.response",
      protocol: 4,
      nonce: request.nonce,
      id: request.id,
      seq: request.seq,
      ok: true,
      result: readAgentPluginFrontendResult(row.result, request.request)
    };
  }
  if (row.ok === false) {
    return {
      type: "nexus.plugin.response",
      protocol: 4,
      nonce: request.nonce,
      id: request.id,
      seq: request.seq,
      ok: false,
      error: readAgentErrorResponse(row.error)
    };
  }
  throw new InvalidAgentPayload();
}
function readAgentPluginInit(input) {
  const row = agentRecord(input, ["type", "protocol", "nonce", "appId", "expiresAt"]);
  if (row.type !== "nexus.plugin.init" || row.protocol !== 4) {
    throw new InvalidAgentPayload();
  }
  return {
    type: "nexus.plugin.init",
    protocol: 4,
    nonce: readAgentId(row.nonce),
    appId: readAgentId(row.appId),
    expiresAt: agentInteger(row.expiresAt, 1)
  };
}
function readAgentPluginStreamCommand(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input) || !("command" in input)) {
    throw new InvalidAgentPayload();
  }
  const row = agentRecord(input, input.command === "subscribe" ? ["type", "protocol", "nonce", "seq", "subscriptionId", "generation", "command", "source"] : input.command === "ack" ? ["type", "protocol", "nonce", "seq", "subscriptionId", "generation", "command", "revision"] : ["type", "protocol", "nonce", "seq", "subscriptionId", "generation", "command"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (row.type !== "nexus.plugin.stream" || row.protocol !== 4) {
    throw new InvalidAgentPayload();
  }
  const base = {
    type: "nexus.plugin.stream",
    protocol: 4,
    nonce: readAgentId(row.nonce),
    seq: agentInteger(row.seq, 1),
    subscriptionId: readAgentId(row.subscriptionId),
    generation: agentInteger(row.generation, 1)
  };
  if (row.command === "subscribe") {
    const source = agentRecord(row.source, ["kind", "runId", "after"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
    if (source.kind !== "run-events") {
      throw new InvalidAgentPayload();
    }
    return {
      type: base.type,
      protocol: base.protocol,
      nonce: base.nonce,
      seq: base.seq,
      subscriptionId: base.subscriptionId,
      generation: base.generation,
      command: "subscribe",
      source: { kind: "run-events", runId: readAgentId(source.runId), after: agentInteger(source.after) }
    };
  }
  if (row.command === "ack") {
    return {
      type: base.type,
      protocol: base.protocol,
      nonce: base.nonce,
      seq: base.seq,
      subscriptionId: base.subscriptionId,
      generation: base.generation,
      command: "ack",
      revision: agentInteger(row.revision, 1)
    };
  }
  if (row.command === "unsubscribe") {
    return {
      type: base.type,
      protocol: base.protocol,
      nonce: base.nonce,
      seq: base.seq,
      subscriptionId: base.subscriptionId,
      generation: base.generation,
      command: "unsubscribe"
    };
  }
  throw new InvalidAgentPayload();
}
function readAgentPluginStreamEvent(input, context) {
  if (input === null || typeof input !== "object" || Array.isArray(input) || !("ok" in input)) {
    throw new InvalidAgentPayload();
  }
  const row = agentRecord(input, input.ok === true ? ["type", "protocol", "nonce", "subscriptionId", "generation", "ok", "revision", "value"] : ["type", "protocol", "nonce", "subscriptionId", "generation", "ok", "error"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (row.type !== "nexus.plugin.stream-event" || row.protocol !== 4 || row.nonce !== context.nonce || row.subscriptionId !== context.subscriptionId || row.generation !== context.generation) {
    throw new InvalidAgentPayload();
  }
  if (row.ok === true) {
    const value = readAgentRunEventsResponse(row.value);
    if (value.items.some((event) => event.runId !== context.runId || event.sequence <= context.after) || value.items.length === 0 && value.nextCursor !== context.after) {
      throw new InvalidAgentPayload();
    }
    return {
      type: "nexus.plugin.stream-event",
      protocol: 4,
      nonce: context.nonce,
      subscriptionId: context.subscriptionId,
      generation: context.generation,
      ok: true,
      revision: agentInteger(row.revision, 1),
      value
    };
  }
  if (row.ok === false) {
    return {
      type: "nexus.plugin.stream-event",
      protocol: 4,
      nonce: context.nonce,
      subscriptionId: context.subscriptionId,
      generation: context.generation,
      ok: false,
      error: readAgentErrorResponse(row.error)
    };
  }
  throw new InvalidAgentPayload();
}
function readAgentPluginControl(input) {
  if (input === null || typeof input !== "object" || !("type" in input)) {
    throw new InvalidAgentPayload();
  }
  const row = agentRecord(input, input.type === "nexus.plugin.cancel" ? ["type", "protocol", "nonce", "seq", "id"] : ["type", "protocol", "nonce", "seq"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (row.protocol !== 4) {
    throw new InvalidAgentPayload();
  }
  const nonce = readAgentId(row.nonce), seq = agentInteger(row.seq, 1);
  if (row.type === "nexus.plugin.cancel") {
    return { type: "nexus.plugin.cancel", protocol: 4, nonce, seq, id: readAgentId(row.id) };
  }
  if (row.type === "nexus.plugin.close") {
    return { type: "nexus.plugin.close", protocol: 4, nonce, seq };
  }
  throw new InvalidAgentPayload();
}
function readAgentPluginCancelled(input, request) {
  const row = agentRecord(input, ["type", "protocol", "nonce", "id", "seq"], AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
  if (row.type !== "nexus.plugin.cancelled" || row.protocol !== 4 || row.nonce !== request.nonce || row.id !== request.id || row.seq !== request.seq) {
    throw new InvalidAgentPayload();
  }
  return { type: "nexus.plugin.cancelled", protocol: 4, nonce: request.nonce, id: request.id, seq: request.seq };
}

// src/features/agent/plugins/sdk/index.ts
function belongsToApp(result, appId) {
  if ("appId" in result) {
    return result.appId === appId;
  }
  switch (result.method) {
    case "agent.threads.history":
      return result.value.body.appId === appId;
    case "agent.threads.list":
    case "agent.runs.list":
      return result.value.items.every((item) => item.appId === appId);
    case "agent.threads.create":
    case "agent.threads.rename":
    case "agent.threads.delete":
    case "agent.approvals.resolve":
    case "agent.threads.entries":
      return result.value.appId === appId;
    case "agent.runs.get":
      return result.value === null || result.value.appId === appId;
    case "agent.runs.create":
    case "agent.runs.appendInput":
    case "agent.runs.resume":
    case "agent.runs.cancel":
    case "agent.subagents.cancel":
      return result.value.run.appId === appId;
    case "agent.approvals.list":
      return result.value.items.every((item) => item.appId === appId);
    default:
      return true;
  }
}
var PluginSdkFailure = class extends Error {
  constructor(code, operationId, outcomeUnknown) {
    super(code);
    this.code = code;
    this.operationId = operationId;
    this.outcomeUnknown = outcomeUnknown;
    this.name = "PluginSdkFailure";
  }
  code;
  operationId;
  outcomeUnknown;
};
async function connectNexusPlugin() {
  const connection = await new Promise(
    (resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        window.removeEventListener("message", receive);
        if (error) {
          reject(error);
        } else if (value) {
          resolve(value);
        }
      };
      const receive = (event) => {
        if (event.source !== window.parent) {
          return;
        }
        try {
          if (event.data === null || typeof event.data !== "object" || !("type" in event.data) || event.data.type !== "nexus.plugin.init") {
            return;
          }
          const row = readAgentPluginInit(event.data);
          if (row.protocol !== 4 || row.expiresAt <= Date.now() || event.ports.length !== 1) {
            throw new Error("invalid_input");
          }
          const nonce = row.nonce, port = event.ports[0];
          if (!port) {
            throw new Error("invalid_input");
          }
          const ack = { type: "nexus.plugin.ack", protocol: 4, nonce, seq: 0 };
          port.postMessage(ack);
          finish(null, { port, nonce, appId: row.appId, expiresAt: row.expiresAt });
        } catch (error) {
          for (const port of event.ports) {
            port.close();
          }
          finish(error instanceof Error ? error : new Error("invalid_input"));
        }
      };
      const timer = setTimeout(() => finish(new Error("provider_unavailable")), AGENT_PLUGIN_RPC_TIMEOUT_MS);
      window.addEventListener("message", receive);
      try {
        const ready = { type: "nexus.plugin.ready", protocol: 4 };
        window.parent.postMessage(ready, "*");
      } catch (error) {
        finish(error instanceof Error ? error : new Error("provider_unavailable"));
      }
    }
  );
  const pending = /* @__PURE__ */ new Map();
  const subscriptions = /* @__PURE__ */ new Map();
  const subscriptionTasks = /* @__PURE__ */ new Set();
  const subscriptionFailures = [];
  let droppedSubscriptionFailures = 0;
  let sequence = 0, closed = false;
  const recordSubscriptionFailure = (error) => {
    if (subscriptionFailures.length < 32) {
      subscriptionFailures.push(error);
    } else {
      droppedSubscriptionFailures++;
    }
  };
  const uiClient = createPluginUiClient(connection.appId, (message) => {
    if (closed) throw new PluginSdkFailure("provider_unavailable", null, false);
    try {
      connection.port.postMessage(message);
    } catch (error) {
      recordSubscriptionFailure(error);
      stopConnection();
      throw error;
    }
  });
  let expiryTimer;
  const stopConnection = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(expiryTimer);
    try {
      uiClient.close();
    } catch (error) {
      recordSubscriptionFailure(error);
    }
    try {
      if (sequence < Number.MAX_SAFE_INTEGER) {
        connection.port.postMessage(
          readAgentPluginControl({
            type: "nexus.plugin.close",
            protocol: 4,
            nonce: connection.nonce,
            seq: ++sequence
          })
        );
      }
    } catch (error) {
      recordSubscriptionFailure(error);
    }
    for (const subscription of subscriptions.values()) {
      subscription.stop.abort();
      void subscription.delivery.then(subscription.resolve, subscription.reject);
    }
    subscriptions.clear();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.releaseAbort();
      item.reject(
        new PluginSdkFailure(
          item.mutation ? "operation_unknown" : "provider_unavailable",
          item.operationId,
          item.mutation
        )
      );
    }
    pending.clear();
    try {
      connection.port.close();
    } catch (error) {
      recordSubscriptionFailure(error);
    }
    window.removeEventListener("pagehide", stopConnection);
  };
  const cancelRequest = (id2) => {
    if (closed) {
      return;
    }
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      stopConnection();
      return;
    }
    try {
      connection.port.postMessage(
        readAgentPluginControl({
          type: "nexus.plugin.cancel",
          protocol: 4,
          nonce: connection.nonce,
          seq: ++sequence,
          id: id2
        })
      );
    } catch {
      stopConnection();
    }
  };
  const request = async (input, signal) => {
    if (closed || signal?.aborted || sequence >= Number.MAX_SAFE_INTEGER) {
      return Promise.reject(new PluginSdkFailure("provider_unavailable", null, false));
    }
    const normalized = readAgentPluginFrontendInput(input);
    const operationId = normalized.method === "storage.put" || normalized.method === "storage.delete" || normalized.method === "intents.create" || normalized.method === "agent.threads.create" || normalized.method === "agent.threads.rename" || normalized.method === "agent.runs.create" || normalized.method === "agent.runs.appendInput" || normalized.method === "agent.runs.cancel" || normalized.method === "agent.runs.resume" || normalized.method === "agent.subagents.cancel" || normalized.method === "agent.approvals.resolve" ? normalized.params.operationId : normalized.method === "settings.write" ? normalized.params.operationKey : normalized.method === "intents.revoke" ? normalized.params.receiptId : null;
    const mutation = operationId !== null || normalized.method === "agent.threads.delete" || normalized.method === "agent.memories.review" || normalized.method === "agent.artifacts.begin" || normalized.method === "agent.artifacts.retain" || normalized.method === "agent.artifacts.delete" || normalized.method === "agent.artifacts.attach";
    const id2 = crypto.randomUUID(), seq = ++sequence;
    const envelope = {
      type: "nexus.plugin.request",
      protocol: 4,
      nonce: connection.nonce,
      id: id2,
      seq,
      request: normalized
    };
    encodeAgentJson(envelope, AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
    return new Promise((resolve, reject) => {
      let dispatched = false;
      const releaseAbort = () => signal?.removeEventListener("abort", abort);
      const abort = () => {
        if (!pending.delete(id2)) {
          return;
        }
        clearTimeout(timer);
        releaseAbort();
        if (dispatched) {
          cancelRequest(id2);
        }
        reject(
          new PluginSdkFailure(
            mutation && dispatched ? "operation_unknown" : "provider_unavailable",
            operationId,
            mutation && dispatched
          )
        );
      };
      const timer = setTimeout(() => {
        pending.delete(id2);
        releaseAbort();
        if (dispatched) {
          cancelRequest(id2);
        }
        reject(
          new PluginSdkFailure(
            mutation && dispatched ? "operation_unknown" : "provider_unavailable",
            operationId,
            mutation && dispatched
          )
        );
      }, AGENT_PLUGIN_RPC_TIMEOUT_MS);
      pending.set(id2, { request: envelope, timer, resolve, reject, mutation, operationId, releaseAbort });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      try {
        connection.port.postMessage(envelope);
        dispatched = true;
      } catch (error) {
        pending.delete(id2);
        clearTimeout(timer);
        releaseAbort();
        reject(error instanceof Error ? error : new Error("invalid_input"));
      }
    });
  };
  const streamCommand = (value) => {
    if (closed || sequence >= Number.MAX_SAFE_INTEGER) {
      throw new PluginSdkFailure("provider_unavailable", null, false);
    }
    const base = {
      type: "nexus.plugin.stream",
      protocol: 4,
      nonce: connection.nonce,
      seq: ++sequence,
      subscriptionId: value.subscriptionId,
      generation: value.generation
    };
    const message = value.command === "subscribe" ? {
      type: base.type,
      protocol: base.protocol,
      nonce: base.nonce,
      seq: base.seq,
      subscriptionId: base.subscriptionId,
      generation: base.generation,
      command: value.command,
      source: value.source
    } : value.command === "ack" ? {
      type: base.type,
      protocol: base.protocol,
      nonce: base.nonce,
      seq: base.seq,
      subscriptionId: base.subscriptionId,
      generation: base.generation,
      command: value.command,
      revision: value.revision
    } : {
      type: base.type,
      protocol: base.protocol,
      nonce: base.nonce,
      seq: base.seq,
      subscriptionId: base.subscriptionId,
      generation: base.generation,
      command: value.command
    };
    connection.port.postMessage(readAgentPluginStreamCommand(message));
  };
  connection.port.addEventListener("message", (event) => {
    try {
      if (uiClient.handle(event.data)) {
        if (event.data !== null && typeof event.data === "object" && "type" in event.data && event.data.type === "nexus.ui.closed")
          stopConnection();
        return;
      }
    } catch (error) {
      recordSubscriptionFailure(error);
      stopConnection();
      return;
    }
    try {
      encodeAgentJson(event.data, AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
    } catch {
      stopConnection();
      return;
    }
    if (event.data !== null && typeof event.data === "object" && "type" in event.data && event.data.type === "nexus.plugin.stream-event") {
      if (!("subscriptionId" in event.data) || typeof event.data.subscriptionId !== "string") {
        stopConnection();
        return;
      }
      const id2 = event.data.subscriptionId;
      const owner = subscriptions.get(id2);
      if (!owner || owner.stop.signal.aborted) {
        return;
      }
      try {
        if (owner.receiving) {
          throw new Error("Unacknowledged plugin stream page");
        }
        const value = readAgentPluginStreamEvent(event.data, {
          nonce: connection.nonce,
          subscriptionId: id2,
          generation: owner.generation,
          runId: owner.runId,
          after: owner.after
        });
        if (value.ok && value.revision !== owner.revision + 1) {
          throw new Error("Invalid subscription sequence");
        }
        if (value.ok) {
          owner.revision = value.revision;
          owner.receiving = true;
        }
        owner.delivery = owner.delivery.then(async () => {
          if (owner.stop.signal.aborted || closed) {
            return;
          }
          if (!value.ok) {
            throw new PluginSdkFailure(value.error.code, null, false);
          }
          if (value.value.items.length > 0) {
            await owner.onEvents(value.value);
          }
          if (owner.stop.signal.aborted || closed || subscriptions.get(id2) !== owner) {
            return;
          }
          owner.after = value.value.nextCursor;
          owner.receiving = false;
          streamCommand({
            command: "ack",
            subscriptionId: id2,
            generation: owner.generation,
            revision: value.revision
          });
        }).catch(async (error) => {
          if (owner.stop.signal.aborted || closed) {
            recordSubscriptionFailure(error);
            owner.reject(error);
            return;
          }
          owner.stop.abort();
          subscriptions.delete(id2);
          try {
            await owner.onFailure(
              error instanceof Error ? error : new PluginSdkFailure("internal_failure", null, false)
            );
            owner.resolve();
          } catch (callbackError) {
            const failure2 = new AggregateError(
              [error, callbackError],
              "Plugin subscription and failure callback failed"
            );
            recordSubscriptionFailure(failure2);
            owner.reject(failure2);
          }
        });
        void owner.delivery.catch(() => void 0);
      } catch {
        stopConnection();
      }
      return;
    }
    if (event.data === null || typeof event.data !== "object" || !("id" in event.data) || typeof event.data.id !== "string") {
      stopConnection();
      return;
    }
    const active = pending.get(event.data.id);
    if (!active) {
      return;
    }
    try {
      if ("type" in event.data && event.data.type === "nexus.plugin.cancelled") {
        readAgentPluginCancelled(event.data, active.request);
        clearTimeout(active.timer);
        active.releaseAbort();
        pending.delete(active.request.id);
        active.reject(new PluginSdkFailure("cancelled", active.operationId, false));
        return;
      }
      const value = readAgentPluginRpcResponse(event.data, active.request);
      if (value.ok && value.result.method === "host.appInfo" && value.result.value.appId !== connection.appId) {
        stopConnection();
        return;
      }
      if (value.ok && (value.result.method === "intents.create" && value.result.value.senderAppId !== connection.appId || value.result.method === "intents.listReceived" && value.result.value.some((item) => item.receiverAppId !== connection.appId))) {
        stopConnection();
        return;
      }
      if (value.ok && !belongsToApp(value.result, connection.appId)) {
        stopConnection();
        return;
      }
      clearTimeout(active.timer);
      active.releaseAbort();
      pending.delete(active.request.id);
      if (value.ok) {
        active.resolve(value.result);
      } else {
        active.reject(
          new PluginSdkFailure(
            value.error.code,
            active.operationId,
            active.mutation && (value.error.code === "operation_unknown" || value.error.code === "internal_failure" || value.error.code === "storage_unavailable")
          )
        );
      }
    } catch {
      stopConnection();
    }
  });
  connection.port.addEventListener("messageerror", stopConnection);
  window.addEventListener("pagehide", stopConnection, { once: true });
  connection.port.start();
  const subscribe = (runId, after, onEvents, onFailure) => {
    if (closed) {
      throw new PluginSdkFailure("limit_exceeded", null, false);
    }
    const input = readAgentPluginFrontendInput({
      method: "agent.runs.events",
      params: { runId, after, limit: AGENT_RUN_EVENT_MAX_LIMIT }
    });
    if (input.method !== "agent.runs.events") {
      throw new PluginSdkFailure("invalid_input", null, false);
    }
    const id2 = crypto.randomUUID();
    let resolve = () => {
    };
    let reject = (_error) => {
    };
    const task2 = new Promise((completed, failed) => {
      resolve = completed;
      reject = failed;
    });
    const owner = {
      stop: new AbortController(),
      task: task2,
      delivery: Promise.resolve(),
      runId: input.params.runId,
      after: input.params.after,
      generation: 1,
      revision: 0,
      receiving: false,
      resolve,
      reject,
      onEvents,
      onFailure
    };
    subscriptions.set(id2, owner);
    subscriptionTasks.add(task2);
    void task2.then(
      () => {
        subscriptionTasks.delete(task2);
      },
      (error) => {
        subscriptionTasks.delete(task2);
        recordSubscriptionFailure(error);
      }
    );
    try {
      streamCommand({
        command: "subscribe",
        subscriptionId: id2,
        generation: owner.generation,
        source: { kind: "run-events", runId: owner.runId, after: owner.after }
      });
    } catch (error) {
      subscriptions.delete(id2);
      owner.reject(error);
    }
    return { id: id2, closed: task2 };
  };
  const unsubscribe = async (id2) => {
    const owner = subscriptions.get(id2);
    if (!owner) {
      return;
    }
    owner.stop.abort();
    subscriptions.delete(id2);
    try {
      if (!closed) {
        streamCommand({ command: "unsubscribe", subscriptionId: id2, generation: owner.generation });
      }
    } finally {
      await owner.delivery;
      owner.resolve();
    }
    await owner.task;
  };
  let closePromise = null;
  const close = () => {
    if (closePromise) {
      return closePromise;
    }
    const tasks = [...subscriptionTasks];
    closePromise = Promise.resolve().then(async () => {
      await Promise.allSettled(tasks);
      if (subscriptionFailures.length || droppedSubscriptionFailures) {
        throw new AggregateError(
          subscriptionFailures.slice(),
          "Plugin subscriptions failed to close; additional=" + droppedSubscriptionFailures
        );
      }
    });
    void closePromise.catch(() => void 0);
    stopConnection();
    return closePromise;
  };
  const expireGrant = () => {
    if (closed) return;
    const remaining = connection.expiresAt - Date.now();
    if (remaining <= 0) {
      void close();
      return;
    }
    expiryTimer = setTimeout(expireGrant, Math.min(2147483647, remaining));
  };
  expireGrant();
  return Object.freeze({
    protocolVersion: 4,
    request,
    settings: {
      async read(signal) {
        const result = await request({ method: "settings.read", params: {} }, signal);
        if (result.method !== "settings.read") {
          throw new PluginSdkFailure("invalid_input", null, false);
        }
        return result.value;
      },
      async write(input, signal) {
        const result = await request(
          {
            method: "settings.write",
            params: {
              operationKey: input.operationKey,
              expectedPackageRevision: input.expectedPackageRevision,
              expectedRevision: input.expectedRevision,
              schemaRevision: input.schemaRevision,
              documentJson: input.documentJson
            }
          },
          signal
        );
        if (result.method !== "settings.write") {
          throw new PluginSdkFailure("invalid_input", input.operationKey, true);
        }
        return result.value;
      }
    },
    ui: uiClient.ui,
    agent: { runs: { subscribe, unsubscribe } },
    close
  });
}
export {
  PluginUiRequestFailure,
  connectNexusPlugin
};
