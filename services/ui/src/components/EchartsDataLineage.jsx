import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * Apache ECharts Data Lineage & Heavy Data Network Graph
 * Rendered using HTML5 Canvas engine for zero-lag performance with large datasets.
 */
export default function EchartsDataLineage({
  totalRecords = 10100,
  quarantinedRecords = 600,
  tableName = "student_course_scores",
  qualityScore = 93.1
}) {
  const cleanRecords = Math.max(0, totalRecords - quarantinedRecords);

  const option = useMemo(() => {
    const categories = [
      { name: 'Bronze Ingestion', itemStyle: { color: '#0284C7' } },
      { name: 'Silver Spark QA', itemStyle: { color: '#8B5CF6' } },
      { name: 'Gold Active Store', itemStyle: { color: '#10B981' } },
      { name: 'Quarantine Store', itemStyle: { color: '#EF4444' } },
      { name: 'Downstream Distribution', itemStyle: { color: '#F59E0B' } }
    ];

    const nodes = [
      {
        id: '0',
        name: `Ingest: ${tableName}`,
        category: 0,
        symbolSize: 45,
        value: `${totalRecords.toLocaleString()} rows`,
        x: 100,
        y: 200,
        fixed: true,
        tooltip: `Bronze Layer Ingestion: ${totalRecords.toLocaleString()} raw rows incoming.`
      },
      {
        id: '1',
        name: 'Spark QA Engine',
        category: 1,
        symbolSize: 55,
        value: `Score: ${qualityScore}%`,
        x: 350,
        y: 200,
        fixed: true,
        tooltip: `Medallion Rules Evaluation · Quality Score: ${qualityScore}%`
      },
      {
        id: '2',
        name: 'Active Delta Lake',
        category: 2,
        symbolSize: 50,
        value: `${cleanRecords.toLocaleString()} clean`,
        x: 600,
        y: 120,
        fixed: true,
        tooltip: `Gold Layer Active Store: ${cleanRecords.toLocaleString()} certified rows.`
      },
      {
        id: '3',
        name: 'Quarantine Isolation',
        category: 3,
        symbolSize: 40,
        value: `${quarantinedRecords.toLocaleString()} errors`,
        x: 600,
        y: 280,
        fixed: true,
        tooltip: `Quarantine Store: ${quarantinedRecords.toLocaleString()} anomalous rows blocked.`
      },
      {
        id: '4',
        name: 'BI & Executive Cockpit',
        category: 4,
        symbolSize: 45,
        value: 'Serving API',
        x: 850,
        y: 120,
        fixed: true,
        tooltip: 'Executive Dashboards, SDOQAP Metrics & Analytics Feeds'
      },
      {
        id: '5',
        name: 'Remediation Queue',
        category: 3,
        symbolSize: 35,
        value: 'Governance Ticket',
        x: 850,
        y: 280,
        fixed: true,
        tooltip: 'Upstream Remediation Ticket & Root Cause Review'
      }
    ];

    const links = [
      {
        source: '0',
        target: '1',
        label: { show: true, formatter: `${totalRecords.toLocaleString()} rows`, fontSize: 10 },
        lineStyle: { width: 3, curveness: 0.1 }
      },
      {
        source: '1',
        target: '2',
        label: { show: true, formatter: `${cleanRecords.toLocaleString()} clean`, fontSize: 10 },
        lineStyle: { width: 3.5, curveness: -0.15, color: '#10B981' }
      },
      {
        source: '1',
        target: '3',
        label: { show: true, formatter: `${quarantinedRecords.toLocaleString()} bad`, fontSize: 10 },
        lineStyle: { width: 2.5, curveness: 0.15, color: '#EF4444' }
      },
      {
        source: '2',
        target: '4',
        label: { show: true, formatter: 'Certified BI', fontSize: 9 },
        lineStyle: { width: 2.5, curveness: 0, color: '#10B981' }
      },
      {
        source: '3',
        target: '5',
        label: { show: true, formatter: 'Ticket Action', fontSize: 9 },
        lineStyle: { width: 2, curveness: 0, color: '#EF4444' }
      }
    ];

    return {
      title: {
        text: 'Apache ECharts Canvas Engine · Medallion Data Lineage Network',
        subtext: 'High-performance interactive graph with zoom/pan and sub-millisecond rendering',
        textStyle: { fontSize: 13, fontWeight: 700, color: '#0F172A' },
        subtextStyle: { fontSize: 10, color: '#64748B' },
        left: '10px',
        top: '10px'
      },
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          if (params.dataType === 'edge') {
            return `Flow: <strong>${params.data.source} → ${params.data.target}</strong>`;
          }
          return `<strong>${params.name}</strong><br/>Status / Volume: ${params.value}<br/>${params.data.tooltip || ''}`;
        }
      },
      legend: [
        {
          data: categories.map((a) => a.name),
          orient: 'horizontal',
          right: '10px',
          top: '10px',
          textStyle: { fontSize: 10.5 }
        }
      ],
      animationDuration: 1500,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          name: 'Medallion Data Lineage',
          type: 'graph',
          layout: 'none',
          data: nodes,
          links: links,
          categories: categories,
          roam: true,
          label: {
            show: true,
            position: 'bottom',
            formatter: '{b}\n({c})',
            fontSize: 10.5,
            fontWeight: 600,
            color: '#1E293B'
          },
          edgeSymbol: ['circle', 'arrow'],
          edgeSymbolSize: [4, 10],
          cursor: 'pointer',
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 5 }
          }
        }
      ]
    };
  }, [totalRecords, quarantinedRecords, tableName, qualityScore, cleanRecords]);

  return (
    <div style={{ width: '100%', height: '360px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '10px', position: 'relative' }}>
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
