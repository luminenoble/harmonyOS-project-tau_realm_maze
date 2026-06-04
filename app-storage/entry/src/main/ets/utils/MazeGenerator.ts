// 迷宫生成：迭代版递归回溯算法 + 可种子化 PRNG（mulberry32）
// 输入 cols / rows 必须为奇数（典型 (2N+1)），保证厚墙结构对齐

import { Tile, TileType } from '../game/types/TileType';

// Day 7：VIA 三级缓存分配轮转表（L1=0 / L2=1 / MEM=2）
// 6 槽 1:2:3 = 1 L1 + 2 L2 + 3 MEM；跨 pair 全局递增 idx 保证整张地图比例稳定
// 内联在 MazeGenerator 内部（不从 ViaUnlock import）以避免 ViaUnlock → MapManager → MazeGenerator 循环依赖
const VIA_TIER_ROTATION: number[] = [0, 1, 1, 2, 2, 2];

// 可种子化随机数生成器，避免依赖不可复现的 Math.random
// Day 4 导出供 MapManager 在多层种子分发时复用
export class Rng {
  private s: number;

  constructor(seed: number) {
    // >>> 0 转为无符号 32 位整数
    this.s = seed >>> 0;
  }

  // 返回 [0, 1) 浮点数
  next(): number {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t: number = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // 返回 [0, max) 整数
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

// 栈中的单元坐标
class Cell {
  col: number;
  row: number;
  constructor(col: number, row: number) {
    this.col = col;
    this.row = row;
  }
}

// 四方向偏移（距离 2，配合厚墙模型，中间会被凿穿）：N / E / S / W
const DIRS: number[][] = [
  [0, -2],
  [2, 0],
  [0, 2],
  [-2, 0]
];

export class MazeGenerator {
  // 生成迷宫 tile 二维数组（[row][col]）
  // cols / rows 应为奇数（默认场景 13×13）；seed 不传则用 Date.now
  static generate(cols: number, rows: number, seed?: number): Tile[][] {
    const actualSeed: number = (seed === undefined) ? Date.now() : seed;
    const rng: Rng = new Rng(actualSeed);

    // 1. 初始化全为 WALL
    const tiles: Tile[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(new Tile(TileType.WALL));
      }
      tiles.push(row);
    }

    // 2. 起点 (1, 1) 设为 FLOOR
    tiles[1][1].type = TileType.FLOOR;
    const stack: Cell[] = [new Cell(1, 1)];

    // 3. DFS：每次从栈顶尝试随机选一个未访问的距离-2 邻居
    while (stack.length > 0) {
      const cur: Cell = stack[stack.length - 1];
      const order: number[] = MazeGenerator.shuffledDirIndices(rng);

      let advanced: boolean = false;
      for (let i = 0; i < order.length; i++) {
        const d: number[] = DIRS[order[i]];
        const nc: number = cur.col + d[0];
        const nr: number = cur.row + d[1];

        // 越界检查（保留外圈作为外墙，索引范围 1..size-2）
        if (nc <= 0 || nc >= cols - 1 || nr <= 0 || nr >= rows - 1) {
          continue;
        }
        // 已访问跳过
        if (tiles[nr][nc].type === TileType.FLOOR) {
          continue;
        }

        // 凿穿中间那格墙 + 邻居本身
        tiles[(cur.row + nr) / 2][(cur.col + nc) / 2].type = TileType.FLOOR;
        tiles[nr][nc].type = TileType.FLOOR;
        stack.push(new Cell(nc, nr));
        advanced = true;
        break;
      }

      if (!advanced) {
        stack.pop();
      }
    }

    return tiles;
  }

  // Fisher-Yates 打乱 [0,1,2,3]，决定四方向尝试顺序
  private static shuffledDirIndices(rng: Rng): number[] {
    const arr: number[] = [0, 1, 2, 3];
    for (let i = arr.length - 1; i > 0; i--) {
      const j: number = rng.nextInt(i + 1);
      const tmp: number = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // 为多层地图配对放置 Via 节点
  // 每对相邻层 (L, L+1) 选 perPair 个同坐标 cell，两层都标 VIA + viaTarget 指向对方
  // 候选优先选两层都已是 FLOOR 的 cell；若不足，强行 carve（WALL→FLOOR 不破坏连通性）
  // 外圈 (索引 0 / size-1) 是外墙，不在候选范围
  // 起点 (1,1) 也排除，避免一进游戏就被自动切层
  static placeVias(layers: Tile[][][], rng: Rng, perPair: number): void {
    const layerCount: number = layers.length;
    if (layerCount < 2) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    // Day 7：跨 pair 全局滚动索引，让 L1:L2:MEM 在整张地图上保持 1:2:3
    let viaTierIdx: number = 0;

    for (let L = 0; L < layerCount - 1; L++) {
      const upper: number = L + 1;
      // 阶段 1：收集两层共同 FLOOR 的候选
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR
              && layers[upper][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }

      // 阶段 2：候选不足则在仅一侧 FLOOR 的 cell 上 carve 补足
      if (candidates.length < perPair) {
        for (let r = 1; r < rows - 1 && candidates.length < perPair; r++) {
          for (let c = 1; c < cols - 1 && candidates.length < perPair; c++) {
            if (c === 1 && r === 1) {
              continue;
            }
            const downIsFloor: boolean = layers[L][r][c].type === TileType.FLOOR;
            const upIsFloor: boolean = layers[upper][r][c].type === TileType.FLOOR;
            if (downIsFloor && !upIsFloor) {
              layers[upper][r][c].type = TileType.FLOOR;
              candidates.push([c, r]);
            } else if (!downIsFloor && upIsFloor) {
              layers[L][r][c].type = TileType.FLOOR;
              candidates.push([c, r]);
            }
          }
        }
      }

      // 阶段 3：从候选中随机选 perPair 个 + Fisher-Yates 打乱前缀
      const k: number = Math.min(perPair, candidates.length);
      for (let i = 0; i < k; i++) {
        const j: number = i + rng.nextInt(candidates.length - i);
        const tmp: number[] = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }

      // 阶段 4：写回 VIA 标记
      // Day 5 起：下层→上行 VIA 默认锁定（需当前层碎片全收集才解锁）；上层→下行 VIA 不锁
      // Day 7 起：每个 VIA pair 从全局 ROTATION 取 tier；上下行同坐标共享同 tier
      for (let i = 0; i < k; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        const tier: number = VIA_TIER_ROTATION[viaTierIdx % VIA_TIER_ROTATION.length];
        viaTierIdx++;
        layers[L][r][c] = new Tile(TileType.VIA, upper, true, tier);    // 下层 → 上行（locked）
        layers[upper][r][c] = new Tile(TileType.VIA, L, false, tier);   // 上层 → 下行（unlocked）
      }
    }
  }

  // Day 7：在顶层放置 1 个 EXIT 终点
  // 候选：顶层从 (1,1) 出发 BFS 可达的全部 FLOOR cell（GATE 视为可通行 = 假定将来都能解开）
  // 选取距离最大的若干 cell（≥ 距离最大值 ×0.8），从中随机 1 个，让终点远离起点
  // 极端兜底：候选为空 → 强制 (cols-2, rows-2) carve 为 FLOOR 再放 EXIT
  static placeExit(layers: Tile[][][], rng: Rng): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const topLayer: number = layerCount - 1;
    const layer: Tile[][] = layers[topLayer];
    const rows: number = layer.length;
    const cols: number = layer[0].length;

    // BFS 距离图：起点 (1,1)，GATE 视为可通行
    const dist: number[][] = MazeGenerator.bfsDistance(layer, 1, 1, false);

    // 收集所有"可达且当前为 FLOOR"的 cell + 距离
    let maxDist: number = 0;
    const reachable: number[][] = [];   // [c, r, dist]
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (c === 1 && r === 1) {
          continue;
        }
        if (layer[r][c].type !== TileType.FLOOR) {
          continue;
        }
        const d: number = dist[r][c];
        if (d < 0) {
          continue;
        }
        reachable.push([c, r, d]);
        if (d > maxDist) {
          maxDist = d;
        }
      }
    }

    // 候选筛选：距离 ≥ maxDist × 0.8 的远端 cell；若不足则全集
    const threshold: number = Math.floor(maxDist * 0.8);
    let far: number[][] = [];
    for (let i = 0; i < reachable.length; i++) {
      if (reachable[i][2] >= threshold) {
        far.push(reachable[i]);
      }
    }
    if (far.length === 0) {
      far = reachable;
    }

    if (far.length > 0) {
      const idx: number = rng.nextInt(far.length);
      const c: number = far[idx][0];
      const r: number = far[idx][1];
      layer[r][c] = new Tile(TileType.EXIT);
      return;
    }

    // 兜底：连一个 FLOOR 也没找到（理论不发生）→ 强 carve (cols-2, rows-2)
    const fc: number = cols - 2;
    const fr: number = rows - 2;
    layer[fr][fc] = new Tile(TileType.EXIT);
  }

