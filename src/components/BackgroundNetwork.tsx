import { useMemo } from 'react';

// ==========================================
// BACKGROUND AMBIENT NETWORK
// Renders a large faint network across the
// entire hero to create depth and the feeling
// of a massive enterprise knowledge graph.
// ==========================================

interface BgNode {
  id: number;
  x: number;
  y: number;
  r: number;
  opacity: number;
  pulseDur: number;
  color: string;
}

interface BgEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface BgParticle {
  id: number;
  path: string;
  dur: number;
  color: string;
  delay: number;
}

export default function BackgroundNetwork() {
  const { nodes, edges, particles } = useMemo(() => {
    const _nodes: BgNode[] = [];
    const _edges: BgEdge[] = [];
    const _particles: BgParticle[] = [];

    const W = 1600;
    const H = 1000;
    const NODE_COUNT = 50;

    // Deterministic-ish random with seed
    const seed = (i: number) => {
      const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    // Generate nodes
    for (let i = 0; i < NODE_COUNT; i++) {
      const isAmber = seed(i * 7 + 3) > 0.85;
      _nodes.push({
        id: i,
        x: seed(i * 13 + 1) * W,
        y: seed(i * 17 + 5) * H,
        r: 1 + seed(i * 23 + 7) * 1.5,
        opacity: 0.06 + seed(i * 31 + 11) * 0.12,
        pulseDur: 4 + seed(i * 37 + 13) * 5,
        color: isAmber ? '#f59e0b' : '#06b6d4'
      });
    }

    // Connect nearby nodes
    for (let i = 0; i < _nodes.length; i++) {
      const conns = Math.floor(seed(i * 41 + 19) * 2) + 1;
      for (let c = 0; c < conns; c++) {
        const j = Math.floor(seed(i * 43 + c * 47 + 23) * _nodes.length);
        if (j !== i) {
          const dx = _nodes[i].x - _nodes[j].x;
          const dy = _nodes[i].y - _nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 500) {
            _edges.push({
              id: `bg-e-${i}-${j}`,
              x1: _nodes[i].x,
              y1: _nodes[i].y,
              x2: _nodes[j].x,
              y2: _nodes[j].y
            });
          }
        }
      }
    }

    // Create traveling particles along random edges
    for (let p = 0; p < 10; p++) {
      const edgeIdx = Math.floor(seed(p * 53 + 29) * _edges.length);
      if (edgeIdx < _edges.length) {
        const e = _edges[edgeIdx];
        _particles.push({
          id: p,
          path: `M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`,
          dur: 3 + seed(p * 59 + 31) * 4,
          color: seed(p * 61 + 37) > 0.7 ? '#f59e0b' : '#06b6d4',
          delay: seed(p * 67 + 41) * 3
        });
      }
    }

    return { nodes: _nodes, edges: _edges, particles: _particles };
  }, []);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <svg
        className="w-full h-full"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background edges */}
        {edges.map((e) => (
          <line
            key={e.id}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="#0c2a4a"
            strokeWidth="0.6"
            opacity="0.4"
          />
        ))}

        {/* Background nodes with pulse */}
        {nodes.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.color}
            opacity={n.opacity}
          >
            <animate
              attributeName="opacity"
              values={`${n.opacity};${Math.min(n.opacity * 2.5, 0.35)};${n.opacity}`}
              dur={`${n.pulseDur}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Traveling particles */}
        {particles.map((p) => (
          <circle
            key={p.id}
            r="1.5"
            fill={p.color}
            opacity="0.4"
          >
            <animateMotion
              path={p.path}
              dur={`${p.dur}s`}
              repeatCount="indefinite"
              begin={`${p.delay}s`}
            />
            <animate
              attributeName="opacity"
              values="0;0.5;0.5;0"
              dur={`${p.dur}s`}
              repeatCount="indefinite"
              begin={`${p.delay}s`}
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}
