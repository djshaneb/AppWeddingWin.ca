import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Load real app declarations into an isolated runtime. Tests provide every
// native/network/storage dependency; this helper never imports the Expo app.
const path = new URL('../app/(tabs)/index.tsx', import.meta.url);
export const appSource = readFileSync(path, 'utf8');
const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

export function appDeclaration(name) {
  let result;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) {
      assert.equal(result, undefined, `Expected one app declaration: ${name}`);
      result = ts.isVariableDeclaration(node) ? `const ${node.getText(ast)};` : node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(result, `Missing app declaration: ${name}`);
  return result;
}

export function loadAppDeclarations(names, globals = {}) {
  const context = vm.createContext({ URL, URLSearchParams, ...globals });
  const code = names.map(appDeclaration).join('\n') + `\nglobalThis.exposed = { ${names.join(', ')} };`;
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exposed;
}
