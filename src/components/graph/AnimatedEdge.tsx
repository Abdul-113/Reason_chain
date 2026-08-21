import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';

// ==========================================
// CUSTOM ANIMATED EDGE FOR REACT FLOW
// Smooth step paths with colored status,
// traveling data flow particles, and
// labeled relationship badges.
// ==========================================

export type AnimatedEdgeData = {
  label: string;
  status: 'verified' | 'warning' | 'risk';
  isActive: boolean;
};

export type AnimatedEdgeType = Edge<AnimatedEdgeData, 'animated'>;

const EDGE_COLORS = {
  verified: { stroke: '#10b981', label: 'bg-[#051a10] border-emerald-500/25 text-emerald-400', dot: '#10b981' },
  warning: { stroke: '#f59e0b', label: 'bg-[#1a1506] border-amber-500/25 text-amber-400', dot: '#f59e0b' },
  risk: { stroke: '#ef4444', label: 'bg-[#1a0808] border-red-500/25 text-red-400', dot: '#ef4444' }
};

const INACTIVE_COLORS = {
  stroke: '#162032',
  label: 'bg-[#060c18] border-[#162032] text-slate-600',
  dot: '#162032'
};

export function AnimatedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data
}: EdgeProps<AnimatedEdgeType>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
    borderRadius: 12,
  });

  const isActive = data?.isActive ?? false;
  const status = data?.status ?? 'verified';
  const colors = isActive ? EDGE_COLORS[status] : INACTIVE_COLORS;

  return (
    <>
      {/* Main edge path */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: colors.stroke,
          strokeWidth: isActive ? 2 : 1,
          transition: 'stroke 0.5s ease, stroke-width 0.3s ease'
        }}
      />

      {/* Traveling data flow particles — 2 dots per active edge */}
      {isActive && (
        <>
          <circle r="2.5" fill={colors.dot} opacity="0.8">
            <animateMotion dur="2.8s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="1.8" fill={colors.dot} opacity="0.5">
            <animateMotion dur="2.8s" repeatCount="indefinite" path={edgePath} begin="1.4s" />
          </circle>
        </>
      )}

      {/* Relationship label badge */}
      <foreignObject
        width={100}
        height={22}
        x={labelX - 50}
        y={labelY - 11}
        className="overflow-visible pointer-events-none"
        requiredExtensions="http://www.w3.org/1999/xhtml"
      >
        <div className={`
          flex items-center justify-center
          px-2 py-[2px] rounded border
          text-[7px] font-mono font-bold tracking-[0.12em] uppercase
          select-none whitespace-nowrap
          transition-colors duration-500
          ${colors.label}
        `}>
          {data?.label}
        </div>
      </foreignObject>
    </>
  );
}
