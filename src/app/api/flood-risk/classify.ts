// This module lives outside route.ts because Next route modules may only export route handlers and config.

export function classifyZone(zone: string, subtype: string, sfha: boolean) {
  const z = (zone ?? "X").toUpperCase().trim();
  const st = (subtype ?? "").toUpperCase();

  // Coastal high hazard
  if (z === "VE" || z === "V" || z.startsWith("V1")) {
    return {
      isHighRisk: true,
      isModerateRisk: false,
      isMinimalRisk: false,
      zoneName: "Coastal High Hazard Area",
      description:
        "This location is in a coastal high hazard area subject to wave action — the highest FEMA flood risk designation. Flood insurance is required for federally-backed mortgages.",
    };
  }
  // SFHA zones (A-series)
  if (sfha || z === "A" || z.startsWith("AE") || z === "AO" || z === "AH" || z === "AR" || z === "A99" || (z.length > 1 && z.startsWith("A"))) {
    return {
      isHighRisk: true,
      isModerateRisk: false,
      isMinimalRisk: false,
      zoneName: "Special Flood Hazard Area",
      description:
        "This location falls within the 100-year floodplain — areas with a 1% annual chance of flooding. Flood insurance is typically required for federally-backed mortgages here.",
    };
  }
  // X shaded = 500-year
  if (z === "X" && (st.includes("500") || st.includes("SHADED") || st.includes("0.2 PCT"))) {
    return {
      isHighRisk: false,
      isModerateRisk: true,
      isMinimalRisk: false,
      zoneName: "Moderate Flood Hazard (500-year)",
      description:
        "This location is in the 500-year floodplain with a 0.2% annual chance of flooding. Flood insurance is not required but is recommended for protection against moderate risk.",
    };
  }
  // Undetermined
  if (z === "D") {
    return {
      isHighRisk: false,
      isModerateRisk: false,
      isMinimalRisk: false,
      zoneName: "Undetermined Risk",
      description:
        "Flood hazard has not been determined for this area. Contact local floodplain management authorities for specific risk information.",
    };
  }
  // Zone X unshaded = minimal
  return {
    isHighRisk: false,
    isModerateRisk: false,
    isMinimalRisk: true,
    zoneName: "Minimal Flood Hazard",
    description:
      "This location is outside the 500-year floodplain and carries minimal flood risk. Flood insurance is not required but may be available at low cost.",
  };
}
