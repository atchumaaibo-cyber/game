// assets/ の GLB から、ブラウザで軽く動く版（lite）を作る。
// 使い方: cd games/dog-fps/tools && npm install && npm run lite
// 出力: games/dog-fps/lite/<キャラ>.glb と stage.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, reorder, quantize, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = path.resolve(here, '../lite');
mkdirSync(out, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

function countTris(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(n);
}

async function finish(doc, file) {
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
  await io.write(file, doc);
  console.log(path.basename(file), (statSync(file).size / 1e6).toFixed(1) + 'MB', countTris(doc) + ' tris');
}

// キャラ: 三角形を約 3 万に、画像を 1024px の WebP に
for (const name of ['yuma', 'poodle', 'pome', 'atchi', 'ponneko']) {
  const doc = await io.read(path.join(root, `assets/models/${name}/${name}.glb`));
  const ratio = Math.min(1, 30000 / countTris(doc));
  await doc.transform(
    dedup(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    prune(),
  );
  await finish(doc, path.join(out, `${name}.glb`));
}

// 箱庭: 形はそのまま、重なったデータをまとめて圧縮
{
  const doc = await io.read(path.join(root, 'assets/stage/shizuoka_hakoniwa.glb'));
  await doc.transform(dedup(), prune());
  await finish(doc, path.join(out, 'stage.glb'));
}
