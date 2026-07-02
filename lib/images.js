/* Extract embedded images from xlsx and map them to rows */

export async function extractImages(arrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Result: { sheetIndex: { rowNumber: "data:image/png;base64,..." } }
  const result = {};

  // Find all drawing relationship files
  const drawingRels = {};
  const sheetDrawings = {};

  // 1. Find which sheets have drawings
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.match(/xl\/worksheets\/_rels\/sheet\d+\.xml\.rels/)) {
      const xml = await file.async("text");
      const sheetIdx = path.match(/sheet(\d+)/)[1];
      const drawMatch = xml.match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/);
      if (drawMatch) {
        sheetDrawings[sheetIdx] = drawMatch[1];
      }
    }
  }

  // 2. Parse drawing rels (image ID -> filename)
  for (const [sheetIdx, drawingName] of Object.entries(sheetDrawings)) {
    const relPath = "xl/drawings/_rels/" + drawingName + ".rels";
    const relFile = zip.files[relPath];
    if (!relFile) continue;

    const relXml = await relFile.async("text");
    const imageMap = {}; // rId -> media filename
    const relMatches = relXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*image[^"]*)"/g);
    for (const m of relMatches) {
      const filename = m[2].replace("../", "");
      imageMap[m[1]] = "xl/" + filename;
    }

    // 3. Parse drawing XML to get anchors (row -> rId)
    const drawPath = "xl/drawings/" + drawingName;
    const drawFile = zip.files[drawPath];
    if (!drawFile) continue;

    const drawXml = await drawFile.async("text");
    result[sheetIdx] = {};

    // Match twoCellAnchor or oneCellAnchor patterns
    // Looking for: <xdr:from><xdr:row>N</xdr:row>... <a:blip r:embed="rIdN"/>
    const anchorBlocks = drawXml.split(/<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/);
    for (const block of anchorBlocks) {
      const rowMatch = block.match(/<xdr:from>\s*<xdr:col>\d+<\/xdr:col>\s*<xdr:colOff>\d+<\/xdr:colOff>\s*<xdr:row>(\d+)<\/xdr:row>/);
      const embedMatch = block.match(/r:embed="(rId\d+)"/);
      if (rowMatch && embedMatch) {
        const row = parseInt(rowMatch[1]);
        const rId = embedMatch[1];
        if (imageMap[rId]) {
          const imgFile = zip.files[imageMap[rId]];
          if (imgFile) {
            const imgData = await imgFile.async("base64");
            const ext = imageMap[rId].match(/\.(png|jpg|jpeg|gif|webp|svg)/i);
            const mime = ext ? "image/" + ext[1].toLowerCase().replace("jpg", "jpeg") : "image/png";
            result[sheetIdx][row] = "data:" + mime + ";base64," + imgData;
          }
        }
      }
    }
  }

  return result;
}
