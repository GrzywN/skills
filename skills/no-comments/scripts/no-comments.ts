import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseSync } from 'oxc-parser';
import { parse as parseHtml } from 'parse5';
import postcss from 'postcss';

export interface Comment {
  line: number;
  text: string;
  isExportedJsdoc: boolean;
}

export interface AllowOptions {
  extraPrefixes: readonly string[];
  allowExportedJsdoc: boolean;
}

export interface Violation {
  path: string;
  line: number;
  text: string;
}

export class SetupError extends Error {}

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const STYLE_EXTENSIONS = new Set(['.css']);
const INLINE_SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const EXPORT_STATEMENTS = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
  'TSExportAssignment',
]);

const DIRECTIVE_PREFIXES = [
  'biome-ignore',
  'eslint-disable',
  'eslint-enable',
  'eslint-env',
  'oxlint-disable',
  'oxlint-enable',
  'stylelint-disable',
  'stylelint-enable',
  'prettier-ignore',
  '@ts-expect-error',
  '@ts-ignore',
  '@ts-nocheck',
  '@ts-check',
  '@vitest-environment',
  '@jest-environment',
  'istanbul ignore',
  'c8 ignore',
  'v8 ignore',
  '@vite-ignore',
  'webpackChunkName',
  'webpackMode',
  'webpackPrefetch',
  'webpackPreload',
  'webpackFetchPriority',
  'webpackIgnore',
  'webpackInclude',
  'webpackExclude',
  'webpackExports',
  '@__PURE__',
  '#__PURE__',
  '@__NO_SIDE_EFFECTS__',
  '@jsx',
  '# sourceMappingURL=',
  '@license',
  '@preserve',
];

const REGRESSION_MARKER = 'regression:';

const COMMENT_OPENERS = ['<!--', '/**', '/*', '///', '//'];
const COMMENT_CLOSERS = ['-->', '*/'];

export function hasSupportedExtension(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return [TYPESCRIPT_EXTENSIONS, JAVASCRIPT_EXTENSIONS, HTML_EXTENSIONS, STYLE_EXTENSIONS].some((extensions) =>
    extensions.has(extension),
  );
}

function lineLocator(content: string): (offset: number) => number {
  const lineStarts = [0];
  for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
    lineStarts.push(index + 1);
  }

  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low + 1;
  };
}

function shiftLines(comments: Comment[], firstLine: number): Comment[] {
  return comments.map((comment) => ({ ...comment, line: comment.line + firstLine - 1 }));
}

interface Statement {
  type: string;
  start: number;
  end: number;
}

function documentsAnExport(statements: readonly Statement[], start: number, end: number): boolean {
  const isInsideStatement = statements.some((statement) => statement.start < start && statement.end > end);
  const nextStatement = statements.find((statement) => statement.start >= end);
  return !isInsideStatement && nextStatement !== undefined && EXPORT_STATEMENTS.has(nextStatement.type);
}

function scriptComments(path: string, content: string): Comment[] {
  const extension = extname(path).toLowerCase();
  const lang = TYPESCRIPT_EXTENSIONS.has(extension) ? (extension === '.tsx' ? 'tsx' : 'ts') : 'jsx';
  const sourceType = extension === '.cjs' || extension === '.cts' ? 'commonjs' : 'unambiguous';
  const result = parseSync(path, content, { lang, sourceType });
  const firstError = result.errors[0];
  if (firstError) {
    throw new SetupError(`${path}: cannot parse.${firstError.codeframe ?? ` ${firstError.message}`}`);
  }
  const lineOf = lineLocator(content);
  const isHashbang = (start: number): boolean => start === 0 && content.startsWith('#!');

  return result.comments
    .filter((comment) => !isHashbang(comment.start))
    .map((comment) => ({
      line: lineOf(comment.start),
      text: content.slice(comment.start, comment.end),
      isExportedJsdoc:
        comment.type === 'Block' &&
        comment.value.startsWith('*') &&
        documentsAnExport(result.program.body, comment.start, comment.end),
    }));
}

const BYTE_ORDER_MARK = '\uFEFF';

