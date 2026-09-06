// Prepare only homepage SEO 1's video script, preserving every other footer byte.
// Always read the current CMS footer first. This helper performs no publication.
import vm from 'node:vm';

export function prepareHomeVideoFooter(footer, playerSource) {
  if (typeof footer !== 'string' || typeof playerSource !== 'string') throw new TypeError('Footer and player source are required');
  if (playerSource.includes('\\') || /<\/script/i.test(playerSource)) throw new Error('Player source is unsafe for the CMS renderer');
  const scripts = [...footer.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)];
  const targets = scripts.filter(match => match[0].includes('data-ww-home-video-playback=') || match[0].includes('function playNiagara(card)'));
  if (targets.length !== 1) throw new Error('Expected exactly one homepage video script');
  const target = targets[0];
  const replacement = '<script data-ww-home-video-playback="1">\n' + playerSource + '</script>';
  // A replacement string would interpret $' in a RegExp source as a suffix token.
  const result = footer.slice(0, target.index) + replacement + footer.slice(target.index + target[0].length);
  for (const [, code] of result.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(code);
  return result;
}
