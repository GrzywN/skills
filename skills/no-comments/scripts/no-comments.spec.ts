import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import fc from 'fast-check';
import {
  type AllowOptions,
  type Comment,
  SetupError,
  check,
  findComments,
  isAllowed,
  newComments,
} from './no-comments.ts';

const DEFAULTS: AllowOptions = { extraPrefixes: [], allowExportedJsdoc: false };
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'no-comments.ts');

function texts(path: string, content: string): string[] {
  return findComments(path, content).map((comment) => comment.text);
}

function blocked(path: string, content: string, options = DEFAULTS): string[] {
  return findComments(path, content)
    .filter((comment) => !isAllowed(comment, options))
    .map((comment) => comment.text);
}

describe('findComments', () => {
  const cases: Array<[string, string, string, string[]]> = [
    ['a line comment in TS', 'a.ts', 'const a = 1; // note\n', ['// note']],
    ['a block comment in JS', 'a.js', '/* note */\nconst a = 1;\n', ['/* note */']],
    ['a JSX comment in TSX', 'a.tsx', 'const a = <div>{/* note */}</div>;\n', ['/* note */']],
    ['a JSX comment in a .js file', 'a.js', 'const a = <div>{/* note */}</div>;\n', ['/* note */']],
    ['every copy of a repeated comment', 'a.ts', '// same\n// same\n// same\n', ['// same', '// same', '// same']],
    ['no comment in a regex literal', 'a.ts', 'const r = /\\/\\//;\n', []],
    ['no comment in a URL string', 'a.ts', 'const u = "https://example.com";\n', []],
    ['no comment in a template literal', 'a.ts', 'const t = `// /* */`;\n', []],
    ['a comment after a hashbang, but not the hashbang', 'a.mjs', '#!/usr/bin/env node\n// note\n', ['// note']],
    ['a comment in a TS type assertion file', 'a.ts', 'const a = <string>b; // note\n', ['// note']],
    ['a comment in CommonJS TS with a top-level return', 'a.cts', 'if (done) return;\n// note\n', ['// note']],
    ['a comment in an .htm file', 'a.htm', '<!-- note -->\n', ['<!-- note -->']],
    ['a comment in a script whose type has spaces', 'a.html', '<script type=" module ">// note\n</script>\n', ['// note']],
    ['a comment in an application/javascript script', 'a.html', '<script type="application/javascript">// note\n</script>\n', ['// note']],
    ['an HTML comment', 'a.html', '<p>Hi</p>\n<!-- note -->\n', ['<!-- note -->']],
    ['a comment in an inline script', 'a.html', '<script>\nconst a = 1; // note\n</script>\n', ['// note']],
    ['a comment in a module script', 'a.html', '<script type="module">// note\n</script>\n', ['// note']],
    ['a comment in a script with a charset', 'a.html', '<script type="Text/JavaScript; charset=utf-8">// note\n</script>\n', ['// note']],
    ['no comment in a script with src', 'a.html', '<script src="/a.js">// not run\n</script>\n', []],
    ['a comment in an inline style', 'a.html', '<style>\n/* note */\np { color: red; }\n</style>\n', ['/* note */']],
    ['no comment in JSON-LD', 'a.html', '<script type="application/ld+json">{"a": "// b"}</script>\n', []],
    ['a comment in a template element', 'a.html', '<template><!-- note --><p></p></template>\n', ['<!-- note -->']],
    ['a comment in a noscript element', 'a.html', '<body><noscript><!-- note --><img src="a.png"></noscript></body>\n', ['<!-- note -->']],
    ['a CSS comment', 'a.css', 'p {\n  /* note */\n  color: red;\n}\n', ['/* note */']],
    ['no comment in a CSS string', 'a.css', 'p::before { content: "/* no */"; }\n', []],
    ['a CSS comment after a byte order mark', 'a.css', '\uFEFFp {}\n/* note */\n', ['/* note */']],
    ['a comment in a file with an upper-case extension', 'A.TS', 'const a = 1; // note\n', ['// note']],
    ['a comment in CommonJS with a top-level return', 'a.cjs', 'if (done) return;\n// note\n', ['// note']],
  ];

  for (const [name, path, content, expected] of cases) {
    it(`finds ${name}`, () => {
      deepStrictEqual(texts(path, content), expected);
    });
  }

  const lines: Array<[string, string, string, number]> = [
    ['TS', 'a.ts', 'const a = 1;\n\n// note\n', 3],
    ['HTML', 'a.html', '<p>\n</p>\n\n<!-- note -->\n', 4],
    ['inline script', 'a.html', '<p></p>\n<script>\nconst a = 1;\n// note\n</script>\n', 4],
    ['inline style', 'a.html', '<p></p>\n<style>\np {}\n/* note */\n</style>\n', 4],
    ['CSS', 'a.css', 'p {}\n\n/* note */\n', 3],
    ['TS after non-ASCII text', 'a.ts', 'const a = "żółć 🚽";\n// note\n', 2],
  ];

  for (const [name, path, content, line] of lines) {
    it(`reports the line of a comment in ${name}`, () => {
      strictEqual(findComments(path, content)[0]?.line, line);
    });
  }

  it('reports the line of each comment in a long file', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), (lineCount) => {
        const content = Array.from({ length: lineCount }, (_unused, index) => `const v${index} = 1; // c\n`).join('');
        const found = findComments('a.ts', content).map((comment) => comment.line);
        deepStrictEqual(
          found,
          Array.from({ length: lineCount }, (_unused, index) => index + 1),
        );
      }),
      { numRuns: 20 },
    );
  });

  const unparsable: Array<[string, string, string]> = [
    ['TS', 'a.ts', 'const = ;\n'],
    ['CSS', 'a.css', 'p {\n'],
    ['an inline style', 'a.html', '<style>p {</style>\n'],
  ];

  for (const [name, path, content] of unparsable) {
    it(`throws a SetupError on ${name} it cannot parse, so no comment is missed in silence`, () => {
      throws(() => findComments(path, content), SetupError);
    });
  }

  it('finds no comment in any string literal', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        deepStrictEqual(texts('a.ts', `const value = ${JSON.stringify(value)};\n`), []);
      }),
    );
  });
});

