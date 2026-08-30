import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';

const SystemNode = ({ data }) => (
  <div
    className={`px-3 py-2 rounded-lg border bg-white dark:bg-[#1E1E1E] shadow-sm min-w-[120px] text-center font-sans text-[11px] relative ${
      data.accent === 'warm'
        ? 'border-emerald-400 dark:border-emerald-700'
        : data.accent === 'cold'
          ? 'border-blue-400 dark:border-blue-700'
          : 'border-[#E5E7EB] dark:border-[#2A2A2A]'
    }`}
  >
    {!data.isStart && (
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-neutral-400 dark:!bg-neutral-600 !w-1.5 !h-1.5"
      />
    )}
    {data.sublabel ? (
      <div className="text-[9px] text-[#64748B] dark:text-[#94A3B8] mb-0.5 uppercase tracking-wide">
        {data.sublabel}
      </div>
    ) : null}
    <div className="font-bold text-[#171717] dark:text-[#E2E8F0] leading-tight">{data.label}</div>
    {!data.isEnd && (
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-neutral-400 dark:!bg-neutral-600 !w-1.5 !h-1.5"
      />
    )}
    {data.bottomSource ? (
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-blue-400 dark:!bg-blue-600 !w-1.5 !h-1.5"
      />
    ) : null}
    {data.topTarget ? (
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-emerald-400 dark:!bg-emerald-600 !w-1.5 !h-1.5"
      />
    ) : null}
  </div>
);

const nodeTypes = { system: SystemNode };

export const ArchitectureDiagram = () => {
  const initialNodes = useMemo(
    () => [
      {
        id: '1',
        type: 'system',
        data: { label: 'Screening Thesis', sublabel: 'Natural language', isStart: true },
        position: { x: 20, y: 180 },
      },
      {
        id: '2',
        type: 'system',
        data: { label: 'Criteria Extraction', sublabel: 'Sector, geo, size' },
        position: { x: 180, y: 180 },
      },
      {
        id: '3',
        type: 'system',
        data: { label: 'Prior Research', sublabel: 'Saved profiles', bottomSource: true },
        position: { x: 340, y: 180 },
      },
      {
        id: '4',
        type: 'system',
        data: { label: 'Market Scan', sublabel: 'Live web research', accent: 'cold' },
        position: { x: 520, y: 300 },
      },
      {
        id: '5',
        type: 'system',
        data: { label: 'Company Profiles', sublabel: 'Per-company diligence' },
        position: { x: 700, y: 300 },
      },
      {
        id: '6',
        type: 'system',
        data: { label: 'Target Vetting', sublabel: 'Geo + financial bands', topTarget: true },
        position: { x: 880, y: 180 },
      },
      {
        id: '7',
        type: 'system',
        data: { label: 'Diligence Shortlist', sublabel: 'Export CSV / PDF', isEnd: true },
        position: { x: 1060, y: 180 },
      },
    ],
    []
  );

  const initialEdges = useMemo(
    () => [
      {
        id: 'e1-2',
        source: '1',
        target: '2',
        style: { stroke: '#94A3B8', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
      },
      {
        id: 'e2-3',
        source: '2',
        target: '3',
        style: { stroke: '#94A3B8', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
      },
      {
        id: 'e3-6',
        source: '3',
        target: '6',
        sourceHandle: 'top',
        targetHandle: 'top',
        label: 'Known matches',
        labelStyle: { fill: '#10B981', fontSize: 9, fontFamily: 'sans-serif', fontWeight: 'bold' },
        style: { stroke: '#10B981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
      },
      {
        id: 'e3-4',
        source: '3',
        target: '4',
        sourceHandle: 'bottom',
        label: 'New search',
        labelStyle: { fill: '#3B82F6', fontSize: 9, fontFamily: 'sans-serif', fontWeight: 'bold' },
        style: { stroke: '#3B82F6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6' },
      },
      {
        id: 'e4-5',
        source: '4',
        target: '5',
        style: { stroke: '#3B82F6', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6' },
      },
      {
        id: 'e5-6',
        source: '5',
        target: '6',
        style: { stroke: '#3B82F6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6' },
      },
      {
        id: 'e6-7',
        source: '6',
        target: '7',
        style: { stroke: '#94A3B8', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
      },
    ],
    []
  );

  return (
    <div className="w-full h-full relative bg-[#FBFBFB] dark:bg-[#121212] select-none font-sans">
      <ReactFlow
        nodes={initialNodes}
        edges={initialEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        nodesConnectable={false}
        nodesDraggable={false}
      >
        <Background color="#ccc" gap={20} size={1} opacity={0.15} />
        <Controls
          showInteractive={false}
          className="bg-white dark:bg-[#1A1A1A] border border-[#E5E7EB] dark:border-[#2A2A2A] rounded-lg shadow-sm"
        />
      </ReactFlow>
    </div>
  );
};

export default ArchitectureDiagram;
