import { pdf, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { SimResults } from "@/lib/physics/simulation";
import type { predictFromResults } from "@/lib/ai/heuristics";
import type { AIExplanation } from "@/lib/ai/explain.functions";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827", backgroundColor: "#ffffff" },
  h1: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: "bold", marginTop: 14, marginBottom: 6, color: "#0e7490" },
  sub: { fontSize: 10, color: "#6b7280", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  cell: { fontSize: 10 },
  key: { color: "#6b7280" },
  panel: { padding: 10, borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 4, marginBottom: 8 },
  kpi: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpiCell: { flexBasis: "23%", padding: 6, borderWidth: 0.5, borderColor: "#e5e7eb", borderRadius: 4 },
  kpiLabel: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  kpiValue: { fontSize: 14, fontWeight: "bold", marginTop: 2 },
  li: { flexDirection: "row", marginBottom: 3 },
  liBullet: { width: 10 },
  liText: { flex: 1 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 8, color: "#9ca3af", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#e5e7eb", paddingTop: 6 },
  eq: { fontFamily: "Courier", fontSize: 9, backgroundColor: "#f9fafb", padding: 4, marginVertical: 3 },
});

export interface ReportInput {
  simName: string; createdAt: string;
  vehicle: { name: string; manufacturer: string | null; category: string; mass_kg: number; wheelbase_m: number; track_m: number; cog_height_m: number; tire_friction_mu: number; fuel_type: string };
  road: { name: string; road_type: string; length_m: number; surface_mu: number; base_slope_deg: number; curves: unknown };
  summary: SimResults["summary"];
  prediction: ReturnType<typeof predictFromResults>;
  ai: AIExplanation | null;
}

export async function generatePdfReport(input: ReportInput): Promise<Blob> {
  const doc = <Report {...input} />;
  return await pdf(doc).toBlob();
}

function Report(input: ReportInput) {
  const { summary: sm, prediction: p, ai, vehicle: v, road: r } = input;
  const curves = (r.curves as Array<{ radius: number }>) ?? [];
  return (
    <Document title={input.simName}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>VirtuDrive AI — Simulation Report</Text>
        <Text style={s.sub}>{input.simName}  ·  {new Date(input.createdAt).toLocaleString()}</Text>

        <View style={s.panel}>
          <View style={s.row}><Text style={s.key}>Vehicle</Text><Text style={s.cell}>{v.manufacturer ? `${v.manufacturer} ` : ""}{v.name} · {v.category} · {v.fuel_type}</Text></View>
          <View style={s.row}><Text style={s.key}>Road</Text><Text style={s.cell}>{r.name} · {r.road_type} · {(Number(r.length_m) / 1000).toFixed(2)} km</Text></View>
          <View style={s.row}><Text style={s.key}>Surface / slope</Text><Text style={s.cell}>μ {r.surface_mu} · slope {r.base_slope_deg}°</Text></View>
          <View style={s.row}><Text style={s.key}>Curves</Text><Text style={s.cell}>{curves.length} (min radius {curves.length ? Math.min(...curves.map((c) => c.radius)) : "—"} m)</Text></View>
        </View>

        <Text style={s.h2}>Key results</Text>
        <View style={s.kpi}>
          <KPI label="Top speed" value={`${sm.top_speed_kmh.toFixed(0)} km/h`} />
          <KPI label="Avg speed" value={`${sm.avg_speed_kmh.toFixed(0)} km/h`} />
          <KPI label="Peak lateral" value={`${sm.max_lat_g.toFixed(2)} g`} />
          <KPI label="Safety score" value={`${p.safety_score}/100`} />
          <KPI label="Fuel/100km" value={`${sm.fuel_per_100km.toFixed(2)} L`} />
          <KPI label="Total time" value={`${sm.total_time_s.toFixed(1)} s`} />
          <KPI label="Skid P" value={`${(p.skid_probability * 100).toFixed(0)}%`} />
          <KPI label="Rollover P" value={`${(p.rollover_probability * 100).toFixed(0)}%`} />
        </View>

        {ai && (
          <>
            <Text style={s.h2}>Executive summary</Text>
            <Text>{ai.executive_summary}</Text>
            <Text style={s.h2}>Performance analysis</Text>
            <Text>{ai.performance_analysis}</Text>
            <Text style={s.h2}>Safety analysis</Text>
            <Text>{ai.safety_analysis}</Text>
            <Text style={s.h2}>Fuel / energy</Text>
            <Text>{ai.fuel_analysis}</Text>
            <Text style={s.h2}>Engineering recommendations</Text>
            {ai.engineering_recommendations.map((rec, i) => (
              <View style={s.li} key={i}><Text style={s.liBullet}>•</Text><Text style={s.liText}>{rec}</Text></View>
            ))}
          </>
        )}

        <Text style={s.h2}>Limiting curve events</Text>
        {sm.limiting_events.length === 0 ? (
          <Text>No corner-limited events on this road.</Text>
        ) : (
          <View>
            <View style={s.row}>
              <Text style={[s.cell, s.key]}>Station</Text>
              <Text style={[s.cell, s.key]}>Radius</Text>
              <Text style={[s.cell, s.key]}>Limit</Text>
              <Text style={[s.cell, s.key]}>Limiting</Text>
              <Text style={[s.cell, s.key]}>Steer</Text>
              <Text style={[s.cell, s.key]}>Bank</Text>
            </View>
            {sm.limiting_events.slice(0, 20).map((e, i) => (
              <View style={s.row} key={i}>
                <Text style={s.cell}>{e.station.toFixed(0)} m</Text>
                <Text style={s.cell}>{e.radius} m</Text>
                <Text style={s.cell}>{e.limit_kmh.toFixed(0)} km/h</Text>
                <Text style={s.cell}>{e.limiting}</Text>
                <Text style={s.cell}>{e.steering_deg.toFixed(1)}°</Text>
                <Text style={s.cell}>{e.bank_deg}°</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.h2}>Baseline analysis</Text>
        {p.key_risks.map((k, i) => (<View style={s.li} key={i}><Text style={s.liBullet}>•</Text><Text style={s.liText}>{k}</Text></View>))}
        {p.recommendations.map((k, i) => (<View style={s.li} key={i}><Text style={s.liBullet}>›</Text><Text style={s.liText}>{k}</Text></View>))}

        <Text style={s.h2}>Equations used</Text>
        <Text style={s.eq}>Safe cornering speed:  v = √(g·r·(sinθ + μcosθ) / (cosθ − μsinθ))</Text>
        <Text style={s.eq}>Rollover threshold:    v = √(g·r · t/(2h))    with SSF = t/(2h) = {(v.track_m / (2 * v.cog_height_m)).toFixed(2)}</Text>
        <Text style={s.eq}>Aero drag:             F = ½·ρ·Cd·A·v²        rolling: F = Crr·m·g·cosθ</Text>
        <Text style={s.eq}>Braking distance:      d = v² / (2·μ·g)</Text>

        <Text style={s.footer}>Generated by VirtuDrive AI — Virtual Vehicle Performance Testing Platform</Text>
      </Page>
    </Document>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (<View style={s.kpiCell}><Text style={s.kpiLabel}>{label}</Text><Text style={s.kpiValue}>{value}</Text></View>);
}
