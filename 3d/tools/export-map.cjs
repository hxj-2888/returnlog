#!/usr/bin/env node
/* 把 2.5D 的地图数据导出成引擎无关 JSON。
 * 3D 子项目不直接读 js/data/map.js；这是唯一的跨项目数据入口。
 * 用法：node 3d/tools/export-map.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..', '..');
const source = path.join(repo, 'js', 'data', 'map.js');
const outDir = path.join(repo, '3d', 'preview', 'data');
const outFile = path.join(outDir, 'map.json');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });

const map = sandbox.window.SKMapData;
if (!map || !Array.isArray(map.rooms) || !Array.isArray(map.walls)) {
  throw new Error('SKMapData 结构不符合预期：缺少 rooms/walls');
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(map, null, 2) + '\n', 'utf8');

const counts = {
  rooms: map.rooms.length,
  corridors: map.corridors.length,
  walls: map.walls.length,
  cover: map.cover.length,
  points: map.points.length,
  pipes: map.pipes.length,
  facility: map.facility.length,
};
console.log('[3d] map.json ->', path.relative(repo, outFile));
console.log('[3d]', JSON.stringify(counts));