describe('isAllowed', () => {
  const allowed: Array<[string, string, string]> = [
    ['a Biome directive with its reason', 'a.ts', '// biome-ignore lint/style/noMagicNumbers: the API sends seconds\nconst a = 60;\n'],
    ['a TypeScript directive', 'a.ts', '// @ts-expect-error the type is wrong upstream\nconst a: string = 1;\n'],
    ['an ESLint block directive', 'a.ts', '/* eslint-disable no-console */\nconsole.log(1);\n'],
    ['a coverage directive', 'a.ts', '/* v8 ignore next */\nconst a = 1;\n'],
    ['a test environment directive', 'a.ts', '// @vitest-environment node\nconst a = 1;\n'],
    ['a multi-line test environment docblock', 'a.ts', '/**\n * @jest-environment jsdom\n */\nconst a = 1;\n'],
    ['a regression marker', 'a.ts', "// regression: PROJ-249: Marker stays on the map\nit('hides the marker', () => {});\n"],
    ['a regression marker with a GitHub issue', 'a.ts', "// regression: #412: Marker stays on the map\nit('hides the marker', () => {});\n"],
    ['a license header', 'a.ts', '/*! MIT License */\nconst a = 1;\n'],
    ['a @license block', 'a.ts', '/** @license MIT */\nconst a = 1;\n'],
    ['a multi-line @license block', 'a.ts', '/**\n * @license MIT\n */\nconst a = 1;\n'],
    ['a @license block with three stars', 'a.ts', '/***\n * @license MIT\n */\nconst a = 1;\n'],
    ['a triple-slash reference', 'a.ts', '/// <reference types="vite/client" />\nconst a = 1;\n'],
    ['a triple-slash reference with no space', 'a.ts', '///<reference types="vite/client" />\nconst a = 1;\n'],
    ['a pure annotation', 'a.ts', 'const a = /* @__PURE__ */ make();\n'],
    ['a webpack magic comment', 'a.ts', "const m = import(/* webpackChunkName: 'map' */ './map');\n"],
    ['a JSX pragma', 'a.tsx', '/** @jsxImportSource preact */\nconst a = <div />;\n'],
    ['a source map URL', 'a.js', 'const a = 1;\n//# sourceMappingURL=a.js.map\n'],
    ['a Prettier directive in HTML', 'a.html', '<!-- prettier-ignore -->\n<p></p>\n'],
    ['a Stylelint directive in CSS', 'a.css', '/* stylelint-disable-next-line */\np {}\n'],
  ];

  for (const [name, path, content] of allowed) {
    it(`allows ${name}`, () => {
      deepStrictEqual(blocked(path, content), []);
    });
  }

  const prose: Array<[string, string, string]> = [
    ['a line comment', 'a.ts', '// Load the map first.\nconst a = 1;\n'],
    ['a JSDoc block', 'a.ts', '/** The user. */\nconst user = 1;\n'],
    ['a comment that mentions a directive later', 'a.ts', '// We need biome-ignore here.\nconst a = 1;\n'],
    ['prose that starts with a tool name', 'a.ts', '// eslint is wrong about this one\nconst a = 1;\n'],
    ['prose about webpack', 'a.ts', '// webpack loads this chunk lazily\nconst a = 1;\n'],
    ['a regression note with no issue key', 'a.ts', '// regression: we tried a cache here\nconst a = 1;\n'],
    ['a regression note with no issue title', 'a.ts', '// regression: PROJ-249:\nconst a = 1;\n'],
    ['a regression note with no colon after the key', 'a.ts', '// regression: PROJ-249\nconst a = 1;\n'],
    ['a regression note with a space in the key', 'a.ts', '// regression: we tried: a cache\nconst a = 1;\n'],
    ['a regression note with a tab in the key', 'a.ts', '// regression: PROJ\t249: title\nconst a = 1;\n'],
    ['a block regression note with no issue title', 'a.ts', '/* regression: PROJ-249: */\nconst a = 1;\n'],
    ['an HTML regression note with no issue title', 'a.html', '<!-- regression: PROJ-249: -->\n'],
    ['a triple-slash prose note', 'a.ts', '/// prose note\nconst a = 1;\n'],
    ['a block comment that mentions a reference', 'a.ts', '/* <reference types="x" /> */\nconst a = 1;\n'],
    ['a section comment in HTML', 'a.html', '<!-- Header -->\n<header></header>\n'],
    ['a section comment in CSS', 'a.css', '/* Buttons */\nbutton {}\n'],
  ];

  for (const [name, path, content] of prose) {
    it(`blocks ${name}`, () => {
      strictEqual(blocked(path, content).length, 1);
    });
  }

  it('allows a project prefix given with --allow', () => {
    const content = '// fallow-ignore-next-line\nconst a = 1;\n';
    deepStrictEqual(blocked('a.ts', content, { ...DEFAULTS, extraPrefixes: ['fallow-ignore'] }), []);
  });

  const jsdoc: Array<[string, string, number]> = [
    ['JSDoc on an exported function', '/** Adds. */\nexport function add() {}\n', 0],
    ['JSDoc on the same line as the export', '/** Adds. */export function add() {}\n', 0],
    ['JSDoc on a default export', '/** Adds. */\nexport default function add() {}\n', 0],
    ['JSDoc on a decorated exported class', '/** A service. */\n@Injectable()\nexport class Places {}\n', 0],
    ['JSDoc on a re-export', '/** All helpers. */\nexport * from "./helpers";\n', 0],
    ['JSDoc on an export assignment', '/** The module. */\nexport = {};\n', 0],
    ['JSDoc on a local function', '/** Adds. */\nfunction add() {}\n', 1],
    ['a block comment that is not JSDoc', '/* Adds. */\nexport function add() {}\n', 1],
    ['a line comment on an export', '// Adds.\nexport function add() {}\n', 1],
    ['a line comment that starts with a star', '//* Adds.\nexport function add() {}\n', 1],
    ['JSDoc with code before the export', '/** Adds. */\nconst a = 1;\nexport function add() {}\n', 1],
    ['JSDoc inside a function before an export', 'function f() {\n  /** Inner. */\n}\nexport const a = 1;\n', 1],
  ];

  for (const [name, content, count] of jsdoc) {
    it(`with --allow-exported-jsdoc, blocks ${count} for ${name}`, () => {
      strictEqual(blocked('a.ts', content, { ...DEFAULTS, allowExportedJsdoc: true }).length, count);
    });
  }

  it('blocks JSDoc on an export without --allow-exported-jsdoc', () => {
    strictEqual(blocked('a.ts', '/** Adds. */\nexport function add() {}\n').length, 1);
  });
});