function parseStyles(path: string, styles: string): ReturnType<typeof postcss.parse> {
  try {
    return postcss.parse(styles);
  } catch (error) {
    throw new SetupError(`${path}: cannot parse. ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

function styleComments(path: string, content: string): Comment[] {
  const lineOf = lineLocator(content);
  const offset = content.startsWith(BYTE_ORDER_MARK) ? BYTE_ORDER_MARK.length : 0;
  const comments: Comment[] = [];
  parseStyles(path, content.slice(offset)).walkComments((node) => {
    const start = (node.source?.start?.offset ?? 0) + offset;
    const end = (node.source?.end?.offset ?? 0) + offset;
    comments.push({ line: lineOf(start), text: content.slice(start, end), isExportedJsdoc: false });
  });
  return comments;
}

interface HtmlNode {
  nodeName: string;
  value?: string;
  attrs?: ReadonlyArray<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  content?: HtmlNode;
  sourceCodeLocation?: { startLine: number; startOffset: number; endOffset: number } | null;
}

function inlineCode(element: HtmlNode): { text: string; firstLine: number } | null {
  const textNode = element.childNodes?.find((child) => child.nodeName === '#text');
  const location = textNode?.sourceCodeLocation;
  return textNode?.value !== undefined && location ? { text: textNode.value, firstLine: location.startLine } : null;
}

function isInlineScript(element: HtmlNode): boolean {
  const attributes = element.attrs ?? [];
  const type = attributes.find((attribute) => attribute.name === 'type')?.value ?? '';
  const mediaType = (type.split(';')[0] ?? '').trim().toLowerCase();
  return !attributes.some((attribute) => attribute.name === 'src') && INLINE_SCRIPT_TYPES.has(mediaType);
}

function htmlNodeComments(node: HtmlNode, path: string, content: string): Comment[] {
  const location = node.sourceCodeLocation;
  if (node.nodeName === '#comment' && location) {
    const text = content.slice(location.startOffset, location.endOffset);
    return [{ line: location.startLine, text, isExportedJsdoc: false }];
  }

  const code = node.nodeName === 'script' || node.nodeName === 'style' ? inlineCode(node) : null;
  if (code && node.nodeName === 'script' && isInlineScript(node)) {
    return shiftLines(scriptComments(`${path}:${code.firstLine}.js`, code.text), code.firstLine);
  }
  if (code && node.nodeName === 'style') {
    return shiftLines(styleComments(`${path}:${code.firstLine}.css`, code.text), code.firstLine);
  }

  const children = [...(node.childNodes ?? []), ...(node.content ? [node.content] : [])];
  return children.flatMap((child) => htmlNodeComments(child, path, content));
}

function htmlComments(path: string, content: string): Comment[] {
  const document = parseHtml(content, { sourceCodeLocationInfo: true, scriptingEnabled: false });
  return htmlNodeComments(document, path, content);
}

export function findComments(path: string, content: string): Comment[] {
  const extension = extname(path).toLowerCase();
  if (HTML_EXTENSIONS.has(extension)) {
    return htmlComments(path, content);
  }
  if (STYLE_EXTENSIONS.has(extension)) {
    return styleComments(path, content);
  }
  return scriptComments(path, content);
}

function commentBody(text: string): string {
  const opener = COMMENT_OPENERS.find((candidate) => text.startsWith(candidate)) ?? '';
  let body = text.slice(opener.length).trimStart();
  while (body.startsWith('*')) {
    body = body.slice(1).trimStart();
  }
  return body;
}

function isRegressionMarker(body: string): boolean {
  if (!body.startsWith(REGRESSION_MARKER)) {
    return false;
  }
  const closer = COMMENT_CLOSERS.find((candidate) => body.endsWith(candidate)) ?? '';
  const rest = body.slice(REGRESSION_MARKER.length, body.length - closer.length).trim();
  const separator = rest.indexOf(':');
  const issueKey = rest.slice(0, separator);
  const issueTitle = rest.slice(separator + 1).trim();
  const hasWhitespace = [...issueKey].some((character) => character.trim() === '');
  return separator > 0 && !hasWhitespace && issueTitle.length > 0;
}

export function isAllowed(comment: Comment, options: AllowOptions): boolean {
  const body = commentBody(comment.text);
  if (comment.text.startsWith('/*!') || (comment.text.startsWith('///') && body.startsWith('<reference'))) {
    return true;
  }
  if ((options.allowExportedJsdoc && comment.isExportedJsdoc) || isRegressionMarker(body)) {
    return true;
  }
  return [...DIRECTIVE_PREFIXES, ...options.extraPrefixes].some((prefix) => body.startsWith(prefix));
}

function normalized(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

export function newComments(before: readonly Comment[], after: readonly Comment[]): Comment[] {
  const remaining = new Map<string, number>();
  for (const comment of before) {
    const key = normalized(comment.text);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  return after.filter((comment) => {
    const key = normalized(comment.text);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      return false;
    }
    return true;
  });
}

function gitEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (environment.GIT_WORK_TREE !== undefined) {
    return environment;
  }
  const withoutHookGitDirectory = { ...environment };
  delete withoutHookGitDirectory.GIT_DIR;
  return withoutHookGitDirectory;
}

function git(root: string, args: readonly string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: root,
      env: gitEnvironment(process.env),
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : '';
    throw new SetupError(`git ${args.join(' ')} failed: ${stderr}`, { cause: error });
  }
}

function gitPaths(root: string, args: readonly string[]): string[] {
  return git(root, args)
    .split('\0')
    .filter((path) => path.length > 0);
}

function pathspecs(paths: readonly string[], excludes: readonly string[]): string[] {
  const included = paths.length > 0 ? paths.map((path) => `:(literal)${path}`) : ['.'];
  return ['--', ...included, ...excludes.map((pattern) => `:(exclude,glob)${pattern}`)];
}

function listedFiles(root: string, paths: readonly string[], excludes: readonly string[], untrackedOnly: boolean) {
  const sources = untrackedOnly ? ['--others'] : ['--cached', '--others'];
  return gitPaths(root, ['ls-files', '-z', ...sources, '--exclude-standard', ...pathspecs(paths, excludes)]);
}

function changedFilesWithBasePath(
  root: string,
  mergeBase: string,
  excludes: readonly string[],
): Map<string, string | null> {
  const tokens = gitPaths(root, [
    'diff',
    '-z',
    '--name-status',
    '--find-renames',
    '--diff-filter=ACMRT',
    mergeBase,
    ...pathspecs([], excludes),
  ]);
  const basePathByFile = new Map<string, string | null>();

  let index = 0;
  while (index < tokens.length) {
    const status = tokens[index] ?? '';
    const isRenameOrCopy = status.startsWith('R') || status.startsWith('C');
    const path = tokens[index + (isRenameOrCopy ? 2 : 1)] ?? '';
    const basePath = status === 'A' ? null : (tokens[index + 1] ?? null);
    basePathByFile.set(path, basePath);
    index += isRenameOrCopy ? 3 : 2;
  }
  for (const path of listedFiles(root, [], excludes, true)) {
    basePathByFile.set(path, null);
  }
  return basePathByFile;
}

export interface CheckOptions extends AllowOptions {
  mode: 'zero' | 'ratchet';
  cwd: string;
  base: string;
  excludes: readonly string[];
  files: readonly string[];
}

export function check(options: CheckOptions): { violations: Violation[]; fileCount: number } {
  const root = git(options.cwd, ['rev-parse', '--show-toplevel']).trim();
  const requested = options.files.filter((path) => path !== '').map((path) => resolve(options.cwd, path));
  const missing = requested.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new SetupError(`file not found: ${missing.join(', ')}`);
  }
  const paths = requested
    .map((path) => relative(root, realpathSync(path)))
    .filter((path) => path !== '..' && !path.startsWith(`..${sep}`));
  if (options.files.length > 0 && paths.length === 0) {
    return { violations: [], fileCount: 0 };
  }
  const mergeBase = options.mode === 'ratchet' ? git(root, ['merge-base', options.base, 'HEAD']).trim() : '';
  const listed = paths.length > 0 ? new Set(listedFiles(root, paths, options.excludes, false)) : null;

  const basePathByFile =
    options.mode === 'ratchet'
      ? changedFilesWithBasePath(root, mergeBase, options.excludes)
      : new Map(listedFiles(root, paths, options.excludes, false).map((path) => [path, null]));
  const files = [...basePathByFile.keys()].filter(
    (path) =>
      (listed === null || listed.has(path)) &&
      hasSupportedExtension(path) &&
      lstatSync(join(root, path), { throwIfNoEntry: false })?.isFile() === true,
  );

  const blocked = (path: string, content: string): Comment[] =>
    findComments(path, content).filter((comment) => !isAllowed(comment, options));
  const blockedOrNothing = (path: string, content: string): Comment[] => {
    try {
      return blocked(path, content);
    } catch (error) {
      if (error instanceof SetupError) {
        return [];
      }
      throw error;
    }
  };

  const violations = files.flatMap((path) => {
    const basePath = basePathByFile.get(path) ?? null;
    const before = basePath === null ? [] : blockedOrNothing(path, git(root, ['show', `${mergeBase}:${basePath}`]));
    const after = blocked(path, readFileSync(join(root, path), 'utf8'));
    return newComments(before, after).map((comment) => ({
      path,
      line: comment.line,
      text: comment.text.split('\n')[0] ?? '',
    }));
  });

  return { violations, fileCount: files.length };
}

const USAGE = `Usage: node no-comments.ts [--mode zero|ratchet] [--base <ref>] [--allow <prefix>]... [--exclude <glob>]... [--allow-exported-jsdoc] [file...]

  --mode zero              every comment fails (default)
  --mode ratchet           only comments that are new against the merge base with --base fail
  --base <ref>             the branch to compare with in ratchet mode, for example origin/main
  --allow <prefix>         one more tool directive to allow, for example "fallow-ignore"
  --exclude <glob>         a path to skip, from the repository root, for example "**/vendor/**"
  --allow-exported-jsdoc   allow JSDoc directly above a top-level export, for published libraries
  file...                  check only these files, for hooks and pre-commit

Exit codes: 0 clean, 1 comments found, 2 usage, git or parse error.`;

function readArguments() {
  return parseArgs({
    allowPositionals: true,
    options: {
      mode: { type: 'string', default: 'zero' },
      base: { type: 'string', default: '' },
      allow: { type: 'string', multiple: true, default: [] },
      exclude: { type: 'string', multiple: true, default: [] },
      'allow-exported-jsdoc': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
}

function main(): void {
  let parsed: ReturnType<typeof readArguments>;
  try {
    parsed = readArguments();
  } catch (error) {
    process.stderr.write(`no-comments: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const { values, positionals } = parsed;
  const mode = values.mode;
  if (values.help || (mode !== 'zero' && mode !== 'ratchet') || (mode === 'ratchet' && values.base === '')) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = values.help ? 0 : 2;
    return;
  }

  const { violations, fileCount } = check({
    mode,
    cwd: process.cwd(),
    base: values.base,
    extraPrefixes: values.allow,
    excludes: values.exclude,
    allowExportedJsdoc: values['allow-exported-jsdoc'],
    files: positionals,
  });

  if (violations.length === 0) {
    process.stdout.write(`no-comments: clean, ${fileCount} files checked in ${mode} mode.\n`);
    return;
  }

  for (const violation of violations) {
    process.stderr.write(`${violation.path}:${violation.line}: ${violation.text}\n`);
  }
  process.stderr.write(
    `no-comments: ${violations.length} comment(s) found. Delete a comment that repeats the code. Put intent in a name, an assert, or a test name. Move a decision, a pitfall, a workaround or a fact about an external system to docs/.\n`,
  );
  process.exitCode = 1;
}

function isRunDirectly(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && existsSync(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

if (isRunDirectly()) {
  try {
    main();
  } catch (error) {
    const message = error instanceof SetupError ? error.message : error instanceof Error ? error.stack : String(error);
    process.stderr.write(`no-comments: ${message}\n`);
    process.exitCode = 2;
  }
}
