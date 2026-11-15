// Milestone 9: provenance block shared by every exported file (Space Apps rule: code and data must acknowledge
// AI ("SI") assistance in descriptive text and metadata; no NASA endorsement implied).
export const PROVENANCE = {
  timeConvention: 'All times are UTC (ISO 8601). Hourly samples cover [t, t + 1 h); durations are whole hours.',
  coordinates: 'Latitude planetocentric (degrees); longitude east-positive 0–360° (MOON_ME frame, 1737.4 km sphere).',
  units: { angle: 'degree', duration: 'hour', share: 'percent of mission time', elevation: 'metre', temperature: 'kelvin' },
  aiDisclosure:
    'LunaWindow software was developed with AI assistance (Anthropic Claude) for code, tests and documentation. Numerical values in this file are computed by that software from the cited NASA/JPL data; they are not AI-generated estimates.',
  disclaimer:
    'Independent NASA Space Apps Challenge 2026 project. Not a NASA product, not endorsed by NASA, and not a landing-safety or flight certification.',
} as const
