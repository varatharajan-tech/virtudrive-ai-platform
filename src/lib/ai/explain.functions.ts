import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

const InputSchema = z.object({
  vehicle: z.object({
    name: z.string(),
    manufacturer: z.string().nullable().optional(),
    category: z.string(),
    mass_kg: z.number(),
    ssf: z.number(),
    tire_friction_mu: z.number(),
  }),
  road: z.object({
    name: z.string(),
    road_type: z.string(),
    length_m: z.number(),
    surface_mu: z.number(),
    base_slope_deg: z.number(),
    num_curves: z.number(),
    min_radius: z.number().nullable(),
  }),
  summary: z.object({
    top_speed_kmh: z.number(),
    avg_speed_kmh: z.number(),
    max_lat_g: z.number(),
    min_safety_score: z.number(),
    fuel_per_100km: z.number(),
    total_time_s: z.number(),
  }),
  prediction: z.object({
    safety_score: z.number(),
    risk_level: z.string(),
    skid_probability: z.number(),
    rollover_probability: z.number(),
    key_risks: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
});

const OutputSchema = z.object({
  executive_summary: z.string().describe("2-3 sentences summarising overall vehicle behavior on this road."),
  performance_analysis: z.string().describe("1 paragraph on speed, handling, and where the vehicle was limited."),
  safety_analysis: z.string().describe("1 paragraph on skidding, rollover, and driver risk."),
  fuel_analysis: z.string().describe("1-2 sentences on fuel/energy consumption."),
  engineering_recommendations: z.array(z.string()).describe("Concrete design/setup recommendations for engineers."),
});

export type AIExplanation = z.infer<typeof OutputSchema>;

export const explainSimulation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `You are a senior automotive test engineer reviewing a virtual road simulation.
Ground your writing in the numbers below. Do not invent values. Be direct and technical.

VEHICLE: ${data.vehicle.manufacturer ?? ""} ${data.vehicle.name} (${data.vehicle.category})
- Mass: ${data.vehicle.mass_kg} kg | SSF: ${data.vehicle.ssf.toFixed(2)} | Tire μ: ${data.vehicle.tire_friction_mu}

ROAD: ${data.road.name} (${data.road.road_type})
- Length: ${(data.road.length_m/1000).toFixed(2)} km | Surface μ: ${data.road.surface_mu} | Slope: ${data.road.base_slope_deg}°
- Curves: ${data.road.num_curves} | Min radius: ${data.road.min_radius ?? "n/a"} m

RESULTS
- Top speed: ${data.summary.top_speed_kmh.toFixed(1)} km/h | Avg: ${data.summary.avg_speed_kmh.toFixed(1)} km/h
- Peak lateral: ${data.summary.max_lat_g.toFixed(2)} g | Min safety: ${data.summary.min_safety_score.toFixed(0)}/100
- Fuel/energy: ${data.summary.fuel_per_100km.toFixed(2)} L/100km-equiv | Duration: ${data.summary.total_time_s.toFixed(1)} s

AI PREDICTION
- Overall risk: ${data.prediction.risk_level} (score ${data.prediction.safety_score}/100)
- Skid probability: ${(data.prediction.skid_probability*100).toFixed(0)}% | Rollover probability: ${(data.prediction.rollover_probability*100).toFixed(0)}%
- Key risks: ${data.prediction.key_risks.join(" | ") || "none"}
- Baseline recommendations: ${data.prediction.recommendations.join(" | ")}

Write the structured report. Provide 3 to 6 concrete engineering recommendations.`;

    try {
      const { output } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        prompt,
        output: Output.object({ schema: OutputSchema }),
      });
      const recs = Array.isArray(output.engineering_recommendations)
        ? output.engineering_recommendations.slice(0, 6)
        : [];
      return { ...output, engineering_recommendations: recs.length ? recs : ["Review vehicle setup against the physics summary above."] };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        return {
          executive_summary: (error.text ?? "").slice(0, 600) || "AI produced unstructured output; see raw text.",
          performance_analysis: "",
          safety_analysis: "",
          fuel_analysis: "",
          engineering_recommendations: ["Regenerate the report to retry structured analysis."],
        };
      }
      throw error;
    }
  });
