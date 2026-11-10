// Downscale a photo in the browser before sending it to the parser, so the
// payload is small and the model isn't fed a 12MP image. Returns base64 (no
// data: prefix) plus the media type.
export async function fileToDownscaledBase64(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<{ base64: string; media_type: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Couldn't read the image."));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Couldn't open the image."));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { base64: dataUrl.split(",")[1] ?? "", media_type: file.type || "image/jpeg" };
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", quality);
  return { base64: out.split(",")[1] ?? "", media_type: "image/jpeg" };
}

/**
 * Phone photos are big and sometimes HEIC. Shrink any picture to a JPEG the scanner can read:
 * longest side 2200px, which keeps small print on a delivery note or till roll legible.
 */
export async function prepareImage(file: File, maxSide = 2200, quality = 0.85): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That picture couldn't be opened. Try taking the photo again."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This phone couldn't prepare the picture.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("This phone couldn't prepare the picture.");
    return new File([blob], (file.name || "photo").replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(bin);
}
