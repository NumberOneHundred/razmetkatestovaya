/* ═══ BOARD OPS PARSER & SVG RENDERER ═══ */

// Parse Lua-like board_ops format into JS objects
export function parseBoardOps(raw) {
  if (!raw) return [];
  const s = String(raw);
  
  // Extract board_ops array content
  const match = s.match(/\"?board_ops\"?\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];
  
  const inner = match[1];
  // Split into individual operations by };
  const opStrings = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '{') depth++;
    if (inner[i] === '}') { depth--; if (depth === 0) { opStrings.push(inner.substring(start, i + 1)); start = i + 1; } }
  }
  
  return opStrings.map(parseObj).filter(Boolean);
}

function parseObj(s) {
  s = s.trim();
  if (!s.startsWith('{')) return null;
  s = s.slice(1);
  if (s.endsWith('}')) s = s.slice(0, -1);
  if (s.endsWith(';')) s = s.slice(0, -1);
  
  const result = {};
  let i = 0;
  
  while (i < s.length) {
    // Skip whitespace and semicolons
    while (i < s.length && (s[i] === ' ' || s[i] === ';' || s[i] === '\n' || s[i] === '\t')) i++;
    if (i >= s.length) break;
    
    // Read key
    let key = '';
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') { key += s[i]; i++; }
      i++; // skip closing quote
    } else {
      while (i < s.length && s[i] !== '=' && s[i] !== ';' && s[i] !== '}') { key += s[i]; i++; }
    }
    key = key.trim();
    if (!key) break;
    
    // Skip =
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length || s[i] !== '=') break;
    i++;
    while (i < s.length && s[i] === ' ') i++;
    
    // Read value
    if (i >= s.length) break;
    
    if (s[i] === '{') {
      // Nested object or array
      let depth2 = 1, vs = '{';
      i++;
      while (i < s.length && depth2 > 0) {
        if (s[i] === '{') depth2++;
        if (s[i] === '}') depth2--;
        vs += s[i]; i++;
      }
      result[key] = parseObj(vs);
    } else if (s[i] === '"') {
      // String
      i++;
      let v = '';
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) { v += s[i] + s[i+1]; i += 2; }
        else { v += s[i]; i++; }
      }
      i++; // skip closing quote
      result[key] = v;
    } else if (s[i] === '%') {
      // Boolean
      i++;
      let v = '';
      while (i < s.length && s[i] !== ';' && s[i] !== '}' && s[i] !== ' ') { v += s[i]; i++; }
      result[key] = v === 'true';
    } else if (s[i] === '#') {
      // Null/empty
      i++;
      result[key] = null;
    } else if (s[i] === '[') {
      // Array (e.g., domain=[-2;2;])
      i++;
      let v = '';
      while (i < s.length && s[i] !== ']') { v += s[i]; i++; }
      i++; // skip ]
      result[key] = v.split(';').filter(x => x.trim()).map(x => {
        const n = parseFloat(x.trim());
        return isNaN(n) ? x.trim() : n;
      });
    } else {
      // Number or identifier
      let v = '';
      while (i < s.length && s[i] !== ';' && s[i] !== '}' && s[i] !== ' ') { v += s[i]; i++; }
      v = v.trim();
      const n = parseFloat(v);
      result[key] = isNaN(n) ? v : n;
    }
    
    // Skip trailing semicolons/whitespace
    while (i < s.length && (s[i] === ';' || s[i] === ' ')) i++;
  }
  
  return result;
}

// ═══ SVG RENDERER ═══

const COLORS = {
  point: '#4A9EFF',
  line: '#8B949E',
  segment: '#58A6FF',
  triangle: 'rgba(74,158,255,0.08)',
  triangleStroke: '#4A9EFF',
  polygon: 'rgba(63,185,80,0.08)',
  polygonStroke: '#3FB950',
  circle: '#D29922',
  circleFill: 'rgba(210,153,34,0.06)',
  label: '#C9D1D9',
  grid: '#21262D',
  axis: '#30363D',
  graph: '#F85149',
  bg: '#0D1117',
};

