/*
 * compare.js — 圆桌会议「观点碰撞图」与分支对比（纯逻辑，无 DOM 依赖）
 *
 *  - collisionFor(transcript, roles)：从一条 transcript 提取每个角色的观点指纹
 *    （开场观点 / 末轮辩论 / 投票表态）与"立场对齐边"（同立场=对齐，异立场=对立）。
 *  - compareBranches(branchesData, roles)：跨多条分支比较，标注哪些角色的观点出现分歧。
 *  - collisionSVG(collision, divergedSet, label)：生成横向"立场光谱"碰撞图（SVG 字符串）。
 *
 * 这些函数都是纯的：输入明确数据、输出可序列化结构 / 字符串，便于 node 端单测，
 * 也便于 ui.js 直接调用渲染。
 */
(function () {
  'use strict';

  function stanceRank(s) { return s === 'con' ? 0 : s === 'neutral' ? 1 : 2; }
  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 从 transcript 提取角色观点指纹 + 立场对齐边
  function collisionFor(transcript, roles) {
    const speeches = (transcript || []).filter(e => e && e.kind === 'speech');
    const byRole = {};
    speeches.forEach(e => { (byRole[e.roleId] = byRole[e.roleId] || []).push(e); });

    const nodes = (roles || []).map(r => {
      const rs = byRole[r.id] || [];
      const opening = rs.find(e => e.phase === 'round1');
      const vote = rs.find(e => e.vote);
      const debates = rs.filter(e => e.phase === 'debate');
      const last = debates[debates.length - 1] || rs[rs.length - 1];
      return {
        id: r.id,
        name: r.name,
        avatar: r.avatar || '🙂',
        stance: r.stance || 'neutral',
        domain: r.domain || '',
        openingText: opening ? opening.text : '',
        lastText: last ? last.text : '',
        voteText: vote ? vote.text : '',
        debateCount: debates.length
      };
    });

    // 立场对齐边：同 stance=对齐(green)，异 stance=对立(red)
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        edges.push({ a: a.id, b: b.id, aligned: a.stance === b.stance });
      }
    }
    return { nodes: nodes, edges: edges };
  }

  // 跨分支比较，标注分歧角色
  // branchesData: [{ id, label, transcript, director? }]
  function compareBranches(branchesData, roles) {
    const colls = (branchesData || []).map(b => ({
      id: b.id,
      label: b.label,
      director: b.director || null,
      c: collisionFor(b.transcript, roles)
    }));

    const rows = (roles || []).map(r => {
      const byBranch = {};
      colls.forEach(({ id, label, director, c }) => {
        const n = c.nodes.find(x => x.id === r.id);
        byBranch[id] = {
          label: label,
          director: director,
          openingText: n ? n.openingText : '',
          lastText: n ? n.lastText : '',
          voteText: n ? n.voteText : '',
          debateCount: n ? n.debateCount : 0
        };
      });
      // 比较基准：投票表态 > 末轮辩论 > 开场（越靠后越代表最终立场）
      const sigs = Object.keys(byBranch).map(k => {
        const v = byBranch[k];
        return (v.voteText || v.lastText || v.openingText || '');
      });
      const diverged = new Set(sigs).size > 1;
      return {
        id: r.id,
        name: r.name,
        avatar: r.avatar || '🙂',
        stance: r.stance || 'neutral',
        byBranch: byBranch,
        diverged: diverged
      };
    });

    const divergedRoles = rows.filter(r => r.diverged);
    return { rows: rows, divergedRoles: divergedRoles, branches: colls };
  }

  // 生成「观点碰撞图」SVG（横向立场光谱：反对 ← 中立 → 支持）
  function collisionSVG(collision, divergedSet, label) {
    const nodes = (collision && collision.nodes) || [];
    const X = { con: 72, neutral: 165, pro: 258 };
    const H = 56 + nodes.length * 46;
    const W = 330;

    const sorted = nodes.slice().sort((a, b) =>
      stanceRank(a.stance) - stanceRank(b.stance) || String(a.name).localeCompare(String(b.name)));
    const yOf = {};
    sorted.forEach((n, i) => { yOf[n.id] = 46 + i * 46; });

    let edgesSvg = '';
    (collision.edges || []).forEach(e => {
      const na = nodes.find(x => x.id === e.a);
      const nb = nodes.find(x => x.id === e.b);
      if (!na || !nb) return;
      const color = e.aligned ? '#0f9d6b' : '#e0573e';
      const dash = e.aligned ? '' : ' stroke-dasharray="4 4"';
      edgesSvg += '<line x1="' + X[na.stance] + '" y1="' + yOf[na.id] +
        '" x2="' + X[nb.stance] + '" y2="' + yOf[nb.id] +
        '" stroke="' + color + '" stroke-width="1.5" opacity="0.5"' + dash + '/>';
    });

    let nodesSvg = '';
    nodes.forEach(n => {
      const x = X[n.stance], y = yOf[n.id];
      const diverge = divergedSet && divergedSet.has(n.id);
      const ring = diverge
        ? '<circle cx="' + x + '" cy="' + y + '" r="22" fill="none" stroke="#f59e0b" stroke-width="3"/>'
        : '';
      const stColor = n.stance === 'con' ? '#e0573e' : n.stance === 'pro' ? '#0f9d6b' : '#b07d1a';
      nodesSvg +=
        ring +
        '<circle cx="' + x + '" cy="' + y + '" r="16" fill="' + stColor + '"/>' +
        '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-size="15">' + esc(n.avatar) + '</text>' +
        '<text x="' + (x + 26) + '" y="' + (y - 2) + '" font-size="12" font-weight="700" fill="#1f2733">' + esc(n.name) + '</text>' +
        '<text x="' + (x + 26) + '" y="' + (y + 13) + '" font-size="10" fill="#6b7686">' + esc(n.domain || '') + '</text>';
    });

    const axis =
      '<text x="72" y="22" font-size="10" fill="#e0573e" text-anchor="middle">反对</text>' +
      '<text x="165" y="22" font-size="10" fill="#b07d1a" text-anchor="middle">中立</text>' +
      '<text x="258" y="22" font-size="10" fill="#0f9d6b" text-anchor="middle">支持</text>';
    const lb = label
      ? '<text x="165" y="' + (H - 10) + '" font-size="11" font-weight="700" fill="#4f46e5" text-anchor="middle">' + esc(label) + '</text>'
      : '';

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet" class="collision-svg">' +
      axis + edgesSvg + nodesSvg + lb + '</svg>';
  }

  const api = { collisionFor: collisionFor, compareBranches: compareBranches, collisionSVG: collisionSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RoundtableCompare = api;
})();