  // BFS 距离图：每格记录到 (sc, sr) 的最短步数；不可达为 -1
  // 通行规则：WALL 阻挡；GATE 按 gatesBlock 决定（默认 true 锁定 GATE 视为墙）
  // 与 bfsReachable 同步：返回距离 vs 仅可达 bool
  private static bfsDistance(
    layer: Tile[][],
    sc: number,
    sr: number,
    gatesBlock: boolean = true
  ): number[][] {
    const rows: number = layer.length;
    const cols: number = layer[0].length;
    const dist: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(-1);
      }
      dist.push(row);
    }
    if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) {
      return dist;
    }
    const start: Tile = layer[sr][sc];
    if (start.type === TileType.WALL) {
      return dist;
    }
    dist[sr][sc] = 0;
    const qx: number[] = [sc];
    const qy: number[] = [sr];
    let head: number = 0;
    const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < qx.length) {
      const c: number = qx[head];
      const r: number = qy[head];
      head++;
      const cd: number = dist[r][c];
      for (let d = 0; d < 4; d++) {
        const nc: number = c + dirs[d][0];
        const nr: number = r + dirs[d][1];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
          continue;
        }
        if (dist[nr][nc] >= 0) {
          continue;
        }
        const t: Tile = layer[nr][nc];
        if (t.type === TileType.WALL) {
          continue;
        }
        if (gatesBlock && t.type === TileType.GATE && t.locked) {
          continue;
        }
        dist[nr][nc] = cd + 1;
        qx.push(nc);
        qy.push(nr);
      }
    }
    return dist;
  }

  // 为每层放置逻辑门（GATE，默认 locked）— 调用顺序：必须在 placeFragments 之前
  // 关键约束：放置后必须保证 (1,1) 仍能到达至少 1 个非起点 FLOOR cell，
  // 否则玩家踩到 GATE 前没机会捡碎片解锁 → 死锁
  // 策略：随机洗牌候选；逐个"试放 + BFS 校验 pre-GATE 区 FLOOR ≥ 1"；不达标则回退换下一个
  static placeGates(layers: Tile[][][], rng: Rng, perLayer: number): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount; L++) {
      // 收集 FLOOR 候选（排除外圈 + 起点）
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }
      MazeGenerator.shuffleInPlace(candidates, rng);

      let placed: number = 0;
      for (let i = 0; i < candidates.length && placed < perLayer; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        const saved: Tile = layers[L][r][c];
        // 试放
        layers[L][r][c] = new Tile(TileType.GATE, -1, true);
        // BFS：起点出发不穿门，能到至少 1 个非起点 FLOOR 即可
        const visited: boolean[][] = MazeGenerator.bfsReachable(layers[L], 1, 1);
        if (MazeGenerator.hasReachableFloor(layers[L], visited)) {
          placed++;
        } else {
          // 死锁，回退
          layers[L][r][c] = saved;
        }
      }
    }
  }

  // 为每层放置信号碎片（FRAGMENT）— 调用顺序：必须在 placeGates 之后
  // 关键约束：≥1 个碎片必须落在 pre-GATE 可达区（不穿门可达），否则玩家无法触发解锁
  // 实施：BFS 切分 FLOOR → preFloor / postFloor；先从 preFloor 抽 1 个，剩余从合集随机
  static placeFragments(layers: Tile[][][], rng: Rng, perLayer: number): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount; L++) {
      const visited: boolean[][] = MazeGenerator.bfsReachable(layers[L], 1, 1);

      const preFloor: number[][] = [];
      const postFloor: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type !== TileType.FLOOR) {
            continue;
          }
          if (visited[r][c]) {
            preFloor.push([c, r]);
          } else {
            postFloor.push([c, r]);
          }
        }
      }
      MazeGenerator.shuffleInPlace(preFloor, rng);
      MazeGenerator.shuffleInPlace(postFloor, rng);

      let placed: number = 0;
      // 步骤 1：强制 1 个落在 pre-GATE 区
      if (perLayer > 0 && preFloor.length > 0) {
        const cell: number[] = preFloor[0];
        layers[L][cell[1]][cell[0]] = new Tile(TileType.FRAGMENT);
        placed = 1;
      }
      // 步骤 2：剩下从 pre（剩余）+ post 合集随机
      const remaining: number[][] = [];
      const startIdx: number = placed > 0 ? 1 : 0;
      for (let i = startIdx; i < preFloor.length; i++) {
        remaining.push(preFloor[i]);
      }
      for (let i = 0; i < postFloor.length; i++) {
        remaining.push(postFloor[i]);
      }
      MazeGenerator.shuffleInPlace(remaining, rng);

      for (let i = 0; i < remaining.length && placed < perLayer; i++) {
        const cell: number[] = remaining[i];
        layers[L][cell[1]][cell[0]] = new Tile(TileType.FRAGMENT);
        placed++;
      }
    }
  }

  // 为每层放置散热通道（THERMAL_VIA）— 调用顺序：在 placeFragments 之后
  // 候选：剩余 FLOOR cell（排除外圈、起点、已被占用的特殊瓦片）
  // 不做 BFS 校验：放到不可达区只是"少了个缓解点"，不影响通关
  static placeThermalVias(layers: Tile[][][], rng: Rng, perLayer: number): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount; L++) {
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }
      MazeGenerator.shuffleInPlace(candidates, rng);

      const k: number = Math.min(perLayer, candidates.length);
      for (let i = 0; i < k; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        layers[L][r][c] = new Tile(TileType.THERMAL_VIA);
      }
    }
  }

  // 指令重构：在每层放置 RAW 数据冒险格（new-design 3.3）— 调用顺序在 placeThermalVias 之后
  // 候选：剩余 FLOOR cell（排除外圈 / 起点 / 已占用特殊瓦片）
  // 不做 BFS 校验：RAW 可绕开，落到不可达区只是"少了个陷阱"
  static placeRawHazards(layers: Tile[][][], rng: Rng, perLayer: number): void {
    const layerCount: number = layers.length;
    if (layerCount === 0) {
      return;
    }
    const rows: number = layers[0].length;
    const cols: number = layers[0][0].length;

    for (let L = 0; L < layerCount; L++) {
      const candidates: number[][] = [];
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          if (c === 1 && r === 1) {
            continue;
          }
          if (layers[L][r][c].type === TileType.FLOOR) {
            candidates.push([c, r]);
          }
        }
      }
      MazeGenerator.shuffleInPlace(candidates, rng);

      const k: number = Math.min(perLayer, candidates.length);
      for (let i = 0; i < k; i++) {
        const c: number = candidates[i][0];
        const r: number = candidates[i][1];
        layers[L][r][c] = new Tile(TileType.RAW_HAZARD);
      }
    }
  }

  // 通用洗牌（Fisher-Yates 原地）
  private static shuffleInPlace(arr: number[][], rng: Rng): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j: number = rng.nextInt(i + 1);
      const tmp: number[] = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  // BFS：从 (sc, sr) 出发的可达性掩码（公开供 Restructurer 复用）
  // 通行规则：WALL 一律阻挡；GATE 视 gatesBlock 与 tile.locked 决定：
  //   - gatesBlock=true（默认，初始生成时全部 locked，行为兼容旧版）：locked GATE 当墙
  //   - gatesBlock=false：GATE 一律视为可通行（用于"假设门都能开"的连通性预判）
  // 队列用数组 + head 指针，避免 shift O(n)
  static bfsReachable(
    layer: Tile[][],
    sc: number,
    sr: number,
    gatesBlock: boolean = true
  ): boolean[][] {
    const rows: number = layer.length;
    const cols: number = layer[0].length;
    const visited: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(false);
      }
      visited.push(row);
    }
    if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) {
      return visited;
    }
    const start: Tile = layer[sr][sc];
    if (start.type === TileType.WALL) {
      return visited;
    }
    if (gatesBlock && start.type === TileType.GATE && start.locked) {
      return visited;
    }

    visited[sr][sc] = true;
    const qx: number[] = [sc];
    const qy: number[] = [sr];
    let head: number = 0;
    const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < qx.length) {
      const c: number = qx[head];
      const r: number = qy[head];
      head++;
      for (let d = 0; d < 4; d++) {
        const nc: number = c + dirs[d][0];
        const nr: number = r + dirs[d][1];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
          continue;
        }
        if (visited[nr][nc]) {
          continue;
        }
        const t: Tile = layer[nr][nc];
        if (t.type === TileType.WALL) {
          continue;
        }
        if (gatesBlock && t.type === TileType.GATE && t.locked) {
          continue;
        }
        visited[nr][nc] = true;
        qx.push(nc);
        qy.push(nr);
      }
    }
    return visited;
  }

  // 是否存在至少 1 个非起点的 visited FLOOR cell（用于 placeGates 校验）
  private static hasReachableFloor(layer: Tile[][], visited: boolean[][]): boolean {
    const rows: number = layer.length;
    const cols: number = layer[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!visited[r][c]) {
          continue;
        }
        if (c === 1 && r === 1) {
          continue;
        }
        if (layer[r][c].type === TileType.FLOOR) {
          return true;
        }
      }
    }
    return false;
  }
}