export function renderBoardSvg(ops, width = 400, height = 280) {
  if (!ops || ops.length === 0) return null;
  
  // Collect all points for bounding box
  const points = {};
  const allCoords = [];
  
  for (const op of ops) {
    if (!op || !op.name) continue;
    const a = op.args || {};
    
    if (op.name === 'create_point' && a.x !== undefined) {
      points[a.id] = { x: a.x, y: a.y, name: a.name };
      allCoords.push({ x: a.x, y: a.y });
    }
    if (op.name === 'create_label' && a.anchor) {
      allCoords.push({ x: a.anchor.x, y: a.anchor.y });
    }
    if (op.name === 'create_circle' && a.radius) {
      const center = points[a.center_id];
      if (center) {
        allCoords.push({ x: center.x - a.radius, y: center.y - a.radius });
        allCoords.push({ x: center.x + a.radius, y: center.y + a.radius });
      }
    }
  }
  
  if (allCoords.length === 0) return null;
  
  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of allCoords) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  
  // Add padding
  const pad = 1.5;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  
  // Scale to fit
  const scale = Math.min((width - 40) / rangeX, (height - 40) / rangeY);
  const ox = 20 + ((width - 40) - rangeX * scale) / 2;
  const oy = 20 + ((height - 40) - rangeY * scale) / 2;
  
  function tx(x) { return ox + (x - minX) * scale; }
  function ty(y) { return oy + (maxY - y) * scale; } // flip Y
  
  const elements = [];
  let ki = 0;
  
  // Render grid first
  for (const op of ops) {
    if (!op || op.name !== 'create_grid') continue;
    // Draw light grid
    for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) {
      elements.push(`<line x1="${tx(x)}" y1="${ty(minY)}" x2="${tx(x)}" y2="${ty(maxY)}" stroke="${COLORS.grid}" stroke-width="0.5"/>`);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      elements.push(`<line x1="${tx(minX)}" y1="${ty(y)}" x2="${tx(maxX)}" y2="${ty(y)}" stroke="${COLORS.grid}" stroke-width="0.5"/>`);
    }
    // Axes
    if (minX <= 0 && maxX >= 0) {
      elements.push(`<line x1="${tx(0)}" y1="${ty(minY)}" x2="${tx(0)}" y2="${ty(maxY)}" stroke="${COLORS.axis}" stroke-width="1"/>`);
    }
    if (minY <= 0 && maxY >= 0) {
      elements.push(`<line x1="${tx(minX)}" y1="${ty(0)}" x2="${tx(maxX)}" y2="${ty(0)}" stroke="${COLORS.axis}" stroke-width="1"/>`);
    }
  }
  
  // Render operations
  for (const op of ops) {
    if (!op || !op.name) continue;
    const a = op.args || {};
    ki++;
    
    switch (op.name) {
      case 'create_segment': {
        const from = points[a.from_id];
        const to = points[a.to_id];
        if (from && to) {
          elements.push(`<line x1="${tx(from.x)}" y1="${ty(from.y)}" x2="${tx(to.x)}" y2="${ty(to.y)}" stroke="${COLORS.segment}" stroke-width="1.5"/>`);
        }
        break;
      }
      case 'create_line': {
        const from = points[a.from_id];
        const to = points[a.to_id];
        if (from && to) {
          // Extend line beyond points
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ext = 20;
          const x1 = from.x - dx / len * ext, y1 = from.y - dy / len * ext;
          const x2 = to.x + dx / len * ext, y2 = to.y + dy / len * ext;
          elements.push(`<line x1="${tx(x1)}" y1="${ty(y1)}" x2="${tx(x2)}" y2="${ty(y2)}" stroke="${COLORS.line}" stroke-width="1" stroke-dasharray="4,3"/>`);
        }
        break;
      }
      case 'create_triangle': {
        const pa = points[a.a_id], pb = points[a.b_id], pc = points[a.c_id];
        if (pa && pb && pc) {
          const pts = `${tx(pa.x)},${ty(pa.y)} ${tx(pb.x)},${ty(pb.y)} ${tx(pc.x)},${ty(pc.y)}`;
          elements.push(`<polygon points="${pts}" fill="${COLORS.triangle}" stroke="${COLORS.triangleStroke}" stroke-width="1.5"/>`);
        }
        break;
      }
      case 'create_polygon': {
        const ids = a.point_ids || a.vertices || [];
        const pts = ids.map(id => points[id]).filter(Boolean);
        if (pts.length >= 3) {
          const pstr = pts.map(p => `${tx(p.x)},${ty(p.y)}`).join(' ');
          elements.push(`<polygon points="${pstr}" fill="${COLORS.polygon}" stroke="${COLORS.polygonStroke}" stroke-width="1.5"/>`);
        }
        break;
      }
      case 'create_circle': {
        const center = points[a.center_id];
        if (center) {
          let r = a.radius;
          if (!r && a.through_id && points[a.through_id]) {
            const tp = points[a.through_id];
            r = Math.sqrt((tp.x - center.x) ** 2 + (tp.y - center.y) ** 2);
          }
          if (r) {
            elements.push(`<circle cx="${tx(center.x)}" cy="${ty(center.y)}" r="${r * scale}" fill="${COLORS.circleFill}" stroke="${COLORS.circle}" stroke-width="1.5"/>`);
          }
        }
        break;
      }
      case 'create_function_graph': {
        const expr = a.expr;
        const domain = a.domain || [minX, maxX];
        if (expr) {
          const pathPoints = [];
          const steps = 80;
          const dx = (domain[1] - domain[0]) / steps;
          for (let i = 0; i <= steps; i++) {
            const x = domain[0] + i * dx;
            try {
              const y = evalExpr(expr, x);
              if (isFinite(y) && y >= minY - 5 && y <= maxY + 5) {
                pathPoints.push(`${i === 0 ? 'M' : 'L'}${tx(x).toFixed(1)},${ty(y).toFixed(1)}`);
              }
            } catch (e) {}
          }
          if (pathPoints.length > 1) {
            elements.push(`<path d="${pathPoints.join(' ')}" fill="none" stroke="${COLORS.graph}" stroke-width="2"/>`);
          }
        }
        break;
      }
      case 'create_label': {
        if (a.anchor) {
          const x = tx(a.anchor.x);
          const y = ty(a.anchor.y);
          const text = (a.text || '').replace(/\\\\/g, '\\');
          elements.push(`<text x="${x}" y="${y}" fill="${COLORS.label}" font-size="12" font-family="'JetBrains Mono',monospace" text-anchor="middle" dominant-baseline="middle">${escSvg(text)}</text>`);
        }
        break;
      }
      case 'create_point': {
        if (a.x !== undefined) {
          const x = tx(a.x), y = ty(a.y);
          elements.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${COLORS.point}" stroke="#0D1117" stroke-width="1.5"/>`);
          if (a.name && a.name !== '#' && a.name !== null) {
            const label = String(a.name).replace(/\\\\/g, '\\');
            elements.push(`<text x="${x + 8}" y="${y - 8}" fill="${COLORS.point}" font-size="11" font-weight="600" font-family="'Inter',sans-serif">${escSvg(label)}</text>`);
          }
        }
        break;
      }
      // create_grid handled above
      // create_construction — skip for now (complex)
    }
  }
  
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:${COLORS.bg};border-radius:8px">${elements.join('')}</svg>`;
}

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Simple math expression evaluator for function graphs
function evalExpr(expr, x) {
  let e = expr
    .replace(/\^/g, '**')
    .replace(/(\d)([x(])/g, '$1*$2')
    .replace(/([)])(\d)/g, '$1*$2')
    .replace(/([)])([x(])/g, '$1*$2')
    .replace(/x/g, `(${x})`);
  // Handle sqrt, abs
  e = e.replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)');
  e = e.replace(/abs\(([^)]+)\)/g, 'Math.abs($1)');
  e = e.replace(/sin\(([^)]+)\)/g, 'Math.sin($1)');
  e = e.replace(/cos\(([^)]+)\)/g, 'Math.cos($1)');
  return Function('"use strict"; return (' + e + ')')();
}
