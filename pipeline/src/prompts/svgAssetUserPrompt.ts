export function buildSvgAssetUserPrompt(assetName: string): string {
  const humanName = assetName.replace(/_/g, ' ');
  return `Generate a wireframe SVG schematic of: ${humanName}

Asset name: ${assetName}

This is used as a visual background element in a YouTube video about business mechanics. Make it recognizable and clean — like a technical illustration in an infographic or textbook. Draw the outer outline/silhouette first, then add interior details from left to right.`;
}