describe('newComments', () => {
  const comment = (text: string, line = 1): Comment => ({ text, line, isExportedJsdoc: false });

  it('returns nothing when the comments only move', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (bodies) => {
        const before = bodies.map((body, index) => comment(`// ${body}`, index));
        const later = [...before].reverse().map((moved, index) => ({ ...moved, line: index + 100 }));
        deepStrictEqual(newComments(before, later), []);
      }),
    );
  });

  it('returns each added comment, also when it copies an old one', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), fc.array(fc.string(), { minLength: 1 }), (bodies, added) => {
        const before = bodies.map((body) => comment(`// ${body}`));
        const later = [...before, ...added.map((body) => comment(`// ${body}`))];
        strictEqual(newComments(before, later).length, added.length);
      }),
    );
  });

  const cases: Array<[string, string[], string[], string[]]> = [
    ['an edited comment is new', ['// old'], ['// new'], ['// new']],
    ['each extra copy of an old comment is new', ['// note'], ['// note', '// note', '// note'], ['// note', '// note']],
    ['a re-indented block is not new', ['/*\n  a\n  b\n*/'], ['/*\n      a\n      b\n    */'], []],
    ['a deleted comment is not reported', ['// a', '// b'], ['// a'], []],
  ];

  for (const [name, before, later, expected] of cases) {
    it(name, () => {
      const found = newComments(before.map((text) => comment(text)), later.map((text) => comment(text)));
      deepStrictEqual(
        found.map((item) => item.text),
        expected,
      );
    });
  }
});

describe('check', () => {
  const repositories: string[] = [];
  after(() => {
    for (const directory of repositories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function git(directory: string, ...args: string[]): void {
    execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  }

  function write(directory: string, path: string, content: string): void {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  }

  function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'no-comments-'));
    repositories.push(directory);
    return directory;
  }

  function repository(): string {
    const directory = temporaryDirectory();
    git(directory, 'init', '--quiet', '--initial-branch=main');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');
    write(directory, 'old.ts', '// old note\nconst a = 1;\n');
    write(directory, 'clean.ts', 'const b = 2;\n');
    write(directory, 'sub/żółć.ts', '// old sub note\nconst c = 3;\n');
    write(directory, 'vendor/lib.ts', '// vendored note\nconst d = 4;\n');
    write(directory, 'notes.md', '<!-- not checked -->\n');
    write(directory, '.gitignore', 'node_modules/\n');
    write(directory, 'node_modules/dep.js', '// ignored dependency note\n');
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '--message', 'base');
    git(directory, 'switch', '--quiet', '--create', 'feature');
    return directory;
  }

  const options = { ...DEFAULTS, base: 'main', excludes: ['vendor/**'], files: [] };

  it('zero mode reports old comments in tracked files, including non-ASCII paths', () => {
    const directory = repository();
    const { violations } = check({ ...options, cwd: directory, mode: 'zero' });
    deepStrictEqual(violations, [
      { path: 'old.ts', line: 1, text: '// old note' },
      { path: 'sub/żółć.ts', line: 1, text: '// old sub note' },
    ]);
  });

  it('zero mode reports comments in untracked files', () => {
    const directory = repository();
    write(directory, 'added.ts', '// added note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', excludes: ['vendor/**', 'old.ts', 'sub/**'] });
    deepStrictEqual(violations, [{ path: 'added.ts', line: 1, text: '// added note' }]);
  });

  it('ratchet mode ignores old comments and reports new ones in tracked and untracked files', () => {
    const directory = repository();
    write(directory, 'clean.ts', 'const b = 2; // new note\n');
    write(directory, 'added.css', '/* new file */\np {}\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [
      { path: 'clean.ts', line: 1, text: '// new note' },
      { path: 'added.css', line: 1, text: '/* new file */' },
    ]);
  });

  it('ratchet mode reports an edited comment', () => {
    const directory = repository();
    write(directory, 'old.ts', '// old note, reworded\nconst a = 1;\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'old.ts', line: 1, text: '// old note, reworded' }]);
  });

  it('ratchet mode compares with the merge base, not with the tip of the base branch', () => {
    const directory = repository();
    git(directory, 'switch', '--quiet', 'main');
    write(directory, 'clean.ts', '// note merged on main later\nconst b = 2;\n');
    git(directory, 'commit', '--quiet', '--all', '--message', 'main moves on');
    git(directory, 'switch', '--quiet', 'feature');
    write(directory, 'clean.ts', '// note merged on main later\nconst b = 2;\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'clean.ts', line: 1, text: '// note merged on main later' }]);
  });

  it('ratchet mode follows a renamed file to its old comments', () => {
    const directory = repository();
    git(directory, 'mv', 'old.ts', 'renamed.ts');
    git(directory, 'commit', '--quiet', '--message', 'rename');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, []);
  });

  it('ratchet mode follows a rename also when the file is given on the command line', () => {
    const directory = repository();
    git(directory, 'mv', 'old.ts', 'renamed.ts');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet', files: ['renamed.ts'] });
    deepStrictEqual(violations, []);
  });

  it('ratchet mode reads every entry after a rename', () => {
    const directory = repository();
    git(directory, 'mv', 'old.ts', 'a-renamed.ts');
    write(directory, 'clean.ts', 'const b = 2; // new note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'clean.ts', line: 1, text: '// new note' }]);
  });

  it('ratchet mode treats a staged new file as all new', () => {
    const directory = repository();
    write(directory, 'staged.ts', '// staged note\n');
    git(directory, 'add', 'staged.ts');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'staged.ts', line: 1, text: '// staged note' }]);
  });

  it('ratchet mode parses the old version with the new file type after a rename', () => {
    const directory = repository();
    const rules = '.a { color: red; }\n.b { color: blue; }\n.c { color: green; }\n.d { color: black; }\n';
    write(directory, 'theme.scss', `// a Sass note\n${rules}.p {\n`);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '--message', 'sass');
    git(directory, 'switch', '--quiet', 'main');
    git(directory, 'merge', '--quiet', 'feature');
    git(directory, 'switch', '--quiet', '--create', 'css');
    git(directory, 'mv', 'theme.scss', 'theme.css');
    write(directory, 'theme.css', `/* a CSS note */\n${rules}`);
    git(directory, 'add', '--all');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'theme.css', line: 1, text: '/* a CSS note */' }]);
  });

  it('checks a file with an upper-case extension', () => {
    const directory = repository();
    write(directory, 'Upper.TS', '// upper note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', excludes: ['vendor/**', 'sub/**', 'old.ts'] });
    deepStrictEqual(violations, [{ path: 'Upper.TS', line: 1, text: '// upper note' }]);
  });

  it('skips a tracked file that is deleted from the working tree', () => {
    const directory = repository();
    unlinkSync(join(directory, 'old.ts'));
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', excludes: ['vendor/**', 'sub/**'] });
    deepStrictEqual(violations, []);
  });

  it('reports only the first line of a multi-line comment', () => {
    const directory = repository();
    write(directory, 'clean.ts', '/*\n  first\n  second\n*/\nconst b = 2;\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'clean.ts', line: 1, text: '/*' }]);
  });

  it('checks a root file whose name starts with two dots', () => {
    const directory = repository();
    write(directory, '..notes.ts', '// dot note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', files: ['..notes.ts'] });
    deepStrictEqual(violations, [{ path: '..notes.ts', line: 1, text: '// dot note' }]);
  });

  it('checks a file given through a symlink to the repository', () => {
    const directory = repository();
    const link = join(temporaryDirectory(), 'link');
    symlinkSync(directory, link);
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', files: [join(link, 'old.ts')] });
    deepStrictEqual(violations, [{ path: 'old.ts', line: 1, text: '// old note' }]);
  });

  it('skips a submodule whose directory name looks like a source file', () => {
    const directory = repository();
    const library = repository();
    execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', '--quiet', 'add', library, 'chart.js'], {
      cwd: directory,
      stdio: 'ignore',
    });
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', excludes: ['vendor/**', 'sub/**', 'old.ts'] });
    deepStrictEqual(violations, []);
  });

  it('ratchet mode with a file argument reports only that file', () => {
    const directory = repository();
    write(directory, 'clean.ts', 'const b = 2; // new note\n');
    write(directory, 'old.ts', '// old note\nconst a = 1; // other new note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet', files: ['clean.ts'] });
    deepStrictEqual(violations, [{ path: 'clean.ts', line: 1, text: '// new note' }]);
  });

  it('ratchet mode follows a rename also when git config turns rename detection off', () => {
    const directory = repository();
    git(directory, 'config', 'diff.renames', 'false');
    git(directory, 'mv', 'old.ts', 'renamed.ts');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, []);
  });

  it('a git hook in a linked worktree checks that worktree also from a subdirectory', () => {
    const directory = repository();
    const worktree = join(temporaryDirectory(), 'worktree');
    git(directory, 'worktree', 'add', '--quiet', '-b', 'hooked', worktree);
    write(worktree, 'clean.ts', 'const b = 2; // new root note\n');
    const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: worktree, encoding: 'utf8' }).trim();
    const result = spawnSync(process.execPath, [SCRIPT, '--mode', 'ratchet', '--base', 'main', '--exclude', 'vendor/**'], {
      cwd: join(worktree, 'sub'),
      env: { ...process.env, GIT_DIR: gitDirectory },
      encoding: 'utf8',
    });
    deepStrictEqual([result.status, result.stderr.split('\n')[0]], [1, 'clean.ts:1: // new root note']);
  });

  it('ratchet mode skips an excluded untracked file', () => {
    const directory = repository();
    write(directory, 'vendor/new.ts', '// new vendored note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, []);
  });

  it('ratchet mode checks a file that was a symlink on the base branch', () => {
    const directory = repository();
    git(directory, 'switch', '--quiet', 'main');
    symlinkSync('clean.ts', join(directory, 'link.ts'));
    git(directory, 'add', 'link.ts');
    git(directory, 'commit', '--quiet', '--message', 'link');
    git(directory, 'switch', '--quiet', '--create', 'unlink');
    unlinkSync(join(directory, 'link.ts'));
    write(directory, 'link.ts', '// brand new note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, [{ path: 'link.ts', line: 1, text: '// brand new note' }]);
  });

  it('skips a tracked symlink, so each comment is reported once', () => {
    const directory = repository();
    symlinkSync('old.ts', join(directory, 'link.ts'));
    git(directory, 'add', 'link.ts');
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', excludes: ['vendor/**', 'sub/**'] });
    deepStrictEqual(violations, [{ path: 'old.ts', line: 1, text: '// old note' }]);
  });

  it('takes a file argument literally, not as a glob', () => {
    const directory = repository();
    write(directory, '[x]*.ts', 'const x = 1;\n');
    write(directory, 'xx.ts', '// glob note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', files: ['[x]*.ts'] });
    deepStrictEqual(violations, []);
  });

  it('skips the directory above the repository and an empty file argument', () => {
    const directory = repository();
    const { violations, fileCount } = check({ ...options, cwd: directory, mode: 'zero', files: ['..', ''] });
    deepStrictEqual([violations, fileCount], [[], 0]);
  });

  it('ratchet mode skips excluded paths', () => {
    const directory = repository();
    write(directory, 'vendor/lib.ts', '// vendored note\n// new vendored note\n');
    const { violations } = check({ ...options, cwd: directory, mode: 'ratchet' });
    deepStrictEqual(violations, []);
  });

  it('works the same from a subdirectory', () => {
    const directory = repository();
    write(directory, 'sub/żółć.ts', '// old sub note\nconst c = 3; // new sub note\n');
    const fromRoot = check({ ...options, cwd: directory, mode: 'ratchet' });
    const fromSubdirectory = check({ ...options, cwd: join(directory, 'sub'), mode: 'ratchet' });
    const withFile = check({ ...options, cwd: join(directory, 'sub'), mode: 'ratchet', files: ['żółć.ts'] });
    const expected = [{ path: 'sub/żółć.ts', line: 2, text: '// new sub note' }];
    deepStrictEqual([fromRoot.violations, fromSubdirectory.violations, withFile.violations], [expected, expected, expected]);
  });

  it('checks only the given files, by relative or absolute path', () => {
    const directory = repository();
    write(directory, 'old.ts', '// old note\nconst a = 1; // new note\n');
    const relativeRun = check({ ...options, cwd: directory, mode: 'zero', files: ['clean.ts'] });
    const absoluteRun = check({ ...options, cwd: directory, mode: 'ratchet', files: [join(directory, 'old.ts')] });
    deepStrictEqual(
      [relativeRun.violations, absoluteRun.violations],
      [[], [{ path: 'old.ts', line: 2, text: '// new note' }]],
    );
  });

  it('skips a given file outside the repository, and does not check the whole repository instead', () => {
    const directory = repository();
    const outside = mkdtempSync(join(tmpdir(), 'no-comments-outside-'));
    repositories.push(outside);
    write(outside, 'memory.ts', '// a note outside the repository\n');
    const { violations, fileCount } = check({ ...options, cwd: directory, mode: 'zero', files: [join(outside, 'memory.ts')] });
    deepStrictEqual([violations, fileCount], [[], 0]);
  });

  it('skips a given file that matches --exclude', () => {
    const directory = repository();
    const { violations } = check({ ...options, cwd: directory, mode: 'zero', files: ['vendor/lib.ts'] });
    deepStrictEqual(violations, []);
  });

  it('throws a SetupError for a given file that does not exist', () => {
    const directory = repository();
    throws(() => check({ ...options, cwd: directory, mode: 'zero', files: ['missing.ts'] }), SetupError);
  });

  it('throws a SetupError for a base branch that does not exist', () => {
    const directory = repository();
    throws(() => check({ ...options, cwd: directory, mode: 'ratchet', base: 'origin/nothing' }), SetupError);
  });

  const exits: Array<[string, string[], (directory: string) => void, number]> = [
    ['0 when clean', ['--exclude', 'old.ts', '--exclude', 'sub/**', '--exclude', 'vendor/**'], () => {}, 0],
    ['0 for --help', ['--help'], () => {}, 0],
    ['1 when it finds a comment', [], () => {}, 1],
    ['2 for an unknown mode', ['--mode', 'strict'], () => {}, 2],
    ['2 for ratchet mode without a base', ['--mode', 'ratchet'], () => {}, 2],
    ['2 for an unknown option', ['--exlude', 'vendor/**'], () => {}, 2],
    ['2 for an option without a value', ['--mode'], () => {}, 2],
    ['2 for a TS file it cannot parse', ['broken.ts'], (directory) => write(directory, 'broken.ts', 'const = ;\n'), 2],
    ['2 for a CSS file it cannot parse', ['broken.css'], (directory) => write(directory, 'broken.css', 'p {\n'), 2],
  ];

  for (const [name, args, prepare, status] of exits) {
    it(`the CLI exits with ${name}`, () => {
      const directory = repository();
      prepare(directory);
      const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: directory, encoding: 'utf8' });
      strictEqual(result.status, status);
      ok(!result.stderr.includes('    at '), 'the CLI prints a message, not a stack trace');
    });
  }

  it('the module can be imported without running the CLI', () => {
    const directory = repository();
    const importer = `await import(${JSON.stringify(SCRIPT)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', importer, 'not-a-file'], {
      cwd: directory,
      encoding: 'utf8',
    });
    deepStrictEqual([result.status, result.stdout], [0, '']);
  });

  it('the CLI runs when it is started through a symlink', () => {
    const directory = repository();
    const link = join(temporaryDirectory(), 'no-comments.ts');
    symlinkSync(SCRIPT, link);
    const result = spawnSync(process.execPath, [link], { cwd: directory, encoding: 'utf8' });
    strictEqual(result.status, 1);
  });
});
